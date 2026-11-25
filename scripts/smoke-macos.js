import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,realpath,rm,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {parse} from 'smol-toml';
import {pdfFixture} from '../tests/pdf-fixture.js';
import {verifyChecksum} from './build-windows.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin=`chrome-extension://${'a'.repeat(32)}`;
const secret='7'.repeat(64),label='Brightspace macOS fixture';
const exec=(command,args)=>execFileSync(command,args,{stdio:['ignore','pipe','pipe'],timeout:45000});

function launch(command,args,{env,stdio=['pipe','pipe','pipe']}) {
  const process=spawn(command,args,{env,stdio});
  const exited=new Promise(resolve=>{
    process.once('error',()=>resolve('launch failed'));
    process.once('exit',(code,signal)=>resolve(code ?? signal));
  });
  process.stderr?.resume();
  return {process,exited};
}

async function stop(child,{graceful=false}={}) {
  if(!child) return;
  if(graceful) child.process.stdin.end();
  else child.process.kill('SIGTERM');
  const result=await Promise.race([child.exited,delay(5000,undefined,{ref:false})]);
  if(result===undefined) {child.process.kill('SIGKILL');await child.exited;}
  if(graceful) assert.equal(result,0,'the companion must stop on stdin EOF');
}

async function awaitReady(child) {
  let text='';
  const controller=new AbortController();
  const started=new Promise(resolve=>{
    child.process.stdout.on('data',chunk=>{
      text=(text+chunk.toString('utf8')).slice(-65536);
      const url=text.match(/^Address: (http:\/\/127\.0\.0\.1:[0-9]+)$/m)?.[1];
      const code=text.match(/^Pairing code: ([a-f0-9]{10})$/m)?.[1];
      if(url && code) resolve({url,code});
    });
  });
  try {
    const result=await Promise.race([started,child.exited,delay(30000,null,{signal:controller.signal,ref:false})]);
    if(!result?.url) throw new Error('The packaged companion did not start with the isolated Keychain.');
    return result;
  } finally {controller.abort();}
}

async function poll(check,failure) {
  const deadline=Date.now()+20000;
  do {
    if(await check()) return;
    await delay(200);
  } while(Date.now()<deadline);
  throw new Error(failure);
}

async function mountImage(artifact,mount,record) {
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      exec('/usr/bin/hdiutil',['attach',artifact,'-readonly','-nobrowse','-mountpoint',mount]);
      return true;
    } catch(error) {
      if(!/Resource (?:busy|temporarily unavailable)/.test(error.stderr?.toString() || '')) throw error;
      if(attempt<3) await delay(2000);
      else if(process.env.GITHUB_ACTIONS!=='true' || !record?.bundle) throw error;
    }
  }
  console.log('Runner disk mount unavailable. Verifying the image and running the app from the build staging bundle.');
  exec('/usr/bin/hdiutil',['verify',artifact]);
  return false;
}

