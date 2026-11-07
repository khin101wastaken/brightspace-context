import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createCompanion} from '../companion/server.js';
import {flattenOutline} from '../extension/course-api.js';
import {readCourseOutline} from '../extension/brightspace-client.js';

test('desktop MCP process lists, resolves and serves an actual cached PDF without exposing pairing credentials',async t=>{
  const root=path.resolve('.cache/tests');await mkdir(root,{recursive:true});
  const directory=await mkdtemp(path.join(root,'brightspace-mcp-test-'));
  const companion=await createCompanion({directory,port:0,pairingCode:'123456789a'});
  const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('mcp/start.js')],env:{BRIGHTSPACE_CACHE_DIR:directory,BRIGHTSPACE_COMPANION_PORT:String(companion.server.address().port)},stderr:'pipe'});
  const client=new Client({name:'integration-test',version:'1.0.0'});
  t.after(async()=>{
    await client.close();await companion.close();
    if(!path.resolve(directory).startsWith(root+path.sep) || !path.basename(directory).startsWith('brightspace-mcp-test-')) throw new Error('Unsafe cleanup path.');
    await rm(directory,{recursive:true,force:true});
  });
  const origin=`chrome-extension://${'a'.repeat(32)}`;
  const pairing=await fetch(`${companion.url}/v1/pair`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code:'123456789a'})}).then(r=>r.json());
  const bytes=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
  const entry=await companion.cache.put({courseId:'100',topicId:'1',title:'Course syllabus',courseTitle:'Networks',modulePath:['Week 1'],sourceUrl:'https://brightspace.nyu.edu/content/enforced/100/syllabus.pdf',lastModifiedAt:null},bytes);
  const headers={Origin:origin,Authorization:`Bearer ${pairing.token}`,'Content-Type':'application/json'};
  const catalog={semesterId:'420697',title:'2026 Fall',updatedAt:new Date().toISOString(),courses:[{courseId:'200',title:'Science of Happiness',status:'complete',coverage:'full-toc',lastScannedAt:new Date().toISOString(),entries:[
    {key:'module:10',id:'10',kind:'module',title:'Week 1',parentKey:null},
    {key:'module:20',id:'20',kind:'module',title:'Readings',parentKey:'module:10'},
    {key:'document:30',id:'30',kind:'document',title:'Gratitude lecture',parentKey:'module:20',contentType:'file',sourceUrl:'https://brightspace.nyu.edu/content/enforced/200/gratitude.pdf'},
  ]}]};
  const moduleNotes='Reading: Dahl RE. Adolescent brain development.\nFilm: Me, Earl and the Dying Girl';
  catalog.courses[0].entries=flattenOutline(await readCourseOutline('200',async url=>new Response(JSON.stringify(url.endsWith('/toc')?{Modules:[{ModuleId:10,Title:'Week 1',Modules:[{ModuleId:20,Title:'Readings',Modules:[],Topics:[{TopicId:30,Title:'Gratitude lecture',TypeIdentifier:'File',Url:'/content/enforced/200/gratitude.pdf'}]}],Topics:[]}]}:{Id:Number(url.split('/').at(-1)),Type:0,Description:url.endsWith('/20')?{Text:moduleNotes}:null}),{headers:{'Content-Type':'application/json'}})),'200');
  const rejected=await fetch(`${companion.url}/v1/catalog/semesters`,{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(catalog)});assert.equal(rejected.status,401);
  const synced=await fetch(`${companion.url}/v1/catalog/semesters`,{method:'PUT',headers,body:JSON.stringify(catalog)});assert.equal(synced.status,200);
  await client.connect(transport);
  const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),['request_catalog_sync','get_catalog_sync','list_cached_documents','get_cached_document','export_document','read_document_text','create_document_link','list_courses','search_catalog','request_document','get_document_request']);
  const courses=JSON.parse((await client.callTool({name:'list_courses',arguments:{query:'Happiness'}})).content[0].text);
  assert.equal(courses.courses[0].courseId,'200');assert.equal(courses.semesters[0].title,'2026 Fall');
  const uncached=await client.callTool({name:'search_catalog',arguments:{query:'gratitude'}});
  const found=JSON.parse(uncached.content[0].text);assert.equal(found.total,1);assert.equal(found.entries[0].cachedDocumentId,null);assert.equal(found.entries[0].cacheSupported,true);assert.deepEqual(found.entries[0].modulePath,['Week 1','Readings']);
  const outline=JSON.parse((await client.callTool({name:'search_catalog',arguments:{courseId:'200',limit:2}})).content[0].text);assert.equal(outline.total,3);assert.equal(outline.nextOffset,2);assert.equal(outline.entries[1].parentKey,'module:10');
  const notes=JSON.parse((await client.callTool({name:'search_catalog',arguments:{query:'Earl Dahl'}})).content[0].text);
  assert.equal(notes.total,1);assert.equal(notes.entries[0].description,moduleNotes);assert.equal(notes.entries[0].descriptionStatus,'synced');assert.equal(notes.entries[0].descriptionTruncated,false);
  assert.equal(notes.entries[0].url,'https://brightspace.nyu.edu/d2l/le/lessons/200/units/20');assert.equal(notes.entries[0].cacheSupported,false);
  assert.equal((await companion.cache.stats()).files,1,'catalog sync must not download or cache PDFs');
  assert.equal(JSON.stringify([courses,found]).includes(pairing.token),false);
  const listed=await client.callTool({name:'list_cached_documents',arguments:{query:'syllabus'}});
  const list=JSON.parse(listed.content[0].text);assert.equal(list.total,1);assert.equal(list.documents[0].id,entry.id);
  const prepared=await client.callTool({name:'get_cached_document',arguments:{id:entry.id}});
  assert.equal(prepared.isError,undefined);
  const file=JSON.parse(prepared.content[0].text);
  assert.equal(file.localPath,undefined);assert.equal(file.encryptedAtRest,true);
  assert.equal(prepared.content[1].type,'resource_link');
  const resource=await client.readResource({uri:prepared.content[1].uri});
  assert.deepEqual(Buffer.from(resource.contents[0].blob,'base64'),bytes);
  const resources=await client.listResources();assert.equal(resources.resources[0].mimeType,'application/pdf');
  assert.equal(JSON.stringify([listed,prepared,resources]).includes(pairing.token),false);
  const invalid=await client.callTool({name:'get_cached_document',arguments:{id:'../../pairing.json'}});
  assert.equal(invalid.isError,true);
  const unknown=await client.callTool({name:'list_cached_documents',arguments:{filename:'pairing.json'}});
  assert.equal(unknown.isError,true);
});
