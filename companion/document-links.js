import {randomBytes} from 'node:crypto';

// Capability links are held in memory only and never contain pairing credentials.
export function createDocumentLinks({now=Date.now,ttlMs=5*60*1000,maxLinks=100}={}) {
  const links=new Map();
  const prune=()=>{for(const [token,link] of links)if(link.expires<=now())links.delete(token);};
  return {
    create({provider,entry,client}) {
      prune();
      if(links.size>=maxLinks)links.delete(links.keys().next().value);
      const token=randomBytes(24).toString('base64url'),expires=now()+ttlMs;
      links.set(token,{provider,id:entry.id,sha256:entry.sha256,client,expires});
      return {path:`/local-files/${token}`,expiresAt:new Date(expires).toISOString()};
    },
    get(token,client) {prune();const link=links.get(token);return link && link.client===client?link:null;},
    revoke(provider,ids) {for(const [token,link] of links)if(link.provider===provider && ids.includes(link.id))links.delete(token);},
    clear(){links.clear();},
  };
}
