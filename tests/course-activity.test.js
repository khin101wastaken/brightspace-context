import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createCompanion} from '../companion/server.js';
import {createRetrievalWorker} from '../extension/retrieval-worker.js';
import {COMPANION_URL} from '../extension/companion-client.js';
import {LocalLibrary} from '../mcp/library.js';
import {createMcpServer} from '../mcp/server.js';
import {officeFixture} from './office-fixture.js';

test('MCP reads course activity through the paired worker and caches only a requested instructor file',async t=>{
  const root=path.resolve('.cache/tests');
  await mkdir(root,{recursive:true});
  const directory=await mkdtemp(path.join(root,'course-activity-'));
  assert.equal(path.dirname(directory),root);
  let companion,client,worker;
  t.after(async()=>{
    worker?.stop();await client?.close();await companion?.close();
    await rm(directory,{recursive:true,force:true});
  });
  const code='123456789a',origin=`chrome-extension://${'a'.repeat(32)}`;
  companion=await createCompanion({directory,port:0,pairingCode:code});
  const {token}=await fetch(companion.url+'/v1/pair',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code})}).then(r=>r.json());
  const courseId='200',stamp=new Date().toISOString();
  const snapshot={semesterId:'5',title:'Fall semester',updatedAt:stamp,courses:[{courseId,title:'Test course',status:'complete',coverage:'full-toc',lastScannedAt:stamp,entries:[]}]};
  const sync=await fetch(companion.url+'/v1/catalog/semesters',{method:'PUT',headers:{Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(snapshot)});
  assert.equal(sync.status,200,await sync.text());
  const library=new LocalLibrary(directory,companion.server.address().port),server=createMcpServer(library);
  client=new Client({name:'activity-test',version:'1'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);await client.connect(clientTransport);
  const call=(name,args={},options)=>client.callTool({name,arguments:{courseId,...args}},undefined,options);
  const result=async(name,args)=>{const response=await call(name,args);assert.notEqual(response.isError,true,response.content[0].text);return JSON.parse(response.content[0].text);};
  const expectCode=async(name,args,expected)=>{const response=await call(name,args);assert.equal(response.isError,true);assert.equal(JSON.parse(response.content[0].text).code,expected);};
  await expectCode('list_announcements',{},'WORKER_UNAVAILABLE');

  const news={Id:3,Title:'Schedule update',IsPublished:true,CreatedDate:'2000-01-03T00:00:00Z',Body:{Html:'<p>The workshop moved to Friday.</p><script>private script</script>'}};
  const assignment={Id:4,Name:'Weekly reflection',DueDate:'2099-01-09T00:00:00Z',Availability:{StartDate:'2000-01-01T00:00:00Z',EndDate:'2099-01-10T00:00:00Z'},CustomInstructions:{Html:'<p>Write a short reflection.</p>'},SubmissionFeedback:'private feedback',GradeItemId:42,Attachments:[{FileId:5,FileName:'Guide.docx',Size:2048},{FileId:6,FileName:'Data.csv',Size:64}],LinkAttachments:[{LinkName:'Course reading',Href:'https://example.org/reading'},{LinkName:'Discard this',Href:'javascript:alert(1)'}]};
  const locked={...assignment,Id:7,Name:'Later assignment',Availability:{StartDate:'2099-01-01T00:00:00Z',StartDateAvailabilityType:0}};
  const bytes=officeFixture('docx','The file asks for 400 words.');
  const requested=[];let codeStatus=200,sessionSignedIn=true,empty=false,blockNews=false,noticeStart,noticeAbort;
  const fetcher=async(url,options={})=>{
    if(url.startsWith(COMPANION_URL)) return fetch(url.replace(COMPANION_URL,companion.url),{...options,headers:{...options.headers,Origin:origin}});
    const parsed=new URL(url);
    assert.equal(parsed.origin,'https://brightspace.nyu.edu');assert.equal(options.credentials,'include');
    requested.push(parsed.pathname);
    const json=value=>Response.json(value);
    if(parsed.pathname==='/d2l/le/manageCourses/api/mysemesters') {
      return sessionSignedIn?json([{OrgUnitId:5,Name:'Fall semester'}]):new Response(null,{status:403});
    }
    assert.equal(options.redirect,'manual');
    switch(parsed.pathname) {
      case '/d2l/api/le/1.82/200/news/':
        if(blockNews) return new Promise((resolve,reject)=>{noticeStart();options.signal.addEventListener('abort',()=>{noticeAbort();reject(options.signal.reason);},{once:true});});
        if(codeStatus!==200) return new Response(null,{status:codeStatus});
        return json(empty?[]:[news,{...news,Id:2,Title:'Older news',CreatedDate:'2000-01-01T00:00:00Z'},{...news,Id:8,IsPublished:false},{...news,Id:9,StartDate:'2099-01-01T00:00:00Z'},{...news,Id:10,IsHidden:true},{...news,Id:11,EndDate:'2000-01-04T00:00:00Z'}]);
      case '/d2l/api/le/1.82/200/news/3': return json(news);
      case '/d2l/api/le/1.82/200/news/8': return json({...news,Id:8,IsPublished:false});
      case '/d2l/api/le/1.82/200/dropbox/folders/': return json([assignment,locked,{...assignment,Id:8,IsHidden:true}]);
      case '/d2l/api/le/1.82/200/dropbox/folders/4': return json(assignment);
      case '/d2l/api/le/1.82/200/dropbox/folders/7': return json(locked);
      case '/d2l/api/le/1.82/200/dropbox/folders/4/attachments/5': return new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}});
      default: assert.fail(`Unexpected Brightspace request ${parsed.pathname}`);
    }
  };
  let ready;
  const connected=new Promise(resolve=>{ready=resolve;});
  const Socket=class extends WebSocket {constructor(url){super(url,{origin});}};
  worker=createRetrievalWorker({url:companion.url.replace('http:','ws:')+'/v1/worker',Socket,courseActivity:true,fetcher,getSettings:async()=>({enabled:true,token}),report:({state})=>{if(state==='connected') ready();}});
  await worker.connect();await connected;

  const recent=await result('list_announcements',{limit:1});
  assert.deepEqual(recent.announcements.map(item=>item.announcementId),['3']);assert.equal(recent.total,2);assert.equal(recent.nextOffset,1);
  assert.equal((await result('list_announcements',{offset:1})).announcements[0].title,'Older news');
  assert.equal((await result('get_announcement',{announcementId:'3'})).announcement.text,'The workshop moved to Friday.');
  await expectCode('get_announcement',{announcementId:'8'},'ACCESS_DENIED');
  codeStatus=401;await expectCode('list_announcements',{},'NEEDS_LOGIN');
  codeStatus=403;await expectCode('list_announcements',{},'ACCESS_DENIED');
  sessionSignedIn=false;await expectCode('list_announcements',{},'NEEDS_LOGIN');sessionSignedIn=true;
  codeStatus=200;empty=true;assert.deepEqual((await result('list_announcements')).announcements,[]);

  const assignments=(await result('list_assignments')).assignments;
  assert.deepEqual(assignments.map(item=>item.assignmentId),['7','4']);
  const details=(await result('get_assignment',{assignmentId:'4'})).assignment;
  assert.equal(details.dueAt,assignment.DueDate);assert.equal(details.closesAt,assignment.Availability.EndDate);
  assert.equal(details.text,'Write a short reflection.');assert.deepEqual(details.attachments.map(file=>file.cacheSupported),[true,false]);
  assert.deepEqual(details.links,[{title:'Course reading',url:'https://example.org/reading'}]);
  assert.equal(JSON.stringify(details).includes('private feedback'),false);
  const restricted=(await result('get_assignment',{assignmentId:'7'})).assignment;
  assert.equal(restricted.detailsAvailable,false);assert.equal(restricted.text,undefined);assert.deepEqual(restricted.attachments,[]);
  await expectCode('request_assignment_attachment',{assignmentId:'7',fileId:'5'},'ACCESS_DENIED');
  await expectCode('request_assignment_attachment',{assignmentId:'4',fileId:'6'},'UNSUPPORTED_FILE');
  assert.equal((await companion.cache.stats()).files,0);
  assert.equal(requested.some(url=>url.includes('/attachments/')),false);

  const savedResponse=await call('request_assignment_attachment',{assignmentId:'4',fileId:'5'});
  assert.notEqual(savedResponse.isError,true,savedResponse.content[0].text);
  const saved=JSON.parse(savedResponse.content[0].text);
  assert.equal(saved.source,'brightspace');assert.equal(saved.document.encryptedAtRest,true);
  assert.equal(saved.document.sourceUrl,details.sourceUrl);
  assert.equal(savedResponse.content[1].type,'resource_link');
  const read=await client.callTool({name:'read_document_text',arguments:{id:saved.documentId}});
  assert.equal(JSON.parse(read.content[0].text).text,'The file asks for 400 words.');
  assert.equal((await result('request_assignment_attachment',{assignmentId:'4',fileId:'5'})).source,'cache');
  assert.equal(requested.filter(url=>url.includes('/attachments/')).length,1);
  assert.equal((await readdir(directory)).includes(`${saved.documentId}.docx`),false);
  assert.equal((await readFile(path.join(directory,`${saved.documentId}.docx.vault`))).includes(bytes),false);
  const catalogBytes=await readFile(path.join(directory,'catalog.json.vault'));
  assert.ok(catalogBytes.length>0);
  assert.equal((await call('list_assignments',{courseId:'999'})).isError,true);
  assert.equal((await call('list_assignments',{url:'https://example.org/'})).isError,true);
  assert.equal((await call('list_assignments',{provider:'demo'})).isError,true);

  const started=new Promise(resolve=>{noticeStart=resolve;});
  const aborted=new Promise(resolve=>{noticeAbort=resolve;});
  const controller=new AbortController();blockNews=true;
  const pending=assert.rejects(call('list_announcements',{}, {signal:controller.signal}));
  await started;
  await expectCode('list_assignments',{},'BUSY');
  controller.abort();await pending;await aborted;
  assert.equal((await result('list_assignments')).assignments.length,2,'cancellation releases the worker');
});
