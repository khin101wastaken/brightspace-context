import { mergeCatalog } from './catalog.js';
import {captureTarget,validateTarget} from './tab-context.js';
import {requestCourseOutline,flattenOutline,filterOutline} from './course-api.js';
import {downloadableFile} from './file-downloads.js';
const $ = id => document.getElementById(id);
const status = message => $('status').textContent = message;
let busy = false;
let currentCatalog = null;
let downloadRecords={};
const pendingDownloads=new Set();
const pendingCache=new Set();
const sizeLabel=bytes=>`${(bytes/1024/1024).toFixed(1)} MB`;
function updateCacheButtons() {
  document.querySelectorAll('button[data-cache-key]').forEach(button=>{
    const record=downloadRecords[`cache:${currentCatalog?.courseId}:${button.dataset.cacheKey}`];
    button.disabled=pendingCache.has(button.dataset.cacheKey) || record?.state==='pending';
    button.textContent=record?.state==='complete'?'Cache ↻':'Cache';
    const note=button.parentElement.querySelector('.cache-status');
    note.hidden=!record;note.textContent=record?`${record.message}${record.bytes?` · ${sizeLabel(record.bytes)}`:''}`:'';
  });
}
async function refreshCompanion() {
  try {
    const result=await chrome.runtime.sendMessage({type:'companion-status'});
    if(!result?.ok || !result.connected) throw new Error(result?.error || 'Companion is not paired.');
    $('companion-status').textContent=`Connected · ${result.files} PDFs · ${sizeLabel(result.usedBytes)} / ${sizeLabel(result.budgetBytes)} · automatic retrieval ${result.workerConnected?'connected':'not connected'}`;
  } catch(error) {$('companion-status').textContent=`Not connected. ${error.message || 'Start the companion and try again.'}`;}
}
function downloadStatus(key) {
  return Object.values(downloadRecords).filter(r=>r.courseId===currentCatalog?.courseId && r.key===key).sort((a,b)=>b.startedAt-a.startedAt)[0];
}
function updateDownloadButtons() {
  document.querySelectorAll('button[data-download-key]').forEach(button=>{
    const record=downloadStatus(button.dataset.downloadKey),pending=pendingDownloads.has(button.dataset.downloadKey);
    button.disabled=pending || record?.state==='in_progress' || record?.state==='starting';
    const label=pending || record?.state==='starting'?'Starting download':record?.state==='in_progress'?'Downloading':record?.state==='complete'?'Download again':record?.state==='failed'?'Retry download':'Download';
    button.title=`${label}: ${button.dataset.fileTitle}`;
    button.setAttribute('aria-label',button.title);
    button.setAttribute('aria-busy',String(button.disabled));
    const note=button.parentElement.querySelector('.download-status');
    note.textContent=record?.message || '';
    note.hidden=!record || record.state==='complete';
    button.parentElement.querySelector('.download-details').hidden=!record || !['failed','canceled'].includes(record.state);
    const saveAs=button.parentElement.querySelector('.download-save-as');
    saveAs.hidden=false;
    saveAs.disabled=button.disabled;
  });
}
// Capture once when this popup opens. All later operations use the same tab ID,
// including after another browser window gains focus.
const targetPromise = captureTarget(chrome.tabs,{allowHome:true});
async function activeCourse() {
  const target=await targetPromise;
  if(!target.courseId) throw new Error('Open a specific course for this action. Use Sync selected semester from My Home.');
  return validateTarget(chrome.tabs,target);
}
async function refreshSavedCourses() {
  const values=await chrome.storage.local.get(null),select=$('saved-course');
  select.replaceChildren(new Option('Choose a course…',''));
  const included=new Set();$('semester-errors').replaceChildren();
  for(const [key,semester] of Object.entries(values)) if(key.startsWith('semester:')) {
    const group=document.createElement('optgroup');group.label=semester.title;
    for(const course of semester.courses) {
      if(values[`course:${course.courseId}`]) {group.append(new Option(course.title,course.courseId));included.add(course.courseId);}
      if(course.status==='failed') {const note=document.createElement('p');note.textContent=`${semester.title} · ${course.title}: ${course.error} Previous outline kept when available.`;$('semester-errors').append(note);}
    }
    select.append(group);
  }
  const other=document.createElement('optgroup');other.label='Other saved courses';
  for(const [key,course] of Object.entries(values)) if(key.startsWith('course:') && !included.has(course.courseId)) other.append(new Option(course.title,course.courseId));
  if(other.children.length) select.append(other);
  select.value=currentCatalog?.courseId || '';
  if(values.semesterSync) $('semester-status').textContent=values.semesterSync.message;
}
$('saved-course').addEventListener('change',async()=>{
  const id=$('saved-course').value;if(!id) return;
  const key=`course:${id}`,foldersKey=`folders:${id}`,saved=await chrome.storage.local.get([key,foldersKey]);
  if(saved[key]) render({...saved[key],openFolders:saved[foldersKey] || []});
});
for(const [id,type] of [['sync-semester','sync-semester'],['send-catalog','send-catalog']]) $(id).addEventListener('click',async()=>{
  if(busy) return;busy=true;$(id).disabled=true;
  try {
    const target=type==='sync-semester'?await targetPromise:null;
    $('semester-status').textContent=type==='sync-semester'?'Reading semester course list…':'Sending saved catalog…';
    const result=await chrome.runtime.sendMessage({type,...(target?{tabId:target.tabId}:{})});
    if(!result?.ok) throw new Error(result?.error || 'Catalog sync failed.');
    await refreshSavedCourses();$('semester-status').textContent=result.message;
  } catch(error) {$('semester-status').textContent=error.message;}
  finally {busy=false;$(id).disabled=false;}
});
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
      } else {
        const row=document.createElement('div');row.className='file-row';
        const label=document.createElement('div'); label.className='file-label';label.append(kind,a);row.append(label);content.append(row);
        if(downloadableFile(e)) {
          const controls=document.createElement('div');controls.className='file-controls';
          const button=document.createElement('button');button.className='inline-download';button.dataset.downloadKey=e.key;button.dataset.fileTitle=e.title;
          const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
          icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('width','16');icon.setAttribute('height','16');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
          const path=document.createElementNS('http://www.w3.org/2000/svg','path');
          path.setAttribute('d','M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5');
          path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
          icon.append(path);button.append(icon);
          const note=document.createElement('span');note.className='download-status';note.setAttribute('role','status');
          const details=document.createElement('button');details.className='download-details';details.textContent='Details';details.hidden=true;
          details.addEventListener('click',()=>{
            const record=downloadStatus(e.key);
            const fields=['phase','nativeState','error','httpStatus','mime','saveMode','bytesReceived','totalBytes','filename','finalOrigin'];
            $('download-debug').textContent=record?fields.filter(key=>record[key]!=null).map(key=>`${key}: ${record[key]}`).join('\n'):'No download record found.';
            $('download-debug').hidden=false;
          });
          const startDownload=async(saveAs=false)=>{
            if(pendingDownloads.has(e.key)) return;
            pendingDownloads.add(e.key);updateDownloadButtons();
            try {
              const response=await chrome.runtime.sendMessage({type:'download-file',courseId:catalog.courseId,key:e.key,saveAs});
              if(!response?.ok) throw new Error(response?.error || 'Download could not start.');
              downloadRecords=await chrome.storage.session.get(null);
              status('Download started. Chrome continues downloading if you close this popup.');
            } catch(error) {downloadRecords=await chrome.storage.session.get(null);status(error.message);} finally {pendingDownloads.delete(e.key);updateDownloadButtons();}
          };
          button.addEventListener('click',()=>startDownload(false));
          const saveAs=document.createElement('button');saveAs.className='download-save-as';saveAs.textContent='Save as…';
          saveAs.setAttribute('aria-label',`Choose save location for ${e.title}`);
          saveAs.addEventListener('click',()=>startDownload(true));
          controls.append(button,saveAs,note,details);row.append(controls);
          if(/\.pdf$/i.test(new URL(e.sourceUrl).pathname)) {
            const cache=document.createElement('button');cache.className='cache-pdf';cache.dataset.cacheKey=e.key;
            cache.title=`Cache ${e.title} locally`;cache.setAttribute('aria-label',cache.title);
            const cacheNote=document.createElement('span');cacheNote.className='cache-status';cacheNote.setAttribute('role','status');
            cache.addEventListener('click',async()=>{
              if(pendingCache.has(e.key)) return;
              pendingCache.add(e.key);updateCacheButtons();
              try {
                const result=await chrome.runtime.sendMessage({type:'cache-file',courseId:catalog.courseId,key:e.key});
                if(!result?.ok) throw new Error(result?.error || 'Could not cache this PDF.');
                status(result.source==='cache'?'Cache hit: served locally without downloading the PDF again.':'PDF fetched and cached locally. Click Cache again to verify a hit.');
                await refreshCompanion();
              } catch(error) {status(error.message);} finally {
                downloadRecords=await chrome.storage.session.get(null);pendingCache.delete(e.key);updateCacheButtons();
              }
            });
            controls.insertBefore(cache,note);controls.append(cacheNote);controls.classList.add('has-cache');
          }
        }
      }
      if (e.kind==='document' && (!e.parentKey || !byKey.has(e.parentKey))) {const note=document.createElement('div'); note.className='unresolved'; note.textContent='Module relationship not yet resolved'; li.append(note);}
      content.append(list(children.get(e.key))); ul.append(li);
    }
    return ul;
  }
  $('catalog').append(list(children.get(null)));
  $('catalog').append(list(filtered.filter(e=>!seen.has(e.key))));
  mounted = true;
  updateDownloadButtons();
  updateCacheButtons();
}
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local') {
    if(changes.retrievalStatus?.newValue) $('retrieval-status').textContent=changes.retrievalStatus.newValue.message;
    if(changes.semesterSync?.newValue) $('semester-status').textContent=changes.semesterSync.newValue.message;
    if(Object.keys(changes).some(key=>key.startsWith('semester:') || key.startsWith('course:'))) refreshSavedCourses().catch(error=>status(error.message));
    return;
  }
  if(area!=='session') return;
  for(const [key,change] of Object.entries(changes)) {
    if(!key.startsWith('download:') && !key.startsWith('attempt:') && !key.startsWith('cache:')) continue;
    if(change.newValue) downloadRecords[key]=change.newValue; else delete downloadRecords[key];
  }
  updateDownloadButtons();
  updateCacheButtons();
});
$('pair-form').addEventListener('submit',async event=>{
  event.preventDefault();$('pair-button').disabled=true;
  try {
    const result=await chrome.runtime.sendMessage({type:'pair-companion',code:$('pair-code').value});
    if(!result?.ok) throw new Error(result?.error || 'Unable to connect.');
    $('pair-code').value='';await refreshCompanion();
  } catch(error) {$('companion-status').textContent=`Connection failed: ${error.message}`;}
  finally {$('pair-button').disabled=false;}
});
$('companion-refresh').addEventListener('click',refreshCompanion);
$('automatic-retrieval').addEventListener('change',async()=>{
  const enabled=$('automatic-retrieval').checked;
  try {const result=await chrome.runtime.sendMessage({type:'retrieval-settings',enabled});if(!result?.ok) throw new Error(result?.error || 'Could not change automatic retrieval.');}
  catch(error) {$('automatic-retrieval').checked=!enabled;$('retrieval-status').textContent=error.message;}
});
$('retry-requests').addEventListener('click',async()=>{
  $('retry-requests').disabled=true;
  try {
    const result=await chrome.runtime.sendMessage({type:'retry-requests'});if(!result?.ok) throw new Error(result?.error || 'Could not retry requests.');
    $('retrieval-status').textContent=`${result.retried} sign-in-blocked request${result.retried===1?'':'s'} retried.`;
  } catch(error) {$('retrieval-status').textContent=error.message;}
  finally {$('retry-requests').disabled=false;}
});
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
    downloadRecords=await chrome.storage.session.get(null);
    if(saved[key]) render({...saved[key],openFolders:saved[foldersKey] || []});
  } catch(error) {status(error.message);}
  await refreshSavedCourses();
  const retrieval=await chrome.storage.local.get(['automaticRetrieval','retrievalStatus']);
  $('automatic-retrieval').checked=retrieval.automaticRetrieval!==false;
  $('retrieval-status').textContent=retrieval.retrievalStatus?.message || 'Reload the extension to connect automatic retrieval.';
  await refreshCompanion();
})();
