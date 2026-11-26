'use strict';
const assert=require('assert/strict'),{arith}=require('../support/production'),{solveFactoredCounts:solve}=require('../support/production'),{solveDirectRateProblem:old}=require('../support/production');
let seed=53871;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;};
for(let trial=0;trial<80;trial++){
 const n=1+rnd(7),cmd=['(set-logic QF_LRA)'],obs={},sums=[];
 for(let i=0;i<n;i++){
  const x='x'+i,y='y'+i,z='z'+i,h=1+rnd(12);
  for(const v of [x,y,z]){cmd.push('(declare-const '+v+' Real)');obs[v]=v;}
  cmd.push('(assert (<= 0 '+x+'))','(assert (<= 0 '+y+'))','(assert (= '+z+' (+ '+x+' '+y+')))','(assert (= '+z+' '+h+'))');
  if(rnd(3)===0)cmd.push('(assert (= '+x+' '+rnd(h+1)+'))');
  sums.push(z);
 }
 cmd.push('(declare-const total Real)','(assert (= total (+ '+sums.join(' ')+')))');obs.total='total';
 const p={status:'compiled',smt:cmd.join('\n'),observables:obs},a=solve(p,arith),b=old(p,arith);
 assert.equal(a.status,'sat');assert.equal(b.status,'sat');assert.deepEqual(a.unique,b.unique);assert.deepEqual(a.multiple.sort(),b.multiple.sort());assert(Object.hasOwn(a.unique,'total'));
}
const n=100,cmd=['(set-logic QF_LRA)'],obs={};for(let i=0;i<n;i++){const x='x'+i,y='y'+i;for(const k of [x,y]){cmd.push('(declare-const '+k+' Real)');obs[k]=k;}cmd.push('(assert (<= 0 '+x+'))','(assert (<= 0 '+y+'))','(assert (= (+ '+x+' '+y+') 1))');}
cmd.push('(declare-const total Real)','(assert (= total (+ '+Object.keys(obs).join(' ')+')))');obs.total='total';
const p={status:'compiled',smt:cmd.join('\n'),observables:obs},r=solve(p,arith);assert.equal(r.status,'sat');assert.equal(r.unique.total,'100');assert.equal(r.multiple.length,200);assert.equal(r.stats.factors.length,100);
const bad=solve({...p,smt:p.smt+'\n(assert (<= x0 (- 1)))'},arith);assert.equal(bad.status,'unsat');
console.log(JSON.stringify({random:80,independentFactors:r.stats.factors.length,unique:r.unique,nonunique:r.multiple.length,directions:r.stats.directions}));


// One large factor is intentionally over the resource cap. A constant
// and a separate simple forced direction are still exact invariants.
{
 const smt=['(set-logic QF_LRA)',...['x','y','c','w','total'].map(k=>'(declare-const '+k+' Real)'),
 '(assert (= c 7))','(assert (<= w 2))','(assert (<= 2 w))',
 '(assert (= total (+ c w)))','(assert (<= 1 x))','(assert (<= 1 y))','(assert (<= 3 (+ x y)))','(assert (<= (+ x y) 5))','(assert (<= (+ x (* 2 y)) 8))'].join('\n');
 const p={status:'compiled',smt,observables:{x:'x',y:'y',c:'c',w:'w',total:'total'}};
 const r=solve(p,arith,{maxRows:3,partialFactors:true});
 assert.equal(r.status,'partial');assert.equal(r.globallyFeasible,false);assert.equal(r.witness,null);
 assert.equal(r.unique.c,'7');assert.equal(r.unique.w,'2');assert.equal(r.unique.total,'9');assert(r.unresolved.includes('x')&&r.unresolved.includes('y'));
 const bad=solve({...p,smt:p.smt+'\n(assert (= c 8))'},arith,{maxRows:3,partialFactors:true});assert.equal(bad.status,'unsat');
}

{
 const p={status:'compiled',smt:'(set-logic QF_LRA)\n(declare-const x Real)\n(declare-const y Real)\n(assert (<= 0 x))\n(assert (<= 0 y))\n(assert (<= (* 3 x) y))\n(assert (<= y 1))',observables:{x:'x',y:'y'}};
 const r=solve(p,arith,{maxRows:1,partialFactors:true});
 assert.equal(r.status,'sat');assert(r.stats.factors[0].strictInterior);assert.equal(r.multiple.length,2);
}

{
 const p={status:'compiled',smt:'(set-logic QF_LRA)\n(declare-const x Real)\n(declare-const y Real)\n(assert (<= (/ 1 3) x))\n(assert (<= 0 y))\n(assert (<= (* 3 y) x))\n(assert (<= x 1))',observables:{x:'x',y:'y'}};
 const r=solve(p,arith,{maxRows:1,partialFactors:true});
 assert.equal(r.status,'sat');assert(r.stats.factors[0].strictInterior);assert.equal(r.stats.factors[0].origin,false);assert.equal(r.multiple.length,2);
 const bad=solve({...p,smt:p.smt+'\n(assert (<= x (/ 1 4)))'},arith);
 assert.equal(bad.status,'unsat');
}
