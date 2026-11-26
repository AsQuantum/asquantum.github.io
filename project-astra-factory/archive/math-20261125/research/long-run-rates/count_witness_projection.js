'use strict';
// Exact projection from a verified feasible witness.
// Candidate rates are NOT physical certificates. They serve only as a
// point in the outer polyhedron, after checking every necessary relation.
const {makeRateAlgebra}=require('./direct_algebra');
function projectCountAtWitness(problem,arith,candidate,{ms=12000,maxRows=12000}={}){
 if(problem.status!=='compiled')return {status:'unsupported'};
 const A=makeRateAlgebra(arith),{vars,val,variable,constant,plus,neg,scale,normal,key,txt,q,Z,U}=A,m=A.parse(problem),solved=new Map();
 if(m.choices.length)return {status:'unsupported'};
 for(const r of m.eqs.slice().sort((a,b)=>vars(a).length-vars(b).length))if(!A.pivot(r,solved))return {status:'contradiction'};
 const basis=new Map(solved);
 for(const [k,id] of Object.entries(m.observables))if(candidate[k]!=null){
  if(!A.pivot(plus(variable(id),constant(q(candidate[k])),neg(U)),solved))return {status:'candidate-rejected',reason:'equality '+k};
 }
 function evalAt(r,subs){return val(A.substitute(r,subs));} // unresolved columns set to zero
 const rows=m.les.map(r=>A.substitute(r,basis)),active=[];
 for(const r of rows){
  const v=evalAt(r,solved);
  if(v.n>0n)return {status:'candidate-rejected',reason:'inequality violated'};
  if(v.n===0n&&vars(r).length){const d=new Map(r);d.delete(A.C);active.push(normal(d));}
 }
 // Directions in the tangent cone satisfy all active rows. Any finite
 // such direction admits a sufficiently small positive rational step,
 // since every inactive row has strictly positive slack. Conversely a
 // displacement to any feasible point satisfies all active rows.
 const activeRows=[...new Map(active.map(r=>[key(r),r])).values()],deadline=performance.now()+ms;
 const unique={},multiple=[],unresolved=[],cache=new Map();
 for(const [k,id] of Object.entries(m.observables)){
  const r=A.substitute(variable(id),basis),v=evalAt(r,solved);
  if(!vars(r).length){unique[k]=txt(v);continue;}
  const d=new Map(r);d.delete(A.C);const n=normal(d),opp=normal(scale(n,neg(U))),ck=[key(n),key(opp)].sort().join(';');
  let status=cache.get(ck);
  if(!status){
   const lo=A.feasible(activeRows,{strict:n,deadline,maxRows});
   const hi=lo.status==='feasible'?lo:A.feasible(activeRows,{strict:opp,deadline,maxRows});
   status=lo.status==='feasible'||hi.status==='feasible'?'multiple':lo.status==='infeasible'&&hi.status==='infeasible'?'unique':'unknown';
   cache.set(ck,status);
  }
  if(status==='unique')unique[k]=txt(v);else if(status==='multiple')multiple.push(k);else unresolved.push(k);
 }
 return {status:unresolved.length?'partial':'sat',unique,multiple,unresolved,stats:{activeRows:activeRows.length,directions:cache.size,free:m.names.size-basis.size},method:'verified rational feasible witness + exact tangent-cone projection'};
}
module.exports={projectCountAtWitness};
