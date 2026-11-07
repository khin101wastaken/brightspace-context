import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentLinks} from '../companion/document-links.js';

test('download capabilities expire, bind to a pairing session and evict the oldest link at their memory limit',()=>{
  let time=1000;const links=createDocumentLinks({now:()=>time,ttlMs:500,maxLinks:2}),client={};
  const args={provider:'demo',entry:{id:'a'.repeat(64),sha256:'b'.repeat(64)},client};
  const first=links.create(args),token=first.path.split('/').at(-1);
  assert.match(token,/^[A-Za-z0-9_-]{32}$/);assert.equal(links.get(token,{}),null);assert.equal(links.get(token,client).provider,'demo');
  links.create(args);links.create(args);assert.equal(links.get(token,client),null);
  const last=links.create(args);time+=500;assert.equal(links.get(last.path.split('/').at(-1),client),null);
  const fresh=links.create(args);links.clear();assert.equal(links.get(fresh.path.split('/').at(-1),client),null);
});
