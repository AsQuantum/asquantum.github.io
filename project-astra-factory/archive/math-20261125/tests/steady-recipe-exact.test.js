'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function env(){
 const c=vm.createContext({console,performance,atob,btoa,
  document:{getElementById(){return {getContext(){return {}}}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const f of ['data/catalog','core/state','core/machines','core/routing',
  'blueprints/machine-ids','blueprints/item-ids','core/audit','engine/steady-flow',
  'engine/steady-local-rates','engine/steady-recipe-exact','engine/steady-merge-exact']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 }
 vm.runInContext("checkPath=()=>null;DEF.__oreA={name:'A',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'太空垃圾',qty:9,seconds:10,inputs:{}}}};DEF.__oreB={name:'B',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'合金板',qty:2,seconds:5,inputs:{}}}};DEF.__assembly={name:'Assembler',w:3,h:3,ins:2,outs:1,recipes:{run:{output:'齿轮组',qty:1,seconds:5,inputs:{'太空垃圾':3,'合金板':2}}}}",c);
 return c;
}
const node=(id,type,mode='run')=>({id,type,mode,x:0,y:0,face:'E'});
const route=(id,from,to,toPort=0)=>({id,from:{id:from,port:0},to:{id:to,port:toPort},path:[[0,0]]});
function solve(c,machines,routes){c.layout={machines,routes};return vm.runInContext('state=layout;legacyReferenceWarehouseTheory()',c);}
function star(c){
 return solve(c,[node('a','__oreA'),node('b','__oreB'),node('make','__assembly'),node('store','仓入')],
  [route('aInput','a','make',0),route('bInput','b','make',1),route('product','make','store',0)]);
}
test('independent sources A=.9 B=.4, recipe 3A+2B/5s, exact positive product rate',()=>{
 const c=env(),r=star(c);
 assert.equal(r.error,undefined);
 assert.equal(r.diagnostics.certified,true);
 assert.equal(r.diagnostics.fractions.routes['aInput|太空垃圾'],'3/5');
 assert.equal(r.diagnostics.fractions.routes['bInput|合金板'],'2/5');
 assert.equal(r.diagnostics.fractions.routes['product|齿轮组'],'1/5');
 assert.equal(r.diagnostics.fractions.machineCycles.make,'1/5');
 assert.equal(r.diagnostics.fractions.machineCycles.a,'1/15');
 assert.equal(r.diagnostics.fractions.machineCycles.b,'1/5');
 assert.equal(r.machineDuty.a,2/3);
 assert.equal(r.inflow['齿轮组'],1/5);
});
test('when A is limited to .3, machine still consumes A=.3 and B=.2, not zero',()=>{
 const c=env();
 vm.runInContext('DEF.__oreA.recipes.run.qty=3',c);
 const r=star(c);
 assert.equal(r.error,undefined);
 assert.equal(r.diagnostics.fractions.machineCycles.make,'1/10');
 assert.equal(r.diagnostics.fractions.routes['aInput|太空垃圾'],'3/10');
 assert.equal(r.diagnostics.fractions.routes['bInput|合金板'],'1/5');
 assert.equal(r.diagnostics.fractions.routes['product|齿轮组'],'1/10');
});
test('a missing recipe ingredient is not falsely certified as feasible',()=>{
 const c=env();
 const r=solve(c,[node('a','__oreA'),node('make','__assembly'),node('store','仓入')],
  [route('aInput','a','make'),route('product','make','store')]);
 assert.equal(r.diagnostics.certified,false);
 assert.match(r.diagnostics.unresolvedReason,/多原料|输入|联立/);
});
