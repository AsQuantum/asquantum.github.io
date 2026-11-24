'use strict';
// One SHARED inventory supernode for each commodity (not one node per
// warehouse-in / warehouse-out device).
//
// All equations below are exact symbolic identities of long-run AVERAGE
// flow. No simulated rates, no LP, no arbitrary scheduling weights.
//
// Since warehouse stock has no finite capacity, a stationary inventory is
// NOT required. A finite initially stocked warehouse can sustain mean
// net flow only if sum(in) - sum(out) >= 0. If positive, stock grows.
// If zero, stock need not be positive: structural cycles still require a
// separate initial-stock/reachability and FIFO-scheduling certificate.
function factorySteadyWarehouseSupernodes(model,linear){
 if(!model?.warehousePools||!model?.rateVariables||!linear?.pivotRelations)
  throw Error('warehouse pool and exact linear reductions required');
 const variable=new Map(model.rateVariables.map(v=>[v.id,v]));
 const free=new Set(linear.freeVariables);
 const pivot=new Map(linear.pivotRelations.map(r=>[r.variable,r]));
 const physicalRoutes=new Map(state.routes.map(r=>[r.id,r]));
 function ratio(x){
  const text=String(x),parts=text.split('/');
  return parts.length===2?steadyExactFraction(BigInt(parts[0]),BigInt(parts[1])):steadyExactQ(text);
 }
 function term(map,name,q){
  const next=steadyExactAdd(map.get(name)||STEADY_ZERO,q);
  if(steadyExactCmp(next,STEADY_ZERO)===0)map.delete(name);
  else map.set(name,next);
 }
 function addRate(map,flow,sign){
  if(!variable.has(flow))throw Error('Warehouse references unknown item flow: '+flow);
  if(free.has(flow)){term(map,flow,steadyExactQ(sign));return;}
  const expression=pivot.get(flow);
  if(!expression)throw Error('Warehouse flow not reducible: '+flow);
  for(const t of expression.terms)
   term(map,t.variable,steadyExactMul(steadyExactQ(sign),ratio(t.coefficient)));
 }
 function physicalPort(flow,kind){
  const record=variable.get(flow),route=physicalRoutes.get(record.route);
  if(!route)throw Error('No physical route for warehouse flow '+flow);
  const side=kind==='in'?'to':'from';
  return {flow,route:record.route,item:record.item,
   device:route[side].id,port:route[side].port};
 }
 const nodes=model.warehousePools.map(p=>{
  const inputPorts=p.inflowTerms.map(flow=>physicalPort(flow,'in'));
  const outputPorts=p.outflowTerms.map(flow=>physicalPort(flow,'out'));
  const expr=new Map();
  for(const flow of p.inflowTerms)addRate(expr,flow,1);
  for(const flow of p.outflowTerms)addRate(expr,flow,-1);
  const netAsFreeVariables=[...expr].sort(([a],[b])=>a.localeCompare(b)).map(([variable,q])=>({
   variable,coefficient:steadyExactText(q)
  }));
  return {
   item:p.item,
   node:'warehouse:'+p.item,
   inputPorts,outputPorts,
   inputTerms:[...p.inflowTerms],
   outputTerms:[...p.outflowTerms],
   initialStockFromSimulator:'ware[item] initialized empty by resetSimulation()',
   stockCapacity:'unbounded',
   outputDeviceBufferCapacity:3,
   reservedStock:'R_i=sum(warehouse-out reserved item slots for i); 0<=R_i<=S_i',
   freeStock:'F_i=S_i-R_i',
   emptyStockEvent:'F_i=0 forbids replenishing any warehouse-out FIFO until a ware-in arrival; previously reserved items may still dispatch',
   idealFluidBoundary:'For feasible fixed arrivals I_i and work-conserving demand D_i: O_i=min(I_i,D_i). If I_i<D_i the stock is exhausted; if I_i>D_i stock accumulates.',
   physicallyUnproved:'The feasible demand D_i itself depends on 3-item outlet FIFOs, ports, splitter RR and downstream backpressure.',
   stockDynamics:'S_i(t)=S_i(0)+sum(actual-incoming-events)-sum(actual-outgoing-events)',
   meanStockDrift:'sum(inflow long-run rates)-sum(outflow long-run rates)',
   // This inequality applies to any sustained limiting mean rates for
   // finite initial stock with no external/manual stock grants.
   sustainableNecessaryCondition:'netRate>=0',
   mustBalanceToZero:false,
   netAsFreeVariables,
   accumulatedOnly:outputPorts.length===0,
   equationsOnly:true,
   note:'Inventory drift is an exact balance, not a proof that RR/FIFO can realize a selected rate vector'
  };
 });
 return {method:'Exact rational elimination of warehouse supernode commodity-balance identities (not an LP)',
  nodes,materialCount:nodes.length,
  totalWarehouseInputPorts:nodes.reduce((s,n)=>s+n.inputPorts.length,0),
  totalWarehouseOutputPorts:nodes.reduce((s,n)=>s+n.outputPorts.length,0),
  globalRateFreedom:linear.freeDegrees,
  equationsOnly:true,
  requirements:['Nonnegative long-run stock drift','Physical belt and dedicated output queue limits',
   'Physical RR/FIFO can realize the candidate flows','Source reachability from finite initial inventory'],
  warnings:['Do not impose zero net warehouse drift: this would incorrectly force net production to zero.',
   'Warehouse loops with no initially available input cannot begin merely because flow equations have a positive solution.']
 };
}

