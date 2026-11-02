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
    assert.match(failed.error,/no file download was started/);
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
  } finally {delete globalThis.chrome;}
});
