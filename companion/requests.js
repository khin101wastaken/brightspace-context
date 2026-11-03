import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomicWrite} from './files.js';
import {cacheId,validateMetadata} from './cache.js';
import {pdfMetadata} from '../extension/companion-client.js';
import {safeLogger} from './logging.js';

const UUID=/^[a-f0-9-]{36}$/;
const errors={NEEDS_LOGIN:'Sign into NYU Brightspace in Chrome, then retry this request.',ACCESS_DENIED:'Brightspace denied access to this PDF. Check course access or rescan the catalog.',TOO_LARGE:'The PDF exceeds the cache file-size or storage budget.',INVALID_PDF:'Brightspace returned data that is not a supported PDF.',NETWORK_ERROR:'Chrome could not fetch the PDF. Check the connection and Brightspace sign-in, then retry.',FAILED:'The PDF could not be cached. Check the companion and retry.'};
const active=job=>['queued','fetching'].includes(job.state);
export async function openRequests(directory,{catalog,cache,notify=()=>{},workerConnected=()=>false,now=Date.now,log=()=>{}}={}) {
  const emit=safeLogger(log),fields=job=>({requestId:job.requestId,courseId:job.metadata.courseId,topicId:job.metadata.topicId});
  let recovered=0;
  const filename=path.join(directory,'requests.json');let jobs=[],queue=Promise.resolve();
  try {
    const raw=await readFile(filename,'utf8');if(Buffer.byteLength(raw)>2*1024*1024) throw new Error('Request history is too large.');
    const stored=JSON.parse(raw);
    if(stored.version!==1 || !Array.isArray(stored.jobs) || stored.jobs.length>100) throw new Error('Invalid request history.');
    jobs=stored.jobs.map(job=>{
      if(!UUID.test(job.requestId) || !['queued','fetching','ready','needs_login','failed'].includes(job.state) || !Number.isFinite(job.createdAt) || !Number.isFinite(job.updatedAt)) throw new Error('Invalid saved request.');
      const metadata=validateMetadata(job.metadata);
      if(job.state==='fetching') recovered++;
      return {...job,metadata,documentId:cacheId(metadata),...(job.state==='fetching'?{state:'queued',leaseId:null,leaseUntil:null}:{})};
    });
  } catch(error) {if(error.code!=='ENOENT') throw error;}
  if(recovered) emit('retrieval.recovered',{count:recovered});
  const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
  const save=async()=>{
    const raw=JSON.stringify({version:1,jobs});if(Buffer.byteLength(raw)>2*1024*1024) throw new Error('Request history exceeds its metadata budget.');
    await atomicWrite(filename,raw);
  };
  const prune=()=>{
    for(const job of jobs) {
      if(active(job) && now()-job.createdAt>24*60*60*1000) {Object.assign(job,{state:'failed',error:'Request expired after 24 hours. Request the document again with retry enabled.',code:'EXPIRED',updatedAt:now(),leaseId:null});emit('retrieval.failed',{...fields(job),code:'EXPIRED'});}
      else if(job.state==='fetching' && job.leaseUntil<=now()) Object.assign(job,{state:'queued',leaseId:null,updatedAt:now()});
    }
  };
  const present=job=>({requestId:job.requestId,state:job.state,documentId:job.state==='ready'?job.documentId:null,courseId:job.metadata.courseId,title:job.metadata.title,createdAt:job.createdAt,updatedAt:job.updatedAt,source:job.source || null,error:job.error || null,code:job.code || null,workerConnected:workerConnected(),
    nextAction:job.state==='ready'?'Read the verified document before answering.':job.state==='needs_login'?errors.NEEDS_LOGIN:job.state==='failed'?'Retry request_document with retry: true after resolving the error.':jobs.some(j=>j.state==='needs_login')?'Sign into Brightspace in Chrome and use Retry requests in the extension.':workerConnected()?'The extension is fetching requested PDFs. Check this request again shortly.':'Open Chrome with the paired extension enabled and automatic retrieval allowed. The request is saved.'});
  async function resolveMetadata(courseId,key) {
    if(typeof courseId!=='string' || !/^\d+$/.test(courseId) || typeof key!=='string' || !/^document:\d+$/.test(key)) throw new Error('Use courseId and a document key returned by search_catalog.');
    const {semesters}=await catalog.read();
    const courses=semesters.flatMap(s=>s.courses).filter(c=>c.courseId===courseId).sort((a,b)=>Date.parse(b.lastScannedAt || 0)-Date.parse(a.lastScannedAt || 0));
    const course=courses[0];
    if(!course || !course.entries?.some(e=>e.key===key)) throw new Error('This document is not in the synced catalog. Rescan the semester.');
    if(course.stale || course.status!=='complete') throw new Error('This course outline is stale after a failed sync. Rescan the course before requesting its files.');
    return validateMetadata(pdfMetadata(course,key));
  }
  return {
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
      if(job.state==='ready' && !(await cache.lookup(job.metadata)).hit) {Object.assign(job,{state:'failed',code:'EVICTED',error:'This PDF was evicted, changed, or failed its integrity check. Request it again.',updatedAt:now()});emit('retrieval.failed',{...fields(job),code:'EVICTED'});}
      await save();return present(job);
    }),
    claim:()=>serial(async()=>{
      prune();
      if(jobs.some(j=>j.state==='needs_login')) {await save();return {job:null,blocked:'needs_login'};}
      // One active lease across browser instances prevents overlapping fetches.
      if(jobs.some(j=>j.state==='fetching')) return {job:null};
      const job=jobs.find(j=>j.state==='queued');if(!job) {await save();return {job:null};}
      // Re-resolve before fetching: a rescan may have removed or changed a URL.
      try {
        const current=await resolveMetadata(job.metadata.courseId,`document:${job.metadata.topicId}`);
        if(current.sourceUrl!==job.metadata.sourceUrl || current.lastModifiedAt!==job.metadata.lastModifiedAt) throw new Error('Document changed since it was requested. Request it again.');
      } catch(error) {Object.assign(job,{state:'failed',code:'CATALOG_CHANGED',error:error.message,updatedAt:now()});await save();emit('retrieval.failed',{...fields(job),code:'CATALOG_CHANGED'});notify();return {job:null,retryClaim:true};}
      Object.assign(job,{state:'fetching',leaseId:randomUUID(),leaseUntil:now()+180000,updatedAt:now()});
      await save();emit('retrieval.fetching',fields(job));return {job:{requestId:job.requestId,leaseId:job.leaseId,metadata:job.metadata}};
    }),
    finish:({requestId,leaseId,code})=>serial(async()=>{
      prune();const job=jobs.find(j=>j.requestId===requestId);
      if(!job || job.state!=='fetching' || !UUID.test(leaseId) || job.leaseId!==leaseId) throw new Error('Request lease expired. The queue will retry safely.');
      if(code!=null) {
        if(!Object.hasOwn(errors,code)) throw new Error('Unsupported failure code.');
        Object.assign(job,{state:code==='NEEDS_LOGIN'?'needs_login':'failed',code,error:errors[code]});
      } else {
        const hit=await cache.lookup(job.metadata);if(!hit.hit) throw new Error('The requested PDF has not been verified in the cache.');
        Object.assign(job,{state:'ready',source:'brightspace',error:null,code:null});
      }
      job.updatedAt=now();job.leaseId=null;job.leaseUntil=null;await save();emit(job.state==='ready'?'retrieval.ready':'retrieval.failed',{...fields(job),code:job.code});return present(job);
    }),
    retryLogin:()=>serial(async()=>{
      let count=0;for(const job of jobs) if(job.state==='needs_login') {Object.assign(job,{state:'queued',code:null,error:null,createdAt:now(),updatedAt:now()});count++;}
      await save();if(count) emit('retrieval.retry',{count});notify();return {retried:count};
    }),
  };
}
