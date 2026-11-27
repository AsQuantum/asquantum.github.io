'use strict';
// Bake one independent zero-start phrase, then repeat its exact onsets
// and physical snapshots. Never borrow the live factory clock or queues.
function createOrchestraRhythmSource(score,plan,captureWarehouse=false,inspectorId=null){
 let preview={byMachine:{},routes:{},inbound:{},outbound:{},crafts:{},consumed:{},editReturns:{},minuteBuckets:[]};
 for(const m of state.machines)preview.byMachine[m.id]=simMachineState(0);
 for(const r of state.routes)preview.routes[r.id]=[];
 let stock={},time=0,cache=null,remaining=Math.round(plan.phraseSeconds*40),events=[],frames=[],packetFrames=[];
 const capture=(m,dir,port,item,t)=>{
  const track=score.track(m.type),i=Math.max(0,orchestraTransferCount(m.id,dir)-1);
  events.push({id:m.id,type:m.type,dir,port,item,time:t,n:score.pitch(m.type,dir,i,t),instrument:track?.instrument,volume:track?.volume});
 };
 // Snapshot only the rolling ledger window, retaining absolute minute
 // indices. Completed buckets are immutable in this private simulation.
 const history=new Map();
 function capturePanel(){
  if(!captureWarehouse)return;
  const minute=Math.floor(simTicks(simTime)/1200),buckets={};
  for(let k=Math.max(0,minute-60);k<=minute;k++){
   const b=sim.minuteBuckets[k];if(!b)continue;
   if(k<minute){if(!history.has(k))history.set(k,structuredClone(b));buckets[k]=history.get(k)}
   else buckets[k]=structuredClone(b);
  }
  frames.push({time:simTime,simTime,ware:{...ware},sim:{
   inbound:{...sim.inbound},outbound:{...sim.outbound},editReturns:{...sim.editReturns},
   minuteBuckets:buckets,byMachine:inspectorId&&sim.byMachine[inspectorId]?{[inspectorId]:structuredClone(sim.byMachine[inspectorId])}:{}
  }});
 }
 // Positions are the same integer tenths of a metre used by the physics.
 // Every tick is recorded, including head departures and new tail entries.
 // Reuse identical typed arrays for stopped/empty belts.
 const routesList=state.routes,basePhase=routesList.map(()=>.5);
 const travel=new Uint32Array(routesList.length),connected=routesList.map(r=>beltConnected(r));
 let previousRoutes=Object.create(null);
 function capturePackets(){
  if(!captureWarehouse)return;
  const routes=Object.create(null);
  const motion=new Float32Array(routesList.length),moving=new Uint8Array(routesList.length);
  for(let i=0;i<routesList.length;i++){
   const r=routesList[i],lazy=typeof simBatchBelts!=='undefined'?simBatchBelts?.get(r):null,list=sim.routes[r.id],n=lazy?simLazyCount(lazy):list?.length||0;
   const read=j=>lazy?simLazyPos(lazy,j):simUnits(list[j].distance);
   const blocked=n>=routeLength(r)+1&&read(0)>=routeLength(r)*10&&read(n-1)<=0;
   moving[i]=connected[i]&&!blocked?1:0;
   if(packetFrames.length&&moving[i])travel[i]++;
   motion[i]=(basePhase[i]+travel[i]/10)%21;
   if(!n)continue;
   const old=previousRoutes[r.id];
   let same=old?.length===n;
   if(same)for(let j=0;j<n;j++)if(old[j]!==read(j)){same=false;break}
   if(same)routes[r.id]=old;
   else{const Type=routeLength(r)*10<=65535?Uint16Array:Uint32Array;routes[r.id]=Type.from({length:n},(_,j)=>read(j))}
  }
  previousRoutes=routes;packetFrames.push({time:simTime,routes,motion,moving});
 }
 const initialFrame={time:0,simTime:0,ware:{},sim:{
  inbound:{},outbound:{},editReturns:{},minuteBuckets:{},
  byMachine:inspectorId&&preview.byMachine[inspectorId]?{[inspectorId]:structuredClone(preview.byMachine[inspectorId])}:{}
 }};
 const initialPackets={time:0,routes:Object.create(null),motion:Float32Array.from(basePhase),moving:Uint8Array.from(connected)};
 let started=false;
 function step(){
  if(!remaining)return true;
  const saved={sim,ware,simTime,frozenSimCache,simVisualDirty,simTransferObserver};
  try{
   simTime=time;ware=stock;frozenSimCache=cache;simTransferObserver=capture;sim=preview;
   if(!started){started=true;capturePanel();capturePackets()}
   const start=performance.now();
   do{
    const n=Math.min(32,remaining);
    simulateBatchSteps(n,.05,{afterStep:captureWarehouse?()=>{capturePanel();capturePackets()}:null});remaining-=n;
   }while(remaining&&performance.now()-start<6);
   time=simTime;cache=frozenSimCache;stock=ware;
   return remaining===0;
  }finally{
   sim=saved.sim;ware=saved.ware;simTime=saved.simTime;frozenSimCache=saved.frozenSimCache;
   simVisualDirty=saved.simVisualDirty;simTransferObserver=saved.simTransferObserver;
  }
 }
 function finish(){
  if(remaining)throw Error('unfinished rhythm source');
  const groups=orchestraGroupNotes(events);events=[];preview=null;
  return orchestraRhythmLoopGroups(groups,plan);
 }
 return {step,finish,panelFrames:()=>frames,packetFrames:()=>packetFrames,initialFrame:()=>initialFrame,initialPackets:()=>initialPackets};
}
