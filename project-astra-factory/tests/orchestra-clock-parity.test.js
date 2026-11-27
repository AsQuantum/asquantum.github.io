'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {environment,fixture,root}=require('./iteration/support/environment');
const path=require('node:path');
function setup(name,frozen=[]){
 const e=environment();e.c.structuredClone=structuredClone;
 for(const f of ['ui/orchestra/rhythm','ui/orchestra/score','ui/orchestra/rhythm-source','ui/orchestra/audio'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),e.c,{filename:f});
 e.run("recordWarehouseMovement=(direction,item,count=1)=>{const bucket=sim.minuteBuckets[simMinuteIndex()]??={inbound:{},outbound:{}};bucket[direction][item]=(bucket[direction][item]||0)+count}");
 fixture(e,name,frozen);return e;
}
const frozen=[{id:'source',name:'source',enabled:true,rates:{'合金板':'1/3','太空垃圾':'2/7'}},{id:'reader',name:'reader',enabled:true,rates:{'合金板':'-1/5','硅晶圆':'1/7'}}];
test('actual +60 minute button equals variable-size real time ticks and exact solver at every minute',async()=>{
 const e=setup('ast1-warehouse-feedback-loop-v1.txt',frozen);
 e.c.setTimeout=setTimeout;
 e.run("function warehouseRefreshLive(){} function inspectorRefreshLive(){} function stockChartMaybeRefresh(){};notify=()=>{}");
 const report=await e.run(`(async()=>{
  const canon=o=>JSON.stringify(Object.entries(o||{}).filter(([,v])=>v!==0).sort(([a],[b])=>a.localeCompare(b)));
  const spec=factoryCompileSymbolicSpec(),kernel=iterationCreateKernel(spec,A),checkpoints=[];
  resetSimulation();
  $('simSpeed').value='60';
  // The production fast-forward button yields once per minute.
  const batch=simulateBatchSteps;
  let minute=0;
  simulateBatchSteps=(n,dt,options)=>{
   batch(n,dt,options);

   for(let i=0;i<1200;)i+=kernel.advance(1200-i);
   const k=kernel.snapshot(),control=JSON.parse(k.control);
   if(canon(ware)!==canon(k.stock))throw Error('stock parity at '+minute);
   for(const [direction,field] of [['inflow','inbound'],['outflow','outbound'],['crafts','crafts'],['consumed','consumed']]){
    const expected=Object.fromEntries(Object.entries(k.count).filter(([key])=>key.startsWith(direction+':')).map(([key,n])=>[key.slice(direction.length+1),n]));
    if(canon(sim[field])!==canon(expected))throw Error('counter parity '+field+' '+minute+' '+canon(sim[field])+' '+canon(expected));
   }
   for(let i=0;i<spec.routes.length;i++){
    const r=spec.routes[i],packets=sim.routes[r.id].map(p=>[p.item,simUnits(p.distance)]);
    if(JSON.stringify(packets)!==JSON.stringify(control[1][i]))throw Error('route parity '+r.id+' '+minute);
   }
   for(let i=0;i<spec.machines.length;i++){
    const m=spec.machines[i],p=sim.byMachine[m.id],a=control[0][i];
    if(canon(p.inputs)!==canon(Object.fromEntries(a[0]))||p.roundRobin!==a[6]||simTicks(p.busy)!==a[10]||simTicks(p.tick)!==a[11]||simTicks(p.consumerElapsed)!==a[12])throw Error('machine physical state '+m.id+' '+minute);
    const q=m.type==='仓出'?p.warehouseQueue:m.type==='电脑'?p.consumerQueue:m.type==='汇流'?p.mergerQueue.map(v=>[v.item,v.port]):null;
    if(q&&JSON.stringify(q)!==JSON.stringify(a[5]))throw Error('machine queue '+m.id+' '+minute);
    if(m.recipe&&p.queue.length!==a[4])throw Error('product buffer '+m.id+' '+minute);
    for(const [direction,field] of [['in','received'],['out','sent']]){
     const prefix='machineMaterial:'+m.id+'|'+direction+'|',expected=Object.fromEntries(Object.entries(k.count).filter(([key])=>key.startsWith(prefix)).map(([key,n])=>[key.slice(prefix.length),n]));
     if(canon(p[field])!==canon(expected))throw Error('machine transfer count '+m.id+' '+direction+' '+minute);
    }
   }
   checkpoints.push(JSON.stringify({simTime,ware,sim}));minute++;
  };
  try{await advanceSimulationMinute()}finally{simulateBatchSteps=batch}
  if(minute!==60||simTime!==3600)throw Error('actual fast-forward duration');
  resetSimulation();
  for(let minute=0;minute<60;minute++){
   let fraction=0;for(let i=0;i<1200;){const n=Math.min(1200-i,1+((i+minute*31)%61)),next=i+n===1200?0:(i%2?13:27);advanceRealtimeSimulation((n*50+next-fraction)/1000);fraction=next;i+=n}
   if(simClockRemainder>1e-8)throw Error('fractional remainder at '+minute)
   if(JSON.stringify({simTime,ware,sim})!==checkpoints[minute])throw Error('batch partition parity at '+minute);
  }
  return {seconds:simTime,ticks:simTicks(simTime),machines:state.machines.length,routes:state.routes.length};
 })()`);
 assert.equal(report.seconds,3600);assert.equal(report.ticks,72000);console.log('CLOCK_PARITY',JSON.stringify(report));
});
test('rhythm bakes one zero-start phrase even after long live runtime; both repeats match independent physical ticks',()=>{
 const e=setup('ast1-warehouse-slow-miner-v1.txt',frozen);
 const report=e.run(`(()=>{
  simulateBatchSteps(12037,.05);advanceRealtimeSimulation(.023);
  const original={sim,ware,simTime,remainder:simClockRemainder,cache:frozenSimCache,observer:simTransferObserver,bytes:JSON.stringify({sim,ware}),phases:JSON.stringify(Object.values(sim.frozenRuntime||{}).map(r=>frozenExactPhases.get(r)),(_,v)=>typeof v==='bigint'?String(v):v)};
  const m=state.machines.find(m=>getRecipe(m))||state.machines[0],plan=orchestraRhythmSongPlan();
  const score={track:()=>({instrument:'piano',volume:.5}),pitch:(type,dir,i,t)=>48+(i+simTicks(t))%24};
  const source=createOrchestraRhythmSource(score,plan,true,m.id);
  const first=source.initialFrame();
  if(first.time!==0||first.simTime!==0||Object.keys(first.ware).length||first.sim.byMachine[m.id].lastWarehouseFill!==0)throw Error('initial frame is not empty');
  while(!source.step()){}
  const song=source.finish(),frames=source.panelFrames(),packets=source.packetFrames();
  const unchanged=()=>sim===original.sim&&ware===original.ware&&simTime===original.simTime&&simClockRemainder===original.remainder&&frozenSimCache===original.cache&&simTransferObserver===original.observer&&JSON.stringify({sim,ware})===original.bytes&&JSON.stringify(Object.values(sim.frozenRuntime||{}).map(r=>frozenExactPhases.get(r)),(_,v)=>typeof v==='bigint'?String(v):v)===original.phases;
  if(!unchanged())throw Error('real factory mutated during bake');
  // Independently restart a reference factory and advance every physical tick.
  resetSimulation();
  const events=[];
  simTransferObserver=(m,dir,port,item,t)=>events.push({id:m.id,type:m.type,dir,port,item,time:t,n:score.pitch(m.type,dir,orchestraTransferCount(m.id,dir)-1,t),instrument:'piano',volume:.5});
  const check=i=>{
   const f=frames[i],p=packets[i];
   if(f.simTime!==simTime||f.time!==simTime||p.time!==simTime)throw Error('clock '+i);
   if(JSON.stringify(f.ware)!==JSON.stringify(ware)||JSON.stringify(f.sim.byMachine[m.id])!==JSON.stringify(sim.byMachine[m.id])||JSON.stringify(f.sim.inbound)!==JSON.stringify(sim.inbound)||JSON.stringify(f.sim.outbound)!==JSON.stringify(sim.outbound))throw Error('panel '+i);
   for(const r of state.routes)if(JSON.stringify(Array.from(p.routes[r.id]||[]))!==JSON.stringify(sim.routes[r.id].map(p=>simUnits(p.distance))))throw Error('packet '+i+' '+r.id);
  };
  check(0);
  for(let i=1;i<=1280;i++){simulate(.05);check(i)}
  const grouped=orchestraGroupNotes(events),expected=[];
  for(let repeat=0;repeat<plan.repeats;repeat++)for(const g of grouped)expected.push({g,at:repeat*plan.phraseSeconds+g.time/2});
  if(JSON.stringify(song)!==JSON.stringify(expected))throw Error('event parity');
  for(let repeat=0;repeat<plan.repeats;repeat++)for(let i=0;i<1280;i++){
   const t=repeat*plan.phraseSeconds+i/40;
   if(Math.abs(orchestraRhythmPhysicalTime(plan,t)-frames[i].time)>1e-9)throw Error('repeat clock '+repeat+'/'+i);
  }
  sim=original.sim;ware=original.ware;simTime=original.simTime;simClockRemainder=original.remainder;frozenSimCache=original.cache;simTransferObserver=original.observer;
  if(!unchanged())throw Error('restoration mismatch');
  simulateBatchSteps(1200,.05);const after=JSON.stringify({sim,ware,simTime});
  resetSimulation();simulateBatchSteps(12037,.05);advanceRealtimeSimulation(.023);simulateBatchSteps(1200,.05);
  if(JSON.stringify({sim,ware,simTime})!==after)throw Error('post-preview continuation parity');
  return {liveTime:original.simTime,phraseSeconds:frames.at(-1).time,frames:frames.length,packets:packets.length,events:events.length,groups:song.length,remainder:original.remainder};
 })()`);
 assert.equal(report.phraseSeconds,64);assert.equal(report.frames,1281);assert.equal(report.packets,1281);assert(report.events>0);console.log('RHYTHM_CLOCK_PARITY',JSON.stringify(report));
});
test('transport changes preserve the simulated remainder and reject older RAF timestamps',()=>{
 const e=setup('ast1-warehouse-port-balance-v1.txt');
 const result=e.run(`(()=>{
  animationLast=1000;running=true;simulationSpeed=1;advanceRealtimeSimulation(.023);
  const initial=JSON.stringify({sim,ware,simTime,remainder:simClockRemainder});
  rebaseSimulationClock(1020);simulationSpeed=6;rebaseSimulationClock(1030);
  rebaseSimulationClock(1025);
  const preserved=initial===JSON.stringify({sim,ware,simTime,remainder:simClockRemainder}),stamp=animationLast;
  advanceRealtimeSimulation(.027);
  return {preserved,stamp,end:simTicks(simTime),remainder:simClockRemainder};
 })()`);
 assert(result.preserved);assert.equal(result.stamp,1030);assert.equal(result.end,1);assert(Math.abs(result.remainder)<1e-9);
});
