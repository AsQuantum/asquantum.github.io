'use strict';
// Extract ALL average reward equalities expressible by a specified bounded
// potential basis. One-step symbolic relation + rational nullspace only.
// An open component's external actions are universally quantified, not
// assigned a fictitious probability or average readiness.
const {makeRateAlgebra}=require('./direct_algebra');
function deriveSymbolicRelations(b,next,rewards,arith,{domain=1,basis=[],initial=null,variableCount=next.length,ms=10000,maxColumns=160}={}){
 const A=makeRateAlgebra(arith),{q,add,mul,sub,txt,Z,U,neg,variable,constant,plus,pivot,vars,val}=A;
 const end=performance.now()+ms,keys=Object.keys(rewards),open=initial===null,n=next.length;
 const unknown=reason=>({status:'unknown',reason,relations:[]});
 const budget=()=>{if(performance.now()>end)throw Error('relation algebra budget');};
 try{
  if(!Number.isSafeInteger(variableCount)||variableCount<n||!keys.length||!domain)return unknown('invalid relation domain');
  if(basis.some(r=>[...b.support(r)].some(v=>v%2||v/2>=n)))return unknown('potential depends on external actions');
  const fm=Object.fromEntries(next.map((v,i)=>[2*i,v])),after=r=>b.substitute([r],fm)[0];
  const im=open?null:Object.fromEntries(initial.map((v,i)=>[2*i,v]));
  if(!open&&(initial.length!==n||variableCount!==n||initial.some(v=>v!==0&&v!==1)||b.substitute([domain],im)[0]!==1||b.and(domain,b.not(after(domain)))!==0))return unknown('closed domain not inductive');
  const roots=[...new Set([1,...basis])].filter(r=>r!==0&&b.and(domain,r)!==0);
  const gainRoots=open?[1]:roots,g=gainRoots.length,p=roots.length,m=keys.length;
  const terms=xs=>{const a=new Map();for(const [r,c] of xs)if(r!==0)a.set(r,(a.get(r)||0n)+c);return [...a].filter(([,c])=>c!==0n);};
  const diff=r=>terms([[r,1n],[after(r),-1n]]);
  const cols=[
   ...keys.map(k=>[[],terms(rewards[k].map((v,j)=>[v,1n<<BigInt(j)]))]),
   ...gainRoots.map(r=>[open?[]:diff(r),[[r,-1n]]]),
   ...roots.map(r=>[[],terms([[r,-1n],[after(r),1n]])])
  ];
  if(cols.length>maxColumns)return unknown('relation column budget');
  const memo=new Map();
  function measure(r,s){
   if(!r||!s)return 0n;
   const k=r<s?r+','+s:s+','+r;
   if(!memo.has(k)){budget();memo.set(k,b.count(b.and(domain,b.and(r,s)),variableCount));}
   return memo.get(k);
  }
  const inner=(a,c)=>{let v=0n;for(const [r,x] of a)for(const [s,y] of c)v+=x*y*measure(r,s);return v;};
  const G=cols.map((a,i)=>cols.map((c,j)=>j<i?0n:inner(a[0],c[0])+inner(a[1],c[1])));
  for(let i=0;i<G.length;i++)for(let j=0;j<i;j++)G[i][j]=G[j][i];
  const solved=new Map();
  for(const row of G){
   budget();let expr=new Map();
   for(let i=0;i<row.length;i++)if(row[i])expr=plus(expr,variable(i),q(row[i]));
   if(!pivot(expr,solved))throw Error('homogeneous system contradiction');
  }
  const free=cols.flatMap((_,i)=>solved.has(i)?[]:[i]),projected=new Map(),relations=[];
  const gainAt0=gainRoots.map(r=>open?1:b.substitute([r],im)[0]);
  if(gainAt0.some(v=>v!==0&&v!==1))throw Error('invalid gain at initial');
  for(const j of free){
   budget();
   const a=cols.map((_,i)=>solved.has(i)?(solved.get(i).get(j)||Z):(i===j?U:Z));
   // Verify the exact homogeneous equations independently.
   for(const row of G){
    let z=Z;for(let i=0;i<row.length;i++)if(row[i]&&a[i].n)z=add(z,mul(q(row[i]),a[i]));
    if(z.n)throw Error('nullspace certificate mismatch');
   }
   let beta=Z;for(let i=0;i<g;i++)if(gainAt0[i])beta=add(beta,a[m+i]);
   if(!a.slice(0,m).some(v=>v.n)){
    if(beta.n)throw Error('zero reward nonzero gain');continue;
   }
   // Keep independent equations in observable space, not merely independent
   // function coefficients. Nonconstant gains with zero observable weight
   // must vanish at initial, by the telescoping identity.
   let row=constant(neg(beta));for(let i=0;i<m;i++)if(a[i].n)row=plus(row,variable(i),a[i]);
   row=A.substitute(row,projected);
   if(!vars(row).length){if(val(row).n)throw Error('inconsistent projected identities');continue;}
   if(!pivot(row,projected))throw Error('inconsistent projected identities');
   relations.push({coefficients:Object.fromEntries(keys.flatMap((k,i)=>a[i].n?[[k,txt(a[i])]]:[])),constant:txt(beta),gain:a.slice(m,m+g).map(txt),potential:a.slice(m+g).map(txt)});
  }
  return {status:'proved',scope:open?'all-allowed-local-transitions':'closed-initial-specific',relations,roots,gainRoots,domainStates:String(b.count(domain,variableCount)),columns:cols.length,rank:solved.size,kernelDimension:free.length,observableRank:projected.size,innerProducts:memo.size};
 }catch(e){if(/budget/.test(e.message))return unknown(e.message);throw e;}
}
// Exact projection of a global one-step formula onto one component.
// Retained state bits carry bounded potential across time; the support of
// their update functions and selected rewards supplies arbitrary boundary
// inputs. Existentially discard all other variables, preserving every
// concrete transition. Domain membership must be certified by the caller.
function deriveProjectedRelations(b,next,rewards,arith,{domain=1,stateBits,basis=[],variableCount=next.length,...options}={}){
 if(!Array.isArray(stateBits)||new Set(stateBits).size!==stateBits.length||stateBits.some(i=>!Number.isSafeInteger(i)||i<0||i>=next.length))return {status:'unknown',reason:'invalid component state bits',relations:[]};
 const stateSet=new Set(stateBits.map(i=>2*i));
 if(basis.some(r=>[...b.support(r)].some(v=>!stateSet.has(v))))return {status:'unknown',reason:'component potential depends on boundary',relations:[]};
 const updates=stateBits.map(i=>next[i]),roots=[...updates,...Object.values(rewards).flat(),...basis];
 const support=new Set(stateSet);for(const r of roots)for(const v of b.support(r))support.add(v);
 if([...support,...b.support(domain)].some(v=>v%2||v/2>=variableCount))return {status:'unknown',reason:'non-current or undeclared variable',relations:[]};
 const ordered=[...stateBits.map(i=>2*i),...[...support].filter(v=>!stateSet.has(v)).sort((a,c)=>a-c)];
 const omit=new Set([...b.support(domain)].filter(v=>!support.has(v))),localDomain=b.exists(domain,omit);
 const mapping=Object.fromEntries(ordered.map((v,i)=>[v,b.variable(2*i)])),sub=r=>b.substitute(r,mapping);
 const localNext=sub(updates),localBasis=sub(basis),localRewards=Object.fromEntries(Object.entries(rewards).map(([k,v])=>[k,sub(v)]));
 const p=deriveSymbolicRelations(b,localNext,localRewards,arith,{...options,domain:sub([localDomain])[0],basis:localBasis,variableCount:ordered.length,initial:null});
 return {...p,retainedStateBits:stateBits.length,boundaryBits:ordered.length-stateBits.length,eliminatedDomainBits:omit.size};
}
// Compose certified affine relations by identifying shared reward names.
// Pure elimination: inconsistent equations must be rejected, never fit.
function composeMeanRelations(groups,arith,{known={}}={}){
 const A=makeRateAlgebra(arith),{q,txt,neg,variable,constant,plus,pivot,vars,val}=A;
 if(groups.some(g=>g.status!=='proved'))return {status:'unknown',reason:'unproved component',values:{}};
 const all=groups.flatMap(g=>g.relations),keys=[...new Set([...all.flatMap(r=>Object.keys(r.coefficients)),...Object.keys(known)])],index=new Map(keys.map((k,i)=>[k,i])),s=new Map();
 const row=(c,v)=>Object.entries(c).reduce((r,[k,a])=>plus(r,variable(index.get(k)),q(a)),constant(neg(q(v))));
 for(const r of all)if(!pivot(row(r.coefficients,r.constant),s))return {status:'contradiction',values:{}};
 for(const [k,v] of Object.entries(known))if(!pivot(row({[k]:1},v),s))return {status:'contradiction',values:{}};
 const values={},unresolved=[];
 for(let i=0;i<keys.length;i++){const r=s.get(i)||variable(i);if(vars(r).length)unresolved.push(keys[i]);else values[keys[i]]=txt(val(r));}
 return {status:'proved-equations',rank:s.size,variables:keys.length,free:keys.length-s.size,values,unresolved};
}
module.exports={deriveSymbolicRelations,deriveProjectedRelations,composeMeanRelations};
