'use strict';
// Warehouse-cut structural graph for rate-only analysis.
// Every physical belt stays directed; the central store is split into one
// shared inventory node PER MATERIAL, not one store per stock-in/out machine.
// A warehouse-out machine is a graph root, a warehouse-in machine a sink.
// A stock item links the physical blocks through:
//   [stock-in machine] -> [warehouse:item] -> [stock-out machine].
// Structure/scheduling classification only; it NEVER guesses actual rates.
function factorySteadyWarehouseCutGraph(layout=state){
 if(!layout?.machines||!layout?.routes)throw Error('Factory layout required');
 const machineById=new Map(layout.machines.map(m=>[m.id,m]));
 if(machineById.size!==layout.machines.length)throw Error('Duplicate machine IDs');
 const order=new Map(layout.machines.map((m,i)=>[m.id,i]));
 const sortedIds=xs=>[...new Set(xs)].sort((a,b)=>order.get(a)-order.get(b));
 const routeById=new Map(),routes=[];
 for(const r of layout.routes){
  if(!r.to||!machineById.has(r.from.id)||!machineById.has(r.to.id)||
   checkPath(r.path,r.from,r.to,r.id))continue;
  if(routeById.has(r.id))throw Error('Duplicate route: '+r.id);
  routeById.set(r.id,r);routes.push(r);
 }
 // Ignore spatial distance and tick execution order. Connected devices
 // share physical supply/backpressure constraints; keep such devices in a
 // common subproblem even if there are several warehouse deposit sinks.
 // Warehouse-in immediately credits stock: it does NOT join independent incoming
 // lines or ports into one physical buffer/backpressure component.
 const machinesOutsideInlets=layout.machines.filter(m=>m.type!=='仓入');
 const parent=new Map(machinesOutsideInlets.map(m=>[m.id,m.id]));
 const find=x=>{const p=parent.get(x);if(p!==x){const root=find(p);parent.set(x,root);return root;}return x;};
 const union=(a,b)=>{const ra=find(a),rb=find(b);if(ra!==rb)parent.set(rb,ra);};
 const incoming=new Map(layout.machines.map(m=>[m.id,[]]));
 const outgoing=new Map(layout.machines.map(m=>[m.id,[]]));
 for(const r of routes){
  if(machineById.get(r.to.id).type!=='仓入')union(r.from.id,r.to.id);
  incoming.get(r.to.id).push(r);outgoing.get(r.from.id).push(r);
 }
 const groups=new Map();
 for(const m of machinesOutsideInlets){
  const id=find(m.id);if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push(m.id);
 }
 const physicalComponents=[],owner=new Map();
 for(const ids of groups.values()){
  const machines=sortedIds(ids);
  const id=physicalComponents.length;
  const connectedRoutes=routes.filter(r=>parent.has(r.from.id)&&find(r.from.id)===find(machines[0]));
  const stockOut=machines.filter(id=>machineById.get(id).type==='仓出');
  const stockIn=sortedIds(connectedRoutes.filter(r=>machineById.get(r.to.id).type==='仓入').map(r=>r.to.id));
  const consumers=machines.filter(id=>machineById.get(id).type==='电脑');
  const initialSources=machines.filter(id=>!incoming.get(id).length);
  const sourceGenerators=machines.filter(id=>{
   const recipe=getRecipe(machineById.get(id));
   return recipe&&!Object.keys(recipe.inputs||{}).length;
  });
  const withdrawnItems=[...new Set(stockOut.map(id=>machineById.get(id).item).filter(Boolean))].sort();
  const depositMap=new Map();
  for(const r of connectedRoutes.filter(r=>machineById.get(r.to.id).type==='仓入')){
   const id=r.to.id;
   const dest=machineById.get(id);
   const items=[...streamMaterials(r)].filter(item=>item&&acceptsMaterial(dest,item,r.to.port));
   for(const item of items){
    if(!depositMap.has(item))depositMap.set(item,[]);
    depositMap.get(item).push(r.id);
   }
  }
  const depositedItems=[...depositMap.keys()].sort();
  const comp={
   id,machines,routeIds:connectedRoutes.map(r=>r.id),
   stockOutMachines:stockOut,stockInMachines:stockIn,
   consumerMachines:consumers,sourceGenerators,initialSources,
   withdrawnItems,depositedItems,
   depositRoutes:Object.fromEntries([...depositMap].map(([item,lines])=>[item,[...new Set(lines)]])),
   class:stockOut.length?'warehouse-dependent':'warehouse-independent',
   hasWarehouseDeposit:depositedItems.length>0,
   solvableFromStructureAlone:false
  };
  physicalComponents.push(comp);
  for(const machine of machines)owner.set(machine,id);
 }
 // Reverse traversal from EACH warehouse-in device: a sink may have many
 // upstream producers or warehouse-out roots, including through junctions.
 function upstreamFrom(sinkRoute){
  const warehouseIn=sinkRoute.to.id;
  const visited=new Set(),routeSet=new Set([sinkRoute.id]);
  const walk=id=>{
   if(visited.has(id))return;
   visited.add(id);
   for(const r of incoming.get(id)){routeSet.add(r.id);walk(r.from.id);}
  };
  walk(sinkRoute.from.id);
  const upstream=sortedIds(visited);
  const upstreamWarehouseOut=upstream.filter(id=>machineById.get(id).type==='仓出');
  const upstreamGenerators=upstream.filter(id=>{
   const recipe=getRecipe(machineById.get(id));
   return recipe&&!Object.keys(recipe.inputs||{}).length;
  });
  return {warehouseIn,warehouseInPort:sinkRoute.to.port,terminalRoute:sinkRoute.id,component:owner.get(sinkRoute.from.id),
   upstreamMachines:upstream,upstreamRoutes:routes.filter(r=>routeSet.has(r.id)).map(r=>r.id),
   warehouseOutRoots:upstreamWarehouseOut,
   sourceGeneratorRoots:upstreamGenerators,
   independentOfWarehouseOut:upstreamWarehouseOut.length===0};
 }
 const warehouseInRoots=routes.filter(r=>machineById.get(r.to.id).type==='仓入')
  .map(r=>upstreamFrom(r));
 const entryConeGroups=factorySteadyGroupWarehouseEntryCones(warehouseInRoots,layout);
 // Directed bipartite dependency graph. A physical component's deposited
 // goods can be reused by any warehouse-out in another component. If a
 // component withdraws from and replenishes a warehouse item, its edges
 // form a cycle, which must be solved as one coupled rate block.
 const nodeIds=physicalComponents.map(c=>'component:'+c.id);
 const warehouseItems=[...new Set(physicalComponents.flatMap(c=>[...c.withdrawnItems,...c.depositedItems]))].sort();
 const nodes=[...nodeIds,...warehouseItems.map(item=>'warehouse:'+item)];
 const adjacency=new Map(nodes.map(n=>[n,new Set()]));
 const dependencyEdges=[];
 function edge(from,to,kind,item){
  if(!adjacency.has(from)||!adjacency.has(to))throw Error('Invalid node in dependency graph');
  adjacency.get(from).add(to);dependencyEdges.push({from,to,kind,item});
 }
 for(const comp of physicalComponents){
  for(const item of comp.depositedItems)
   edge('component:'+comp.id,'warehouse:'+item,'deposits',item);
  for(const item of comp.withdrawnItems)
   edge('warehouse:'+item,'component:'+comp.id,'withdraws',item);
 }
 // Tarjan -> SCC condensation DAG -> guaranteed forward solve order.
 let time=0;const indices=new Map(),low=new Map(),stack=[],onStack=new Set(),parts=[];
 function visit(node){
  indices.set(node,time);low.set(node,time++);
  stack.push(node);onStack.add(node);
  for(const next of adjacency.get(node)){
   if(!indices.has(next)){visit(next);low.set(node,Math.min(low.get(node),low.get(next)));}
   else if(onStack.has(next))low.set(node,Math.min(low.get(node),indices.get(next)));
  }
  if(indices.get(node)===low.get(node)){
   const part=[];
   while(true){
    const top=stack.pop();onStack.delete(top);part.push(top);
    if(top===node)break;
   }
   parts.push(part);
  }
 }
 for(const node of nodes)if(!indices.has(node))visit(node);
 const membership=new Map();
 const components=parts.map((group,id)=>{
  group.forEach(node=>membership.set(node,id));
  return {id,nodes:group.slice().sort(),cyclic:group.length>1||
   adjacency.get(group[0]).has(group[0]),
   predecessors:[],successors:[]};
 });
 const dedup=new Set();
 for(const e of dependencyEdges){
  const a=membership.get(e.from),b=membership.get(e.to);
  if(a===b||dedup.has(a+'>'+b))continue;
  dedup.add(a+'>'+b);components[a].successors.push(b);components[b].predecessors.push(a);
 }
 const indegrees=components.map(c=>c.predecessors.length);
 const queue=components.filter(c=>!indegrees[c.id]).map(c=>c.id),topological=[];
 for(let i=0;i<queue.length;i++){
  const id=queue[i];topological.push(id);
  for(const to of components[id].successors)if(!--indegrees[to])queue.push(to);
 }
 if(topological.length!==components.length)throw Error('Warehouse-cut SCC condensation not acyclic');
 const solveLayers=topological.map((id,index)=>{
  const group=components[id],compIds=group.nodes.filter(s=>s.startsWith('component:')).map(s=>Number(s.slice(10)));
  const stockItems=group.nodes.filter(s=>s.startsWith('warehouse:')).map(s=>s.slice(10));
  return {order:index,componentIds:compIds,warehouseItems:stockItems,
   cyclic:group.cyclic,requiresJointSolve:group.cyclic,
   classification:group.cyclic?'coupled-feedback':'topologically-orderable'};
 });
 return {
  method:'warehouse-cut physical components, reverse warehouse-in traces, per-item shared stock nodes, SCC DAG',
  physicalMachineCount:layout.machines.length,
  physicalRouteCount:routes.length,
  physicalComponents,
  warehouseInRoots,entryConeGroups,
  genericTerminalGraph:typeof factorySteadyGenericTerminalGraph==='function'?factorySteadyGenericTerminalGraph(layout):null,
  emptyStartReachability:typeof factorySteadyGenericStartupReachability==='function'?factorySteadyGenericStartupReachability(layout):null,
  warehouseItems,
  warehouseNodeCount:warehouseItems.length,
  firstLayerComponents:physicalComponents.filter(c=>!c.stockOutMachines.length&&c.routeIds.length).map(c=>c.id),
  firstLayerDepositRoots:warehouseInRoots.filter(r=>r.independentOfWarehouseOut).map(r=>r.terminalRoute),
  dependentDepositRoots:warehouseInRoots.filter(r=>!r.independentOfWarehouseOut).map(r=>r.terminalRoute),
  dependencyEdges,condensation:components,solveLayers,
  feedbackGroups:solveLayers.filter(layer=>layer.requiresJointSolve),
  actualLongRunRatesSolved:false,
  caveat:'Graph order removes stock-output dependency for independent components, but finite buffers and shared RR resource saturation are rate constraints, not proven by topology. Cyclic warehouse stock blocks are solved jointly and no warehouse-in/out device owns a private pool.'
 };
}

