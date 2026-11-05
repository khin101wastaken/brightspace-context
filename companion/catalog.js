import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {atomicWrite} from './files.js';

export const MAX_CATALOG_BYTES=10*1024*1024;
const text=(value,max=1000)=>typeof value==='string' && value.length<=max;
export function validateSemester(value) {
  if(!value || !/^\d+$/.test(value.semesterId) || !text(value.title) || !value.title || !Array.isArray(value.courses) || !value.courses.length || value.courses.length>200 || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('Invalid semester catalog.');
  const ids=new Set();let total=0;
  const courses=value.courses.map(course=>{
    if(!/^\d+$/.test(course.courseId) || ids.has(course.courseId) || !text(course.title) || !course.title || !['complete','failed'].includes(course.status)) throw new Error('Invalid catalog course.');
    ids.add(course.courseId);
    const base={courseId:course.courseId,title:course.title,status:course.status};
    if(course.status==='failed') {
      if(!text(course.error,2000)) throw new Error('Invalid course error.');
      return {...base,error:course.error};
    }
    if(course.coverage!=='full-toc' || !Number.isFinite(Date.parse(course.lastScannedAt)) || !Array.isArray(course.entries)) throw new Error('Incomplete course outline.');
    total+=course.entries.length;if(total>50000) throw new Error('Semester exceeds the catalog entry limit.');
    const byKey=new Map(),depths=new Map();
    const entries=course.entries.map(entry=>{
      if(!entry || !['module','document'].includes(entry.kind) || !/^\d+$/.test(entry.id) || entry.key!==`${entry.kind}:${entry.id}` || byKey.has(entry.key) || !text(entry.title) || !text(entry.description??'',16000)) throw new Error('Invalid outline entry.');
      const parentKey=entry.parentKey??null;
      // The scanner emits parents before their children. This also rules out
      // cycles and missing parents before committing an authoritative snapshot.
      if(parentKey!==null && byKey.get(parentKey)!=='module') throw new Error('Invalid module relationship.');
      const depth=parentKey===null?0:depths.get(parentKey)+1;
      if(depth>100) throw new Error('Module hierarchy is too deep.');
      depths.set(entry.key,depth);
      byKey.set(entry.key,entry.kind);
      let sourceUrl=null;
      if(entry.sourceUrl) {
        const url=new URL(entry.sourceUrl);if(!['https:','http:'].includes(url.protocol) || url.username || url.password || url.href.length>8000) throw new Error('Invalid source link.');
        sourceUrl=url.href;
      }
      return {key:entry.key,id:entry.id,kind:entry.kind,title:entry.title,parentKey,order:Number.isFinite(entry.order)?entry.order:0,
        contentType:['module','file','link','assignment'].includes(entry.contentType)?entry.contentType:'link',
        url:`https://brightspace.nyu.edu/d2l/le/lessons/${course.courseId}/${entry.kind==='module'?'units':'topics'}/${entry.id}`,
        sourceUrl,description:entry.description||'',descriptionTruncated:entry.descriptionTruncated===true,
        descriptionStatus:['synced','unavailable','not_synced'].includes(entry.descriptionStatus)?entry.descriptionStatus:(entry.description?'synced':'not_synced'),
        lastModifiedAt:text(entry.lastModifiedAt,100)?entry.lastModifiedAt:null,locked:entry.locked===true};
    });
    return {...base,entries,coverage:'full-toc',lastScannedAt:course.lastScannedAt};
  });
  return {semesterId:value.semesterId,title:value.title,updatedAt:value.updatedAt,courses};
}

export async function openCatalog(directory) {
  const filename=path.join(directory,'catalog.json');let state={version:1,semesters:[]},queue=Promise.resolve();
  try {
    const raw=await readFile(filename,'utf8');
    if(Buffer.byteLength(raw)>MAX_CATALOG_BYTES) throw new Error('Stored catalog exceeds its size limit.');
    const parsed=JSON.parse(raw);
    if(parsed.version!==1 || !Array.isArray(parsed.semesters)) throw new Error('Unsupported catalog format.');
    // Validate persisted metadata with the same rules used for new uploads.
    state={version:1,semesters:parsed.semesters.map(s=>{
      const validated=validateSemester({...s,courses:s.courses.map(c=>c.entries?{...c,status:'complete'}:c)});
      return {...validated,courses:validated.courses.map((c,i)=>({...c,status:s.courses[i].status,...(s.courses[i].error?{error:s.courses[i].error}:{}),stale:s.courses[i].stale===true}))};
    })};
  } catch(error) {if(error.code!=='ENOENT') throw error;}
  return {
    async read(){await queue;return structuredClone(state);},
    put(value) {
      const task=queue.then(async()=>{
        const snapshot=validateSemester(value),old=state.semesters.find(s=>s.semesterId===snapshot.semesterId);
        snapshot.courses=snapshot.courses.map(course=>{
          const previous=old?.courses.find(c=>c.courseId===course.courseId);
          return course.status==='failed' && previous?.entries?{...previous,...course,stale:true}:course;
        });
        const next={version:1,semesters:[...state.semesters.filter(s=>s.semesterId!==snapshot.semesterId),snapshot]};
        const serialized=JSON.stringify(next);
        if(Buffer.byteLength(serialized)>MAX_CATALOG_BYTES) throw new Error('Catalog exceeds its 10 MB metadata budget.');
        await atomicWrite(filename,serialized);state=next;
        return {semesterId:snapshot.semesterId,courses:snapshot.courses.length,complete:snapshot.courses.filter(c=>c.status==='complete').length,bytes:Buffer.byteLength(serialized)};
      });queue=task.catch(()=>{});return task;
    },
  };
}
