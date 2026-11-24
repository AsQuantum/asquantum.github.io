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
test('a source feeding a low-demand recipe and independent warehouse branch rebalances automatically',()=>{
 const c=env();
 const b=solve(c,[m('source','__source','run'),m('split','分流'),m('recipe','__need','run'),m('store','仓入')],
 [r('input','source','split'),r('slow','split','recipe',0),r('fast','split','store',1),r('product','recipe','store',0,1)]);
 assert.equal(b.status,'conditional-fixed-point',JSON.stringify(b));
 assert.equal(b.fractions.routes.slow['合金板'],'1/5');
 assert.equal(b.fractions.routes.fast['合金板'],'4/5');
 assert.equal(b.fractions.inflow['硅晶圆'],'1/5');
 assert.equal(b.actualLongRunRatesSolved,false);
});
test('automatic multi-ingredient recipe bottleneck is propagated to both independent sources',()=>{
 const c=env();
 const b=solve(c,[m('a','__slow','run'),m('b','粒子'),m('recipe','__multi','run'),m('store','仓入')],
 [r('a','a','recipe'),r('b','b','recipe',0,1),r('out','recipe','store')]);
 assert.equal(b.status,'conditional-fixed-point',JSON.stringify(b));
 assert.equal(b.fractions.machineCycles.recipe,'1/10');
 assert.equal(b.fractions.routes.a['合金板'],'1/5');
 assert.equal(b.fractions.routes.b['星尘粒子'],'1/10');
});
test('multi-level splitters use local rather than global fairness',()=>{
 const c=env();
 const b=solve(c,[m('source','__source','run'),m('s1','分流'),m('s2','分流'),m('wh','仓入')],
 [r('input','source','s1'),r('direct','s1','wh',0,0),r('nested','s1','s2',1),r('n1','s2','wh',0,1),r('n2','s2','wh',1,2)]);
 assert.equal(b.status,'conditional-fixed-point',JSON.stringify(b));
 assert.equal(b.fractions.routes.direct['合金板'],'1/2');
 assert.equal(b.fractions.routes.n1['合金板'],'1/4');
 assert.equal(b.fractions.routes.n2['合金板'],'1/4');
});
test('a physical merger/splitter return loop is solved simultaneously',()=>{
 const c=env();
 const b=solve(c,[m('source','__source','run'),m('merge','汇流'),m('split','分流'),m('wh','仓入')],
 [r('in','source','merge',0,0),r('trunk','merge','split'),r('return','split','merge',0,1),r('deposit','split','wh',1)]);
 assert.equal(b.status,'conditional-fixed-point',JSON.stringify(b));
 for(const id of ['in','return','deposit'])assert.equal(b.fractions.routes[id]['合金板'],'1/2');
 assert.equal(b.fractions.routes.trunk['合金板'],'1');
});
test('an initially empty closed junction cycle has zero circulation, not a free positive solution',()=>{
 const c=env(),b=solve(c,[m('a','分流'),m('b','分流'),m('wh','仓入')],
 [r('a-b','a','b'),r('b-a','b','a'),r('b-wh','b','wh',1)]);
 assert.equal(b.status,'conditional-fixed-point',JSON.stringify(b));
 assert.equal(Object.keys(b.fractions.inflow).length,0);
 assert.equal(Object.values(b.routeFlows).reduce((n,items)=>n+Object.values(items).reduce((a,b)=>a+b,0),0),0);
});
test('mixed merger tail conserves each material and shares one capacity',()=>{
 const c=env(),b=solve(c,[m('a','__source','run'),m('b','粒子'),m('merge','汇流'),m('wh','仓入')],
 [r('a','a','merge',0,0),r('b','b','merge',0,1),r('tail','merge','wh')]);
 assert.equal(b.status,'conditional-fixed-point',JSON.stringify(b));
 assert.equal(b.fractions.inflow['合金板'],'1/2');
 assert.equal(b.fractions.inflow['星尘粒子'],'1/2');
});
test('warehouse priorities and feedback are generated from the layout without given demand caps',()=>{
 const c=env(),b=solve(c,[m('source','__source','run'),m('wh','仓入'),m('M1','仓出',0,{item:'合金板'}),m('M2','仓出',0,{item:'合金板'}),m('recipe','__need','run'),m('consumer','电脑')],
 [r('deposit','source','wh'),r('priority','M1','recipe'),r('second','M2','consumer'),r('product','recipe','wh',0,1)]);
 assert.equal(b.status,'conditional-fixed-point',JSON.stringify(b));
 assert.equal(b.fractions.routes.priority['合金板'],'1/5');
 assert.equal(b.fractions.routes.second['合金板'],'4/5');
});
test('missing ingredient is a zero-rate legitimate layout',()=>{
 const c=env(),b=solve(c,[m('a','__source','run'),m('recipe','__multi','run'),m('wh','仓入')],
 [r('a','a','recipe'),r('out','recipe','wh')]);
 assert.equal(b.status,'conditional-fixed-point',JSON.stringify(b));
 assert.equal(b.fractions.machineCycles.recipe,'0');
});
test('mixed FIFO feeding a recipe is unresolved, not a false independent allocation',()=>{
 const c=env(),b=solve(c,[m('a','__source','run'),m('b','粒子'),m('merge','汇流'),m('recipe','__multi','run'),m('wh','仓入')],
 [r('a','a','merge',0,0),r('b','b','merge',0,1),r('mix','merge','recipe'),r('out','recipe','wh')]);
 assert.equal(b.status,'unresolved');
 assert(b.issues.some(i=>i.reason.includes('mixed FIFO')));
});
test('AST1 fixture is a test only: all conditional rates are automatically generated and exact',()=>{
 const c=env();c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const b=run(c,'state=ast1Decode(ast);warehouseTheory()');
 assert.equal(b.diagnostics.certified,false);
 const a=b.conditionalBudget;
 assert.equal(a.status,'conditional-fixed-point',JSON.stringify(a));
 assert.equal(a.fractions.inflow['钛合金锭'],'4/3');
 assert.equal(a.fractions.outflow['钛合金锭'],'71/60');
 assert.equal(a.fractions.machineCycles.M24,'11/180');
 assert.equal(a.exactLocalEquations,true);
 assert.equal(a.actualLongRunRatesSolved,false);
 assert.equal(Object.keys(b.inflow).length,0);
});
