'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveFrozenTokenRings:prove}=require('./frozen_token_ring_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
function ring(rates){
 const items=rates.map((_,i)=>'material-'+i);
 return {status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[],frozen:rates.map((rate,i)=>({id:'f'+i,rates:{[items[i]]:'-'+rate,[items[(i+1)%items.length]]:rate}}))};
}
const cases=[];
for(const [rates,k,expected] of [
 [['1','1'],0,'0'],[['1','1'],1,'1/2'],[['1','1'],2,'1'],[['1','1'],7,'1'],
 [['1','1/2'],1,'1/3'],[['1','1/2'],2,'1/2'],
 [['2/3','3/5','5/7'],1,'30/137'],
 [['1','1','1'],2,'2/3'],[['1','1','1'],3,'1'],
 [Array(40).fill('1'),17,'17/40']
]){
 const g=ring(rates),p=prove(g,arith,{'material-0':k});
 assert.equal(p.rings.length,1);assert.equal(p.rings[0].rate,expected);
 const r=solveDirectRateProblem(compileCountProofProblem(g,arith,{frozenDuties:p.certificates}),arith,{ms:10000});
 assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);
 for(const f of p.certificates)assert.equal(r.unique['duty:'+f.factory],f.duty);
 cases.push({n:rates.length,tokens:k,rate:expected,queries:Object.keys(r.unique).length});
}
const g=ring(['1','1']);g.frozen.push({id:'source',rates:{'material-0':'1'}});assert.equal(prove(g,arith,{'material-0':1}).certificates.length,0);
const unequal=ring(['1','1']);unequal.frozen[0].rates['material-1']='2';assert.equal(prove(unequal,arith,{'material-0':1}).certificates.length,0);
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const A='合金板',B='硅晶圆';
const frozen=[{id:'a',rates:{[A]:'-1',[B]:'1'}},{id:'b',rates:{[B]:'-1',[A]:'1'}}];
c.layout={name:'seeded conserved-token oscillator',machines:[],routes:[],frozenFactories:frozen};
const run=s=>vm.runInContext(s,c);
const observations=[];
for(const dt of [.05,.025,.01]){
 c.dt=dt;run("state=layout;resetSimulation();ware={'合金板':1};for(let i=0;i<Math.round(120/dt);i++)simulate(dt)");
 const snap=()=>JSON.parse(run("JSON.stringify({inbound:sim.inbound,activeA:sim.frozenRuntime.a.activeTime,activeB:sim.frozenRuntime.b.activeTime,stock:ware})"));
 const a=snap();run('for(let i=0;i<Math.round(600/dt);i++)simulate(dt)');const b=snap();
 const countA=(b.inbound[B]||0)-(a.inbound[B]||0),countB=(b.inbound[A]||0)-(a.inbound[A]||0);
 const dutyA=(b.activeA-a.activeA)/600,dutyB=(b.activeB-a.activeB)/600;
 assert.equal((b.stock[A]||0)+(b.stock[B]||0),1);
 assert(dutyA+dutyB>1.001,'expected same-tick reuse of elapsed service time');
 assert(Math.abs(dutyA-1/(2-dt))<.002,JSON.stringify({dt,dutyA}));
 observations.push({dt,countA,countB,dutyA,dutyB,ideal:.5,observedModel:1/(2-dt)});
}
const report={cases,observations,scope:'continuous ring formula; fixed-step HTML comparison exposes same-tick credit overlap; not equivalent'};
fs.writeFileSync(path.join(__dirname,'frozen-token-ring-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
