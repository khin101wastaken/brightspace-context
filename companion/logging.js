const LEVELS={debug:10,info:20,warn:30,error:40,silent:Infinity};
const EVENTS={
  'app.starting':['info','Starting companion',['pid','runtime','directory']],
  'app.ready':['debug','Companion ready',['url','files','bytes']],
  'app.stopping':['debug','Stopping companion',['signal']],
  'app.stopped':['info','Companion stopped',[]],
  'app.start_failed':['error','Companion could not start',['code','directory','port']],
  'pair.accepted':['info','Browser paired',['origin']],
  'pair.rejected':['warn','Pairing rejected',['code']],
  'auth.rejected':['warn','Connection rejected',['code','origin']],
  'worker.connected':['info','Automatic retrieval connected',['origin']],
  'worker.disconnected':['info','Automatic retrieval disconnected',['closeCode']],
  'catalog.synced':['info','Catalog saved',['semesterId','courses','complete']],
  'sync.queued':['info','Catalog sync queued',['requestId','semesterId','workerConnected']],
  'sync.fetching':['debug','Chrome claimed catalog sync',['requestId','semesterId']],
  'sync.ready':['info','Catalog sync ready',['requestId','semesterId','courses','complete','semesterCount']],
  'sync.failed':['warn','Catalog sync interrupted',['requestId','semesterId','code']],
  'cache.hit':['info','Document served from cache',['courseId','topicId']],
  'cache.miss':['debug','Document needs downloading',['courseId','topicId']],
  'cache.stored':['info','Document cached',['courseId','topicId','bytes','evicted']],
  'retrieval.queued':['info','Document request queued',['requestId','courseId','topicId','workerConnected']],
  'retrieval.fetching':['debug','Chrome claimed document request',['requestId','courseId','topicId']],
  'retrieval.ready':['debug','Document request ready',['requestId','courseId','topicId']],
  'retrieval.failed':['warn','Document request failed',['requestId','courseId','topicId','code']],
  'retrieval.cache_hit':['info','Requested Document already cached',['courseId','topicId']],
  'retrieval.retry':['info','Login-blocked requests resumed',['count']],
  'retrieval.recovered':['info','Interrupted requests requeued after restart',['count']],
  'http.request':['debug','Local request',['method','route','status','elapsedMs']],
  'http.failed':['warn','Local request failed',['route','code']],
};
const id=value=>typeof value==='string' && /^\d{1,20}$/.test(value);
const safeText=value=>String(value).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,500);
const valid=(key,value)=>{
  if(key==='provider') return ['nyu','demo'].includes(value);
  if(['courseId','topicId','semesterId'].includes(key)) return id(value);
  if(key==='origin') return typeof value==='string' && /^chrome-extension:\/\/[a-p]{32}$/.test(value);
  if(key==='requestId') return typeof value==='string' && /^[a-f0-9-]{36}$/.test(value);
  if(key==='code') return typeof value==='string' && /^[A-Z][A-Z0-9_]{0,39}$/.test(value);
  if(key==='runtime') return typeof value==='string' && /^v\d+\.\d+\.\d+$/.test(value);
  if(key==='url') return typeof value==='string' && /^http:\/\/127\.0\.0\.1:\d+$/.test(value);
  if(key==='method') return ['GET','POST','PUT','OPTIONS'].includes(value);
  if(key==='route') return typeof value==='string' && /^[a-z.-]{1,40}$/.test(value);
  if(key==='signal') return ['SIGINT','SIGTERM'].includes(value);
  if(key==='workerConnected') return typeof value==='boolean';
  if(key==='directory') return typeof value==='string';
  return Number.isSafeInteger(value) && value>=0;
};

// Keep instrumentation out of the operation's success/failure path.
export const safeLogger=log=>(event,fields={})=>{try {log(event,fields);} catch {}};

