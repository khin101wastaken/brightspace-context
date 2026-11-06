import {sourceConfig} from './sources.js';
export function wireSourcePicker({provider}) {
  sourceConfig(provider);
  const container=document.getElementById('source-controls');
  const label=document.createElement('span');label.textContent='Library';label.id='source-label';
  const group=document.createElement('div');group.className='source-options';group.setAttribute('role','group');group.setAttribute('aria-labelledby','source-label');
  for(const [value,title] of [['nyu','NYU Brightspace'],['demo','Local demo']]) {
    const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent=title;button.setAttribute('aria-pressed',String(value===provider));
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try {const result=await chrome.runtime.sendMessage({type:'source-settings',provider:value});if(!result?.ok)throw new Error(result?.error||'Could not switch library.');location.reload();}
      catch(error){hint.textContent=error.message;button.disabled=false;}
    });group.append(button);
  }
  const hint=document.createElement('p');hint.className='hint';
  if(provider==='demo') {
    hint.append('Demo library: fictional courses only. ');
    const link=document.createElement('a');link.href=sourceConfig('demo').base+'/';link.target='_blank';link.rel='noopener';link.textContent='Open demo LMS';hint.append(link);
    const banner=document.getElementById('demo-notice');banner.hidden=false;banner.textContent='DEMO · Fictional course material. NYU library is separate.';
    const lmsLink=document.querySelector('a[href="https://brightspace.nyu.edu/d2l/home"]');if(lmsLink){lmsLink.href=link.href;lmsLink.textContent='Open demo LMS';}
    for(const id of ['scan','download']) {const button=document.getElementById(id);if(button)button.hidden=true;}
  } else hint.textContent='Try Local demo without an NYU account. Requires the companion.';
  container.append(label,group,hint);
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.activeSource && changes.activeSource.newValue!==provider)location.reload();});
}
