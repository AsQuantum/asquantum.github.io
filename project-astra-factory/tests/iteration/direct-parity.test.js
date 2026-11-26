'use strict';
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const {environment,fixture,root}=require('./support/environment');
const direct=require('../math/support/production');
for(const name of ['ast1-warehouse-port-balance-v1.txt','ast1-warehouse-slow-miner-v1.txt']){
 test('exact-model period and independently proven direct count rates: '+name,()=>{
  const env=environment();fixture(env,name);
  direct.ctx.ast=fs.readFileSync(path.join(root,'tests/fixtures',name),'utf8').trim();
  const d=direct.run('state=ast1Decode(ast);factoryCertifiedResearchPreview({ms:12000})');
  for(const unlimited of [false,true]){
   env.c.unlimited=unlimited;
   const x=env.run('iterationSolveComponents(factoryCompileSymbolicSpec(state,{unlimitedWarehouse:unlimited}),A,{maxTicks:216000,ms:40000})');
   assert.equal(x.status,'exact-model-components',JSON.stringify(x));assert.equal(x.certified,false);
   let compared=0;
   for(const [k,v] of Object.entries((unlimited?d.unlimited:d.actual).values)){
    if(v==null||!/^(flow:|routeTotal:|cycle:|inflow:|outflow:|machineTotal:|machineMaterial:)/.test(k))continue;
    assert.equal(x.values[k]??'0',v,k);compared++;
   }
   assert(compared>100);
   console.log('EXACT-MODEL ONLY',JSON.stringify({name,unlimited,compared,componentCount:x.componentCount,maxPeriodTicks:Math.max(0,...x.components.map(c=>c.periodTicks||0)),elapsedMs:x.elapsedMs}));
  }
 });
}
