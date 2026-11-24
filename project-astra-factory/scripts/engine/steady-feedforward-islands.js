'use strict';
// Pure rational, no simulation: extract source->recipe->...->warehouse serial
// subnetworks that have no mergers, splitting, shared upstream resources or
// warehouse withdrawals inside the chain. Warehouse sink may have other
// depositors, since accepted items are immediately credited to unbounded
// stock and that sink never backpressures a physical input.
//
// This is an analytically derived UPPER bound, NOT an exact stationary rate
// certificate. Finite buffers, fixed dispatch phases and packet transit
// could make the true simulator throughput lower; equality requires a separate
// lower-bound/event-graph proof. Do not silently display this as actual output.
function factorySteadyIsolatedDepositChains(layout=state){
 if(!layout?.machines||!layout?.routes)throw Error('Factory layout required');
 const byId=new Map(layout.machines.map(m=>[m.id,m]));
 const routes=layout.routes.filter(r=>r.to&&byId.has(r.from.id)&&byId.has(r.to.id)&&
  !checkPath(r.path,r.from,r.to,r.id));
 const incoming=new Map(layout.machines.map(m=>[m.id,[]]));
 const outgoing=new Map(layout.machines.map(m=>[m.id,[]]));
 for(const r of routes){
  incoming.get(r.to.id).push(r);
  outgoing.get(r.from.id).push(r);
 }
 const cap=STEADY_ONE,chains=[],rejectCounts={};
 const reject=why=>rejectCounts[why]=(rejectCounts[why]||0)+1;
 for(const finalRoute of routes){
  const warehouse=byId.get(finalRoute.to.id);
  if(warehouse.type!=='仓入')continue;
  const reversed=[],used=new Set();
  let current=finalRoute.from.id,expected=finalRoute;
  let valid=true,why=null;
  while(true){
   if(used.has(current)){valid=false;why='cycle';break;}
   used.add(current);
   const m=byId.get(current),rec=getRecipe(m);
   const ins=incoming.get(m.id),outs=outgoing.get(m.id);
   if(!rec||outs.length!==1||outs[0]!==expected){
    valid=false;why='not dedicated serial recipe';break;
   }
   const entries=Object.entries(rec.inputs||{});
   if(entries.length>1||ins.length!==entries.length){
    valid=false;why='multiple or unknown ingredient sources';break;
   }
   const physicalMaterial=[...streamMaterials(expected)];
   if(physicalMaterial.length!==1||physicalMaterial[0]!==rec.output||
      !acceptsMaterial(byId.get(expected.to.id),rec.output,expected.to.port)||
      (outPort(m,expected.from.port)?.filter&&
       !['任意',rec.output].includes(outPort(m,expected.from.port)?.filter))){
    valid=false;why='material filter or multiple potential items';break;
   }
   reversed.push({machine:m.id,recipe:rec,route:expected.id});
   if(!entries.length)break;
   const [item,qty]=entries[0],prior=ins[0],source=byId.get(prior.from.id);
   if(!Number.isSafeInteger(qty)||qty<1||!source||getRecipe(source)?.output!==item){
    valid=false;why='ingredient producer mismatch';break;
   }
   // A recipe may have only one ingredient but several physical inlets, or
   // additional material arriving from elsewhere; a dedicated chain cannot.
   expected=prior;current=source.id;
  }
  if(!valid){reject(why);continue;}
  const steps=reversed.reverse();
  let delivered=STEADY_ZERO;
  const machineBounds=[];
  for(let i=0;i<steps.length;i++){
   const {machine,recipe,route}=steps[i];
   const ingredients=Object.entries(recipe.inputs||{});
   const offered=ingredients.length?
    steadyExactDiv(delivered,steadyExactQ(ingredients[0][1])):null;
   let cycles=steadyExactMin(steadyExactDiv(STEADY_ONE,steadyExactQ(String(recipe.seconds))),
    steadyExactDiv(cap,steadyExactQ(recipe.qty)));
   if(offered!==null)cycles=steadyExactMin(cycles,offered);
   delivered=steadyExactMul(cycles,steadyExactQ(recipe.qty));
   const possibleBottlenecks=[
    {kind:'recipeTime',limit:steadyExactText(steadyExactDiv(steadyExactQ(recipe.qty),steadyExactQ(String(recipe.seconds))))},
    {kind:'physicalOutput',limit:'1'}
   ];
   if(offered!==null)possibleBottlenecks.push({kind:'ingredientSupply',
    limit:steadyExactText(steadyExactMul(offered,steadyExactQ(recipe.qty)))});
   machineBounds.push({machine,route,material:recipe.output,
    inputNeeds:Object.fromEntries(ingredients),
    cyclesPerSecondUpper:steadyExactText(cycles),
    outputPerSecondUpper:steadyExactText(delivered),
    possibleBottlenecks});
  }
  chains.push({
   warehouse:warehouse.id,warehousePort:finalRoute.to.port,
   source:steps[0].machine,routeSequence:steps.map(x=>x.route),
   machineSequence:steps.map(x=>x.machine),
   item:steps[steps.length-1].recipe.output,
   inputOrigins:steps.length-1,
   outputRateUpper:steadyExactText(delivered),
   machineBounds,
   certifiedUpper:true,
   certifiedActualRate:false,
   cannotAffectOtherChainsThroughSink:true,
   proof:'recipe stoichiometry + processing cap + each dedicated single-item conveyor cap 1/s; unbounded deposit accepts input without storage backpressure',
   unresolved:'whether the physical finite buffers and event-phase scheduling achieve this upper bound, as distinct from proving only an upper bound'
  });
 }
 return {method:'exact rational dedicated serial-source-to-warehouse upper bounds',
  chains,qualifyingCount:chains.length,rejectedReasons:rejectCounts,
  certifiedFullActualRates:false};
}


