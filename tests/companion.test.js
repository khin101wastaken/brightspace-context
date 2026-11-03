import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {openCache} from '../companion/cache.js';
import {createCompanion} from '../companion/server.js';
import {pairCompanion,cachePdf,companionStatus,COMPANION_URL} from '../extension/companion-client.js';

const origin=`chrome-extension://${'a'.repeat(32)}`;
const metadata=id=>({courseId:'100',topicId:String(id),title:`Reading ${id}`,courseTitle:'Networks',modulePath:['Week 1','Readings'],sourceUrl:`https://brightspace.nyu.edu/content/enforced/100/${id}.pdf`,lastModifiedAt:'2026-01-01T00:00:00Z'});
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
async function temporary(t) {
  const testRoot=path.resolve('.cache/tests');await mkdir(testRoot,{recursive:true});
  const directory=await mkdtemp(path.join(testRoot,'brightspace-cache-test-'));
  t.after(async()=>{
    const absolute=path.resolve(directory),root=testRoot+path.sep;
    if(!absolute.startsWith(root) || !path.basename(absolute).startsWith('brightspace-cache-test-')) throw new Error('Unsafe test cleanup path.');
    await rm(absolute,{recursive:true,force:true});
  });return directory;
}

test('cache persists exact PDF bytes and refreshes versions without duplicate files',async t=>{
  const directory=await temporary(t),meta=metadata(1);
  let time=100;
  const cache=await openCache(directory,{now:()=>++time});
  assert.equal((await cache.lookup(meta)).hit,false);
  const first=await cache.put(meta,pdf);
  assert.equal((await cache.lookup(meta)).hit,true);
  assert.deepEqual((await cache.read(first.id)).bytes,pdf);
  const reopened=await openCache(directory);
  assert.equal((await reopened.lookup(meta)).hit,true);
  const changed={...meta,lastModifiedAt:'2026-02-01T00:00:00Z'};
  assert.equal((await reopened.lookup(changed)).hit,false);
  await reopened.put(changed,pdf);
  assert.equal((await reopened.stats()).files,1);
  await assert.rejects(reopened.put(metadata(2),Buffer.from('<html>Login</html>')),/not a PDF/);
  assert.equal((await reopened.stats()).files,1);
  // A crash during replacement must never make mismatched bytes a cache hit.
  await writeFile(path.join(directory,`${first.id}.pdf`),Buffer.alloc(pdf.length));
  assert.equal((await reopened.lookup(changed)).hit,false);
  assert.equal(await reopened.read(first.id),null);
});

test('LRU eviction counts metadata, preserves recently used entries and enforces budget',async t=>{
  const directory=await temporary(t);let time=0;
  const cache=await openCache(directory,{budgetBytes:4500,now:()=>++time});
  const bytes=Buffer.concat([Buffer.from('%PDF-1.4\n'),Buffer.alloc(1400)]);
  await cache.put(metadata(1),bytes);await cache.put(metadata(2),bytes);
  await cache.lookup(metadata(1));
  const result=await cache.put(metadata(3),bytes);
  assert.equal(result.evicted,1);
  assert.equal((await cache.lookup(metadata(1))).hit,true);
  assert.equal((await cache.lookup(metadata(2))).hit,false);
  assert.equal((await cache.lookup(metadata(3))).hit,true);
  assert.ok((await cache.stats()).usedBytes<=4500);
  await assert.rejects(cache.put(metadata(4),Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(5000)])),/exceed the cache budget/);
  assert.equal((await cache.stats()).files,2);
});

test('missing version dates get only a short cache freshness window',async t=>{
  let time=0;const cache=await openCache(await temporary(t),{now:()=>time});
  const meta={...metadata(1),lastModifiedAt:null};await cache.put(meta,pdf);
  assert.equal((await cache.lookup(meta)).hit,true);
  time=300001;assert.equal((await cache.lookup(meta)).hit,false);
});

