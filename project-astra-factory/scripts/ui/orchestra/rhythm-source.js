'use strict';
function createOrchestraRhythmSource(score,plan,captureWarehouse=false){
 let preview=null,stock={},time=0,cache=null,remaining=Math.round(plan.phraseSeconds*40),events=[],frames=[];
 const frameTicks=5;let ticks=0,warehouseEvent=false;
 const capture=(m,dir,port,item,t)=>{
  const track=score.track(m.type),i=Math.max(0,orchestraTransferCount(m.id,dir)-1);
  if(m.type==='仓入'&&dir==='in'||m.type==='仓出'&&dir==='out')warehouseEvent=true;
  events.push({id:m.id,type:m.type,dir,port,item,time:t,n:score.pitch(m.type,dir,i,t),instrument:track?.instrument,volume:track?.volume});
 };
 // Only copy fields used by the read-only side panels, not the entire
 // simulator. Only the warehouse ledger needs read-only playback data.
 function capturePanel(){
  if(!captureWarehouse)return;
  frames.push({time:simTime,ware:structuredClone(ware),sim:structuredClone({
   inbound:sim.inbound,outbound:sim.outbound,editReturns:sim.editReturns,
   minuteBuckets:sim.minuteBuckets
  })});
 }
 function step(){
  if(!remaining)return true;
  const saved={sim,ware,simTime,frozenSimCache,simVisualDirty,simTransferObserver};
  try{
   simTime=time;ware=stock;frozenSimCache=cache;simTransferObserver=capture;
   if(!preview){
    sim={byMachine:{},routes:{},inbound:{},outbound:{},crafts:{},consumed:{},editReturns:{},minuteBuckets:[]};
    for(const m of state.machines)sim.byMachine[m.id]=simMachineState();
    for(const r of state.routes)sim.routes[r.id]=[];
    preview=sim;capturePanel();
   }else sim=preview;
   const start=performance.now();
   do{const n=Math.min(32,remaining);simulateBatchSteps(n,.05,{afterStep:captureWarehouse?()=>{ticks++;if(warehouseEvent||ticks%frameTicks===0){capturePanel();warehouseEvent=false}}:null});remaining-=n}while(remaining&&performance.now()-start<6);
   time=simTime;cache=frozenSimCache;stock=ware;
   return remaining===0;
  }finally{
   sim=saved.sim;ware=saved.ware;simTime=saved.simTime;frozenSimCache=saved.frozenSimCache;
   simVisualDirty=saved.simVisualDirty;simTransferObserver=saved.simTransferObserver;
  }
 }
 function finish(){if(remaining)throw Error('unfinished rhythm source');const groups=orchestraGroupNotes(events);events=[];preview=null;return orchestraRhythmLoopGroups(groups,plan)}
 return {step,finish,panelFrames:()=>frames};
}
