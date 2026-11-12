import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {WebSocket} from 'ws';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createCompanion} from '../companion/server.js';
import {openRequests} from '../companion/requests.js';
import {openCache} from '../companion/cache.js';
import {createRetrievalWorker} from '../extension/retrieval-worker.js';
import {COMPANION_URL} from '../extension/companion-client.js';
import {documentFormat} from '../extension/document-formats.js';
import {officeFixture} from './office-fixture.js';

const origin=`chrome-extension://${'a'.repeat(32)}`;
const bytes=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
const snapshot=()=>({semesterId:'5',title:'2026 Fall',updatedAt:new Date().toISOString(),courses:[{courseId:'200',title:'Happiness',status:'complete',coverage:'full-toc',lastScannedAt:new Date().toISOString(),entries:[
  {key:'module:10',id:'10',kind:'module',title:'Week 1',parentKey:null},
  {key:'document:20',id:'20',kind:'document',title:'Gratitude reading',parentKey:'module:10',contentType:'file',sourceUrl:'https://brightspace.nyu.edu/content/enforced/200/gratitude.pdf',lastModifiedAt:'2026-09-01T00:00:00Z'},
  {key:'document:21',id:'21',kind:'document',title:'External reading',parentKey:'module:10',contentType:'link',sourceUrl:'https://example.com/reading.pdf'},
] }]});
async function temporary(t) {
  const root=path.resolve('.cache/tests');await mkdir(root,{recursive:true});const directory=await mkdtemp(path.join(root,'brightspace-retrieval-test-'));
  t.after(async()=>{if(!directory.startsWith(root+path.sep) || !path.basename(directory).startsWith('brightspace-retrieval-test-')) throw new Error('Unsafe cleanup path.');await rm(directory,{recursive:true,force:true});});return directory;
}
async function fixture(t,extension='pdf') {
  const directory=await temporary(t),app=await createCompanion({directory,port:0,pairingCode:'123456789a'});
  const pairing=await fetch(app.url+'/v1/pair',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code:'123456789a'})}).then(r=>r.json());
  const headers={Origin:origin,Authorization:`Bearer ${pairing.token}`,'Content-Type':'application/json'};
  const catalog=snapshot();catalog.courses[0].entries[1].sourceUrl=catalog.courses[0].entries[1].sourceUrl.replace(/\.pdf$/,'.'+extension);
  const fileBytes=extension==='pdf'?bytes:officeFixture(extension),format=documentFormat(catalog.courses[0].entries[1].sourceUrl);
  const sync=await fetch(app.url+'/v1/catalog/semesters',{method:'PUT',headers,body:JSON.stringify(catalog)});assert.equal(sync.status,200);
  let upstream=0,login=false,enabled=true;
  const fetcher=async(url,options={})=>{
    if(url.startsWith('https://brightspace.nyu.edu/')) {upstream++;assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');return login?new Response('<html>Login</html>',{headers:{'content-type':'text/html'}}):new Response(fileBytes,{headers:{'content-type':extension==='pdf'?format.mimeType:'application/octet-stream'}});}
    return fetch(url.replace(COMPANION_URL,app.url),{...options,headers:{...options.headers,Origin:origin}});
  };
  class ChromeSocket extends WebSocket {constructor(url){super(url,{origin});}}
  const worker=createRetrievalWorker({getSettings:async()=>({enabled,token:pairing.token}),fetcher,Socket:ChromeSocket,url:app.url.replace('http:','ws:')+'/v1/worker',heartbeatMs:1000});
  const client=new Client({name:'retrieval-test',version:'1.0.0'});
  t.after(async()=>{worker.stop();await client.close();await app.close();});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('mcp/start.js')],env:{BRIGHTSPACE_CACHE_DIR:directory,BRIGHTSPACE_COMPANION_PORT:String(app.server.address().port)},stderr:'pipe'}));
  const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});if(result.isError) throw new Error(result.content[0].text);return JSON.parse(result.content[0].text);};
  return {app,worker,client,call,directory,headers,pairing,fileBytes,format,upstream:()=>upstream,setLogin:value=>login=value,setEnabled:value=>enabled=value};
}

