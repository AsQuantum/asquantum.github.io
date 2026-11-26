'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveExclusiveFrozenDuties:prove}=require('./frozen_exclusive_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
const frozen=[
 {id:'consumer',rates:{'合金板':'-2','钛合金锭':'-1','复合装甲板':'3'}},
 {id:'later',rates:{'复合装甲板':'-3','齿轮组':'2'}},
 {id:'sourceA',rates:{'合金板':'3/4'}},
 {id:'sourceB',rates:{'钛合金锭':'1/2'}}
];
const g={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[],frozen};
const p=prove(g,arith);assert.equal(p.certificates.length,4);
const duties=Object.fromEntries(p.certificates.map(x=>[x.factory,x.duty]));
assert.deepEqual(duties,{sourceA:'1',sourceB:'1',consumer:'3/8',later:'3/8'});
const r=solveDirectRateProblem(compileCountProofProblem(g,arith,{frozenDuties:p.certificates}),arith,{ms:10000});
assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);assert.equal(r.unique['net:齿轮组'],'3/4');
const deep=structuredClone(g);deep.frozen=[{id:'source',rates:{k0:'1/7'}},...Array.from({length:40},(_,i)=>({id:'f'+i,rates:{['k'+i]:'-1',['k'+(i+1)]:'1'}}))].reverse();
const dp=prove(deep,arith);assert.equal(dp.certificates.length,41);assert.equal(dp.certificates.find(x=>x.factory==='f39').duty,'1/7');
const conflict=structuredClone(g);conflict.frozen.push({id:'rival',rates:{'合金板':'-1'}});assert(!prove(conflict,arith).certificates.some(x=>x.factory==='consumer'));
const cyc={...g,frozen:[{id:'a',rates:{x:'-1',y:'1'}},{id:'b',rates:{y:'-1',x:'1'}}]};assert.equal(prove(cyc,arith).certificates.length,0);
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
c.layout={name:'exclusive frozen chains',machines:[],routes:[],frozenFactories:frozen};
vm.runInContext('state=layout;resetSimulation();for(let i=0;i<120000;i++)simulate(.05)',c);
const actual=JSON.parse(vm.runInContext('JSON.stringify(Object.fromEntries(Object.entries(sim.frozenRuntime).map(([k,v])=>[k,v.activeTime/v.totalTime])))',c));
for(const [k,v] of Object.entries(duties))assert(Math.abs(actual[k]-Number(arith.q(v).n)/Number(arith.q(v).d))<.001,JSON.stringify(actual));
const summary={duties,unique:Object.keys(r.unique).length,depth:40,actual,rejections:2};fs.writeFileSync(path.join(__dirname,'frozen-exclusive-results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
