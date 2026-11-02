import { mergeCatalog } from './catalog.js';
import {captureTarget,validateTarget} from './tab-context.js';
import {requestCourseOutline,flattenOutline,filterOutline} from './course-api.js';
const $ = id => document.getElementById(id);
const status = message => $('status').textContent = message;
let busy = false;
let currentCatalog = null;
// Capture once when this popup opens. All later operations use the same tab ID,
// including after another browser window gains focus.
const targetPromise = captureTarget(chrome.tabs);
async function activeCourse() {
  return validateTarget(chrome.tabs,await targetPromise);
}
function render(catalog) {
  $('catalog').replaceChildren();
  if (!catalog) return;
  currentCatalog=catalog;
  const query=$('search').value;
  const filtered=filterOutline(catalog.entries,query);
  $('course').textContent = catalog.title || `Course ${catalog.courseId}`;
  $('summary').textContent = `${catalog.entries.length} catalog entries · ${catalog.coverage==='full-toc'?'full course outline':catalog.coverage==='expanded-outline'?'expanded outline':'partial scan'} · ${new Date(catalog.lastScannedAt).toLocaleString()}${query?` · ${filtered.length} entries with parent folders`:''}`;
  const byKey = new Map(filtered.map(e => [e.key,e]));
  const children = new Map();
  for (const e of filtered) {
    const parent = e.parentKey && e.parentKey !== e.key && byKey.has(e.parentKey) ? e.parentKey : null;
    if (!children.has(parent)) children.set(parent,[]);
    children.get(parent).push(e);
  }
  const seen = new Set();
  const foldersKey = `folders:${catalog.courseId}`;
  const openFolders = new Set(catalog.openFolders || []);
  let mounted = false;
  function list(items) {
    const ul = document.createElement('ul');
    for (const e of [...(items || [])].sort((a,b)=>(a.order??0)-(b.order??0))) {
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      const li=document.createElement('li'), kind=document.createElement('span'), a=document.createElement('a');
      kind.className='kind'; kind.textContent=e.contentType || e.kind;
      a.textContent=e.title; a.href=e.url; a.target='_blank'; a.rel='noopener';
      let content=li;
      if(e.kind==='module') {
        const details=document.createElement('details'), summary=document.createElement('summary');
        details.open=!!query || openFolders.has(e.key);
        summary.append(document.createTextNode(e.title));
        const count=document.createElement('span'); count.className='count'; count.textContent=` ${children.get(e.key)?.length || 0}`; summary.append(count);
        details.append(summary); li.append(details); content=details;
        details.addEventListener('toggle',()=>{
          if(!mounted || query) return;
          if(details.open) openFolders.add(e.key); else openFolders.delete(e.key);
          catalog.openFolders=[...openFolders];
          chrome.storage.local.set({[foldersKey]:[...openFolders]}).catch(error=>status(error.message));
        });
        a.className='module-link'; a.textContent='Open module in Brightspace'; content.append(a);
      } else content.append(kind,a);
      if (e.kind==='document' && (!e.parentKey || !byKey.has(e.parentKey))) {const note=document.createElement('div'); note.className='unresolved'; note.textContent='Module relationship not yet resolved'; li.append(note);}
      content.append(list(children.get(e.key))); ul.append(li);
    }
    return ul;
  }
  $('catalog').append(list(children.get(null)));
  $('catalog').append(list(filtered.filter(e=>!seen.has(e.key))));
  mounted = true;
}
async function action(fn) {
  if(busy) return; busy=true; $('scan').disabled=$('download').disabled=true;
  try {await startup; await fn();} catch(error) {status(error.message);} finally {busy=false; $('scan').disabled=$('download').disabled=false;}
}
$('scan').addEventListener('click',()=>action(async()=>{
  const {tab,identity}=await activeCourse(); status('Loading the full course outline…');
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:requestCourseOutline,args:[identity.courseId]});
  if(results[0]?.error) throw new Error(results[0].error.message || 'Unable to read the course outline.');
  const entries=flattenOutline(results[0]?.result,identity.courseId);
  const latest=await activeCourse();
  const storageKey=`course:${identity.courseId}`;
  const saved=(await chrome.storage.local.get(storageKey))[storageKey];
  const title=latest.tab.title?.replace(/^.*? - /,'') || saved?.title || `Course ${identity.courseId}`;
  const catalog=mergeCatalog(saved,{courseId:identity.courseId,title,entries,coverage:'full-toc'});
  catalog.openFolders=(await chrome.storage.local.get(`folders:${identity.courseId}`))[`folders:${identity.courseId}`] || [];
  await chrome.storage.local.set({[storageKey]:catalog}); render(catalog);
  const modules=entries.filter(e=>e.kind==='module').length;
  status(`Loaded ${modules} modules and ${entries.length-modules} topics. No page expansion or document downloads needed.`);
}));
$('search').addEventListener('input',()=>{if(currentCatalog) render(currentCatalog);});
$('download').addEventListener('click',()=>action(async()=>{
  const {tab,identity}=await activeCourse();
  if(identity.kind!=='document' || !identity.id) throw new Error('Open a specific document in the Brightspace Lessons viewer first.');
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['download.js']});
  if(!results.some(r=>r.result?.requested)) throw new Error('No supported document download control found. Use Brightspace’s Download button; this layout needs verification.');
  status('Requested download through Brightspace. Check Chrome’s Downloads for completion; this prototype does not verify the saved file.');
}));
const startup=(async()=>{
  try {
    const target=await targetPromise;
    $('source').textContent=`Source: ${target.title} · tab ${target.tabId}`;
    const key=`course:${target.courseId}`, foldersKey=`folders:${target.courseId}`;
    const saved=await chrome.storage.local.get([key,foldersKey]);
    if(saved[key]) render({...saved[key],openFolders:saved[foldersKey] || []});
  } catch(error) {status(error.message);}
})();
