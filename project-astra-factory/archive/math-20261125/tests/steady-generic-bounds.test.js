'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,
  document:{getElementById(){return {getContext(){return {}}}}}});
 for(const file of ['data/catalog','core/state','core/machines','core/routing','core/audit',
  'engine/steady-flow','engine/steady-equations','engine/steady-generic-network','engine/steady-bounds']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',file+'.js'),'utf8'),c,{filename:file});
 }
 vm.runInContext("checkPath=()=>null;DEF.__recycle={name:'recycle',w:3,h:3,ins:1,outs:1,recipes:{run:{output:'合金板',qty:2,seconds:1,inputs:{'合金板':1}}}};DEF.__seed={name:'seed',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'合金板',qty:1,seconds:1,inputs:{}}}}",c);
 return c;
}
const m=(id,type)=>({id,type,x:0,y:0,face:'E',mode:'run',
 ...(type==='仓出'?{item:'合金板'}:{})});
const r=(id,a,b)=>({id,from:{id:a,port:0},to:{id:b,port:0},path:[[0,0]]});
function solve(c,machines,routes,initial=[]){
 c.layout={machines,routes};c.initial=initial;
 return vm.runInContext("(()=>{state=layout;const model=factorySteadyBuildEquations();return {general:factorySteadyProveRateBounds(model),startup:factorySteadyProveRateBounds(model,{startupLayout:layout,initialWarehouseItems:initial})};})()",c);
}
test('warehouse gain cycle algebraically permits positive flow but empty start certifies exact zero',()=>{
 const c=env();
 const result=solve(c,[m('out','仓出'),m('make','__recycle'),m('in','仓入')],
  [r('withdraw','out','make'),r('deposit','make','in')]);
 assert.notEqual(result.general.upper['cycles:make'],'0');
 assert.equal(result.startup.upper['cycles:make'],'0');
 assert.equal(result.startup.upper['flow:withdraw:合金板'],'0');
 assert.equal(result.startup.upper['flow:deposit:合金板'],'0');
 assert(result.startup.startupProof.certifiedZeroVariables>=3);
 assert.equal(result.general.startupProof,null);
});
test('explicit initial warehouse inventory prevents falsely proving zero circulation',()=>{
 const c=env();
 const result=solve(c,[m('out','仓出'),m('make','__recycle'),m('in','仓入')],
  [r('withdraw','out','make'),r('deposit','make','in')],['合金板']);
 assert.notEqual(result.startup.upper['cycles:make'],'0');
 assert.equal(result.startup.startupProof.initialWarehouseItems[0],'合金板');
});
test('fresh generator deposits item before warehouse loop, so loop can potentially start',()=>{
 const c=env();
 const result=solve(c,[m('seed','__seed'),m('out','仓出'),m('make','__recycle'),m('in','仓入')],
  [r('input','seed','in'),r('withdraw','out','make'),r('deposit','make','in')]);
 assert.notEqual(result.startup.upper['cycles:make'],'0');
 assert.notEqual(result.startup.upper['flow:deposit:合金板'],'0');
});
