'use strict';
// Diagnostics/validation only. The production proof engine does not read
// these fixtures or the simulator's output.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict'),root=path.resolve(__dirname,'../..');
const el={getContext(){return{}},classList:{add(){},remove(){}}};
const c=vm.createContext({console,performance,atob,btoa,document:{getElementById(){return el}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-generic-network','engine/steady-direct-algebra','engine/steady-certified-proofs','engine/simulation'])
 vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
vm.runInContext('function stockChartReset(){} function warehouseRefresh(){} function draw(){} function recordWarehouseMovement(){}',c);
const results=[];
for(const fixture of ['tests/fixtures/ast1-warehouse-port-balance-v1.txt','research/long-run-rates/user-new-layout.ast1.txt']){
 c.ast=fs.readFileSync(path.join(root,fixture),'utf8').trim();
 const result=JSON.parse(vm.runInContext(`(()=>{
  state=ast1Decode(ast);const p=factoryCertifiedResearchPreview({ms:5000});
  resetSimulation();simulateBatchSteps(12000,.05);
  const before=JSON.parse(JSON.stringify(sim));simulateBatchSteps(12000,.05);
  const checks=[];
  for(const [k,v] of Object.entries(p.rows))for(const [field,counter] of [['inflow','inbound'],['outflow','outbound']]){
   if(v[field]==null)continue;
   const [n,d=1]=v[field].split('/').map(Number),predicted=600*n/d;
   const observed=(sim[counter][k]||0)-(before[counter][k]||0);
   checks.push({item:k,field,predicted,observed});
  }
  for(const [key,rate] of Object.entries(p.values)){
   if(!key.startsWith('machineTotal:')||!key.endsWith('|out')||rate==null)continue;
   const id=key.slice(13,-4),m=machineById(id);if(!getRecipe(m))continue;
   const [n,d=1]=rate.split('/').map(Number),predicted=600*n/d;
   const s=sim.byMachine[id],b=before.byMachine[id],sum=x=>Object.values(x).reduce((a,b)=>a+b,0);
   const observed=sum(s.sent)-sum(b.sent);checks.push({machine:id,predicted,observed});
  }
  return JSON.stringify({machines:state.machines.length,queries:p.actual.researchQueries,unknownMetrics:p.unknownMetrics.length,elapsedMs:p.elapsedMs,factors:p.actual.rounds.map(x=>x.factors),checks});
 })()`,c));
 for(const x of result.checks)assert(Math.abs(x.predicted-x.observed)<=3,JSON.stringify(x));
 results.push(result);
}
fs.writeFileSync(path.join(__dirname,'ast-focused-results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({...r,checks:r.checks.length,maxError:Math.max(0,...r.checks.map(x=>Math.abs(x.predicted-x.observed)))}))));
