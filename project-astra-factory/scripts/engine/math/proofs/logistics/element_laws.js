'use strict';
// Element law: an unfiltered splitter with only independently free
// downstream ports (possibly a tree of other such splitters) obeys
// cyclic dispatch of TOTAL packets. No per-material equality follows.
// Single-input P-spaced arrivals: empty-start induction proves no
// input wait, each arrival dispatches immediately, and every output
// remains eligible on its turn. Finite prefix discrepancy <= 1.
function proveFreeSplitterElementLaw(g,A){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&Number.isSafeInteger(e.length)&&e.length>=1&&Array.isArray(e.rawMaterials)&&e.rawMaterials.length>0&&e.rawMaterials.every(k=>e.materials.includes(k)&&e.acceptedMaterials?.includes(k)&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===k));
 const memo=new Map(),visiting=new Set();
 function free(e){
  if(!valid(e)||visiting.has(e.id))return false;
  if(memo.has(e.id))return memo.get(e.id);
  const m=ns.get(e.to);
  if(independentFinalReceiver(e,ns,I,O))return true;
  const ins=I.get(m.id),outs=O.get(m.id);
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0]!==e||e.toPort!==0||outs.length<1||outs.length>3)return false;
  visiting.add(e.id);
  // All packets reaching the input must be admissible on EVERY branch.
  const ok=outs.every(x=>e.rawMaterials.every(k=>x.rawMaterials?.includes(k)&&x.materials.includes(k)&&x.acceptedMaterials?.includes(k)&&(!x.outFilter||x.outFilter==='任意'||x.outFilter===k))&&free(x));
  visiting.delete(e.id);memo.set(e.id,ok);return ok;
 }
 for(const m of g.nodes){
  if(m.type!=='分流'||!complete(m)||I.get(m.id).length!==1||!free(I.get(m.id)[0]))continue;
  const e=I.get(m.id)[0],outs=O.get(m.id),n=outs.length;
  if(n<2)continue;
  for(const r of outs)out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-free-splitter-total',sense:'eq',coefficients:{['routeTotal:'+r.id]:n,['routeTotal:'+e.id]:-1},constant:'0'});
  out.witnesses.push({method:'element-free-splitter-total',machine:m.id,input:e.id,outputs:outs.map(r=>r.id),ports:n,materials:e.rawMaterials.slice(),scope:'total-only; no mixed-material ratio'});
 }
 return out;
}
// Conditional word law for a known periodic ordered material word.
// The phase is a premise, not inferred from average material rates.
// Enumerate exactly one lcm(m,n) block; no physical simulation or
// orbit search. This is also useful for diagnosing missing phases.
function elementRoundRobinWord(word,n,phase=0){
 if(!Array.isArray(word)||!word.length||word.some(k=>typeof k!=='string'||!k)||!Number.isSafeInteger(n)||n<1||n>3||!Number.isSafeInteger(phase)||phase<0||phase>=n)throw Error('Invalid RR word contract');
 let a=word.length,b=n;while(b){const t=a%b;a=b;b=t;}
 const length=word.length/a*n,counts=Array.from({length:n},()=>Object.create(null));
 for(let j=0;j<length;j++){const k=word[j%word.length],c=counts[(j+phase)%n];c[k]=(c[k]||0)+1;}
 return {length,counts};
}

// Exact conditional water-level law for periodic tandem supply, one or
// more independent freely accepting final branches, and dedicated
// single-ingredient unit-output recipes with independent free finals.
// Slow branches: a*maxSpan(n) < T -> bounded head service,
// hence start gaps <= T. Fast branches: T <= minSpan(a*k) where k is the
// number of fast branches. A first-skip induction guarantees at least
// k source arrivals between visits to each fast port. Each receives
// every a-th packet and can finish before the next group of a packets.
// No assumption about slow ports' phases or whether they are skipped.
// A free final branch keeps every source arrival dispatched immediately.
function provePeriodicSplitterElementLaw(g,A){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const {q,cmp,txt,div,mul,sub,add,Z,U}=A,ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&Number.isSafeInteger(e.length)&&e.length>=1&&e.rawMaterials?.length===1&&e.materials.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0]);
 const tickAligned=t=>cmp(q(t),U)>=0&&div(q(t),q('1/20')).d===1n;
 for(const m of g.nodes){
  const ins=I.get(m.id),outs=O.get(m.id);
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0].toPort!==0||outs.length<2||outs.length>3||![...ins,...outs].every(valid))continue;
  const e=ins[0],k=e.materials[0];
  if(outs.some(x=>x.materials[0]!==k))continue;
  const n=outs.length;
  let unsupported=false;const branches=[];
  for(const x of outs){
   if(independentFinalReceiver(x,ns,I,O)){branches.push({route:x,free:true});continue;}
   const d=ns.get(x.to),dr=d.recipe,di=I.get(d.id),doo=O.get(d.id),a=dr?.inputs?.[k];
   if(!complete(d)||!dr||di.length!==1||di[0]!==x||doo.length!==1||doo[0].fromPort!==0||!valid(doo[0])||doo[0].materials[0]!==dr.output||!independentFinalReceiver(doo[0],ns,I,O)||dr.qty!==1||Object.keys(dr.inputs||{}).length!==1||!Number.isSafeInteger(a)||a<1||!tickAligned(dr.seconds)){unsupported=true;break;}
   const T=q(dr.seconds);branches.push({route:x,free:false,a,T,cap:div(q(a),T)});
  }
  if(unsupported||!branches.some(b=>b.free))continue;
  // At least one free final guarantees the splitter accepts every
  // P-spaced input, so its independently proved tandem calendar is
  // valid all the way to this input. No blocked branch rate is assumed.
  const source=proveTandemArrivalCalendars(g,A,new Set([e.id]))[0];
  const c=source&&combinePeriodicCalendars([source]);
  if(!c||periodicSpanBounds(c,1).lower<20)continue;
  const seconds=t=>div(q(t),q(20)),supply=div(q(c.packets*20),q(c.period)),fullGap=seconds(periodicSpanBounds(c,n).upper);
  const slow=branches.filter(b=>!b.free&&cmp(b.T,mul(q(b.a),fullGap))>0),fast=branches.filter(b=>!slow.includes(b)),fastGap=seconds(periodicSpanBounds(c,fast.length).lower);
  if(fast.some(b=>!b.free&&cmp(b.T,seconds(periodicSpanBounds(c,b.a*fast.length).lower))>0))continue;
  let residual=supply;for(const b of slow)residual=sub(residual,b.cap);
  const share=div(residual,q(fast.length));
  const rates=Object.create(null),emit=(query,v)=>out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-periodic-splitter-water-level',sense:'eq',coefficients:{[query]:1},constant:txt(v)});
  emit('routeTotal:'+e.id,supply);
  for(const b of branches){const v=slow.includes(b)?b.cap:share;rates[b.route.id]=txt(v);emit('routeTotal:'+b.route.id,v);}
  out.witnesses.push({method:'element-periodic-splitter-water-level',machine:m.id,input:e.id,supply:txt(supply),sourceCalendar:c,maxRoundGap:txt(fullGap),slow:slow.map(b=>({route:b.route.id,cap:txt(b.cap)})),fast:fast.map(b=>b.route.id),fastGap:txt(fastGap),share:txt(share),rates});
 }
 return out;
}

// A dedicated multi-ingredient inlet can become a free accepting port
// without all the other inlet rates being known. The other ingredients
// need certified head-service clocks (not mean rates). This is a strict
// underload certificate, robust to arbitrary finite initial buffers.
//
// Let S_j be actual successful target sends (1-based), R_j receipts,
// B_i batch starts, a target units per batch. After finite startup:
//   B_i <= max(B_(i-1)+H, R_(ai))
//   R_j <= max(S_j+L/2, R_(j-1)+P,
//              B_ceil((j-3a)/a)+delta).
// H=max(T, max other a_k*h_k + delta). For target send gap h>P and
// a*h>H, subtract S_j+L/2 (or S_(ai)+L/2). All lagged predecessors
// lose strictly positive slack, while R_(ai)->B_i has zero lag.
// Every finite initial error therefore disappears after finitely many
// ordinal events; R_j=S_j+L/2 thereafter. No target belt backpressure.
// A branch with finitely many sends drains too: every complete batch
// of the remaining target material eventually starts, leaving <a items.
// With a free sibling, a skipped branch cannot remain skipped forever.
//
// RR supplies the minimum send gap: between two actual sends to a
// candidate every already-proved free sibling is visited at least once.
// Input packets are P-spaced and dispatch immediately due to the free
// terminal, so h >= (number of free siblings+1)*P. For a separately
// certified periodic tandem input use its sharper minimum ordinal span.
function proveMultiInputSplitterElementLaw(g,A,{abundantItems=[],freeRoutes=[]}={}){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const {q,cmp,add,mul,div,txt,Z,U}=A,delta=q('1/20'),ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 const aligned=t=>cmp(q(t),U)>=0&&div(q(t),delta).d===1n;
 const abundant=k=>g.unlimited||abundantItems.includes(k);
 const freeOutput=new Set(freeRoutes);
 function splitter(m,e){
  if(!complete(m)||m.type!=='分流')return null;
  const ins=I.get(m.id),outs=O.get(m.id),k=e.materials[0];
  return ins.length===1&&ins[0].toPort===0&&outs.length>=2&&outs.length<=3&&outs.includes(e)&&[...ins,...outs].every(x=>valid(x)&&x.materials[0]===k)?{input:ins[0],outs}:null;
 }
 function root(e){
  const m=ns.get(e.from),r=m.recipe;
  if(!valid(e)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||e.fromPort!==0)return null;
  if(m.type==='仓出'&&m.item===e.materials[0]&&abundant(m.item))return {gap:U,root:m.id,kind:'abundant-warehouse'};
  if(r&&Object.keys(r.inputs||{}).length===0&&r.qty===1&&r.output===e.materials[0]&&aligned(r.seconds))return {gap:q(r.seconds),root:m.id,kind:'autonomous-unit'};
  return null;
 }
 function supply(e){
  const d=root(e);if(d)return d;
  const sp=splitter(ns.get(e.from),e);if(!sp)return null;
  const r=root(sp.input);if(!r||cmp(r.gap,U)!==0)return null;
  return {...r,gap:q(sp.outs.length),kind:'saturated-root-splitter'};
 }
 for(const m of g.nodes){
  const ins=I.get(m.id),outs=O.get(m.id);
  if(m.type!=='分流'||!complete(m)||ins.length!==1||!outs.length||!splitter(m,outs[0]))continue;
  const free=outs.filter(e=>independentFinalReceiver(e,ns,I,O));
  if(!free.length)continue;
  const source=proveTandemArrivalCalendars(g,A,new Set([ins[0].id]))[0];
  const cal=source&&combinePeriodicCalendars([source]),span=n=>cal?div(q(periodicSpanBounds(cal,n).lower),q(20)):q(n);
  const evidence=[];
  // Finite logical closure: each new free port can only increase the
  // minimum ordinal gap of remaining candidates. At most three passes.
  for(let round=0;round<outs.length;round++){
   let changed=false;
   for(const e of outs){
    if(free.includes(e))continue;
    const d=ns.get(e.to),r=d.recipe,di=I.get(d.id),doo=O.get(d.id),keys=Object.keys(r?.inputs||{}),a=r?.inputs?.[e.materials[0]];
    if(!r||!complete(d)||r.qty!==1||!aligned(r.seconds)||keys.length<2||keys.length!==di.length||!di.includes(e)||di.some(x=>!valid(x))||keys.some(k=>!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<1||di.filter(x=>x.materials[0]===k).length!==1)||doo.length!==1||!valid(doo[0])||doo[0].materials[0]!==r.output||!(independentFinalReceiver(doo[0],ns,I,O)||freeOutput.has(doo[0].id)))continue;
    let H=q(r.seconds);const clocks=[];let ok=true;
    for(const x of di.filter(x=>x!==e)){
     const c=supply(x);if(!c){ok=false;break;}
     const t=add(mul(q(r.inputs[x.materials[0]]),c.gap),delta);if(cmp(t,H)>0)H=t;
     clocks.push({route:x.id,root:c.root,kind:c.kind,gap:txt(c.gap)});
    }
    const h=span(free.length+1);
    if(!ok||cmp(h,U)<=0||cmp(mul(q(a),h),H)<=0)continue;
    evidence.push({route:e.id,machine:d.id,targetBatch:a,gap:txt(h),period:txt(H),freeSiblings:free.map(x=>x.id),clocks});
    free.push(e);changed=true;
   }
   if(!changed)break;
  }
  if(!evidence.length)continue;
  for(const e of free.slice(1))out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-multi-input-free-port-equality',sense:'eq',coefficients:{['routeTotal:'+e.id]:1,['routeTotal:'+free[0].id]:-1},constant:'0'});
  if(cal)out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-multi-input-periodic-root',sense:'eq',coefficients:{['routeTotal:'+ins[0].id]:1},constant:txt(div(q(cal.packets*20),q(cal.period)))});
  out.witnesses.push({method:'element-multi-input-free-port-equality',machine:m.id,input:ins[0].id,free:free.map(e=>e.id),evidence,calendar:cal||null});
 }
 return out;
}

