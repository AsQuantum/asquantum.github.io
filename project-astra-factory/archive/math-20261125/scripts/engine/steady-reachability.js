'use strict';
// Empty-inventory start-up feasibility is not equivalent to stationarity.
// This monotone closure intentionally OVERAPPROXIMATES which materials could
// ever appear (it ignores limited buffers, time and RR ordering).
// A negative/reachable=false result therefore PROVES long-run rate ZERO.
// It is neither a stepped simulation nor an LP.
function factorySteadyEmptyStartReachability(model,options={}){
 if(!model?.rateVariables||!Array.isArray(state?.machines)||!Array.isArray(state?.routes))
  throw Error('Missing connected factory and symbolic material graph');
 const varId=(route,item)=>'flow:'+route+':'+item;
 const variables=new Set(model.rateVariables.map(v=>v.id));
 const byId=new Map(state.machines.map(m=>[m.id,m]));
 const routes=state.routes.filter(r=>r.to&&byId.has(r.from.id)&&byId.has(r.to.id)&&
  (typeof checkPath!=='function'||!checkPath(r.path,r.from,r.to,r.id)));
 const inbound=new Map(),outbound=new Map();
 for(const m of state.machines){inbound.set(m.id,[]);outbound.set(m.id,[]);}
 for(const r of routes){inbound.get(r.to.id).push(r);outbound.get(r.from.id).push(r);}
 const perRoute=new Map();
 for(const v of model.rateVariables){
  const set=perRoute.get(v.route)||new Set();set.add(v.item);perRoute.set(v.route,set);
 }
 const possible=new Set(),made=new Set(),stock=new Set(options.initialWarehouseItems||[]);
 let passes=0,change=true;
 const putFlow=(r,item)=>{
  const name=varId(r.id,item);
  if(!variables.has(name)||possible.has(name))return false;
  possible.add(name);return true;
 };
 while(change&&passes++<state.machines.length+model.rateVariables.length+4){
  change=false;
  for(const m of state.machines){
   const rec=getRecipe(m);
   if(!rec||made.has(m.id))continue;
   if(Object.keys(rec.inputs||{}).every(item=>
    inbound.get(m.id).some(r=>possible.has(varId(r.id,item))))){
    made.add(m.id);change=true;
   }
  }
  for(const m of state.machines){
   if(m.type!=='仓入')continue;
   for(const r of inbound.get(m.id))for(const item of perRoute.get(r.id)||[]){
    if(possible.has(varId(r.id,item))&&!stock.has(item)){stock.add(item);change=true;}
   }
  }
  for(const m of state.machines){
   const rec=getRecipe(m);
   if(rec&&!made.has(m.id))continue;
   if(m.type==='仓出'){
    if(!stock.has(m.item))continue;
    for(const r of outbound.get(m.id))if(putFlow(r,m.item))change=true;
   }else if(rec){
    for(const r of outbound.get(m.id))if(putFlow(r,rec.output))change=true;
   }else if(m.type==='分流'||m.type==='汇流'){
    const active=new Set();
    for(const r of inbound.get(m.id))for(const item of perRoute.get(r.id)||[]){
     if(possible.has(varId(r.id,item)))active.add(item);
    }
    for(const r of outbound.get(m.id))for(const item of active){
     const filter=outPort(m,r.from.port)?.filter||'';
     if(filter&&filter!=='任意'&&filter!==item)continue;
     if(putFlow(r,item))change=true;
    }
   }
  }
 }
 if(change)throw Error('Finite material reachability closure failed to converge');
 const impossibleFlow=model.rateVariables.filter(v=>!possible.has(v.id)).map(v=>v.id);
 const impossibleMachines=model.machineEquations.filter(m=>!made.has(m.machine)).map(m=>m.machine);
 const impossibleStock=model.warehousePools.filter(p=>!stock.has(p.item)).map(p=>p.item);
 return {
  method:'monotone structural least fixed point from empty shared warehouse',
  model:'necessary material reachability; omits scheduling and FIFO timing',
  passes,
  startsWithWarehouseItems:[...(options.initialWarehouseItems||[])],
  potentiallyAvailableWarehouseItems:[...stock].sort(),
  potentiallyActiveRecipeMachines:[...made].sort(),
  cannotEverFlow:impossibleFlow,
  cannotEverProduce:impossibleMachines,
  cannotEverStock:impossibleStock,
  certifiedZero:{
   routeRates:impossibleFlow,
   recipeCycleRates:impossibleMachines.map(id=>'cycles:'+id),
   warehouseItemRates:impossibleStock
  },
  note:'Only impossibility certifies zero. Possibility does NOT certify positive sustained rates.'
 };
}