test('PPTX and DOCX traverse the real worker, cache and MCP with correct extensions, MIME types and repeat hits',async t=>{
  for(const extension of ['pptx','docx']) await t.test(extension,async t=>{
    const f=await fixture(t,extension);
    const catalog=await f.call('search_catalog',{courseId:'200',query:'Gratitude'});assert.equal(catalog.entries[0].cacheSupported,true);assert.equal(catalog.entries[0].extension,extension);
    const pending=await f.call('request_document',{courseId:'200',key:'document:20',waitSeconds:0});await f.worker.connect();
    let ready;
    for(let i=0;i<10;i++) {ready=await f.call('get_document_request',{requestId:pending.requestId,waitSeconds:1});if(ready.state==='ready') break;await new Promise(resolve=>setTimeout(resolve,30));}
    assert.equal(ready.state,'ready');assert.equal(ready.document.localPath,undefined);assert.equal(ready.document.extension,extension);assert.equal(ready.document.mimeType,f.format.mimeType);assert.deepEqual(Buffer.from((await f.client.readResource({uri:ready.document.uri})).contents[0].blob,'base64'),f.fileBytes);
    const repeated=await f.call('request_document',{courseId:'200',key:'document:20',waitSeconds:0});assert.equal(repeated.source,'cache');assert.equal(f.upstream(),1);
    const handoff=await f.client.callTool({name:'get_cached_document',arguments:{id:ready.document.id}});assert.equal(handoff.content[1].mimeType,f.format.mimeType);
    const resource=await f.client.readResource({uri:ready.document.uri});assert.equal(resource.contents[0].mimeType,f.format.mimeType);assert.deepEqual(Buffer.from(resource.contents[0].blob,'base64'),f.fileBytes);
    const resources=await f.client.listResources();assert.equal(resources.resources[0].mimeType,f.format.mimeType);
    const response=await fetch(f.app.url+`/v1/cache/files/${ready.document.id}`,{headers:f.headers});assert.equal(response.headers.get('content-type'),f.format.mimeType);
    f.worker.stop();const reopened=await openCache(f.directory);assert.deepEqual((await reopened.read(ready.document.id)).bytes,f.fileBytes);
    assert.equal(JSON.stringify([ready,repeated,handoff]).includes(f.pairing.token),false);
  });
});

test('MCP uncached request survives an offline extension, deduplicates, wakes the real worker via WebSocket, and returns identical PDF bytes',async t=>{
  const f=await fixture(t);
  const a=await f.call('request_document',{courseId:'200',key:'document:20',waitSeconds:0});
  const b=await f.call('request_document',{courseId:'200',key:'document:20',waitSeconds:0});
  assert.equal(a.state,'queued');assert.equal(a.workerConnected,false);assert.equal(a.requestId,b.requestId);assert.equal(f.upstream(),0);
  f.setEnabled(false);await f.worker.connect();await f.worker.drain();assert.equal(f.upstream(),0);assert.equal((await f.app.requests.get(a.requestId)).state,'queued');
  f.setEnabled(true);
  await f.worker.connect();
  // The socket authenticates and starts draining; status polling is bounded.
  let ready;
  for(let attempt=0;attempt<10;attempt++) {ready=await f.call('get_document_request',{requestId:a.requestId,waitSeconds:1});if(ready.state==='ready') break;await new Promise(resolve=>setTimeout(resolve,30));}
  assert.equal(ready.state,'ready');assert.equal(ready.source,'brightspace');
  assert.equal(ready.document.localPath,undefined);assert.deepEqual(Buffer.from((await f.client.readResource({uri:ready.document.uri})).contents[0].blob,'base64'),bytes);assert.equal(f.upstream(),1);
  const repeated=await f.call('request_document',{courseId:'200',key:'document:20',waitSeconds:0});
  assert.equal(repeated.state,'ready');assert.equal(repeated.source,'cache');assert.equal(f.upstream(),1);
  assert.equal(JSON.stringify([a,b,ready,repeated]).includes(f.pairing.token),false);
  assert.equal(JSON.stringify(ready).includes('leaseId'),false);
  await assert.rejects(f.call('request_document',{courseId:'200',key:'document:21',waitSeconds:0}),/PDF/);
  await assert.rejects(f.call('request_document',{courseId:'200',key:'document:999',waitSeconds:0}),/not in the synced catalog/);
  await assert.rejects(f.call('request_document',{courseId:'200',key:'document:20',url:'https://evil.example/'}),/Unknown retrieval parameter/);
});

