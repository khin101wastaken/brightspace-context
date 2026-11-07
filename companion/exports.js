import {mkdir,readdir,stat,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {restrictDirectory} from './key-protection.js';

export const EXPORT_TTL_MS=15*60*1000;
const owned=/^[a-f0-9-]{36}\.(?:pdf|pptx|docx)$/;
export async function openExports(directory,{now=Date.now,restrict=restrictDirectory,budgetBytes=100*1024*1024}={}) {
  let enabled=false,closed=false;
  const root=path.join(path.resolve(directory),'temporary-exports');
  await mkdir(root,{recursive:true,mode:0o700});await restrict(root);
  const clean=async(all=false)=>{
    const names=await readdir(root).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    for(const name of names) if(owned.test(name)) {
      const file=path.join(root,name),info=await stat(file).catch(()=>null);
      if(info?.isFile() && (all || info.mtimeMs+EXPORT_TTL_MS<=now()))await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    }
  };
  await clean();
  const timer=setInterval(()=>{clean().catch(()=>{});},30000);timer.unref();
  let queue=Promise.resolve();
  return {
    clean,
    setEnabled:value=>{const task=queue.then(async()=>{enabled=value===true;if(!enabled)await clean(true);});queue=task.catch(()=>{});return task;},
    create:(entry,bytes)=>{
      const task=queue.then(async()=>{
        if(closed || !enabled)throw new Error('Temporary exports are disabled.');
        await clean();let used=0;
        for(const name of await readdir(root))if(owned.test(name))used+=(await stat(path.join(root,name))).size;
        if(used+bytes.length>budgetBytes)throw new Error('Temporary exports exceed their 100 MB budget. Wait for expiration or disable exports to remove them.');
        const filename=path.join(root,randomUUID()+'.'+entry.extension);
        await writeFile(filename,bytes,{flag:'wx',mode:0o600});
        return {localPath:filename,expiresAt:new Date(now()+EXPORT_TTL_MS).toISOString(),unencrypted:true,warning:'This requested compatibility export is an unencrypted local file. It expires after 15 minutes and is removed on normal companion shutdown. A crash can leave it until the next companion start. The persistent cache remains encrypted.'};
      });queue=task.catch(()=>{});return task;
    },
    close:async()=>{closed=true;clearInterval(timer);await queue;await clean(true);},
  };
}
