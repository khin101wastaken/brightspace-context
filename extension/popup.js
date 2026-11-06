import {privateStorage as rootStorage} from './private-storage.js';
import {sourceStorage} from './sources.js';
import {wireSourceStatus} from './source-picker.js';
const provider=(await chrome.storage.local.get('activeSource')).activeSource??'nyu';
const privateStorage=sourceStorage(rootStorage,provider);
const send=message=>chrome.runtime.sendMessage({...message,provider});
wireSourceStatus({provider});
import {wireProductLinks} from './product-links.js';
wireProductLinks(document);
const $=id=>document.getElementById(id);
let connected=false,paired=false,enabled=true,forcePair=false,requestStatus=null,refreshAttempt=0;
const size=bytes=>`${(bytes/1024/1024).toFixed(1)} MB`;
// Capture the source immediately; browsing resources never retargets to another
// window merely because it later gains focus. Connection setup needs no LMS tab.
const sourceTab=chrome.tabs.query({active:true,currentWindow:true}).then(([tab])=>tab).catch(()=>null);
function feedback(message) {$('connection-feedback').textContent=message;$('connection-feedback').hidden=!message;}
function showSettings(show) {$('connect-view').hidden=show;$('settings-view').hidden=!show;$('open-settings').hidden=show;$(show?'close-settings':'open-settings').focus();}
function renderRequest() {
  const relevant=requestStatus && ['fetching','ready','needs_login','failed'].includes(requestStatus.state);
  $('request-notice').hidden=!relevant;
  $('retrieval-status').textContent=relevant?requestStatus.message:'';
  $('retry-requests').hidden=requestStatus?.state!=='needs_login';
}
function renderConnection(result,error,code) {
  connected=!!result?.connected;
  const needsPair=code==='PAIRING_REQUIRED',rejected=code==='EXTENSION_ORIGIN_REQUIRED';
  $('pair-form').hidden=!(forcePair || !paired || needsPair);
  $('disconnect-browser').hidden=!paired;$('repair-browser').hidden=!paired;
  $('pause-retrieval').hidden=!paired || !connected;
  $('pause-retrieval').textContent=enabled?'Pause':'Resume';
  $('automatic-retrieval').checked=enabled;
  const ready=connected && result.workerConnected && enabled;
  $('connection-dot').dataset.state=ready?'ready':!paired?'waiting':error?'error':'waiting';
  $('connection-label').textContent=ready?'Browser connected':needsPair?'Pairing needs refreshing':rejected?'Connection rejected':!paired?'Not paired':!connected?'Companion unavailable':!enabled?'Retrieval paused':'Connecting retrieval';
  $('connection-title').textContent=ready?'Ready for ChatGPT requests.':needsPair?'Reconnect this browser.':rejected?'Check your connection.':!paired?'Connect your browser.':!connected?'Start your companion.':!enabled?'Ready when you are.':'Almost connected.';
  $('connection-description').textContent=ready?'Course files can be fetched in the background when you ask.':needsPair?'The companion is running, but the saved pairing no longer matches. Enter its current pairing code.':rejected?'The companion rejected this browser request. The diagnostic below explains why.':!paired?'Enter the companion’s one-time code to connect this browser.':!connected?'Your pairing is saved. Start Brightspace Context on this computer, then check again.':!enabled?'Resume to let ChatGPT request course files.':'The companion is reachable. The browser’s retrieval connection is starting.';
  $('companion-status').textContent=connected?`${result.files} cached files · ${size(result.usedBytes)} of ${size(result.budgetBytes)} used. ${result.workerConnected?'Retrieval connected.':'Retrieval not connected.'}`:error || 'Pair the companion to connect this browser.';
  if(error && paired) feedback(error);
}
async function refresh() {
  const attempt=++refreshAttempt;
  $('companion-refresh').disabled=true;
  try {
    const saved=await privateStorage.get(['companionPairing','automaticRetrieval','retrievalStatus']);
    $('storage-status').textContent=(await privateStorage.get('storageProtection')).storageProtection.message;
    paired=!!saved.companionPairing;enabled=saved.automaticRetrieval!==false;requestStatus=saved.retrievalStatus;
    const result=await send({type:'companion-status'});
    if(attempt!==refreshAttempt) return;
    if(!result?.ok || !result.connected) throw Object.assign(new Error(result?.error || 'Companion is not paired.'),{code:result?.code});
    feedback('');
    renderConnection(result);renderRequest();
  } catch(error) {if(attempt===refreshAttempt) {renderConnection(null,error.message,error.code);renderRequest();}}
  finally {if(attempt===refreshAttempt) $('companion-refresh').disabled=false;}
}
async function setRetrieval(value) {
  const result=await send({type:'retrieval-settings',enabled:value});
  if(!result?.ok) throw new Error(result?.error || 'Unable to change retrieval.');
  enabled=value;await refresh();
}
$('open-settings').addEventListener('click',()=>showSettings(true));
$('close-settings').addEventListener('click',()=>showSettings(false));
$('open-chat-help').addEventListener('click',()=>$('chat-help').showModal());
$('close-chat-help').addEventListener('click',()=>$('chat-help').close());
$('companion-refresh').addEventListener('click',()=>{feedback('');void refresh();});
$('repair-browser').addEventListener('click',()=>{forcePair=true;showSettings(false);$('pair-form').hidden=false;$('pair-code').focus();});
$('disconnect-browser').addEventListener('click',async()=>{
  $('disconnect-browser').disabled=true;
  try {
    const result=await send({type:'disconnect-companion'});
    if(!result?.ok) throw new Error(result?.error || 'Unable to disconnect this browser.');
    forcePair=false;feedback('');showSettings(false);await refresh();
  } catch(error) {$('companion-status').textContent=error.message;}
  finally {$('disconnect-browser').disabled=false;}
});
$('pair-form').addEventListener('submit',async event=>{
  event.preventDefault();$('pair-button').disabled=true;feedback('');
  try {
    const result=await send({type:'pair-companion',code:$('pair-code').value});
    if(!result?.ok) throw new Error(result?.error || 'Unable to pair this browser.');
    $('pair-code').value='';forcePair=false;await refresh();
  } catch(error) {feedback(error.message);}
  finally {$('pair-button').disabled=false;}
});
$('automatic-retrieval').addEventListener('change',async()=>{try {await setRetrieval($('automatic-retrieval').checked);} catch(error) {$('automatic-retrieval').checked=enabled;$('companion-status').textContent=error.message;}});
$('temporary-exports').addEventListener('change',async()=>{
  try {const result=await send({type:'export-settings',enabled:$('temporary-exports').checked});if(!result?.ok)throw new Error(result?.error || 'Unable to change exports.');}
  catch(error){$('temporary-exports').checked=!$('temporary-exports').checked;$('companion-status').textContent=error.message;}
});
$('pause-retrieval').addEventListener('click',async()=>{try {await setRetrieval(!enabled);} catch(error) {feedback(error.message);}});
$('retry-requests').addEventListener('click',async()=>{
  $('retry-requests').disabled=true;
  try {const result=await send({type:'retry-requests'});if(!result?.ok) throw new Error(result?.error || 'Unable to retry.');await refresh();}
  catch(error) {feedback(error.message);}
  finally {$('retry-requests').disabled=false;}
});
$('browse-resources').addEventListener('click',async()=>{
  const source=await sourceTab;
  const isBrightspace=source?.id && /^https:\/\/brightspace\.nyu\.edu\//.test(source.url || '');
  const url=chrome.runtime.getURL('resources.html')+(isBrightspace?`?sourceTabId=${source.id}`:'');
  await chrome.tabs.create({url});
});
privateStorage.onChanged.addListener((changes,area)=>{
  if(area!=='local') return;
  if(changes.retrievalStatus) {requestStatus=changes.retrievalStatus.newValue;renderRequest();}
  if(changes.companionPairing || changes.automaticRetrieval || changes.retrievalStatus?.newValue?.state==='connected') void refresh();
});
const saved=await privateStorage.get(null).catch(error=>{feedback(error.message);return {};});
const semesters=Object.entries(saved).filter(([key])=>key.startsWith('semester:')).map(([,value])=>value).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
if(semesters.length) $('resource-summary').textContent=`${semesters[0].title} · ${semesters[0].courses.length} courses`;
await refresh();
