'use strict';
// Exact affine interval projection of ONE query, with a strict resource cap.
// No objectives or numerical iteration; eliminate every other column.
const intervalRateAlgebra=typeof module!=='undefined'?require('./direct_algebra').makeRateAlgebra:makeRateAlgebra;
function projectCountInterval(problem,arith,query,{ms=3000,maxRows=12000}={}){
 if(problem.status!=='compiled')return {status:'unsupported'};
 const A=intervalRateAlgebra(arith),{vars,val,variable,plus,neg,scale,normal,key,txt,q,Z,U,C,cmp,div,add}=A,m=A.parse(problem),basis=new Map();
 if(m.choices.length||!Object.hasOwn(m.observables,query))return {status:'unsupported'};
 const deadline=performance.now()+ms;
 // Retain recipe batch and frozen service coordinates where possible.
 // This is only a change of exact affine basis, not a rate choice.
 const preferred=new Set(Object.entries(m.observables).filter(([k])=>k.startsWith('cycle:')||k.startsWith('duty:')).map(([,i])=>i));
 for(const r of m.eqs.slice().sort((a,b)=>vars(a).length-vars(b).length)){
  const rr=A.substitute(r,basis),ks=vars(rr);
  if(!A.pivot(rr,basis,ks.find(i=>!preferred.has(i))??ks[0]))return {status:'contradiction'};
 }
 const expr=A.substitute(variable(m.observables[query]),basis),z=m.names.size;
 // Preserve the query z during projection even when it is a constant.
 const eq=plus(variable(z),expr,neg(U)),solved=new Map();
 if(vars(expr).length)A.pivot(eq,solved,vars(expr)[0]);
 let rows=m.les.map(r=>A.substitute(A.substitute(r,basis),solved));
 if(!vars(expr).length){rows.push(eq,scale(eq,neg(U)));}
 function simplify(rs){
  const dirs=new Map();
  for(const rr of rs){
   const r=normal(rr);
   if(!vars(r).length){if(val(r).n>0n)return null;continue;}
   const d=new Map(r);d.delete(C);const k=key(d),old=dirs.get(k);
   if(!old||cmp(val(r),val(old))>0)dirs.set(k,r);
  }
  // A multivariate inequality implied by retained singleton bounds
  // is redundant. Use exact rational box evaluation, no LP.
  const all=[...dirs.values()],bounds=new Map();
  for(const r of all){
   const ks=vars(r);if(ks.length!==1)continue;
   const i=ks[0],c=r.get(i),v=div(neg(val(r)),c),b=bounds.get(i)||{};
   if(c.n>0n)b.hi=b.hi==null||cmp(v,b.hi)<0?v:b.hi;
   else b.lo=b.lo==null||cmp(v,b.lo)>0?v:b.lo;
   bounds.set(i,b);
  }
  if([...bounds.values()].some(b=>b.lo!=null&&b.hi!=null&&cmp(b.lo,b.hi)>0))return null;
  return all.filter(r=>{
   const ks=vars(r);if(ks.length<2)return true;
   let hi=val(r);
   for(const i of ks){
    const c=r.get(i),v=bounds.get(i)?.[c.n>0n?'hi':'lo'];
    if(v==null)return true;hi=add(hi,arith.mul(c,v));
   }
   return cmp(hi,Z)>0;
  });
 }
 let maxSeen=0,steps=0;
 for(;;){
  if(performance.now()>deadline||rows.length>maxRows)return {status:'unknown',steps,maxSeen};
  rows=simplify(rows);if(!rows)return {status:'contradiction'};maxSeen=Math.max(maxSeen,rows.length);
  const counts=new Map();
  for(const r of rows)for(const k of vars(r))if(k!==z){const c=counts.get(k)||[0,0];c[r.get(k).n>0n?0:1]++;counts.set(k,c);}
  if(!counts.size)break;
  let p,best=Infinity;for(const [k,[a,b]] of counts){const cost=a*b-a-b;if(cost<best){best=cost;p=k;}}
  const pos=[],negative=[],rest=[];
  for(const r of rows){const c=r.get(p);if(!c)rest.push(r);else(c.n>0n?pos:negative).push(r);}
  if(pos.length*negative.length+rest.length>maxRows)return {status:'unknown',steps,maxSeen};
  for(const a of pos)for(const b of negative){const r=plus(scale(a,neg(b.get(p))),b,a.get(p));r.delete(p);rest.push(r);}
  rows=rest;steps++;
 }
 let lower=null,upper=null;
 for(const r of rows){
  const c=r.get(z);if(!c)continue;
  const b=div(neg(val(r)),c);
  if(c.n<0n){if(lower===null||cmp(b,lower)>0)lower=b;}
  else if(upper===null||cmp(b,upper)<0)upper=b;
 }
 if(lower!==null&&upper!==null&&cmp(lower,upper)>0)return {status:'contradiction'};
 return {status:'interval',lower:lower===null?null:txt(lower),upper:upper===null?null:txt(upper),unique:lower!==null&&upper!==null&&cmp(lower,upper)===0,steps,maxSeen,free:m.names.size-basis.size};
}
