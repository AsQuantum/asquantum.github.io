'use strict';
// Structural reduction of *actual* scheduling conflicts, based on connected
// physical source material sets, not merely the filtered algebraic rate terms.
// In particular, excluding rejected materials from mean-rate variables cannot
// be used to falsely conclude that a FIFO is free from invalid-head blocking.
//
// This is a purely static graph certificate, not a steady rate solver.
function factorySteadySchedulingStructure(layout=state,model=null){
 if(!layout||!Array.isArray(layout.machines)||!Array.isArray(layout.routes))
  throw Error('factory layout required');
 model=model||factorySteadyBuildEquations();
 const byId=new Map(layout.machines.map(m=>[m.id,m]));
 const byRoute=new Map(layout.routes.map(r=>[r.id,r]));
 const connected=new Set(model.sharedLines.map(r=>r.route));
 const all=[];
 for(const id of connected){
  const r=byRoute.get(id);
  if(!r?.to||!byId.has(r.from.id)||!byId.has(r.to.id))
   throw Error('Disconnected route in constraint graph '+id);
  const dest=byId.get(r.to.id),src=byId.get(r.from.id);
  const materials=[...streamMaterials(r)].sort();
  const rejected=materials.filter(item=>!acceptsMaterial(dest,item,r.to.port));
  all.push({route:id,from:r.from.id,to:r.to.id,fromType:src.type,
   toType:dest.type,materials,rejected});
 }
 const mixed=all.filter(r=>r.materials.length>1);
 const recipeInlets=all.filter(r=>!!getRecipe(byId.get(r.to))&&
  Object.keys(getRecipe(byId.get(r.to)).inputs||{}).length>0);
 const mixedRecipeInlets=recipeInlets.filter(r=>r.materials.length>1);
 const incompatibleRecipeInlets=recipeInlets.filter(r=>r.rejected.length);
 const splitterInputs=all.filter(r=>byId.get(r.to).type==='分流');
 const mixedSplitterInputs=splitterInputs.filter(r=>r.materials.length>1);
 const splitterIDs=layout.machines.filter(m=>m.type==='分流').map(m=>m.id);
 // A homogeneous input may STILL block if the RR-selected connected
 // output has an incompatible material filter. Analyze the whole input set
 // before output filtering, never the already filtered route rate terms.
 const splitterFilterMismatchRisks=[];
 for(const id of splitterIDs){
  const inputItems=new Set(splitterInputs.filter(r=>r.to===id).flatMap(r=>r.materials));
  const machine=byId.get(id);
  for(const outlet of all.filter(r=>r.from===id)){
   const route=byRoute.get(outlet.route);
   const required=outPort(machine,route.from.port)?.filter||'';
   if(!required||required==='任意')continue;
   const unaccepted=[...inputItems].filter(item=>item!==required);
   if(unaccepted.length)splitterFilterMismatchRisks.push({
    splitter:id,route:outlet.route,port:route.from.port,required,
    mismatchedInputItems:unaccepted
   });
  }
 }
 const homogeneousSplitterIDs=splitterIDs.filter(id=>{
  const inputs=splitterInputs.filter(r=>r.to===id);
  return inputs.length===1&&inputs[0].materials.length===1&&
   !inputs[0].rejected.length;
 });
 const terminalWarehouseMixed=mixed.filter(r=>
  r.toType==='仓入'&&!r.rejected.length);
 const otherMixed=mixed.filter(r=>!terminalWarehouseMixed.includes(r));
 const competition=(model.warehousePools||[]).filter(x=>
  x.withdrawalMachineOrder.length>1).map(x=>({
   item:x.item,machineOrder:[...x.withdrawalMachineOrder]
  }));
 const bufferedFeedbackItems=(model.warehousePools||[])
  .filter(x=>x.inflowTerms.length&&x.outflowTerms.length).map(x=>x.item);
 return {
  method:'static connected material-set and FIFO dispatch-guard classification',
  connectedRouteCount:all.length,
  recipeInletCount:recipeInlets.length,
  mixedRecipeInlets:mixedRecipeInlets.map(r=>({route:r.route,machine:r.to,materials:r.materials})),
  incompatibleRecipeInlets:incompatibleRecipeInlets.map(r=>({route:r.route,machine:r.to,rejected:r.rejected})),
  splitterCount:splitterIDs.length,
  homogeneousSplitterIDs,splitterFilterMismatchRisks,
  mixedSplitterInputs:mixedSplitterInputs.map(r=>({
   route:r.route,machine:r.to,materials:r.materials
  })),
  mixedRouteCount:mixed.length,
  mixedTerminalWarehouseRoutes:terminalWarehouseMixed.map(r=>({
   route:r.route,merger:r.from,warehouse:r.to,materials:r.materials
  })),
  otherMixedRoutes:otherMixed.map(r=>({route:r.route,to:r.to,materials:r.materials,
   rejected:r.rejected})),
  sharedWarehouseOutletCompetition:competition,
  recirculatedWarehouseItems:bufferedFeedbackItems,
  claims:{
   recipeFIFOColorOrderingAbsent:mixedRecipeInlets.length===0&&incompatibleRecipeInlets.length===0,
   splitterFIFOColorOrderingAbsent:mixedSplitterInputs.length===0&&
    splitterInputs.every(r=>!r.rejected.length)&&splitterFilterMismatchRisks.length===0,
   terminalMixedRoutesMaterialAcceptanceUnconditional:
    mixed.length>0&&otherMixed.length===0,
   wholeFactoryExactRateSolved:false
  },
  caveats:[
   'Material sets are static reachability over-approximations: false certainty about item order is never inferred from proportions.',
   'An unfiltered warehouse inlet cannot cause MATERIAL-MISMATCH HOL, but can still backpressure by finite input-port cooldown.',
   'Homogeneous splitter inputs remove multi-color head matching, NOT port RR phase, finite queues, backpressure or warehouse priority.',
   'The structural reduction cannot by itself certify positive rates or a global long-run fixed point.'
  ]
 };
}
