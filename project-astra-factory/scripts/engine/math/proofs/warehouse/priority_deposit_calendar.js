'use strict';
// Derive periodic arrival calendars algebraically for isolated, unblocked
// tandem chains. No trace, period discovery or numerical rate iteration.
// All calendar times are integer ticks (20/s). Each stage consumes every
// a-th predecessor packet, provided each start gap is sufficient for
// both processing and dispatch of the preceding batch.
function proveTandemArrivalCalendars(g,A,terminalRoutes){
 const {q,div,cmp,Z}=A,ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return [];I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.compatible===true&&e.active!==false&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0]);
 const gcd=(a,b)=>b?gcd(b,a%b):a;
 function calendar(e,seen){
  const m=ns.get(e.from),r=m.recipe,ins=I.get(m.id),outs=O.get(m.id);
  if(seen.has(m.id)||!r||!valid(e)||outs.length!==1||m.physicalOutCount!==1||m.physicalInCount!==ins.length||r.output!==e.materials[0]||!Number.isSafeInteger(r.qty)||r.qty<1)return null;
  const t=q(r.seconds),ticks=t.n*20n/t.d;
  if(t.n*20n%t.d||ticks<=0n||ticks>1000000n)return null;
  const T=Number(ticks),b=r.qty,travel=e.length*10;
  if(!ins.length){
   if(Object.keys(r.inputs||{}).length||T<20*b||b>256)return null;
   return {period:T,times:Array.from({length:b},(_,i)=>T+20*i+travel)};
  }
  if(ins.length!==1||Object.keys(r.inputs||{}).length!==1)return null;
  const a=r.inputs[ins[0].materials[0]];
  if(!Number.isSafeInteger(a)||a<1)return null;
  seen.add(m.id);const src=calendar(ins[0],seen);seen.delete(m.id);if(!src)return null;
  const n=src.times.length,repeat=a/gcd(a,n),count=n*repeat/a,H=src.period*repeat;
  if(count*b>256||H>1000000)return null;
  const at=j=>src.times[j%n]+Math.floor(j/n)*src.period;
  const starts=Array.from({length:count},(_,i)=>at((i+1)*a-1));
  if(starts.some((v,i)=>(i+1<count?starts[i+1]:starts[0]+H)-v<Math.max(T,20*b)))return null;
  return {period:H,times:starts.flatMap(x=>Array.from({length:b},(_,i)=>x+T+20*i+travel))};
 }
 return g.lines.filter(e=>terminalRoutes.has(e.id)).flatMap(e=>{
  const c=calendar(e,new Set());return c?[{route:e.id,item:e.materials[0],...c}]:[];
 });
}
// Only actual free deposits are used by the warehouse priority theorem.
// Other callers must independently prove their specified terminal is free.
function proveTandemDepositCalendars(g,A){
 const ns=new Map(g.nodes.map(m=>[m.id,m]));
 return proveTandemArrivalCalendars(g,A,new Set(g.lines.filter(e=>ns.get(e.to)?.type==='仓入').map(e=>e.id)));
}
// Exact calendar composition, retaining simultaneous deposits rather
// than deduplicating them. All times are integer ticks.
function combinePeriodicCalendars(calendars,{maxPeriod=20000,maxEvents=4096}={}){
 if(!calendars.length)return null;
 const gcd=(a,b)=>b?gcd(b,a%b):a;let H=1;
 for(const c of calendars){
  if(!Number.isSafeInteger(c.period)||c.period<1||!c.times.length||c.times.some(t=>!Number.isSafeInteger(t)||t<0))return null;
  H=H/gcd(H,c.period)*c.period;if(H>maxPeriod)return null;
 }
 if(calendars.reduce((n,c)=>n+H/c.period*c.times.length,0)>maxEvents)return null;
 const phases=calendars.flatMap(c=>Array.from({length:H/c.period},(_,i)=>c.times.map(t=>(t+i*c.period)%H)).flat()).sort((a,b)=>a-b);
 return {period:H,phases,startTick:Math.max(...calendars.flatMap(c=>c.times)),packets:phases.length};
}
// Bounds over ALL integer-frame half-open windows (s,s+ticks].
// Once the calendar is fully active they are sharp extrema; at empty
// startup the upper bound still holds, the lower bound need not.
function periodicCountBounds(c,ticks){
 if(!c||!Number.isSafeInteger(ticks)||ticks<0)return null;
 const q=Math.floor(ticks/c.period),r=ticks%c.period,base=q*c.packets;
 if(!r)return {lower:base,upper:base};
 const p=c.phases,n=p.length,dup=[...p,...p.map(x=>x+c.period)];
 let upper=0,j=0;
 for(let i=0;i<n;i++){if(j<i)j=i;while(j<i+n&&dup[j]-dup[i]<r)j++;upper=Math.max(upper,j-i);}
 // The complement of r consecutive integer ticks is H-r ticks.
 const other=c.period-r;let complement=0;j=0;
 for(let i=0;i<n;i++){if(j<i)j=i;while(j<i+n&&dup[j]-dup[i]<other)j++;complement=Math.max(complement,j-i);}
 return {lower:base+n-complement,upper:base+upper};
}
// Minimum/maximum span between event j and j+steps in a strictly
// ordered periodic source. Unlike mean rate this preserves burst gaps.
function periodicSpanBounds(c,steps){
 if(!c||!Number.isSafeInteger(steps)||steps<0)return null;
 const p=c.phases,n=p.length,q=Math.floor(steps/n),r=steps%n;
 const spans=p.map((x,i)=>q*c.period+p[(i+r)%n]+(i+r>=n?c.period:0)-x);
 return {lower:Math.min(...spans),upper:Math.max(...spans)};
}
function completeDepositContracts(g,A,extraCalendars=[]){
 const ns=new Map(g.nodes.map(m=>[m.id,m])),byRoute=new Map(g.lines.map(e=>[e.id,e])),out=[];
 // Only zero-start certified arrivals at actual warehouse deposits
 // contribute to stock income. A freely accepting computer destroys
 // packets and must never be treated as a deposit.
 const calendars=[...new Map([...proveTandemDepositCalendars(g,A),...extraCalendars.filter(c=>{const e=byRoute.get(c.route);return !c.eventual&&e&&ns.get(e.to)?.type==='仓入'&&e.materials.length===1&&e.materials[0]===c.item;})].map(c=>[c.route,c])).values()];
 for(const k of new Set(calendars.map(c=>c.item))){
  const cs=calendars.filter(c=>c.item===k),edges=g.lines.filter(e=>ns.get(e.to)?.type==='仓入'&&e.materials.includes(k));
  if(edges.some(e=>!cs.some(c=>c.route===e.id))||(g.frozen||[]).some(f=>f.rates[k]!=null&&A.cmp(A.q(f.rates[k]),A.Z)>0))continue;
  const c=combinePeriodicCalendars(cs);if(c)out.push({item:k,routes:cs.map(x=>x.route),...c,rate:A.txt(A.div(A.q(c.packets*20),A.q(c.period)))});
 }
 return out;
}
// Every selected deposit frame is a priority refill opportunity whenever
// the first outlet has space and cooldown. A lower-priority outlet can
// consume the packet only if the first outlet is ineligible. The selected
// slots are >=P apart, so the virtual service queue is a conservative
// upper bound on actual refill times, even if other outlets are arbitrary.
function provePriorityCalendarTrees(g,A,trees){
 const result={relations:[],witnesses:[]};
 if(g.unlimited)return result;
 const calendars=proveTandemDepositCalendars(g,A),{q,txt,cmp,Z}=A;
 const lcm=(a,b)=>{let x=a,y=b;while(y){const z=x%y;x=y;y=z;}return a/x*b;};
 for(const tree of trees){
  if(tree.caps.length!==1)continue;
  const cap=tree.caps[0],k=cap.item,p=g.pools.find(x=>x.item===k);
  if(!p||p.order[0]!==cap.machine||(g.frozen||[]).some(f=>f.rates[k]!=null&&cmp(q(f.rates[k]),Z)!==0))continue;
  const cs=calendars.filter(c=>c.item===k);
  if(!cs.length)continue;
  let H=1;
  for(const c of cs){H=lcm(H,c.period);if(H>20000)break;}
  if(H>20000)continue;
  const phases=[...new Set(cs.flatMap(c=>Array.from({length:H/c.period},(_,i)=>c.times.map(t=>(t+i*c.period)%H)).flat()))].sort((a,b)=>a-b);
  if(!phases.length||phases.length>256)continue;
  const slots=[];
  for(const t of phases)if(!slots.length||t-slots.at(-1)>=20)slots.push(t);
  if(slots.length>1&&slots[0]+H-slots.at(-1)<20)slots.pop();
  if(!slots.length||H<20)continue;
  // Worst waiting time for l consecutive slots, including an arbitrary
  // starting phase. W_l is the largest sum of l cyclic gaps.
  const b=slots.length,gaps=slots.map((t,i)=>(i+1<b?slots[i+1]:slots[0]+H)-t);
  const waits=Array.from({length:b},(_,i)=>Math.max(...gaps.map((_,j)=>Array.from({length:i+1},(_,x)=>gaps[(j+x)%b]).reduce((a,v)=>a+v,0))));
  if(!tree.stages||!Number.isSafeInteger(cap.rootIndex)||tree.stages[cap.rootIndex].transit)continue;
  const stages=tree.stages.map(s=>({...s}));
  stages[cap.rootIndex].rootCalendar={period:txt(q({n:BigInt(H),d:20n})),waits:waits.map(w=>txt(q({n:BigInt(w),d:20n})))};
  const fast=proveRecipeTree(tree.stages,A,{clock:'fixed-tick',maxNodes:600,maxEdges:20000,terminalWait:tree.terminalWait});
  if(fast.status!=='proved')continue;
  const slow=proveRecipeTree(stages,A,{clock:'fixed-tick',maxNodes:600,maxEdges:20000,terminalWait:tree.terminalWait,upperBlockTime:fast.blockTime});
  if(slow.status!=='upper-proved'||slow.blockTime!==fast.blockTime)continue;
  const query='machineTotal:'+cap.machine+'|out';
  result.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'priority-deposit-calendar-equal-slopes',sense:'eq',coefficients:{[query]:1},constant:cap.rate});
  result.witnesses.push({method:'priority-deposit-calendar-equal-slopes',machine:cap.machine,item:k,rate:cap.rate,periodTicks:H,slots,waits,calendarSources:cs,fast:fast.blockTime,slow:slow.blockTime});
 }
 return result;
}

