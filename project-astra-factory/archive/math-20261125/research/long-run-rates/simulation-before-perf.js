'use strict';
// Simplified discrete-item experiment, intentionally distinct from a full game-accurate solver.
let sim=null,simVisualDirty=false,simClockRemainder=0;
// 每个传送带格沿入边中点 -> 中心 -> 出边中点走过1米；直角格两段各0.5米。
// 线路起点是第一格与机器出口格的共享边中点；终点是最后一格与机器入口格的共享边中点。
// 物品运动速度2米/秒；堵塞时以1米间距停在格子边中点，满线后背压到生产机器的输出缓存。
const BELT_SPEED=2,ITEM_SPACING=1,PORT_INTERVAL=1;
function routeLength(r){return (r.path?.length||0);}
// A belt only operates when both physical ends are connected. Material
// compatibility is intentionally NOT part of this test.
function beltConnected(r){if(!r?.to||!r.path?.length)return false;const a=machineById(r.from.id),b=machineById(r.to.id);return !!(a&&b&&outPort(a,r.from.port)&&inPort(b,r.to.port));}
function beltFullyBlocked(r,packets){
 const n=routeLength(r);
 return n>0&&packets?.length>=n+1&&packets[0].distance>=n-1e-6&&packets.at(-1).distance<=1e-6;
}

// Return world coordinates directly (not tile indices), so render does not add an extra 0.5 tile.
function beltPathGeometry(r){
 const path=r.path||[],n=path.length;if(!n)return null;
 const source=machineById(r.from.id),target=r.to&&machineById(r.to.id);
 const op=source&&outPort(source,r.from.port),ip=r.to?(target&&inPort(target,r.to.port)):openRouteVirtualEnd(path,op,r.openEndSide);
 if(!op||!ip)return null;
 const first=path[0],last=path[n-1],sx=first[0]-op.x,sy=first[1]-op.y,tx=ip.x-last[0],ty=ip.y-last[1];
 if(Math.abs(sx)+Math.abs(sy)!==1||Math.abs(tx)+Math.abs(ty)!==1)return null;
 return {path,n,sx,sy,tx,ty};
}
// Position AND instantaneous tangent along the same piecewise-linear
// centerline used by packets. The tangent turns 90 degrees at a corner.
function beltPathPoint(g,distance){
 const {path,n,sx,sy,tx,ty}=g,d=Math.max(0,Math.min(n,distance)),first=path[0],last=path[n-1];
 if(d<.5)return [first[0]+.5+sx*(d-.5),first[1]+.5+sy*(d-.5),sx,sy];
 if(d>=n-.5)return [last[0]+.5+tx*(d-n+.5),last[1]+.5+ty*(d-n+.5),tx,ty];
 const u=d-.5,i=Math.floor(u),f=u-i,a=path[i],b=path[i+1],dx=b[0]-a[0],dy=b[1]-a[1];
 return [a[0]+.5+dx*f,a[1]+.5+dy*f,dx,dy];
}
function packetCoords(r,p){const g=beltPathGeometry(r);return g?beltPathPoint(g,p.distance).slice(0,2):null;}

