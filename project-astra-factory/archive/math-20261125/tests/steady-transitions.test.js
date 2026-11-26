'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env({withSimulator=false}={}){
 const c=vm.createContext({console,atob,btoa,performance,document:{
  hidden:false,getElementById(){return {getContext(){return{}}}}},requestAnimationFrame(){}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state',
  'core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-transitions',
  ...(withSimulator?['engine/simulation']:[]),
  'core/compact-json','blueprints/ast1-codec']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 }
 vm.runInContext('function warehouseRefresh(){} function draw(){} function stockChartReset(){} function recordWarehouseMovement(){}',c);
 return c;
}
function srcMachine(id,output,seconds=1,qty=1){
 return {id,type:'__test_source',mode:'run',x:0,y:0,face:'E',output,seconds,qty};
}
function putSourceDefs(c){
 vm.runInContext("DEF.__test_source={name:'源',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'A',qty:1,seconds:1,inputs:{}}}};DEF.__assembler={name:'装配',w:3,h:3,ins:2,outs:1,recipes:{run:{output:'C',qty:1,seconds:1,inputs:{A:1,B:1}}}};DEF.__sourceB={name:'B源',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'B',qty:1,seconds:1,inputs:{}}}};DEF.__sourceA={name:'A源',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'A',qty:1,seconds:2,inputs:{}}}}",c);
 c.route=(id,from,to,fromPort=0,toPort=0,length=1)=>({
  id,from:{id:from,port:fromPort},to:to?{id:to,port:toPort}:null,
  path:Array.from({length},(_,i)=>[10+i,10])
 });
 c.machine=(id,type)=>({id,type,x:0,y:0,face:'E',mode:'run',
  ...(type==='仓出'?{item:'A'}:{})});
}
function setup(c,machines,routes,initialWarehouse={}){
 c.layout={machines,routes};
 c.initialWarehouse=initialWarehouse;
 return vm.runInContext('checkPath=()=>null;state=layout;steadyQueueCompile(state)',c);
}
const read=(c,expr)=>vm.runInContext(expr,c);
const ratio=(text)=>text==='0'?0:text.includes('/')?Number(text.split('/')[0])/Number(text.split('/')[1]):Number(text);
test('compiler represents warehouse, recipes and belts with one uniform exact transition model',()=>{
 const c=env();putSourceDefs(c);
 const m=setup(c,[c.machine('source','__test_source'),c.machine('in','仓入')],
  [c.route('r','source','in')]);
 assert.equal(m.tickSeconds,'1/20');
 assert.equal(m.machines.length,2);
 assert.equal(m.routes[0].lengthTenths,10);
 assert.equal(m.machines[0].recipe.durationTicks,20);
 assert.equal(m.machines[0].recipe.capacity,20);
});
test('infinite warehouse stock growth is certified by a repeated control state with safe positive drift',()=>{
 const c=env();putSourceDefs(c);
 setup(c,[c.machine('source','__test_source'),c.machine('in','仓入')],
  [c.route('r','source','in')]);
 const result=read(c,'steadyQueueProve(steadyQueueCompile(state),{maxTicks:250})');
 assert.equal(result.certified,true);
 assert.equal(result.method,'repeatable finite control state with nonnegative stock drift and no altered stock-empty guard');
 assert.equal(result.ratesPerSecond.crafts.A,'1');
 assert.equal(result.warehouseNetPerSecond.A,'1');
 assert(Number(result.inventoryIncreasePerPeriod.A)>0);
});
test('zero-start closed warehouse-out/in loop has exact zero-output periodic proof',()=>{
 const c=env();putSourceDefs(c);
 setup(c,[c.machine('out','仓出'),c.machine('in','仓入')],
  [c.route('loop','out','in')]);
 const result=read(c,'steadyQueueProve(steadyQueueCompile(state),{maxTicks:100})');
 assert.equal(result.certified,true);
 assert.deepEqual(Object.keys(result.ratesPerSecond.warehouseOut),[]);
 assert.deepEqual(Object.keys(result.warehouseNetPerSecond),[]);
});
test('finite seeded warehouse-out/in loop recycles its stock and admits exact periodic rates',()=>{
 const c=env();putSourceDefs(c);
 setup(c,[c.machine('out','仓出'),c.machine('in','仓入')],
  [c.route('loop','out','in')]);
 const result=read(c,"steadyQueueProve(steadyQueueCompile(state),{initialWarehouse:{A:3},maxTicks:500})");
 assert.equal(result.certified,true);
 assert.equal(result.warehouseNetPerSecond.A,'0');
 assert.equal(result.ratesPerSecond.warehouseOut.A,'1');
 assert.equal(result.ratesPerSecond.warehouseIn.A,'1');
});
test('mixed demand from a slower A supply backpressures an otherwise faster B output, without inventing FIFO equilibrium',()=>{
 const c=env();putSourceDefs(c);
 const machines=[
  c.machine('sourceA','__sourceA'),c.machine('sourceB','__sourceB'),
  c.machine('assem','__assembler'),c.machine('stockC','仓入')
 ];
 const routes=[
  c.route('a','sourceA','assem',0,0),
  c.route('b','sourceB','assem',0,1),
  c.route('c','assem','stockC')
 ];
 setup(c,machines,routes);
 const result=read(c,'steadyQueueProve(steadyQueueCompile(state),{maxTicks:4000,maxStates:4000})');
 assert.equal(result.certified,true,JSON.stringify(result));
 assert.equal(result.ratesPerSecond.cycles.assem,'1/2');
 assert.equal(result.warehouseNetPerSecond.C,'1/2');
 assert.equal(result.ratesPerSecond.routeSent['b|B'],'1/2');
 assert.equal(result.ratesPerSecond.routeSent['a|A'],'1/2');
});
test('a filtered splitter with incompatible selected exit can block even though another output accepts item',()=>{
 const c=env();putSourceDefs(c);
 const sp=c.machine('split','分流');sp.outFilters={0:'B'};
 const machines=[
  c.machine('source','__test_source'),sp,
  c.machine('store0','仓入'),c.machine('store1','仓入')
 ];
 const routes=[
  c.route('input','source','split',0,0),
  c.route('blocked','split','store0',0,0),
  c.route('other','split','store1',1,0)
 ];
 setup(c,machines,routes);
 const result=read(c,'steadyQueueProve(steadyQueueCompile(state),{maxTicks:1500,maxStates:1500})');
 assert.equal(result.certified,true,JSON.stringify(result));
 assert.equal(result.ratesPerSecond.routeSent?.['other|A'],undefined);
 assert.equal(result.ratesPerSecond.warehouseIn?.A,undefined);
});
test('full AST1 can be compiled without simplifying its 115 machines or 84 physical belts',()=>{
 const c=env();putSourceDefs(c);
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const value=read(c,'state=ast1Decode(fixture);steadyQueueSummary(steadyQueueCompile(state))');
 assert.equal(value.machines,115);
 assert.equal(value.belts,84);
 assert.equal(value.limitedQueues,145);
 assert.equal(value.byKind.recipe,49);
 assert.equal(value.byKind.merger,3);
 assert.equal(value.byKind['stock-out'],8);
});
test('AST1 bounded state search never presents its observations as an exact rate without a periodic proof',()=>{
 const c=env();putSourceDefs(c);
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const value=read(c,'state=ast1Decode(fixture);steadyQueueProve(steadyQueueCompile(state),{maxTicks:120,maxStates:120})');
 assert.equal(value.certified,false);
 assert.equal(value.checkedTicks,120);
 assert.equal(value.ratesPerSecond,undefined);
 assert.match(value.warning,/No steady rate is asserted/);
});
