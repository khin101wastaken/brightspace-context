import {cp,mkdir,readFile,symlink,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {COMPANION_VERSION} from '../companion/version.js';
import {PAYLOAD_SOURCES,verifyChecksum} from './build-windows.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'packaging/macos');
const name='Brightspace Context';
const bundleId='io.github.khin101wastaken.brightspace-context';

function run(executable,args,options={}) {
  const result=spawnSync(executable,args,{cwd:root,stdio:'inherit',...options});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`${executable} failed (${result.status}).`);
}

function bundleVersions(version) {
  if(!/^\d{1,2}\.\d{1,2}\.\d{1,2}(?:\.\d{1,2})?$/.test(version)) throw new Error('Invalid companion version.');
  const [major,beta,release,revision=0]=version.split('.').map(Number);
  return {release:`${major}.${beta}.${release}`,build:`${Math.max(1,major*100+beta)}.${release}.${revision}`};
}

async function runtimeArchive(config,directory) {
  const archive=path.join(directory,config.nodeArchive);
  let bytes;
  try {bytes=await readFile(archive);} catch(error) {if(error.code!=='ENOENT') throw error;}
  if(bytes) {verifyChecksum(bytes,config.nodeSha256);return archive;}
  const response=await fetch(`https://nodejs.org/dist/v${config.nodeVersion}/${config.nodeArchive}`,{signal:AbortSignal.timeout(120000)});
  if(!response.ok) throw new Error(`Node download failed (HTTP ${response.status}).`);
  bytes=Buffer.from(await response.arrayBuffer());
  verifyChecksum(bytes,config.nodeSha256);
  await writeFile(archive,bytes);
  return archive;
}

export async function buildMac() {
  if(process.platform!=='darwin' || process.arch!=='arm64') throw new Error('Run this builder natively on an Apple silicon Mac with Xcode command line tools.');
  const npm=process.env.npm_execpath;
  if(!npm || !path.isAbsolute(npm)) throw new Error('Run this builder using npm run build:macos.');
  const version=COMPANION_VERSION,{release,build}=bundleVersions(version);
  const config=JSON.parse(await readFile(path.join(source,'build-config.json'),'utf8'));
  const identity=process.env.BRIGHTSPACE_MAC_SIGN_IDENTITY || '-',profile=process.env.BRIGHTSPACE_MAC_NOTARY_PROFILE;
  if(profile && identity==='-') throw new Error('Notarization requires a Developer ID Application signing identity.');

  const work=path.join(root,'.cache/macos-installer',`${version}-${randomUUID()}`),image=path.join(work,'image');
  const bundle=path.join(image,`${name}.app`),contents=path.join(bundle,'Contents');
  const macos=path.join(contents,'MacOS'),resources=path.join(contents,'Resources'),app=path.join(resources,'app');
  const downloads=path.join(root,'.cache/build-downloads'),dist=path.join(root,'dist');
  await Promise.all([app,macos,downloads,dist].map(dir=>mkdir(dir,{recursive:true})));
  const archive=await runtimeArchive(config,downloads);
  run('/usr/bin/tar',['-xzf',archive,'-C',work]);
  const runtime=path.join(work,config.nodeArchive.replace(/\.tar\.gz$/,''));
  await cp(path.join(runtime,'bin','node'),path.join(macos,'node'));
  await cp(path.join(runtime,'LICENSE'),path.join(resources,'Node-LICENSE'));
  for(const member of PAYLOAD_SOURCES) await cp(path.join(root,member),path.join(app,member),{recursive:true,errorOnExist:true,force:false});
  run(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-bin-links','--no-audit','--no-fund'],{cwd:app});

  const plist=(await readFile(path.join(source,'Info.plist'),'utf8')).replace('@RELEASE_VERSION@',release).replace('@BUILD_VERSION@',build).replace('@DISPLAY_VERSION@',version);
  await writeFile(path.join(contents,'Info.plist'),plist);
  await cp(path.join(source,'SETUP.html'),path.join(resources,'SETUP.html'));
  run('/usr/bin/plutil',['-lint',path.join(contents,'Info.plist')]);

  const iconset=path.join(work,'AppIcon.iconset');
  await mkdir(iconset);
  const icon=path.join(root,'extension/icons/icon-128.png');
  for(const size of [16,32,128,256,512]) {
    for(const scale of [1,2]) {
      const pixels=String(size*scale),filename=`icon_${size}x${size}${scale===2?'@2x':''}.png`;
      run('/usr/bin/sips',['-z',pixels,pixels,icon,'--out',path.join(iconset,filename)],{stdio:['ignore','ignore','inherit']});
    }
  }
  run('/usr/bin/iconutil',['-c','icns',iconset,'-o',path.join(resources,'AppIcon.icns')]);

  const swift=['swiftc','-swift-version','5','-target','arm64-apple-macos13.0','-O'];
  const keychain=path.join(macos,'BrightspaceKeychain');
  run('/usr/bin/xcrun',[...swift,'-framework','Security',path.join(source,'Keychain.swift'),'-o',keychain]);
  run('/usr/bin/xcrun',[...swift,'-parse-as-library','-framework','AppKit','-framework','Security',path.join(source,'CompanionApp.swift'),path.join(source,'PairingPanel.swift'),'-o',path.join(macos,'BrightspaceContext')]);

  const sign=['--force','--sign',identity,...(identity==='-'?[]:['--timestamp','--options','runtime'])];
  run('/usr/bin/codesign',[...sign,'--identifier',`${bundleId}.keychain`,keychain]);
  const nodeFlags=identity==='-'?[]:['--entitlements',path.join(source,'Node.entitlements.plist')];
  run('/usr/bin/codesign',[...sign,'--identifier',`${bundleId}.node`,...nodeFlags,path.join(macos,'node')]);
  run('/usr/bin/codesign',[...sign,bundle]);
  run('/usr/bin/codesign',['--verify','--deep','--strict',bundle]);

  await symlink('/Applications',path.join(image,'Applications'));
  const artifact=path.join(dist,`BrightspaceContext-${version}-macos-arm64.dmg`);
  run('/usr/bin/hdiutil',['create','-volname',name,'-srcfolder',image,'-format','UDZO','-ov',artifact]);
  if(identity!=='-') run('/usr/bin/codesign',['--force','--sign',identity,'--timestamp',artifact]);
  if(profile) {
    run('/usr/bin/xcrun',['notarytool','submit',artifact,'--keychain-profile',profile,'--wait']);
    run('/usr/bin/xcrun',['stapler','staple',artifact]);
    run('/usr/bin/xcrun',['stapler','validate',artifact]);
  }
  const sha256=createHash('sha256').update(await readFile(artifact)).digest('hex');
  await writeFile(artifact+'.sha256',`${sha256}  ${path.basename(artifact)}\n`);
  await writeFile(path.join(dist,'latest-macos-build.json'),JSON.stringify({version,platform:'macos-arm64',nodeVersion:config.nodeVersion,artifact,bundle,sha256,developerId:identity!=='-',notarized:!!profile},null,2)+'\n');
  console.log(`macOS image: ${artifact}\nSHA-256: ${sha256}\nApp bundle: ${bundle}`);
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  buildMac().catch(error=>{console.error(error.message);process.exitCode=1;});
}
