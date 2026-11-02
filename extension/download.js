(() => {
  const nodes = [];
  function walk(root) {for (const el of root.children || []) {nodes.push(el); if(el.shadowRoot) walk(el.shadowRoot); walk(el);}}
  walk(document);
  // The observed Lessons content container includes course and topic IDs.
  const container = nodes.find(el => /^d2l_content_\d+_\d+$/.test(el.id));
  if (!container) return {requested:false};
  const within = el => {for(let p=el;p;p=p.parentElement || p.getRootNode()?.host) if(p===container) return true; return false;};
  const candidates = nodes.filter(el => within(el) && (el.matches('button,[role="button"]') || el.localName === 'd2l-button-icon') && (el.getAttribute('aria-label') || el.getAttribute('text') || el.getAttribute('title') || el.textContent || '').trim() === 'Download');
  // Custom elements can wrap a button: use the outermost matching control once.
  const button = candidates.find(el => !candidates.some(other => other !== el && other.contains(el)));
  if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return {requested:false};
  button.click();
  return {requested:true};
})();
