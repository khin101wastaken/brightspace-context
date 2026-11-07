import test from 'node:test';
import assert from 'node:assert/strict';
import {storageHarness} from './storage-fixture.js';
import {createPrivateStorage} from '../extension/private-storage.js';
const result={token:'a'.repeat(64),storageKey:Buffer.alloc(32,7).toString('base64'),credential:'synthetic-sealed-credential',storageVersion:1};
const catalog={courseId:'100',title:'Synthetic private course',entries:[{title:'Private module notes'}]};

test('unpaired catalogs are session-only; pairing encrypts them without persisting raw keys or tokens',async()=>{
 const h=storageHarness();await h.view.set({'course:100':catalog,uiAppearance:'dark'});assert.equal(h.local['course:100'],undefined);assert.equal((await h.view.get('course:100'))['course:100'].title,catalog.title);
 await h.view.pair(result);assert.equal(h.local['course:100'].encryptedStorage,1);assert.equal(h.session['private:course:100'],undefined);assert.equal((await h.view.get('course:100'))['course:100'].title,catalog.title);
 const disk=JSON.stringify(h.local);assert.equal(disk.includes(catalog.title),false);assert.equal(disk.includes(result.token),false);assert.equal(disk.includes(result.storageKey),false);assert.equal(h.local.uiAppearance,'dark');
});

test('legacy metadata and bearer migrate; browser restart unlocks without another pairing code',async()=>{
 const h=storageHarness({companionPairing:{token:result.token},'course:100':catalog});let calls=0;
 const make=()=>createPrivateStorage({local:h.storage.local,session:h.storage.session,changed:h.storage.onChanged,fetcher:async(url,options)=>{calls++;assert.ok(url.endsWith('/v1/session'));return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});}});
 let view=make();assert.deepEqual((await view.get('course:100'))['course:100'],catalog);assert.equal(h.local.companionPairing.token,undefined);assert.equal(h.local['course:100'].encryptedStorage,1);
 await h.storage.session.remove('vaultSession');view=make();assert.deepEqual((await view.get('course:100'))['course:100'],catalog);assert.equal(calls,2);
});

test('offline migration retains originals; offline encrypted catalogs stay locked after browser restart',async()=>{
 const h=storageHarness({companionPairing:{token:result.token},'course:100':catalog});
 const offline=()=>createPrivateStorage({local:h.storage.local,session:h.storage.session,fetcher:async()=>{throw Error('Companion unavailable');}});
 assert.equal((await offline().get(null)).storageProtection.state,'migration_pending');assert.deepEqual(h.local['course:100'],catalog);
 await h.view.pair(result);await h.storage.session.remove('vaultSession');
 const data=await offline().get(null);assert.equal(data['course:100'],undefined);assert.equal(data.storageProtection.state,'locked');assert.equal(h.local['course:100'].encryptedStorage,1);
});

test('ciphertext swapping or corruption cannot turn into readable catalog content',async()=>{
 const h=storageHarness({}, {paired:true});await h.view.set({'course:100':catalog,'course:200':{...catalog,courseId:'200'}});
 h.local['course:200']=structuredClone(h.local['course:100']);await assert.rejects(h.view.get('course:200'),/could not be unlocked/);assert.equal(h.local['course:200'].encryptedStorage,1);
});

test('migration retries after a failed durable write without discarding session data',async()=>{
 const h=storageHarness();await h.view.set({'course:100':catalog});const set=h.storage.local.set;let fail=true;
 h.storage.local.set=async value=>{if(fail && value['course:100'])throw Error('Storage quota');return set(value);};
 await assert.rejects(h.view.pair(result),/Storage quota/);assert.deepEqual(h.session['private:course:100'],catalog);
 fail=false;assert.deepEqual((await h.view.get('course:100'))['course:100'],catalog);assert.equal(h.local['course:100'].encryptedStorage,1);assert.equal(h.session['private:course:100'],undefined);
});
