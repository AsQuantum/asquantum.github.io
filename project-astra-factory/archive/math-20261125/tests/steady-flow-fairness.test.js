'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'..','scripts/engine/steady-flow.js'),'utf8');
function ctx(){const c=vm.createContext({console});vm.runInContext(code,c);return c;}
function fair(c,supply,caps){c.input={supply,caps};return vm.runInContext('steadyExactWaterfill(steadyExactQ(input.supply),input.caps.map(steadyExactQ)).map(steadyExactText)',c);}
test('strict rational max-min allocation with unequal demand caps',()=>{
 const c=ctx();assert.deepEqual([...fair(c,1,[1,1,.2])],['2/5','2/5','1/5']);
 assert.deepEqual([...fair(c,1,[1,.05])],['19/20','1/20']);
});
test('for each exact cap combination: conservation, saturation, and unsaturated equality',()=>{
 const c=ctx();
 for(const n of [2,3,4])for(let a=0;a<=5;a++)for(let b=0;b<=5;b++){
  const caps=Array.from({length:n},(_,i)=>i%2===0?a/10:b/10);
  c.d={supply:.7,caps};
  const verified=vm.runInContext(`(()=>{const q=steadyExactQ,caps=d.caps.map(q),r=steadyExactWaterfill(q(d.supply),caps);
    const total=steadyExactSum(r),max=steadyExactMin(q(d.supply),steadyExactSum(caps));
    const free=r.filter((x,i)=>steadyExactCmp(x,caps[i])<0);
    return {mass:steadyExactCmp(total,max)===0,bound:r.every((x,i)=>steadyExactCmp(x,caps[i])<=0),
       fair:free.every(x=>steadyExactCmp(x,free[0])===0)};})()`,c);
  assert.equal(verified.mass,true);assert.equal(verified.bound,true);assert.equal(verified.fair,true);
 }
});
