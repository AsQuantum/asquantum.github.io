'use strict';
// Independent browser-compatible graph compiler. Does not load or call the
// legacy numerical fixed-point solver. Uses the existing physical model API.
function factoryCompileDirectGraph(layout=state,model=null,{unlimitedWarehouse=false}={}){
 if(!model){if(layout!==state)throw Error('Pass equations for a non-current layout');model=factorySteadyBuildEquations();}
 const nodes=new Map(layout.machines.map(m=>[m.id,m])),lines=model.sharedLines,issues=[];
 const ins=new Map([...nodes.keys()].map(k=>[k,[]])),outs=new Map([...nodes.keys()].map(k=>[k,[]]));
 for(const r of lines){ins.get(r.to.id).push(r);outs.get(r.from.id).push(r);}
 const sourceRoutes=new Map(layout.routes.map(r=>[r.id,r]));
 const issue=(machine,reason)=>issues.push({machine,reason});
 const frozen=activeFrozenFactories(layout),items=[...new Set([...model.warehousePools.map(p=>p.item),...frozen.flatMap(f=>Object.keys(f.rates))])];
 const startup=factorySteadyGenericStartupReachability(layout,{initialWarehouseItems:unlimitedWarehouse?items:[],frozenFactories:frozen});
 for(const m of nodes.values()){
  const incoming=ins.get(m.id),outgoing=outs.get(m.id),recipe=getRecipe(m);
  if(!incoming.length&&!outgoing.length)continue;
  if(recipe&&outgoing.length>1)issue(m.id,'shared recipe output arbitration unspecified');
  if(m.type==='分流'&&incoming.length>1)issue(m.id,'multiple splitter inputs unspecified');
  if(m.type==='汇流'&&outgoing.length>1)issue(m.id,'multiple merger outputs unspecified');
  if(m.type==='仓出'&&outgoing.length>1)issue(m.id,'multiple warehouse output ports unspecified');
  if(!recipe&&!['分流','汇流','仓出','仓入','电脑'].includes(m.type))issue(m.id,'unrecognized logistics transition');
  for(const r of incoming){
   const physical=sourceRoutes.get(r.route),raw=physical?[...streamMaterials(physical)]:r.materials;
   if(raw.some(item=>!r.materials.includes(item)))issue(m.id,'physical FIFO can carry rejected material on '+r.route);
   if((recipe||m.type==='分流')&&r.materials.length>1)issue(m.id,'mixed FIFO feeding a recipe or splitter needs ordered-item equations');
  }
  if(m.type==='分流'){
   const mats=new Set(incoming.flatMap(r=>r.materials));
   for(const r of layout.routes.filter(r=>r.from.id===m.id)){
    const filter=outPort(m,r.from.port)?.filter||'';
    if(filter&&filter!=='任意'&&[...mats].some(item=>item!==filter))issue(m.id,'selected incompatible splitter filter can hold FIFO head');
   }
  }
 }
 // Positive mixed feedback requires an ordered composition proof. A route
 // from an inactive/empty component can still be correctly forced to zero.
 const active=r=>!!(startup.potentiallyActiveItemsByRoute[r.route]||[]).length;
 for(const r of lines)if(active(r)&&r.materials.length>1){
  const seen=new Set(),todo=[r.to.id];while(todo.length){const id=todo.pop();if(id===r.from.id){issue(id,'mixed recirculation requires ordered material dynamics');break;}if(seen.has(id))continue;seen.add(id);for(const x of outs.get(id)||[])if(active(x)&&nodes.get(id).type==='汇流')todo.push(x.to.id);}
 }
 const portKeys=layout.routes.flatMap(r=>[JSON.stringify([r.from.id,'out',r.from.port]),...(r.to?[JSON.stringify([r.to.id,'in',r.to.port])]:[])]);
 const completePhysicalRoutes=lines.length===layout.routes.length&&new Set(portKeys).size===portKeys.length&&new Set(layout.routes.map(r=>r.id)).size===layout.routes.length&&new Set(layout.machines.map(m=>m.id)).size===layout.machines.length;
 return {status:issues.length?'unresolved':'compiled',issues,unlimited:unlimitedWarehouse,completePhysicalRoutes,nodes:layout.machines.map(m=>({id:m.id,type:m.type,recipe:getRecipe(m),item:m.item,face:m.face,physicalInCount:layout.routes.filter(r=>r.to?.id===m.id).length,physicalOutCount:layout.routes.filter(r=>r.from.id===m.id).length,inputPriority:machineInputPriority(m).map(p=>p.index)})),lines:lines.map(r=>({id:r.route,from:r.from.id,to:r.to.id,toPort:r.to.port,fromPort:r.from.port,materials:r.materials,active:active(r),length:sourceRoutes.get(r.route)?.path?.length,compatible:r.materials.length===1&&[...streamMaterials(sourceRoutes.get(r.route))].every(k=>k===r.materials[0])})),pools:model.warehousePools.map(p=>({item:p.item,order:p.withdrawalMachineOrder})),frozen:frozen.map(f=>({...f,reachable:unlimitedWarehouse||Object.entries(f.rates).every(([item,rate])=>steadyRegionQ(rate).n>=0n||startup.potentiallyStockedItems.includes(item))}))};
}
function factoryDirectArithmetic(){return {q:steadyRegionQ,add:steadyExactAdd,sub:steadyExactSub,mul:steadyExactMul,div:steadyExactDiv,cmp:steadyExactCmp,txt:steadyExactText,Z:STEADY_ZERO,U:STEADY_ONE};}
// Experimental interface for a future UI adapter. Exact values are strings;
// null = not uniquely determined, never implicitly converted to numeric 0.
function factoryDirectTheory({ms=10000,deadline=Infinity,inletPolicy='relaxed',continuousRefill=false}={}){
 const end=Math.min(deadline,performance.now()+ms),arith=factoryDirectArithmetic(),model=factorySteadyBuildEquations();
 const constrainedGraph=factoryCompileDirectGraph(state,model),unlimitedGraph=factoryCompileDirectGraph(state,model,{unlimitedWarehouse:true});
 const one=g=>{
  if(g.status!=='compiled')return {status:'unsupported',issues:g.issues,values:{},unknown:[],retryable:false};
  const certificates=continuousRefill&&inletPolicy==='relaxed'?factoryDirectBatchRefillCertificates(g,arith):[];
  const p=compileExactRateProblem(g,{inletPolicy,batchRefillCertificates:certificates}),result=solveDirectRateProblem(p,arith,{ms:Math.max(0,end-performance.now())});
  const values=Object.fromEntries(Object.keys(p.observables).map(k=>[k,Object.hasOwn(result.unique,k)?result.unique[k]:null]));
  return {status:result.status,values,unknown:Object.keys(values).filter(k=>values[k]===null),multiple:result.multiple||[],retryable:result.status==='unknown',stats:result.stats,certificates,actualLongRunRatesSolved:false};
 };
 const constrained=one(constrainedGraph);
 const needsUnlimited=constrainedGraph.frozen.length||constrainedGraph.pools.some(p=>p.order.length);
 const unlimited=needsUnlimited?one(unlimitedGraph):constrained;
 const warehouseItems=[...new Set([...constrainedGraph.pools.map(p=>p.item),...constrainedGraph.frozen.flatMap(f=>Object.keys(f.rates))])];
 const read=(r,k)=>Object.hasOwn(r.values,k)?r.values[k]:null;
 const rows=Object.fromEntries(warehouseItems.map(k=>[k,{
  inflow:read(constrained,'inflow:'+k),outflow:read(constrained,'outflow:'+k),net:read(constrained,'net:'+k),potential:read(constrained,'potential:'+k),overdraft:read(unlimited,'net:'+k),localNet:read(constrained,'localNet:'+k)}]));
 const total={inflow:read(constrained,'total:inflow'),outflow:read(constrained,'total:outflow'),net:read(constrained,'total:net'),potential:read(constrained,'total:potential'),overdraft:read(unlimited,'total:net')};
 return {status:constrained.status==='sat'&&unlimited.status==='sat'?'conditional-exact':constrained.status==='unsupported'||unlimited.status==='unsupported'?'unsupported':'unresolved',method:'symbolic rational elimination',inletPolicy,rows,total,constrained,unlimited,actualLongRunRatesSolved:false,certified:false};
}
