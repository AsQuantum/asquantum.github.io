'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{environment}=require('./support/environment');
const historical=require('../fixtures/math/historical-layouts.json');
const direct=require('../math/support/production');
test('all 50 historical layouts: complete independent result and old proved value parity',()=>{
 const e=environment();let checks=0,maxMs=0;
 for(const it of historical){
  e.c.layout=structuredClone(it.layout);direct.ctx.layout=structuredClone(it.layout);
  const x=e.run('state=layout;iterationResearchPreview(state,A,{ms:5000})'),y=direct.run('state=layout;factoryCertifiedResearchPreview({ms:5000})');
  assert.equal(x.status,'experimental-complete',it.id+': '+JSON.stringify(x.unknownMetrics));maxMs=Math.max(maxMs,x.elapsedMs);
  for(const [mode,old,n] of [['actual',y.actual.values,x.values],['unlimited',y.unlimited.values,x.unlimitedValues]])
   for(const [k,v] of Object.entries(old)){
    if(v==null||!/^(flow:|routeTotal:|cycle:|inflow:|outflow:|machineTotal:|machineMaterial:|duty:)/.test(k))continue;
    checks++;assert.equal(n[k]??'0',v,it.id+' '+mode+' '+k);
   }
  for(const [k,row] of Object.entries(y.rows))for(const f of ['inflow','outflow','net','potential','overdraft','localPotential'])if(row[f]!=null){checks++;assert.equal(x.rows[k]?.[f],row[f],it.id+' '+k+' '+f)}
 }
 console.log('HISTORICAL_ITERATION',JSON.stringify({layouts:historical.length,complete:historical.length,checks,maxMs}));
});
test('seeded mutations of legal historical layouts preserve event-driven state and counts',()=>{
 const e=environment();let seed=16393;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 let checked=0;
 for(let i=0;i<24;i++){
  const l=structuredClone(historical[Math.floor(random()*historical.length)].layout);
  l.routes=l.routes.filter(()=>random()>.25);
  l.frozenFactories=(l.frozenFactories||[]).map(f=>({...f,enabled:random()>.2}));
  e.c.layout=l;
  const n=e.run('(()=>{state=layout;if(state.routes.some(r=>checkPath(r.path,r.from,r.to,r.id)))throw Error("mutated geometry invalid");const s=factoryCompileSymbolicSpec();let tested=0;for(const mode of [false,true]){const a=iterationCreateKernel({...s,unlimitedWarehouse:mode},A),b=iterationCreateKernel({...s,unlimitedWarehouse:mode},A);for(let i=0;i<30;i++){const n=1+(i*13)%43;for(let j=0;j<n;j++)a.step();for(let j=0;j<n;)j+=b.advance(n-j);if(JSON.stringify(a.snapshot())!==JSON.stringify(b.snapshot())||JSON.stringify(a.takeMin())!==JSON.stringify(b.takeMin())||JSON.stringify(a.lastLow)!==JSON.stringify(b.lastLow))throw Error("mutation mismatch "+i);tested++}}return tested})()');
  checked+=n;
 }
 console.log('SEEDED_MUTATIONS',JSON.stringify({layouts:24,checkpoints:checked}));
});
