'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function context(){
 const c=vm.createContext({console,performance,atob,btoa,document:{getElementById(){return{getContext(){return{}}}}},localStorage:{getItem(){return null},setItem(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/steady-flow','engine/steady-merge-exact','engine/steady-equations','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 vm.runInContext("checkPath=()=>null;DEF.__matA={name:'source A',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'太空垃圾',qty:1,seconds:1}}};DEF.__matB={name:'source B',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'合金板',qty:1,seconds:1}}};DEF.__matC={name:'source C',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'齿轮组',qty:1,seconds:5}}}",c);
 return c;
}
const node=(id,type,mode='run')=>({id,type,mode,x:0,y:0,face:'E'});
const route=(id,from,to,toPort=0)=>({id,from:{id:from,port:0},to:{id:to,port:toPort},path:[[0,0]]});
const result=(c,machines,routes)=>{c.layout={machines,routes};return vm.runInContext('state=layout;legacyReferenceWarehouseTheory()',c)};
function exact(r,id,item){return r.diagnostics.fractions.routes[id+'|'+item];}
test('two independent different materials merge into one 1/s line, receiving exactly 1/2 each',()=>{
 const c=context();
 const r=result(c,[node('a','__matA'),node('b','__matB'),node('m','汇流'),node('w','仓入')],
  [route('a','a','m',0),route('b','b','m',1),route('mixed','m','w')]);
 assert.equal(r.error,undefined);assert.equal(r.diagnostics.certified,true);
 assert.equal(exact(r,'a','太空垃圾'),'1/2');
 assert.equal(exact(r,'b','合金板'),'1/2');
 assert.equal(exact(r,'mixed','太空垃圾'),'1/2');
 assert.equal(exact(r,'mixed','合金板'),'1/2');
 assert.equal(r.diagnostics.mixedRoutes.join(','),'mixed');
 assert.equal(r.inflow['太空垃圾']+r.inflow['合金板'],1);
});
test('undersupplied physical inlet retains rate 1/5, other inlet takes residual 4/5 exactly',()=>{
 const c=context(),b=node('b','__matC');
 const r=result(c,[node('a','__matA'),b,node('m','汇流'),node('w','仓入')],
  [route('a','a','m',0),route('b','b','m',1),route('mixed','m','w')]);
 assert.equal(r.error,undefined);
 assert.equal(exact(r,'mixed','齿轮组'),'1/5');
 assert.equal(exact(r,'mixed','太空垃圾'),'4/5');
 assert.equal(exact(r,'a','太空垃圾'),'4/5');
});
test('mixed merger capacity is not guessed: all input generators pass when total below 1',()=>{
 const c=context();
 vm.runInContext("DEF.__matA.recipes.run.seconds=6;DEF.__matB.recipes.run.seconds=5",c);
 const r=result(c,[node('a','__matA'),node('b','__matB'),node('m','汇流'),node('w','仓入')],
  [route('a','a','m',0),route('b','b','m',1),route('mixed','m','w')]);
 assert.equal(r.error,undefined);
 assert.equal(exact(r,'mixed','太空垃圾'),'1/6');
 assert.equal(exact(r,'mixed','合金板'),'1/5');
});
test('two-stage merger tree derives exact independent shared-bandwidth rates 1/4,1/4,1/2',()=>{
 const c=context();
 const m=[node('a','__matA'),node('b','__matB'),node('c','__matC'),
  node('m1','汇流'),node('m2','汇流'),node('w','仓入')];
 vm.runInContext("DEF.__matC.recipes.run.seconds=1",c);
 const routes=[route('a','a','m1',0),route('b','b','m1',1),
  route('inner','m1','m2',0),route('c','c','m2',1),route('mixed','m2','w')];
 const r=result(c,m,routes);
 assert.equal(r.error,undefined);
 assert.equal(exact(r,'mixed','太空垃圾'),'1/4');
 assert.equal(exact(r,'mixed','合金板'),'1/4');
 assert.equal(exact(r,'mixed','齿轮组'),'1/2');
 assert.equal(exact(r,'inner','太空垃圾'),'1/4');
 assert.equal(exact(r,'inner','合金板'),'1/4');
});
test('AST1 r76/r81/r82 are represented by shared-material equations, not rejected as unknown mixed lines',()=>{
 const c=context();
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const observed=vm.runInContext('state=ast1Decode(fixture);({r:legacyReferenceWarehouseTheory(),e:factorySteadyBuildEquations()})',c);
 assert.equal(observed.r.diagnostics.certified,false,'global AST1 still has unsolved feedback and multi-input rules');
 assert.equal(observed.r.error,undefined);
 assert.equal(observed.r.status,'modelled-unresolved');
 assert.equal(observed.r.diagnostics.modelled,true);
 assert(!observed.r.diagnostics.unresolvedReason.includes('R76 混合多种材料'));
 assert.deepEqual([...observed.r.diagnostics.modelledMixedRoutes].sort(),['R76','R81','R82']);
 assert.deepEqual([...observed.r.diagnostics.symbolicModel.mixedRoutes].sort(),['R76','R81','R82']);
 assert.equal(observed.e.sharedLines.length,84);
 assert.equal(observed.e.machineEquations.some(x=>x.machine==='M24'),true);
});
