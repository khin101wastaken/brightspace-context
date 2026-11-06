import {openVault} from '../companion/vault.js';
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {WebSocket} from 'ws';
import {verifyPayload,startCompanion} from './smoke-windows.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function run(command,args,env={}) {
  const result=spawnSync(command,args,{windowsHide:true,encoding:'utf8',env:{...process.env,...env},maxBuffer:8*1024*1024});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`${path.basename(command)} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
async function baselinePayload(newVersion) {
  const candidates=[];
  const base=path.join(root,'.cache/windows-installer');
  for(const name of await readdir(base)) {
    const payload=path.join(base,name,'payload');
    try {
      const manifest=JSON.parse(await readFile(path.join(payload,'PAYLOAD.json'),'utf8'));
      const compare=(a,b)=>a.split('.').reduce((sum,n,i)=>sum+(Number(n)-Number(b.split('.')[i]))*1000**(2-i),0);
      if(compare(manifest.version,newVersion)<0) candidates.push({payload,version:manifest.version,modified:(await stat(payload)).mtimeMs});
    } catch {}
  }
  candidates.sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true}) || b.modified-a.modified);
  if(!candidates.length) throw new Error('No previous staged version found. Pass its payload directory as the first argument.');
  return candidates[0].payload;
}

async function main() {
  if(process.platform!=='win32') throw new Error('Installer upgrade acceptance requires Windows.');
  const latest=JSON.parse(await readFile(path.join(root,'dist/latest-build.json'),'utf8'));
  const nextPayload=path.resolve(process.argv[3] || latest.payload),nextManifest=await verifyPayload(nextPayload);
  const oldPayload=path.resolve(process.argv[2] || await baselinePayload(nextManifest.version)),oldManifest=await verifyPayload(oldPayload);
  assert.notEqual(oldManifest.version,nextManifest.version);
  const testRoot=path.join(root,'.cache/upgrade-tests');await mkdir(testRoot,{recursive:true});
  const work=await mkdtemp(path.join(testRoot,'upgrade ')),install=path.join(work,'Application With Spaces'),cache=path.join(work,'user data','cache');
  const identity='BrightspaceContext.UpgradeTest.'+randomUUID(),group=identity;
  const compiler=process.env.BRIGHTSPACE_ISCC || path.join(root,'.cache/build-tools/inno/ISCC.exe');
  const template=path.join(root,'packaging/windows/installer.iss');
  const report={from:oldManifest.version,to:nextManifest.version,checks:[]};
  let companion,client,worker,uninstalled=false,passed=false;
  const request=async(endpoint,value,method='POST',headers)=>{
    const response=await fetch(companion.url+endpoint,{method,headers,body:value===undefined?undefined:Buffer.isBuffer(value)?value:JSON.stringify(value)});
    assert.equal(response.status,200,`HTTP ${endpoint}`);return response.json();
  };
  const connect=async()=>{
    client=new Client({name:'installed-upgrade-acceptance',version:'1.0.0'});
    await client.connect(new StdioClientTransport({command:path.join(install,'runtime/node.exe'),args:[path.join(install,'app/mcp/start.js')],env:{BRIGHTSPACE_CACHE_DIR:cache,BRIGHTSPACE_COMPANION_PORT:new URL(companion.url).port},stderr:'pipe'}));
  };
  const call=async(name,args)=>{
    const result=await client.callTool({name,arguments:args});if(result.isError) throw new Error(result.content[0].text);return result;
  };
  try {
    for(const [payload,manifest,legacy] of [[oldPayload,oldManifest,true],[nextPayload,nextManifest,false]]) {
      console.log(`Compiling isolated ${manifest.version} fixture…`);
      const output=path.join(work,manifest.version);await mkdir(output);
      // Even if previous-directory detection fails, the fallback stays inside
      // the test workspace and cannot overwrite the real installation.
      run(compiler,['/Q',`/DPayloadDir=${payload}`,`/DReleaseDir=${output}`,`/DAppVersion=${manifest.version}`,`/DAppIdentity=${identity}`,`/DAppGroupName=${group}`,`/DAppDefaultDir=${path.join(work,'Fallback Must Not Be Used')}`,'/DFastTestBuild',...(legacy?['/DLegacyUpgradeFixture']:[]),template]);
    }
    const installer=version=>path.join(work,version,`BrightspaceContext-${version}-windows-x64-setup.exe`);
    const flags=['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'];
    console.log('Installing previous version and seeding synthetic state…');
    run(installer(oldManifest.version),[...flags,`/DIR=${install}`,`/LOG=${path.join(work,'install-old.log')}`]);
    assert.equal((await verifyPayload(install)).version,oldManifest.version);
    report.checks.push('previous version installed into a custom directory containing spaces');
    companion=await startCompanion(path.join(install,'runtime/node.exe'),install,cache,0,true);
    const origin=`chrome-extension://${'b'.repeat(32)}`;
    const {token}=await request('/v1/pair',{code:companion.code},'POST',{Origin:origin});
    const headers={Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
    const meta={courseId:'100',topicId:'20',title:'Upgrade fixture',courseTitle:'Synthetic course',modulePath:['Week 1'],sourceUrl:'https://brightspace.nyu.edu/content/enforced/100/fixture.pdf',lastModifiedAt:'2026-01-01T00:00:00Z'};
    const bytes=Buffer.from('%PDF-1.4\nUPGRADE_FIXTURE_ONE\n%%EOF'),secondBytes=Buffer.from('%PDF-1.4\nUPGRADE_FIXTURE_TWO\n%%EOF');
    await request('/v1/catalog/semesters',{semesterId:'5',title:'Test semester',updatedAt:new Date().toISOString(),courses:[{courseId:'100',title:meta.courseTitle,status:'complete',coverage:'full-toc',lastScannedAt:new Date().toISOString(),entries:[{key:'module:10',id:'10',kind:'module',contentType:'module',title:'Week 1'},...[20,21].map(id=>({key:`document:${id}`,id:String(id),kind:'document',contentType:'file',title:`Fixture ${id}`,parentKey:'module:10',sourceUrl:id===20?meta.sourceUrl:'https://brightspace.nyu.edu/content/enforced/100/new.pdf',lastModifiedAt:meta.lastModifiedAt}))]}]},'PUT',headers);
    const lookup=await request('/v1/cache/lookup',meta,'POST',headers);
    await request('/v1/cache/uploads/'+lookup.uploadId,bytes,'PUT',headers);
    await connect();
    const original=JSON.parse((await call('request_document',{courseId:'100',key:'document:20'})).content[0].text);
    assert.equal(original.source,'cache');
    const queued=JSON.parse((await call('request_document',{courseId:'100',key:'document:21',waitSeconds:0})).content[0].text);assert.equal(queued.state,'queued');
    // Previous releases may already use protected storage. Compare the actual
    // persisted record without assuming every upgrade starts with plaintext.
    let pairingFile=path.join(cache,'pairing.json');
    try {await stat(pairingFile);}catch(error){if(error.code!=='ENOENT')throw error;pairingFile+='.vault';}
    const wasEncrypted=pairingFile.endsWith('.vault'),pairingHash=digest(await readFile(pairingFile));
    if(['0.9.0','0.9.1','0.9.2'].includes(oldManifest.version)) {
      const rejectedDemo=await fetch(companion.url+'/demo-api/v1/catalog/semesters',{method:'PUT',headers,body:JSON.stringify({provider:'demo',semesterId:'990001'})});
      assert.equal(rejectedDemo.status,404,'an old companion must reject the distinct demo path before interpreting its body');
      assert.equal(JSON.parse((await call('list_courses',{})).content[0].text).courses.length,1);
      report.checks.push('previous companion rejects the demo API path without altering its real catalog');
    }
    await client.close();client=null;await companion.stop();companion=null;
    // No /DIR on upgrade: the same isolated AppId must resolve its saved path.
    console.log('Upgrading without specifying the previous directory…');
    run(installer(nextManifest.version),[...flags,`/LOG=${path.join(work,'install-upgrade.log')}`]);
    assert.equal((await verifyPayload(install)).version,nextManifest.version);
    report.checks.push('upgrade reused the previous directory without /DIR and replaced every inventoried payload file');
    assert.equal(digest(await readFile(pairingFile)),pairingHash);
    companion=await startCompanion(path.join(install,'runtime/node.exe'),install,cache,0,true,true);
    const status=await request('/v1/status',undefined,'GET',headers);assert.equal(status.files,1);
    await connect();
    const retained=JSON.parse((await call('request_document',{courseId:'100',key:'document:20'})).content[0].text);
    assert.equal(retained.source,'cache');assert.equal(retained.document.fetchedAt,original.document.fetchedAt);
    const resource=await client.readResource({uri:retained.document.uri});assert.deepEqual(Buffer.from(resource.contents[0].blob,'base64'),bytes);
    assert.equal(JSON.parse((await call('list_courses',{})).content[0].text).courses.length,1);
    assert.equal(JSON.parse((await call('get_document_request',{requestId:queued.requestId})).content[0].text).state,'queued');
    report.checks.push('pairing, catalog hierarchy, original PDF bytes/fetch time, and queued requests survived');
    console.log('Checking the retained queue through the upgraded packaged browser worker…');
    const {createRetrievalWorker}=await import(pathToFileURL(path.join(install,'app/extension/retrieval-worker.js')).href);
    class ChromeSocket extends WebSocket {constructor(url){super(url,{origin});}}
    let upstream=0;
    const fetcher=async(url,options={})=>{
      if(url.startsWith('https://brightspace.nyu.edu/')) {upstream++;return new Response(secondBytes,{headers:{'content-type':'application/pdf'}});}
      return fetch(url.replace('http://127.0.0.1:47653',companion.url),{...options,headers:{...options.headers,Origin:origin}});
    };
    worker=createRetrievalWorker({getSettings:async()=>({enabled:true,token}),fetcher,Socket:ChromeSocket,url:companion.url.replace('http:','ws:')+'/v1/worker',heartbeatMs:1000});
    await worker.connect();
    const deadline=Date.now()+5000;
    while(!(await request('/v1/status',undefined,'GET',headers)).workerConnected) {
      if(Date.now()>deadline) throw new Error('Upgraded test worker failed to authenticate within five seconds.');
      await delay(30);
    }
    const ready=JSON.parse((await call('get_document_request',{requestId:queued.requestId,waitSeconds:10})).content[0].text);
    assert.equal(ready.state,'ready');assert.equal(upstream,1);assert.equal(ready.document.localPath,undefined);assert.deepEqual(Buffer.from((await client.readResource({uri:ready.document.uri})).contents[0].blob,'base64'),secondBytes);
    const repeated=JSON.parse((await call('request_document',{courseId:'100',key:'document:21'})).content[0].text);assert.equal(repeated.source,'cache');assert.equal(upstream,1);
    await companion.waitForOutput(/DEBUG http\.request/);
    report.checks.push('upgraded packaged Chrome worker completed the retained request exactly once; repeated request hit cache; verbose logs worked');
    const shortcuts=JSON.parse(run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$base=Join-Path ([Environment]::GetFolderPath('Programs')) $env:BS_UPGRADE_GROUP; $link=Join-Path $base 'Troubleshooting\\Companion (verbose logs).lnk'; $shell=New-Object -ComObject WScript.Shell; if(-not (Test-Path -LiteralPath $link)) {throw ('Verbose shortcut missing at '+$link)}; $shortcut=$shell.CreateShortcut($link); [PSCustomObject]@{target=$shortcut.TargetPath;arguments=$shortcut.Arguments} | ConvertTo-Json -Compress"],{BS_UPGRADE_GROUP:group}));
    assert.equal(shortcuts.target.toLowerCase(),path.join(install,'Start Companion.cmd').toLowerCase());assert.equal(shortcuts.arguments,'--debug');
    report.checks.push('new verbose Start menu shortcut points at the upgraded launcher');
    worker.stop();worker=null;await client.close();client=null;await companion.stop();companion=null;
    console.log('Checking shortcuts and uninstall/data retention…');
    run(path.join(install,'unins000.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',`/LOG=${path.join(work,'uninstall.log')}`]);
    uninstalled=true;
    // Inno's bootstrap process can exit before its temporary uninstaller has
    // removed the final bookkeeping files and retried the application folder.
    const uninstallDeadline=Date.now()+10000;
    for(;;) {
      try {await stat(install);} catch(error) {if(error.code==='ENOENT') break;throw error;}
      if(Date.now()>uninstallDeadline) throw new Error('Upgraded test installation was not removed within ten seconds.');
      await delay(50);
    }
    const vault=await openVault(cache);assert.equal((await vault.readJson('pairing.json')).token,token);
    assert.deepEqual(await vault.read(original.documentId+'.pdf'),bytes);
    await assert.rejects(stat(path.join(cache,'pairing.json')),error=>error.code==='ENOENT');
    await assert.rejects(stat(path.join(cache,original.documentId+'.pdf')),error=>error.code==='ENOENT');
    report.checks.push(wasEncrypted?'existing encrypted vault retained; original bytes and pairing survive uninstall without plaintext cache copies':'first updated start migrated legacy files into the Windows-protected vault; original bytes and pairing survive uninstall without plaintext cache copies');
    await writeFile(path.join(testRoot,'latest-report.json'),JSON.stringify({...report,passed:true},null,2)+'\n');
    passed=true;
    console.log(JSON.stringify({...report,passed:true},null,2));
  } finally {
    worker?.stop();await client?.close();await companion?.stop();
    if(!uninstalled) {
      try {await stat(path.join(install,'unins000.exe'));run(path.join(install,'unins000.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART']);uninstalled=true;} catch {}
    }
    if(!passed) await writeFile(path.join(testRoot,'last-failure.json'),JSON.stringify({...report,passed:false},null,2)+'\n');
    if(uninstalled && passed) {
      const resolved=path.resolve(work);
      if(!resolved.startsWith(path.resolve(testRoot)+path.sep) || !path.basename(resolved).startsWith('upgrade ')) throw new Error('Unsafe upgrade-test cleanup path.');
      await rm(resolved,{recursive:true,force:true,maxRetries:20,retryDelay:100});
    } else console.error('Upgrade fixture logs retained for inspection at '+work);
  }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
