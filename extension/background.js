import {createPrivateStorage} from './private-storage.js';
import {downloadPlan,preflightFile,downloadState} from './file-downloads.js';
import {pairCompanion,companionStatus,cacheDocument,syncCatalog,retryLoginRequests,setCompanionSettings} from './companion-client.js';
import {scanSemester} from './semester.js';
import {listBrightspaceSemesters,listSemesterCourses,readCourseOutline} from './brightspace-client.js';
import {createRetrievalWorker} from './retrieval-worker.js';

const privateStorage=createPrivateStorage({local:chrome.storage.local,session:chrome.storage.session,changed:chrome.storage.onChanged});
// Injected download fallbacks need no access to persistent extension data.
void chrome.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'});
let retrievalWorker=null;
async function retrievalSettings() {
  const settings=await privateStorage.get(['companionPairing','automaticRetrieval']);
  return {token:settings.companionPairing?.token,enabled:settings.automaticRetrieval!==false};
}
async function refreshRetrieval() {
  if(!retrievalWorker) return;
  retrievalWorker.stop();
  const settings=await retrievalSettings();
  if(settings.enabled && settings.token) await retrievalWorker.connect();
  else await privateStorage.set({retrievalStatus:{state:'paused',message:settings.enabled?'Pair the companion to enable retrieval.':'Automatic retrieval paused.'}});
}
// The socket delivers requests immediately; an alarm reconnects a suspended
// worker or a companion that was restarted while Chrome remained open.
if(chrome.alarms?.onAlarm && chrome.runtime.onStartup) {
  retrievalWorker=createRetrievalWorker({getSettings:retrievalSettings,report:value=>privateStorage.set({retrievalStatus:value}),syncCatalogRequest:async(sync,{onProgress,assertActive})=>{
    if(!sync.semesterId) {await onProgress({phase:'discovering'});return availableSemesters(async(url,options)=>{await assertActive();return fetch(url,options);});}
    return syncSemester(sync,{remote:true,onProgress,assertActive});
  }});
  chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='retrieval-reconnect') retrievalWorker.connect().catch(()=>{});});
  const start=async()=>{await chrome.alarms.create('retrieval-reconnect',{periodInMinutes:1});await retrievalWorker.connect();};
  chrome.runtime.onStartup.addListener(()=>{start().catch(()=>{});});
  chrome.runtime.onInstalled.addListener(()=>{start().catch(()=>{});});
  start().catch(()=>{});
}

