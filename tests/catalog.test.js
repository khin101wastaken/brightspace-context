import test from 'node:test';
import assert from 'node:assert/strict';
import {identifyUrl,mergeCatalog} from '../extension/catalog.js';
test('recognizes observed NYU routes and rejects other hosts',()=>{
  assert.deepEqual(identifyUrl('https://brightspace.nyu.edu/d2l/le/lessons/100/topics/200'),{courseId:'100',kind:'document',id:'200'});
  assert.equal(identifyUrl('https://brightspace.nyu.edu.evil.example/d2l/home/1'),null);
  assert.equal(identifyUrl('https://login.microsoftonline.com/'),null);
  assert.equal(identifyUrl('https://brightspace.nyu.edu/d2l/le/content/100/Home?itemIdentifier=D2L.LE.Content.ContentObject.ModuleCO-300').id,'300');
});
test('partial rescans update renamed entries without erasing unseen files or known parents',()=>{
  const previous={courseId:'1',entries:[{key:'document:2',title:'Old',parentKey:'module:3'},{key:'document:4',title:'Unseen'}]};
  const next=mergeCatalog(previous,{courseId:'1',entries:[{key:'document:2',title:'New',parentKey:null}]});
  assert.equal(next.entries.length,2); assert.equal(next.entries[0].title,'New'); assert.equal(next.entries[0].parentKey,'module:3'); assert.equal(next.coverage,'partial');
});
test('course catalogs never mix',()=>{
  const result=mergeCatalog({courseId:'1',entries:[{key:'document:2'}]},{courseId:'2',entries:[]});
  assert.equal(result.entries.length,0);
});
