'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{environment,fixture}=require('./support/environment');
test('event advance preserves entire exact state, counts, inventory and guard minima at every checkpoint',()=>{
 const e=environment();
 for(const name of ['ast1-warehouse-port-balance-v1.txt','ast1-warehouse-slow-miner-v1.txt','ast1-priority-armour-backpressure-v1.txt','ast1-warehouse-feedback-loop-v1.txt']){
  fixture(e,name);
  for(const u of [false,true]){
   e.c.u=u;
   const result=e.run('(()=>{const s=factoryCompileSymbolicSpec(state,{unlimitedWarehouse:u}),a=iterationCreateKernel(s,A),b=iterationCreateKernel(s,A);let skipped=0;for(let i=0;i<180;i++){const n=1+(i*37)%61;for(let j=0;j<n;j++)a.step();for(let j=0;j<n;){const m=b.advance(n-j);if(m>1)skipped+=m;j+=m}if(JSON.stringify(a.snapshot())!==JSON.stringify(b.snapshot())||JSON.stringify(a.takeMin())!==JSON.stringify(b.takeMin())||JSON.stringify(a.lastLow)!==JSON.stringify(b.lastLow))throw Error("state mismatch "+i+" "+u)}return skipped})()');
   console.log('QUIET',name,u,result);
  }
 }
});
test('bounded recent checkpoints plus power-of-two anchor detects a period larger than the recent cache',()=>{
 const e=environment();
 const result=JSON.parse(e.run('(()=>{const spec={machines:[],routes:[],priority:[],frozen:[{id:"s",rates:{ore:"1/37"}}],unlimitedWarehouse:false};const k=iterationCreateKernel(spec,A);return JSON.stringify(iterationFindOrbit(k,{maxTicks:6000,maxCheckpoints:2,checkpointEvery:20}))})()'));
 assert.equal(result.status,'exact-model-period');assert.equal(result.periodTicks,740);assert.equal(result.values['inflow:ore'],'1/37');assert(result.peakCheckpoints<=3);
});
test('single-anchor mode works with a period and exact calendar replay',()=>{
 const e=environment();const x=JSON.parse(e.run('(()=>{const spec={machines:[],routes:[],priority:[],frozen:[{id:"s",rates:{ore:"1/11"}}],unlimitedWarehouse:false};return JSON.stringify(iterationFindOrbit(iterationCreateKernel(spec,A),{maxTicks:2000,maxCheckpoints:0,captureBoundary:true}))})()'));
 assert.equal(x.status,'exact-model-period');assert.equal(x.peakCheckpoints,1);assert.equal(x.periodTicks,220);assert.equal(Object.values(x.boundary.frames).reduce((n,v)=>n+(v['frozen:s']?.ore||0),0),1);
});
test('actual calendar replay retains finite stock loop acceleration',()=>{
 const e=environment();const x=JSON.parse(e.run('(()=>{const spec={machines:[],routes:[],priority:[],frozen:[{id:"d",rates:{ore:"-1",plate:"1"}}],unlimitedWarehouse:false};return JSON.stringify(iterationFindOrbit(iterationCreateKernel(spec,A,{initialStock:{ore:100}}),{maxTicks:1000,maxCheckpoints:8,captureBoundary:true}))})()'));
 assert.equal(x.status,'exact-model-period');assert(x.skippedTicks>1000);assert.equal(x.values['duty:d'],'0');assert.deepEqual(x.boundary.frames,{});
});

test('rational frozen and stage-calendar event skipping agrees with per-tick reference',()=>{
 const e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt',[{id:'source',rates:{'太空垃圾':'2/7','合金板':'11/3'}},{id:'a',rates:{'太空垃圾':'-2/5','合金板':'-23','齿轮组':'5/9'}},{id:'b',rates:{'太空垃圾':'-1/3','硅晶圆':'3/11'}}]);
 const x=JSON.parse(e.run('(()=>{const s=factoryCompileSymbolicSpec(),opts={initialStock:{"合金板":20,"太空垃圾":3}},run=(spec,options)=>{const a=iterationCreateKernel(spec,A,options),b=iterationCreateKernel(spec,A,options);let skipped=0;for(let i=0;i<100;i++){const n=1+(i*17)%67;for(let j=0;j<n;j++)a.step();for(let j=0;j<n;){const m=b.advance(n-j);if(m>1)skipped+=m;j+=m}if(JSON.stringify(a.snapshot())!==JSON.stringify(b.snapshot())||JSON.stringify(a.takeMin())!==JSON.stringify(b.takeMin())||JSON.stringify(a.lastLow)!==JSON.stringify(b.lastLow))throw Error("frozen mismatch "+i)}return skipped};const frames={0:{physical:{"太空垃圾":1}},7:{"frozen:source":{"合金板":2}},9:{"frozen:a":{"齿轮组":1}}};return JSON.stringify([run(s,opts),run({...s,unlimitedWarehouse:true},opts),run(s,{...opts,boundary:{period:31,frames,free:["合金板"]}})])})()'));
 assert(x[0]>0&&x[2]>0,JSON.stringify(x));assert.equal(x[1],0,"high-rate unlimited service emits every tick");console.log('FROZEN_QUIET',x);
});

