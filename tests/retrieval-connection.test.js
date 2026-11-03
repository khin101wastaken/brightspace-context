import test from 'node:test';
import assert from 'node:assert/strict';
import {createRetrievalWorker} from '../extension/retrieval-worker.js';

const settings=async()=>({enabled:true,token:'test-token'});
const healthy=async()=>new Response('{}',{headers:{'Content-Type':'application/json'}});
function signal() {let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}

test('offline companion is reported before opening a WebSocket',async()=>{
  let sockets=0;const reports=[];
  const worker=createRetrievalWorker({getSettings:settings,fetcher:async()=>{throw new Error('Unavailable');},Socket:class {constructor(){sockets++;}},report:value=>reports.push(value)});
  try {
    await worker.connect();
    assert.equal(sockets,0);assert.equal(reports.at(-1).state,'disconnected');assert.match(reports.at(-1).message,/requests stay saved/);
  } finally {worker.stop();}
});

test('a handshake that never opens is closed on our deadline rather than blocking reconnect forever',async()=>{
  const failed=signal();let closed=0;
  const worker=createRetrievalWorker({getSettings:settings,fetcher:healthy,connectionTimeoutMs:20,
    Socket:class {readyState=0;close(){closed++;this.readyState=3;this.onclose?.();}},
    report:value=>{if(value.message.includes('timed out')) failed.resolve(value);},
  });
  try {
    await worker.connect();const result=await failed.promise;
    assert.equal(result.state,'disconnected');assert.equal(closed,1);assert.match(result.message,/Retrying automatically/);
  } finally {worker.stop();}
});

test('pausing during an in-flight health check prevents a late socket connection',async()=>{
  const entered=signal(),response=signal();let sockets=0;
  const worker=createRetrievalWorker({getSettings:settings,fetcher:()=>{entered.resolve();return response.promise;},Socket:class {constructor(){sockets++;}}});
  const pending=worker.connect();await entered.promise;worker.stop();response.resolve(await healthy());await pending;
  assert.equal(sockets,0);
});

test('a silent open socket is replaced when keepalive responses stop arriving',async()=>{
  const failed=signal();let closed=0;
  class SilentSocket {
    readyState=1;
    constructor(){queueMicrotask(()=>{this.onopen?.();this.onmessage?.({data:JSON.stringify({type:'ready'})});});}
    send(){}
    close(){closed++;this.readyState=3;this.onclose?.();}
  }
  const worker=createRetrievalWorker({getSettings:settings,fetcher:async url=>new Response(JSON.stringify(url.endsWith('/claim')?{job:null}:{}),{headers:{'Content-Type':'application/json'}}),Socket:SilentSocket,heartbeatMs:10,report:value=>{if(value.message.includes('went idle')) failed.resolve(value);}});
  try {await worker.connect();assert.equal((await failed.promise).state,'disconnected');assert.equal(closed,1);}
  finally {worker.stop();}
});
