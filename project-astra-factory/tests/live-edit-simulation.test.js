'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,materialColor:()=>"#fff",document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit',
  'engine/steady-flow','engine/steady-equations','engine/steady-algebra','engine/steady-generic-network',
  'engine/steady-machine-graph','engine/steady-rate-region','engine/steady-auto-fluid','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 return c;
}
const run=(c,s)=>vm.runInContext(s,c);
const m=(id,type,mode=0,extra={})=>({id,type,mode,x:0,y:0,face:'E',...extra});
const r=(id,from,to,out=0,input=0)=>({id,from:{id:from,port:out},to:{id:to,port:input},path:[[0,0]]});
function setup(c,ms,rs){
 c.layout={machines:ms,routes:rs};
 run(c,'state=layout;checkPath=()=>null;DEF.__slow={w:3,h:3,ins:0,outs:1,recipes:{run:{output:"合金板",qty:1,seconds:5,inputs:{}}}};DEF.__source={w:3,h:3,ins:0,outs:1,recipes:{run:{output:"合金板",qty:1,seconds:1,inputs:{}}}};DEF.__need={w:3,h:3,ins:1,outs:1,recipes:{run:{output:"硅晶圆",qty:1,seconds:5,inputs:{"合金板":1}}}};DEF.__multi={w:3,h:3,ins:2,outs:1,recipes:{run:{output:"硅晶圆",qty:1,seconds:2,inputs:{"合金板":2,"星尘粒子":1}}}}');
}
function solve(c,ms,rs){
 setup(c,ms,rs);return run(c,'factorySteadyAutomaticFluidBudget()');
}

function live(){
 const c=env();
 Object.assign(c,{document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}},style:{}}}},requestAnimationFrame(){},localStorage:{setItem(){},getItem(){return null}}});
 for(const f of ['ui/warehouse','engine/simulation','core/editor','core/layout-io'])
 vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 run(c,"warehouseRefresh=()=>{};function draw(){};notify=()=>{};function stockChartReset(){}function refresh(){}function saveCurrentScheme(){}function updateGroupControls(){}function clearGroupSelection(){}");
 return c;
}
test('editing an indexed layout preserves surviving queues, clock, history and reservations',()=>{
 const c=live();
 const x=run(c,"(()=>{state={name:'live',recordIndexed:true,machines:[{id:'M0',type:'垃圾',x:1,y:1,face:'E',mode:0},{id:'M1',type:'仓出',x:20,y:1,face:'E',item:'合金板'},{id:'M2',type:'仓入',x:35,y:1,face:'E'}],routes:[{id:'R0',from:{id:'M1',port:0},to:{id:'M2',port:0},path:[[25,3],[26,3],[27,3]]}]};resetSimulation();simTime=7200;running=true;ware={'合金板':20};sim.byMachine.M1.warehouseQueue=['合金板','合金板'];sim.warehouseReserved={'合金板':2};sim.byMachine.M1.sent={'合金板':17};sim.routes.R0=[{item:'合金板',distance:1}];sim.minuteBuckets[119]={inbound:{'合金板':2},outbound:{'合金板':1}};sim.inbound={'合金板':11};theoreticalBudget={old:true};removeMachine('M0');return {time:simTime,running,stock:ware['合金板'],id:state.machines[0].id,queue:sim.byMachine.M0.warehouseQueue,sent:sim.byMachine.M0.sent,packets:sim.routes.R0,reserved:sim.warehouseReserved['合金板'],history:sim.minuteBuckets[119],invalidated:theoreticalBudget===null};})()");
 assert.equal(x.time,7200);assert.equal(x.running,true);assert.equal(x.stock,20);assert.equal(x.id,'M0');assert.equal(x.queue.length,2);assert.equal(x.sent['合金板'],17);assert.equal(x.packets[0].distance,1);assert.equal(x.reserved,2);assert.equal(x.history.outbound['合金板'],1);assert(x.invalidated);
 const y=run(c,"(()=>{deleteRoute('R0');return [simTime,ware['合金板'],sim.byMachine.M0.warehouseQueue.length,sim.warehouseReserved['合金板']||0]})()");
 assert.deepEqual([...y],[7200,20,0,0]);
 const z=run(c,"(()=>{state={name:'new',machines:[],routes:[]};afterChange('load',{resetRuntime:true});return [simTime,running,Object.keys(ware).length]})()");
 assert.deepEqual([...z],[0,false,0]);
});
test('potential net uses the current demand snapshot and retains all positive net rates',()=>{
 const c=env();c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const a=run(c,'state=ast1Decode(ast);factorySteadyAutomaticFluidBudget()');
 assert.equal(a.status,'conditional-fixed-point');assert.equal(a.fractions.potentialNet['钛合金锭'],'3/20');assert.equal(a.fractions.potentialNet['合金板'],'-8/45');assert.equal(a.fractions.potentialNet['导线线圈'],'-1/10');
 for(const item of Object.keys(a.inflow))if(a.inflow[item]-a.outflow[item]>1e-9)assert(Math.abs(a.potentialNet[item]-(a.inflow[item]-a.outflow[item]))<1e-9,item);
});
test('empty warehouse can have nonzero downstream withdrawal demand',()=>{
 const c=env();setup(c,[m('M0','仓出',0,{item:'合金板'}),m('M1','仓入')],[r('R0','M0','M1')]);
 const a=run(c,'factorySteadyAutomaticFluidBudget()');
 assert.equal(a.status,'conditional-fixed-point');assert.equal(a.fractions.outflow['合金板'],'0');assert.equal(a.fractions.withdrawalDemand['合金板'],'1');assert.equal(a.fractions.potentialNet['合金板'],'-1');
});
test('known and imported unknown item IDs are numerically ordered',()=>{
 const c=env();const x=run(c,"({ids:MATERIALS.map(ast1ItemNumber),unknown:['硅晶圆','物品#12','古代芯片','物品#500'].sort(factoryItemCompare).map(ast1ItemNumber)})");
 assert.deepEqual([...x.ids],[...x.ids].sort((a,b)=>a-b));assert.deepEqual([...x.unknown],[1,12,446,500]);
});

