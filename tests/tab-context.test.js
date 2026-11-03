import test from 'node:test';
import assert from 'node:assert/strict';
import {captureTarget,validateTarget,validateFrames} from '../extension/tab-context.js';

test('changing active tab after opening popup does not change its captured source',async()=>{
  const courses=[{id:1,url:'https://brightspace.nyu.edu/d2l/le/lessons/100'},{id:2,url:'https://brightspace.nyu.edu/d2l/le/lessons/200'}];
  let active=0,queries=0;
  const tabs={query:async()=>{queries++;return [courses[active]];},get:async id=>courses.find(t=>t.id===id)};
  const target=await captureTarget(tabs); active=1;
  const result=await validateTarget(tabs,target);
  assert.equal(result.tab.id,1); assert.equal(result.identity.courseId,'100'); assert.equal(queries,1);
});
test('navigation to a different course or sign-in prevents saving against captured course',async()=>{
  const target={tabId:1,courseId:'100'};
  await assert.rejects(validateTarget({get:async()=>({url:'https://brightspace.nyu.edu/d2l/le/lessons/200'})},target),/source tab changed/i);
  await assert.rejects(validateTarget({get:async()=>({url:'https://login.microsoftonline.com/'})},target),/source tab changed/i);
});
test('results with another course are rejected and unrelated frames are excluded',()=>{
  assert.throws(()=>validateFrames([{result:{courseId:'200'}}],'100'),/changed during scanning/);
  assert.equal(validateFrames([{result:{courseId:null}},{result:{courseId:'100'}}],'100').length,1);
});

test('resources page resolves its explicit Brightspace source rather than the now-active extension tab',async()=>{
  const tabs={query:async()=>{throw new Error('Must not retarget the active extension page');},get:async id=>({id,url:'https://brightspace.nyu.edu/d2l/le/lessons/100',title:'Networks'})};
  const target=await captureTarget(tabs,{tabId:42,allowHome:true});
  assert.equal(target.tabId,42);assert.equal(target.courseId,'100');
  assert.equal((await validateTarget(tabs,target)).identity.courseId,'100');
  await assert.rejects(captureTarget(tabs,{tabId:0,allowHome:true}),/Invalid source/);
  await assert.rejects(captureTarget({get:async()=>({id:42,url:'https://example.com'})},{tabId:42,allowHome:true}),/NYU Brightspace/);
});
