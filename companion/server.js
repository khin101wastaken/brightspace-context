import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {openCache,validateMetadata,MAX_FILE_BYTES} from './cache.js';
import {atomicWrite} from './files.js';
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
export async function createCompanion({directory,port=47653,budgetBytes,pairingCode=randomBytes(5).toString('hex'),log=()=>{}}={}) {
  if(!directory) throw new Error('Cache directory is required.');
  const emit=safeLogger(log);
  let cache,catalog,requests;
  const configPath=path.join(directory,'pairing.json');
  let client=null;
  try {client=JSON.parse(await readFile(configPath,'utf8'));} catch(error) {if(error.code!=='ENOENT') throw error;}
  const tickets=new Map();let failedPairings=0,windowStart=Date.now();
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    const started=Date.now();let route='unknown';
    res.once('finish',()=>{if(req.method!=='OPTIONS') emit('http.request',{method:req.method,route,status:res.statusCode,elapsedMs:Date.now()-started});});
    try {
      const expectedHost=`127.0.0.1:${server.address().port}`;
      if(req.headers.host!==expectedHost) return send(res,403,{error:'Invalid local host.'});
      if(!requests) return send(res,503,{error:'Companion is starting. Try again in a moment.'});
      const origin=req.headers.origin;
      if(!/^chrome-extension:\/\/[a-p]{32}$/.test(origin || '')) {emit('auth.rejected',{code:'EXTENSION_ORIGIN_REQUIRED'});return send(res,403,{error:'Only the paired browser extension can connect.',code:'EXTENSION_ORIGIN_REQUIRED'});}
      res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Origin',origin);
      if(req.method==='OPTIONS') {
        res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});res.end();return;
      }
      const url=new URL(req.url,`http://${expectedHost}`);
      route=url.pathname==='/v1/pair'?'pair':url.pathname==='/v1/status'?'status':url.pathname.startsWith('/v1/catalog')?'catalog':url.pathname.startsWith('/v1/requests')?'requests':url.pathname.startsWith('/v1/cache')?'cache':'unknown';
      if(req.method==='POST' && url.pathname==='/v1/pair') {
        if(Date.now()-windowStart>60000) {failedPairings=0;windowStart=Date.now();}
        if(failedPairings>=10) {emit('pair.rejected',{code:'RATE_LIMITED'});return send(res,429,{error:'Too many pairing attempts. Wait a minute.'});}
        const value=JSON.parse((await body(req,4096)).toString());
        if(!same(value.code?.trim().toLowerCase(),pairingCode)) {failedPairings++;emit('pair.rejected',{code:'CODE_MISMATCH'});return send(res,403,{error:'Pairing code did not match.'});}
        const token=randomBytes(32).toString('hex');client={origin,token};
        await atomicWrite(configPath,JSON.stringify(client),{mode:0o600});
        emit('pair.accepted',{origin});
        return send(res,200,{token,...await cache.stats()});
      }
      if(!client || client.origin!==origin || !same(req.headers.authorization,`Bearer ${client.token}`)) {emit('auth.rejected',{code:!client?'NOT_PAIRED':client.origin!==origin?'BROWSER_MISMATCH':'TOKEN_MISMATCH',origin});return send(res,401,{error:'Pair this extension with the companion first.',code:'PAIRING_REQUIRED'});}
      if(req.method==='POST' && url.pathname==='/v1/requests') return send(res,200,await requests.request(JSON.parse((await body(req,4096)).toString())));
      if(req.method==='POST' && url.pathname==='/v1/requests/claim') return send(res,200,await requests.claim());
      if(req.method==='POST' && url.pathname==='/v1/requests/finish') return send(res,200,await requests.finish(JSON.parse((await body(req,4096)).toString())));
      if(req.method==='POST' && url.pathname==='/v1/requests/retry-login') return send(res,200,await requests.retryLogin());
      const request=url.pathname.match(/^\/v1\/requests\/([a-f0-9-]{36})$/);
      if(req.method==='GET' && request) return send(res,200,await requests.get(request[1]));
      if(req.method==='GET' && url.pathname==='/v1/catalog') return send(res,200,await catalog.read());
      if(req.method==='PUT' && url.pathname==='/v1/catalog/semesters') {const result=await catalog.put(JSON.parse((await body(req,MAX_CATALOG_BYTES)).toString()));emit('catalog.synced',result);return send(res,200,result);}
      if(['GET','POST'].includes(req.method) && url.pathname==='/v1/status') return send(res,200,{...await cache.stats(),workerConnected:workerChannel.connected()});
      if(req.method==='GET' && url.pathname==='/v1/cache/documents') return send(res,200,{documents:await cache.list()});
      const document=url.pathname.match(/^\/v1\/cache\/documents\/([a-f0-9]{64})$/);
      if(req.method==='GET' && document) {
        const result=await cache.read(document[1]);
        if(!result) return send(res,404,{error:'Document is no longer cached or failed its integrity check.'});
        return send(res,200,{document:result.entry});
      }
      if(req.method==='POST' && url.pathname==='/v1/cache/lookup') {
        const metadata=validateMetadata(JSON.parse((await body(req,128*1024)).toString()));
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
    } catch(error) {emit('http.failed',{route,code:'REQUEST_FAILED'});if(!res.headersSent) send(res,400,{error:error.message});else res.destroy();}
  });
  const workerChannel=createWorkerChannel(server,{getClient:()=>client,isReady:()=>!!requests,log:emit});
  server.requestTimeout=120000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  try {catalog=await openCatalog(directory);cache=await openCache(directory,{budgetBytes});requests=await openRequests(directory,{catalog,cache,notify:workerChannel.notify,workerConnected:workerChannel.connected,log:emit});}
  catch(error) {workerChannel.close();await new Promise(resolve=>server.close(resolve));throw error;}
  return {server,cache,requests,pairingCode,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>{workerChannel.close();server.close(resolve);server.closeAllConnections();})};
}
