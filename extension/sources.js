// Fixed, packaged providers. Never accept a caller-supplied LMS host.
export function sourceConfig(provider='nyu') {
  if(provider==='nyu') return {provider,origin:'https://brightspace.nyu.edu',base:'https://brightspace.nyu.edu',contentPath:'/content/'};
  if(provider==='demo') return {provider,origin:'http://127.0.0.1:47653',base:'http://127.0.0.1:47653/demo',contentPath:'/demo/content/'};
  throw new Error('Unknown library source.');
}
export function sourceEndpoint(path,provider='nyu') {
  sourceConfig(provider);
  return provider==='demo'?path+(path.includes('?')?'&':'?')+'source=demo':path;
}
const scoped=key=>/^(?:course:|semester:|folders:|cache:|attempt:)/.test(key) || ['availableSemesters','resourcesSelection','semesterSync','retrievalStatus'].includes(key);
// A scoped view retains shared pairing and preferences but hides the other library.
export function sourceStorage(storage,provider='nyu') {
  sourceConfig(provider);
  const encode=key=>provider==='demo' && scoped(key)?'demo:'+key:key;
  const decode=key=>provider==='demo'?(key.startsWith('demo:')?key.slice(5):scoped(key)?null:key):(key.startsWith('demo:')?null:key);
  return {
    ...storage,
    async get(keys) {
      const all=await storage.get(null),values={};
      for(const [key,value] of Object.entries(all)){const name=decode(key);if(name!==null)values[name]=value;}
      if(keys==null)return values;
      const names=typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);
      return Object.fromEntries(names.map(key=>[key,values[key]??(typeof keys==='object' && !Array.isArray(keys)?keys[key]:undefined)]));
    },
    set:values=>storage.set(Object.fromEntries(Object.entries(values).map(([key,value])=>[encode(key),value]))),
    remove:keys=>storage.remove((Array.isArray(keys)?keys:[keys]).map(encode)),
    onChanged:{addListener(fn){storage.onChanged.addListener((changes,area)=>{
      const mapped={};for(const [key,value] of Object.entries(changes)){const name=decode(key);if(name!==null)mapped[name]=value;}
      if(Object.keys(mapped).length)fn(mapped,area);
    });}},
  };
}
