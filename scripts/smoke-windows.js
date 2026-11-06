import {readFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {officeFixture} from '../tests/office-fixture.js';
import {documentFormat} from '../extension/document-formats.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function verifyPayload(payload) {
  const manifest=JSON.parse(await readFile(path.join(payload,'PAYLOAD.json'),'utf8'));
  const seen=new Set();
  for(const entry of manifest.files) {
    const filename=path.resolve(payload,entry.path);
    if(!filename.startsWith(path.resolve(payload)+path.sep) || seen.has(entry.path)) throw new Error('Invalid payload inventory path.');
    seen.add(entry.path);
    const bytes=await readFile(filename);
    assert.equal(bytes.length,entry.bytes,`Payload size changed: ${entry.path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,`Payload changed: ${entry.path}`);
  }
  for(const required of ['runtime/node.exe','runtime/LICENSE','app/companion/start.js','app/mcp/start.js','app/extension/manifest.json','SETUP.html','Start Companion.cmd']) assert.ok(seen.has(required),`Missing ${required}`);
  const guide=await readFile(path.join(payload,'SETUP.html'),'utf8'),script=guide.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,'setup guide script exists');
  assert.ok(guide.includes(`'sha256-${createHash('sha256').update(script).digest('base64')}'`),'setup guide CSP permits exactly its inline script');
  return manifest;
}
export async function startCompanion(node,payload,directory,port=0,launcher=false,verbose=false) {
  const command=launcher?process.env.ComSpec || 'cmd.exe':node;
  const args=launcher?['/d','/s','/c',`""${path.join(payload,'Start Companion.cmd')}"${verbose?' --debug':''}"`]:[path.join(payload,'app/companion/start.js')];
  const child=spawn(command,args,{windowsHide:true,windowsVerbatimArguments:launcher,env:{...process.env,BRIGHTSPACE_CACHE_DIR:directory,BRIGHTSPACE_COMPANION_PORT:String(port)},stdio:['ignore','pipe','pipe']});
  const exited=once(child,'exit');
  const stop=async()=>{
    if(child.exitCode===null && child.signalCode===null) {
      // This PID is the command process created above; its only child is our
      // isolated packaged companion. Never enumerate or terminate other Node apps.
      if(launcher) execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      else child.kill();
    }
    await exited;
  };
  let stdout='',stderr='';
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  try {
    const ready=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Packaged companion did not start within 20 seconds.')),20000);
      const fail=()=>{clearTimeout(timeout);reject(new Error(`Packaged companion exited before startup: ${stderr.slice(0,500)}`));};
      child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',fail);
      child.stdout.on('data',chunk=>{
        stdout+=chunk;
        const url=stdout.match(/running at (http:\/\/127\.0\.0\.1:\d+)/)?.[1],code=stdout.match(/Pairing code: ([a-f0-9]{10})/)?.[1];
        if(url && code) {clearTimeout(timeout);child.off('exit',fail);resolve({url,code});}
      });
    });
    return {...ready,child,stop,waitForOutput:async pattern=>{
      if(pattern.test(stdout)) return;
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{child.stdout.off('data',check);reject(new Error('Expected packaged diagnostic output was missing.'));},5000);
        const check=()=>{if(pattern.test(stdout)) {clearTimeout(timeout);child.stdout.off('data',check);resolve();}};
        child.stdout.on('data',check);check();
      });
    }};
  } catch(error) {await stop().catch(()=>{});throw error;}
}
export async function smokeWindows(payload) {
  if(process.platform!=='win32') throw new Error('The packaged Windows runtime must be smoke-tested on Windows.');
  const manifest=await verifyPayload(payload),node=path.join(payload,'runtime/node.exe');
  assert.equal(execFileSync(node,['--version'],{encoding:'utf8',windowsHide:true}).trim(),`v${manifest.nodeVersion}`);
  const testRoot=path.join(root,'.cache/installer-tests');await mkdir(testRoot,{recursive:true});
  const directory=await mkdtemp(path.join(testRoot,'fresh cache '));
  let companion,client;
  try {
    companion=await startCompanion(node,payload,directory,0,true);
    const origin=`chrome-extension://${'a'.repeat(32)}`;
    const request=async(endpoint,body,method='POST',token)=>{
      const response=await fetch(companion.url+endpoint,{method,headers:{Origin:origin,...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})});
      assert.equal(response.status,200);return response.json();
    };
    const {token}=await request('/v1/pair',{code:companion.code});
    const bytes=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
    const lookup=await request('/v1/cache/lookup',{courseId:'100',topicId:'1',title:'Installer smoke fixture',courseTitle:'Synthetic test course',modulePath:['Week 1'],sourceUrl:'https://brightspace.nyu.edu/content/enforced/100/smoke.pdf',lastModifiedAt:null},'POST',token);
    await request(`/v1/cache/uploads/${lookup.uploadId}`,bytes,'PUT',token);
    const office=[];
    for(const [index,extension] of ['pptx','docx'].entries()) {
      const original=officeFixture(extension),sourceUrl=`https://brightspace.nyu.edu/content/enforced/100/smoke.${extension}`;
      const lookup=await request('/v1/cache/lookup',{courseId:'100',topicId:String(index+3),title:`Installer ${extension} fixture`,courseTitle:'Synthetic test course',modulePath:['Week 1'],sourceUrl,lastModifiedAt:null},'POST',token);
      const saved=await request(`/v1/cache/uploads/${lookup.uploadId}`,original,'PUT',token);
      office.push({id:saved.id,original,format:documentFormat(sourceUrl)});
    }
    const moduleNotes='Reading: Synthetic reference.\nFilm: Installer fixture film';
    await request('/v1/catalog/semesters',{semesterId:'200',title:'Synthetic semester',updatedAt:new Date().toISOString(),courses:[{courseId:'100',title:'Synthetic test course',status:'complete',coverage:'full-toc',lastScannedAt:new Date().toISOString(),entries:[{key:'module:2',id:'2',kind:'module',title:'Week 1',parentKey:null,description:moduleNotes,descriptionStatus:'synced',descriptionTruncated:true}]}]},'PUT',token);
    const connect=async()=>{
      const transport=new StdioClientTransport({command:node,args:[path.join(payload,'app/mcp/start.js')],env:{BRIGHTSPACE_CACHE_DIR:directory,BRIGHTSPACE_COMPANION_PORT:new URL(companion.url).port},stderr:'pipe'});
      client=new Client({name:'installer-smoke',version:'1.0.0'});await client.connect(transport);
    };
    await connect();
    const tools=await client.listTools();assert.ok(tools.tools.some(tool=>tool.name==='request_catalog_sync'));assert.ok(tools.tools.some(tool=>tool.name==='get_catalog_sync'));
    assert.deepEqual(tools.tools.find(tool=>tool.name==='search_catalog').inputSchema.properties.provider.enum,['nyu','demo']);
    const demoPage=await fetch(companion.url+'/demo/');assert.equal(demoPage.status,200);assert.match(await demoPage.text(),/LOCAL DEMO/);
    for(const filename of ['field-guide.pdf','fair-experiment.pptx','observation-worksheet.docx']) {
      const response=await fetch(companion.url+'/demo/content/'+filename);assert.equal(response.status,200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(path.join(payload,'app/companion/demo-assets',filename)));
    }
    const demoDiscovery=JSON.parse((await client.callTool({name:'request_catalog_sync',arguments:{provider:'demo',waitSeconds:0}})).content[0].text);
    assert.equal(demoDiscovery.state,'queued');assert.equal(demoDiscovery.provider,'demo');
    const demoClaim=await request('/demo-api/v1/requests/claim',{capabilities:['catalog-sync']},'POST',token);
    assert.equal(demoClaim.job.requestId,demoDiscovery.requestId);
    await request('/demo-api/v1/requests/finish',{requestId:demoDiscovery.requestId,leaseId:demoClaim.job.leaseId,result:{semesters:[{semesterId:'990001',title:'Demo 2026 Fall'}]}},'POST',token);
    const demoCatalog=JSON.parse((await client.callTool({name:'list_courses',arguments:{provider:'demo'}})).content[0].text);assert.equal(demoCatalog.semesters[0].semesterId,'990001');
    const discovery=JSON.parse((await client.callTool({name:'request_catalog_sync',arguments:{waitSeconds:0}})).content[0].text);
    assert.equal(discovery.state,'queued');
    const claimed=await request('/v1/requests/claim',{capabilities:['catalog-sync']},'POST',token);
    assert.equal(claimed.job.requestId,discovery.requestId);
    await request('/v1/requests/finish',{requestId:discovery.requestId,leaseId:claimed.job.leaseId,result:{semesters:[{semesterId:'200',title:'Synthetic semester'}]}},'POST',token);
    const checkDiscovery=async()=>{
      const result=JSON.parse((await client.callTool({name:'get_catalog_sync',arguments:{requestId:discovery.requestId,waitSeconds:0}})).content[0].text);
      assert.equal(result.state,'ready');assert.equal(result.semesters[0].semesterId,'200');
    };
    await checkDiscovery();
    const checkNotes=async()=>{
      const result=JSON.parse((await client.callTool({name:'search_catalog',arguments:{query:'fixture film'}})).content[0].text);
      assert.equal(result.total,1);assert.equal(result.entries[0].description,moduleNotes);assert.equal(result.entries[0].descriptionStatus,'synced');assert.equal(result.entries[0].descriptionTruncated,true);
    };
    await checkNotes();
    const checkOffice=async()=>{
      for(const entry of office) {
        const result=await client.callTool({name:'get_cached_document',arguments:{id:entry.id}}),metadata=JSON.parse(result.content[0].text);
        assert.equal(metadata.localPath,undefined);assert.equal(metadata.encryptedAtRest,true);assert.equal(result.content[1].mimeType,entry.format.mimeType);
        const resource=await client.readResource({uri:metadata.uri});assert.equal(resource.contents[0].mimeType,entry.format.mimeType);assert.deepEqual(Buffer.from(resource.contents[0].blob,'base64'),entry.original);
      }
    };
    await checkOffice();
    const listed=JSON.parse((await client.callTool({name:'list_cached_documents',arguments:{}})).content[0].text);
    assert.equal(listed.total,3);
    const pdf=listed.documents.find(d=>d.extension==='pdf');
    const prepared=await client.callTool({name:'get_cached_document',arguments:{id:pdf.id}});
    const resource=await client.readResource({uri:prepared.content[1].uri});
    assert.deepEqual(Buffer.from(resource.contents[0].blob,'base64'),bytes);
    await client.close();client=null;
    await companion.stop();companion=null;
    companion=await startCompanion(node,payload,directory,0,true,true);
    const status=await request('/v1/status',undefined,'GET',token);
    assert.equal(status.files,3,'pairing and all verified formats survive companion restart');
    await connect();
    await checkDiscovery();
    await checkNotes();
    await checkOffice();
    const repeated=JSON.parse((await client.callTool({name:'list_cached_documents',arguments:{}})).content[0].text);
    assert.equal(repeated.documents[0].id,listed.documents[0].id);
    await companion.waitForOutput(/DEBUG http\.request/);
    console.log(`PASS: payload inventory, bundled Node ${manifest.nodeVersion}, normal/verbose launchers with spaces, fresh-cache startup, pairing, PDF/PPTX/DOCX bytes and module notes through packaged MCP, isolated demo website/documents/discovery queue, catalog-sync tools, restart persistence.`);
  } finally {
    await client?.close();await companion?.stop();
    const resolved=path.resolve(directory);
    if(!resolved.startsWith(path.resolve(testRoot)+path.sep) || !path.basename(resolved).startsWith('fresh cache ')) throw new Error('Unsafe smoke-test cleanup path.');
    await rm(resolved,{recursive:true,force:true});
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  (async()=>{
    const payload=process.argv[2] || JSON.parse(await readFile(path.join(root,'dist/latest-build.json'),'utf8')).payload;
    await smokeWindows(path.resolve(payload));
  })().catch(error=>{console.error(error.message);process.exitCode=1;});
}
