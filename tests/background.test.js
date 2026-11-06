import {storageHarness} from './storage-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';

test('background download validates the selected catalog file and tracks native completion',async t=>{
  let onMessage,onChanged,downloadCalls=0;
  let cancelNext=false;
  const session={}, source='https://brightspace.nyu.edu/content/enforced/100/notes.pdf';
  const catalog={courseId:'100',title:'Course',entries:[{key:'document:2',id:'2',contentType:'file',sourceUrl:source,title:'Notes'}]};
  const item={id:7,state:'in_progress',url:source,mime:'application/pdf'};
  globalThis.chrome={
    runtime:{id:'test',getURL:path=>`chrome-extension://test/${path}`,onMessage:{addListener:listener=>onMessage=listener}},
    downloads:{
      download:async options=>{
        downloadCalls++;assert.equal(options.url,source);
        assert.equal(options.filename,options.saveAs?'notes [2].pdf':'Brightspace/Course/notes [2].pdf');
        if(cancelNext) {cancelNext=false;throw new Error('USER_CANCELED');}
        return 7;
      },
      search:async()=>[item],onChanged:{addListener:listener=>onChanged=listener},
    },
    storage:{local:{get:async()=>({'course:100':catalog})},session:{
      get:async key=>key?{[key]:session[key]}:{...session},set:async values=>Object.assign(session,values),remove:async keys=>(Array.isArray(keys)?keys:[keys]).forEach(key=>delete session[key]),
    }},
  };
  chrome.storage=storageHarness({'course:100':catalog},{session}).storage;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.method,'HEAD');assert.equal(options.credentials,'include');assert.equal(url,source);
    return new Response('',{headers:{'content-type':'application/pdf'}});
  });
  try {
    await import(`../extension/background.js?test=${Date.now()}`);
    const send=message=>new Promise(resolve=>onMessage(message,{id:'test',url:'chrome-extension://test/popup.html'},resolve));
    const result=await send({type:'download-file',courseId:'100',key:'document:2'});
    assert.equal(result.ok,true);assert.equal(downloadCalls,1);assert.equal(session['download:7'].state,'in_progress');
    item.state='complete';onChanged({id:7});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(session['download:7'].state,'complete');
    item.state='interrupted';item.error='FILE_FAILED';onChanged({id:7});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(session['download:7'].error,'FILE_FAILED');
    assert.equal(session['download:7'].nativeState,'interrupted');
    t.mock.method(globalThis,'fetch',async()=>new Response('Login',{headers:{'content-type':'text/html'}}));
    assert.equal((await send({type:'download-file',courseId:'100',key:'document:2'})).ok,false);
    assert.equal(session['attempt:100:document:2'].phase,'session-check');
    assert.match(session['attempt:100:document:2'].message,/web page instead/);
    t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('Failed to fetch');});
    const failed=await send({type:'download-file',courseId:'100',key:'document:2'});
    assert.match(failed.error,/no file download was started/i);
    assert.equal(downloadCalls,1);
    assert.equal((await send({type:'download-file',courseId:'100',key:'document:missing'})).ok,false);
    assert.equal(downloadCalls,1);
    t.mock.method(globalThis,'fetch',async()=>new Response('',{headers:{'content-type':'application/pdf'}}));
    cancelNext=true;
    const canceled=await send({type:'download-file',courseId:'100',key:'document:2'});
    assert.equal(canceled.ok,false);assert.equal(downloadCalls,2);
    assert.equal(session['attempt:100:document:2'].state,'canceled');
    assert.equal(session['attempt:100:document:2'].httpStatus,200);
    assert.equal(session['attempt:100:document:2'].mime,'application/pdf');
    assert.equal(session['attempt:100:document:2'].saveMode,'course-folders');
    delete item.error; item.state='in_progress';
    const manual=await send({type:'download-file',courseId:'100',key:'document:2',saveAs:true});
    assert.equal(manual.ok,true);assert.equal(downloadCalls,3);
    assert.equal(session['download:7'].saveMode,'choose-location');
    assert.equal(session['download:7'].filename,'notes [2].pdf');
    const resourceResult=await new Promise(resolve=>onMessage({type:'download-file',courseId:'100',key:'document:2'},{id:'test',url:'chrome-extension://test/resources.html?sourceTabId=42'},resolve));
    assert.equal(resourceResult.ok,true);assert.equal(downloadCalls,4);
    const rejected=onMessage({type:'download-file',courseId:'100',key:'document:2'},{id:'test',url:'https://brightspace.nyu.edu/d2l/home'},()=>assert.fail('A webpage cannot issue extension UI requests'));
    assert.equal(rejected,undefined);assert.equal(downloadCalls,4);
  } finally {delete globalThis.chrome;}
});

