'use strict';
// Homogeneous conservation and recipe equations over exact BigInt fractions.
// NO LP, no optimization weights, no simulation, no assertion that linear
// equalities alone determine a physical FIFO/RR steady state.
function factorySteadyAnalyzeEqualities(model){
 if(!model?.rateVariables||!model?.machineEquations||!model?.junctionEquations)
  throw Error('invalid symbolic factory model');
 const names=[
  ...model.rateVariables.map(v=>v.id),
  ...model.machineEquations.map(m=>m.cycleVar)
 ];
 if(new Set(names).size!==names.length)throw Error('duplicate rate variable');
 const indexes=new Map(names.map((n,i)=>[n,i]));
 const rows=[],labels=[];
 function add(label,positiveTerms,negativeTerms,positiveCycle=null,cycleFactor=0){
  const row=new Map();
  function increment(name,value){
   const index=indexes.get(name);
   if(index===undefined)throw Error('unknown equation variable: '+name);
   const next=steadyExactAdd(row.get(index)||STEADY_ZERO,steadyExactQ(value));
   if(steadyExactCmp(next,STEADY_ZERO)===0)row.delete(index);
   else row.set(index,next);
  }
  for(const term of positiveTerms)increment(term,1);
  for(const term of negativeTerms)increment(term,-1);
  if(positiveCycle)increment(positiveCycle,cycleFactor);
  if(row.size){rows.push(row);labels.push(label);}
 }
 for(const recipe of model.machineEquations){
  for(const input of recipe.inputs){
   add('recipe:'+recipe.machine+':input:'+input.item,
    input.rateTerms,[],recipe.cycleVar,'-'+String(input.amountPerCycle));
  }
  add('recipe:'+recipe.machine+':output:'+recipe.output.item,
   recipe.output.rateTerms,[],recipe.cycleVar,'-'+String(recipe.output.amountPerCycle));
 }
 for(const junction of model.junctionEquations)
  for(const balance of junction.perMaterial)
   add('junction:'+junction.machine+':'+balance.item,
    balance.received,balance.sent);
 const pivotCols=[],pivotLabels=[];
 let rank=0;
 for(let column=0;column<names.length&&rank<rows.length;column++){
  let pivot=rank;
  while(pivot<rows.length&&!rows[pivot].has(column))pivot++;
  if(pivot===rows.length)continue;
  if(pivot!==rank){
   [rows[pivot],rows[rank]]=[rows[rank],rows[pivot]];
   [labels[pivot],labels[rank]]=[labels[rank],labels[pivot]];
  }
  const one=rows[rank].get(column);
  for(const [col,value] of rows[rank])
   rows[rank].set(col,steadyExactDiv(value,one));
  for(let ri=0;ri<rows.length;ri++){
   if(ri===rank)continue;
   const factor=rows[ri].get(column);
   if(factor===undefined)continue;
   for(const [col,value] of rows[rank]){
    const next=steadyExactSub(rows[ri].get(col)||STEADY_ZERO,
     steadyExactMul(factor,value));
    if(steadyExactCmp(next,STEADY_ZERO)===0)rows[ri].delete(col);
    else rows[ri].set(col,next);
   }
  }
  pivotCols.push(column);pivotLabels.push(labels[rank]);rank++;
 }
 const pivotSet=new Set(pivotCols);
 const freeColumns=names.map((_,i)=>i).filter(i=>!pivotSet.has(i));
 const freeSet=new Set(freeColumns);
 const forcedZero=pivotCols.filter((pivot,i)=>
  [...rows[i].keys()].every(column=>column===pivot||!freeSet.has(column)));
 return {
  method:'exact rational Gauss-Jordan elimination (homogeneous flow conservation, not LP)',
  variables:names.length,equations:labels.length,rank,
  freeDegrees:names.length-rank,freeVariables:freeColumns.map(i=>names[i]),
  algebraicallyForcedZero:forcedZero.map(i=>names[i]),
  pivotRelations:pivotCols.map((pivot,i)=>({
   variable:names[pivot],
   terms:[...rows[i]].filter(([j])=>j!==pivot).map(([j,v])=>({
    variable:names[j],coefficient:steadyExactText(steadyExactMul(v,steadyExactQ(-1)))}))
  })),
  warnings:[
   'Unknowns are long-run mean rates only: equality solutions do NOT certify FIFO compatibility, reachability, backpressure or round-robin schedule.',
   'Warehouse accumulation is an inequality; resource capacities and dispatch constraints are NOT enforced by this elimination.'
  ]
 };
}
