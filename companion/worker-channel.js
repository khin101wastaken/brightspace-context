import {WebSocketServer,WebSocket} from 'ws';
import {timingSafeEqual} from 'node:crypto';
import {safeLogger} from './logging.js';

export function createWorkerChannel(server,{getClient,isReady,log=()=>{}}) {
  const emit=safeLogger(log);
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false}),sessions=new Map();
  const matches=(a,b)=>typeof a==='string' && typeof b==='string' && a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));
  const valid=entry=>entry.authenticated && entry.origin===getClient()?.origin && matches(entry.token,getClient()?.token);
  server.on('upgrade',(req,socket,head)=>{
    if(!['/v1/worker','/v1/worker?source=demo'].includes(req.url) || req.headers.host!==`127.0.0.1:${server.address()?.port}` || req.headers.origin!==getClient()?.origin || !getClient() || !isReady() || wss.clients.size>=8) {socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,ws=>{
      const entry={provider:req.url.endsWith('?source=demo')?'demo':'nyu',origin:req.headers.origin,authenticated:false,lastSeen:Date.now()};sessions.set(ws,entry);
      const authTimer=setTimeout(()=>{if(!entry.authenticated) ws.close(1008,'Authentication required');},5000);authTimer.unref();
      ws.on('error',()=>{});
      ws.on('close',closeCode=>{clearTimeout(authTimer);sessions.delete(ws);if(entry.authenticated) emit('worker.disconnected',{closeCode});});
      ws.on('message',raw=>{
        try {
          const message=JSON.parse(raw.toString());
          if(!entry.authenticated) {
            if(message.type!=='authenticate' || !matches(message.token,getClient()?.token)) {ws.close(1008,'Unauthorized');return;}
            Object.assign(entry,{authenticated:true,token:message.token,lastSeen:Date.now(),catalogSync:Array.isArray(message.capabilities) && message.capabilities.includes('catalog-sync')});clearTimeout(authTimer);
            emit('worker.connected',{origin:entry.origin});
            ws.send(JSON.stringify({type:'ready'}));return;
          }
          if(!valid(entry)) {ws.close(1008,'Reconnect the extension');return;}
          if(message.type==='ping') {entry.lastSeen=Date.now();ws.send(JSON.stringify({type:'pong'}));}
        } catch {ws.close(1008,'Invalid worker message');}
      });
    });
  });
  const heartbeat=setInterval(()=>{for(const [ws,entry] of sessions) if(Date.now()-entry.lastSeen>45000 || (entry.authenticated && !valid(entry))) ws.terminate();},20000);heartbeat.unref();
  return {
    connected:(provider='nyu')=>[...sessions.values()].some(entry=>entry.provider===provider && valid(entry) && Date.now()-entry.lastSeen<45000),
    catalogSyncConnected:(provider='nyu')=>[...sessions.values()].some(entry=>entry.provider===provider && valid(entry) && entry.catalogSync && Date.now()-entry.lastSeen<45000),
    notify:(provider='nyu')=>{for(const [ws,entry] of sessions) if(entry.provider===provider && valid(entry) && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'work-available'}));},
    close:()=>{clearInterval(heartbeat);for(const ws of wss.clients) ws.terminate();wss.close();},
  };
}
