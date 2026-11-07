import {Worker} from 'node:worker_threads';
import {validateTextOptions} from './text-page.js';

// PDF parsing runs outside the MCP event loop, with bounded time/memory and no
// plaintext disk handoff. Kill a stalled parser rather than hanging all tools.
let active=0;
export function pdfTextPage(bytes,options={}, {timeoutMs=20000,WorkerClass=Worker}={}) {
  validateTextOptions(options);
  if(active>=2)throw new Error('PDF text reader is busy. Retry after the current reading finishes.');
  return new Promise((resolve,reject)=>{
    const input=new Uint8Array(bytes);
    const worker=new WorkerClass(new URL('./pdf-text-worker.js',import.meta.url),{workerData:{bytes:input,options},transferList:[input.buffer],resourceLimits:{maxOldGenerationSizeMb:192},stdout:true,stderr:true});
    active++;
    worker.stdout?.resume();worker.stderr?.resume(); // PDF library diagnostics must never pollute MCP stdout.
    let finished=false;
    const done=(error,result)=>{if(finished)return;finished=true;active--;clearTimeout(timer);void worker.terminate();if(error)reject(error);else resolve(result);};
    const timer=setTimeout(()=>done(new Error('PDF text reading exceeded its 20-second budget. The original remains cached; use a download link to inspect it.')),timeoutMs);
    worker.once('message',message=>done(message.error?new Error(message.error):null,message.result));
    worker.once('error',()=>done(new Error('PDF text reader stopped or exceeded its memory budget. The original remains cached.')));
    worker.once('exit',()=>{if(!finished)done(new Error('PDF text reader exited without a result. The original remains cached.'));});
  });
}
