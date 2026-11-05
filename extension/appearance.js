// Runs before the stylesheet so a saved appearance is applied before paint.
(() => {
  const key='uiAppearance',root=document.documentElement;
  const system=matchMedia('(prefers-color-scheme: dark)');
  const valid=value=>value==='light' || value==='dark';
  let preference=null,revision=0,button,status;
  try {const saved=localStorage.getItem(key);if(valid(saved)) preference=saved;} catch {}
  const resolved=()=>preference || (system.matches?'dark':'light');
  function render() {
    const dark=resolved()==='dark';root.dataset.theme=dark?'dark':'light';
    if(button) {button.setAttribute('aria-checked',String(dark));button.title=`Switch to ${dark?'light':'dark'} mode`;}
  }
  function apply(value) {
    preference=valid(value)?value:null;
    try {if(preference) localStorage.setItem(key,preference);else localStorage.removeItem(key);} catch {}
    render();
  }
  render();
  system.addEventListener('change',()=>{if(!preference) render();});
  async function start() {
    button=document.getElementById('appearance-toggle');status=document.getElementById('appearance-status');
    render();
    button?.addEventListener('click',async()=>{
      if(button.disabled) return;
      const previous=preference,current=++revision;
      button.disabled=true;if(status) status.textContent='';
      apply(resolved()==='dark'?'light':'dark');
      try {await chrome.storage.local.set({[key]:preference});}
      catch {
        if(revision===current) apply(previous);
        if(status) status.textContent='Appearance could not be saved. Try again.';
      } finally {button.disabled=false;}
    });
    try {
      chrome.storage.onChanged.addListener((changes,area)=>{
        if(area==='local' && Object.hasOwn(changes,key)) {revision++;apply(changes[key].newValue);}
      });
      const current=revision,saved=await chrome.storage.local.get(key);
      if(revision===current) apply(saved[key]);
    } catch {if(status) status.textContent='Saved appearance could not be loaded.';}
    finally {root.dataset.motionReady='true';}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>void start(),{once:true});
  else void start();
})();
