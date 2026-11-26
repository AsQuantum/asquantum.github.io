'use strict';
// Compile the physical topology, independently of the conditional S/D graph.
// Ports and actual geometry are exported by the editor, no graph-specific
// recipes, layouts, IDs or measured rates in the compiler.
function factoryCompileSymbolicSpec(layout=state,{unlimitedWarehouse=false}={}){
 const machines=layout.machines.map(m=>({
  id:m.id,type:m.type,item:m.item,recipe:getRecipe(m),
  outPorts:getPorts(m).filter(p=>p.kind==='out').map(p=>({index:p.index,filter:p.filter||''})),
  inputPriority:machineInputPriority(m).map(p=>p.index),
  mergerPriority:m.type==='汇流'?mergerInputOrder(m).map(p=>p.index):[]
 }));
 const all=new Set(MATERIALS);
 for(const m of machines){if(m.item)all.add(m.item);if(m.recipe){all.add(m.recipe.output);for(const k of Object.keys(m.recipe.inputs))all.add(k);}}
 const frozen=normalizeFrozenFactories(layout.frozenFactories||[]).filter(f=>f.enabled&&Object.keys(f.rates).length);
 for(const f of frozen)for(const k of Object.keys(f.rates))all.add(k);
 const firstInputs=new Set();
 const routes=layout.routes.map(r=>{const target=r.to&&layout.machines.find(m=>m.id===r.to.id),inputKey=r.to?JSON.stringify([r.to.id,r.to.port]):null,mergerFirst=inputKey!==null&&!firstInputs.has(inputKey);
  if(inputKey!==null)firstInputs.add(inputKey);
  return {id:r.id,from:r.from.id,fromPort:r.from.port,to:r.to?.id??null,toPort:r.to?.port??null,length:r.path.length,mergerFirst,
   accepted:target?[...all].filter(k=>acceptsMaterial(target,k,r.to.port)):[...all]};
 });
 const priority=layout.machines.filter(m=>m.type==='仓出').sort(warehouseMachinePriorityCompare).map(m=>m.id);
 return {machines,routes,frozen,priority,unlimitedWarehouse,initial:'empty'};
}

// Structural possible-material propagation for the theoretical model.
// Never call the editor's geometry audit here. A material is expanded at
// most once per reachable machine/junction and outgoing route. This is
// only an overapproximation, not a claim of positive throughput.
function iterationTopologyMaterialSets(spec){
 const nodes=new Map(spec.machines.map(m=>[m.id,m])),outgoing=new Map(spec.machines.map(m=>[m.id,[]])),seen=new Map(spec.machines.map(m=>[m.id,new Set()])),routes=new Map(),connected=new Set(),queue=[];
 const push=(id,k)=>{if(!k||seen.get(id).has(k))return;seen.get(id).add(k);queue.push([id,k]);};
 for(const r of spec.routes){
  routes.set(r.id,new Set());
  const a=nodes.get(r.from),b=nodes.get(r.to);if(!a)continue;
  const port=a.outPorts.find(p=>p.index===r.fromPort);
  const active=!!(port&&b&&r.length>0&&b.inputPriority.includes(r.toPort));
  if(active)connected.add(r.id);
  outgoing.get(a.id).push({r,b,active,port,accepted:new Set(r.accepted)});
 }
 for(const m of spec.machines){
  if(m.type==='仓出')push(m.id,m.item);
  else if(m.recipe)push(m.id,m.recipe.output);
 }
 for(let i=0;i<queue.length;i++){
  const [id,k]=queue[i],m=nodes.get(id);
  for(const {r,b,active,port,accepted} of outgoing.get(id)){
   // Keep source candidates even on an open end. Only matching
   // physically connected arrivals may propagate into a junction.
   if(m.type==='分流'&&(!port||port.filter&&port.filter!=='任意'&&port.filter!==k))continue;
   routes.get(r.id).add(k);
   if(active&&(!port.filter||port.filter==='任意'||port.filter===k)&&accepted.has(k)&&(b.type==='分流'||b.type==='汇流'))push(b.id,k);
  }
 }
 return {routes,connected};
}
function iterationWarehouseBoundaryItems(spec){
 const {routes,connected}=iterationTopologyMaterialSets(spec),nodes=new Map(spec.machines.map(m=>[m.id,m]));
 const items=new Set([...spec.machines.filter(m=>m.type==='仓出').map(m=>m.item).filter(Boolean),...(spec.frozen||[]).flatMap(f=>Object.keys(f.rates))]);
 for(const r of spec.routes){
  if(!connected.has(r.id)||nodes.get(r.to)?.type!=='仓入')continue;
  const port=nodes.get(r.from).outPorts.find(p=>p.index===r.fromPort),accepted=new Set(r.accepted);
  for(const k of routes.get(r.id))if(accepted.has(k)&&(!port.filter||port.filter==='任意'||port.filter===k))items.add(k);
 }
 return [...items];
}
function iterationLayoutWarehouseItems(layout=state,spec=factoryCompileSymbolicSpec(layout)){
 return [...new Set([...iterationWarehouseBoundaryItems(spec),...layout.machines.filter(m=>m.type==='仓入').map(m=>m.inletItem).filter(k=>k&&k!=='任意')])].sort(factoryItemCompare);
}
