'use strict';
// Generic, layout-derived source/terminal analysis for long-run-rate modelling.
// No AST1 machine IDs and no assumption that the physical machine graph is a DAG.
// This is a structural constraint decomposition, NOT a rate certificate.
function factorySteadyGenericTerminalGraph(layout=state){
 if(!layout||!Array.isArray(layout.machines)||!Array.isArray(layout.routes))
  throw Error('Factory layout required');
 const byId=new Map(layout.machines.map(m=>[m.id,m]));
 if(byId.size!==layout.machines.length)throw Error('Duplicate machine IDs');
 const incoming=new Map([...byId.keys()].map(id=>[id,[]]));
 const outgoing=new Map([...byId.keys()].map(id=>[id,[]]));
 const valid=[],invalidRoutes=[],openRoutes=[];
 for(const r of layout.routes){
  if(!r.to){openRoutes.push(r.id);continue;}
  if(!byId.has(r.from?.id)||!byId.has(r.to.id)||
   (typeof checkPath==='function'&&
    (typeof state!=='undefined'&&layout===state)&&
    checkPath(r.path,r.from,r.to,r.id))){
   invalidRoutes.push(r.id);continue;
  }
  valid.push(r);
  outgoing.get(r.from.id).push(r);
  incoming.get(r.to.id).push(r);
 }
 const sourceIDs=layout.machines.filter(m=>{
  if(m.type==='仓出')return !!m.item;
  const rec=getRecipe(m);
  return !!rec&&!Object.keys(rec.inputs||{}).length;
 }).map(m=>m.id);
 const sinkIDs=layout.machines.filter(m=>m.type==='仓入'||m.type==='电脑').map(m=>m.id);
 const sources=new Set(sourceIDs),sinks=new Set(sinkIDs);
 function reachable(roots,adj,edgeEnd){
  const visited=new Set(roots),queue=[...roots];
  for(let i=0;i<queue.length;i++)for(const r of adj.get(queue[i])){
   const id=edgeEnd(r);
   if(!visited.has(id)){visited.add(id);queue.push(id);}
  }
  return visited;
 }
 const canBeReached=reachable(sourceIDs,outgoing,r=>r.to.id);
 const reachesTerminal=reachable(sinkIDs,incoming,r=>r.from.id);
 // Every terminal INPUT ROUTE is one cone. Warehouse-in has no shared
 // per-machine FIFO; computer does have one finite shared consumer FIFO.
 const terminalCones=valid.filter(r=>sinks.has(r.to.id)).map(terminal=>{
  const machines=new Set(),routeIDs=new Set([terminal.id]),queue=[terminal.from.id];
  for(let i=0;i<queue.length;i++){
   const id=queue[i];if(machines.has(id))continue;
   machines.add(id);
   if(sources.has(id))continue;
   for(const r of incoming.get(id)){
    routeIDs.add(r.id);
    queue.push(r.from.id);
   }
  }
  return {
   terminalRoute:terminal.id,terminalMachine:terminal.to.id,
   terminalType:byId.get(terminal.to.id).type,
   upstreamMachines:[...machines],upstreamRoutes:[...routeIDs],
   sourceRoots:[...machines].filter(id=>sources.has(id)),
   hasPhysicalSource:[...machines].some(id=>sources.has(id))
  };
 });
 const parent=new Map(terminalCones.map(x=>[x.terminalRoute,x.terminalRoute]));
 function find(id){
  const p=parent.get(id);
  if(p!==id)parent.set(id,find(p));
  return parent.get(id);
 }
 function union(a,b){
  const x=find(a),y=find(b);
  if(x!==y)parent.set(y,x);
 }
 const owner=new Map();
 for(const cone of terminalCones){
  const resources=[...cone.upstreamMachines];
  if(cone.terminalType==='电脑')resources.push('consumer:'+cone.terminalMachine);
  for(const id of resources){
   if(owner.has(id))union(cone.terminalRoute,owner.get(id));
   else owner.set(id,cone.terminalRoute);
  }
 }
 const groupsByParent=new Map();
 for(const cone of terminalCones){
  const id=find(cone.terminalRoute);
  if(!groupsByParent.has(id))groupsByParent.set(id,[]);
  groupsByParent.get(id).push(cone);
 }
 const unique=xs=>[...new Set(xs)];
 const terminalGroups=[...groupsByParent.values()].map((cones,id)=>({
  id,
  terminalRoutes:cones.map(c=>c.terminalRoute),
  terminalMachines:unique(cones.map(c=>c.terminalMachine)),
  terminalTypes:unique(cones.map(c=>c.terminalType)),
  upstreamMachines:unique(cones.flatMap(c=>c.upstreamMachines)),
  upstreamRoutes:unique(cones.flatMap(c=>c.upstreamRoutes)),
  sourceRoots:unique(cones.flatMap(c=>c.sourceRoots)),
  hasPhysicalSource:cones.some(c=>c.hasPhysicalSource),
  requiresJointConstraints:cones.length>1,
  actualRatesSolved:false
 }));
 const groupByRoute=Object.fromEntries(terminalGroups.flatMap(
  g=>g.terminalRoutes.map(id=>[id,g.id])));
 // Tarjan for PHYSICAL cycles, independent of warehouse feedback SCC.
 let counter=0;
 const indices=new Map(),lowlinks=new Map(),stack=[],onStack=new Set(),parts=[];
 function visit(id){
  indices.set(id,counter);lowlinks.set(id,counter++);
  stack.push(id);onStack.add(id);
  for(const r of outgoing.get(id)){
   const dest=r.to.id;
   if(!indices.has(dest)){
    visit(dest);lowlinks.set(id,Math.min(lowlinks.get(id),lowlinks.get(dest)));
   }else if(onStack.has(dest)){
    lowlinks.set(id,Math.min(lowlinks.get(id),indices.get(dest)));
   }
  }
  if(indices.get(id)===lowlinks.get(id)){
   const part=[];
   for(;;){
    const m=stack.pop();onStack.delete(m);part.push(m);
    if(m===id)break;
   }
   parts.push(part);
  }
 }
 for(const id of byId.keys())if(!indices.has(id))visit(id);
 const physicalCycles=parts.filter(part=>part.length>1||
  outgoing.get(part[0]).some(r=>r.to.id===part[0])).map((part,id)=>({
  id,machines:part.sort(),
  routeIds:valid.filter(r=>part.includes(r.from.id)&&part.includes(r.to.id)).map(r=>r.id),
  physicallyConnectedToSource:part.some(m=>canBeReached.has(m)),
  physicallyConnectedToTerminal:part.some(m=>reachesTerminal.has(m)),
  status:'coupled-physical-cycle',
  actualRatesSolved:false
 }));
 return {
  method:'generic multi-source multi-terminal reverse cones, shared-resource union, physical SCC',
  sourceMachines:sourceIDs,
  warehouseOutSources:sourceIDs.filter(id=>byId.get(id).type==='仓出'),
  terminalMachines:sinkIDs,
  warehouseInTerminals:sinkIDs.filter(id=>byId.get(id).type==='仓入'),
  consumerTerminals:sinkIDs.filter(id=>byId.get(id).type==='电脑'),
  terminalCones,terminalGroups,groupByRoute,
  physicalCycles,physicalCycleCount:physicalCycles.length,
  machinesOnSourceToTerminalPaths:[...byId.keys()].filter(
   id=>canBeReached.has(id)&&reachesTerminal.has(id)),
  withoutPhysicalSourcePath:[...byId.keys()].filter(id=>!canBeReached.has(id)),
  withoutTerminalPath:[...byId.keys()].filter(id=>!reachesTerminal.has(id)),
  openRoutes,invalidRoutes,actualLongRunRatesSolved:false,
  caveat:'Structural paths and SCC do not certify sustainable flow or zero with arbitrary initial buffers. Warehouse-outs require actual material supply; FIFO, RR, demand and feedback must be solved separately.'
 };
}