// Merger element for non-overlapping independently certified input
// calendars. At most one virtual head arrives in any P window. The
// FIFO is empty when the head arrives, it enqueues immediately and
// dispatches at the next tick; the outgoing belt is freely accepting.
// Thus the merged word is the time-sorted union, not a guessed material
// ratio. Startup phase at the downstream splitter is determined by the
// exact count of earlier events, not an orbit search.
function proveCalendarMergerElementLaw(g,A){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const {q,div,txt}=A,ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&Number.isSafeInteger(e.length)&&e.length>=1&&e.rawMaterials?.length>0&&e.rawMaterials.every(k=>e.materials.includes(k)&&e.acceptedMaterials?.includes(k)&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===k));
 const emit=(k,v)=>out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-calendar-merger-word',sense:'eq',coefficients:{[k]:1},constant:txt(v)});
 for(const m of g.nodes){
  const ins=I.get(m.id),outs=O.get(m.id);
  if(m.type!=='汇流'||!complete(m)||ins.length<2||ins.length>3||outs.length!==1||outs[0].fromPort!==0||![...ins,...outs].every(valid)||ins.some(e=>e.materials.length!==1))continue;
  const e=outs[0],d=ns.get(e.to),keys=[...new Set(ins.map(x=>x.materials[0]))];
  if(keys.some(k=>!e.rawMaterials.includes(k)))continue;
  let branches=[];
  if(!independentFinalReceiver(e,ns,I,O)){
   branches=O.get(d.id).slice().sort((a,b)=>a.fromPort-b.fromPort);
   if(d.type!=='分流'||!complete(d)||I.get(d.id).length!==1||e.toPort!==0||!branches.length||branches.length>3||branches.some(x=>!valid(x)||!independentFinalReceiver(x,ns,I,O)||keys.some(k=>!x.rawMaterials.includes(k))))continue;
  }
  const cs=proveTandemArrivalCalendars(g,A,new Set(ins.map(x=>x.id)));
  if(cs.length!==ins.length)continue;
  const c=combinePeriodicCalendars(cs);
  if(!c||periodicSpanBounds(c,1).lower<20)continue;
  const start=c.startTick,H=c.period,events=[],prefix=cs.reduce((s,x)=>s+x.times.reduce((t,p)=>t+Math.max(0,Math.ceil((start-p)/x.period)),0),0);
  for(const x of cs)for(const p of x.times){
   const first=p+Math.max(0,Math.ceil((start-p)/x.period))*x.period;
   for(let t=first;t<start+H;t+=x.period)events.push({time:t,item:x.item});
  }
  events.sort((a,b)=>a.time-b.time);
  if(events.length!==c.packets)continue;
  const word=events.map(x=>x.item),rate=div(q(c.packets*20),q(H));
  // Every input is nonblocking by the disjoint calendar proof.
  for(const x of cs)emit('routeTotal:'+x.route,div(q(x.times.length*20),q(x.period)));
  emit('routeTotal:'+e.id,rate);
  for(const k of keys)emit('flow:'+e.id+'|'+k,div(q(word.filter(x=>x===k).length*20),q(H)));
  const phase=branches.length?prefix%branches.length:null;
  const assignment=branches.length?elementRoundRobinWord(word,branches.length,phase):null;
  if(assignment)for(let i=0;i<branches.length;i++){
   for(const k of keys)emit('flow:'+branches[i].id+'|'+k,A.mul(rate,div(q(assignment.counts[i][k]||0),q(assignment.length))));
  }
  out.witnesses.push({method:'element-calendar-merger-word',machine:m.id,inputs:cs,output:e.id,calendar:c,word,phase,prefix,branches:branches.map(x=>x.id),assignment,rate:txt(rate)});
 }
 return out;
}

