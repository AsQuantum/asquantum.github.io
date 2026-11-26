'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveSharedRecipeInputs:prove}=require('./shared_recipe_input_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='钛合金锭',A='合金板',B='复合装甲板',G='齿轮组';
const m=(id,type,x,y,face='E',extra={})=>({id,type,x,y,face,...extra});
const h=(x,X,y)=>Array.from({length:X-x+1},(_,i)=>[x+i,y]),v=(x,y,Y)=>Array.from({length:Math.abs(Y-y)+1},(_,i)=>[x,y+i*Math.sign(Y-y)]);
const line=(id,from,to,input,path)=>({id,from:{id:from,port:0},to:{id:to,port:input},path});
const layout={name:'Independent slow sources sharing gear buffer',recordIndexed:true,machines:[
 m('M0','采矿',2,9,'E',{mode:1}),m('M1','采矿',20,17,'N',{mode:1}),m('M2','组装',28,8,'E',{mode:G}),m('M3','仓入',44,9)
],routes:[
 line('R0','M0','M2',1,h(7,27,11)),
 line('R1','M1','M2',2,[...v(22,16,12),...h(23,27,12)]),
 line('R2','M2','M3',1,h(39,43,11))
],frozenFactories:[]};
const three=structuredClone(layout);three.machines.push(m('M4','采矿',20,1,'S',{mode:1}));three.routes.push(line('R3','M4','M2',0,[...v(22,6,10),...h(23,27,10)]));
function solve(l){
 c.layout=l;run('state=layout');const legal=run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');assert(legal.every(x=>!x),JSON.stringify(legal));
 const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));assert.equal(g.status,'compiled',JSON.stringify(g.issues));
 const p=prove(g,arith);assert.equal(p.certificates.length,1,JSON.stringify(p));
 const r=solveDirectRateProblem(compileCountProofProblem(g,arith,p),arith,{ms:10000});assert.equal(r.status,'sat');return {g,p,r};
}
function measured(){
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(sim.byMachine).map(([k,v])=>[k,v.sent])))'));
 const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
 return Object.fromEntries(Object.entries(b).map(([id,vs])=>[id,Object.fromEntries(Object.entries(vs).map(([k,x])=>[k,(x-(a[id][k]||0))/60]))]));
}
const x=solve(layout);assert.equal(x.r.unique['cycle:M2'],'2/15');assert.equal(x.r.unique['net:'+G],'2/15');assert.equal(x.r.multiple.length,0);
const actual=measured();assert.equal(actual.M0[K],8);assert.equal(actual.M1[K],8);assert.equal(actual.M2[G],8);
const y=solve(three);assert.equal(y.r.unique['cycle:M2'],'1/5');assert.equal(y.r.multiple.length,0);
const actual3=measured();for(const id of ['M0','M1','M4'])assert.equal(actual3[id][K],8);assert.equal(actual3.M2[G],12);
const fast=structuredClone(three);
for(const m of fast.machines.filter(m=>m.type==='采矿')){m.type='仓出';m.item=m.id==='M1'?A:K;}
fast.machines.find(m=>m.id==='M2').mode=B;fast.frozenFactories=[{id:'s',rates:{[K]:'3',[A]:'2'}}];
const z=solve(fast);assert.equal(z.p.certificates[0].method,'parallel-abundant-input-nominal');
assert.equal(z.r.unique['cycle:M2'],'1/4');assert.equal(z.r.unique['net:'+B],'1/4');assert.equal(z.r.multiple.length,0);assert.equal(z.p.refills.length,1);assert.equal(z.r.unique['routeTotal:R0'],'1/4');assert.equal(z.r.unique['routeTotal:R3'],'0');
const actualFast=measured();assert.equal(actualFast.M2[B],15);assert.equal(actualFast.M1[A],60);assert.equal(actualFast.M0[K],15);assert.equal(actualFast.M4[K],0);
const nominalOnly=solveDirectRateProblem(compileCountProofProblem(z.g,arith,{...z.p,refills:[]}),arith,{ms:10000});assert.equal(nominalOnly.multiple.length,8);
const boundary=structuredClone(z.g);boundary.nodes.find(m=>m.id==='M2').recipe.seconds=4;boundary.nodes.find(m=>m.id==='M2').recipe.inputs[K]=5;assert.equal(prove(boundary,arith).refills.length,0);
const tooFast=structuredClone(y.g);for(const m of tooFast.nodes.filter(m=>m.type==='采矿'))m.recipe.seconds=1;assert.equal(prove(tooFast,arith).certificates.length,0);
const tooBurst=structuredClone(y.g);tooBurst.nodes.find(m=>m.id==='M0').recipe.qty=2;assert.equal(prove(tooBurst,arith).certificates.length,0);
const shortage=structuredClone(z.g);shortage.frozen[0].rates[A]='1/2';assert.equal(prove(shortage,arith).certificates.length,0);
const report={cases:[{layout,proof:x.p,unique:Object.keys(x.r.unique).length,unknown:x.r.multiple.length,actual},{layout:three,proof:y.p,unique:Object.keys(y.r.unique).length,unknown:y.r.multiple.length,actual:actual3},{layout:fast,proof:z.p,unique:Object.keys(z.r.unique).length,unknown:z.r.multiple.length,actual:actualFast}],rejections:3};
fs.writeFileSync(path.join(__dirname,'shared-recipe-input-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.cases.map(({proof,unique,unknown,actual})=>({proof:proof.certificates,unique,unknown,actual}))));
