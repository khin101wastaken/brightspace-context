import {randomUUID} from 'node:crypto';
import {openVault} from './vault.js';
import {cacheId,validateMetadata} from './cache.js';
import {documentMetadata} from '../extension/companion-client.js';
import {safeLogger} from './logging.js';
import {validateSyncSpec,validateProgress} from './sync-spec.js';

const UUID=/^[a-f0-9-]{36}$/;
const errors={NEEDS_LOGIN:'Sign into NYU Brightspace in Chrome, then retry this request.',ACCESS_DENIED:'Brightspace denied access to this document. Check course access or rescan the catalog.',TOO_LARGE:'The document exceeds the cache file-size or storage budget.',INVALID_PDF:'Brightspace returned data that is not a supported PDF.',INVALID_FILE:'Brightspace returned an invalid or mismatched PPTX/DOCX package.',NETWORK_ERROR:'Chrome could not fetch the document. Check the connection and Brightspace sign-in, then retry.',FAILED:'The document could not be cached. Check the companion and retry.'};
const active=job=>['queued','fetching'].includes(job.state);
Object.assign(errors,{RATE_LIMITED:'Brightspace is limiting requests. Wait at least a minute, then retry catalog sync.',SYNC_FAILED:'Catalog sync did not finish. Previous saved outlines remain available; check the failure summary and retry.',PAUSED:'Model requests are paused in the extension.'});
const isSync=job=>job.kind==='catalog-sync';
const syncResult=value=>Object.fromEntries(Object.entries(value || {}).filter(([key,item])=>
  ['courses','complete','bytes','semesterCount'].includes(key)?Number.isSafeInteger(item) && item>=0:
  key==='semesterId'?typeof item==='string' && /^\d+$/.test(item):
  key==='discoveredAt'?typeof item==='string' && Number.isFinite(Date.parse(item)):false));
