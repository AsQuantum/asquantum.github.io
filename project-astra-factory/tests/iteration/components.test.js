'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{environment,fixture}=require('./support/environment');
const f=(id,rates)=>({id,rates});
test('independent long frozen phases need no global LCM or iteration',()=>{
 const e=environment();e.c.frozen=[f('a',{'合金板':'1/997'}),f('b',{'合金板':'1/991'})];
 const x=e.run('state={machines:[],routes:[],frozenFactories:normalizeFrozenFactories(frozen)};iterationSolveComponents(factoryCompileSymbolicSpec(),A,{maxTicks:0})');
 assert.equal(x.status,'exact-model-components');assert.equal(x.componentCount,2);
 assert.equal(x.values['inflow:合金板'],'1988/988027');assert.equal(x.values['duty:a'],'1');assert.equal(x.values['duty:b'],'1');
});
test('shared read stock and frozen feedback must remain in the same component',()=>{
 const e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt',[f('source',{'太空垃圾':'1'}),f('other',{'燃料罐':'2/3'})]);
 const x=JSON.parse(e.run('JSON.stringify(iterationPartitionSpec(factoryCompileSymbolicSpec()).map(p=>({machines:p.machines.map(m=>m.id),frozen:p.frozen.map(f=>f.id)})))'));
 assert(x.some(p=>p.machines.length>0&&p.frozen.includes('source')));
 assert(x.some(p=>!p.machines.length&&p.frozen.includes('other')));
});
test('split exact-model values equal monolithic results on physical/frozen feedback in both modes',()=>{
 const e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt',[f('source',{'太空垃圾':'1'}),f('other',{'燃料罐':'2/3'})]);
 for(const mode of [false,true]){
  e.c.mode=mode;
  const x=JSON.parse(e.run(`(()=>{const s=factoryCompileSymbolicSpec(state,{unlimitedWarehouse:mode});return JSON.stringify({split:iterationSolveComponents(s,A,{maxTicks:24000}),mono:iterationFindOrbit(iterationCreateKernel(s,A),{maxTicks:24000})})})()`));
  assert.equal(x.split.status,'exact-model-components');assert.equal(x.mono.status,'exact-model-period');
  for(const k of new Set([...Object.keys(x.split.values),...Object.keys(x.mono.values)]))assert.equal(x.split.values[k]??'0',x.mono.values[k]??'0',k);
 }
});
test('unsolved component does not turn partial sums into factory totals',()=>{
 const e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt',[f('source',{'太空垃圾':'1'}),f('other',{'燃料罐':'2/3'})]);
 const x=e.run('iterationSolveComponents(factoryCompileSymbolicSpec(),A,{maxTicks:0})');
 assert.equal(x.status,'partial');assert.equal(x.values,undefined);assert(x.components.some(p=>p.values));
});

test('autonomous batch renewal exact rates match full orbit on both sides of the port bottleneck',()=>{
 const e=environment();
 const r=e.run('(()=>{let n=0;for(const qty of [1,2,3,7])for(const T of [1,19,20,21,39,40,41,79,140,141,201]){const spec={machines:[{id:"source",type:"生产",recipe:{seconds:T/20,qty,output:"ore",inputs:{}},outPorts:[{index:0}],inputPriority:[]},{id:"sink",type:"仓入",outPorts:[],inputPriority:[0]}],routes:[{id:"r",from:"source",fromPort:0,to:"sink",toPort:0,length:1+T%11,accepted:["ore"]}],priority:[],frozen:[]};const a=iterationAutonomousBatchRates(spec,A),b=iterationFindOrbit(iterationCreateKernel(spec,A),{ms:10000,maxTicks:150000});if(!a?.values||!b.values)throw Error("unresolved "+qty+"/"+T+" "+b.status);for(const k of new Set([...Object.keys(a.values),...Object.keys(b.values)]))if((a.values[k]??"0")!==(b.values[k]??"0"))throw Error("rate mismatch "+qty+"/"+T+" "+k+" "+a.values[k]+"/"+b.values[k]);n++}return n})()');
 assert.equal(r,44);
});
test('autonomous batch renewal rejects competing or blocked topology and solves long transport without a search',()=>{
 const e=environment();
 const r=e.run('(()=>{const s={machines:[{id:"source",type:"生产",recipe:{seconds:1000000,qty:2,output:"ore",inputs:{}},outPorts:[{index:0}],inputPriority:[]},{id:"sink",type:"仓入",outPorts:[],inputPriority:[0]}],routes:[{id:"r",from:"source",fromPort:0,to:"sink",toPort:0,length:1000000,accepted:["ore"]}],priority:[],frozen:[]};const a=iterationSolveComponents(s,A,{maxTicks:0,analyticBatch:true});if(a.values["inflow:ore"]!=="1/500000")return false;s.routes[0].accepted=[];if(iterationAutonomousBatchRates(s,A))return false;s.routes[0].accepted=["ore"];s.machines[0].recipe.inputs={fuel:1};return iterationAutonomousBatchRates(s,A)===null})()');
 assert.equal(r,true);
});