// Priority opportunities from independent deposit calendars.
// A direct deposit is an opportunity at its tick. If m lower-priority
// outlets exist and >m deposits coincide, the whole following open
// P-window is also safe PROVIDED no high-priority refill has happened
// since that deposit. Each lower outlet can take at most one in that
// window. P-separated selected opportunities guarantee that premise
// for the comparison j-th refill. No lower-output readiness assumed.
function priorityOpportunityCalendar(g,A,item,periodHint){
 const pool=g.pools.find(p=>p.item===item);
 if(!pool?.order?.length||g.unlimited||(g.frozen||[]).some(f=>f.rates[item]!=null&&A.cmp(A.q(f.rates[item]),A.Z)!==0))return null;
 const cs=proveTandemDepositCalendars(g,A).filter(c=>c.item===item);
 if(!cs.length)return null;
 const gcd=(a,b)=>b?gcd(b,a%b):a;let H=periodHint;
 for(const c of cs){H=H/gcd(H,c.period)*c.period;if(H>20000)return null;}
 if(cs.reduce((n,c)=>n+c.times.length*H/c.period,0)>4096)return null;
 const byPhase=new Map();
 for(const c of cs)for(const t of c.times)for(let i=0;i<H/c.period;i++){
  const f=t+i*c.period,p=f%H;
  (byPhase.get(p)||byPhase.set(p,[]).get(p)).push(f);
 }
 const first=new Map(),put=t=>{const p=t%H;first.set(p,Math.min(first.get(p)??Infinity,t));};
 const other=pool.order.length-1;
 for(const fs of byPhase.values()){
  fs.sort((a,b)=>a-b);put(fs[0]);
  if(fs.length>other)for(let d=1;d<20;d++)put(fs[other]+d);
 }
 const phases=[...first.keys()].sort((a,b)=>a-b);
 if(!phases.length||phases.length>4096||H<20)return null;
 // Greedy interval scheduling conditional on the first circular slot;
 // every maximum-cardinality P-separated circular set has such a first.
 const candidates=[];
 for(const p of phases){
  const selected=[p];
  for(const x of phases.map(x=>x<p?x+H:x).sort((a,b)=>a-b))
   if(x-selected.at(-1)>=20&&p+H-x>=20)selected.push(x);
  const a=selected.map(t=>t%H).sort((a,b)=>a-b);
  candidates.push(a);
 }
 const unique=[...new Map(candidates.map(a=>[a.join(','),a])).values()].sort((a,b)=>b.length-a.length);
 return {period:H,highest:pool.order[0],other,candidates:unique.slice(0,64).map(phases=>({period:H,phases,firsts:phases.map(p=>first.get(p))}))};
}
// Closed ordinal sequence of an eventual periodic calendar. Startup
// slots are not invented: each phase starts at its own first tick.
function prioritySlotSequence(c){
 const start=Math.max(...c.firsts),H=c.period;
 const prefix=c.firsts.flatMap(t=>Array.from({length:Math.max(0,Math.ceil((start-t)/H))},(_,i)=>t+i*H)).sort((a,b)=>a-b);
 const word=c.firsts.map(t=>t+Math.max(0,Math.ceil((start-t)/H))*H).sort((a,b)=>a-b);
 const at=j=>j<=prefix.length?prefix[j-1]:word[(j-prefix.length-1)%word.length]+Math.floor((j-prefix.length-1)/word.length)*H;
 return {prefix,word,at};
}
// Exact, static comparison schedule for a dedicated one-unit warehouse
// ingredient and a second, independently periodic one-unit ingredient.
// The latter fixes batch starts B_j. In the real graph:
// F_j <= selected slot if previous refill and queue space are ready;
// S_j = max(F_j,S_(j-1)+P,R_(j-K)+d);
// R_j = max(S_j+Ld,R_(j-1)+P,B_(j-3)+delta).
// A_j is a faster guaranteed slot sequence; the affine demand-paced
// lower bounds are R*_j=B_(j-3)+delta and S*_j=R*_(j-K)+d.
// Choose periodic F*_j in (S*_(j-1),S*_j], then take componentwise max:
// F=max(A,F*), S=max(A,S*), R=max(A+Ld,R*).
// Both components satisfy every internal dependency. F belongs to the
// guaranteed slot set, so it is a valid comparison upper schedule.
// If R<=B, every batch starts at the independent input arrival.
// Since A has strictly faster slope, R=R*, S=S* eventually, matching
// the real lower bounds. No trajectory or orbit is searched.
function provePriorityPacedRecipeCalendars(g,A){
 const out={relations:[],witnesses:[],calendars:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&Number.isSafeInteger(e.length)&&e.length>=1&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0]);
 const ticks=t=>{const v=A.mul(A.q(t),A.q(20));return v.d===1n&&v.n>0n&&v.n<=1000000n?Number(v.n):null;};
 for(const m of g.nodes){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id);
  if(!r||!complete(m)||ins.length!==2||Object.keys(r.inputs||{}).length!==2||Object.values(r.inputs).some(a=>a!==1)||!ins.every(valid)||outs.length!==1||!valid(outs[0])||outs[0].materials[0]!==r.output||!independentFinalReceiver(outs[0],ns,I,O)||!Number.isSafeInteger(r.qty)||r.qty<1||r.qty>256)continue;
  if(new Set(ins.map(e=>e.materials[0])).size!==2||ins.some(e=>!Object.hasOwn(r.inputs,e.materials[0])))continue;
  const root=ins.find(e=>ns.get(e.from)?.type==='仓出'),other=ins.find(e=>e!==root);
  if(!root||!other)continue;
  const w=ns.get(root.from),item=root.materials[0];
  if(!complete(w)||I.get(w.id).length||O.get(w.id).length!==1||w.item!==item||root.fromPort!==0)continue;
  const cal=proveTandemArrivalCalendars(g,A,new Set([other.id]))[0],T=ticks(r.seconds);
  if(!cal||cal.times.length!==1||!T||cal.period<Math.max(T,20*r.qty)||cal.period<20)continue;
  const h=cal.period,b=cal.times[0],L=root.length,K=L+1,travel=L*10,d=10;
  // A full belt releases one slot d ticks after its oldest packet
  // is received; the demand-paced gaps must be compatible with it.
  if(K*h<travel+d)continue;
  const slots=priorityOpportunityCalendar(g,A,item,h);
  if(!slots||slots.highest!==w.id)continue;
  const B=j=>b+(j-1)*h,R=j=>B(j-3)+1,S=j=>R(j-K)+d;
  const n=slots.period/h;if(!Number.isSafeInteger(n)||n>256)continue;
  let cert=null;
  for(const c of slots.candidates){
   const C=c.phases.length;
   if(C<=n)continue; // strict spare opportunities, not a mean guess
   const seq=prioritySlotSequence(c),at=seq.at;
   // Choose the earliest opportunity after the FIFO vacancy; require
   // it before the NEXT dispatch. This stronger contract proves the
   // FIFO is full immediately before every sufficiently late send.
   const Fs=[];
   for(let j=1;j<=n;j++){
    const release=S(j-3)+1,f=Math.min(...c.phases.map(p=>p+Math.ceil((release-p)/c.period)*c.period));
    if(f>S(j-2)){Fs.length=0;break;}Fs.push(f);
   }
   if(Fs.length!==n)continue;
   if(Fs.some((v,i)=>v-(i?Fs[i-1]:Fs.at(-1)-c.period)<20))continue;
   // For j after the finite prefix, A_j repeats by C indices, and
   // B_j advances C*h>H. Hence checking prefix + one word proves
   // every deadline, not a finite-time approximation.
   const check=seq.prefix.length+C;
   if(Array.from({length:check},(_,i)=>i+1).some(j=>at(j)+travel>B(j)))continue;
   const fstar=j=>Fs[(j-1)%n]+Math.floor((j-1)/n)*c.period;
   // A phase that has not begun cannot be used in the max comparison.
   // Once all phases are active this condition is automatic.
   let startupOK=true;
   for(let j=1;fstar(j)<Math.max(...c.firsts);j++){
    if(j>4096){startupOK=false;break;}
    const f=fstar(j),p=((f%c.period)+c.period)%c.period;
    if(f>at(j)&&f<c.firsts[c.phases.indexOf(p)]){startupOK=false;break;}
   }
   if(!startupOK)continue;
   let eventual=K+4;
   for(let j=seq.prefix.length+1;j<=check;j++){
    const lag=Math.max(0,at(j)-S(j),at(j)+travel-R(j));
    const repeats=Math.ceil(lag/(C*h-c.period));
    eventual=Math.max(eventual,j+repeats*C);
   }
   let refillEventual=eventual;
   for(let j=seq.prefix.length+1;j<=check;j++){
    const repeats=Math.ceil(Math.max(0,at(j)-S(j-3)-1)/(C*h-c.period));
    refillEventual=Math.max(refillEventual,j+repeats*C);
   }
   cert={sourceSlots:c,prefix:seq.prefix,word:seq.word,steadyRefillUpper:Fs,steadyRefillLower:Array.from({length:n},(_,i)=>S(i+1-3)+1),sendFirst:S(eventual),receiveFirst:R(eventual),eventualOrdinal:eventual,refillEventualOrdinal:refillEventual,deadlineChecks:check};break;
  }
  if(!cert)continue;
  const rate=A.txt(A.div(A.q(20),A.q(h))),emit=(key,value)=>out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'priority-paced-recipe-calendar',sense:'eq',coefficients:{[key]:1},constant:value});
  emit('cycle:'+m.id,rate);emit('routeTotal:'+root.id,rate);
  const output={route:outs[0].id,item:r.output,period:h,times:Array.from({length:r.qty},(_,i)=>b+T+i*20+outs[0].length*10)};
  out.calendars.push(output);
  out.witnesses.push({method:'priority-paced-recipe-calendar',machine:m.id,root:w.id,item,rate,batchFirst:b,batchPeriod:h,inputCalendar:cal,outputCalendar:output,sendPeriod:h,...cert});
 }
 return out;
}

