import {downloadableFile} from './file-downloads.js';
import {documentFormat,validateDocument,MAX_FILE_BYTES} from './document-formats.js';
export const COMPANION_URL='http://127.0.0.1:47653';
const documentRequests=new Map();

async function request(path,{token,method='GET',body,headers={},timeoutMs=30000}={},fetcher=fetch) {
  const response=await fetcher(COMPANION_URL+path,{method,headers:{...headers,...(token?{Authorization:`Bearer ${token}`}:{})},body,signal:AbortSignal.timeout(timeoutMs)});
  const result=await response.json();
  if(!response.ok) throw Object.assign(new Error(result.error || `Companion request failed (HTTP ${response.status}).`),{status:response.status,code:result.code});
  return result;
}
export async function pairCompanion(code,fetcher=fetch) {
  if(typeof code!=='string' || !/^[a-f0-9]{10}$/i.test(code.trim())) throw new Error('Enter the 10-character pairing code printed by the companion.');
  return request('/v1/pair',{method:'POST',body:JSON.stringify({code:code.trim()}),headers:{'Content-Type':'application/json'}},fetcher);
}
// A privileged extension GET may omit Origin. POST keeps the companion's
// existing origin + token checks without treating a healthy process as offline.
export const companionStatus=(token,fetcher=fetch,{timeoutMs=5000}={})=>request('/v1/status',{token,method:'POST',body:'{}',headers:{'Content-Type':'application/json'},timeoutMs},fetcher);
export const syncCatalog=(snapshot,token,fetcher=fetch)=>request('/v1/catalog/semesters',{token,method:'PUT',body:JSON.stringify(snapshot),headers:{'Content-Type':'application/json'}},fetcher);
export const claimRequest=(token,fetcher=fetch)=>request('/v1/requests/claim',{token,method:'POST'},fetcher);
export const finishRequest=(value,token,fetcher=fetch)=>request('/v1/requests/finish',{token,method:'POST',body:JSON.stringify(value),headers:{'Content-Type':'application/json'}},fetcher);
export const retryLoginRequests=(token,fetcher=fetch)=>request('/v1/requests/retry-login',{token,method:'POST'},fetcher);

export function documentMetadata(catalog,key) {
  const entry=catalog?.entries.find(e=>e.key===key),file=downloadableFile(entry);
  if(!file || !documentFormat(file.url)) throw new Error('Local caching supports Brightspace-hosted PDF, PPTX and DOCX files.');
  const byKey=new Map(catalog.entries.map(e=>[e.key,e])),modulePath=[],seen=new Set([key]);
  for(let parent=byKey.get(entry.parentKey);parent;parent=byKey.get(parent.parentKey)) {
    if(seen.has(parent.key)) throw new Error('Invalid module hierarchy. Rescan the course.');
    seen.add(parent.key);modulePath.unshift(parent.title);
  }
  return {courseId:catalog.courseId,topicId:entry.id,title:entry.title,courseTitle:catalog.title,modulePath,sourceUrl:file.url,lastModifiedAt:entry.lastModifiedAt || null};
}

export async function cacheDocument(catalog,key,token,fetcher=fetch,onPhase=()=>{}) {
  return cacheDocumentMetadata(documentMetadata(catalog,key),token,fetcher,onPhase);
}
export function cacheDocumentMetadata(metadata,token,fetcher=fetch,onPhase=()=>{}) {
  const key=JSON.stringify([token,metadata?.courseId,metadata?.topicId,metadata?.sourceUrl,metadata?.lastModifiedAt]);
  if(documentRequests.has(key)) return documentRequests.get(key);
  const task=fetchDocumentMetadata(metadata,token,fetcher,onPhase).finally(()=>documentRequests.delete(key));
  documentRequests.set(key,task);return task;
}
async function fetchDocumentMetadata(metadata,token,fetcher,onPhase) {
  if(!token) throw new Error('Start the companion and pair it in the Local cache panel first.');
  const file=downloadableFile({contentType:'file',sourceUrl:metadata?.sourceUrl});
  const format=file && documentFormat(file.url);
  if(!format) throw new Error('Only supported NYU-hosted PDF, PPTX and DOCX files may be retrieved.');
  onPhase('Checking local cache…');
  const lookup=await request('/v1/cache/lookup',{token,method:'POST',body:JSON.stringify(metadata),headers:{'Content-Type':'application/json'}},fetcher);
  if(lookup.hit) return {...lookup,source:'cache'};
  onPhase(`Fetching ${format.extension.toUpperCase()} from Brightspace…`);
  let response;
  try {response=await fetcher(metadata.sourceUrl,{credentials:'include',redirect:'error',signal:AbortSignal.timeout(90000)});}
  catch {throw Object.assign(new Error('Chrome could not fetch this document. Check your connection and Brightspace sign-in.'),{code:'NETWORK_ERROR'});}
  if(response.status===401 || response.redirected) throw Object.assign(new Error('Sign into Brightspace in Chrome, then retry caching this document.'),{code:'NEEDS_LOGIN'});
  if(response.status===403) throw Object.assign(new Error('Brightspace denied access to this document.'),{code:'ACCESS_DENIED'});
  if(!response.ok) throw new Error(`Brightspace document request failed (HTTP ${response.status}).`);
  const mime=(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if(['text/html','application/xhtml+xml'].includes(mime)) {await response.body?.cancel();throw Object.assign(new Error(`Brightspace did not return ${format.extension.toUpperCase()} data. Check your sign-in.`),{code:'NEEDS_LOGIN'});}
  // Office downloads may be labelled ZIP/octet-stream by the LMS. Validate
  // package contents below, independently of the response's Content-Type.
  if(!['',format.mimeType,'application/octet-stream',...(format.extension==='pdf'?[]:['application/zip','application/x-zip-compressed'])].includes(mime)) {await response.body?.cancel();throw Object.assign(new Error('Brightspace returned an unexpected document type.'),{code:format.extension==='pdf'?'INVALID_PDF':'INVALID_FILE'});}
  const limit=Math.min(lookup.maxFileBytes??lookup.maxPdfBytes,MAX_FILE_BYTES);
  if(!Number.isSafeInteger(limit) || limit<=0) throw new Error('Invalid companion upload limit.');
  if(Number(response.headers.get('content-length'))>limit) {await response.body?.cancel();throw new Error('Document exceeds the 50 MB per-file limit.');}
  const reader=response.body?.getReader();if(!reader) throw new Error('The document response has no body.');
  const chunks=[];let length=0;
  try {
    while(true) {const {done,value}=await reader.read();if(done) break;length+=value.length;if(length>limit) {await reader.cancel();throw new Error('Document exceeds the 50 MB per-file limit.');}chunks.push(value);}
  } finally {reader.releaseLock();}
  const blob=new Blob(chunks,{type:format.mimeType});
  validateDocument(new Uint8Array(await blob.arrayBuffer()),format);
  onPhase('Saving to local cache…');
  const saved=await request(`/v1/cache/uploads/${lookup.uploadId}`,{token,method:'PUT',body:blob,headers:{'Content-Type':format.mimeType}},fetcher);
  return {...saved,source:'brightspace'};
}
