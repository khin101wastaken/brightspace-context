import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {officeFixture} from './office-fixture.js';
import {extractDocumentText,documentTextPage} from '../companion/document-text.js';

const replace=(bytes,name,xml)=>Buffer.from(zipSync({...unzipSync(bytes),[name]:strToU8(xml)}));
test('Word reading preserves table text and entities, omits deleted text, and paginates beyond host output budgets',()=>{
  const xml='<w:document><w:body><w:p><w:r><w:t>Course &amp; grading</w:t></w:r><w:del><w:r><w:t>Old incorrect grade</w:t></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A-</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>90–94%</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>'+('More course text. '.repeat(4000))+'</w:t></w:r></w:p><w:p><w:r><w:t>Last paragraph 😀</w:t></w:r></w:p></w:body></w:document>';
  const bytes=replace(officeFixture('docx'),'word/document.xml',xml),full=extractDocumentText(bytes,'docx');
  assert.match(full.text,/Course & grading/);assert.match(full.text,/A-\s+90–94%/);assert.doesNotMatch(full.text,/incorrect/);assert.ok(full.text.length>60000);
  let offset=0,joined='';do {const page=documentTextPage(bytes,'docx',{offset,limit:8000});assert.ok(page.text.length<=8000);assert.equal(page.totalCharacters,full.text.length);assert.equal(page.hasMore,page.nextOffset!==null);joined+=page.text;offset=page.nextOffset;}while(offset!==null);
  assert.equal(joined,full.text);assert.match(joined,/Last paragraph 😀$/);
  assert.throws(()=>documentTextPage(bytes,'docx',{offset:full.text.length+1}),/Offset/);
  assert.throws(()=>documentTextPage(bytes,'docx',{limit:16001}),/limit/);
  assert.throws(()=>documentTextPage(bytes,'docx',{offset:-1}),/offset/);
});
test('slide text follows presentation relationships rather than part filename order',()=>{
  const files=unzipSync(officeFixture('pptx','First'));
  files['ppt/slides/slide2.xml']=strToU8(strFromU8(files['ppt/slides/slide1.xml']).replace('First','Second'));
  files['ppt/presentation.xml']=strToU8(strFromU8(files['ppt/presentation.xml']).replace('<p:sldId id="256" r:id="rId1"/>','<p:sldId id="257" r:id="rId2"/><p:sldId id="256" r:id="rId1"/>'));
  files['ppt/_rels/presentation.xml.rels']=strToU8(strFromU8(files['ppt/_rels/presentation.xml.rels']).replace('</Relationships>','<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>'));
  const text=extractDocumentText(zipSync(files),'pptx').text;
  assert.equal(text,'[Slide 1]\nSecond\n\n[Slide 2]\nFirst');
});
test('reading rejects unsupported formats, XML declarations, excessive expansion and malformed slide references',()=>{
  assert.throws(()=>extractDocumentText(Buffer.from('%PDF-1.4'),'pdf'),/PDF-capable/);
  assert.throws(()=>extractDocumentText(replace(officeFixture('docx'),'word/document.xml','<!DOCTYPE x><w:t>hidden</w:t>'),'docx'),/declarations/);
  assert.throws(()=>extractDocumentText(replace(officeFixture('docx'),'word/document.xml','x'.repeat(4*1024*1024+1)),'docx'),/safe reading limit/);
  assert.throws(()=>extractDocumentText(replace(officeFixture('pptx'),'ppt/_rels/presentation.xml.rels','<Relationships/>'),'pptx'),/missing/);
});
