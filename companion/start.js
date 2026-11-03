import {createCompanion} from './server.js';
import {cacheDirectory} from './paths.js';
const directory=cacheDirectory();
const app=await createCompanion({directory});
console.log(`Brightspace companion running at ${app.url}\nCache: ${directory}\nPairing code: ${app.pairingCode}\nEnter this code on the extension's Connect screen. Keep this process running.`);
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>app.close().then(()=>process.exit(0)));