// Keep a snapshot of physical identities, not just M#/R# record numbers.
// The AST1 editor renumbers records when a machine or belt is removed.
let simLayoutSnapshot=null;
function simMachineState(){
 return {inputs:{},portInputs:{},portItems:{},received:{},sent:{},consumed:{},queue:[],
  ingredientQueues:{},mergerQueue:[],warehouseQueue:[],lastWarehouseFill:simTime,consumerQueue:[],consumerElapsed:0,
  busy:0,tick:0,lastSend:{},lastReceive:{},roundRobin:0,portQueues:{}};
}
function simMachineServiceKey(m){
 const r=getRecipe(m);
 return JSON.stringify([m.type,m.type==='仓出'?m.item||'':null,
  r?[r.output,r.qty,r.seconds,Object.entries(r.inputs||{}).sort()]:null]);
}
function simMachinePhysicalKey(m){
 return JSON.stringify([m.type,m.x,m.y,m.face||'E',...dims(m),!!m.ast1GamePorts,!!m.ast1Mirrored]);
}
function simCaptureLayout(){
 const machines=state.machines.map(m=>({ref:m,id:m.id,physical:simMachinePhysicalKey(m),service:simMachineServiceKey(m)}));
 const routes=state.routes.map(r=>({ref:r,id:r.id,from:{...r.from},path:r.path.map(p=>[...p])}));
 simLayoutSnapshot={machines,routes};
}
// Reconcile only the changed entities. Inventory, timestamps, cumulative
// actual counters, minute history, chart history and the running flag survive.
// A layout edit is a single synchronous stock transfer. Inputs are the
// canonical aggregate of ALL received-but-not-consumed items, including
// splitter, merger and computer FIFOs. Their per-port/queue mirrors must
// never be counted again. Already committed recipe ingredients are not in
// inputs; only actually existing stacks are returned.
function collectMachineReturns(s,add){
 if(!s)return;
 for(const [item,n] of Object.entries(s.inputs||{}))add(item,n);
 for(const item of s.queue||[])add(item,1);
 for(const item of s.warehouseQueue||[])add(item,1);
}
function commitLayoutReturns(items){
 if(!Object.keys(items).length)return;
 const total=sim.editReturns??={};
 const buckets=sim.minuteBuckets??=[];
 const i=Math.max(0,Math.floor((simTime-1e-7)/60));
 const bucket=buckets[i]??={inbound:{},outbound:{}};
 const returns=bucket.editReturns??={};
 for(const [item,n] of Object.entries(items)){
  ware[item]=(ware[item]||0)+n;
  total[item]=(total[item]||0)+n;
  returns[item]=(returns[item]||0)+n;
 }
 if(typeof stockChartScheduleRender==='function')stockChartScheduleRender();
}
function reconcileSimulationLayout(){
 if(!sim||!simLayoutSnapshot){resetSimulation();return;}
 const old=simLayoutSnapshot,previousByMachine=sim.byMachine,previousRoutes=sim.routes;
 const returned=Object.create(null),add=(item,n)=>{if(typeof item==='string'&&item&&Number.isSafeInteger(n)&&n>0)returned[item]=(returned[item]||0)+n;};
 const refundedMachines=new Set(),refundedRoutes=new Set();
 const refundMachine=prior=>{if(!refundedMachines.has(prior)){refundedMachines.add(prior);collectMachineReturns(previousByMachine[prior.id],add);}};
 const refundRoute=prior=>{if(!refundedRoutes.has(prior)){refundedRoutes.add(prior);for(const packet of previousRoutes[prior.id]||[])add(packet.item,1);}};
 const byRef=new Map(old.machines.map(m=>[m.ref,m]));
 const byPhysical=new Map(old.machines.map(m=>[m.physical,m]));
 const usedMachines=new Set(),oldToNew=new Map(),newByMachine={};
 for(const m of state.machines){
  let prior=byRef.get(m)||byPhysical.get(simMachinePhysicalKey(m));
  if(prior&&usedMachines.has(prior))prior=null;
  if(prior){
   usedMachines.add(prior);oldToNew.set(prior.id,m.id);
  }
  const priorState=prior&&previousByMachine[prior.id];
  const sameService=prior&&prior.service===simMachineServiceKey(m);
  // Keep existing material queues on physically surviving machines.
  // Changing the recipe/warehouse item clears that machine's incompatible
  // queues and in-progress batch, but keeps its historical counters.
  const next=sameService&&priorState?priorState:simMachineState();
  if(priorState&&!sameService){
   refundMachine(prior);
   next.received=priorState.received;next.sent=priorState.sent;next.consumed=priorState.consumed;
  }
  newByMachine[m.id]=next;
 }
 for(const prior of old.machines)if(!usedMachines.has(prior))refundMachine(prior);
 const oldRouteRef=new Map(old.routes.map(r=>[r.ref,r]));
 const oldRouteSource=new Map(old.routes.filter(r=>oldToNew.has(r.from.id))
  .map(r=>[JSON.stringify([oldToNew.get(r.from.id),r.from.port]),r]));
 const usedRoutes=new Set(),newRoutes={};
 for(const r of state.routes){
  const key=JSON.stringify([r.from.id,r.from.port]);
  let prior=oldRouteRef.get(r)||oldRouteSource.get(key);
  if(prior&&(usedRoutes.has(prior)||oldToNew.get(prior.from.id)!==r.from.id||prior.from.port!==r.from.port))
   prior=null;
  if(!prior){newRoutes[r.id]=[];continue;}
  usedRoutes.add(prior);
  let prefix=0;
  while(prefix<prior.path.length&&prefix<r.path.length&&
   prior.path[prefix][0]===r.path[prefix][0]&&prior.path[prefix][1]===r.path[prefix][1])prefix++;
  const packets=previousRoutes[prior.id]||[];
  // A pure extension or an unchanged belt retains existing packets.
  // Removing ANY old tile (including a reroute) empties the ENTIRE old
  // belt into the warehouse; no packet survives in its retained prefix.
  const removesOldTile=prefix<prior.path.length;
  if(removesOldTile){refundRoute(prior);newRoutes[r.id]=[];}
  else newRoutes[r.id]=packets;
 }
 for(const prior of old.routes)if(!usedRoutes.has(prior))refundRoute(prior);
 // First detach old owners, then credit their items, then capture the new
 // identities. No simulation step/yield occurs inside this transaction.
 // Repeated reconciliation and undo cannot restore a refunded queue.
 sim.byMachine=newByMachine;sim.routes=newRoutes;
 commitLayoutReturns(returned);
 simCaptureLayout();simVisualDirty=true;
}

