'use strict';
// Pure-JS exact affine / disjunctive equation solver.
// All arithmetic is rational BigInt. No objective, simplex or rate iteration.
// Input: restricted SMT-LIB emitted by compile_exact.js. No eval or native backend.
function makeRateAlgebra(arith){
 const {q,add,sub,mul,div,cmp,txt,Z,U}=arith;
 const neg=a=>({n:-a.n,d:a.d});
 const C=-1;
 function plus(a,b,f=U){const r=new Map(a);for(const [i,v] of b){const w=add(r.get(i)||Z,mul(v,f));if(w.n)r.set(i,w);else r.delete(i);}return r;}
 function scale(a,f){return new Map([...a].map(([i,v])=>[i,mul(v,f)]).filter(([,v])=>v.n));}
 const constant=x=>x.n?new Map([[C,x]]):new Map();
 const variable=i=>new Map([[i,U]]);
 const vars=a=>[...a.keys()].filter(i=>i!==C);
 const val=a=>a.get(C)||Z;
 function normal(a){const ks=vars(a).sort((a,b)=>a-b);if(!ks.length)return a;const x=a.get(ks[0]);return scale(a,div(U,x.n<0n?neg(x):x));}
 function key(a){return [...a].sort((a,b)=>a[0]-b[0]).map(([i,v])=>i+':'+txt(v)).join(',');}
 function substitute(a,solved){let r=a;for(const i of vars(a)){if(solved.has(i))r=plus(r,solved.get(i),r.get(i)||Z),r.delete(i);}return r;}
 // Each pivot expression is maintained over currently free columns.
 function pivot(a,solved,preferred){
  const r=substitute(a,solved),ks=vars(r);
  if(!ks.length)return !val(r).n;
  const p=preferred!==undefined&&r.has(preferred)?preferred:ks[0];
  const rest=new Map(r);rest.delete(p);
  const expr=scale(rest,div(neg(U),r.get(p)));
  for(const [i,s] of solved)if(s.has(p)){const t=plus(s,expr,s.get(p));t.delete(p);solved.set(i,t);}
  solved.set(p,expr);return true;
 }
 function parse(problem){
  const tokens=problem.smt.match(/\(|\)|[^\s()]+/g)||[];let pos=0;
  function node(){const x=tokens[pos++];if(x!=='(')return x;const a=[];while(tokens[pos]!==')'){if(pos>=tokens.length)throw Error('Unclosed expression');a.push(node());}pos++;return a;}
  const names=new Map(),eqs=[],les=[],choices=[];
  function expr(a){
   if(typeof a==='string'){if(names.has(a))return variable(names.get(a));return constant(q(a));}
   const [o,...xs]=a,es=xs.map(expr);
   if(o==='+')return es.reduce((r,s)=>plus(r,s),new Map());
   if(o==='-')return es.length===1?scale(es[0],neg(U)):plus(es[0],es[1],neg(U));
   if(o==='*'){if(!vars(es[0]).length)return scale(es[1],val(es[0]));if(!vars(es[1]).length)return scale(es[0],val(es[1]));}
   if(o==='/'&&!vars(es[1]).length)return scale(es[0],div(U,val(es[1])));
   throw Error('Nonaffine expression '+JSON.stringify(a));
  }
  const row=a=>plus(expr(a[1]),expr(a[2]),neg(U));
  while(pos<tokens.length){
   const a=node();
   if(a[0]==='declare-const')names.set(a[1],names.size);
   else if(a[0]==='assert'){
    const b=a[1];
    if(b[0]==='=')eqs.push(row(b));
    else if(b[0]==='<=')les.push(row(b));
    else if(b[0]==='>=')les.push(scale(row(b),neg(U)));
    else if(b[0]==='or'&&b.slice(1).every(x=>x[0]==='='))choices.push(b.slice(1).map(row));
    else throw Error('Unsupported assertion');
   }else if(a[0]!=='set-logic')throw Error('Unsupported command');
  }
  return {names,eqs,les,choices,observables:Object.fromEntries(Object.entries(problem.observables).map(([k,v])=>[k,names.get(v)]))};
 }
 // Exact existential elimination of residual inequalities (Fourier–Motzkin).
 // Handles non-strict and strict inequalities, so uniqueness can be tested
 // by existence of L(x)<v or L(x)>v. A limit returns unknown, not false.
 function feasible(rows,{maxRows=12000,deadline=Infinity,strict=null}={}){
  let rs=rows.map(r=>({r,strict:false}));if(strict)rs.push({r:strict,strict:true});
  const stack=[];
  function simplify(xs){
   const map=new Map();
   for(const a of xs){
    if(!vars(a.r).length){const c=cmp(val(a.r),Z);if(c>0||(c===0&&a.strict))return null;continue;}
    const r=normal(a.r),dir=new Map(r);dir.delete(C);
    const k=key(dir),old=map.get(k),c=old?cmp(val(r),val(old.r)):1;
    if(c>0||c===0&&a.strict&&!old.strict)map.set(k,{r,strict:a.strict});
   }
   // Parallel inequalities retain only the strongest one. Singleton
   // bounds can also imply other rows, preserving strictness at equality.
   const all=[...map.values()],bounds=new Map();
   for(const {r,strict} of all){
    const ks=vars(r);if(ks.length!==1)continue;
    const i=ks[0],c=r.get(i),v=div(neg(val(r)),c),b=bounds.get(i)||{};
    if(c.n>0n){b.hi=v;b.hs=strict;}else{b.lo=v;b.ls=strict;}bounds.set(i,b);
   }
   if([...bounds.values()].some(b=>b.lo!=null&&b.hi!=null&&(cmp(b.lo,b.hi)>0||cmp(b.lo,b.hi)===0&&(b.ls||b.hs))))return null;
   return all.filter(({r,strict})=>{
    const ks=vars(r);if(ks.length<2)return true;
    let hi=val(r);
    for(const i of ks){const c=r.get(i),v=bounds.get(i)?.[c.n>0n?'hi':'lo'];if(v==null)return true;hi=add(hi,mul(c,v));}
    return cmp(hi,Z)>0||strict&&cmp(hi,Z)===0;
   });
  }
  while(true){
   if(performance.now()>deadline)return {status:'unknown'};
   rs=simplify(rs);if(rs===null)return {status:'infeasible'};if(rs.length>maxRows)return {status:'unknown'};
   if(!rs.length)break;
   const count=new Map();
   for(const {r} of rs)for(const i of vars(r)){const c=count.get(i)||[0,0];c[r.get(i).n>0n?0:1]++;count.set(i,c);}
   let p,best=Infinity;
   for(const [i,[a,b]] of count){const cost=a*b-a-b;if(cost<best){best=cost;p=i;}}
   const pos=[],negRows=[],rest=[];
   for(const a of rs){const c=a.r.get(p);if(!c)rest.push(a);else(c.n>0n?pos:negRows).push(a);}
   if(pos.length*negRows.length+rest.length>maxRows)return {status:'unknown'};
   stack.push({p,pos,negRows});
   for(const a of pos)for(const b of negRows){
    const c=plus(scale(a.r,neg(b.r.get(p))),b.r,a.r.get(p));
    c.delete(p);rest.push({r:c,strict:a.strict||b.strict});
   }rs=rest;
  }
  const values=new Map();
  for(let j=stack.length-1;j>=0;j--){
   const {p,pos,negRows}=stack[j];let lo=null,hi=null,ls=false,hs=false;
   for(const a of [...pos,...negRows]){
    let t=val(a.r);for(const i of vars(a.r))if(i!==p)t=add(t,mul(a.r.get(i),values.get(i)||Z));
    const b=div(neg(t),a.r.get(p));
    if(a.r.get(p).n>0n){const c=hi===null?-1:cmp(b,hi);if(c<0){hi=b;hs=a.strict;}else if(c===0)hs||=a.strict;}
    else{const c=lo===null?1:cmp(b,lo);if(c>0){lo=b;ls=a.strict;}else if(c===0)ls||=a.strict;}
   }
   let v=Z;
   if(lo!==null&&hi!==null){if(cmp(lo,hi)>0||(cmp(lo,hi)===0&&(ls||hs)))throw Error('FM reconstruction');v=div(add(lo,hi),q(2));}
   else if(lo!==null)v=ls?add(lo,U):lo;
   else if(hi!==null)v=hs?sub(hi,U):hi;
   values.set(p,v);
  }
  return {status:'feasible',values};
 }
 return {q,add,sub,mul,div,cmp,txt,Z,U,C,neg,plus,scale,constant,variable,vars,val,normal,key,substitute,pivot,parse,feasible};
}
function solveDirectRateProblem(problem,arith,options={}){
 if(problem.status!=='compiled')return {status:'unsupported'};
 const A=makeRateAlgebra(arith),{Z,U,C,add,sub,mul,div,cmp,txt,neg,plus,scale,constant,variable,vars,val,normal,key,substitute,pivot}=A;
 const model=A.parse(problem);
 const deadline=performance.now()+(options.ms??10000),maxNodes=options.maxNodes??20000;
 const stats={branches:0,leaves:0,contradictions:0,forced:0,free:0},unique=new Map(),multiple=new Set(),witnesses=[];
 let incomplete=false,found=false;
 const wanted=options.keys||Object.keys(model.observables);
 const expression=(id,solved)=>solved.get(id)||variable(id);
 function initial(){
  const solved=new Map(),pending=model.eqs.slice().sort((a,b)=>vars(a).length-vars(b).length);
  for(const r of pending){if(!pivot(r,solved))return null;}
  return {solved,les:model.les,choices:model.choices};
 }
 function reduce(s){
  const solved=s.solved;
  while(true){
   if(performance.now()>deadline)return 'unknown';
   const directions=new Map(),forced=[];let ls=[];
   for(const row of s.les){
    const r=normal(substitute(row,solved));
    if(!vars(r).length){if(val(r).n>0n)return 'infeasible';continue;}
    const dir=new Map(r);dir.delete(C);const dk=key(dir),old=directions.get(dk);
    if(!old||cmp(val(r),val(old))>0)directions.set(dk,r);
   }
   ls=[...directions.values()];
   for(const r of ls){const d=new Map(r);d.delete(C);const opp=directions.get(key(scale(d,neg(U))));if(opp){const v=add(val(r),val(opp));if(v.n>0n)return 'infeasible';if(!v.n)forced.push(r);}}
   function applyForced(){for(const r of forced){if(!pivot(r,solved))return false;stats.forced++;}return true;}
   if(forced.length){if(!applyForced())return 'infeasible';continue;}
   s.les=ls;
   const bounds=new Map();
   function bound(i){if(!bounds.has(i))bounds.set(i,{lo:null,hi:null});return bounds.get(i);}
   function tighten(i,sign,v){
    const b=bound(i),k=sign>0?'hi':'lo',old=b[k];
    if(old===null||(sign>0?cmp(v,old)<0:cmp(v,old)>0)){b[k]=v;return true;}return false;
   }
   for(const r of ls){const ks=vars(r);if(ks.length!==1)continue;const i=ks[0];tighten(i,r.get(i).n>0n?1:-1,div(neg(val(r)),r.get(i)));}
   // A bounded number of exact derived inequalities, not convergence to a
   // numerical solution. Every derived bound follows from original rows.
   for(let pass=0;pass<6;pass++){
    let changed=false;
    for(const r of ls){
     const ks=vars(r);if(ks.length<2)continue;
     let sum=val(r),missing=0;const terms=new Map();
     for(const i of ks){const v=r.get(i),b=bound(i),l=v.n>0n?b.lo:b.hi;
      if(l===null){missing++;terms.set(i,null);}else{const t=mul(v,l);terms.set(i,t);sum=add(sum,t);}
     }
     if(missing>1)continue;
     if(!missing&&sum.n>0n)return 'infeasible';
     for(const i of ks){const t=terms.get(i);if(missing&&t!==null)continue;
      const rem=t===null?sum:sub(sum,t),v=r.get(i);
      changed=tighten(i,v.n>0n?1:-1,div(neg(rem),v))||changed;
     }
    }
    for(const [i,b] of bounds)if(b.lo!==null&&b.hi!==null&&cmp(b.lo,b.hi)>0)return 'infeasible';
    if(!changed)break;
   }
   for(const [i,b] of bounds)if(b.lo!==null&&b.hi!==null&&cmp(b.lo,b.hi)===0)forced.push(plus(variable(i),constant(b.lo),neg(U)));
   if(forced.length){if(!applyForced())return 'infeasible';continue;}
   function interval(r){
    let lo=val(r),hi=lo;
    for(const i of vars(r)){
     const v=r.get(i),b=bounds.get(i)||{lo:null,hi:null},l=v.n>0n?b.lo:b.hi,h=v.n>0n?b.hi:b.lo;
     lo=lo===null||l===null?null:add(lo,mul(v,l));hi=hi===null||h===null?null:add(hi,mul(v,h));
    }return {lo,hi};
   }
   for(const r of ls){
    const {lo}=interval(r);if(lo!==null&&lo.n>0n)return 'infeasible';
    if(lo!==null&&!lo.n)for(const i of vars(r)){const b=bounds.get(i),v=r.get(i).n>0n?b.lo:b.hi;forced.push(plus(variable(i),constant(v),neg(U)));}
   }
   if(forced.length){if(!applyForced())return 'infeasible';continue;}
   const cs=[];
   for(const clause of s.choices){
    const candidates=new Map();let satisfied=false;
    for(const row of clause){
     const r=normal(substitute(row,solved));
     if(!vars(r).length){if(!val(r).n){satisfied=true;break;}continue;}
     const {lo,hi}=interval(r);if((lo!==null&&lo.n>0n)||(hi!==null&&hi.n<0n))continue;
     const d=new Map(r);d.delete(C);const p=directions.get(key(d)),n=directions.get(key(scale(d,neg(U))));
     if((p&&cmp(val(p),val(r))>0)||(n&&cmp(val(n),neg(val(r)))>0))continue;
     const k=key(r),opposite=key(scale(r,neg(U)));if(!candidates.has(opposite))candidates.set(k,r);
    }
    if(satisfied)continue;
    if(!candidates.size)return 'infeasible';
    if(candidates.size===1)forced.push(candidates.values().next().value);
    else cs.push([...candidates.values()]);
   }
   s.choices=cs;
   if(forced.length){if(!applyForced())return 'infeasible';continue;}
   return 'ok';
  }
 }
 function leaf(s){
  const f=A.feasible(s.les,{deadline,maxRows:options.maxRows??12000});
  if(f.status==='unknown'){incomplete=true;return;}if(f.status==='infeasible'){stats.contradictions++;return;}
  stats.leaves++;found=true;
  const values=new Map();
  const get=r=>{let t=val(r);for(const i of vars(r))t=add(t,mul(r.get(i),f.values.get(i)||Z));return t;};
  for(const k of wanted){
   if(multiple.has(k))continue;
   const r=expression(model.observables[k],s.solved),v=get(r);
   if(unique.has(k)&&cmp(unique.get(k),v)!==0){multiple.add(k);unique.delete(k);continue;}
   if(vars(r).length){
    stats.free++;
    const diff=plus(r,constant(v),neg(U));
    const lo=A.feasible(s.les,{deadline,strict:diff,maxRows:options.maxRows??12000});
    const hi=lo.status==='feasible'?lo:A.feasible(s.les,{deadline,strict:scale(diff,neg(U)),maxRows:options.maxRows??12000});
    if(lo.status==='feasible'||hi.status==='feasible'){multiple.add(k);unique.delete(k);continue;}
    if(lo.status==='unknown'||hi.status==='unknown'){incomplete=true;continue;}
   }
   unique.set(k,v);
  }
  // Independently substitute the feasible witness into EVERY original assertion.
  const full=new Map([...model.names.values()].map(i=>[i,get(expression(i,s.solved))]));
  function evalOriginal(row){let v=val(row);for(const i of vars(row))v=add(v,mul(row.get(i),full.get(i)));return v;}
  if(model.eqs.some(row=>evalOriginal(row).n)||model.les.some(row=>evalOriginal(row).n>0n)||model.choices.some(c=>!c.some(row=>!evalOriginal(row).n)))throw Error('Exact witness failed original equations');
  if(witnesses.length===0){for(const [k,id] of Object.entries(model.observables))values.set(k,txt(full.get(id)));witnesses.push(Object.fromEntries(values));}
 }
 function visit(s){
  if(stats.branches>=maxNodes||performance.now()>deadline){incomplete=true;return;}
  stats.branches++;
  const r=reduce(s);if(r==='unknown'){incomplete=true;return;}if(r==='infeasible'){stats.contradictions++;return;}
  if(!s.choices.length){leaf(s);return;}
  // Fewest alternatives, then lowest total variable incidence.
  const freq=new Map();
  const mode=options.branchOrder||'impact';
  for(const r of s.les)for(const i of vars(r))freq.set(i,(freq.get(i)||0)+1);
  for(const c of s.choices)for(const i of new Set(c.flatMap(vars)))freq.set(i,(freq.get(i)||0)+1);
  const score=c=>{
   const sizes=c.map(r=>vars(r).length),inc=c.map(r=>vars(r).reduce((t,i)=>t+(freq.get(i)||0),0));
   if(mode==='dense')return -inc.reduce((a,b)=>a+b,0)/c.length;
   if(mode==='impact')return -inc.reduce((a,b,i)=>a+b/(sizes[i]||1),0)/c.length;
   if(mode==='maximpact')return -Math.max(...inc.map((v,i)=>v/(sizes[i]||1)));
   if(mode==='wide')return -sizes.reduce((a,b)=>a+b,0);
   return sizes.reduce((a,b)=>a+b,0);
  };
  s.choices.sort((a,b)=>a.length-b.length||score(a)-score(b));
  const [chosen,...rest]=s.choices;
  const c=options.reverseAlternatives?[...chosen].reverse():chosen;

  for(const row of c){
   const solved=new Map(s.solved);if(!pivot(row,solved)){stats.contradictions++;continue;}
   visit({solved,les:s.les,choices:rest});
   if(performance.now()>deadline||stats.branches>=maxNodes){incomplete=true;break;}
  }
 }
 const start=initial();if(start){const r=reduce(start);if(r==='ok'){const parent=new Map();function find(i){if(!parent.has(i))parent.set(i,i);let j=parent.get(i);if(j!==i){j=find(j);parent.set(i,j);}return j;}function link(xs){if(!xs.length)return;const a=find(xs[0]);for(const i of xs.slice(1)){const b=find(i);if(a!==b)parent.set(b,a);}}for(const row of start.les)link(vars(row));for(const c of start.choices)link([...new Set(c.flatMap(vars))]);const sizes=new Map();for(const i of parent.keys()){const f=find(i);sizes.set(f,(sizes.get(f)||0)+1);}stats.initialGroups=[...sizes.values()].sort((a,b)=>b-a);stats.initialChoices=start.choices.length;stats.initialFree=model.names.size-start.solved.size;visit(start);}else if(r==='unknown')incomplete=true;else stats.contradictions++;}
 return {status:incomplete?'unknown':found?'sat':'unsat',method:'exact symbolic branches + rational affine elimination',stats,unique:incomplete?{}:Object.fromEntries([...unique].map(([k,v])=>[k,txt(v)])),multiple:[...multiple],witness:witnesses[0]||null};
}
if(typeof module!=='undefined')module.exports={makeRateAlgebra,solveDirectRateProblem};
