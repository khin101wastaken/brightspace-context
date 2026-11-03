import {downloadPlan,validateFileResponse,downloadState} from './file-downloads.js';
import {pairCompanion,companionStatus,cachePdf,syncCatalog,retryLoginRequests} from './companion-client.js';
import {scanSemester} from './semester.js';
import {listBrightspaceSemesters,listSemesterCourses,readCourseOutline} from './brightspace-client.js';
import {createRetrievalWorker} from './retrieval-worker.js';

let retrievalWorker=null;
async function retrievalSettings() {
  const settings=await chrome.storage.local.get(['companionPairing','automaticRetrieval']);
  return {token:settings.companionPairing?.token,enabled:settings.automaticRetrieval!==false};
}
async function refreshRetrieval() {
  if(!retrievalWorker) return;
  retrievalWorker.stop();
  const settings=await retrievalSettings();
  if(settings.enabled && settings.token) await retrievalWorker.connect();
  else await chrome.storage.local.set({retrievalStatus:{state:'paused',message:settings.enabled?'Pair the companion to enable retrieval.':'Automatic retrieval paused.'}});
}
// The socket delivers requests immediately; an alarm reconnects a suspended
// worker or a companion that was restarted while Chrome remained open.
if(chrome.alarms?.onAlarm && chrome.runtime.onStartup) {
  retrievalWorker=createRetrievalWorker({getSettings:retrievalSettings,report:value=>chrome.storage.local.set({retrievalStatus:value})});
  chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='retrieval-reconnect') retrievalWorker.connect().catch(()=>{});});
  const start=async()=>{await chrome.alarms.create('retrieval-reconnect',{periodInMinutes:1});await retrievalWorker.connect();};
  chrome.runtime.onStartup.addListener(()=>{start().catch(()=>{});});
  chrome.runtime.onInstalled.addListener(()=>{start().catch(()=>{});});
  start().catch(()=>{});
}