function resetSimulation(){running=false;simClockRemainder=0;frozenSimCache=null;let btn=$('run');if(btn){btn.textContent='▶ 运行模拟';btn.classList.add('primary');btn.classList.remove('sim-running');}simTime=0;ware={};sim={byMachine:{},routes:{},inbound:{},outbound:{},crafts:{},consumed:{},editReturns:{},minuteBuckets:[]};stockChartReset();
 for(let m of state.machines)sim.byMachine[m.id]=simMachineState();
 for(let r of state.routes)sim.routes[r.id]=[];
 simCaptureLayout();warehouseRefresh();draw();simVisualDirty=false;}
function sendItem(m,s,index,item){const r=routeFor(m.id,'out',index);if(!beltConnected(r))return false;
 const list=sim.routes[r.id]??[];
 if(list.length&&list[list.length-1].distance<ITEM_SPACING-1e-8)return false;
 const last=s.lastSend[index]??-1e6;if(simTime-last<PORT_INTERVAL-1e-6)return false;
 const outFilter=outPort(m,index)?.filter||'';if(outFilter&&outFilter!=='任意'&&outFilter!==item)return false;
 // Material eligibility is checked only on ARRIVAL, not by the sender.
 // A wrongly wired belt can carry items until its head is rejected and backs up.
 list.push({item,distance:0});simVisualDirty=true;sim.routes[r.id]=list;s.lastSend[index]=simTime;s.sent[item]=(s.sent[item]||0)+1;return true;}
