import {downloadableFile} from './file-downloads.js';
export const COMPANION_URL='http://127.0.0.1:47653';

async function request(path,{token,method='GET',body,headers={}}={},fetcher=fetch) {
  const response=await fetcher(COMPANION_URL+path,{method,headers:{...headers,...(token?{Authorization:`Bearer ${token}`}:{})},body,signal:AbortSignal.timeout(30000)});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error || `Companion request failed (HTTP ${response.status}).`);
  return result;
}
export async function pairCompanion(code,fetcher=fetch) {
  if(typeof code!=='string' || !/^[a-f0-9]{10}$/i.test(code.trim())) throw new Error('Enter the 10-character pairing code printed by the companion.');
  return request('/v1/pair',{method:'POST',body:JSON.stringify({code:code.trim()}),headers:{'Content-Type':'application/json'}},fetcher);
}
export const companionStatus=(token,fetcher=fetch)=>request('/v1/status',{token},fetcher);
export const syncCatalog=(snapshot,token,fetcher=fetch)=>request('/v1/catalog/semesters',{token,method:'PUT',body:JSON.stringify(snapshot),headers:{'Content-Type':'application/json'}},fetcher);

export function pdfMetadata(catalog,key) {
  const entry=catalog?.entries.find(e=>e.key===key),file=downloadableFile(entry);
  if(!file || !/\.pdf$/i.test(new URL(file.url).pathname)) throw new Error('Local caching currently supports Brightspace-hosted PDFs only.');
  const byKey=new Map(catalog.entries.map(e=>[e.key,e])),modulePath=[],seen=new Set([key]);
  for(let parent=byKey.get(entry.parentKey);parent;parent=byKey.get(parent.parentKey)) {
    if(seen.has(parent.key)) throw new Error('Invalid module hierarchy. Rescan the course.');
    seen.add(parent.key);modulePath.unshift(parent.title);
  }
  return {courseId:catalog.courseId,topicId:entry.id,title:entry.title,courseTitle:catalog.title,modulePath,sourceUrl:file.url,lastModifiedAt:entry.lastModifiedAt || null};
}

export async function cachePdf(catalog,key,token,fetcher=fetch,onPhase=()=>{}) {
  if(!token) throw new Error('Start the companion and pair it in the Local cache panel first.');
  const metadata=pdfMetadata(catalog,key);
  onPhase('Checking local cache…');
  const lookup=await request('/v1/cache/lookup',{token,method:'POST',body:JSON.stringify(metadata),headers:{'Content-Type':'application/json'}},fetcher);
  if(lookup.hit) return {...lookup,source:'cache'};
  onPhase('Fetching PDF from Brightspace…');
  const response=await fetcher(metadata.sourceUrl,{credentials:'include',redirect:'error',signal:AbortSignal.timeout(90000)});
  if(response.status===401 || response.status===403 || response.redirected) throw new Error('Sign into Brightspace in Chrome, then retry caching this PDF.');
  if(!response.ok) throw new Error(`Brightspace PDF request failed (HTTP ${response.status}).`);
  if(!/application\/pdf|application\/octet-stream/i.test(response.headers.get('content-type') || '')) throw new Error('Brightspace did not return PDF data. Check your sign-in.');
  const limit=Math.min(lookup.maxPdfBytes,50*1024*1024);
  if(!Number.isSafeInteger(limit) || limit<=0) throw new Error('Invalid companion upload limit.');
  if(Number(response.headers.get('content-length'))>limit) {await response.body?.cancel();throw new Error('PDF exceeds the 50 MB per-file limit.');}
  const reader=response.body?.getReader();if(!reader) throw new Error('The PDF response has no body.');
  const chunks=[];let length=0;
  try {
    while(true) {const {done,value}=await reader.read();if(done) break;length+=value.length;if(length>limit) {await reader.cancel();throw new Error('PDF exceeds the 50 MB per-file limit.');}chunks.push(value);}
  } finally {reader.releaseLock();}
  const blob=new Blob(chunks,{type:'application/pdf'});
  if(await blob.slice(0,5).text()!=='%PDF-') throw new Error('Downloaded data is not a PDF. Nothing was cached.');
  onPhase('Saving to local cache…');
  const saved=await request(`/v1/cache/uploads/${lookup.uploadId}`,{token,method:'PUT',body:blob,headers:{'Content-Type':'application/pdf'}},fetcher);
  return {...saved,source:'brightspace'};
}