test('Resources downloads preserve hashes and arbitrary file types, and HTML completion stays successful',async t=>{
  let listener,changed,nextId=0;
  const entries=[['Lec#12.pdf','application/pdf'],['Slides.key','application/octet-stream'],['program.c','text/plain'],['Vectors.html','text/html']].map(([name,mime],i)=>({key:`document:${i+1}`,id:String(i+1),contentType:'file',title:name,sourceUrl:`https://brightspace.nyu.edu/content/enforced/100/${name}`,mime}));
  const catalog={courseId:'100',title:'Course',entries},session={},items=new Map(),calls=[];
  globalThis.chrome={
    runtime:{id:'test',getURL:name=>`chrome-extension://test/${name}`,onMessage:{addListener:fn=>listener=fn}},
    storage:{local:{get:async()=>({'course:100':catalog})},session:{get:async key=>key?{[key]:session[key]}:{...session},set:async values=>Object.assign(session,values),remove:async keys=>(Array.isArray(keys)?keys:[keys]).forEach(key=>delete session[key])}},
    downloads:{onChanged:{addListener:fn=>changed=fn},download:async options=>{
      const id=++nextId,entry=entries[id-1];calls.push(options);
      assert.equal(new URL(options.url).hash,'');assert.equal(decodeURIComponent(new URL(options.url).pathname.split('/').at(-1)),entry.title);
      items.set(id,{id,url:options.url,finalUrl:options.url,state:'in_progress',mime:entry.mime});return id;
    },search:async({id})=>[items.get(id)]},
  };
  chrome.storage=storageHarness({'course:100':catalog},{session}).storage;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const entry=entries.find(e=>e.title===decodeURIComponent(new URL(url).pathname.split('/').at(-1)));
    assert.ok(entry);assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');
    return new Response(options.method==='HEAD'?null:'<title>Vectors</title><h1>Vector addition</h1>',{headers:{'content-type':entry.mime}});
  });
  try {
    await import(`../extension/background.js?formats-test=${Date.now()}`);
    for(const entry of entries) {
      const result=await new Promise(resolve=>listener({type:'download-file',courseId:'100',key:entry.key},{id:'test',url:'chrome-extension://test/resources.html'},resolve));
      assert.equal(result.ok,true,result.error);assert.ok(calls.at(-1).filename.endsWith(` [${entry.id}].${entry.title.split('.').at(-1)}`));
      items.get(result.id).state='complete';changed({id:result.id});await new Promise(resolve=>setImmediate(resolve));
      assert.equal(session[`download:${result.id}`].state,'complete');
    }
    assert.equal(calls.length,4);
  } finally {delete globalThis.chrome;}
});