// Further NECESSARY (not sufficient) exact rate bounds from pooled-stock
// nondepletion: for Σ positive(a_i*x_i) − Σ positive(b_j*x_j) >= 0,
// each negative term b_j*x_j cannot exceed the sum of positive terms.
// All symbolic free variables here are physical NONNEGATIVE mean rates.
// Unlike an LP this is only monotone algebraic implication propagation.
function factorySteadyPropagateWarehouseBounds(supernodes,bounds,{maxPasses=256}={}){
 if(!supernodes?.nodes||!bounds?.upper)throw Error('Warehouse supernodes and certified physical upper bounds required');
 const q=text=>{
  const p=String(text).split('/');
  return p.length===2?steadyExactFraction(BigInt(p[0]),BigInt(p[1])):steadyExactQ(text);
 };
 const current=new Map(Object.entries(bounds.upper).map(([id,value])=>[id,q(value)]));
 const reasons=new Map();
 let changed=true,passes=0;
 for(;changed&&passes<maxPasses;passes++){
  changed=false;
  for(const pool of supernodes.nodes){
   const terms=pool.netAsFreeVariables.map(entry=>({
    variable:entry.variable,coefficient:q(entry.coefficient)
   }));
   const gains=terms.filter(entry=>steadyExactCmp(entry.coefficient,STEADY_ZERO)>0);
   const losses=terms.filter(entry=>steadyExactCmp(entry.coefficient,STEADY_ZERO)<0);
   if(!losses.length)continue;
   let maxGain=STEADY_ZERO;
   for(const gain of gains){
    const cap=current.get(gain.variable);
    if(cap===undefined)throw Error('Missing proven upper on warehouse feedback source '+gain.variable);
    maxGain=steadyExactAdd(maxGain,steadyExactMul(gain.coefficient,cap));
   }
   for(const loss of losses){
    const cap=current.get(loss.variable);
    if(cap===undefined)throw Error('Missing proven upper on warehouse feedback withdrawal '+loss.variable);
    const absolute=steadyExactMul(loss.coefficient,steadyExactQ(-1));
    const possible=steadyExactDiv(maxGain,absolute);
    if(steadyExactCmp(possible,cap)<0){
     current.set(loss.variable,possible);
     reasons.set(loss.variable,'仓库「'+pool.item+'」无限期不透支：仓库流入总量必须覆盖流出');
     changed=true;
    }
   }
  }
 }
 return {
  method:'Exact rational implied upper bounds from warehouse nonnegative-drift inequalities, no LP',
  completed:!changed,passes,
  tightened:Object.fromEntries([...reasons].map(([variable,reason])=>[
   variable,{upper:steadyExactText(current.get(variable)),reason}])),
  forcedZero:[...current].filter(([_,value])=>value.n===0n).map(([key])=>key),
  note:'These are necessary upper bounds only, NOT reachable FIFO throughput or uniquely solved net rates'
 };
}