test('slow frozen unlimited phase advances in exact rational bulk steps',()=>{
 const e=environment();const x=JSON.parse(e.run('(()=>{const s={machines:[],routes:[],priority:[],frozen:[{id:"f",rates:{ore:"-2/7",plate:"3/11"}}],unlimitedWarehouse:true},a=iterationCreateKernel(s,A),b=iterationCreateKernel(s,A);for(let i=0;i<1000;i++)a.step();let skipped=0;for(let i=0;i<1000;){const n=b.advance(1000-i);if(n>1)skipped+=n;i+=n}return JSON.stringify({equal:JSON.stringify(a.snapshot())===JSON.stringify(b.snapshot()),skipped})})()'));
 assert(x.equal);assert(x.skipped>900);
});

test('sparse history detects a long cycle before the power-of-two anchor repeats',()=>{
 const e=environment(),r=JSON.parse(e.run('(()=>{const spec={machines:[],routes:[],priority:[],frozen:[{id:"s",rates:{ore:"1/37"}}],unlimitedWarehouse:false};return JSON.stringify(iterationFindOrbit(iterationCreateKernel(spec,A),{maxTicks:2000,maxCheckpoints:16,sparseStride:8}))})()'));
 assert.equal(r.status,'exact-model-period');assert.equal(r.prefixTicks,0);assert.equal(r.periodTicks,740);assert(r.peakCheckpoints<=17);
});
test('sparse block minima safely accelerate negative stock drift beyond the recent window',()=>{
 const e=environment();const r=JSON.parse(e.run('(()=>{const spec={machines:[],routes:[],priority:[],frozen:[{id:"s",rates:{ore:"-1/37",plate:"1/37"}}],unlimitedWarehouse:false},options={initialStock:{ore:100}};const a=iterationCreateKernel(spec,A,options),b=iterationCreateKernel(spec,A,options);const x=iterationFindOrbit(a,{maxTicks:5000,maxCheckpoints:16,sparseStride:8}),y=iterationFindOrbit(b,{maxTicks:100000,maxCheckpoints:16,sparseStride:8,accelerate:false});return JSON.stringify({x,y,stockA:a.snapshot().stock,stockB:b.snapshot().stock,countA:a.snapshot().count,countB:b.snapshot().count})})()'));
 assert.equal(r.x.status,'exact-model-period');assert.equal(r.y.status,'exact-model-period');assert(r.x.skippedTicks>60000);assert.deepEqual(r.x.values,r.y.values);assert.deepEqual(r.stockA,r.stockB);assert.deepEqual(r.countA,r.countB);assert(r.x.peakCheckpoints<=17);
});

test('paused search resumes without repeating prefix or changing exact results',()=>{
 const e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt',[{id:'source',rates:{'太空垃圾':'2/7'}}]);
 const r=JSON.parse(e.run('(()=>{const s=factoryCompileSymbolicSpec(),a=iterationCreateKernel(s,A),b=iterationCreateKernel(s,A),g=iterationOrbitSearch(a,{maxTicks:37,ms:30000,captureBoundary:true});const first=g.next();if(first.done)throw Error("expected pause");const second=g.next({maxTicks:24000,ms:30000});const ref=iterationFindOrbit(b,{maxTicks:24000,ms:30000,captureBoundary:true});return JSON.stringify({first:first.value,done:second.done,x:second.value,ref,same:JSON.stringify(a.snapshot())===JSON.stringify(b.snapshot())})})()'));
 assert.equal(r.first.reason,'ticks');assert.equal(r.first.executedTicks,37);assert(r.done);assert.equal(r.x.status,'exact-model-period');assert(r.same);assert.deepEqual(r.x.values,r.ref.values);assert.deepEqual(r.x.boundary,r.ref.boundary);assert.equal(r.x.executedTicks,r.ref.executedTicks);
});
test('quick and background passes reuse results and continue paused orbits',()=>{
 const e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt',[{id:'source',rates:{'太空垃圾':'2/7'}},{id:'free',rates:{'燃料罐':'1/3'}}]);
 const r=JSON.parse(e.run('(()=>{const cache=new Map(),quick=iterationResearchPreview(state,A,{ms:30000,maxTicks:37,orbitCache:cache,rememberOrbits:true}),full=iterationResearchPreview(state,A,{ms:30000,maxTicks:24000,orbitCache:cache}),ref=iterationResearchPreview(state,A,{ms:30000,maxTicks:24000});return JSON.stringify({quick:quick.status,full:full.status,rows:full.rows,reference:ref.rows,resumed:full.actual.components.some(c=>c.resumed),reused:full.unlimited.components.some(c=>c.reused),cache:cache.size})})()'));
 assert.equal(r.quick,'partial');assert.equal(r.full,'experimental-complete');assert(r.resumed);assert.deepEqual(r.rows,r.reference);assert.equal(r.cache,0);
});

