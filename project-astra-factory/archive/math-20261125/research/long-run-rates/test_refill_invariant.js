'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{arith}=require('./run_direct');
const {refillInvariant}=require('./refill_invariant'),{compileExactRateProblem}=require('./compile_exact'),{solveDirectRateProblem}=require('./direct_algebra');
const ports=[{id:'right',interval:1},{id:'left',interval:3}];
assert.equal(refillInvariant(3,ports,1,2,arith).status,'not-proved');
const proof=refillInvariant(3,ports,1,4,arith);
assert.deepEqual(proof,{status:'conditional-invariant',required:'3',counts:{right:2,left:1}});
let cases=0,certified=0,seed=531;
function next(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;}
for(let n=1;n<=5;n++)for(let batch=1;batch<=12;batch++)for(let t=0;t<50;t++){
 const ports=Array.from({length:n},(_,i)=>({id:'p'+i,interval:1+next()%5})),gap=1+next()%40;
 const r=refillInvariant(batch,ports,1,gap,arith);cases++;
 if(r.status!=='conditional-invariant')continue;certified++;
 // Independent synthetic event-order check, NOT the long-run solver:
 // arbitrary rational inter-arrival distances within each certified bound.
 for(let z=0;z<10;z++){
  const events=[];
  for(let i=0;i<n;i++){
   let time=0;
   for(let j=0;j<=batch;j++){
    events.push({i,time});time+=4+next()%(4*(ports[i].interval-1)+1);
   }
  }
  events.sort((a,b)=>a.time-b.time||a.i-b.i);
  const counts=Array(n).fill(0);
  for(const e of events.slice(0,batch))counts[e.i]++;
  assert.deepEqual(counts,ports.map(p=>r.counts[p.id]));
  for(let i=0;i<n;i++)assert(events.filter(e=>e.i===i)[counts[i]].time<=gap*4);
 }
}
const graph=JSON.parse(fs.readFileSync(path.join(__dirname,'legal-net-branch.json'),'utf8')).graph;
// Only a conditional check: the >=3-second release gap, ready full input
// cache are NOT yet established statically for this actual topology.
const p=compileExactRateProblem(graph,{inletPolicy:'relaxed',batchRefillCertificates:[{machine:'M4',item:'小行星矿石',provenReady:true,cooldown:'1'}]});
const r=solveDirectRateProblem(p,arith,{ms:5000});
assert.equal(r.status,'sat');assert.equal(r.unique['net:小行星矿石'],'3/4');assert.equal(r.unique['flow:R1|小行星矿石'],'1/4');assert.equal(r.unique['flow:R3|小行星矿石'],'1/2');
console.log(JSON.stringify({cases,certified,proof,conditional:{oreNet:r.unique['net:小行星矿石'],left:r.unique['flow:R1|小行星矿石'],right:r.unique['flow:R3|小行星矿石']},physicalReachabilityProved:false}));
