// Offline test instrumentation: record actual graphs from existing tests.
// Does not rewrite the tests or production files, nor provide answers to them.
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const original=vm.runInContext,seen=new Set();
const target=path.join(__dirname,'captured-historical.jsonl');
vm.runInContext=function(src,c,opts){
 const r=original.call(this,src,c,opts);
 const name=typeof opts==='string'?opts:opts?.filename||'';
 if(!/steady-auto-fluid(?:\.js)?$/.test(name))return r;
 c.__captureHistorical=(g,expected)=>{
  const k=JSON.stringify(g);
  if(seen.has(k))return;
  seen.add(k);fs.appendFileSync(target,JSON.stringify({g,expected})+'\n');
 };
 original.call(this,`{
 const originalBudget=factorySteadyAutomaticFluidBudget;
 factorySteadyAutomaticFluidBudget=function(layout=state,model=null,options={}){
   const b=originalBudget(layout,model,options);
   const gModel=model||factorySteadyBuildEquations(),compiled=factorySteadyAutomaticFluidModel(layout,gModel,options),unlimited=!!options.unlimitedWarehouse;
   const frozen=activeFrozenFactories(layout),startup=factorySteadyGenericStartupReachability(layout,{initialWarehouseItems:unlimited?[...gModel.warehousePools.map(p=>p.item),...frozen.flatMap(f=>Object.keys(f.rates))]:[],frozenFactories:frozen});
   const g={status:compiled.status,issues:compiled.issues||[],unlimited,nodes:layout.machines.map(m=>({id:m.id,type:m.type,recipe:getRecipe(m),item:m.item,inputPriority:machineInputPriority(m).map(p=>p.index)})),lines:gModel.sharedLines.map(r=>({id:r.route,from:r.from.id,to:r.to.id,toPort:r.to.port,fromPort:r.from.port,materials:r.materials,active:!!(startup.potentiallyActiveItemsByRoute[r.route]||[]).length})),pools:gModel.warehousePools.map(p=>({item:p.item,order:p.withdrawalMachineOrder})),frozen:frozen.map(f=>({...f,reachable:unlimited||Object.entries(f.rates).every(([item,rate])=>frozenRateNumber(rate)>=0||startup.potentiallyStockedItems.includes(item))}))};
   __captureHistorical(g,{status:b.status,fractions:b.fractions||null,reason:b.reason||null});
   return b;
 };
 }`,c);
 return r;
};
