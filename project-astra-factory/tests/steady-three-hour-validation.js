'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}},style:{}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/math/arithmetic/rational','engine/steady-flow','engine/steady-equations','engine/steady-algebra','engine/math/graph/startup_reachability','engine/steady-rate-region','engine/steady-auto-fluid','ui/warehouse','engine/simulation','core/compact-json','blueprints/ast1-codec'])
 vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
vm.runInContext('warehouseRefresh=()=>{};draw=()=>{};function stockChartReset(){};function notify(){}',c);
c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
// Exact memoization for the fixed layout during each test, no change to
// physical transitions, iteration order, timings, FIFO or stock reservations.
vm.runInContext("const originalGetPorts=getPorts,originalGetRecipe=getRecipe,originalRouteFor=routeFor,originalMachineById=machineById;function restorePhysicalLookups(){getPorts=originalGetPorts;getRecipe=originalGetRecipe;routeFor=originalRouteFor;machineById=originalMachineById;}function cachePhysicalLookups(){const byMachine=new Map(state.machines.map(m=>[m.id,m])),routes=new Map(),ports=new Map(),recipes=new Map();for(const m of state.machines){ports.set(m.id,originalGetPorts(m));recipes.set(m.id,originalGetRecipe(m));}for(const r of state.routes){routes.set(JSON.stringify([r.from.id,'out',r.from.port]),r);if(r.to)routes.set(JSON.stringify([r.to.id,'in',r.to.port]),r);}machineById=id=>byMachine.get(id);routeFor=(id,kind,index)=>routes.get(JSON.stringify([id,kind,index]));getPorts=m=>ports.get(m.id)||originalGetPorts(m);getRecipe=m=>recipes.has(m.id)?recipes.get(m.id):originalGetRecipe(m);}",c);
const run=s=>vm.runInContext(s,c);
const onlyRemoved=process.argv.includes('--removed-only');
const results=onlyRemoved?JSON.parse(fs.readFileSync(path.join(root,'tests/steady-three-hour-validation.json'),'utf8')).filter(x=>x.removed===null):[];
for(const removed of onlyRemoved?['M89']:[null,'M89']){
 run('restorePhysicalLookups();state=ast1Decode(ast);');
 if(removed){c.removed=removed;run("for(const r of state.routes){if(r.to?.id===removed&&r.from.id!==removed){const last=routeTile(r,r.path.length-1);r.to=null;if(last?.outgoing)r.openEndSide=last.outgoing;}}state.routes=state.routes.filter(r=>r.from.id!==removed);state.machines=state.machines.filter(m=>m.id!==removed);");}
 const theoretical=run("factorySteadyAutomaticFluidBudget()");
 run('cachePhysicalLookups();resetSimulation();');
 if(theoretical.status!=='conditional-fixed-point'||!Object.keys(theoretical.inflow||{}).length)throw Error(JSON.stringify(theoretical));
 const windows=[],start=performance.now();
 for(let hour=1;hour<=3;hour++){
  const before=run('JSON.stringify({inbound:sim.inbound,outbound:sim.outbound,ware})');
  run('for(let i=0;i<72000;i++)simulate(.05)');
  const after=JSON.parse(run('JSON.stringify({inbound:sim.inbound,outbound:sim.outbound,ware})')),old=JSON.parse(before);
  const items=[...new Set([...Object.keys(theoretical.inflow),...Object.keys(theoretical.outflow),...Object.keys(after.inbound),...Object.keys(after.outbound)])];
  const rows=items.map(item=>{
   const ti=60*(theoretical.inflow[item]||0),to=60*(theoretical.outflow[item]||0);
   const ai=((after.inbound[item]||0)-(old.inbound[item]||0))/60,ao=((after.outbound[item]||0)-(old.outbound[item]||0))/60;
   return {item,theoryIn:ti,theoryOut:to,actualIn:ai,actualOut:ao,netDelta:(ai-ao)-(ti-to),stock:after.ware[item]||0};
  });
  const max=Math.max(...rows.flatMap(r=>[Math.abs(r.actualIn-r.theoryIn),Math.abs(r.actualOut-r.theoryOut)]));
  windows.push({hour,rows,maxAbsoluteRateError:max});
  console.log(JSON.stringify({removed,hour,maxAbsoluteRateError:max,elapsedSeconds:(performance.now()-start)/1000,
   differences:rows.filter(r=>Math.max(Math.abs(r.actualIn-r.theoryIn),Math.abs(r.actualOut-r.theoryOut))>0.5).map(r=>[r.item,+r.theoryIn.toFixed(3),+r.actualIn.toFixed(3),+r.theoryOut.toFixed(3),+r.actualOut.toFixed(3),r.stock])}));
 }
 results.push({removed,theoretical:{inflow:theoretical.inflow,outflow:theoretical.outflow},windows});
 fs.writeFileSync(path.join(root,'tests/steady-three-hour-validation.json'),JSON.stringify(results,null,2),'utf8');
}
