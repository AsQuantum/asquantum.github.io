'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'scripts/engine/simulation.js'),'utf8');
function setup(){
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},
  document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return {}}}:null}},
  warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const file of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',file+'.js'),'utf8'),c,{filename:file+'.js'});
 return c;
}
const machine=(id,type,opts={})=>({id,type,x:10,y:10,face:'E',mode:'run',...opts});
const route=(id,from,to=null,fromPort=0,toPort=0)=>({id,from:{id:from,port:fromPort},
 to:to?{id:to,port:toPort}:null,path:[[13,11],[14,11],[15,11],[16,11],[17,11],[18,11]]});
function start(c,machines,routes){
 c.layout={machines,routes,name:'queue-unit'};
 vm.runInContext('state=layout;resetSimulation()',c);
 c.sim=vm.runInContext('sim',c);
 return {accept:vm.runInContext('acceptItem',c),step:vm.runInContext('simulate',c)};
}
function clock(c,n){c.at=n;vm.runInContext('simTime=at',c);}
function registerRecipe(c){
 vm.runInContext("DEF.__ingredients={name:'Independent A & B',w:3,h:3,ins:2,outs:1,recipes:{run:{output:'齿轮组',qty:1,seconds:5,inputs:{'太空垃圾':1,'合金板':2}}}}",c);
}
test('two recipe materials use INDEPENDENT FIFO buffers, capacity 3A and 6B',()=>{
 const c=setup();registerRecipe(c);
 const m=machine('recipe','__ingredients');
 const {accept}=start(c,[m],[]);
 for(let i=0;i<3;i++){clock(c,i+1);assert(accept(m,0,'太空垃圾'));}
 clock(c,4);assert.equal(accept(m,0,'太空垃圾'),false);
 for(let i=0;i<6;i++){clock(c,10+i);assert(accept(m,1,'合金板'));}
 clock(c,16);assert.equal(accept(m,1,'合金板'),false);
 const s=c.sim.byMachine.recipe;
 assert.equal(s.inputs['太空垃圾'],3);
 assert.equal(s.inputs['合金板'],6);
 assert.deepEqual([...s.ingredientQueues['太空垃圾']],['0','0','0']);
 assert.deepEqual([...s.ingredientQueues['合金板']],['1','1','1','1','1','1']);
});
test('recipe consumes first of each ingredient FIFO independently, preserving physical origins',()=>{
 const c=setup();registerRecipe(c);const m=machine('recipe','__ingredients');
 const {accept,step}=start(c,[m],[]);
 clock(c,1);assert(accept(m,0,'太空垃圾'));
 clock(c,2);assert(accept(m,1,'太空垃圾'));
 clock(c,3);assert(accept(m,1,'合金板'));
 clock(c,4);assert(accept(m,1,'合金板'));
 clock(c,5);assert(accept(m,0,'合金板'));
 const s=c.sim.byMachine.recipe;
 assert.deepEqual([...s.ingredientQueues['太空垃圾']],['0','1']);
 assert.deepEqual([...s.ingredientQueues['合金板']],['1','1','0']);
 step(.05);
 assert.equal(s.inputs['太空垃圾'],1);
 assert.equal(s.inputs['合金板'],1);
 assert.deepEqual([...s.ingredientQueues['太空垃圾']],['1']);
 assert.deepEqual([...s.ingredientQueues['合金板']],['0']);
 assert.equal(s.portItems[0]['太空垃圾'],undefined);
 assert.equal(s.portItems[1]['太空垃圾'],1);
 assert.equal(s.portItems[1]['合金板'],undefined);
 assert.equal(s.portItems[0]['合金板'],1);
});
test('merger scanner moves input BELT heads into its only three-item OUTPUT FIFO',()=>{
 const c=setup(),m=machine('merge','汇流');
 const ports=[...vm.runInContext('mergerInputOrder',c)(m)].map(p=>p.index);
 const incoming=ports.map((port,i)=>({
  id:'in'+i,from:{id:'source'+i,port:0},to:{id:'merge',port},
  path:[[2,2],[3,2]]
 }));
 const sources=ports.map((_,i)=>machine('source'+i,'仓出',{item:''}));
 const {step}=start(c,[...sources,m],[...incoming,route('out','merge')]);
 const items=['太空垃圾','合金板','太空垃圾'];
 for(let i=0;i<3;i++)c.sim.routes['in'+i].push({item:items[i],distance:2});
 const s=c.sim.byMachine.merge;s.lastSend[0]=100;
 for(let i=0;i<3;i++)step(.05);
 assert.equal(s.mergerQueue.length,3);
 assert.deepEqual([...s.mergerQueue].map(p=>p.port),ports);
 assert.deepEqual([...s.mergerQueue].map(p=>p.item),items);
 assert.equal(s.sent['太空垃圾']||0,0,'queue must not emit while outlet blocked');
 assert.equal(incoming.every(r=>c.sim.routes[r.id].length===0),true);
 assert.equal(Object.keys(s.portQueues).length,0,'no separate per-input storage');
 assert.equal(Object.values(s.portInputs).reduce((a,b)=>a+b,0),3);
 s.lastSend[0]=-1e6;
 for(let i=0;i<48;i++)step(.05);
 assert.equal(s.mergerQueue.length,0);
 assert.equal(s.sent['太空垃圾'],2);
 assert.equal(s.sent['合金板'],1);
 assert.equal(Object.values(s.inputs).reduce((a,b)=>a+b,0),0);
});
test('merger backpressure holds fourth parcel ON INPUT BELT, never in extra inlet cache',()=>{
 const c=setup(),m=machine('merge','汇流');
 const ports=[...vm.runInContext('mergerInputOrder',c)(m)].map(p=>p.index);
 const incoming=ports.map((port,i)=>({
  id:'in'+i,from:{id:'source'+i,port:0},to:{id:'merge',port},
  path:[[2,2],[3,2]]
 }));
 const sources=ports.map((_,i)=>machine('source'+i,'仓出',{item:''}));
 const {step}=start(c,[...sources,m],[...incoming,route('out','merge')]);
 c.sim.routes.in0.push({item:'太空垃圾',distance:2},{item:'合金板',distance:1});
 c.sim.routes.in1.push({item:'太空垃圾',distance:2});
 c.sim.routes.in2.push({item:'合金板',distance:2});
 const s=c.sim.byMachine.merge;s.lastSend[0]=100;
 for(let i=0;i<30;i++)step(.05);
 assert.equal(s.mergerQueue.length,3);
 assert.equal(c.sim.routes.in0.length,1,'fourth stays on belt under full FIFO');
 assert.equal(Object.keys(s.portQueues).length,0);
 assert.equal(Object.values(s.portInputs).reduce((a,b)=>a+b,0),3);
 s.lastSend[0]=-1e6;
 step(.05);
 assert.equal(s.mergerQueue.length<=3,true);
 assert.equal(s.sent['太空垃圾']||0,1);
 // Now hold output again; the free slot may be filled by the fourth
 // ready belt head, but it can never increase the queue past three.
 s.lastSend[0]=100;
 for(let i=0;i<20;i++)step(.05);
 assert.equal(s.mergerQueue.length,3);
 assert.equal(c.sim.routes.in0.length,0);
 assert.equal(Object.values(s.inputs).reduce((a,b)=>a+b,0),3);
});
test('two warehouse outputs reserve shared stock without double-claiming and debit only on physical send',()=>{
 const c=setup(),a=machine('a','仓出',{item:'太空垃圾'}),b=machine('b','仓出',{item:'太空垃圾'});
 const {step}=start(c,[a,b],[route('out-a','a'),route('out-b','b')]);
 c.sim.routes['out-a'].push({item:'合金板',distance:0});
 c.sim.routes['out-b'].push({item:'合金板',distance:0});
 c.ware={'太空垃圾':3};
 vm.runInContext('ware=data',Object.assign(c,{data:c.ware}));
 step(.05);
 assert.equal(c.sim.byMachine.a.warehouseQueue.length,3);
 assert.equal(c.sim.byMachine.b.warehouseQueue.length,0);
 assert.equal(c.sim.warehouseReserved['太空垃圾'],3);
 assert.equal(c.ware['太空垃圾'],3,'stock remains until actual outbound dispatch');
 assert.equal(c.sim.outbound['太空垃圾']||0,0);
 c.sim.routes['out-a'].length=0;
 step(.05);
 assert.equal(c.ware['太空垃圾'],2);
 assert.equal(c.sim.outbound['太空垃圾'],1);
 assert.equal(c.sim.warehouseReserved['太空垃圾'],2);
 assert.equal(c.sim.byMachine.a.warehouseQueue.length,2);
});
test('warehouse input credits stock immediately, without internal buffering',()=>{
 const c=setup(),m=machine('in','仓入');
 const {accept}=start(c,[m],[]);
 c.ware={};vm.runInContext('ware=data',Object.assign(c,{data:c.ware}));
 assert(accept(m,0,'太空垃圾'));
 assert.equal(c.ware['太空垃圾'],1);
 assert.deepEqual([...c.sim.byMachine.in.warehouseQueue],[]);
 assert.deepEqual([...c.sim.byMachine.in.queue],[]);
 assert.equal(c.sim.inbound['太空垃圾'],1);
});
