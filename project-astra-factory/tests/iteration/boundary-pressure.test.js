'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{environment,fixture}=require('./support/environment');
const f=(id,rates)=>({id,rates});
function freeze(list,options={}){
 const e=environment();e.c.f=list;e.c.options=options;
 return JSON.parse(e.run('state={machines:[],routes:[],frozenFactories:normalizeFrozenFactories(f)};JSON.stringify(iterationResearchPreview(state,A,{ms:5000,maxTicks:10000,...options}))'));
}
test('standalone preview uses all three independent net models for a frozen bottleneck',()=>{
 const x=freeze([f('s',{'合金板':'1/2','能量电池':'3/4'}),f('m',{'合金板':'-1','能量电池':'-1','硅晶圆':'1'})]);
 assert.equal(x.status,'experimental-complete');assert.equal(x.certified,false);
 for(const [k,expected] of Object.entries({'合金板':['0','-1/4','-1/2'],'能量电池':['1/4','1/4','-1/4'],'硅晶圆':['1/2','1/2','1']})){
  const r=x.rows[k];assert.deepEqual([r.net,r.potential,r.overdraft],expected,k);
 }
 assert.equal(x.values['duty:m'],'1/2');
 assert.equal(x.rows['合金板'].localPotential,'0');
});
test('fixed income is not overwritten by conditional production',()=>{
 const x=freeze([f('s',{'合金板':'1','能量电池':'4'}),f('m',{'合金板':'-2','能量电池':'-2','硅晶圆':'2'})]);
 assert.equal(x.status,'experimental-complete');
 for(const [k,expected] of Object.entries({'合金板':['0','-1','-1'],'能量电池':['3','3','2'],'硅晶圆':['1','1','2']})){
  const r=x.rows[k];assert.deepEqual([r.net,r.potential,r.overdraft],expected,k);
 }
 assert.equal(x.rows['硅晶圆'].inflow,'1');
});
test('budget failure never fills unknown rates with zero',()=>{
 const x=freeze([f('s',{'合金板':'1/2'}),f('m',{'合金板':'-1','硅晶圆':'1'})],{maxTicks:0});
 assert.equal(x.status,'partial');assert.equal(x.rows['合金板'].inflow,null);
 assert.equal(x.rows['合金板'].potential,null);assert(x.unknownMetrics.length>0);
});
test('calendar reduction compares full item and stage sequence, not just count',()=>{
 const e=environment();
 const x=JSON.parse(e.run('JSON.stringify(iterationReduceBoundary({period:4,frames:{0:{physical:{ore:1}},2:{physical:{ore:1}},3:{"frozen:s":{ignore:3}}}},["ore","ignore"],["ignore"]))'));
 assert.equal(x.period,2);assert.deepEqual(x.frames,{'0':{physical:{ore:1}}});
});
test('no old direct solver is loaded in research runtime',()=>{
 const e=environment();
 assert.equal(e.run('typeof factoryCertifiedResearchPreview'),'undefined');
 assert.equal(e.run('typeof projectCurrentBoundaryDemand'),'undefined');
});

test('budget preserves independent completed item rates, never partial shared totals',()=>{
 const x=freeze([f('s',{'合金板':'1/2'}),f('m',{'合金板':'-1','硅晶圆':'1'}),f('independent',{'燃料罐':'2/3'}),f('shared',{'硅晶圆':'2'})],{maxTicks:0});
 assert.equal(x.status,'partial');assert.equal(x.rows['合金板'].inflow,null);assert.equal(x.rows['硅晶圆'].inflow,null);
 assert.deepEqual([x.rows['燃料罐'].inflow,x.rows['燃料罐'].outflow,x.rows['燃料罐'].potential,x.rows['燃料罐'].overdraft],['2/3','0','2/3','2/3']);
 assert.equal(x.values['duty:independent'],'1');assert.equal(x.values['duty:m'],null);assert.equal(x.total.inflow,null);
});

