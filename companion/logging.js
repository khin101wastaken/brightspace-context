const LEVELS={debug:10,info:20,warn:30,error:40,silent:Infinity};
const EVENTS={
  'app.starting':['info','Starting companion',['pid','runtime','directory']],
  'app.ready':['info','Companion ready',['url','files','bytes']],
  'app.stopping':['info','Stopping companion',['signal']],
  'app.stopped':['info','Companion stopped',[]],
  'app.start_failed':['error','Companion could not start',['code','directory','port']],
  'pair.accepted':['info','Browser paired',['origin']],
  'pair.rejected':['warn','Pairing rejected',['code']],
  'auth.rejected':['warn','Connection rejected',['code','origin']],
  'worker.connected':['info','Automatic retrieval connected',['origin']],
  'worker.disconnected':['info','Automatic retrieval disconnected',['closeCode']],
  'catalog.synced':['info','Catalog saved',['semesterId','courses','complete']],
  'cache.hit':['info','Document served from cache',['courseId','topicId']],
  'cache.miss':['info','Document needs downloading',['courseId','topicId']],
  'cache.stored':['info','Document cached',['courseId','topicId','bytes','evicted']],
  'retrieval.queued':['info','Document request queued',['requestId','courseId','topicId','workerConnected']],
  'retrieval.fetching':['info','Chrome claimed Document request',['requestId','courseId','topicId']],
  'retrieval.ready':['info','Document request ready',['requestId','courseId','topicId']],
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
      const key=event+':'+(valid('code',fields.code)?fields.code:'UNKNOWN');
      if(recentWarnings.has(key) && time-recentWarnings.get(key)<30000) return;
      recentWarnings.set(key,time);
    }
    const details=keys.filter(key=>valid(key,fields[key])).map(key=>`${key}=${JSON.stringify(typeof fields[key]==='string'?safeText(fields[key]):fields[key])}`).join(' ');
    write(`${date.toISOString()} ${severity.toUpperCase()} ${event} ${message}${details?' '+details:''}`,severity);
  });
}