async function availableSemesters(fetcher=fetch) {
  const semesters=await listBrightspaceSemesters(fetcher);
  await privateStorage.set({availableSemesters:semesters});return {semesters};
}
let semesterTask=null,semesterTaskId=null,semesterTaskRemote=false;
async function syncSemester(message,{remote=false,onProgress=async()=>{},assertActive=async()=>{}}={}) {
  if(typeof message.semesterId!=='string' || !/^\d+$/.test(message.semesterId)) throw new Error('Choose a semester in Resources first.');
  if(semesterTask) {if(semesterTaskId!==message.semesterId || semesterTaskRemote!==remote) throw new Error('Another semester is syncing. Wait for it to finish.');return semesterTask;}
  semesterTaskId=message.semesterId;semesterTaskRemote=remote;
  const task=(async()=>{
    const fetcher=async(url,options)=>{await assertActive();return fetch(url,options);};
    let progress={state:'running',semesterId:message.semesterId,phase:'loading',startedAt:Date.now()};
    const writeSync=async value=>{progress={...progress,...value};await privateStorage.set({semesterSync:progress});};
    await writeSync({message:'Loading the selected semester from Brightspace…'});
    try {
      await onProgress({phase:'discovering'});
      const {semesters}=await availableSemesters(fetcher);
      const selected=semesters.find(s=>s.semesterId===message.semesterId);
      if(!selected) throw new Error('This semester is no longer available. Refresh the semester list.');
      await onProgress({phase:'listing_courses'});
      const courses=await listSemesterCourses(selected.semesterId,fetcher);
      if(!courses.length) throw new Error('Brightspace returned no courses for this semester. No saved outlines were removed.');
      const semester={...selected,courses};
      const snapshot=await scanSemester(semester,{
        readOutline:courseId=>readCourseOutline(courseId,fetcher),
        saveCourse:catalog=>privateStorage.set({[`course:${catalog.courseId}`]:catalog}),
        onProgress:async update=>{
          const synced=update.courses.filter(course=>course.state==='complete').length;
          await writeSync({...update,phase:'scanning',message:update.title?`${semester.title}: syncing ${update.title}`:`${semester.title}: ${synced}/${update.total} course outlines synced`});
          await onProgress({phase:'scanning',completed:update.completed,total:update.total});
        },
      });
      const summary={...snapshot,courses:snapshot.courses.map(({entries,...course})=>({...course,entryCount:entries?.length??null}))};
      await privateStorage.set({[`semester:${semester.semesterId}`]:summary});
      await writeSync({phase:'saving',message:`${semester.title}: saving catalog to companion…`});
      await onProgress({phase:'saving',completed:snapshot.courses.length,total:snapshot.courses.length});
      if(remote) {
        const failed=snapshot.courses.filter(course=>course.status==='failed');
        const code=failed.some(course=>course.code==='NEEDS_LOGIN')?'NEEDS_LOGIN':failed.some(course=>course.code==='RATE_LIMITED')?'RATE_LIMITED':failed.length?'SYNC_FAILED':null;
        await writeSync({state:code?'failed':'complete',phase:'finished',message:`${snapshot.title}: ${snapshot.courses.length-failed.length}/${snapshot.courses.length} course outlines scanned. No files downloaded.`,finishedAt:Date.now()});
        return {snapshot,...(code?{code}:{})};
      }
      const pairing=(await privateStorage.get('companionPairing')).companionPairing;
      const complete=snapshot.courses.filter(c=>c.status==='complete').length;
      let transfer;
      try {
        if(!pairing?.token) throw new Error('Pair the local companion first.');
        transfer=await syncCatalog(snapshot,pairing.token);
      } catch(error) {
        const message=`Saved ${complete}/${snapshot.courses.length} course outlines locally. Companion sync failed: ${error.message} Start or pair the companion, then use Send saved catalog.`;
        await writeSync({state:'saved',phase:'finished',message,finishedAt:Date.now()});
        return {message};
      }
      const completionMessage=`${snapshot.title}: ${complete}/${snapshot.courses.length} courses synced to companion${complete<snapshot.courses.length?' · Some courses failed; expand their status below.':''}. No files downloaded.`;
      await writeSync({state:complete===snapshot.courses.length?'complete':'partial',phase:'finished',message:completionMessage,finishedAt:Date.now()});
      return {message:completionMessage,...transfer};
    } catch(error) {await writeSync({state:'failed',phase:'stopped',message:error.message,finishedAt:Date.now()});throw error;}
  })();
  semesterTask=task;
  try {return await task;} finally {semesterTask=null;semesterTaskId=null;}
}
async function sendSavedCatalog() {
  if(semesterTask) throw new Error('Wait for the semester scan to finish.');
  const values=await privateStorage.get(null),token=values.companionPairing?.token;
  if(!token) throw new Error('Pair the local companion first.');
  let count=0;
  for(const [key,semester] of Object.entries(values)) if(key.startsWith('semester:')) {
    const courses=semester.courses.map(course=>course.status==='complete'?{...course,...values[`course:${course.courseId}`]}:course);
    await syncCatalog({...semester,courses},token);count++;
  }
  if(!count) throw new Error('Scan a semester first.');
  return {message:`Sent ${count} saved semester catalog${count===1?'':'s'} to the companion.`};
}

const cacheRequests=new Map();
async function companionMessage(message) {
  if(message.type==='disconnect-companion') {
    retrievalWorker?.stop();
    await privateStorage.remove('companionPairing');
    await privateStorage.set({retrievalStatus:{state:'unpaired',message:'Pair this browser to enable retrieval.'}});
    return {connected:false};
  }
  if(message.type==='pair-companion') {
    const result=await pairCompanion(message.code);
    await privateStorage.pair(result);
    await refreshRetrieval();
    const {token,credential,storageKey,...stats}=result;return stats;
  }
  const pairing=(await privateStorage.get('companionPairing')).companionPairing;
  if(message.type==='retrieval-settings') {
    if(typeof message.enabled!=='boolean') throw new Error('Invalid retrieval setting.');
    await privateStorage.set({automaticRetrieval:message.enabled});await refreshRetrieval();return {enabled:message.enabled};
  }
  if(message.type==='retry-requests') {
    if(!pairing?.token) throw new Error('Pair the companion first.');
    const result=await retryLoginRequests(pairing.token);await refreshRetrieval();return result;
  }
  if(message.type==='export-settings') {
    if(!pairing?.token)throw new Error('Start and pair the updated companion first.');
    if(typeof message.enabled!=='boolean')throw new Error('Invalid export setting.');
    return setCompanionSettings({allowTemporaryExports:message.enabled},pairing.token);
  }
  if(message.type==='companion-status') {
    await privateStorage.ensureSession();
    if(!pairing?.token) return {connected:false,error:'Start the companion, then enter its pairing code.'};
    const result=await companionStatus(pairing.token);
    if(retrievalWorker && !result.workerConnected) retrievalWorker.connect().catch(()=>{});
    return {connected:true,...result};
  }
  const {courseId,key}=message;
  if(!/^\d+$/.test(String(courseId)) || typeof key!=='string') throw new Error('Invalid document selection.');
  const requestKey=`cache:${courseId}:${key}`;
  if(cacheRequests.has(requestKey)) return cacheRequests.get(requestKey);
  const task=(async()=>{
    const catalog=(await privateStorage.get(`course:${courseId}`))[`course:${courseId}`];
    const update=record=>chrome.storage.session.set({[requestKey]:record});
    await update({state:'pending',message:'Checking local cache…'});
    let phaseWrites=Promise.resolve();
    try {
      const result=await cacheDocument(catalog,key,pairing?.token,fetch,(message)=>{phaseWrites=phaseWrites.then(()=>update({state:'pending',message}));});
      await phaseWrites;
      await update({state:'complete',source:result.source,bytes:result.entry.bytes,message:result.source==='cache'?'Cache hit. No download needed.':'Fetched and cached',id:result.id});
      return result;
    } catch(error) {await phaseWrites.catch(()=>{});await update({state:'failed',message:error.message});throw error;}
  })();
  cacheRequests.set(requestKey,task);
  try {return await task;} finally {cacheRequests.delete(requestKey);}
}