// Exact saturated three-port component law: a free terminal recipe Q
// consumes one unit from a faster private recipe C; Q and C both take
// the same ingredient from one homogeneous saturated splitter.
// Other ingredient ports have independent head-service clocks.
// The third branch may have arbitrary backpressure.
//
// Backward pacing: Q starts B_j with gaps >= T. C's next start is
// <= max(U_(j-1)+Hc, S_(j-20)+delta), Hc<T, since its ingredients
// replenish by Hc. Its output send and Q receipt have the usual
// ordinal belt dependencies. The affine-in-B comparison
//   R*_j=B_(j-3)+delta, S*_j=R*_(j-K)+d,
//   U*_j=S*_(j-20)+delta
// satisfies all lower and upper dependencies. Max with a faster
// affine ramp covers any finite initial state and disappears because
// B_j grows by >=T per index. Consequently C starts eventually have
// exactly the same gaps as Q, regardless of Q's actual cadence.
//
// For C's a_c packets from the saturated splitter, consecutive
// successful head service takes <=nP (n=3). The receive cache opens
// a_c places per C start. Static upper and lower ordinal schedules
//   U_b+delta+phase*P <= R_k <= U_b+delta+phase*nP,
//   U_b'+delta+d+phase*P <= S_k
//     <= U_b'+delta+d+nP+phase*nP
// follow by the same faster-ramp comparison, since T>a_c*nP.
// Thus those sends form groups of a_c in a window J=a_c*nP per
// downstream start; over every sufficiently late interval of length x,
// C sends <= a_c*ceil((x+J)/T) <= c*x+sigma, c=a_c/T,
// sigma=a_c*(J/T+1). No mean-rate assumption about C is required.
//
// A different target port, when its receiver stays nonfull, has the
// two-un-counted-port service clock: between successive receipts its
// time progress is <=2P + P*(counted C sends) in the clock shifted by
// belt travel. Proof: at u=previous receipt - travel, previous send
// and belt space recovery are already ready. Target cooldown ends
// by u+P. If no successful scan before u+P, the saturated source
// permits one by u+P; thereafter at most one uncounted other port
// and the counted port precede target. If a successful scan occurred
// before u+P, take the last such scan: its next pointer leaves at most
// ONE other port before target. Next scan occurs by max(u+P,w+P).
// The additional P beyond 2P can occur only if C was selected.
// The same argument applies to an incomplete final receipt gap.
// Start from the last full cache frame s (or arbitrary late boundary),
// so u=s-travel for the first head. Summing disjoint windows gives
//   R(t)-R(s) >= ((t-s)/P - (C(t-travel)-C(s-travel)))/2 - 2.
// The -2 is a conservative endpoint allowance, NOT a per-packet loss.
// With C's envelope this is >= r*(t-s)-beta,
// r=(1/P-c)/2, beta=sigma/2+2.
//
// Deadline proof for target batch amount a, Hgoal=a/r. If its own
// T and every other ingredient refill time are <=Hgoal and 2a>=beta,
// every sufficiently late j-th batch starts by C0+j*Hgoal. Otherwise
// take the first missed deadline t and the last full target cache s.
// Prior deadlines imply at most (t-s)/Hgoal+1 further batches needed;
// full 3a stock plus receipt lower bound covers them. If no full
// occurred, bounded cache and the same service envelope give a global
// lower count with finite initial discrepancy. Other ingredients and
// processing finish by the deadline. Thus lower rate r/a is exact as a
// bound; if equal to nominal or a joint conservation upper bound it
// certifies a unique rate. Applicable only to grounded saturated roots.
function proveSaturatedPacedSplitterLaw(g,A,{abundantItems=[],freeRoutes=[]}={}){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const {q,cmp,add,sub,mul,div,txt,Z,U}=A,delta=q('1/20'),two=q(2),three=q(3),ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&Number.isSafeInteger(e.length)&&e.length>=1&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0]);
 const fixed=t=>cmp(q(t),U)>=0&&div(q(t),delta).d===1n;
 const abundant=k=>g.unlimited||abundantItems.includes(k);
 const free=new Set(freeRoutes);
 function direct(e){
  const m=ns.get(e.from),r=m.recipe;
  if(!valid(e)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||e.fromPort!==0)return null;
  if(m.type==='仓出'&&m.item===e.materials[0]&&abundant(m.item))return {gap:U,root:m.id};
  if(r&&r.qty===1&&!Object.keys(r.inputs||{}).length&&r.output===e.materials[0]&&fixed(r.seconds))return {gap:q(r.seconds),root:m.id};
  return null;
 }
 function splitter(e){
  const m=ns.get(e.from),ins=I.get(m.id),outs=O.get(m.id),k=e.materials[0];
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0].toPort!==0||outs.length<2||outs.length>3||!outs.includes(e)||![...ins,...outs].every(x=>valid(x)&&x.materials[0]===k))return null;
  const r=direct(ins[0]);return r&&cmp(r.gap,U)===0?{gap:q(outs.length),root:r.root,splitter:m.id,input:ins[0],outs}:null;
 }
 function describe(m){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
  if(!r||r.qty!==1||!fixed(r.seconds)||!keys.length||!complete(m)||ins.length!==keys.length||outs.length!==1||outs[0].fromPort!==0||!valid(outs[0])||outs[0].materials[0]!==r.output||ins.some(e=>!valid(e))||keys.some(k=>!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<1||ins.filter(e=>e.materials[0]===k).length!==1))return null;
  return {m,r,ins,out:outs[0],T:q(r.seconds)};
 }
 function terminal(d){return free.has(d.out.id)||independentFinalReceiver(d.out,ns,I,O);}
 function otherH(d,omit){
  let H=d.T;const clocks=[];
  for(const e of d.ins){
   if(omit.has(e.id))continue;
   const c=direct(e)||splitter(e);if(!c)return null;
   const a=d.r.inputs[e.materials[0]],v=add(mul(q(a),c.gap),delta);
   if(cmp(v,H)>0)H=v;
   clocks.push({route:e.id,gap:txt(c.gap),batch:a,root:c.root});
  }
  return {H,clocks};
 }
 const emitted=new Set();
 for(const m of g.nodes){
  const sink=describe(m);if(!sink||!terminal(sink))continue;
  for(const link of sink.ins){
   if(sink.r.inputs[link.materials[0]]!==1)continue;
   const feeder=describe(ns.get(link.from));if(!feeder||feeder.out!==link)continue;
   const Hc=otherH(feeder,new Set());if(!Hc||cmp(Hc.H,sink.T)>=0)continue;
   for(const branch of feeder.ins){
    const sp=splitter(branch);
    if(!sp||sp.outs.length!==3)continue;
    const k=branch.materials[0],ac=feeder.r.inputs[k],J=mul(q(ac),three);
    if(cmp(sink.T,J)<=0)continue;
    // Q itself must be a direct peer of C on the same splitter.
    const target=sink.ins.find(e=>e.from===sp.splitter&&e.materials[0]===k);
    if(!target||target.id===branch.id)continue;
    const c=div(q(ac),sink.T),sigma=mul(q(ac),add(div(J,sink.T),U)),rate=div(sub(U,c),two),beta=add(div(sigma,two),two);
    if(cmp(rate,Z)<=0)continue;
    const tested=[];
    for(const e of sp.outs){
     if(e.id===branch.id)continue;
     const d=describe(ns.get(e.to));if(!d||!terminal(d))continue;
     // For Q the privately paced C head clock is Hc. For other
     // targets all non-target ports must be independently grounded.
     const omit=new Set([e.id]);if(d.m.id===m.id)omit.add(link.id);
     const h=otherH(d,omit);if(!h)continue;
     if(d.m.id===m.id){const v=add(Hc.H,delta);if(cmp(v,h.H)>0)h.H=v;h.clocks.push({route:link.id,gap:txt(Hc.H),batch:1,root:feeder.m.id});}
     const a=d.r.inputs[k],goal=div(q(a),rate);
     if(cmp(h.H,goal)>0||cmp(q(2*a),beta)<0)continue;
     const lower=div(U,goal),key='cycle:'+d.m.id,exact=cmp(goal,d.T)===0;
     const signature=key+'|'+txt(lower);if(emitted.has(signature))continue;emitted.add(signature);
     out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-saturated-paced-splitter-service',sense:exact?'eq':'le',coefficients:{[key]:exact?1:-1},constant:txt(exact?lower:sub(Z,lower))});
     tested.push({machine:d.m.id,route:e.id,batch:a,otherH:txt(h.H),goal:txt(goal),lower:txt(lower),exact,clocks:h.clocks});
    }
    if(tested.length)out.witnesses.push({method:'element-saturated-paced-splitter-service',machine:sp.splitter,root:sp.root,input:sp.input.id,item:k,feeder:feeder.m.id,terminal:m.id,feederH:txt(Hc.H),terminalPeriod:txt(sink.T),countedRoute:branch.id,countedBatch:ac,window:txt(J),countedRateUpper:txt(c),burst:txt(sigma),service:txt(rate),endpointDeficit:txt(beta),targets:tested});
   }
  }
 }
 return out;
}

// A fixed eligibility word is an explicit, independent contract:
// masks[j] describes ALL eligible connected ports at successful
// opportunity j (no filter mismatch, at least one eligible). It may
// include cooldown/space only when these masks are proved independent
// of the unknown pointer or are otherwise certified for all phases.
// Each block induces a map on at most three pointer values and integer
// success/skip rewards. Compose such maps as weighted functions. For
// ANY finite map on n vertices, F^(n-1) is already on a cycle, whose
// length divides lcm(1..n). Thus evaluate that fixed power and one LCM
// power by exact composition. This is algebra on the element contract,
// not physical state iteration, orbit discovery, or numerical convergence.
function elementEligibilityWord(masks,n,phase=null){
 if(!Number.isSafeInteger(n)||n<1||n>3||!Array.isArray(masks)||!masks.length||masks.length>20000||masks.some(m=>!Number.isSafeInteger(m)||m<1||m>=(1<<n))||phase!==null&&(!Number.isSafeInteger(phase)||phase<0||phase>=n))throw Error('Invalid eligibility word contract');
 const zero=p=>({next:p,success:Array(n).fill(0),skips:Array(n).fill(0)}),identity=()=>Array.from({length:n},(_,p)=>zero(p));
 const plus=(a,b)=>a.map((x,i)=>x+b[i]);
 const compose=(a,b)=>a.map(x=>{const y=b[x.next];return {next:y.next,success:plus(x.success,y.success),skips:plus(x.skips,y.skips)};});
 const block=identity();
 for(const b of block)for(const mask of masks){
  let p=b.next;for(let i=0;i<n;i++,p=(p+1)%n){
   if(mask&(1<<p)){b.success[p]++;b.next=(p+1)%n;break;}
   b.skips[p]++;
  }
 }
 const power=k=>{let x=identity(),b=block;while(k){if(k%2)x=compose(x,b);k=Math.floor(k/2);if(k)b=compose(b,b);}return x;};
 const transient=power(n-1),repeat=[0,1,2,6][n],closed=power(repeat);
 const cases=transient.map((p,initial)=>({initial,phase:p.next,...closed[p.next]}));
 if(cases.some(x=>x.phase!==x.next||new Set(x.success.map((v,i)=>v+x.skips[i])).size!==1))throw Error('RR count composition invariant');
 const independent=cases.every(x=>x.success.every((v,i)=>v===cases[0].success[i])&&x.skips.every((v,i)=>v===cases[0].skips[i]));
 return {periodEvents:masks.length*repeat,transientBlocks:n-1,repeatBlocks:repeat,phaseIndependent:independent,cases,counts:phase!==null?cases[phase]:independent?cases[0]:null};
}

