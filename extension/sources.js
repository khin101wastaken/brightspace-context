// Fixed, packaged providers. Never accept a caller-supplied LMS host.
export function sourceConfig(provider='nyu') {
  if(provider==='nyu') return {provider,origin:'https://brightspace.nyu.edu',base:'https://brightspace.nyu.edu',contentPath:'/content/'};
  if(provider==='demo') return {provider,origin:'http://127.0.0.1:47653',base:'http://127.0.0.1:47653/demo',contentPath:'/demo/content/'};
  if(provider==='hosted-demo') return {provider,origin:'https://brightspace-context.khin101.chatgpt.site',base:'https://brightspace-context.khin101.chatgpt.site/demo',contentPath:'/demo/content/'};
  throw new Error('Unknown library source.');
}
export function sourceEndpoint(path,provider='nyu') {
  sourceConfig(provider);
  if(provider==='hosted-demo') throw new Error('The hosted demo uses only public sample data.');
  if(provider!=='demo')return path;
  const absolute=/^[a-z]+:\/\//i.test(path),url=new URL(path,'http://127.0.0.1:47653');
  if(!url.pathname.startsWith('/v1/'))throw new Error('Invalid companion API path.');
  url.pathname='/demo-api'+url.pathname;
  return absolute?url.href:url.pathname+url.search;
}
const scoped=key=>/^(?:course:|semester:|folders:|cache:|attempt:)/.test(key) || ['availableSemesters','resourcesSelection','semesterSync','retrievalStatus'].includes(key);
export const sourceKey=(key,provider)=>provider!=='nyu' && scoped(key)?`${provider}:${key}`:key;
// A scoped view retains shared pairing and preferences but hides the other library.
export function sourceStorage(storage,provider='nyu') {
  sourceConfig(provider);
  const decode=key=>{
    const match=/^(demo|hosted-demo):/.exec(key);
    if(match) return match[1]===provider?key.slice(match[0].length):null;
    return provider!=='nyu' && scoped(key)?null:key;
  };
  return {
    ...storage,
    async get(keys) {
      const all=await storage.get(null),values={};
      for(const [key,value] of Object.entries(all)){const name=decode(key);if(name!==null)values[name]=value;}
      if(keys==null)return values;
      const names=typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);
      return Object.fromEntries(names.map(key=>[key,values[key]??(typeof keys==='object' && !Array.isArray(keys)?keys[key]:undefined)]));
    },
    set:values=>storage.set(Object.fromEntries(Object.entries(values).map(([key,value])=>[sourceKey(key,provider),value]))),
    remove:keys=>storage.remove((Array.isArray(keys)?keys:[keys]).map(key=>sourceKey(key,provider))),
    onChanged:{addListener(fn){storage.onChanged.addListener((changes,area)=>{
      const mapped={};for(const [key,value] of Object.entries(changes)){const name=decode(key);if(name!==null)mapped[name]=value;}
      if(Object.keys(mapped).length)fn(mapped,area);
    });}},
  };
}
