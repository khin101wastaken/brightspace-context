import http from 'node:http';
import path from 'node:path';
import {createDemoLms} from './demo-lms.js';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {openCache,validateMetadata,MAX_FILE_BYTES} from './cache.js';
import {openVault} from './vault.js';
import {openExports} from './exports.js';
import {openCatalog,MAX_CATALOG_BYTES} from './catalog.js';
import {openRequests} from './requests.js';
import {createWorkerChannel} from './worker-channel.js';
import {safeLogger} from './logging.js';

const same=(a,b)=>typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function body(req,limit) {
  const chunks=[];let length=0;
  for await(const chunk of req) {length+=chunk.length;if(length>limit) throw new Error('Request exceeds the size limit.');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
export async function createCompanion({directory,port=47653,budgetBytes,pairingCode=randomBytes(5).toString('hex'),log=()=>{},vault}={}) {
  if(!directory) throw new Error('Cache directory is required.');
  const emit=safeLogger(log);
  let cache,catalog,requests,demo;
  const demoLms=createDemoLms();
  let client=null,settings={allowTemporaryExports:false},exports,primaryExports;
  const session=()=>({token:client.token,credential:vault.credential(client.origin,client.token),storageKey:vault.browserKey(client.origin),storageVersion:1});
  const tickets=new Map();let failedPairings=0,windowStart=Date.now();
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    const started=Date.now();let route='unknown';
    res.once('finish',()=>{if(req.method!=='OPTIONS') emit('http.request',{method:req.method,route,status:res.statusCode,elapsedMs:Date.now()-started});});
    try {
      const expectedHost=`127.0.0.1:${server.address().port}`;
      if(req.headers.host!==expectedHost) return send(res,403,{error:'Invalid local host.'});
      if(!requests || !demo) return send(res,503,{error:'Companion is starting. Try again in a moment.'});
      const url=new URL(req.url,`http://${expectedHost}`);
      if(url.pathname==='/demo' || url.pathname.startsWith('/demo/')) {
        route='demo';return await demoLms.handle(req,res,url,expectedHost);
      }
      const provider=url.pathname.startsWith('/demo-api/v1/')?'demo':'nyu';
      if(url.searchParams.has('source'))return send(res,400,{error:'Use the explicit demo API namespace.'});
      if(provider==='demo')url.pathname=url.pathname.slice('/demo-api'.length);
      const scope=provider==='demo'?demo:{cache,catalog,requests,exports,tickets};
      return await handleApi(scope,provider,url);
      async function handleApi({cache,catalog,requests,exports,tickets},provider,url) {
      const origin=req.headers.origin;
      if(!/^chrome-extension:\/\/[a-p]{32}$/.test(origin || '')) {emit('auth.rejected',{code:'EXTENSION_ORIGIN_REQUIRED'});return send(res,403,{error:'Only the paired browser extension can connect.',code:'EXTENSION_ORIGIN_REQUIRED'});}
      res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Origin',origin);
      if(req.method==='OPTIONS') {
        res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});res.end();return;
      }
      route=url.pathname==='/v1/pair'?'pair':url.pathname==='/v1/status'?'status':url.pathname.startsWith('/v1/catalog')?'catalog':url.pathname.startsWith('/v1/requests')?'requests':url.pathname.startsWith('/v1/cache')?'cache':'unknown';
      if(req.method==='POST' && url.pathname==='/v1/pair') {
        if(Date.now()-windowStart>60000) {failedPairings=0;windowStart=Date.now();}
        if(failedPairings>=10) {emit('pair.rejected',{code:'RATE_LIMITED'});return send(res,429,{error:'Too many pairing attempts. Wait a minute.'});}
        const value=JSON.parse((await body(req,4096)).toString());
        if(!same(value.code?.trim().toLowerCase(),pairingCode)) {failedPairings++;emit('pair.rejected',{code:'CODE_MISMATCH'});return send(res,403,{error:'Pairing code did not match.'});}
        const token=randomBytes(32).toString('hex');client={origin,token};
        await vault.writeJson('pairing.json',client);
        emit('pair.accepted',{origin});
        return send(res,200,{...session(),...await cache.stats()});
      }
      if(req.method==='POST' && url.pathname==='/v1/session') {
        const value=JSON.parse((await body(req,8192)).toString());let resumed;
        try {resumed=value.credential?vault.resume(origin,value.credential):null;}catch{}
        if(!client || client.origin!==origin || !(same(req.headers.authorization,`Bearer ${client.token}`) || (resumed?.origin===origin && same(resumed.token,client.token))))return send(res,401,{error:'Pair this extension with the companion first.',code:'PAIRING_REQUIRED'});
        return send(res,200,{...session(),...(value.credential?{credential:value.credential}:{})});
      }
      if(!client || client.origin!==origin || !same(req.headers.authorization,`Bearer ${client.token}`)) {emit('auth.rejected',{code:!client?'NOT_PAIRED':client.origin!==origin?'BROWSER_MISMATCH':'TOKEN_MISMATCH',origin});return send(res,401,{error:'Pair this extension with the companion first.',code:'PAIRING_REQUIRED'});}
      if(req.method==='POST' && url.pathname==='/v1/settings') {
        const value=JSON.parse((await body(req,1024)).toString());
        if(Object.keys(value).length!==1 || typeof value.allowTemporaryExports!=='boolean')throw new Error('Invalid export setting.');
        await vault.writeJson('settings.json',value);settings=value;await primaryExports.setEnabled(settings.allowTemporaryExports);await demo.exports.setEnabled(settings.allowTemporaryExports);
        return send(res,200,settings);
      }
      if(req.method==='POST' && url.pathname==='/v1/cache/exports') {
        if(!settings.allowTemporaryExports)return send(res,409,{error:'Temporary file exports are disabled. Use the MCP resource bytes, or explicitly enable temporary file exports in extension Settings for clients that require a local path.',code:'EXPORTS_DISABLED'});
        const value=JSON.parse((await body(req,1024)).toString());
        if(!/^[a-f0-9]{64}$/.test(value.id) || value.acknowledgePlaintext!==true || Object.keys(value).some(key=>!['id','acknowledgePlaintext'].includes(key)))throw new Error('An explicit plaintext-export acknowledgement and document ID are required.');
        const result=await cache.read(value.id);if(!result)return send(res,404,{error:'Document is no longer cached.'});
        return send(res,200,{...await exports.create(result.entry,result.bytes),id:value.id,mimeType:result.entry.mimeType});
      }
      if(req.method==='POST' && url.pathname==='/v1/requests') return send(res,200,await requests.request(JSON.parse((await body(req,4096)).toString())));
      if(req.method==='POST' && url.pathname==='/v1/requests/catalog-sync') return send(res,200,await requests.syncRequest(JSON.parse((await body(req,4096)).toString())));
      if(req.method==='POST' && url.pathname==='/v1/requests/claim') {const value=JSON.parse((await body(req,4096)).toString() || '{}');return send(res,200,await requests.claim({catalogSync:Array.isArray(value.capabilities) && value.capabilities.includes('catalog-sync')}));}
      if(req.method==='POST' && url.pathname==='/v1/requests/progress') return send(res,200,await requests.progress(JSON.parse((await body(req,4096)).toString())));
      if(req.method==='POST' && url.pathname==='/v1/requests/finish') return send(res,200,await requests.finish(JSON.parse((await body(req,MAX_CATALOG_BYTES+4096)).toString())));
      if(req.method==='POST' && url.pathname==='/v1/requests/retry-login') return send(res,200,await requests.retryLogin());
      const request=url.pathname.match(/^\/v1\/requests\/([a-f0-9-]{36})$/);
      if(req.method==='GET' && request) return send(res,200,await requests.get(request[1]));
      if(req.method==='GET' && url.pathname==='/v1/catalog') return send(res,200,await catalog.read());
      if(req.method==='PUT' && url.pathname==='/v1/catalog/semesters') {const result=await catalog.put(JSON.parse((await body(req,MAX_CATALOG_BYTES)).toString()));emit('catalog.synced',result);return send(res,200,result);}
      if(['GET','POST'].includes(req.method) && url.pathname==='/v1/status') return send(res,200,{...await cache.stats(),workerConnected:workerChannel.connected(provider),provider,storageEncrypted:true,...settings});
      if(req.method==='GET' && url.pathname==='/v1/cache/documents') return send(res,200,{documents:await cache.list()});
      const document=url.pathname.match(/^\/v1\/cache\/documents\/([a-f0-9]{64})$/);
      if(req.method==='GET' && document) {
        const result=await cache.read(document[1]);
        if(!result) return send(res,404,{error:'Document is no longer cached or failed its integrity check.'});
        return send(res,200,{document:result.entry});
      }
      if(req.method==='POST' && url.pathname==='/v1/cache/lookup') {
        const metadata=validateMetadata(JSON.parse((await body(req,128*1024)).toString()),{provider});
        const result=await cache.lookup(metadata);
        emit(result.hit?'cache.hit':'cache.miss',{courseId:metadata.courseId,topicId:metadata.topicId});
        if(result.hit) return send(res,200,result);
        for(const [key,ticket] of tickets) if(ticket.expires<Date.now()) tickets.delete(key);
        if(tickets.size>=100) return send(res,429,{error:'Too many pending file requests.'});
        const uploadId=randomUUID();tickets.set(uploadId,{metadata,expires:Date.now()+5*60*1000,origin});
        return send(res,200,{...result,uploadId,maxFileBytes:MAX_FILE_BYTES,maxPdfBytes:MAX_FILE_BYTES});
      }
      const upload=url.pathname.match(/^\/v1\/cache\/uploads\/([a-f0-9-]{36})$/);
      if(req.method==='PUT' && upload) {
        const ticket=tickets.get(upload[1]);
        if(!ticket || ticket.origin!==origin || ticket.expires<Date.now()) return send(res,404,{error:'Upload request expired. Retry the cache request.'});
        tickets.delete(upload[1]);
        const bytes=await body(req,MAX_FILE_BYTES);
        const result=await cache.put(ticket.metadata,bytes);
        emit('cache.stored',{courseId:ticket.metadata.courseId,topicId:ticket.metadata.topicId,bytes:result.entry.bytes,evicted:result.evicted});
        return send(res,200,result);
      }
      const file=url.pathname.match(/^\/v1\/cache\/files\/([a-f0-9]{64})$/);
      if(req.method==='GET' && file) {
        const result=await cache.read(file[1]);if(!result) return send(res,404,{error:'Document is no longer cached.'});
        res.writeHead(200,{'Content-Type':result.entry.mimeType,'Content-Length':result.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(result.bytes);return;
      }
      send(res,404,{error:'Not found.'});
      }
    } catch(error) {emit('http.failed',{route,code:'REQUEST_FAILED'});if(!res.headersSent) send(res,400,{error:error.message});else res.destroy();}
  });
  const workerChannel=createWorkerChannel(server,{getClient:()=>client,isReady:()=>!!requests && !!demo,log:emit});
  server.requestTimeout=120000;
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch(error){workerChannel.close();throw error;}
  try {
    vault??=await openVault(directory);
    try {client=await vault.readJson('pairing.json');} catch(error) {if(error.code!=='ENOENT') throw error;}
    try {settings=await vault.readJson('settings.json');if(typeof settings.allowTemporaryExports!=='boolean')throw new Error('Invalid encrypted settings.');}catch(error){if(error.code!=='ENOENT')throw error;}
    // Also clears exports left by a previous crash. This folder is deliberately
    // separate from encrypted cache blobs and is never a default handoff.
    exports=await openExports(directory);primaryExports=exports;await exports.clean(true);await exports.setEnabled(settings.allowTemporaryExports);
    catalog=await openCatalog(directory,{vault});cache=await openCache(directory,{budgetBytes,vault});requests=await openRequests(directory,{catalog,cache,vault,notify:workerChannel.notify,workerConnected:workerChannel.connected,syncWorkerConnected:workerChannel.catalogSyncConnected,log:emit});
    const demoDirectory=path.join(directory,'demo'),demoVault=await openVault(demoDirectory);
    const demoCatalog=await openCatalog(demoDirectory,{vault:demoVault,provider:'demo'}),demoCache=await openCache(demoDirectory,{vault:demoVault,budgetBytes,provider:'demo'});
    const demoExports=await openExports(demoDirectory);await demoExports.clean(true);await demoExports.setEnabled(settings.allowTemporaryExports);
    demo={cache:demoCache,catalog:demoCatalog,exports:demoExports,tickets:new Map(),requests:await openRequests(demoDirectory,{catalog:demoCatalog,cache:demoCache,vault:demoVault,provider:'demo',notify:()=>workerChannel.notify('demo'),workerConnected:()=>workerChannel.connected('demo'),syncWorkerConnected:()=>workerChannel.catalogSyncConnected('demo'),log:emit})};
  }
  catch(error) {workerChannel.close();await new Promise(resolve=>server.close(resolve));await exports?.close();throw error;}
  return {server,cache,requests,demo,pairingCode,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{await new Promise(resolve=>{workerChannel.close();server.close(resolve);server.closeAllConnections();});await exports.close();await demo.exports.close();}};
}
