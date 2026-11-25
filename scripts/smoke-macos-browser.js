import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

export async function smokeBrowser({node,server,app,scratch,env,code}) {
  const {chromium}=await import('playwright');
  const extension=path.join(app,'extension');
  const context=await chromium.launchPersistentContext(path.join(scratch,'Chromium profile'),{
    channel:'chromium',headless:true,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
  });
  const client=new Client({name:'macos-browser-smoke',version:'1'});
  try {
    const isExtension=worker=>worker.url().startsWith('chrome-extension://') && worker.url().endsWith('/background.js');
    const worker=context.serviceWorkers().find(isExtension) ?? await context.waitForEvent('serviceworker',{predicate:isExtension,timeout:15000});
    const popup=await context.newPage();
    await popup.goto(new URL('/popup.html',worker.url()).href);
    await popup.locator('#pair-code').fill(code,{timeout:10000});
    await popup.locator('#pair-button').click();
    await popup.getByText('Browser connected',{exact:true}).waitFor({timeout:15000});

    await client.connect(new StdioClientTransport({command:node,args:[server],env,stderr:'pipe'}));
    const call=async(name,args={})=>{
      const response=await client.callTool({name,arguments:{provider:'demo',...args}});
      assert.notEqual(response.isError,true,response.content[0].text);
      return JSON.parse(response.content[0].text);
    };
    const settled=async(name,result)=>{
      for(let attempt=0;attempt<15 && ['queued','fetching'].includes(result.state);attempt++) {
        result=await call(name,{requestId:result.requestId,waitSeconds:2});
        if(result.state==='queued' && !result.workerConnected) await new Promise(resolve=>setTimeout(resolve,500));
      }
      assert.equal(result.state,'ready',result.nextAction || result.error || 'The demo browser worker did not complete the request.');
      return result;
    };

    const discovery=await settled('get_catalog_sync',await call('request_catalog_sync',{waitSeconds:0}));
    const semester=discovery.semesters.find(item=>item.title==='Demo 2026 Fall');
    assert.ok(semester,'The extension must discover the demo semester.');
    await settled('get_catalog_sync',await call('request_catalog_sync',{semesterId:semester.semesterId,waitSeconds:0}));
    const {courses}=await call('list_courses',{semesterId:semester.semesterId});
    assert.equal(courses.length,2);
    const guide=(await call('search_catalog',{query:'urban garden field guide'})).entries.find(item=>item.kind==='document' && !item.locked && item.extension==='pdf');
    assert.ok(guide && guide.cacheSupported,'The synced demo catalog must contain a retrievable field guide.');
    assert.equal((await call('list_cached_documents')).total,0,'Sync should only save the catalog.');
    const ready=await settled('get_document_request',await call('request_document',{courseId:guide.courseId,key:guide.key,waitSeconds:0}));
    assert.equal(ready.source,'brightspace','The first retrieval should read from the demo LMS.');
    assert.equal(ready.document.encryptedAtRest,true);
    const original=await readFile(path.join(app,'companion','demo-assets','field-guide.pdf'));
    const {contents}=await client.readResource({uri:ready.document.uri});
    assert.deepEqual(Buffer.from(contents[0].blob,'base64'),original);
    const page=await call('read_document_text',{id:ready.document.id});
    assert.match(page.text,/Urban Garden/i);
    assert.equal((await call('request_document',{courseId:guide.courseId,key:guide.key,waitSeconds:0})).source,'cache');
    console.log('PASS: Chromium popup pairing, discovery and sync of two demo courses, uncached PDF retrieval, verified bytes and text, and a repeat cache hit.');
  } finally {
    await client.close();
    await context.close();
  }
}
