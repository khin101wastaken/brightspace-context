import {sourceConfig} from './sources.js';
export function wireSourceStatus({provider}) {
  const {base}=sourceConfig(provider);
  if(provider!=='nyu') {
    const banner=document.getElementById('demo-notice');
    if(banner){banner.hidden=false;banner.textContent=provider==='hosted-demo'?'Hosted demo active. Sync Demo 2026 Fall to browse sample courses.':'Demo library active. Manage it in Resources → Advanced.';}
    const lmsLink=document.querySelector('a[href="https://brightspace.nyu.edu/d2l/home"]');
    if(lmsLink){lmsLink.href=base+'/';lmsLink.textContent='Open demo LMS';}
    for(const id of ['scan','download']){const button=document.getElementById(id);if(button)button.hidden=true;}
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.activeSource && changes.activeSource.newValue!==provider)location.reload();});
}
export function wireSourcePicker({provider}) {
  wireSourceStatus({provider});
  const container=document.getElementById('source-controls');
  const label=document.createElement('span');label.textContent='Library';label.id='source-label';
  const group=document.createElement('div');group.className='source-options';group.setAttribute('role','group');group.setAttribute('aria-labelledby','source-label');
  for(const [value,title] of [['nyu','NYU Brightspace'],['hosted-demo','Hosted demo'],['demo','Local demo']]) {
    const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent=title;button.setAttribute('aria-pressed',String(value===provider));
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try {const result=await chrome.runtime.sendMessage({type:'source-settings',provider:value});if(!result?.ok)throw new Error(result?.error||'Could not switch library.');location.reload();}
      catch(error){hint.textContent=error.message;button.disabled=false;}
    });group.append(button);
  }
  const hint=document.createElement('p');hint.className='hint';
  hint.textContent='Use Hosted demo to sync, search, and download sample files. Use Local demo with the companion to test caching and MCP retrieval.';
  container.append(label,group,hint);
}
