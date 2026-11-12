import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {PAYLOAD_SOURCES,compareWindowsVersions,inventory,verifyChecksum} from '../scripts/build-windows.js';
import {codexSetup} from '../companion/codex-setup.js';
import {parse} from 'smol-toml';

test('packaging copies an explicit source allowlist rather than workspace or private runtime data',()=>{
  assert.deepEqual(PAYLOAD_SOURCES,['extension','companion','mcp','package.json','package-lock.json','LICENSE']);
});
test('runtime checksum rejects modified bytes and malformed expected hashes',()=>{
  const bytes=Buffer.from('runtime fixture'),digest=createHash('sha256').update(bytes).digest('hex');
  assert.doesNotThrow(()=>verifyChecksum(bytes,digest));
  assert.throws(()=>verifyChecksum(Buffer.from('modified'),digest),/checksum mismatch/);
  assert.throws(()=>verifyChecksum(bytes,''),/checksum mismatch/);
});
test('Windows upgrade order compares local revisions separately from public releases',()=>{
  assert.equal(compareWindowsVersions('0.10.0','0.10.0.1'),-1);
  assert.equal(compareWindowsVersions('0.10.0.9','0.10.0.10'),-1);
  assert.equal(compareWindowsVersions('0.10.0.20','0.10.1'),-1);
  assert.equal(compareWindowsVersions('0.10.1.1','0.10.1'),1);
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

test('Codex setup adds one entry without rewriting existing settings or replacing a custom entry',async t=>{
  const home=await mkdtemp(path.join(os.tmpdir(),'brightspace-codex-'));
  t.after(async()=>{
    if(path.dirname(home)!==path.resolve(os.tmpdir()) || !path.basename(home).startsWith('brightspace-codex-')) throw new Error('Unsafe test cleanup path.');
    await rm(home,{recursive:true,force:true});
  });
  const filename=path.join(home,'config.toml');
  const original='model = "test"\r\n# Keep comments and other servers.\r\n[mcp_servers.other]\r\ncommand = "other.exe"\r\n';
  await writeFile(filename,original);
  const settings={home,directory:'C:\\User Data\\Brightspace cache',port:47653,command:'C:\\Program Files\\node.exe',script:'C:\\Program Files\\Brightspace\\start.js'};
  const register=codexSetup(settings);
  assert.deepEqual(await register(),{state:'added'});
  const updated=await readFile(filename,'utf8');
  assert.ok(updated.startsWith(original));
  const entry=parse(updated).mcp_servers['brightspace-context'];
  assert.deepEqual({...entry,env:{...entry.env}},{
    command:settings.command,args:[settings.script],
    env:{BRIGHTSPACE_CACHE_DIR:settings.directory,BRIGHTSPACE_COMPANION_PORT:'47653'},
  });
  assert.deepEqual(await register(),{state:'configured'});
  assert.deepEqual(await codexSetup({...settings,port:12345})(),{state:'existing'});
  assert.equal(await readFile(filename,'utf8'),updated);
  await writeFile(filename,'[invalid');
  await assert.rejects(register(),/could not be read as TOML/);
  assert.equal(await readFile(filename,'utf8'),'[invalid');
});
