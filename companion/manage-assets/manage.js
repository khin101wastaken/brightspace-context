const credentialPattern=/^[a-f0-9]{64}$/;
const launchToken=location.hash.slice(1);
let token=location.hash ? launchToken : history.state?.managementToken;
if(location.hash) {
  // Keep authorization on this history entry so a reload can reuse it.
  const state=credentialPattern.test(launchToken)?{managementToken:launchToken}:null;
  history.replaceState(state,'',location.pathname);
}
const element=id=>document.getElementById(id);
const controls=element('controls'),notice=element('notice'),library=element('library');
const size=bytes=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;
let busy=false,displayedLibrary=library.value;

async function request(endpoint,method='GET') {
  const response=await fetch(`api/${endpoint}?library=${library.value}`,{
    method,headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(10000),
  });
  if(response.status===401) {
    token=null;
    history.replaceState(null,'');
    controls.hidden=true;
    element('pairing').textContent='';
    element('companion-version').hidden=true;
  }
  const value=await response.json();
  if(!response.ok) throw new Error(value.error || 'The companion could not complete the request.');
  return value;
}

function renderList(id,items,empty,row) {
  const list=element(id);
  list.replaceChildren(...items.map(row));
  if(!items.length) {
    const li=document.createElement('li');li.className='empty';li.textContent=empty;list.append(li);
  }
}

function row(title,detail,action,label) {
  const item=document.createElement('li'),text=document.createElement('div'),labelText=document.createElement('span'),meta=document.createElement('small');
  text.className='row-copy';
  labelText.className='row-title';
  labelText.textContent=title;
  meta.textContent=detail;
  text.append(labelText,meta);
  item.append(text);
  if(action) {
    const button=document.createElement('button');
    button.textContent=label;
    button.setAttribute('aria-label',`${label} ${title}`);
    button.onclick=action;
    item.append(button);
  }
  return item;
}

async function refresh() {
  const {version,pairingCode,connected,stats,pending,documents}=await request('status');
  const versionLabel=element('companion-version');
  versionLabel.textContent=`Version ${version}`;
  versionLabel.hidden=false;
  element('pairing').textContent=pairingCode;
  const connection=element('connection-status');
  connection.textContent=connected?'Chrome retrieval connected':'Waiting for Chrome retrieval';
  connection.dataset.connected=String(connected);
  element('queue-count').textContent=String(pending.length);
  element('usage').textContent=`${stats.files} cached · ${size(stats.usedBytes)} of ${size(stats.budgetBytes)} used`;
  const capacity=element('capacity');
  capacity.max=stats.budgetBytes;
  capacity.value=stats.usedBytes;
  element('clear').disabled=!documents.length;
  renderList('queue',pending,'No pending file requests.',job=>row(
    job.title,
    {queued:'Queued',needs_login:'Waiting for sign-in',fetching:'Fetching in Chrome'}[job.state],
    job.state==='fetching'?null:()=>perform(async()=>{
      await request(`requests/${job.requestId}/cancel`,'POST');
      return 'Retrieval cancelled.';
    }),
    'Cancel',
  ));
  renderList('files',documents,'No cached files.',file=>row(
    file.title,
    `${file.courseTitle} · ${file.extension.toUpperCase()} · ${size(file.bytes)} · ${new Date(file.fetchedAt).toLocaleDateString()}`,
    ()=>{if(confirm(`Remove “${file.title}” from this cache?`)) void remove(`cache/${file.id}`);},
    'Remove',
  ));
  controls.hidden=false;
  displayedLibrary=library.value;
}

async function perform(action,{reload=true}={}) {
  if(busy) return;
  busy=true;
  library.disabled=true;
  try {
    notice.textContent=await action() || '';
    if(reload) await refresh();
  } catch(error) {
    notice.textContent=error.message;
    library.value=displayedLibrary;
    if(reload && token) await refresh().catch(()=>{});
  } finally {
    busy=false;
    library.disabled=false;
  }
}

const remove=endpoint=>perform(async()=>{
  const {removed}=await request(endpoint,'POST');
  return `Removed ${removed} cached ${removed===1?'file':'files'}.`;
});
element('refresh').onclick=()=>perform(refresh,{reload:false});
library.onchange=()=>perform(refresh,{reload:false});
element('copy-code').onclick=async()=>{
  try {
    await navigator.clipboard.writeText(element('pairing').textContent);
    notice.textContent='Pairing code copied.';
  } catch {
    notice.textContent='Select the pairing code to copy it manually.';
  }
};
element('clear').onclick=()=>{
  if(confirm(`Clear all cached files in ${library.selectedOptions[0].textContent}?`)) void remove('cache');
};
element('codex').onclick=()=>perform(async()=>{
  const {state}=await request('codex','POST');
  if(state==='existing') return 'Codex already has a Brightspace entry. Check it in Settings → MCP servers. Use the manual steps below if you need to replace it.';
  return 'Brightspace is registered. Quit and reopen Codex to load the Brightspace connection.';
},{reload:false});

if(credentialPattern.test(token)) void perform(refresh,{reload:false});
else notice.textContent='Open the controls from the Brightspace Context tray icon.';