test('overdraft equilibrium is independent of constrained rates and current demand snapshot',()=>{
 const c=env();c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const b=run(c,'state=ast1Decode(ast);warehouseTheory()');
 assert.equal(b.conditionalBudget.warehouseSupply,'constrained');
 assert.equal(b.unlimitedStockBudget.warehouseSupply,'unlimited');
 assert.equal(b.conditionalBudget.fractions.potentialNet['合金板'],'-8/45');
 assert.equal(b.unlimitedStockBudget.fractions.inflow['合金板'],'2/3');
 assert.equal(b.unlimitedStockBudget.fractions.outflow['合金板'],'4/3');
 assert(Math.abs(b.overdraftNet['合金板']*60+40)<1e-9);
 assert(Math.abs(b.overdraftNet['钛合金锭']*60+34)<1e-9);
 assert.equal(b.conditionalBudget.fractions.machineCycles.M24,'11/180');
 assert.equal(b.diagnostics.certified,false);
});
test('canvas reads the same constrained fixed point as the ledger, not the overdraft budget',()=>{
 const c=env();c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const x=run(c,"(()=>{state=ast1Decode(ast);theoreticalBudget=warehouseTheory();return {period:timeLabel(machineById('M24')),outlet:warehouseOutletTimeLabel(machineById('M114')),labels:state.machines.filter(m=>getRecipe(m)||m.type==='仓出').map(m=>getRecipe(m)?timeLabel(m):warehouseOutletTimeLabel(m)),theory:machineSteadyPanel(machineById('M24'))}})()");
 assert.equal(x.period,'6s(16.36s)');assert.equal(x.outlet,'1s(5.45s)');
 assert(x.labels.every(x=>!x.includes('待证明')));
 assert(x.theory.includes('条件解'));assert(x.theory.includes('machine-duty-grid'));
});
test('unlimited warehouse can supply an otherwise starved producer without changing constrained result',()=>{
 const c=env();setup(c,[m('out','仓出',0,{item:'合金板'}),m('make','__need','run'),m('wh','仓入')],[r('s','out','make'),r('p','make','wh')]);
 const b=run(c,'warehouseTheory()');
 assert.equal(b.conditionalBudget.fractions.machineCycles.make,'0');
 assert.equal(b.unlimitedStockBudget.fractions.machineCycles.make,'1/5');
 assert(Math.abs(b.overdraftNet['合金板']+1/5)<1e-9);
 assert(Math.abs(b.overdraftNet['硅晶圆']-1/5)<1e-9);
});
