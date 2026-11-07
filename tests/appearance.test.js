import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {setImmediate as settled} from 'node:timers/promises';
const source=await readFile(new URL('../extension/appearance.js',import.meta.url),'utf8');

function environment({saved,dark=false,mirror=new Map(),get,set}={}) {
  const changes=[],pages=[];
  const store={value:saved};
  const storage={local:{get:get || (async()=>({uiAppearance:store.value})),set:set || (async updates=>{
    store.value=updates.uiAppearance;
    for(const callback of changes) callback({uiAppearance:{newValue:store.value}},'local');
  })},onChanged:{addListener:callback=>changes.push(callback)}};
  function page() {
    const handlers={},button={attributes:{},disabled:false,setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){handlers[k]=v;}},status={textContent:''};
    const media={matches:dark,addEventListener(event,callback){this.changed=callback;}};
    const root={dataset:{}};
    const document={documentElement:root,readyState:'complete',getElementById:id=>id==='appearance-toggle'?button:status};
    runInNewContext(source,{document,chrome:{storage},matchMedia:()=>media,localStorage:{getItem:k=>mirror.get(k),setItem:(k,v)=>mirror.set(k,v),removeItem:k=>mirror.delete(k)}});
    const result={root,button,status,media,click:()=>handlers.click()};pages.push(result);return result;
  }
  return {page,store,mirror};
}

test('appearance follows the system until the user explicitly chooses a mode',async()=>{
  const env=environment({dark:true}),page=env.page();
  assert.equal(page.root.dataset.theme,'dark');await settled();
  assert.equal(page.button.attributes['aria-checked'],'true');
  page.media.matches=false;page.media.changed();assert.equal(page.root.dataset.theme,'light');
  await page.click();assert.equal(env.store.value,'dark');
  page.media.matches=false;page.media.changed();assert.equal(page.root.dataset.theme,'dark');
});

test('manual appearance persists across pages and updates an already open page',async()=>{
  const env=environment({saved:'light'}),connect=env.page(),resources=env.page();await settled();
  await connect.click();
  assert.equal(connect.root.dataset.theme,'dark');assert.equal(resources.root.dataset.theme,'dark');
  assert.equal(env.mirror.get('uiAppearance'),'dark');
  const reopened=env.page();assert.equal(reopened.root.dataset.theme,'dark');await settled();
  assert.equal(reopened.button.attributes['aria-checked'],'true');
  await resources.click();assert.equal(connect.root.dataset.theme,'light');assert.equal(reopened.root.dataset.theme,'light');
});

test('a late initial preference read cannot undo a user selection',async()=>{
  let resolveRead;
  const env=environment({get:()=>new Promise(resolve=>{resolveRead=resolve;})}),page=env.page();
  await page.click();resolveRead({uiAppearance:'light'});await settled();
  assert.equal(page.root.dataset.theme,'dark');assert.equal(env.store.value,'dark');assert.equal(page.button.disabled,false);
});

test('a failed preference save restores the prior theme and announces the failure',async()=>{
  const env=environment({saved:'light',set:async()=>{throw new Error('storage unavailable');}}),page=env.page();await settled();
  await page.click();
  assert.equal(page.root.dataset.theme,'light');assert.equal(page.button.attributes['aria-checked'],'false');
  assert.equal(page.button.disabled,false);assert.match(page.status.textContent,/could not be saved/i);
  assert.equal(env.mirror.get('uiAppearance'),'light');
});