test('experimental bounded output translation matches full state and stops before capacity guard changes',()=>{
 const e=environment();
 const r=JSON.parse(e.run('(()=>{const s={machines:[{id:"a",type:"生产",recipe:{seconds:10,qty:1,output:"ore",inputs:{}},outPorts:[],inputPriority:[]}],routes:[],priority:[],frozen:[]},a=iterationCreateKernel(s,A),b=iterationCreateKernel(s,A);for(let i=0;i<200;i++)a.step();const x=a.snapshot();x.outputs=a.relaxed(x.control).outputs;for(let i=0;i<200;i++)a.step();const y=a.snapshot();y.outputs=a.relaxed(y.control).outputs;const proof=a.replayPeriod(x,y,{recordOutputGuards:true}),plan=a.outputCopies(x,y,proof);if(plan.copies<1)throw Error("no safe copies");a.jump(x,y,plan.copies,plan.drift);for(let i=0;i<a.tick;i++)b.step();const same=JSON.stringify(a.snapshot())===JSON.stringify(b.snapshot());for(let i=0;i<400;i++){a.step();b.step()}const next=JSON.stringify(a.snapshot())===JSON.stringify(b.snapshot());const ordinary=iterationFindOrbit(iterationCreateKernel(s,A),{outputAcceleration:false}),fast=iterationFindOrbit(iterationCreateKernel(s,A),{outputAcceleration:true});return JSON.stringify({same,next,plan,jumps:fast.outputJumps,values:fast.values,reference:ordinary.values})})()'));
 assert(r.same&&r.next);assert(r.plan.copies>0);assert(r.jumps>0);assert.deepEqual(r.values,r.reference);
});
test('fixed denominator frozen lattice equals independent fractional representation, including quiet jumps and fallback',()=>{
 const e=environment();
 const r=e.run('(()=>{const spec={machines:[],routes:[],priority:[],frozen:[{id:"s",rates:{ore:"41/3",fuel:"13/7"}},{id:"a",rates:{ore:"-57/2",fuel:"-31/3",plate:"11/13"}},{id:"b",rates:{ore:"-1/5",plate:"-1/7",bar:"2/11"}}]},same=(a,b)=>JSON.stringify(a.snapshot())===JSON.stringify(b.snapshot());for(const u of [false,true]){const s={...spec,unlimitedWarehouse:u},a=iterationCreateKernel(s,A),b=iterationCreateKernel(s,A,{frozenLattice:false});if(a.frozenLatticeCount!==3||b.frozenLatticeCount!==0)return false;for(let i=0;i<2500;){const n=a.advance(Math.min(20,2500-i));for(let j=0;j<n;j++)b.step();i+=n;if(!same(a,b))return false}}const rates=Object.fromEntries([2n,3n,5n,7n,11n,13n,17n,19n].map((p,i)=>["v"+i,"1/"+(p**BigInt([600,380,260,220,180,170,150,140][i]))]));const big={machines:[],routes:[],priority:[],frozen:[{id:"big",rates}]},a=iterationCreateKernel(big,A),b=iterationCreateKernel(big,A,{frozenLattice:false});if(a.frozenLatticeCount!==0)return false;for(let i=0;i<10;i++){a.step();b.step()}return same(a,b)})()');
 assert.equal(r,true);
});

