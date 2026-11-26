'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveFrozenProtectedItem:prove}=require('./frozen_protected_item_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra'),{compileExactRateProblem}=require('./compile_exact');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'warehouse-burst-counterexample.json'),'utf8')),item='钛合金锭',product='硅晶圆';
const layout=structuredClone(fixture.layout);layout.machines=layout.machines.filter(m=>['M8','M10','M12'].includes(m.id));layout.routes=layout.routes.filter(r=>['R4','R6'].includes(r.id));
layout.frozenFactories=[{id:'source',name:'source',enabled:true,rates:{[item]:'1'}},{id:'consumer',name:'consumer',enabled:true,rates:{[item]:'-2/3',[product]:'2/3'}}];
c.layout=layout;run('state=layout');assert(run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))').every(v=>!v));
function solve(){
 const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph())')),p=prove(g,arith);
 assert.equal(p.duties.length,1,JSON.stringify(p));
 const r=solveDirectRateProblem(compileCountProofProblem(g,arith,{machineRates:p.machineRates,frozenDuties:p.duties,warehouseBursts:p.warehouseBursts}),arith,{ms:10000});
 assert.equal(r.status,'sat');assert.equal(r.multiple.length,0,JSON.stringify(r.multiple));
 return {g,p,r};
}
const base=solve();assert.equal(base.r.unique['duty:consumer'],'3/4');assert.equal(base.r.unique['routeTotal:R4'],'1/2');assert.equal(base.r.unique['net:齿轮组'],'1/4');assert.equal(base.r.unique['net:硅晶圆'],'1/2');
const old=solveDirectRateProblem(compileExactRateProblem(base.g,{inletPolicy:'relaxed'}),arith,{ms:10000});assert.equal(old.status,'sat');assert.equal(old.unique['duty:consumer'],'1');assert.equal(old.unique['net:齿轮组'],'1/6');
function measured(){
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify({inbound:sim.inbound,sent:sim.byMachine.M8.sent,active:sim.frozenRuntime.consumer.activeTime})'));
 const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
 return {duty:(b.active-a.active)/3600,gear:((b.inbound['齿轮组']||0)-(a.inbound['齿轮组']||0))/60,silicon:((b.inbound['硅晶圆']||0)-(a.inbound['硅晶圆']||0))/60,physical:((b.sent[item]||0)-(a.sent[item]||0))/60};
}
const actual=measured();assert(Math.abs(actual.duty-.75)<1e-6,JSON.stringify(actual));assert.deepEqual([actual.gear,actual.silicon,actual.physical],[15,30,30]);
const cases=[];
for(const [rate,duty,flow] of [['2','1/2','0'],['2/5','5/6','2/3'],['2/7','7/8','3/4'],['4/5','5/8','1/2']]){
 layout.frozenFactories[1].rates[item]='-'+rate;layout.frozenFactories[1].rates[product]=rate;
 const x=solve();assert.equal(x.r.unique['duty:consumer'],duty);assert.equal(x.r.unique['routeTotal:R4'],flow);cases.push({rate,duty,flow});
}
const boundary=structuredClone(base.g);boundary.frozen.find(f=>f.id==='consumer').rates[item]='-1/2';assert.equal(prove(boundary,arith).duties.length,0);
const shared=structuredClone(base.g);shared.frozen.push({id:'rival',rates:{[item]:'-1'}});assert.equal(prove(shared,arith).duties.length,0);
const multi=structuredClone(base.g);multi.frozen.find(f=>f.id==='consumer').rates['合金板']='-1';assert.equal(prove(multi,arith).duties.length,0);
const reversed=structuredClone(base.g);reversed.frozen.reverse();assert.equal(prove(reversed,arith).duties.length,0);
// Physical periodic source branch, real catalog titanium generator.
const physical=structuredClone(fixture.layout);physical.machines=physical.machines.filter(m=>['M0','M1','M8','M10','M12'].includes(m.id));physical.routes=physical.routes.filter(r=>['R0','R4','R6'].includes(r.id));physical.frozenFactories=[{id:'consumer',name:'consumer',enabled:true,rates:{[item]:'-1/11',[product]:'1/11'}}];c.physical=physical;run('state=physical');assert(run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))').every(v=>!v));
const p=solve();assert.equal(p.r.unique['duty:consumer'],'11/15');assert.equal(p.r.unique['routeTotal:R4'],'1/15');assert.equal(p.r.unique['net:齿轮组'],'1/30');
const report={base:{proof:base.p,unique:Object.keys(base.r.unique).length,duty:base.r.unique['duty:consumer'],gear:base.r.unique['net:齿轮组'],oldDuty:old.unique['duty:consumer'],oldGear:old.unique['net:齿轮组'],actual},cases,physical:{proof:p.p,unique:Object.keys(p.r.unique).length,gear:p.r.unique['net:齿轮组']},rejected:4};
fs.writeFileSync(path.join(__dirname,'frozen-protected-item-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
