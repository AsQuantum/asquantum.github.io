'use strict';
// Exact rational solution of an independent merge forest:
// generator -> (zero or more merger layers) -> warehouse inlet.
// Assumptions match the user's ideal work-conserving, physical-INPUT-port
// max-min model. The branch is NOT invoked for recipes, cycles, shared
// warehouse withdrawals, splitters, or uncharacterized FIFO cross-coupling.
function steadyExactTryMergeForest(){
 if(!state||!Array.isArray(state.routes)||!Array.isArray(state.machines))return null;
 const machines=new Map(state.machines.map(m=>[m.id,m]));
 const incoming=new Map(state.machines.map(m=>[m.id,[]]));
 const outgoing=new Map(state.machines.map(m=>[m.id,[]]));
 for(const r of state.routes){
  if(!r.to||!machines.has(r.from.id)||!machines.has(r.to.id)||
     checkPath(r.path,r.from,r.to,r.id))return null;
  incoming.get(r.to.id).push(r);
  outgoing.get(r.from.id).push(r);
 }
 const used=new Set([...state.routes.flatMap(r=>[r.from.id,r.to.id])]);
 for(const id of used){
  const m=machines.get(id),recipe=getRecipe(m);
  const ins=incoming.get(id),outs=outgoing.get(id);
  if(recipe){
   if(Object.keys(recipe.inputs||{}).length||ins.length||outs.length!==1||
      !(recipe.qty>0&&recipe.seconds>0))return null;
  }else if(m.type==='汇流'){
   if(!ins.length||outs.length!==1)return null;
  }else if(m.type==='仓入'){
   if(!ins.length||outs.length)return null;
  }else return null;
  for(const [list,side] of [[ins,'to'],[outs,'from']]){
   if(new Set(list.map(r=>r[side].port)).size!==list.length)return null;
  }
 }
 const permitted=new Map();
 for(const r of state.routes){
  const target=machines.get(r.to.id);
  const mats=[...streamMaterials(r)];
  if(!mats.length||mats.some(item=>!acceptsMaterial(target,item,r.to.port)))return null;
  permitted.set(r.id,new Set(mats));
 }
 const visiting=new Set(),offerMemo=new Map();
 function offer(r){
  if(offerMemo.has(r.id))return offerMemo.get(r.id);
  if(visiting.has(r.id))throw Error('cycle in merger forest');
  visiting.add(r.id);
  const parent=machines.get(r.from.id),recipe=getRecipe(parent);
  const maximum=recipe?
   steadyExactDiv(steadyExactQ(recipe.qty),steadyExactQ(recipe.seconds)):
   steadyExactSum(incoming.get(parent.id).map(offer));
  const cap=steadyExactMin(STEADY_ONE,maximum);
  offerMemo.set(r.id,cap);
  visiting.delete(r.id);
  return cap;
 }
 const routeValues=new Map(),cycleValues=new Map(),receipts=new Map();
 const add=(map,key,x)=>map.set(key,steadyExactAdd(map.get(key)||STEADY_ZERO,x));
 function assign(r,granted){
  if(steadyExactCmp(granted,offer(r))>0)throw Error('flow above source offer: '+r.id);
  const parent=machines.get(r.from.id),recipe=getRecipe(parent);
  const items=new Map();
  if(recipe){
   items.set(recipe.output,granted);
   add(cycleValues,parent.id,steadyExactDiv(granted,steadyExactQ(recipe.qty)));
  }else{
   const feeder=incoming.get(parent.id),caps=feeder.map(offer);
   const grants=steadyExactWaterfill(granted,caps);
   for(let i=0;i<feeder.length;i++){
    const forwarded=assign(feeder[i],grants[i]);
    for(const [item,rate] of forwarded)add(items,item,rate);
   }
  }
  if(steadyExactCmp(steadyExactSum([...items.values()]),granted)!==0)
   throw Error('mixed material conservation error: '+r.id);
  if([...items.keys()].some(item=>!permitted.get(r.id).has(item)))
   throw Error('incompatible output material on '+r.id);
  routeValues.set(r.id,items);
  return items;
 }
 try{
  for(const m of state.machines){
   if(m.type!=='仓入')continue;
   for(const r of incoming.get(m.id)){
    const receipt=assign(r,offer(r));
    for(const [item,rate] of receipt)add(receipts,item,rate);
   }
  }
 }catch{return null;}
 const machineCycles={},machineDuty={},machineIdle={},machineNeeds={},machineFeeds={};
 for(const m of state.machines){
  const recipe=getRecipe(m);if(!recipe)continue;
  const cycles=cycleValues.get(m.id)||STEADY_ZERO;
  const duty=steadyExactMul(cycles,steadyExactQ(recipe.seconds));
  if(steadyExactCmp(duty,STEADY_ONE)>0)return null;
  machineCycles[m.id]=steadyExactNumber(cycles);
  machineDuty[m.id]=steadyExactNumber(duty);
  machineIdle[m.id]=steadyExactNumber(steadyExactSub(STEADY_ONE,duty));
  machineNeeds[m.id]={};machineFeeds[m.id]={};
 }
 const routeFlows={},fractions={routes:{},machineCycles:{},inflow:{}};
 for(const r of state.routes){
  const materials=routeValues.get(r.id)||new Map();
  if(steadyExactCmp(steadyExactSum([...materials.values()]),STEADY_ONE)>0)return null;
  routeFlows[r.id]={};
  for(const [item,rate] of materials){
   routeFlows[r.id][item]=steadyExactNumber(rate);
   fractions.routes[r.id+'|'+item]=steadyExactText(rate);
  }
 }
 for(const [id,cycles] of cycleValues)fractions.machineCycles[id]=steadyExactText(cycles);
 const inflow={};
 for(const [item,rate] of receipts){
  inflow[item]=steadyExactNumber(rate);
  fractions.inflow[item]=steadyExactText(rate);
 }
 const mixedRoutes=state.routes.filter(r=>(routeValues.get(r.id)?.size||0)>1).map(r=>r.id);
 return {inflow,outflow:{},machineCycles,machineDuty,machineIdle,machineNeeds,machineFeeds,
  routeFlows,warnings:[],diagnostics:{
   method:'精确有理数守恒 + 按汇流输入口 Max-Min 水位分配',
   exact:true,certified:true,network:'独立生产源—汇流树—仓库入口',
   mixedRoutes,variables:Object.keys(fractions.routes).length,fractions}};
}