test('autonomous batch calendar predicts the exact startup arrivals and next event',()=>{
 const e=environment();
 const n=e.run('(()=>{let checked=0;for(const qty of [1,2,3,7])for(const T of [1,19,20,21,39,40,41,79,140,141,201]){const s={machines:[{id:"source",type:"生产",recipe:{seconds:T/20,qty,output:"ore",inputs:{}},outPorts:[{index:0}],inputPriority:[]},{id:"sink",type:"仓入",outPorts:[],inputPriority:[0]}],routes:[{id:"r",from:"source",fromPort:0,to:"sink",toPort:0,length:1+T%11,accepted:["ore"]}],priority:[],frozen:[]};const c=iterationAutonomousBatchCalendar(s,A),k=iterationCreateKernel(s,A);let before=0n,next=c.next(0);for(let i=1;i<=10000;i++){k.step();const v=BigInt(k.snapshot().stock.ore||0);if(v!==c.cumulative(i)||v-before!==c.between(i-1,i))throw Error("arrival "+qty+"/"+T+"/"+i);if(v>before){if(next!==BigInt(i))throw Error("next arrival "+i);next=c.next(i);}before=v;checked++}}return checked})()');
 assert.equal(n,440000);
});

test('empty-start source-free cycle has exact zero flow without period search; a producer disables the proof',()=>{
 const e=environment();
 const x=e.run('(()=>{const m=(id,k,input)=>({id,type:"加工",recipe:{seconds:1,qty:1,output:k,inputs:{[input]:1}},outPorts:[{index:0}],inputPriority:[0]}),s={initial:"empty",machines:[m("a","ore","plate"),m("b","plate","ore")],routes:[{id:"ab",from:"a",fromPort:0,to:"b",toPort:0,length:3,accepted:["ore"]},{id:"ba",from:"b",fromPort:0,to:"a",toPort:0,length:3,accepted:["plate"]}],frozen:[],priority:[]};for(const unlimitedWarehouse of [false,true]){const spec={...s,unlimitedWarehouse},a=iterationSolveComponents(spec,A,{maxTicks:0}),b=iterationFindOrbit(iterationCreateKernel(spec,A),{maxTicks:1000});if(a.components[0].method!=="empty-start-no-source"||!a.values||!b.values||Object.values(b.values).some(v=>v!=="0"))return false;}if(iterationSourceFreeRates({...s,initial:"unknown"}))return false;s.machines[0].recipe.inputs={};return iterationSourceFreeRates(s)===null})()');
 assert.equal(x,true);
});

