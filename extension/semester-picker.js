import {reveal} from './ui-motion.js';
// Select-only combobox. The original select remains the source of values and
// change events; focus stays on the control while the list is open.
export function enhanceSemesterPicker(select) {
  const root=select.parentElement,doc=select.ownerDocument;
  const button=doc.createElement('button'),value=doc.createElement('span'),list=doc.createElement('div');
  button.type='button';button.id='semester-picker-button';button.className='semester-picker-button';
  button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');
  button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','semester-options');
  value.id='semester-picker-value';button.setAttribute('aria-labelledby','semester-label semester-picker-value');
  button.append(value,root.querySelector('svg'));
  list.id='semester-options';list.className='semester-options';list.hidden=true;
  list.setAttribute('role','listbox');list.setAttribute('aria-labelledby','semester-label');
  root.append(button,list);select.hidden=true;
  doc.querySelector('label[for="semester-select"]').htmlFor=button.id;
  let options=[],active=-1,typed='',typedAt=0;
  const opened=()=>button.getAttribute('aria-expanded')==='true';
  function activate(index) {
    active=index;
    options.forEach((option,i)=>option.dataset.active=String(i===active));
    if(active>=0) {
      button.setAttribute('aria-activedescendant',options[active].id);
      options[active].scrollIntoView({block:'nearest'});
    } else button.removeAttribute('aria-activedescendant');
  }
  function close(immediate=false) {
    button.setAttribute('aria-expanded','false');reveal(list,false,{immediate});
    button.removeAttribute('aria-activedescendant');typed='';
  }
  function open() {
    if(button.disabled) return;
    list.hidden=false;button.setAttribute('aria-expanded','true');
    const bounds=button.getBoundingClientRect(),below=doc.documentElement.clientHeight-bounds.bottom-12,above=bounds.top-12;
    const upwards=below<180 && above>below;
    list.dataset.above=String(upwards);
    list.style.maxHeight=`${Math.max(48,Math.min(320,upwards?above:below))}px`;
    activate(Math.max(0,select.selectedIndex));
    reveal(list,true);
  }
  function choose(index) {
    if(index<0 || !options[index]) return;
    const next=options[index].dataset.value,changed=select.value!==next;
    select.value=next;value.textContent=options[index].textContent;
    options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));
    close();
    if(changed) select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function refresh() {
    close(true);list.replaceChildren();
    options=Array.from(select.options,option=>{
      const item=doc.createElement('div');item.id=`semester-option-${list.children.length}`;
      item.className='semester-option';item.setAttribute('role','option');
      item.setAttribute('aria-selected',String(option.selected));item.dataset.value=option.value;
      item.textContent=option.textContent;list.append(item);return item;
    });
    value.textContent=select.options[select.selectedIndex]?.textContent || 'Choose a semester';
    button.disabled=select.disabled || !Array.from(select.options).some(option=>option.value);
  }
  button.addEventListener('click',()=>opened()?close():open());
  button.addEventListener('keydown',event=>{
    const key=event.key;
    if(['ArrowDown','ArrowUp','Home','End'].includes(key)) {
      event.preventDefault();const wasOpen=opened();if(!wasOpen) open();
      if(!opened()) return;
      activate(key==='Home'?0:key==='End'?options.length-1:wasOpen?Math.max(0,Math.min(options.length-1,active+(key==='ArrowDown'?1:-1))):active);
    } else if(key==='Enter' || key===' ') {
      event.preventDefault();if(opened()) choose(active);else open();
    } else if(key==='Escape' && opened()) {event.preventDefault();event.stopPropagation();close();}
    else if(key==='Tab') {if(opened()) choose(active);}
    else if(key.length===1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();if(!opened()) open();if(!opened()) return;
      const now=Date.now();typed=now-typedAt>700?key:typed+key;typedAt=now;
      const term=typed.toLocaleLowerCase(),repeated=[...term].every(character=>character===term[0]);
      const prefix=repeated?term[0]:term,start=repeated?active+1:active;
      for(let step=0;step<options.length;step++) {
        const index=(start+step+options.length)%options.length;
        if(options[index].textContent.toLocaleLowerCase().startsWith(prefix)) {activate(index);break;}
      }
    }
  });
  list.addEventListener('pointerdown',event=>event.preventDefault()); // Keep keyboard focus on the combobox.
  list.addEventListener('click',event=>{
    const item=event.target.closest('[role="option"]');if(item && list.contains(item)) choose(options.indexOf(item));
  });
  doc.addEventListener('pointerdown',event=>{if(!root.contains(event.target)) close();});
  root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget)) close();});
  select.addEventListener('change',refresh);
  refresh();return {refresh};
}