// Ordinal-span contracts, rather than mean rates, compose already
// proved underloaded recipe outputs into downstream acceptance laws.
// A base periodic word has span bounds V_k,W_k. An emitted source
// with strides l,u has every k-event span in [V_(kl),W_(ku)].
// The source need not itself be periodic; a skipped sibling may
// arbitrarily vary the number of original opportunities consumed.
//
// If a homogeneous splitter has f eventually free ports and a
// permanently accepting path on its input, each free port's consecutive
// events are between f and n input opportunities apart. For a recipe
// paced by that port, a units/batch, the actual target receipt gaps
// satisfy the same bounds. Its other dedicated ingredients replenish
// within H=max(T,a_k*h_k+delta). Once the target's a-event minimum
// span is strictly >H, the ordinal inequality
// B_j<=max(B_(j-1)+H,R_(aj)) loses all finite startup lag and
// B_j=R_(aj) eventually. Its unit output has strides af,an.
//
// For a candidate downstream target of a splitter with f already free
// siblings, its successive successful sends span at least f+1 source
// opportunities even BEFORE it is proved free. If a-target span >H
// and one-target span >P, the strict underload argument of
// proveMultiInputSplitterElementLaw shows its receiving belt becomes
// free (finite initial lag disappears in the ordinal recurrences).
// Every finite-send candidate drains too, hence cannot be permanently
// skipped while an infinite source is being dispatched.
// Then its average equals each proved-free sibling.
//
// For other ingredient branches, when the cache requests a packet,
// a compatible eligible port is visited within n input opportunities.
// With upstream source free and P-spaced, its head clock is W_n.
// R_(j-K)+d+Ld<=R_(j-1) absorbs the belt-space dependency; the same
// bound applies after a cache vacancy (one fixed-frame slack is added).
// This does NOT infer max event gaps from a known mean.
function proveUnderloadSpanComposition(g,A,priorityElements,{freeRoutes=[],freeSiblingRoutes=[],batchClocks=[]}={}){
 const out={relations:[],witnesses:[],spans:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 const tick=t=>{const x=A.mul(A.q(t),A.q(20));return x.d===1n&&x.n>=20n&&x.n<=1000000n?Number(x.n):null;};
 const freeInput=new Set(freeRoutes),freeSibling=new Set(freeSiblingRoutes),spans=new Map(),relations=new Set();
 function span(c,k,which){
  const stride=c[which==='lower'?'minStride':'maxStride'],n=k*stride;
  if(!Number.isSafeInteger(n)||n<1||n>10000000)return which==='lower'?0:Infinity;
  const v=c.base.phases?periodicSpanBounds(c.base,n)[which]:n*c.base[which==='lower'?'minGap':'maxGap'];return Number.isSafeInteger(v)?v:which==='lower'?0:Infinity;
 }
 function remember(e,c){
  if(spans.has(e.id))return false;
  if(!c.base||span(c,1,'lower')<20||!Number.isFinite(span(c,1,'upper')))return false;
  spans.set(e.id,c);out.spans.push({route:e.id,item:e.materials[0],...c,minGapTicks:span(c,1,'lower'),maxGapTicks:span(c,1,'upper')});return true;
 }
 function split(e){
  const m=ns.get(e.from),ins=I.get(m.id),outs=O.get(m.id),k=e.materials[0];
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0].toPort!==0||outs.length<2||outs.length>3||!outs.includes(e)||![...ins,...outs].every(x=>valid(x)&&x.materials[0]===k))return null;
  const fs=outs.filter(x=>freeSibling.has(x.id)||independentFinalReceiver(x,ns,I,O));
  // A known free sibling grounds the split input service independently
  // of the candidate under study.
  return fs.length&&(freeInput.has(ins[0].id)||fs.some(x=>independentFinalReceiver(x,ns,I,O)))?{m,input:ins[0],outs,fs}:null;
 }
 function recipe(m){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{}),T=r&&tick(r.seconds);
  if(!r||!T||r.qty!==1||!complete(m)||keys.length<2||ins.length!==keys.length||ins.some(e=>!valid(e))||keys.some(k=>!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<1||ins.filter(e=>e.materials[0]===k).length!==1)||outs.length!==1||!valid(outs[0])||outs[0].fromPort!==0||outs[0].materials[0]!==r.output||!(freeInput.has(outs[0].id)||independentFinalReceiver(outs[0],ns,I,O)))return null;
  return {m,r,ins,out:outs[0],T};
 }
 // All seed contracts are deductions from a certified periodic
 // priority-residual word and its already proved no-skip branches.
 for(const w of priorityElements.witnesses||[]){
  if(!w.word||!Array.isArray(w.word.phases)||!w.word.phases.length||w.free.length<1)continue;
  const m=ns.get(w.machine),outs=O.get(m.id),ins=I.get(m.id);
  if(!complete(m)||ins.length!==1||!valid(ins[0])||outs.some(e=>!valid(e)))continue;
  const base={period:w.word.period,phases:w.word.phases.slice(),packets:w.word.phases.length};
  if(periodicSpanBounds(base,1).lower<20)continue;
  freeInput.add(ins[0].id);remember(ins[0],{base,minStride:1,maxStride:1,origin:'priority-residual-word',root:w.root});
  for(const b of w.evidence){
   const e=outs.find(e=>e.id===b.route),d=e&&recipe(ns.get(e.to));
   if(!d||!w.free.includes(e.id))continue;
   const c={base,minStride:b.a*w.free.length,maxStride:b.a*outs.length,origin:'priority-paced-ingredient',machine:d.m.id,target:e.id,periodBound:b.H};
   if(span(c,1,'lower')<=b.H)continue;
   freeSibling.add(e.id);remember(d.out,c);
  }
 }
 // Autonomous unit output at a separately free output cannot have
 // timing changed by downstream queues.
 for(const m of g.nodes){
  const r=m.recipe,es=O.get(m.id),T=r&&tick(r.seconds);
  if(!r||!T||r.qty!==1||Object.keys(r.inputs||{}).length||!complete(m)||I.get(m.id).length||es.length!==1||!valid(es[0])||es[0].fromPort!==0||es[0].materials[0]!==r.output)continue;
  if(!(freeInput.has(es[0].id)||independentFinalReceiver(es[0],ns,I,O)))continue;
  remember(es[0],{base:{period:T,phases:[0],packets:1},minStride:1,maxStride:1,origin:'autonomous-unit',machine:m.id});
 }
 // Independent multi-output batch trees can serve as grounded
 // non-periodic sources. Only a separately free final unit output
 // is turned into a real inter-event span; internal head contracts
 // never assume a source is dispatched at its nominal mean.
 for(const [id,c] of dedicatedBatchHeadContracts(g,A)){
  const e=g.lines.find(x=>x.id===id);
  if(c.batch!==1||!c.inputs.length||!(freeInput.has(id)||independentFinalReceiver(e,ns,I,O)))continue;
  // A free unit-output tree with matching prefix upper capacity and
  // maximum gap H eventually has gap EXACTLY H. Indeed S_j-jH is
  // eventually nonincreasing (head clock), bounded below (prefix
  // count upper envelope), and integer-valued (fixed frames).
  // The resulting span word has arbitrary phase, used only for spans.
  const exact=A.cmp(A.q(c.prefixRate),A.div(A.q(20),A.q(c.H)))===0;
  if(exact)remember(e,{base:{period:c.H,phases:[0],packets:1},minStride:1,maxStride:1,origin:'dedicated-exact-gap',machine:c.machine,tree:c});
  else remember(e,{base:{minGap:20,maxGap:c.H},minStride:1,maxStride:1,origin:'dedicated-batch-head-tree',machine:c.machine,tree:c});
 }
 // Additional grounded free-recipe batch clocks may be used as
 // upper head spans, never as independent periodic arrival words.
 // Seed these only after strict target-paced/independent contracts.
 for(const c of batchClocks){
  const e=g.lines.find(x=>x.id===c.route),d=e&&recipe(ns.get(e.from));
  if(!e||!d||!Number.isSafeInteger(c.gap)||c.gap<d.T)continue;
  remember(e,{base:{minGap:d.T,maxGap:c.gap},minStride:1,maxStride:1,origin:'grounded-free-batch-clock',machine:d.m.id,clock:c});
 }
 function otherClock(e){
  const sp=split(e);if(!sp)return null;
  const c=spans.get(sp.input.id);if(!c)return null;
  const gap=span(c,sp.outs.length,'upper');
  return Number.isFinite(gap)?{route:e.id,source:sp.input.id,gap,contract:c}:null;
 }
 // Finite closure of newly certified contracts, not rate iteration:
 // at most one new source contract per recipe/output route.
 for(let round=0;round<g.nodes.length;round++){
  let fresh=false;
  for(const m of g.nodes){
   const d=recipe(m);if(!d)continue;
   const old=spans.get(d.out.id);if(old&&old.origin!=='grounded-free-batch-clock')continue;
   for(const e of d.ins){
    const sp=split(e);if(!sp)continue;
    const c=spans.get(sp.input.id);if(!c)continue;
    const peers=sp.fs.filter(x=>x.id!==e.id);if(!peers.length)continue;
    const a=d.r.inputs[e.materials[0]],f=peers.length+1;
    let H=d.T,ok=true;const clocks=[];
    for(const x of d.ins.filter(x=>x!==e)){
     const z=otherClock(x);if(!z){ok=false;break;}
     H=Math.max(H,d.r.inputs[x.materials[0]]*z.gap+1);clocks.push({...z,batch:d.r.inputs[x.materials[0]]});
    }
    const one=span(c,f,'lower'),min=span(c,a*f,'lower');
    if(!ok||one<=20||min<=H)continue;
    const next={base:c.base,minStride:c.minStride*a*f,maxStride:c.maxStride*a*sp.outs.length,origin:'composed-underload',machine:m.id,target:e.id,periodBound:H};
    if(old)spans.delete(d.out.id);
    if(!remember(d.out,next)){if(old)spans.set(d.out.id,old);continue;}
    freeSibling.add(e.id);fresh=true;
    const key=e.id+'|'+peers[0].id;
    if(!relations.has(key)){
     relations.add(key);out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-composed-ordinal-span-equality',sense:'eq',coefficients:{['routeTotal:'+e.id]:1,['routeTotal:'+peers[0].id]:-1},constant:'0'});
    }
    out.witnesses.push({method:'element-composed-ordinal-span-equality',machine:m.id,splitter:sp.m.id,input:sp.input.id,target:e.id,peer:peers[0].id,output:d.out.id,batch:a,minimumTicks:min,onePacketMinimumTicks:one,periodBound:H,clocks,source:next});
    break;
   }
  }
  if(!fresh)break;
 }
 return out;
}

// A dedicated acyclic producer tree admits a demand-driven batch
// head-service contract, including multi-output batches.
// If a producer's batch size is b, T is its period, and all ingredients
// can be restored within H>=T after a previous start, its completion
// ordinal at the first packet j of a batch obeys
//   C_i <= max(C_(i-1)+H, S_(b(i-20))+delta+T).
// The second term is <=S_(j-b)+H, since the output buffer has 20
// batches and sends have spacing P. Autonomous units obey the same
// upper dependency with H=T (their clock pauses only at full output).
// Within a completed batch there is no additional production wait.
// For every packet (a conservative extra dependency within a batch):
//   S_j <= max(S_(j-b)+H,S_(j-1)+P,R_(j-K)+d)
//   R_j <= max(R_(j-b)+H,R_(j-1)+P,open_j).
// The second follows by Ld transit and R_(j-K)+d+Ld<=R_(j-1).
// At a demand time t, previous receipt j0-l <=t-lP. On a continuously
// accepting interval, open_j<=t+delta. Subtract t+kP in the recurrence:
//   R_(j0+k) <= t+kP+ceil(k/b)*max(0,H-bP).
// This closes the input restoration contract of the next recipe.
// Finite startup history is discarded only after every required
// ordinal exists. A finite acyclic tree of autonomous leaves cannot
// permanently withhold a requested packet; a free final keeps every
// required ordinal advancing. No measured mean or trajectory is used.
function dedicatedBatchHeadContracts(g,A){
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return new Map();I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 const memo=new Map(),visiting=new Set(),refill=(c,k)=>20*k+Math.ceil(k/c.batch)*Math.max(0,c.H-20*c.batch);
 function visit(e){
  if(memo.has(e.id))return memo.get(e.id);
  if(visiting.has(e.id)||!valid(e))return null;
  const m=ns.get(e.from),r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
  if(!r||!complete(m)||outs.length!==1||outs[0]!==e||e.fromPort!==0||r.output!==e.materials[0]||!Number.isSafeInteger(r.qty)||r.qty<1||r.qty>256||keys.length!==ins.length||ins.some(x=>!valid(x))||keys.some(k=>!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<1||r.inputs[k]>256||ins.filter(x=>x.materials[0]===k).length!==1))return null;
  const t=A.mul(A.q(r.seconds),A.q(20));
  if(t.d!==1n||t.n<20n||t.n>1000000n)return null;
  let H=Math.max(Number(t.n),20*r.qty);const inputs=[];
  let cap=A.div(A.q(20*r.qty),A.q(Number(t.n)));if(A.cmp(cap,A.U)>0)cap=A.U;
  visiting.add(e.id);
  for(const x of ins){
   const c=visit(x);if(!c){visiting.delete(e.id);return null;}
   const need=r.inputs[x.materials[0]],window=refill(c,need);
   H=Math.max(H,window);
   // The fixed-frame opening tick is already covered by kP in refill.
   // From empty startup, production counts cannot exceed input counts
   // divided by the recipe stoichiometry (plus a bounded phase term).
   const v=A.mul(A.q(c.prefixRate),A.div(A.q(r.qty),A.q(need)));if(A.cmp(v,cap)<0)cap=v;
   inputs.push({route:x.id,amount:need,window,child:c});
  }
  visiting.delete(e.id);
  if(!Number.isSafeInteger(H)||H>10000000)return null;
  const c={machine:m.id,route:e.id,batch:r.qty,period:Number(t.n),H,prefixRate:A.txt(cap),inputs};
  memo.set(e.id,c);return c;
 }
 for(const e of g.lines)visit(e);
 return memo;
}

