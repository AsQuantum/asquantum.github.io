'use strict';
const fs=require('fs'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{makeBDD,makeWords}=require('./symbolic_bdd'),{compileSymbolicPhysical}=require('./symbolic_physical'),{proveSymbolicMeans:prove,fieldBasis,verifyClippingDomain}=require('./symbolic_mean_algebra');
const report=[];
{
 const b=makeBDD(),x=b.variable(0),mode=b.variable(2),next=[b.not(x),mode];
 const domain=1,basis=[x,mode,b.and(x,mode)];
 for(const m of [0,1]){
  const p=prove(b,next,[0,m],{reward:[b.and(x,mode)],pulse:[x]},arith,{domain,basis});
  assert.equal(p.status,'proved',JSON.stringify(p));assert.equal(p.values.reward,m?'1/2':'0');assert.equal(p.values.pulse,'1/2');
  report.push({name:'multiple recurrent classes (initial mode '+m+')',values:p.values,states:p.domainStates,gram:p.gramDimension});
 }
 const insufficient=prove(b,next,[0,1],{reward:[b.and(x,mode)]},arith,{basis:[x,mode]});assert.equal(insufficient.status,'partial');assert.equal(insufficient.values.reward,undefined);
 const invalid=prove(b,next,[0,1],{pulse:[x]},arith,{domain:b.not(x),basis:[x]});assert.equal(invalid.status,'unknown');
}
const f=(id,rates)=>({id,rates}),cases=[
 ['two competing frozen consumers, half-frame source',[f('s',{k:'10'}),f('a',{k:'-20',a:'20'}),f('b',{k:'-20',b:'20'})]],
 ['interleaved frozen sources',[f('s1',{k:'20'}),f('a',{k:'-20',a:'20'}),f('s2',{k:'20'}),f('b',{k:'-20',b:'20'})]],
 ['unseeded feedback',[f('a',{k:'-20',x:'20'}),f('b',{x:'-20',k:'20'}),f('c',{k:'-10',z:'10'})]],
 ['two slow consumers',[f('s',{k:'1'}),f('a',{k:'-2/3',a:'2/3'}),f('b',{k:'-2/3',b:'2/3'})]],
 ['multi-resource shared competition',[f('s',{k:'10',x:'10'}),f('a',{k:'-20',x:'-10',a:'10'}),f('b',{k:'-10',x:'-20',b:'10'})]]
];
for(const [name,frozen] of cases){
 const m=compileSymbolicPhysical({machines:[],routes:[],frozen,priority:[],initial:'empty',unlimitedWarehouse:false},arith,{maxNodes:1000000,ms:30000});
 const {b,next,initial,fields,rewards,clips}=m,w=makeWords(b),word=f=>Array.from({length:f.bits},(_,j)=>b.variable(2*(f.offset+j)));
 const fm=Object.fromEntries(next.map((v,i)=>[2*i,v])),initialMap=Object.fromEntries(initial.map((v,i)=>[2*i,v]));
 const base=fields.reduce((d,f)=>b.and(d,w.le(word(f),w.c(f.cap))),1);
 // A single static invariant: for each stock choose a small upper bound.
 // Selection is finite logical search, not a time trajectory.
 const stocks=fields.filter(f=>f.name.startsWith('stock:'));let domain=null,lift=null;
 const safe=Object.fromEntries(clips.map(c=>[c.item,b.not(c.low)]));
 const acceptDomain=d=>{const p=verifyClippingDomain(b,next,initial,d,clips,safe);if(p.status==='proved'){domain=d;lift=p;return true;}return false;};
 for(let bound=0;bound<=6;bound++){
  const d=stocks.reduce((r,f)=>b.and(r,w.le(word(f),w.c(bound))),base);
  if(acceptDomain(d))break;
 }
 if(domain===null&&stocks.length===1){
  // Physical single-resource signed fractional inventory V = W + sum sign*phase.
  // When the stock threshold makes all actors full-speed, V cannot grow if
  // nominal consumption >= supply. Below it, one-step growth is bounded.
  const k=stocks[0].name.slice(6),actors=frozen.filter(f=>Object.hasOwn(f.rates,k));
  const {q,add,sub,mul,div,cmp,Z}=arith,D=q('1/20'),abs=x=>cmp(q(x),Z)<0?sub(Z,q(x)):q(x);
  const gcd=(a,d)=>d?gcd(d,a%d):a,lcm=(a,d)=>a/gcd(a,d)*d;
  const actorsPhase=actors.map(f=>{
   const vs=Object.values(f.rates).filter(x=>cmp(q(x),Z)!==0).map(abs),den=vs.reduce((a,v)=>lcm(a,v.d),1n),ints=vs.map(v=>v.n*(den/v.d)),num=ints.reduce(gcd,0n);
   const L=BigInt(fields.find(x=>x.name==='frozen:'+f.id+'.phase').cap)+1n;
   const r=abs(f.rates[k]),ratio=r.n*(den/r.d)/num;
   return {neg:cmp(q(f.rates[k]),Z)<0,L,ratio,field:fields.find(x=>x.name==='frozen:'+f.id+'.phase')};
  });
  const Q=actors.filter(f=>cmp(q(f.rates[k]),Z)<0).reduce((a,f)=>{const v=mul(abs(f.rates[k]),D);return a+(v.n+v.d-1n)/v.d+1n;},0n);
  const den=actorsPhase.reduce((a,v)=>lcm(a,v.L),1n);
  let lhs=w.mul(word(stocks[0]),den),rhs=w.c(den*(Q+BigInt(actorsPhase.filter(x=>!x.neg).length)));
  for(const a of actorsPhase){
   const ph=w.mul(w.divmod(w.mul(word(a.field),a.ratio),a.L)[1],den/a.L);
   if(a.neg)rhs=w.add(rhs,ph);else lhs=w.add(lhs,ph);
  }
  const d=b.and(base,w.le(lhs,rhs));
  acceptDomain(d);
 }
 // Static mixed bounded/abundant inventory templates. Each candidate
 // is checked on its whole domain; no reachable-state enumeration.
 if(domain===null&&stocks.length>1)for(const f of stocks){for(let bound=0;bound<=6;bound++)if(acceptDomain(b.and(base,w.le(word(f),w.c(bound)))))break;if(domain!==null)break;}
 if(domain===null){report.push({name,status:'unknown',reason:'no static inductive lifting invariant in tested family',bits:next.length,fields:fields.length});continue;}
 // Include indicators of field values, actual next-step reward guards,
 // and their pairwise Boolean products only if the basis remains small.
 let basis=fieldBasis(b,fields,{maxFieldValues:next.length>15?0:32});
 basis=[...new Set([...basis,...Object.values(rewards).flat()])].filter(x=>x!==0&&x!==1&&b.and(domain,x)!==0);
 if(basis.length<=16){const extra=[];for(let i=0;i<basis.length;i++)for(let j=i+1;j<basis.length;j++)extra.push(b.and(basis[i],basis[j]));basis=[...new Set([...basis,...extra])].filter(x=>x!==0&&x!==1&&b.and(domain,x)!==0);}
 const wanted=Object.fromEntries(Object.entries(rewards).filter(([k])=>k.startsWith('service:')));
 // Equal service units permit a joint observable. This can eliminate
 // total-flow freedom even when individual allocations remain unknown.
 const negatives=frozen.filter(f=>Object.values(f.rates).some(v=>arith.q(v).n<0));
 if(negatives.length>1&&negatives.every(f=>m.frozenUnits[f.id]===m.frozenUnits[negatives[0].id]))wanted['service:sum']=negatives.reduce((a,f)=>w.add(a,rewards['service:'+f.id]),w.c(0));
 const p=prove(b,next,initial,wanted,arith,{domain,basis,maxBasis:100,ms:5000,constantGain:next.length>15});
 // Extract joint constraints automatically, without passing the manually
 // selected aggregate reward above. Both consumers are distinct variables.
 let automaticRelations=null;
 if(name==='two slow consumers'){
  const {deriveSymbolicRelations}=require('./symbolic_relation_algebra');
  const individual=Object.fromEntries(Object.entries(wanted).filter(([k])=>k!=='service:sum'));
  const joint=deriveSymbolicRelations(b,next,individual,arith,{domain,basis,ms:10000});
  assert.equal(joint.status,'proved',JSON.stringify(joint));
  const {makeRateAlgebra}=require('./direct_algebra'),A=makeRateAlgebra(arith),keys=Object.keys(individual),s=new Map(),row=(c,k)=>Object.entries(c).reduce((r,[id,v])=>A.plus(r,A.variable(keys.indexOf(id)),arith.q(v)),A.constant(A.neg(arith.q(k))));
  for(const rel of joint.relations)assert(A.pivot(row(rel.coefficients,rel.constant),s));
  // Service words carry integer service units; duty = raw average / unit.
  const units=arith.q(m.frozenUnits.a);
  const scaled=A.substitute(row({'service:a':1,'service:b':1},arith.txt(arith.mul(arith.q('3/2'),units))),s);
  assert(!A.vars(scaled).length&&!A.val(scaled).n,JSON.stringify(joint));
  automaticRelations={rank:joint.observableRank,columns:joint.columns,relations:joint.relations.map(({coefficients,constant})=>({coefficients,constant})),unit:m.frozenUnits.a};
 }
 const duty=Object.fromEntries(Object.entries(p.values).map(([k,v])=>[k.slice(8),arith.txt(arith.div(arith.q(v),arith.q(k==='service:sum'?m.frozenUnits[negatives[0].id]:m.frozenUnits[k.slice(8)])))]));
 report.push({name,status:p.status,reason:p.reason,duty,unknown:p.unknown,bits:next.length,states:p.domainStates,gram:p.gramDimension,basis:basis.length,nodes:b.size(),lift:lift.checked,automaticRelations});
}
assert(report.slice(2).some(r=>r.status==='proved'),'at least one physical frozen rule needs a direct certificate');
assert.equal(report.find(r=>r.name==='two slow consumers').duty.sum,'3/2');
fs.writeFileSync(__dirname+'/symbolic-mean-algebra-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
