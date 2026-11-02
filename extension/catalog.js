export const ORIGIN = 'https://brightspace.nyu.edu';

export function identifyUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.origin !== ORIGIN) return null;
  let match = url.pathname.match(/^\/d2l\/le\/lessons\/(\d+)(?:\/(units|topics)\/(\d+))?\/?$/);
  if (match) return { courseId: match[1], kind: match[2] === 'topics' ? 'document' : 'module', id: match[3] || null };
  match = url.pathname.match(/^\/d2l\/home\/(\d+)\/?$/);
  if (match) return { courseId: match[1], id: null, kind: 'course' };
  match = url.pathname.match(/^\/d2l\/le\/content\/(\d+)\/(?:viewContent\/(\d+)\/View|Home)$/i);
  if (!match) return null;
  const moduleId = url.searchParams.get('itemIdentifier')?.match(/ModuleCO-(\d+)$/)?.[1];
  return { courseId: match[1], id: match[2] || moduleId || null, kind: match[2] ? 'document' : 'module' };
}

export function mergeCatalog(previous, snapshot) {
  const authoritative = snapshot.coverage === 'full-toc';
  const entries = new Map((!authoritative && previous?.courseId === snapshot.courseId ? previous.entries : []).map(e => [e.key, e]));
  for (const entry of snapshot.entries) {
    const old = entries.get(entry.key);
    entries.set(entry.key, {...old, ...entry, parentKey: entry.parentKey ?? old?.parentKey ?? null});
  }
  return { ...snapshot, entries: [...entries.values()], coverage: snapshot.coverage || 'partial', lastScannedAt: new Date().toISOString() };
}
