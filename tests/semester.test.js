import test from 'node:test';
import assert from 'node:assert/strict';
import {scanSemester,discoverSemester} from '../extension/semester.js';

const semester={semesterId:'420697',title:'2026 Fall',courses:[{courseId:'100',title:'Calculus'},{courseId:'200',title:'Happiness'},{courseId:'300',title:'Networks'}]};
const outline={Modules:[{ModuleId:1,Title:'Week 1',Modules:[{ModuleId:2,Title:'Readings',Modules:[],Topics:[{TopicId:3,Title:'Lecture',TypeIdentifier:'File',Url:'/content/lecture.pdf'}]}],Topics:[]}]};
test('semester scan requests each course once, preserves all nested modules, and retains successful courses after another fails',async()=>{
  const calls=[],saved=[];
  const result=await scanSemester(semester,{readOutline:async id=>{calls.push(id);if(id==='200') throw new Error('Course unavailable');return outline;},saveCourse:async course=>saved.push(course)});
  assert.deepEqual(calls,['100','200','300']);assert.deepEqual(saved.map(c=>c.courseId),['100','300']);
  assert.equal(result.courses[0].entries[2].parentKey,'module:2');
  assert.equal(result.courses[1].status,'failed');assert.equal(result.courses[2].status,'complete');
  assert.equal(result.semesterId,'420697');
});
test('session expiry and throttling stop further school requests while keeping completed results',async()=>{
  for(const error of ['Your Brightspace session expired. Sign in again.','Brightspace is limiting requests.']) {
    const calls=[];
    const result=await scanSemester(semester,{readOutline:async id=>{calls.push(id);if(id==='200') throw new Error(error);return outline;},saveCourse:async()=>{}});
    assert.deepEqual(calls,['100','200']);assert.equal(result.courses[2].status,'failed');assert.equal(result.courses[0].status,'complete');
  }
});
test('discovery scopes shadow-DOM cards to the selected semester and refuses a truncated course list',()=>{
  const tab={id:'BySemester420697',getAttribute:name=>({'aria-controls':'panel-BySemester420697',title:'2026 Fall'})[name]};
  const card={getAttribute:()=>'/d2l/home/200',querySelector:()=>({textContent:'Happiness'})};
  let count=1;
  const panel={id:'panel-BySemester420697',querySelectorAll:selector=>selector==='d2l-card[href]'?[card]:selector==='#viewAllCourses'?[{textContent:`View All Courses (${count})`}]:[]};
  const shadow={querySelectorAll:selector=>selector.startsWith('[role="tab"]')?[tab]:selector==='[role="tabpanel"]'?[panel]:[]};
  globalThis.location={origin:'https://brightspace.nyu.edu'};
  globalThis.document={querySelectorAll:selector=>selector==='*'?[{shadowRoot:shadow}]:[]};
  try {
    assert.deepEqual(discoverSemester(),{semesterId:'420697',title:'2026 Fall',courses:[{courseId:'200',title:'Happiness'}]});
    count=2;assert.throws(discoverSemester,/incomplete/);
  } finally {delete globalThis.location;delete globalThis.document;}
});
