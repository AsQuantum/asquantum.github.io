'use strict';
// Fixed-frame saturated port contracts. Only use compatible physical
// lines; no nominal rate is treated as a proof of readiness elsewhere.
function proveSaturatedRouterCounts(g,arith,{abundantItems=[]}={}){
 const out={relations:[],witnesses:[],freeReceiverRoutes:[],boundedReceiverRoutes:[],freeOutletCertificates:[],sharedRootCertificates:[]};
 const clocks=new Map(),materialReady=new Set(),roundRobinNoSkip=new Set(),nominalCadence=new Map();
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const {q,mul,div,cmp,txt,Z,U}=arith,delta=q('1/20'),ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const plan=(typeof buildProofDepthPlan==='function'?buildProofDepthPlan:require('./proof_depth_plan').buildProofDepthPlan)(g);
 out.schedule={maxDepth:plan.maxDepth,layers:plan.layers.map(xs=>xs.map(m=>m.id)),cyclicComponents:plan.components.filter(c=>c.cyclic).map(c=>c.members),forwardSweeps:0};
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>Number.isSafeInteger(e.length)&&e.length>=1&&e.materials.length>0&&Array.isArray(e.rawMaterials)&&e.rawMaterials.length>0&&e.rawMaterials.every(k=>e.materials.includes(k)&&e.acceptedMaterials?.includes(k)&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===k));
 const source=(m,e)=>{
  if(!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!valid(e)||e.fromPort!==0||e.materials.length!==1)return null;
  if(m.type==='仓出')return (g.unlimited||abundantItems.includes(m.item))&&m.item===e.materials[0]?U:null;
  const r=m.recipe;
  if(!r||Object.keys(r.inputs||{}).length||r.output!==e.materials[0]||!Number.isSafeInteger(r.qty)||r.qty<1||cmp(q(r.seconds),Z)<=0||div(q(r.seconds),delta).d!==1n)return null;
  const rate=div(q(r.qty),q(r.seconds));return cmp(rate,U)>=0?U:rate;
 };
 const emit=(coefficients,constant,method,sense='eq')=>out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method,sense,coefficients,constant:txt(constant)});
 const rt=e=>'routeTotal:'+e.id;
 // Readiness is a local service contract, not a mean-rate test.
 // A merger with one permanently ready input has an eligible output
 // head even under arbitrary downstream stalls. A 1:1 splitter does
 // likewise. Recursion uses only grounded, acyclic certificates.
 const readyMemo=new Map(),readyVisiting=new Set();
 function readyRoute(e){
  if(readyMemo.has(e.id))return readyMemo.get(e.id);
  if(readyVisiting.has(e.id)||!valid(e))return false;
  const m=ns.get(e.from),ins=I.get(m.id),outs=O.get(m.id),r=source(m,e);
  if(r!==null&&cmp(r,U)===0){readyMemo.set(e.id,true);return true;}
  if(!complete(m)||outs.length!==1||outs[0]!==e||!ins.length||!ins.every(valid))return false;
  // An ordinary recipe can replenish every consumed ingredient during
  // its own batch. Unique independent per-material inlets only.
  const rec=m.recipe;
  let recipeReady=false;
  if(rec){
   const keys=Object.keys(rec.inputs||{}),T=q(rec.seconds);
   if(e.fromPort!==0||e.materials.length!==1||e.materials[0]!==rec.output||
      !Number.isSafeInteger(rec.qty)||rec.qty<1||cmp(T,Z)<=0||div(T,delta).d!==1n||
      cmp(q(rec.qty),T)<0||keys.length!==ins.length||
      keys.some(k=>!Number.isSafeInteger(rec.inputs[k])||rec.inputs[k]<1||cmp(q(rec.inputs[k]),T)>0||
       ins.filter(x=>x.materials.length===1&&x.materials[0]===k).length!==1))return false;
   recipeReady=true;
  }else{
   if(ins.length>3||!ins.every(x=>x.materials.every(k=>e.materials.includes(k))))return false;
   if(m.type!=='汇流'&&!(m.type==='分流'&&ins.length===1&&ins[0].toPort===0&&ins[0].materials.length===1))return false;
  }
  readyVisiting.add(e.id);
  const yes=recipeReady?ins.every(readyRoute):ins.some(readyRoute);
  readyVisiting.delete(e.id);
  if(yes){readyMemo.set(e.id,true);if(recipeReady)out.witnesses.push({method:'recipe-output-ready-from-ready-ingredients',machine:m.id,output:e.id,inputs:ins.map(x=>x.id),batchSeconds:rec.seconds,quantity:rec.qty});}
  return yes;
 }
 // A homogeneous splitter with at least one free branch is transparent
 // to upstream arrivals. Each arrival is >=P after the previous one;
 // the FIFO is empty before that arrival, and at least one outgoing
 // branch is eligible at that same tick. Other branches may backpressure.
 // Build the no-wait property backward through acyclic free subtrees.
 const freeProof=new Map(),visiting=new Set(),freeSends=new Set();
 const pass=(e,k)=>e.active!==false&&Number.isSafeInteger(e.length)&&e.length>=1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===k&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===k);
 function freeRoute(e,k){
  const key=e.id+'|'+k;if(freeProof.has(key))return freeProof.get(key);
  if(visiting.has(key)||!pass(e,k)||!valid(e)||e.materials.length!==1)return false;
  const d=ns.get(e.to);if(d.type==='仓入'||d.type==='电脑'&&complete(d)&&I.get(d.id).length===1&&!O.get(d.id).length)return true;
  if(!complete(d)||I.get(d.id).length!==1||I.get(d.id)[0]!==e)return false;
  // Backward through a transforming recipe, not just transparent
  // logistics. For a sole ingredient, a>=T/P, unit output and T>=P,
  // even the densest legal input never builds more than one batch.
  // This is an unrestricted P-spaced receiving contract, not a
  // claim that the recipe actually runs at nominal capacity.
  if(d.recipe){
   const r=d.recipe,keys=Object.keys(r.inputs||{}),a=r.inputs[k],T=q(r.seconds),outs=O.get(d.id);
   if(keys.length!==1||keys[0]!==k||!Number.isSafeInteger(a)||a<1||r.qty!==1||cmp(T,U)<0||cmp(T,q(a))>0||div(T,delta).d!==1n||outs.length!==1||outs[0].fromPort!==0)return false;
   visiting.add(key);
   const yes=freeRoute(outs[0],r.output);
   visiting.delete(key);if(yes){freeProof.set(key,true);out.witnesses.push({method:'backward-free-unit-recipe-inlet',machine:d.id,route:e.id,output:outs[0].id,batch:a,period:txt(T)});}return yes;
  }
  if(!['分流','汇流'].includes(d.type)||d.type==='分流'&&e.toPort!==0)return false;
  const outs=O.get(d.id);if(!outs.length||outs.length>3||d.type==='汇流'&&outs.length!==1||!outs.every(o=>pass(o,k)))return false;
  visiting.add(key);
  const yes=outs.some(o=>freeRoute(o,k));visiting.delete(key);freeProof.set(key,yes);
  return yes;
 }
 // Establish reverse boundary contracts from the actual sinks first.
 // Unknown branches remain unknown; no prefix is treated as a sink.
 for(const m of plan.reverse)for(const e of I.get(m.id))if(e.materials.length===1)freeRoute(e,e.materials[0]);
 for(const m of plan.forward)for(const e of O.get(m.id))readyRoute(e);
 // Saturated-input RR relations survive an arbitrary downstream
 // acceptance schedule. With two ready inlets the output FIFO eventually
 // fills (otherwise both receive > 1/2 per second); after at most two
 // dispatches from a full FIFO, every dispatch refills it in the same
 // tick. Dispatches are separated by P, hence ready ports cannot be
 // skipped for cooldown. No downstream freedom is needed for equality.
 for(const m of plan.reverse){
  if(m.type!=='汇流'||!complete(m))continue;
  const ins=I.get(m.id),outs=O.get(m.id);
  if(ins.length<1||ins.length>3||outs.length!==1||outs[0].fromPort!==0||!valid(outs[0])||ins.some(e=>!valid(e)||e.materials.some(k=>!outs[0].materials.includes(k))))continue;
  const e=outs[0],free=ns.get(e.to).type==='仓入'||e.materials.length===1&&freeRoute(e,e.materials[0]);
  // An eligible, compatible head cannot be bypassed for more than n
  // successful scans. A free output makes one vacancy within P frames.
  // This is a worst-case wait bound, not an assumed mean rate.
  if(free)for(const r of ins)if(r.materials.length===1)out.boundedReceiverRoutes.push({id:r.id,wait:String(ins.length),merger:m.id});
  // Empty-start virtual arrivals: a unit-output recipe dispatches at its
  // completion tick until its first blocked send. Its minimum completion
  // gap is T, or a*P for a directly saturated single ingredient when
  // T<=a*P (the first batch starts on its a-th arrival, then every a).
  // A free merger with sum of these arrival envelopes <=1/P has a
  // bounded aggregate pending count, independent of phases. Check each
  // physical belt can absorb that bound, or its individual sparse gap
  // is longer than the worst receiver wait and belt traversal.
  if(free&&ins.length>=2){
   const gaps=[];let rho=Z,validGroup=true;
   for(const r of ins){
    // A selected splitter output can be an arbitrary subsequence of
    // its single unit-batch producer's sends. In the hypothetical
    // nonblocking prefix it inherits that producer's minimum gap.
    let u=ns.get(r.from),feed=r,split=null;
    if(u.type==='分流'){
     const si=I.get(u.id),so=O.get(u.id),k=r.materials[0];
     if(!complete(u)||si.length!==1||si[0].toPort!==0||!valid(si[0])||si[0].materials.length!==1||si[0].materials[0]!==k||!so.every(e=>pass(e,k))){validGroup=false;break;}
     split=u.id;feed=si[0];u=ns.get(feed.from);
    }
    const rec=u.recipe,inputs=I.get(u.id);
    if(!complete(u)||O.get(u.id).length!==1||feed.fromPort!==0||!valid(feed)||!rec||rec.qty!==1||r.materials.length!==1||r.materials[0]!==rec.output){validGroup=false;break;}
    let gap=q(rec.seconds);
    if(cmp(gap,U)<0||div(gap,delta).d!==1n){validGroup=false;break;}
    if(inputs.length===1&&Object.keys(rec.inputs||{}).length===1&&inputs[0].materials.length===1&&valid(inputs[0])){
     const input=inputs[0],src=ns.get(input.from),a=rec.inputs[input.materials[0]],rate=source(src,input);
     if(src.recipe&&rate!==null&&cmp(rate,U)===0&&Number.isSafeInteger(a)&&a>=1&&cmp(gap,q(a))<=0)gap=q(a);
    }
    gaps.push({route:r.id,gap,length:r.length,split,feed:feed.id});
    rho=arith.add(rho,div(U,gap));
   }
   if(validGroup&&cmp(rho,U)<=0){
    const backlog=ins.length+2,checks=gaps.map(x=>{
     const K=x.length+1,window=q({n:BigInt(K),d:2n}),v=div(window,x.gap),flight=Number((v.n+v.d-1n)/v.d);
     const long=backlog+flight<=K,sparse=cmp(x.gap,arith.add(arith.add(q(ins.length),window),delta))>=0;
     return {route:x.route,gap:txt(x.gap),length:x.length,flight,long,sparse,split:x.split,feed:x.feed};
    });
    // Sharper case: Q<=n in every aggregate busy interval. Since the
    // merger FIFO holds 3, a pending virtual arrival always has space.
    // If each port gap >= P+(n-1) ticks, receive delay <= (n-1) ticks
    // by induction on that port's arrivals; even a one-cell belt fits.
    const shortDelay=mul(q(ins.length-1),delta),instant=gaps.every(x=>cmp(x.gap,arith.add(U,shortDelay))>=0);
    if(instant||checks.every(x=>x.long||x.sparse)){
     for(const x of gaps){
      if(x.split){freeSends.add(x.route);out.freeReceiverRoutes.push(x.feed);}
      else out.freeReceiverRoutes.push(x.route);
     }
     // Previously rejected backward queries may now be proved. The
     // selected branch never blocks at a producer's inherited gap;
     // this isn't an unrestricted 1/s service contract on that branch.
     freeProof.clear();
     out.witnesses.push({method:'free-merger-unit-envelope-dispatch',machine:m.id,capacity:txt(rho),backlog:instant?ins.length:backlog,receiveDelay:instant?txt(shortDelay):null,checks});
    }
   }
  }
  const ready=ins.filter(readyRoute);if(!ready.length)continue;
  if(free)emit({[rt(e)]:1},U,'ready-inlet-free-merger-saturation');
  if(ready.length>=2){
   for(const r of ready.slice(1))emit({[rt(r)]:1,[rt(ready[0])]:-1},Z,'saturated-merger-unskipped-round-robin');
   for(const r of ins.filter(x=>!ready.includes(x)))emit({[rt(r)]:1,[rt(ready[0])]:-1},Z,'saturated-merger-skipped-port-upper','le');
  }
  out.witnesses.push({method:free?'ready-inlet-free-merger':'ready-inlet-backpressured-merger',machine:m.id,output:e.id,ready:ready.map(e=>e.id),allInputs:ins.map(e=>e.id)});
 }
 for(const m of plan.reverse){
  if(m.type!=='分流'||!complete(m))continue;
  const ins=I.get(m.id),outs=O.get(m.id);
  if(ins.length!==1||outs.length<2||outs.length>3||ins[0].toPort!==0||ins[0].materials.length!==1||!valid(ins[0]))continue;
  const input=ins[0],k=input.materials[0];
  if(!outs.every(e=>pass(e,k)))continue;
  const free=outs.filter(e=>freeSends.has(e.id)||freeRoute(e,k));
  // A single remaining branch into the highest-priority inlet of a
  // unit-output recipe can also be free at this splitter's RR clock.
  // All sibling branches must be independently (unconditionally) free.
  const pending=outs.filter(e=>!freeRoute(e,k));
  if(pending.length===1&&outs.length>=2){
   const e=pending[0],target=ns.get(e.to),rec=target.recipe,ti=I.get(target.id),to=O.get(target.id);
   if(rec&&complete(target)&&valid(e)&&rec.qty===1&&Object.keys(rec.inputs||{}).length===1&&
      Number.isSafeInteger(rec.inputs[k])&&rec.inputs[k]>=ti.length&&ti.length>=2&&
      ti.every(x=>valid(x)&&x.materials.length===1&&x.materials[0]===k)&&
      (target.inputPriority||[]).filter(port=>ti.some(x=>x.toPort===port))[0]===e.toPort&&
      to.length===1&&freeRoute(to[0],rec.output)){
    const T=q(rec.seconds),h=q(outs.length),delay=arith.add(T,delta),K=q(e.length+1),travel=div(K,q(2));
    // On a pending head, a full cache opens >=a slots at next start.
    // No competing inlet can take more than one slot before the
    // previous receipt's P cooldown ends. Hence R_j <= max(
    // S_j+Ld+T+delta, R_(j-1)+max(P,T+delta)).
    // At RR gap h, that delay fits the actual belt's K packet slots.
    if(cmp(T,U)>=0&&div(T,delta).d===1n&&cmp(delay,h)<=0&&cmp(mul(K,h),arith.add(travel,delay))>=0){
     if(!free.includes(e))free.push(e);
     roundRobinNoSkip.add(m.id);
     out.witnesses.push({method:'priority-recipe-inlet-at-splitter-gap',machine:target.id,splitter:m.id,route:e.id,gap:txt(h),delay:txt(delay),batch:rec.inputs[k],otherPorts:ti.length-1});
    }
   }
  }
  // A 2-way splitter with one free branch may feed a 2-in merger
  // (including a physical return loop). For the latter, an arriving
  // eligible head waits <=2P, and a continuously pending next head
  // is accepted <=2P after its predecessor. Thus a 2P-spaced branch
  // cannot fill its belt from empty. No assumption about the other inlet.
  if(outs.length===2&&pending.length===1&&free.length===1){
   const e=pending[0],d=ns.get(e.to),di=I.get(d.id),doo=O.get(d.id);
   if(d.type==='汇流'&&complete(d)&&di.length===2&&doo.length===1&&di.every(valid)&&valid(doo[0])&&
     di.every(x=>x.materials.length===1&&x.materials[0]===k)&&doo[0].materials.length===1&&doo[0].materials[0]===k&&freeRoute(doo[0],k)&&valid(e)){
    const K=q(e.length+1),h=q(2),delay=q(2);
    if(cmp(mul(K,h),arith.add(div(K,q(2)),delay))>=0){
     if(!free.includes(e))free.push(e);
     roundRobinNoSkip.add(m.id);
     out.witnesses.push({method:'two-port-merger-splitter-gap-no-skip',machine:m.id,merger:d.id,route:e.id,gap:'2',wait:'2'});
    }
   }
  }
  if(!free.length)continue;
  if(outs.every(e=>freeRoute(e,k)))roundRobinNoSkip.add(m.id);
  // Each free output is encountered once in every successful RR round.
  // In a partial round the discrepancy between two free ports is <=1;
  // a non-free port can be skipped but cannot be served twice per round.
  for(const e of free.slice(1))emit({[rt(e)]:1,[rt(free[0])]:-1},Z,'partial-splitter-free-ports-equal');
  for(const e of outs.filter(o=>!free.includes(o)))emit({[rt(e)]:1,[rt(free[0])]:-1},Z,'partial-splitter-blocked-port-upper','le');
  const rate=readyRoute(input)?U:source(ns.get(input.from),input);
  if(rate!==null)emit({[rt(input)]:1},rate,'partial-splitter-free-path-source-rate');
  out.witnesses.push({method:'partial-splitter-free-path',machine:m.id,input:input.id,free:free.map(e=>e.id),other:outs.filter(o=>!free.includes(o)).map(e=>e.id),sourceRate:rate===null?null:txt(rate)});
 }
 // A saturated homogeneous input supplies a work-conserving splitter.
 // When one output's belt has room, that output is served within n
 // successful scans (<=nP), even if every sibling has arbitrary stalls.
 // This is a conservative event-time service bound, not an equal share.
 for(const m of plan.forward){
  if(m.type!=='分流'||!complete(m))continue;
  const ins=I.get(m.id),outs=O.get(m.id);
  if(ins.length!==1||ins[0].toPort!==0||outs.length<2||outs.length>3||ins[0].materials.length!==1||!valid(ins[0]))continue;
  const k=ins[0].materials[0],r=source(ns.get(ins[0].from),ins[0]);
  if(r===null||cmp(r,U)!==0||!outs.every(e=>pass(e,k)&&valid(e)))continue;
  for(const e of outs)out.sharedRootCertificates.push({route:e.id,splitter:m.id,item:k,source:ins[0].from,ports:outs.length,gap:String(outs.length),spaceWait:String(outs.length)});
 }
 // An ordinary recipe output reaching a proven free splitter has the
 // exact same acceptance clock as a free warehouse inlet. A proof-only
 // terminal can therefore be used for its upstream independent tree.
 for(const e of g.lines)if(ns.get(e.from)?.recipe&&ns.get(e.to)?.type==='分流'&&e.materials.length===1&&freeRoute(e,e.materials[0]))out.freeReceiverRoutes.push(e.id);
 // Shared-ingredient refill with one independently ready private port
 // and one branch of a two-way splitter fed by a ready autonomous root.
 // From any last full ingredient cache, both feeds have a uniform count
 // lower bound until the next full event. 3a storage absorbs the finite
 // branch latency; if never full the same bound fixes the batch rate.
 for(const m of plan.forward){
  const rec=m.recipe,ins=I.get(m.id),outs=O.get(m.id);
  if(!rec||!complete(m)||rec.qty!==1||ins.length!==2||outs.length!==1||!valid(outs[0]))continue;
  const keys=Object.keys(rec.inputs||{});if(keys.length!==1)continue;
  const k=keys[0],a=rec.inputs[k],T=q(rec.seconds);
  if(!Number.isSafeInteger(a)||a<1||cmp(T,U)<0||div(T,delta).d!==1n||ins.some(e=>!valid(e)||e.materials.length!==1||e.materials[0]!==k))continue;
  const outputFree=freeRoute(outs[0],rec.output)||out.freeReceiverRoutes.includes(outs[0].id);
  if(cmp(div(q(a),T),q('3/2'))>0)continue;
  for(const branch of ins){
   const split=ns.get(branch.from),si=I.get(split.id),so=O.get(split.id),priv=ins.find(e=>e!==branch);
   if(split.type!=='分流'||!complete(split)||si.length!==1||so.length!==2||si[0].materials.length!==1||si[0].materials[0]!==k||si[0].toPort!==0||!valid(si[0])||!so.every(e=>pass(e,k)))continue;
   const src=ns.get(si[0].from),ps=ns.get(priv.from);
   const r1=source(src,si[0]),r2=source(ps,priv);
   if(!src.recipe||!ps.recipe||r1===null||r2===null||cmp(r1,U)!==0||cmp(r2,U)!==0)continue;
   // For any interval after a full-buffer frame, shared branch receives
   // at least floor((duration-(L+1)/2)/2) and private floor(duration).
   // With nominal starts <= ceil(duration/T), the strict integer lower
   // bound exceeds a-1 if a >= 1 + (L+1)/4.
   const delay=q({n:BigInt(branch.length+1),d:2n});
   if(cmp(q(a),arith.add(U,div(delay,q(2))))<0)continue;
   materialReady.add(m.id);
   if(outputFree){
    emit({['cycle:'+m.id]:1},div(U,T),'parallel-private-and-shared-splitter-refill');
    out.witnesses.push({method:'parallel-private-and-shared-splitter-refill',machine:m.id,item:k,private:priv.id,shared:branch.id,delay:txt(delay),batch:a,period:txt(T)});
   }
   else out.witnesses.push({method:'parallel-refill-ingredients-ready-under-backpressure',machine:m.id,item:k,private:priv.id,shared:branch.id,delay:txt(delay),batch:a,period:txt(T)});
   break;
  }
 }
 // Compose proved event-service clocks, NOT rates. h means that a
 // compatible belt head is available by last receipt+h (after finite
 // startup), if not accepted earlier. A blocked receiver cannot weaken
 // this upper bound on the next head. Facts propagate only from roots;
 // a directed cycle without a grounded clock never certifies itself.
 const mark=(e,h,method,extra={})=>{
  if(!valid(e)||e.materials.length!==1)return false;
  const old=clocks.get(e.id);if(old&&cmp(old,h)<=0)return false;
  clocks.set(e.id,h);out.witnesses.push({method,route:e.id,gap:txt(h),...extra});return true;
 };
 for(const e of g.lines)if(readyRoute(e))mark(e,U,'grounded-unit-service-clock');
 // Slow unit autonomous sources have a service clock too: if the
 // output queue is empty after a send, the next completion takes at
 // most T. Belt-space recovery adds at most one cell travel time.
 for(const e of g.lines){
  const m=ns.get(e.from),r=m.recipe,rate=source(m,e);
  if(rate!==null&&r?.qty===1&&cmp(q(r.seconds),U)>=0)mark(e,q(r.seconds),'grounded-slow-unit-service-clock',{machine:m.id});
 }
 // Existing saturated-root RR theorem bounds the next dispatch by
 // max(previous+nP, space-recovery+nP). Since Ld+d <= LP, the
 // corresponding head is available by previous receipt+nP.
 for(const c of out.sharedRootCertificates){
  const e=g.lines.find(x=>x.id===c.route);
  if(e)mark(e,q(c.gap),'shared-splitter-branch-service-clock',{machine:c.splitter,root:c.source});
 }
 // All updates are exact finite logical implications. No rate iteration.
 for(let round=0;round<=g.nodes.length;round++){
  out.schedule.forwardSweeps++;
  let changed=false;
  for(const m of plan.forward){
   const ins=I.get(m.id),outs=O.get(m.id);
   if(!complete(m)||!ins.length||!outs.length||!ins.every(valid)||!outs.every(valid))continue;
   if(m.type==='汇流'&&outs.length===1&&ins.length>=2&&ins.length<=3&&outs[0].materials.length===1&&ins.every(e=>e.materials.length===1&&e.materials[0]===outs[0].materials[0])){
    const n=q(ins.length);
    if(ins.every(e=>clocks.has(e.id)&&cmp(clocks.get(e.id),n)<=0)){
     changed=mark(outs[0],U,'composed-merger-receipt-clock',{machine:m.id,inputs:ins.map(e=>({route:e.id,gap:txt(clocks.get(e.id))}))})||changed;
     if(freeRoute(outs[0],outs[0].materials[0]))emit({[rt(outs[0])]:1},U,'composed-free-merger-saturation');
    }
   }
   if(m.type==='分流'&&ins.length===1&&clocks.has(ins[0].id)&&cmp(clocks.get(ins[0].id),U)===0&&roundRobinNoSkip.has(m.id)){
    const k=ins[0].materials[0];if(!outs.every(e=>e.materials.length===1&&e.materials[0]===k))continue;
    // At least one unconditional free branch, and all branches proved
    // unskipped at the actual RR gap. Input accepts immediately, hence
    // a saturated input yields exactly one dispatch per P.
    if(!outs.some(e=>freeRoute(e,k)))continue;
    emit({[rt(ins[0])]:1},U,'composed-splitter-saturated-input');
    for(const e of outs)changed=mark(e,q(outs.length),'composed-splitter-receipt-clock',{machine:m.id,input:ins[0].id})||changed;
   }
   const rec=m.recipe;
   if(!rec||rec.qty!==1||outs.length!==1||outs[0].materials[0]!==rec.output)continue;
   const T=q(rec.seconds),keys=Object.keys(rec.inputs||{});
   if(cmp(T,U)<0||div(T,delta).d!==1n||!keys.length||ins.some(e=>e.materials.length!==1||!keys.includes(e.materials[0])))continue;
   // A finite common ingredient cache: at its last full frame, at most
   // ceil(Delta/T) batches can start before the next candidate start.
   // Each independently clock-certified inlet adds floor(Delta/h_i)
   // receipts if the cache has not become full again. Sufficient
   // supply and 3a >= a + batch/rounding margin prove no shortages.
   if(!materialReady.has(m.id)&&keys.every(k=>{
    const a=rec.inputs[k],ports=ins.filter(e=>e.materials[0]===k);
    if(!Number.isSafeInteger(a)||a<1||!ports.length||a<ports.length-1||ports.some(e=>!clocks.has(e.id)))return false;
    const supply=ports.reduce((v,e)=>arith.add(v,div(U,clocks.get(e.id))),Z);
    return cmp(supply,div(q(a),T))>=0;
   })){
    materialReady.add(m.id);changed=true;
    out.witnesses.push({method:'composed-recipe-ingredients-ready',machine:m.id,inputs:ins.map(e=>({route:e.id,gap:txt(clocks.get(e.id))})),period:txt(T)});
   }
   // A dedicated ingredient port with a proven head clock h can
   // supply a items within a*h after the previous batch starts, if
   // no further batch has started. Thus even when nominal full-rate
   // readiness fails, a free-output recipe has a lower batch rate.
   // This bound is a necessary inequality, not a selected rate.
   if(keys.length===ins.length&&keys.every(k=>Number.isSafeInteger(rec.inputs[k])&&rec.inputs[k]>0&&ins.filter(e=>e.materials[0]===k&&clocks.has(e.id)).length===1)){
    let H=T;
    for(const e of ins){const t=mul(q(rec.inputs[e.materials[0]]),clocks.get(e.id));if(cmp(t,H)>0)H=t;}
    if(freeRoute(outs[0],rec.output)||out.freeReceiverRoutes.includes(outs[0].id)){
     emit({['cycle:'+m.id]:-1},arith.sub(Z,div(U,H)),'dedicated-ingredient-service-lower','le');
     if(!out.witnesses.some(w=>w.method==='dedicated-ingredient-service-lower'&&w.machine===m.id&&w.gap===txt(H)))out.witnesses.push({method:'dedicated-ingredient-service-lower',machine:m.id,gap:txt(H),rate:txt(div(U,H)),inputs:ins.map(e=>({route:e.id,gap:txt(clocks.get(e.id))}))});
    }
   }
   if(!materialReady.has(m.id))continue;
   changed=mark(outs[0],T,'composed-recipe-receipt-clock',{machine:m.id})||changed;
   if(freeRoute(outs[0],rec.output)||out.freeReceiverRoutes.includes(outs[0].id)){
    emit({['cycle:'+m.id]:1},div(U,T),'composed-ingredient-ready-free-recipe');
    nominalCadence.set(m.id,T);
    if(!out.witnesses.some(w=>w.method==='composed-ingredient-ready-free-recipe'&&w.machine===m.id))out.witnesses.push({method:'composed-ingredient-ready-free-recipe',machine:m.id,rate:txt(div(U,T)),period:txt(T)});
   }
  }
  if(!changed)break;
 }
 // Backward cadence through a dedicated unit-batch link. With
 // downstream one-per-batch consumption at exact H, h<H ensures
 // its finite ingredient cache eventually fills and thereafter
 // receives exactly once H, one tick after each batch start.
 // An ingredient-ready producer with T+delta<H is then paced by
 // the released belt slots. Its full output cache releases one
 // batch start per send after finite transient. This is an event
 // spacing proof, not an inference from mean rate.
 for(const m of plan.reverse){
  const H=nominalCadence.get(m.id),rec=m.recipe;if(!H||!rec)continue;
  for(const e of I.get(m.id)){
   const k=e.materials[0],u=ns.get(e.from),r=u.recipe,h=clocks.get(e.id);
   if(!valid(e)||e.materials.length!==1||rec.inputs[k]!==1||I.get(m.id).filter(x=>x.materials.includes(k)).length!==1||
      !r||r.qty!==1||r.output!==k||!complete(u)||O.get(u.id).length!==1||!materialReady.has(u.id)||!h||
      cmp(h,H)>=0||cmp(arith.add(q(r.seconds),delta),H)>=0)continue;
   nominalCadence.set(u.id,H);
   emit({['cycle:'+u.id]:1},div(U,H),'backward-dedicated-unit-cadence');
   out.witnesses.push({method:'backward-dedicated-unit-cadence',machine:u.id,downstream:m.id,route:e.id,period:txt(H),headGap:txt(h)});
  }
 }
 // Fixed-frame version of the preferred inlet refill proof (doc 6.2.3).
 // At a known exact batch cadence H>qP, the first port alone can
 // refill all slots. Its offset decreases by H-qP until it is ready
 // at the first receive frame after release. Then other ports each
 // receive <=floor(q/2), so their offsets also converge to zero
 // provided H>floor(q/2)*h_i. Restrict to two ports, q=2 or 3:
 // the first wave takes one from each, and for q=3 the high port
 // takes the next (at P, with priority even if the other is ready).
 for(const m of plan.reverse){
  const H=nominalCadence.get(m.id),rec=m.recipe;if(!H||!rec)continue;
  for(const [k,a] of Object.entries(rec.inputs||{})){
   const ports=I.get(m.id).filter(e=>e.materials.length===1&&e.materials[0]===k);
   if(ports.length!==2||![2,3].includes(a)||ports.some(e=>!valid(e)||!clocks.has(e.id)||!m.inputPriority?.includes(e.toPort)))continue;
   ports.sort((a,b)=>m.inputPriority.indexOf(a.toPort)-m.inputPriority.indexOf(b.toPort));
   const [hi,lo]=ports,gap=clocks.get(lo.id);
   if(cmp(clocks.get(hi.id),U)!==0||cmp(H,q(a))<=0||cmp(H,gap)<=0)continue;
   emit({[rt(hi)]:1,['cycle:'+m.id]:-(a-1)},Z,'fixed-preferred-inlet-cadence-refill');
   emit({[rt(lo)]:1,['cycle:'+m.id]:-1},Z,'fixed-preferred-inlet-cadence-refill');
   out.witnesses.push({method:'fixed-preferred-inlet-cadence-refill',machine:m.id,item:k,period:txt(H),ports:[{route:hi.id,perBatch:a-1},{route:lo.id,perBatch:1}]});
  }
 }
 // A warehouse outlet feeding a proved no-wait receiver has no
 // accumulating refill buffer: each refill immediately dispatches.
 // This is stronger than a nominal capacity or average-rate claim.
 for(const m of g.nodes){
  if(m.type!=='仓出'||!m.item||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1)continue;
  const e=O.get(m.id)[0];
  if(e.fromPort!==0||!freeRoute(e,m.item))continue;
  const cert={proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'refill-buffer-always-has-space-eventually',machine:m.id,item:m.item,route:e.id};
  out.freeOutletCertificates.push(cert);out.witnesses.push(cert);
 }
 // Entire fan-out tree must have no backpressure: every active output
 // leads through compatible homogeneous splitters to a warehouse inlet.
 // Same packet gap >= P propagates to each branch without buffering.
 for(const m of g.nodes){
  const es=O.get(m.id);if(es.length!==1)continue;
  const root=es[0],rate=readyRoute(root)?U:source(m,root);if(rate===null||ns.get(root.to).type!=='分流')continue;
  const k=root.materials[0],seen=new Set(),assign=[],splitters=[];
  function walk(e,x){
   if(!valid(e)||e.materials.length!==1||e.materials[0]!==k||seen.has(e.id))return false;
   seen.add(e.id);assign.push([e,x]);
   const d=ns.get(e.to);
   if(d.type==='仓入')return true;
   const outs=O.get(d.id);
   if(d.type!=='分流'||!complete(d)||I.get(d.id).length!==1||I.get(d.id)[0]!==e||e.toPort!==0||outs.length<1||outs.length>3)return false;
   splitters.push(d.id);
   return outs.every(o=>walk(o,div(x,q(outs.length))));
  }
  if(!walk(root,rate))continue;
  for(const [e,x] of assign)emit({[rt(e)]:1},x,'unblocked-homogeneous-splitter-tree');
  out.witnesses.push({method:'unblocked-homogeneous-splitter-tree',root:m.id,splitters,rates:Object.fromEntries(assign.map(([e,x])=>[e.id,txt(x)]))});
 }
 out.relations=[...new Map(out.relations.map(r=>[JSON.stringify([r.sense,r.coefficients,r.constant]),r])).values()];
 return out;
}
if(typeof module!=='undefined')module.exports={proveSaturatedRouterCounts};