// PERIODIC STOCK / THREE-PORT RECORD-DEFICIT ELEMENT LAW.
//
// A sole warehouse outlet fed by independent P-spaced deposits D_j
// has exact refill/dispatch/receive ordinal dependencies. Eliminating
// refill and input belt space gives
// I_j <= max(D_j+L0*d, I_(j-1)+P, O_(j-3)+delta).
// I_j is the splitter input, O_j any successful splitter dispatch.
// On an interval (s,t] with target A tail ready except its cooldown,
// O_j <= max(I_j,O_(j-1)+P,s+P). At most 3 previously received packets
// need initial dispatches. The j=I(s)+k comparison deadline
// D_(D(s)+k)+L0*d+3P+delta satisfies these dependencies (I(s)<=D(s))
// because deposits have P spacing. Thus Delta I >= Delta D-loss,
// loss=max deposits in a window L0*d+3P+delta.
//
// Between A sends the input has at most one receipt during A's open
// P cooldown. Once A is ready, every new receipt triggers a success;
// at most one B success before A, plus the counted C successes.
// Charge an early receipt to the first dispatch before the next
// receipt (by cooldown end). If charged to B and B repeats after
// cooldown, a C success must have moved the pointer past cooling A;
// charge that early receipt to this C instead. The open P interval
// had only one receipt, so that C is not otherwise charged. A final
// incomplete segment can cost at most 2 uncounted receipts. Including
// the first arbitrary-pointer segment gives Delta I<=2 Delta A+
// Delta C+2. No assumption of a permanently free sibling is used.
//
// Now choose ANY rational 0<kappa<1, and Z=kappa*(D-C)-2A, with all
// counts at end-of-tick. At a record M of Z, on the suffix where
// Z>=M-E, for every u in that suffix and every earlier v<=u (including v
// before the suffix, since Z(v)<=M at the record),
// A(u)-A(v) <= lambda*(u-v)+sigma,
// lambda=kappa*rho/2, sigma=(kappa*m+E)/2, rho=m/Hword.
// (The periodic deposit upper envelope is rho*window+m even at
// startup.) Let a be A's target recipe batch, H its other-ingredient
// restoration/production bound, H>=aP. Require H*rho<=2a, so
// lambda*H<a for EVERY kappa<1.
//
// For actual target sends S_j, receipts R_j, starts B_i, use
// R_j<=max(S_j+Ld,R_(j-1)+P,B_ceil((j-3a)/a)+delta),
// B_i<=max(B_(i-1)+H,R_(ai)). The comparison
// V_i=max(K0+iH,max_(l<=i)(S_(al)+Ld+(i-l)H))
// dominates both: R_j<=V_i-(ai-j)P for a(i-1)<j<=ai,
// by S gaps>=P, V gaps>=H>=aP and the 3a-cache lag.
// K0 absorbs finite startup before the other contracts hold.
// At a near-record u with N=A(u), apply the record envelope at
// S_(al)-delta: S_(al)<=u-(N-al+1-sigma)/lambda+delta.
// Then V_i<=u whenever N-ai+1>=sigma+lambda*(Ld+delta),
// for sufficiently late u: K0+iH<u because N<=lambda*u+O(1)
// at near-records. Hence N-aB(u)<=ceil(sigma+lambda*(Ld+delta)+a).
//
// Use the kappa=1 expression as a uniform bound K for all kappa<1.
// If K+1<=L, the tail is free whenever its send cooldown ends:
// there were no sends in the preceding P window, at most one head
// receipt, hence at most K+1<=L packets at its beginning. Even if
// none departed, moving for P with unit spacing advances the last
// packet at least one cell (min(free motion,L-(N-1))).
// This only concerns the target belt; no assumed free target input.
// Set E=loss+3. If Z had arbitrarily high records, choose a record M
// after the finite startup and its last crossing from <=M-E. All
// frames of the remaining suffix have free tail by the above bound.
// But the first two count lemmas give
// 2 Delta A>=Delta D-Delta C-loss-2.
// Therefore Delta Z<=loss+2<E (if Delta D-Delta C<0 it is <=0),
// contradicting that crossing. Z is bounded above.
// Divide by time, then take the supremum over all rational kappa<1:
// 2*r_A+r_C>=rho, an exact necessary count inequality. No numerical
// convergence procedure is performed. When both uncounted targets
// satisfy this theorem and total outflow=rho, conservation proves
// their equality.
//
// Exact requested head clock for a periodic sole-stock source, n<=3.
// At t0=max(previous target send, belt-space recovery) let p=I(t0).
// The target is continuously eligible from tau<=t0+P until its next
// success. Let o count all dispatches strictly before tau. Since
// receipts have P spacing, o<=p+1. If o<=p, at most n further
// successful scans are needed. Compare the k-th one (k<=n) to
// t0+D_(p+k)-D_p. The needed input ordinal o+k has its FIFO-space
// dependency O_(o+k-3)+delta already satisfied by tau, since n<=3.
// Its deposit and receipt-cooldown dependencies satisfy the comparison
// by D gaps>=P. The first deadline is >=tau. A pending packet must
// dispatch at that deadline, unless the target already succeeded.
// If o=p+1, a non-target success consumed a new receipt during the
// target's cooldown; its pointer cannot be immediately after target.
// At most n-1 scans remain, with deadlines t0+D_(p+k+1)-D_p.
// Again the needed space dependency precedes tau. Thus target send
// <=t0+W_n, W_n=max n-deposit span, WITHOUT an extra tick per head.
// When tau=t0 use the end-of-previous-frame pointer and pending
// packets; the same bound holds. R_(j-K)+d<=R_(j-1)-Ld transfers
// this to R_j<=max(R_(j-1)+W_n,open_j).
// The clock is eventual (p>=1), not a zero-start phase assertion.
function provePeriodicStockSplitterRecordLaw(g,A,depositCalendars,{abundantItems=[],freeRoutes=[],periodicInputs=[]}={}){
 const out={relations:[],witnesses:[],batchClocks:[],headClocks:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 const tick=t=>{const x=A.mul(A.q(t),A.q(20));return x.d===1n&&x.n>=20n&&x.n<=1000000n?Number(x.n):null;};
 const free=new Set(freeRoutes),periodic=new Map(periodicInputs.map(c=>[c.route,c])),deposits=new Map(completeDepositContracts(g,A,depositCalendars).map(c=>[c.item,c]));
 function split(e){
  const m=ns.get(e.from),ins=I.get(m.id),outs=O.get(m.id),k=e.materials[0];
  return m.type==='分流'&&complete(m)&&ins.length===1&&ins[0].toPort===0&&outs.length>=2&&outs.length<=3&&outs.includes(e)&&[...ins,...outs].every(x=>valid(x)&&x.materials[0]===k)?{m,input:ins[0],outs}:null;
 }
 function sole(e){
  if(g.unlimited)return null;
  const m=ns.get(e.from),k=e.materials[0],c=deposits.get(k);
  if(!c||abundantItems.includes(k)||!complete(m)||m.type!=='仓出'||m.item!==k||I.get(m.id).length||O.get(m.id).length!==1||e.fromPort!==0||!valid(e)||g.nodes.filter(n=>n.type==='仓出'&&n.item===k).length!==1||(g.frozen||[]).some(f=>f.rates[k]!=null&&A.cmp(A.q(f.rates[k]),A.Z)!==0))return null;
  if(periodicSpanBounds(c,1).lower<20)return null;
  return {root:m.id,calendar:c};
 }
 function direct(e){
  const m=ns.get(e.from),r=m.recipe;
  if(!valid(e)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||e.fromPort!==0)return null;
  if(m.type==='仓出'&&m.item===e.materials[0]&&(g.unlimited||abundantItems.includes(m.item)))return {gap:20,kind:'abundant-warehouse',route:e.id};
  const T=r&&tick(r.seconds);
  if(T&&r.qty===1&&r.output===e.materials[0]&&!Object.keys(r.inputs||{}).length)return {gap:T,kind:'autonomous-unit',route:e.id};
  return null;
 }
 function describe(m){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{}),T=r&&tick(r.seconds);
  if(!r||!T||r.qty!==1||!keys.length||!complete(m)||keys.length!==ins.length||ins.some(x=>!valid(x))||keys.some(k=>!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<1||r.inputs[k]>256||ins.filter(e=>e.materials[0]===k).length!==1)||outs.length!==1||!valid(outs[0])||outs[0].fromPort!==0||outs[0].materials[0]!==r.output)return null;
  return {m,r,ins,out:outs[0],T};
 }
 const memo=new Map(),visiting=new Set();
 function head(e){
  if(memo.has(e.id))return memo.get(e.id);
  if(visiting.has(e.id))return null;
  let c=direct(e);
  if(!c){
   const sp=split(e);
   if(sp){
    const n=sp.outs.length,p=periodic.get(sp.input.id),root=direct(sp.input),stock=sole(sp.input);
    if(p&&p.item===e.materials[0]){
     const cal=combinePeriodicCalendars([p]);
     if(cal&&periodicSpanBounds(cal,1).lower>=20)c={gap:periodicSpanBounds(cal,n).upper,kind:'proved-free-periodic-splitter',route:e.id,input:sp.input.id};
    }
    if(!c&&root?.gap===20)c={gap:n*20,kind:'saturated-splitter',route:e.id,input:sp.input.id};
    if(!c&&stock)c={gap:periodicSpanBounds(stock.calendar,n).upper,kind:'periodic-stock-requested-splitter',route:e.id,input:sp.input.id};
   }
  }
  if(!c){
   const d=describe(ns.get(e.from));
   if(d&&d.out===e){
    visiting.add(e.id);let H=d.T,ok=true;const inputs=[];
    for(const x of d.ins){
     const z=head(x);if(!z){ok=false;break;}
     H=Math.max(H,d.r.inputs[x.materials[0]]*z.gap+1);inputs.push({amount:d.r.inputs[x.materials[0]],...z});
    }
    visiting.delete(e.id);
    if(ok&&Number.isSafeInteger(H)&&H<=10000000)c={gap:H,kind:'private-unit-recipe-head',route:e.id,machine:d.m.id,inputs};
   }
  }
  if(c)memo.set(e.id,c);return c;
 }
 // Free unit outputs have real maximum batch gaps, grounded by
 // the same requested-head clocks. No output-rate inference.
 for(const m of g.nodes){
  const d=describe(m);if(!d||!(free.has(d.out.id)||independentFinalReceiver(d.out,ns,I,O)))continue;
  let H=d.T,ok=true;const clocks=[];
  for(const e of d.ins){const c=head(e);if(!c){ok=false;break;}
   const amount=d.r.inputs[e.materials[0]];H=Math.max(H,amount*c.gap);clocks.push({amount,...c});
  }
  if(ok)out.batchClocks.push({machine:m.id,route:d.out.id,gap:H,clocks});
 }
 for(const m of g.nodes){
  const outs=O.get(m.id),sp=outs.length&&split(outs[0]);
  if(!sp||sp.outs.length!==3)continue;
  const root=sole(sp.input);if(!root)continue;
  const c=root.calendar,rho=A.div(A.q(c.packets),A.q(c.period)),rate=A.txt(A.mul(rho,A.q(20))),latency=sp.input.length*10+61;
  const loss=periodicCountBounds(c,latency).upper,E=loss+3;
  for(const e of outs){
   const d=describe(ns.get(e.to));if(!d||!d.ins.includes(e)||!(free.has(d.out.id)||independentFinalReceiver(d.out,ns,I,O)))continue;
   const a=d.r.inputs[e.materials[0]];let H=Math.max(d.T,a*20),ok=true;const clocks=[];
   for(const x of d.ins.filter(x=>x!==e)){
    const h=head(x);if(!h){ok=false;break;}
    // R_j<=max(R_prev+h,open_j), open_j<=last start+delta.
    // Since h>=P>delta, a*h already includes this opening tick.
    H=Math.max(H,d.r.inputs[x.materials[0]]*h.gap);clocks.push({amount:d.r.inputs[x.materials[0]],...h});
   }
   if(!ok||A.cmp(A.mul(A.q(H),rho),A.q(2*a))>0)continue;
   const bound=A.add(A.q(a),A.div(A.add(A.q(c.packets+E),A.mul(rho,A.q(e.length*10+1))),A.q(2)));
   const K=Number((bound.n+bound.d-1n)/bound.d);
   if(!Number.isSafeInteger(K)||K+1>e.length)continue;
   const counted=outs.filter(x=>x!==e);
   for(const x of counted)out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-periodic-stock-record-deficit',sense:'le',coefficients:{['routeTotal:'+e.id]:-2,['routeTotal:'+x.id]:-1},constant:A.txt(A.sub(A.Z,A.q(rate)))});
   out.witnesses.push({method:'element-periodic-stock-record-deficit',machine:d.m.id,splitter:m.id,root:root.root,input:sp.input.id,target:e.id,counted:counted.map(x=>x.id),incomeRate:rate,period:c.period,phases:c.phases,batch:a,periodBound:H,latency,depositLoss:loss,recordBand:E,tailOccupancyBound:K,beltLength:e.length,clocks});
  }
 }
 out.headClocks=[...memo.values()];
 return out;
}


