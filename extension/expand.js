// Expand only Lessons navigation triangles. No topics, file viewers or downloads are opened.
(async () => {
  if (!location.pathname.includes('/smart-curriculum/')) return {applicable:false};
  const coursePath = () => {try {return window.top.location.pathname;} catch {return null;}};
  const initialPath = coursePath();
  const courseId = initialPath?.match(/\/lessons\/(\d+)/)?.[1];
  if (!courseId) return {applicable:false};
  const all = () => {
    const nodes=[];
    const walk=root=>{for(const el of root.children || []) {nodes.push(el); if(el.shadowRoot) walk(el.shadowRoot); walk(el);}};
    walk(document); return nodes;
  };
  const label = el => el.getAttribute('aria-label') || el.getAttribute('text') || el.getAttribute('title');
  const navigation = all().find(el => label(el)==='Expand Navigation Menu' && (el.matches('button') || el.localName==='d2l-button-icon'));
  if (navigation) navigation.click();
  const started=Date.now(), clicked=new Set();
  let stable=0, previous='', expanded=0;
  while (Date.now()-started<30000 && expanded<500) {
    if (coursePath()!==initialPath) throw new Error('Brightspace navigation changed while scanning. Try again.');
    const nodes=all();
    const rows=nodes.filter(el=>el.getAttribute('role')==='treeitem');
    const collapsed=rows.filter(el=>el.getAttribute('aria-expanded')==='false');
    let changed=false;
    // Expand one at a time so rerenders cannot invalidate the remaining controls.
    for (const row of collapsed) {
      const title=row.querySelector('[id^="lessons-title-"]');
      const key=title?.id;
      const triangle=row.querySelector('.module-triangle');
      if (!key || !triangle || clicked.has(key)) continue;
      clicked.add(key); triangle.click(); expanded++; changed=true; break;
    }
    const signature=rows.map(row=>`${row.querySelector('[id^="lessons-title-"]')?.id}:${row.getAttribute('aria-expanded')}`).join('|');
    stable=!changed && signature===previous ? stable+1 : 0;
    previous=signature;
    if(stable>=4) return {applicable:true,courseId,expanded,remaining:collapsed.length,timedOut:false};
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  return {applicable:true,courseId,expanded,remaining:all().filter(el=>el.getAttribute('role')==='treeitem' && el.getAttribute('aria-expanded')==='false').length,timedOut:true};
})();
