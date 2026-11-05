import test from 'node:test';
import assert from 'node:assert/strict';
import {searchOutline} from '../extension/course-api.js';
import {appendHighlightedText,searchTermPattern} from '../extension/search-highlight.js';
import {PRODUCT_LINKS,PRODUCT_VERSION,wireProductLinks} from '../extension/product-links.js';
import {readFile} from 'node:fs/promises';

const module=(id,title,parentKey=null,description='')=>({key:`module:${id}`,kind:'module',title,parentKey,description});
const file=(id,title,parentKey)=>({key:`document:${id}`,kind:'document',title,parentKey,description:''});
test('notes-only matches count modules and identify the exact nested notes to reveal',()=>{
  const entries=[module(1,'Week 9'),module(2,'Adolescence','module:1','Reading: Dahl RE. Film: Me, Earl and the Dying Girl'),file(3,'Slides','module:2')];
  const result=searchOutline(entries,'Dahl');
  assert.deepEqual(result.entries.map(e=>e.key),['module:1','module:2']);
  assert.deepEqual([...result.matches],['module:2']);assert.deepEqual([...result.noteMatches],['module:2']);
  assert.equal(result.resourceMatches,0);assert.equal(result.moduleMatches,1);assert.deepEqual([...result.deepestMatches],['module:2']);
});
test('direct filename matches get deepest emphasis while inherited paths remain context',()=>{
  const entries=[module(1,'Emotion'),module(2,'Emotion regulation','module:1'),file(3,'Emotion lecture.pdf','module:2'),file(4,'Overview.pdf','module:2')];
  const result=searchOutline(entries,'emotion');
  assert.equal(result.entries.length,4);assert.equal(result.matches.has('document:4'),false);
  assert.equal(result.resourceMatches,1);assert.equal(result.moduleMatches,2);assert.deepEqual([...result.deepestMatches],['document:3']);
  const contextual=searchOutline(entries,'regulation lecture');assert.deepEqual([...contextual.matches],['document:3']);
  assert.equal(searchOutline(entries,'unmatched').entries.length,0);
  assert.equal(searchOutline(entries,'   ').entries,entries);assert.equal(searchOutline(entries,'   ').matches.size,0);
});

function element(document,tagName) {
  return {ownerDocument:document,tagName,children:[],append(...nodes){this.children.push(...nodes);},set textContent(value){this.children=[{textContent:value}];},get textContent(){return this.children.map(child=>child.textContent).join('');}};
}
test('highlighting is literal, case-insensitive and preserves untrusted text as text nodes',()=>{
  const document={createTextNode:text=>({textContent:text}),createElement:tag=>element(document,tag)};
  const target=element(document,'a'),text='Lecture [12].PDF — <img src=x onerror=alert(1)> lecture';
  appendHighlightedText(target,text,['lecture','[12].pdf']);
  assert.equal(target.textContent,text);
  assert.deepEqual(target.children.filter(c=>c.tagName==='mark').map(c=>c.textContent),['Lecture','[12].PDF','lecture']);
  assert.equal(target.children.some(c=>c.tagName==='img'),false);
  const plain=element(document,'p');appendHighlightedText(plain,'Original text',[]);assert.equal(plain.textContent,'Original text');assert.equal(plain.children.length,1);
});

test('single-letter searches remain standalone while longer terms match word prefixes',()=>{
  const document={createTextNode:text=>({textContent:text}),createElement:tag=>element(document,tag)};
  const target=element(document,'p'),text='Topic 1: Introduction. Film: If I had bad parents, will I be a bad parent? William reads a title.';
  appendHighlightedText(target,text,['if','i','a','will']);
  assert.equal(target.textContent,text);
  assert.deepEqual(target.children.filter(c=>c.tagName==='mark').map(c=>c.textContent),['If','I','will','I','a','Will','a']);
  assert.equal(searchTermPattern(['i']).test('Topic Introduction Film Times'),false);
  assert.equal(searchTermPattern(['parents']).test('grandparents'),false);
  assert.equal(searchTermPattern(['lecture']).test('Lecture_12.pdf'),true);
  assert.equal(searchTermPattern(['café']).test('décaféiné'),false);
  assert.equal(searchTermPattern(['café']).test('Café notes'),true);
});

test('filtering and deepest relevance use the same word-boundary rule as text highlights',()=>{
  const entries=[module(1,'Introduction',null,'Film: Babies. Reading: Times.'),file(2,'If I had bad parents.pdf','module:1'),file(3,'William and Film.pdf','module:1')];
  const result=searchOutline(entries,'I');
  assert.deepEqual(result.entries.map(e=>e.key),['module:1','document:2']);
  assert.deepEqual([...result.matches],['document:2']);assert.equal(result.noteMatches.size,0);
  assert.deepEqual([...result.deepestMatches],['document:2']);
});

test('incomplete words find and highlight the intended filename and module notes',()=>{
  const entries=[module(1,'Introduction',null,'If I had bad parents, will I be a bad parent too?'),file(2,'If I Had Bad Parents.pdf','module:1'),file(3,'Film and Times.pdf','module:1')];
  const result=searchOutline(entries,'if i ha');
  assert.deepEqual(result.entries.map(e=>e.key),['module:1','document:2']);
  assert.deepEqual([...result.deepestMatches],['document:2']);assert.equal(result.noteMatches.has('module:1'),true);
  const document={createTextNode:text=>({textContent:text}),createElement:tag=>element(document,tag)};
  const target=element(document,'a');appendHighlightedText(target,entries[1].title,result.terms);
  assert.deepEqual(target.children.filter(c=>c.tagName==='mark').map(c=>c.textContent),['If','I','Ha']);
  assert.equal(target.textContent,entries[1].title);
  const partials=searchOutline(entries,'if i ha ba par');assert.deepEqual([...partials.deepestMatches],['document:2']);
  assert.equal(searchTermPattern(['ha']).test('Chad'),false);assert.equal(searchTermPattern(['int']).test('Introduction'),true);
});
test('extension help links use the published site, a version-matched download, and the approved support contact',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.version,PRODUCT_VERSION);
  const anchors=Object.keys(PRODUCT_LINKS).map(productLink=>({dataset:{productLink}}));
  wireProductLinks({querySelectorAll:()=>anchors});
  for(const anchor of anchors) assert.equal(anchor.href,PRODUCT_LINKS[anchor.dataset.productLink]);
  assert.equal(anchors[0].target,'_blank');assert.match(anchors[0].rel,/noopener/);
  assert.equal(PRODUCT_LINKS.setup,'https://brightspace-context.khin101.chatgpt.site/setup/');
  assert.equal(PRODUCT_LINKS.github,'https://github.com/khin101wastaken/brightspace-context');
  assert.ok(PRODUCT_LINKS.download.endsWith(`BrightspaceContext-${manifest.version}-windows-x64-setup.exe`));
  assert.match(PRODUCT_LINKS.support,/^mailto:khinaungwrk@gmail\.com\?/);
  for(const name of ['popup.html','resources.html']) {
    const html=await readFile(new URL('../extension/'+name,import.meta.url),'utf8');
    for(const key of Object.keys(PRODUCT_LINKS)) assert.ok(html.includes(`data-product-link="${key}"`),`${name} exposes ${key}`);
  }
});