// Warehouse starvation is a BOUNDARY EVENT, not merely "inflow >= outflow".
// This closed form is exact for an IDEAL WORK-CONSERVING FLUID warehouse
// with constant EXOGENOUS feasible incoming rate and aggregate feasible
// outgoing service demand. It is NOT an AST1 FIFO/RR fixed-point solver:
// those rates must themselves be jointly certified elsewhere.
//
// Simulated stock includes items RESERVED into warehouse-out's physical
// three-item queues; free-to-reserve stock = ware[item]-reserved[item].
// No outflow is possible at zero free stock unless new arrivals replenish it.
// Long-run stock-level drift and sustained warehouse-out service obey:
//                O=min(I,D), drift=max(I-D,0).
function factorySteadyIdealWarehouseBoundary(inflow,demand,initialStock=0){
 const rational=value=>{
  const parts=typeof value==='string'?value.split('/'):null;
  return parts?.length===2?
   steadyExactFraction(BigInt(parts[0]),BigInt(parts[1])):
   steadyExactQ(value);
 };
 const input=rational(inflow),requested=rational(demand),stock=rational(initialStock);
 for(const [name,value] of [['inflow',input],['demand',requested],['initialStock',stock]]){
  if(steadyExactCmp(value,STEADY_ZERO)<0)throw Error(name+' must be nonnegative');
 }
 const compare=steadyExactCmp(input,requested);
 const service=steadyExactMin(input,requested);
 const growth=steadyExactSub(input,service);
 const depletion=compare<0?
  steadyExactDiv(stock,steadyExactSub(requested,input)):null;
 return {
  inflow:steadyExactText(input),
  feasibleRequestedOutflow:steadyExactText(requested),
  initialStock:steadyExactText(stock),
  longRunOutflow:steadyExactText(service),
  longRunNetInventoryGrowth:steadyExactText(growth),
  boundaryCase:compare<0?'starved':compare>0?'accumulating':'balanced',
  stockExhaustionSeconds:depletion===null?null:steadyExactText(depletion),
  rateDuringPositiveStock:steadyExactText(requested),
  equations:'S>=0; dS/dt=I-O; O<=D; at S=0 O<=I; under ideal work-conserving service, O=min(I,D)',
  complementarity:'(I-O)*(D-O)=0 with I-O>=0 and D-O>=0 in the long run',
  caveat:'Only exact for constant feasible rates and ideal pooled work-conserving service. AST1 finite 3-item warehouse-out FIFOs, 1/s ports, downstream scheduling, startup delays and feedback can change feasible demand and actual timing. Not a solved global steady state.'
 };
}
'use strict';
// Warehouse-out queue reservations are the same greedy, ORDERED, finite
// transition as the physical simulator. This is a priority rule, not a fair
// fluid share and not a proof of asymptotic per-outlet throughput.
//
// One scheduling tick, for one item i:
// freeStock_0 = S_i - sum(outlet reserved_i);
// grant_j = min(3 - q_j, freeStock_j) if that outlet has an output belt;
// freeStock_(j+1) = freeStock_j - grant_j;
// THEN each outlet independently attempts sending its FIFO head (<=1 item).
// With persistent supply starvation the first numbered output may get all
// new arrivals; later outlets are NOT guaranteed any positive long-run flow.
function factorySteadyWarehousePriorityModel(layout=state){
 if(!layout||!Array.isArray(layout.machines)||!Array.isArray(layout.routes))
  throw Error('Factory layout required for ordered warehouse outlets');
 const groups=new Map();
 for(const [index,m] of layout.machines.entries()){
  if(m.type!=='仓出'||!m.item)continue;
  const route=layout.routes.find(r=>r.from?.id===m.id&&r.from.port===0);
  const arr=groups.get(m.item)||[];
  arr.push({id:m.id,gameMachineIndex:index,routeId:route?.id||null,
   capacity:3,eligibleToReserve:!!route});
  groups.set(m.item,arr);
 }
 for(const outlets of groups.values())outlets.sort(warehouseMachinePriorityCompare);
 return {
  method:'deterministic greedy per-item warehouse-out reservation in numeric machine-ID order',
  capacityPerOutlet:3,
  groups:[...groups].map(([item,outlets])=>({item,outlets,
   competing:outlets.filter(x=>x.eligibleToReserve).length>1})),
  exactTransition:'grant_j=min(max(0,3-q_j),freeStock_j); freeStock_(j+1)=freeStock_j-grant_j; scan j by numeric machine-ID order',
  limitingCases:'Early outlets may monopolize newly replenished inventory while later outlets remain permanently starved.',
  caveat:'No per-outlet mean throughput follows from the priority rule alone. FIFO service, timing, and downstream backpressure determine q_j over time.'
 };
}
function factorySteadyWarehousePriorityAllocate(freeStock,outlets){
 let available=BigInt(freeStock);
 if(available<0n)throw Error('Negative available warehouse stock');
 const allocations=[];
 for(const x of outlets){
  const queue=Number(x.reserved??0),capacity=Number(x.capacity??3);
  if(!Number.isSafeInteger(queue)||!Number.isSafeInteger(capacity)||queue<0||capacity<1||queue>capacity)
   throw Error('Invalid warehouse outlet reserved queue length');
  const gap=x.eligibleToReserve===false?0n:BigInt(capacity-queue);
  const grant=gap<available?gap:available;
  available-=grant;
  allocations.push({id:x.id,oldReserved:queue,newReserved:queue+Number(grant),
   granted:grant.toString()});
 }
 return {remainingFreeStock:available.toString(),allocations,
  note:'Exact at the reservation phase only; does not predict actual FIFO dispatch or next replenishment.'};
}

