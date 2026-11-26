'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../../..');
function run(n,specs,lengths){
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return{}}}:null}},warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const f of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 c.specs=specs;c.lengths=lengths;c.n=n;
 return JSON.parse(vm.runInContext(`(()=>{
  const machines=[],routes=[];
  for(let i=0;i<n;i++){
   const [qty,seconds]=specs[i],item='k'+i,type='test'+i;
   DEF[type]={w:5,h:5,ins:0,outs:1,recipes:{run:{inputs:{},output:item,qty,seconds}}};
   machines.push({id:'s'+i,type,mode:'run',x:5,y:5+i*9,face:'E'});
   routes.push({id:'r'+i,from:{id:'s'+i,port:0},to:{id:'m',port:i},path:Array.from({length:lengths[i]},(_,j)=>[j+1,10+i])});
  }
  machines.push({id:'m',type:'汇流',x:25,y:10,face:'E'},{id:'w',type:'仓入',x:45,y:10,face:'E'});
  routes.push({id:'out',from:{id:'m',port:0},to:{id:'w',port:0},path:[[28,11],[29,11],[30,11]]});
  state={machines,routes};resetSimulation();
  // Test-only long interval: this is independent validation, not a proof
  // input and never used to derive a rate. Different path lengths shift phases.
  simulateBatchSteps(12000,.05);
  const before={...sim.byMachine.m.sent};
  simulateBatchSteps(12000,.05);
  return JSON.stringify(Object.fromEntries(Array.from({length:n},(_,i)=>['k'+i,(sim.byMachine.m.sent['k'+i]||0)-(before['k'+i]||0)])));
 })()`,c));
}
const report=[];
for(const [n,specs,lens,expected] of [
 [1,[[3,3]],[17],[600]],
 [2,[[3,3],[1,1]],[1,23],[300,300]],
 [3,[[3,3],[2,1.5],[1,1]],[5,20,1],[200,200,200]],
 [3,[[3,3],[1,1],[1,10]],[23,1,8],[270,270,60]]
]){
 const r=run(n,specs,lens);
 for(let i=0;i<n;i++)assert(Math.abs(r['k'+i]-expected[i])<=1,JSON.stringify({r,expected}));
 report.push({n,counts:r,expected});
}
console.log(JSON.stringify(report));

// Independently validate two merges in series. The first merger is
// backpressured by the second, which still has one free output.
{
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return{}}}:null}},warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const f of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 const result=JSON.parse(vm.runInContext(`(()=>{
  const machines=[],routes=[];
  function edge(id,from,to,port,length){routes.push({id,from:{id:from,port:0},to:{id:to,port},path:Array.from({length},(_,i)=>[i+1,10])});}
  for(let i=0;i<3;i++){
   const type='test'+i,item='k'+i;
   DEF[type]={w:5,h:5,ins:0,outs:1,recipes:{run:{inputs:{},output:item,qty:1,seconds:1}}};
   machines.push({id:'s'+i,type,mode:'run',x:5,y:5+i*9,face:'E'});
  }
  machines.push({id:'a',type:'汇流',x:25,y:5,face:'E'},{id:'b',type:'汇流',x:35,y:15,face:'E'},{id:'w',type:'仓入',x:50,y:15,face:'E'});
  edge('a0','s0','a',0,17);edge('a1','s1','a',1,1);edge('mid','a','b',0,4);edge('b1','s2','b',1,9);edge('out','b','w',0,3);
  state={machines,routes};resetSimulation();simulateBatchSteps(12000,.05);
  const before={...sim.byMachine.b.sent};simulateBatchSteps(12000,.05);
  return JSON.stringify(['k0','k1','k2'].map(k=>(sim.byMachine.b.sent[k]||0)-(before[k]||0)));
 })()`,c));
 for(let i=0;i<3;i++)assert(Math.abs(result[i]-[150,150,300][i])<=1,JSON.stringify(result));
 console.log('cascade independent validation:',JSON.stringify(result));
}

{
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return{}}}:null}},warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const f of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 const result=JSON.parse(vm.runInContext(`(()=>{
  DEF.testSource={w:5,h:5,ins:0,outs:1,recipes:{run:{inputs:{},output:'小行星矿石',qty:1,seconds:1}}};
  DEF.testA={w:5,h:5,ins:1,outs:1,recipes:{run:{inputs:{'小行星矿石':2},output:'钛合金锭',qty:1,seconds:2}}};
  DEF.testB={w:5,h:5,ins:1,outs:1,recipes:{run:{inputs:{'钛合金锭':1},output:'齿轮组',qty:1,seconds:1}}};
  const machines=[
   {id:'s',type:'testSource',mode:'run',x:2,y:5,face:'E'},
   {id:'sp',type:'分流',x:15,y:5,face:'E'},
   {id:'a',type:'testA',mode:'run',x:25,y:5,face:'E'},
   {id:'b',type:'testB',mode:'run',x:40,y:5,face:'E'},
   {id:'w',type:'仓入',x:55,y:5,face:'E'},
   {id:'w2',type:'仓入',x:25,y:22,face:'E'}];
  const routes=[];
  function edge(id,from,to,length,port=0){routes.push({id,from:{id:from,port},to:{id:to,port:0},path:Array.from({length},(_,i)=>[i+1,10])});}
  edge('root','s','sp',3);edge('branch','sp','a',3);edge('side','sp','w2',3,1);edge('ab','a','b',3);edge('out','b','w',3);
  state={machines,routes};resetSimulation();simulateBatchSteps(12000,.05);
  const before={...sim.inbound};simulateBatchSteps(12000,.05);
  return JSON.stringify({ore:(sim.inbound['小行星矿石']||0)-(before['小行星矿石']||0),gear:(sim.inbound['齿轮组']||0)-(before['齿轮组']||0)});
 })()`,c));
 assert(Math.abs(result.ore-300)<=1&&Math.abs(result.gear-150)<=1,JSON.stringify(result));
 console.log('reverse transforming recipe chain independent validation:',JSON.stringify(result));
}

{
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return{}}}:null}},warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const f of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 const result=JSON.parse(vm.runInContext(`(()=>{
  const machines=[{id:'s',type:'垃圾',mode:0,x:2,y:5,face:'E'},{id:'a',type:'废料',mode:'标准',x:15,y:5,face:'E'},{id:'x',type:'电脑',x:35,y:5,face:'E'}];
  const routes=[{id:'a',from:{id:'s',port:0},to:{id:'a',port:0},path:Array.from({length:4},(_,i)=>[i+1,10])},{id:'b',from:{id:'a',port:0},to:{id:'x',port:0},path:Array.from({length:3},(_,i)=>[i+1,20])}];
  state={machines,routes};resetSimulation();simulateBatchSteps(12000,.05);const before=sim.consumed['废金属']||0;simulateBatchSteps(12000,.05);
  return JSON.stringify({destroyed:(sim.consumed['废金属']||0)-before,stock:ware['废金属']||0});
 })()`,c));
 assert.equal(result.destroyed,400);assert.equal(result.stock,0);console.log('independent destroy terminal:',JSON.stringify(result));
}
