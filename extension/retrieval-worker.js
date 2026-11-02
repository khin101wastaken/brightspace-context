import {cachePdfMetadata,claimRequest,finishRequest,COMPANION_URL} from './companion-client.js';

export function failureCode(error) {
  if(['NEEDS_LOGIN','ACCESS_DENIED','NETWORK_ERROR','INVALID_PDF'].includes(error?.code)) return error.code;
  if(/exceed|50 MB|budget/i.test(error?.message)) return 'TOO_LARGE';
  if(/not a PDF|not PDF|signature/i.test(error?.message)) return 'INVALID_PDF';
  return 'FAILED';
}

export function createRetrievalWorker({getSettings,report=async()=>{},fetcher=fetch,Socket=WebSocket,url=COMPANION_URL.replace('http:','ws:')+'/v1/worker',heartbeatMs=20000}={}) {
  let socket=null,heartbeat=null,reconnect=null,stopped=false,connecting=false,draining=null,again=false,retryMs=5000;
  const update=value=>Promise.resolve(report(value)).catch(()=>{});
  async function drain() {
    if(draining) {again=true;return draining;}
    draining=(async()=>{
      do {
        again=false;
        while(!stopped) {
          const settings=await getSettings();if(!settings.enabled || !settings.token) return;
          const claimed=await claimRequest(settings.token,fetcher);
          if(!claimed.job) {
            if(claimed.retryClaim) continue;
            if(claimed.blocked==='needs_login') await update({state:'needs_login',message:'Sign into Brightspace in Chrome, then choose Retry requests.'});
            break;
          }
          const {requestId,leaseId,metadata}=claimed.job;
          await update({state:'fetching',message:`Fetching: ${metadata.title}`,requestId});
          try {
            const result=await cachePdfMetadata(metadata,settings.token,fetcher);
            await finishRequest({requestId,leaseId},settings.token,fetcher);
            await update({state:'ready',message:`Ready: ${metadata.title}`,requestId,documentId:result.id});
          } catch(error) {
            const code=failureCode(error);
            await finishRequest({requestId,leaseId,code},settings.token,fetcher);
            await update({state:code==='NEEDS_LOGIN'?'needs_login':'failed',message:code==='NEEDS_LOGIN'?'Sign into Brightspace in Chrome, then choose Retry requests.':`Retrieval failed: ${error.message}`,requestId});
            if(code==='NEEDS_LOGIN') break;
          }
        }
      } while(again && !stopped);
    })();
    try {await draining;} catch(error) {await update({state:'disconnected',message:`Retrieval connection interrupted: ${error.message}`});}
    finally {draining=null;}
  }
  async function connect() {
    if(connecting || socket) return;
    connecting=true;stopped=false;
    try {
      const settings=await getSettings();
      if(stopped || !settings.enabled || !settings.token) return;
      const current=new Socket(url);socket=current;
      current.onopen=()=>{
        if(current!==socket) return;
        current.send(JSON.stringify({type:'authenticate',token:settings.token}));
        heartbeat=setInterval(()=>{if(current.readyState===1) {current.send(JSON.stringify({type:'ping'}));void drain();}},heartbeatMs);
      };
      current.onmessage=event=>{
        if(current!==socket) return;
        try {
          const message=JSON.parse(event.data);
          if(['ready','work-available'].includes(message.type)) {
            if(message.type==='ready') {retryMs=5000;void update({state:'connected',message:'Automatic retrieval connected. Ready for ChatGPT requests.'});}
            void drain();
          }
        } catch {}
      };
      current.onerror=()=>{};
      current.onclose=()=>{
        if(current!==socket) return;
        socket=null;clearInterval(heartbeat);heartbeat=null;
        if(!stopped) {void update({state:'disconnected',message:'Waiting for the companion connection. Requests stay saved.'});reconnect=setTimeout(()=>{reconnect=null;void connect();},retryMs);retryMs=Math.min(retryMs*2,60000);}
      };
    } catch(error) {await update({state:'disconnected',message:error.message});}
    finally {connecting=false;}
  }
  function stop() {stopped=true;clearTimeout(reconnect);clearInterval(heartbeat);reconnect=heartbeat=null;const old=socket;socket=null;old?.close();}
  return {connect,drain,stop};
}
