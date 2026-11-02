import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const scanner = readFileSync(new URL('../extension/inspect.js', import.meta.url), 'utf8');

// Minimal DOM fixture for the observed Lessons markup: a module header and its
// role=group are siblings inside .unit; neither row has aria-level.
function element(attrs = {}, children = [], text = '') {
  const node = {
    children, id: attrs.id || '', innerText: text, textContent: text,
    getAttribute: name => attrs[name] ?? null,
    classList: {contains: name => (attrs.class || '').split(' ').includes(name)},
    matches: () => false,
    getRootNode: () => ({host:null}),
  };
  for (const child of children) child.parentElement = node;
  return node;
}
const title = (id, text) => element({id:`lessons-title-${id}`}, [element({class:'title-text'}, [], text)]);
const topic = (id, text) => element({class:'navigation-item','data-objectid':id}, [
  element({role:'treeitem','aria-labelledby':`topic-${id}-label`}, [
    element({id:`topic-${id}-label`}, [], `File ${text}`), title(id,text),
  ]),
]);
const unit = (id, text, children = [], expanded = 'true') => element({class:'unit'}, [
  element({role:'treeitem','aria-label':text,'aria-expanded':expanded}, [title(id,text)]),
  element({role:'group'},children),
]);
function scan(children) {
  const document = element({}, children);
  document.title = 'Fixture';
  return vm.runInNewContext(scanner,{document,location:{href:'https://brightspace.nyu.edu/d2l/ui/apps/smart-curriculum/index.html'}});
}
test('Lessons sibling groups resolve modules and document parents without aria-level',()=>{
  const result=scan([unit('10','Week 1',[topic('11','Lecture')]),unit('20','Week 2',[topic('21','Lecture')]),unit('30','Week 3',[],'false')]);
  const entries = result.entries;
  assert.equal(entries.length,5);
  assert.equal(entries[0].key,'module:10');
  assert.equal(entries[1].parentKey,'module:10');
  assert.equal(entries[3].parentKey,'module:20');
  assert.equal(entries[1].title,'Lecture');
  assert.equal(entries[4].key,'module:30');
  assert.equal(result.collapsed,1);
});
test('nested module wrappers use nearest owner and do not steal child topic IDs',()=>{
  const entries=scan([unit('10','Parent',[unit('20','Nested',[topic('21','Reading')]),topic('11','Overview')])]).entries;
  assert.equal(entries[0].key,'module:10');
  assert.equal(entries[1].key,'module:20');
  assert.equal(entries[1].parentKey,'module:10');
  assert.equal(entries[2].parentKey,'module:20');
  assert.equal(entries[3].parentKey,'module:10');
});
