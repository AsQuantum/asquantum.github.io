'use strict';
// Simplified discrete-item experiment, intentionally distinct from a full game-accurate solver.
let sim=null,simVisualDirty=false;
// 每个传送带格沿入边中点 -> 中心 -> 出边中点走过1米；直角格两段各0.5米。
// 线路起点是第一格与机器出口格的共享边中点；终点是最后一格与机器入口格的共享边中点。
// 物品运动速度2米/秒；堵塞时以1米间距停在格子边中点，满线后背压到生产机器的输出缓存。
const BELT_SPEED=2,ITEM_SPACING=1,PORT_INTERVAL=1;
function routeLength(r){return (r.path?.length||0);}
// Return world coordinates directly (not tile indices), so render does not add an extra 0.5 tile.
function packetCoords(r,p){
 const path=r.path||[],n=path.length;
 if(!n)return null;
 const source=machineById(r.from.id),target=r.to&&machineById(r.to.id);
 const op=source&&outPort(source,r.from.port),ip=r.to?(target&&inPort(target,r.to.port)):openRouteVirtualEnd(r.path,op,r.openEndSide);
 if(!op||!ip)return null;
 const first=path[0],last=path[n-1],d=Math.max(0,Math.min(n,p.distance));
 // Adjacent physical port CENTER is used only to determine the outer tile's entry/exit direction.
 const sx=first[0]-op.x,sy=first[1]-op.y;
 const tx=ip.x-last[0],ty=ip.y-last[1];
 if(Math.abs(sx)+Math.abs(sy)!==1||Math.abs(tx)+Math.abs(ty)!==1)return null;
 if(d<=.5)return [first[0]+.5+sx*(d-.5),first[1]+.5+sy*(d-.5)];
 if(d>=n-.5)return [last[0]+.5+tx*(d-n+.5),last[1]+.5+ty*(d-n+.5)];
 // Between adjacent tile centers the displacement is exactly 1m; corners turn at tile center.
 const u=d-.5,i=Math.floor(u),f=u-i;
 const a=path[i],b=path[i+1];
 return [a[0]+.5+(b[0]-a[0])*f,a[1]+.5+(b[1]-a[1])*f];
}

// Keep a snapshot of physical identities, not just M#/R# record numbers.
// The AST1 editor renumbers records when a machine or belt is removed.
let simLayoutSnapshot=null;
function simMachineState(){
 return {inputs:{},portInputs:{},portItems:{},received:{},sent:{},consumed:{},queue:[],
  ingredientQueues:{},mergerQueue:[],warehouseQueue:[],consumerQueue:[],consumerElapsed:0,
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
function reconcileSimulationLayout(){
 if(!sim||!simLayoutSnapshot){resetSimulation();return;}
 const old=simLayoutSnapshot,previousByMachine=sim.byMachine,previousRoutes=sim.routes;
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
   next.received=priorState.received;next.sent=priorState.sent;next.consumed=priorState.consumed;
  }
  newByMachine[m.id]=next;
 }
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
  // On a shortened or rerouted belt, only packets on the retained physical
  // prefix survive. Attaching/detaching a receiver preserves the same belt.
  const samePath=prefix===prior.path.length&&prefix===r.path.length;
  newRoutes[r.id]=samePath?packets:prefix?packets.filter(p=>p.distance<=prefix+1e-8):[];
 }
 sim.byMachine=newByMachine;sim.routes=newRoutes;
 // Reservation slots reference stock rather than owning it. Release all
 // removed/unwired/changed outlets, and rebuild remaining reservations.
 sim.warehouseReserved={};
 for(const m of state.machines){
  if(m.type!=='仓出')continue;
  const s=sim.byMachine[m.id];
  if(!m.item||!routeFor(m.id,'out',0)){s.warehouseQueue=[];continue;}
  const remain=Math.max(0,(ware[m.item]||0)-(sim.warehouseReserved[m.item]||0));
  s.warehouseQueue=(s.warehouseQueue||[]).filter(item=>item===m.item).slice(0,Math.min(3,remain));
  if(s.warehouseQueue.length)sim.warehouseReserved[m.item]=(sim.warehouseReserved[m.item]||0)+s.warehouseQueue.length;
 }
 simCaptureLayout();simVisualDirty=true;
}

function resetSimulation(){running=false;let btn=$('run');if(btn){btn.textContent='▶ 运行模拟';btn.classList.add('primary');btn.classList.remove('sim-running');}simTime=0;ware={};sim={byMachine:{},routes:{},inbound:{},outbound:{},crafts:{},consumed:{},minuteBuckets:[],warehouseReserved:{}};stockChartReset();
 for(let m of state.machines)sim.byMachine[m.id]=simMachineState();
 for(let r of state.routes)sim.routes[r.id]=[];
 simCaptureLayout();warehouseRefresh();draw();simVisualDirty=false;}
