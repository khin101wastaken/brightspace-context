import {openVault} from '../companion/vault.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8} from 'fflate';
import {mkdir,mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {documentFormat,validateDocument} from '../extension/document-formats.js';
import {openCache} from '../companion/cache.js';
import {officeFixture} from './office-fixture.js';

const url=extension=>`https://brightspace.nyu.edu/content/enforced/100/lecture.${extension}`;
test('Office validation requires a matching package, not a renamed ZIP or login response',()=>{
  for(const extension of ['pptx','docx']) {
    const bytes=officeFixture(extension),format=documentFormat(url(extension));
    assert.doesNotThrow(()=>validateDocument(bytes,format));
    assert.throws(()=>validateDocument(officeFixture(extension==='pptx'?'docx':'pptx'),format),/not a valid/);
    assert.throws(()=>validateDocument(zipSync({'pretend.txt':strToU8('Not Office')}),format),/not a valid/);
    assert.throws(()=>validateDocument(Buffer.from('<html>Login</html>'),format),/not a valid/);
    assert.throws(()=>validateDocument(bytes.subarray(0,50),format),/not a valid/);
    assert.throws(()=>validateDocument(zipSync({...unzipSync(bytes),'vbaProject.bin':strToU8('macro')}),format),/not a valid/);
    assert.throws(()=>validateDocument(zipSync({...unzipSync(bytes),'[Content_Types].xml':new Uint8Array(1024*1024+1)}),format),/not a valid/);
  }
  for(const source of ['https://example.com/lecture.pptx','https://brightspace.nyu.edu/d2l/lecture.pptx',url('pptm'),url('exe')]) assert.equal(documentFormat(source),null);
});

test('existing PDF caches survive the format upgrade; replacing a topic format removes the old blob',async t=>{
  const root=path.resolve('.cache/tests');await mkdir(root,{recursive:true});const directory=await mkdtemp(path.join(root,'brightspace-office-test-'));
  t.after(async()=>{if(!directory.startsWith(root+path.sep) || !path.basename(directory).startsWith('brightspace-office-test-')) throw new Error('Unsafe cleanup path.');await rm(directory,{recursive:true,force:true});});
  const meta={courseId:'100',topicId:'1',title:'Lecture',courseTitle:'Course',modulePath:['Week 1'],sourceUrl:url('pdf'),lastModifiedAt:'2026-11-01T00:00:00Z'},pdf=Buffer.from('%PDF-1.4\nLegacy PDF');
  let cache=await openCache(directory);const saved=await cache.put(meta,pdf);
  const vault=await openVault(directory),old=await vault.readJson('index.json');delete old.entries[saved.id].extension;delete old.entries[saved.id].mimeType;
  await vault.writeJson('index.json',old);
  cache=await openCache(directory);assert.equal((await cache.lookup(meta)).hit,true);assert.deepEqual((await cache.read(saved.id)).bytes,pdf);
  const pptx=officeFixture('pptx'),replacement=await cache.put({...meta,sourceUrl:url('pptx')},pptx);assert.equal(replacement.id,saved.id);
  assert.equal((await cache.stats()).files,1);assert.deepEqual(await vault.read(`${saved.id}.pptx`),pptx);assert.equal((await readdir(directory)).includes(`${saved.id}.pdf.vault`),false);
  cache=await openCache(directory);assert.deepEqual((await cache.read(saved.id)).bytes,pptx);
  await assert.rejects(cache.put({...meta,sourceUrl:url('pptx')},officeFixture('docx')),/not a valid/);assert.deepEqual((await cache.read(saved.id)).bytes,pptx);
});
