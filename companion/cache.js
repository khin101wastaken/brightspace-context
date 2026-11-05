import {mkdir,readFile,writeFile,stat,unlink,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {atomicWrite,replaceFile} from './files.js';
import {documentFormat,validateDocument,MAX_FILE_BYTES} from '../extension/document-formats.js';

export const DEFAULT_BUDGET=500*1024*1024;
export {MAX_FILE_BYTES};
export const MAX_PDF_BYTES=MAX_FILE_BYTES; // Older extensions use this wire field.
export function validateMetadata(value) {
  if(!value || !/^\d+$/.test(value.courseId) || !/^\d+$/.test(value.topicId)) throw new Error('Invalid course or topic ID.');
  const url=new URL(value.sourceUrl);
  const format=documentFormat(url.href);
  if(!format) throw new Error('Only NYU-hosted PDF, PPTX and DOCX files can be cached.');
  if(typeof value.title!=='string' || value.title.length>1000 || typeof value.courseTitle!=='string' || value.courseTitle.length>1000 || !Array.isArray(value.modulePath) || value.modulePath.length>100 || value.modulePath.some(p=>typeof p!=='string' || p.length>1000)) throw new Error('Invalid document metadata.');
  if(value.lastModifiedAt!=null && (typeof value.lastModifiedAt!=='string' || value.lastModifiedAt.length>100)) throw new Error('Invalid modification date.');
  return {courseId:value.courseId,topicId:value.topicId,title:value.title,courseTitle:value.courseTitle,modulePath:value.modulePath,sourceUrl:url.href,lastModifiedAt:value.lastModifiedAt || null,extension:format.extension,mimeType:format.mimeType};
}
export const cacheId=metadata=>createHash('sha256').update(`${metadata.courseId}:${metadata.topicId}`).digest('hex');

export async function openCache(directory,{budgetBytes=DEFAULT_BUDGET,now=Date.now}={}) {
  if(!Number.isSafeInteger(budgetBytes) || budgetBytes<1024) throw new Error('Cache budget must be at least 1024 bytes.');
  await mkdir(directory,{recursive:true});
  const indexPath=path.join(directory,'index.json');
  let entries={};
  try {entries=JSON.parse(await readFile(indexPath,'utf8')).entries;} catch(error) {if(error.code!=='ENOENT') throw error;}
  if(!entries || typeof entries!=='object' || Array.isArray(entries)) throw new Error('Invalid cache index.');
  const blobPath=(id,entry)=>{
    const format=documentFormat(entry?.sourceUrl);
    if(!/^[a-f0-9]{64}$/.test(id) || !format) throw new Error('Invalid cache ID or format.');
    return path.join(directory,`${id}.${format.extension}`);
  };
  for(const [id,entry] of Object.entries(entries)) {
    try {
      const meta=validateMetadata(entry);
      if(cacheId(meta)!==id || entry.id!==id) throw new Error('Invalid cache entry.');
      entries[id]={...entry,...meta};
      const info=await stat(blobPath(id,entry));if(info.size!==entry.bytes) delete entries[id];
    } catch {delete entries[id];}
  }
  const manifest=data=>JSON.stringify({version:1,entries:data});
  const usage=data=>Object.values(data).reduce((sum,e)=>sum+e.bytes,0)+Buffer.byteLength(manifest(data));
  const persist=data=>atomicWrite(indexPath,manifest(data));
  // Drop orphan blobs left by a crash, using validated, fixed-format filenames only.
  for(const name of await readdir(directory)) {
    if(/^[a-f0-9]{64}\.(?:pdf|pptx|docx)$/.test(name)) {
      const entry=entries[name.slice(0,64)];
      if(!entry || path.basename(blobPath(entry.id,entry))!==name) await unlink(path.join(directory,name));
    }
    if(/^(?:[a-f0-9]{64}|index\.json|pairing\.json)\.[a-f0-9-]{36}\.tmp$/.test(name)) await unlink(path.join(directory,name));
  }
  while(usage(entries)>budgetBytes && Object.keys(entries).length) {
    const oldest=Object.values(entries).sort((a,b)=>a.lastAccessAt-b.lastAccessAt)[0];
    delete entries[oldest.id];await unlink(blobPath(oldest.id,oldest)).catch(()=>{});
  }
  await persist(entries);
  let queue=Promise.resolve();
  const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  const stats=()=>({budgetBytes,usedBytes:usage(entries),files:Object.keys(entries).length,maxFileBytes:MAX_FILE_BYTES,maxPdfBytes:MAX_PDF_BYTES,supportedFormats:['pdf','pptx','docx']});
  return {
    list:()=>serial(async()=>Object.values(entries).map(entry=>({...entry}))),
    stats:()=>serial(async()=>stats()),
    lookup:metadata=>serial(async()=>{
      const meta=validateMetadata(metadata),id=cacheId(meta),entry=entries[id];
      const fresh=entry && entry.sourceUrl===meta.sourceUrl && entry.lastModifiedAt===meta.lastModifiedAt && (meta.lastModifiedAt || now()-entry.fetchedAt<5*60*1000);
      if(!fresh) return {hit:false,id};
      try {
        const bytes=await readFile(blobPath(id,entry));
        if(bytes.length!==entry.bytes || createHash('sha256').update(bytes).digest('hex')!==entry.sha256) return {hit:false,id};
      } catch {return {hit:false,id};}
      // Keep original fetch time; metadata changes do not duplicate the file.
      const updated={...entries,[id]:{...entry,...meta,lastAccessAt:now()}};
      if(usage(updated)>budgetBytes) return {hit:false,id};
      await persist(updated);entries=updated;
      return {hit:true,id,entry:entries[id],stats:stats()};
    }),
    put:(metadata,bytes)=>serial(async()=>{
      const meta=validateMetadata(metadata),id=cacheId(meta);
      validateDocument(bytes,documentFormat(meta.sourceUrl));
      const entry={...meta,id,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),fetchedAt:now(),lastAccessAt:now()};
      const next={...entries,[id]:entry},evicted=[];
      while(usage(next)>budgetBytes) {
        const oldest=Object.values(next).filter(e=>e.id!==id).sort((a,b)=>a.lastAccessAt-b.lastAccessAt)[0];
        if(!oldest) throw new Error('This document and its metadata exceed the cache budget.');
        delete next[oldest.id];evicted.push(oldest);
      }
      const temporary=path.join(directory,`${id}.${randomUUID()}.tmp`);
      const previous=entries[id];
      try {await writeFile(temporary,bytes);await replaceFile(temporary,blobPath(id,entry));await persist(next);} finally {await unlink(temporary).catch(()=>{});}
      entries=next;
      if(previous && previous.extension!==entry.extension) await unlink(blobPath(id,previous)).catch(()=>{});
      for(const removed of evicted) await unlink(blobPath(removed.id,removed)).catch(()=>{});
      return {hit:false,id,entry,evicted:evicted.length,stats:stats()};
    }),
    read:id=>serial(async()=>{
      const entry=entries[id];if(!entry) return null;
      let bytes;
      try {bytes=await readFile(blobPath(id,entry));} catch(error) {if(error.code==='ENOENT') return null;throw error;}
      if(bytes.length!==entry.bytes || createHash('sha256').update(bytes).digest('hex')!==entry.sha256) return null;
      entries[id]={...entry,lastAccessAt:now()};await persist(entries);
      return {entry:entries[id],bytes};
    }),
  };
}
