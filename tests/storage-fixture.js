import {createPrivateStorage} from '../extension/private-storage.js';
export function storageHarness(local={}, {session={},paired=false}={}) {
  if(paired){local.companionPairing={credential:'synthetic-sealed-credential'};session.vaultSession={credential:local.companionPairing.credential,token:'a'.repeat(64),storageKey:Buffer.alloc(32,7).toString('base64')};}
  const listeners=[];
  const area=(values,name)=>({
    async get(keys){if(keys==null)return structuredClone(values);const names=typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return Object.fromEntries(names.map(key=>[key,structuredClone(values[key]??(Array.isArray(keys)||typeof keys==='string'?undefined:keys[key]))]));},
    async set(updates){const changes={};for(const [key,value] of Object.entries(updates)){if(JSON.stringify(values[key])===JSON.stringify(value))continue;changes[key]={oldValue:structuredClone(values[key]),newValue:structuredClone(value)};values[key]=structuredClone(value);}if(Object.keys(changes).length)for(const fn of listeners)fn(changes,name);},
    async remove(keys){const changes={};for(const key of Array.isArray(keys)?keys:[keys]){changes[key]={oldValue:values[key]};delete values[key];}for(const fn of listeners)fn(changes,name);},
  });
  const storage={local:area(local,'local'),session:area(session,'session'),onChanged:{addListener:fn=>listeners.push(fn)}};
  return {storage,local,session,view:createPrivateStorage({local:storage.local,session:storage.session,changed:storage.onChanged})};
}
