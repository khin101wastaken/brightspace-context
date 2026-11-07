const activeVisibility=new WeakMap(),activeDisclosures=new WeakMap();
const easing='cubic-bezier(.2,0,.2,1)';
function canAnimate(element) {
  if(!element.isConnected || typeof element.animate!=='function') return false;
  const preference=element.ownerDocument.documentElement?.dataset?.motion;
  return preference==='on' || (preference!=='off' &&
    !element.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Closing removes keyboard/screen-reader access immediately; only the visual
// exit waits. Every completion is guarded so an old close cannot hide a reopen.
export function reveal(element,show,{immediate=false}={}) {
  const previous=activeVisibility.get(element),wasHidden=element.hidden;
  const style=previous?element.ownerDocument.defaultView.getComputedStyle(element):null;
  const from=style?{opacity:style.opacity,transform:style.transform}:null;
  activeVisibility.delete(element);previous?.cancel();
  element.inert=!show;element.setAttribute('aria-hidden',String(!show));
  if(immediate || !canAnimate(element) || (!show && wasHidden)) {element.hidden=!show;return;}
  element.hidden=false;
  const offset=element.dataset.above==='true'?4:-4;
  const hidden={opacity:0,transform:`translateY(${offset}px)`},visible={opacity:1,transform:'translateY(0)'};
  const animation=element.animate([from || (show?hidden:visible),show?visible:hidden],{duration:show?150:110,easing});
  activeVisibility.set(element,animation);
  animation.finished.then(()=>{
    if(activeVisibility.get(element)!==animation) return;
    activeVisibility.delete(element);element.hidden=!show;
  },()=>{});
}

// Native details remain the source of open state. Only deliberate summary
// activation animates; restored folders and search-driven expansion stay instant.
export function animateDisclosure(details) {
  const summary=details.querySelector(':scope > summary');
  let desired=details.open;
  summary.addEventListener('click',event=>{
    if(event.defaultPrevented || event.target.closest('a,button,input')) return;
    event.preventDefault();
    for(let parent=details.parentElement;parent;parent=parent.parentElement) activeDisclosures.get(parent)?.finish();
    const previous=activeDisclosures.get(details),start=details.getBoundingClientRect().height;
    if(!previous) desired=details.open;
    previous?.cancel();desired=!desired;
    summary.setAttribute('aria-expanded',String(desired));
    const body=Array.from(details.children).filter(child=>child!==summary);
    const finish=()=>{
      details.open=desired;details.style.overflow='';
      body.forEach(child=>child.inert=false);summary.removeAttribute('aria-expanded');
      activeDisclosures.delete(details);
    };
    if(!canAnimate(details)) {finish();return;}
    if(!desired && body.some(child=>child.contains(details.ownerDocument.activeElement))) summary.focus();
    details.open=true;
    const view=details.ownerDocument.defaultView,style=view.getComputedStyle(details);
    const end=desired?details.getBoundingClientRect().height:
      summary.getBoundingClientRect().bottom-details.getBoundingClientRect().top+parseFloat(style.paddingBottom)+parseFloat(style.borderBottomWidth);
    details.style.overflow='hidden';body.forEach(child=>child.inert=!desired);
    const animation=details.animate([{height:`${start}px`},{height:`${end}px`}],{duration:desired?170:120,easing});
    const current={cancel:()=>{activeDisclosures.delete(details);animation.cancel();},finish:()=>{animation.cancel();finish();}};
    activeDisclosures.set(details,current);
    animation.finished.then(()=>{if(activeDisclosures.get(details)===current) finish();},()=>{});
  });
}
