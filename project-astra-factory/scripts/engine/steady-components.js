'use strict';
// Exact structural SCC decomposition of physical belts and commodity-specific
// shared-warehouse return edges. SCC condensation is DAG, but backpressure can
// still travel backward through it. No rates are inferred from graph structure.
function factorySteadyDependencyComponents(layout=state,model=null){
 if(!layout||!Array.isArray(layout.machines)||!Array.isArray(layout.routes))
  throw Error('Factory layout required');
 model=model||factorySteadyBuildEquations();
 const byId=new Map(layout.machines.map(m=>[m.id,m]));
 if(byId.size!==layout.machines.length)throw Error('Duplicate machine IDs');
 const realRoutes=new Set(model.rateVariables.map(v=>v.route));
 const routes=layout.routes.filter(r=>r.to&&byId.has(r.from.id)&&byId.has(r.to.id)&&realRoutes.has(r.id));
 const adj=new Map([...byId.keys()].map(id=>[id,new Set()]));
 const edges=[];
 const add=(from,to,kind,item=null)=>{
  if(!adj.has(from)||!adj.has(to))throw Error('Invalid dependency arc');
  adj.get(from).add(to);edges.push({from,to,kind,item});
 };
 for(const r of routes)add(r.from.id,r.to.id,'physical');
 const routeById=new Map(routes.map(r=>[r.id,r]));
 const varById=new Map(model.rateVariables.map(v=>[v.id,v]));
 let feedbackArcs=0;
 for(const pool of model.warehousePools||[])for(const inf of pool.inflowTerms){
  const input=routeById.get(varById.get(inf)?.route);
  if(!input)throw Error('Unmatched warehouse input flow '+inf);
  for(const outf of pool.outflowTerms){
   const output=routeById.get(varById.get(outf)?.route);
   if(!output)throw Error('Unmatched warehouse output flow '+outf);
   add(input.to.id,output.from.id,'warehouse-item',pool.item);
   feedbackArcs++;
  }
 }
 let index=0;const ord=new Map(),low=new Map(),on=new Set(),stack=[],parts=[];
 function visit(v){
  ord.set(v,index);low.set(v,index++);stack.push(v);on.add(v);
  for(const w of adj.get(v)){
   if(!ord.has(w)){visit(w);low.set(v,Math.min(low.get(v),low.get(w)));}
   else if(on.has(w))low.set(v,Math.min(low.get(v),ord.get(w)));
  }
  if(ord.get(v)===low.get(v)){
   const component=[];
   for(;;){const w=stack.pop();on.delete(w);component.push(w);if(w===v)break;}
   parts.push(component.sort());
  }
 }
 for(const id of byId.keys())if(!ord.has(id))visit(id);
 parts.sort((a,b)=>a[0].localeCompare(b[0]));
 const membership=new Map(),components=parts.map((machines,id)=>{
  for(const m of machines)membership.set(m,id);
  return {id,machines,cyclic:machines.length>1||adj.get(machines[0]).has(machines[0]),predecessors:[],successors:[]};
 });
 const seenArc=new Set();
 for(const e of edges){
  const a=membership.get(e.from),b=membership.get(e.to);if(a===b)continue;
  const key=a+':'+b;if(seenArc.has(key))continue;seenArc.add(key);
  components[a].successors.push(b);components[b].predecessors.push(a);
 }
 const indegree=components.map(c=>c.predecessors.length);
 const todo=components.filter(c=>!indegree[c.id]).map(c=>c.id),topological=[];
 for(let k=0;k<todo.length;k++){
  const id=todo[k];topological.push(id);
  for(const to of components[id].successors)if(!--indegree[to])todo.push(to);
 }
 if(topological.length!==components.length)throw Error('SCC condensation graph has cycle');
 const connected=new Set(routes.flatMap(r=>[r.from.id,r.to.id]));
 const sources=layout.machines.filter(m=>{
  const rec=getRecipe(m);return rec&&!Object.keys(rec.inputs||{}).length;
 }).map(m=>({id:m.id,name:typeof label==='function'?label(m):m.type,
  item:getRecipe(m).output,qty:getRecipe(m).qty,period:String(getRecipe(m).seconds)}));
 const terminalWarehouse=(model.warehousePools||[]).filter(p=>p.inflowTerms.length&&!p.outflowTerms.length)
  .map(p=>({item:p.item,inRoutes:[...new Set(p.inflowTerms.map(id=>varById.get(id).route))]}));
 const feedbackWarehouseItems=(model.warehousePools||[])
  .filter(p=>p.inflowTerms.length&&p.outflowTerms.length).map(p=>p.item);
 const sinkComputers=layout.machines.filter(m=>m.type==='电脑'&&routes.some(r=>r.to.id===m.id))
  .map(m=>({id:m.id,inputRoutes:routes.filter(r=>r.to.id===m.id).map(r=>r.id)}));
 const cyclicComponents=components.filter(c=>c.cyclic).map(c=>({
  id:c.id,size:c.machines.length,machines:c.machines,
  machineLabels:c.machines.map(id=>({id,name:typeof label==='function'?label(byId.get(id)):byId.get(id).type})),
  warehouseItems:[...new Set(edges.filter(e=>e.kind==='warehouse-item'&&
   membership.get(e.from)===c.id&&membership.get(e.to)===c.id).map(e=>e.item))].sort()
 }));
 return {
  method:'Tarjan SCC over physical item-flow and same-material warehouse feedback edges',
  machineCount:layout.machines.length,activeMachineCount:connected.size,
  routeCount:routes.length,warehouseFeedbackArcs:feedbackArcs,
  sourceCount:sources.length,sources,
  terminalWarehouse,feedbackWarehouseItems,sinkComputers,
  componentCount:components.length,cyclicComponents,
  cyclicComponentCount:cyclicComponents.length,
  singletonCount:components.filter(c=>c.machines.length===1).length,
  condensation:{
   topologicalOrder:topological,
   components:components.map(c=>({id:c.id,machines:c.machines,cyclic:c.cyclic,
    predecessors:c.predecessors,successors:c.successors}))
  },
  caveat:'SCC is exact for material dependency but not the entire blocking graph: reverse backpressure couples upstream parts. Exact FIFO+RR scheduling is not solved.'
 };
}
