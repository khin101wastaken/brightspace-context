import test from 'node:test';
import assert from 'node:assert/strict';
import {listBrightspaceSemesters,listSemesterCourses,readCourseOutline} from '../extension/brightspace-client.js';
import {flattenOutline} from '../extension/course-api.js';
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});

test('semester discovery uses the cookie-authenticated widget endpoint without a source tab',async()=>{
  const result=await listBrightspaceSemesters(async(url,options)=>{
    assert.equal(url,'https://brightspace.nyu.edu/d2l/le/manageCourses/api/mysemesters');assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');
    return json([{OrgUnitId:'420697',Name:'2026 Fall'}]);
  });
  assert.deepEqual(result,[{semesterId:'420697',title:'2026 Fall'}]);
});

const module=(id,modules=[],extra={})=>({ModuleId:id,Title:`Module ${id}`,Modules:modules,Topics:[],...extra});
test('NYU descriptions already embedded in ToC, including explicit empty notes, need no extra requests',async()=>{
  const calls=[];
  const result=await readCourseOutline('100',async url=>{
    calls.push(url);
    if(url.endsWith('/toc')) return json({Modules:[module(1,[module(2,[],{Description:null}),module(3)],{Description:{Text:'Reading: Dahl RE.\nFilm: Me, Earl and the Dying Girl'}})]});
    assert.ok(url.endsWith('/modules/3'));return json({Id:3,Type:0,Description:{Text:'Nested reading'}});
  });
  assert.equal(calls.length,2);
  const entries=flattenOutline(result,'100');assert.equal(entries[0].descriptionStatus,'synced');assert.match(entries[0].description,/Earl/);
  assert.equal(entries[1].descriptionStatus,'synced');assert.equal(entries[1].description,'');assert.equal(entries[2].description,'Nested reading');
});
test('sync reads every visible nested module landing description without navigating or fetching documents',async()=>{
  const calls=[];
  const result=await readCourseOutline('100',async(url,options)=>{
    assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');calls.push(new URL(url).pathname);
    if(url.endsWith('/toc')) return json({Modules:[module(1,[module(2),module(3,[],{IsHidden:true}),module(4,[],{IsLocked:true})])]});
    const id=url.split('/').at(-1);return json({Id:Number(id),Type:0,Description:id==='1'?null:{Html:'<p>Film: Me, Earl and the Dying Girl</p>',Text:''}});
  });
  assert.deepEqual(calls,['/d2l/api/le/1.82/100/content/toc','/d2l/api/le/1.82/100/content/modules/1','/d2l/api/le/1.82/100/content/modules/2']);
  const entries=flattenOutline(result,'100');assert.equal(entries[0].descriptionStatus,'synced');assert.equal(entries[0].description,'');
  assert.match(entries[1].description,/Me, Earl/);assert.equal(entries[2].descriptionStatus,'unavailable');
});

test('unavailable descriptions are explicit; login and throttle responses stop module requests',async()=>{
  const result=await readCourseOutline('100',async url=>url.endsWith('/toc')?json({Modules:[module(1),module(2)]}):new Response('',{status:403}));
  assert.ok(flattenOutline(result,'100').every(e=>e.descriptionStatus==='unavailable'));
  for(const response of [()=>new Response('',{status:401}),()=>new Response('',{status:429}),()=>new Response('<html>Login</html>',{headers:{'Content-Type':'text/html'}})]) {
    let calls=0;
    await assert.rejects(readCourseOutline('100',async url=>{calls++;return url.endsWith('/toc')?json({Modules:[module(1),module(2)]}):response();}),/Sign into|limiting requests|sign-in page/);
    assert.equal(calls,2,'stop before requesting the next module');
  }
  await assert.rejects(readCourseOutline('100',async url=>url.endsWith('/toc')?json({Modules:[module(1)]}):json({Id:999,Type:0,Description:null})),/unsupported module/);
});
test('course discovery scopes every page to the explicitly selected semester and follows opaque bookmarks',async()=>{
  const calls=[];
  const result=await listSemesterCourses('420697',async(url)=>{
    const query=new URL(url).searchParams;calls.push(query);
    assert.equal(query.get('parentOrgUnitIds'),'420697');assert.equal(query.get('promotePins'),'false');assert.equal(query.get('autoPinCourses'),'false');
    return calls.length===1?json({Courses:[{OrgUnitId:'100',Name:'First course',TypeId:3}],Bookmark:'opaque+/='}):json({Courses:[{OrgUnitId:'200',Name:'Second course',TypeId:3}],Bookmark:null});
  });
  assert.deepEqual(result.map(c=>c.courseId),['100','200']);assert.equal(calls[1].get('bookmark'),'opaque+/=');
});
test('malformed, truncated and repeating course pages never become a complete semester snapshot',async()=>{
  await assert.rejects(listSemesterCourses('5',async()=>json({Courses:[]})),/unsupported/);
  await assert.rejects(listSemesterCourses('5',async()=>json({Courses:[],Bookmark:'same'})),/did not advance/);
  await assert.rejects(listSemesterCourses('../other',async()=>assert.fail('Invalid input must not fetch')),/Choose a semester/);
});
test('direct outline requests and discovery preserve sign-in and throttling errors',async()=>{
  assert.deepEqual(await readCourseOutline('100',async url=>{assert.equal(url,'https://brightspace.nyu.edu/d2l/api/le/1.82/100/content/toc');return json({Modules:[]});}),{Modules:[]});
  await assert.rejects(listBrightspaceSemesters(async()=>new Response('Sign in',{headers:{'Content-Type':'text/html'}})),/sign-in page/);
  await assert.rejects(listSemesterCourses('5',async()=>new Response('',{status:429})),/limiting requests/);
  await assert.rejects(readCourseOutline('100',async()=>new Response('',{status:403})),error=>/denied access to this course/.test(error.message) && !/sign.in/i.test(error.message));
});
