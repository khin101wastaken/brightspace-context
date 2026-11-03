import test from 'node:test';
import assert from 'node:assert/strict';
import {listBrightspaceSemesters,listSemesterCourses,readCourseOutline} from '../extension/brightspace-client.js';
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});

test('semester discovery uses the cookie-authenticated widget endpoint without a source tab',async()=>{
  const result=await listBrightspaceSemesters(async(url,options)=>{
    assert.equal(url,'https://brightspace.nyu.edu/d2l/le/manageCourses/api/mysemesters');assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');
    return json([{OrgUnitId:'420697',Name:'2026 Fall'}]);
  });
  assert.deepEqual(result,[{semesterId:'420697',title:'2026 Fall'}]);
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
