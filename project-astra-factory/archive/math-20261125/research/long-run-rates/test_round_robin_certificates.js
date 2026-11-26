'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const {arith}=require('./run_direct'),{factoryDirectRoundRobinCertificates:certify,roundRobinRateRelations:relations}=require('./round_robin_certificates');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
c.layout=JSON.parse(fs.readFileSync(path.join(__dirname,'legal-net-branch.json'),'utf8')).layout;
const g=JSON.parse(vm.runInContext('state=layout;JSON.stringify(factoryCompileDirectGraph())',c));
const {proveGeneralBatchCadence}=require('./general_batch_cadence'),{refillInvariant}=require('./refill_invariant'),{proveBatchBackpressure}=require('./batch_backpressure_bounds');
const p=proveGeneralBatchCadence(g,arith,refillInvariant,proveBatchBackpressure);
const original=certify(g,arith,p.supply);
assert.equal(original.length,1);
assert.equal(original[0].totalRate,'1');
assert.deepEqual(original[0].unskipped,['R2']);
assert.deepEqual(relations(original[0]).upper,[['R1','R2']]);
function router(kind,n,k,terminal=true){
 const item='test-item',id='router',nodes=[{id,type:kind,physicalInCount:kind==='分流'?1:n,physicalOutCount:kind==='分流'?n:1}],lines=[],proofs=[];
 function route(id,from,to,fromPort,toPort){lines.push({id,from,to,fromPort,toPort,materials:[item],active:true,compatible:true,length:3});}
 if(kind==='分流'){
  nodes.push({id:'source',type:'采矿'});route('common','source',id,0,0);proofs.push({route:'common',interval:'1'});
  for(let i=0;i<n;i++){nodes.push({id:'node'+i,type:i<k?'仓入':'冶炼'});route('branch'+i,id,'node'+i,i,0);}
 }else{
  nodes.push({id:'target',type:terminal?'仓入':'冶炼'});route('common',id,'target',0,0);
  for(let i=0;i<n;i++){nodes.push({id:'node'+i,type:'采矿'});route('branch'+i,'node'+i,id,0,i);if(i<k)proofs.push({route:'branch'+i,interval:'1'});}
 }
 return {g:{status:'compiled',completePhysicalRoutes:true,nodes,lines},proofs};
}
let structural=0;
for(const kind of ['分流','汇流'])for(let n=1;n<=12;n++)for(let k=0;k<=n;k++)for(const terminal of [false,true]){
 const {g,proofs}=router(kind,n,k,terminal),cert=certify(g,arith,proofs);
 const expected=kind==='分流'?k>=1:k>=2||k===1&&terminal;
 assert.equal(cert.length,Number(expected),JSON.stringify({kind,n,k,terminal}));
 if(expected){
  const rel=relations(cert[0]);
  const u=kind==='汇流'&&k<2?0:k;
  assert.equal(rel.equal.length,Math.max(0,u-1));assert.equal(rel.upper.length,u?n-u:0);
  assert.equal(rel.totalRate,kind==='分流'||terminal?'1':null);
  assert.equal(rel.conservation.parts.length,n);
 }
 structural++;
}
// Exhaustive finite checks of the combinatorial cyclic-scan invariant.
// These enumerate abstract choice words for implementation verification,
// not physical time or production events in the rate solver.
let scanChecks=0;
for(let n=2;n<=5;n++)for(let fixed=1;fixed<1<<n;fixed++){
 const ready=Array.from({length:n},(_,i)=>i).filter(i=>fixed>>i&1);
 const allowed=Array.from({length:1<<n},(_,i)=>i).filter(i=>(i&fixed)===fixed);
 function scan(cursor,counts,depth){
  if(!depth){for(const i of ready)for(let j=0;j<n;j++)assert(counts[j]<=counts[i]+1);for(const i of ready)for(const j of ready)assert(Math.abs(counts[i]-counts[j])<=1);scanChecks++;return;}
  for(const mask of allowed){let i=cursor;while(!(mask>>i&1))i=(i+1)%n;const next=counts.slice();next[i]++;scan((i+1)%n,next,depth-1);}
 }
 for(let c=0;c<n;c++)scan(c,Array(n).fill(0),3);
}
const r={structural,scanChecks,original:original.map(relations)};
fs.writeFileSync(path.join(__dirname,'round-robin-certificate-results.json'),JSON.stringify(r,null,2));console.log(JSON.stringify(r));
