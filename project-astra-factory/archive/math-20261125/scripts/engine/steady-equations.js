'use strict';
// Every AST1 route has per-material rate variables, one SHARED belt capacity,
// and exactly one shared capacity for each connected physical port.
// This builder writes the equations; it never simulates time, invokes LP or
// selects an arbitrary candidate from a non-unique feasible rate set.
function factorySteadyBuildEquations(){
 const machines=new Map(state.machines.map(m=>[m.id,m]));
 const routes=state.routes.filter(r=>r.to&&machines.has(r.from.id)&&machines.has(r.to.id)&&
  !checkPath(r.path,r.from,r.to,r.id));
 const materialByRoute=new Map();
 const sharedLines=[],rateVariables=[],machineEquations=[],junctionEquations=[],warehouseFlow={};
 const flowId=(r,item)=>'flow:'+r.id+':'+item;
 for(const r of routes){
  const source=machines.get(r.from.id),dest=machines.get(r.to.id);
  const out=outPort(source,r.from.port);
  const filter=source.type==='分流'?(out?.filter||''):null;
  const materials=[...streamMaterials(r)].filter(item=>item&&acceptsMaterial(dest,item,r.to.port)&&
   (!filter||filter==='任意'||filter===item)).sort();
  materialByRoute.set(r.id,materials);
  const terms=materials.map(item=>flowId(r,item));
  for(const item of materials)rateVariables.push({id:flowId(r,item),route:r.id,item});
  sharedLines.push({route:r.id,from:r.from,to:r.to,
   capacityPerSecond:'1',materials,terms,
   inequality:'sum(terms)<=1'});
 }
 const matching=(list,item)=>list.filter(r=>materialByRoute.get(r.id).includes(item))
  .map(r=>flowId(r,item));
 for(const m of state.machines){
  const inputRoutes=routes.filter(r=>r.to.id===m.id),outputRoutes=routes.filter(r=>r.from.id===m.id);
  const rec=getRecipe(m);
  if(rec){
   const cycle='cycles:'+m.id;
   const inputs=Object.entries(rec.inputs||{}).map(([item,qty])=>({
    item,qty:String(qty),amountPerCycle:String(qty),rateTerms:matching(inputRoutes,item),
    equation:'sum(inputRates)='+String(qty)+'*'+cycle}));
   machineEquations.push({machine:m.id,cycleVar:cycle,
    cyclePeriodSeconds:String(rec.seconds),cyclesPerSecondMax:'1/'+String(rec.seconds),
    maxCyclesPerSecond:'1/'+String(rec.seconds),
    inputs,output:{item:rec.output,qty:String(rec.qty),amountPerCycle:String(rec.qty),
     rateTerms:matching(outputRoutes,rec.output),
     equation:'sum(outputRates)='+String(rec.qty)+'*'+cycle}});
  }
  if(m.type==='分流'||m.type==='汇流'){
   const all=new Set([...inputRoutes,...outputRoutes].flatMap(r=>materialByRoute.get(r.id)));
   junctionEquations.push({machine:m.id,type:m.type,
    perMaterial:[...all].sort().map(item=>({item,
     received:matching(inputRoutes,item),sent:matching(outputRoutes,item),
     equation:'sum(received)=sum(sent)'})),
    serviceOrder:m.type==='汇流'?'physical-input-left-middle-right':'physical-output-round-robin',
    inputPorts:getPorts(m).filter(p=>p.kind==='in').map(p=>p.index),
    outputPorts:getPorts(m).filter(p=>p.kind==='out').map(p=>p.index),
    perInputFIFO:m.type==='分流',
    sharedOutputFIFO:m.type==='汇流'?3:null,
    filterMismatchRule:m.type==='分流'?'halt-whole-splitter-hold-head-and-cursor':null,
    outputFilters:m.type==='分流'?getPorts(m).filter(p=>p.kind==='out')
     .filter(p=>p.filter&&p.filter!=='任意')
     .map(p=>({port:p.index,requiredItem:p.filter})):[]});
  }
  if(m.type==='仓入'||m.type==='仓出'){
   for(const r of (m.type==='仓入'?inputRoutes:outputRoutes)){
    for(const item of materialByRoute.get(r.id)){
     const group=warehouseFlow[item]??={inflow:[],outflow:[]};
     group[m.type==='仓入'?'inflow':'outflow'].push(flowId(r,item));
    }
   }
  }
 }
 // A mixed physical recipe inlet is a STRICT FIFO, not independently
 // selectable per-product supply. The recipe's 3x ingredient input buffers
 // provide the finite bounds used by the algebraic deadlock invariant.
 const fifoRecipeInlets=[];
 for(const m of state.machines){
  const recipe=getRecipe(m);if(!recipe)continue;
  for(const r of routes.filter(r=>r.to.id===m.id)){
   const items=materialByRoute.get(r.id).filter(item=>Object.hasOwn(recipe.inputs||{},item));
   if(items.length<2)continue;
   fifoRecipeInlets.push({machine:m.id,route:r.id,port:r.to.port,items,
    inputBufferCaps:Object.fromEntries(items.map(item=>[item,3*recipe.inputs[item]])),
    recipeRequirement:Object.fromEntries(items.map(item=>[item,recipe.inputs[item]])),
    requiredSteadyProportions:items.map(item=>String(recipe.inputs[item])).join(':'),
    immutableFIFOOrderKnown:false,
    constraint:'An immutable FIFO supply ratio incompatible with recipe demands guarantees eventual deadlock of bounded inputs',
    proofMethod:'cycle invariant ai*buffer[j]-aj*buffer[i] with finite bounds',
    proofFunction:'steadyExactPeriodicFifoDeadlock'});
  }
 }
 // Queue states are necessary for the exact timed-event state model.
 // Merger scan order and output FIFO are DIFFERENT schedulers: max-min
 // rates alone cannot determine arbitrary mixed FIFO sequences.
 const queueModels={
  recipeIngredients:[],productionOutputs:[],mergers:[],splitters:[],warehouseOutputs:[],warehouseInputs:[],quantumConsumers:[]
 };
 for(const m of state.machines){
  const rec=getRecipe(m);
  if(rec){
   queueModels.recipeIngredients.push({
    machine:m.id,perMaterialIndependent:true,
    queues:Object.entries(rec.inputs||{}).map(([item,need])=>({
     item,capacity:3*need,physicalPortFIFO:false,
     perIngredientPortProvenanceFIFO:true,
     consumePerCycle:need,queueType:'per-item independent FIFO; input port origin tracked for accounting'
    })),
    consumeCondition:'each ingredient queue has at least recipe-required count'
   });
   queueModels.productionOutputs.push({machine:m.id,material:rec.output,producedPerCycle:rec.qty,capacity:rec.qty*20,queueType:'one crafted-item output FIFO'});
  }
  if(m.type==='汇流'){
   queueModels.mergers.push({
    machine:m.id,
    scanInputPorts:getPorts(m).filter(p=>p.kind==='in').map(p=>p.index),
    scanOrder:'physical left-middle-right, skipping empty ports',
    physicalInletCapacityPerPort:0,
    sharedFIFOCapacity:3,
    sharedQueueReferencesExistingInputItems:false,
    inputAcquisition:'scan READY input belt heads in port round robin',
     dequeueRule:'shared FIFO head sends independently; no bypass when output blocked',
    backpressure:'when output FIFO full, items remain on incoming conveyor belts'
   });
  }else if(m.type==='分流'){
   queueModels.splitters.push({
    machine:m.id,inputCapacity:3,inputQueue:'one physical FIFO',
    dequeueRule:'physical-output round robin with blocking filter mismatch'
   });
  }else if(m.type==='仓出'){
   queueModels.warehouseOutputs.push({
    machine:m.id,item:m.item||null,capacity:3,
    queueType:'dedicated reserved-output FIFO',sharedInventory:true,
    reserveConstraint:'sum(outputReservations[item])<=warehouseStock[item]',
    withdrawalAccounting:'debit global stock and count outflow only upon successful FIFO dispatch'
   });
  }else if(m.type==='仓入'){
   queueModels.warehouseInputs.push({
    machine:m.id,capacity:0,intake:'immediate inventory credit, no item queue'
   });
  }else if(m.type==='电脑'){
   queueModels.quantumConsumers.push({machine:m.id,capacity:10,queueType:'one ANY-material FIFO',serviceIntervalSeconds:1,dequeueAction:'destroy FIFO head with no warehouse credit'});
  }
 }
 const portResources=[];
 for(const m of state.machines){
  for(const port of getPorts(m)){
   const key=port.kind==='in'?'to':'from';
   const linked=routes.find(r=>r[key]?.id===m.id&&r[key].port===port.index);
   if(!linked)continue;
   portResources.push({machine:m.id,kind:port.kind,index:port.index,route:linked.id,
    capacityPerSecond:'1',terms:materialByRoute.get(linked.id).map(item=>flowId(linked,item)),
    inequality:'sum(terms)<=1'});
  }
 }
 // Priority MUST match simulation.js: numeric machine-ID ordering, not\n // arbitrary insertion order in the layout array.\n const machineOrder=new Map(state.machines.map((m,i)=>[m.id,i]));
 const warehousePools=Object.entries(warehouseFlow).map(([item,group])=>{
  const sources=state.machines.filter(m=>m.type==='仓出'&&m.item===item)
   .sort(warehouseMachinePriorityCompare);
  return {item,inflowTerms:[...group.inflow],outflowTerms:[...group.outflow],
   inventoryDerivative:'sum(inflow)-sum(outflow)',
   nonDepletion:'sum(outflow)<=sum(inflow)',
   withdrawalMachineOrder:sources.map(m=>m.id),
   dispatchSemantics:'one shared inventory; every output has a reserved 3-item FIFO; shared reservations cannot exceed stock; stock debited upon successful dispatch'};
 });
 const conditionalFairness=junctionEquations.map(j=>{
  const m=machines.get(j.machine);
  if(j.type==='汇流'){
   const inPorts=getPorts(m).filter(p=>p.kind==='in');
   return {machine:m.id,resource:'single-shared-output',participants:inPorts.map(p=>({
    physicalPort:p.index,terms:routes.filter(r=>r.to.id===m.id&&r.to.port===p.index)
     .flatMap(r=>materialByRoute.get(r.id).map(item=>flowId(r,item)))})),
    rule:'physical-input RR over READY belt heads, skipping unavailable inputs; no unconditional max-min identity',
    piecewise:'IDEALIZED ONLY if independent continuously backlogged inputs and an unblocked output: portFlow[i]=min(sustainableOffer[i],lambda)'};
  }
  const outPorts=getPorts(m).filter(p=>p.kind==='out');
  return {machine:m.id,resource:'single-shared-input',participants:outPorts.map(p=>({
   physicalPort:p.index,terms:routes.filter(r=>r.from.id===m.id&&r.from.port===p.index)
    .flatMap(r=>materialByRoute.get(r.id).map(item=>flowId(r,item)))})),
   rule:'physical-output RR with actual FIFO head, connected output availability and absorbing filter mismatch; no unconditional fair-share equality',
   piecewise:'IDEALIZED ONLY with compatible head, continuously ready outputs and no RR phase/queue conflict: outletFlow[i]=min(sustainableDemand[i],lambda)'};
 });
 const graph=new Map();
 const addEdge=(a,b)=>{
  if(!graph.has(a))graph.set(a,new Set());
  if(!graph.has(b))graph.set(b,new Set());
  graph.get(a).add(b);
 };
 for(const m of state.machines)graph.set('machine:'+m.id,new Set());
 for(const r of routes)addEdge('machine:'+r.from.id,'machine:'+r.to.id);
 const byRoute=new Map(routes.map(r=>[r.id,r]));
 for(const pool of warehousePools){
  const stock='warehouse:'+pool.item;
  if(!graph.has(stock))graph.set(stock,new Set());
  for(const term of pool.inflowTerms){
   const id=term.slice('flow:'.length).split(':')[0],r=byRoute.get(id);
   if(r)addEdge('machine:'+r.to.id,stock);
  }
  for(const id of pool.withdrawalMachineOrder)addEdge(stock,'machine:'+id);
 }
 const indices=new Map(),lowlinks=new Map(),stack=[],onStack=new Set();
 const feedbackComponents=[];
 let sequence=0;
 function visit(v){
  indices.set(v,sequence);lowlinks.set(v,sequence);sequence++;
  stack.push(v);onStack.add(v);
  for(const w of graph.get(v)){
   if(!indices.has(w)){
    visit(w);lowlinks.set(v,Math.min(lowlinks.get(v),lowlinks.get(w)));
   }else if(onStack.has(w))lowlinks.set(v,Math.min(lowlinks.get(v),indices.get(w)));
  }
  if(lowlinks.get(v)===indices.get(v)){
   const component=[];
   while(true){
    const w=stack.pop();onStack.delete(w);component.push(w);
    if(w===v)break;
   }
   if(component.length>1||graph.get(v).has(v))feedbackComponents.push(component.sort());
  }
 }
 for(const v of graph.keys())if(!indices.has(v))visit(v);
 feedbackComponents.sort((a,b)=>b.length-a.length);
 return {sharedLines,rateVariables,machineEquations,junctionEquations,warehouseFlow,
  queueModels,fifoRecipeInlets,portResources,warehousePools,conditionalFairness,feedbackComponents,
  verified:'Physical identities, shared-port capacity, inventory constraints and feedback dependencies are modeled; the coupled global scheduler is not yet solved'};
}

