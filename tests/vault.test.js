import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile,writeFile,readdir,stat,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import http from 'node:http';
import {openVault,seal,unseal} from '../companion/vault.js';
import {openCache,cacheId} from '../companion/cache.js';
import {createCompanion} from '../companion/server.js';
import {openExports,EXPORT_TTL_MS} from '../companion/exports.js';

const origin='chrome-extension://'+'a'.repeat(32),other='chrome-extension://'+'b'.repeat(32);
const bytes=Buffer.from('%PDF-1.4\nSynthetic confidential reading\n%%EOF');
const metadata={courseId:'100',topicId:'20',title:'Private sample reading',courseTitle:'Synthetic course',modulePath:['Nested module'],sourceUrl:'https://brightspace.nyu.edu/content/enforced/100/sample.pdf',lastModifiedAt:'2026-01-01T00:00:00Z'};
async function temporary(t){const root=path.resolve('.cache/tests');await mkdir(root,{recursive:true});const dir=await mkdtemp(path.join(root,'brightspace-vault-test-'));t.after(async()=>{if(!dir.startsWith(root+path.sep)||!path.basename(dir).startsWith('brightspace-vault-test-'))throw Error('Unsafe cleanup');await rm(dir,{recursive:true,force:true});});return dir;}

test('authenticated encryption uses fresh nonces and binds every object to its purpose',()=>{
 const key=randomBytes(32),a=seal(key,bytes,'file:a'),b=seal(key,bytes,'file:a');assert.notDeepEqual(a,b);assert.deepEqual(unseal(key,a,'file:a'),bytes);assert.equal(a.includes(bytes),false);
 assert.throws(()=>unseal(key,a,'file:b'),/authentication/);assert.throws(()=>unseal(randomBytes(32),a,'file:a'),/authentication/);
 const damaged=Buffer.from(a);damaged[damaged.length-1]^=1;assert.throws(()=>unseal(key,damaged,'file:a'),/authentication/);
});

test('an unreadable legacy blob stops startup without replacing the saved index',async t=>{
 const directory=await temporary(t),id=cacheId(metadata);let persisted=false;
 const vault={readJson:async()=>({entries:{[id]:{...metadata,id,bytes:bytes.length,sha256:'a'.repeat(64)}}}),read:async()=>{throw Object.assign(new Error('Access denied'),{code:'EACCES'});},write:async()=>{persisted=true;}};
 await assert.rejects(openCache(directory,{vault}),error=>error.code==='EACCES');assert.equal(persisted,false);
});

test('an occupied companion port rejects the new app before any legacy data is migrated',async t=>{
 const directory=await temporary(t),legacy=JSON.stringify({origin,token:'a'.repeat(64)});await writeFile(path.join(directory,'pairing.json'),legacy);
 const server=http.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 await assert.rejects(createCompanion({directory,port:server.address().port}),error=>error.code==='EADDRINUSE');
 assert.equal(await readFile(path.join(directory,'pairing.json'),'utf8'),legacy);assert.deepEqual(await readdir(directory),['pairing.json']);
});

