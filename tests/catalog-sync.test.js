import {storageHarness} from './storage-fixture.js';
import {openVault} from '../companion/vault.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createCompanion} from '../companion/server.js';
import {openCache} from '../companion/cache.js';
import {openCatalog} from '../companion/catalog.js';
import {openRequests} from '../companion/requests.js';
import {COMPANION_URL} from '../extension/companion-client.js';

const origin=`chrome-extension://${'a'.repeat(32)}`;
const entries=[{kind:'module',id:'10',key:'module:10',title:'Week 1',description:'Read the paper',parentKey:null},
  {kind:'document',id:'20',key:'document:20',title:'Reading',parentKey:'module:10',contentType:'file',sourceUrl:'https://brightspace.nyu.edu/content/enforced/200/reading.pdf'}];
const course=(id='200')=>({courseId:id,title:`Course ${id}`,status:'complete',coverage:'full-toc',lastScannedAt:new Date().toISOString(),entries});
const snapshot=(id='5',courses=[course()])=>({semesterId:id,title:`Semester ${id}`,updatedAt:new Date().toISOString(),courses});
async function temporary(t) {
  const root=path.resolve('.cache/tests');await mkdir(root,{recursive:true});const directory=await mkdtemp(path.join(root,'brightspace-sync-test-'));
  t.after(async()=>{if(!directory.startsWith(root+path.sep) || !path.basename(directory).startsWith('brightspace-sync-test-')) throw new Error('Unsafe cleanup path.');await rm(directory,{recursive:true,force:true});});return directory;
}

