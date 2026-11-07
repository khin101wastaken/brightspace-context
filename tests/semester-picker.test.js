import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceSemesterPicker} from '../extension/semester-picker.js';

class Element extends EventTarget {
  constructor(){super();this.children=[];this.dataset={};this.attributes={};this.style={};this.hidden=false;}
  append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
  replaceChildren(){this.children=[];}
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return this.attributes[key] ?? null;}
  removeAttribute(key){delete this.attributes[key];}
  contains(item){return item===this || this.children.some(child=>child.contains(item));}
  scrollIntoView(){}
  getBoundingClientRect(){return {top:100,bottom:145};}
}
function environment(values=[['fall','2026 Fall'],['spring','2026 Spring'],['older','2025 Fall']]) {
  const doc=new Element(),root=new Element(),select=new Element(),label=new Element(),svg=new Element();
  doc.documentElement={clientHeight:800};doc.createElement=()=>new Element();doc.querySelector=()=>label;
  root.querySelector=()=>svg;root.append(select,svg);select.ownerDocument=doc;
  select.options=values.map(([value,textContent])=>({value,textContent}));select.value=values[0]?.[0] || '';
  Object.defineProperty(select,'selectedIndex',{get:()=>select.options.findIndex(option=>option.value===select.value)});
  for(const option of select.options)Object.defineProperty(option,'selected',{get:()=>option.value===select.value});
  let changes=0;select.addEventListener('change',()=>changes++);
  const picker=enhanceSemesterPicker(select),button=root.children.find(child=>child.id==='semester-picker-button'),list=root.children.find(child=>child.id==='semester-options');
  const key=value=>{const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value});button.dispatchEvent(event);};
  return {doc,root,select,button,list,picker,key,changes:()=>changes,click:()=>button.dispatchEvent(new Event('click'))};
}

test('semester keyboard browsing commits only on selection; Escape cancels',()=>{
  const env=environment();env.key('ArrowDown');env.key('ArrowDown');
  assert.equal(env.button.attributes['aria-activedescendant'],'semester-option-1');
  assert.equal(env.select.value,'fall');assert.equal(env.changes(),0);
  env.key('Escape');assert.equal(env.list.hidden,true);assert.equal(env.select.value,'fall');
  env.key(' ');env.key('End');env.key('Enter');
  assert.equal(env.select.value,'older');assert.equal(env.changes(),1);assert.equal(env.list.hidden,true);
  assert.equal(env.list.children[2].attributes['aria-selected'],'true');
});

test('semester type-ahead, repeated characters, and Tab select the active option',()=>{
  const env=environment();env.key('2');
  assert.equal(env.button.attributes['aria-activedescendant'],'semester-option-1');
  env.key('2');assert.equal(env.button.attributes['aria-activedescendant'],'semester-option-2');
  env.key('Tab');assert.equal(env.select.value,'older');assert.equal(env.list.hidden,true);
  env.key('Home');env.key('Enter');assert.equal(env.select.value,'fall');
});

test('semester selection refresh and outside dismissal discard pending navigation',()=>{
  const env=environment();env.click();env.key('End');
  env.doc.dispatchEvent(new Event('pointerdown'));assert.equal(env.list.hidden,true);assert.equal(env.changes(),0);
  env.click();env.select.value='spring';env.picker.refresh();
  assert.equal(env.list.hidden,true);assert.equal(env.button.children[0].textContent,'2026 Spring');
  assert.equal(env.list.children[1].attributes['aria-selected'],'true');
  env.click();env.key('Enter');assert.equal(env.changes(),0);
});

test('semester menu disables a loading placeholder and positions above a low control',()=>{
  const empty=environment([['','Loading semesters…']]);empty.click();assert.equal(empty.list.hidden,true);
  const env=environment();env.button.getBoundingClientRect=()=>({top:650,bottom:695});env.click();
  assert.equal(env.list.dataset.above,'true');assert.equal(env.list.style.maxHeight,'320px');
});