test('lazy transport equals explicit movement on feedback, frozen competition and quiet jumps',()=>{
 const e=environment();
 for(const name of ['ast1-warehouse-port-balance-v1.txt','ast1-warehouse-slow-miner-v1.txt','ast1-priority-armour-backpressure-v1.txt','ast1-warehouse-feedback-loop-v1.txt','ast1-user-84-78-v1.txt']){
  fixture(e,name,[{id:'source',rates:{'合金板':'1/3','太空垃圾':'2/7'}},{id:'reader',rates:{'合金板':'-1/5','硅晶圆':'1/7'}}]);
  for(const u of [false,true]){
   e.c.u=u;
   const r=e.run('(()=>{const s=factoryCompileSymbolicSpec(state,{unlimitedWarehouse:u}),a=iterationCreateKernel(s,A,{lazyBelts:false}),b=iterationCreateKernel(s,A,{lazyBelts:true});for(let i=0;i<180;i++){const n=1+i*37%61;for(let j=0;j<n;j++)a.step();for(let j=0;j<n;)j+=b.advance(n-j);if(JSON.stringify(a.snapshot())!==JSON.stringify(b.snapshot())||JSON.stringify(a.takeMin())!==JSON.stringify(b.takeMin())||JSON.stringify(a.lastLow)!==JSON.stringify(b.lastLow))throw Error("transport mismatch "+i+" "+u)}return true})()');
   assert(r,name);
  }
 }
});
test('lazy transport preserves blocked queues, releases, restoration and finite stock jumps',()=>{
 const e=environment();
 const r=e.run('(()=>{const m=(id,type,extra)=>({id,type,outPorts:[],inputPriority:[0],...extra}),s={initial:"empty",machines:[m("a","仓出",{item:"ore",outPorts:[{index:0}]}),m("b","加工",{recipe:{seconds:13,qty:1,output:"plate",inputs:{ore:1}},outPorts:[{index:0}]}),m("c","仓入",{})],routes:[{id:"x",from:"a",fromPort:0,to:"b",toPort:0,length:180,accepted:["ore"]},{id:"y",from:"b",fromPort:0,to:"c",toPort:0,length:20,accepted:["plate"]}],priority:["a"],frozen:[]},a=iterationCreateKernel(s,A,{initialStock:{ore:500},lazyBelts:false}),b=iterationCreateKernel(s,A,{initialStock:{ore:500},lazyBelts:true});for(let i=0;i<50000;i++){a.step();b.step();if(i%137===0&&JSON.stringify(a.snapshot())!==JSON.stringify(b.snapshot()))throw Error("blocked belt mismatch "+i)}const start=a.snapshot(),c=iterationCreateKernel(s,A,{initialControl:start.control,initialStock:start.stock,lazyBelts:true}),d=iterationCreateKernel(s,A,{initialControl:start.control,initialStock:start.stock,lazyBelts:false});for(let i=0;i<10000;i++){c.step();d.step();if(i%71===0&&JSON.stringify(c.snapshot())!==JSON.stringify(d.snapshot()))throw Error("restored mismatch "+i)}const x=iterationFindOrbit(iterationCreateKernel(s,A,{initialStock:{ore:10000},lazyBelts:true}),{maxTicks:216000,verifyPeriod:true,captureBoundary:true}),y=iterationFindOrbit(iterationCreateKernel(s,A,{initialStock:{ore:10000},lazyBelts:false}),{maxTicks:216000,verifyPeriod:true,captureBoundary:true});return JSON.stringify({same:JSON.stringify(x.values)===JSON.stringify(y.values),status:[x.status,y.status],skipped:[x.skippedTicks,y.skippedTicks]})})()');
 const x=JSON.parse(r);assert(x.same);assert.deepEqual(x.status,['exact-model-period','exact-model-period']);assert(x.skipped[0]>0);
});

test('adaptive belt representation uses exact lazy state only on long routes',()=>{
 const e=environment();fixture(e,'ast1-user-84-78-v1.txt');
 const r=e.run('(()=>{const s=factoryCompileSymbolicSpec(),a=iterationCreateKernel(s,A,{lazyBelts:false}),b=iterationCreateKernel(s,A);if(b.lazyBeltCount!==s.routes.filter(r=>r.length>=32).length||b.lazyBeltCount===0)return false;for(let i=0;i<6000;i++){a.step();b.step();if(i%29===0&&JSON.stringify(a.snapshot())!==JSON.stringify(b.snapshot()))return false}return true})()');assert(r);
});