test('semester background sync uses the Resources selection without website tabs, deduplicates scans, and retries companion transfer',async t=>{
  let listener,discoveries=0,offline=true;
  const outlines=[],local={companionPairing:{token:'test-token'}};
  globalThis.chrome={
    runtime:{id:'test',getURL:path=>`chrome-extension://test/${path}`,onMessage:{addListener:fn=>listener=fn}},
    tabs:{get:async()=>{throw new Error('Semester sync must not inspect website tabs');}},
    downloads:{onChanged:{addListener:()=>{}}},
    storage:{local:{get:async key=>key?{[key]:local[key]}:{...local},set:async values=>Object.assign(local,values)}},
    scripting:{executeScript:async()=>{throw new Error('Semester sync must not inject UI scripts');}},
  };
  const store=storageHarness(local,{paired:true});chrome.storage=store.storage;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.startsWith('https://brightspace.nyu.edu/')) {
      assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');
      let result;
      if(url.endsWith('/mysemesters')) {discoveries++;result=[{OrgUnitId:'5',Name:'2026 Fall'}];}
      else if(url.includes('/mycourses?')) {assert.equal(new URL(url).searchParams.get('parentOrgUnitIds'),'5');result={Courses:[{OrgUnitId:'100',Name:'Networks',TypeId:3},{OrgUnitId:'200',Name:'Happiness',TypeId:3}],Bookmark:null};}
      else {outlines.push(url.match(/\/1.82\/(\d+)\//)[1]);result={Modules:[]};}
      return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
    }
    assert.equal(url,'http://127.0.0.1:47653/v1/catalog/semesters');assert.equal(options.method,'PUT');
    if(offline) throw new Error('Companion unavailable');
    const snapshot=JSON.parse(options.body);assert.equal(snapshot.courses.length,2);assert.equal(snapshot.courses[1].coverage,'full-toc');
    return new Response(JSON.stringify({courses:2,complete:2}),{headers:{'content-type':'application/json'}});
  });
  try {
    await import(`../extension/background.js?semester-test=${Date.now()}`);
    const send=message=>new Promise(resolve=>listener(message,{id:'test',url:'chrome-extension://test/popup.html'},resolve));
    const [a,b,different]=await Promise.all([send({type:'sync-semester',semesterId:'5'}),send({type:'sync-semester',semesterId:'5'}),send({type:'sync-semester',semesterId:'6'})]);
    assert.equal(different.ok,false);assert.match(different.error,/Another semester/);
    assert.equal(a.ok,true,a.error);assert.equal(b.ok,true,b.error);assert.equal(discoveries,1);assert.deepEqual(outlines,['100','200']);
    const saved=await store.view.get(null);assert.equal(saved.semesterSync.state,'saved');assert.equal(saved['semester:5'].courses[0].entries,undefined);assert.deepEqual(saved['course:200'].entries,[]);assert.equal(local['course:200'].encryptedStorage,1);
    offline=false;assert.equal((await send({type:'send-catalog'})).ok,true);assert.deepEqual(outlines,['100','200']);
  } finally {delete globalThis.chrome;}
});

test('disconnect forgets only browser pairing and resets retrieval status while preserving course data and preferences',async t=>{
  let listener;const removed=[];
  const local={companionPairing:{token:'test-token'},automaticRetrieval:false,'course:100':{courseId:'100',title:'Networks'},'semester:5':{semesterId:'5'},uiShowManualCache:true};
  globalThis.chrome={runtime:{id:'test',getURL:name=>`chrome-extension://test/${name}`,onMessage:{addListener:fn=>listener=fn}},downloads:{onChanged:{addListener:()=>{}}},storage:{local:{get:async key=>({[key]:local[key]}),set:async values=>Object.assign(local,values),remove:async key=>{removed.push(key);delete local[key];}}}};
  const store=storageHarness(local,{paired:true});chrome.storage=store.storage;
  t.mock.method(globalThis,'fetch',async()=>assert.fail('Disconnect must not fetch or change companion data'));
  try {
    await import(`../extension/background.js?disconnect-test=${Date.now()}`);
    const result=await new Promise(resolve=>listener({type:'disconnect-companion'},{id:'test',url:'chrome-extension://test/popup.html'},resolve));
    assert.equal(result.ok,true);assert.equal(result.connected,false);assert.equal(local.companionPairing,undefined);
    assert.equal((await store.view.get('retrievalStatus')).retrievalStatus.state,'unpaired');assert.equal(local.automaticRetrieval,false);assert.equal(local['course:100'].title,'Networks');assert.equal(local['semester:5'].semesterId,'5');assert.equal(local.uiShowManualCache,true);
  } finally {delete globalThis.chrome;}
});
