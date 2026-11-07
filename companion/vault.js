import {mkdir,readFile,unlink,open,readdir} from 'node:fs/promises';
import {randomBytes,createCipheriv,createDecipheriv,hkdfSync,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {atomicWrite} from './files.js';
import {windowsKeyProtection} from './key-protection.js';

const MAGIC=Buffer.from('BSCV1'),OVERHEAD=MAGIC.length+12+16;
export const VAULT_OVERHEAD=OVERHEAD;
const invalid=()=>Object.assign(new Error('Encrypted storage failed authentication. Preserve the vault and its key; do not overwrite or reset them.'),{code:'VAULT_INTEGRITY_FAILED'});
export function seal(key,bytes,context) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(context));const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),encrypted]);
}
export function unseal(key,bytes,context) {
  try {
    if(bytes.length<OVERHEAD || !bytes.subarray(0,MAGIC.length).equals(MAGIC))throw invalid();
    const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(5,17));decipher.setAAD(Buffer.from(context));decipher.setAuthTag(bytes.subarray(17,33));
    return Buffer.concat([decipher.update(bytes.subarray(33)),decipher.final()]);
  }catch{throw invalid();}
}
export async function openVault(directory,{protection=windowsKeyProtection}={}) {
  directory=path.resolve(directory);await mkdir(directory,{recursive:true});
  const keyFile=path.join(directory,'.vault-key.json'),lockFile=path.join(directory,'.vault-key.lock');
  const load=async()=>{
    const raw=await readFile(keyFile,'utf8');if(raw.length>65536)throw invalid();const record=JSON.parse(raw);
    if(record.version!==1 || record.protection!=='windows-current-user' || typeof record.wrapped!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(record.wrapped))throw invalid();
    const key=await protection.unprotect(Buffer.from(record.wrapped,'base64'));if(key.length!==32)throw invalid();return key;
  };
  let key;
  try {key=await load();}catch(error){
    if(error.code!=='ENOENT')throw error;
    let lock;
    for(let attempt=0;!lock;attempt++) {
      try {lock=await open(lockFile,'wx',0o600);}catch(error){if(error.code!=='EEXIST' || attempt>=100)throw Object.assign(new Error('Encrypted storage key setup is busy. Close other copies and retry; do not remove an existing key.'),{code:'VAULT_KEY_BUSY'});await delay(50);}
    }
    try {
      try {key=await load();}catch(error){
        if(error.code!=='ENOENT')throw error;
        if((await readdir(directory)).some(name=>name.endsWith('.vault')))throw Object.assign(new Error('The protected key is missing from an existing encrypted vault. Restore its original key file and Windows profile; no new key was created.'),{code:'VAULT_KEY_MISSING'});
        key=randomBytes(32);const wrapped=await protection.protect(key),verified=await protection.unprotect(wrapped);
        if(verified.length!==key.length || !timingSafeEqual(verified,key))throw invalid();
        await atomicWrite(keyFile,JSON.stringify({version:1,protection:'windows-current-user',wrapped:wrapped.toString('base64')}),{mode:0o600});
      }
    }finally{await lock.close();await unlink(lockFile);}
  }
  const file=name=>{if(typeof name!=='string' || path.basename(name)!==name || name.startsWith('.') || !/^[a-zA-Z0-9_.-]+$/.test(name))throw new Error('Invalid vault filename.');return path.join(directory,name);};
  const read=async name=>{
    const legacy=file(name),encrypted=legacy+'.vault';let bytes;
    try {bytes=unseal(key,await readFile(encrypted),'file:'+name);}catch(error){
      if(error.code!=='ENOENT')throw error;
      const original=await readFile(legacy);
      await atomicWrite(encrypted,seal(key,original,'file:'+name),{mode:0o600});
      bytes=unseal(key,await readFile(encrypted),'file:'+name);
      if(!bytes.equals(original))throw invalid();
    }
    // A crash may leave both versions. Only retire plaintext after verifying
    // the durable encrypted copy. A changed legacy file indicates an old app.
    try {const old=await readFile(legacy);if(!old.equals(bytes))throw Object.assign(new Error('A legacy file differs from the encrypted copy. Close older companions before migrating.'),{code:'MIGRATION_CONFLICT'});await unlink(legacy);}catch(error){if(error.code!=='ENOENT')throw error;}
    return bytes;
  };
  return {
    read,
    write:async(name,bytes)=>atomicWrite(file(name)+'.vault',seal(key,Buffer.from(bytes),'file:'+name),{mode:0o600}),
    remove:async name=>{await unlink(file(name)+'.vault').catch(error=>{if(error.code!=='ENOENT')throw error;});await unlink(file(name)).catch(error=>{if(error.code!=='ENOENT')throw error;});},
    readJson:async name=>JSON.parse((await read(name)).toString('utf8')),
    writeJson:async(name,value)=>atomicWrite(file(name)+'.vault',seal(key,Buffer.from(JSON.stringify(value)),'file:'+name),{mode:0o600}),
    credential:(origin,token)=>seal(key,Buffer.from(JSON.stringify({origin,token})),'browser-pairing:'+origin).toString('base64'),
    resume:(origin,value)=>{if(typeof value!=='string' || value.length>4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw invalid();return JSON.parse(unseal(key,Buffer.from(value,'base64'),'browser-pairing:'+origin));},
    browserKey:origin=>Buffer.from(hkdfSync('sha256',key,Buffer.from('Brightspace Context browser state v1'),Buffer.from(origin),32)).toString('base64'),
    encrypted:true,
  };
}
