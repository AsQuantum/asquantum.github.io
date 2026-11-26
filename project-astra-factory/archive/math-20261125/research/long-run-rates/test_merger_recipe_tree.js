'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveMergerRecipeTrees:prove}=require('./merger_recipe_tree_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='钛合金锭',A='合金板',B='复合装甲板',G='齿轮组';
const m=(id,type,x,y,face='E',extra={})=>({id,type,x,y,face,...extra});
const h=(x,X,y)=>Array.from({length:X-x+1},(_,i)=>[x+i,y]),v=(x,y,Y)=>Array.from({length:Math.abs(Y-y)+1},(_,i)=>[x,y+i*Math.sign(Y-y)]);
const line=(id,from,out,to,input,path)=>({id,from:{id:from,port:out},to:{id:to,port:input},path});
const base={name:'Stocked merger and throttled recipe',recordIndexed:true,machines:[
 m('M0','仓出',2,9,'E',{item:K}),m('M1','仓出',14,1,'S',{item:K}),m('M2','汇流',15,10),
 m('M3','组装',28,8,'E',{mode:B}),m('M4','仓出',20,17,'N',{item:A}),m('M5','仓入',44,9)
],routes:[
 line('R0','M0',0,'M2',0,h(7,14,11)),
 line('R1','M1',0,'M2',1,v(16,6,9)),
 line('R2','M2',0,'M3',1,h(18,27,11)),
 line('R3','M4',0,'M3',2,[...v(22,16,12),...h(23,27,12)]),
 line('R4','M3',0,'M5',1,h(39,43,11))
],frozenFactories:[{id:'s',rates:{[K]:'4',[A]:'2'}}]};
function solve(layout,allUnique=true){
 c.layout=layout;run('state=layout');const legal=run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');assert(legal.every(x=>!x),JSON.stringify(legal));
 const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));assert.equal(g.status,'compiled',JSON.stringify(g.issues));
 const p=prove(g,arith);assert.equal(p.trees.length,1,JSON.stringify(p));
 const r=solveDirectRateProblem(compileCountProofProblem(g,arith,p),arith,{ms:10000});assert.equal(r.status,'sat');if(allUnique)assert.equal(r.multiple.length,0,JSON.stringify(r.multiple));
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(sim.byMachine).map(([k,v])=>[k,v.sent])))'));
 const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
 const actual=Object.fromEntries(Object.entries(b).map(([id,vs])=>[id,Object.fromEntries(Object.entries(vs).map(([k,x])=>[k,(x-(a[id][k]||0))/60]))]));
 return {g,p,r,actual,layout};
}
const x=solve(base);assert.equal(x.r.unique['cycle:M3'],'1/4');assert.equal(x.r.unique['routeTotal:R2'],'1/4');assert.equal(x.r.unique['routeTotal:R0'],'1/8');assert.equal(x.r.unique['routeTotal:R1'],'1/8');assert.equal(x.actual.M0[K],7.5);assert.equal(x.actual.M1[K],7.5);assert.equal(x.actual.M3[B],15);
const three=structuredClone(base);three.machines.push(m('M6','仓出',14,17,'N',{item:K}));three.routes.push(line('R5','M6',0,'M2',2,v(16,16,13)));
const y=solve(three);assert.equal(y.r.unique['routeTotal:R2'],'1/4');for(const id of ['R0','R1','R5'])assert.equal(y.r.unique['routeTotal:'+id],'1/12');for(const id of ['M0','M1','M6'])assert.equal(y.actual[id][K],5);assert.equal(y.actual.M3[B],15);
const fast=structuredClone(base);fast.machines=fast.machines.filter(m=>m.id!=='M4');fast.routes=fast.routes.filter(e=>e.id!=='R3');fast.machines.find(m=>m.id==='M3').mode=G;
const z=solve(fast);assert.equal(z.r.unique['cycle:M3'],'1/2');assert.equal(z.r.unique['routeTotal:R2'],'1');assert.equal(z.r.unique['routeTotal:R0'],'1/2');assert.equal(z.r.unique['routeTotal:R1'],'1/2');assert.equal(z.actual.M0[K],30);assert.equal(z.actual.M1[K],30);assert.equal(z.actual.M3[G],30);
const bad=structuredClone(x.g);bad.frozen[0].rates[K]='1';assert.equal(prove(bad,arith).trees.length,0);
const one=structuredClone(base);Object.assign(one.machines.find(m=>m.id==='M1'),{type:'采矿',mode:1});delete one.machines.find(m=>m.id==='M1').item;
const oneSlow=solve(one);assert.equal(oneSlow.r.unique['cycle:M3'],'1/4');assert.equal(oneSlow.r.unique['routeTotal:R2'],'1/4');assert.equal(oneSlow.p.roundRobin[0].unskipped.length,2);assert.equal(oneSlow.r.unique['routeTotal:R1'],'1/8');assert.equal(oneSlow.r.unique['routeTotal:R0'],'1/8');assert.equal(oneSlow.actual.M1[K],7.5);assert.equal(oneSlow.actual.M0[K],7.5);assert.equal(oneSlow.actual.M3[B],15);
const oneFast=structuredClone(fast);Object.assign(oneFast.machines.find(m=>m.id==='M1'),{type:'采矿',mode:1});delete oneFast.machines.find(m=>m.id==='M1').item;
const u=solve(oneFast);assert.equal(u.r.unique['routeTotal:R1'],'2/15');assert.equal(u.r.unique['routeTotal:R0'],'13/15');assert.equal(u.r.unique['cycle:M3'],'1/2');assert.equal(u.actual.M1[K],8);assert.equal(u.actual.M0[K],52);assert.equal(u.actual.M3[G],30);
const twoFast=structuredClone(oneFast);twoFast.machines.push(m('M6','仓出',14,17,'N',{item:K}));twoFast.routes.push(line('R5','M6',0,'M2',2,v(16,16,13)));
const w=solve(twoFast);assert.equal(w.r.unique['routeTotal:R1'],'2/15');for(const id of ['R0','R5'])assert.equal(w.r.unique['routeTotal:'+id],'13/30');assert.equal(w.actual.M1[K],8);assert.equal(w.actual.M0[K],26);assert.equal(w.actual.M6[K],26);assert.equal(w.actual.M3[G],30);
const beyond=structuredClone(oneSlow.g);beyond.nodes.find(m=>m.id==='M1').recipe.seconds=9;const bp=prove(beyond,arith);assert.equal(bp.roundRobin[0].unskipped.length,0);const br=solveDirectRateProblem(compileCountProofProblem(beyond,arith,bp),arith,{ms:10000});assert.equal(br.unique['cycle:M3'],'1/4');assert.equal(br.multiple.length,18);
const unsupported=structuredClone(oneSlow.g);unsupported.frozen[0].rates[K]='1/2';assert.equal(prove(unsupported,arith).trees.length,0);
const report=[x,y,z,oneSlow,u,w].map(({layout,p,r,actual})=>({layout,proof:p,unique:Object.keys(r.unique).length,unknown:r.multiple.length,actual}));
fs.writeFileSync(path.join(__dirname,'merger-recipe-tree-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(({proof,unique,unknown,actual})=>({tree:proof.trees[0],unique,unknown,actual}))));