// Static inverse of an affine periodic count, valid for sufficiently
// late events. This is arithmetic on one phase domain, not time-stepping.
function priorityInverseCount(count,H,m,j,guaranteed=false){
 if(guaranteed){
  let last=-Infinity;
  for(let p=0;p<H;p++)last=Math.max(last,p+Math.floor((j-1-count(p))/m)*H);
  return last+1;
 }
 let first=Infinity;
 for(let p=0;p<H;p++)first=Math.min(first,p+Math.ceil((j-count(p))/m)*H);
 return first;
}
function priorityPeriodicCount(times,H,t){
 return times.reduce((n,p)=>n+Math.floor((t-p)/H)+1,0);
}
function prioritySmoothOrdinal(at,H,m){
 // If H>m*P, every earlier full word gives a strictly smaller
 // candidate in the greedy cooldown recurrence. One word suffices.
 if(m<1||H<=20*m)return null;
 return j=>Math.max(...Array.from({length:m},(_,k)=>at(j-k)+20*k));
}
function priorityResidualContract(g,A,w){
 const pool=g.pools.find(p=>p.item===w.item);
 if(!pool||pool.order.length!==2||pool.order[0]!==w.root)return null;
 const ns=new Map(g.nodes.map(m=>[m.id,m]));
 if((g.frozen||[]).some(f=>f.rates[w.item]!=null&&A.cmp(A.q(f.rates[w.item]),A.Z)!==0))return null;
 const cs=proveTandemDepositCalendars(g,A).filter(c=>c.item===w.item);
 const deposits=g.lines.filter(e=>ns.get(e.to)?.type==='仓入'&&e.materials.includes(w.item));
 if(!cs.length||deposits.some(e=>!cs.some(c=>c.route===e.id)))return null;
 const H=w.sourceSlots.period,n=w.steadyRefillUpper.length;
 if(cs.some(c=>H%c.period)||!n||n!==w.steadyRefillLower.length)return null;
 const D=t=>cs.reduce((v,c)=>v+priorityPeriodicCount(c.times,c.period,t),0);
 const packets=cs.reduce((v,c)=>v+c.times.length*H/c.period,0),m=packets-n;
 if(m<1||H<=20*m||m>256||packets>4096)return null;
 const lowCount=t=>D(t)-priorityPeriodicCount(w.steadyRefillLower,H,t);
 const highCount=t=>D(t)-priorityPeriodicCount(w.steadyRefillUpper,H,t);
 const E=prioritySmoothOrdinal(j=>priorityInverseCount(highCount,H,m,j),H,m);
 const V=prioritySmoothOrdinal(j=>priorityInverseCount(lowCount,H,m,j,true),H,m);
 if(!E||!V)return null;
 const minSpan=k=>Math.min(...Array.from({length:m},(_,i)=>E(i+1+k)-V(i+1)));
 const minUpperSpan=k=>Math.min(...Array.from({length:m},(_,i)=>V(i+1+k)-V(i+1)));
 return {item:w.item,root:pool.order[1],highest:w.root,H,m,packets,D,E,V,minSpan,minUpperSpan,lowCount,highCount,calendars:cs,refillUpper:w.steadyRefillUpper,refillLower:w.steadyRefillLower};
}
// Once the low outlet is proved freely accepting, a static periodic
// priority schedule can be certified without a trajectory search.
// Candidate high refills are its already-proved upper deadlines, and
// the low schedule is cooldown smoothing of the residual deposit word.
// Pointwise guards are verified as algebraic periodic count identities.
// A real reset anchor (zero stock, one high vacancy, both clocks ready)
// proves the candidate is reached from the empty-start trajectory.
function proveFreePriorityResidualWord(c,w){
 const {H,m,packets,D}=c;
 if(H<=20*packets)return null; // low alone must clear all stock
 const hi=t=>priorityPeriodicCount(w.steadyRefillUpper,H,t);
 const s1=w.sendFirst-(w.eventualOrdinal-1)*w.sendPeriod;
 const sends=t=>Math.floor((t-s1)/w.sendPeriod)+1;
 const residual=t=>D(t)-hi(t);
 for(let p=0;p<H;p++)if(residual(p)<residual(p-1))return null;
 const at=prioritySmoothOrdinal(j=>priorityInverseCount(residual,H,m,j),H,m);
 if(!at)return null;
 const times=Array.from({length:m},(_,i)=>at(i+1)),lo=t=>priorityPeriodicCount(times,H,t);
 for(let t=0;t<H;t++){
  const stock=D(t)-hi(t-1)-lo(t-1),queue=hi(t-1)-sends(t-1);
  const a=hi(t)-hi(t-1),b=lo(t)-lo(t-1),after=stock-a-b;
  const highReady=queue<3&&hi(t-1)===hi(t-20)&&stock>=1;
  const lowReady=lo(t-1)===lo(t-20)&&stock-a>=1;
  if(stock<0||after<0||queue<0||queue>3||a!==Number(highReady)||b!==Number(lowReady)||hi(t)-sends(t)<0||hi(t)-sends(t)>3)return null;
 }
 // A single cooldown server that takes all arrivals, ignoring priority,
 // is a conservative upper stock bound once the low outlet is free.
 // On any prefix, the real combined withdrawals dominate its count.
 const allAt=prioritySmoothOrdinal(j=>priorityInverseCount(D,H,packets,j),H,packets);
 if(!allAt)return null;
 const allTimes=Array.from({length:packets},(_,i)=>allAt(i+1)),all=t=>priorityPeriodicCount(allTimes,H,t);
 let anchor=null;
 for(let t=0;t<H;t++){
  if(sends(t)===sends(t-1)||D(t)!==D(t-20)||D(t-20)!==all(t-20))continue;
  if(hi(t)!==sends(t)+2||hi(t-20)!==hi(t)||lo(t-20)!==lo(t)||D(t)!==hi(t)+lo(t))continue;
  anchor=t;break;
 }
 if(anchor===null)return null;
 return {period:H,times,phases:times.map(t=>((t%H)+H)%H).sort((a,b)=>a-b),highRefills:w.steadyRefillUpper,anchor,standalonePhases:allTimes.map(t=>((t%H)+H)%H).sort((a,b)=>a-b)};
}
// A residual-priority source has a finite periodic envelope E_j<=F_j
// and, conditional on enough total downstream service, F_j<=V_j.
// Prove the latter using one dedicated accepting recipe as a comparison
// sink for ALL packets. Its actual sends form a subsequence i(k).
// If total dispatch j is due, its target belt space follows from
// R_(k+1-K) <= V_(i(k+1-K))+travel <= V_(j-K)+travel.
// Its batch start is bounded by V_(i(a*b))+travel, because V has an
// a-step span >=H. Hence choosing a different branch never worsens
// this upper comparison, even if earlier packets arrived in bursts.
// For arbitrary finite initial history use max(V_j,C+j*h_fast);
// both schedules satisfy the same ordinal dependencies and the faster
// affine ramp disappears after a finite index (strict slope margin).
//
// The lower/upper envelope then bounds the actual target a-step
// spacing. If it strictly exceeds H and a*P, finite backlog errors
// in receipt/batch recurrences vanish: every positive-lag dependency
// has positive slack over a bounded block of indices. Thus that belt
// eventually accepts freely. The splitter FIFO drains because the
// residual mean <1/P. Any other proved-free sibling then increases
// the minimum ordinal spacing of every remaining candidate.
function proveResidualPrioritySplitterElementLaw(g,A,paced,{abundantItems=[],freeRoutes=[]}={}){
 const out={relations:[],witnesses:[],calendars:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 const tick=t=>{const x=A.mul(A.q(t),A.q(20));return x.d===1n&&x.n>=20n&&x.n<=1000000n?Number(x.n):null;};
 function root(e){
  const m=ns.get(e.from),r=m.recipe;
  if(!valid(e)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||e.fromPort!==0)return null;
  if(m.type==='仓出'&&m.item===e.materials[0]&&abundantItems.includes(m.item))return {gap:20,root:m.id,kind:'abundant-warehouse'};
  const h=r&&tick(r.seconds);
  if(r&&h&&r.qty===1&&r.output===e.materials[0]&&!Object.keys(r.inputs||{}).length)return {gap:h,root:m.id,kind:'autonomous-unit'};
  return null;
 }
 function supply(e){
  const d=root(e);if(d)return d;
  const m=ns.get(e.from),ins=I.get(m.id),outs=O.get(m.id);
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0].toPort!==0||outs.length<2||outs.length>3||![...ins,...outs].every(x=>valid(x)&&x.materials[0]===e.materials[0]))return null;
  const c=root(ins[0]);return c?.gap===20?{...c,gap:20*outs.length,kind:'saturated-root-splitter'}:null;
 }
 const freeOutput=new Set(freeRoutes);
 for(const w of paced.witnesses||[]){
  const c=priorityResidualContract(g,A,w);
  if(!c)continue;
  const r=ns.get(c.root),es=O.get(c.root);
  if(!complete(r)||r.type!=='仓出'||r.item!==c.item||I.get(r.id).length||es.length!==1||!valid(es[0])||es[0].fromPort!==0||es[0].materials[0]!==c.item)continue;
  const input=es[0],split=ns.get(input.to),ins=I.get(split.id),outs=O.get(split.id);
  if(split.type!=='分流'||!complete(split)||ins.length!==1||ins[0]!==input||input.toPort!==0||outs.length<2||outs.length>3||outs.some(e=>!valid(e)||e.materials[0]!==c.item))continue;
  const candidates=[];
  for(const e of outs){
   const d=ns.get(e.to),rec=d.recipe,di=I.get(d.id),doo=O.get(d.id),keys=Object.keys(rec?.inputs||{}),a=rec?.inputs?.[c.item],T=rec&&tick(rec.seconds);
   if(!rec||!T||!complete(d)||rec.qty!==1||!Number.isSafeInteger(a)||a<1||keys.length<2||keys.length!==di.length||di.some(x=>!valid(x))||keys.some(k=>!Number.isSafeInteger(rec.inputs[k])||rec.inputs[k]<1||di.filter(x=>x.materials[0]===k).length!==1)||doo.length!==1||!valid(doo[0])||doo[0].materials[0]!==rec.output||!(independentFinalReceiver(doo[0],ns,I,O)||freeOutput.has(doo[0].id)))continue;
   let H=T;const clocks=[];let ok=true;
   for(const x of di.filter(x=>x!==e)){
    const z=supply(x);if(!z){ok=false;break;}
    H=Math.max(H,rec.inputs[x.materials[0]]*z.gap+1);clocks.push({route:x.id,...z});
   }
   if(ok)candidates.push({route:e.id,machine:d.id,a,H,clocks});
  }
  const base=candidates.find(b=>{
   const fast=Math.floor(Math.max(20,b.H/b.a))+1;
   return fast*c.m<c.H&&c.minUpperSpan(b.a)>=b.H&&c.minSpan(b.a)>Math.max(b.H,b.a*20);
  });
  if(!base)continue;
  const free=[base.route],evidence=[{...base,ordinalSpan:base.a,minimumTicks:c.minSpan(base.a),comparison:'all-packets-upper-schedule'}];
  const word=proveFreePriorityResidualWord(c,w);
  const exactSpan=k=>word?Math.min(...word.times.map((t,i)=>word.times[(i+k)%c.m]+Math.floor((i+k)/c.m)*c.H-t)):c.minSpan(k);
  for(let round=0;round<outs.length;round++){
   let changed=false;
   for(const b of candidates){
    if(free.includes(b.route))continue;
    const k=b.a*(free.length+1),min=exactSpan(k);
    if(min<=Math.max(b.H,b.a*20))continue;
    evidence.push({...b,ordinalSpan:k,minimumTicks:min,freeSiblings:free.slice()});free.push(b.route);changed=true;
   }
   if(!changed)break;
  }
  const rate=A.txt(A.div(A.q(20*c.m),A.q(c.H))),emit=(coefficients,constant,method)=>out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method,sense:'eq',coefficients,constant});
  // Critical unit-ingredient branch. All other n-1 ports have
  // already been certified eventually free, the root word is exact,
  // and an n-event span is a CONSTANT h. Even while this last port
  // is skipped, its sends S_j are at least h apart. Other ingredients
  // have real requested-head clocks (opening delta is absorbed in
  // the first P-spaced receipt, as in the record-deficit theorem).
  // With target batch a=1 and max start restoration H<=h:
  //   R_j<=max(S_j+Ld,R_(j-1)+P,B_(j-3)+delta)
  //   B_j<=max(B_(j-1)+H,R_j)
  // An upper comparison V_j=max(C+j*h,S_j+Ld) proves both inequalities
  // by induction; absorb finite initial histories in C and index shifts.
  // If S_j-j*h is bounded (it is nondecreasing), the rate is 1/h.
  // Otherwise it eventually exceeds C-Ld, so R_j=S_j+Ld eventually:
  // its belt is free, and successful RR counts differ by O(1).
  // A finite target stream drains as all other ingredient clocks
  // are grounded; with an infinite free root it cannot stay skipped.
  // Thus equality of MEANS holds even at critical load. Do not turn
  // this into a strict target-paced span or absolute phase certificate.
  if(word&&free.length===outs.length-1){
   const cal={period:word.period,phases:word.phases,packets:word.phases.length};
   const gap=periodicSpanBounds(cal,outs.length);
   const b=candidates.find(x=>!free.includes(x.route)&&x.a===1);
   if(b&&gap.lower===gap.upper&&gap.lower>20){
    const d=ns.get(b.machine),rec=d.recipe;
    // Use the actual route material, not its source's identity.
    const exactH=Math.max(tick(rec.seconds),...b.clocks.map(x=>rec.inputs[I.get(d.id).find(e=>e.id===x.route).materials[0]]*x.gap));
    if(Number.isSafeInteger(exactH)&&exactH<=gap.lower){
     emit({['routeTotal:'+b.route]:1,['routeTotal:'+free[0]]:-1},'0','element-priority-critical-unit-branch');
     out.witnesses.push({method:'element-priority-critical-unit-branch',machine:b.machine,splitter:split.id,root:r.id,item:c.item,target:b.route,peers:free.slice(),gapTicks:gap.lower,periodBound:exactH,clocks:b.clocks});
    }
   }
  }
  emit({['routeTotal:'+input.id]:1},rate,'element-priority-residual-total');
  for(const id of free.slice(1))emit({['routeTotal:'+id]:1,['routeTotal:'+free[0]]:-1},'0','element-priority-residual-free-equality');
  if(word)out.calendars.push({route:input.id,item:c.item,period:word.period,times:word.times.map(t=>t+input.length*10),eventual:true});
  out.witnesses.push({method:'element-priority-residual-free-equality',machine:split.id,root:r.id,item:c.item,rate,period:c.H,earliest:Array.from({length:c.m},(_,i)=>c.E(i+1)),latest:Array.from({length:c.m},(_,i)=>c.V(i+1)),free,evidence,word});
 }
 return out;
}

