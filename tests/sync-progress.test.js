import test from 'node:test';
import assert from 'node:assert/strict';
import {syncProgressModel,courseArc,createSyncStatus} from '../extension/sync-progress.js';
import {scanSemester} from '../extension/semester.js';

test('sync ring counts successes separately from failures, skipped courses and current work',()=>{
  const model=syncProgressModel({state:'running',courses:['complete','failed','skipped','scanning','pending'].map(state=>({title:'Course',state}))});
  assert.equal(model.total,5);assert.equal(model.done,1);assert.equal(model.failed,1);assert.equal(model.skipped,1);
  assert.equal(model.label,'1 of 5 courses synced, 1 failed, 1 not scanned');assert.match(model.detail,/2 remaining/);
  assert.equal(syncProgressModel({state:'failed',courses:[{state:'scanning'}]}).courses[0].state,'pending');
  assert.equal(syncProgressModel({state:'running'}).total,0);
});

test('course arcs support one through 200 segments with finite bounded coordinates',()=>{
  for(const total of [1,2,5,8,24,200]) {
    const paths=Array.from({length:total},(_,index)=>courseArc(index,total));assert.equal(new Set(paths).size,total);
    assert.ok(paths.every(path=>!path.includes('NaN') && !path.includes('Infinity')));
    assert.ok(paths.every(path=>path.startsWith('M ') && path.includes(' A 25 25')));
  }
  assert.throws(()=>courseArc(0,0));assert.throws(()=>courseArc(200,200));assert.throws(()=>courseArc(0,201));
});

test('scanner emits isolated per-course states after each result, including the final course and login-skipped courses',async()=>{
  const updates=[],calls=[],semester={semesterId:'5',title:'Fall',courses:['1','2','3'].map(courseId=>({courseId,title:`Course ${courseId}`}))};
  const result=await scanSemester(semester,{onProgress:async progress=>updates.push(progress),saveCourse:async()=>{},readOutline:async id=>{
    calls.push(id);if(id==='2')throw Object.assign(new Error('Sign into Brightspace.'),{code:'NEEDS_LOGIN'});return {Modules:[]};
  }});
  assert.deepEqual(calls,['1','2']);assert.deepEqual(updates[0].courses.map(course=>course.state),['scanning','pending','pending']);
  assert.equal(updates[1].completed,1);assert.equal(updates[1].courses[0].state,'complete');
  assert.equal(updates.at(-1).completed,3);assert.deepEqual(updates.at(-1).courses.map(course=>course.state),['complete','failed','skipped']);
  assert.equal(result.courses[2].status,'failed');
  assert.equal(updates[0].courses[0].state,'scanning','later progress must not mutate an earlier snapshot');
});

class Element {
  constructor(doc){this.ownerDocument=doc;this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.classList={add(){},toggle(){}};}
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
  setAttribute(key,value){this.attributes[key]=value;}
  removeAttribute(key){delete this.attributes[key];}
  get firstChild(){return this.children[0];}
}
test('completed sync notices dismiss without hiding a newer scan, while failures remain visible',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const doc={createElement:()=>new Element(doc),createElementNS:()=>new Element(doc)},element=new Element(doc),view=createSyncStatus(element);
  const complete={semesterId:'5',startedAt:1,state:'complete',message:'Synced',courses:[{title:'A',state:'complete'}]};
  view.render(complete,{restore:true});assert.equal(element.hidden,true,'do not resurrect an old success on startup');
  view.render(complete);assert.equal(element.children[0].attributes['aria-valuenow'],'1');t.mock.timers.tick(2000);
  view.render({...complete,state:'running',startedAt:2,courses:[{title:'A',state:'scanning'}]});t.mock.timers.tick(5000);assert.equal(element.hidden,false);
  view.render({...complete,state:'failed',message:'One failed',courses:[{title:'A',state:'failed'}]});t.mock.timers.tick(5000);assert.equal(element.hidden,false);
  assert.equal(element.children[0].attributes['aria-valuenow'],'0');assert.match(element.children[0].attributes['aria-valuetext'],/1 failed/);
  view.render(complete);t.mock.timers.tick(4500);assert.equal(element.hidden,true);
});