function inputCap(m,item,port){let rec=getRecipe(m);
 if(rec){return (rec.inputs[item]||0)*3;}
 if(m.type==='电脑')return 10;
 // 分流/汇流按每个入口保留3件，普通配方缓存按其输入用量×3。
 if(m.type==='分流'||m.type==='汇流')return 3;
 return 0;
}
function acceptItem(m,port,item){let s=sim.byMachine[m.id];if(m.type==='仓入'){
   if(!acceptsMaterial(m,item,port))return false;
   if(s)s.received[item]=(s.received[item]||0)+1;
   ware[item]=(ware[item]||0)+1;sim.inbound[item]=(sim.inbound[item]||0)+1;recordWarehouseMovement('inbound',item);return true;
 }
 if(!s)return false;
 if(!acceptsMaterial(m,item,port))return false;
 const last=s.lastReceive[port]??-1e6;if(simTime-last<PORT_INTERVAL-1e-6)return false;
 // One ANY-material quantum-computer FIFO, capacity 10. Destruction
 // occurs separately, one item per second, not on receipt.
 if(m.type==='电脑'){
  const q=s.consumerQueue??=[];
  if(q.length>=10)return false;
  q.push(item);
  s.inputs[item]=(s.inputs[item]||0)+1;
  s.lastReceive[port]=simTime;
  s.received[item]=(s.received[item]||0)+1;
  simVisualDirty=true;
  return true;
 }
 const cap=inputCap(m,item,port);if(!cap)return false;
 if(m.type==='汇流'){
  // The sole internal queue is the 3-slot OUTPUT FIFO, not an inlet cache.
  if(s.mergerQueue.length>=3)return false;
  s.mergerQueue.push({item,port});
  s.inputs[item]=(s.inputs[item]||0)+1;
  s.portInputs[port]=(s.portInputs[port]||0)+1; // diagnostics only
  const counter=s.portItems[port]??={};
  counter[item]=(counter[item]||0)+1; // diagnostics only
  s.received[item]=(s.received[item]||0)+1;
  s.lastReceive[port]=simTime;
  simVisualDirty=true;
  return true;
 }
 if(m.type==='分流'){
   const current=(s.portInputs[port]||0);if(current>=cap)return false;
   s.portInputs[port]=current+1;
 }else if((s.inputs[item]||0)>=cap)return false;
 const byPort=(s.portItems[port]??={});byPort[item]=(byPort[item]||0)+1;
 // Keep the real per-inlet arrival order instead of just material totals.
 if(m.type==='分流'){
  (s.portQueues??={})[port]??=[];
  s.portQueues[port].push(item);
 }else if(getRecipe(m)){
  // Independent FIFO per recipe ingredient; preserves original physical inlet.
  (s.ingredientQueues[item]??=[]).push(String(port));
 }
 s.inputs[item]=(s.inputs[item]||0)+1;s.received[item]=(s.received[item]||0)+1;s.lastReceive[port]=simTime;return true;}
function removeBuffered(m,s,item,selectedPort){if(!(s.inputs[item]>0))return false;
 // The merger dequeues the specific physical inlet selected by round robin.
 const ingredientQueue=s.ingredientQueues?.[item];
 const firstRecipePort=selectedPort===undefined&&ingredientQueue?.length?ingredientQueue[0]:undefined;
 const port=selectedPort!==undefined?String(selectedPort):firstRecipePort!==undefined?String(firstRecipePort):
  Object.keys(s.portItems).find(idx=>(s.portItems[idx]?.[item]||0)>0);
 if(firstRecipePort!==undefined)ingredientQueue.shift();
 if(port!==undefined){
  const fifo=s.portQueues?.[port];
  if(fifo?.length){
   if(fifo[0]!==item)throw Error('Physical input FIFO mismatch: '+m.id+'/'+port);
   fifo.shift();
  }
  s.portItems[port][item]--;if(s.portItems[port][item]===0)delete s.portItems[port][item];
  if(m.type==='分流'||m.type==='汇流')s.portInputs[port]=Math.max(0,(s.portInputs[port]||0)-1);
 }
 s.inputs[item]--;return true;
}


