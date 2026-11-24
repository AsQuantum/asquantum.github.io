'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function context(){
 const c=vm.createContext({
  console,atob,btoa,performance,Math,Map,Set,JSON,
  document:{hidden:false,getElementById(){return {getContext(){return {}},classList:{add(){},remove(){}},style:{},textContent:''}}},
  requestAnimationFrame(){},
 });
 for(const p of [
  'scripts/data/catalog.js','scripts/core/state.js','scripts/blueprints/machine-ids.js',
  'scripts/blueprints/item-ids.js','scripts/core/machines.js','scripts/core/routing.js',
  'scripts/blueprints/ast1-codec.js','scripts/core/audit.js','scripts/engine/simulation.js']){
  vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),c,{filename:p});
 }
 vm.runInContext('function stockChartReset(){} function warehouseRefresh(){} function draw(){} function recordWarehouseMovement(){}',c);
 return c;
}
function make(c,machines,routes=[]){
 c.layout={name:'quantum queue',machines,routes};
 vm.runInContext('state=layout;resetSimulation()',c);
 c.sim=vm.runInContext('sim',c);
 return {
  accept:vm.runInContext('acceptItem',c),step:vm.runInContext('simulate',c),
  get:expr=>vm.runInContext(expr,c),
  setTime:t=>{c.t=t;vm.runInContext('simTime=t',c)}
 };
}
test('Quantum decorative consumer has one ANY-material FIFO length 10; arrival never destroys',()=>{
 const c=context(),pc={id:'pc',type:'电脑',x:9,y:3,face:'E'};
 const {accept,get,setTime}=make(c,[pc]);
 assert.equal(get("getPorts(state.machines[0]).filter(p=>p.kind==='in').length"),1);
 assert.equal(get("getPorts(state.machines[0]).filter(p=>p.kind==='out').length"),0);
 const materials=['太空垃圾','量子处理器','合金板'];
 for(let i=0;i<10;i++){setTime(i);assert.equal(accept(pc,0,materials[i%3]),true);}
 setTime(10);assert.equal(accept(pc,0,'太空垃圾'),false);
 assert.equal(c.sim.byMachine.pc.consumerQueue.length,10);
 assert.deepEqual([...c.sim.byMachine.pc.consumerQueue],Array.from({length:10},(_,i)=>materials[i%3]));
 assert.equal(get("Object.values(sim.consumed).reduce((a,b)=>a+b,0)"),0);
 assert.equal(get("Object.values(sim.byMachine.pc.inputs).reduce((a,b)=>a+b,0)"),10);
 assert.equal(get("Object.values(ware).reduce((a,b)=>a+b,0)"),0);
});
test('Quantum computer destroys FIFO head exactly one item per second independently of input',()=>{
 const c=context(),pc={id:'pc',type:'电脑',x:9,y:3,face:'E'};
 const {accept,step,setTime}=make(c,[pc]);
 setTime(0);assert(accept(pc,0,'太空垃圾'));
 setTime(1);assert(accept(pc,0,'合金板'));
 setTime(2);assert(accept(pc,0,'量子处理器'));
 for(let i=0;i<19;i++)step(.05);
 assert.equal(c.sim.consumed['太空垃圾']||0,0,'nothing destroyed before 1 second of processing');
 step(.05);
 assert.equal(c.sim.consumed['太空垃圾'],1);
 assert.deepEqual([...c.sim.byMachine.pc.consumerQueue],['合金板','量子处理器']);
 for(let i=0;i<20;i++)step(.05);
 assert.equal(c.sim.consumed['合金板'],1);
 for(let i=0;i<20;i++)step(.05);
 assert.equal(c.sim.consumed['量子处理器'],1);
 assert.equal(c.sim.byMachine.pc.consumerQueue.length,0);
 assert.equal(Object.values(c.sim.byMachine.pc.inputs).reduce((a,b)=>a+b,0),0);
 assert.equal(Object.values(c.sim.inbound).reduce((a,b)=>a+b,0),0);
});
test('consumer FIFO cap is released only on destruction, not on acceptance',()=>{
 const c=context(),pc={id:'pc',type:'电脑',x:9,y:3,face:'E'};
 const {accept,step,setTime}=make(c,[pc]);
 for(let i=0;i<10;i++){setTime(i);assert(accept(pc,0,'太空垃圾'));}
 setTime(10);assert.equal(accept(pc,0,'量子处理器'),false);
 for(let i=0;i<20;i++)step(.05);
 assert.equal(c.sim.byMachine.pc.consumerQueue.length,9);
 assert.equal(accept(pc,0,'量子处理器'),true);
 assert.equal(c.sim.byMachine.pc.consumerQueue.length,10);
});
test('Quantum computer AST1 encoder and decoder still preserve its unrestricted port',()=>{
 const c=context();
 c.layout={name:'AST1 Consumer',machines:[{id:'pc',type:'电脑',x:9,y:3,face:'E'}],routes:[]};
 vm.runInContext('state=layout',c);
 const code=vm.runInContext('ast1Encode()',c);
 const data=Uint8Array.from(atob(code.slice(5)),ch=>ch.charCodeAt(0));
 assert.equal(data[3],17);
 assert.equal(data[3+6],1);
 assert.equal(data[3+7],0);
 assert.equal(data[3+8],0);
 c.code=code;
 const decoded=vm.runInContext('ast1Decode(code)',c);
 assert.equal(decoded.machines[0].inletItem,'');
 c.decoded=decoded;
 assert.equal(vm.runInContext('state=decoded;ast1Encode()',c),code);
});
test('warehouse-out supplying quantum consumer is accounted as disposal, never warehouse income',()=>{
 const c=context(),source={id:'source',type:'仓出',x:0,y:0,face:'E',item:'太空垃圾'},
  pc={id:'pc',type:'电脑',x:8,y:1,face:'E'};
 const r={id:'r1',from:{id:'source',port:0},to:{id:'pc',port:0},path:[[5,2],[6,2],[7,2]]};
 const {step,get}=make(c,[source,pc],[r]);
 vm.runInContext("ware['太空垃圾']=60",c);
 assert.equal(get('checkPath(state.routes[0].path,state.routes[0].from,state.routes[0].to,state.routes[0].id)'),null);
 for(let i=0;i<240;i++)step(.05);
 const spent=c.sim.consumed['太空垃圾']||0;
 assert(spent>=8&&spent<=12,'12 seconds should consume about 10 items; actual '+spent);
 assert.equal(c.sim.inbound['太空垃圾']||0,0);
 assert.equal(c.sim.outbound['太空垃圾']>=spent,true);
});
test('producer output FIFO is qty × 20, independent of ingredient buffers',()=>{
 const c=context();
 vm.runInContext("DEF.__testProducer={name:'test',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'太空垃圾',qty:2,seconds:0.1,inputs:{}}}}",c);
 const source={id:'producer',type:'__testProducer',x:0,y:0,face:'E',mode:'run'};
 const {step}=make(c,[source]);
 for(let i=0;i<300;i++)step(.05);
 assert.equal(c.sim.byMachine.producer.queue.length,40);
 assert.equal(c.sim.crafts['太空垃圾'],40);
});