test('real MCP and background worker discover and sync without opening extension UI, then resume a partial login failure',async t=>{
  const directory=await temporary(t),app=await createCompanion({directory,port:0,pairingCode:'123456789a'}),nativeFetch=globalThis.fetch;
  const pairing=await nativeFetch(app.url+'/v1/pair',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code:'123456789a'})}).then(r=>r.json());
  const local={companionPairing:{token:pairing.token},automaticRetrieval:false},session={},schoolCalls=[];
  let listener,login=false,pauseDuringModule=false;
  const storage=values=>({get:async keys=>keys==null?structuredClone(values):Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(values[key])])),set:async updates=>Object.assign(values,structuredClone(updates)),remove:async key=>delete values[key]});
  const noop={addListener(){}};
  globalThis.chrome={runtime:{id:'a'.repeat(32),getURL:name=>origin+'/'+name,onStartup:noop,onInstalled:noop,onMessage:{addListener:fn=>listener=fn}},alarms:{onAlarm:noop,create:async()=>{}},storage:{local:storage(local),session:storage(session)},downloads:{onChanged:noop,search:async()=>[]}};
  const browserStore=storageHarness(local,{session});chrome.storage=browserStore.storage;
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    if(url.startsWith('https://brightspace.nyu.edu/')) {
      assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');schoolCalls.push(url);
      const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
      if(url.endsWith('/mysemesters')) return json([{OrgUnitId:'5',Name:'2026 Fall'},{OrgUnitId:'6',Name:'2026 Spring'},{OrgUnitId:'7',Name:'2025 Fall'}]);
      if(url.includes('/mycourses?')) return json({Courses:[{OrgUnitId:'200',Name:'Happiness',TypeId:3},{OrgUnitId:'300',Name:'Networks',TypeId:3}],Bookmark:null});
      if(url.endsWith('/300/content/toc') && login) return new Response('Login',{status:401});
      if(url.endsWith('/200/content/toc') && pauseDuringModule) return json({Modules:[10,11].map(ModuleId=>({ModuleId,Title:`Module ${ModuleId}`,Modules:[],Topics:[]}))});
      if(url.endsWith('/content/modules/10')) {pauseDuringModule=false;await send({type:'retrieval-settings',enabled:false});return json({Id:10,Type:0,Description:{Text:'A retained note'}});}
      if(url.endsWith('/content/toc')) return json({Modules:[{ModuleId:10,Title:'Week 1',Description:{Text:'Reading: paper. Film: Me, Earl and the Dying Girl.'},Modules:[],Topics:[{TopicId:20,Title:'Reading',TypeIdentifier:'File',Url:'/content/enforced/200/reading.pdf'}]}]});
      throw new Error('Unexpected upstream request: '+url);
    }
    return nativeFetch(url.replace(COMPANION_URL,app.url),{...options,headers:{...options.headers,Origin:origin}});
  });
  const oldSocket=globalThis.WebSocket;
  globalThis.WebSocket=class extends WebSocket {constructor(url){super(url.replace(COMPANION_URL.replace('http:','ws:'),app.url.replace('http:','ws:')),{origin});}};
  const client=new Client({name:'catalog-sync-test',version:'1.0.0'});
  const send=message=>new Promise(resolve=>listener(message,{id:chrome.runtime.id,url:origin+'/popup.html'},resolve));
  t.after(async()=>{if(listener) await send({type:'retrieval-settings',enabled:false});await client.close();await app.close();delete globalThis.chrome;globalThis.WebSocket=oldSocket;});
  await import(`../extension/background.js?catalog-sync=${Date.now()}`);
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.resolve('mcp/start.js')],env:{BRIGHTSPACE_CACHE_DIR:directory,BRIGHTSPACE_COMPANION_PORT:String(app.server.address().port)},stderr:'pipe'}));
  const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});if(result.isError) throw new Error(result.content[0].text);return JSON.parse(result.content[0].text);};
  const wait=async request=>{let result=request;for(let attempt=0;attempt<8 && ['queued','fetching'].includes(result.state);attempt++) result=await call('get_catalog_sync',{requestId:request.requestId,waitSeconds:1});return result;};
  const discovery=await call('request_catalog_sync',{waitSeconds:0});assert.equal(discovery.state,'queued');assert.equal(discovery.workerConnected,false);
  assert.equal((await call('request_catalog_sync',{waitSeconds:0})).requestId,discovery.requestId);assert.equal(schoolCalls.length,0);
  assert.equal((await send({type:'retrieval-settings',enabled:true})).ok,true);
  let result=await wait(discovery);assert.equal(result.state,'ready');assert.equal(result.semesters.length,3);
  assert.equal((await call('list_courses')).semesters[0].hasSavedCatalog,false);
  const sync=await call('request_catalog_sync',{semesterId:'5',waitSeconds:0});result=await wait(sync);assert.equal(result.state,'ready');assert.equal(result.result.complete,2);
  const browser=await browserStore.view.get(null);assert.equal(local['course:200'].encryptedStorage,1);assert.equal(browser['semester:5'].courses.length,2);
  assert.equal(browser.semesterSync.courses.length,2);assert.ok(browser.semesterSync.courses.every(course=>course.state==='complete'));
  assert.equal(JSON.stringify(local).includes('Dying Girl'),false);assert.equal(JSON.stringify(local).includes(pairing.token),false);assert.equal(JSON.stringify(local).includes(pairing.storageKey),false);
  const found=await call('search_catalog',{courseId:'200',query:'Earl'});assert.equal(found.total,1);assert.match(found.entries[0].description,/Dying Girl/);
  assert.equal((await app.cache.stats()).files,0);assert.equal(schoolCalls.some(url=>url.endsWith('.pdf')),false);
  await app.requests.get(sync.requestId);assert.equal((await call('request_catalog_sync',{semesterId:'5',waitSeconds:0})).requestId,sync.requestId);
  // A previous good outline must survive a later login failure.
  await nativeFetch(app.url+'/v1/catalog/semesters',{method:'PUT',headers:{Origin:origin,Authorization:`Bearer ${pairing.token}`,'Content-Type':'application/json'},body:JSON.stringify(snapshot('6',[course('200'),course('300')]))});
  login=true;const partial=await call('request_catalog_sync',{semesterId:'6',waitSeconds:0});result=await wait(partial);
  assert.equal(result.state,'needs_login');assert.equal(result.result.complete,1);assert.equal(result.result.courses,2);
  const stale=(await call('list_courses',{semesterId:'6'})).courses.find(course=>course.courseId==='300');assert.equal(stale.stale,true);assert.equal(stale.status,'failed');
  login=false;result=await wait(await call('request_catalog_sync',{semesterId:'6',retry:true,waitSeconds:0}));assert.equal(result.state,'ready');assert.equal(result.result.complete,2);
  pauseDuringModule=true;const paused=await call('request_catalog_sync',{semesterId:'7',waitSeconds:0});
  let pending;
  for(let i=0;i<30;i++) {pending=await call('get_catalog_sync',{requestId:paused.requestId,waitSeconds:0});if(pending.code==='PAUSED') break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(pending.state,'queued');assert.equal(pending.code,'PAUSED');
  assert.equal(schoolCalls.some(url=>url.endsWith('/content/modules/11')),false,'pausing prevents the next module request');
  await send({type:'retrieval-settings',enabled:true});assert.equal((await wait(paused)).state,'ready');
  assert.equal(JSON.stringify([discovery,result,found]).includes(pairing.token),false);assert.equal(JSON.stringify(result).includes('leaseId'),false);
  await assert.rejects(call('request_catalog_sync',{url:'https://example.com/'}),/Unknown catalog sync parameter/);
});