// Explain which exact recipe-demand equalities must propagate toward
// upstream splitters. These equations hold for ANY sustainable long-run
// operation, but are NOT a solution to RR arbitration or FIFO blocking.
function factorySteadyRecipeDemandTrace(machineId,model=null){
 model=model||factorySteadyBuildEquations();
 const machine=state.machines.find(m=>m.id===machineId),recipe=machine&&getRecipe(machine);
 if(!recipe)return null;
 const rule=model.machineEquations.find(x=>x.machine===machineId);
 if(!rule)return null;
 const varById=new Map(model.rateVariables.map(v=>[v.id,v]));
 const routes=new Map(state.routes.map(r=>[r.id,r]));
 const upstream=[];
 for(const ingredient of rule.inputs){
  const sources=[];
  for(const variable of ingredient.rateTerms){
   const item=varById.get(variable);
   if(!item)throw Error('Unknown material variable in recipe '+variable);
   const route=routes.get(item.route);
   const from=route&&state.machines.find(m=>m.id===route.from.id);
   if(!from)throw Error('Recipe source route is not connected: '+item.route);
   const sameMaterialJunction=model.junctionEquations.find(j=>j.machine===from.id)
    ?.perMaterial.find(j=>j.item===ingredient.item);
   const competitor=sameMaterialJunction?
    sameMaterialJunction.sent.filter(v=>v!==variable).map(v=>varById.get(v)?.route||v):[];
   const upstreamRoutes=sameMaterialJunction?
    sameMaterialJunction.received.map(v=>varById.get(v)?.route||v):[];
   sources.push({
    route:item.route,item:item.item,fromMachine:from.id,
    fromName:typeof label==='function'?label(from):from.type,
    fromType:from.type,
    materialSharedWithOtherItems:model.sharedLines.find(x=>x.route===item.route)?.materials.length>1,
    upstreamJunction:sameMaterialJunction?{
     machine:from.id,kind:from.type,
     incomingRoutes:upstreamRoutes,
     competingOutgoingRoutes:competitor,
     exactConservation:'sum(incoming routes)=this demanded route+sum(competing outgoing routes)',
     arbitrationResolved:false
    }:null
   });
  }
  upstream.push({
   item:ingredient.item,neededPerCycle:ingredient.amountPerCycle,
   exactDemand:'sum(item inflows)='+ingredient.amountPerCycle+'*'+rule.cycleVar,
   routes:sources
  });
 }
 return {
  machine:machineId,
  machineName:typeof label==='function'?label(machine):machine.type,
  cycleVar:rule.cycleVar,
  secondsPerCycle:rule.cyclePeriodSeconds,
  inputRequirements:upstream,
  outputRequirement:'sum(output flows)='+rule.output.amountPerCycle+'*'+rule.cycleVar,
  scope:'necessary equality constraints only; no RR/FIFO/backpressure fixed point solved'
 };
}
