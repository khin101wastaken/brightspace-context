import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../extension/expand.js',import.meta.url),'utf8');

function fixture({navigate=false, stuck=false}={}) {
  const topLocation={pathname:'/d2l/le/lessons/100/units/10'};
  let clicks=0;
  const row=id=>{
    let expanded=false;
    const triangle={click(){clicks++; if(!stuck) expanded=true; if(navigate) topLocation.pathname='/d2l/le/lessons/200';}};
    return {children:[],getAttribute:n=>n==='role'?'treeitem':n==='aria-expanded'?String(expanded):null,querySelector:selector=>selector==='.module-triangle'?triangle:{id:`lessons-title-${id}`}};
  };
  const rows=[row('10'),row('20')];
  const document={get children(){return rows;}};
  let time=0;
  const context={document,location:{pathname:'/d2l/ui/apps/smart-curriculum/3/index.html'},window:{top:{location:topLocation}},Date:{now:()=>time},setTimeout:fn=>{time+=200;fn();}};
  return {run:()=>vm.runInNewContext(source,context),clicks:()=>clicks};
}
test('automatically expands collapsed modules once and waits for stable outline',async()=>{
  const f=fixture(),result=await f.run();
  assert.equal(f.clicks(),2); assert.equal(result.remaining,0); assert.equal(result.timedOut,false);
});
test('failed expansion remains partial without repeatedly toggling a module',async()=>{
  const f=fixture({stuck:true}),result=await f.run();
  assert.equal(f.clicks(),2); assert.equal(result.remaining,2);
});
test('changing source course during expansion aborts the scan',async()=>{
  await assert.rejects(fixture({navigate:true}).run(),/navigation changed/i);
});
