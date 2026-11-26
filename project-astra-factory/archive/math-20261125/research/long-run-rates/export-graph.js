// Offline research only: compile the existing graph, never run its iterative solver.
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'../..');
const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','engine/steady-auto-fluid'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
c.code=fs.readFileSync(process.argv[2],'utf8').trim();
c.unlimited=process.argv.includes('--unlimited');
const graph=vm.runInContext(`state=ast1Decode(code);
var model=factorySteadyBuildEquations(),compiled=factorySteadyAutomaticFluidModel(state,model,{unlimitedWarehouse:unlimited});
var frozen=activeFrozenFactories(state),startup=factorySteadyGenericStartupReachability(state,{initialWarehouseItems:unlimited?[...model.warehousePools.map(p=>p.item),...frozen.flatMap(f=>Object.keys(f.rates))]:[],frozenFactories:frozen});
JSON.stringify({status:compiled.status,issues:compiled.issues||[],unlimited,nodes:state.machines.map(m=>({id:m.id,type:m.type,recipe:getRecipe(m),item:m.item,face:m.face,inputPriority:machineInputPriority(m).map(p=>p.index)})),lines:model.sharedLines.map(r=>({id:r.route,from:r.from.id,to:r.to.id,toPort:r.to.port,fromPort:r.from.port,materials:r.materials,active:!!(startup.potentiallyActiveItemsByRoute[r.route]||[]).length})),pools:model.warehousePools.map(p=>({item:p.item,order:p.withdrawalMachineOrder})),frozen:frozen.map(f=>({...f,reachable:unlimited||Object.entries(f.rates).every(([item,rate])=>frozenRateNumber(rate)>=0||startup.potentiallyStockedItems.includes(item))}))})`,c);
process.stdout.write(graph);