// A graph-independent N-outlet supply/demand RATE allocator.
// This is exact for the specified *ideal priority fluid working regime*:
// a single material has a known constant exogenous sustainable supply and
// each outlet has a separately solved, feasible, continuously serviceable
// downstream demand. Outlet order is the same numeric-ID order as simulation.
// IMPORTANT: the live simulator has 3 reserved items per warehouse-out,
// so its actual asymptotic rate is not certified by this fluid shortcut alone.
function factorySteadyIdealWarehousePriorityRates(inflow,outlets,{portCapacity=1,rateUnit='items/s'}={}){
 if(!Array.isArray(outlets))throw Error('Priority outlets must be an array');
 const rational=value=>{
  const p=typeof value==='string'?value.split('/'):null;
  return p?.length===2?steadyExactFraction(BigInt(p[0]),BigInt(p[1])):steadyExactQ(value);
 };
 const input=rational(inflow),maxPort=rational(portCapacity);
 if(steadyExactCmp(input,STEADY_ZERO)<0||steadyExactCmp(maxPort,STEADY_ZERO)<0)
  throw Error('Negative supply or physical port capacity');
 const ids=new Set();
 const ordered=outlets.map(x=>{
  if(!x||typeof x.id!=='string'||!x.id||ids.has(x.id))
   throw Error('Each warehouse outlet requires a unique nonempty machine ID');
  ids.add(x.id);
  // No guessed demand: upstream production cannot determine a stock-out's
  // service capacity if the downstream machine has not yet been solved.
  if(x.downstreamDemand===undefined||x.downstreamDemand===null)
   throw Error('Unsolved downstream demand for '+x.id);
  const demand=rational(x.downstreamDemand);
  if(steadyExactCmp(demand,STEADY_ZERO)<0)throw Error('Negative downstream demand');
  return {id:x.id,connected:x.connected!==false,demand};
 }).sort(warehouseMachinePriorityCompare);
 let remaining=input;
 const rates=ordered.map(x=>{
  const cap=x.connected?steadyExactMin(x.demand,maxPort):STEADY_ZERO;
  const flow=steadyExactMin(remaining,cap);
  remaining=steadyExactSub(remaining,flow);
  return {id:x.id,downstreamDemand:steadyExactText(x.demand),
   capacityLimitedDemand:steadyExactText(cap),rate:steadyExactText(flow)};
 });
 return {method:'ordered residual-supply recursion on N warehouse-out devices; conditional ideal fluid working regime',
  rateUnit,initialSupply:steadyExactText(input),rates,
  stockGrowth:steadyExactText(remaining),
  certifiedInAssumedFluidRegime:true,certifiedActualDiscreteSimulator:false,
  requiredConditions:[
   'Known, sustainable EXOGENOUS warehouse arrivals for this item',
   'Each listed downstream demand is the actual feasible service rate given all dependencies',
   'Continuously backlogged ordered priority service; no hidden FIFO timing conflict',
   'A warehouse dependency cycle must be solved jointly, not by passing a guessed demand around the cycle'
  ]};
}
