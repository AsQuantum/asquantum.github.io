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
 const op=source&&outPort(source,r.from.port),ip=r.to?(target&&inPort(target,r.to.port)):openRouteVirtualEnd(r.path,op);
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
function resetSimulation(){running=false;let btn=$('run');if(btn){btn.textContent='▶ 运行模拟';btn.classList.add('primary');btn.classList.remove('sim-running');}simTime=0;ware={};sim={byMachine:{},routes:{},inbound:{},outbound:{},crafts:{},consumed:{},minuteBuckets:[]};stockChartReset();
 for(let m of state.machines)sim.byMachine[m.id]={inputs:{},portInputs:{},portItems:{},received:{},sent:{},consumed:{},queue:[],busy:0,tick:0,lastSend:{},lastReceive:{},roundRobin:0};
 for(let r of state.routes)sim.routes[r.id]=[];
 warehouseRefresh();draw();simVisualDirty=false;}
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
 // Quantum computer acts as an unrestricted Consumer, permanently disposing
 // of up to one item per second at its sole input port. No buffering or warehouse credit.
 if(m.type==='电脑'){
  s.lastReceive[port]=simTime;
  s.received[item]=(s.received[item]||0)+1;
  s.consumed[item]=(s.consumed[item]||0)+1;
  sim.consumed[item]=(sim.consumed[item]||0)+1;
  simVisualDirty=true;
  return true;
 }
 const cap=inputCap(m,item,port);if(!cap)return false;
 if(m.type==='分流'||m.type==='汇流'){
   const current=(s.portInputs[port]||0);if(current>=cap)return false;
   s.portInputs[port]=current+1;
 }else if((s.inputs[item]||0)>=cap)return false;
 const byPort=(s.portItems[port]??={});byPort[item]=(byPort[item]||0)+1;
 s.inputs[item]=(s.inputs[item]||0)+1;s.received[item]=(s.received[item]||0)+1;s.lastReceive[port]=simTime;return true;}
function removeBuffered(m,s,item){if(!(s.inputs[item]>0))return false;
 // Remove the item from the physical port where it was actually buffered.
 const port=Object.keys(s.portItems).find(idx=>(s.portItems[idx]?.[item]||0)>0);
 if(port!==undefined){s.portItems[port][item]--;if(s.portItems[port][item]===0)delete s.portItems[port][item];
  if(m.type==='分流'||m.type==='汇流')s.portInputs[port]=Math.max(0,(s.portInputs[port]||0)-1);
 }
 s.inputs[item]--;return true;
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
   if(target&&acceptItem(target,r.to.port,pk[0].item)){pk.shift();simVisualDirty=true;}
  }
 }
 for(const m of state.machines){const s=sim.byMachine[m.id];if(!s)continue;const rec=getRecipe(m);
  if(m.type==='仓出'){
   const item=m.item;if(item&&ware[item]>0&&sendItem(m,s,0,item)){ware[item]--;sim.outbound[item]=(sim.outbound[item]||0)+1;recordWarehouseMovement('outbound',item);}continue;
  }
  if(m.type==='分流'){
   const outs=getPorts(m).filter(p=>p.kind==='out'),items=Object.keys(s.inputs).filter(q=>s.inputs[q]>0);
   if(items.length){const item=items[0];for(let k=0;k<outs.length;k++){
     const idx=(s.roundRobin+k)%outs.length;
     if(sendItem(m,s,outs[idx].index,item)){removeBuffered(m,s,item);s.roundRobin=(idx+1)%outs.length;break;}
   }}continue;
  }
  if(m.type==='汇流'){
   const items=Object.keys(s.inputs).filter(q=>s.inputs[q]>0);
   if(items.length){let item=items[s.roundRobin%items.length];if(sendItem(m,s,0,item)){removeBuffered(m,s,item);s.roundRobin++;}}continue;
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
function advanceSimulationMinute(){
 const previous=running;running=false;
 for(let i=0;i<1200;i++)simulate(.05);
 running=previous;warehouseRefreshLive();inspectorRefreshLive();stockChartMaybeRefresh();draw(true);simVisualDirty=false;
 notify('已按逐件规则快进60秒，仓库每分钟记录已更新');
}
