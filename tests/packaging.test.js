import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {PAYLOAD_SOURCES,inventory,verifyChecksum} from '../scripts/build-windows.js';

test('packaging copies an explicit source allowlist rather than workspace or private runtime data',()=>{
  assert.deepEqual(PAYLOAD_SOURCES,['extension','companion','mcp','package.json','package-lock.json']);
});
test('runtime checksum rejects modified bytes and malformed expected hashes',()=>{
  const bytes=Buffer.from('runtime fixture'),digest=createHash('sha256').update(bytes).digest('hex');
  assert.doesNotThrow(()=>verifyChecksum(bytes,digest));
  assert.throws(()=>verifyChecksum(Buffer.from('modified'),digest),/checksum mismatch/);
  assert.throws(()=>verifyChecksum(bytes,''),/checksum mismatch/);
});
test('installed guide derives usable Windows MCP paths from a file URL containing spaces',async()=>{
  const guide=await readFile(new URL('../packaging/windows/SETUP.html',import.meta.url),'utf8');
  const script=guide.match(/<script>([\s\S]*?)<\/script>/)?.[1],elements={};
  assert.ok(script);
  runInNewContext(script,{URL,location:{href:'file:///C:/Users/Example/AppData/Local/Programs/Brightspace%20Context/SETUP.html'},document:{getElementById:id=>elements[id] ||= {}}});
  assert.equal(elements.extension.textContent,'C:\\Users\\Example\\AppData\\Local\\Programs\\Brightspace Context\\app\\extension');
  const server=JSON.parse(elements.config.textContent).mcpServers['brightspace-context'];
  assert.equal(server.command,elements.command.textContent);assert.equal(server.args[0],elements.argument.textContent);
  assert.ok(server.command.endsWith('\\runtime\\node.exe'));
});
test('payload inventory detects changed bytes and records deterministic relative paths',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'brightspace-payload-'));
  try {
    await writeFile(path.join(directory,'sample.js'),'sample');
    const [first]=await inventory(directory);assert.equal(first.path,'sample.js');assert.equal(first.bytes,6);
    await writeFile(path.join(directory,'sample.js'),'changed');
    const [second]=await inventory(directory);assert.notEqual(second.sha256,first.sha256);
  } finally {
    const resolved=path.resolve(directory);
    if(path.dirname(resolved)!==path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('brightspace-payload-')) throw new Error('Unsafe test cleanup path.');
    await rm(resolved,{recursive:true,force:true});
  }
});
