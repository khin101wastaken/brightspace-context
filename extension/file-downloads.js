import {sourceConfig} from './sources.js';
const HTML_TYPES=new Set(['HTML','HTM','XHTML','SHTML']);

function extension(name) {
  const dot=name.lastIndexOf('.');
  return dot>0?name.slice(dot+1):'';
}

export function downloadableFile(entry,{provider=entry?.provider??'nyu'}={}) {
  const config=sourceConfig(provider);
  if(entry?.contentType!=='file' || entry.locked) return null;
  try {
    const url=new URL(entry.sourceUrl);
    if(url.origin!==config.origin || !url.pathname.startsWith(config.contentPath) || url.username || url.password) return null;
    // Brightspace's File metadata can contain literal, unescaped '#' characters
    // (for example Lec#12.pdf). These are stored filenames, not viewer anchors.
    if(url.hash) {url.pathname+=`%23${url.hash.slice(1)}`;url.hash='';}
    const name=decodeURIComponent(url.pathname.split('/').at(-1));
    if(!name || /[/\\\x00-\x1f]/.test(name)) return null;
    const suffix=extension(name);
    return {url:url.href,name,type:/^[a-z0-9][a-z0-9_+-]{0,19}$/i.test(suffix)?suffix.toUpperCase():null};
  } catch {return null;}
}

export function resourceTypeLabel(entry) {
  if(entry?.contentType!=='file') return entry?.contentType || entry?.kind || 'Resource';
  // Display the actual suffix, even when an item is locked. Eligibility for
  // downloading is checked separately and never depends on this label.
  return downloadableFile({...entry,locked:false})?.type || 'Unknown';
}

function segment(value) {
  let name=String(value).normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,70).replace(/[.\s]+$/g,'');
  if(!name) name='Untitled';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name='_'+name;
  return name;
}

export function downloadPlan(catalog,key) {
  const entry=catalog?.entries.find(e=>e.key===key), file=downloadableFile(entry,{provider:catalog?.provider??'nyu'});
  if(!file) throw new Error('This item is not an accessible Brightspace-hosted file. Open it in Brightspace instead.');
  const byKey=new Map(catalog.entries.map(e=>[e.key,e])), folders=[], seen=new Set([key]);
  for(let parent=byKey.get(entry.parentKey);parent;parent=byKey.get(parent.parentKey)) {
    if(seen.has(parent.key)) throw new Error('Invalid module hierarchy. Rescan the course.');
    seen.add(parent.key);folders.unshift(segment(parent.title));
  }
  const suffix=extension(file.name),base=suffix?file.name.slice(0,-suffix.length-1):file.name;
  const name=`${segment(base)} [${segment(entry.id)}]${suffix?'.'+segment(suffix).toLowerCase():''}`;
  return {...(catalog.provider?{provider:catalog.provider}:{}),url:file.url,filename:['Brightspace',segment(catalog.title || `Course ${catalog.courseId}`),...folders,name].join('/')};
}

export function validateFileResponse(response,{allowHtml=false}={}) {
  if(response.status===401 || response.status===403 || response.redirected) throw new Error('Sign into Brightspace again, then retry the download.');
  if(!response.ok) throw new Error(`File unavailable (HTTP ${response.status}).`);
  const type=response.headers.get('content-type') || '';
  if(!allowHtml && /text\/html|application\/xhtml/i.test(type)) throw new Error('Brightspace returned a web page instead of the file. Sign in again or open the item in Brightspace.');
}

async function responsePrefix(response,limit=8192) {
  const reader=response.body?.getReader();
  if(!reader) throw new Error('Brightspace returned an empty HTML response.');
  const chunks=[];let length=0;
  try {
    while(length<limit) {
      const {done,value}=await reader.read();if(done) break;
      const chunk=value.subarray(0,limit-length);chunks.push(chunk);length+=chunk.length;
    }
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}

export async function preflightFile(plan,fetcher=fetch) {
  const file=downloadableFile({contentType:'file',sourceUrl:plan.url},{provider:plan.provider??'nyu'});
  if(!file) throw new Error('Invalid Brightspace file URL.');
  const allowHtml=HTML_TYPES.has(file.type);
  const options={credentials:'include',redirect:'error',signal:AbortSignal.timeout(15000)};
  let response;
  try {response=await fetcher(file.url,{...options,method:'HEAD'});}
  catch(error) {throw new Error(`Session check could not reach the file (${error.message}). No file download was started.`);}
  // Some content servers do not implement HEAD. Read only a prefix of GET,
  // cancel the body, and let Chrome own the actual download and progress.
  const fallback=[405,501].includes(response.status);
  if(!fallback) validateFileResponse(response,{allowHtml});
  if(fallback || allowHtml) {
    response=await fetcher(file.url,{...options,method:'GET',headers:{Range:'bytes=0-8191'}});
    try {
      validateFileResponse(response,{allowHtml});
      if(/text\/html|application\/xhtml/i.test(response.headers.get('content-type') || '')) {
        const prefix=await responsePrefix(response);
        const login=/<title[^>]*>[^<]*(?:\blog\s*in\b|\bsign\s*in\b|single sign.on)[^<]*<\/title\s*>/i.test(prefix)
          || /<form\b[^>]*\baction\s*=\s*["'][^"']*(?:\/d2l\/login|\/cas\/login|\/saml|login\.microsoftonline\.com|shibboleth)/i.test(prefix);
        if(!prefix.trim() || login) throw new Error('Brightspace returned a sign-in page instead of the HTML file. Sign in again, then retry.');
      }
    } finally {if(!response.bodyUsed) await response.body?.cancel();}
  }
  return {httpStatus:response.status,mime:response.headers.get('content-type') || '',allowHtml};
}

export function downloadState(item,{allowHtml=false,sourceUrl,provider='nyu'}={}) {
  const config=sourceConfig(provider);
  if(item.error) {
    if(item.error==='USER_CANCELED') return {state:'canceled',error:item.error,message:'Chrome canceled the download (USER_CANCELED). Try Save as… if no dialog appeared.'};
    const explanations={
      USER_SHUTDOWN:'The browser closed before the download finished.',
      FILE_FAILED:'Chrome could not save the file.',
      FILE_ACCESS_DENIED:'Chrome could not write to the selected download folder.',
      FILE_NAME_TOO_LONG:'The course/module folder path is too long to save.',
      FILE_NO_SPACE:'There is not enough space in the download location.',
      SERVER_UNAUTHORIZED:'Brightspace requires you to sign in again.',
      SERVER_FORBIDDEN:'Brightspace denied the download request.',
      NETWORK_FAILED:'The file transfer failed on the network.',
      SERVER_FAILED:'The file server failed to complete the download.',
      FILE_BLOCKED:'Chrome or a device policy blocked this file. Check Chrome Downloads.',
    };
    return {state:'failed',error:item.error,message:`${explanations[item.error] || 'Chrome interrupted the download.'} (${item.error})`};
  }
  if(item.state==='interrupted') return {state:'failed',message:'Download interrupted. Retry from the catalog.'};
  if(item.state==='complete') {
    let valid=false;
    try {
      const url=new URL(item.finalUrl || item.url);
      valid=url.origin===config.origin && url.pathname.startsWith(config.contentPath) && (!sourceUrl || url.pathname===new URL(sourceUrl).pathname);
    } catch {}
    if(!valid || (!allowHtml && /text\/html|application\/xhtml/i.test(item.mime || ''))) return {state:'failed',message:'Unexpected file response. Check Chrome Downloads and sign into Brightspace again.'};
    return {state:'complete',message:'Saved'};
  }
  return {state:'in_progress',message:'Downloading…'};
}
