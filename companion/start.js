import {createCompanion} from './server.js';
import {cacheDirectory} from './paths.js';
import {createLogger} from './logging.js';
const log=createLogger({level:process.env.BRIGHTSPACE_LOG_LEVEL || 'info'});
const directory=cacheDirectory();
const port=Number(process.env.BRIGHTSPACE_COMPANION_PORT || 47653);
try {
  if(!Number.isInteger(port) || port<0 || port>65535) throw Object.assign(new Error('Invalid companion port.'),{code:'INVALID_PORT'});
  log('app.starting',{pid:process.pid,runtime:process.version,directory});
  const app=await createCompanion({directory,port,log});
  const stats=await app.cache.stats();log('app.ready',{url:app.url,files:stats.files,bytes:stats.usedBytes});
  // The pairing code is an intentional one-time console prompt, never a field
  // in the diagnostic logger. Event logs never include credentials or headers.
  console.log(`Brightspace companion running at ${app.url}\nCache: ${directory}\nPairing code: ${app.pairingCode}\nEnter this code on the extension's Connect screen. Keep this process running.`);
  let stopping=false;
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{
    if(stopping) return;stopping=true;log('app.stopping',{signal});
    app.close().then(()=>{log('app.stopped');process.exit(0);});
  });
} catch(error) {
  log('app.start_failed',{code:/^[A-Z][A-Z0-9_]{0,39}$/.test(error.code || '')?error.code:'START_FAILED',directory,port});
  console.error(error.code==='EADDRINUSE'?'Another companion is already using this port. Close it before starting a new copy.':/^(?:VAULT_|KEY_PROTECTION|MIGRATION_CONFLICT)/.test(error.code || '')?'Protected storage could not be unlocked or migrated. Keep the original cache, key files and Windows profile; no data was reset. Close older app copies and check the reported error code.':'Check the cache location and configuration, then try again.');
  process.exitCode=1;
}