async function availableSemesters() {
  const semesters=await listBrightspaceSemesters();
  await chrome.storage.local.set({availableSemesters:semesters});return {semesters};
}
let semesterTask=null,semesterTaskId=null;
async function syncSemester(message) {
  if(typeof message.semesterId!=='string' || !/^\d+$/.test(message.semesterId)) throw new Error('Choose a semester in Resources first.');
  if(semesterTask) {if(semesterTaskId!==message.semesterId) throw new Error('Another semester is syncing. Wait for it to finish.');return semesterTask;}
  semesterTaskId=message.semesterId;
  const task=(async()=>{
    await chrome.storage.local.set({semesterSync:{state:'running',semesterId:message.semesterId,message:'Loading the selected semester from Brightspace…',startedAt:Date.now()}});
    try {
      const {semesters}=await availableSemesters();
      const selected=semesters.find(s=>s.semesterId===message.semesterId);
      if(!selected) throw new Error('This semester is no longer available. Refresh the semester list.');
      const courses=await listSemesterCourses(selected.semesterId);
      if(!courses.length) throw new Error('Brightspace returned no courses for this semester. No saved outlines were removed.');
      const semester={...selected,courses};
      const snapshot=await scanSemester(semester,{
        readOutline:readCourseOutline,
        saveCourse:catalog=>chrome.storage.local.set({[`course:${catalog.courseId}`]:catalog}),
        onProgress:progress=>chrome.storage.local.set({semesterSync:{state:'running',semesterId:semester.semesterId,message:`${semester.title}: ${progress.completed}/${progress.total} courses · ${progress.title}`,startedAt:Date.now()}}),
      });
      const summary={...snapshot,courses:snapshot.courses.map(({entries,...course})=>({...course,entryCount:entries?.length??null}))};
      await chrome.storage.local.set({[`semester:${semester.semesterId}`]:summary});
      const pairing=(await chrome.storage.local.get('companionPairing')).companionPairing;
      const complete=snapshot.courses.filter(c=>c.status==='complete').length;
      let transfer;
      try {
        if(!pairing?.token) throw new Error('Pair the local companion first.');
        transfer=await syncCatalog(snapshot,pairing.token);
      } catch(error) {
        const message=`Saved ${complete}/${snapshot.courses.length} course outlines locally. Companion sync failed: ${error.message} Start or pair the companion, then use Send saved catalog.`;
        await chrome.storage.local.set({semesterSync:{state:'saved',semesterId:semester.semesterId,message}});
        return {message};
      }
      const completionMessage=`${snapshot.title}: ${complete}/${snapshot.courses.length} courses synced to companion${complete<snapshot.courses.length?' · Some courses failed; expand their status below.':''}. No files downloaded.`;
      await chrome.storage.local.set({semesterSync:{state:'complete',semesterId:semester.semesterId,message:completionMessage}});
      return {message:completionMessage,...transfer};
    } catch(error) {await chrome.storage.local.set({semesterSync:{state:'failed',message:error.message}});throw error;}
  })();
  semesterTask=task;
  try {return await task;} finally {semesterTask=null;semesterTaskId=null;}
}
async function sendSavedCatalog() {
  if(semesterTask) throw new Error('Wait for the semester scan to finish.');
  const values=await chrome.storage.local.get(null),token=values.companionPairing?.token;
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
  const pairing=(await chrome.storage.local.get('companionPairing')).companionPairing;
  if(message.type==='disconnect-companion') {
    retrievalWorker?.stop();
    await chrome.storage.local.remove('companionPairing');
    await chrome.storage.local.set({retrievalStatus:{state:'unpaired',message:'Pair this browser to enable retrieval.'}});
    return {connected:false};
  }
  if(message.type==='pair-companion') {
    const result=await pairCompanion(message.code);
    await chrome.storage.local.set({companionPairing:{token:result.token}});
    await refreshRetrieval();
    const {token,...stats}=result;return stats;
  }
  if(message.type==='retrieval-settings') {
    if(typeof message.enabled!=='boolean') throw new Error('Invalid retrieval setting.');
    await chrome.storage.local.set({automaticRetrieval:message.enabled});await refreshRetrieval();return {enabled:message.enabled};
  }
  if(message.type==='retry-requests') {
    if(!pairing?.token) throw new Error('Pair the companion first.');
    const result=await retryLoginRequests(pairing.token);await refreshRetrieval();return result;
  }
  if(message.type==='companion-status') {
    if(!pairing?.token) return {connected:false,error:'Start the companion, then enter its pairing code.'};
    const result=await companionStatus(pairing.token);
    if(retrievalWorker && !result.workerConnected) retrievalWorker.connect().catch(()=>{});
    return {connected:true,...result};
  }
  const {courseId,key}=message;
  if(!/^\d+$/.test(String(courseId)) || typeof key!=='string') throw new Error('Invalid PDF selection.');
  const requestKey=`cache:${courseId}:${key}`;
  if(cacheRequests.has(requestKey)) return cacheRequests.get(requestKey);
  const task=(async()=>{
    const catalog=(await chrome.storage.local.get(`course:${courseId}`))[`course:${courseId}`];
    const update=record=>chrome.storage.session.set({[requestKey]:record});
    await update({state:'pending',message:'Checking local cache…'});
    let phaseWrites=Promise.resolve();
    try {
      const result=await cachePdf(catalog,key,pairing?.token,fetch,(message)=>{phaseWrites=phaseWrites.then(()=>update({state:'pending',message}));});
      await phaseWrites;
      await update({state:'complete',source:result.source,bytes:result.entry.bytes,message:result.source==='cache'?'Cache hit — no download':'Fetched and cached',id:result.id});
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
  await chrome.storage.session.set({[storageKey]:{...record,...downloadState(item),nativeState:item.state,
    error:item.error || null,mime:item.mime || '',bytesReceived:item.bytesReceived ?? null,
    totalBytes:item.totalBytes ?? null,finalOrigin:(()=>{try{return new URL(item.finalUrl || item.url).origin;}catch{return null;}})()}});
}

async function downloadFile(message) {
  const {courseId,key}=message;
  if(!/^\d+$/.test(String(courseId)) || typeof key!=='string') throw new Error('Invalid download selection.');
  const catalog=(await chrome.storage.local.get(`course:${courseId}`))[`course:${courseId}`];
  const plan=downloadPlan(catalog,key);
  const saveAs=message.saveAs===true;
  // Explicit alternative: let the user choose a location without nested-folder
  // creation. Never automatically retry a cancellation.
  if(saveAs) plan.filename=plan.filename.split('/').at(-1);
  const attemptKey=`attempt:${courseId}:${key}`;
  const attempt={courseId,key,startedAt:Date.now(),state:'starting',phase:'session-check',filename:plan.filename,saveMode:saveAs?'choose-location':'course-folders'};
  await chrome.storage.session.set({[attemptKey]:attempt});
  try {
  // Metadata check only: avoid downloading a login page or fetching file bytes twice.
  let response;
  try {response=await fetch(plan.url,{method:'HEAD',credentials:'include',redirect:'error',signal:AbortSignal.timeout(15000)});}
  catch(error) {throw new Error(`Session check could not reach the file (${error.message}). A redirect or unsupported HEAD request may be responsible; no file download was started.`);}
  validateFileResponse(response);
  attempt.phase='download-start';
  attempt.httpStatus=response.status;
  attempt.mime=response.headers.get('content-type') || '';
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
  if(sender.id!==chrome.runtime.id || !['popup.html','resources.html'].some(name=>page===chrome.runtime.getURL(name)) || !['download-file','pair-companion','disconnect-companion','companion-status','cache-file','sync-semester','list-semesters','send-catalog','retrieval-settings','retry-requests'].includes(message?.type)) return;
  (message.type==='list-semesters'?availableSemesters():message.type==='sync-semester'?syncSemester(message):message.type==='send-catalog'?sendSavedCatalog():message.type==='download-file'?downloadFile(message):companionMessage(message)).then(result=>respond({ok:true,...result})).catch(error=>respond({ok:false,error:error.message,code:error.code || (error.status===401?'PAIRING_REQUIRED':null)}));
  return true;
});
chrome.downloads.onChanged.addListener(delta=>{reconcile(delta.id).catch(()=>{});});
