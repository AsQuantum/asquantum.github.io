'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
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

function liveModel(c){
 Object.assign(c,{requestAnimationFrame(){},document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}},style:{}}}}});
 for(const f of ['ui/warehouse','engine/simulation'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 run(c,"warehouseRefresh=()=>{};function draw(){};function stockChartReset(){};function notify(){}");
}
function simulateCase(name,ms,rs){
 const c=env();setup(c,ms,rs);liveModel(c);
 const budget=run(c,'warehouseTheory()');
 assert.equal(budget.status,'conditional-fixed-point',JSON.stringify(budget.conditionalBudget));
 const theory=budget.conditionalBudget;
 // Abstract test graph: geometry checking is deliberately bypassed by
 // setup. Transport, FIFO, port timings and reservation transitions are
 // the original production simulator. Full geometry is covered by AST1.
 run(c,'resetSimulation();for(let i=0;i<24000;i++)simulate(.05);');
 const snapshot=()=>JSON.parse(run(c,"JSON.stringify({inbound:sim.inbound,outbound:sim.outbound,machines:sim.byMachine})"));
 const start=snapshot();
 run(c,'for(let i=0;i<72000;i++)simulate(.05)');
 const end=snapshot(),checks=[];
 function compare(label,expected,actual){
  const error=Math.abs(expected-actual);
  checks.push({label,expected,actual,error});
 }
 for(const [direction,key] of [['inflow','inbound'],['outflow','outbound']]){
  for(const item of new Set([...Object.keys(theory[direction]),...Object.keys(end[key])])){
   compare(direction+':'+item,60*(theory[direction][item]||0),((end[key][item]||0)-(start[key][item]||0))/60);
  }
 }
 // Compare each machine's input and output independently, including
 // withdrawal priority, every separate warehouse terminal, and loop trunk.
 for(const machine of ms){
  for(const [side,field] of [['from','sent'],['to','received']]){
   const expected={};
   for(const route of rs.filter(r=>r[side]?.id===machine.id))
    for(const [item,rate] of Object.entries(theory.routeFlows[route.id]||{}))
     expected[item]=(expected[item]||0)+rate*60;
   for(const item of new Set([...Object.keys(expected),...Object.keys(end.machines[machine.id][field]||{})])){
    const n=((end.machines[machine.id][field][item]||0)-(start.machines[machine.id][field][item]||0))/60;
    compare(machine.id+':'+field+':'+item,expected[item]||0,n);
   }
  }
 }
 // Compare every timed producer's output, not only the net inventory.
 for(const machine of ms){
  c.id=machine.id;const recipe=run(c,'getRecipe(machineById(id))');
  if(!recipe)continue;
  const item=recipe.output,expected=60*(theory.machineCycles[machine.id]||0)*recipe.qty;
  compare(machine.id+':'+item,expected,((end.machines[machine.id].sent[item]||0)-(start.machines[machine.id].sent[item]||0))/60);
 }
 const max=Math.max(0,...checks.map(x=>x.error));
 console.log(JSON.stringify({name,maxErrorPerMinute:max,checks:checks.map(x=>[x.label,+x.expected.toFixed(5),+x.actual.toFixed(5)])}));
 assert(max<=.051,name+' > 3 items per hour discrepancy: '+JSON.stringify(checks.filter(x=>x.error>.051)));
}
test('simulator: unequal splitter demand',()=>simulateCase('split-demand',
 [m('M0','__source','run'),m('M1','分流'),m('M2','__need','run'),m('M3','仓入')],
 [r('i','M0','M1'),r('slow','M1','M2',0),r('fast','M1','M3',1),r('out','M2','M3',0,1)]));
test('simulator: independent multi-ingredient backpressure',()=>simulateCase('multi-ingredient',
 [m('M0','__slow','run'),m('M1','粒子'),m('M2','__multi','run'),m('M3','仓入')],
 [r('a','M0','M2'),r('b','M1','M2',0,1),r('o','M2','M3')]));
test('simulator: nested splitters',()=>simulateCase('nested-split',
 [m('M0','__source','run'),m('M1','分流'),m('M2','分流'),m('M3','仓入'),m('M4','仓入'),m('M5','仓入')],
 [r('i','M0','M1'),r('direct','M1','M3',0),r('next','M1','M2',1),r('n1','M2','M4',0),r('n2','M2','M5',1)]));
test('simulator: mixed merger tail',()=>simulateCase('mixed-merge',
 [m('M0','__source','run'),m('M1','粒子'),m('M2','汇流'),m('M3','仓入')],
 [r('a','M0','M2'),r('b','M1','M2',0,1),r('o','M2','M3')]));
test('simulator: shared warehouse priority with unequal downstream demand',()=>simulateCase('warehouse-priority',
 [m('M0','__source','run'),m('M1','仓入'),m('M2','仓出',0,{item:'合金板'}),m('M3','仓出',0,{item:'合金板'}),m('M4','__need','run'),m('M5','电脑')],
 [r('deposit','M0','M1'),r('first','M2','M4'),r('second','M3','M5'),r('product','M4','M1',0,1)]));
test('simulator: physical recirculation',()=>simulateCase('physical-cycle',
 [m('M0','__source','run'),m('M1','汇流'),m('M2','分流'),m('M3','仓入')],
 [r('input','M0','M1'),r('trunk','M1','M2'),r('back','M2','M1',0,1),r('output','M2','M3',1)]));
