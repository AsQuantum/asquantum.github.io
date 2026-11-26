'use strict';
// Exact affine factorization after equality elimination. The residual
// inequality hypergraph defines independent Cartesian factors; a query
// can be constant across all factors even when individual flows vary.
const countRateAlgebra=typeof module!=='undefined'?require('./direct_algebra').makeRateAlgebra:makeRateAlgebra;
function solveFactoredCounts(problem,arith,{ms=10000,maxRows=12000,partialFactors=false}={}){
 if(problem.status!=='compiled')return {status:'unsupported',unique:{},multiple:[]};
 const A=countRateAlgebra(arith),{vars,val,variable,constant,plus,scale,neg,normal,key,txt,cmp,add,mul,Z,U,C}=A,m=A.parse(problem),solved=new Map(),deadline=performance.now()+ms;
 const result={status:'unknown',unique:{},multiple:[],unresolved:[],stats:{factors:[],directions:0}};
 if(m.choices.length)return {...result,reason:'non-affine branch structure'};
 const preferred=new Set(Object.entries(m.observables).filter(([k])=>k.startsWith('cycle:')||k.startsWith('duty:')).map(([,i])=>i));
 for(const row of m.eqs.slice().sort((a,b)=>vars(a).length-vars(b).length)){
  const rr=A.substitute(row,solved),ks=vars(rr);
  if(!A.pivot(rr,solved,ks.find(i=>!preferred.has(i))??ks[0]))return {...result,status:'unsat'};
 }
 const parent=new Map();
 function find(i){if(!parent.has(i))parent.set(i,i);const j=parent.get(i);if(j!==i)parent.set(i,find(j));return parent.get(i);}
 function union(xs){if(!xs.length)return;let p=find(xs[0]);for(const i of xs.slice(1)){const v=find(i);if(v!==p)parent.set(v,p);}}
 const rows=m.les.map(r=>A.substitute(r,solved));
 for(const r of rows){if(!vars(r).length){if(cmp(val(r),Z)>0)return {...result,status:'unsat'};}else union(vars(r));}
 const exprs=Object.fromEntries(Object.entries(m.observables).map(([k,i])=>[k,A.substitute(variable(i),solved)]));
 // Free columns which have no inequalities are independent unbounded factors.
 for(const i of m.names.values())if(!solved.has(i))find(i);
 const groups=new Map();
 for(const i of parent.keys()){const p=find(i);if(!groups.has(p))groups.set(p,{columns:[],rows:[],cache:new Map()});groups.get(p).columns.push(i);}
 for(const r of rows)if(vars(r).length)groups.get(find(vars(r)[0])).rows.push(r);
 // A factor that has a strict interior has no further affine equality.
 // Construct an exact interior certificate at the origin when possible.
 // This is a geometry witness ONLY, never a candidate actual rate.
 function interior(g){
  // First try a rational affine origin. For nonnegative-constant rows
  // with one negative coefficient, solve their DAG lower bounds exactly.
  // The final substitution is mandatory; no candidate rate is selected.
  const base=new Map(g.columns.map(i=>[i,Z]));
  if(g.rows.some(r=>cmp(val(r),Z)>0)){
   const dep=new Map(g.columns.map(i=>[i,new Set()])),inc=new Map(g.columns.map(i=>[i,[]]));
   for(const r of g.rows.filter(r=>cmp(val(r),Z)>=0)){
    const positive=vars(r).filter(i=>r.get(i).n>0n),negative=vars(r).filter(i=>r.get(i).n<0n);
    if(negative.length!==1){if(cmp(val(r),Z)>0)return null;continue;}
    const target=negative[0];inc.get(target).push(r);for(const i of positive)dep.get(target).add(i);
   }
   const done=new Set();
   while(done.size<g.columns.length){
    const i=g.columns.find(i=>!done.has(i)&&[...dep.get(i)].every(j=>done.has(j)));if(i===undefined)return null;
    for(const r of inc.get(i)){
     const x=A.div(vars(r).filter(j=>j!==i).reduce((v,j)=>add(v,mul(r.get(j),base.get(j))),val(r)),neg(r.get(i)));
     if(cmp(x,base.get(i))>0)base.set(i,x);
    }
    done.add(i);
   }
  }
  const atBase=r=>vars(r).reduce((v,i)=>add(v,mul(r.get(i),base.get(i))),val(r));
  if(g.rows.some(r=>cmp(atBase(r),Z)>0))return null;
  const active=g.rows.filter(r=>!atBase(r).n),d=new Map(g.columns.map(i=>[i,U])),deps=new Map(g.columns.map(i=>[i,new Set()])),incoming=new Map(g.columns.map(i=>[i,[]]));
  for(const r of active){
   const pos=vars(r).filter(i=>r.get(i).n>0n),negatives=vars(r).filter(i=>r.get(i).n<0n);
   if(!negatives.length)return null;
   if(!pos.length)continue;
   if(negatives.length!==1)return null;
   const target=negatives[0];incoming.get(target).push(r);
   for(const i of pos)deps.get(target).add(i);
  }
  const done=new Set();
  while(done.size<g.columns.length){
   const i=g.columns.find(i=>!done.has(i)&&[...deps.get(i)].every(j=>done.has(j)));
   if(i===undefined)return null;
   for(const r of incoming.get(i)){
    const total=vars(r).filter(j=>j!==i).reduce((v,j)=>add(v,mul(r.get(j),d.get(j))),U),bound=A.div(total,A.neg(r.get(i)));
    if(cmp(bound,d.get(i))>0)d.set(i,bound);
   }
   done.add(i);
  }
  const slope=r=>vars(r).reduce((v,i)=>add(v,mul(r.get(i),d.get(i))),Z);
  if(active.some(r=>cmp(slope(r),Z)>=0))return null;
  let step=U;
  for(const r of g.rows){const v=slope(r);if(v.n>0n){const b=A.div(A.neg(atBase(r)),A.mul(A.q(2),v));if(cmp(b,step)<0)step=b;}}
  if(cmp(step,Z)<=0)return null;
  const values=new Map(g.columns.map(i=>[i,add(base.get(i),mul(d.get(i),step))]));
  if(g.rows.some(r=>cmp(vars(r).reduce((v,i)=>add(v,mul(r.get(i),values.get(i))),val(r)),Z)>=0))return null;
  return values;
 }
 const witness=new Map();let incomplete=false;
 for(const g of [...groups.values()].sort((a,b)=>a.rows.length-b.rows.length||a.columns.length-b.columns.length)){
  const inside=interior(g);g.fullDimensional=!!inside;
  const origin=g.rows.every(r=>cmp(val(r),Z)<=0);
  const f=inside?{status:'feasible',values:inside}:origin?{status:'feasible',values:new Map()}:A.feasible(g.rows,{deadline,maxRows});g.status=f.status;result.stats.factors.push({columns:g.columns.length,rows:g.rows.length,status:f.status,strictInterior:g.fullDimensional,origin});
  if(f.status==='infeasible')return {...result,status:'unsat',unique:{},multiple:[]};
  if(f.status!=='feasible'){incomplete=true;continue;}
  for(const i of g.columns)witness.set(i,f.values.get(i)||Z);
  // Independent exact check of the factor witness.
  const evalRow=r=>vars(r).reduce((v,i)=>add(v,mul(r.get(i),witness.get(i))),val(r));
  if(g.rows.some(r=>cmp(evalRow(r),Z)>0))throw Error('factored witness violates row');
 }
 result.stats.initialFree=m.names.size-solved.size;
 if(incomplete&&!partialFactors)return {...result,reason:'at least one factor feasibility unresolved'};
 result.globallyFeasible=!incomplete;
 const evalExpr=r=>vars(r).reduce((v,i)=>add(v,mul(r.get(i),witness.get(i))),val(r));
 if(!incomplete){
  const full=new Map([...m.names.values()].map(i=>[i,evalExpr(A.substitute(variable(i),solved))]));
  const original=r=>vars(r).reduce((v,i)=>add(v,mul(r.get(i),full.get(i))),val(r));
  if(m.eqs.some(r=>cmp(original(r),Z)!==0)||m.les.some(r=>cmp(original(r),Z)>0))throw Error('factored witness violates original system');
 }
 for(const [k,r] of Object.entries(exprs)){
  // Exact constants from elimination and independent feasible factors
  // do not require a witness from an unrelated over-budget factor.
  // These are necessary-constraint invariants, not a global witness.
  if(vars(r).some(i=>groups.get(find(i)).status!=='feasible')){result.unresolved.push(k);continue;}
  let value=val(r),status='unique';
  const parts=new Map();
  for(const i of vars(r)){const p=find(i);if(!parts.has(p))parts.set(p,new Map());parts.get(p).set(i,r.get(i));value=add(value,mul(r.get(i),witness.get(i)));}
  for(const [p,d] of parts){
   const g=groups.get(p);if(g.fullDimensional){status='multiple';break;}const n=normal(d),opp=normal(scale(n,neg(U))),cacheKey=[key(n),key(opp)].sort().join(';');
   let s=g.cache.get(cacheKey);
   if(!s){
    // Only constraints active at the verified point restrict infinitesimal
    // displacement. Reuse the tangent-cone theorem, not global full rows.
    if(!g.active)g.active=g.rows.filter(row=>cmp(vars(row).reduce((v,i)=>add(v,mul(row.get(i),witness.get(i))),val(row)),Z)===0).map(row=>{const a=new Map(row);a.delete(C);return a;});
    const lo=A.feasible(g.active,{strict:n,deadline,maxRows});
    const hi=lo.status==='feasible'?lo:A.feasible(g.active,{strict:opp,deadline,maxRows});
    s=lo.status==='feasible'||hi.status==='feasible'?'multiple':lo.status==='infeasible'&&hi.status==='infeasible'?'unique':'unknown';
    g.cache.set(cacheKey,s);result.stats.directions++;
   }
   if(s==='multiple'){status=s;break;}if(s==='unknown')status='unknown';
  }
  if(status==='unique')result.unique[k]=txt(value);else if(status==='multiple')result.multiple.push(k);else result.unresolved.push(k);
 }
 result.status=incomplete||result.unresolved.length?'partial':'sat';
 result.witness=incomplete?null:Object.fromEntries(Object.entries(exprs).map(([k,r])=>[k,txt(evalExpr(r))]));
 return result;
}
