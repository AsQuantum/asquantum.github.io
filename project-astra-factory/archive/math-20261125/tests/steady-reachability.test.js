'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function context(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state',
  'core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-equations','engine/steady-reachability','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 vm.runInContext("checkPath=()=>null;DEF.__cycle={name:'cycle',w:3,h:3,ins:1,outs:1,recipes:{run:{output:'合金板',qty:1,seconds:1,inputs:{'合金板':1}}}};DEF.__source={name:'source',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'合金板',qty:1,seconds:3,inputs:{}}}}",c);
 return c;
}
const m=(id,type)=>({id,type,x:0,y:0,face:'E',mode:'run',...(type==='仓出'?{item:'合金板'}:{})});
const r=(id,from,to)=>({id,from:{id:from,port:0},to:{id:to,port:0},path:[[0,0]]});
function run(c,machines,routes,initial=[]){
 c.layout={machines,routes};
 c.initial=initial;
 return vm.runInContext('state=layout;factorySteadyEmptyStartReachability(factorySteadyBuildEquations(),{initialWarehouseItems:initial})',c);
}
test('a purely circular empty warehouse + ingredient-dependent machine cannot ever start',()=>{
 const c=context();
 const result=run(c,[m('out','仓出'),m('in','仓入'),m('make','__cycle')],
  [r('feed','out','make'),r('product','make','in')]);
 assert(result.cannotEverProduce.includes('make'));
 assert(result.cannotEverStock.includes('合金板'));
 assert(result.certifiedZero.routeRates.includes('flow:product:合金板'));
 assert(result.certifiedZero.routeRates.includes('flow:feed:合金板'));
});
test('an actual no-input generator can seed the same circular warehouse, but positivity is not asserted',()=>{
 const c=context();
 const result=run(c,[m('source','__source'),m('out','仓出'),m('in','仓入'),m('make','__cycle')],
  [r('seed','source','in'),r('feed','out','make'),r('product','make','in')]);
 assert(!result.cannotEverProduce.includes('make'));
 assert(!result.cannotEverStock.includes('合金板'));
 assert(!result.cannotEverFlow.includes('flow:product:合金板'));
 assert.match(result.note,/NOT certify positive/);
});
test('providing explicit initial inventory removes the structural impossibility but is not silently assumed',()=>{
 const c=context();
 const machines=[m('out','仓出'),m('in','仓入'),m('make','__cycle')];
 const routes=[r('feed','out','make'),r('product','make','in')];
 const zero=run(c,machines,routes);
 const seeded=run(c,machines,routes,['合金板']);
 assert(zero.cannotEverProduce.includes('make'));
 assert(!seeded.cannotEverProduce.includes('make'));
 assert.deepEqual([...zero.startsWithWarehouseItems],[]);
 assert.deepEqual([...seeded.startsWithWarehouseItems],['合金板']);
});
test('AST1 start-up reachability is verified separately from mathematical free flow rates',()=>{
 const c=context();
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const result=vm.runInContext('state=ast1Decode(fixture);factorySteadyEmptyStartReachability(factorySteadyBuildEquations())',c);
 assert(result.passes>1);
 assert(result.potentiallyActiveRecipeMachines.length<=49);
 assert.equal(result.startsWithWarehouseItems.length,0);
 assert(result.potentiallyAvailableWarehouseItems.length<=14);
 assert.equal(result.certifiedZero.recipeCycleRates.length,result.cannotEverProduce.length);
});

test('a splitter explicitly filtered as 任意 remains material-reachable from a generator',()=>{
 const c=context(),splitter=m('split','分流');
 splitter.outFilters={0:'任意'};
 const reached=run(c,[m('source','__source'),splitter,m('in','仓入')],
  [r('input','source','split'),r('output','split','in')]);
 assert(!reached.cannotEverFlow.includes('flow:output:合金板'));
 assert(!reached.cannotEverStock.includes('合金板'));
});
