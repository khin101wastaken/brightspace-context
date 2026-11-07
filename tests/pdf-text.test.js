import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {pdfTextPage} from '../companion/pdf-text.js';
import {pdfFixture} from './pdf-fixture.js';

test('PDF reader preserves compressed-stream text and pagination, and reports pages without a text layer',async()=>{
  const bytes=pdfFixture(['Course syllabus: grading cutoffs (Fall).','','Final page: A 95-100%; A- 90-94%.']);
  const full=await pdfTextPage(bytes,{limit:16000});
  assert.equal(full.pages,3);assert.deepEqual(full.emptyTextPages,[2]);assert.match(full.text,/\[Page 3\]\nFinal page: A 95-100%; A- 90-94%\./);assert.equal(full.nextOffset,null);assert.equal(full.temporaryFileCreated,false);
  let offset=0,text='';do{const page=await pdfTextPage(bytes,{offset,limit:40});text+=page.text;offset=page.nextOffset;}while(offset!==null);
  assert.equal(text,full.text);
  await assert.rejects(pdfTextPage(bytes,{offset:full.totalCharacters+1}),/Offset exceeds/);
  assert.throws(()=>pdfTextPage(bytes,{offset:-1}),/offset/);
  assert.throws(()=>pdfTextPage(bytes,{limit:16001}),/limit/);
});
test('PDF parser rejects damaged inputs and excessive page counts without labelling every error cache truncation',async()=>{
  await assert.rejects(pdfTextPage(Buffer.from('%PDF-1.7\nnot a document')),/verified original could not be read/i);
  await assert.rejects(pdfTextPage(pdfFixture(Array(501).fill('page'))),/500-page/);
});
test('a stalled PDF worker is terminated on deadline, and parallel work is bounded',async()=>{
  let terminated=0;
  class StalledWorker extends EventEmitter {terminate(){terminated++;return Promise.resolve(0);}}
  const first=pdfTextPage(new Uint8Array(),{}, {timeoutMs:20,WorkerClass:StalledWorker});
  const second=pdfTextPage(new Uint8Array(),{}, {timeoutMs:20,WorkerClass:StalledWorker});
  assert.throws(()=>pdfTextPage(new Uint8Array()),/busy/);
  const results=await Promise.allSettled([first,second]);assert.ok(results.every(r=>r.status==='rejected' && /budget/.test(r.reason.message)));assert.equal(terminated,2);
});
