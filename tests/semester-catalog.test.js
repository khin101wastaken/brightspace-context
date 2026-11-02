import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {openCatalog} from '../companion/catalog.js';

const course=(entries=[])=>({courseId:'200',title:'Happiness',status:'complete',coverage:'full-toc',lastScannedAt:new Date().toISOString(),entries});
const snapshot=courses=>({semesterId:'420697',title:'2026 Fall',updatedAt:new Date().toISOString(),courses});
const entries=[{key:'module:1',id:'1',kind:'module',title:'Week 1',parentKey:null},{key:'document:2',id:'2',kind:'document',title:'Reading',parentKey:'module:1',contentType:'file',sourceUrl:'https://brightspace.nyu.edu/content/enforced/200/reading.pdf'}];
test('catalog persists hierarchy, preserves previous outlines on failure, and replaces removed entries on a successful refresh',async t=>{
  const root=path.resolve('.cache/tests');await mkdir(root,{recursive:true});const directory=await mkdtemp(path.join(root,'brightspace-catalog-test-'));
  t.after(async()=>{if(!directory.startsWith(root+path.sep) || !path.basename(directory).startsWith('brightspace-catalog-test-')) throw new Error('Unsafe cleanup path.');await rm(directory,{recursive:true,force:true});});
  let catalog=await openCatalog(directory);
  await catalog.put(snapshot([course(entries)]));
  await catalog.put(snapshot([{courseId:'200',title:'Happiness',status:'failed',error:'Session expired'}]));
  catalog=await openCatalog(directory);
  let saved=(await catalog.read()).semesters[0].courses[0];
  assert.equal(saved.status,'failed');assert.equal(saved.stale,true);assert.equal(saved.entries[1].parentKey,'module:1');
  await assert.rejects(catalog.put(snapshot([course([{...entries[1],parentKey:'module:999'}])])),/relationship/);
  assert.equal((await catalog.read()).semesters[0].courses[0].entries.length,2);
  await catalog.put(snapshot([course()]));
  saved=(await catalog.read()).semesters[0].courses[0];assert.equal(saved.entries.length,0);assert.equal(saved.status,'complete');assert.equal(saved.stale,undefined);
});