test('sinkless acyclic physical network has zero long-run rate, including finite startup production and blocked lines',()=>{
 const e=environment();
 const r=e.run('(()=>{const s={initial:"empty",machines:[{id:"a",type:"生产",recipe:{seconds:1,qty:3,output:"ore",inputs:{}},outPorts:[{index:0}],inputPriority:[]},{id:"b",type:"加工",recipe:{seconds:2,qty:1,output:"plate",inputs:{ore:2}},outPorts:[{index:0}],inputPriority:[0]}],routes:[{id:"r",from:"a",fromPort:0,to:"b",toPort:0,length:7,accepted:["ore"]},{id:"open",from:"b",fromPort:0,to:null,toPort:null,length:4,accepted:[]}],priority:[],frozen:[]};const a=iterationSolveComponents(s,A,{maxTicks:0}),b=iterationFindOrbit(iterationCreateKernel(s,A),{maxTicks:30000});if(!a.values||a.components[0].method!=="finite-buffer-sinkless-dag"||!b.values||Object.values(b.values).some(v=>v!=="0"))return false;s.machines[0].inputPriority=[0];s.routes[1].to="a";s.routes[1].toPort=0;if(iterationSinklessDagRates(s))return false;s.routes[1].to=null;s.machines[1].type="电脑";return iterationSinklessDagRates(s)===null})()');
 assert.equal(r,true);
});
test('placement audit cannot veto actual theoretical rates: open ends, empty machines, incompatible materials and geometry warnings',()=>{
 const e=environment();
 const result=e.run('(()=>{const a={id:"M0",type:"垃圾",mode:1,x:5,y:10,face:"E"},b={id:"M1",type:"仓入",x:25,y:10,face:"E"},c={id:"M2",type:"组装",mode:"框架模块",x:5,y:30,face:"E"},d={id:"M3",type:"垃圾",mode:0,x:5,y:45,face:"E"};state={machines:[a,b,c,d],routes:[{id:"R0",from:{id:a.id,port:0},to:{id:b.id,port:0},path:[[0,0],[1,0]]},{id:"R1",from:{id:d.id,port:0},to:null,path:[[0,1]]}],frozenFactories:[]};if(!checkPath(state.routes[0].path,state.routes[0].from,state.routes[0].to,"R0"))throw Error("expected audit warning");const p=iterationResearchPreview(state,A,{ms:10000});resetSimulation();simulateBatchSteps(12000,.05);const before=sim.inbound["遐想物质"]||0;simulateBatchSteps(12000,.05);const after=sim.inbound["遐想物质"]||0;const equal=after-before===80;const x={complete:p.completeHtmlQueries,in:p.rows["遐想物质"].inflow,open:p.values["routeTotal:R1"],isolated:p.machineTimes.M2,dead:p.machineTimes.M3,equal};b.inletItem="合金板";const q=iterationResearchPreview(state,A,{ms:10000});return JSON.stringify({...x,blocked:q.values["routeTotal:R0"],other:q.values["routeTotal:R1"],blockedComplete:q.completeHtmlQueries})})()');
 assert.deepEqual(JSON.parse(result),{complete:true,in:'2/15',open:'0',isolated:'Infinity',dead:'Infinity',equal:true,blocked:'0',other:'0',blockedComplete:true});
});

test('duplicate port wiring is an audit warning, with the actual first-route and shared cooldown rules',()=>{
 const e=environment();
 const r=e.run('(()=>{const a={id:"M0",type:"垃圾",mode:0,x:5,y:10,face:"E"},b={id:"M1",type:"垃圾",mode:0,x:5,y:20,face:"E"},c={id:"M2",type:"汇流",x:25,y:10,face:"E"},d={id:"M3",type:"仓入",x:40,y:10,face:"E"},mk=(id,from,to,p=0)=>({id,from:{id:from,port:0},to:{id:to,port:p},path:[[1,1],[2,1]]});state={machines:[a,b,c,d],routes:[mk("R0","M0","M2"),mk("R1","M0","M3"),mk("R2","M1","M2"),mk("R3","M2","M3")],frozenFactories:[]};const spec=factoryCompileSymbolicSpec(),k=iterationCreateKernel(spec,A),p=iterationResearchPreview(state,A,{ms:10000});resetSimulation();for(let i=0;i<5000;i++){k.step();simulateBatchSteps(1,.05);if(i%37===0){const x=k.snapshot();for(let j=0;j<state.routes.length;j++){const r=state.routes[j],a=JSON.parse(x.control)[1][j],b=sim.routes[r.id].map(p=>[p.item,simUnits(p.distance)]);if(JSON.stringify(a)!==JSON.stringify(b))throw Error("duplicate mismatch "+i+"/"+r.id)}if((x.stock["太空垃圾"]||0)!==(ware["太空垃圾"]||0))throw Error("stock mismatch")}}return JSON.stringify({complete:p.completeHtmlQueries,first:p.values["routeTotal:R0"],duplicate:p.values["routeTotal:R1"],blocked:p.values["routeTotal:R2"],sink:p.values["routeTotal:R3"]})})()');
 assert.deepEqual(JSON.parse(r),{complete:true,first:'1',duplicate:'0',blocked:'0',sink:'1'});
});

