import test from 'node:test';
import assert from 'node:assert/strict';
import {reveal,animateDisclosure} from '../extension/ui-motion.js';

function element({reduced=false,hidden=false}={}) {
  const animations=[],attributes={};
  const target={hidden,isConnected:true,inert:false,dataset:{},style:{},children:[],parentElement:null,
    setAttribute:(key,value)=>attributes[key]=value,removeAttribute:key=>delete attributes[key],
    ownerDocument:{defaultView:{matchMedia:()=>({matches:reduced}),getComputedStyle:()=>({opacity:'.5',transform:'none',paddingBottom:'0',borderBottomWidth:'0'})}},
    animate(frames,options){
      let resolve,reject;const animation={frames,options,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),complete:()=>resolve(),cancel:()=>reject(new Error('Canceled'))};
      animations.push(animation);return animation;
    }};
  return {target,animations,attributes};
}

test('menu exit removes access immediately and cannot hide a rapidly reopened menu',async()=>{
  const {target,animations,attributes}=element();
  reveal(target,false);assert.equal(target.inert,true);assert.equal(attributes['aria-hidden'],'true');assert.equal(target.hidden,false);
  reveal(target,true);assert.equal(target.inert,false);assert.equal(attributes['aria-hidden'],'false');
  animations[0].complete();await Promise.resolve();assert.equal(target.hidden,false);
  animations[1].complete();await Promise.resolve();assert.equal(target.hidden,false);
  reveal(target,false);animations[2].complete();await Promise.resolve();assert.equal(target.hidden,true);
});

test('reduced motion and immediate menu refresh skip animations',()=>{
  const reduced=element({reduced:true,hidden:true});reveal(reduced.target,true);reveal(reduced.target,false);
  assert.equal(reduced.animations.length,0);assert.equal(reduced.target.hidden,true);
  const normal=element();reveal(normal.target,false,{immediate:true});assert.equal(normal.animations.length,0);assert.equal(normal.target.hidden,true);
});

test('extension On overrides reduced motion and Off disables motion on any system',()=>{
  const enabled=element({reduced:true,hidden:true});
  enabled.target.ownerDocument.documentElement={dataset:{motion:'on'}};
  reveal(enabled.target,true);assert.equal(enabled.animations.length,1);
  const disabled=element();disabled.target.ownerDocument.documentElement={dataset:{motion:'off'}};
  reveal(disabled.target,false);assert.equal(disabled.animations.length,0);assert.equal(disabled.target.hidden,true);
});

function disclosure(reduced=false) {
  const env=element({reduced}),summary=new EventTarget(),body={inert:false,contains:()=>false};
  Object.assign(summary,{setAttribute:env.target.setAttribute,removeAttribute:env.target.removeAttribute,getBoundingClientRect:()=>({bottom:40})});
  Object.assign(env.target,{open:false,children:[summary,body],querySelector:()=>summary,getBoundingClientRect:()=>({top:0,height:env.target.open?240:40})});
  animateDisclosure(env.target);
  const click=()=>{const event=new Event('click',{cancelable:true});Object.defineProperty(event,'target',{value:{closest:()=>null}});summary.dispatchEvent(event);};
  return {...env,body,click};
}

test('disclosure reversals preserve final open state and restore content access',async()=>{
  const env=disclosure();env.click();assert.equal(env.target.open,true);
  env.click();assert.equal(env.body.inert,true);assert.equal(env.target.open,true);
  env.animations[0].complete();await Promise.resolve();assert.equal(env.target.open,true);
  env.animations[1].complete();await Promise.resolve();assert.equal(env.target.open,false);assert.equal(env.body.inert,false);assert.equal(env.target.style.overflow,'');
  env.click();env.animations[2].complete();await Promise.resolve();assert.equal(env.target.open,true);
});

test('reduced-motion disclosures change state immediately',()=>{
  const env=disclosure(true);env.click();assert.equal(env.target.open,true);env.click();assert.equal(env.target.open,false);
  assert.equal(env.animations.length,0);assert.equal(env.body.inert,false);
});
