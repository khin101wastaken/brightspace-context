import {descriptionText} from './rich-text.js';
import {searchTermPattern} from './search-highlight.js';

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
      ...descriptionText(item.Description,`${origin}/d2l/le/lessons/${courseId}/units/${id}`),
      descriptionStatus:item.DescriptionStatus || (Object.hasOwn(item,'Description')?'synced':'not_synced'),
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

export function searchOutline(entries,query) {
  const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const patterns=terms.map(term=>searchTermPattern([term]));
  const matches=new Set(),noteMatches=new Set(),deepestMatches=new Set();
  if(!terms.length) return {entries,terms,matches,noteMatches,deepestMatches,resourceMatches:0,moduleMatches:0};
  const byKey=new Map(entries.map(e=>[e.key,e])),included=new Set(),ancestorsByKey=new Map();
  for(const entry of entries) {
    const ancestors=[], visited=new Set([entry.key]);
    for(let p=byKey.get(entry.parentKey);p && !visited.has(p.key);p=byKey.get(p.parentKey)) {ancestors.push(p);visited.add(p.key);}
    ancestorsByKey.set(entry.key,ancestors);
    const text=[entry.title,entry.description,...ancestors.map(e=>e.title)].join(' ').toLocaleLowerCase();
    if(patterns.every(pattern=>pattern.test(text))) {
      included.add(entry.key);ancestors.forEach(e=>included.add(e.key));
      const title=(entry.title || '').toLocaleLowerCase(),notes=(entry.description || '').toLocaleLowerCase();
      // Inherited module-path matches keep files visible as context; only the
      // item whose own title/notes matches gets the direct-match treatment.
      if(patterns.some(pattern=>pattern.test(title) || pattern.test(notes))) matches.add(entry.key);
      if(entry.kind==='module' && patterns.some(pattern=>pattern.test(notes))) noteMatches.add(entry.key);
    }
  }
  for(const key of matches) deepestMatches.add(key);
  for(const key of matches) for(const ancestor of ancestorsByKey.get(key)) deepestMatches.delete(ancestor.key);
  return {entries:entries.filter(e=>included.has(e.key)),terms,matches,noteMatches,deepestMatches,
    resourceMatches:entries.filter(e=>e.kind==='document' && matches.has(e.key)).length,
    moduleMatches:entries.filter(e=>e.kind==='module' && matches.has(e.key)).length};
}

export const filterOutline=(entries,query)=>searchOutline(entries,query).entries;