// Merger input selection is a separate scanner. The only internal storage
// is ONE shared three-item output FIFO, just like a production machine's
// output queue. There are no extra three-slot inlet caches.
function mergerEnqueueOne(m,s){
 if(s.mergerQueue.length>=3)return false;
 const ports=mergerInputOrder(m);
 for(let k=0;k<ports.length;k++){
  const pos=(s.roundRobin+k)%ports.length;
  const port=ports[pos].index,r=routeFor(m.id,'in',port);
  if(!r)continue;
  const pk=sim.routes[r.id]||[];
  if(!pk.length||pk[0].distance<routeLength(r)-1e-6)continue;
  if(!acceptItem(m,port,pk[0].item))continue;
  pk.shift();s.roundRobin=(pos+1)%ports.length;
  simVisualDirty=true;
  return true;
 }
 return false;
}
function mergerDequeueOne(m,s){
 const head=s.mergerQueue[0];
 if(!head||!sendItem(m,s,0,head.item))return false;
 s.mergerQueue.shift();
 s.inputs[head.item]--;
 s.portInputs[head.port]--;
 const counter=s.portItems[head.port];
 if(counter){
  counter[head.item]--;
  if(!counter[head.item])delete counter[head.item];
 }
 return true;
}
// Warehouse-out has a real 3-item OUTPUT FIFO. Refill and physical send
// have separate one-second cooldowns. A refill debits the warehouse even
// with no connected belt; an unsuccessful attempt never consumes a slot.
function warehouseFillOutputQueue(m,s){
 const item=m.item,q=s.warehouseQueue??[];
 if(!item||q.length>=3||(ware[item]||0)<1)return false;
 if(simTime-(s.lastWarehouseFill??0)<PORT_INTERVAL-1e-6)return false;
 q.push(item);s.lastWarehouseFill=simTime;ware[item]--;
 sim.outbound[item]=(sim.outbound[item]||0)+1;
 recordWarehouseMovement('outbound',item);simVisualDirty=true;
 return true;
}
function warehouseDequeueOne(m,s){
 const head=s.warehouseQueue?.[0];
 if(head===undefined||!sendItem(m,s,0,head))return false;
 s.warehouseQueue.shift();
 return true;
}


// Frozen factories use one shared service clock each. All configured rates
// advance together; no credit accumulates during a blocked interval.
// A tick's whole-item debits are checked atomically before any credit is paid.
// Current-layout warehouse refills are completed before frozen service.
// Frozen protection applies only between frozen factories in this tick.
let frozenSimCache=null;
function simulateFrozenFactories(dt){
 sim.frozenReserved={};
 if(!state.frozenFactories?.length){if(sim.frozenRuntime)sim.frozenRuntime={};return;}
 if(!frozenSimCache||frozenSimCache.list!==state.frozenFactories){
  frozenSimCache={list:state.frozenFactories,configs:normalizeFrozenFactories(state.frozenFactories).map(f=>({
   ...f,signature:JSON.stringify(f.rates),entries:Object.entries(f.rates).map(([item,v])=>[item,frozenRateNumber(v)])
  }))};
 }
 const previous=sim.frozenRuntime||{},next={};
 for(const f of frozenSimCache.configs){
  let r=previous[f.id];
  if(!r||r.signature!==f.signature)r={signature:f.signature,phase:{},activeTime:0,totalTime:0,blocked:[],running:false};
  next[f.id]=r;r.totalTime+=dt;r.running=false;r.blocked=[];
  if(!f.enabled||!f.entries.length)continue;
  const inputs=f.entries.filter(([,v])=>v<0);
  const available=item=>Math.max(0,(ware[item]||0)-(sim.frozenReserved[item]||0));
  r.blocked=inputs.filter(([item])=>available(item)<1).map(([item])=>item);
  if(r.blocked.length)continue;
  // Limit common elapsed service time when a high-rate source consumes
  // more than the available stock in one simulator tick.
  let service=dt;
  for(const [item,v] of inputs)service=Math.min(service,Math.max(0,(available(item)-(r.phase[item]||0))/-v));
  if(service<=0)continue;
  const moves=f.entries.map(([item,v])=>{
   const acc=(r.phase[item]||0)+Math.abs(v)*service,n=Math.floor(acc+1e-9);
   return {item,v,n,phase:Math.max(0,acc-n)};
  });
  if(moves.some(m=>m.v<0&&m.n>available(m.item)))continue;
  r.running=true;r.activeTime+=service;
  for(const m of moves){
   r.phase[m.item]=m.phase;if(!m.n)continue;
   const direction=m.v>0?'inbound':'outbound';
   ware[m.item]=(ware[m.item]||0)+(m.v>0?m.n:-m.n);
   sim[direction][m.item]=(sim[direction][m.item]||0)+m.n;
   recordWarehouseMovement(direction,m.item,m.n);
  }
  // Retain one next input item per ingredient only while all are present.
  // This stops lower-priority consumers from stealing a fractional-rate
  // source's next whole item while its common service clock is advancing.
  if(inputs.every(([item])=>available(item)>=1))for(const [item] of inputs)sim.frozenReserved[item]=(sim.frozenReserved[item]||0)+1;
 }
 sim.frozenRuntime=next;
}

