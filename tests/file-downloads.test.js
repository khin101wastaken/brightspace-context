import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadableFile,resourceTypeLabel,downloadPlan,validateFileResponse,preflightFile,downloadState} from '../extension/file-downloads.js';

const file={key:'document:2',id:'2',kind:'document',contentType:'file',sourceUrl:'https://brightspace.nyu.edu/content/enforced/100/Original%20slides.pptx',title:'Lecture',parentKey:'module:1'};
const catalog={courseId:'100',title:'Networks',entries:[{key:'module:1',title:'Week 1',parentKey:null},file]};
test('downloads accept every first-party file format, excluding assignments, links and locked files',()=>{
  assert.equal(downloadableFile(file).name,'Original slides.pptx');
  for(const name of ['notes.key','notebook.ipynb','membrane.html','source.c','model.ggb','template.dotx','video.m4v','video.mp4','script.exe','data.custom-format','Makefile']) {
    const entry={...file,sourceUrl:`https://brightspace.nyu.edu/content/enforced/100/${name}`};
    assert.equal(downloadableFile(entry).name,name);
  }
  for(const entry of [
    {...file,contentType:'link'}, {...file,contentType:'assignment'}, {...file,locked:true},
    {...file,sourceUrl:'https://drive.google.com/file/one.pdf'},
    {...file,sourceUrl:'https://brightspace.nyu.edu.evil.example/content/one.pdf'},
    {...file,sourceUrl:'https://brightspace.nyu.edu/d2l/login.pdf'},
    {...file,sourceUrl:'https://brightspace.nyu.edu/content/'},
    {...file,sourceUrl:'https://brightspace.nyu.edu/content/invalid%2Fname.pdf'},
    {...file,sourceUrl:'https://brightspace.nyu.edu/content/invalid%0Aname.pdf'},
    {...file,sourceUrl:'https://other@brightspace.nyu.edu/content/one.pdf'},
  ]) assert.equal(downloadableFile(entry),null);
});
test('resource badges use the stored file suffix, including locked files, with an honest unknown fallback',()=>{
  assert.equal(resourceTypeLabel(file),'PPTX');
  assert.equal(resourceTypeLabel({...file,locked:true}),'PPTX');
  assert.equal(resourceTypeLabel({...file,sourceUrl:'https://brightspace.nyu.edu/content/NOTES.PDF?download=1'}),'PDF');
  assert.equal(resourceTypeLabel({...file,sourceUrl:'https://brightspace.nyu.edu/content/Makefile'}),'Unknown');
  assert.equal(resourceTypeLabel({...file,contentType:'link'}),'link');
  assert.equal(resourceTypeLabel({...file,contentType:'assignment'}),'assignment');
});
test('literal hashes in Brightspace file metadata retain the complete filename and fetch path',()=>{
  const entry={...file,sourceUrl:'https://brightspace.nyu.edu/content/enforced/100/Lec#12.pdf'};
  const parsed=downloadableFile(entry);
  assert.equal(parsed.url,'https://brightspace.nyu.edu/content/enforced/100/Lec%2312.pdf');
  assert.equal(parsed.name,'Lec#12.pdf');assert.equal(resourceTypeLabel(entry),'PDF');
  const plan=downloadPlan({...catalog,entries:[...catalog.entries.filter(e=>e.key!==entry.key),entry]},entry.key);
  assert.equal(plan.url,parsed.url);assert.match(plan.filename,/Lec#12 \[2\]\.pdf$/);
  assert.deepEqual(downloadableFile({...entry,sourceUrl:parsed.url}),parsed,'already-encoded filenames must not be double encoded');
});
test('download path preserves hierarchy and original file extension, and disambiguates topic IDs',()=>{
  assert.equal(downloadPlan(catalog,file.key).filename,'Brightspace/Networks/Week 1/Original slides [2].pptx');
  const plan=downloadPlan({...catalog,title:'../CON',entries:[{key:'module:1',title:'A/B:C',parentKey:null},file]},file.key);
  assert.equal(plan.filename,'Brightspace/_CON/A_B_C/Original slides [2].pptx');
  const extensionless=downloadPlan({...catalog,entries:[{...file,sourceUrl:'https://brightspace.nyu.edu/content/Makefile'}]},file.key);
  assert.equal(extensionless.filename,'Brightspace/Networks/Makefile [2]');
});
test('missing entries and hierarchy cycles cannot trigger download plans',()=>{
  assert.throws(()=>downloadPlan(catalog,'document:999'),/not an accessible/);
  assert.throws(()=>downloadPlan({...catalog,entries:[{key:'module:1',title:'Cycle',parentKey:'module:1'},file]},file.key),/hierarchy/);
});
test('preflight falls back from unsupported HEAD without reading a full binary file',async()=>{
  for(const status of [405,501]) {
    const methods=[];let canceled=false;
    const result=await preflightFile({url:file.sourceUrl},async(url,options)=>{
      assert.equal(url,file.sourceUrl);assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');methods.push(options.method);
      if(options.method==='HEAD') return new Response(null,{status});
      assert.equal(options.headers.Range,'bytes=0-8191');
      return new Response(new ReadableStream({cancel(){canceled=true;}}),{status:206,headers:{'content-type':'application/vnd.ms-powerpoint'}});
    });
    assert.deepEqual(methods,['HEAD','GET']);assert.equal(canceled,true);assert.equal(result.httpStatus,206);
  }
});
test('HTML course files download, while sign-in pages and HTML masquerading as PDFs are rejected',async()=>{
  const plan={url:'https://brightspace.nyu.edu/content/enforced/100/vectors.html'};
  let calls=0,canceled=false;
  const result=await preflightFile(plan,async(url,options)=>{
    calls++;
    if(options.method==='HEAD') return new Response(null,{headers:{'content-type':'text/html'}});
    return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('<!doctype html><title>Vectors</title><h1>Lecture 12</h1>'+' '.repeat(10000)));},cancel(){canceled=true;}}),{headers:{'content-type':'text/html'}});
  });
  assert.equal(result.allowHtml,true);assert.equal(calls,2);assert.equal(canceled,true,'a server ignoring Range must not cause the entire file to be fetched');
  for(const html of ['<title>Login - NYU Brightspace</title>','<title>NYU Sign In</title>','<form action="/d2l/login" method="post">','']) {
    await assert.rejects(preflightFile(plan,async(url,options)=>new Response(options.method==='HEAD'?null:html,{headers:{'content-type':'text/html'}})),/sign-in page/);
  }
  await assert.rejects(preflightFile({url:'https://brightspace.nyu.edu/content/notes.pdf'},async()=>new Response(null,{headers:{'content-type':'text/html'}})),/web page instead/);
});
test('preflight does not start a fallback GET for access failures or follow sign-in redirects',async()=>{
  for(const status of [401,403,404,429]) {
    let calls=0;
    await assert.rejects(preflightFile({url:file.sourceUrl},async()=>{calls++;return new Response(null,{status});}));
    assert.equal(calls,1);
  }
  await assert.rejects(preflightFile({url:file.sourceUrl},async()=>{throw new TypeError('Failed to fetch');}),/No file download was started/);
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
  assert.equal(downloadState({...item,finalUrl:'https://brightspace.nyu.edu/d2l/login'}).state,'failed');
  const html={...item,url:'https://brightspace.nyu.edu/content/enforced/100/vectors.html',mime:'text/html'};
  assert.equal(downloadState(html).state,'failed');
  assert.equal(downloadState(html,{allowHtml:true,sourceUrl:html.url}).state,'complete');
  assert.equal(downloadState({...html,finalUrl:'https://brightspace.nyu.edu/content/error.html'},{allowHtml:true,sourceUrl:html.url}).state,'failed');
  assert.equal(downloadState({...item,state:'interrupted'}).state,'failed');
  assert.equal(downloadState({...item,state:'interrupted',error:'USER_CANCELED'}).state,'canceled');
});
