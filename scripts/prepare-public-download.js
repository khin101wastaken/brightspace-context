import {readFile,writeFile,mkdir,cp,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PRODUCT_LINKS,PRODUCT_VERSION} from '../extension/product-links.js';
import {COMPANION_VERSION} from '../companion/version.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(path.join(root,'extension/manifest.json'),'utf8'));
const build=JSON.parse(await readFile(path.join(root,'dist/latest-build.json'),'utf8'));
if(build.version!==COMPANION_VERSION || build.extensionVersion!==PRODUCT_VERSION || manifest.version!==PRODUCT_VERSION) throw new Error('Build must match the companion and bundled extension versions.');
const downloadUrl=new URL(`/downloads/BrightspaceContext-${COMPANION_VERSION}-windows-x64-setup.exe`,PRODUCT_LINKS.setup).href;
const expected=path.join(root,'dist',`BrightspaceContext-${COMPANION_VERSION}-windows-x64-setup.exe`);
if(path.resolve(build.artifact)!==expected) throw new Error('Unexpected installer path.');
const info=await lstat(expected);if(!info.isFile() || info.isSymbolicLink()) throw new Error('Installer must be a regular file.');
const installer=await readFile(expected);
const digest=createHash('sha256').update(installer).digest('hex');
if(digest!==build.sha256) throw new Error('Installer checksum differs from the verified build.');
const site=path.join(root,'sites/brightspace-context-privacy/dist');await mkdir(path.join(site,'downloads'),{recursive:true});await mkdir(path.join(site,'setup'),{recursive:true});
await mkdir(path.join(site,'assets'),{recursive:true});
await cp(path.join(root,'store/site.css'),path.join(site,'assets/site.css'));
const filename=path.basename(expected);
const size=`${(info.size/1024/1024).toFixed(1)} MiB`;
if(info.size>25*1024*1024) {
  const partSize=16*1024*1024;
  const parts=Math.ceil(info.size/partSize);
  for(let part=0;part<parts;part++) await writeFile(path.join(site,'downloads',`${filename}.part${part+1}`),installer.subarray(part*partSize,(part+1)*partSize));
  let downloadPage=await readFile(path.join(root,'store/installer-download.html'),'utf8');
  let downloadScript=await readFile(path.join(root,'store/installer-download.js'),'utf8');
  const values={VERSION:COMPANION_VERSION,FILENAME:filename,SIZE:size,SHA256:digest,BYTES:String(info.size),PARTS:String(parts)};
  for(const [key,value] of Object.entries(values)) {
    downloadPage=downloadPage.replaceAll(`{{${key}}}`,value);
    downloadScript=downloadScript.replaceAll(`{{${key}}}`,value);
  }
  if(/\{\{[A-Z_]+\}\}/.test(downloadPage+downloadScript)) throw new Error('Unfilled installer download placeholder.');
  await writeFile(path.join(site,'downloads',filename+'.html'),downloadPage);
  await writeFile(path.join(site,'downloads',`download-${COMPANION_VERSION}.js`),downloadScript);
} else {
  await cp(expected,path.join(site,'downloads',filename));
}
await cp(expected+'.sha256',path.join(site,'downloads',path.basename(expected)+'.sha256'));
let html=await readFile(path.join(root,'store/setup-guide.html'),'utf8');
for(const [key,value] of Object.entries({VERSION:COMPANION_VERSION,EXTENSION_VERSION:PRODUCT_VERSION,DOWNLOAD_URL:downloadUrl,CHECKSUM_URL:downloadUrl+'.sha256',SIZE:size})) html=html.replaceAll(`{{${key}}}`,value);
if(/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('Unfilled setup placeholder.');
await writeFile(path.join(site,'setup/index.html'),html);
console.log(`Prepared public setup and checksum-verified installer: ${COMPANION_VERSION} (${info.size} bytes).`);
