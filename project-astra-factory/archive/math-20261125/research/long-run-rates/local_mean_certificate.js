'use strict';
// AVERAGE-ONLY local certificates. Each transition is an allowed local
// relation, including arbitrary actions at its boundary. No global state
// enumeration, observed trajectory, or assumed stationary distribution.
// A witness phi certifies c*r <= beta + phi(to)-phi(from).
function proveLocalMeanBound({states,edges,coefficients,bound},arith,{maxRelaxations=2000000}={}){
 const {q,add,sub,mul,cmp,txt,Z}=arith;
 if(!Array.isArray(states)||!states.length||new Set(states).size!==states.length)return {status:'unsupported'};
 const ix=new Map(states.map((s,i)=>[s,i])),B=q(bound);
 const es=edges.map(e=>{
  if(!ix.has(e.from)||!ix.has(e.to))throw Error('invalid local transition');
  let weight=Z;for(const [k,c] of Object.entries(coefficients))weight=add(weight,mul(q(c),q(e.reward?.[k]??0)));
  return {i:ix.get(e.from),j:ix.get(e.to),w:sub(weight,B)};
 });
 // Difference constraints, all vertices initialized to zero (super-root).
 // Longest path potentials exist iff there is no positive cycle.
 const phi=states.map(()=>Z);let relaxations=0;
 for(let i=0;i<states.length;i++){
  let changed=false;
  for(const e of es){
   if(++relaxations>maxRelaxations)return {status:'unknown',reason:'local certificate budget'};
   const v=add(phi[e.i],e.w);if(cmp(v,phi[e.j])>0){phi[e.j]=v;changed=true;}
  }
  if(!changed){
   if(es.some(e=>cmp(e.w,sub(phi[e.j],phi[e.i]))>0))throw Error('invalid certificate');
   return {status:'proved',bound:txt(B),coefficients:Object.fromEntries(Object.entries(coefficients).map(([k,v])=>[k,txt(q(v))])),potential:Object.fromEntries(states.map((s,j)=>[s,txt(phi[j])])),relaxations};
  }
 }
 return {status:'not-proved',reason:'local allowed positive-excess cycle'};
}
// Combine nonnegative multiples of local certificates. Interface reward
// coefficients cancel exactly. This is algebra, not rate optimization.
function combineLocalMeanBounds(terms,arith){
 const {q,add,mul,cmp,txt,Z}=arith,coeff=new Map();let beta=Z;
 for(const {certificate:p,weight} of terms){
  const w=q(weight);if(p.status!=='proved'||cmp(w,Z)<0)throw Error('unproved or negative certificate');
  beta=add(beta,mul(w,q(p.bound)));
  for(const [k,v] of Object.entries(p.coefficients))coeff.set(k,add(coeff.get(k)||Z,mul(w,q(v))));
 }
 return {coefficients:Object.fromEntries([...coeff].filter(([,v])=>cmp(v,Z)!==0).map(([k,v])=>[k,txt(v)])),bound:txt(beta)};
}
module.exports={proveLocalMeanBound,combineLocalMeanBounds};
