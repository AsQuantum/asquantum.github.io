'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function env(){
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},
  document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return{}}}:null}},
  warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const f of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 return c;
}
function node(id,type,x,y,face='E'){return{id,type,x,y,face,mode:0};}
function install(c,machines,routes){
 c.layout={name:'port-queue-regression',machines,routes};
 vm.runInContext('state=layout;resetSimulation()',c);
 c.sim=vm.runInContext('sim',c);
 return {accept:vm.runInContext('acceptItem',c),step:vm.runInContext('simulate',c)};
}
function time(c,t){c.at=t;vm.runInContext('simTime=at',c);}
function order(c,m){return [...vm.runInContext('mergerInputOrder',c)(m)].map(p=>p.index);}
function outputRoute(m){return{id:'out',from:{id:m.id,port:0},to:null,
 path:[[m.x+3,m.y+1],[m.x+4,m.y+1],[m.x+5,m.y+1],[m.x+6,m.y+1],[m.x+7,m.y+1]]};}
test('merger is strictly left -> middle -> right by physical input, even when two inputs have same material',()=>{
 const c=env(),m=node('merge','汇流',10,10),{accept,step}=install(c,[m],[outputRoute(m)]);
 const ports=order(c,m);assert.equal(ports.length,3);
 for(let i=0;i<ports.length;i++)assert.equal(accept(m,ports[i],i===2?'合金板':'太空垃圾'),true);
 const s=c.sim.byMachine.merge,remaining=()=>ports.map(p=>s.portInputs[p]||0);
 const counts=[];
 for(let k=0;k<3;k++){
  const before=remaining(),sent=Object.values(s.sent).reduce((x,y)=>x+y,0);
  let delivered=false;
  for(let t=0;t<50;t++){
   step(.05);
   if(Object.values(s.sent).reduce((x,y)=>x+y,0)>sent){delivered=true;break;}
  }
  assert(delivered,'expected physical output #'+k);
  const after=remaining();
  counts.push(before.findIndex((v,i)=>v>after[i]));
 }
 assert.deepEqual(counts,[0,1,2]);
 assert.equal(s.inputs['太空垃圾'],0);
 assert.equal(s.inputs['合金板'],0);
});
test('splitter has a three-item input FIFO; merger has ONLY a shared three-item output FIFO',()=>{
 const c=env(),sp=node('split','分流',10,10),{accept}=install(c,[sp],[]);
 for(let i=0;i<3;i++){time(c,i+1);assert.equal(accept(sp,0,'太空垃圾'),true);}
 time(c,4);assert.equal(accept(sp,0,'太空垃圾'),false);
 assert.equal(c.sim.byMachine.split.portInputs[0],3);
 assert.deepEqual([...c.sim.byMachine.split.portQueues[0]],['太空垃圾','太空垃圾','太空垃圾']);
 const d=env(),merger=node('m','汇流',10,10),incoming=order(d,merger);
 const m=install(d,[merger],[]);
 for(let i=0;i<3;i++){time(d,i+1);assert.equal(m.accept(merger,incoming[i],'太空垃圾'),true);}
 time(d,4);assert.equal(m.accept(merger,incoming[0],'合金板'),false);
 const state=d.sim.byMachine.m;
 assert.equal(state.mergerQueue.length,3);
 assert.equal(Object.values(state.portInputs).reduce((a,b)=>a+b,0),3);
 assert.equal(Object.keys(state.portQueues).length,0,'no extra per-inlet FIFO caches');
 assert.equal(state.junctionPackets,undefined);
});
test('full splitter: belt delivery fails first, splitter dispatch frees one slot, next tick receives it',()=>{
 const c=env(),source=node('source','仓出',1,10),sp=node('sp','分流',10,10);
 const input={id:'in',from:{id:'source',port:0},to:{id:'sp',port:0},path:[[7,11]]};
 const out={id:'out',from:{id:'sp',port:0},to:null,path:[[13,11],[14,11],[15,11],[16,11],[17,11]]};
 const {accept,step}=install(c,[source,sp],[input,out]);
 const s=c.sim.byMachine.sp;
 for(let i=0;i<3;i++){time(c,i);assert.equal(accept(sp,0,'太空垃圾'),true);}
 assert.equal(s.portInputs[0],3);
 c.sim.routes.in.push({item:'太空垃圾',distance:1});
 time(c,3);
 const receivedBefore=s.received['太空垃圾'];
 step(.05);
 assert.equal(s.portInputs[0],2,'splitter released one buffer slot');
 assert.equal(c.sim.routes.in.length,1,'arriving item stays on belt until next tick');
 assert.equal(s.received['太空垃圾'],receivedBefore,'no same-frame replenishment');
 step(.05);
 assert.equal(c.sim.routes.in.length,0,'next tick fills freed slot');
 assert.equal(s.portInputs[0],3);
 assert.equal(s.received['太空垃圾'],receivedBefore+1);
});
test('input buffers remain separated when only some of a merger’s physical ports are active',()=>{
 const c=env(),m=node('merge','汇流',10,10),{accept,step}=install(c,[m],[outputRoute(m)]);
 const [left,middle,right]=order(c,m),s=c.sim.byMachine.merge;
 time(c,0);assert(accept(m,left,'太空垃圾'));assert(accept(m,right,'合金板'));
 const sent=[];
 for(let k=0;k<2;k++){
  const before=Object.values(s.sent).reduce((a,b)=>a+b,0);
  for(let n=0;n<60;n++){
   step(.05);if(Object.values(s.sent).reduce((a,b)=>a+b,0)>before)break;
  }
  sent.push([s.portInputs[left]||0,s.portInputs[middle]||0,s.portInputs[right]||0]);
 }
 assert.deepEqual(sent,[[0,0,1],[0,0,0]]);
});

