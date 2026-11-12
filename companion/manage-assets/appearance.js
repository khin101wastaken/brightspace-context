// Apply the saved appearance before the dashboard stylesheet paints.
(() => {
  const key='brightspaceCompanionAppearance';
  const system=matchMedia('(prefers-color-scheme: dark)');
  const root=document.documentElement;
  let preference,button;
  try {
    const saved=localStorage.getItem(key);
    if(saved==='light' || saved==='dark') preference=saved;
  } catch {}

  function render() {
    const dark=(preference ?? (system.matches?'dark':'light'))==='dark';
    root.dataset.theme=dark?'dark':'light';
    if(button) {
      button.setAttribute('aria-checked',String(dark));
      button.title=dark?'Switch to light mode':'Switch to dark mode';
    }
  }

  render();
  system.addEventListener('change',()=>{if(!preference) render();});
  document.addEventListener('DOMContentLoaded',()=>{
    button=document.getElementById('appearance-toggle');
    render();
    button.addEventListener('click',()=>{
      preference=root.dataset.theme==='dark'?'light':'dark';
      try {localStorage.setItem(key,preference);} catch {}
      render();
    });
  },{once:true});
})();