// Sole stock outlet, with independent complete arrival calendar and
// a free receiving path. In the empty-start model each refill is also
// dispatched immediately (same frame, separate cooldown). The exact
// ordinal equation is F_j=max(D_j,F_(j-1)+P). For a strict sub-capacity
// periodic calendar, expand the max over all earlier deposits; each
// earlier full period loses H-mP>0, so the eventual max uses one word.
// An arbitrary finite startup backlog is another affine term with
// slope P; it disappears because D_j grows faster. No orbit search.
function proveSingleOutletCalendarElementLaw(g,A,extraCalendars=[]){
 const out={relations:[],witnesses:[],calendars:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const full=proveFreeSplitterElementLaw(g,A),freeSplitterInputs=new Set(full.witnesses.map(w=>w.input));
 for(const c of completeDepositContracts(g,A,extraCalendars)){
  const w=g.nodes.filter(m=>m.type==='仓出'&&m.item===c.item);
  if(w.length!==1||(g.frozen||[]).some(f=>f.rates[c.item]!=null&&A.cmp(A.q(f.rates[c.item]),A.Z)!==0))continue;
  const m=w[0],es=O.get(m.id);
  if(I.get(m.id).length||m.physicalInCount!==0||m.physicalOutCount!==1||es.length!==1)continue;
  const e=es[0];
  if(e.fromPort!==0||e.active===false||e.compatible!==true||e.materials.length!==1||e.rawMaterials?.length!==1||e.materials[0]!==c.item||e.rawMaterials[0]!==c.item||!e.acceptedMaterials?.includes(c.item)||e.outFilter&&e.outFilter!=='任意'&&e.outFilter!==c.item||!Number.isSafeInteger(e.length)||e.length<1||!(independentFinalReceiver(e,ns,I,O)||freeSplitterInputs.has(e.id)))continue;
  // The direct free receiver contract guarantees the root's output
  // belt always admits P-spaced sends from empty start.
  const rate=A.cmp(A.q(c.rate),A.U)<0?c.rate:'1';
  const emit=key=>out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-sole-outlet-calendar',sense:'eq',coefficients:{[key]:1},constant:rate});
  emit('machineTotal:'+m.id+'|out');emit('routeTotal:'+e.id);
  let sendPhases=null;
  if(c.period>20*c.packets){
   const p=c.phases,H=c.period,n=p.length;
   const at=j=>p[((j%n)+n)%n]+Math.floor(j/n)*H;
   const smooth=prioritySmoothOrdinal(at,H,n);
   sendPhases=Array.from({length:n},(_,i)=>((smooth(i)%H)+H)%H).sort((a,b)=>a-b);
   out.calendars.push({route:e.id,item:c.item,period:H,times:sendPhases.map(t=>(t+e.length*10)%H).sort((a,b)=>a-b),eventual:true});
  }
  out.witnesses.push({method:'element-sole-outlet-calendar',machine:m.id,item:c.item,route:e.id,rate,input:c,sendPhases,arrivalCalendar:out.calendars.find(x=>x.route===e.id)||null});
 }
 return out;
}


// Free parallel warehouse servers, equal fixed cooldown P. This is
// ordinal algebra on an independently proved deposit word, not a
// simulation of warehouse state or a search for a repeating orbit.
//
// Once all refill paths are free, the j-th aggregate refill F_j obeys
// F_j=max(D_j,F_(j-m)+P), with D_j the j-th deposit and m outlets.
// Underload: the bi-infinite periodic comparison word is the exact
// eventual word. Shifting a candidate back lcm(n,m) event indices
// strictly decreases its value; any finite startup term also loses
// to the faster-growing deposit ordinal. At/above capacity the
// max recurrence gives total slope m/P, and every outlet <=1/P.
//
// Priority prefix k accepts the current event iff fewer than k of its
// own previous refills remain within the open cooldown interval.
// If p(j)=max{i<j:F_i<=F_j-P}, its accepted count satisfies
// A_j=min(A_(j-1)+1,A_p+k). For B_j=j-A_j (up to an index constant),
// B_j=max(B_(j-1),B_p+j-p-k). This is an ordinal lag graph with
// known, periodic lags. The same-stage predecessor cycle connects
// every phase, so its maximum cycle ratio is the unique slope for
// all finite initial cooldown histories. Consecutive priority-prefix
// counts give individual outlet rates. No choice of a mean allocation
// and no demand approximation is involved.
function freeParallelWarehouseOrdinalWord(c,m,A,{maxNodes=600,maxEdges=120000}={}){
 const {q,cmp,txt,add,sub,mul,div,Z,U}=A,P=20;
 if(!Number.isSafeInteger(m)||m<1||!Number.isSafeInteger(c?.period)||c.period<1||!Array.isArray(c.phases)||!c.phases.length||c.phases.some(t=>!Number.isSafeInteger(t)||t<0||t>=c.period))return null;
 const H=c.period,phases=c.phases.slice().sort((a,b)=>a-b),n=phases.length;
 if(n*P>=m*H)return {rates:Array(m).fill('1'),prefix:Array.from({length:m},(_,i)=>String(i+1)),mode:'capacity',depositPeriod:H,depositPackets:n};
 if(n>maxNodes||m>128)return null;
 const gcd=(a,b)=>b?gcd(b,a%b):a,K=n/gcd(n,m),at=j=>phases[((j%n)+n)%n]+Math.floor(j/n)*H;
 const smooth=j=>Math.max(...Array.from({length:K},(_,k)=>at(j-k*m)+k*P));
 const times=Array.from({length:n},(_,i)=>smooth(i));
 const f=j=>times[((j%n)+n)%n]+Math.floor(j/n)*H;
 if(times.some((t,i)=>f(i+1)<t||f(i+m)<t+P))throw Error('parallel refill word certificate failed');
 const pred=times.map((t,j)=>{
  let lo=j-n*Math.max(1,Math.ceil(P/H)),hi=j;
  while(lo+1<hi){const x=Math.floor((lo+hi)/2);if(f(x)<=t-P)lo=x;else hi=x;}
  if(f(lo)>t-P||f(lo+1)<=t-P)throw Error('parallel refill conflict boundary failed');
  return lo;
 });
 const V=times.map((_,i)=>({stage:0,kind:'skip',index:i})),prefix=[],certificates=[];
 let previous=Z;
 for(let k=1;k<m;k++){
  const edges=[];
  for(let j=0;j<n;j++){
   for(const [i,w] of [[j-1,0],[pred[j],j-pred[j]-k]]){
    const lag=-Math.floor(i/n),from=((i%n)+n)%n;
    // Add one per block to make the nonnegative skip-count slope
    // strictly positive, since the shared solver uses positive ratios.
    edges.push({from,to:j,lag,w:q(w+lag)});
   }
  }
  const cert=solveOrdinalGraph(V,edges,[1],[1],A,{maxNodes,maxEdges});
  if(cert.status!=='proved')return null;
  const skip=sub(q(cert.blockTime),U),count=sub(q(n),skip),rate=div(mul(count,q(P)),q(H));
  if(cmp(skip,Z)<0||cmp(rate,previous)<0||cmp(sub(rate,previous),U)>0)return null;
  prefix.push(rate);previous=rate;certificates.push({priorityPrefix:k,skippedPerPeriod:txt(skip),acceptedPerPeriod:txt(count),proof:cert});
 }
 const total=div(q(n*P),q(H));if(cmp(total,previous)<0||cmp(sub(total,previous),U)>0)return null;
 prefix.push(total);
 return {rates:prefix.map((x,i)=>txt(sub(x,i?prefix[i-1]:Z))),prefix:prefix.map(txt),mode:'ordinal-word',depositPeriod:H,depositPackets:n,dispatchWord:times,predecessors:pred,certificates};
}
// A frozen actor with no negative entries advances its full common
// service clock every tick. For a/b items per tick its j-th whole item
// becomes available to physical refills at ceil(j*b/a)+1; the extra
// tick is the actual refill-before-frozen-stage ordering.
function independentFrozenDepositCalendar(f,item,A){
 const {q,div,cmp,Z}=A;
 if(!f?.rates||Object.values(f.rates).some(v=>cmp(q(v),Z)<0)||f.rates[item]==null)return null;
 const r=div(q(f.rates[item]),q(20));
 if(r.n<=0n||r.n>4096n||r.d>20000n)return null;
 const times=Array.from({length:Number(r.n)},(_,i)=>Number((BigInt(i+1)*r.d+r.n-1n)/r.n)+1);
 return {period:Number(r.d),times,actor:f.id,item};
}
function completeFreeOutletDepositContracts(g,A,extraCalendars=[]){
 const out=completeDepositContracts(g,A,extraCalendars),ns=new Map(g.nodes.map(m=>[m.id,m]));
 const physical=completeDepositContracts({...g,frozen:[]},A,extraCalendars);
 for(const item of new Set((g.frozen||[]).flatMap(f=>Object.keys(f.rates)))){
  const actors=(g.frozen||[]).filter(f=>f.rates[item]!=null&&A.cmp(A.q(f.rates[item]),A.Z)!==0);
  if(!actors.length)continue;
  const cs=actors.map(f=>independentFrozenDepositCalendar(f,item,A));
  if(cs.some(c=>!c))continue;
  const p=physical.find(c=>c.item===item);
  if(g.lines.some(e=>ns.get(e.to)?.type==='仓入'&&e.materials.includes(item))&&!p)continue;
  if(p)cs.push({period:p.period,times:p.phases.map(t=>t+Math.ceil(p.startTick/p.period)*p.period)});
  const c=combinePeriodicCalendars(cs);
  if(c)out.push({item,routes:p?.routes||[],...c,rate:A.txt(A.div(A.q(c.packets*20),A.q(c.period))),frozenSources:actors.map(f=>f.id)});
 }
 return out;
}
function proveFreeParallelWarehouseElementLaw(g,A,extraCalendars=[],freeCertificates=[]){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const free=new Map(freeCertificates.filter(c=>c.proven===true&&c.method==='refill-buffer-always-has-space-eventually').map(c=>[c.machine,c]));
 const {cmp,q,Z}=A;
 for(const c of completeFreeOutletDepositContracts(g,A,extraCalendars)){
  const outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item===c.item),pool=g.pools.find(p=>p.item===c.item);
  if(outlets.length<(c.frozenSources?.length?1:2)||!pool||pool.order.length!==outlets.length||new Set(pool.order).size!==outlets.length||pool.order.some(id=>!outlets.some(m=>m.id===id))||(g.frozen||[]).some(f=>f.rates[c.item]!=null&&cmp(q(f.rates[c.item]),Z)!==0&&!c.frozenSources?.includes(f.id)))continue;
  const ordered=pool.order.map(id=>ns.get(id)),es=ordered.map(m=>O.get(m.id)[0]);
  if(ordered.some((m,i)=>{
   const e=es[i],cert=free.get(m.id);
   return !cert||cert.item!==c.item||cert.route!==e?.id||I.get(m.id).length!==0||m.physicalInCount!==0||m.physicalOutCount!==1||O.get(m.id).length!==1||e.fromPort!==0||e.active===false||e.compatible!==true||e.materials.length!==1||e.materials[0]!==c.item||e.rawMaterials?.length!==1||e.rawMaterials[0]!==c.item||!e.acceptedMaterials?.includes(c.item)||e.outFilter&&e.outFilter!=='任意'&&e.outFilter!==c.item||!Number.isSafeInteger(e.length)||e.length<1;
  }))continue;
  const result=freeParallelWarehouseOrdinalWord(c,ordered.length,A);if(!result)continue;
  for(let i=0;i<ordered.length;i++){
   const m=ordered[i],e=es[i],rate=result.rates[i];
   for(const key of ['machineTotal:'+m.id+'|out','routeTotal:'+e.id])out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-free-parallel-warehouse-ordinal',sense:'eq',coefficients:{[key]:1},constant:rate});
  }
  out.witnesses.push({method:'element-free-parallel-warehouse-ordinal',item:c.item,order:pool.order.slice(),routes:es.map(e=>e.id),input:c,...result});
 }
 return out;
}
