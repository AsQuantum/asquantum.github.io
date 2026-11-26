'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{environment,fixture}=require('./support/environment');
const f=(id,rates,enabled=true)=>({id,rates,enabled});
function parity(fixtureName,frozen,ticks){
 const env=environment();
 if(fixtureName)fixture(env,fixtureName,frozen);else{env.c.frozen=frozen;env.run('state={machines:[],routes:[],frozenFactories:normalizeFrozenFactories(frozen)};resetSimulation()')}
 env.c.ticks=ticks;
 return env.run(`(()=>{
  const k=iterationCreateKernel(factoryCompileSymbolicSpec(),A),observed={},inc=(key,n=1)=>observed[key]=(observed[key]||0)+n;
  const send=sendItem,receive=acceptItem;
  sendItem=(m,s,p,item)=>{const ok=send(m,s,p,item);if(ok){const r=simRouteFor(m.id,'out',p);inc('routeTotal:'+r.id);inc('flow:'+r.id+'|'+item);inc('machineTotal:'+m.id+'|out');inc('machineMaterial:'+m.id+'|out|'+item)}return ok};
  acceptItem=(m,p,item)=>{const ok=receive(m,p,item);if(ok){inc('machineTotal:'+m.id+'|in');inc('machineMaterial:'+m.id+'|in|'+item)}return ok};
  try{for(let i=1;i<=ticks;i++){
   k.step();simulateBatchSteps(1,.05);
   const x=k.snapshot(),cmp=(a,b,what)=>{for(const id of new Set([...Object.keys(a),...Object.keys(b)]))if((a[id]||0)!==(b[id]||0))throw Error('tick '+i+' '+what+' '+id+' '+(a[id]||0)+' != '+(b[id]||0))};
   cmp(x.stock,ware,'stock');cmp(Object.fromEntries(Object.entries(x.count).filter(([id])=>id.startsWith('inflow:')).map(([id,n])=>[id.slice(7),n])),sim.inbound,'inflow');
   cmp(Object.fromEntries(Object.entries(x.count).filter(([id])=>id.startsWith('outflow:')).map(([id,n])=>[id.slice(8),n])),sim.outbound,'outflow');
   cmp(Object.fromEntries(Object.entries(x.count).filter(([id])=>id.startsWith('crafts:')).map(([id,n])=>[id.slice(7),n])),sim.crafts,'crafts');
   cmp(Object.fromEntries(Object.entries(x.count).filter(([id])=>/^(flow:|routeTotal:|machineTotal:|machineMaterial:)/.test(id))),observed,'event');
   const raw=JSON.parse(x.control),nodes=raw[0],edges=raw[1];
   for(let j=0;j<state.routes.length;j++){
    const ref=sim.routes[state.routes[j].id].map(p=>[p.item,Math.round(p.distance*10)]);
    if(JSON.stringify(edges[j])!==JSON.stringify(ref))throw Error('tick '+i+' belt '+state.routes[j].id);
   }
   for(let j=0;j<state.machines.length;j++){
    const m=state.machines[j],s=sim.byMachine[m.id],a=nodes[j],pairs=o=>Object.entries(o).filter(([,v])=>v!==0).sort(([a],[b])=>a.localeCompare(b)),arr=o=>Object.entries(o).filter(([,v])=>v.length).sort(([a],[b])=>a.localeCompare(b));
    const same=(v,w,name)=>{if(JSON.stringify(v)!==JSON.stringify(w))throw Error('tick '+i+' '+m.id+' '+name+' '+JSON.stringify(v)+' != '+JSON.stringify(w))};
    same(a[0],pairs(s.inputs),'input cache');same(a[2],arr(s.portQueues),'split FIFO');
    same(a[3],arr(Object.fromEntries(Object.entries(s.ingredientQueues).map(([id,v])=>[id,v.map(Number)]))),'ingredient FIFO');
    same(a[4],s.queue.length,'output stack');
    same(a[5],m.type==='仓出'?s.warehouseQueue:m.type==='汇流'?s.mergerQueue.map(x=>[x.item,x.port]):m.type==='电脑'?s.consumerQueue:[],'ordered queue');
    same(a[6],s.roundRobin,'round robin');
    same(a[10],Math.round(s.busy*20),'busy');same(a[11],Math.round(s.tick*20),'progress');same(a[12],Math.round(s.consumerElapsed*20),'consumer clock');
   }
   for(const [id,v] of Object.entries(x.service)){
    const exact=steadyExactNumber(steadyRegionQ(v)),actual=sim.frozenRuntime[id].activeTime;
    if(Math.abs(exact-actual)>1e-7)throw Error('frozen duty tick '+i+' '+id);
   }
  }}finally{sendItem=send;acceptItem=receive}
  return {ticks,stock:k.snapshot().stock};
 })()`);
}
test('frozen exact rational phases, multi-input shortage, high rate and reservation: per tick',()=>{
 parity(null,[f('s',{'合金板':'2/3','能量电池':'3/7'}),f('a',{'合金板':'-31','能量电池':'-2','硅晶圆':'5/3'}),f('b',{'合金板':'-1/3','齿轮组':'1/3'}),f('disabled',{'合金板':'100'},false)],3000);
});
test('physical warehouse refill and frozen feedback: per tick',()=>{
 parity('ast1-warehouse-feedback-loop-v1.txt',[f('s',{'太空垃圾':'1'})],2500);
});
test('physical priority, cache and blocked branches: per tick',()=>{
 parity('ast1-priority-armour-backpressure-v1.txt',[f('s',{'合金板':'2/3'})],3000);
});
test('115-machine altered layout, mixed FIFO, recipe buffers: per tick',()=>{
 parity('ast1-warehouse-slow-miner-v1.txt',[],2400);
});
test('exact-model orbit finds rational duty with frozen competition and keeps certified flag false',()=>{
 const env=environment();env.c.frozen=[f('s',{'合金板':'1'}),f('a',{'合金板':'-2','硅晶圆':'2'})];
 const r=env.run('state={machines:[],routes:[],frozenFactories:normalizeFrozenFactories(frozen)};iterationFindOrbit(iterationCreateKernel(factoryCompileSymbolicSpec(),A),{maxTicks:2000})');
 assert.equal(r.status,'exact-model-period');assert.equal(r.certified,false);assert.equal(r.values['duty:a'],'1/2');assert.equal(r.values['inflow:硅晶圆'],'1');assert.equal(r.values['outflow:合金板'],'1');
});
test('overdraft frozen service ignores shortage but records all debits',()=>{
 const env=environment();env.c.frozen=[f('a',{'合金板':'-2','硅晶圆':'2'})];
 const r=env.run('state={machines:[],routes:[],frozenFactories:normalizeFrozenFactories(frozen)};iterationFindOrbit(iterationCreateKernel(factoryCompileSymbolicSpec(state,{unlimitedWarehouse:true}),A),{maxTicks:2000})');
 assert.equal(r.status,'exact-model-period');assert.equal(r.values['duty:a'],'1');assert.equal(r.values['outflow:合金板'],'2');assert.equal(r.values['inflow:硅晶圆'],'2');
});