// Saturated homogeneous splitter: prove one residual branch accepts
// indefinitely from upper bounds on its actual arrival counts, NOT
// from its average offer. Other branches are demand-paced by free
// terminal recipes; all ingredient head clocks are independently grounded.
//
// For each such branch C with batch a, minimum batch gap T>=a*g,
// maximum start gap H, g=nP, let j index its input packets. Cache
// vacancies give R_j >= B_ceil((j-3a)/a)+delta and
// R_j <= max(R_(j-1)+g,B_ceil((j-3a)/a)+delta).
// S_j >= R_(j-K)+d, S_j <= max(S_(j-1),R_(j-K)+d)+g.
// Thus its sends occur in a window of width J=a*g after the relevant
// shifted batch start plus constant belt delay. Induction with the
// earliest/latest batch comparison proves this after finite startup:
// strict T>a*g suffices; at equality require an independently proved
// mean batch period >a*g, so the initial affine term disappears.
// Every sufficiently late interval of duration x therefore contains
// >= (a/H)x - a*(1+J/H) sends, even if the starts are not periodic.
//
// Input receives are P-spaced, and splitter FIFO holds 3. Consequently
// residual branch A has an upper envelope lambda*x+sigma with
// lambda=1/P-sum a/H, sigma=4+sum a*(1+J/H).
// If its other ingredients and production restore within H_A and
// lambda*H_A<a_A, use the same ordinal comparison as record-deficit
// proof to bound N(t)-a_A B(t)<=K0=ceil(sigma+lambda*(Ld+delta)+a_A)
// at all sufficiently late t. Here N is its cumulative sends.
//
// Stronger tail lemma: use the actual 3a ingredient cache, not just
// unprocessed count as belt occupancy. For j=N(t)-L>0, expand
// R_j<=max(S_j+Ld,R_(j-1)+P,B_ceil((j-3a)/a)+delta).
// Every transport term S_k+Ld+(j-k)P<=t because j is L sends behind
// N and S gaps>=P. For a cache term at index k, put
// u=t-delta-(j-k)P. Then N(u)>=N(t)-(j-k)-1 by send cooldown.
// If K0<=L+2a, a B(u)>=k+L-1-K0>=k-3a+(a-1), so every
// required cache opening has occurred by u. Early affine startup
// terms vanish since lambda<1/P. Thus R_(N(t)-L)<=t, i.e.
// at most L packets occupy the belt after any sufficiently late tick.
// At the next send-cooldown boundary no intervening sends can occur;
// with L slots occupied at most, movement during P restores tail
// space. This proves A cannot block beyond its own cooldown.
// A saturated root and one such branch sustain exactly 1/P input
// and total output; no equal-share assumption is used.
// Critical extension when all required head clocks include opening:
// if lambda*H=a, let F(t)=N(t)-lambda*t. The uniform upper envelope
// implies F(t)<=F(s)+sigma for late t>=s. If F is bounded below,
// N/t tends to lambda and the other branches' lower envelopes imply
// saturated total 1/P. Otherwise F tends to -infinity (bounded upward
// recovery). The finite-start term K0+iH in the batch comparison then
// falls below t for i<=floor((N(t)-K0')/a), for any fixed K0'.
// All other terms are bounded by the same window envelope as in the
// strict case, so the unprocessed-count bound K holds eventually.
// The tail lemma again proves total saturation. This dichotomy does
// not assume the existence of the unknown target's mean rate.
function proveSaturatedResidualEnvelopeLaw(g,A,values,{abundantItems=[],freeRoutes=[],headClocks=[]}={}){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const {q,add,sub,mul,div,cmp,txt,Z,U}=A,delta=q('1/20'),ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 const fixed=t=>cmp(q(t),U)>=0&&div(q(t),delta).d===1n;
 const free=new Set(freeRoutes),clockMap=new Map(headClocks.map(c=>[c.route,c]));
 function direct(e){
  const m=ns.get(e.from),r=m.recipe;
  if(!valid(e)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||e.fromPort!==0)return null;
  if(m.type==='仓出'&&m.item===e.materials[0]&&(g.unlimited||abundantItems.includes(m.item)))return U;
  if(r&&r.qty===1&&r.output===e.materials[0]&&!Object.keys(r.inputs||{}).length&&fixed(r.seconds))return q(r.seconds);
  return null;
 }
 function splitter(m){
  const ins=I.get(m.id),outs=O.get(m.id);
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0].toPort!==0||outs.length<2||outs.length>3||![...ins,...outs].every(e=>valid(e)&&e.materials[0]===ins[0].materials[0]))return null;
  const h=direct(ins[0]);return h!==null&&cmp(h,U)===0?{m,input:ins[0],outs,gap:q(outs.length)}:null;
 }
 function head(e){const d=direct(e);if(d!==null)return d;return splitter(ns.get(e.from))?.gap??null;}
 function describe(e){
  const m=ns.get(e.to),r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
  if(!r||r.qty!==1||!fixed(r.seconds)||!keys.length||!complete(m)||keys.length!==ins.length||ins.some(x=>!valid(x))||keys.some(k=>!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<1||r.inputs[k]>256||ins.filter(x=>x.materials[0]===k).length!==1)||outs.length!==1||!valid(outs[0])||outs[0].fromPort!==0||outs[0].materials[0]!==r.output||!(free.has(outs[0].id)||independentFinalReceiver(outs[0],ns,I,O)))return null;
  const a=r.inputs[e.materials[0]],T=q(r.seconds);if(!Number.isSafeInteger(a)||a<1)return null;
  let H=T;const clocks=[];
  for(const x of ins){if(x===e)continue;const c=clockMap.get(x.id),h=c?div(q(c.gap),q(20)):head(x);if(h===null)return null;
   const base=mul(q(r.inputs[x.materials[0]]),h),v=c?base:add(base,delta);if(cmp(v,H)>0)H=v;
   clocks.push({route:x.id,gap:txt(h),batch:r.inputs[x.materials[0]]});
  }
  return {e,m,a,T,H,clocks,exactHeads:ins.filter(x=>x!==e).every(x=>clockMap.has(x.id))};
 }
 for(const m of g.nodes){
  const sp=splitter(m);if(!sp)continue;
  const desc=sp.outs.map(describe);if(desc.some(x=>!x))continue;
  for(const target of desc){
   let lambda=U,sigma=q(4),ok=true;const paced=[];
   for(const b of desc.filter(x=>x!==target)){
    const J=mul(q(b.a),sp.gap),v=values['cycle:'+b.m.id];
    // At equality the exact positive mean period must strictly exceed
    // the input refill comparison slope.
    if(cmp(b.T,J)<0||cmp(b.T,J)===0&&(v==null||cmp(q(v),Z)<=0||cmp(mul(q(v),J),U)>=0)){ok=false;break;}
    const refill=b.exactHeads&&headClocks.length?J:add(J,delta),H=cmp(b.H,refill)>=0?b.H:refill,rate=div(q(b.a),H),burst=mul(q(b.a),add(U,div(J,H)));
    lambda=sub(lambda,rate);sigma=add(sigma,burst);
    paced.push({machine:b.m.id,route:b.e.id,batch:b.a,minimum:txt(b.T),maximum:txt(H),window:txt(J),rate:txt(rate),burst:txt(burst),clocks:b.clocks});
   }
   if(!ok||cmp(lambda,Z)<=0||cmp(lambda,U)>=0)continue;
   const H=cmp(target.H,q(target.a))>=0?target.H:q(target.a);
   const critical=cmp(mul(lambda,H),q(target.a));
   if(critical>0||critical===0&&(!headClocks.length||!desc.every(b=>b.exactHeads)))continue;
   const K=add(add(sigma,mul(lambda,add(div(q(target.e.length),q(2)),delta))),q(target.a)),bound=Number((K.n+K.d-1n)/K.d);
   if(!Number.isSafeInteger(bound)||bound>target.e.length+2*target.a)continue;
   out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-saturated-residual-envelope',sense:'eq',coefficients:{['routeTotal:'+sp.input.id]:1},constant:'1'});
   out.witnesses.push({method:'element-saturated-residual-envelope',machine:m.id,input:sp.input.id,target:target.e.id,targetMachine:target.m.id,batch:target.a,periodBound:txt(H),rateUpper:txt(lambda),burst:txt(sigma),unprocessedBound:bound,beltLength:target.e.length,cacheSlack:2*target.a,critical:critical===0,paced,clocks:target.clocks});
   break;
  }
 }
 return out;
}