// Least material fixed point starting with empty finite buffers. This removes
// spurious self-sustaining flows in initially empty physical/warehouse cycles.
// It is intentionally optimistic about FIFO and service, therefore:
// NOT REACHABLE => exact zero from the specified start state;
// REACHABLE => merely possible, NEVER a positive-rate certificate.
function factorySteadyGenericStartupReachability(layout=state,options={}){
 const initialItems=options.initialWarehouseItems||[];
 if(!Array.isArray(initialItems))throw Error('Initial warehouse materials must be an array');
 const graph=factorySteadyGenericTerminalGraph(layout);
 const byId=new Map(layout.machines.map(m=>[m.id,m]));
 const valid=layout.routes.filter(r=>r.to&&!graph.invalidRoutes.includes(r.id));
 const inbound=new Map(layout.machines.map(m=>[m.id,[]]));
 const outbound=new Map(layout.machines.map(m=>[m.id,[]]));
 const onRoute=new Map(valid.map(r=>[r.id,new Set()]));
 for(const r of valid){
  inbound.get(r.to.id).push(r);
  outbound.get(r.from.id).push(r);
 }
 const stocked=new Set(initialItems),made=new Set();
 const eligible=(m,item,port)=>{
  if(typeof acceptsMaterial==='function')return acceptsMaterial(m,item,port);
  return true;
 };
 const canOutput=(m,item,port)=>{
  if(m.type!=='分流')return true;
  const filter=(typeof outPort==='function' ? outPort(m,port)?.filter :
   m.outFilters?.[port])||'';
  return !filter||filter==='任意'||filter===item;
 };
 function send(route,item){
  if(!item||!canOutput(byId.get(route.from.id),item,route.from.port)||
   !eligible(byId.get(route.to.id),item,route.to.port))return false;
  const flow=onRoute.get(route.id);
  if(flow.has(item))return false;
  flow.add(item);return true;
 }
 let passes=0,changed=true;
 while(changed){
  changed=false;passes++;
  for(const m of layout.machines){
   const rec=getRecipe(m);
   if(!rec||made.has(m.id))continue;
   if(Object.keys(rec.inputs||{}).every(item=>inbound.get(m.id).some(r=>onRoute.get(r.id).has(item)))){
    made.add(m.id);changed=true;
   }
  }
  for(const m of layout.machines){
   if(m.type==='仓入'){
    for(const r of inbound.get(m.id))for(const item of onRoute.get(r.id)){
     if(!stocked.has(item)){stocked.add(item);changed=true;}
    }
    continue;
   }
   const rec=getRecipe(m);
   let candidates=[];
   if(m.type==='仓出'){if(stocked.has(m.item))candidates=[m.item];}
   else if(rec){if(made.has(m.id))candidates=[rec.output];}
   else if(m.type==='分流'||m.type==='汇流'){
    const all=new Set();
    for(const r of inbound.get(m.id))for(const item of onRoute.get(r.id))all.add(item);
    candidates=[...all];
   }
   for(const route of outbound.get(m.id))for(const item of candidates)
    if(send(route,item))changed=true;
  }
  // Each pass can only add previously unseen route/item combinations or
  // activate a recipe/warehouse item; no clocks or arbitrary iteration limit.
 }
 const potentiallyActiveRoutes=valid.filter(r=>onRoute.get(r.id).size).map(r=>r.id);
 const cannotEverProduce=layout.machines.filter(m=>getRecipe(m)&&!made.has(m.id)).map(m=>m.id);
 const inventoryItems=[...stocked].sort();
 return {
  method:'monotone item-labelled reachability least fixed point; independent of physical cycles',
  assumption:'empty machine/belt/FIFO buffers; warehouse initialized only with explicitly listed materials',
  initialWarehouseItems:[...initialItems],passes,
  potentiallyStockedItems:inventoryItems,
  potentiallyActiveRecipeMachines:[...made],
  potentiallyActiveRoutes,
  potentiallyActiveItemsByRoute:Object.fromEntries([...onRoute].map(([id,items])=>[id,[...items].sort()])),
  cannotEverProduce,
  cannotEverSendOnRoute:valid.filter(r=>!onRoute.get(r.id).size).map(r=>r.id),
  physicalCycleStatus:graph.physicalCycles.map(c=>({
   machines:c.machines,routeIds:c.routeIds,
   potentiallyReceivesAnyMaterial:c.routeIds.some(id=>onRoute.get(id)?.size),
   certifiedInactiveFromThisStart:!c.routeIds.some(id=>onRoute.get(id)?.size)
  })),
  actualLongRunRatesSolved:false,
  caveat:'Reachability overapproximates dispatch: FIFO head blocking and priority may still force a reachable path to zero. Zero proof assumes no initial in-flight or machine-queue items.'
 };
}