test('missing source, missing target and unusable port references are inert rather than whole-factory failures',()=>{
 const e=environment();
 const result=e.run('(()=>{state={machines:[{id:"a",type:"垃圾",mode:0,x:5,y:5,face:"E"},{id:"b",type:"仓入",x:25,y:5,face:"E"}],routes:[{id:"orphan",from:{id:"deleted",port:0},to:{id:"b",port:0},path:[[0,0]]},{id:"open",from:{id:"a",port:0},to:{id:"deleted",port:0},path:[[0,1]]},{id:"badport",from:{id:"a",port:99},to:{id:"b",port:0},path:[[0,2]]}],frozenFactories:[]};const s=factoryCompileSymbolicSpec(),p=iterationResearchPreview(state,A,{ms:10000}),k=iterationCreateKernel(s,A);resetSimulation();for(let i=0;i<3000;i++){k.step();simulateBatchSteps(1,.05)}return JSON.stringify({complete:p.completeHtmlQueries,zero:state.routes.map(r=>p.values["routeTotal:"+r.id]),packets:state.routes.map(r=>sim.routes[r.id].length),ware,modelStock:k.snapshot().stock})})()');
 assert.deepEqual(JSON.parse(result),{complete:true,zero:['0','0','0'],packets:[0,0,0],ware:{},modelStock:{}});
});

test('optional analytic failure retries exact iteration; irrecoverable component failure preserves independent results',()=>{
 const e=environment();
 const r=e.run('(()=>{const s={initial:"empty",machines:[{id:"a",type:"生产",recipe:{seconds:1,qty:1,output:"ore",inputs:{}},outPorts:[{index:0}],inputPriority:[]},{id:"b",type:"仓入",outPorts:[],inputPriority:[0]}],routes:[{id:"r",from:"a",fromPort:0,to:"b",toPort:0,length:2,accepted:["ore"]}],priority:[],frozen:[{id:"independent",rates:{fuel:"2/3"}}]};const analytic=iterationAnalyticRates,kernel=iterationCreateKernel;try{iterationAnalyticRates=(part,...args)=>{if(part.machines.length)throw Error("injected proof failure");return analytic(part,...args)};const a=iterationBoundaryPressure(s,A,{ms:10000}),u=iterationSolveComponents({...s,unlimitedWarehouse:true},A,{ms:10000});if(!a.actualValues||!u.values||a.rows.ore.inflow!=="1"||u.values["inflow:ore"]!=="1"||!a.components.some(c=>c.analyticError==="injected proof failure"&&c.actualStatus==="exact-model-period"))return false;iterationCreateKernel=(part,...args)=>{if(part.machines.length)throw Error("injected kernel failure");return kernel(part,...args)};const b=iterationBoundaryPressure(s,A,{ms:10000}),v=iterationSolveComponents({...s,unlimitedWarehouse:true},A,{ms:10000});return b.actualValues===null&&!v.values&&b.rows.ore.inflow===null&&b.rows.fuel.inflow==="2/3"&&v.partialValues["inflow:fuel"]==="2/3"&&b.components.some(c=>c.actualStatus==="error"&&c.reason==="injected kernel failure")&&v.components.some(c=>c.status==="error")}finally{iterationAnalyticRates=analytic;iterationCreateKernel=kernel}})()');
 assert(r);
});

test('semantic component cache survives unrelated warehouse edits and invalidates newly coupled groups',()=>{
 const e=environment();
 assert(e.run('(()=>{const src={id:"a",type:"生产",recipe:{seconds:1,qty:1,output:"ore",inputs:{}},outPorts:[{index:0}],inputPriority:[]},dst={id:"b",type:"仓入",outPorts:[],inputPriority:[0]},s={initial:"empty",machines:[src,dst],routes:[{id:"r",from:"a",fromPort:0,to:"b",toPort:0,length:3,accepted:["ore","unrelated"]}],priority:[],frozen:[]},componentMemo=new Map(),opts={ms:5000,componentMemo,analyticBatch:false,analyticTree:false};const a=iterationBoundaryPressure(s,A,opts),u=iterationSolveComponents({...s,unlimitedWarehouse:true},A,opts);if(!a.actualValues||!u.values)return false;s.frozen=[{id:"f",rates:{unrelated:"1/3"}}];const b=iterationBoundaryPressure(s,A,{...opts,maxTicks:0}),v=iterationSolveComponents({...s,unlimitedWarehouse:true},A,{...opts,maxTicks:0});if(!b.actualValues||!v.values||b.rows.ore.inflow!=="1"||b.rows.unrelated.net!=="1/3"||!b.components.some(c=>c.componentCacheHit)||!v.components.some(c=>c.componentCacheHit))return false;s.frozen=[{id:"f",rates:{ore:"-2"}}];const c=iterationBoundaryPressure(s,A,opts),d=iterationBoundaryPressure(s,A,{...opts,componentMemo:undefined});return c.actualValues&&JSON.stringify(c.rows)===JSON.stringify(d.rows)&&c.components.length===1&&!c.components[0].componentCacheHit&&c.rows.ore.net==="0"})()'));
});
