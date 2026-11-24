'use strict';
// Automatically build a mean-rate supply/demand FIXED POINT from the actual
// machine graph. These are ideal continuous-service equations, NOT the
// simulator's finite FIFO phase model. No AST1 IDs or user-entered caps.
// A candidate is published only after exact rational residual checks.
function factorySteadyAutomaticFluidModel(layout=state,model=null,{unlimitedWarehouse=false}={}){
 if(!model){
  if(layout!==state)throw Error('Pass equations for other layouts');
  model=factorySteadyBuildEquations();
 }
 const nodes=new Map(layout.machines.map(m=>[m.id,m]));
 const lines=model.sharedLines;
 const ins=new Map([...nodes.keys()].map(k=>[k,[]])),outs=new Map([...nodes.keys()].map(k=>[k,[]]));
 const issues=[];
 for(let i=0;i<lines.length;i++){
  const r=lines[i];ins.get(r.to.id).push(i);outs.get(r.from.id).push(i);
 }
 const sourceRoutes=new Map(layout.routes.map(r=>[r.id,r]));
 const issue=(machine,reason)=>issues.push({machine,reason});
 for(const m of nodes.values()){
  const incoming=ins.get(m.id),outgoing=outs.get(m.id),recipe=getRecipe(m);
  if(!incoming.length&&!outgoing.length)continue;
  if(recipe&&outgoing.length>1)issue(m.id,'shared recipe output arbitration unspecified');
  if(m.type==='分流'&&incoming.length>1)issue(m.id,'multiple splitter inputs unspecified');
  if(m.type==='汇流'&&outgoing.length>1)issue(m.id,'multiple merger outputs unspecified');
  if(m.type==='仓出'&&outgoing.length>1)issue(m.id,'multiple warehouse output ports unspecified');
  if(!recipe&&!['分流','汇流','仓出','仓入','电脑'].includes(m.type))
   issue(m.id,'unrecognized logistics transition');
  for(const i of incoming){
   const r=lines[i],physical=sourceRoutes.get(r.route);
   const raw=physical?[...streamMaterials(physical)]:r.materials;
   if(raw.some(item=>!r.materials.includes(item)))
    issue(m.id,'physical FIFO can carry rejected material on '+r.route);
   if((recipe||m.type==='分流')&&r.materials.length>1)
    issue(m.id,'mixed FIFO feeding a recipe or splitter needs ordered-item equations');
  }
  if(m.type==='分流'){
   const items=new Set(incoming.flatMap(i=>lines[i].materials));
   for(const r of layout.routes.filter(r=>r.from.id===m.id)){
    const filter=outPort(m,r.from.port)?.filter||'';
    if(filter&&filter!=='任意'&&[...items].some(item=>item!==filter))
     issue(m.id,'selected incompatible splitter filter can hold FIFO head');
   }
  }
 }
 if(issues.length)return {status:'unresolved',issues,actualLongRunRatesSolved:false};
 const startup=typeof factorySteadyGenericStartupReachability==='function'?
  factorySteadyGenericStartupReachability(layout,{initialWarehouseItems:unlimitedWarehouse?(model.warehousePools||[]).map(p=>p.item):[]}):null;
 const noMaterial=lines.map(r=>!r.materials.length);
 const disabled=lines.map((r,i)=>noMaterial[i]||
  (startup&&!(startup.potentiallyActiveItemsByRoute[r.route]||[]).length));
 const groups=(model.warehousePools||[]).map(p=>({item:p.item,
  inbound:lines.map((r,i)=>[r,i]).filter(([r])=>nodes.get(r.to.id).type==='仓入'&&r.materials.includes(p.item)).map(([,i])=>i),
  outbound:p.withdrawalMachineOrder.flatMap(id=>outs.get(id)||[])}));
 const recipeGroups=new Map();
 for(const m of nodes.values()){
  const r=getRecipe(m);if(!r)continue;
  recipeGroups.set(m.id,Object.entries(r.inputs||{}).map(([item,qty])=>({
   item,qty,ports:ins.get(m.id).filter(i=>lines[i].materials.includes(item))})));
 }
 const Q={zero:STEADY_ZERO,one:STEADY_ONE,of:steadyRegionQ,add:steadyExactAdd,
  sub:steadyExactSub,mul:steadyExactMul,div:steadyExactDiv,cmp:steadyExactCmp};
 const F={zero:0,one:1,of:Number,add:(a,b)=>a+b,sub:(a,b)=>a-b,
  mul:(a,b)=>a*b,div:(a,b)=>a/b,cmp:(a,b)=>a<b?-1:a>b?1:0};
 function operators(o){
  const min=(a,b)=>o.cmp(a,b)<=0?a:b;
  const sum=xs=>xs.reduce(o.add,o.zero);
  const bounded=x=>o.cmp(x,o.zero)<0?o.zero:min(o.one,x);
  function water(supply,caps){
   const sorted=caps.map((cap,i)=>({cap,i})).sort((a,b)=>o.cmp(a.cap,b.cap)||a.i-b.i);
   const result=caps.map(()=>o.zero);let left=min(supply,sum(caps));
   for(let i=0;i<sorted.length;i++){
    const share=o.div(left,o.of(sorted.length-i));
    const a=min(sorted[i].cap,share);
    result[sorted[i].i]=a;left=o.sub(left,a);
   }
   return result;
  }
  return {min,sum,bounded,water};
 }
 // Mixed flows are conserved through merger-only transport. A mixed belt
 // may end at a warehouse or destruction sink, but cannot be distributed
 // among multiple mixed outputs by a mean-rate model without composition.
 function materialRates(x,o,strict=false){
  const {sum}=operators(o),cache=new Map(),visiting=new Set();
  function read(i){
   if(cache.has(i))return cache.get(i);
   const r=lines[i],v=new Map();
   if(!r.materials.length||o.cmp(x[i],o.zero)===0){cache.set(i,v);return v;}
   if(r.materials.length===1){v.set(r.materials[0],x[i]);cache.set(i,v);return v;}
   if(visiting.has(i))throw Error('positive mixed recirculation requires ordered material dynamics');
   visiting.add(i);
   if(nodes.get(r.from.id).type!=='汇流')throw Error('mixed material origin unspecified');
   for(const j of ins.get(r.from.id))for(const [item,q] of read(j))
    v.set(item,o.add(v.get(item)||o.zero,q));
   visiting.delete(i);
   // During fixed point iteration inflow and outflow can differ. Normalize
   // transient composition only, never the final exact conservation check.
   const total=sum([...v.values()]);
   if(strict&&o.cmp(total,x[i])!==0)throw Error('mixed flow conservation residual');
   if(!strict&&o.cmp(total,o.zero)>0){
    for(const [item,q] of v)v.set(item,o.mul(q,o.div(x[i],total)));
   }
   cache.set(i,v);return v;
  }
  return lines.map((_,i)=>read(i));
 }
 function evaluate(s,d,o){
  const {min,sum,bounded,water}=operators(o);
  const x=s.map((a,i)=>disabled[i]?o.zero:min(a,d[i]));
  const material=materialRates(x,o);
  const ns=lines.map(()=>o.zero),nd=lines.map(()=>o.zero);
  const capOffers=ids=>ids.map(i=>disabled[i]?o.zero:s[i]);
  const capDemands=ids=>ids.map(i=>noMaterial[i]?o.zero:d[i]);
  // For a participant, compute the allocation with ITS OWN offer/demand
  // replaced by its physical capacity. min(actualOffer, actualDemand)
  // reproduces the fair allocation while preventing self-capped zero offers.
  function counterfactual(total,others,i,ids,forDemand=false){
   if((forDemand?noMaterial:disabled)[ids[i]])return o.zero;
   const caps=others.slice();caps[i]=o.one;
   return water(total,caps)[i];
  }
  for(const m of nodes.values()){
   const I=ins.get(m.id),O=outs.get(m.id),rec=getRecipe(m);
   if(rec){
    const G=recipeGroups.get(m.id),period=o.div(o.one,o.of(rec.seconds));
    const qty=o.of(rec.qty);
    const inputOffers=G.map(g=>o.div(sum(capOffers(g.ports)),o.of(g.qty)));
    const inputLimit=inputOffers.reduce(min,period);
    if(O.length)ns[O[0]]=bounded(o.mul(qty,inputLimit));
    const downstream=O.length?o.div(noMaterial[O[0]]?o.zero:d[O[0]],qty):o.zero;
    for(let k=0;k<G.length;k++){
     const g=G[k];
     let other=min(period,downstream);
     for(let j=0;j<G.length;j++)if(j!==k)other=min(other,inputOffers[j]);
     const demand=o.mul(other,o.of(g.qty)),offers=capOffers(g.ports);
     for(let p=0;p<g.ports.length;p++)
      nd[g.ports[p]]=counterfactual(demand,offers,p,g.ports,true);
    }
   }else if(m.type==='分流'){
    const demand=capDemands(O);
    if(I.length)nd[I[0]]=bounded(sum(demand));
    const supply=I.length&&!disabled[I[0]]?s[I[0]]:o.zero;
    for(let p=0;p<O.length;p++)ns[O[p]]=counterfactual(supply,demand,p,O);
   }else if(m.type==='汇流'){
    const offers=capOffers(I);
    if(O.length)ns[O[0]]=bounded(sum(offers));
    const demand=O.length&&!noMaterial[O[0]]?d[O[0]]:o.zero;
    for(let p=0;p<I.length;p++)nd[I[p]]=counterfactual(demand,offers,p,I,true);
   }else if(m.type==='仓入'){
    for(const i of I)nd[i]=o.one;
   }else if(m.type==='电脑'){
    const offers=capOffers(I);
    for(let p=0;p<I.length;p++)nd[I[p]]=counterfactual(o.one,offers,p,I,true);
   }
  }
  // Shared warehouse per material: strict continuous priority, not an
  // assertion about the exact finite reservation FIFO schedule.
  for(const g of groups){
   if(unlimitedWarehouse){for(const i of g.outbound)ns[i]=o.one;continue;}
   let remaining=sum(g.inbound.map(i=>material[i].get(g.item)||o.zero));
   for(const i of g.outbound){
    ns[i]=bounded(remaining);
    remaining=o.sub(remaining,min(ns[i],disabled[i]?o.zero:d[i]));
   }
  }
  for(let i=0;i<lines.length;i++){
   ns[i]=disabled[i]?o.zero:bounded(ns[i]);nd[i]=noMaterial[i]?o.zero:bounded(nd[i]);
  }
  return {s:ns,d:nd};
 }
 // Discover the active fixed point numerically (no time or item simulation).
 // Reconstruct bounded rational values and re-evaluate ALL equations with
 // exact BigInt fractions. A floating residual alone never passes.
 function rational(value){
  if(Math.abs(value)<1e-10)return STEADY_ZERO;
  if(Math.abs(value-1)<1e-10)return STEADY_ONE;
  let z=value,a0=0,a1=1,b0=1,b1=0;
  for(let k=0;k<32;k++){
   const f=Math.floor(z),a=f*a1+a0,b=f*b1+b0;
   if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||b>1000000)break;
   if(Math.abs(a/b-value)<2e-10)return steadyExactFraction(BigInt(a),BigInt(b));
   a0=a1;a1=a;b0=b1;b1=b;
   const rem=z-f;if(rem<1e-14)break;z=1/rem;
  }
  throw Error('fixed point not reconstructible as bounded rational');
 }
 function solve({maxIterations=2500,tolerance=1e-11,high=false}={}){
  let s=lines.map((_,i)=>disabled[i]?0:high?1:0),d=lines.map((_,i)=>noMaterial[i]?0:1);
  let residual=Infinity,iterations=0;
  try{
   for(;iterations<maxIterations;iterations++){
    const next=evaluate(s,d,F);
    residual=0;
    for(let i=0;i<lines.length;i++){
     residual=Math.max(residual,Math.abs(next.s[i]-s[i]),Math.abs(next.d[i]-d[i]));
    }
    if(residual<tolerance)break;
    s=s.map((v,i)=>(v+next.s[i])/2);
    d=d.map((v,i)=>(v+next.d[i])/2);
   }
   if(residual>=tolerance)return {status:'unresolved',reason:'fluid fixed point did not converge',iterations,residual};
   const sq=s.map(rational),dq=d.map(rational);
   const exact=evaluate(sq,dq,Q);
   if(sq.some((v,i)=>steadyExactCmp(v,exact.s[i])||steadyExactCmp(dq[i],exact.d[i])))
    return {status:'unresolved',reason:'rational fixed point fails exact local equations',iterations,residual};
   const x=sq.map((v,i)=>steadyExactMin(v,dq[i]));
   const rates=materialRates(x,Q,true),point=new Map();
   for(let i=0;i<lines.length;i++){
    for(let k=0;k<lines[i].materials.length;k++)
     point.set(lines[i].terms[k],rates[i].get(lines[i].materials[k])||STEADY_ZERO);
    if(steadyExactCmp(steadyExactSum([...rates[i].values()]),x[i]))
     throw Error('line composition does not sum to actual rate');
   }
   const cycles={};
   for(const m of model.machineEquations){
    const c=steadyExactDiv(steadyExactSum(m.output.rateTerms.map(t=>point.get(t)||STEADY_ZERO)),steadyRegionQ(m.output.amountPerCycle));
    cycles[m.machine]=c;point.set(m.cycleVar,c);
    if(steadyExactCmp(c,steadyExactDiv(STEADY_ONE,steadyRegionQ(m.cyclePeriodSeconds)))>0)
     throw Error('recipe period violation '+m.machine);
    for(const g of m.inputs){
     const actual=steadyExactSum(g.rateTerms.map(t=>point.get(t)||STEADY_ZERO));
     if(steadyExactCmp(actual,steadyExactMul(c,steadyRegionQ(g.amountPerCycle))))
      throw Error('recipe material balance violation '+m.machine+' '+g.item);
    }
   }
   for(const j of model.junctionEquations)for(const p of j.perMaterial){
    if(steadyExactCmp(steadyExactSum(p.received.map(t=>point.get(t)||STEADY_ZERO)),
      steadyExactSum(p.sent.map(t=>point.get(t)||STEADY_ZERO))))
     throw Error('junction balance violation '+j.machine+' '+p.item);
   }
   const inflow={},outflow={};
   for(const [item,g] of Object.entries(model.warehouseFlow)){
    inflow[item]=steadyExactSum(g.inflow.map(t=>point.get(t)||STEADY_ZERO));
    outflow[item]=steadyExactSum(g.outflow.map(t=>point.get(t)||STEADY_ZERO));
    if(!unlimitedWarehouse&&steadyExactCmp(inflow[item],outflow[item])<0)throw Error('warehouse depletion '+item);
   }
   // Snapshot of the unconstrained withdrawal demand at THIS fixed point.
   // Do not re-solve the rest of the network or increase other suppliers.
   const withdrawalDemand={},potentialNet={};
   for(const g of groups)withdrawalDemand[g.item]=steadyExactSum(g.outbound.map(i=>dq[i]));
   for(const item of new Set([...Object.keys(inflow),...Object.keys(withdrawalDemand)]))
    potentialNet[item]=steadyExactSub(inflow[item]||STEADY_ZERO,withdrawalDemand[item]||STEADY_ZERO);
   return {status:'conditional-fixed-point',iterations,residual,point,cycles,inflow,outflow,withdrawalDemand,potentialNet,
    routeFlows:Object.fromEntries(lines.map((r,i)=>[r.route,Object.fromEntries(rates[i])])),
    exactLocalEquations:true,actualLongRunRatesSolved:false};
  }catch(e){return {status:'unresolved',reason:e.message,iterations,residual};}
 }
 return {status:'compiled',solve,actualLongRunRatesSolved:false,
  assumptions:['continuous work-conserving service','homogeneous recipe/splitter inputs; mixed merger tails conserved',
   'ideal port round robin; fair allocation for same-ingredient competing ports','strict continuous warehouse priority',
   unlimitedWarehouse?'all warehouse outlets have unlimited item supply; negative net allowed':'empty initial physical buffers and warehouse','fixed point existence/uniqueness not guaranteed']};
}
function factorySteadyAutomaticFluidBudget(layout=state,model=null,options={}){
 const compiled=factorySteadyAutomaticFluidModel(layout,model,options);
 if(compiled.status!=='compiled')return compiled;
 const low=compiled.solve(),high=compiled.solve({high:true});
 if(low.status!=='conditional-fixed-point')return low;
 if(high.status!=='conditional-fixed-point')return high;
 for(const [id,value] of low.point)
  if(steadyExactCmp(value,high.point.get(id)||STEADY_ZERO))
   return {status:'unresolved',reason:'different initial offers yield different fixed points',actualLongRunRatesSolved:false};
 const numbers=xs=>Object.fromEntries(Object.entries(xs).map(([k,v])=>[k,steadyExactNumber(v)]));
 const fractions=xs=>Object.fromEntries(Object.entries(xs).map(([k,v])=>[k,steadyExactText(v)]));
 // A rate fixed point can have nonunique latent demand. Do not invent a
 // demand snapshot if the two validated initializations disagree.
 const demandConsistent=Object.keys(low.withdrawalDemand).every(item=>
  steadyExactCmp(low.withdrawalDemand[item],high.withdrawalDemand[item]||STEADY_ZERO)===0);
 return {status:'conditional-fixed-point',warehouseSupply:options.unlimitedWarehouse?'unlimited':'constrained',inflow:numbers(low.inflow),outflow:numbers(low.outflow),
  withdrawalDemand:demandConsistent?numbers(low.withdrawalDemand):null,
  potentialNet:demandConsistent?numbers(low.potentialNet):null,
  machineCycles:numbers(low.cycles),routeFlows:Object.fromEntries(Object.entries(low.routeFlows).map(([id,items])=>[id,numbers(items)])),
  fractions:{inflow:fractions(low.inflow),outflow:fractions(low.outflow),machineCycles:fractions(low.cycles),withdrawalDemand:demandConsistent?fractions(low.withdrawalDemand):null,potentialNet:demandConsistent?fractions(low.potentialNet):null,
   routes:Object.fromEntries(Object.entries(low.routeFlows).map(([id,items])=>[id,fractions(items)]))},
  iterations:[low.iterations,high.iterations],exactLocalEquations:true,actualLongRunRatesSolved:false,
  assumptions:compiled.assumptions,
  caveat:'Both initializations found the same exact conditional fluid fixed point; this is not a proof of unique or reachable discrete FIFO/RR throughput.'};
}