test('legacy documents and metadata migrate to verified encrypted files; restart preserves exact bytes',async t=>{
 const directory=await temporary(t),id=cacheId(metadata),entry={...metadata,id,bytes:bytes.length,sha256:(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex'),fetchedAt:1,lastAccessAt:1};
 await writeFile(path.join(directory,'index.json'),JSON.stringify({version:1,entries:{[id]:entry}}));await writeFile(path.join(directory,id+'.pdf'),bytes);
 await writeFile(path.join(directory,'pairing.json'),JSON.stringify({origin,token:'a'.repeat(64)}));
 const cache=await openCache(directory);assert.deepEqual((await cache.read(id)).bytes,bytes);const vault=await openVault(directory);assert.equal((await vault.readJson('pairing.json')).origin,origin);
 const files=await readdir(directory);assert.ok(files.includes(id+'.pdf.vault'));assert.ok(!files.includes(id+'.pdf'));assert.ok(!files.includes('index.json'));assert.ok(!files.includes('pairing.json'));
 for(const file of files){const raw=await readFile(path.join(directory,file));assert.equal(raw.includes(bytes),false);assert.equal(raw.includes(Buffer.from(metadata.title)),false);assert.equal(raw.includes(Buffer.from('a'.repeat(64))),false);}
 assert.deepEqual((await (await openCache(directory)).read(id)).bytes,bytes);
 // Recover a crash after writing ciphertext but before retiring its original.
 await writeFile(path.join(directory,id+'.pdf'),bytes);assert.deepEqual(await vault.read(id+'.pdf'),bytes);await assert.rejects(stat(path.join(directory,id+'.pdf')),e=>e.code==='ENOENT');
 await writeFile(path.join(directory,id+'.pdf'),Buffer.from('A newer legacy version'));
 await assert.rejects(vault.read(id+'.pdf'),e=>e.code==='MIGRATION_CONFLICT');assert.equal((await readFile(path.join(directory,id+'.pdf'))).toString(),'A newer legacy version');
});

test('damaged ciphertext or a key-unlock failure never resets or overwrites the vault',async t=>{
 const directory=await temporary(t),vault=await openVault(directory);await vault.write('catalog.json','synthetic private metadata');
 const filename=path.join(directory,'catalog.json.vault'),damaged=await readFile(filename);damaged[damaged.length-1]^=1;await writeFile(filename,damaged);
 await assert.rejects(vault.read('catalog.json'),e=>e.code==='VAULT_INTEGRITY_FAILED');assert.deepEqual(await readFile(filename),damaged);
 const keyBefore=await readFile(path.join(directory,'.vault-key.json'));
 await assert.rejects(openVault(directory,{protection:{unprotect:async()=>{throw Error('Different Windows user');}}}),/Different Windows user/);
 assert.deepEqual(await readFile(path.join(directory,'.vault-key.json')),keyBefore);assert.deepEqual(await readFile(filename),damaged);
 await unlink(path.join(directory,'.vault-key.json'));await assert.rejects(openVault(directory),error=>error.code==='VAULT_KEY_MISSING');await assert.rejects(stat(path.join(directory,'.vault-key.json')),error=>error.code==='ENOENT');assert.deepEqual(await readFile(filename),damaged);
});

test('pairing resumes from an origin-bound sealed credential; exports require opt-in and acknowledgement',async t=>{
 const directory=await temporary(t),app=await createCompanion({directory,port:0,pairingCode:'123456789a'});t.after(()=>app.close());
 const request=(route,value,token,requestOrigin=origin)=>fetch(app.url+route,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(value)});
 const pair=await (await request('/v1/pair',{code:'123456789a'})).json();assert.equal(pair.storageVersion,1);assert.ok(pair.credential);assert.equal(Buffer.from(pair.credential,'base64').includes(Buffer.from(pair.token)),false);
 assert.equal((await request('/v1/session',{credential:pair.credential},null,other)).status,401);
 const resumed=await (await request('/v1/session',{credential:pair.credential})).json();assert.equal(resumed.token,pair.token);assert.equal(resumed.storageKey,pair.storageKey);assert.equal(resumed.credential,pair.credential);
 const saved=await app.cache.put(metadata,bytes);
 assert.equal((await request('/v1/cache/exports',{id:saved.id,acknowledgePlaintext:true},pair.token)).status,409);assert.deepEqual(await readdir(path.join(directory,'temporary-exports')),[]);
 assert.equal((await request('/v1/settings',{allowTemporaryExports:true},pair.token)).status,200);
 assert.equal((await request('/v1/cache/exports',{id:saved.id,acknowledgePlaintext:false},pair.token)).status,400);
 const exported=await (await request('/v1/cache/exports',{id:saved.id,acknowledgePlaintext:true},pair.token)).json();assert.equal(exported.unencrypted,true);assert.deepEqual(await readFile(exported.localPath),bytes);assert.ok(exported.localPath.startsWith(path.join(directory,'temporary-exports')+path.sep));
 assert.equal((await request('/v1/settings',{allowTemporaryExports:false},pair.token)).status,200);await assert.rejects(stat(exported.localPath),e=>e.code==='ENOENT');
 const next=await (await request('/v1/pair',{code:'123456789a'})).json();assert.notEqual(next.token,pair.token);assert.equal(next.storageKey,pair.storageKey);assert.equal((await request('/v1/session',{credential:pair.credential})).status,401);
});

test('temporary exports expire and normal shutdown removes current copies',async t=>{
 let time=Date.now();const directory=await temporary(t),exports=await openExports(directory,{now:()=>time});t.after(()=>exports.close());await exports.setEnabled(true);
 const result=await exports.create({extension:'pdf'},bytes);time+=EXPORT_TTL_MS+1000;await exports.clean();await assert.rejects(stat(result.localPath),e=>e.code==='ENOENT');
 const second=await exports.create({extension:'pdf'},bytes);await exports.close();await assert.rejects(stat(second.localPath),e=>e.code==='ENOENT');
 await assert.rejects(exports.create({extension:'pdf'},bytes),/disabled/);
});

test('revoking export permission waits for queued copies and leaves no late plaintext export',async t=>{
 const directory=await temporary(t),exports=await openExports(directory);t.after(()=>exports.close());await exports.setEnabled(true);
 const pending=exports.create({extension:'pdf'},bytes),disabled=exports.setEnabled(false);const result=await pending;await disabled;
 await assert.rejects(stat(result.localPath),error=>error.code==='ENOENT');await assert.rejects(exports.create({extension:'pdf'},bytes),/disabled/);
});
