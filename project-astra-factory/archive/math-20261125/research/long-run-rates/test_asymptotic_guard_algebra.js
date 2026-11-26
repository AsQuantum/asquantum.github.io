'use strict';
const assert=require('assert/strict'),fs=require('fs');
const {arith}=require('./run_direct'),{makeBDD,makeWords}=require('./symbolic_bdd'),{deriveAsymptoticRelations:derive,saturateEqualities:sat}=require('./asymptotic_guard_algebra');
const report=[];
{
 const p=sat([{coefficients:{x:1,y:1,z:1},constant:1},{coefficients:{a:1,b:1,x:-1},constant:0}],{x:[0,1],y:[1,1],z:[0,1],a:[0,1],b:[0,1]},arith);
 assert.equal(p.status,'proved');for(const k of ['x','z','a','b'])assert.equal(p.values[k],'0');
 assert.equal(sat([{coefficients:{x:1,y:1},constant:-1}],{x:[0,1],y:[0,1]},arith).status,'contradiction');
}
for(const n of [2,3,4,7]){
 const b=makeBDD(),w=makeWords(b),bits=Math.ceil(Math.log2(n)),cur=Array.from({length:bits},(_,i)=>b.variable(2*i)),stall=b.variable(2*bits),reset=b.variable(2*(bits+1));
 const domain=w.lt(cur,w.c(n)),phase=Array.from({length:n},(_,i)=>w.eq(cur,w.c(i)));
 const advance=w.pick(phase[n-1],w.c(0),w.add(cur,w.c(1))).slice(0,bits);
 // Rare deviations can either freeze or reset the cyclic service clock.
 // No periodicity assumption about the arbitrary external actions.
 const next=w.pick(reset,w.c(0),w.pick(stall,cur,advance)).slice(0,bits);
 const exception=b.or(stall,reset),success=b.not(exception);
 const rewards={...Object.fromEntries(phase.map((p,i)=>['phase'+i,[p]])),throughput:[success]};
 const guards={exception};
 const p=derive(b,next,rewards,arith,{domain,basis:phase,guards,known:{throughput:'1'},variableCount:bits+2});
 assert.equal(p.status,'proved-relations',JSON.stringify(p));assert.equal(p.values.exception,'0');
 for(let i=0;i<n;i++)assert.equal(p.values['phase'+i],arith.txt(arith.div(arith.U,arith.q(n))));
 assert(!Object.hasOwn(p.proofs[0].values,'phase0'),'one unrestricted equality system cannot determine phase shares');
 const q=derive(b,next,rewards,arith,{domain,basis:phase,guards,variableCount:bits+2});
 assert(q.unresolved.includes('phase0'),'without proved saturation no invented phase rate');
 assert.equal(derive(b,next,rewards,arith,{domain,basis:phase,guards,known:{throughput:'2'},variableCount:bits+2}).status,'contradiction');
 report.push({name:'saturated cyclic service with arbitrary rare resets',phases:n,proofs:p.proofs,unknownWithoutSaturation:q.unresolved});
}
{
 // Two upstream interfaces may each be ready half the time. The local
 // joint constraints, not multiplication of the marginals, determine
 // the actual synchronization event. An exclusive alternative consumes
 // exactly one of the two whenever either is ready.
 const b=makeBDD(),a=b.variable(0),c=b.variable(2),both=b.and(a,c),either=b.or(a,c);
 const r={join:[both],union:[either]},guards={a,c};
 const known={a:'1/2',c:'1/2'};
 const p=derive(b,[],r,arith,{guards,known,variableCount:2});
 assert(p.unresolved.includes('join'));
 const same=derive(b,[],r,arith,{guards,known:{...known,union:'1/2'},variableCount:2});
 assert.equal(same.values.join,'1/2');
 const opposite=derive(b,[],r,arith,{guards,known:{...known,union:'1'},variableCount:2});
 assert.equal(opposite.values.join,'0');
 report.push({name:'correlated inter-component readiness',marginalOnly:p.unresolved,same:same.values,opposite:opposite.values});
}
fs.writeFileSync(__dirname+'/asymptotic-guard-algebra-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