test('long transient stock exhaustion: accelerated and ordinary iteration agree exactly',()=>{
 const env=environment();env.c.frozen=[f('drain',{'合金板':'-1','硅晶圆':'1'})];
 const r=env.run(`(()=>{state={machines:[],routes:[],frozenFactories:normalizeFrozenFactories(frozen)};
 const spec=factoryCompileSymbolicSpec(),opts={initialStock:{'合金板':100}};
 const run=accelerate=>{const k=iterationCreateKernel(spec,A,opts),r=iterationFindOrbit(k,{maxTicks:5000,accelerate});return {r,end:k.snapshot()}};
 return JSON.stringify({fast:run(true),slow:run(false)})})()`);
 const {fast,slow}=JSON.parse(r);assert.equal(fast.r.status,'exact-model-period');assert.equal(slow.r.status,'exact-model-period');
 assert(fast.r.skippedTicks>1000);assert(fast.r.executedTicks<slow.r.executedTicks);
 assert.deepEqual(fast.r.values,slow.r.values);assert.equal(fast.r.values['duty:drain'],'0');
 assert.deepEqual(fast.end.stock,slow.end.stock);assert.deepEqual(fast.end.count,slow.end.count);
 assert.deepEqual(fast.end.service,slow.end.service);assert.equal(fast.end.control,slow.end.control);
});
test('explicit tick budget is unknown, not an invented average',()=>{
 const env=environment();const r=env.run('state={machines:[],routes:[]};iterationFindOrbit(iterationCreateKernel(factoryCompileSymbolicSpec(),A),{maxTicks:0})');
 assert.equal(r.status,'budget');assert.equal(r.reason,'ticks');assert.equal(r.values,undefined);
});

test('deterministic seeded frozen network parity with varied fractional rates',()=>{
 let seed=7321;const n=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)%9)+1;
 for(let i=0;i<8;i++)parity(null,[f('a',{'合金板':n()+'/'+n(),'能量电池':n()+'/'+n()}),f('b',{'合金板':'-'+n()+'/'+n(),'能量电池':'-'+n()+'/'+n(),'硅晶圆':n()+'/'+n()}),f('c',{'硅晶圆':'-'+n()+'/'+n(),'合金板':n()+'/'+n()})],600);
});
test('former near-integer floating epsilon discrepancy is eliminated',()=>{
 const env=environment();env.c.frozen=[f('a',{'合金板':'19999999999/1000000000'})];
 const x=env.run(`(()=>{state={machines:[],routes:[],frozenFactories:normalizeFrozenFactories(frozen)};resetSimulation();
 const k=iterationCreateKernel(factoryCompileSymbolicSpec(),A);k.step();simulate(.05);return {exact:k.snapshot().stock['合金板']||0,float:ware['合金板']||0}})()`);
 // The former epsilon rounded a fraction just below 1 up. Both now agree.
 assert.equal(x.exact,0);assert.equal(x.float,0);
});

test('near-integer high-rate competing frozen services agree with the exact kernel over multiple ticks',()=>{
 parity(null,[f('a',{'合金板':'19999999999/1000000000','能量电池':'20000000001/1000000000'}),f('b',{'合金板':'-31/2','能量电池':'-20','硅晶圆':'13/7'}),f('c',{'硅晶圆':'-1/3','合金板':'1/7'})],1600);
});

test('physical clocks use the exact lattice; off-grid recipe coefficients are rejected',()=>{
 const env=environment();fixture(env,'ast1-warehouse-feedback-loop-v1.txt');
 const result=env.run('(()=>{const r={seconds:1.25},t=simRecipeTicks(r);let rejected=false;r.seconds=1.251;try{simRecipeTicks(r)}catch{rejected=true}const before=simTime;simulate(.15);return {t,rejected,elapsed:simTime-before}})()');
 assert.equal(result.t,25);assert(result.rejected);assert.equal(result.elapsed,.15);
});
