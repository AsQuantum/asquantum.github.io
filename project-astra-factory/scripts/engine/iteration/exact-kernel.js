'use strict';
// Independent research kernel: 20 ticks/s, ten position units/m.
// No production HTML dependency. Frozen service is exact rational.
function iterationCreateKernel(spec,A,{initialStock={},initialControl=null,boundary=null,captureDeposits=false,captureGuards=false,captureOutputGuards=false,frozenLattice=true,lazyBelts="adaptive",absoluteClocks=true}={}){
 const {q,add,sub,mul,div,cmp,txt,Z,U}=A,D=q('1/20'),P=20,spacing=10;
 const whole=x=>{if(typeof x==="bigint"){if(x<0n||x>BigInt(Number.MAX_SAFE_INTEGER))throw Error("unsupported integer clock");return Number(x)}const v=q(x);if(v.d!==1n||v.n<0n||v.n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('unsupported integer clock');return Number(v.n)};
 const nadd=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))throw Error('integer capacity exceeded');return n};
 const counterKeys=[],counterIndex=new Map(),counterValues=[];
 const setCounter=(k,n)=>{let i=counterIndex.get(k);if(i===undefined){i=counterKeys.length;counterIndex.set(k,i);counterKeys.push(k)}counterValues[i]=n};
 const counterObject=values=>Object.fromEntries(values.map((v,i)=>[counterKeys[i],v]));
 const inc=(o,k,n=1)=>{
  if(o===count){const i=counterIndex.get(k);if(i===undefined)setCounter(k,n);else counterValues[i]=nadd(counterValues[i],n);return}
  o[k]=nadd(o[k]||0,n)
 };
 const count=Object.create(null),stock=Object.create(null),gates=Object.create(null),lastLow=Object.create(null);
 const get=k=>stock[k]||0, delta=(k,n)=>inc(stock,k,n);
 for(const [k,v] of Object.entries(initialStock)){if(!Number.isSafeInteger(v)||v<0&&!spec.unlimitedWarehouse&&!boundary?.free?.includes(k))throw Error("invalid initial stock");stock[k]=v}
 let tick=0,motionTick=0,clockNow=0,blockMin=Object.create(null);
 const guardBounds=Object.create(null),outputBounds=Object.create(null),depositLog=new Map(),free=new Set(boundary?.free||[]);
 const calendarFrames=boundary?new Map(Object.entries(boundary.frames).map(([t,frame])=>[Number(t),Object.fromEntries(Object.entries(frame).map(([stage,items])=>[stage,Object.entries(items)]))])):null;
 const calendarEvents=calendarFrames?[...calendarFrames.keys()].sort((a,b)=>a-b):[];
 let calendarFrame=null;
 const ready=k=>spec.unlimitedWarehouse||free.has(k);
 function deposit(stage,k,n){
  if(!boundary||boundary.additive)delta(k,n);
  if(captureDeposits){let frame=depositLog.get(tick);if(!frame)depositLog.set(tick,frame={});inc(frame[stage]??={},k,n)}
 }
 function inject(stage){const entries=calendarFrame?.[stage];if(entries)for(const [k,n] of entries){
  delta(k,n);
  // Research-only additive source calendar: preserve exact stage and
  // account upstream credits once, without suppressing downstream deposits.
  if(boundary.additive){inc(count,'inflow:'+k,n);inc(count,(stage==='physical'?'localIn:':'frozenIn:')+k,n);}
 }}
 const nodes=spec.machines.map(m=>({m,ingredients:Object.entries(m.recipe?.inputs||{}),ins:[],outs:new Map(),input:Object.create(null),ports:Object.create(null),fifo:Object.create(null),ingredient:Object.create(null),output:0,queue:[],rr:0,send:new Map(),recv:new Map(),fill:0,busy:0,progress:0,consumer:0,T:m.recipe?whole(mul(q(m.recipe.seconds),q(P))):0}));
 const by=new Map(nodes.map(s=>[s.m.id,s]));if(by.size!==nodes.length)throw Error('duplicate machine');
 const edges=spec.routes.map(r=>{
  const a=by.get(r.from),b=by.get(r.to),connected=!!(a&&b&&r.length>0&&a.m.outPorts.some(p=>p.index===r.fromPort)&&b.m.inputPriority.includes(r.toPort));
  const e={r,a,b,connected,end:r.length*spacing,packets:[],head:0,release:-Infinity,lazy:lazyBelts===true||lazyBelts==="adaptive"&&r.length>=32,accepted:new Set(r.accepted),filter:a?.m.outPorts.find(p=>p.index===r.fromPort)?.filter};
  if(!Number.isSafeInteger(r.length)||r.length<0||!Number.isSafeInteger(e.end))throw Error('invalid route');
  // The actual runtime selects the first route for a sending port.
  // Ordinary arrivals share the port cooldown; merger selects the first
  // recorded input route, even when a later duplicate is connected.
  if(a&&!a.outs.has(r.fromPort)){a.outs.set(r.fromPort,e);a.send.set(r.fromPort,0);}
  if(connected){b.ins.push(e);if(!b.recv.has(r.toPort))b.recv.set(r.toPort,0)}
  return e;
 });
 if(new Set(edges.map(e=>e.r.id)).size!==edges.length)throw Error('duplicate route');
 for(const s of nodes){
  if(s.m.type==='分流'&&s.ins.some(e=>e.r.toPort!==0))throw Error('unsupported splitter input');
  if(s.m.recipe&&(!s.T||!Number.isSafeInteger(s.m.recipe.qty)||s.m.recipe.qty<1))throw Error('invalid recipe');
  s.ins.sort((a,b)=>s.m.inputPriority.indexOf(a.r.toPort)-s.m.inputPriority.indexOf(b.r.toPort));
 }
 const connectedEdges=edges.filter(e=>e.connected),movingEdges=connectedEdges.filter(e=>!e.lazy),receiveEdges=nodes.filter(s=>s.m.type!=='汇流').flatMap(s=>s.ins);
 const outlets=spec.priority.map(id=>by.get(id));if(outlets.some(s=>!s||s.m.type!=='仓出')||new Set(outlets).size!==nodes.filter(s=>s.m.type==='仓出').length)throw Error('bad priority');
 for(const s of outlets)if(s.m.item)inc(gates,s.m.item);
 // Common service lattice: r_i=p_i/L, v=service/L, scale M
 // divisible by 20L and each input p_i. Every reachable input phase
 // has an integer numerator divisible by p_i on this grid.
 const gcd=(a,b)=>{while(b){const t=a%b;a=b;b=t}return a};
 const lcm=(a,b)=>a/gcd(a,b)*b;
 const ceil=(n,d)=>(n+d-1n)/d;
 const frozen=(spec.frozen||[]).map(f=>{
  const entries=Object.entries(f.rates).map(([k,v])=>{const r=q(v);return {k,neg:r.n<0n,n:r.n<0n?-r.n:r.n,d:r.d}}).filter(e=>e.n!==0n);
  // Only input coefficients can limit service; output coefficients need
  // not divide M. Bound the precompiled lattice size, not the exact rates.
  const maxBits=4096,fit=n=>n.toString(2).length<=maxBits;
  let L=1n,M=1n,lattice=frozenLattice;
  if(lattice)for(const e of entries){L=lcm(L,e.d);if(!fit(L)){lattice=false;break}}
  if(lattice){
   M=20n*L;if(!fit(M))lattice=false;
   for(const e of entries){if(!lattice)break;e.p=e.n*(L/e.d);if(e.neg){M=lcm(M,e.p);if(!fit(M))lattice=false}}
  }
  if(lattice){
   const unit=M/(20n*L);
   for(const e of entries){e.phase=0n;e.increment=e.p*unit;if(e.neg)inc(gates,e.k,whole(ceil(e.increment,M))+1)}
   return {id:f.id,entries,inputs:entries.filter(e=>e.neg),L,M,unit,service:0n,lattice};
  }
  // Exact rational fallback for pathological common denominators.
  for(const e of entries){e.r=q({n:e.n,d:e.d});e.increment=mul(e.r,D);e.phase=Z;if(e.neg)inc(gates,e.k,whole(ceil(e.increment.n,e.increment.d))+1)}
  return {id:f.id,entries,inputs:entries.filter(e=>e.neg),service:Z,lattice};
 });
 const phaseText=(f,e)=>txt(f.lattice?{n:e.phase,d:f.M}:e.phase);
 const serviceText=f=>txt(f.lattice?{n:f.service*f.L,d:f.M}:f.service);
 const exactUnits=(v,num,den)=>{const x=q(v),n=x.n*num,d=x.d*den;if(n%d!==0n)throw Error('off-lattice frozen state');return n/d};
 const unlimited=!!spec.unlimitedWarehouse,items=Object.keys(gates).filter(k=>!free.has(k));
 if(boundary&&(!Number.isSafeInteger(boundary.period)||boundary.period<1))throw Error("invalid boundary period");
 // Exact lazy transport. Relative packet rank j uses
 // min(t-max(sent, release+j*spacing), end-j*spacing).
 // A head removal raises the release barrier for the remaining ranks.
 // motionTick excludes proven whole-cycle translations, which preserve
 // all physical positions. It includes every executed or quiet tick.
 const packetCount=e=>e.packets.length-e.head;
 function packetPosition(e,j){
  const h=e.packets[e.head+j];
  if(!e.lazy)return h.pos;
  const cap=e.end-j*spacing,start=Math.max(h.sent,e.release+j*spacing);
  // Test saturation before subtraction, so an old negative virtual start
  // cannot overflow a safe integer even when the clamped position fits.
  return start<=motionTick-cap?cap:motionTick-start;
 }
 function packetHead(e){return e.packets[e.head]}
 function packetTailPosition(e){const n=packetCount(e);return n?packetPosition(e,n-1):spacing}
 function packetPush(e,k){e.packets.push(e.lazy?{k,sent:motionTick}:{k,pos:0})}
 function packetPop(e){
  if(!e.lazy){e.packets.shift();return}
  e.release=Math.max(e.release,motionTick-e.end)+spacing;
  e.head++;
  if(e.head===e.packets.length){e.packets=[];e.head=0;e.release=-Infinity}
  else if(e.head>=64&&e.head*2>=e.packets.length){e.packets=e.packets.slice(e.head);e.head=0}
 }
 function packetState(e){
  if(!e.lazy)return e.packets.map(h=>[h.k,h.pos]);
  const out=[];for(let j=0;j<packetCount(e);j++)out.push([e.packets[e.head+j].k,packetPosition(e,j)]);return out;
 }
 // Deadline coordinates use the executed-motion clock, which does not
 // advance on a proven whole-cycle translation of the complete state.
 const remainingClock=v=>Math.max(0,v-clockNow);
 const setClock=(map,p)=>map.set(p,nadd(clockNow,P));
 function send(s,p,k){
  const e=s.outs.get(p),filter=e?.filter;
  if(!e?.connected||s.send.get(p)>clockNow||packetTailPosition(e)<spacing||filter&&filter!=='任意'&&filter!==k)return false;
  packetPush(e,k);setClock(s.send,p);
  inc(count,'routeTotal:'+e.r.id);inc(count,'flow:'+e.r.id+'|'+k);
  inc(count,'machineTotal:'+s.m.id+'|out');inc(count,'machineMaterial:'+s.m.id+'|out|'+k);return true;
 }
 function accept(e){
  const s=e.b,p=e.r.toPort,h=packetHead(e);if(!h||packetPosition(e,0)!==e.end||!e.accepted.has(h.k))return false;
  const k=h.k,r=s.m.recipe,t=s.m.type;
  if(t==='仓入'){deposit('physical',k,1);inc(count,'inflow:'+k);inc(count,'localIn:'+k)}
  else{
   if(s.recv.get(p)>clockNow)return false;
   if(t==='电脑'){if(s.queue.length>=10)return false;s.queue.push(k)}
   else if(t==='汇流'){if(s.queue.length>=3)return false;s.queue.push([k,p])}
   else if(t==='分流'){const f=s.fifo[p]??=[];if(f.length>=3)return false;f.push(k);inc(s.ports,p)}
   else if(r){if((s.input[k]||0)>=3*(r.inputs[k]||0))return false;(s.ingredient[k]??=[]).push(p)}
   else return false;
   inc(s.input,k);setClock(s.recv,p);
  }
  packetPop(e);inc(count,'machineTotal:'+s.m.id+'|in');inc(count,'machineMaterial:'+s.m.id+'|in|'+k);return true;
 }
 function scan(s,order,fn){for(let i=0;i<order.length;i++){const j=(s.rr+i)%order.length,r=fn(order[j]);if(r===-1)break;if(r){s.rr=(j+1)%order.length;break}}}
 function recordGuard(k,n,threshold){
  if(!captureGuards||ready(k))return;
  const g=guardBounds[k]??={};
  if(n>=threshold)g.lower=Math.min(g.lower??Infinity,n-threshold);
  else g.upper=Math.min(g.upper??Infinity,threshold-1-n);
 }
 function outputGuard(s,threshold){
  if(!captureOutputGuards)return;
  const n=s.output,g=outputBounds[s.m.id]??={};
  if(n>=threshold)g.lower=Math.min(g.lower??Infinity,n-threshold);
  else g.upper=Math.min(g.upper??Infinity,threshold-1-n);
 }
 function frozenFractionStep(f,available,reserved){
  const inputs=f.inputs;let service=D;
  if(!unlimited)for(const e of inputs){
   if(ready(e.k))continue;
   const limit=div(sub(q(available(e.k)),e.phase),e.r);
   if(cmp(limit,service)<0)service=limit;
  }
  if(cmp(service,Z)<=0)return false;
  if(captureGuards&&!unlimited)for(const e of inputs){
   if(ready(e.k))continue;
   const v=add(e.phase,mul(e.r,service)),threshold=whole(ceil(v.n,v.d))+(reserved[e.k]||0);
   recordGuard(e.k,get(e.k),threshold);
   if(cmp(service,D)<0&&cmp(div(sub(q(available(e.k)),e.phase),e.r),service)===0){
    const g=guardBounds[e.k]??={};g.upper=Math.min(g.upper??Infinity,0);
   }
  }
  const moves=f.entries.map(e=>{const a=add(e.phase,mul(e.r,service)),n=a.n/a.d;return {e,n:whole(n),phase:sub(a,q(n))}});
  if(moves.some(x=>x.e.neg&&x.n>available(x.e.k)))throw Error('frozen atomic debit');
  f.service=add(f.service,service);
  for(const {e,n,phase} of moves){
   e.phase=phase;if(!n)continue;
   if(e.neg)delta(e.k,-n);else deposit('frozen:'+f.id,e.k,n);
   inc(count,(e.neg?'outflow:':'inflow:')+e.k,n);inc(count,(e.neg?'frozenOut:':'frozenIn:')+e.k,n);
  }
  return true;
 }
 function frozenStep(){
  const reserved=Object.create(null),available=k=>ready(k)?Infinity:Math.max(0,get(k)-(reserved[k]||0));
  for(const f of frozen){
   try{
   const inputs=f.inputs;
   if(captureGuards)for(const e of inputs)recordGuard(e.k,get(e.k),(reserved[e.k]||0)+1);
   if(inputs.some(e=>available(e.k)<1))continue;
   if(!f.lattice){if(!frozenFractionStep(f,available,reserved))continue;}else{
   let service=f.unit;
   const limit=e=>{
    const n=BigInt(available(e.k))*f.M-e.phase;
    if(n%e.p!==0n)throw Error('off-lattice frozen limit');
    return n/e.p;
   };
   if(!unlimited)for(const e of inputs){
    if(ready(e.k))continue;
    const bound=limit(e);if(bound<service)service=bound;
   }
   if(service<=0n)continue;
   if(captureGuards&&!unlimited)for(const e of inputs){
    if(ready(e.k))continue;
    const threshold=whole(ceil(e.phase+e.p*service,f.M))+(reserved[e.k]||0);
    recordGuard(e.k,get(e.k),threshold);
    if(service<f.unit&&limit(e)===service){
     const g=guardBounds[e.k]??={};g.upper=Math.min(g.upper??Infinity,0);
    }
   }
   const moves=f.entries.map(e=>{const a=e.phase+e.p*service;return {e,n:whole(a/f.M),phase:a%f.M}});
   if(moves.some(x=>x.e.neg&&x.n>available(x.e.k)))throw Error('frozen atomic debit');
   f.service+=service;
   for(const {e,n,phase} of moves){
    e.phase=phase;if(!n)continue;
    if(e.neg)delta(e.k,-n);else deposit('frozen:'+f.id,e.k,n);inc(count,(e.neg?'outflow:':'inflow:')+e.k,n);inc(count,(e.neg?'frozenOut:':'frozenIn:')+e.k,n);
   }
   }
   if(captureGuards)for(const e of inputs)recordGuard(e.k,get(e.k),(reserved[e.k]||0)+1);
   if(!unlimited&&inputs.every(e=>available(e.k)>=1))for(const e of inputs)if(!ready(e.k))inc(reserved,e.k);
   }finally{inject("frozen:"+f.id)}
  }
 }
 function step(){
  tick=nadd(tick,1);motionTick=nadd(motionTick,1);if(absoluteClocks)clockNow=motionTick;
  if(calendarFrames)calendarFrame=calendarFrames.get((tick-1)%boundary.period);
  if(!unlimited)for(const k of items){const n=get(k);blockMin[k]=Math.min(blockMin[k]??Infinity,n);if(n<gates[k])lastLow[k]=tick;}
  if(!absoluteClocks)for(const s of nodes){
   for(const [k,v] of s.send)if(v)s.send.set(k,v-1);
   for(const [k,v] of s.recv)if(v)s.recv.set(k,v-1);
   if(s.fill)s.fill--;
  }
  for(const e of movingEdges){
   for(let j=0;j<e.packets.length;j++){const h=e.packets[j],ahead=j?e.packets[j-1].pos-spacing:e.end;h.pos=Math.max(h.pos,Math.min(e.end,ahead,h.pos+1))}
  }
  // Same-tick arrivals: order across machines has no shared state except additive deposits.
  for(const e of receiveEdges)accept(e);
  inject('physical');
  for(const s of outlets){const k=s.m.item;if(k&&s.queue.length<3&&s.fill<=clockNow){
   recordGuard(k,get(k),1);
   if(!(ready(k)||get(k)>0))continue;
   s.queue.push(k);s.fill=nadd(clockNow,P);delta(k,-1);inc(count,'outflow:'+k);inc(count,'localOut:'+k);
  }}
  if(frozen.length)frozenStep();
  for(const s of nodes){
   const m=s.m,t=m.type,r=m.recipe;
   if(t==='仓出'){if(s.queue.length&&send(s,0,s.queue[0]))s.queue.shift();continue}
   if(t==='电脑'){
    if(!s.queue.length){s.consumer=0;continue}
    if(++s.consumer>=P){const k=s.queue.shift();s.consumer-=P;inc(s.input,k,-1);inc(count,'consumed:'+k);inc(count,'machineConsumed:'+m.id+'|'+k)}
    if(!s.queue.length)s.consumer=0;continue
   }
   if(t==='分流'){
    const f=s.fifo[0]||[],k=f[0];if(k!==undefined)scan(s,m.outPorts,p=>{
     const e=s.outs.get(p.index);if(!e?.connected)return false;
     if(p.filter&&p.filter!=='任意'&&p.filter!==k)return -1;
     if(!send(s,p.index,k))return false;f.shift();inc(s.input,k,-1);inc(s.ports,0,-1);return true;
    });continue
   }
   if(t==='汇流'){
    if(s.queue.length&&send(s,0,s.queue[0][0])){const [k]=s.queue.shift();inc(s.input,k,-1)}
    if(s.queue.length<3)scan(s,m.mergerPriority,p=>{const e=s.ins.find(x=>x.r.toPort===p&&x.r.mergerFirst!==false);return !!e&&accept(e)});
    continue
   }
   if(!r)continue;
   const batch=()=>{s.output+=r.qty;inc(count,'cycle:'+m.id);inc(count,'crafts:'+r.output,r.qty)};
   outputGuard(s,r.qty*19+1);
   const canProduce=s.output+r.qty<=r.qty*20;
   if(s.busy>0&&!--s.busy)batch();
   if(!s.busy){
    const ins=s.ingredients;
    if(ins.length)outputGuard(s,r.qty*19+1);
    if(!ins.length){if(canProduce){if(++s.progress>=s.T){s.progress-=s.T;batch()}}else s.progress=Math.min(s.progress,s.T)}
    else if(s.output+r.qty<=r.qty*20&&ins.every(([k,n])=>(s.input[k]||0)>=n)){
     for(const [k,n] of ins){inc(s.input,k,-n);s.ingredient[k].splice(0,n)}
     s.busy=s.T;
    }
   }
   outputGuard(s,1);
   if(s.output&&send(s,0,r.output))s.output--;
  }
 }
 // Conservative next-event lower bound including frozen phase crossings and
 // external stage-calendar credits. Equal-tick actions always use step().
 function quietTicks(limit){
  if(limit<=1)return {n:0,active:[]};
  let next=limit+1;
  const consider=n=>{next=Math.min(next,Math.max(1,n))};
  if(calendarEvents.length){
   const phase=tick%boundary.period;
   let l=0,h=calendarEvents.length;while(l<h){const m=(l+h)>>1;if(calendarEvents[m]<phase)l=m+1;else h=m}
   consider(l<calendarEvents.length?calendarEvents[l]-phase+1:boundary.period-phase+calendarEvents[0]+1);
  }
  if(next<=2)return {n:0,active:[]};
  // Before any integer transfer, all active frozen actors advance at
  // their full rational rate; their one-unit reservations repeat unchanged.
  const active=[],reserved=Object.create(null),available=k=>ready(k)?Infinity:Math.max(0,get(k)-(reserved[k]||0));
  for(const f of frozen){
   if(f.inputs.some(e=>available(e.k)<1))continue;
   active.push(f);
   for(const e of f.entries){
    const n=f.lattice?ceil(f.M-e.phase,e.increment):(()=>{const ratio=div(sub(U,e.phase),e.increment);return ceil(ratio.n,ratio.d)})();
    if(n<=BigInt(next))consider(Number(n));
    if(next<=2)return {n:0,active:[]};
   }
   if(!unlimited)for(const e of f.inputs)if(!ready(e.k))inc(reserved,e.k);
  }
  const mayReceive=e=>{
   const s=e.b,p=e.r.toPort,h=packetHead(e);if(!h||!e.accepted.has(h.k))return;
   const k=h.k,t=s.m.type,r=s.m.recipe;
   if(t==='仓入'){consider(e.end-packetPosition(e,0));return}
   if(t==='电脑'&&s.queue.length>=10||t==='汇流'&&s.queue.length>=3||t==='分流'&&(s.fifo[p]?.length||0)>=3||r&&(s.input[k]||0)>=3*(r.inputs[k]||0))return;
   if(t==='电脑'||t==='汇流'||t==='分流'||r)consider(Math.max(e.end-packetPosition(e,0),remainingClock(s.recv.get(p)||0)));
  };
  for(const e of connectedEdges){mayReceive(e);if(next<=2)return {n:0,active:[]}}
  function maySend(s,p,k){
   const e=s.outs.get(p),filter=e?.filter;
   if(!e?.connected||filter&&filter!=='任意'&&filter!==k)return;
   // Tail can move at most one unit per tick. This bound may be early,
   // never late, even if an upstream packet blocks its movement.
   consider(Math.max(remainingClock(s.send.get(p)||0),spacing-packetTailPosition(e)));
  }
  for(const s of nodes){
   if(next<=2)return {n:0,active:[]};
   const t=s.m.type,r=s.m.recipe;
   if(t==='仓出'){
    if(s.m.item&&s.queue.length<3&&(ready(s.m.item)||get(s.m.item)>0))consider(remainingClock(s.fill));
    if(s.queue.length)maySend(s,0,s.queue[0]);continue;
   }
   if(t==='电脑'){if(s.queue.length)consider(P-s.consumer);continue;}
   if(t==='分流'){
    const k=s.fifo[0]?.[0];if(k!==undefined)for(const p of s.m.outPorts)maySend(s,p.index,k);continue;
   }
   if(t==='汇流'){if(s.queue.length)maySend(s,0,s.queue[0][0]);continue;}
   if(!r)continue;
   if(s.busy)consider(s.busy);
   else if(s.output+r.qty<=r.qty*20){
    if(!s.ingredients.length)consider(s.T-s.progress);
    else if(s.ingredients.every(([k,n])=>(s.input[k]||0)>=n))consider(1);
   }
   if(s.output)maySend(s,0,r.output);
  }
  return {n:Math.max(0,next-1),active};
 }
 function advanceQuiet(n,active){
  if(!Number.isSafeInteger(n)||n<1)throw Error('bad quiet jump');
  tick=nadd(tick,n);motionTick=nadd(motionTick,n);if(absoluteClocks)clockNow=motionTick;
  if(active.length){const span=BigInt(n);for(const f of active){
   if(f.lattice){f.service+=f.unit*span;for(const e of f.entries){e.phase+=e.increment*span;if(e.phase>=f.M)throw Error("quiet frozen crossing")}}
   else {const d=mul(D,q(n));f.service=add(f.service,d);for(const e of f.entries){e.phase=add(e.phase,mul(e.r,d));if(cmp(e.phase,U)>=0)throw Error("quiet frozen crossing")}}
  }}
  if(!unlimited)for(const k of items){const v=get(k);blockMin[k]=Math.min(blockMin[k]??Infinity,v);if(v<gates[k])lastLow[k]=tick;}
  for(const s of nodes){
   if(!absoluteClocks){
    for(const [k,v] of s.send)if(v)s.send.set(k,Math.max(0,v-n));
    for(const [k,v] of s.recv)if(v)s.recv.set(k,Math.max(0,v-n));
    s.fill=Math.max(0,s.fill-n);
   }
   if(s.busy)s.busy-=n;
   else if(s.m.recipe&&!s.ingredients.length&&s.output+s.m.recipe.qty<=s.m.recipe.qty*20)s.progress+=n;
   if(s.m.type==='电脑'&&s.queue.length)s.consumer+=n;
  }
  for(const e of movingEdges)for(let j=0;j<e.packets.length;j++){
   const h=e.packets[j],ahead=j?e.packets[j-1].pos-spacing:e.end;h.pos=Math.max(h.pos,Math.min(ahead,h.pos+n));
  }
 }
 function advance(limit,eventDriven=true){
  if(!eventDriven){step();return 1}
  const {n,active}=quietTicks(limit);
  if(n>1){advanceQuiet(n,active);return n}step();return 1;
 }
 // Cache only key order, not mutable values. This avoids localeCompare
 // and sorting the same small ingredient/port dictionaries at each sample.
 const orders=new WeakMap();
 function ordered(o,keep){const keys=Object.keys(o);let x=orders.get(o);if(!x||x.length!==keys.length||x.some(k=>!Object.hasOwn(o,k))){x=keys.sort((a,b)=>a.localeCompare(b));orders.set(o,x)}
  const out=[];for(const k of x)if(keep(o[k]))out.push([k,o[k]]);return out}
 const positive=o=>ordered(o,v=>v!==0);
 const nonempty=o=>ordered(o,v=>v.length);
 function controlKey(){return JSON.stringify([nodes.map(s=>[positive(s.input),positive(s.ports),nonempty(s.fifo),nonempty(s.ingredient),s.output,s.queue,s.rr,absoluteClocks?Array.from(s.send.values(),remainingClock):[...s.send.values()],absoluteClocks?Array.from(s.recv.values(),remainingClock):[...s.recv.values()],remainingClock(s.fill),s.busy,s.progress,s.consumer]),edges.map(packetState),frozen.map(f=>f.entries.map(e=>phaseText(f,e)))])}
 function snapshot(control=controlKey()){
  const counters=counterValues.slice();let materialized;
  // Counter indices are append-only, so the copied vector is immutable and
  // can be expanded to the historical public witness format on demand.
  return {tick,control,stock:{...stock},get count(){return materialized??=counterObject(counters)},service:frozen.length?Object.fromEntries(frozen.map(f=>[f.id,serviceText(f)])):{}};
 }
 function key(control=controlKey()){return control+'|'+JSON.stringify(unlimited?[]:items.map(k=>get(k)<gates[k]?get(k):'high'))+(boundary?'|phase:'+(tick%boundary.period):'')}
 if(initialControl){
  const [ns,es,fs]=JSON.parse(initialControl);
  if(ns.length!==nodes.length||es.length!==edges.length||fs.length!==frozen.length)throw Error('boundary snapshot mismatch');
  for(let i=0;i<nodes.length;i++){
   const s=nodes[i],a=ns[i];
   s.input=Object.assign(Object.create(null),Object.fromEntries(a[0]));s.ports=Object.assign(Object.create(null),Object.fromEntries(a[1]));
   s.fifo=Object.assign(Object.create(null),Object.fromEntries(a[2]));s.ingredient=Object.assign(Object.create(null),Object.fromEntries(a[3]));
   [s.output,s.queue,s.rr]=a.slice(4,7);[...s.send.keys()].forEach((k,j)=>s.send.set(k,a[7][j]));[...s.recv.keys()].forEach((k,j)=>s.recv.set(k,a[8][j]));
   [s.fill,s.busy,s.progress,s.consumer]=a.slice(9,13);
  }
  for(let i=0;i<edges.length;i++){
   const e=edges[i],ps=es[i];
   for(let j=0;j<ps.length;j++){const pos=ps[j][1];if(!Number.isSafeInteger(pos)||pos<0||pos>e.end||j>0&&ps[j-1][1]-pos<spacing)throw Error('invalid belt snapshot')}
   e.packets=ps.map(([k,pos])=>e.lazy?{k,sent:motionTick-pos}:{k,pos});
  }
  for(let i=0;i<frozen.length;i++)for(let j=0;j<frozen[i].entries.length;j++){
   const f=frozen[i],e=f.entries[j];
   if(f.lattice){const n=exactUnits(fs[i][j],f.M,1n);if(n<0n||n>=f.M||e.neg&&n%e.p!==0n)throw Error('invalid frozen phase lattice');e.phase=n;}
   else {const n=q(fs[i][j]);if(cmp(n,Z)<0||cmp(n,U)>=0)throw Error('invalid frozen phase');e.phase=n;}
  }
 }
 function replayPeriod(a,b,{eventDriven=false,recordDeposits=false,recordOutputGuards=false}={}){
  const period=b.tick-a.tick;
  if(!Number.isSafeInteger(period)||period<1)throw Error('invalid replay period');
  const rotated=boundary?{...boundary,frames:Object.fromEntries(Object.entries(boundary.frames).map(([t,v])=>[(Number(t)-a.tick%boundary.period+boundary.period)%boundary.period,v]))}:null;
  const replay=iterationCreateKernel(spec,A,{initialStock:a.stock,initialControl:a.control,boundary:rotated,captureDeposits:recordDeposits,captureGuards:true,captureOutputGuards:recordOutputGuards,frozenLattice,lazyBelts,absoluteClocks});
  for(let i=0;i<period;)i+=replay.advance(period-i,eventDriven);
  const end=replay.snapshot();
  const equal=(x,y)=>[...new Set([...Object.keys(x),...Object.keys(y)])].every(k=>(x[k]||0)===(y[k]||0));
  const diff=(x,y)=>Object.fromEntries([...new Set([...Object.keys(x),...Object.keys(y)])].map(k=>[k,(y[k]||0)-(x[k]||0)]));
  if(end.control!==b.control||!equal(diff(a.count,b.count),end.count)||!equal(end.stock,b.stock))throw Error('period replay mismatch');
  for(const [id,v] of Object.entries(end.service))if(cmp(q(v),sub(q(b.service[id]),q(a.service[id])))!==0)throw Error('period service replay mismatch');
  return {bounds:replay.guardBounds(),outputBounds:replay.outputBounds(),minimum:replay.takeMin(),lastLow:replay.lastLow,frames:recordDeposits?replay.recordedCalendar():undefined};
 }
 function recordedCalendar(){return Object.fromEntries([...depositLog].map(([t,v])=>[t-1,v]))}
 function calendar(a,b){
  if(boundary||unlimited)throw Error('actual calendar only');
  const replay=replayPeriod(a,b,{eventDriven:true,recordDeposits:true});
  return {period:b.tick-a.tick,frames:replay.frames,initialStock:a.stock,initialControl:a.control};
 }

 function rates(a,b){const duration=q(String(b.tick-a.tick)),values={};
  for(const k of new Set([...Object.keys(a.count),...Object.keys(b.count)]))values[k]=txt(div(mul(q((b.count[k]||0)-(a.count[k]||0)),q(P)),duration));
  for(const f of frozen)values['duty:'+f.id]=txt(div(mul(sub(q(b.service[f.id]),q(a.service[f.id])),q(P)),duration));
  return values;
 }
 function takeMin(){const m=blockMin;blockMin=Object.create(null);return m}
 // A proven loop may be longer than the safe integer representation.
 // Bound the optional jump before it changes anything. A smaller jump
 // is still exactly the same translation; zero means continue stepping.
 function safeJumpCopies(a,b,copies,outputDrift=null){
  const M=BigInt(Number.MAX_SAFE_INTEGER);
  let n=BigInt(copies);
  const cap=(x)=>{if(x<n)n=x};
  const change=(current,previous,next)=>{
   for(const k of new Set([...Object.keys(previous),...Object.keys(next)])){
    const d=BigInt(next[k]||0)-BigInt(previous[k]||0),v=BigInt(current[k]||0);
    if(!d)continue;
    const abs=d<0n?-d:d;
    cap(M/abs);cap((d>0n?M-v:M+v)/abs);
   }
  };
  const period=BigInt(b.tick)-BigInt(a.tick);
  if(period<=0n)return 0;
  cap((M-BigInt(tick))/period);
  change(stock,a.stock,b.stock);change(counterObject(counterValues),a.count,b.count);
  if(outputDrift)for(const [id,d] of Object.entries(outputDrift)){
   if(!d)continue;const node=by.get(id),v=BigInt(node.output),abs=BigInt(Math.abs(d));
   cap((d>0?BigInt(node.m.recipe.qty)*20n-v:v)/abs);
  }
  return n>0n?Number(n):0;
 }
 function jump(a,b,copies,outputDrift=null){
  const d=b.tick-a.tick,shift=d*copies;if(!Number.isSafeInteger(shift)||!Number.isSafeInteger(tick+shift))throw Error('jump time exceeds exact integer range');
  const updates=(target,prev,now)=>{
   const staged={};for(const k of new Set([...Object.keys(prev),...Object.keys(now)])){
    const change=((now[k]||0)-(prev[k]||0))*copies;
    if(!Number.isSafeInteger(change))throw Error('jump count exceeds exact integer range');
    staged[k]=nadd(target[k]||0,change);
   }return staged;
  };
  const nextStock=updates(stock,a.stock,b.stock),nextCount=updates(counterObject(counterValues),a.count,b.count);
  Object.assign(stock,nextStock);for(const [k,v] of Object.entries(nextCount))setCounter(k,v);
  for(const f of frozen){const d=sub(q(b.service[f.id]),q(a.service[f.id]));if(f.lattice)f.service+=exactUnits(d,f.M,f.L)*BigInt(copies);else f.service=add(f.service,mul(d,q(copies)));}
  if(outputDrift)for(const [id,d] of Object.entries(outputDrift)){const s=by.get(id),n=nadd(s.output,d*copies);if(n<0||n>s.m.recipe.qty*20)throw Error("output translation exceeds capacity");s.output=n;}
  tick+=shift;
  for(const k of items)if((lastLow[k]||0)>a.tick)lastLow[k]=tick;
  blockMin=Object.create(null);
 }
 // Only recipe output integers are relaxed. All other state, including
 // queue order, clock, stock class and external calendar phase, stays exact.
 function relaxed(control){
  const x=JSON.parse(control),outputs={};
  for(let i=0;i<nodes.length;i++)if(nodes[i].m.recipe){outputs[nodes[i].m.id]=x[0][i][4];x[0][i][4]=0;}
  return {key:key(JSON.stringify(x)),outputs};
 }
 function outputCopies(a,b,proof){
  const stockBound=unlimited?{infinite:true,copies:0}:iterationTranslationBounds(a,b,proof.bounds,items);
  let copies=stockBound.infinite?Infinity:stockBound.copies;
  const drift={};
  for(const s of nodes)if(s.m.recipe){
   const id=s.m.id,d=b.outputs[id]-a.outputs[id];if(!d)continue;
   drift[id]=d;const g=proof.outputBounds[id]||{},n=b.outputs[id];
   copies=Math.min(copies,Math.floor(d>0?Math.min(g.upper??Infinity,s.m.recipe.qty*20-n)/d:Math.min(g.lower??Infinity,n)/-d));
  }
  return {copies:Number.isSafeInteger(copies)?Math.max(0,copies):0,drift};
 }
 return {step,advance,key,snapshot,rates,relaxed,outputCopies,outputBounds:()=>outputBounds,lazyBeltCount:edges.filter(e=>e.lazy).length,frozenLatticeCount:frozen.filter(f=>f.lattice).length,items,gates,lastLow,unlimited,takeMin,jump,safeJumpCopies,calendar,recordedCalendar,replayPeriod,guardBounds:()=>guardBounds,physicalGuards:!frozen.length,get tick(){return tick}};
}
function* iterationOrbitSearch(kernel,{maxTicks=216000,ms=30000,checkpointEvery=20,maxCheckpoints=256,sparseStride=16,accelerate=true,captureBoundary=false,eventDriven=true,symbolicGuards=true,verifyPeriod=false,includeCertificate=false,outputAcceleration=false}={}){
 const relaxedSeen=new Map();let outputReplayTicks=0,outputJumps=0,outputSkippedTicks=0;
 const seen=new Map(),sparse=new Map(),started=performance.now(),minima=new Map(),sparseMinima=new Map();let deadline=started+ms;let skippedTicks=0,jumps=0,quietSkipped=0,stepCalls=0,peakCheckpoints=0,symbolicAccepts=0,symbolicJumps=0,symbolicReplayTicks=0;
 if(!Number.isSafeInteger(maxTicks)||maxTicks<0||!Number.isSafeInteger(checkpointEvery)||checkpointEvery<1||!Number.isSafeInteger(maxCheckpoints)||maxCheckpoints<0)throw Error('bad budget');
 if(!Number.isSafeInteger(sparseStride)||sparseStride<1)throw Error('bad sparse stride');
 const sparseLimit=maxCheckpoints>=16?Math.floor(maxCheckpoints/2):0,recentLimit=maxCheckpoints-sparseLimit;
 let anchor=null,anchorKey=null,anchorMin={},power=1,span=0,block=0;
 const merge=(to,from)=>{for(const [k,v] of Object.entries(from))to[k]=Math.min(to[k]??Infinity,v);return to};
 const reset=()=>{relaxedSeen.clear();seen.clear();sparse.clear();minima.clear();sparseMinima.clear();anchor=null;anchorKey=null;anchorMin={};power=1;span=0;block=0};
 for(let i=0;;){
  if(i%checkpointEvery===0){
   let now=kernel.snapshot(),key=kernel.key(now.control);const m=kernel.takeMin();
   minima.set(block,m);merge(anchorMin,m);
   if(sparseLimit&&block>0){const b=Math.floor((block-1)/sparseStride);sparseMinima.set(b,merge(sparseMinima.get(b)||{},m))}
   const recent=seen.get(key),distant=sparse.get(key),olds=[recent,distant,anchorKey===key?anchor:null].filter((v,j,a)=>v&&a.findIndex(x=>x?.block===v.block)===j);
   
   for(const old of olds){
    let c=iterationCheckStockCandidate(old,now,kernel.lastLow,kernel.items,{unlimited:kernel.unlimited}),symbolic=null,replayed=null;
    // Bounded exact replay traces the actual branch inequalities, including
    // frozen shared service and reservation. Search overhead is bounded.
    if(!c.accepted&&symbolicGuards&&!kernel.unlimited&&now.tick-old.tick<=4000&&symbolicReplayTicks+now.tick-old.tick<=20000){
     symbolicReplayTicks+=now.tick-old.tick;
     replayed=kernel.replayPeriod(old,now);
     symbolic=iterationTranslationBounds(old,now,replayed.bounds,kernel.items);
     if(symbolic.infinite){c={accepted:true,periodTicks:now.tick-old.tick};symbolicAccepts++}
    }
    if(c.accepted){
     const drift=Object.fromEntries([...new Set([...Object.keys(now.stock),...Object.keys(old.stock)])].map(k=>[k,(now.stock[k]||0)-(old.stock[k]||0)]));
     if(verifyPeriod){
      const proof=replayed??kernel.replayPeriod(old,now);
      const checked=iterationVerifyTranslation(old,now,proof,kernel.items,{unlimited:kernel.unlimited,physical:kernel.physicalGuards,gates:kernel.gates});
      if(!checked)throw Error('period guard verification failed');
     }
     const boundary=captureBoundary?kernel.calendar(old,now):null;
     return {status:'exact-model-period',certified:false,method:'integer-rational-state-with-stock-guard',prefixTicks:old.tick,periodTicks:c.periodTicks,stockDrift:drift,values:kernel.rates(old,now),elapsedMs:Math.round(performance.now()-started),checkpoints:seen.size,peakCheckpoints,skippedTicks,jumps,executedTicks:i,quietSkipped,stepCalls,symbolicAccepts,symbolicJumps,symbolicReplayTicks,outputReplayTicks,outputJumps,outputSkippedTicks,...(includeCertificate?{certificate:{start:old,end:now}}:{}),...(captureBoundary?{boundary}:{})};
    }
    if(accelerate&&!kernel.unlimited){
     const min=old===anchor?anchorMin:{};
     if(old===distant&&old!==recent&&old!==anchor){
      for(let j=old.block/sparseStride;j<=Math.floor((block-1)/sparseStride);j++)merge(min,sparseMinima.get(j)||{});
     }else if(old!==anchor)for(let j=old.block+1;j<=block;j++)merge(min,minima.get(j)||{});
     const coarse=iterationPlanStockJump(old,now,min,kernel.gates,kernel.items),copies=kernel.safeJumpCopies(old,now,Math.max(coarse,symbolic?.copies??0));if(copies>coarse)symbolicJumps++;
     if(copies){kernel.jump(old,now,copies);skippedTicks+=(now.tick-old.tick)*copies;jumps++;reset();now=kernel.snapshot(now.control);key=kernel.key(now.control);break;}
    }
   }
   if(accelerate&&outputAcceleration&&maxCheckpoints>=16&&block%10===0){
    const r=kernel.relaxed(now.control),old=relaxedSeen.get(r.key);
    if(old&&old.control!==now.control){
     const period=now.tick-old.tick;
     if(period>0&&period<=30000&&outputReplayTicks+period<=90000&&performance.now()<deadline-50){
      // Two repeated projected states propose a translation; a complete
      // replay certifies the branch inequalities, not a guessed trend.
      const end=Object.assign(now,{outputs:r.outputs});
      const proof=kernel.replayPeriod(old,end,{recordOutputGuards:true});
      outputReplayTicks+=period;
      const x=kernel.outputCopies(old,end,proof);
      if(x.copies>0){
       kernel.jump(old,end,x.copies,x.drift);const n=period*x.copies;
       skippedTicks+=n;outputSkippedTicks+=n;outputJumps++;jumps++;reset();
       now=kernel.snapshot();key=kernel.key(now.control);
      }
     }
    }
    const current=kernel.relaxed(now.control);
    relaxedSeen.delete(current.key);relaxedSeen.set(current.key,Object.assign(now,{outputs:current.outputs}));
    if(relaxedSeen.size>Math.min(160,maxCheckpoints))relaxedSeen.delete(relaxedSeen.keys().next().value);
   }
   if(!anchor||span>=power){if(anchor)power=Math.min(Number.MAX_SAFE_INTEGER,power*2);anchor=Object.assign(now,{block});anchorKey=key;anchorMin={};span=0}
   if(recentLimit){
    if(seen.has(key))seen.delete(key);seen.set(key,Object.assign(now,{block}));
    if(seen.size>recentLimit)seen.delete(seen.keys().next().value);
   }
   if(sparseLimit&&block%sparseStride===0){
    if(sparse.has(key))sparse.delete(key);sparse.set(key,Object.assign(now,{block}));
    if(sparse.size>sparseLimit)sparse.delete(sparse.keys().next().value);
   }
   // Only retain interval minima still needed by the bounded recent cache.
   const first=seen.values().next().value?.block??block;
   for(const j of minima.keys()){if(j>first)break;minima.delete(j)}
   const sparseFirst=(sparse.values().next().value?.block??block)/sparseStride;
   for(const j of sparseMinima.keys()){if(j>=sparseFirst)break;sparseMinima.delete(j)}
   peakCheckpoints=Math.max(peakCheckpoints,seen.size+sparse.size+(anchor?1:0));block++;span++;
  }
  while(i>=maxTicks||(i%checkpointEvery===0&&performance.now()>deadline)){
   const update=yield {status:'budget',reason:i>=maxTicks?'ticks':'time',tick:kernel.tick,executedTicks:i,peakCheckpoints,quietSkipped,stepCalls,skippedTicks,jumps};
   if(!update)return;
   if(!Number.isSafeInteger(update.maxTicks)||update.maxTicks<i||!Number.isFinite(update.ms)||update.ms<0)throw Error('bad resumed budget');
   maxTicks=update.maxTicks;deadline=performance.now()+update.ms;
  }
  const limit=Math.min(maxTicks-i,checkpointEvery-i%checkpointEvery);
  const n=kernel.advance(limit,eventDriven);if(n>1)quietSkipped+=n;else stepCalls++;i+=n;
 }
}
function iterationFindOrbit(kernel,options={}){
 const search=iterationOrbitSearch(kernel,options),first=search.next();
 if(!first.done)search.return();
 return first.value;
}

