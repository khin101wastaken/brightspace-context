// Self-contained: Chrome serializes this function into the selected tab's
// isolated world. Browser session credentials stay inside that browser.
export async function requestCourseOutline(courseId) {
  if (!/^\d+$/.test(String(courseId)) || location.origin !== 'https://brightspace.nyu.edu') {
    throw new Error('Open the NYU Brightspace course before scanning.');
  }
  const response = await fetch(`/d2l/api/le/1.82/${courseId}/content/toc`, {
    credentials:'include', redirect:'error', headers:{Accept:'application/json'},
    signal:AbortSignal.timeout(15000),
  });
  if(response.status===401) throw new Error('Your Brightspace session expired. Sign in and scan again.');
  if(response.status===403) throw new Error('Brightspace denied access to this course outline. Check your sign-in and course access.');
  if(response.status===429) throw new Error('Brightspace is limiting requests. Wait a moment before scanning again.');
  if(!response.ok) throw new Error(`Course-outline request failed (HTTP ${response.status}).`);
  if(!response.headers.get('content-type')?.includes('json')) throw new Error('Brightspace returned a sign-in page or an unexpected response. Sign in and try again.');
  const payload=await response.json();
  if(!payload || !Array.isArray(payload.Modules)) throw new Error('Brightspace returned an unsupported course-outline format.');
  return payload;
}

export function flattenOutline(payload,courseId) {
  if(!/^\d+$/.test(String(courseId)) || !Array.isArray(payload?.Modules)) throw new Error('Invalid course outline.');
  const origin='https://brightspace.nyu.edu', entries=[], seen=new Set();
  const safeUrl=value=>{
    try {const url=new URL(value,origin); return ['https:','http:'].includes(url.protocol)?url.href:null;} catch {return null;}
  };
  function visit(item,parentKey,kind,depth) {
    if(depth>100) throw new Error('Course outline nesting exceeds the supported depth.');
    if(item.IsHidden===true) return;
    const id=String(kind==='module'?item.ModuleId:item.TopicId);
    if(!/^\d+$/.test(id)) throw new Error('Course outline contains an invalid identifier.');
    const key=`${kind}:${id}`;
    if(seen.has(key)) throw new Error('Course outline contains a duplicate identifier.');
    seen.add(key);
    const contentType=kind==='module'?'module':item.ToolId===2000?'assignment':item.TypeIdentifier==='File'?'file':'link';
    entries.push({key,id,kind,contentType,title:String(item.Title || 'Untitled'),parentKey,
      order:Number.isFinite(item.SortOrder)?item.SortOrder:entries.length,
      url:`${origin}/d2l/le/lessons/${courseId}/${kind==='module'?'units':'topics'}/${id}`,
      sourceUrl:item.Url?safeUrl(item.Url):null,
      description:typeof item.Description?.Text==='string'?item.Description.Text:'',
      lastModifiedAt:item.LastModifiedDate || null,locked:item.IsLocked===true,
    });
    if(kind==='module') {
      if(!Array.isArray(item.Modules) || !Array.isArray(item.Topics)) throw new Error('Course outline is missing nested content arrays.');
      const children=[...item.Modules.map(value=>({value,kind:'module'})),...item.Topics.map(value=>({value,kind:'document'}))];
      children.sort((a,b)=>(a.value.SortOrder??0)-(b.value.SortOrder??0));
      for(const child of children) visit(child.value,key,child.kind,depth+1);
    }
  }
  for(const item of [...payload.Modules].sort((a,b)=>(a.SortOrder??0)-(b.SortOrder??0))) visit(item,null,'module',0);
  return entries;
}

export function filterOutline(entries,query) {
  const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if(!terms.length) return entries;
  const byKey=new Map(entries.map(e=>[e.key,e])), included=new Set();
  for(const entry of entries) {
    const ancestors=[], visited=new Set([entry.key]);
    for(let p=byKey.get(entry.parentKey);p && !visited.has(p.key);p=byKey.get(p.parentKey)) {ancestors.push(p);visited.add(p.key);}
    const text=[entry.title,entry.description,...ancestors.map(e=>e.title)].join(' ').toLocaleLowerCase();
    if(terms.every(term=>text.includes(term))) {included.add(entry.key);ancestors.forEach(e=>included.add(e.key));}
  }
  return entries.filter(e=>included.has(e.key));
}