function simulate(dt){simTime+=dt;
 // 队列 index=0 永远是最前面的物品；先移动前车，再移动后车。
 // 接收方停止收货时，最前面的包裹停在机器入口边中点，其余包裹以1米间隔停在连续格边中点。
 const arrivals=new Map();
 for(const r of state.routes){if(!beltConnected(r))continue;const pk=sim.routes[r.id]||[],target=machineById(r.to.id);const end=routeLength(r);
  for(let i=0;i<pk.length;i++){
   const ahead=i===0?end:pk[i-1].distance-ITEM_SPACING;
   const was=pk[i].distance;
   pk[i].distance=Math.max(was,Math.min(end,ahead,was+BELT_SPEED*dt));
   if(pk[i].distance!==was)simVisualDirty=true;
  }
  if(pk.length&&pk[0].distance>=end-1e-6&&target&&target.type!=='汇流'){
   let group=arrivals.get(target.id);
   if(!group){group={target,ready:[]};arrivals.set(target.id,group);}
   group.ready.push({port:r.to.port,pk});
  }
 }
 // All belts have moved before receiving. Only simultaneously ready heads
 // compete; an idle right-hand port never prevents a left-hand arrival.
 // Merger retains its separate round-robin scanner and shared output FIFO.
 for(const {target,ready} of arrivals.values()){
  if(ready.length>1){
   const rank=new Map(machineInputPriority(target).map((p,i)=>[p.index,i]));
   ready.sort((a,b)=>(rank.get(a.port)??Infinity)-(rank.get(b.port)??Infinity));
  }
  for(const {port,pk} of ready)if(acceptItem(target,port,pk[0].item)){
   pk.shift();simVisualDirty=true;
  }
 }
 // Current-layout warehouse refills take actual stock first, in numeric
 // machine-ID order. Do not give frozen demand priority over a ready outlet.
 // Refill precedes dispatch; both are separate cooldown-limited events.
 for(const outlet of state.machines.filter(m=>m.type==="仓出").sort(warehouseMachinePriorityCompare)){
  const os=sim.byMachine[outlet.id];
  if(os)warehouseFillOutputQueue(outlet,os);
 }
 simulateFrozenFactories(dt);
 for(const m of state.machines){const s=sim.byMachine[m.id];if(!s)continue;const rec=getRecipe(m);
  if(m.type==='仓出'){
   warehouseDequeueOne(m,s);
   continue;
  }
  if(m.type==='电脑'){
   const q=s.consumerQueue;
   if(!q.length){s.consumerElapsed=0;continue;}
   s.consumerElapsed+=dt;
   while(q.length&&s.consumerElapsed>=PORT_INTERVAL-1e-7){
    const item=q.shift();
    s.consumerElapsed-=PORT_INTERVAL;
    s.inputs[item]--;
    s.consumed[item]=(s.consumed[item]||0)+1;
    sim.consumed[item]=(sim.consumed[item]||0)+1;
    simVisualDirty=true;
   }
   if(!q.length)s.consumerElapsed=0;
   continue;
  }
  if(m.type==='分流'){
   const outs=getPorts(m).filter(p=>p.kind==='out');
   const item=s.portQueues?.[0]?.[0]??Object.keys(s.inputs).find(q=>s.inputs[q]>0);
   if(item!==undefined&&outs.length){
    for(let k=0;k<outs.length;k++){
     const idx=(s.roundRobin+k)%outs.length,port=outs[idx].index;
     // Unconnected ports can be skipped. A mismatched FILTER CANNOT:
     // retain the FIFO head and the RR cursor and block this splitter.
     if(!beltConnected(routeFor(m.id,'out',port)))continue;
     const filter=outPort(m,port)?.filter||'';
     if(filter&&filter!=='任意'&&filter!==item)break;
     if(sendItem(m,s,port,item)){
      removeBuffered(m,s,item,0);
      s.roundRobin=(idx+1)%outs.length;
      break;
     }
    }
   }
   continue;
  }
  if(m.type==='汇流'){
   // Output and inlet RR are separate; freshly scanned item waits a tick.
   mergerDequeueOne(m,s);
   mergerEnqueueOne(m,s);
   continue;
  }
  if(rec){const maxOutput=rec.qty*20,canProduce=s.queue.length+rec.qty<=maxOutput;
   // Finishing a batch and starting the next one in the *same* simulation tick
   // avoids a spurious 0.05-second gap per craft (e.g. nominal 40 gears/min
   // must not be reduced to 38.7 solely by the simulation loop).
   if(s.busy>0){s.busy=Math.max(0,s.busy-dt);if(s.busy<=1e-7){s.busy=0;for(let j=0;j<rec.qty;j++)s.queue.push(rec.output);sim.crafts[rec.output]=(sim.crafts[rec.output]||0)+rec.qty;}}
   if(s.busy<=0){
    if(Object.keys(rec.inputs).length===0){
     if(canProduce){s.tick+=dt;if(s.tick>=rec.seconds-1e-7){s.tick=Math.max(0,s.tick-rec.seconds);for(let j=0;j<rec.qty;j++)s.queue.push(rec.output);sim.crafts[rec.output]=(sim.crafts[rec.output]||0)+rec.qty;}}
     else s.tick=Math.min(s.tick,rec.seconds);
    }else if(s.queue.length+rec.qty<=maxOutput&&Object.entries(rec.inputs).every(([k,n])=>(s.inputs[k]||0)>=n)){
     for(const[k,n]of Object.entries(rec.inputs))for(let j=0;j<n;j++)removeBuffered(m,s,k);
     s.busy=rec.seconds;
    }
   }
   if(s.queue.length&&sendItem(m,s,0,s.queue[0]))s.queue.shift();
  }
 }
}
let simulationSpeed=1;
// UI-only discrete clock: realtime and +minutes use the identical steps.
// Preserve substep elapsed time rather than passing a variable dt to each
// port cooldown and recipe. The long-run math does not depend on this clock.
function advanceRealtimeSimulation(elapsed){
 if(!Number.isFinite(elapsed)||elapsed<=0)return;
 simClockRemainder+=elapsed;
 const steps=Math.floor((simClockRemainder+1e-10)/SIMULATION_STEP_SECONDS);
 simClockRemainder=Math.max(0,simClockRemainder-steps*SIMULATION_STEP_SECONDS);
 for(let i=0;i<steps;i++)simulate(SIMULATION_STEP_SECONDS);
}
function stepLoop(t){
 const elapsedReal=document.hidden?0:Math.min(.12,Math.max(0,(t-animationLast)/1000));animationLast=t;
 if(running){advanceRealtimeSimulation(elapsedReal*simulationSpeed);
  simPaintTimer+=elapsedReal;
  if(simPaintTimer>=.3){simPaintTimer=0;warehouseRefreshLive();inspectorRefreshLive();stockChartMaybeRefresh();}
 }
 // The animation is intentionally limited to 24 fps. RAF still schedules
 // simulation using elapsed time, so the game speed and logical tick are unchanged.
 // Connected belts have a visual-only motion clock even before simulation
 // starts. Fully jammed and disconnected belts never advance that clock.
 if(!simAdvanceBusy && t-frameLastPaint>=1000/24 && !document.hidden){
  const beltDirty=typeof advanceBeltMotion==='function'&&advanceBeltMotion(t);
  if(beltDirty||(running&&simVisualDirty)){
   frameLastPaint=t;simVisualDirty=false;draw(true);
  }
 }
 requestAnimationFrame(stepLoop);
}
function addWarehouseTestStock(){
 if(simAdvanceBusy){notify('正在快进，请在完成后补充库存');return false;}
 if(!sim||simTime<=0){notify('请先运行模拟，再为当前仓库材料添加测试库存');return false;}
 const materials=warehouseView(false).materials;
 if(!materials.length){notify('当前实际收支表中暂无材料');return false;}
 // Manual test stock is not warehouse income: keep its inventory adjustment
 // separately in the same minute bucket so the actual-balance chart can
 // show the +100 increase without fabricating any receipt or expense.
 const bucketIndex=Math.max(0,Math.floor((simTime-1e-7)/60));
 const bucket=sim.minuteBuckets[bucketIndex]||=({inbound:{},outbound:{}});
 const manual=bucket.manualStock||={};
 for(const item of materials){
  ware[item]=(ware[item]||0)+100;
  manual[item]=(manual[item]||0)+100;
 }
 // A manual inventory injection is NOT a warehouse deposit or an
 // item-crafting event and must not modify inbound/outbound minute totals.
 warehouseRefreshLive();inspectorRefreshLive();stockChartRender();
 notify('已给实际收支涉及的 '+materials.length+' 种材料各补充100件库存（不计入入库）');
 return true;
}
let simAdvanceBusy=false;
const SIMULATION_STEP_SECONDS=.05;
const SIMULATION_STEPS_PER_MINUTE=Math.round(60/SIMULATION_STEP_SECONDS);
function updateStepMinuteButton(){
 const minutes=Math.max(1,Number($('simSpeed')?.value)||1);
 const btn=$('stepMinute');
 if(!btn||simAdvanceBusy)return;
 btn.textContent='⏩ +'+minutes+'分钟';
 btn.title='按逐件规则快进 '+minutes+' 分钟';
}
async function advanceSimulationMinute(){
 if(simAdvanceBusy)return;
 const minutes=Math.max(1,Number($('simSpeed')?.value)||1);
 const previous=running,btn=$('stepMinute'),advanceState=typeof sim==='undefined'?null:sim;
 const sameSimulation=()=>typeof sim==='undefined'||sim===advanceState;
 simAdvanceBusy=true;running=false;
 if(btn)btn.disabled=true;
 try{
  for(let minute=0;minute<minutes&&sameSimulation();minute++){
   for(let i=0;i<SIMULATION_STEPS_PER_MINUTE;i++)simulate(SIMULATION_STEP_SECONDS);
   if(minute+1<minutes&&minutes>1){
    if(btn)btn.textContent='⏩ '+(minute+1)+'/'+minutes+'分钟';
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
 }finally{
  if(sameSimulation())running=previous;simAdvanceBusy=false;
  if(typeof resetBeltMotionClock==='function')resetBeltMotionClock();
  if(btn)btn.disabled=false;
  updateStepMinuteButton();
  warehouseRefreshLive();inspectorRefreshLive();stockChartMaybeRefresh();
  draw(true);simVisualDirty=false;
 }
 if(sameSimulation())notify('已按逐件规则快进 '+minutes+' 分钟，仓库每分钟记录已更新');
}
