'use strict';
// Exact asymptotic support reduction. All rates here are per step.
// No trajectory, numerical iteration or LP. Only bounded-event counts,
// rational Gaussian elimination, and equality saturation of known ranges.
const {makeRateAlgebra}=require('./direct_algebra');
const {deriveSymbolicRelations}=require('./symbolic_relation_algebra');
function saturateEqualities(relations,bounds,arith){
 const A=makeRateAlgebra(arith),{q,txt,add,sub,mul,cmp,Z,U,neg,variable,constant,plus,pivot,vars,val}=A;
 const keys=[...new Set([...Object.keys(bounds),...relations.flatMap(r=>Object.keys(r.coefficients))])],ix=new Map(keys.map((k,i)=>[k,i])),s=new Map(),fixed={},why={};
 const bs=keys.map(k=>bounds[k]?[q(bounds[k][0]),q(bounds[k][1])]:null);
 const row=r=>Object.entries(r.coefficients).reduce((a,[k,v])=>plus(a,variable(ix.get(k)),q(v)),constant(neg(q(r.constant))));
 const raw=relations.map(row);
 const bad=reason=>({status:'contradiction',reason,values:{}});
 for(const b of bs)if(b&&cmp(b[0],b[1])>0)return bad('reversed range');
 for(const r of raw)if(!pivot(r,s))return bad('inconsistent equations');
 function fix(i,v,reason){
  const k=keys[i],b=bs[i];
  if(b&&(cmp(v,b[0])<0||cmp(v,b[1])>0))return false;
  if(Object.hasOwn(fixed,k))return cmp(q(fixed[k]),v)===0;
  if(!pivot(plus(variable(i),constant(neg(v))),s))return false;
  fixed[k]=txt(v);why[k]=reason;return true;
 }
 for(let i=0;i<keys.length;i++)if(bs[i]&&cmp(bs[i][0],bs[i][1])===0&&!fix(i,bs[i][0],'given exact bound'))return bad('inconsistent given bound');
 // Each successful round fixes at least one previously unfixed coordinate;
 // this is a finite proof closure, not approximation of rates.
 for(let round=0;round<=keys.length;round++){
  const before=Object.keys(fixed).length;
  for(let i=0;i<keys.length;i++){
   const r=s.get(i);
   if(r&&!vars(r).length&&!fix(i,val(r),'rational elimination'))return bad('constant outside physical range');
  }
  const rows=[...raw,...[...s].map(([i,r])=>plus(variable(i),r,neg(U)))];
  for(const expr of rows){
   // Substitute only certified constants, not all pivots: the original
   // signs and nonnegative event sums are useful saturation witnesses.
   let r=expr;
   for(const i of vars(expr))if(Object.hasOwn(fixed,keys[i])){
    r=plus(r,constant(q(fixed[keys[i]])),r.get(i));r.delete(i);
   }
   const vs=vars(r);if(!vs.length){if(val(r).n)return bad('constant contradiction');continue;}
   if(vs.some(i=>!bs[i]))continue;
   let lo=val(r),hi=lo;
   for(const i of vs){const c=r.get(i),[a,b]=bs[i];lo=add(lo,mul(c,c.n>0n?a:b));hi=add(hi,mul(c,c.n>0n?b:a));}
   if(cmp(lo,Z)>0||cmp(hi,Z)<0)return bad('equation outside physical range');
   if(!lo.n||!hi.n){
    const minimum=!lo.n;
    for(const i of vs){const c=r.get(i),v=bs[i][minimum?(c.n>0n?0:1):(c.n>0n?1:0)];if(!fix(i,v,'saturated equality'))return bad('inconsistent saturated equation');}
   }
  }
  if(Object.keys(fixed).length===before)return {status:'proved',values:fixed,why,rank:s.size,free:keys.length-s.size,rounds:round+1};
 }
 throw Error('finite proof closure exceeded coordinate count');
}
// Make disjoint Boolean event atoms within a scope. Their means are
// nonnegative; partition constraints do not assume independent readiness.
function jointGuardAtoms(b,domain,guards,{maxAtoms=64}={}){
 let cells=[{root:domain,truth:[]}];
 for(const [k,r] of Object.entries(guards)){
  const next=[];
  for(const c of cells)for(const yes of [false,true]){
   const z=b.and(c.root,yes?r:b.not(r));if(z)next.push({root:z,truth:[...c.truth,yes?k:null]});
  }
  if(next.length>maxAtoms)return {status:'unknown',reason:'joint atom budget'};
  cells=next;
 }
 return {status:'proved',atoms:cells.map((c,i)=>({name:'@atom:'+i,root:c.root,truth:c.truth.filter(x=>x!==null)}))};
}
// The caller certifies base domain covers every actual step (or all but
// o(n)), and all supplied boundary equations/ranges are true for each
// empirical accumulation point. Restrict only by events proved zero or
// one in ALL such points. No initial-dependent gain on the reduced domain.
function deriveAsymptoticRelations(b,next,rewards,arith,{domain=1,basis=[],guards={},known={},extraRelations=[],extraBounds={},variableCount=next.length,maxAtoms=64,maxRounds=8,ms=10000,maxColumns=160}={}){
 const {q,txt}=arith,started=performance.now(),remaining=()=>Math.max(1,ms-(performance.now()-started));
 if(Object.keys(guards).some(k=>Object.hasOwn(rewards,k)||k.startsWith('@atom:'))||Object.keys(rewards).some(k=>k.startsWith('@atom:')))return {status:'unknown',reason:'reserved or duplicate reward name'};
 const a=jointGuardAtoms(b,domain,guards,{maxAtoms});if(a.status!=='proved')return a;
 const words={...rewards,...Object.fromEntries(Object.entries(guards).map(([k,r])=>[k,[r]])),...Object.fromEntries(a.atoms.map(x=>[x.name,[x.root]]))};
 const bounds={...Object.fromEntries(Object.entries(words).map(([k,w])=>[k,['0',String((1n<<BigInt(w.length))-1n)]]))};
 // Caller facts are intersected with intrinsic nonnegative word bounds.
 const tighten=(k,l,h)=>{
  const old=bounds[k],lo=q(l),hi=q(h),{cmp}=arith;
  const L=old&&cmp(q(old[0]),lo)>0?q(old[0]):lo,H=old&&cmp(q(old[1]),hi)<0?q(old[1]):hi;
  if(cmp(L,H)>0)return false;bounds[k]=[txt(L),txt(H)];return true;
 };
 for(const [k,[l,h]] of Object.entries(extraBounds))if(!tighten(k,l,h))return {status:'contradiction',reason:'incompatible certified range',values:{}};
 for(const [k,v] of Object.entries(known))if(!tighten(k,v,v))return {status:'contradiction',reason:'incompatible certified fact',values:{}};
 const baseRelations=[...extraRelations,{coefficients:Object.fromEntries(a.atoms.map(x=>[x.name,'1'])),constant:'1'}];
 for(const k of Object.keys(guards))baseRelations.push({coefficients:{[k]:'1',...Object.fromEntries(a.atoms.filter(x=>x.truth.includes(k)).map(x=>[x.name,'-1']))},constant:'0'});
 let active=domain,relations=baseRelations,proofs=[],removed=new Set(),last=null;
 for(let pass=0;pass<maxRounds;pass++){
  if(performance.now()-started>=ms)return {status:'partial',reason:'proof budget',values:last?.values||{},relations,proofs,removed:[...removed]};
  const r=deriveSymbolicRelations(b,next,words,arith,{domain:active,basis,variableCount,ms:remaining(),maxColumns});
  if(r.status!=='proved')return {status:'partial',reason:r.reason,values:last?.values||{},relations,proofs,removed:[...removed]};
  relations=[...relations,...r.relations.map(({coefficients,constant})=>({coefficients,constant}))];
  const s=saturateEqualities(relations,bounds,arith);if(s.status!=='proved')return {...s,proofs,removed:[...removed]};
  let d=active;
  for(const x of a.atoms)if(s.values[x.name]==='0'&&!removed.has(x.name)){removed.add(x.name);d=b.and(d,b.not(x.root));}
  // If an arbitrary guard was proved zero or one, this also excludes
  // its complement or itself. Atom exclusions already encode this.
  proofs.push({pass,rank:r.observableRank,domainStates:r.domainStates,excludedAtoms:removed.size,values:s.values,why:s.why});
  last=s;
  if(!d)return {status:'contradiction',reason:'all asymptotic steps excluded',values:{},proofs,removed:[...removed]};
  if(d===active)return {status:'proved-relations',values:s.values,relations,proofs,removed:[...removed],atoms:a.atoms.map(({name,truth})=>({name,truth})),unresolved:Object.keys(rewards).filter(k=>!Object.hasOwn(s.values,k))};
  active=d;
 }
 return {status:'partial',reason:'finite support refinement budget',values:last?.values||{},relations,proofs,removed:[...removed]};
}
module.exports={saturateEqualities,jointGuardAtoms,deriveAsymptoticRelations};
