import {cp,mkdir,readFile,readdir,writeFile,lstat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PAYLOAD_SOURCES=['extension','companion','mcp','package.json','package-lock.json','LICENSE'];
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyChecksum(bytes,expected) {
  if(!/^[a-f0-9]{64}$/.test(expected) || hash(bytes)!==expected) throw new Error('Download checksum mismatch. Refusing to package the runtime.');
}
export async function inventory(directory,prefix='') {
  const files=[];
  for(const name of (await readdir(path.join(directory,prefix))).sort()) {
    const relative=prefix?`${prefix}/${name}`:name,filename=path.join(directory,relative),stat=await lstat(filename);
    if(stat.isSymbolicLink()) throw new Error(`Payload contains a symlink: ${relative}`);
    if(stat.isDirectory()) files.push(...await inventory(directory,relative));
    else if(stat.isFile()) files.push({path:relative,bytes:stat.size,sha256:hash(await readFile(filename))});
    else throw new Error(`Unsupported payload entry: ${relative}`);
  }
  return files;
}
function run(command,args,options={}) {
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`${path.basename(command)} failed (${result.status}).`);
}
async function download(url,destination,expected) {
  let bytes;
  try {bytes=await readFile(destination);} catch(error) {if(error.code!=='ENOENT') throw error;}
  if(!bytes) {
    const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
    if(!response.ok) throw new Error(`Runtime download failed (HTTP ${response.status}).`);
    bytes=Buffer.from(await response.arrayBuffer());verifyChecksum(bytes,expected);
    await writeFile(destination,bytes);
  } else verifyChecksum(bytes,expected);
}
export async function buildWindows() {
  if(process.platform!=='win32' || process.arch!=='x64') throw new Error('Build on Windows x64. Mac/Linux installers are not implemented.');
  const config=JSON.parse(await readFile(path.join(root,'packaging/windows/build-config.json')));
  const {version}=JSON.parse(await readFile(path.join(root,'extension/manifest.json')));
  if(!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid application version.');
  const compiler=process.env.BRIGHTSPACE_ISCC || path.join(root,'.cache/build-tools/inno/ISCC.exe');
  await lstat(compiler).catch(()=>{throw new Error('Inno Setup compiler not found. Set BRIGHTSPACE_ISCC to ISCC.exe. See docs/WINDOWS-INSTALLER.md.');});
  const npm=process.env.npm_execpath;
  if(!npm || !path.isAbsolute(npm)) throw new Error('Run this builder using npm run build:windows.');
  const work=path.join(root,'.cache/windows-installer',`${version}-${randomUUID()}`),payload=path.join(work,'payload'),app=path.join(payload,'app');
  const downloads=path.join(root,'.cache/build-downloads'),release=path.join(root,'dist');
  await Promise.all([mkdir(app,{recursive:true}),mkdir(downloads,{recursive:true}),mkdir(release,{recursive:true})]);
  for(const source of PAYLOAD_SOURCES) await cp(path.join(root,source),path.join(app,source),{recursive:true,errorOnExist:true,force:false});
  run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:app});
  const archive=path.join(downloads,config.nodeArchive);
  await download(`https://nodejs.org/dist/v${config.nodeVersion}/${config.nodeArchive}`,archive,config.nodeSha256);
  // Paths travel through environment variables, never shell-interpolated code.
  run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:BS_BUILD_ARCHIVE,$env:BS_BUILD_EXTRACT)"],{env:{...process.env,BS_BUILD_ARCHIVE:archive,BS_BUILD_EXTRACT:path.join(work,'node')}});
  const nodeDirectory=path.join(work,'node',config.nodeArchive.slice(0,-4));
  await mkdir(path.join(payload,'runtime'));
  for(const name of ['node.exe','LICENSE']) await cp(path.join(nodeDirectory,name),path.join(payload,'runtime',name));
  const launcher=await readFile(path.join(root,'packaging/windows/Start Companion.cmd'),'utf8');
  await writeFile(path.join(payload,'Start Companion.cmd'),launcher.replace(/\r?\n/g,'\r\n'));
  // Windows checkouts may use CRLF. HTML parsing normalizes newlines before
  // executing inline scripts, so hash and emit the same normalized source.
  let guide=(await readFile(path.join(root,'packaging/windows/SETUP.html'),'utf8')).replace(/\r\n/g,'\n');
  const script=guide.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
  if(!script) throw new Error('Setup guide script is missing.');
  guide=guide.replace('sha256-PLACEHOLDER',`sha256-${createHash('sha256').update('\n'+script).digest('base64')}`);
  await writeFile(path.join(payload,'SETUP.html'),guide);
  const files=await inventory(payload);
  await writeFile(path.join(payload,'PAYLOAD.json'),JSON.stringify({version,platform:'windows-x64',nodeVersion:config.nodeVersion,nodeArchiveSha256:config.nodeSha256,files},null,2)+'\n');
  run(compiler,['/Q',`/DPayloadDir=${payload}`,`/DReleaseDir=${release}`,`/DAppVersion=${version}`,path.join(root,'packaging/windows/installer.iss')]);
  const artifact=path.join(release,`BrightspaceContext-${version}-windows-x64-setup.exe`);
  const checksum=hash(await readFile(artifact));
  await writeFile(artifact+'.sha256',`${checksum}  ${path.basename(artifact)}\n`);
  await writeFile(path.join(release,'latest-build.json'),JSON.stringify({version,artifact,payload,sha256:checksum},null,2)+'\n');
  console.log(`Installer: ${artifact}\nSHA-256: ${checksum}\nPayload: ${payload}`);
  return {artifact,payload};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  buildWindows().catch(error=>{console.error(error.message);process.exitCode=1;});
}
