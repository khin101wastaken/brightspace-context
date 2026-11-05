import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {setImmediate as settled} from 'node:timers/promises';
const source=await readFile(new URL('../extension/motion-settings.js',import.meta.url),'utf8');

function environment({saved,reduced=true,get,set}={}) {
  const listeners=[],mirror=new Map(),store={value:saved};
  const storage={local:{get:get || (async()=>({uiMotion:store.value})),set:set || (async updates=>{
    store.value=updates.uiMotion;for(const listener of listeners)listener({uiMotion:{newValue:store.value}},'local');
  })},onChanged:{addListener:callback=>listeners.push(callback)}};
  function page() {
    const controls=['system','on','off'].map(value=>({value,disabled:false,checked:false,addEventListener(type,handler){this[type]=handler;}}));
    const root={dataset:{}},status={textContent:''},media={matches:reduced,addEventListener(type,handler){this[type]=handler;}};
    const document={documentElement:root,readyState:'complete',querySelectorAll:()=>controls,getElementById:()=>status};
    runInNewContext(source,{document,chrome:{storage},matchMedia:()=>media,localStorage:{getItem:key=>mirror.get(key),setItem:(key,value)=>mirror.set(key,value)}});
    return {root,controls,status,media,async choose(value){const control=controls.find(input=>input.value===value);control.checked=true;await control.change();}};
  }
  return {page,store,mirror};
}

test('motion follows the system by default, while explicit On and Off override it',async()=>{
  const env=environment(),page=env.page();assert.equal(page.root.dataset.motion,'off');await settled();
  assert.equal(page.root.dataset.motionPreference,'system');
  await page.choose('on');assert.equal(page.root.dataset.motion,'on');assert.equal(page.media.matches,true);
  page.media.change();assert.equal(page.root.dataset.motion,'on');
  await page.choose('off');page.media.matches=false;page.media.change();assert.equal(page.root.dataset.motion,'off');
  await page.choose('system');assert.equal(page.root.dataset.motion,'on');
  page.media.matches=true;page.media.change();assert.equal(page.root.dataset.motion,'off');
});

test('extension motion is saved, mirrored before paint and shared by open pages',async()=>{
  const env=environment(),connect=env.page(),resources=env.page();await settled();
  await resources.choose('on');assert.equal(connect.root.dataset.motion,'on');assert.equal(env.store.value,'on');
  assert.equal(env.mirror.get('uiMotion'),'on');const reopened=env.page();assert.equal(reopened.root.dataset.motion,'on');
  await settled();assert.equal(reopened.controls.find(input=>input.value==='on').checked,true);
});

test('late storage reads cannot overwrite a newer motion selection',async()=>{
  let resolve;const env=environment({get:()=>new Promise(done=>resolve=done)}),page=env.page();
  await page.choose('on');resolve({uiMotion:'off'});await settled();assert.equal(page.root.dataset.motion,'on');
});

test('failed preference writes restore the previous state and keep controls usable',async()=>{
  const env=environment({set:async()=>{throw new Error('Storage unavailable');}}),page=env.page();await settled();
  await page.choose('on');assert.equal(page.root.dataset.motion,'off');assert.equal(page.root.dataset.motionPreference,'system');
  assert.equal(page.controls.find(input=>input.value==='system').checked,true);
  assert.equal(page.controls.some(input=>input.disabled),false);assert.match(page.status.textContent,/could not be saved/);
});

test('unknown stored motion preferences fall back to system behavior',async()=>{
  const env=environment({saved:'unexpected'}),page=env.page();await settled();
  assert.equal(page.root.dataset.motionPreference,'system');assert.equal(page.root.dataset.motion,'off');
});
