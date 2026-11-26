'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveFrozenTickPriority}=require('./frozen_tick_priority_proof'),{combine}=require('./combine_count_proofs'),{compileCountProofProblem:compile}=require('./count_proof_compile'),{solveDirectRateProblem:solve}=require('./direct_algebra'),{projectCountAtWitness:project}=require('./count_witness_projection'),{proveSharedStockService:stock}=require('./shared_stock_proof');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='钛合金锭',A='合金板',B='硅晶圆',C='星尘粒子';
const f=(id,rates)=>({id,enabled:true,rates});
function graph(fs){
 c.layout={name:'shared frozen priority',machines:[],routes:[],frozenFactories:fs};
 return JSON.parse(run('state=layout;JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));
}
const records=[];
for(const [v,a,expected,fast] of [['1','2/3','3/4','20'],['1','1/2','1','20'],['1','2','1/2','1/10'],['2','4/5','5/6','20'],['1/2','2/7','7/8','25'],['40/41','2/3','30/41','4'],['2/3','2/5','5/6','5/4'],['3/4','1/2','3/4','2']]){
 const g=graph([f('src',{[K]:v}),f('first',{[K]:'-'+a,[A]:a}),f('second',{[K]:'-'+fast,[B]:fast}),f('third',{[K]:'-1',[C]:'1'})]);
 const p=proveFrozenTickPriority(g,arith);assert.equal(p.certificates.length,1,JSON.stringify(p));assert.equal(p.frozenDuties[0].duty,expected);
 const r=solve(compile(g,arith,p),arith,{ms:10000});assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);assert.equal(r.unique['duty:first'],expected);assert.equal(r.unique['duty:third'],'0');
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(sim.frozenRuntime).map(([k,v])=>[k,v.activeTime])))'));
 const before=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const after=snap();const actual=Object.fromEntries(Object.keys(after).map(id=>[id,(after[id]-before[id])/3600]));
 for(const d of p.frozenDuties){const q=arith.q(d.duty);assert(Math.abs(actual[d.factory]-Number(q.n)/Number(q.d))<.001,JSON.stringify({d,actual}));}
 const combinedCase=combine(g);assert.equal(combinedCase.result.status,'sat');assert.equal(combinedCase.result.multiple.length,0);assert.equal(combinedCase.result.unique['duty:first'],expected);
 records.push({v,a,fast,proof:p.certificates[0],unique:Object.keys(r.unique).length,actual});
}
const boundary=graph([f('src',{[K]:'1'}),f('first',{[K]:'-40/41'}),f('second',{[K]:'-20'})]);assert.equal(proveFrozenTickPriority(boundary,arith).certificates.length,0);
const lossy=graph([f('a',{[A]:'-2',[B]:'1'}),f('b',{[B]:'-1',[A]:'1'}),f('s',{[A]:'1/5'})]);
const combined=combine(lossy);assert.equal(combined.result.status,'sat');assert.equal(combined.result.multiple.length,0);assert.equal(combined.result.unique['duty:a'],'1/5');assert.equal(combined.result.unique['duty:b'],'1/5');
const shared=graph([f('src',{[K]:'1'}),f('a',{[K]:'-1',[A]:'1'}),f('b',{[K]:'-1',[B]:'1'})]);
const sp=stock(shared,arith,{},[{factory:'a',duty:'3/4',proven:true}]);
const sr=solve(compile(shared,arith,{stockPools:sp.pools,frozenDuties:[{factory:'a',duty:'3/4',proven:true}]}),arith);assert.equal(sr.unique['duty:b'],'1/4');
// Compare exact tangent projection with the established full solver on a
// bounded linear set; rejected witness must never become an actual rate.
const p=compile(shared,arith,{stockPools:sp.pools}),r=solve(p,arith),t=project(p,arith,r.witness);assert.equal(t.status,'sat');assert.deepEqual(t.unique,r.unique);assert.deepEqual([...t.multiple].sort(),[...r.multiple].sort());assert.equal(project(p,arith,{...r.witness,'duty:a':'2'}).status,'candidate-rejected');
// Nontrivial tangent cone: x>=0,y>=0,x+y=1. Both x,y vary,
// their total is unique, including from the boundary witness (1,0).
const poly={status:'compiled',smt:'(set-logic QF_LRA) (declare-const x Real) (declare-const y Real) (declare-const z Real) (assert (= z (+ x y))) (assert (= z 1)) (assert (<= 0 x)) (assert (<= 0 y))',observables:{x:'x',y:'y',sum:'z'},groups:{actual:['x','y','sum']}};
const pp=project(poly,arith,{x:'1',y:'0',sum:'1'});assert.equal(pp.status,'sat');assert.deepEqual(pp.unique,{sum:'1'});assert.deepEqual(pp.multiple,['x','y']);
const {projectTrivialPotential}=require('./counterfactual_metrics');
const cf=graph([f('src',{[K]:'1'}),f('consumer',{[K]:'-2',[B]:'2'})]);
const constrained=combine(cf).result;assert.equal(constrained.unique['duty:consumer'],'1/2');assert.equal(constrained.unique['net:'+K],'0');
assert.equal(projectTrivialPotential(cf,arith,constrained.unique)[K].potential,'-1');
const ug={...cf,unlimited:true};const unlimited=combine(ug).result;assert.equal(unlimited.unique['duty:consumer'],'1');assert.equal(unlimited.unique['net:'+K],'-1');assert.equal(unlimited.unique['net:'+B],'2');

const {projectCountInterval}=require('./count_interval_projection');assert.deepEqual(Object.fromEntries(Object.entries(projectCountInterval(poly,arith,'x')).filter(([k])=>['status','lower','upper','unique'].includes(k))),{status:'interval',lower:'0',upper:'1',unique:false});assert.equal(projectCountInterval(poly,arith,'sum').lower,'1');assert.equal(projectCountInterval(poly,arith,'sum').upper,'1');
const report={records,counterfactual:{potential:projectTrivialPotential(cf,arith,constrained.unique),overdraft:unlimited.unique['net:'+K]},tangent:pp,feedback:{unique:Object.keys(combined.result.unique).length,passes:combined.passes},residual:sr.unique['duty:b'],projection:t.stats};fs.writeFileSync(path.join(__dirname,'frozen-tick-priority-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