test('catalog sync leases serialize document work, renew, recover after restart, and reject stale completions',async t=>{
  const directory=await temporary(t),catalog=await openCatalog(directory),cache=await openCache(directory);let time=1000;
  await catalog.put(snapshot());
  let requests=await openRequests(directory,{catalog,cache,now:()=>time});
  const sync=await requests.syncRequest({semesterId:'5'}),first=await requests.claim();
  await requests.request({courseId:'200',key:'document:20'});assert.equal((await requests.claim()).job,null);
  time+=150000;await requests.progress({requestId:sync.requestId,leaseId:first.job.leaseId,progress:{phase:'scanning',completed:0,total:1}});
  time+=60000;assert.equal((await requests.get(sync.requestId)).state,'fetching');
  await assert.rejects(requests.finish({requestId:sync.requestId,leaseId:'0'.repeat(36),result:{snapshot:snapshot()}}),/lease expired/);
  requests=await openRequests(directory,{catalog,cache,now:()=>time});const recovered=await requests.claim();assert.notEqual(recovered.job.leaseId,first.job.leaseId);
  await assert.rejects(requests.finish({requestId:sync.requestId,leaseId:first.job.leaseId,result:{snapshot:snapshot()}}),/lease expired/);
  await assert.rejects(requests.finish({requestId:sync.requestId,leaseId:recovered.job.leaseId,result:{snapshot:snapshot('9')}}),/does not match/);
  const ready=await requests.finish({requestId:sync.requestId,leaseId:recovered.job.leaseId,result:{snapshot:snapshot()}});assert.equal(ready.state,'ready');assert.equal(ready.result.complete,1);
  assert.ok((await requests.claim()).job.metadata);
});

test('discovery persists separately from outlines; unsupported workers cannot claim sync and throttling enforces cooldown',async t=>{
  const directory=await temporary(t),catalog=await openCatalog(directory),cache=await openCache(directory);let time=1000;
  await catalog.put(snapshot());const requests=await openRequests(directory,{catalog,cache,now:()=>time});
  const discovery=await requests.syncRequest({});assert.equal((await requests.claim({catalogSync:false})).job,null);
  let claimed=await requests.claim();await requests.finish({requestId:discovery.requestId,leaseId:claimed.job.leaseId,result:{semesters:[{semesterId:'5',title:'2026 Fall'},{semesterId:'6',title:'2026 Spring'}]}});
  await catalog.put(snapshot());assert.equal((await (await openCatalog(directory)).read()).availableSemesters.length,2);
  const sync=await requests.syncRequest({semesterId:'5'});claimed=await requests.claim();await requests.finish({requestId:sync.requestId,leaseId:claimed.job.leaseId,code:'RATE_LIMITED'});
  assert.equal((await requests.syncRequest({semesterId:'5',retry:true})).retryAfterSeconds,60);assert.equal((await requests.claim()).job,null);
  time+=60001;assert.equal((await requests.syncRequest({semesterId:'5',retry:true})).state,'queued');
  assert.equal((await catalog.read()).semesters[0].courses[0].entries.length,2);
  await assert.rejects(requests.syncRequest({semesterId:'https://evil.example/'}),/semesterId/);
});

test('version-one document queues migrate without losing pending retrievals',async t=>{
  const directory=await temporary(t),catalog=await openCatalog(directory),cache=await openCache(directory);await catalog.put(snapshot());
  let requests=await openRequests(directory,{catalog,cache});const document=await requests.request({courseId:'200',key:'document:20'});
  const vault=await openVault(directory),stored=await vault.readJson('requests.json');stored.version=1;await vault.writeJson('requests.json',stored);
  requests=await openRequests(directory,{catalog,cache});assert.equal((await requests.get(document.requestId)).state,'queued');assert.equal((await requests.claim()).job.metadata.topicId,'20');
});