// Standalone witness verifier: no search cache, no event skipping, no
// precomputed rate table. Reachability of the start remains a separate claim.
function iterationVerifyCertificate(spec,A,witness,claimed,options={}){
 try{
  const a=witness.start,b=witness.end;
  if(a.control!==b.control||!Number.isSafeInteger(a.tick)||a.tick<0||!Number.isSafeInteger(b.tick)||b.tick<=a.tick)return false;
  if(options.boundary&&(b.tick-a.tick)%options.boundary.period!==0)return false;
  const k=iterationCreateKernel(spec,A,options),r=k.replayPeriod(a,b);
  if(!iterationVerifyTranslation(a,b,r,k.items,{unlimited:k.unlimited,physical:k.physicalGuards,gates:k.gates}))return false;
  const rates=k.rates(a,b);
  return Object.keys({...rates,...claimed}).every(x=>(rates[x]??'0')===(claimed[x]??'0'));
 }catch{return false}
}

// Bounded start-reachability check, deliberately no search/jumps.
// "budget" is not a failed certificate and never implies nonexistence.
function iterationVerifyReachableCertificate(spec,A,witness,claimed,{maxPrefixTicks=216000,...options}={}){
 try{
  const a=witness.start;
  if(!Number.isSafeInteger(a.tick)||a.tick<0)return {status:'invalid'};
  if(a.tick>maxPrefixTicks)return {status:'budget',reason:'prefix-ticks'};
  const k=iterationCreateKernel(spec,A,options);
  for(let i=0;i<a.tick;i++)k.step();
  const x=k.snapshot();
  const same=(a,b)=>Object.keys({...a,...b}).every(k=>(a[k]??0)===(b[k]??0));
  if(x.control!==a.control||!same(x.stock,a.stock)||!same(x.count,a.count)||!same(x.service,a.service))return {status:'invalid',reason:'unreachable-start'};
  return {status:iterationVerifyCertificate(spec,A,witness,claimed,options)?'verified':'invalid'};
 }catch{return {status:'invalid'}}
}
