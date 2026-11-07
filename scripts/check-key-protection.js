import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js';
import {windowsKeyProtection} from '../companion/key-protection.js';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
if(process.argv.includes('--child')) {
  const started=Date.now();
  try {
    const value=JSON.parse(readFileSync(0,'utf8'));
    const actual=await windowsKeyProtection.unprotect(Buffer.from(value.wrapped,'base64'));
    console.log(JSON.stringify({ok:digest(actual)===value.digest,elapsedMs:Date.now()-started}));
  } catch(error){console.log(JSON.stringify({ok:false,code:error.code || 'UNKNOWN',elapsedMs:Date.now()-started}));process.exitCode=1;}
} else {
  const sample=randomBytes(32),wrapped=await windowsKeyProtection.protect(sample),input=JSON.stringify({wrapped:wrapped.toString('base64'),digest:digest(sample)});
  const defaults=getDefaultEnvironment(),extra=['WINDIR','COMSPEC','PATHEXT','PROGRAMDATA','PROGRAMFILES(X86)','PROGRAMW6432','PSModulePath'];
  console.log(JSON.stringify({node:process.version,platform:process.platform,omittedWindowsVariables:extra.filter(key=>process.env[key] && !defaults[key])}));
  const variants=[['sdk-default',defaults],['inherited',process.env]];
  let failed=false;
  for(const [name,env] of variants){
    const run=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--child'],{env,input,encoding:'utf8',timeout:25000,maxBuffer:16384,windowsHide:true});
    let result;try{result=JSON.parse(run.stdout.trim());}catch{result={ok:false,code:run.error?.code || 'CHILD_FAILED'};}
    console.log(JSON.stringify({variant:name,...result}));if(!result.ok)failed=true;
  }
  if(failed)process.exitCode=1;
}