// Group warehouse inlet terminal route cones by real shared UPSTREAM resources.
// This grouping is independent of any AST1-specific machine IDs, recipes or
// assumptions about named item sources. Each route into a warehouse inlet is
// a separate terminal; the warehouse-in machine is never counted as a
// coupling resource. Identical upstream machine IDs are sufficient to couple
// cones: one machine has shared processing, FIFO or output capacity. A shared
// splitter is therefore handled without a one-off special case.
function factorySteadyGroupWarehouseEntryCones(warehouseInRoots,layout=state){
 const roots=warehouseInRoots||[];
 const byId=new Map(layout.machines.map(m=>[m.id,m]));
 const machinePosition=new Map(layout.machines.map((m,i)=>[m.id,i]));
 const orderMachines=values=>[...new Set(values)].sort((a,b)=>
  (machinePosition.get(a)??Infinity)-(machinePosition.get(b)??Infinity));
 const parent=new Map(roots.map(r=>[r.terminalRoute,r.terminalRoute]));
 const find=x=>{
  const p=parent.get(x);
  if(p===undefined)throw Error('Unknown entry route: '+x);
  if(p!==x)parent.set(x,find(p));
  return parent.get(x);
 };
 const join=(a,b)=>{const x=find(a),y=find(b);if(x!==y)parent.set(y,x);};
 const earliestOwner=new Map(),owners=new Map();
 for(const root of roots){
  for(const machine of root.upstreamMachines){
   if(!byId.has(machine))throw Error('Upstream machine missing: '+machine);
   if(!owners.has(machine))owners.set(machine,[]);
   owners.get(machine).push(root.terminalRoute);
   if(earliestOwner.has(machine))join(root.terminalRoute,earliestOwner.get(machine));
   else earliestOwner.set(machine,root.terminalRoute);
  }
 }
 const parts=new Map();
 for(const root of roots){
  const key=find(root.terminalRoute);
  if(!parts.has(key))parts.set(key,[]);
  parts.get(key).push(root);
 }
 const routeMap=new Map(layout.routes.map(r=>[r.id,r]));
 const groups=[...parts.values()].map((cones,id)=>{
  const terminalRoutes=cones.map(r=>r.terminalRoute);
  const terminalSet=new Set(terminalRoutes);
  const upstreamMachines=orderMachines(cones.flatMap(r=>r.upstreamMachines));
  const sharedUpstreamMachines=upstreamMachines.filter(machine=>
   (owners.get(machine)||[]).filter(route=>terminalSet.has(route)).length>1);
  const deposited=new Map(),incompatibleTerminalMaterials=[];
  for(const terminal of terminalRoutes){
   const route=routeMap.get(terminal);
   if(!route)throw Error('Terminal input route missing: '+terminal);
   const sink=byId.get(route.to.id);
   if(!sink||sink.type!=='仓入')throw Error('Not a warehouse inlet: '+terminal);
   for(const item of streamMaterials(route)){
    if(!acceptsMaterial(sink,item,route.to.port)){
     incompatibleTerminalMaterials.push({terminalRoute:terminal,item,warehouse:sink.id,port:route.to.port});
     continue;
    }
    if(!deposited.has(item))deposited.set(item,[]);
    deposited.get(item).push(terminal);
   }
  }
  const warehouseOutRoots=orderMachines(cones.flatMap(c=>c.warehouseOutRoots));
  return {
   id,terminalRoutes,
   warehouseInMachines:orderMachines(cones.map(c=>c.warehouseIn)),
   warehouseOutRoots,
   upstreamMachines,
   upstreamRoutes:[...new Set(cones.flatMap(c=>c.upstreamRoutes))],
   sourceGeneratorRoots:orderMachines(cones.flatMap(c=>c.sourceGeneratorRoots)),
   sharedUpstreamMachines,
   depositedItems:[...deposited.keys()].sort(),
   incompatibleTerminalMaterials,
   inputFilteringMayBlock:incompatibleTerminalMaterials.length>0,
   depositRoutesByItem:Object.fromEntries(deposited),
   independentOfWarehouseOut:warehouseOutRoots.length===0,
   mustSolveTogether:terminalRoutes.length>1,
   couplingReason:sharedUpstreamMachines.length?
    'terminal routes share upstream machine resources (including FIFO/splitter capacity)':
    'single terminal route: warehouse inlet itself does not couple input lines',
   actualRatesSolved:false
  };
 });
 const groupByRoute=Object.fromEntries(groups.flatMap(g=>g.terminalRoutes.map(r=>[r,g.id])));
 return {
  method:'one reverse cone per stock-in input route; union only on shared upstream machine, never on shared warehouse sink',
  groups,groupByRoute,
  groupCount:groups.length,
  independentGroups:groups.filter(g=>g.independentOfWarehouseOut).map(g=>g.id),
  dependentGroups:groups.filter(g=>!g.independentOfWarehouseOut).map(g=>g.id),
  actualLongRunRatesSolved:false
 };
}