test('paired HTTP flow: first PDF request fetches, second is a cache hit, and stored bytes match',async t=>{
  const directory=await temporary(t),app=await createCompanion({directory,port:0,pairingCode:'123456789a'});
  t.after(()=>app.close());
  let upstreamRequests=0;
  const fetcher=async(url,options={})=>{
    if(url.startsWith('https://brightspace.nyu.edu/')) {
      upstreamRequests++;assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');
      return new Response(pdf,{headers:{'Content-Type':'application/pdf','Content-Length':String(pdf.length)}});
    }
    // Privileged browser GETs can omit Origin. The extension status probe must
    // use POST; otherwise the real origin-gated service would reject it.
    return fetch(url.replace(COMPANION_URL,app.url),{...options,headers:{...options.headers,...(options.method && options.method!=='GET'?{Origin:origin}:{})}});
  };
  const blocked=await fetch(`${app.url}/v1/status`,{headers:{Origin:'https://evil.example'}});assert.equal(blocked.status,403);
  await assert.rejects(pairCompanion('0000000000',fetcher),/did not match/);
  const pairing=await pairCompanion('123456789a',fetcher);
  const missingOrigin=await fetch(`${app.url}/v1/status`,{headers:{Authorization:`Bearer ${pairing.token}`}});assert.equal(missingOrigin.status,403);
  assert.equal((await companionStatus(pairing.token,fetcher)).files,0);
  await assert.rejects(companionStatus('wrong',fetcher),/Pair this extension/);
  const meta=metadata(1),catalog={courseId:'100',title:meta.courseTitle,entries:[{key:'module:1',kind:'module',title:'Week 1'},
    {key:'module:2',kind:'module',title:'Readings',parentKey:'module:1'},
    {key:'document:1',id:'1',kind:'document',contentType:'file',title:meta.title,parentKey:'module:2',sourceUrl:meta.sourceUrl,lastModifiedAt:meta.lastModifiedAt}]};
  const [fetched,concurrent]=await Promise.all([cachePdf(catalog,'document:1',pairing.token,fetcher),cachePdf(catalog,'document:1',pairing.token,fetcher)]);
  assert.equal(concurrent.id,fetched.id);
  assert.equal(fetched.source,'brightspace');assert.equal(upstreamRequests,1);
  assert.deepEqual(fetched.entry.modulePath,['Week 1','Readings']);
  const hit=await cachePdf(catalog,'document:1',pairing.token,fetcher);
  assert.equal(hit.source,'cache');assert.equal(upstreamRequests,1);assert.equal(hit.id,fetched.id);
  const saved=await fetch(`${app.url}/v1/cache/files/${hit.id}`,{headers:{Origin:origin,Authorization:`Bearer ${pairing.token}`}});
  assert.deepEqual(Buffer.from(await saved.arrayBuffer()),pdf);
  assert.deepEqual(await readFile(path.join(directory,`${hit.id}.pdf`)),pdf);
  catalog.entries[2].lastModifiedAt='2026-02-01T00:00:00Z';
  assert.equal((await cachePdf(catalog,'document:1',pairing.token,fetcher)).source,'brightspace');
  assert.equal(upstreamRequests,2);assert.equal((await companionStatus(pairing.token,fetcher)).files,1);
  await app.close();
  const restarted=await createCompanion({directory,port:0});
  t.after(()=>restarted.close());
  const persisted=await fetch(`${restarted.url}/v1/status`,{headers:{Origin:origin,Authorization:`Bearer ${pairing.token}`}});
  assert.equal(persisted.status,200);assert.equal((await persisted.json()).files,1);
});

test('HTML and oversized upstream responses never enter the cache',async t=>{
  const app=await createCompanion({directory:await temporary(t),port:0,pairingCode:'123456789a'});t.after(()=>app.close());
  let invalid='html';
  const fetcher=async(url,options={})=>url.startsWith('https://brightspace.nyu.edu/')?
    new Response(invalid==='html'?'<html>Login</html>':pdf,{headers:{'Content-Type':invalid==='html'?'text/html':'application/pdf','Content-Length':invalid==='html'?'18':String(51*1024*1024)}}):
    fetch(url.replace(COMPANION_URL,app.url),{...options,headers:{...options.headers,Origin:origin}});
  const {token}=await pairCompanion('123456789a',fetcher),meta=metadata(1);
  const catalog={courseId:'100',title:'Networks',entries:[{key:'document:1',id:'1',contentType:'file',title:'PDF',sourceUrl:meta.sourceUrl}]};
  await assert.rejects(cachePdf(catalog,'document:1',token,fetcher),/did not return PDF/);
  invalid='large';await assert.rejects(cachePdf(catalog,'document:1',token,fetcher),/50 MB/);
  assert.equal((await app.cache.stats()).files,0);
});
