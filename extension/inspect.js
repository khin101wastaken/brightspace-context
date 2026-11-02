// Runs in the isolated extension world in each permitted frame. No page internals or cookies are read.
(() => {
  const elements = [];
  function walk(root) {
    for (const child of root.children || []) {
      elements.push(child);
      if (child.shadowRoot) walk(child.shadowRoot);
      walk(child);
    }
  }
  walk(document);
  const parent = el => el.parentElement || el.getRootNode()?.host || null;
  const descendants = el => elements.filter(candidate => {
    for (let p = candidate; p; p = parent(p)) if (p === el) return true;
    return false;
  });
  const text = el => (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const rows = elements.filter(el => el.getAttribute('role') === 'treeitem');
  const entries = [];
  const rowKeys = new Map();
  const moduleWrappers = new Map();
  for (const row of rows) {
    const nodes = descendants(row).filter(node => {
      for (let p = node; p && p !== row; p = parent(p)) {
        if (p.getAttribute?.('role') === 'treeitem') return false;
      }
      return true;
    });
    // Brightspace's observed topic-<id>-label is preferred over titles.
    const ids = [row.id, ...nodes.map(el => el.id)].filter(Boolean);
    const topic = ids.map(id => id.match(/^topic-(\d+)(?:-|$)/)).find(Boolean);
    const module = ids.map(id => id.match(/^(?:unit|module)-(\d+)(?:-|$)/)).find(Boolean);
    const lessonsTitle = ids.map(id => id.match(/^lessons-title-(\d+)$/)).find(Boolean);
    const directLink = nodes.find(el => el.matches('a[href]') && /\/(?:units|topics)\/\d+/.test(el.getAttribute('href')));
    const linkMatch = directLink?.getAttribute('href').match(/\/(units|topics)\/(\d+)/);
    const id = topic?.[1] || module?.[1] || linkMatch?.[2] || lessonsTitle?.[1];
    const kind = topic || linkMatch?.[1] === 'topics' ? 'document' : 'module';
    let label = text(row);
    const labelled = row.getAttribute('aria-labelledby');
    if (labelled) {
      const labelNode = elements.find(el => el.id === labelled);
      if (labelNode) label = text(labelNode);
    }
    // Visible title excludes accessibility prefixes, due dates, and duplicate overflow text.
    const visibleTitle = nodes.find(el => el.classList.contains('title-text'));
    if (visibleTitle) label = text(visibleTitle);
    if (!label) continue;
    // Missing stable IDs are surfaced for adapter debugging, never persisted as invented identities.
    const key = id ? `${kind}:${id}` : null;
    if (key) rowKeys.set(row, key);
    if (key && kind === 'module' && parent(row)?.classList.contains('unit')) {
      moduleWrappers.set(parent(row), key);
    }
    entries.push({key, id: id || null, kind, title: label, parentKey:null, order:entries.length, level:Number(row.getAttribute('aria-level')) || null, expanded:row.getAttribute('aria-expanded'), row});
  }
  const levelStack = [];
  for (const entry of entries) {
    for (let p = parent(entry.row); p; p = parent(p)) {
      if (rowKeys.has(p)) {entry.parentKey = rowKeys.get(p); break;}
      const moduleKey = moduleWrappers.get(p);
      if (moduleKey && moduleKey !== entry.key) {entry.parentKey = moduleKey; break;}
    }
    if (entry.level) {
      while (levelStack.length && levelStack.at(-1).level >= entry.level) levelStack.pop();
      if (!entry.parentKey && levelStack.length) entry.parentKey = levelStack.at(-1).key;
      levelStack.push(entry);
    }
    delete entry.row;
  }
  const links = elements.filter(el => el.matches('a[href]')).map(el => ({title:text(el), url:el.href})).filter(link => link.title && link.url?.startsWith('https://brightspace.nyu.edu/d2l/'));
  let courseId = null;
  try {courseId = window.top.location.pathname.match(/\/d2l\/(?:le\/(?:lessons|content)|home)\/(\d+)/)?.[1] || null;} catch { /* Cross-origin frames are excluded. */ }
  return { courseId, frameUrl:location.href, title:document.title, entries, links, collapsed:entries.filter(e => e.expanded === 'false').length };
})();
