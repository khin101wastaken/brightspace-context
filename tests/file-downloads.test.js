import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadableFile,downloadPlan,validateFileResponse,downloadState} from '../extension/file-downloads.js';

const file={key:'document:2',id:'2',kind:'document',contentType:'file',sourceUrl:'https://brightspace.nyu.edu/content/enforced/100/Original%20slides.pptx',title:'Lecture',parentKey:'module:1'};
const catalog={courseId:'100',title:'Networks',entries:[{key:'module:1',title:'Week 1',parentKey:null},file]};
test('eligibility requires supported first-party file, excluding assignments, links and locked files',()=>{
  assert.equal(downloadableFile(file).name,'Original slides.pptx');
  for(const entry of [
    {...file,contentType:'link'}, {...file,contentType:'assignment'}, {...file,locked:true},
    {...file,sourceUrl:'https://drive.google.com/file/one.pdf'},
    {...file,sourceUrl:'https://brightspace.nyu.edu.evil.example/content/one.pdf'},
    {...file,sourceUrl:'https://brightspace.nyu.edu/d2l/login.pdf'},
    {...file,sourceUrl:'https://brightspace.nyu.edu/content/script.exe'},
  ]) assert.equal(downloadableFile(entry),null);
});
test('download path preserves hierarchy and original file extension, and disambiguates topic IDs',()=>{
  assert.equal(downloadPlan(catalog,file.key).filename,'Brightspace/Networks/Week 1/Original slides [2].pptx');
  const plan=downloadPlan({...catalog,title:'../CON',entries:[{key:'module:1',title:'A/B:C',parentKey:null},file]},file.key);
  assert.equal(plan.filename,'Brightspace/_CON/A_B_C/Original slides [2].pptx');
});
test('missing entries and hierarchy cycles cannot trigger download plans',()=>{
  assert.throws(()=>downloadPlan(catalog,'document:999'),/not a supported/);
  assert.throws(()=>downloadPlan({...catalog,entries:[{key:'module:1',title:'Cycle',parentKey:'module:1'},file]},file.key),/hierarchy/);
});
test('preflight rejects login pages, redirects and access failures',()=>{
  for(const response of [new Response('',{status:401}),new Response('',{status:403}),new Response('',{status:404}),new Response('<html>login</html>',{headers:{'content-type':'text/html'}})]) {
    assert.throws(()=>validateFileResponse(response));
  }
  assert.doesNotThrow(()=>validateFileResponse(new Response('',{headers:{'content-type':'application/pdf'}})));
});
test('completion is reported only for successful non-HTML first-party downloads',()=>{
  const item={state:'complete',url:file.sourceUrl,mime:'application/pdf'};
  assert.equal(downloadState(item).state,'complete');
  assert.equal(downloadState({...item,mime:'text/html'}).state,'failed');
  assert.equal(downloadState({...item,finalUrl:'https://login.microsoftonline.com/'}).state,'failed');
  assert.equal(downloadState({...item,state:'interrupted'}).state,'failed');
  assert.equal(downloadState({...item,state:'interrupted',error:'USER_CANCELED'}).state,'canceled');
});