test('mixed splitter freezes at mismatched filtered outlet, even if another connected outlet is free',()=>{
 const c=env(),sp=node('sp','分流',20,20);
 const ports=vm.runInContext('getPorts',c)(sp).filter(p=>p.kind==='out');
 sp.outFilters={[ports[1].index]:'合金板'};
 const routes=ports.map(p=>({id:'r'+p.index,from:{id:'sp',port:p.index},to:null,path:[[p.ex,p.ey],[p.ex+({E:1,W:-1,N:0,S:0}[p.side]),p.ey+({E:0,W:0,N:-1,S:1}[p.side])]]}));
 const {accept,step}=install(c,[sp],routes),s=c.sim.byMachine.sp;
 time(c,0);assert(accept(sp,0,'太空垃圾'));
 time(c,1);assert(accept(sp,0,'太空垃圾'));
 time(c,2);assert(accept(sp,0,'合金板'));
 time(c,3);step(.05);
 assert.equal(s.sent['太空垃圾'],1,'first item should pass unfiltered outlet');
 assert.equal(s.roundRobin,1,'next outlet is the filtered outlet');
 assert.deepEqual([...s.portQueues[0]],['太空垃圾','合金板']);
 for(let n=0;n<250;n++)step(.05);
 assert.equal(s.sent['太空垃圾'],1,'cannot skip mismatch and use third outlet');
 assert.equal(s.sent['合金板']||0,0,'cannot bypass blocked queue head');
 assert.deepEqual([...s.portQueues[0]],['太空垃圾','合金板']);
 assert.equal(s.portInputs[0],2);
 assert.equal(s.roundRobin,1,'blocked exit retains the RR cursor');
 assert.equal(c.sim.routes['r'+ports[2].index].length,0);
});
test('filtered output accepts matching head; mixed FIFO order is preserved',()=>{
 const c=env(),sp=node('sp','分流',20,20);
 const ports=vm.runInContext('getPorts',c)(sp).filter(p=>p.kind==='out');
 sp.outFilters={[ports[1].index]:'合金板'};
 const routes=ports.map(p=>({id:'r'+p.index,from:{id:'sp',port:p.index},to:null,path:[[p.ex,p.ey]]}));
 const {accept,step}=install(c,[sp],routes),s=c.sim.byMachine.sp;
 time(c,0);assert(accept(sp,0,'太空垃圾'));
 time(c,1);assert(accept(sp,0,'合金板'));
 time(c,2);step(.05);
 assert.equal(s.sent['太空垃圾'],1);
 step(.05);
 assert.equal(s.sent['合金板'],1,'the second head matches filter');
 assert.equal(s.portInputs[0],0);
 assert.equal(s.roundRobin,2);
});
test('splitter mixed FIFO uses arrival order rather than aggregate material dictionary order',()=>{
 const c=env(),sp=node('sp','分流',20,20);
 const ports=vm.runInContext('getPorts',c)(sp).filter(p=>p.kind==='out');
 const routes=ports.map(p=>({id:'r'+p.index,from:{id:'sp',port:p.index},to:null,path:[[p.ex,p.ey]]}));
 const {accept,step}=install(c,[sp],routes),s=c.sim.byMachine.sp;
 time(c,0);assert(accept(sp,0,'太空垃圾'));
 time(c,1);assert(accept(sp,0,'合金板'));
 time(c,2);assert(accept(sp,0,'太空垃圾'));
 time(c,3);
 const dispatch=[],itemsDispatched=[];
 for(let i=0;i<3;i++){
  const oldHead=s.portQueues[0][0];
  const prior=Object.values(s.sent).reduce((x,y)=>x+y,0);
  for(let tick=0;tick<70;tick++){
   step(.05);
   if(Object.values(s.sent).reduce((x,y)=>x+y,0)>prior)break;
  }
  const sent=ports.find(p=>(c.sim.routes['r'+p.index]||[]).some(x=>x.distance<.051));
  dispatch.push(sent?.index);
  itemsDispatched.push(oldHead);
  assert.equal(s.portQueues[0].length,2-i);
 }
 assert.deepEqual(dispatch,[...ports].map(p=>p.index));
 assert.deepEqual(itemsDispatched,['太空垃圾','合金板','太空垃圾']);
 assert.deepEqual([...s.portQueues[0]],[]);
 assert.equal(s.inputs['太空垃圾']||0,0);
});
