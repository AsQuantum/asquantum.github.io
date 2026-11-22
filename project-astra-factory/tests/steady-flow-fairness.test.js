'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=process.argv[2]||path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ctx=vm.createContext({console,atob,btoa,performance,document:{getElementById:()=>({getContext:()=>({})})},localStorage:{getItem:()=>null,setItem:()=>{}},afterChange:()=>{},resetSimulation:()=>{}});
for(const f of ['scripts/data/catalog.js','scripts/core/state.js','scripts/core/machines.js','scripts/core/routing.js','scripts/blueprints/machine-ids.js','scripts/blueprints/item-ids.js','scripts/core/audit.js','scripts/engine/steady-flow.js'])vm.runInContext(read(f),ctx,{filename:f});
const mat='\u592a\u7a7a\u5783\u573e',prod='\u5408\u91d1\u677f';
ctx.mat=mat;ctx.prod=prod;
vm.runInContext(String.raw`
 DEF['test_consumer']={name:'test_consumer',w:3,h:3,ins:1,outs:1,recipes:{consume:{output:prod,qty:1,seconds:5,inputs:{[mat]:1}}}};
 checkPath=()=>null;
`,ctx);
const ms=[
 {id:'source',type:'\u5783\u573e',mode:'LV3',x:0,y:0,face:'E'},
 {id:'split',type:'\u5206\u6d41',x:10,y:10,face:'E',outFilters:{}},
 {id:'storeA',type:'\u4ed3\u5165',x:20,y:10,face:'E',inletItem:''},
 {id:'storeB',type:'\u4ed3\u5165',x:20,y:20,face:'E',inletItem:''},
 {id:'consume',type:'test_consumer',mode:'consume',x:20,y:30,face:'E'},
 {id:'storeC',type:'\u4ed3\u5165',x:30,y:30,face:'E',inletItem:''}
];
const routes=[
 {id:'i',from:{id:'source',port:0},to:{id:'split',port:0},path:[[1,1]]},
 {id:'a',from:{id:'split',port:0},to:{id:'storeA',port:0},path:[[1,1]]},
 {id:'b',from:{id:'split',port:1},to:{id:'storeB',port:0},path:[[1,1]]},
 {id:'c',from:{id:'split',port:2},to:{id:'consume',port:0},path:[[1,1]]},
 {id:'d',from:{id:'consume',port:0},to:{id:'storeC',port:0},path:[[1,1]]}
];
ctx.d={name:'test',machines:ms,routes};vm.runInContext('state=d',ctx);
const th=vm.runInContext('warehouseTheory()',ctx);
if(th.error)throw Error(th.error);
console.log(JSON.stringify({fairConstraints:th.diagnostics.fairSplitConstraints,flowA:th.routeFlows.a?.[mat],flowB:th.routeFlows.b?.[mat],flowC:th.routeFlows.c?.[mat],source:th.routeFlows.i?.[mat],consumption:th.machineCycles.consume,inflow:th.inflow},null,2));
for(const key of ['a','b'])assert(Math.abs(th.routeFlows[key][mat]-0.4)<1e-7,'expected fair 0.4: '+key);
assert(Math.abs(th.routeFlows.c[mat]-0.2)<1e-7,'expected saturated 0.2');
assert(Math.abs(th.routeFlows.i[mat]-1)<1e-7,'expected 1/s input');
console.log('PASS: three exits split 0.40,0.40,0.20 (one downstream capped at 0.20/s)');

ctx.d={name:'three open',machines:ms.filter(m=>m.id!=='consume'),routes:[routes[0],routes[1],routes[2],{...routes[3],to:{id:'storeC',port:0}}]};
vm.runInContext('state=d',ctx);
const three=vm.runInContext('warehouseTheory()',ctx);
for(const k of ['a','b','c'])assert(Math.abs(three.routeFlows[k][mat]-1/3)<1e-7,'three open '+k);
console.log('PASS: 3 unblocked outlets = 0.333/0.333/0.333');
ctx.d={name:'two open',machines:ms.filter(m=>m.id!=='consume'&&m.id!=='storeC'),routes:[routes[0],routes[1],routes[2]]};
vm.runInContext('state=d',ctx);
const two=vm.runInContext('warehouseTheory()',ctx);
for(const k of ['a','b'])assert(Math.abs(two.routeFlows[k][mat]-0.5)<1e-7,'two open '+k);
console.log('PASS: 2 connected outlets = 0.5/0.5');