test('login HTML blocks retrieval without caching, and explicit retry resumes the same queued reading',async t=>{
  const f=await fixture(t);f.setLogin(true);await f.worker.connect();
  const pending=await f.call('request_document',{courseId:'200',key:'document:20',waitSeconds:0});
  let result;
  for(let attempt=0;attempt<10;attempt++) {result=await f.call('get_document_request',{requestId:pending.requestId,waitSeconds:1});if(result.state==='needs_login') break;await new Promise(resolve=>setTimeout(resolve,30));}
  assert.equal(result.state,'needs_login');assert.equal((await f.app.cache.stats()).files,0);assert.equal(f.upstream(),1);
  const again=await f.call('request_document',{courseId:'200',key:'document:20',waitSeconds:0});assert.equal(again.state,'needs_login');assert.equal(f.upstream(),1);
  f.setLogin(false);
  const retry=await fetch(f.app.url+'/v1/requests/retry-login',{method:'POST',headers:f.headers});assert.equal((await retry.json()).retried,1);
  result=await f.call('get_document_request',{requestId:pending.requestId,waitSeconds:5});assert.equal(result.state,'ready');assert.equal(f.upstream(),2);
});

test('queue leases recover after interruption and reject forged or unverified completion',async t=>{
  const directory=await temporary(t),cache=await openCache(directory);let time=1000;
  const catalog={read:async()=>({semesters:[snapshot()]})};
  let requests=await openRequests(directory,{catalog,cache,now:()=>time});
  const request=await requests.request({courseId:'200',key:'document:20'}),first=await requests.claim();
  await assert.rejects(requests.finish({requestId:request.requestId,leaseId:first.job.leaseId}),/not been verified/);
  await assert.rejects(requests.finish({requestId:request.requestId,leaseId:'b'.repeat(36)}),/lease expired/);
  assert.equal((await requests.claim()).job,null);
  time+=180001;const second=await requests.claim();assert.notEqual(second.job.leaseId,first.job.leaseId);
  await assert.rejects(requests.finish({requestId:request.requestId,leaseId:first.job.leaseId,code:'FAILED'}),/lease expired/);
  requests=await openRequests(directory,{catalog,cache,now:()=>time});
  assert.equal((await requests.get(request.requestId)).state,'queued');
  const recovered=await requests.claim();await cache.put(recovered.job.metadata,bytes);
  assert.equal((await requests.finish({requestId:request.requestId,leaseId:recovered.job.leaseId})).state,'ready');
  assert.equal((await requests.request({courseId:'200',key:'document:20'})).source,'cache');
});

test('cancellation survives restart, respects the active lease and requires an explicit retry',async t=>{
  const directory=await temporary(t),cache=await openCache(directory),catalog={read:async()=>({semesters:[snapshot()]})};
  const options={catalog,cache};
  let requests=await openRequests(directory,options);
  const args={courseId:'200',key:'document:20'};
  const pending=await requests.request(args);
  assert.equal((await requests.pendingDocuments())[0].requestId,pending.requestId);
  const {job}=await requests.claim();
  assert.equal(await requests.cancelDocument(job.requestId),false);
  await requests.finish({...job,code:'NEEDS_LOGIN'});
  assert.equal(await requests.cancelDocument(job.requestId),true);
  requests=await openRequests(directory,options);
  assert.equal((await requests.get(job.requestId)).code,'CANCELLED');
  assert.deepEqual(await requests.pendingDocuments(),[]);
  assert.equal((await requests.retryLogin()).retried,0);
  assert.equal((await requests.claim()).job,null);
  assert.equal((await requests.request(args)).code,'CANCELLED');
  assert.notEqual((await requests.request({...args,retry:true})).requestId,pending.requestId);
});

test('worker WebSocket refuses ordinary website origins and invalid authentication',async t=>{
  const f=await fixture(t);
  const refused=new WebSocket(f.app.url.replace('http:','ws:')+'/v1/worker',{origin:'https://evil.example'});
  const error=await new Promise(resolve=>refused.once('error',resolve));assert.match(error.message,/403/);
  const bad=new WebSocket(f.app.url.replace('http:','ws:')+'/v1/worker',{origin});
  bad.on('error',()=>{});await new Promise(resolve=>bad.once('open',resolve));bad.send(JSON.stringify({type:'authenticate',token:'wrong'}));
  const code=await new Promise(resolve=>bad.once('close',resolve));assert.equal(code,1008);
  const status=await fetch(f.app.url+'/v1/status',{headers:f.headers}).then(r=>r.json());assert.equal(status.workerConnected,false);
});
