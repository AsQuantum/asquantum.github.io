'use strict';
const assert=require('assert/strict'),{arith}=require('./run_direct'),{proveLocalMeanBound:p,combineLocalMeanBounds:combine}=require('./local_mean_certificate');
// Abstract arbitrary finite buffers: accepts/sends are nondeterministic
// boundary actions. Exact conservation follows for ANY action sequence.
for(let cap=1;cap<=20;cap++){
 const states=Array.from({length:cap+1},(_,i)=>i),edges=[];
 for(const s of states)for(const input of [0,1])for(const output of [0,1]){
  const t=s+input-output;if(t>=0&&t<=cap)edges.push({from:s,to:t,reward:{input,output}});
 }
 for(const sign of [1,-1])assert.equal(p({states,edges,coefficients:{input:sign,output:-sign},bound:0},arith).status,'proved');
 assert.equal(p({states,edges,coefficients:{output:1},bound:'1/2'},arith).status,'not-proved');
}
// Arbitrary connected local buffers, conservation composes by cancelling
// their interface counts without requiring a Cartesian product of states.
const terms=[];
for(let i=0;i<100;i++){
 const states=[0,1,2],edges=[];
 for(const s of states)for(const a of [0,1])for(const d of [0,1]){
  const t=s+a-d;if(t>=0&&t<=2)edges.push({from:s,to:t,reward:{['r'+i]:a,['r'+(i+1)]:d}});
 }
 terms.push({certificate:p({states,edges,coefficients:{['r'+i]:1,['r'+(i+1)]:-1},bound:0},arith),weight:1});
}
assert.deepEqual(combine(terms,arith),{coefficients:{r0:'1',r100:'-1'},bound:'0'});
// A cooldown resource with arbitrary external eligibility. Each action
// consumes its full cooldown. The local bound is exact for arbitrary input.
for(let period=1;period<=30;period++){
 const states=Array.from({length:period},(_,i)=>i),edges=states.map(i=>({from:i,to:Math.max(0,i-1),reward:{send:0}}));
 edges.push({from:0,to:period-1,reward:{send:1}});
 assert.equal(p({states,edges,coefficients:{send:1},bound:'1/'+period},arith).status,'proved');
 assert.equal(p({states,edges,coefficients:{send:1},bound:'1/'+(period+1)},arith).status,'not-proved');
}
console.log('local mean certificates: 20 capacities, 100 composed interfaces, 30 cooldown periods PASS');