test('warehouse boundary follows junction cycles and filters, not the acceptance catalogue',()=>{
 const {environment}=require('./support/environment'),e=environment();
 const m=(id,type,extra={})=>({id,type,outPorts:[{index:0}],inputPriority:[0,1],...extra});
 const r=(id,from,to,toPort=0)=>({id,from,to,fromPort:0,toPort,length:1,accepted:['合金板','硅晶圆','燃料罐']});
 e.c.spec={machines:[m('a','仓出',{item:'合金板'}),m('b','分流',{outPorts:[{index:0,filter:'合金板'},{index:1,filter:'硅晶圆'}]}),m('c','汇流'),m('d','仓入'),m('e','仓入'),m('f','仓入'),m('g','生产',{recipe:{output:'能量电池'}})],routes:[r('1','a','c'),r('2','c','b'),r('3','b','c',1),{...r('4','b','d'),fromPort:1},{...r('5','b','e'),fromPort:0},r('6','g',null)],frozen:[{id:'f',rates:{'曲速线圈':'-1'}}]};
 // This graph is a structural test, not a legal placement or rate proof.
 const x=JSON.parse(e.run('JSON.stringify(iterationWarehouseBoundaryItems(spec).sort())'));
 assert.deepEqual(x,['合金板','曲速线圈'].sort());
});

test('independent pressure task preparation and exact join match the sequential model',()=>{
 const {environment,fixture}=require('./support/environment'),e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt',[{id:'a',rates:{'太空垃圾':'1/3'}},{id:'b',rates:{'合金板':'-1/5','燃料罐':'1/7'}}]);
 const x=e.run('(()=>{const s=factoryCompileSymbolicSpec(),plan={actual:new Map(),tasks:[],results:new Map()},a=iterationBoundaryPressure(s,A,{ms:20000});iterationBoundaryPressure(s,A,{ms:20000,preparePressure:plan});for(const t of plan.tasks)plan.results.set(t.id,iterationFindOrbit(iterationCreateKernel(t.part,A,t.initial),{ms:20000}));const b=iterationBoundaryPressure(s,A,{preparedActual:plan.actual,pressureResults:plan.results});return JSON.stringify(a.rows)===JSON.stringify(b.rows)&&JSON.stringify(a.actualValues)===JSON.stringify(b.actualValues)})()');
 assert.equal(x,true);
});

test('fixed-calendar pressure projection preserves competing frozen stage credits and target debits',()=>{
 const {environment}=require('./support/environment'),e=environment();
 e.c.f=[{id:'s',rates:{'合金板':'7/3','硅晶圆':'4/5'}},{id:'a',rates:{'合金板':'-1','硅晶圆':'-1/2','燃料罐':'1'}},{id:'b',rates:{'合金板':'-2','能量电池':'1'}},{id:'c',rates:{'硅晶圆':'-1/3','齿轮组':'1'}}];
 const x=e.run('state={machines:[],routes:[],frozenFactories:normalizeFrozenFactories(f)};(()=>{const s=factoryCompileSymbolicSpec(),plan={actual:new Map(),tasks:[],results:new Map()};iterationBoundaryPressure(s,A,{ms:10000,preparePressure:plan});let projected=0;for(const t of plan.tasks){const a=iterationFindOrbit(iterationCreateKernel(t.part,A,t.initial),{ms:10000,maxTicks:216000}),b=iterationSolvePressure(t.part,A,{maxTicks:216000},t.kind,t.initial,10000),k=t.kind.slice(9);if(!a.values||!b.values)throw Error(a.status+"/"+b.status);for(const p of ["outflow:","localOut:"])if((a.values[p+k]??"0")!==(b.values[p+k]??"0"))throw Error("target mismatch "+k);if(b.projected)projected++;}return projected})()');
 assert(x>0);
});
test('fixed calendar projection keeps full target rates on physical shared warehouse feedback',()=>{
 const {environment,fixture}=require('./support/environment'),e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt');
 const r=e.run('(()=>{const s=factoryCompileSymbolicSpec(),a=iterationBoundaryPressure(s,A,{ms:10000,pressureProjection:false}),b=iterationBoundaryPressure(s,A,{ms:10000,pressureProjection:true});return JSON.stringify(a.rows)===JSON.stringify(b.rows)})()');
 assert(r);
});

