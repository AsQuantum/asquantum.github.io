'use strict';
// Independent continuous-time algebra research. A periodic word is a
// hypothesis about event ordering, NOT a time trace or a rate guess.
// Places are finite, homogeneous FIFO token queues. All operations are
// specified by pre/post token vectors. Different machines compose by sharing
// places. A place's delay is constant for every token. No simulation clock.
// This kernel does not yet generate the correct word or prove startup reachability.
function compilePeriodicServiceWord(net,word){
 const ps=new Map(net.places.map(p=>[p.id,p])),ts=new Map(net.transitions.map(t=>[t.id,t]));
 if(ps.size!==net.places.length||ts.size!==net.transitions.length||!word.length)throw Error('Invalid graph or empty word');
 const size=word.length;
 const entries=o=>Object.entries(o||{});
 const count=(o,k)=>o?.[k]||0;
 for(const p of ps.values()){
  if(!Number.isSafeInteger(p.capacity)||!Number.isSafeInteger(p.initial)||p.initial<0||p.capacity<p.initial)throw Error('Invalid finite resource '+p.id);
 }
 for(const t of ts.values())for(const [id,n] of [...entries(t.pre),...entries(t.post)])if(!ps.has(id)||!Number.isSafeInteger(n)||n<0)throw Error('Invalid token coefficient');
 const events=word.map(id=>{if(!ts.has(id))throw Error('Unknown event '+id);return ts.get(id);});
 const born=new Map([...ps.keys()].map(id=>[id,[]])),use=new Map([...ps.keys()].map(id=>[id,0])),occurrences=new Map([...ts.keys()].map(id=>[id,[]]));
 for(let j=0;j<size;j++){
  const t=events[j];occurrences.get(t.id).push(j);
  for(const [id,n] of entries(t.post))for(let k=0;k<n;k++)born.get(id).push(j);
  for(const [id,n] of entries(t.pre))use.set(id,use.get(id)+n);
 }
 for(const p of ps.values())if(born.get(p.id).length!==use.get(p.id))return {status:'unsupported',reason:'nonzero periodic inventory drift: '+p.id};
 const lines=['(set-logic QF_LRA)'];let serial=0;
 const sym=()=>{const x='v_'+(++serial);lines.push('(declare-const '+x+' Real)');return x;};
 const op=(o,...xs)=>'('+o+' '+xs.join(' ')+')';
 function rat(x){const s=String(x);if(/^-?\d+$/.test(s))return s.startsWith('-')?op('-',s.slice(1)):s;if(/^-?\d+\/[1-9]\d*$/.test(s)){const [n,d]=s.replace(/^-/,'').split('/'),e=op('/',n,d);return s.startsWith('-')?op('-',e):e;}throw Error('Exact rational delay required');}
 const eq=(a,b)=>op('=',a,b),le=(a,b)=>op('<=',a,b),assert=(a)=>lines.push(op('assert',a));
 function extremum(o,xs){xs=[...new Set(xs)];if(xs.length===1)return xs[0];const v=sym();for(const x of xs)assert(op(o,v,x));assert(op('or',...xs.map(x=>eq(v,x))));return v;}
 const H=sym(),phase=events.map(sym),observables={period:H};
 for(let j=0;j<size;j++)observables['phase:'+j]=phase[j];
 const at=(j,shift=0,delay=0)=>{
  const xs=[phase[j]];
  if(shift)xs.push(op('*',rat(shift),H));
  if(String(delay)!=='0')xs.push(rat(delay));
  return xs.length===1?xs[0]:op('+',...xs);
 };
 assert(eq(phase[0],'0'));assert(le('0',H));
 const produced=new Map([...ps.keys()].map(id=>[id,0])),consumed=new Map([...ps.keys()].map(id=>[id,0]));
 const last=new Map();
 const checks=[];
 function readiness(t,j,previous){
  for(const p of ps.values()){
   const have=p.initial+produced.get(p.id)-consumed.get(p.id),need=count(t.pre,p.id),out=count(t.post,p.id);
   if(have<need||have-need+out>p.capacity)return null;
  }
  const bounds=[previous],prev=last.get(t.id),oc=occurrences.get(t.id);
  if(prev!==undefined)bounds.push(at(prev,0,t.cooldown||0));
  else if(oc.length)bounds.push(at(oc.at(-1),-1,t.cooldown||0));
  for(const [id,n] of entries(t.pre)){
   if(!n)continue;
   const p=ps.get(id),bs=born.get(id);
   if(!bs.length)continue; // permanent initial tokens, no cyclic producers
   // The newest token needed by this action is known by ordinal, not by time.
   const ordinal=consumed.get(id)+n-1-p.initial,shift=Math.floor(ordinal/bs.length);
   const index=((ordinal%bs.length)+bs.length)%bs.length;
   bounds.push(at(bs[index],shift,p.delay||0));
  }
  return extremum('>=',bounds);
 }
 for(let j=0;j<size;j++){
  const chosen=events[j],previous=j===0?at(size-1,-1):phase[j-1];
  assert(le(previous,phase[j]));
  const ready=new Map();
  for(const t of ts.values()){
   const r=readiness(t,j,previous);
   if(r!==null)ready.set(t.id,r);
  }
  if(!ready.has(chosen.id))return {status:'invalid-word',reason:'Resource unavailable for '+chosen.id+' at word index '+j};
  // Earliest enabled event, not an objective maximizing throughput.
  assert(eq(phase[j],extremum('<=',[...ready.values()])));
  assert(eq(phase[j],ready.get(chosen.id)));
  // Geometric priority is checked exactly in a witness below. A tie with
  // a higher-priority transition invalidates this witness; not a proof
  // that no other phase assignment satisfies the strict inequality.
  if(chosen.group!=null)for(const t of ts.values()){
   if(t.group===chosen.group&&t.priority<chosen.priority&&ready.has(t.id)){
    const key='priority:'+j+':'+t.id;
    const alias=sym();assert(eq(alias,op('-',ready.get(t.id),phase[j])));observables[key]=alias;checks.push({event:j,higher:t.id,key});
   }
  }
  last.set(chosen.id,j);
  for(const [id,n] of entries(chosen.pre))consumed.set(id,consumed.get(id)+n);
  for(const [id,n] of entries(chosen.post))produced.set(id,produced.get(id)+n);
 }
 const counts=Object.fromEntries([...occurrences].map(([k,v])=>[k,v.length]));
 return {status:'compiled',smt:lines.join('\n'),observables,checks,counts,groups:{phases:Object.keys(observables)},variables:serial};
}
function solvePeriodicServiceWord(net,word,arith,solve,options={}){
 const problem=compilePeriodicServiceWord(net,word);
 if(problem.status!=='compiled')return problem;
 // The solver's observable interface requires variable symbols; aliases
 // are introduced for readiness expressions if needed.
 const r=solve(problem,arith,options);
 if(r.status!=='sat'||!r.witness)return {status:r.status,algebra:r};
 const H=arith.q(r.witness.period);
 if(arith.cmp(H,arith.Z)<=0)return {status:'unresolved',reason:'nonpositive period',algebra:r};
 const violations=problem.checks.filter(c=>arith.cmp(arith.q(r.witness[c.key]),arith.Z)<=0);
 if(violations.length)return {status:violations.some(c=>Object.hasOwn(r.unique,c.key)&&arith.cmp(arith.q(r.unique[c.key]),arith.Z)<=0)?'priority-infeasible':'priority-witness-rejected',violations,algebra:r};
 return {status:'conditional-word',period:r.witness.period,periodUnique:Object.hasOwn(r.unique,'period'),rates:Object.fromEntries(Object.entries(problem.counts).map(([k,n])=>[k,arith.txt(arith.div(arith.q(n),H))])),algebra:r};
}
if(typeof module!=='undefined')module.exports={compilePeriodicServiceWord,solvePeriodicServiceWord};