export async function openRequests(directory,{catalog,cache,notify=()=>{},workerConnected=()=>false,syncWorkerConnected=workerConnected,now=Date.now,log=()=>{},vault,provider='nyu'}={}) {
  const loginMessage=provider==='demo'?'Restore demo access on the local demo LMS page, then retry with provider:demo and retry:true.':errors.NEEDS_LOGIN;
  const failureMessages={...errors,NEEDS_LOGIN:loginMessage};
  const emit=safeLogger(log),fields=job=>({requestId:job.requestId,...(isSync(job)?{semesterId:job.sync.semesterId}:{courseId:job.metadata.courseId,topicId:job.metadata.topicId})});
  let recovered=0;
  vault??=await openVault(directory);let jobs=[],queue=Promise.resolve();
  try {
    const raw=(await vault.read('requests.json')).toString('utf8');if(Buffer.byteLength(raw)>2*1024*1024) throw new Error('Request history is too large.');
    const stored=JSON.parse(raw);
    if(![1,2].includes(stored.version) || !Array.isArray(stored.jobs) || stored.jobs.length>100) throw new Error('Invalid request history.');
    jobs=stored.jobs.map(job=>{
      if(!UUID.test(job.requestId) || !['queued','fetching','ready','needs_login','failed'].includes(job.state) || !Number.isFinite(job.createdAt) || !Number.isFinite(job.updatedAt)) throw new Error('Invalid saved request.');
      if(job.kind!=null && !['document','catalog-sync'].includes(job.kind)) throw new Error('Invalid request kind.');
      const metadata=isSync(job)?null:validateMetadata(job.metadata,{provider});
      if(job.state==='fetching') recovered++;
      return {...job,...(isSync(job)?{sync:validateSyncSpec(job.sync),result:syncResult(job.result),...(job.progress?{progress:validateProgress(job.progress)}:{})}:{metadata,documentId:cacheId(metadata)}),...(job.state==='fetching'?{state:'queued',leaseId:null,leaseUntil:null}:{})};
    });
  } catch(error) {if(error.code!=='ENOENT') throw error;}
  if(recovered) emit('retrieval.recovered',{count:recovered});
  const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
  const save=async()=>{
    const raw=JSON.stringify({version:2,jobs});if(Buffer.byteLength(raw)>2*1024*1024) throw new Error('Request history exceeds its metadata budget.');
    await vault.write('requests.json',raw);
  };
  const prune=()=>{
    for(const job of jobs) {
      if(active(job) && now()-job.createdAt>24*60*60*1000) {Object.assign(job,{state:'failed',error:'Request expired after 24 hours. Request the document again with retry enabled.',code:'EXPIRED',updatedAt:now(),leaseId:null});emit('retrieval.failed',{...fields(job),code:'EXPIRED'});}
      else if(job.state==='fetching' && job.leaseUntil<=now()) Object.assign(job,{state:'queued',leaseId:null,updatedAt:now()});
    }
  };
  const present=job=>isSync(job)?({requestId:job.requestId,kind:'catalog-sync',scope:job.sync.semesterId?'semester':'discovery',...job.sync,state:job.state,createdAt:job.createdAt,updatedAt:job.updatedAt,progress:job.progress || null,result:job.result || null,code:job.code || null,error:job.error || null,workerConnected:syncWorkerConnected(),
    nextAction:job.state==='ready'?(job.sync.semesterId?'Use list_courses or search_catalog to inspect the refreshed catalog.':'Choose a returned semesterId and call request_catalog_sync to refresh its courses.'):
    job.state==='needs_login'?loginMessage:job.state==='failed'?'Address the error, then call request_catalog_sync with retry:true.':jobs.some(j=>j.state==='needs_login')?loginMessage:syncWorkerConnected()?'Catalog sync is queued or running. Check get_catalog_sync shortly.':'Open Chrome with the updated paired extension enabled and model requests allowed. This request is saved.'}):({requestId:job.requestId,state:job.state,documentId:job.state==='ready'?job.documentId:null,courseId:job.metadata.courseId,title:job.metadata.title,createdAt:job.createdAt,updatedAt:job.updatedAt,source:job.source || null,error:job.error || null,code:job.code || null,workerConnected:workerConnected(),
    nextAction:job.state==='ready'?'Read the verified document before answering.':job.state==='needs_login'?loginMessage:job.state==='failed'?'Retry request_document with retry: true after resolving the error.':jobs.some(j=>j.state==='needs_login')?loginMessage:workerConnected()?'The extension is fetching requested documents. Check this request again shortly.':'Open Chrome with the paired extension enabled and automatic retrieval allowed. The request is saved.'});
  async function resolveMetadata(courseId,key) {
    if(typeof courseId!=='string' || !/^\d+$/.test(courseId) || typeof key!=='string' || !/^document:\d+$/.test(key)) throw new Error('Use courseId and a document key returned by search_catalog.');
    const {semesters}=await catalog.read();
    const courses=semesters.flatMap(s=>s.courses).filter(c=>c.courseId===courseId).sort((a,b)=>Date.parse(b.lastScannedAt || 0)-Date.parse(a.lastScannedAt || 0));
    const course=courses[0];
    if(!course || !course.entries?.some(e=>e.key===key)) throw new Error('This document is not in the synced catalog. Rescan the semester.');
    if(course.stale || course.status!=='complete') throw new Error('This course outline is stale after a failed sync. Rescan the course before requesting its files.');
    return validateMetadata(documentMetadata(course,key),{provider});
  }
  return {
    syncRequest:args=>serial(async()=>{
      if(!args || Object.keys(args).some(key=>!['semesterId','retry'].includes(key)) || (args.retry!==undefined && typeof args.retry!=='boolean')) throw new Error('Invalid catalog sync parameters.');
      const sync=validateSyncSpec(args.semesterId==null?{}:{semesterId:args.semesterId});prune();
      const existing=[...jobs].reverse().find(job=>isSync(job) && job.sync.semesterId===sync.semesterId);
      if(existing?.code==='RATE_LIMITED' && now()-existing.updatedAt<60000) return {...present(existing),retryAfterSeconds:Math.ceil((60000-now()+existing.updatedAt)/1000)};
      if(args.retry) for(const job of jobs) if(job.state==='needs_login') Object.assign(job,{state:'queued',code:null,error:null,createdAt:now(),updatedAt:now()});
      if(existing && (active(existing) || (!args.retry && ['failed','needs_login'].includes(existing.state)) || (existing.state==='ready' && now()-existing.updatedAt<30000))) {await save();notify();return {...present(existing),deduplicated:true};}
      if(jobs.filter(active).length>=25 || jobs.filter(job=>isSync(job) && active(job)).length>=5) throw new Error('The request queue is busy. Wait for existing requests to finish.');
      if(jobs.length>=100) {const index=jobs.findIndex(job=>!active(job) && job.state!=='needs_login');if(index<0) throw new Error('Request history is full. Retry pending requests first.');jobs.splice(index,1);}
      const job={kind:'catalog-sync',requestId:randomUUID(),sync,state:'queued',createdAt:now(),updatedAt:now()};
      jobs.push(job);await save();emit('sync.queued',fields(job));notify();return present(job);
    }),
    request:({courseId,key,retry=false})=>serial(async()=>{
      if(typeof retry!=='boolean') throw new Error('Invalid retry option.');
      const metadata=await resolveMetadata(courseId,key),lookup=await cache.lookup(metadata);prune();
      if(lookup.hit) {emit('retrieval.cache_hit',{courseId:metadata.courseId,topicId:metadata.topicId});return {requestId:null,state:'ready',documentId:lookup.id,source:'cache',workerConnected:workerConnected(),nextAction:'Read the verified document before answering.'};}
      const existing=[...jobs].reverse().find(j=>j.documentId===lookup.id && j.metadata.sourceUrl===metadata.sourceUrl && j.metadata.lastModifiedAt===metadata.lastModifiedAt);
      if(existing && (active(existing) || (!retry && ['failed','needs_login'].includes(existing.state)))) return present(existing);
      if(jobs.filter(active).length>=25) throw new Error('The queue already has 25 pending requests. Let existing downloads finish.');
      if(jobs.length>=100) {const index=jobs.findIndex(j=>!active(j) && j.state!=='needs_login');if(index<0) throw new Error('Request history is full. Finish or retry pending requests.');jobs.splice(index,1);}
      if(existing?.state==='needs_login' && retry) existing.state='failed';
      const job={requestId:randomUUID(),documentId:lookup.id,metadata,state:'queued',createdAt:now(),updatedAt:now()};
      jobs.push(job);await save();emit('retrieval.queued',{...fields(job),workerConnected:workerConnected()});notify();return present(job);
    }),
    get:requestId=>serial(async()=>{
      if(typeof requestId!=='string' || !UUID.test(requestId)) throw new Error('Invalid request ID.');
      prune();const job=jobs.find(j=>j.requestId===requestId);if(!job) throw new Error('Request not found.');
      if(!isSync(job) && job.state==='ready' && !(await cache.lookup(job.metadata)).hit) {Object.assign(job,{state:'failed',code:'EVICTED',error:'This document was evicted, changed, or failed its integrity check. Request it again.',updatedAt:now()});emit('retrieval.failed',{...fields(job),code:'EVICTED'});}
      await save();return present(job);
    }),
    claim:({catalogSync=true}={})=>serial(async()=>{
      prune();
      if(jobs.some(j=>j.state==='needs_login')) {await save();return {job:null,blocked:'needs_login'};}
      // One active lease across browser instances prevents overlapping fetches.
      if(jobs.some(j=>j.state==='fetching')) return {job:null};
      const job=jobs.find(j=>j.state==='queued' && (!isSync(j) || catalogSync));if(!job) {await save();return {job:null};}
      // Re-resolve before fetching: a rescan may have removed or changed a URL.
      try {
        if(!isSync(job)) {
        const current=await resolveMetadata(job.metadata.courseId,`document:${job.metadata.topicId}`);
        if(current.sourceUrl!==job.metadata.sourceUrl || current.lastModifiedAt!==job.metadata.lastModifiedAt) throw new Error('Document changed since it was requested. Request it again.');
        }
      } catch(error) {Object.assign(job,{state:'failed',code:'CATALOG_CHANGED',error:error.message,updatedAt:now()});await save();emit('retrieval.failed',{...fields(job),code:'CATALOG_CHANGED'});notify();return {job:null,retryClaim:true};}
      Object.assign(job,{state:'fetching',leaseId:randomUUID(),leaseUntil:now()+180000,updatedAt:now()});
      await save();emit(isSync(job)?'sync.fetching':'retrieval.fetching',fields(job));return {job:{requestId:job.requestId,leaseId:job.leaseId,...(isSync(job)?{kind:job.kind,sync:job.sync}:{metadata:job.metadata})}};
    }),
    finish:({requestId,leaseId,code,result})=>serial(async()=>{
      prune();const job=jobs.find(j=>j.requestId===requestId);
      if(!job || job.state!=='fetching' || !UUID.test(leaseId) || job.leaseId!==leaseId) throw new Error('Request lease expired. The queue will retry safely.');
      if(code!=null && !Object.hasOwn(errors,code)) throw new Error('Unsupported failure code.');
      if(isSync(job) && code==='FAILED') code='SYNC_FAILED';
      if(!isSync(job) && result!=null) throw new Error('Document completion does not accept catalog data.');
      if(isSync(job) && result!=null) {
        if(job.sync.semesterId) {
          if(result.snapshot?.semesterId!==job.sync.semesterId) throw new Error('Sync result does not match the requested semester.');
          job.result=syncResult(await catalog.put(result.snapshot));
          if(job.result.complete<job.result.courses && !code) code='SYNC_FAILED';
        } else {
          if(code) throw new Error('A failed discovery cannot replace the saved semester list.');
          job.result=syncResult(await catalog.discover(result.semesters));
        }
      }
      if(code!=null) {
        if(!Object.hasOwn(errors,code)) throw new Error('Unsupported failure code.');
        Object.assign(job,{state:code==='NEEDS_LOGIN'?'needs_login':code==='PAUSED'?'queued':'failed',code,error:failureMessages[code]});
      } else if(isSync(job)) {
        if(!result) throw new Error('A verified catalog result is required.');
        Object.assign(job,{state:'ready',source:'brightspace',error:null,code:null});
      } else {
        const hit=await cache.lookup(job.metadata);if(!hit.hit) throw new Error('The requested document has not been verified in the cache.');
        Object.assign(job,{state:'ready',source:'brightspace',error:null,code:null});
      }
      job.updatedAt=now();job.leaseId=null;job.leaseUntil=null;await save();emit(isSync(job)?(job.state==='ready'?'sync.ready':'sync.failed'):(job.state==='ready'?'retrieval.ready':'retrieval.failed'),{...fields(job),code:job.code});return present(job);
    }),
    progress:({requestId,leaseId,progress})=>serial(async()=>{
      prune();const job=jobs.find(job=>job.requestId===requestId);
      if(!job || !isSync(job) || job.state!=='fetching' || !UUID.test(leaseId) || job.leaseId!==leaseId) throw new Error('Catalog sync lease expired.');
      Object.assign(job,{progress:validateProgress(progress),leaseUntil:now()+180000,updatedAt:now()});await save();return present(job);
    }),
    retryLogin:()=>serial(async()=>{
      let count=0;for(const job of jobs) if(job.state==='needs_login') {Object.assign(job,{state:'queued',code:null,error:null,createdAt:now(),updatedAt:now()});count++;}
      await save();if(count) emit('retrieval.retry',{count});notify();return {retried:count};
    }),
  };
}
