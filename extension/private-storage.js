import {resumeCompanion} from './companion-client.js';

const SESSION='vaultSession',PREFIX='private:';
const sensitive=name=>{const key=name.replace(/^(?:demo|hosted-demo):/,'');return /^(?:course:|semester:|folders:)/.test(key) || ['availableSemesters','resourcesSelection','semesterSync','retrievalStatus'].includes(key);};
const encrypted=value=>value?.encryptedStorage===1;
const encode=bytes=>btoa(String.fromCharCode(...bytes));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
// Large catalogs must not use a spread over their whole ciphertext.
function base64(bytes){let result='';for(let i=0;i<bytes.length;i+=16384)result+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(result);}
export function createPrivateStorage({local,session,changed,fetcher=(...args)=>fetch(...args),crypto=globalThis.crypto}={}) {
  let unlocking=null,writes=Promise.resolve(),lastError=null;
  const key=async state=>crypto.subtle.importKey('raw',decode(state.storageKey),'AES-GCM',false,['encrypt','decrypt']);
  async function encrypt(name,value,state){
    const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new TextEncoder().encode(JSON.stringify(value));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('browser-state:'+name)},await key(state),bytes);
    return {encryptedStorage:1,iv:encode(iv),ciphertext:base64(new Uint8Array(ciphertext))};
  }
  async function decrypt(name,value,state){
    if(!encrypted(value))return value;
    if(!state)return undefined;
    try {return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv),additionalData:new TextEncoder().encode('browser-state:'+name)},await key(state),decode(value.ciphertext))));}
    catch{throw new Error('Saved browser data could not be unlocked. Keep the original companion cache and pairing; no data was reset.');}
  }
  async function migrate(state){
    const raw=await local.get(null),memory=await session.get(null),updates={},retire=[];
    for(const [name,value] of Object.entries(raw))if(sensitive(name)) {
      if(encrypted(value)){await decrypt(name,value,state);continue;}
      updates[name]=await encrypt(name,value,state);
    }
    for(const [name,value] of Object.entries(memory))if(name.startsWith(PREFIX) && sensitive(name.slice(PREFIX.length))) {
      updates[name.slice(PREFIX.length)]=await encrypt(name.slice(PREFIX.length),value,state);retire.push(name);
    }
    if(Object.keys(updates).length){
      await local.set(updates);
      const stored=await local.get(Object.keys(updates));
      for(const name of Object.keys(updates))if(!encrypted(stored[name]) || JSON.stringify(await decrypt(name,stored[name],state))!==JSON.stringify(await decrypt(name,updates[name],state)))throw new Error('Browser storage migration could not be verified. Session data has been preserved.');
    }
    if(retire.length)await session.remove(retire);
  }
  async function accept(result){
    if(result?.storageVersion!==1 || typeof result.credential!=='string' || result.credential.length>4096 || !/^[a-f0-9]{64}$/.test(result.token || '') || decode(result.storageKey || '').length!==32)throw new Error('Update the companion to use protected browser storage.');
    const state={token:result.token,storageKey:result.storageKey,credential:result.credential};
    // The recoverable sealed credential is durable before the plaintext legacy
    // bearer is replaced. AES keys and live bearers are session-memory only.
    if((await local.get('companionPairing')).companionPairing?.credential!==result.credential)await local.set({companionPairing:{credential:result.credential}});
    await session.set({[SESSION]:state});
    await migrate(state);lastError=null;return state;
  }
  async function unlock(){
    const pairing=(await local.get('companionPairing')).companionPairing;
    if(!pairing)return null;
    const state=(await session.get(SESSION))[SESSION];
    if(unlocking)return unlocking;
    unlocking=(async()=>{try{
      if(state?.credential===pairing.credential && state?.storageKey && state?.token){
        const raw=await local.get(null),memory=await session.get(null);
        if(Object.entries(raw).some(([name,value])=>sensitive(name)&&!encrypted(value)) || Object.keys(memory).some(name=>name.startsWith(PREFIX)))await migrate(state);
        lastError=null;return state;
      }
      return await accept(await resumeCompanion(pairing,fetcher));
    }catch(error){lastError=error;return null;}})();
    try{return await unlocking;}finally{unlocking=null;}
  }
  async function protection(state,raw){
    const legacy=Object.entries(raw).some(([name,value])=>sensitive(name)&&!encrypted(value)) || !!raw.companionPairing?.token;
    return {state:legacy?'migration_pending':state?'protected':raw.companionPairing?'locked':'session_only',message:legacy?'Start the updated companion to encrypt previously saved browser data. Original data is retained until migration verifies.':state?'Saved catalogs are encrypted; decrypted working data stays in browser session memory.':raw.companionPairing?'Start the companion to unlock saved catalogs after a browser restart.':'Without a paired companion, course data stays in this browser session and is not saved across browser restarts.',...(lastError?{error:lastError.message}:{})};
  }
  const api={
    async get(keys){
      await writes;const state=await unlock(),raw=await local.get(null),memory=await session.get(null),all={...raw};
      const requested=keys==null?null:new Set(typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys));
      delete all[SESSION];
      for(const [name,value] of Object.entries(raw))if(sensitive(name) && (!requested || requested.has(name))) {const item=await decrypt(name,value,state);if(item===undefined)delete all[name];else all[name]=item;}
      for(const [name,value] of Object.entries(memory))if(name.startsWith(PREFIX))all[name.slice(PREFIX.length)]=value;
      if(raw.companionPairing)all.companionPairing=state?{token:state.token,paired:true}:{paired:true,locked:true};
      all.storageProtection=await protection(state,raw);
      if(keys==null)return all;
      const names=typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);
      return Object.fromEntries(names.map(name=>[name,all[name]??(Array.isArray(keys)||typeof keys==='string'?undefined:keys[name])]));
    },
    set(updates){
      const task=writes.then(async()=>{
        if(Object.hasOwn(updates,'companionPairing'))throw new Error('Use the protected pairing flow.');
        const state=await unlock(),persistent={},volatile={};
        for(const [name,value] of Object.entries(updates)) {
          if(sensitive(name)){if(state)persistent[name]=await encrypt(name,value,state);else volatile[PREFIX+name]=value;}
          else persistent[name]=value;
        }
        if(Object.keys(persistent).length)await local.set(persistent);
        if(Object.keys(volatile).length)await session.set(volatile);
      });writes=task.catch(()=>{});return task;
    },
    async remove(keys){const names=Array.isArray(keys)?keys:[keys];await local.remove(names);await session.remove(names.map(name=>PREFIX+name));if(names.includes('companionPairing'))await session.remove(SESSION);},
    pair:accept,
    async ensureSession(){const state=await unlock();if(!state && lastError)throw lastError;return state;},
    onChanged:{addListener(listener){
      changed?.addListener((changes,area)=>{
        void (async()=>{
          if(area==='session'){
            const virtual={};
            for(const [name,change] of Object.entries(changes))if(name.startsWith(PREFIX))virtual[name.slice(PREFIX.length)]=change;
            if(changes[SESSION])virtual.storageProtection={newValue:{state:changes[SESSION].newValue?'protected':'locked'}};
            if(Object.keys(virtual).length)listener(virtual,'local');
            const ordinary=Object.fromEntries(Object.entries(changes).filter(([name])=>name!==SESSION && !name.startsWith(PREFIX)));
            if(Object.keys(ordinary).length)listener(ordinary,area);return;
          }
          if(area!=='local')return;
          const state=(await session.get(SESSION))[SESSION],result={};
          for(const [name,change] of Object.entries(changes)){
            if(name==='companionPairing'){result[name]={newValue:change.newValue?{paired:true}:undefined};continue;}
            result[name]=sensitive(name)?{oldValue:await decrypt(name,change.oldValue,state),newValue:await decrypt(name,change.newValue,state)}:change;
          }
          listener(result,area);
        })().catch(()=>{});
      });
    }},
  };
  return api;
}
export const privateStorage=globalThis.chrome?.storage?createPrivateStorage({local:chrome.storage.local,session:chrome.storage.session,changed:chrome.storage.onChanged}):null;
