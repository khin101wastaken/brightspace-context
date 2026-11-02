import {downloadPlan,validateFileResponse,downloadState} from './file-downloads.js';

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
  if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('popup.html') || message?.type!=='download-file') return;
  downloadFile(message).then(result=>respond({ok:true,...result})).catch(error=>respond({ok:false,error:error.message}));
  return true;
});
chrome.downloads.onChanged.addListener(delta=>{reconcile(delta.id).catch(()=>{});});
