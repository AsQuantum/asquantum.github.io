'use strict';
// Exact steady-state solution for a single multireagent assembler supplied by
// independent, dedicated source belts (one input material per belt) and sending
// its product straight into a warehouse. NO simulation or optimization.
// Larger mixed-input networks require FIFO and scheduling constraints.
function steadyExactTryIndependentRecipeStar(){
 if(typeof steadyExactRecipeInputBalance!=='function')return null;
 const machines=new Map(state.machines.map(m=>[m.id,m]));
 const routes=state.routes.filter(r=>r.to&&machines.has(r.from.id)&&machines.has(r.to.id)&&
  !checkPath(r.path,r.from,r.to,r.id));
 if(!routes.length||routes.length!==state.routes.length)return null;
 const used=new Set(routes.flatMap(r=>[r.from.id,r.to.id]));
 const recipeMachines=[...used].map(id=>machines.get(id)).filter(m=>
  getRecipe(m)&&Object.keys(getRecipe(m).inputs||{}).length>0);
 if(recipeMachines.length!==1)return null;
 const machine=recipeMachines[0],recipe=getRecipe(machine);
 const feeds=routes.filter(r=>r.to.id===machine.id),outputs=routes.filter(r=>r.from.id===machine.id);
 if(!feeds.length||outputs.length!==1)return null;
 const dest=machines.get(outputs[0].to.id);
 if(!dest||dest.type!=='仓入'||!acceptsMaterial(dest,recipe.output,outputs[0].to.port))return null;
 const onlyMaterials=new Set();
 const sources=[];
 const offers={};
 for(const r of feeds){
  if(onlyMaterials.has(r.to.port))return null;
  onlyMaterials.add(r.to.port);
  const src=machines.get(r.from.id),rec=getRecipe(src);
  if(!rec||Object.keys(rec.inputs||{}).length||!rec.qty||!rec.seconds||
     !Object.hasOwn(recipe.inputs,rec.output)||offers[rec.output]!==undefined)return null;
  if(routes.filter(x=>x.from.id===src.id).length!==1||
     routes.filter(x=>x.to.id===src.id).length||!acceptsMaterial(machine,rec.output,r.to.port))
   return null;
  if(r.from.port!==0)return null;
  const mats=[...streamMaterials(r)];
  if(mats.length!==1||mats[0]!==rec.output)return null;
  const offer=steadyExactMin(STEADY_ONE,
   steadyExactDiv(steadyExactQ(rec.qty),steadyExactQ(rec.seconds)));
  offers[rec.output]=offer;
  sources.push({machine:src,route:r,recipe:rec,item:rec.output});
 }
 if(Object.keys(offers).length!==Object.keys(recipe.inputs).length)return null;
 if(used.size!==feeds.length+2||[...used].some(id=>![machine.id,dest.id,...sources.map(s=>s.machine.id)].includes(id)))
  return null;
 if([...streamMaterials(outputs[0])].some(item=>item!==recipe.output))return null;
 const balance=steadyExactRecipeInputBalance(recipe,offers,{outputCapacity:STEADY_ONE});
 const cycles=balance.cyclesPerSecond;
 const machineCycles={},machineDuty={},machineIdle={},machineNeeds={},machineFeeds={},routeFlows={};
 const fractions={routes:{},machineCycles:{},inflow:{}};
 function record(m,rec,cycle){
  const duty=steadyExactMul(cycle,steadyExactQ(rec.seconds));
  if(steadyExactCmp(duty,STEADY_ONE)>0)throw Error('machine exceeds capacity');
  machineCycles[m.id]=steadyExactNumber(cycle);
  machineDuty[m.id]=steadyExactNumber(duty);
  machineIdle[m.id]=steadyExactNumber(steadyExactSub(STEADY_ONE,duty));
  machineNeeds[m.id]=Object.fromEntries(Object.entries(rec.inputs||{}).map(([item,qty])=>
   [item,steadyExactNumber(steadyExactMul(cycle,steadyExactQ(qty)))]));
  machineFeeds[m.id]=Object.fromEntries(Object.entries(rec.inputs||{}).map(([item,qty])=>
   [item,steadyExactNumber(steadyExactMul(cycle,steadyExactQ(qty)))]));
  fractions.machineCycles[m.id]=steadyExactText(cycle);
 }
 record(machine,recipe,cycles);
 for(const source of sources){
  const amount=balance.actualInput[source.item];
  record(source.machine,source.recipe,steadyExactDiv(amount,steadyExactQ(source.recipe.qty)));
  routeFlows[source.route.id]={[source.item]:steadyExactNumber(amount)};
  fractions.routes[source.route.id+'|'+source.item]=steadyExactText(amount);
 }
 const product=balance.outputPerSecond;
 routeFlows[outputs[0].id]={[recipe.output]:steadyExactNumber(product)};
 fractions.routes[outputs[0].id+'|'+recipe.output]=steadyExactText(product);
 const inflow={[recipe.output]:steadyExactNumber(product)};
 fractions.inflow[recipe.output]=steadyExactText(product);
 return {inflow,outflow:{},machineCycles,machineDuty,machineIdle,machineNeeds,machineFeeds,
  routeFlows,warnings:[],diagnostics:{
   method:'严格有理数配方限速 + 逐原料反压守恒',
   exact:true,certified:true,network:'独立原料供应—单台多原料机器—仓库',
   fractions,variables:Object.keys(fractions.routes).length}};
}
