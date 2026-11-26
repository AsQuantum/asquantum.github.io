'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveTandem,provePhysicalTandems}=require('./tandem_count_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c);
const catalog=JSON.parse(run('JSON.stringify(DEF)')),arcs=[],ranks=new Map();
let recipeCount=0;
for(const m of Object.values(catalog))for(const r of Object.values(m.recipes||{})){recipeCount++;ranks.set(r.output,0);for(const k of Object.keys(r.inputs)){ranks.set(k,0);arcs.push([k,r.output]);}}
const nodes=[...ranks.keys()],indeg=new Map(nodes.map(k=>[k,0]));
for(const [a,b] of arcs)indeg.set(b,indeg.get(b)+1);
const queue=nodes.filter(k=>indeg.get(k)===0);
for(let i=0;i<queue.length;i++)for(const [a,b] of arcs)if(a===queue[i]){ranks.set(b,Math.max(ranks.get(b),ranks.get(a)+1));indeg.set(b,indeg.get(b)-1);if(indeg.get(b)===0)queue.push(b);}
assert.equal(queue.length,nodes.length);
const layout={name:'Garbage to alloy tandem',recordIndexed:true,machines:[
 {id:'M0',type:'垃圾',x:2,y:2,face:'E',mode:0},
 {id:'M1',type:'废料',x:11,y:1,face:'E',mode:'标准'},
 {id:'M2',type:'浇筑',x:25,y:1,face:'E',mode:'标准'},
 {id:'M3',type:'仓入',x:40,y:2,face:'E'}
],routes:[[0,7,10],[1,20,24],[2,34,39]].map(([i,x0,x1])=>({id:'R'+i,from:{id:'M'+i,port:0},to:{id:'M'+(i+1),port:i===2?1:0},path:Array.from({length:x1-x0+1},(_,j)=>[x0+j,4])})),frozenFactories:[]};
c.layout=layout;run('state=layout');
assert(run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))').every(v=>!v));
const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))')),p=provePhysicalTandems(g,arith);
assert.equal(p.chains.length,1,JSON.stringify(p));assert.deepEqual(p.chains[0].stageRates,['1/3','1/3','2/9']);
assert.equal(p.chains[0].blockTime,'9');
const r=solveDirectRateProblem(compileCountProofProblem(g,arith,{machineRates:p.certificates}),arith,{ms:10000});
assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);assert.equal(r.unique['net:合金板'],'2/9');
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const snap=()=>JSON.parse(run('JSON.stringify({inbound:sim.inbound,sent:Object.fromEntries(Object.entries(sim.byMachine).map(([k,v])=>[k,v.sent]))})'));
const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
const actual=layout.machines.slice(0,3).map((m,i)=>{const item=['太空垃圾','废金属','合金板'][i];return ((b.sent[m.id][item]||0)-(a.sent[m.id][item]||0))/60;});
assert.deepEqual(actual,[60,40,800/60]);
const cases=[];
for(const [s,L,expect] of [
 [[{b:1,T:1},{a:1,b:1,T:4}],[1,1],['1/4','1/4']],
 [[{b:1,T:1},{a:5,b:1,T:3}],[1,1],['1','1/5']],
 [[{b:2,T:'3/2'},{a:3,b:2,T:'7/3'}],[2,3],['1/2','1/3']],
 [[{b:3,T:'5/2'}],[1],['1/3']],
 [[{b:1,T:1},...Array.from({length:8},()=>({a:1,b:1,T:2}))],Array(9).fill(1),Array(9).fill('1/2')]
]){
 const q=proveTandem(s,L,arith);assert.equal(q.status,'proved',JSON.stringify(q));assert.deepEqual(q.stageRates,expect);cases.push(q);
}
assert.equal(proveTandem([{b:1,T:1}], [1],arith,{maxNodes:1}).status,'not-proved');
const report={catalog:{recipes:recipeCount,materials:nodes.length,arcs:arcs.length,ranks:Object.fromEntries(ranks)},layout,ast1:run('ast1Encode()'),chain:p.chains[0],unique:Object.keys(r.unique).length,actual,cases};
fs.writeFileSync(path.join(__dirname,'tandem-count-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({catalog:report.catalog,chain:report.chain,unique:report.unique,actual,cases:cases.map(q=>({blockTime:q.blockTime,stageRates:q.stageRates,vertices:q.vertices}))}));
