// Apply the extension-only preference before CSS paints. Chrome storage keeps
// Connect and Resources in sync; the local mirror avoids a startup flash.
(() => {
  const key='uiMotion',root=document.documentElement,system=matchMedia('(prefers-reduced-motion: reduce)');
  const normalize=value=>['on','off'].includes(value)?value:'system';
  let preference='system',revision=0,controls=[],status;
  try {preference=normalize(localStorage.getItem(key));} catch {}
  function render() {
    const enabled=preference==='on' || (preference==='system' && !system.matches);
    root.dataset.motion=enabled?'on':'off';root.dataset.motionPreference=preference;
    controls.forEach(control=>control.checked=control.value===preference);
    if(status) status.textContent=preference==='system'?`Following your system: animations ${enabled?'on':'off'}.`:
      enabled?'Animations on here. Your system setting is unchanged.':'Animations off in this extension.';
  }
  function apply(value) {
    preference=normalize(value);
    try {localStorage.setItem(key,preference);} catch {}
    render();
  }
  render();system.addEventListener('change',render);
  async function start() {
    controls=Array.from(document.querySelectorAll('input[name="ui-motion"]'));status=document.getElementById('motion-status');
    render();
    controls.forEach(control=>control.addEventListener('change',async()=>{
      if(!control.checked || control.disabled) return;
      const previous=preference,current=++revision;
      controls.forEach(input=>input.disabled=true);apply(control.value);
      try {await chrome.storage.local.set({[key]:preference});}
      catch {
        if(revision===current) apply(previous);
        if(status) status.textContent='Animation preference could not be saved. Try again.';
      } finally {controls.forEach(input=>input.disabled=false);}
    }));
    try {
      chrome.storage.onChanged.addListener((changes,area)=>{
        if(area==='local' && Object.hasOwn(changes,key)) {revision++;apply(changes[key].newValue);}
      });
      const current=revision,saved=await chrome.storage.local.get(key);
      if(revision===current) apply(saved[key]);
    } catch {if(status) status.textContent='Saved animation preference could not be loaded.';}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>void start(),{once:true});
  else void start();
})();
