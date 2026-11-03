import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {WebSocket} from 'ws';
import {once} from 'node:events';
import {createLogger} from '../companion/logging.js';
import {createCompanion} from '../companion/server.js';

test('diagnostics accept only known event fields and cannot log credentials, titles or injected terminal lines',()=>{
  const lines=[],log=createLogger({write:line=>lines.push(line),now:()=>new Date('2026-11-03T12:00:00Z')});
  log('pair.accepted',{origin:`chrome-extension://${'a'.repeat(32)}`,token:'PRIVATE_TOKEN',pairingCode:'PRIVATE_PAIR_CODE',authorization:'Bearer PRIVATE_AUTH'});
  log('retrieval.queued',{requestId:'a'.repeat(36),courseId:'100',topicId:'20',title:'PRIVATE_TITLE',description:'PRIVATE_DESCRIPTION',sourceUrl:'https://secret.example/?token=PRIVATE_URL',body:'PRIVATE_BODY'});
  log('app.starting',{pid:10,runtime:'v22.23.4',directory:'C:\\cache\nFORGED\x1b[31m'});
  log('PRIVATE_UNKNOWN_EVENT',{token:'PRIVATE_UNKNOWN_TOKEN'});
  const output=lines.join('\n');
  assert.equal(lines.length,3);assert.match(output,/courseId="100"/);
  assert.doesNotMatch(output,/PRIVATE_|\x1b/);
  assert.equal(lines[2].split('\n').length,1);
});
test('normal logs omit polling, verbose mode includes timings, repeated auth warnings are coalesced, and sink failures are harmless',()=>{
  let time=0;const lines=[],write=line=>lines.push(line),now=()=>new Date(time);
  const log=createLogger({write,now});
  log('http.request',{method:'POST',route:'status',status:200,elapsedMs:2});assert.equal(lines.length,0);
  log('auth.rejected',{code:'TOKEN_MISMATCH'});log('auth.rejected',{code:'TOKEN_MISMATCH'});assert.equal(lines.length,1);
  time=30001;log('auth.rejected',{code:'TOKEN_MISMATCH'});assert.equal(lines.length,2);
  createLogger({level:'debug',write,now})('http.request',{method:'POST',route:'status',status:200,elapsedMs:2});assert.match(lines[2],/DEBUG.*status=200.*elapsedMs=2/);
  createLogger({level:'silent',write})('pair.accepted',{});assert.equal(lines.length,3);
  assert.doesNotThrow(()=>createLogger({write:()=>{throw new Error('broken output');}})('app.ready',{files:1}));
  assert.throws(()=>createLogger({level:'unsupported'}),/BRIGHTSPACE_LOG_LEVEL/);
});
test('real pairing, catalog, WebSocket, cache and retrieval events provide diagnostics without credentials or content',{timeout:10000},async t=>{
  const root=path.resolve('.cache/tests');await mkdir(root,{recursive:true});
  const directory=await mkdtemp(path.join(root,'brightspace-logging-test-')),lines=[];
  let disconnected;
  const disconnectedEvent=new Promise(resolve=>{disconnected=resolve;});
  const app=await createCompanion({directory,port:0,pairingCode:'123456789a',log:createLogger({write:line=>{lines.push(line);if(line.includes('worker.disconnected')) disconnected();}})});
  let ws;
  t.after(async()=>{
    ws?.terminate();await app.close();
    if(!directory.startsWith(root+path.sep) || !path.basename(directory).startsWith('brightspace-logging-test-')) throw new Error('Unsafe cleanup path.');
    await rm(directory,{recursive:true,force:true});
  });
  const origin=`chrome-extension://${'a'.repeat(32)}`;
  const pair=await fetch(app.url+'/v1/pair',{method:'POST',headers:{Origin:origin},body:JSON.stringify({code:app.pairingCode})}).then(r=>r.json());
  const headers={Origin:origin,Authorization:`Bearer ${pair.token}`,'Content-Type':'application/json'};
  const request=async(route,body,method='POST')=>{
    const response=await fetch(app.url+route,{method,headers,body:Buffer.isBuffer(body)?body:JSON.stringify(body)});
    assert.equal(response.status,200);return response.json();
  };
  await fetch(app.url+'/v1/status',{method:'POST',headers:{Origin:origin,Authorization:'Bearer PRIVATE_BAD_AUTH'}});
  ws=new WebSocket(app.url.replace('http:','ws:')+'/v1/worker',{origin});
  await once(ws,'open');const ready=once(ws,'message');ws.send(JSON.stringify({type:'authenticate',token:pair.token}));await ready;
  const meta={courseId:'100',topicId:'20',title:'PRIVATE_TITLE',courseTitle:'PRIVATE_COURSE',modulePath:['PRIVATE_MODULE'],sourceUrl:'https://brightspace.nyu.edu/content/enforced/100/private-name.pdf',lastModifiedAt:'2026-11-01T00:00:00Z'};
  await request('/v1/catalog/semesters',{semesterId:'5',title:'PRIVATE_SEMESTER',updatedAt:new Date().toISOString(),courses:[{courseId:'100',title:meta.courseTitle,status:'complete',coverage:'full-toc',lastScannedAt:new Date().toISOString(),entries:[{key:'document:20',id:'20',kind:'document',contentType:'file',title:meta.title,description:'PRIVATE_DESCRIPTION',sourceUrl:meta.sourceUrl,lastModifiedAt:meta.lastModifiedAt}]}]},'PUT');
  const first=await request('/v1/requests',{courseId:'100',key:'document:20'}),claimed=await request('/v1/requests/claim');
  await request('/v1/requests/finish',{requestId:first.requestId,leaseId:claimed.job.leaseId,code:'NETWORK_ERROR'});
  const second=await request('/v1/requests',{courseId:'100',key:'document:20',retry:true}),next=await request('/v1/requests/claim');
  const lookup=await request('/v1/cache/lookup',meta);
  await request(`/v1/cache/uploads/${lookup.uploadId}`,Buffer.from('%PDF-1.4\nPRIVATE_DOCUMENT_BYTES\n%%EOF'),'PUT');
  await request('/v1/requests/finish',{requestId:second.requestId,leaseId:next.job.leaseId});
  const cached=await request('/v1/requests',{courseId:'100',key:'document:20'});assert.equal(cached.source,'cache');
  const closed=once(ws,'close');ws.close();await closed;await disconnectedEvent;
  // Read-only status and empty queue polling produce no INFO lines.
  const before=lines.length;
  await request('/v1/status',{});await request('/v1/requests/claim',{});assert.equal(lines.length,before);
  const output=lines.join('\n');
  for(const event of ['pair.accepted','auth.rejected','worker.connected','worker.disconnected','catalog.synced','retrieval.queued','retrieval.fetching','retrieval.failed','cache.miss','cache.stored','retrieval.ready','retrieval.cache_hit']) assert.ok(output.includes(event),`Missing ${event}`);
  assert.match(output,/NETWORK_ERROR/);assert.ok(output.includes(first.requestId));
  for(const privateValue of [pair.token,app.pairingCode,claimed.job.leaseId,next.job.leaseId,lookup.uploadId,'PRIVATE_','private-name.pdf']) assert.equal(output.includes(privateValue),false,`Private data leaked: ${privateValue==='PRIVATE_'?'marker':'credential/content'}`);
});