test('frozen no-source proof distinguishes actual zero, single-gate pressure and unlimited production',()=>{
 const e=environment();
 const r=e.run('(()=>{const s={initial:"empty",machines:[],routes:[],priority:[],frozen:[{id:"a",rates:{fuel:"-1/2",armor:"1/4"}},{id:"b",rates:{armor:"-1/3",fuel:"1/5"}},{id:"c",rates:{fuel:"-1/7",armor:"-1/11",gas:"1/13"}}]};const a=iterationBoundaryPressure(s,A,{maxTicks:0}),b=iterationBoundaryPressure(s,A,{analyticFrozen:false,maxTicks:216000,ms:10000}),u=iterationSolveComponents({...s,unlimitedWarehouse:true},A,{maxTicks:0});if(!a.actualValues||!b.actualValues||!u.values)throw Error("missing result");for(const k of Object.keys(a.rows))for(const field of Object.keys(a.rows[k]))if(a.rows[k][field]!==b.rows[k][field])throw Error("zero mismatch "+k+"/"+field);if(a.rows.fuel.demand!=="1/2"||a.rows.armor.demand!=="1/3"||(a.rows.gas?.inflow??"0")!=="0"||u.values["duty:c"]!=="1")return false;return a.components.every(c=>c.method==="frozen-empty-no-source")&&Object.values(a.actualValues).every(x=>x==="0")})()');
 assert(r);
});
test('strict surplus frozen chains and competing readers are full service without a period search',()=>{
 const e=environment();
 const r=e.run('(()=>{let checked=0;for(let j=1;j<=24;j++){const s={initial:"empty",machines:[],routes:[],priority:[],frozen:[{id:"s",rates:{ore:""+(j+4)}},{id:"a",rates:{ore:"-1/3",plate:"3/2"}},{id:"b",rates:{ore:"-1/2",plate:"-1/3",gas:"1/2"}},{id:"c",rates:{gas:"-1/5",fuel:"1/7"}}]};if(j%2)s.frozen.reverse();const a=iterationBoundaryPressure(s,A,{maxTicks:0}),b=iterationBoundaryPressure(s,A,{analyticFrozen:false,maxTicks:216000,ms:3000});if(!a.actualValues||!b.actualValues)throw Error("unresolved "+j);for(const k of Object.keys(a.rows))for(const f of Object.keys(a.rows[k])){if(a.rows[k][f]!==b.rows[k][f])throw Error("surplus mismatch "+j+"/"+k+"/"+f);checked++}if(!a.components.every(c=>c.method==="frozen-strict-surplus"))throw Error("proof absent");for(const f of s.frozen)if(a.actualValues["duty:"+f.id]!=="1")throw Error("duty")}return checked})()');
 assert(r>0);
});
test('frozen proof refuses equal supply, deficit and partially reachable deadlocked components',()=>{
 const e=environment();
 assert(e.run('(()=>{const s={initial:"empty",machines:[],routes:[],priority:[],frozen:[{id:"s",rates:{ore:"1"}},{id:"a",rates:{ore:"-1",plate:"1"}}]};if(iterationFrozenStockProof(s,A))return false;s.frozen[1].rates.ore="-2";if(iterationFrozenStockProof(s,A))return false;s.frozen[1].rates={ore:"-1/2",fuel:"-1",plate:"1"};if(iterationFrozenStockProof(s,A))return false;return iterationBoundaryPressure(s,A,{ms:5000}).actualValues!==null})()'));
});

test('unrelated F2 is solved without iteration even beside a live physical factory',()=>{
 const e=environment();fixture(e,'ast1-user-84-78-v1.txt',[{id:'F2',rates:{'测试燃料':'-1/2','测试装甲':'1/4'}}]);
 const r=e.run('(()=>{const s=factoryCompileSymbolicSpec(),groups=iterationPartitionSpec(s),p=groups.find(g=>g.frozen.some(f=>f.id==="F2"));if(!p||p.machines.length||p.frozen.length!==1)return false;const a=iterationBoundaryPressure(p,A,{maxTicks:0}),b=iterationSolveComponents({...p,unlimitedWarehouse:true},A,{maxTicks:0});return a.actualValues["duty:F2"]==="0"&&a.rows["测试燃料"].demand==="1/2"&&b.values["inflow:测试装甲"]==="1/4"})()');
 assert(r);
});

test('optional pressure projection error retries the full exact conditional model',()=>{
 const e=environment();
 const x=e.run('(()=>{const s={initial:"empty",machines:[],routes:[],priority:[],frozen:[{id:"s",rates:{ore:"1/2"}},{id:"r",rates:{ore:"-1",plate:"1"}}]},ref=iterationBoundaryPressure(s,A,{ms:5000}),project=iterationPressureProjection;try{iterationPressureProjection=()=>{throw Error("injected projection failure")};const a=iterationBoundaryPressure(s,A,{ms:5000});return JSON.stringify(a.rows)===JSON.stringify(ref.rows)&&a.components.some(c=>Object.values(c.pressure).some(p=>p.analyticError==="injected projection failure"&&p.status==="exact-model-period"))}finally{iterationPressureProjection=project}})()');
 assert(x);
});