// Rate-only model for uncontended feedforward recipe trees. No 0.05s ticks,
// packet positions, per-port phase states or duty-cycle unknowns.
// Equality is certified for the IDEAL work-conserving fluid network model,
// and only an upper bound for the finite-buffer discrete simulator.
function factorySteadyIsolatedDepositTrees(layout=state){
 const byId=new Map(layout.machines.map(m=>[m.id,m]));
 const connected=layout.routes.filter(r=>r.to&&byId.has(r.from.id)&&byId.has(r.to.id)&&
  !checkPath(r.path,r.from,r.to,r.id));
 const input=m=>connected.filter(r=>r.to.id===m);
 const output=m=>connected.filter(r=>r.from.id===m);
 function trace(id,r,seen){
  if(seen.has(id))return null;
  const machine=byId.get(id),recipe=machine&&getRecipe(machine);
  if(!recipe||!(recipe.seconds>0)||!(recipe.qty>0)||output(id).length!==1||
   output(id)[0]!==r)return null;
  if(!acceptsMaterial(byId.get(r.to.id),recipe.output,r.to.port)||
   [...streamMaterials(r)].length!==1||![...streamMaterials(r)].includes(recipe.output))
   return null;
  const filter=outPort(machine,r.from.port)?.filter||'';
  if(filter&&filter!=='任意'&&filter!==recipe.output)return null;
  const entries=Object.entries(recipe.inputs||{}),ins=input(id);
  if(entries.length!==ins.length)return null;
  seen.add(id);
  const children=[],routesUsed=new Set();
  for(const [item,need] of entries){
   if(!Number.isSafeInteger(need)||need<1)return null;
   const matching=ins.filter(edge=>getRecipe(byId.get(edge.from.id))?.output===item);
   if(matching.length!==1||routesUsed.has(matching[0].id))return null;
   const route=matching[0];
   if([...streamMaterials(route)].length!==1||
    ![...streamMaterials(route)].includes(item))return null;
   routesUsed.add(route.id);
   const child=trace(route.from.id,route,seen);
   if(!child)return null;
   children.push({item,need,tree:child});
  }
  let cycles=steadyExactMin(
   steadyExactDiv(STEADY_ONE,steadyExactQ(String(recipe.seconds))),
   steadyExactDiv(STEADY_ONE,steadyExactQ(recipe.qty)));
  for(const c of children)cycles=steadyExactMin(cycles,
   steadyExactDiv(c.tree.rate,steadyExactQ(c.need)));
  return {id,route:r.id,item:recipe.output,
   rate:steadyExactMul(cycles,steadyExactQ(recipe.qty)),children};
 }
 const flatten=t=>[...t.children.flatMap(c=>flatten(c.tree)),t.id];
 const express=t=>t.children.length===0?t.id:
  t.children.length===1?express(t.children[0].tree)+' → '+t.id:
  '('+t.children.map(c=>express(c.tree)).join(' + ')+') → '+t.id;
 const networks=[];
 for(const r of connected){
  if(byId.get(r.to.id).type!=='仓入')continue;
  const tree=trace(r.from.id,r,new Set());
  if(!tree)continue;
  networks.push({label:express(tree),machineSequence:flatten(tree),
   warehouse:r.to.id,terminalRoute:r.id,item:tree.item,
   outputRateUpper:steadyExactText(tree.rate),
   fluidModelRate:steadyExactText(tree.rate),
   hasMultipleIngredients:flatten(tree).some(id=>
    Object.keys(getRecipe(byId.get(id)).inputs||{}).length>1),
   certifiedUpper:true,certifiedFluidModelRate:true,certifiedActualRate:false,
   proof:'dedicated feedforward recipe tree; independent source rates, 1 item/s per belt, recipe stoichiometry, work-conserving ideal fluid flow',
   caveat:'No claim that physical finite FIFOs and event scheduling always attain the fluid-model rate'});
 }
 return {method:'rational work-conserving ideal rate network on source-to-stock DAGs',
  networks,networkCount:networks.length,globalPhysicalRatesCertified:false};
}
