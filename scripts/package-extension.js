import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync,unzipSync,strFromU8} from 'fflate';

export const EXTENSION_FILES=[
  'manifest.json','background.js','brightspace-client.js','catalog.js','companion-client.js','course-api.js',
  'download.js','file-downloads.js','popup.css','popup.html','popup.js','resources.html','resources.js',
  'retrieval-worker.js','semester.js','tab-context.js','rich-text.js','document-formats.js','search-highlight.js','product-links.js','LICENSE','THIRD-PARTY-LICENSES.txt',
  ...[16,32,48,128].map(size=>`icons/icon-${size}.png`),
];
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function requireFile(files,value) {
  if(typeof value!=='string' || !Object.hasOwn(files,value)) throw new Error(`Missing packaged file: ${value}`);
}
export function validateExtension(files) {
  requireFile(files,'manifest.json');
  requireFile(files,'LICENSE');requireFile(files,'THIRD-PARTY-LICENSES.txt');
  const manifest=JSON.parse(strFromU8(files['manifest.json'] || new Uint8Array()));
  if(manifest.manifest_version!==3 || !/^\d+\.\d+\.\d+$/.test(manifest.version) || !manifest.name || !manifest.description || manifest.description.length>132) throw new Error('Invalid store manifest metadata.');
  const allowed=new Set(['scripting','storage','downloads','alarms']);
  if(!Array.isArray(manifest.permissions) || new Set(manifest.permissions).size!==allowed.size || manifest.permissions.length!==allowed.size || manifest.permissions.some(value=>!allowed.has(value))) throw new Error('Unexpected extension permissions. Review the store permission explanations.');
  const hosts=manifest.host_permissions;
  if(!Array.isArray(hosts) || hosts.length!==2 || !hosts.includes('https://brightspace.nyu.edu/*') || !hosts.includes('http://127.0.0.1/*')) throw new Error('Unexpected host permissions.');
  requireFile(files,manifest.background?.service_worker);requireFile(files,manifest.action?.default_popup);
  for(const size of [16,32,48,128]) {
    const name=manifest.icons?.[size];requireFile(files,name);
    const png=Buffer.from(files[name]);
    if(png.length<24 || png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' || png.readUInt32BE(16)!==size || png.readUInt32BE(20)!==size) throw new Error(`Invalid ${size}px PNG icon.`);
  }
  for(const name of Object.values(manifest.action?.default_icon || {})) requireFile(files,name);
  for(const [filename,bytes] of Object.entries(files)) {
    if(!EXTENSION_FILES.includes(filename)) throw new Error(`Unexpected archive entry: ${filename}`);
    const source=strFromU8(bytes);
    if(filename.endsWith('.js')) {
      for(const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) {
        if(!match[1].startsWith('./')) throw new Error(`Non-local module import in ${filename}`);
        requireFile(files,path.posix.join(path.posix.dirname(filename),match[1]));
      }
    }
    if(filename.endsWith('.html')) {
      for(const match of source.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)) requireFile(files,match[1]);
    }
  }
  requireFile(files,'download.js'); // Explicit runtime scripting.executeScript asset.
  return manifest;
}
export function zipExtension(files) {
  validateExtension(files);
  const zipped=zipSync(Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,[bytes,{mtime:new Date(2020,0,1)}]])),{level:9});
  const unpacked=unzipSync(zipped);validateExtension(unpacked);
  for(const name of EXTENSION_FILES) if(!unpacked[name] || digest(unpacked[name])!==digest(files[name])) throw new Error(`Archive verification failed: ${name}`);
  return zipped;
}
export async function packageExtension() {
  const files={};
  for(const name of EXTENSION_FILES) {
    const filename=path.join(root,'extension',name),info=await lstat(filename);
    if(!info.isFile() || info.isSymbolicLink()) throw new Error(`Extension asset must be a regular file: ${name}`);
    files[name]=new Uint8Array(await readFile(filename));
  }
  const manifest=validateExtension(files);
  // Stable timestamps and an explicit allowlist keep builds reproducible and
  // prevent local courses, browser state, private data or Node from entering ZIPs.
  const zipped=zipExtension(files);
  const output=path.join(root,'dist');await mkdir(output,{recursive:true});
  const archive=path.join(output,`BrightspaceContext-${manifest.version}-chrome-web-store.zip`);
  await writeFile(archive,zipped);
  await writeFile(archive+'.sha256',`${digest(zipped)}  ${path.basename(archive)}\n`);
  await writeFile(path.join(output,`BrightspaceContext-${manifest.version}-extension-files.json`),JSON.stringify({version:manifest.version,zipBytes:zipped.length,files:Object.entries(files).map(([name,bytes])=>({name,bytes:bytes.length,sha256:digest(bytes)}))},null,2)+'\n');
  console.log(`Verified extension ZIP: ${archive}\n${EXTENSION_FILES.length} files · ${zipped.length} bytes · manifest.json at archive root\nStore listing, privacy URL, screenshots and reviewer access still need preparation.`);
  return {archive,manifest};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) packageExtension().catch(error=>{console.error(error.message);process.exitCode=1;});
