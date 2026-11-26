'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{environment,fixture}=require('./support/environment');
const {iterationTranslationBounds:bounds}=require('../../scripts/engine/iteration/period-candidate');
test('symbolic guard interval uses executed predicates, not blanket demand',()=>{
 const a={stock:{ore:2}},b={stock:{ore:3}};
 assert.deepEqual(bounds(a,b,{ore:{lower:0}},['ore']),{infinite:true,copies:0});
 assert.deepEqual(bounds(a,b,{ore:{upper:0}},['ore']),{infinite:false,copies:0});
 assert.deepEqual(bounds({stock:{ore:10}},{stock:{ore:8}},{ore:{lower:5}},['ore']),{infinite:false,copies:2});
});
test('sparse calendar reduction equals exhaustive dense reference for 300 seeded calendars',()=>{
 const e=environment();let seed=94;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 for(let i=0;i<300;i++){
  const p=1+Math.floor(rand()*30),times=1+Math.floor(rand()*5),frames={};
  for(let j=0;j<p;j++)if(rand()<.25)for(let h=0;h<times;h++)frames[j+h*p]={physical:{ore:1+Math.floor(rand()*3)}};
  // Arbitrary pattern, as well as deliberately periodic patterns.
  if(i%2===0)for(let j=0;j<p;j++)for(let h=1;h<times;h++)if(frames[j])frames[j+h*p]=frames[j];
  const period=p*times,word=Array.from({length:period},(_,j)=>JSON.stringify(frames[j]||{}));let expected=period;
  for(let d=1;d<=period;d++)if(period%d===0&&word.every((w,j)=>w===word[j%d])){expected=d;break}
  e.c.input={period,frames};const r=JSON.parse(e.run('JSON.stringify(iterationReduceBoundary(input,["ore"],[]))'));
  assert.equal(r.period,expected);assert(word.every((w,j)=>w===JSON.stringify(r.frames[j%r.period]||{})));
 }
 e.c.input={period:1000000000,frames:{7:{physical:{ore:1}},500000007:{physical:{ore:1}}}};
 assert.equal(e.run('iterationReduceBoundary(input,["ore"],[]).period'),500000000);
});
test('causal SCC preserves shared stock competition but identifies one-way frozen supplier',()=>{
 const e=environment();e.c.f=[{id:'source',rates:{'合金板':'1'}},{id:'a',rates:{'合金板':'-1','硅晶圆':'1'}},{id:'b',rates:{'合金板':'-1','能量电池':'1'}}];
 const r=JSON.parse(e.run('state={machines:[],routes:[],frozenFactories:normalizeFrozenFactories(f)};JSON.stringify(iterationCausalScc(factoryCompileSymbolicSpec(),A))'));
 const source=r.components.findIndex(x=>x.includes('f:source')),both=r.components.findIndex(x=>x.includes('f:a'));
 assert.notEqual(source,both);assert(r.components[both].includes('f:b'));assert(r.edges[source].includes(both));assert(r.order.indexOf(source)<r.order.indexOf(both));
});
test('max-plus exact cycle mean and fixed-mode expansion, invalid graph rejected',()=>{
 const e=environment();assert.equal(e.run('iterationMaxPlusCycleMean(2,[{from:0,to:1,weight:"3/2"},{from:1,to:0,weight:"5/2"},{from:0,to:0,weight:"1"}],A)'),'2');
 assert.equal(e.run('(()=>{const g=iterationFixedSwitchGraph(1,[[{from:0,to:0,weight:2}],[{from:0,to:0,weight:7}]]);return iterationMaxPlusCycleMean(g.n,g.arcs,A)})()'),'9/2');
 assert.throws(()=>e.run('iterationMaxPlusCycleMean(2,[{from:0,to:1,weight:1}],A)'),/strongly connected/);
});
test('period witness rejects forged rate and state; replay checks both frozen and physical cases',()=>{
 const e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt',[{id:'s',rates:{'太空垃圾':'1'}}]);
 for(const u of [false,true]){
  e.c.u=u;const r=e.run('(()=>{const s=factoryCompileSymbolicSpec(state,{unlimitedWarehouse:u}),x=iterationFindOrbit(iterationCreateKernel(s,A),{includeCertificate:true,verifyPeriod:true});if(!x.certificate)throw Error(x.status);const valid=iterationVerifyCertificate(s,A,x.certificate,x.values),badRate=iterationVerifyCertificate(s,A,x.certificate,{...x.values,"inflow:forged":"1"}),badState=iterationVerifyCertificate(s,A,{...x.certificate,end:{...x.certificate.end,control:"[]"}},x.values);return [valid,badRate,badState]})()');
  assert.deepEqual(Array.from(r),[true,false,false]);
 }
});

test('frozen service guard preserves limiting inventory and reservation predicates',()=>{
 const e=environment();
 const x=JSON.parse(e.run('(()=>{const s={machines:[],routes:[],priority:[],frozen:[{id:"f",rates:{ore:"30",plate:"10"}}],unlimitedWarehouse:false};s.frozen[0].rates.ore="-30";const k=iterationCreateKernel(s,A,{initialStock:{ore:1},captureGuards:true});k.step();return JSON.stringify({g:k.guardBounds(),x:k.snapshot()})})()'));
 assert.deepEqual(x.g.ore,{lower:0,upper:0});assert.equal(x.x.stock.ore,0);assert.equal(x.x.service.f,'1/30');
});
test('max-plus Karp primitive agrees with exhaustive simple cycles on 80 seeded graphs',()=>{
 const e=environment();let seed=32;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 for(let i=0;i<80;i++){
  const n=2+Math.floor(rnd()*5),arcs=[];
  for(let u=0;u<n;u++)for(let v=0;v<n;v++)if(v===(u+1)%n||rnd()<.35)arcs.push({from:u,to:v,weight:Math.floor(rnd()*20)});
  let best=-Infinity;
  for(let s=0;s<n;s++){
   const walk=(u,seen,sum,len)=>{for(const a of arcs)if(a.from===u){if(a.to===s)best=Math.max(best,(sum+a.weight)/(len+1));else if(!seen.has(a.to))walk(a.to,new Set([...seen,a.to]),sum+a.weight,len+1)}};
   walk(s,new Set([s]),0,0);
  }
  e.c.n=n;e.c.arcs=arcs;const [num,den=1]=e.run('iterationMaxPlusCycleMean(n,arcs,A)').split('/').map(Number);
  assert(Math.abs(num/den-best)<1e-12);
 }
});

test('rational frozen phases lie on a finite common-service lattice',()=>{
 const e=environment();
 assert.equal(e.run('iterationFrozenPhaseBound({ore:"-30",plate:"10"},A)'),'60');
 assert.equal(e.run('iterationFrozenPhaseBound({ore:"-2/7",plate:"3/11"},A)'),'4620');
 assert.equal(e.run('iterationFrozenPhaseBound({},A)'),'1');
});
