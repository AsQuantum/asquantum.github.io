'use strict';
// Diagnostic only. Uses the current physical simulator; rounded floating-point
// state is a candidate, never an exact periodicity certificate.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const el={getContext(){return{}},classList:{add(){},remove(){}}};
// Run identical simulator source in a native function scope, avoiding
// per-access VM context proxy overhead. This remains an independent
// physical-simulator diagnostic, not the production iteration kernel.
const files=['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/math/arithmetic/rational','engine/iteration/period-candidate','engine/simulation'];
const body=files.map(f=>fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8')).join('\n;\n');
const ast=fs.readFileSync(path.resolve(root,process.argv[2]||'tests/fixtures/ast1-warehouse-slow-miner-v1.txt'),'utf8').trim();
const maxTicks=Number(process.argv[3]||216000),unlimited=process.argv.includes('--unlimited');
function probe(){
 state=ast1Decode(ast);resetSimulation();
 if(activeFrozenFactories(state).length)throw Error('enabled frozen factories not supported');
 const gates={};for(const m of state.machines)if(m.type==='仓出'&&m.item)gates[m.item]=(gates[m.item]||0)+1;
 const lastLow={},seen=new Map(),keys=Object.keys(gates),dt=.05;
 let tick=0;
 const step=simulate,fill=warehouseFillOutputQueue;
 if(unlimited)warehouseFillOutputQueue=(m,s)=>{
  const q=s.warehouseQueue,k=m.item;if(!k||q.length>=3||simTime-s.lastWarehouseFill<PORT_INTERVAL-1e-6)return false;
  q.push(k);s.lastWarehouseFill=simTime;ware[k]=(ware[k]||0)-1;sim.outbound[k]=(sim.outbound[k]||0)+1;return true;
 };
 simulate=d=>{tick++;if(!unlimited)for(const k of keys)if((ware[k]||0)<gates[k])lastLow[k]=tick;step(d)};
 const Q=x=>Math.round(x*20),C=t=>Math.min(20,Math.max(0,Q(simTime-(t??-1e6))));
 const key=()=>JSON.stringify([state.machines.map(m=>{const s=sim.byMachine[m.id];return [s.inputs,s.portInputs,s.portItems,s.queue,s.ingredientQueues,s.mergerQueue,s.warehouseQueue,s.consumerQueue,Q(s.consumerElapsed),Q(s.busy),Q(s.tick),s.roundRobin,C(s.lastWarehouseFill),Object.entries(s.lastSend).map(([k,v])=>[k,C(v)]),Object.entries(s.lastReceive).map(([k,v])=>[k,C(v)]),s.portQueues]}),state.routes.map(r=>sim.routes[r.id].map(x=>[x.item,Math.round(x.distance*10)])),unlimited?[]:keys.map(k=>(ware[k]||0)<gates[k]?(ware[k]||0):'high')]);
 const stock=()=>Object.fromEntries(keys.map(k=>[k,ware[k]||0]));
 const counts=()=>JSON.parse(JSON.stringify({inflow:sim.inbound,outflow:sim.outbound,crafts:sim.crafts}));
 const started=performance.now();
 try{for(let i=0;i<=maxTicks;i+=20){
  if(i)simulateBatchSteps(20,dt);
  const k=key(),w=stock(),old=seen.get(k);
  if(old&&iterationCheckStockCandidate(old,{tick,stock:w},lastLow,keys,{unlimited}).accepted){
   const period=tick-old.tick;if(period>0){
    const now=counts(),diff=(a,b)=>Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(k=>[k,(a[k]||0)-(b[k]||0)]));
    return {status:'candidate-period',certified:false,method:'quantized-current-simulator-diagnostic',mode:unlimited?'unlimited':'actual',prefixTicks:old.tick,periodTicks:period,seconds:period/20,stockDrift:diff(w,old.stock),inflow:diff(now.inflow,old.counts.inflow),outflow:diff(now.outflow,old.counts.outflow),crafts:diff(now.crafts,old.counts.crafts),elapsedMs:Math.round(performance.now()-started),checkpoints:seen.size};
   }
  }
  seen.set(k,{tick,stock:w,counts:counts()});
  if(performance.now()-started>18000)return {status:'budget',tick,checkpoints:seen.size,elapsedMs:Math.round(performance.now()-started)};
 }return {status:'no-candidate',tick,checkpoints:seen.size,elapsedMs:Math.round(performance.now()-started)};
 }finally{simulate=step;warehouseFillOutputQueue=fill;}
}
const run=new Function('document','requestAnimationFrame','ast','maxTicks','unlimited','module',body+'\nfunction stockChartReset(){} function warehouseRefresh(){} function draw(){} function recordWarehouseMovement(){}\nreturn ('+probe.toString()+')();');
console.log(JSON.stringify(run({getElementById(){return el}},()=>{},ast,maxTicks,unlimited,undefined)));