async function reconcile(id) {
  const storageKey=`download:${id}`, record=(await chrome.storage.session.get(storageKey))[storageKey];
  if(!record) return;
  const [item]=await chrome.downloads.search({id});
  if(!item) return;
  await chrome.storage.session.set({[storageKey]:{...record,...downloadState(item,record),nativeState:item.state,
    error:item.error || null,mime:item.mime || '',bytesReceived:item.bytesReceived ?? null,
    totalBytes:item.totalBytes ?? null,finalOrigin:(()=>{try{return new URL(item.finalUrl || item.url).origin;}catch{return null;}})()}});
}

async function downloadFile(message) {
  const {courseId,key}=message;
  if(!/^\d+$/.test(String(courseId)) || typeof key!=='string') throw new Error('Invalid download selection.');
  const catalog=(await privateStorage.get(`course:${courseId}`))[`course:${courseId}`];
  const plan=downloadPlan(catalog,key);
  const saveAs=message.saveAs===true;
  // Explicit alternative: let the user choose a location without nested-folder
  // creation. Never automatically retry a cancellation.
  if(saveAs) plan.filename=plan.filename.split('/').at(-1);
  const attemptKey=`attempt:${courseId}:${key}`;
  const attempt={courseId,key,startedAt:Date.now(),state:'starting',phase:'session-check',filename:plan.filename,sourceUrl:plan.url,saveMode:saveAs?'choose-location':'course-folders'};
  await chrome.storage.session.set({[attemptKey]:attempt});
  try {
  const metadata=await preflightFile(plan);
  attempt.phase='download-start';
  Object.assign(attempt,metadata);
  await chrome.storage.session.set({[attemptKey]:attempt});
  const id=await chrome.downloads.download({...plan,conflictAction:'uniquify',saveAs});
  const records=await chrome.storage.session.get(null);
  const old=Object.keys(records).filter(k=>k.startsWith('download:')).sort((a,b)=>(records[b].startedAt || 0)-(records[a].startedAt || 0));
  await chrome.storage.session.remove(old.slice(199).filter(k=>records[k].state!=='in_progress'));
  await chrome.storage.session.set({[`download:${id}`]:{...attempt,id,state:'in_progress',phase:'file-transfer',message:'Downloading…'}});
  await chrome.storage.session.remove(attemptKey);
  await reconcile(id);
  return {id};
  } catch(error) {
    const canceled=attempt.phase==='download-start' && /USER_CANCELED|cancel(?:ed|led) by the user/i.test(error.message);
    const message=canceled?'Chrome canceled the download before starting (USER_CANCELED). If no dialog appeared, try Save as… to choose a location.':`${attempt.phase==='download-start'?'Chrome could not start the download':'Download preflight failed'}: ${error.message}`;
    await chrome.storage.session.set({[attemptKey]:{...attempt,state:canceled?'canceled':'failed',message,error:canceled?'USER_CANCELED':error.message}});
    throw new Error(message);
  }
}

chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  const page=sender.url?.split(/[?#]/)[0];
  if(sender.id!==chrome.runtime.id || !['popup.html','resources.html'].some(name=>page===chrome.runtime.getURL(name)) || !['export-settings','download-file','pair-companion','disconnect-companion','companion-status','cache-file','sync-semester','list-semesters','send-catalog','retrieval-settings','retry-requests'].includes(message?.type)) return;
  (message.type==='list-semesters'?availableSemesters():message.type==='sync-semester'?syncSemester(message):message.type==='send-catalog'?sendSavedCatalog():message.type==='download-file'?downloadFile(message):companionMessage(message)).then(result=>respond({ok:true,...result})).catch(error=>respond({ok:false,error:error.message,code:error.code || (error.status===401?'PAIRING_REQUIRED':null)}));
  return true;
});
chrome.downloads.onChanged.addListener(delta=>{reconcile(delta.id).catch(()=>{});});
