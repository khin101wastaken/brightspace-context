import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {codexSetup} from './codex-setup.js';
import {COMPANION_VERSION} from './version.js';

const assets=new Map([
  ['/manage/',['index.html','text/html']],
  ['/manage/manage.js',['manage.js','text/javascript']],
  ['/manage/appearance.js',['appearance.js','text/javascript']],
  ['/manage/manage.css',['manage.css','text/css']],
  ['/manage/icon.png',['../../extension/icons/icon-48.png','image/png']],
]);

export function createManagement({token,directory,pairingCode,getScope,connected,revoke,port}) {
  if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid management token.');
  const expected=Buffer.from('Bearer '+token);
  let register;
  return async function manage(req,res,url) {
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const asset=assets.get(url.pathname);
    if(req.method==='GET' && asset) {
      const type=asset[1];
      res.writeHead(200,{'Content-Type':type.startsWith('text/')?type+'; charset=utf-8':type});
      return res.end(await readFile(new URL('./manage-assets/'+asset[0],import.meta.url)));
    }
    const supplied=Buffer.from(req.headers.authorization || '');
    if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) return send(401,{error:'Open the controls from the Brightspace Context tray icon.'});
    if(req.method==='POST' && req.headers.origin!==url.origin) return send(403,{error:'Open the local companion controls to make changes.'});
    const provider=url.searchParams.get('library') || 'nyu';
    if(!['nyu','demo'].includes(provider)) return send(400,{error:'Unknown library.'});
    const {cache,requests}=getScope(provider);
    if(req.method==='GET' && url.pathname==='/manage/api/status') {
      const [stats,documents,pending]=await Promise.all([cache.stats(),cache.list(),requests.pendingDocuments()]);
      return send(200,{version:COMPANION_VERSION,pairingCode,connected:connected(provider),stats,pending,
        documents:documents.map(({id,title,courseTitle,extension,bytes,fetchedAt})=>({id,title,courseTitle,extension,bytes,fetchedAt}))});
    }
    if(req.method==='POST' && url.pathname==='/manage/api/codex') {
      register??=codexSetup({directory,port:port()});
      return send(200,await register());
    }
    const document=url.pathname.match(/^\/manage\/api\/cache(?:\/([a-f0-9]{64}))?$/);
    if(req.method==='POST' && document) {
      const removed=await cache.remove(document[1]);
      revoke(provider,removed);
      return send(200,{removed:removed.length});
    }
    const request=url.pathname.match(/^\/manage\/api\/requests\/([a-f0-9-]{36})\/cancel$/);
    if(req.method==='POST' && request) return await requests.cancelDocument(request[1])?
      send(200,{cancelled:true}):send(409,{error:'This request has started or already finished.'});
    return send(404,{error:'Not found.'});
  };
}
