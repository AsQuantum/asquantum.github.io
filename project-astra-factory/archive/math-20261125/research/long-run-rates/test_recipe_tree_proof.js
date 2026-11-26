'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveRecipeTree,provePhysicalRecipeTrees}=require('./recipe_tree_proof'),{proveTandem}=require('./tandem_count_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),m=(id,type,x,y,face='E',mode=0)=>({id,type,x,y,face,mode});
const horizontal=(x,X,y)=>Array.from({length:X-x+1},(_,i)=>[x+i,y]);
const line=(id,from,to,port,path)=>({id,from:{id:from,port:0},to:{id:to,port},path});
const layout={name:'Silicon independent ingredient tree',recordIndexed:true,machines:[
 m('M0','采矿',2,11),m('M1','粒子',12,20,'N'),m('M2','冶炼',18,10,'E','硅晶圆'),m('M3','仓入',32,11)
],routes:[
 line('R0','M0','M2',0,horizontal(7,17,13)),
 line('R1','M1','M2',1,[[14,19],[14,18],[14,17],[14,16],[14,15],...horizontal(14,17,14)]),
 line('R2','M2','M3',1,horizontal(27,31,13))
],frozenFactories:[]};
function solve(layout){
 c.layout=layout;run('state=layout');
 const checks=run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');assert(checks.every(v=>!v),JSON.stringify(checks));
 const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))')),p=provePhysicalRecipeTrees(g,arith);assert.equal(p.trees.length,1,JSON.stringify(p));
 const r=solveDirectRateProblem(compileCountProofProblem(g,arith,{machineRates:p.certificates}),arith,{ms:10000});assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);return {g,p,r};
}
const s=solve(layout),proof=s.p.trees[0];
assert.equal(s.r.unique['cycle:M0'],'1/6');assert.equal(s.r.unique['cycle:M1'],'1');assert.equal(s.r.unique['cycle:M2'],'1/4');
assert.equal(s.r.unique['net:硅晶圆'],'1/4');
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const snap=()=>JSON.parse(run('JSON.stringify({inbound:sim.inbound,sent:Object.fromEntries(Object.entries(sim.byMachine).map(([k,v])=>[k,v.sent]))})'));
const before=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const after=snap();
const actual=['小行星矿石','星尘粒子','硅晶圆'].map((k,i)=>((after.sent['M'+i][k]||0)-(before.sent['M'+i][k]||0))/60);
assert.deepEqual(actual,[30,60,15]);
const cases=[];
for(const stages of [
 [{b:1,T:1,length:1,to:2,a:1},{b:1,T:4,length:2,to:2,a:2},{b:1,T:1,length:1,to:null}],
 [{b:2,T:'3/2',length:2,to:2,a:3},{b:3,T:'7/2',length:3,to:2,a:2},{b:2,T:'5/2',length:1,to:null}],
 [{b:1,T:1,length:1,to:2,a:1},{b:1,T:1,length:2,to:2,a:1},{b:1,T:2,length:1,to:4,a:1},{b:1,T:5,length:1,to:4,a:1},{b:1,T:1,length:2,to:null}],
 [{b:1,T:1,length:1,to:4,a:1},{b:1,T:1,length:1,to:4,a:2},{b:1,T:1,length:1,to:4,a:3},{b:1,T:1,length:1,to:4,a:4},{b:1,T:1,length:1,to:null}]
]){
 const p=proveRecipeTree(stages,arith);assert.equal(p.status,'proved',JSON.stringify(p));cases.push({stages,proof:p});
}
assert.deepEqual(cases[0].proof.stageRates,['1/8','1/4','1/8']);
assert.deepEqual(cases[2].proof.stageRates,Array(5).fill('1/5'));
assert.deepEqual(cases[3].proof.stageRates,['1/4','1/2','3/4','1','1/4']);
// Regression: generic tree and old chain produce identical rate vector.
const chain=[{b:3,T:3,length:4,to:1,a:3},{b:2,T:2,length:5,to:2,a:3},{b:1,T:'5/2',length:6,to:null}];
assert.deepEqual(proveRecipeTree(chain,arith).stageRates,proveTandem([{b:3,T:3},{a:3,b:2,T:2},{a:3,b:1,T:'5/2'}],[4,5,6],arith).stageRates);
// Refuse same ingredient twice and missing independent input.
const invalid=structuredClone(s.g);invalid.lines[1].materials=invalid.lines[0].materials;assert.equal(provePhysicalRecipeTrees(invalid,arith).trees.length,0);
assert.equal(proveRecipeTree([{b:1,T:1,length:1,to:1,a:1},{b:1,T:1,length:1,to:0,a:1}],arith).status,'not-proved');
assert.equal(proveRecipeTree(chain,arith,{maxNodes:1}).status,'not-proved');
const siliconAst=run('ast1Encode()');
const deep={name:'Alloy converging multi-layer recipe tree',recordIndexed:true,machines:[
 m('M0','垃圾',2,2),m('M1','废料',11,1,'E','标准'),m('M2','采矿',24,10,'N'),m('M3','冶炼',28,1,'E','合金板'),m('M4','仓入',43,2)
],routes:[
 line('R0','M0','M1',0,horizontal(7,10,4)),
 line('R1','M1','M3',0,horizontal(20,27,4)),
 line('R2','M2','M3',1,[[26,9],[26,8],[26,7],[26,6],[26,5],[27,5]]),
 line('R3','M3','M4',1,horizontal(37,42,4))
],frozenFactories:[]};
const ds=solve(deep);
assert.equal(ds.r.unique['cycle:M0'],'1/3');assert.equal(ds.r.unique['cycle:M1'],'1/3');assert.equal(ds.r.unique['cycle:M2'],'2/9');assert.equal(ds.r.unique['cycle:M3'],'1/3');assert.equal(ds.r.unique['net:合金板'],'2/3');
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const db=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const da=snap();
const deepActual=['太空垃圾','废金属','小行星矿石','合金板'].map((k,i)=>((da.sent['M'+i][k]||0)-(db.sent['M'+i][k]||0))/60);
assert.deepEqual(deepActual,[60,40,40,40]);
const deepResult={layout:deep,ast1:run('ast1Encode()'),proof:ds.p.trees[0],actual:deepActual,unique:Object.keys(ds.r.unique).length};

const result={layout,deep:deepResult,ast1:siliconAst,proof,unique:Object.keys(s.r.unique).length,actual,cases,rejections:3};
fs.writeFileSync(path.join(__dirname,'recipe-tree-results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({proof,unique:result.unique,actual,deep:{proof:deepResult.proof,actual:deepActual,unique:deepResult.unique},cases:cases.map(c=>({rates:c.proof.stageRates,blockTime:c.proof.blockTime,vertices:c.proof.vertices})),rejections:3}));