async function smokeMac(artifact,record) {
  if(record) verifyChecksum(await readFile(artifact),record.sha256);
  const scratch=await mkdtemp(path.join(os.tmpdir(),'brightspace-mac-smoke-'));
  assert.equal(path.dirname(scratch),path.resolve(os.tmpdir()));
  const mount=path.join(scratch,'mounted'),keychain=path.join(scratch,'smoke.keychain-db');
  let mounted=false,createdKeychain=false,child,client,launcher;
  try {
    await mkdir(mount);
    mounted=await mountImage(artifact,mount,record);
    const bundle=path.join(scratch,'Installed Apps','Brightspace Context.app');
    await mkdir(path.dirname(bundle));
    await cp(mounted?path.join(mount,'Brightspace Context.app'):record.bundle,bundle,{recursive:true});
    if(mounted) {exec('/usr/bin/hdiutil',['detach',mount]);mounted=false;}
    exec('/usr/bin/codesign',['--verify','--deep','--strict',bundle]);
    const contents=path.join(bundle,'Contents'),executables=path.join(contents,'MacOS'),app=path.join(contents,'Resources','app');
    const node=path.join(executables,'node'),server=path.join(app,'mcp','start.js');
    if(record) assert.equal(exec(node,['--version']).toString().trim(),`v${record.nodeVersion}`);
    assert.equal(exec(node,['-p','process.arch']).toString().trim(),'arm64');
    assert.ok((await stat(path.join(app,'extension','manifest.json'))).isFile());
    const pass=randomBytes(24).toString('hex');
    exec('/usr/bin/security',['create-keychain','-p',pass,keychain]);createdKeychain=true;
    exec('/usr/bin/security',['unlock-keychain','-p',pass,keychain]);
    const directory=path.join(scratch,'Cache with spaces'),codexHome=path.join(scratch,'Codex');
    const env={...process.env,BRIGHTSPACE_KEYCHAIN_PATH:keychain,BRIGHTSPACE_KEYCHAIN_INTERACTIVE:'0',BRIGHTSPACE_CACHE_DIR:directory,BRIGHTSPACE_COMPANION_PORT:'0',BRIGHTSPACE_MANAGEMENT_TOKEN:secret,CODEX_HOME:codexHome};
    delete env.BRIGHTSPACE_KEYCHAIN_HELPER;
    const start=()=>launch(node,[path.join(app,'companion','start.js'),'--tray'],{env});
    child=start();let {url,code}=await awaitReady(child);
    const request=async(endpoint,{method='GET',data,token,local=false}={})=>{
      const response=await fetch(url+endpoint,{method,headers:{Origin:local?url:origin,...(token?{Authorization:`Bearer ${token}`}:{})},body:data,signal:AbortSignal.timeout(6000)});
      assert.equal(response.status,200,`${endpoint} should succeed`);
      return response.json();
    };
    const pairing=await request('/v1/pair',{method:'POST',data:JSON.stringify({code})});
    const data=pdfFixture([label]);
    const metadata={courseId:'100',topicId:'1',title:label,courseTitle:'Synthetic course',modulePath:[],sourceUrl:'https://brightspace.nyu.edu/content/enforced/100/smoke.pdf'};
    const lookup=await request('/v1/cache/lookup',{method:'POST',data:JSON.stringify(metadata),token:pairing.token});
    const saved=await request(`/v1/cache/uploads/${lookup.uploadId}`,{method:'PUT',data,token:pairing.token});
    assert.equal((await readFile(path.join(directory,`${saved.id}.pdf.vault`))).includes(data),false);
    const keyRecord=JSON.parse(await readFile(path.join(directory,'.vault-key.json'),'utf8'));
    assert.equal(keyRecord.protection,'macos-keychain');
    assert.equal(Buffer.from(keyRecord.wrapped,'base64').length,24);

    const setup=await request('/manage/api/codex',{method:'POST',token:secret,local:true});
    assert.equal(setup.state,'added');
    const configured=parse(await readFile(path.join(codexHome,'config.toml'),'utf8')).mcp_servers['brightspace-context'];
    assert.equal(await stat(configured.command).then(s=>s.isFile()),true);
    assert.equal(await realpath(configured.args[0]),await realpath(server));
    assert.equal(configured.env.BRIGHTSPACE_CACHE_DIR,directory);

    await stop(child,{graceful:true});child=undefined;
    child=start();({url,code}=await awaitReady(child));
    const status=await request('/v1/status',{token:pairing.token});
    assert.equal(status.files,1,'pairing and cache must survive a restart');
    client=new Client({name:'macos-smoke',version:'1'});
    await client.connect(new StdioClientTransport({command:configured.command,args:configured.args,env:{...configured.env,BRIGHTSPACE_COMPANION_PORT:new URL(url).port,BRIGHTSPACE_KEYCHAIN_PATH:keychain},stderr:'pipe'}));
    const {tools}=await client.listTools();
    assert.ok(tools.some(tool=>tool.name==='list_assignments'));
    const read=await client.callTool({name:'read_document_text',arguments:{id:saved.id}});
    assert.notEqual(read.isError,true,read.content[0].text);
    assert.match(JSON.parse(read.content[0].text).text,/Brightspace macOS fixture/);
    await client.close();client=undefined;
    await stop(child,{graceful:true});child=undefined;
    console.log('PASS: app signature, Apple silicon runtime, isolated Keychain, pairing, encrypted cache, Codex setup, and PDF reading after restart.');

    // Launch the real menu bar executable. Ending the launcher tests the pipe
    // handoff that releases the companion even when the GUI is interrupted.
    launcher=launch(path.join(executables,'BrightspaceContext'),[],{env:{...env,BRIGHTSPACE_COMPANION_PORT:new URL(url).port},stdio:'ignore'});
    const reachable=()=>fetch(url+'/manage/',{signal:AbortSignal.timeout(500)}).then(r=>r.ok,()=>false);
    await poll(reachable,'The menu bar app did not start its companion.');
    await stop(launcher);launcher=undefined;
    await poll(async()=>!await reachable(),'The companion kept its port after the launcher exited.');
    console.log('PASS: menu bar executable starts the companion and releases its port when the launcher exits.');
  } finally {
    await client?.close();
    await stop(child);
    await stop(launcher);
    if(createdKeychain) exec('/usr/bin/security',['delete-keychain',keychain]);
    if(mounted) exec('/usr/bin/hdiutil',['detach',mount]);
    await rm(scratch,{recursive:true,force:true});
  }
}

const artifact=process.argv[2];
assert.ok(process.platform==='darwin' && process.arch==='arm64','Run the smoke test on an Apple silicon Mac.');
const record=artifact?null:JSON.parse(await readFile(path.join(root,'dist','latest-macos-build.json'),'utf8'));
await smokeMac(artifact?path.resolve(artifact):record.artifact,record);
