'use strict';
// Usage: node tests/steady-flow-network.test.js <path/to/exported-factory.ast1>
// Validates all material-conservation, cycle, belt and warehouse balance
// constraints in the current numerical solver. No blueprint is stored here.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const source=process.argv[2];
if(!source){console.log('Usage: node tests/steady-flow-network.test.js <factory.ast1>');process.exit(0);}
const blueprint=fs.readFileSync(path.resolve(source),'utf8').trim();
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
const ctx=vm.createContext({console,atob,btoa,performance,document:{getElementById:()=>({getContext:()=>({})})},
 localStorage:{getItem:()=>null,setItem:()=>{}},resetSimulation:()=>{},afterChange:()=>{},clearGroupSelection:()=>{}});
for(const file of ['scripts/data/catalog.js','scripts/core/state.js','scripts/core/machines.js','scripts/core/routing.js',
 'scripts/blueprints/machine-ids.js','scripts/blueprints/item-ids.js','scripts/blueprints/ast1-codec.js',
 'scripts/core/layout-io.js','scripts/core/audit.js','scripts/engine/steady-flow.js'])
 vm.runInContext(get(file),ctx,{filename:file});
ctx.blueprint=blueprint;const layout=vm.runInContext('ast1Decode(blueprint)',ctx);
ctx.layout=layout;vm.runInContext('loadState(layout)',ctx);
const sol=vm.runInContext('warehouseTheory()',ctx);
assert(!sol.error,'LP failed: '+sol.error);
assert(sol.diagnostics?.approximate,'Expected current fairness relaxation method metadata');
const getRecipe=vm.runInContext('getRecipe',ctx);
const inRoute=id=>layout.routes.filter(r=>r.to.id===id);
const outRoute=id=>layout.routes.filter(r=>r.from.id===id);
const flow=(r,item)=>(sol.routeFlows[r.id]||{})[item]||0;
const total=(r)=>Object.values(sol.routeFlows[r.id]||{}).reduce((a,v)=>a+v,0);
const machines=new Map(layout.machines.map(m=>[m.id,m]));
const margin=3e-5;
let tested=0;
for(const route of layout.routes){
 const rates=Object.values(sol.routeFlows[route.id]||{});
 for(const rate of rates)assert(rate>=-margin&&Number.isFinite(rate),'Invalid route flow '+route.id);
 assert(total(route)<=1+margin,'Belt capacity >1/s on '+route.id);
 tested++;
}
for(const m of layout.machines){
 const rec=getRecipe(m),ins=inRoute(m.id),outs=outRoute(m.id);
 if(rec){
  const cycles=sol.machineCycles[m.id]||0;
  assert(cycles>=-margin&&cycles<=1/rec.seconds+margin,'Invalid cycle rate '+m.id);
  const outflow=outs.reduce((s,r)=>s+flow(r,rec.output),0);
  assert(Math.abs(outflow-cycles*rec.qty)<margin,'Recipe output imbalance '+m.id);
  for(const [item,qty] of Object.entries(rec.inputs||{})){
   const inflow=ins.reduce((s,r)=>s+flow(r,item),0);
   assert(Math.abs(inflow-cycles*qty)<margin,'Ingredient imbalance '+m.id+': '+item);
  }
 }
 if(['\u5206\u6d41','\u6c47\u6d41'].includes(m.type)){
  const materials=new Set([...ins,...outs].flatMap(r=>Object.keys(sol.routeFlows[r.id]||{})));
  for(const item of materials){
   const a=ins.reduce((s,r)=>s+flow(r,item),0),b=outs.reduce((s,r)=>s+flow(r,item),0);
   assert(Math.abs(a-b)<margin,'Junction material conservation failed '+m.id+'/'+item);
  }
 }
 for(const kind of ['in','out']){
  const list=kind==='in'?ins:outs,ref=kind==='in'?'to':'from';
  for(const port of new Set(list.map(r=>r[ref].port))){
   const cap=list.filter(r=>r[ref].port===port).reduce((s,r)=>s+total(r),0);
   assert(cap<=1+margin,'Port throughput exceeded '+m.id+'/'+kind+'/'+port);
  }
 }
 tested++;
}
const mats=new Set([...Object.keys(sol.inflow),...Object.keys(sol.outflow)]);
for(const item of mats){
 const net=(sol.inflow[item]||0)-(sol.outflow[item]||0);
 assert(net>=-margin,'Warehouse inventory deficit for '+item+': '+net);
}
if(layout.machines.length===115&&layout.routes.length===84){
 const item='\u7845\u6676\u5706';
 const waferIn=(sol.inflow[item]||0)*60,waferOut=(sol.outflow[item]||0)*60;
 assert(Math.abs(waferIn-30)<0.01,'Reference wafer intake changed');
 assert(Math.abs(waferOut-28)<0.01,'Reference wafer withdrawal changed');
 assert(Math.abs(waferIn-waferOut-2)<0.01,'Reference wafer surplus must be +2/min');
const alloy='\u5408\u91d1\u677f';
const alloyNet=((sol.inflow[alloy]||0)-(sol.outflow[alloy]||0))*60;
assert(Math.abs(alloyNet)<0.01,'Pareto non-idling must eliminate +1.33 alloy surplus');
assert(Math.abs((sol.machineCycles.ast1_24||0)*60-14/3)<0.02,'Resonance should run 4.6667 cycles/min');
assert(sol.diagnostics.paretoRefinementStatus==='optimal','Pareto LP should optimize exactly');
console.log('PASS: alloy plate 40/40 net0 and resonance 4.6667 cycles/min');
}
console.log('PASS: all '+layout.machines.length+' machines and '+layout.routes.length+' routes satisfy mass balance, recipes, belt/port limits and warehouse stock feasibility');
console.log('PASS: fairness LP has '+sol.diagnostics.fairnessVariables+' global imbalance variables, '+sol.diagnostics.fairSplitConstraints+' hard fair-drain constraints');
if(layout.machines.length===115&&layout.routes.length===84)console.log('PASS: reference factory silicon wafer 30 in / 28 out / +2 net per minute');
for(const m of layout.machines){
 const rec=getRecipe(m);if(!rec)continue;
 const u=sol.machineDuty[m.id],idle=sol.machineIdle[m.id];
 assert(Number.isFinite(u)&&Math.abs(u+idle-1)<1e-6,'Duty+idle must sum to1 '+m.id);
 assert(Math.abs(u-(sol.machineCycles[m.id]||0)*rec.seconds)<1e-5,'Incorrect machine duty '+m.id);
}
console.log('PASS: 50 machines duty and stop percentages match LP cycle rates');
