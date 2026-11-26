'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/math/arithmetic/rational','engine/steady-flow','engine/simulation'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 vm.runInContext("function warehouseRefresh(){} function draw(){} function stockChartReset(){} function recordWarehouseMovement(){};checkPath=()=>null;",c);
 return c;
}
const run=(c,s)=>vm.runInContext(s,c);
test('same-tick ordinary recipe input priority is game-right-to-left, including rotated and AST1 mirrored machines',()=>{
 const c=env();
 for(const face of ['E','N','W','S'])for(const mirrored of [false,true])for(const reversed of [false,true]){
  c.face=face;c.mirrored=mirrored;c.reversed=reversed;
  const result=run(c,`(()=>{
   const base={id:'r',type:'冶炼',mode:'钛合金锭',face,x:20,y:10};
   const m=mirrored?ast1MirrorMachine(base):base;
   const expected=face==='E'||face==='N'?1:0,other=1-expected;
   const item='小行星矿石',routes=[{id:'a',from:{id:'s0',port:0},to:{id:'r',port:0},path:[[0,0]]},{id:'b',from:{id:'s1',port:0},to:{id:'r',port:1},path:[[0,0]]}];
   state={machines:[{id:'s0',type:'采矿',mode:0,face:'E',x:0,y:0},{id:'s1',type:'采矿',mode:0,face:'E',x:0,y:10},m],routes:reversed?routes.reverse():routes};
   resetSimulation();
   const s=sim.byMachine.r;s.inputs[item]=8;s.ingredientQueues[item]=Array(8).fill('0');s.portItems[0]={[item]:8};
   s.busy=1;
   for(const r of routes)sim.routes[r.id]=[{item,distance:1}];
   simulate(.05);
   const right=routes.find(r=>r.to.port===expected).id,left=routes.find(r=>r.to.port===other).id;
   return {priority:machineInputPriority(m).map(p=>p.index),expected,rightAccepted:sim.routes[right].length===0,leftBlocked:sim.routes[left].length===1,cache:s.inputs[item]};
  })()`);
  assert.equal(result.priority[0],result.expected,JSON.stringify({face,mirrored,reversed,result}));
  assert(result.rightAccepted&&result.leftBlocked,JSON.stringify(result));
  assert.equal(result.cache,9);
 }
});
test('ready left input can take the free slot when right input is not ready or is cooling down',()=>{
 const c=env();
 for(const cooling of [false,true]){
  c.cooling=cooling;
  const result=run(c,`(()=>{
   const item='小行星矿石',m={id:'r',type:'冶炼',mode:'钛合金锭',x:15,y:10,face:'E'};
   const a={id:'a',from:{id:'a',port:0},to:{id:'r',port:0},path:[[0,0]]},b={id:'b',from:{id:'b',port:0},to:{id:'r',port:1},path:[[0,0]]};
   state={machines:[{id:'a',type:'采矿',mode:0,x:0,y:0,face:'E'},{id:'b',type:'采矿',mode:0,x:0,y:10,face:'E'},m],routes:[b,a]};
   resetSimulation();
   const s=sim.byMachine.r;s.inputs[item]=8;s.ingredientQueues[item]=Array(8).fill('0');s.portItems[0]={[item]:8};s.busy=1;
   sim.routes.a=[{item,distance:1}];sim.routes.b=[{item,distance:cooling?1:0}];
   if(cooling)s.lastReceive[1]=0;
   simulate(.05);
   return {left:sim.routes.a.length,right:sim.routes.b.length,cache:s.inputs[item]};
  })()`);
  assert.equal(result.left,0);assert.equal(result.right,1);assert.equal(result.cache,9);
 }
});
