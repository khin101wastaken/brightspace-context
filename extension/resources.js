import { mergeCatalog } from './catalog.js';
import {captureTarget,validateTarget} from './tab-context.js';
import {flattenOutline,searchOutline} from './course-api.js';
import {appendHighlightedText,appendHighlightedPassages} from './search-highlight.js';
import {wireProductLinks} from './product-links.js';
import {readCourseOutline} from './brightspace-client.js';
import {downloadableFile,resourceTypeLabel} from './file-downloads.js';
import {documentFormat} from './document-formats.js';
import {enhanceSemesterPicker} from './semester-picker.js';
import {animateDisclosure} from './ui-motion.js';
import {createSyncStatus} from './sync-progress.js';
const $ = id => document.getElementById(id);
const semesterPicker=enhanceSemesterPicker($('semester-select'));
wireProductLinks(document);
const status = message => {$('status').textContent=message;$('status').hidden=!message;};
const syncStatus=createSyncStatus($('semester-status'));
const semesterStatus=message=>syncStatus.message(message);
let busy = false;
let currentCatalog = null;
let selectedSemester='',showCacheControls=false,libraryValues={};
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
    $('companion-status').textContent=`Connected · ${result.files} files · ${sizeLabel(result.usedBytes)} / ${sizeLabel(result.budgetBytes)} · automatic retrieval ${result.workerConnected?'connected':'not connected'}`;
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
// Resolve the tab captured by Connect, rather than this Resources tab. Later
// changes in browser/window focus do not retarget scans.
const sourceId=new URL(location.href).searchParams.get('sourceTabId');
let targetPromise=sourceId && /^\d+$/.test(sourceId)?captureTarget(chrome.tabs,{allowHome:true,tabId:Number(sourceId)}).catch(()=>null):Promise.resolve(null);
async function activeCourse() {
  const target=await targetPromise;
  if(!target?.courseId) throw new Error('Open a course in Brightspace, then reopen Resources from the extension to scan that source course.');
  return validateTarget(chrome.tabs,target);
}
async function refreshSavedCourses() {
  libraryValues=await chrome.storage.local.get(null);
  const savedSemesters=Object.entries(libraryValues).filter(([key])=>key.startsWith('semester:')).map(([,value])=>value);
  const all=new Map(savedSemesters.map(s=>[s.semesterId,s]));
  for(const semester of libraryValues.availableSemesters || []) if(!all.has(semester.semesterId)) all.set(semester.semesterId,{...semester,courses:[]});
  const rank=semester=>{const year=semester.title.match(/\b(20\d{2})\b/)?.[1];return year?Number(year)*10+(/Fall/i.test(semester.title)?4:/Summer/i.test(semester.title)?3:/Spring/i.test(semester.title)?2:1):0;};
  const semesters=[...all.values()].sort((a,b)=>rank(b)-rank(a) || a.title.localeCompare(b.title));
  const included=new Set(semesters.flatMap(s=>s.courses.map(c=>c.courseId)));
  const other=Object.entries(libraryValues).filter(([key,value])=>key.startsWith('course:') && !included.has(value.courseId)).map(([,course])=>({courseId:course.courseId,title:course.title,status:'complete'}));
  if(other.length) semesters.push({semesterId:'other',title:'Other saved courses',courses:other});
  const select=$('semester-select');select.replaceChildren();
  for(const semester of semesters) select.append(new Option(semester.title,semester.semesterId));
  if(!semesters.length) select.append(new Option('Refresh to load semesters',''));
  if(!semesters.some(s=>s.semesterId===selectedSemester)) {
    selectedSemester=libraryValues.resourcesSelection?.semesterId || semesters[0]?.semesterId || '';
    if(!semesters.some(s=>s.semesterId===selectedSemester)) selectedSemester=semesters[0]?.semesterId || '';
  }
  select.value=selectedSemester;
  semesterPicker.refresh();
  $('sync-semester').disabled=busy || !/^\d+$/.test(selectedSemester);
  const semester=semesters.find(s=>s.semesterId===selectedSemester);
  $('semester-name').textContent=semester?.title || 'YOUR LIBRARY';
  $('course-list').replaceChildren();$('semester-errors').replaceChildren();
  $('course-count').textContent=semester?.courses.length || '';
  $('sidebar-empty').hidden=!!semester?.courses.length;
  for(const course of semester?.courses || []) {
    const button=document.createElement('button');button.className='course-item';button.type='button';button.dataset.courseId=course.courseId;
    const title=document.createElement('span');title.textContent=course.title;button.append(title);
    const note=document.createElement('small'),catalog=libraryValues[`course:${course.courseId}`];
    note.textContent=catalog?`${catalog.entries.filter(e=>e.kind==='document').length} resources${course.status==='failed'?' · last sync failed':''}`:'Outline unavailable';button.append(note);
    button.addEventListener('click',()=>selectCourse(course.courseId));$('course-list').append(button);
    if(course.status==='failed') {const warning=document.createElement('p');warning.textContent=`${course.title}: ${course.error} Previous outline kept when available.`;$('semester-errors').append(warning);}
  }
  const courseId=semester?.courses.find(c=>c.courseId===currentCatalog?.courseId)?.courseId || semester?.courses.find(c=>c.courseId===libraryValues.resourcesSelection?.courseId)?.courseId || semester?.courses.find(c=>libraryValues[`course:${c.courseId}`])?.courseId;
  selectCourse(courseId,false);
  if(libraryValues.semesterSync?.state) syncStatus.render(libraryValues.semesterSync,{restore:true});
}
function selectCourse(id,persist=true) {
  const saved=libraryValues[`course:${id}`];
  if(currentCatalog?.courseId!==id) $('search').value='';
  render(saved?{...saved,openFolders:libraryValues[`folders:${id}`] || []}:null);
  document.querySelectorAll('.course-item').forEach(button=>button.setAttribute('aria-current',String(button.dataset.courseId===id)));
  if(persist && id) {libraryValues.resourcesSelection={semesterId:selectedSemester,courseId:id};chrome.storage.local.set({resourcesSelection:libraryValues.resourcesSelection}).catch(error=>status(error.message));}
}
$('semester-select').addEventListener('change',()=>{selectedSemester=$('semester-select').value;currentCatalog=null;void refreshSavedCourses();});
async function loadSemesters() {
  $('refresh-semesters').disabled=true;
  try {
    const result=await chrome.runtime.sendMessage({type:'list-semesters'});
    if(!result?.ok) throw new Error(result?.error || 'Unable to load semesters.');
    await refreshSavedCourses();
    if(!busy && !libraryValues.semesterSync) semesterStatus('');
  } catch(error) {semesterStatus(error.message+' Saved course outlines are still available.');}
  finally {$('refresh-semesters').disabled=false;}
}
$('refresh-semesters').addEventListener('click',loadSemesters);
for(const [id,type] of [['sync-semester','sync-semester'],['send-catalog','send-catalog']]) $(id).addEventListener('click',async()=>{
  if(busy) return;busy=true;$(id).disabled=true;
  try {
    semesterStatus(type==='sync-semester'?'Loading this semester’s courses from Brightspace…':'Sending saved catalog…');
    const result=await chrome.runtime.sendMessage({type,...(type==='sync-semester'?{semesterId:selectedSemester}:{})});
    if(!result?.ok) throw new Error(result?.error || 'Catalog sync failed.');
    await refreshSavedCourses();if(type==='sync-semester' && libraryValues.semesterSync) syncStatus.render(libraryValues.semesterSync);else semesterStatus(result.message);
  } catch(error) {if(type==='sync-semester' && libraryValues.semesterSync?.state==='failed') syncStatus.render(libraryValues.semesterSync);else semesterStatus(error.message);}
  finally {busy=false;$(id).disabled=type==='sync-semester' && !/^\d+$/.test(selectedSemester);}
});
function render(catalog) {
  $('catalog').replaceChildren();
  currentCatalog=catalog;
  $('resources-empty').hidden=!!catalog;$('resource-tools').hidden=!catalog;
  if(!catalog) {$('course').textContent='Course resources';$('summary').textContent='Choose a saved course, or sync a semester to get started.';return;}
  const rawQuery=$('search').value,query=rawQuery.trim(),search=searchOutline(catalog.entries,rawQuery),filtered=search.entries;
  const highlightOptions={prefixTerms:search.prefixTerms};
  $('course').textContent = catalog.title || `Course ${catalog.courseId}`;
  const matches=[search.resourceMatches?`${search.resourceMatches} resource match${search.resourceMatches===1?'':'es'}`:'',search.moduleMatches?`${search.moduleMatches} module match${search.moduleMatches===1?'':'es'}`:''].filter(Boolean).join(' · ') || 'No matches';
  $('summary').textContent = `${catalog.entries.filter(e=>e.kind==='document').length} resources · ${catalog.entries.filter(e=>e.kind==='module').length} modules · Updated ${new Date(catalog.lastScannedAt).toLocaleDateString()}${query?` · ${matches}`:''}`;
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
      kind.className='kind'; kind.textContent=resourceTypeLabel(e);
      if(e.contentType==='file') kind.title=kind.textContent==='Unknown'?'File type not supplied in the resource URL':`${kind.textContent} file${e.locked?' · locked':''}`;
      appendHighlightedText(a,e.title,search.matches.has(e.key)?search.terms:[],highlightOptions);a.href=e.url; a.target='_blank'; a.rel='noopener';
      let content=li;
      if(e.kind==='module') {
        const details=document.createElement('details'), summary=document.createElement('summary');
        details.open=query?search.expandedModules.has(e.key):openFolders.has(e.key);
        appendHighlightedText(summary,e.title,search.matches.has(e.key)?search.terms:[],highlightOptions);
        if(search.deepestMatches.has(e.key)) summary.classList.add('search-match');
        const count=document.createElement('span'),childCount=children.get(e.key)?.length || 0;count.className='count';count.textContent=` ${childCount}`;count.hidden=!!query && !childCount;summary.append(count);
        details.append(summary); li.append(details); content=details;
        animateDisclosure(details);
        details.addEventListener('toggle',()=>{
          if(!mounted || query) return;
          if(details.open) openFolders.add(e.key); else openFolders.delete(e.key);
          catalog.openFolders=[...openFolders];
          chrome.storage.local.set({[foldersKey]:[...openFolders]}).catch(error=>status(error.message));
        });
        a.className='module-link'; a.textContent='Open module in Brightspace'; content.append(a);
        if(e.description) {
          const notes=document.createElement('details'),heading=document.createElement('summary'),text=document.createElement('p');
          notes.className='module-notes';notes.open=search.noteMatches.has(e.key);heading.textContent=notes.open?'Module notes · matching text':'Module notes';
          text.tabIndex=0;text.setAttribute('aria-label','Module notes');
          appendHighlightedPassages(text,e.description,search.noteMatches.has(e.key)?search.terms:[],highlightOptions);
          if(e.descriptionTruncated) text.append(document.createTextNode('\n[Notes truncated; open module for the full text.]'));
          notes.append(heading,text);content.append(notes);
          animateDisclosure(notes);
        }
        if(e.descriptionStatus==='unavailable') {
          const note=document.createElement('p');note.className='module-notes-unavailable';note.textContent='Module notes unavailable. Open in Brightspace to check access.';content.append(note);
        }
      } else {
        const row=document.createElement('div');row.className='file-row';
        const label=document.createElement('div'); label.className='file-label';if(search.deepestMatches.has(e.key)) label.classList.add('search-match');label.append(kind,a);row.append(label);content.append(row);
        const file=downloadableFile(e);
        if(file) {
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
            $('advanced-panel').hidden=false;$('open-advanced').setAttribute('aria-expanded','true');$('download-debug').scrollIntoView({block:'nearest'});
          });
          const startDownload=async(saveAs=false)=>{
            if(pendingDownloads.has(e.key)) return;
            pendingDownloads.add(e.key);updateDownloadButtons();
            try {
              const response=await chrome.runtime.sendMessage({type:'download-file',courseId:catalog.courseId,key:e.key,saveAs});
              if(!response?.ok) throw new Error(response?.error || 'Download could not start.');
              downloadRecords=await chrome.storage.session.get(null);
              status('Download started. Chrome continues downloading if you close this page.');
            } catch(error) {downloadRecords=await chrome.storage.session.get(null);status(error.message);} finally {pendingDownloads.delete(e.key);updateDownloadButtons();}
          };
          button.addEventListener('click',()=>startDownload(false));
          const saveAs=document.createElement('button');saveAs.className='download-save-as';saveAs.textContent='Save as…';
          saveAs.setAttribute('aria-label',`Choose save location for ${e.title}`);
          saveAs.addEventListener('click',()=>startDownload(true));
          controls.append(button,saveAs,note,details);row.append(controls);
          if(showCacheControls && documentFormat(file.url)) {
            const cache=document.createElement('button');cache.className='cache-document';cache.dataset.cacheKey=e.key;
            cache.title=`Cache ${e.title} locally`;cache.setAttribute('aria-label',cache.title);
            const cacheNote=document.createElement('span');cacheNote.className='cache-status';cacheNote.setAttribute('role','status');
            cache.addEventListener('click',async()=>{
              if(pendingCache.has(e.key)) return;
              pendingCache.add(e.key);updateCacheButtons();
              try {
                const result=await chrome.runtime.sendMessage({type:'cache-file',courseId:catalog.courseId,key:e.key});
                if(!result?.ok) throw new Error(result?.error || 'Could not cache this file.');
                status(result.source==='cache'?'Cache hit: served locally without downloading the file again.':'File fetched and cached locally. Click Cache again to verify a hit.');
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
  if(query && !filtered.length) {const empty=document.createElement('p');empty.className='hint';empty.textContent='No matching resources or module notes in this course.';$('catalog').append(empty);}
  mounted = true;
  updateDownloadButtons();
  updateCacheButtons();
}
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local') {
    for(const [key,change] of Object.entries(changes)) if(key.startsWith('folders:')) libraryValues[key]=change.newValue;
    if(changes.semesterSync?.newValue) {libraryValues.semesterSync=changes.semesterSync.newValue;syncStatus.render(changes.semesterSync.newValue);}
    if(Object.keys(changes).some(key=>key==='availableSemesters' || key.startsWith('semester:') || key.startsWith('course:'))) refreshSavedCourses().catch(error=>status(error.message));
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
$('companion-refresh').addEventListener('click',refreshCompanion);
$('open-advanced').addEventListener('click',()=>{
  const open=$('advanced-panel').hidden;$('advanced-panel').hidden=!open;$('open-advanced').setAttribute('aria-expanded',String(open));
});
$('show-cache-controls').addEventListener('change',async()=>{showCacheControls=$('show-cache-controls').checked;await chrome.storage.local.set({uiShowManualCache:showCacheControls});if(currentCatalog) render(currentCatalog);});
async function action(fn) {
  if(busy) return; busy=true; $('scan').disabled=$('download').disabled=true;
  try {await startup; await fn();} catch(error) {status(error.message);} finally {busy=false; $('scan').disabled=$('download').disabled=false;}
}
$('scan').addEventListener('click',()=>action(async()=>{
  const {identity}=await activeCourse(); status('Loading the full course outline and module notes…');
  const entries=flattenOutline(await readCourseOutline(identity.courseId),identity.courseId);
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
    $('source').textContent=target?`Advanced scan source: ${target.title} · tab ${target.tabId}`:'No source tab for advanced per-course scans. Semester sync runs from this page.';
    const settings=await chrome.storage.local.get('uiShowManualCache');showCacheControls=settings.uiShowManualCache===true;$('show-cache-controls').checked=showCacheControls;
    downloadRecords=await chrome.storage.session.get(null);
  } catch(error) {status(error.message);}
  await refreshSavedCourses();
  void loadSemesters();
  await refreshCompanion();
})();
