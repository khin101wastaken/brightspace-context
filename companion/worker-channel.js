import {WebSocketServer,WebSocket} from 'ws';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {safeLogger} from './logging.js';
import {activityCapability,activityResultLimit,activityTimeoutMs} from '../extension/activity-protocol.js';

export function createWorkerChannel(server,{getClient,isReady,log=()=>{}}) {
  const emit=safeLogger(log);
  const wss=new WebSocketServer({noServer:true,maxPayload:activityResultLimit,perMessageDeflate:false}),sessions=new Map();
  const matches=(a,b)=>typeof a==='string' && typeof b==='string' && a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));
  const valid=entry=>entry.authenticated && entry.origin===getClient()?.origin && matches(entry.token,getClient()?.token);
  const activityUnavailable={code:'WORKER_UNAVAILABLE',error:'Start the companion, update or reload the Chrome extension, and enable automatic retrieval before trying again.'};
  const activityWorker=(ws,entry)=>entry.courseActivity && entry.provider==='nyu' && valid(entry) && ws.readyState===WebSocket.OPEN && Date.now()-entry.lastSeen<45000;
  server.on('upgrade',(req,socket,head)=>{
    if(!['/v1/worker','/demo-api/v1/worker'].includes(req.url) || req.headers.host!==`127.0.0.1:${server.address()?.port}` || req.headers.origin!==getClient()?.origin || !getClient() || !isReady() || wss.clients.size>=8) {socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,ws=>{
      const entry={provider:req.url==='/demo-api/v1/worker'?'demo':'nyu',origin:req.headers.origin,authenticated:false,lastSeen:Date.now()};sessions.set(ws,entry);
      const authTimer=setTimeout(()=>{if(!entry.authenticated) ws.close(1008,'Authentication required');},5000);authTimer.unref();
      ws.on('error',()=>{});
      ws.on('close',closeCode=>{clearTimeout(authTimer);sessions.delete(ws);entry.activity?.complete(activityUnavailable);if(entry.authenticated) emit('worker.disconnected',{provider:entry.provider,closeCode});});
      ws.on('message',raw=>{
        try {
          if(!entry.authenticated && raw.length>4096) {ws.close(1009,'Authentication message too large');return;}
          const message=JSON.parse(raw.toString());
          if(!entry.authenticated) {
            if(message.type!=='authenticate' || !matches(message.token,getClient()?.token)) {ws.close(1008,'Unauthorized');return;}
            const capabilities=Array.isArray(message.capabilities)?message.capabilities:[];
            Object.assign(entry,{authenticated:true,token:message.token,lastSeen:Date.now(),catalogSync:capabilities.includes('catalog-sync'),courseActivity:capabilities.includes(activityCapability)});clearTimeout(authTimer);
            emit('worker.connected',{provider:entry.provider,origin:entry.origin});
            ws.send(JSON.stringify({type:'ready'}));return;
          }
          if(!valid(entry)) {ws.close(1008,'Reconnect the extension');return;}
          if(message.type==='ping') {entry.lastSeen=Date.now();ws.send(JSON.stringify({type:'pong'}));}
          if(message.type==='course-activity-result' && entry.activity && message.requestId===entry.activity.id) {
            const result=message.result;
            if(!result || typeof result!=='object' || Array.isArray(result)) {ws.close(1008,'Invalid activity result');return;}
            entry.activity.complete(result);
          }
        } catch {ws.close(1008,'Invalid worker message');}
      });
    });
  });
  const heartbeat=setInterval(()=>{for(const [ws,entry] of sessions) if(Date.now()-entry.lastSeen>45000 || (entry.authenticated && !valid(entry))) ws.terminate();},20000);heartbeat.unref();
  return {
    readActivity(operation,args,courseTitle,signal) {
      const eligible=[...sessions].filter(([ws,entry])=>activityWorker(ws,entry));
      if(!eligible.length) return activityUnavailable;
      const worker=eligible.find(([,entry])=>!entry.activity);
      if(!worker) return {code:'BUSY',error:'The browser is reading another course activity. Try again in a moment.'};
      const [ws,entry]=worker,id=randomUUID();
      return new Promise(resolve=>{
        const complete=result=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);entry.activity=null;resolve(result);};
        const cancel=()=>{
          if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'course-activity-cancel',requestId:id}));
          complete({code:'TIMED_OUT',error:'Course activity retrieval timed out. Retry when Brightspace is available.'});
        };
        const timer=setTimeout(cancel,activityTimeoutMs);timer.unref();
        entry.activity={id,complete};
        signal.addEventListener('abort',cancel,{once:true});
        if(signal.aborted) {cancel();return;}
        ws.send(JSON.stringify({type:'course-activity',requestId:id,operation,args,courseTitle}),error=>{
          if(error && entry.activity?.id===id) complete(activityUnavailable);
        });
      });
    },
    connected:(provider='nyu')=>[...sessions.values()].some(entry=>entry.provider===provider && valid(entry) && Date.now()-entry.lastSeen<45000),
    catalogSyncConnected:(provider='nyu')=>[...sessions.values()].some(entry=>entry.provider===provider && valid(entry) && entry.catalogSync && Date.now()-entry.lastSeen<45000),
    notify:(provider='nyu')=>{for(const [ws,entry] of sessions) if(entry.provider===provider && valid(entry) && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'work-available'}));},
    close:()=>{clearInterval(heartbeat);for(const ws of wss.clients) ws.terminate();wss.close();},
  };
}
