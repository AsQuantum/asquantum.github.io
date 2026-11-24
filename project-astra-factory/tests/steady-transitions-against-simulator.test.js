'use strict';
const test=require('node:test');
const fs=require('fs'),vm=require('vm');
test('full AST1 fixed-tick queue transitions match the physical simulator at each step',()=>{
const c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return {getContext(){return {}},classList:{add(){},remove(){}},style:{}};}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state',
 'core/machines','core/routing','core/audit','engine/steady-flow','engine/steady-transitions',
 'engine/simulation','core/compact-json','blueprints/ast1-codec']){
 vm.runInContext(fs.readFileSync('scripts/'+f+'.js','utf8'),c,{filename:f+'.js'});
}
vm.runInContext('function warehouseRefresh(){} function draw(){} function stockChartReset(){} function recordWarehouseMovement(){}',c);
c.code=fs.readFileSync('tests/fixtures/ast1-warehouse-port-balance-v1.txt','utf8').trim();
const m=vm.runInContext('state=ast1Decode(code);resetSimulation();steadyQueueCompile(state)',c);
c.m=m;
const s=vm.runInContext('steadyQueueInitial(m)',c);c.s=s;
function std(q){return Object.fromEntries(Object.entries(q).filter(([_,v])=>v!==0&&v!==0n).map(([k,v])=>[k,String(v)]));}
function compare(step){
 const result=vm.runInContext('({sim,ware})',c);
 const errs=[];
 for(const col of ['crafts','inbound','outbound']){
  const a=std(result.sim[col]),b=std(s.counters[col==='inbound'?'warehouseIn':col==='outbound'?'warehouseOut':'crafts']);
  if(JSON.stringify(a)!==JSON.stringify(b))errs.push({kind:col,sim:a,exact:b});
 }
 for(const r of m.routes){
  const a=result.sim.routes[r.id],b=s.routes[r.id];
  if(a.length!==b.length||a.some((p,i)=>p.item!==b[i]?.item||Math.abs(p.distance-b[i]?.distance/10)>1e-4)){
   errs.push({kind:'route',id:r.id,sim:a.slice(0,5),exact:b.slice(0,5)});
   if(errs.length>10)break;
  }
 }
 for(const mm of m.machines){
  const a=result.sim.byMachine[mm.id],b=s.machines[mm.id];
  if(mm.kind==='recipe'){
   if(JSON.stringify(a.queue)!==JSON.stringify(b.output))errs.push({kind:'recipe-output',id:mm.id,sim:a.queue,exact:b.output});
   for(const req of mm.recipe.ingredients)if((a.inputs[req.item]||0)!==b.inputs[req.item].length)
    errs.push({kind:'recipe-input',id:mm.id,item:req.item,sim:a.inputs[req.item]||0,exact:b.inputs[req.item].length});
  }else if(mm.kind==='merger'&&a.mergerQueue.length!==b.merger.length)errs.push({kind:'merger',id:mm.id,sim:a.mergerQueue.length,exact:b.merger.length});
  else if(mm.kind==='stock-out'&&a.warehouseQueue.length!==b.reserved.length)errs.push({kind:'warehouse-out',id:mm.id,sim:a.warehouseQueue.length,exact:b.reserved.length});
  else if(mm.kind==='splitter'){
   const p=a.portQueues?.[0]||[];
   if(JSON.stringify(p)!==JSON.stringify(b.splitter))errs.push({kind:'splitter',id:mm.id,sim:p,exact:b.splitter});
  }
  if(errs.length>16)break;
 }
 const items=new Set([...Object.keys(result.ware),...Object.keys(s.stock)]);
 for(const item of items){
  const n=BigInt(result.ware[item]||0),b=vm.runInContext('steadyQueueStockTotal(m,s,item)',Object.assign(c,{item}));
  if(n!==b)errs.push({kind:'stock',item,sim:String(n),exact:String(b)});
 }
 return errs;
}
for(let i=1;i<=3000;i++){
 vm.runInContext('simulate(.05)',c);
 vm.runInContext('steadyQueueStep(m,s)',c);
 const errors=compare(i);
 if(errors.length){console.log('FIRST DIFF at tick '+i+' time '+(i/20)+'\n'+JSON.stringify(errors,null,2).slice(0,13000));throw new Error('AST1 exact state mismatch at tick '+i);}
}
console.log('MATCH AST1 physical simulator exactly across 3000 ticks (150s): all active inventory, route contents/positions, machine FIFOs and item crafts');

});
