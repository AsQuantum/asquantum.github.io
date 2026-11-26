'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {arith}=require('./run_direct'),{solveDirectRateProblem}=require('./direct_algebra'),{solvePeriodicServiceWord}=require('./periodic_resource_algebra');
const solve=(g,w)=>solvePeriodicServiceWord(g,w,arith,solveDirectRateProblem,{ms:5000});
const net={places:[{id:'ingredient',capacity:3,initial:3}],transitions:[
 {id:'batch',pre:{ingredient:3},cooldown:4},
 {id:'right',post:{ingredient:1},cooldown:1,group:'ingredient',priority:0},
 {id:'left',post:{ingredient:1},cooldown:1,group:'ingredient',priority:1}
]};
const correct=solve(net,['batch','right','left','right']);
assert.equal(correct.status,'conditional-word',JSON.stringify(correct));assert.equal(correct.period,'4');assert.equal(correct.periodUnique,true);assert.equal(correct.rates.right,'1/2');assert.equal(correct.rates.left,'1/4');
const allRight=solve(net,['batch','right','right','right']);assert.equal(allRight.status,'unsat',JSON.stringify(allRight));
const allLeft=solve(net,['batch','left','left','left']);assert.equal(allLeft.status,'unsat',JSON.stringify(allLeft));
const extraLeft=solve(net,['batch','right','left','left']);assert.equal(extraLeft.status,'priority-infeasible',JSON.stringify(extraLeft));
const overfill=solve(net,['right','batch','left','right']);assert.equal(overfill.status,'invalid-word');
console.log('Shared resource allocation:',correct.period,correct.rates,'alternatives',allRight.status,allLeft.status,extraLeft.status,overfill.status);
// All operations are compiled through the same resource rule; no knowledge of
// machine names, type, graph depth, or expected rates.
let cases=0;
for(let n=1;n<=5;n++)for(let batch=1;batch<=9;batch++){
 const T=Math.ceil(batch/n)+2,places=[{id:'q',capacity:batch,initial:batch}],transitions=[{id:'batch',pre:{q:batch},cooldown:T}];
 for(let i=0;i<n;i++)transitions.push({id:'input'+i,post:{q:1},cooldown:1,group:'q',priority:i});
 const word=['batch',...Array.from({length:batch},(_,i)=>'input'+(i%n))];
 const r=solve({places,transitions},word);
 assert.equal(r.status,'conditional-word',JSON.stringify({n,batch,r}));assert.equal(r.period,String(T));
 cases++;
}
const chains=[];
for(const depth of [1,4,12,24]){
 const places=Array.from({length:depth},(_,i)=>({id:'q'+i,initial:0,capacity:1,delay:'1/'+(depth+1)}));
 const transitions=Array.from({length:depth+1},(_,i)=>({id:'t'+i,cooldown:3,pre:i?{['q'+(i-1)]:1}:{},post:i<depth?{['q'+i]:1}:{}}));
 const r=solve({places,transitions},transitions.map(t=>t.id));
 assert.equal(r.status,'conditional-word',JSON.stringify({depth,r}));assert.equal(r.period,'3');
 chains.push({depth,period:r.period,rates:r.rates.t0});
}
// Search the entire one-batch word class for a general n-port resource,
// not a specific AST layout. This is finite symbolic branching, not time stepping.
const alternatives=[];
for(let bits=0;bits<8;bits++){
 const word=['batch',...Array.from({length:3},(_,i)=>(bits>>i)&1?'left':'right')],r=solve(net,word);
 alternatives.push({word,status:r.status,rates:r.rates});
}
assert.equal(alternatives.filter(r=>r.status==='conditional-word').length,1,JSON.stringify(alternatives));
assert(alternatives.every(r=>['conditional-word','unsat','priority-infeasible','invalid-word'].includes(r.status)));
let seed=319;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const dags=[];
for(let t=0;t<16;t++){
 const n=4+t%7,transitions=Array.from({length:n},(_,i)=>({id:'node'+i,cooldown:'7/3',pre:{},post:{}})),places=[];
 for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)if(rand()<0.32||b===a+1){
  const id='e'+a+'-'+b;places.push({id,capacity:1,initial:0});transitions[a].post[id]=1;transitions[b].pre[id]=1;
 }
 const r=solve({places,transitions},transitions.map(x=>x.id));
 assert.equal(r.status,'conditional-word',JSON.stringify({t,r}));assert.equal(r.period,'7/3');
 dags.push({n,edges:places.length,period:r.period});
}
const result={cases,chains,dags,alternatives,shared:{period:correct.period,rates:correct.rates,allRight:allRight.status,allLeft:allLeft.status,extraLeft:extraLeft.status,overfill:overfill.status}};
fs.writeFileSync(path.join(__dirname,'periodic-resource-tests.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
