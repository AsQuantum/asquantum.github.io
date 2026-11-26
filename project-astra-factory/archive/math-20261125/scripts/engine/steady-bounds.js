'use strict';
// Sound upper bounds on NONNEGATIVE long-run average flows and machine cycles.
// Derived ONLY from exact recipe/junction conservation, finite machine cycle
// times, shared conveyor/port capacities and nondepleting warehouse stock.
// These are NECESSARY constraints, not a queueing-network throughput solver.
// Zero lower bounds remain zero until a separate reachability/scheduling proof.
function factorySteadyProveRateBounds(model,{maxPasses=256,startupLayout=null,initialWarehouseItems=[]}={}){
 if(!model?.rateVariables||!model?.machineEquations||!model?.junctionEquations)
  throw Error('missing symbolic factory equations');
 const names=[...model.rateVariables.map(v=>v.id),...model.machineEquations.map(m=>m.cycleVar)];
 const index=new Map(names.map((name,i)=>[name,i]));
 if(index.size!==names.length)throw Error('duplicate physical rate variable');
 const upper=names.map(()=>STEADY_ONE);
 const proof=names.map(()=> 'physical individual conveyor rate <= 1 item/s');
 const eqs=[];
 const addEquation=(label,positive,negative)=>{
  const coefficients=new Map();
  for(const [name,q] of positive){
   const id=index.get(name);if(id===undefined)throw Error('unknown positive variable '+name);
   const next=steadyExactAdd(coefficients.get(id)||STEADY_ZERO,steadyExactQ(q));
   if(next.n===0n)coefficients.delete(id);else coefficients.set(id,next);
  }
  for(const [name,q] of negative){
   const id=index.get(name);if(id===undefined)throw Error('unknown negative variable '+name);
   const next=steadyExactSub(coefficients.get(id)||STEADY_ZERO,steadyExactQ(q));
   if(next.n===0n)coefficients.delete(id);else coefficients.set(id,next);
  }
  if(coefficients.size)eqs.push({label,coefficients});
 };
 for(const m of model.machineEquations){
  const id=index.get(m.cycleVar);
  if(id===undefined)throw Error('missing recipe-cycle variable '+m.cycleVar);
  const period=steadyExactQ(m.cyclePeriodSeconds);
  if(steadyExactCmp(period,STEADY_ZERO)<=0)throw Error('invalid recipe period '+m.machine);
  upper[id]=steadyExactDiv(STEADY_ONE,period);
  proof[id]='machine '+m.machine+' requires '+m.cyclePeriodSeconds+' seconds per cycle';
  for(const input of m.inputs){
   addEquation('input conservation '+m.machine+' '+input.item,
    input.rateTerms.map(name=>[name,1]),[[m.cycleVar,input.amountPerCycle]]);
  }
  addEquation('output conservation '+m.machine+' '+m.output.item,
   m.output.rateTerms.map(name=>[name,1]),
   [[m.cycleVar,m.output.amountPerCycle]]);
 }
 for(const m of model.junctionEquations)
  for(const material of m.perMaterial)
   addEquation('junction '+m.machine+' '+material.item,
    material.received.map(name=>[name,1]),
    material.sent.map(name=>[name,1]));
 // Every shared conveyor and physical port has ONE capacity for the
 // SUM of all its commodities; when their lower bounds are zero, the
 // capacity cannot prove a tighter individual upper bound than 1.
 const resources=[...(model.sharedLines||[]),...(model.portResources||[])]
  .map(r=>({terms:r.terms||[],capacity:steadyExactQ(r.capacityPerSecond)}));
 const pools=Object.entries(model.warehouseFlow||{}).map(([item,data])=>({
  label:'nondepleting warehouse '+item,
  inflow:data.inflow,outflow:data.outflow
 }));
 const tighten=(id,value,why)=>{
  if(steadyExactCmp(value,STEADY_ZERO)<0)throw Error('inconsistent bound: '+why);
  if(steadyExactCmp(value,upper[id])<0){upper[id]=value;proof[id]=why;return true;}
  return false;
 };
 // Optional initial-state certificate: remove impossible circulation.
 let startupProof=null;
 if(startupLayout){
  if(typeof factorySteadyGenericStartupReachability!=='function')throw Error('Missing startup reachability module');
  // A startup certificate must refer to the exact same physical layout.
  // Never silently declare unknown model variables impossible.
  const physicalRoutes=new Set(startupLayout.routes.filter(r=>r.to).map(r=>r.id));
  const physicalMachines=new Set(startupLayout.machines.map(m=>m.id));
  if(model.rateVariables.some(v=>!physicalRoutes.has(v.route))||
    model.machineEquations.some(m=>!physicalMachines.has(m.machine)))
   throw Error('Startup layout and rate-equation model do not match');
  const closure=factorySteadyGenericStartupReachability(startupLayout,{initialWarehouseItems});
  let certifiedZeroVariables=0;
  for(const v of model.rateVariables){
   if((closure.potentiallyActiveItemsByRoute[v.route]||[]).includes(v.item))continue;
   const id=index.get(v.id);if(id===undefined)continue;
   upper[id]=STEADY_ZERO;proof[id]='material unreachable from initial state';
   certifiedZeroVariables++;
  }
  const canStart=new Set(closure.potentiallyActiveRecipeMachines);
  for(const m of model.machineEquations){
   if(canStart.has(m.machine))continue;
   const id=index.get(m.cycleVar);if(id===undefined)continue;
   upper[id]=STEADY_ZERO;proof[id]='recipe cannot start from initial state';
   certifiedZeroVariables++;
  }
  startupProof={certifiedZeroVariables,passes:closure.passes,
   initialWarehouseItems:[...initialWarehouseItems],
   condition:'empty machine/belt buffers; given warehouse inventory',
   note:'Unreachable implies exact zero; reachable does not imply positive throughput.'};
 }
 let passes=0,changed=true;
 for(;passes<maxPasses&&changed;passes++){
  changed=false;
  for(const eq of eqs){
   const positive=[],negative=[];
   for(const [id,c] of eq.coefficients)
    (c.n>0n?positive:negative).push([id,c.n>0n?c:steadyExactMul(c,steadyExactQ(-1))]);
   const maxPositive=steadyExactSum(positive.map(([id,c])=>steadyExactMul(c,upper[id])));
   const maxNegative=steadyExactSum(negative.map(([id,c])=>steadyExactMul(c,upper[id])));
   for(const [id,c] of positive)if(tighten(id,steadyExactDiv(maxNegative,c),eq.label))changed=true;
   for(const [id,c] of negative)if(tighten(id,steadyExactDiv(maxPositive,c),eq.label))changed=true;
  }
  for(const r of resources){
   // Capacity upper of an individual nonnegative flow.
   for(const name of r.terms){
    const id=index.get(name);if(id!==undefined&&tighten(id,r.capacity,'shared physical belt or port capacity'))changed=true;
   }
  }
  for(const pool of pools){
   const supply=steadyExactSum(pool.inflow.map(name=>{
    const id=index.get(name);return id===undefined?STEADY_ZERO:upper[id];
   }));
   for(const name of pool.outflow){
    const id=index.get(name);
    if(id!==undefined&&tighten(id,supply,pool.label+' requires long-run outflow <= inflow'))changed=true;
   }
  }
 }
 const completed=!changed;
 // The sum of individually proven material upper bounds is itself a
 // sound upper bound for the shared conveyor's aggregate rate.
 const sharedLineUpper=(model.sharedLines||[]).map(line=>{
  const total=steadyExactSum(line.terms.map(name=>{
   const id=index.get(name);
   if(id===undefined)throw Error('unknown shared-line item flow: '+name);
   return upper[id];
  }));
  const capacity=steadyExactQ(line.capacityPerSecond);
  return {route:line.route,materials:[...(line.materials||line.terms)],
   upperSum:steadyExactText(total),capacity:steadyExactText(capacity),
   strictlyBelowCapacity:steadyExactCmp(total,capacity)<0,
   note:'Independent per-material rational upper bounds; not actual steady throughput'};
 });
 return {sharedLineUpper,startupProof,method:'exact BigInt rational monotone necessary-bound propagation; optional startup zero proof; no LP, simulation or artificial weights',
  variables:names.length,conservationEquations:eqs.length,passes,
  completed,lowerBoundAssumption:'all rates nonnegative; no nonzero lower bounds proved',
  upper:Object.fromEntries(names.map((name,i)=>[name,steadyExactText(upper[i])])),
  upperReason:Object.fromEntries(names.map((name,i)=>[name,proof[i]])),
  forcedZero:names.filter((name,i)=>upper[i].n===0n),
  warnings:['Upper bounds are not exact sustained production rates and do not certify FIFO liveness, physical schedule or reachability.']};
}