// Compose INTERVAL count upper bounds through free round-robin peers
// and strictly underloaded, target-paced recipes. Unlike a mean rate,
// the affine bound U(x)=lambda*x+sigma holds on every late interval.
// An independently clocked recipe consumes at least a*(x/H-1)
// packets. Its branch sends differ from those consumptions by at
// most L+1+3a packets (belt plus ingredient cache). Subtract this
// lower envelope BEFORE allocating the remaining stream among free
// peers. This recovers correlation through the shared upstream
// splitter without claiming a fixed periodic word at every node.
//
// If input dispatches track source sends at a constant transit delay,
// an always-free sibling is visited between any two sends to target.
// Therefore for any interval, A <= peer+1; with f such peers,
// (f+1)A <= input - sum(excluded branches) + f.
// The bound is valid even when the target itself is blocked.
// Source free-input/peer contracts here are exactly those used by
// proveUnderloadSpanComposition. The finite startup of those contracts
// is discarded; no clock is inferred from a mean.
//
// A target-paced unit-output recipe whose a-event minimum span
// strictly exceeded H starts at its a-th target receipt eventually;
// its output is a fixed delay and every a-th input event. Thus its
// upper count envelope is divided by a with at most (a-1)/a
// rounding slack (zero for a=1).
//
// Finally apply the ordinal backlog comparison to a still-unknown
// target. Require lambda*H<=a. At equality require an independently
// certified strict upper mean <a/H, using the input rate and free
// peer inequality ONLY to erase the finite initial affine term.
// The window upper envelope, not that mean, controls the queue.
// A finite target stream also drains and becomes freely accepting.
function proveComposedResidualEnvelopeLaw(g,A,values,priorityElements,spanElements,recordElements,{freeRoutes=[],freeSiblingRoutes=[]}={}){
 const out={relations:[],witnesses:[],envelopes:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const {q,add,sub,mul,div,cmp,txt,Z,U}=A,delta=q('1/20'),ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]])),edges=new Map(g.lines.map(e=>[e.id,e]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e&&e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 const fixed=t=>cmp(q(t),U)>=0&&div(q(t),delta).d===1n;
 const freeInput=new Set(freeRoutes),freeSibling=new Set(freeSiblingRoutes),env=new Map(),spanMap=new Map(spanElements.spans.map(c=>[c.route,c])),batch=new Map((recordElements.batchClocks||[]).map(c=>[c.route,c])),emitted=new Set();
 function remember(e,lambda,sigma,proof){
  if(!valid(e)||env.has(e.id)||cmp(lambda,Z)<=0||cmp(sigma,Z)<0)return false;
  const c={route:e.id,lambda:txt(lambda),sigma:txt(sigma),...proof};
  env.set(e.id,c);out.envelopes.push(c);return true;
 }
 function split(m){
  const ins=I.get(m.id),outs=O.get(m.id);
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0].toPort!==0||outs.length<2||outs.length>3||![...ins,...outs].every(e=>valid(e)&&e.materials[0]===ins[0].materials[0]))return null;
  const fs=outs.filter(e=>freeSibling.has(e.id)||independentFinalReceiver(e,ns,I,O));
  return fs.length&&(freeInput.has(ins[0].id)||fs.some(e=>independentFinalReceiver(e,ns,I,O)))?{m,input:ins[0],outs,fs}:null;
 }
 function recipe(m){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
  if(!r||r.qty!==1||!fixed(r.seconds)||!keys.length||!complete(m)||keys.length!==ins.length||ins.some(e=>!valid(e))||keys.some(k=>!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<1||r.inputs[k]>256||ins.filter(e=>e.materials[0]===k).length!==1)||outs.length!==1||!valid(outs[0])||outs[0].fromPort!==0||outs[0].materials[0]!==r.output||!(freeInput.has(outs[0].id)||independentFinalReceiver(outs[0],ns,I,O)))return null;
  return {m,r,ins,out:outs[0],T:q(r.seconds)};
 }
 function lower(e){
  const d=recipe(ns.get(e.to));if(!d||!d.ins.includes(e))return null;
  const c=batch.get(d.out.id),a=d.r.inputs[e.materials[0]];
  if(!c||!Number.isSafeInteger(c.gap)||c.gap<20)return null;
  return {route:e.id,machine:d.m.id,lambda:txt(div(q(20*a),q(c.gap))),sigma:String(e.length+1+4*a),batch:a,gapTicks:c.gap};
 }
 function head(e){
  const d=batch.get(e.id);
  if(d)return {gap:div(q(d.gap),q(20)),route:e.id,source:e.id,kind:'free-recipe-batch-clock'};
  const sp=split(ns.get(e.from));
  if(!sp)return null;
  const c=batch.get(sp.input.id),z=spanMap.get(sp.input.id);
  const gaps=[c?.gap,z?.maxGapTicks].filter(x=>Number.isSafeInteger(x)&&x>=20);
  if(!gaps.length)return null;
  return {gap:div(q(Math.min(...gaps)*sp.outs.length),q(20)),route:e.id,source:sp.input.id,kind:'free-source-splitter-head'};
 }
 for(const w of priorityElements.witnesses||[]){
  if(!w.word||!w.free.length)continue;
  const m=ns.get(w.machine),ins=I.get(m.id);
  if(!complete(m)||ins.length!==1||!valid(ins[0]))continue;
  const H=w.word.period,n=w.word.phases.length;
  if(!Number.isSafeInteger(H)||H<20||!n)continue;
  freeInput.add(ins[0].id);for(const id of w.free)freeSibling.add(id);
  remember(ins[0],div(q(20*n),q(H)),q(n),{kind:'periodic-root',period:H,packets:n});
 }
 for(const w of spanElements.witnesses||[])if(w.method==='element-composed-ordinal-span-equality')freeSibling.add(w.target);
 // Propagate only grounded contracts. Each route is assigned once;
 // graph depth, not a numerical convergence threshold, bounds work.
 for(let round=0;round<g.nodes.length;round++){
  let fresh=false;
  for(const m of g.nodes){
   const sp=split(m);
   if(sp&&env.has(sp.input.id)){
    const c=env.get(sp.input.id);
    for(const e of sp.outs){
     if(env.has(e.id))continue;
     const peers=sp.fs.filter(x=>x!==e),excluded=sp.outs.filter(x=>x!==e&&!peers.includes(x));
     let lambda=q(c.lambda),sigma=add(q(c.sigma),q(peers.length));const lowers=[];
     for(const x of excluded){const l=lower(x);if(!l)continue;lambda=sub(lambda,q(l.lambda));sigma=add(sigma,q(l.sigma));lowers.push(l);}
     if(cmp(lambda,Z)<=0)continue;
     const k=q(peers.length+1);
     if(remember(e,div(lambda,k),div(sigma,k),{kind:'round-robin-residual-window',input:sp.input.id,peers:peers.map(x=>x.id),lowers}))fresh=true;
    }
   }
   const d=recipe(m);if(!d||env.has(d.out.id))continue;
   const z=spanMap.get(d.out.id);
   if(!z||!['priority-paced-ingredient','composed-underload'].includes(z.origin)||!z.target||z.minGapTicks<=z.periodBound)continue;
   const e=edges.get(z.target),c=env.get(z.target);
   if(!c||!d.ins.includes(e))continue;
   const a=q(d.r.inputs[e.materials[0]]);
   if(remember(d.out,div(q(c.lambda),a),add(div(q(c.sigma),a),div(sub(a,U),a)),{kind:'strict-paced-batch-window',input:e.id,batch:txt(a),minimumTicks:z.minGapTicks,periodBound:z.periodBound}))fresh=true;
  }
  if(!fresh)break;
 }
 for(const m of g.nodes){
  const d=recipe(m);if(!d)continue;
  for(const e of d.ins){
   const c=env.get(e.id),sp=split(ns.get(e.from));
   if(!c||!sp||sp.fs.includes(e))continue;
   const peers=sp.fs.filter(x=>x!==e);if(!peers.length)continue;
   const a=q(d.r.inputs[e.materials[0]]);let H=cmp(d.T,a)>=0?d.T:a,ok=true;const clocks=[];
   for(const x of d.ins.filter(x=>x!==e)){
    const h=head(x);if(!h){ok=false;break;}
    const v=mul(q(d.r.inputs[x.materials[0]]),h.gap);if(cmp(v,H)>0)H=v;
    clocks.push({...h,gap:txt(h.gap),batch:d.r.inputs[x.materials[0]]});
   }
   if(!ok)continue;
   const lambda=q(c.lambda),sigma=q(c.sigma),comparison=cmp(mul(lambda,H),a);
   if(comparison>0)continue;
   let strictMean=null;
   if(comparison===0){
    const rate=values['routeTotal:'+sp.input.id];if(rate==null)continue;
    const bound=div(q(rate),q(peers.length+1));
    if(cmp(mul(bound,H),a)>=0)continue;
    strictMean=txt(bound);
   }
   const K=add(add(sigma,mul(lambda,add(div(q(e.length),q(2)),delta))),a),bound=Number((K.n+K.d-1n)/K.d);
   // Use the conservative unprocessed-count tail lemma here; the
   // refined 3a-cache lemma is not needed for these small envelopes.
   if(!Number.isSafeInteger(bound)||bound+1>e.length)continue;
   for(const p of peers){
    const key=e.id+'|'+p.id;if(emitted.has(key))continue;emitted.add(key);
    out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-composed-residual-window-equality',sense:'eq',coefficients:{['routeTotal:'+e.id]:1,['routeTotal:'+p.id]:-1},constant:'0'});
   }
   out.witnesses.push({method:'element-composed-residual-window-equality',machine:m.id,splitter:sp.m.id,target:e.id,peers:peers.map(x=>x.id),source:sp.input.id,batch:txt(a),periodBound:txt(H),rateUpper:c.lambda,burst:c.sigma,strictMean,unprocessedBound:bound,beltLength:e.length,clocks,envelope:c,chain:out.envelopes.slice()});
  }
 }
 return out;
}


