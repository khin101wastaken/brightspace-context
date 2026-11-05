import {cacheDocumentMetadata,claimRequest,finishRequest,progressRequest,companionStatus,COMPANION_URL} from './companion-client.js';

export function failureCode(error) {
  if(['NEEDS_LOGIN','ACCESS_DENIED','NETWORK_ERROR','INVALID_PDF','INVALID_FILE','RATE_LIMITED','SYNC_FAILED','PAUSED'].includes(error?.code)) return error.code;
  if(/exceed|50 MB|budget/i.test(error?.message)) return 'TOO_LARGE';
  if(/not a PDF|not PDF|signature/i.test(error?.message)) return 'INVALID_PDF';
  return 'FAILED';
}

export function createRetrievalWorker({getSettings,report=async()=>{},syncCatalogRequest,fetcher=fetch,Socket=WebSocket,url=COMPANION_URL.replace('http:','ws:')+'/v1/worker',heartbeatMs=20000,connectionTimeoutMs=8000,leaseHeartbeatMs=30000}={}) {
  let socket=null,heartbeat=null,deadline=null,reconnect=null,stopped=false,connecting=false,draining=null,again=false,retryMs=5000,generation=0;
  const update=value=>Promise.resolve(report(value)).catch(()=>{});
  function retry(message) {
    if(stopped) return;
    void update({state:'disconnected',message});
    if(!reconnect) {reconnect=setTimeout(()=>{reconnect=null;void connect();},retryMs);retryMs=Math.min(retryMs*2,60000);}
  }
  function release(current,message) {
    if(current!==socket) return;
    socket=null;clearInterval(heartbeat);clearTimeout(deadline);heartbeat=deadline=null;
    // Keep the error handler attached while closing a pending handshake; stale
    // socket events must never disconnect a newer connection.
    try {if(current.readyState<2) current.close();} catch {}
    retry(message);
  }
  async function drain() {
    if(draining) {again=true;return draining;}
    draining=(async()=>{
      do {
        again=false;
        while(!stopped) {
          const settings=await getSettings();if(!settings.enabled || !settings.token) return;
          const claimed=await claimRequest(settings.token,fetcher,{catalogSync:!!syncCatalogRequest});
          if(!claimed.job) {
            if(claimed.retryClaim) continue;
            if(claimed.blocked==='needs_login') await update({state:'needs_login',message:'Sign into Brightspace in Chrome, then choose Retry requests.'});
            break;
          }
          const {requestId,leaseId,metadata,sync}=claimed.job,isSync=claimed.job.kind==='catalog-sync',attempt=generation;
          let leaseTimer=null,leaseError=null,progress={phase:'discovering'},renewing=Promise.resolve();
          const assertActive=async()=>{const current=await getSettings();if(stopped || generation!==attempt || !current.enabled || current.token!==settings.token) throw Object.assign(new Error('Model requests paused or connection changed.'),{code:'PAUSED'});if(leaseError) throw leaseError;};
          const renew=()=>{renewing=renewing.then(async()=>{await assertActive();await progressRequest({requestId,leaseId,progress},settings.token,fetcher);});return renewing;};
          await update({state:'fetching',message:isSync?'Refreshing Brightspace catalog…':`Fetching: ${metadata.title}`,requestId});
          try {
            if(isSync) {
              const onProgress=async value=>{progress=value;await renew();await update({state:'fetching',message:`Catalog sync: ${progress.phase}${progress.total!=null?` · ${progress.completed}/${progress.total} courses`:''}`,requestId});};
              leaseTimer=setInterval(()=>{void renew().catch(error=>{leaseError=error;});},leaseHeartbeatMs);
              const result=await syncCatalogRequest(sync,{onProgress,assertActive});
              await assertActive();await renewing;
              const finished=await finishRequest({requestId,leaseId,result,code:result.code},settings.token,fetcher);
              await update({state:finished.state==='ready'?'ready':finished.state,message:finished.state==='ready'?'Brightspace catalog refreshed. No files downloaded.':finished.error,requestId});
              if(result.code==='NEEDS_LOGIN' || result.code==='PAUSED') return;
              continue;
            }
            const result=await cacheDocumentMetadata(metadata,settings.token,fetcher);
            await finishRequest({requestId,leaseId},settings.token,fetcher);
            await update({state:'ready',message:`Ready: ${metadata.title}`,requestId,documentId:result.id});
          } catch(error) {
            const code=failureCode(error);
            await finishRequest({requestId,leaseId,code},settings.token,fetcher);
            await update({state:code==='NEEDS_LOGIN'?'needs_login':'failed',message:code==='NEEDS_LOGIN'?'Sign into Brightspace in Chrome, then choose Retry requests.':`Retrieval failed: ${error.message}`,requestId});
            if(code==='NEEDS_LOGIN' || code==='PAUSED') break;
          } finally {clearInterval(leaseTimer);}
        }
      } while(again && !stopped);
    })();
    try {await draining;} catch(error) {await update({state:'disconnected',message:`Retrieval connection interrupted: ${error.message}`});}
    finally {draining=null;}
  }
  async function connect() {
    if(connecting || socket) return;
    connecting=true;stopped=false;const attempt=++generation;
    clearTimeout(reconnect);reconnect=null;
    try {
      const settings=await getSettings();
      if(stopped || attempt!==generation || !settings.enabled || !settings.token) return;
      // An absent/stopped companion is an expected state. Avoid opening noisy
      // sockets until its authenticated HTTP endpoint is actually reachable.
      await companionStatus(settings.token,fetcher,{timeoutMs:5000});
      if(stopped || attempt!==generation) return;
      const current=new Socket(url);socket=current;
      let lastSeen=Date.now(),authenticated=false;
      deadline=setTimeout(()=>release(current,'The companion connection timed out. Retrying automatically; requests stay saved.'),connectionTimeoutMs);
      current.onopen=()=>{
        if(current!==socket) return;
        current.send(JSON.stringify({type:'authenticate',token:settings.token,capabilities:syncCatalogRequest?['catalog-sync']:[]}));
      };
      current.onmessage=event=>{
        if(current!==socket) return;
        try {
          const message=JSON.parse(event.data);
          if(message.type==='pong') lastSeen=Date.now();
          if(['ready','work-available'].includes(message.type)) {
            if(message.type==='ready' && !authenticated) {
              authenticated=true;lastSeen=Date.now();retryMs=5000;clearTimeout(deadline);deadline=null;
              heartbeat=setInterval(()=>{
                if(current!==socket) return;
                if(Date.now()-lastSeen>heartbeatMs*2.5) {release(current,'The companion connection went idle. Reconnecting; requests stay saved.');return;}
                if(current.readyState===1) {current.send(JSON.stringify({type:'ping'}));void drain();}
              },heartbeatMs);
              void update({state:'connected',message:'Automatic retrieval connected. Ready for ChatGPT requests.'});
            }
            void drain();
          }
        } catch {}
      };
      current.onerror=()=>release(current,'The browser could not connect to the companion. Retrying automatically; requests stay saved.');
      current.onclose=()=>release(current,'Waiting for the companion connection. Requests stay saved.');
    } catch(error) {if(attempt===generation) retry(`Companion unavailable: ${error.message}. Start Brightspace Context; requests stay saved.`);}
    finally {if(attempt===generation) connecting=false;}
  }
  function stop() {stopped=true;generation++;connecting=false;clearTimeout(reconnect);clearTimeout(deadline);clearInterval(heartbeat);reconnect=heartbeat=deadline=null;const old=socket;socket=null;try {old?.close();} catch {}}
  return {connect,drain,stop};
}
