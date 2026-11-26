'use strict';
const fs=require('fs'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{makeBDD,makeWords}=require('./symbolic_bdd'),{makeRateAlgebra}=require('./direct_algebra'),{deriveSymbolicRelations:derive,deriveProjectedRelations:project,composeMeanRelations:compose}=require('./symbolic_relation_algebra');
function implies(p,coeff,constant){
 const A=makeRateAlgebra(arith),{q,variable,constant:con,neg,plus,pivot,vars,val}=A,keys=[...new Set([...Object.keys(coeff),...p.relations.flatMap(r=>Object.keys(r.coefficients))])],s=new Map();
 const row=(c,v)=>Object.entries(c).reduce((r,[k,w])=>plus(r,variable(keys.indexOf(k)),q(w)),con(neg(q(v))));
 for(const r of p.relations)assert(pivot(row(r.coefficients,r.constant),s));
 const v=A.substitute(row(coeff,constant),s);return !vars(v).length&&!val(v).n;
}
const report=[];
for(const n of [2,3,4]){
 const b=makeBDD({ms:20000}),w=makeWords(b),bits=Math.ceil(Math.log2(n)),cur=Array.from({length:bits},(_,i)=>b.variable(2*i)),ready=Array.from({length:n},(_,i)=>b.variable(2*(bits+i))),match=Array.from({length:n},(_,i)=>b.variable(2*(bits+n+i)));
 // Actual splitter scanning contract: successful send advances cursor;
 // physical blockage is skipped, incompatible filter stops the scan.
 let next=cur.slice(),r={};const sent=Array(n).fill(0),cross=Array(n).fill(0),skipped=Array(n).fill(0);
 for(let i=0;i<n;i++){
  let enabled=w.eq(cur,w.c(i));
  for(let k=0;k<n;k++){
   const j=(i+k)%n,ok=b.and(enabled,b.and(match[j],ready[j]));
   sent[j]=b.or(sent[j],ok);
   for(let t=0;t<=k;t++){const h=(i+t)%n;cross[h]=b.or(cross[h],ok);if(t<k)skipped[h]=b.or(skipped[h],ok);}
   next=w.pick(ok,w.c((j+1)%n),next);
   enabled=b.and(enabled,b.and(match[j],b.not(ready[j])));
  }
 }
 for(let i=0;i<n;i++){r['send'+i]=[sent[i]];r['cross'+i]=[cross[i]];r['skip'+i]=[skipped[i]];}
 const domain=w.lt(cur,w.c(n)),basis=Array.from({length:n},(_,i)=>w.eq(cur,w.c(i)));
 const p=derive(b,next,r,arith,{domain,basis,variableCount:bits+2*n});
 assert.equal(p.status,'proved');assert.equal(p.observableRank,2*n-1);
 for(let i=0;i<n;i++){assert(implies(p,{['cross'+i]:1,['send'+i]:-1,['skip'+i]:-1},0));if(i)assert(implies(p,{['cross'+i]:1,cross0:-1},0));}
 assert(!implies(p,{send0:1,send1:-1},0),'dynamic readiness cannot force equal sends');
 // Eliminate a correlated but irrelevant global state bit. The exact
 // projection retains the possible local boundary valuations.
 const extra=b.variable(2*(bits+2*n)),globalDomain=b.and(domain,b.eq(extra,ready[0])),globalNext=[...next,...Array.from({length:2*n},(_,i)=>b.variable(2*(bits+i))),extra];
 const projected=project(b,globalNext,r,arith,{domain:globalDomain,stateBits:Array.from({length:bits},(_,i)=>i),basis,variableCount:bits+2*n+1});
 assert.equal(projected.status,'proved');assert.equal(projected.observableRank,p.observableRank);assert.equal(projected.eliminatedDomainBits,1);
 for(const rel of p.relations)assert(implies(projected,rel.coefficients,rel.constant));
 assert.equal(derive(b,next,r,arith,{domain,basis:[...basis,ready[0]],variableCount:bits+2*n}).status,'unknown');
 report.push({type:'open dynamic scanner',ports:n,states:p.domainStates,rank:p.observableRank,columns:p.columns,relations:p.relations.map(({coefficients,constant})=>({coefficients,constant}))});
}
for(const T of [2,3,7,20]){
 const b=makeBDD(),w=makeWords(b),bits=Math.ceil(Math.log2(T)),cur=Array.from({length:bits},(_,i)=>b.variable(2*i)),input=b.variable(2*bits),space=b.variable(2*(bits+1));
 // State is remaining busy ticks at beginning. Completion and next
 // start can occur in same frame. Arbitrary input/space boundary.
 const busy=w.nonzero(cur),free=b.not(busy),start=b.and(free,b.and(input,space)),waitInput=b.and(free,b.not(input)),waitOutput=b.and(free,b.and(input,b.not(space)));
 const next=w.pick(busy,w.satSub(cur,w.c(1)),w.pick(start,w.c(T-1),w.c(0)));
 const domain=w.lt(cur,w.c(T)),basis=cur;
 const r={start:[start],busy:[busy],waitInput:[waitInput],waitOutput:[waitOutput]};
 const p=derive(b,next,r,arith,{domain,basis,variableCount:bits+2});
 assert.equal(p.status,'proved');assert(implies(p,{busy:1,start:-(T-1)},0));assert(implies(p,{start:1,busy:1,waitInput:1,waitOutput:1},1));assert(implies(p,{start:T,waitInput:1,waitOutput:1},1));assert(!implies(p,{start:1},1));
 report.push({type:'open recipe service clock',T,states:p.domainStates,rank:p.observableRank,relations:p.relations.map(({coefficients,constant})=>({coefficients,constant}))});
}
{
 const b=makeBDD(),x=b.variable(0),m=b.variable(2),next=[b.not(x),m],r={a:[b.and(x,m)],b:[b.and(x,b.not(m))],pulse:[x]};
 for(const mode of [0,1]){
  const p=derive(b,next,r,arith,{initial:[0,mode],basis:[x,m,b.and(x,m)]});
  assert.equal(p.status,'proved');assert(implies(p,{a:1},mode?'1/2':0));assert(implies(p,{b:1},mode?0:'1/2'));assert(implies(p,{pulse:1},'1/2'));
  report.push({type:'initial-specific gain',mode,rank:p.observableRank,relations:p.relations.map(({coefficients,constant})=>({coefficients,constant}))});
 }
}
// A freely offered source and a bounded FIFO are two independent proof
// components. Their shared transfer event has one name and one unit.
// The queue may arbitrarily block or delay: its balance still telescopes.
{
 const b=makeBDD(),w=makeWords(b),x=b.variable(0);
 const source=derive(b,[b.not(x)],{send:[x]},arith,{basis:[x]});
 const q=Array.from({length:2},(_,i)=>b.variable(2*i)),a=b.variable(4),z=b.variable(6);
 const domain=b.and(b.or(b.not(a),w.lt(q,w.c(3))),b.or(b.not(z),w.nonzero(q)));
 const next=w.sub(w.add(q,[a]),[z]).slice(0,2);
 const fifo=derive(b,next,{send:[a],receive:[z]},arith,{domain,basis:q,variableCount:4});
 const p=compose([source,fifo],arith);
 assert.equal(p.values.send,'1/2');assert.equal(p.values.receive,'1/2');assert.equal(p.free,0);
 assert.equal(compose([source,fifo],arith,{known:{receive:'1'}}).status,'contradiction');
 report.push({type:'compositional bounded queue',result:p});
}
fs.writeFileSync(__dirname+'/symbolic-relation-algebra-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
module.exports={implies};
