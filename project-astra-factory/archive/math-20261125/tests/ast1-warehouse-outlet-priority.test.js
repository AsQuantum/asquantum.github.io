'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function create(){
 const c=vm.createContext({console,atob,btoa,performance,document:{
  getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}},style:{}}}
 }});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-transitions','engine/simulation','core/compact-json',
  'blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 vm.runInContext('function warehouseRefresh(){} function draw(){} function stockChartReset(){} function recordWarehouseMovement(){}',c);
 return c;
}
test('AST1 one titanium ingot is allocated to game record 48 before record 114',()=>{
 const c=create();
 c.code=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const result=vm.runInContext(
  "state=ast1Decode(code);resetSimulation();"+
  "var model=steadyQueueCompile(state),exact=steadyQueueInitial(model,{warehouse:{'钛合金锭':1}});"+
  "ware['钛合金锭']=1;simulate(0.05);steadyQueueStep(model,exact);"+
  "({first:sim.byMachine.M48.sent['钛合金锭']||0,"+
  "second:sim.byMachine.M114.sent['钛合金锭']||0,"+
  "proofFirst:exact.counters.routeSent['R12|钛合金锭']||0n,"+
  "proofSecond:exact.counters.routeSent['R83|钛合金锭']||0n,"+
  "stock:ware['钛合金锭'],proofStock:steadyQueueStockTotal(model,exact,'钛合金锭')})",c);
 assert.equal(result.first,1);
 assert.equal(result.second,0);
 assert.equal(result.proofFirst,1n);
 assert.equal(result.proofSecond,0n);
 assert.equal(result.stock,0);
 assert.equal(result.proofStock,0n);
});
test('recycled warehouse stock may be monopolized indefinitely by first outlet, not fairly split',()=>{
 const c=create();
 c.layout={name:'Two outlets',machines:[
  {id:'M0',type:'仓出',item:'钛合金锭',x:1,y:1,face:'E'},
  {id:'M1',type:'仓出',item:'钛合金锭',x:1,y:15,face:'E'},
  {id:'M2',type:'仓入',x:15,y:1,face:'E'},
  {id:'M3',type:'仓入',x:15,y:15,face:'E'}
 ],routes:[
  {id:'r0',from:{id:'M0',port:0},to:{id:'M2',port:0},path:[[7,3]]},
  {id:'r1',from:{id:'M1',port:0},to:{id:'M3',port:0},path:[[7,18]]}
 ]};
 const result=vm.runInContext(
  "state=layout;checkPath=()=>null;resetSimulation();ware['钛合金锭']=1;"+
  "var model=steadyQueueCompile(state),exact=steadyQueueInitial(model,{warehouse:{'钛合金锭':1}});"+
  "for(let i=0;i<200;i++){simulate(0.05);steadyQueueStep(model,exact);}"+
  "({first:sim.byMachine.M0.sent['钛合金锭']||0,"+
  "second:sim.byMachine.M1.sent['钛合金锭']||0,"+
  "proofFirst:exact.counters.routeSent['r0|钛合金锭']||0n,"+
  "proofSecond:exact.counters.routeSent['r1|钛合金锭']||0n})",c);
 assert(result.first>1,'first outlet repeatedly reclaims stock');
 assert.equal(result.second,0);
 assert.equal(result.proofFirst,BigInt(result.first));
 assert.equal(result.proofSecond,0n);
});
