import test from 'node:test';
import assert from 'node:assert/strict';
import {searchOutline} from '../extension/course-api.js';
import {appendHighlightedText,appendHighlightedPassages,searchTermPattern} from '../extension/search-highlight.js';
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
  assert.deepEqual([...result.expandedModules],['module:1','module:2']);
});
test('direct filename matches get deepest emphasis while inherited paths remain context',()=>{
  const entries=[module(1,'Emotion'),module(2,'Emotion regulation','module:1'),file(3,'Emotion lecture.pdf','module:2'),file(4,'Overview.pdf','module:2')];
  const result=searchOutline(entries,'emotion');
  assert.equal(result.entries.length,4);assert.equal(result.matches.has('document:4'),false);
  assert.equal(result.resourceMatches,1);assert.equal(result.moduleMatches,2);assert.deepEqual([...result.deepestMatches],['document:3']);
  assert.deepEqual([...result.expandedModules].sort(),['module:1','module:2']);
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
  const partials=searchOutline(entries,'if i had bad par');assert.deepEqual([...partials.deepestMatches],['document:2']);
  assert.equal(searchOutline(entries,'if i ha ba par').entries.length,0);
  assert.equal(searchTermPattern(['ha']).test('Chad'),false);assert.equal(searchTermPattern(['int']).test('Introduction'),true);
});

test('a module-title match does not turn inherited words into deeper matches or expand its subtree',()=>{
  const entries=[module(1,'Foundations of Ethics and Technology'),module(2,'Week 1: Introductions','module:1','Winner — Engineering Ethics and Political Imagination. Code of Ethics.'),file(3,'Engineering Ethics and Political Imagination','module:2'),file(4,'Code of Ethics','module:2'),module(5,'Week 2: Ethics','module:1'),module(6,'Unrelated',null,'Ethics and political imagination')];
  const result=searchOutline(entries,'ethics and technology');
  assert.deepEqual(result.entries.map(e=>e.key),['module:1','module:2','document:3','document:4','module:5']);
  assert.deepEqual([...result.matches],['module:1']);
  assert.deepEqual([...result.deepestMatches],['module:1']);
  assert.equal(result.noteMatches.size,0);assert.equal(result.expandedModules.size,0);
  assert.equal(result.resourceMatches,0);assert.equal(result.moduleMatches,1);
});

test('only the path to a full deeper result expands; sibling folders and partial notes stay closed',()=>{
  const entries=[module(1,'Foundations of Ethics and Technology'),module(2,'Week 1','module:1','Engineering Ethics and Political Imagination'),file(3,'Ethics and Technology reading.pdf','module:2'),module(4,'Week 2: Ethics','module:1'),file(5,'Code of Ethics.pdf','module:4')];
  const result=searchOutline(entries,'ethics and tech');
  assert.deepEqual([...result.matches],['module:1','document:3']);
  assert.deepEqual([...result.expandedModules].sort(),['module:1','module:2']);
  assert.deepEqual([...result.deepestMatches],['document:3']);assert.equal(result.noteMatches.size,0);
});

test('completed query words match whole words while the final unfinished word supports prefixes',()=>{
  const entries=[module(1,'Readings'),file(2,'Anderson and Android.pdf','module:1'),file(3,'Anderson Android.pdf','module:1')];
  const result=searchOutline(entries,'and ande');
  assert.deepEqual([...result.matches],['document:2']);
  const document={createTextNode:text=>({textContent:text}),createElement:tag=>element(document,tag)},target=element(document,'a');
  appendHighlightedText(target,entries[1].title,result.terms,{prefixTerms:result.prefixTerms});
  assert.deepEqual(target.children.filter(c=>c.tagName==='mark').map(c=>c.textContent),['Ande','and']);
  assert.equal(searchOutline(entries,'ande ').entries.length,0);
  assert.deepEqual([...searchOutline(entries,'ande').matches],['document:2','document:3']);
});
test('a matching schedule keeps unrelated weeks as plain context without counting them as results',()=>{
  const schedule='Week 6: Computing, Data, and Algorithms II\n\nWeek 9: Medical Ethics I\n\nWeek 10: Medical Ethics II';
  const entries=[module(1,'Unit 2',null,schedule),module(6,'Week 6: Computing, Data, and Algorithms II','module:1'),module(9,'Week 9: Medical Ethics I','module:1'),module(10,'Week 10: Medical Ethics II','module:1')];
  const result=searchOutline(entries,'medical ethics II');
  assert.deepEqual(result.entries.map(e=>e.key),['module:1','module:10']);
  assert.deepEqual([...result.noteMatches],['module:1']);assert.equal(result.moduleMatches,2);
  assert.equal(result.matches.has('module:6'),false);assert.equal(result.expandedModules.has('module:6'),false);
  const document={createTextNode:text=>({textContent:text}),createElement:tag=>element(document,tag)},target=element(document,'p');
  appendHighlightedPassages(target,schedule,result.terms,{prefixTerms:result.prefixTerms});
  assert.equal(target.textContent,schedule);
  assert.deepEqual(target.children.filter(c=>c.tagName==='mark').map(c=>c.textContent),['Medical','Ethics','II']);
});

test('words from different schedule entries cannot create a false notes match or expand its module',()=>{
  const entries=[module(1,'Schedule',null,'Week 6: Computing and Algorithms II\nWeek 9: Medical Ethics I')];
  const result=searchOutline(entries,'medical ethics II');
  assert.equal(result.entries.length,0);assert.equal(result.noteMatches.size,0);assert.equal(result.expandedModules.size,0);
});

test('passage highlighting preserves newlines and unsafe text while requiring all terms in the same passage',()=>{
  const text='Café readings only\r\n\r\nContext only\r\nCafé context <img src=x onerror=alert(1)>';
  const document={createTextNode:text=>({textContent:text}),createElement:tag=>element(document,tag)},target=element(document,'p');
  appendHighlightedPassages(target,text,['café','con'],{prefixTerms:['con']});
  assert.equal(target.textContent,text);
  assert.deepEqual(target.children.filter(c=>c.tagName==='mark').map(c=>c.textContent),['Café','con']);
  assert.equal(target.children.some(c=>c.tagName==='img'),false);
  const plain=element(document,'p');appendHighlightedPassages(plain,text,[]);assert.equal(plain.textContent,text);assert.equal(plain.children.length,1);
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
