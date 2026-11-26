'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function setup(){
 const c=vm.createContext({console,atob,btoa,performance,document:{
  hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}
 },requestAnimationFrame(){}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit',
  'engine/steady-flow','engine/steady-equations','engine/steady-algebra','engine/steady-transitions','engine/simulation']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 }
 vm.runInContext('function warehouseRefresh(){} function draw(){} function stockChartReset(){} function recordWarehouseMovement(){}',c);
 return c;
}
function consumerRun(material,filter){
 const c=setup();c.INPUT_MATERIAL=material;c.INPUT_FILTER=filter;
 return vm.runInContext("(()=>{"+
  "const item=INPUT_MATERIAL,filter=INPUT_FILTER;"+
  "state={name:'filtered quantum',machines:["+
   "{id:'M0',type:'仓出',item,x:0,y:0,face:'E'},"+
   "{id:'M1',type:'电脑',inletItem:filter,x:8,y:1,face:'E'}"+
  "],routes:[{id:'R0',from:{id:'M0',port:0},to:{id:'M1',port:0},path:[[5,2],[6,2],[7,2]]}]};"+
  "if(checkPath(state.routes[0].path,state.routes[0].from,state.routes[0].to,state.routes[0].id))throw Error('Invalid physical layout');"+
  "resetSimulation();ware[item]=12;"+
  "const model=steadyQueueCompile(state),exact=steadyQueueInitial(model,{warehouse:{[item]:12}});"+
  "for(let i=0;i<140;i++){simulate(.05);steadyQueueStep(model,exact)}"+
  "return {simSent:sim.byMachine.M0.sent[item]||0,"+
   "exactSent:Number(exact.counters.routeSent['R0|'+item]||0n),"+
   "simInput:sim.byMachine.M1.consumerQueue.length,exactInput:exact.machines.M1.consumer.length,"+
   "simConsumed:sim.consumed[item]||0,exactConsumed:Number(exact.counters.consumed[item]||0n)}"+
 "})()",c);
}
test('consumer input filter rejects wrong item in both real and exact models',()=>{
 const result=consumerRun('B','A');
 assert.deepEqual({...result},{simSent:0,exactSent:0,simInput:0,exactInput:0,simConsumed:0,exactConsumed:0});
});
test('consumer input filter accepts matching item with equal physical/exact counts',()=>{
 const result=consumerRun('A','A');
 assert(result.simSent>0);
 assert.equal(result.exactSent,result.simSent);
 assert.equal(result.exactInput,result.simInput);
 assert.equal(result.exactConsumed,result.simConsumed);
});
test('recipe buffers are independent per material, NOT per-physical-port FIFO',()=>{
 const c=setup();
 const result=vm.runInContext("(()=>{"+
  "DEF.__independent={name:'composite',w:5,h:5,ins:1,outs:1,"+
   "recipes:{std:{output:'C',qty:1,seconds:2,inputs:{A:1,B:1}}}};"+
  "state={name:'recipe',machines:[{id:'M0',type:'__independent',x:3,y:3,face:'E',mode:'std'}],routes:[]};"+
  "resetSimulation();const m=state.machines[0];"+
  "simTime=1;const b=acceptItem(m,0,'B');"+
  "simTime=2;const a=acceptItem(m,0,'A');"+
  "const portQueueCount=Object.keys(sim.byMachine.M0.portQueues).length;"+
  "simulate(.05);"+
  "const q=factorySteadyBuildEquations().queueModels.recipeIngredients[0].queues.find(x=>x.item==='A');"+
  "return {a,b,portQueueCount,busy:sim.byMachine.M0.busy,"+
   "remainingA:sim.byMachine.M0.inputs.A,remainingB:sim.byMachine.M0.inputs.B,"+
   "physicalPortFIFO:q.physicalPortFIFO,portProvenance:q.perIngredientPortProvenanceFIFO}"+
 "})()",c);
 assert.equal(result.a,true);assert.equal(result.b,true);
 assert.equal(result.portQueueCount,0);
 assert.equal(result.remainingA,0);assert.equal(result.remainingB,0);
 assert.equal(result.busy,2);
 assert.equal(result.physicalPortFIFO,false);
 assert.equal(result.portProvenance,true);
});
test('merger uses one shared FIFO of capacity 3 without per-input FIFO',()=>{
 const c=setup();
 const result=vm.runInContext("(()=>{"+
  "state={machines:[{id:'M0',type:'汇流',x:5,y:5,face:'E'}],routes:[]};resetSimulation();"+
  "const e=factorySteadyBuildEquations();return {"+
  "perPortQueues:Object.keys(sim.byMachine.M0.portQueues).length,"+
  "cap:e.queueModels.mergers[0].sharedFIFOCapacity,"+
  "inputCap:e.queueModels.mergers[0].physicalInletCapacityPerPort,"+
  "hasSeparateInputFIFO:e.junctionEquations[0].perInputFIFO}})()",c);
 assert.equal(result.perPortQueues,0);
 assert.equal(result.cap,3);assert.equal(result.inputCap,0);
 assert.equal(result.hasSeparateInputFIFO,false);
});

test('algebraic diagnostics do not mislabel idealized max-min RR as a simulator identity',()=>{
 const c=setup();
 const summary=vm.runInContext("(()=>{state={machines:["+
  "{id:'M0',type:'分流',x:2,y:2,face:'E'},"+
  "{id:'M1',type:'汇流',x:12,y:2,face:'E'}],routes:[]};"+
  "return factorySteadyBuildEquations().conditionalFairness.map(x=>({rule:x.rule,piecewise:x.piecewise}))"+
 "})()",c);
 assert.equal(summary.length,2);
 assert(summary.every(x=>x.piecewise.startsWith('IDEALIZED ONLY')));
 assert(summary.every(x=>x.rule.includes('no unconditional')));
});

test('a work-conserving source→unlimited warehouse has real positive output but homogeneous rate equations also allow zero',()=>{
 const c=setup();
 const result=vm.runInContext("(()=>{"+
  "const source={id:'M0',type:'垃圾',mode:0,x:0,y:0,face:'E'},"+
   "sink={id:'M1',type:'仓入',x:13,y:1,face:'E'};"+
  "state={machines:[source,sink],routes:[{id:'R0',from:{id:'M0',port:0},"+
    "to:{id:'M1',port:0},path:Array.from({length:8},(_,i)=>[5+i,2])}]};"+
  "if(checkPath(state.routes[0].path,state.routes[0].from,state.routes[0].to,state.routes[0].id))"+
    "throw Error('Invalid layout');"+
  "const model=factorySteadyBuildEquations(),algebra=factorySteadyAnalyzeEqualities(model);"+
  "resetSimulation();for(let i=0;i<600;i++)simulate(.05);"+
  "return {variables:algebra.variables,rank:algebra.rank,free:algebra.freeDegrees,"+
    "produced:sim.crafts['太空垃圾']||0,delivered:sim.inbound['太空垃圾']||0}})()",c);
 assert.equal(result.variables,2);
 assert.equal(result.rank,1);
 assert.equal(result.free,1);
 assert(result.produced>0);
 assert(result.delivered>0);
 // There is one homogeneous constraint x=3*nu and only upper bounds.
 // Therefore nu=x=0 is algebraically feasible but contradicts the
 // actual work-conserving source connected to an unblocked infinite sink.
});