export const formatBytes=bytes=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:bytes>=1024?`${Math.ceil(bytes/1024)} KB`:`${bytes} B`;
function summary(event,fields,fallback) {
  const count=key=>valid(key,fields[key])?fields[key]:null;
  if(event==='pair.accepted')return 'Browser paired';
  if(event==='worker.connected')return 'Browser connected';
  if(event==='worker.disconnected')return 'Browser disconnected; waiting to reconnect';
  if(event==='catalog.synced' || event==='sync.ready') {
    if(count('semesterCount')!==null)return `Semester list refreshed (${fields.semesterCount})`;
    return count('courses')!==null && count('complete')!==null?`Catalog synced (${fields.complete}/${fields.courses} courses)`:'Catalog refreshed';
  }
  if(event==='sync.queued')return 'Sync queued; waiting for browser';
  if(event==='retrieval.queued')return 'Document queued; waiting for browser';
  if(['cache.hit','retrieval.cache_hit'].includes(event))return 'Cache hit; no download';
  if(event==='cache.stored')return 'Document cached'+(count('bytes')!==null?` (${formatBytes(fields.bytes)}${count('evicted')>0?`; ${fields.evicted} evicted`:''})`:'');
  if(event==='retrieval.retry' || event==='retrieval.recovered')return `${event==='retrieval.retry'?'Resumed':'Recovered'}${count('count')!==null?' '+fields.count:''} pending requests`;
  const code=valid('code',fields.code)?fields.code:null;
  const action=code==='NEEDS_LOGIN'?(fields.provider==='demo'?'Restore access on the demo LMS page, then retry.':'Sign into NYU Brightspace in Chrome, then retry.'):
    ['TOKEN_MISMATCH','BROWSER_MISMATCH','NOT_PAIRED','PAIRING_REQUIRED'].includes(code)?'Pair the browser again.':
    code==='CODE_MISMATCH'?'Check the companion pairing code.':
    code==='NETWORK_ERROR'?'Check your connection, then retry.':
    code==='RATE_LIMITED'?'Wait a minute before retrying.':
    code==='PAUSED'?'Resume automatic retrieval in extension Settings.':null;
  return fallback+(code?` (${code})`:'')+(action?' '+action:'');
}

export function createLogger({level='info',write=(line,severity)=>severity==='error'?console.error(line):console.log(line),now=()=>new Date()}={}) {
  if(!Object.hasOwn(LEVELS,level)) throw new Error('BRIGHTSPACE_LOG_LEVEL must be debug, info, warn, error, or silent.');
  const recentWarnings=new Map();
  return safeLogger((event,fields={})=>{
    const definition=EVENTS[event];if(!definition) return;
    const [severity,message,keys]=definition;if(LEVELS[severity]<LEVELS[level]) return;
    const date=now(),time=date.getTime();
    // An old token can reconnect repeatedly. Keep the first useful diagnostic
    // without filling the terminal with identical authentication failures.
    if(['auth.rejected','pair.rejected'].includes(event)) {
      const key=event+':'+(valid('provider',fields.provider)?fields.provider:'')+':'+(valid('code',fields.code)?fields.code:'UNKNOWN');
      if(recentWarnings.has(key) && time-recentWarnings.get(key)<30000) return;
      recentWarnings.set(key,time);
    }
    if(level==='debug') {
      const details=['provider',...keys].filter(key=>valid(key,fields[key])).map(key=>`${key}=${JSON.stringify(typeof fields[key]==='string'?safeText(fields[key]):fields[key])}`).join(' ');
      write(`${date.toISOString()} ${severity.toUpperCase()} ${event} ${message}${details?' '+details:''}`,severity);
      return;
    }
    // Successful requests report their outcome once; queue diagnostics are only
    // useful at normal verbosity while the browser is actually unavailable.
    if(['sync.queued','retrieval.queued'].includes(event) && fields.workerConnected!==false)return;
    const source=/^(?:worker|catalog|sync|cache|retrieval)\./.test(event) && valid('provider',fields.provider)?`${fields.provider==='demo'?'Demo':'NYU'}: `:'';
    const label=severity==='warn'?'Warning: ':severity==='error'?'Error: ':'';
    write(`[${date.toTimeString().slice(0,8)}] ${source}${label}${summary(event,fields,message)}`,severity);
  });
}