function sendItem(m,s,index,item){const r=routeFor(m.id,'out',index);if(!r)return false;
 const list=sim.routes[r.id]??[];
 if(list.length&&list[list.length-1].distance<ITEM_SPACING-1e-8)return false;
 const last=s.lastSend[index]??-1e6;if(simTime-last<PORT_INTERVAL-1e-6)return false;
 const outFilter=outPort(m,index)?.filter||'';if(outFilter&&outFilter!=='任意'&&outFilter!==item)return false;
 const receiver=r.to&&machineById(r.to.id);
 if(r.to&&(!receiver||!acceptsMaterial(receiver,item,r.to.port)))return false;
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
function mergerInputOrder(m){
 const face=m.face||'E';
 const left={E:'N',N:'W',W:'S',S:'E'}[face];
 const right={E:'S',S:'W',W:'N',N:'E'}[face];
 const priority=[left,OPP[face],right];
 return getPorts(m).filter(p=>p.kind==='in').sort((a,b)=>priority.indexOf(a.side)-priority.indexOf(b.side));
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
// Warehouse-out's 3-item FIFO reserves real shared warehouse stock. Items
// are debited only upon successful physical dispatch. Shared reservation
// bookkeeping prevents multiple warehouse outputs from double-claiming stock.
function warehouseFillOutputQueue(m,s){
 const item=m.item,q=s.warehouseQueue??[];
 // An unwired output cannot claim the shared warehouse inventory.
 if(!item||!routeFor(m.id,'out',0))return;
 const reserved=sim.warehouseReserved??=(Object.create(null));
 while(q.length<3&&(ware[item]||0)>(reserved[item]||0)){
  q.push(item);
  reserved[item]=(reserved[item]||0)+1;
 }
}
function warehouseDequeueOne(m,s){
 const head=s.warehouseQueue?.[0];
 if(head===undefined||!((ware[head]||0)>0))return false;
 if(!sendItem(m,s,0,head))return false;
 s.warehouseQueue.shift();sim.warehouseReserved[head]--;ware[head]--;
 sim.outbound[head]=(sim.outbound[head]||0)+1;
 recordWarehouseMovement('outbound',head);
 return true;
}

function simulate(dt){simTime+=dt;
 // 队列 index=0 永远是最前面的物品；先移动前车，再移动后车。
 // 接收方停止收货时，最前面的包裹停在机器入口边中点，其余包裹以1米间隔停在连续格边中点。
 for(const r of state.routes){const pk=sim.routes[r.id]||[],target=r.to&&machineById(r.to.id);const end=routeLength(r);
  for(let i=0;i<pk.length;i++){
   const ahead=i===0?end:pk[i-1].distance-ITEM_SPACING;
   const was=pk[i].distance;
   pk[i].distance=Math.max(was,Math.min(end,ahead,was+BELT_SPEED*dt));
   if(pk[i].distance!==was)simVisualDirty=true;
  }
  if(pk.length&&pk[0].distance>=end-1e-6){
   // Merger alone scans ready input belts in its own physical-port order;
   // state.routes iteration order must not select its next packet.
   if(target&&target.type!=='汇流'&&acceptItem(target,r.to.port,pk[0].item)){
    pk.shift();simVisualDirty=true;
   }
  }
 }
 // All warehouse outlets reserve from the SAME per-item stock in numeric
 // machine-ID order. Layout insertion order must not change priority.
 // Do this after belt deliveries and BEFORE any warehouse dispatch;
 // a lower-numbered outlet may reserve all currently available items.
 for(const outlet of state.machines.filter(m=>m.type==="仓出").sort(warehouseMachinePriorityCompare)){
  const os=sim.byMachine[outlet.id];
  if(os)warehouseFillOutputQueue(outlet,os);
 }
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
     if(!routeFor(m.id,'out',port))continue;
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
function stepLoop(t){
 const elapsedReal=document.hidden?0:Math.min(.12,Math.max(0,(t-animationLast)/1000));animationLast=t;
 if(running){let elapsed=elapsedReal*simulationSpeed,part=0.05;
  while(elapsed>.0001){let d=Math.min(part,elapsed);simulate(d);elapsed-=d;}
  simPaintTimer+=elapsedReal;
  if(simPaintTimer>=.3){simPaintTimer=0;warehouseRefreshLive();inspectorRefreshLive();stockChartMaybeRefresh();}
 }
 // The animation is intentionally limited to 24 fps. RAF still schedules
 // simulation using elapsed time, so the game speed and logical tick are unchanged.
 // When not running, there is no reason to repaint the map at all.
 if(running && simVisualDirty && t-frameLastPaint>=1000/24 && !document.hidden){
  frameLastPaint=t;simVisualDirty=false;draw(true);
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
   for(let i=0;i<1200;i++)simulate(.05);
   if(minute+1<minutes&&minutes>1){
    if(btn)btn.textContent='⏩ '+(minute+1)+'/'+minutes+'分钟';
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
 }finally{
  if(sameSimulation())running=previous;simAdvanceBusy=false;
  if(btn)btn.disabled=false;
  updateStepMinuteButton();
  warehouseRefreshLive();inspectorRefreshLive();stockChartMaybeRefresh();
  draw(true);simVisualDirty=false;
 }
 if(sameSimulation())notify('已按逐件规则快进 '+minutes+' 分钟，仓库每分钟记录已更新');
}
