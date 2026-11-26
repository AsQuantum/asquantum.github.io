'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveSplitRecipeBranches:prove}=require('./split_recipe_branch_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='钛合金锭',A='合金板',B='复合装甲板';
const m=(id,type,x,y,face='E',extra={})=>({id,type,x,y,face,...extra});
const h=(x,X,y)=>Array.from({length:X-x+1},(_,i)=>[x+i,y]),v=(x,y,Y)=>Array.from({length:Math.abs(Y-y)+1},(_,i)=>[x,y+i*Math.sign(Y-y)]);
const line=(id,from,out,to,input,path)=>({id,from:{id:from,port:out},to:{id:to,port:input},path});
const layout={name:'Saturated splitter with slow armor branch',recordIndexed:true,machines:[
 m('M0','仓出',2,9,'E',{item:K}),m('M1','分流',15,10),m('M2','仓入',14,1,'N'),
 m('M3','组装',28,8,'E',{mode:B}),m('M4','仓出',20,17,'N',{item:A}),m('M5','仓入',44,9)
],routes:[
 line('R0','M0',0,'M1',0,h(7,14,11)),
 line('R1','M1',0,'M3',1,h(18,27,11)),
 line('R2','M1',1,'M2',1,v(16,9,6)),
 line('R3','M4',0,'M3',2,[...v(22,16,12),...h(23,27,12)]),
 line('R4','M3',0,'M5',1,h(39,43,11))
],frozenFactories:[{id:'s',rates:{[K]:'2',[A]:'2'}}]};
function solve(layout,expectedBranches=1){
 c.layout=layout;run('state=layout');const legal=run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');assert(legal.every(x=>!x),JSON.stringify(legal));
 const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));assert.equal(g.status,'compiled',JSON.stringify(g.issues));
 const p=prove(g,arith);assert.equal(p.branches.length,expectedBranches,JSON.stringify(p));
 const r=solveDirectRateProblem(compileCountProofProblem(g,arith,p),arith,{ms:10000});assert.equal(r.status,'sat');assert.equal(r.multiple.length,0,JSON.stringify(r.multiple));return {g,p,r};
}
function measured(){
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(sim.byMachine).map(([k,v])=>[k,v.received])))'));
 const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
 return Object.fromEntries(Object.entries(b).map(([id,vs])=>[id,Object.fromEntries(Object.entries(vs).map(([k,x])=>[k,(x-(a[id][k]||0))/60]))]));
}
const x=solve(layout);assert.equal(x.r.unique['cycle:M3'],'1/4');assert.equal(x.r.unique['routeTotal:R1'],'1/4');assert.equal(x.r.unique['routeTotal:R2'],'3/4');assert.equal(x.r.unique['routeTotal:R3'],'1');
const actual=measured();assert.equal(actual.M2[K],45);assert.equal(actual.M3[K],15);assert.equal(actual.M3[A],60);assert.equal(actual.M5[B],15);
const three=structuredClone(layout);three.machines.push(m('M6','仓入',14,17,'S'));three.routes.push(line('R5','M1',2,'M6',1,v(16,13,16)));
const y=solve(three);assert.equal(y.r.unique['routeTotal:R1'],'1/4');assert.equal(y.r.unique['routeTotal:R2'],'3/8');assert.equal(y.r.unique['routeTotal:R5'],'3/8');
const actual3=measured();assert.equal(actual3.M2[K],22.5);assert.equal(actual3.M6[K],22.5);assert.equal(actual3.M5[B],15);
const reject=structuredClone(x.g);reject.frozen[0].rates[K]='1/2';assert.equal(prove(reject,arith).roundRobin.length,0);
const shared=structuredClone(x.g);shared.frozen[0].rates[A]='1/2';assert.equal(prove(shared,arith).branches.length,0);
const nofree=structuredClone(x.g);nofree.nodes.find(m=>m.id==='M2').type='电脑';assert.equal(prove(nofree,arith).roundRobin.length,0);
const fast=structuredClone(layout);fast.machines=fast.machines.filter(m=>m.id!=='M4');fast.routes=fast.routes.filter(e=>e.id!=='R3');fast.machines.find(m=>m.id==='M3').mode='齿轮组';
const z=solve(fast);assert.equal(z.r.unique['routeTotal:R1'],'1/2');assert.equal(z.r.unique['routeTotal:R2'],'1/2');assert.equal(z.r.unique['cycle:M3'],'1/4');
const fastActual=measured();assert.equal(fastActual.M2[K],30);assert.equal(fastActual.M3[K],30);assert.equal(fastActual.M5['齿轮组'],15);
const relaxed=solveDirectRateProblem(compileCountProofProblem(z.g,arith,{...z.p,roundRobin:z.p.roundRobin.map(p=>({...p,unskipped:[]}))}),arith,{ms:10000});
assert.equal(relaxed.status,'sat');assert(!Object.hasOwn(relaxed.unique,'routeTotal:R1'));
const allBlocked={name:'Two fully throttled armor branches',recordIndexed:true,machines:[
 m('M0','仓出',2,19,'E',{item:K}),m('M1','分流',8,20),
 m('M2','组装',22,18,'E',{mode:B}),m('M3','仓出',14,27,'N',{item:A}),m('M4','仓入',39,19),
 m('M5','组装',22,5,'E',{mode:B}),m('M6','仓出',14,11,'E',{item:A}),m('M7','仓入',39,6)
],routes:[
 line('R0','M0',0,'M1',0,[[7,21]]),
 line('R1','M1',0,'M2',1,h(11,21,21)),
 line('R2','M1',1,'M5',1,[...v(9,19,8),...h(10,21,8)]),
 line('R3','M3',0,'M2',2,[...v(16,26,22),...h(17,21,22)]),
 line('R4','M2',0,'M4',1,h(33,38,21)),
 line('R5','M6',0,'M5',2,[...h(19,21,13),...v(21,12,9)]),
 line('R6','M5',0,'M7',1,h(33,38,8))
],frozenFactories:[{id:'s',rates:{[K]:'2',[A]:'3'}}]};
const both=solve(allBlocked,2);
assert.equal(both.p.roundRobin.length,0);
assert(both.p.branches.every(p=>p.offerGap==='4'));
assert.equal(both.r.unique['routeTotal:R0'],'1/2');
for(const k of ['R1','R2'])assert.equal(both.r.unique['routeTotal:'+k],'1/4');
for(const k of ['M2','M5'])assert.equal(both.r.unique['cycle:'+k],'1/4');
const bothActual=measured();assert.equal(bothActual.M1[K],30);assert.equal(bothActual.M2[K],15);assert.equal(bothActual.M5[K],15);assert.equal(bothActual.M4[B],15);assert.equal(bothActual.M7[B],15);
const functional=structuredClone(allBlocked);functional.machines=functional.machines.filter(m=>m.id!=='M6');functional.routes=functional.routes.filter(r=>r.id!=='R5');functional.machines.find(m=>m.id==='M5').mode='齿轮组';
const fun=solve(functional,2);assert.equal(fun.p.roundRobin.length,1);assert.deepEqual(fun.p.roundRobin[0].unskipped,['R2']);
assert.equal(fun.r.unique['routeTotal:R0'],'1');assert.equal(fun.r.unique['routeTotal:R1'],'1/4');assert.equal(fun.r.unique['routeTotal:R2'],'3/4');
const funActual=measured();assert.equal(funActual.M1[K],60);assert.equal(funActual.M2[K],15);assert.equal(funActual.M5[K],45);assert.equal(funActual.M7['齿轮组'],22.5);
const longer=structuredClone(both.g);longer.lines.find(e=>e.id==='R0').length=12;
const weak=prove(longer,arith);assert(weak.branches.every(p=>p.offerGap==='15'));
const unresolved=solveDirectRateProblem(compileCountProofProblem(longer,arith,weak),arith,{ms:10000});assert.equal(unresolved.status,'sat');assert(!Object.hasOwn(unresolved.unique,'routeTotal:R0'));
const extended={allBlocked:{layout:allBlocked,proof:both.p,actual:bothActual,unique:Object.keys(both.r.unique).length},functional:{layout:functional,proof:fun.p,actual:funActual,unique:Object.keys(fun.r.unique).length},longer:{unknown:unresolved.multiple.length}};

const report={extended,layout,three,proof:x.p,unique:Object.keys(x.r.unique).length,actual,threeProof:y.p,threeUnique:Object.keys(y.r.unique).length,actual3,fast:{unique:Object.keys(z.r.unique).length,actual:fastActual,proof:z.p},rejections:3};
fs.writeFileSync(path.join(__dirname,'split-recipe-branch-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({unique:report.unique,threeUnique:report.threeUnique,actual,actual3,extended:{allBlocked:{unique:extended.allBlocked.unique,actual:bothActual},functional:{unique:extended.functional.unique,actual:funActual},longer:extended.longer},fast:report.fast,branches:x.p.branches,threeBranches:y.p.branches}));
