'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{refillInvariant}=require('./refill_invariant'),{proveGeneralBatchCadence}=require('./general_batch_cadence'),{proveBatchBackpressure}=require('./batch_backpressure_bounds'),{compileExactRateProblem}=require('./compile_exact'),{solveDirectRateProblem}=require('./direct_algebra');
const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
const root=path.resolve(__dirname,'../..');
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
c.layout=JSON.parse(fs.readFileSync(path.join(__dirname,'legal-net-branch.json'))).layout;
const compile=(s='factoryCompileDirectGraph()')=>JSON.parse(vm.runInContext('JSON.stringify('+s+')',c));
vm.runInContext('state=layout',c);
const base=compile();
function solve(g){
 const p=proveGeneralBatchCadence(g,arith,refillInvariant,proveBatchBackpressure);
 const r=solveDirectRateProblem(compileExactRateProblem(g,{batchRefillCertificates:p.certificates,machineRateCertificates:p.rateCertificates}),arith,{ms:10000});
 return {p,r};
}
const original=solve(base);
assert.equal(original.r.status,'sat');assert.equal(original.r.unique['net:小行星矿石'],'3/4');assert.equal(original.r.multiple.length,0);
assert.equal(original.p.certificates.length,1);
const cases=[];
for(const [b,q,T,F,H,L,C] of [[1,1,2,3,4,6,20],[2,3,2,3,9,6,40],[3,2,2,3,8,6,60],[2,4,2,3,9,6,40],[2,3,2,3,5,6,40],[3,5,2,3,7,6,60],[3,2,2,3,4,6,60],[2,3,2,3,9,1,2],[2,3,2,3,9,1,40],[1,1,3,4,4,6,20]]){
 const p=proveBatchBackpressure({batch:b,demand:q,producerPeriod:T,inputReady:F,downstream:{period:H,phases:[0]},beltLength:L,outputCapacity:C,receiverCapacity:3*q},arith);
 if(p.status!=='not-proved'){
  assert.equal(p.rate,arith.txt(arith.div(arith.q(q),arith.mul(arith.q(b),arith.q(H)))));
  assert(p.lower.every((a,i)=>arith.cmp(arith.q(a),arith.q(p.upper[i]))<=0));
 }
 cases.push({b,q,T,F,H,L,C,...p});
}
assert.equal(cases[1].status,'proven-envelope');assert.equal(cases[1].rate,'1/6');
assert.equal(cases[2].status,'proven-cadence');assert.equal(cases[2].rate,'1/12');
assert.equal(cases.at(-1).status,'not-proved');
// Vary the physical recipe quantities in a symbolic graph; the structural
// proof derives all bounds from the graph, not from fixture ID or results.
const synthetic=structuredClone(base),sm=synthetic.nodes.find(m=>m.id==='M4'),asm=synthetic.nodes.find(m=>m.id==='M6');
sm.recipe.qty=3;asm.recipe.inputs['钛合金锭']=2;asm.recipe.inputs['合金板']=4;asm.recipe.seconds=8;
const multi=solve(synthetic);
assert.equal(multi.r.status,'sat');
assert.equal(multi.p.cadences.find(x=>x.machine==='M4').rate,'1/12');
assert.equal(multi.p.cadences.find(x=>x.machine==='M4').status,'proven-cadence');
assert.equal(multi.r.unique['cycle:M4'],'1/12');
assert.equal(multi.r.unique['cycle:M6'],'1/8');
const originals=[];
for(const f of ['tests/fixtures/ast1-warp-coil-double-inlet-v1.txt','tests/fixtures/ast1-warehouse-port-balance-v1.txt']){
 c.ast=fs.readFileSync(path.join(root,f),'utf8').trim();vm.runInContext('state=ast1Decode(ast)',c);
 const g=compile(),x=solve(g);
 assert.equal(x.r.status,'sat',JSON.stringify({f,proof:x.p}));
 const r=x.r.unique['net:曲速线圈'];assert.equal(r,f.includes('double-inlet')?'1/99':'11/1440');
 originals.push({f,certificates:x.p.certificates.length,rates:x.p.rateCertificates.length,net:r,unknown:x.r.multiple.length});
}
// The theorem is closed under bounded phase envelope composition.
let d={period:'9',phases:['0']};const envelopes=[];
for(let i=0;i<24;i++){
 const b=i?1:2,q=i?1:3;
 d=proveBatchBackpressure({batch:b,demand:q,producerPeriod:2,inputReady:3,downstream:d,beltLength:6,outputCapacity:20*b,receiverCapacity:3*q},arith);
 assert.equal(d.status,'proven-envelope');assert.equal(d.rate,'1/6');assert.equal(d.period,'18');
 envelopes.push({depth:i+1,status:d.status,minGap:d.minGap,rate:d.rate});
}
const rational=proveBatchBackpressure({batch:3,demand:2,producerPeriod:'2001/1000',inputReady:'2999/1000',downstream:{period:'8003/1000',phases:['0']},beltLength:6,outputCapacity:60,receiverCapacity:6},arith);
assert.equal(rational.status,'proven-cadence');assert.equal(rational.rate,'2000/24009');
const invalidEnvelope=proveBatchBackpressure({batch:2,demand:3,producerPeriod:2,inputReady:3,downstream:{period:'9',lower:['1'],upper:['0']},beltLength:6,outputCapacity:40,receiverCapacity:9},arith);
assert.equal(invalidEnvelope.status,'not-proved');
const report={original:{proof:original.p,net:original.r.unique['net:小行星矿石'],unknown:original.r.multiple.length},synthetic:{proof:multi.p,net:multi.r.unique['net:小行星矿石'],unknown:multi.r.multiple.length},cases,originals,envelopes,rational};
fs.writeFileSync(path.join(__dirname,'general-batch-cadence-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({original:report.original.net,originalUnknown:report.original.unknown,synthetic:report.synthetic.proof.cadences.map(({machine,status,rate,minGap,period,batchCount})=>({machine,status,rate,minGap,period,batchCount})),cases:cases.map(({b,q,status,rate,minGap,period,batchCount})=>({b,q,status,rate,minGap,period,batchCount})),originals,envelopeDepth:envelopes.length,rational:rational.rate}));