// Shared ingredient FIFO fed by independently periodic tandem sources.
// Unlike the dedicated-inlet theorem, multiple physical ports may
// replenish the SAME 3a cache. Certify a hypothetical unblocked arrival
// calendar before using any rate from it.
//
// With one ingredient and a freely accepting unit/batch output, T>=bP,
// each batch completes and empties its output before another completes.
// At the last idle frame s (or empty startup), the input cache has <=a-1
// packets. Up to the first hypothetical rejection at tick t=s+x, all
// earlier arrivals match their calendars. If there is no intervening idle
// frame, starts occurred at s+1, s+1+T,... strictly before t; hence at
// least ceil((x-1)/T) batches consumed. This is a count identity over
// an uninterrupted busy interval, not a simulated state recurrence.
// Even INCLUDING all simultaneous arrivals at t, cache occupancy is <=
// a-1 + U(x) - a*ceil((x-1)/T), U the periodic arrival upper envelope.
// If aggregate supply <=a/T, and this bound <=3a for all integer x>=1,
// no first refusal can occur, regardless of inlet priority.
// U is nondecreasing, so check only x=1+kT through one LCM(H,T) block;
// adding another block cannot increase the bound. Exact finite algebra.
function proveSharedIngredientCalendarLaw(g,A,{freeRoutes=[]}={}){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 const gcd=(x,y)=>y?gcd(y,x%y):x;
 const emit=(key,value)=>out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-shared-ingredient-calendar',sense:'eq',coefficients:{[key]:1},constant:A.txt(value)});
 for(const m of g.nodes){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
  if(!r||keys.length!==1||ins.length<2||ins.length!==m.physicalInCount||new Set(ins.map(e=>e.toPort)).size!==ins.length||outs.length!==1||m.physicalOutCount!==1||outs[0].fromPort!==0||!valid(outs[0])||r.output!==outs[0].materials[0]||!Number.isSafeInteger(r.qty)||r.qty<1||r.qty>256||!independentFinalReceiver(outs[0],ns,I,O))continue;
  const k=keys[0],a=r.inputs[k],ticks=A.mul(A.q(r.seconds),A.q(20));
  if(!Number.isSafeInteger(a)||a<1||a>256||ticks.d!==1n||ticks.n<BigInt(20*r.qty)||ticks.n>1000000n||ins.some(e=>!valid(e)||e.materials[0]!==k))continue;
  const T=Number(ticks.n),cs=proveTandemArrivalCalendars(g,A,new Set(ins.map(e=>e.id)));
  if(cs.length!==ins.length)continue;
  const c=combinePeriodicCalendars(cs);
  if(!c||c.packets*T>a*c.period)continue;
  const repeat=c.period/gcd(c.period,T),checks=repeat+1;
  if(checks*c.packets>200000)continue;
  let maximum=0;
  for(let i=0;i<checks;i++){
   maximum=Math.max(maximum,a-1+periodicCountBounds(c,1+i*T).upper-a*i);
   if(maximum>3*a)break;
  }
  if(maximum>3*a)continue;
  for(const x of cs)emit('routeTotal:'+x.route,A.div(A.q(20*x.times.length),A.q(x.period)));
  const rate=A.div(A.q(20*c.packets),A.q(c.period*a));
  emit('cycle:'+m.id,rate);
  out.witnesses.push({method:'element-shared-ingredient-calendar',machine:m.id,item:k,batch:a,periodTicks:T,cacheCapacity:3*a,occupancyUpper:maximum,windowChecks:checks,rate:A.txt(rate),calendar:c,inputs:cs});
 }
 return out;
}


// A uniform source feeding a homogeneous split/rejoin diamond.
// n<=3 parallel belts, possibly different lengths, free merger output.
// In the hypothetical unblocked RR assignment each branch has period
// n*h (h>=P). The merged ideal arrival list A_j has
// A_j-A_(j-n)>=n*h, also during startup (missing early events).
//
// Infinite-capacity scanner and output comparisons:
// E_j=max(A_j,E_(j-1)+delta),
// O_j=max(E_j+delta,O_(j-1)+P).
// Expand both max recurrences: O_j<=max_{k>=0}(A_(j-k)+delta+kP)
// <= A_j+(n-1)P+delta. Consequently O_(j-3)<A_j, so the actual
// three-slot merger queue never delays these enqueue opportunities.
// The same expansion bounds aggregate E_j-A_j by (n-1)delta.
// For a particular ready head, RR visits it within n scans;
// all other heads then pending or arriving cannot require >n-1
// other scans, and no port cooldown can block since its preceding
// ideal arrival is n*h earlier and its prior delay <=(n-1)delta.
// Thus each individual head waits at most (n-1)delta. Packet spacing
// on its belt remains >= n*h-(n-1)delta >=P, including during wait
// at the head, so no upstream send is obstructed.
// First-deviation induction certifies the entire hypothetical
// assignment, without following the time trajectory.
function proveUniformSplitRejoinLaw(g,A){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 for(const m of g.nodes){
  const ins=I.get(m.id),bs=O.get(m.id),n=bs.length;
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0].toPort!==0||n<2||n>3||!bs.every(e=>e.to===bs[0].to))continue;
  const d=ns.get(bs[0].to),ends=O.get(d.id);
  if(d.type!=='汇流'||!complete(d)||I.get(d.id).length!==n||ends.length!==1||ends[0].fromPort!==0||!independentFinalReceiver(ends[0],ns,I,O))continue;
  const k=ins[0].materials[0];if(![...ins,...bs,...ends].every(e=>valid(e)&&e.materials[0]===k))continue;
  const c=proveTandemArrivalCalendars(g,A,new Set([ins[0].id]))[0];
  let h=null;
  if(c){
   const cal=combinePeriodicCalendars([c]);if(!cal)continue;
   const gap=periodicSpanBounds(cal,1);if(gap.lower!==gap.upper||gap.lower<20)continue;h=gap.lower;
  }else if(g.unlimited){
   const root=ns.get(ins[0].from);
   if(root.type==='仓出'&&root.item===k&&complete(root)&&I.get(root.id).length===0&&O.get(root.id).length===1&&ins[0].fromPort===0)h=20;
  }
  if(h===null)continue;
  const total=A.div(A.q(20),A.q(h)),per=A.div(total,A.q(n));
  for(const e of [ins[0],...bs,ends[0]])out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-uniform-split-rejoin',sense:'eq',coefficients:{['routeTotal:'+e.id]:1},constant:A.txt(bs.includes(e)?per:total)});
  out.witnesses.push({method:'element-uniform-split-rejoin',machine:m.id,merger:d.id,input:ins[0].id,branches:bs.map(e=>e.id),output:ends[0].id,inputGapTicks:h,headWaitTicks:n-1,dispatchWaitTicks:(n-1)*20+1,rate:A.txt(total),branchRate:A.txt(per)});
 }
 return out;
}


// Fixed-filter splitter with independent empty-start free endpoints.
// Unlike an ordinary filter router, a mismatching selected physical
// filter HOLDS both the head and the RR pointer forever. If matching,
// each arrival is dispatched immediately: input is P-spaced, and every
// compatible selected endpoint is independently free. By induction
// there can be no successful skip, even before a permanent mismatch.
// Thus ALL connected ports have cumulative successes differing by <=1,
// including if the stream stops after a finite prefix. This is a
// necessary total-count equality, not an assertion of positive rate
// or uniform material composition. Combine it with material
// conservation and any upstream proved material rate equations.
// In particular incompatible long-run proportions force zero flow.
function proveFilteredTerminalCycleLaw(g,A){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const length=e=>Number.isSafeInteger(e.length)&&e.length>=1;
 for(const m of g.nodes){
  const ins=I.get(m.id),outs=O.get(m.id);
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0].toPort!==0||outs.length<2||outs.length>3||!outs.some(e=>e.outFilter&&e.outFilter!=='任意'))continue;
  const input=ins[0];
  if(!length(input)||input.active===false||!input.rawMaterials?.length||input.rawMaterials.some(k=>!input.materials.includes(k)||!input.acceptedMaterials?.includes(k)))continue;
  const filters=[];
  for(const e of outs){
   const k=e.outFilter,allowed=input.rawMaterials.filter(x=>!k||k==='任意'||x===k),d=ns.get(e.to);
   if(!length(e)||!allowed.length||!e.rawMaterials?.length||allowed.some(x=>!e.rawMaterials.includes(x)||!e.materials.includes(x)||!e.acceptedMaterials?.includes(x))||!(d.type==='仓入'||d.type==='电脑'&&complete(d)&&I.get(d.id).length===1&&!O.get(d.id).length))break;
   filters.push({route:e.id,filter:k||'任意',allowed});
  }
  if(filters.length!==outs.length)continue;
  for(const e of outs.slice(1))out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'element-filtered-terminal-cycle',sense:'eq',coefficients:{['routeTotal:'+e.id]:1,['routeTotal:'+outs[0].id]:-1},constant:'0'});
  out.witnesses.push({method:'element-filtered-terminal-cycle',machine:m.id,input:input.id,filters,scope:'necessary total equalities even if permanently stopped'});
 }
 return out;
}
