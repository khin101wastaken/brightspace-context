import {mkdir,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse,stringify} from 'smol-toml';
import {atomicWrite} from './files.js';

const name='brightspace-context';
export function codexSetup({directory,port,home=process.env.CODEX_HOME || path.join(os.homedir(),'.codex'),
  command=process.execPath,script=fileURLToPath(new URL('../mcp/start.js',import.meta.url))}={}) {
  const config=path.join(home,'config.toml');
  const args=[script],env={BRIGHTSPACE_CACHE_DIR:directory,BRIGHTSPACE_COMPANION_PORT:String(port)};
  let writing=false;
  return async()=>{
    if(writing) throw new Error('Codex setup is already running.');
    writing=true;
    try {
      const load=async()=>readFile(config,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
      const original=await load(),source=original?.replace(/^\uFEFF/,'') ?? '';
      let existing;
      try {existing=parse(source).mcp_servers?.[name];}
      catch {throw new Error('Codex settings could not be read as TOML. Open MCP servers in Codex to add Brightspace manually.');}
      if(existing!==undefined) {
        if(existing?.command===command && existing.args?.length===1 && existing.args[0]===script &&
          existing.env?.BRIGHTSPACE_CACHE_DIR===directory && existing.env?.BRIGHTSPACE_COMPANION_PORT===String(port) &&
          existing.enabled!==false) return {state:'configured'};
        return {state:'existing'};
      }
      const ending=source.includes('\r\n')?'\r\n':'\n';
      const addition=stringify({mcp_servers:{[name]:{command,args,env}}}).replace(/^\[mcp_servers\]\n\n?/,'');
      // Append only the new table so comments, formatting and unknown settings survive.
      const updated=source+(source?ending+ending:'')+addition.replaceAll('\n',ending);
      try {parse(updated);}
      catch {throw new Error('The current Codex settings require manual setup. Open MCP servers in Codex to add Brightspace.');}
      await mkdir(home,{recursive:true,mode:0o700});
      if(await load()!==original) throw new Error('Codex settings changed during setup. Try again.');
      await atomicWrite(config,(original?.startsWith('\uFEFF')?'\uFEFF':'')+updated);
      return {state:'added'};
    } finally {writing=false;}
  };
}
