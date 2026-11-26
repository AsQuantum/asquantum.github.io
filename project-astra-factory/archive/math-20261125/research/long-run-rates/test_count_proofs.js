'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveRouteClearance,proveUnthrottledGenerators,resolveRoundRobinCounts}=require('./rr_bounded_service');
const {factoryDirectRoundRobinCertificates:rr}=require('./round_robin_certificates'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
const {proveGeneralBatchCadence}=require('./general_batch_cadence'),{refillInvariant}=require('./refill_invariant'),{proveBatchBackpressure}=require('./batch_backpressure_bounds');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
c.layout=JSON.parse(fs.readFileSync(path.join(__dirname,'legal-net-branch.json'),'utf8')).layout;
const g=JSON.parse(vm.runInContext('state=layout;JSON.stringify(factoryCompileDirectGraph())',c));
function certify(g){
 const cadence=proveGeneralBatchCadence(g,arith,refillInvariant,proveBatchBackpressure),clearance=proveRouteClearance(g,arith),sources=proveUnthrottledGenerators(g,arith,clearance),routers=rr(g,arith,cadence.supply);
 const p=compileCountProofProblem(g,arith,{machineRates:[...cadence.rateCertificates,...sources],refills:cadence.certificates,roundRobin:routers});
 const result=solveDirectRateProblem(p,arith,{ms:10000});
 return {cadence,clearance:[...clearance.values()],sources,routers,result};
}
const base=certify(g);
assert.equal(base.result.status,'sat');assert.equal(base.result.unique['net:小行星矿石'],'3/4');assert.equal(base.result.unique['net:复合装甲板'],'1/4');assert.equal(base.result.unique['cycle:M4'],'1/4');assert.equal(base.result.multiple.length,0);
const bare=solveDirectRateProblem(compileCountProofProblem(g,arith),arith,{ms:10000});
assert.equal(bare.status,'sat');assert(!Object.hasOwn(bare.unique,'net:小行星矿石'));
function star(fast,slow,depth=0){
 const item='x',nodes=[],lines=[],g={status:'compiled',completePhysicalRoutes:true,nodes,lines,pools:[{item,order:[]}],frozen:[],unlimited:false};
 function m(id,type,ni,no,recipe){nodes.push({id,type,physicalInCount:ni,physicalOutCount:no,inputPriority:Array.from({length:ni},(_,i)=>i),recipe});}
 function e(id,from,to,port=0,out=0){lines.push({id,from,to,fromPort:out,toPort:port,materials:[item],active:true,compatible:true,length:3});}
 m('M','汇流',fast+slow,1);m('W','仓入',1,0);
 let prev='M';
 for(let j=0;j<depth;j++){const id='relay'+j;m(id,'汇流',1,1);e('out'+j,prev,id);prev=id;}
 e('final',prev,'W');
 for(let i=0;i<fast+slow;i++){
  const b=i<fast?1:2+i%3;
  // Choose a slow source T with independently proven clearance slack.
  const T=i<fast?1:b*(fast+slow+4+3*depth)*2;
  m('G'+i,'采矿',0,1,{output:item,qty:b,seconds:T,inputs:{}});e('f'+i,'G'+i,'M',i);
 }
 return g;
}
const cases=[];
for(const n of [2,3,4,6,8,12])for(const slow of [0,1,2]){
 const s=star(n,slow),a=certify(s);
 assert.equal(a.result.status,'sat');
 assert.equal(a.result.unique['net:x'],'1');
 assert.equal(a.result.multiple.length,0,JSON.stringify(a.result.multiple));
 let remainder=arith.U;
 for(let i=n;i<n+slow;i++){
  const m=s.nodes.find(m=>m.id==='G'+i),v=arith.div(arith.q(m.recipe.qty),arith.q(m.recipe.seconds));remainder=arith.sub(remainder,v);
  assert.equal(a.result.unique['routeTotal:f'+i],arith.txt(v));
 }
 const x=arith.txt(arith.div(remainder,arith.q(n)));
 for(let i=0;i<n;i++)assert.equal(a.result.unique['routeTotal:f'+i],x);
 const projected=resolveRoundRobinCounts(a.routers.find(r=>r.machine==='M'),new Map(a.sources.map(p=>[p.route,p.flow])),arith);
 assert.equal(projected.status,'proved');assert.equal(projected.rates.get('f0'),x);
 cases.push({fast:n,slow,fastRate:x,unique:Object.keys(a.result.unique).length});
}
const deep=star(2,1,12),deepProof=certify(deep);
assert.equal(deepProof.result.status,'sat');
assert.equal(deepProof.sources.length,1);
assert.equal(deepProof.result.unique['cycle:G2'],arith.txt(arith.div(arith.U,arith.q(deep.nodes.find(m=>m.id==='G2').recipe.seconds))));
// A source faster than its conservative clearance bound is not certified.
const unsafe=star(2,1);unsafe.nodes.find(m=>m.id==='G2').recipe.seconds=2;
assert(!proveUnthrottledGenerators(unsafe,arith).some(p=>p.machine==='G2'));
// Closed merger cycle has no free root and cannot self-certify.
const closed=star(2,1);closed.nodes.find(m=>m.id==='W').type='汇流';closed.nodes.find(m=>m.id==='W').physicalOutCount=1;closed.nodes.find(m=>m.id==='M').physicalInCount++;closed.lines.push({...closed.lines[0],id:'feedback',from:'W',to:'M',toPort:3});assert.equal(proveRouteClearance(closed,arith).size,0);
const summary={base:{unique:Object.keys(base.result.unique).length,unknown:base.result.multiple.length,ore:base.result.unique['net:小行星矿石'],armor:base.result.unique['net:复合装甲板'],bareUnknown:bare.multiple.length},cases,deep:{routes:deepProof.clearance.length,source:deepProof.sources[0],unknown:deepProof.result.multiple.length},rejections:2};
fs.writeFileSync(path.join(__dirname,'count-proof-results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
