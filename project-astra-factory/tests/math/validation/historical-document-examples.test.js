'use strict';
// Historical examples are inputs only. No archived solver or archived
// numerical result is imported. The actual browser Worker proves rates;
// the separate simulator is used solely as a regression oracle.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),worker=path.join(root,'scripts/engine/steady-certified-worker.js');
const fixtures=require('../../fixtures/math/historical-layouts.json');
const c=vm.createContext({console,performance,URL,atob,btoa,structuredClone,requestAnimationFrame(){}});
let posted;c.self=c;c.location={href:'https://example.invalid/steady-certified-worker.js?v=test'};
c.postMessage=x=>posted=x;
c.importScripts=(...urls)=>{for(const url of urls){const f=path.resolve(path.dirname(worker),url.split('?')[0]);vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});}};
vm.runInContext(fs.readFileSync(worker,'utf8'),c,{filename:worker});
const sim=vm.createContext({console,performance,atob,btoa,document:{getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),sim,{filename:f});
vm.runInContext('function stockChartReset(){} function warehouseRefresh(){} function draw(){} function recordWarehouseMovement(){}',sim);
const expectedPath=path.join(root,'tests/fixtures/math/historical-layout-coverage.json');
const expected=process.argv.includes('--record')?null:JSON.parse(fs.readFileSync(expectedPath,'utf8'));
const rows=[],failures=[];
for(const item of fixtures){
 posted=null;c.onmessage({data:{layout:structuredClone(item.layout),budgetMs:5000}});
 assert(posted&&!posted.error,item.id+': '+posted?.error);
 const p=posted.result;
 assert(!['unsupported','contradiction'].includes(p.actual.status),item.id+': '+JSON.stringify(p.actual.reason));
 const row={id:item.id,actual:p.actual.researchQueries,overdraft:p.unlimited.researchQueries,unknownMetrics:p.unknownMetrics,origins:item.origins};
 const values=p.values;
 // Validate all proved physical outgoing counts and actual warehouse
 // receipts/withdrawals. The finite window is not a mathematical proof.
 sim.input=structuredClone(item.layout);sim.proved=JSON.parse(JSON.stringify(values));
 const result=JSON.parse(vm.runInContext(`(()=>{
  state=input;resetSimulation();simulateBatchSteps(24000,.05);
  const b=JSON.parse(JSON.stringify(sim)),send=sendItem,routeCounts={},map=new Map(state.routes.filter(r=>r.to).map(r=>[r.from.id+'|'+r.from.port,r.id]));
  sendItem=(m,st,p,k)=>{const ok=send(m,st,p,k),id=map.get(m.id+'|'+p);if(ok&&id){routeCounts['routeTotal:'+id]=(routeCounts['routeTotal:'+id]||0)+1;routeCounts['flow:'+id+'|'+k]=(routeCounts['flow:'+id+'|'+k]||0)+1;}return ok;};
  try{simulateBatchSteps(12000,.05);}finally{sendItem=send;}
  const checks=[],sum=x=>Object.values(x||{}).reduce((a,b)=>a+b,0);
  for(const [key,rate] of Object.entries(proved)){
   if(rate==null||typeof rate!=='string')continue;let observed;
   if(key.startsWith('inflow:')||key.startsWith('outflow:')){
    const [field,k]=[key.slice(0,key.indexOf(':')),key.slice(key.indexOf(':')+1)],counter=field==='inflow'?'inbound':'outbound';
    observed=(sim[counter][k]||0)-(b[counter][k]||0);
   }else if(key.startsWith('routeTotal:')||key.startsWith('flow:')){
    observed=routeCounts[key]||0;
   }else if(key.startsWith('machineTotal:')&&key.endsWith('|out')){
    const id=key.slice(13,-4);if(!sim.byMachine[id]||!b.byMachine[id])continue;
    observed=sum(sim.byMachine[id].sent)-sum(b.byMachine[id].sent);
   }else continue;
   const [n,d=1]=rate.split('/').map(Number);checks.push({key,predicted:600*n/d,observed});
  }
  return JSON.stringify({checks:checks.length,bad:checks.filter(x=>Math.abs(x.predicted-x.observed)>3),maxError:Math.max(0,...checks.map(x=>Math.abs(x.predicted-x.observed)))});
 })()`,sim));
 row.validation=result;
 if(expected){const e=expected.find(x=>x.id===item.id);assert(e,item.id+' missing expected case');
  if(p.actual.researchQueries.known<e.actual.known||p.unlimited.researchQueries.known<e.overdraft.known||p.unknownMetrics.length>e.unknownMetrics.length)failures.push({id:item.id,reason:'proof coverage regressed'});
 }
 if(result.bad.length)failures.push({id:item.id,reason:'finite-window parity mismatch',bad:result.bad});
 rows.push(row);
}
if(process.argv.includes('--record')&&!failures.length)fs.writeFileSync(expectedPath,JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,complete:rows.filter(x=>x.actual.unknown===0&&x.overdraft.unknown===0&&!x.unknownMetrics.length).length,warehouseComplete:rows.filter(x=>!x.unknownMetrics.length).length,checks:rows.reduce((s,x)=>s+x.validation.checks,0),failures,rows:rows.map(x=>({id:x.id,actual:x.actual,overdraft:x.overdraft,metrics:x.unknownMetrics.length,error:x.validation.maxError}))}));
assert.equal(failures.length,0,JSON.stringify(failures));
