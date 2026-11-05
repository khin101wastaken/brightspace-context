import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8,strToU8} from 'fflate';
import {EXTENSION_FILES,validateExtension,zipExtension} from '../scripts/package-extension.js';

const files=Object.fromEntries(await Promise.all(EXTENSION_FILES.map(async name=>[name,new Uint8Array(await readFile(new URL('../extension/'+name,import.meta.url)))])));
const alteredManifest=change=>({...files,'manifest.json':strToU8(JSON.stringify({...JSON.parse(strFromU8(files['manifest.json'])),...change}))});

test('store ZIP has a root manifest, complete browser assets and byte-identical files, with stable output',()=>{
  const archive=zipExtension(files),unpacked=unzipSync(archive);
  assert.ok(Object.hasOwn(unpacked,'manifest.json'));
  assert.deepEqual(Object.keys(unpacked).sort(),[...EXTENSION_FILES].sort());
  assert.deepEqual(zipExtension(files),archive);
  for(const name of EXTENSION_FILES) assert.deepEqual(unpacked[name],files[name]);
  assert.equal(Object.keys(unpacked).some(name=>/companion\/|mcp\/|\.pdf$|node_modules|\.cache|inspect\.js|expand\.js/.test(name)),false);
});
test('packaging rejects private extras, widened permissions and missing required runtime files',()=>{
  assert.throws(()=>zipExtension({...files,'private.pdf':strToU8('private')}),/Unexpected archive/);
  assert.throws(()=>zipExtension({...files,'../pairing.json':strToU8('private')}),/Unexpected archive/);
  assert.throws(()=>validateExtension(alteredManifest({host_permissions:['<all_urls>']})),/host permissions/);
  assert.throws(()=>validateExtension(alteredManifest({permissions:['storage','downloads','alarms','scripting','activeTab']})),/permissions/);
  assert.throws(()=>validateExtension(alteredManifest({permissions:['storage']})),/permissions/);
  for(const name of ['manifest.json','download.js','resources.js','LICENSE','icons/icon-128.png']) {
    const incomplete={...files};delete incomplete[name];assert.throws(()=>zipExtension(incomplete),/Missing packaged file/);
  }
});
test('manifest icons and local JavaScript dependency graph are verified before upload',()=>{
  assert.throws(()=>validateExtension({...files,'icons/icon-128.png':files['icons/icon-16.png']}),/128px PNG/);
  assert.throws(()=>validateExtension({...files,'popup.js':strToU8("import value from 'https://example.com/remote.js';")}),/Non-local module/);
  assert.throws(()=>validateExtension({...files,'popup.js':strToU8("import value from './missing.js';")}),/Missing packaged/);
  assert.doesNotThrow(()=>validateExtension(files));
});
