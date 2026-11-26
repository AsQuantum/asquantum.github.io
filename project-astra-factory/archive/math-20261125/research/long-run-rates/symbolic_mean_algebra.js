'use strict';
// Direct Poisson/gain-bias identities in a finite Boolean function space.
// No orbit, time propagation, LP, or numerical fixed-point computation.
// BDDs encode *one-step* formulas only. Exact Gram elimination certifies
// pointwise equality, without enumerating every Boolean assignment.
const {makeRateAlgebra}=require('./direct_algebra');
function proveSymbolicMeans(b,next,initial,rewards,arith,{domain=1,basis=[],ms=10000,maxBasis=100,constantGain=false}={}){
 const A=makeRateAlgebra(arith),{q,add,sub,mul,txt,Z,U,neg,variable,constant,plus,pivot,vars,val}=A;
 const end=performance.now()+ms,n=next.length;
 const out={scope:'exact-finite-symbolic-Poisson-identity',values:{},certificates:{},unknown:[]};
 const fail=(reason)=>({...out,status:'unknown',reason});
 if(initial.length!==n||initial.some(x=>x!==0&&x!==1)||basis.some(x=>!Number.isSafeInteger(x)||x<0))return fail('invalid initial assignment');
 const im=Object.fromEntries(initial.map((v,i)=>[2*i,v])),fm=Object.fromEntries(next.map((v,i)=>[2*i,v]));
 const at0=v=>b.substitute([v],im)[0];
 if(at0(domain)!==1||b.and(domain,b.not(b.substitute([domain],fm)[0]))!==0)return fail('domain not inductive or initial not in domain');
 const roots=[...new Set([1,...basis])].filter(x=>x!==0&&b.and(domain,x)!==0);
 if(roots.length>maxBasis)return fail('basis budget');
 const p=constantGain?1:roots.length,after=b.substitute(roots,fm),memo=new Map();
 function measure(a,c){
  if(a===0||c===0)return 0n;
  const key=a<c?a+','+c:c+','+a;
  if(!memo.has(key)){if(performance.now()>end)throw Error('symbolic mean budget');memo.set(key,b.count(b.and(domain,b.and(a,c)),n));}
  return memo.get(key);
 }
 // A function is a sparse sum of weighted Boolean indicators.
 function terms(xs){const m=new Map();for(const [v,w] of xs)if(v!==0){m.set(v,(m.get(v)||0n)+w);}return [...m].filter(([,w])=>w!==0n);}
 const empty=[],diff=roots.map((r,i)=>terms([[r,1n],[after[i],-1n]]));
 const columns=[...roots.slice(0,p).map((r,i)=>[diff[i],[[r,1n]]]),...diff.map(d=>[empty,d])];
 const inner=(x,y)=>{let z=0n;for(const [r,a] of x)for(const [s,c] of y)z+=a*c*measure(r,s);return z;};
 const gram=(x,y)=>inner(x[0],y[0])+inner(x[1],y[1]);
 try{
  const G=columns.map((x,i)=>columns.map((y,j)=>j<i?0n:gram(x,y)));
  for(let i=0;i<G.length;i++)for(let j=0;j<i;j++)G[i][j]=G[j][i];
  for(const [k,w] of Object.entries(rewards)){
   const r=terms(w.map((v,i)=>[v,1n<<BigInt(i)])),rhs=columns.map(x=>inner(x[1],r)),solved=new Map();
   for(let i=0;i<G.length;i++){
    if(performance.now()>end)throw Error('symbolic mean elimination budget');
    let row=constant(q(-rhs[i]));
    for(let j=0;j<G.length;j++)if(G[i][j])row=plus(row,variable(j),q(G[i][j]));
    if(!pivot(row,solved))throw Error('inconsistent Gram equations');
   }
   // Free coefficients can be set to zero: any exact least-squares
   // solution has the same residual norm. Accept only zero residual.
   const a=columns.map((_,i)=>solved.has(i)?val(solved.get(i)):Z);
   let residual=q(inner(r,r));
   for(let i=0;i<a.length;i++)residual=sub(residual,mul(a[i],q(rhs[i])));
   // Independently verify all normal equations before using residual.
   for(let i=0;i<a.length;i++){
    if(performance.now()>end)throw Error('symbolic mean verification budget');
    let s=Z;for(let j=0;j<a.length;j++)if(G[i][j])s=add(s,mul(q(G[i][j]),a[j]));
    if(sub(s,q(rhs[i])).n!==0n)throw Error('Gram witness verification failed');
   }
   if(residual.n<0n)throw Error('negative squared residual');
   if(residual.n){out.unknown.push(k);continue;}
   let gain=Z;
   for(let i=0;i<p;i++){const v=at0(roots[i]);if(v!==0&&v!==1)throw Error('nonconstant initial basis');if(v)gain=add(gain,a[i]);}
   out.values[k]=txt(gain);
   out.certificates[k]={gain:a.slice(0,p).map(txt),potential:a.slice(p).map(txt),squaredResidual:'0'};
  }
  return {...out,status:out.unknown.length?'partial':'proved',basis:roots,domainStates:String(b.count(domain,n)),gramDimension:columns.length,innerProducts:memo.size};
 }catch(e){if(/budget/.test(e.message))return fail(e.message);throw e;}
}
// Verify clipping-lift entirely by one-step implication, not by following
// an initial orbit. For each resource the caller supplies a post-clipping
// invariant K, or proves clipping impossible on the chosen domain.
function verifyClippingDomain(b,next,initial,domain,clips,safeDomains={}){
 const fm=Object.fromEntries(next.map((v,i)=>[2*i,v])),im=Object.fromEntries(initial.map((v,i)=>[2*i,v]));
 const post=x=>b.substitute([x],fm)[0];
 if(b.substitute([domain],im)[0]!==1||b.and(domain,b.not(post(domain)))!==0)return {status:'unknown',reason:'domain not inductive'};
 const checked=[];
 for(const cl of clips){
  if(b.and(domain,cl.event)===0){checked.push({item:cl.item,mode:'no-clipping'});continue;}
  const K=safeDomains[cl.item];
  if(K===undefined||b.and(domain,b.and(K,cl.low))!==0||b.and(domain,b.and(K,b.not(post(K))))!==0||b.and(domain,b.and(cl.event,b.not(post(K))))!==0)return {status:'unknown',reason:'clipping lift not proved: '+cl.item};
  checked.push({item:cl.item,mode:'inductive-permanent-abundance'});
 }
 return {status:'proved',checked};
}
function fieldBasis(b,fields,{maxFieldValues=24}={}){
 const {makeWords}=require('./symbolic_bdd'),w=makeWords(b),basis=[];
 for(const f of fields){
  if(!Number.isSafeInteger(f.offset)||f.offset<0)throw Error('missing field offset');
  const bits=Array.from({length:f.bits},(_,j)=>b.variable(2*(f.offset+j)));
  if(!bits.length)continue;
  basis.push(...bits);
  if(BigInt(f.cap)<=BigInt(maxFieldValues))for(let i=0;i<=Number(f.cap);i++)basis.push(w.eq(bits,w.c(i)));
 }
 return basis;
}
module.exports={proveSymbolicMeans,fieldBasis,verifyClippingDomain};