test('absolute port deadlines preserve exact relative clock state through advances, replay and stock jumps',()=>{
 const e=environment();
 for(const name of ['ast1-warehouse-port-balance-v1.txt','ast1-warehouse-slow-miner-v1.txt','ast1-priority-armour-backpressure-v1.txt','ast1-warehouse-feedback-loop-v1.txt','ast1-user-84-78-v1.txt']){
  fixture(e,name,[{id:'source',rates:{'合金板':'1/3','太空垃圾':'2/7'}},{id:'reader',rates:{'合金板':'-1/5','硅晶圆':'1/7'}}]);
  for(const u of [false,true]){
   e.c.u=u;
   assert(e.run('(()=>{const s=factoryCompileSymbolicSpec(state,{unlimitedWarehouse:u}),a=iterationCreateKernel(s,A,{absoluteClocks:false}),b=iterationCreateKernel(s,A,{absoluteClocks:true});for(let i=0;i<100;i++){const n=1+i*31%61;for(let j=0;j<n;j++)a.step();for(let j=0;j<n;)j+=b.advance(n-j);if(JSON.stringify(a.snapshot())!==JSON.stringify(b.snapshot())||JSON.stringify(a.takeMin())!==JSON.stringify(b.takeMin()))throw Error("clock mismatch "+i)}return true})()'));
  }
 }
 const x=e.run('(()=>{const s={machines:[{id:"out",type:"仓出",item:"ore",outPorts:[{index:0}],inputPriority:[]},{id:"in",type:"仓入",outPorts:[],inputPriority:[0]}],routes:[{id:"r",from:"out",fromPort:0,to:"in",toPort:0,length:4,accepted:["ore"]}],priority:["out"],frozen:[{id:"f",rates:{ore:"-2",plate:"1"}}]},run=absoluteClocks=>iterationFindOrbit(iterationCreateKernel(s,A,{absoluteClocks,initialStock:{ore:1000}}),{captureBoundary:true,verifyPeriod:true,maxTicks:10000});const a=run(false),b=run(true);return a.status==="exact-model-period"&&b.skippedTicks>0&&JSON.stringify(a.values)===JSON.stringify(b.values)&&JSON.stringify(a.boundary)===JSON.stringify(b.boundary)})()');
 assert(x);
});
test('actual synchronous fast-forward lazy belts preserve full runtime and live edit materialization',()=>{
 const e=environment();
 for(const name of ['ast1-warehouse-port-balance-v1.txt','ast1-warehouse-slow-miner-v1.txt','ast1-user-84-78-v1.txt']){
  fixture(e,name,[{id:'source',rates:{'合金板':'1/3','太空垃圾':'2/7'}},{id:'reader',rates:{'合金板':'-1/5','硅晶圆':'1/7'}}]);
  assert(e.run('(()=>{const run=lazyBelts=>{resetSimulation();const states=[];for(let i=0;i<100;i++){simulateBatchSteps(20+i*31%120,.05,{lazyBelts});states.push(JSON.stringify({simTime,ware,sim}));}return states};const a=run(false),b=run(true);for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error("actual batch mismatch "+i);return true})()'),name);
 }
 // The exact public distance representation must be present outside
 // batches, including after route extensions and stock-returning edits.
 fixture(e,'ast1-user-84-78-v1.txt');
 assert(e.run('(()=>{resetSimulation();simulateBatchSteps(5000,.05);const r=state.routes.find(r=>r.path.length>=32);if(!r)return false;const packets=sim.routes[r.id];if(!packets.every(p=>Number.isSafeInteger(simUnits(p.distance))))return false;const sum=packets.length;state.routes=state.routes.filter(x=>x!==r);reconcileSimulationLayout();return Object.values(sim.editReturns).reduce((a,b)=>a+b,0)===sum&&simBatchBelts===null})()'));
});

test('optional stock fast-forward is capped before safe integer time or counter overflow',()=>{
 const e=environment();
 assert(e.run('(()=>{const s={initial:"empty",machines:[],routes:[],priority:[],frozen:[{id:"s",rates:{ore:"1000000000"}}]},k=iterationCreateKernel(s,A);const a=k.snapshot();for(let i=0;i<20;i++)k.step();const b=k.snapshot(),n=k.safeJumpCopies(a,b,1000000000);if(n!==Math.floor((Number.MAX_SAFE_INTEGER-1000000000)/1000000000))return false;k.jump(a,b,n);const x=k.snapshot();return Number.isSafeInteger(x.stock.ore)&&Number.isSafeInteger(x.count["inflow:ore"])&&k.safeJumpCopies(a,b,1)===0})()'));
});
