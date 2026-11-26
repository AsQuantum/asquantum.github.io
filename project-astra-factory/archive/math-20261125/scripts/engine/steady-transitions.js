'use strict';
// Exact 1/20-second deterministic QUEUE STATE TRANSITION system.
// This is a model checker (full discrete state, not fitted flow statistics).
// Ports, belts, ingredients, recipe output, warehouses, splitters, mergers,
// consumers all use the same "consume enabled input -> produce output" rule.
// We certify periodic production only upon a repeated finite control state,
// including FIFO contents, port cooldowns, route packet positions and jobs.
// Infinite warehouse stocks are represented by BigInt; positive stock-drift
// cycles require a further guard-stability test before certification.
//
// Limitations: this model matches the simulator's fixed dt=0.05s stepping;
// it does NOT assert continuous-time exactness or a solved AST1 global rate.
const STEADY_QUEUE_TICKS_PER_SECOND=20;
const STEADY_QUEUE_DISTANCE_TENTHS=10;
function steadyQueueRecipeTicks(seconds){
 const ticks=steadyExactMul(steadyExactQ(String(seconds)),steadyExactQ(STEADY_QUEUE_TICKS_PER_SECOND));
 if(ticks.d!==1n||ticks.n<1n||ticks.n>BigInt(Number.MAX_SAFE_INTEGER))
  throw Error('Recipe period cannot be represented exactly on the 0.05-second simulator tick: '+seconds);
 return Number(ticks.n);
}
function steadyQueueMergerPorts(raw,ports){
 const face=raw.face||'E';
 const left={E:'N',N:'W',W:'S',S:'E'}[face];
 const right={E:'S',S:'W',W:'N',N:'E'}[face];
 const back={E:'W',W:'E',N:'S',S:'N'}[face];
 const order=[left,back,right];
 return ports.filter(p=>p.kind==='in').sort((a,b)=>order.indexOf(a.side)-order.indexOf(b.side)).map(p=>p.index);
}
function steadyQueueCompile(layout=state){
 if(!layout?.machines||!layout?.routes)throw Error('Missing factory layout');
 const machines=[],routes=[],ids=new Set(),routeIds=new Set(),physicalPorts=new Set();
 for(const raw of layout.machines){
  if(!raw.id||ids.has(raw.id))throw Error('Duplicate/invalid machine id');
  ids.add(raw.id);
  const rec=getRecipe(raw);
  const ports=getPorts(raw).map(p=>({
   index:p.index,kind:p.kind,filter:p.filter||'',side:p.side
  }));
  let kind=null,recipe=null,capacity=null;
  if(rec){
   kind='recipe';
   if(!Number.isSafeInteger(rec.qty)||rec.qty<1)throw Error('Invalid recipe batch size');
   const ingredients=Object.entries(rec.inputs||{}).map(([item,qty])=>{
    if(!Number.isSafeInteger(qty)||qty<1)throw Error('Invalid recipe input quantity');
    return {item,qty,capacity:qty*3};
   });
   recipe={ingredients,output:rec.output,qty:rec.qty,
    durationTicks:steadyQueueRecipeTicks(rec.seconds),capacity:20*rec.qty};
  }else if(raw.type==='仓入')kind='stock-in';
  else if(raw.type==='仓出')kind='stock-out';
  else if(raw.type==='汇流')kind='merger';
  else if(raw.type==='分流')kind='splitter';
  else if(raw.type==='电脑')kind='consumer';
  else kind='inert';
  machines.push({
   id:raw.id,type:raw.type,kind,recipe,
   item:raw.item||'',
   inletItem:raw.inletItem||'',
   ports,
   inputPriority:machineInputPriority(raw).map(p=>p.index),
   mergerScan:kind==='merger'?steadyQueueMergerPorts(raw,ports):[],
   splitterOutputs:kind==='splitter'?ports.filter(p=>p.kind==='out').map(p=>p.index):[]
  });
 }
 const machineById=new Map(machines.map(m=>[m.id,m]));
 for(const raw of layout.routes){
  if(!raw.id||routeIds.has(raw.id))throw Error('Duplicate/invalid route ID');
  routeIds.add(raw.id);
  const from=machineById.get(raw.from?.id);
  const to=raw.to?machineById.get(raw.to.id):null;
  if(!from||raw.to&&!to)throw Error('Route has unknown machine: '+raw.id);
  const fromPort=from.ports.find(p=>p.kind==='out'&&p.index===raw.from.port);
  const toPort=raw.to&&to.ports.find(p=>p.kind==='in'&&p.index===raw.to.port);
  if(!fromPort||raw.to&&!toPort)throw Error('Invalid physical port on route: '+raw.id);
  if(!Number.isInteger(raw.path?.length)||raw.path.length<1)
   throw Error('Route length missing: '+raw.id);
  if(typeof checkPath==='function'&&raw.to&&checkPath(raw.path,raw.from,raw.to,raw.id))
   throw Error('Route geometry invalid: '+raw.id);
  for(const [id,dir,port] of [[from.id,'out',raw.from.port],...(raw.to?[[to.id,'in',raw.to.port]]:[])]){
   const key=id+'/'+dir+'/'+port;
   if(physicalPorts.has(key))throw Error('Multiple belts attached to one physical port: '+key);
   physicalPorts.add(key);
  }
  routes.push({id:raw.id,from:from.id,fromPort:raw.from.port,
   to:to?.id||null,toPort:raw.to?.port??null,
   lengthTenths:raw.path.length*STEADY_QUEUE_DISTANCE_TENTHS});
 }
 return {
  method:'0.05-second deterministic colored timed FIFO transition system',
  tickSeconds:'1/20',ticksPerSecond:STEADY_QUEUE_TICKS_PER_SECOND,
  machines,routes,warehouseMaterials:[...new Set(machines.filter(m=>m.kind==='stock-out').map(m=>m.item).filter(Boolean))],
  assumptions:['Physical item travel increment 0.1m/tick and spacing 1m',
   'At most one item sent/received per port every 20 ticks',
   'Warehouse stocked items remain reserved until physically sent'],
  caution:'Exact periodic certificates are for this 0.05-second discrete simulator schedule, NOT all continuous-time schedules'
 };
}
function steadyQueueInitial(model,{warehouse={}}={}){
 const stocks={};
 for(const [item,count] of Object.entries(warehouse)){
  const quantity=BigInt(count);
  if(quantity<0n)throw Error('Negative starting stock '+item);
  stocks[item]=quantity;
 }
 const machines={};
 for(const m of model.machines){
  const inputs={};
  for(const ingredient of m.recipe?.ingredients||[])inputs[ingredient.item]=[];
  machines[m.id]={
   inputs,output:[],splitter:[],merger:[],reserved:[],consumer:[],
   busyTicks:0,generatorTicks:0,consumerTicks:0,
   rr:0,nextSend:{},nextReceive:{}
  };
 }
 return {
  tick:0,stock:stocks,machines,
  routes:Object.fromEntries(model.routes.map(r=>[r.id,[]])),
  counters:{warehouseIn:{},warehouseOut:{},crafts:{},routeSent:{},consumed:{},cycles:{}},
  emptyAttempts:{}
 };
}
function steadyQueueCountAdd(map,item,qty=1n){map[item]=(map[item]||0n)+qty;}
function steadyQueueStockTotal(model,s,item){
 let sum=s.stock[item]||0n;
 for(const m of model.machines)if(m.kind==='stock-out'&&m.item===item)
  sum+=BigInt(s.machines[m.id].reserved.length);
 return sum;
}
function steadyQueueStep(model,s){
 s.tick++;
 const byId=new Map(model.machines.map(m=>[m.id,m]));
 const inRoutes=new Map(),outRoutes=new Map();
 for(const r of model.routes){
  inRoutes.set(r.to+'/'+r.toPort,r);
  outRoutes.set(r.from+'/'+r.fromPort,r);
 }
 const machineState=id=>s.machines[id];
 const outputRoute=(id,port)=>outRoutes.get(id+'/'+port);
 const inputRoute=(id,port)=>inRoutes.get(id+'/'+port);
 const materialAccepted=(m,item,port)=>{
  // Both warehouse inlets and quantum consumers can have a physical
  // inletItem filter. The live simulator applies this before enqueue.
  if(m.kind==='stock-in'||m.kind==='consumer')
   return !m.inletItem||m.inletItem==='任意'||m.inletItem===item;
  if(m.kind==='recipe')return m.recipe.ingredients.some(i=>i.item===item);
  if(m.kind==='stock-out'||m.kind==='inert')return false;
  return true;
 };
 const send=(m,ms,port,item)=>{
  const r=outputRoute(m.id,port);
  if(!r)return false;
  const packets=s.routes[r.id];
  if(packets.length&&packets[packets.length-1].distance<STEADY_QUEUE_DISTANCE_TENTHS)return false;
  if((ms.nextSend[port]||0)>s.tick)return false;
  const selected=m.ports.find(p=>p.kind==='out'&&p.index===port);
  if(selected?.filter&&selected.filter!=='任意'&&selected.filter!==item)return false;
  if(r.to&&!materialAccepted(byId.get(r.to),item,r.toPort))return false;
  packets.push({item,distance:0});
  ms.nextSend[port]=s.tick+STEADY_QUEUE_TICKS_PER_SECOND;
  steadyQueueCountAdd(s.counters.routeSent,r.id+'|'+item);
  return true;
 };
 const receive=(m,ms,port,item)=>{
  if(!materialAccepted(m,item,port))return false;
  if(m.kind==='stock-in'){
   steadyQueueCountAdd(s.stock,item);
   steadyQueueCountAdd(s.counters.warehouseIn,item);
   return true;
  }
  if((ms.nextReceive[port]||0)>s.tick)return false;
  if(m.kind==='recipe'){
   const req=m.recipe.ingredients.find(i=>i.item===item),q=ms.inputs[item];
   if(!req||q.length>=req.capacity)return false;
   q.push(port);
  }else if(m.kind==='splitter'){
   if(ms.splitter.length>=3)return false;
   ms.splitter.push(item);
  }else if(m.kind==='merger'){
   if(ms.merger.length>=3)return false;
   ms.merger.push({item,port});
  }else if(m.kind==='consumer'){
   if(ms.consumer.length>=10)return false;
   ms.consumer.push(item);
  }else return false;
  ms.nextReceive[port]=s.tick+STEADY_QUEUE_TICKS_PER_SECOND;
  return true;
 };
 // 1. Move all belts before resolving simultaneous arrivals by receiver.
 //    A failed belt head cannot be skipped; mergers retain their RR phase.
 const arrivals=new Map();
 for(const r of model.routes){
  const q=s.routes[r.id];
  for(let i=0;i<q.length;i++){
   const bound=i===0?r.lengthTenths:q[i-1].distance-STEADY_QUEUE_DISTANCE_TENTHS;
   q[i].distance=Math.max(q[i].distance,Math.min(bound,q[i].distance+1));
  }
  if(q.length&&q[0].distance>=r.lengthTenths&&r.to){
   const m=byId.get(r.to);
   if(m.kind!=='merger'){
    if(!arrivals.has(m.id))arrivals.set(m.id,[]);
    arrivals.get(m.id).push(r);
   }
  }
 }
 for(const [id,ready] of arrivals){
  const m=byId.get(id),ms=machineState(id);
  if(ready.length>1){
   const order=m.inputPriority||[];
   ready.sort((a,b)=>order.indexOf(a.toPort)-order.indexOf(b.toPort));
  }
  for(const r of ready){
   const q=s.routes[r.id];
   if(receive(m,ms,r.toPort,q[0].item))q.shift();
  }
 }
 // 2. Warehouse stock is reserved IN MACHINE-NUMBER PRIORITY ORDER.
 // Every warehouse outlet has a private three-item reservation FIFO;
 // slow arrivals can be monopolized by the smallest numbered outlet.
 for(const m of model.machines.filter(m=>m.kind==="stock-out").sort(warehouseMachinePriorityCompare)){
  const ms=machineState(m.id),item=m.item,r=outputRoute(m.id,0);
  if(!r||!item)continue;
  while(ms.reserved.length<3&&(s.stock[item]||0n)>0n){
   s.stock[item]--;ms.reserved.push(item);
  }
  if(ms.reserved.length<3&&(s.stock[item]||0n)===0n)
   steadyQueueCountAdd(s.emptyAttempts,item);
 }
 // 3. Transfer/processing still uses original physical layout order.
 for(const m of model.machines){
  const ms=machineState(m.id);
  if(m.kind==='stock-out'){
   if(ms.reserved.length&&send(m,ms,0,ms.reserved[0])){
    ms.reserved.shift();
    steadyQueueCountAdd(s.counters.warehouseOut,m.item);
   }
   continue;
  }
  if(m.kind==='consumer'){
   if(!ms.consumer.length){ms.consumerTicks=0;continue;}
   ms.consumerTicks++;
   while(ms.consumer.length&&ms.consumerTicks>=STEADY_QUEUE_TICKS_PER_SECOND){
    const item=ms.consumer.shift();ms.consumerTicks-=STEADY_QUEUE_TICKS_PER_SECOND;
    steadyQueueCountAdd(s.counters.consumed,item);
   }
   if(!ms.consumer.length)ms.consumerTicks=0;
   continue;
  }
  if(m.kind==='splitter'){
   const item=ms.splitter[0],outs=m.splitterOutputs;
   if(item===undefined||!outs.length)continue;
   for(let k=0;k<outs.length;k++){
    const pos=(ms.rr+k)%outs.length,port=outs[pos],r=outputRoute(m.id,port);
    if(!r)continue;
    const filter=m.ports.find(p=>p.kind==='out'&&p.index===port)?.filter||'';
    if(filter&&filter!=='任意'&&filter!==item)break;
    if(send(m,ms,port,item)){ms.splitter.shift();ms.rr=(pos+1)%outs.length;break;}
   }
   continue;
  }
  if(m.kind==='merger'){
   if(ms.merger.length&&send(m,ms,0,ms.merger[0].item))ms.merger.shift();
   if(ms.merger.length>=3)continue;
   for(let k=0;k<m.mergerScan.length;k++){
    const pos=(ms.rr+k)%m.mergerScan.length,port=m.mergerScan[pos],r=inputRoute(m.id,port);
    if(!r)continue;
    const q=s.routes[r.id];
    if(q.length&&q[0].distance>=r.lengthTenths&&
     receive(m,ms,port,q[0].item)){
     q.shift();ms.rr=(pos+1)%m.mergerScan.length;break;
    }
   }
   continue;
  }
  if(m.kind!=='recipe')continue;
  const rec=m.recipe;
  const canProduce=ms.output.length+rec.qty<=rec.capacity;
  if(ms.busyTicks>0){
   ms.busyTicks--;
   if(ms.busyTicks===0){
    for(let n=0;n<rec.qty;n++)ms.output.push(rec.output);
    steadyQueueCountAdd(s.counters.crafts,rec.output,BigInt(rec.qty));
    steadyQueueCountAdd(s.counters.cycles,m.id);
   }
  }
  if(ms.busyTicks===0){
   if(!rec.ingredients.length){
    if(canProduce){
     ms.generatorTicks++;
     if(ms.generatorTicks>=rec.durationTicks){
      ms.generatorTicks-=rec.durationTicks;
      for(let n=0;n<rec.qty;n++)ms.output.push(rec.output);
      steadyQueueCountAdd(s.counters.crafts,rec.output,BigInt(rec.qty));
      steadyQueueCountAdd(s.counters.cycles,m.id);
     }
    }else ms.generatorTicks=Math.min(ms.generatorTicks,rec.durationTicks);
   }else if(ms.output.length+rec.qty<=rec.capacity&&
    rec.ingredients.every(req=>ms.inputs[req.item].length>=req.qty)){
    for(const req of rec.ingredients)ms.inputs[req.item].splice(0,req.qty);
    ms.busyTicks=rec.durationTicks;
   }
  }
  if(ms.output.length&&send(m,ms,0,ms.output[0]))ms.output.shift();
 }
 return s;
}
function steadyQueueControlKey(model,s){
 // Absolute port timestamps and monotone counters are irrelevant. Their
 // distance from current tick, clamped at zero, IS part of the finite state.
 const control=model.machines.map(m=>{
  const x=s.machines[m.id];
  const cooldown=ports=>Object.entries(ports).filter(([_,tick])=>tick>s.tick)
   .map(([port,tick])=>[port,tick-s.tick]).sort((a,b)=>+a[0]-+b[0]);
  return [m.id,x.inputs,x.output,x.splitter,x.merger,x.reserved,x.consumer,
   x.busyTicks,x.generatorTicks,x.consumerTicks,x.rr,
   cooldown(x.nextSend),cooldown(x.nextReceive)];
 });
 const routes=model.routes.map(r=>[r.id,s.routes[r.id]]);
 return JSON.stringify([control,routes]);
}
function steadyQueueExactCycleCertificate(model,since,now,emptyAttempts){
 const duration=now.tick-since.tick;
 if(duration<=0)throw Error('Invalid cycle interval');
 const items=new Set([...Object.keys(since.stock),...Object.keys(now.stock)]);
 const drift={};
 for(const item of items){
  const diff=(now.stock[item]||0n)-(since.stock[item]||0n);
  if(diff<0n)return null; // finite initial stock may be depleted eventually
  if(diff>0n){
   if((now.emptyAttempts[item]||0n)!==(since.emptyAttempts[item]||0n))
    return null; // adding growing stock would change an empty-reservation guard
   drift[item]=diff;
  }
 }
 const counters={},rates={};
 for(const group of Object.keys(now.counters)){
  counters[group]={};rates[group]={};
  const names=new Set([...Object.keys(since.counters[group]),...Object.keys(now.counters[group])]);
  for(const name of names){
   const delta=(now.counters[group][name]||0n)-(since.counters[group][name]||0n);
   if(delta<0n)throw Error('Non-monotone event counter');
   if(delta){
    counters[group][name]=delta.toString();
    rates[group][name]=steadyExactText(steadyExactFraction(delta*20n,BigInt(duration)));
   }
  }
 }
 // Warehouse totals include reservations, but reserved FIFO contents appear
 // in the finite control state and thus repeat unchanged across the cycle.
 const netWarehousePerSecond={};
 for(const item of new Set([...Object.keys(rates.warehouseIn),...Object.keys(rates.warehouseOut)])){
  const inflow=BigInt(counters.warehouseIn[item]||'0');
  const outflow=BigInt(counters.warehouseOut[item]||'0');
  netWarehousePerSecond[item]=steadyExactText(steadyExactFraction((inflow-outflow)*20n,BigInt(duration)));
 }
 return {
  certified:true,
  method:Object.keys(drift).length?'repeatable finite control state with nonnegative stock drift and no altered stock-empty guard':'exact repeated full finite state',
  periodTicks:duration,
  periodSeconds:steadyExactText(steadyExactFraction(BigInt(duration),20n)),
  sinceTick:since.tick,untilTick:now.tick,
  cycleEventCounts:counters,
  ratesPerSecond:rates,
  warehouseNetPerSecond:netWarehousePerSecond,
  inventoryIncreasePerPeriod:Object.fromEntries(Object.entries(drift).map(([item,q])=>[item,q.toString()])),
  proof:'All finite FIFO contents, port cooldowns, recipe timers, splitter/merger cursors and belt packet positions repeat. Unbounded warehouse drift is nonnegative; any growing stock never triggers an empty-stock guard during the period. Hence deterministic guards and transitions repeat forever.'
 };
}
function steadyQueueProve(model,{maxTicks=10000,initialWarehouse={},maxStates=10000}={}){
 if(!Number.isSafeInteger(maxTicks)||maxTicks<1)throw Error('maxTicks must be positive integer');
 const s=steadyQueueInitial(model,{warehouse:initialWarehouse});
 const seen=new Map();
 function snap(){
  const cloneBigInts=map=>Object.fromEntries(Object.entries(map).map(([k,v])=>[k,v]));
  return {tick:s.tick,stock:cloneBigInts(s.stock),
   emptyAttempts:cloneBigInts(s.emptyAttempts),
   counters:Object.fromEntries(Object.entries(s.counters).map(([name,map])=>[name,cloneBigInts(map)]))};
 }
 for(let n=0;n<=maxTicks;n++){
  const key=steadyQueueControlKey(model,s);
  const records=seen.get(key)||[];
  const here=snap();
  for(const previous of records){
   const certificate=steadyQueueExactCycleCertificate(model,previous,here);
   if(certificate)return certificate;
  }
  if(n===maxTicks||seen.size>=maxStates)break;
  if(records.length<5){records.push(here);seen.set(key,records);}
  steadyQueueStep(model,s);
 }
 return {
  certified:false,method:'exact finite-state recurrence search',
  checkedTicks:s.tick,checkedSeconds:steadyExactText(steadyExactFraction(BigInt(s.tick),20n)),
  distinctFiniteStates:seen.size,
  warning:'No repeatable state with safe inventory drift was found within limits. No steady rate is asserted. Lack of a certificate does NOT prove nonperiodicity, deadlock or nonuniqueness.'
 };
}
function steadyQueueSummary(model){
 const counts={};for(const m of model.machines)counts[m.kind]=(counts[m.kind]||0)+1;
 return {
  method:model.method,
  tickSeconds:model.tickSeconds,
  machines:model.machines.length,
  belts:model.routes.length,
  byKind:counts,
  limitedQueues:model.machines.reduce((n,m)=>n+
   (m.kind==='recipe'?m.recipe.ingredients.length+1:
   ['stock-out','merger','splitter','consumer'].includes(m.kind)?1:0),0),
  note:'Compiled physical state-transition graph. It is not an exact steady throughput until a periodic certificate is found.'
 };
}
