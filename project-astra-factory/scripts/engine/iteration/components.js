'use strict';
// Conservative independence partition. Physical links and ALL inventory
// guards connect components. Unguarded deposits may be added independently.
// Possible material propagation deliberately overapproximates FIFO choices.
function iterationPartitionSpec(spec,{fixedDeposits=false,free=[]}={}){
 const nodes=new Map(spec.machines.map((m,i)=>[m.id,{m,i}]));
 const n=spec.machines.length,F=spec.frozen||[],parent=Array.from({length:n+F.length},(_,i)=>i);
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
 const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a};
 if(nodes.size!==n)throw Error('duplicate machine');
 const lines=spec.routes.flatMap(r=>{
  const a=nodes.get(r.from),b=nodes.get(r.to);
  // No source means no dispatch from the empty initial state. The
  // result assembler publishes the disconnected route as exact zero.
  if(!a)return [];
  const port=a.m.outPorts.find(p=>p.index===r.fromPort);
  const connected=!!(b&&port&&r.length>0&&b.m.inputPriority.includes(r.toPort));
  if(connected)join(a.i,b.i);
  return [{r,a,b,port,connected,possible:new Set(),accepted:new Set(r.accepted)}];
 });
 const guarded=new Map(),freeSet=new Set(free);
 function guard(k,i){if(freeSet.has(k))return;if(guarded.has(k))join(guarded.get(k),i);else guarded.set(k,i)}
 if(!spec.unlimitedWarehouse){
  for(const {m,i} of nodes.values())if(m.type==='仓出'&&m.item)guard(m.item,i);
  for(let i=0;i<F.length;i++)for(const [k,v] of Object.entries(F[i].rates))if(steadyRegionQ(v).n<0n)guard(k,n+i);
  // Physical connected components still need stock edges. A deposited
  // item with no reader cannot change any transition in another component.
  if(!fixedDeposits){
  const ins=new Map(spec.machines.map(m=>[m.id,new Set()]));
  let changed=true;
  while(changed){
   changed=false;
   for(const e of lines){
    if(!e.connected)continue;
    const m=e.a.m,t=m.type;
    const src=t==='仓出'?[m.item]:m.recipe?[m.recipe.output]:t==='分流'||t==='汇流'?[...ins.get(m.id)]:[];
    for(const k of src){
     if(!k||e.port.filter&&e.port.filter!=='任意'&&e.port.filter!==k)continue;
     if(!e.possible.has(k)){e.possible.add(k);changed=true}
     if(e.accepted.has(k)&&!ins.get(e.b.m.id).has(k)){ins.get(e.b.m.id).add(k);changed=true}
    }
   }
  }
  for(const e of lines)if(e.connected&&e.b.m.type==='仓入')for(const k of e.possible)if(e.accepted.has(k)&&guarded.has(k))join(e.b.i,guarded.get(k));
  for(let i=0;i<F.length;i++)for(const [k,v] of Object.entries(F[i].rates))if(steadyRegionQ(v).n>0n&&guarded.has(k))join(n+i,guarded.get(k));
  }
 }
 const groups=new Map();
 const group=i=>{const r=root(i);if(!groups.has(r))groups.set(r,{...spec,machines:[],routes:[],priority:[],frozen:[]});return groups.get(r)};
 for(const {m,i} of nodes.values())group(i).machines.push(m);
 for(const e of lines){
  // An invalid/disconnected route may name a target in a different group.
  // The local compiler must see it as disconnected, not accidentally connect.
  group(e.a.i).routes.push(e.connected?e.r:{...e.r,to:null});
 }
 for(let i=0;i<F.length;i++)group(n+i).frozen.push(F[i]);
 for(const id of spec.priority)group(nodes.get(id).i).priority.push(id);
 return [...groups.values()];
}
// Frozen-only independent full-service components can be integrated directly.
// The phase of a write-only source cannot affect any guarded reader.
function iterationIndependentFrozenRates(spec,A){
 if(spec.machines.length||!spec.frozen.length)return null;
 if(!spec.unlimitedWarehouse&&spec.frozen.some(f=>Object.values(f.rates).some(v=>A.q(v).n<0n)))return null;
 const values={};
 const add=(k,v)=>values[k]=A.txt(A.add(A.q(values[k]||'0'),v));
 for(const f of spec.frozen){
  values['duty:'+f.id]='1';
  for(const [k,v] of Object.entries(f.rates)){
   const x=A.q(v),negative=x.n<0n,r=negative?A.sub(A.Z,x):x;
   add((negative?'outflow:':'inflow:')+k,r);add((negative?'frozenOut:':'frozenIn:')+k,r);
  }
 }
 return {status:'exact-model-analytic',certified:false,values,method:'independent-frozen-full-service',elapsedMs:0};
}
// Frozen-only empty-start components: prove either permanent inactivity
// or eventual full service. The two proofs also determine fixed-calendar
// pressure without materializing a joint rational phase period.
function iterationFrozenStockProof(spec,A){
 if(spec.initial!=='empty'||spec.unlimitedWarehouse||spec.machines.length||!spec.frozen.length)return null;
 const actors=spec.frozen.map(f=>({id:f.id,ins:[],outs:[],missing:0})),readers=new Map(),demand=new Map(),supply=new Map();
 for(let i=0;i<actors.length;i++){
  const a=actors[i];
  for(const [k,v] of Object.entries(spec.frozen[i].rates)){
   const r=A.q(v);if(r.n===0n)continue;
   if(r.n<0n){
    const d=A.sub(A.Z,r);a.ins.push([k,d]);demand.set(k,A.add(demand.get(k)??A.Z,d));
    if(!readers.has(k))readers.set(k,[]);readers.get(k).push(a);
   }else a.outs.push([k,r]);
  }
  a.missing=a.ins.length;
 }
 const queue=actors.filter(a=>!a.missing);
 const pressureDemand=Object.fromEntries([...demand.keys()].map(k=>[k,'0']));
 if(!queue.length){
  // No actor can execute the first service tick: every actor needs at
  // least one absent integer input. Fixed actual credits are all zero.
  // Lifting one stock gate enables exactly the actors consuming only it.
  for(const a of actors)if(a.ins.length===1){
   const [k,d]=a.ins[0];pressureDemand[k]=A.txt(A.add(A.q(pressureDemand[k]),d));
  }
  return {status:'exact-model-analytic',certified:false,method:'frozen-empty-no-source',values:Object.fromEntries(actors.map(a=>['duty:'+a.id,'0'])),pressureDemand,elapsedMs:0};
 }
 // A certified producer runs at full service after some finite time.
 // If certified supply of k strictly exceeds ALL nominal debits of k,
 // integer stock grows without bound despite phase/reservation effects.
 // Each reader can then use its k input unconditionally eventually.
 const ready=new Set();
 for(let i=0;i<queue.length;i++)for(const [k,r] of queue[i].outs){
  if(!readers.has(k)||ready.has(k))continue;
  const n=A.add(supply.get(k)??A.Z,r);supply.set(k,n);
  if(A.cmp(n,demand.get(k))<=0)continue;
  ready.add(k);
  for(const a of readers.get(k))if(--a.missing===0)queue.push(a);
 }
 if(queue.length!==actors.length)return null;
 const full=iterationIndependentFrozenRates({...spec,unlimitedWarehouse:true},A);
 for(const [k,d] of demand)pressureDemand[k]=A.txt(d);
 return {...full,method:'frozen-strict-surplus',pressureDemand};
}
// Exact renewal / max-plus special case of the new transition model:
 // independent inputless batch source -> one belt -> unconditional warehouse sink.
 // No warehouse reads, no competing port, no filter mismatch. The source's
 // output queue has capacity 20 batches and only produces if a whole batch fits.
function iterationAutonomousBatchDescriptor(spec,A){
 if(spec.frozen.length||spec.machines.length!==2||spec.routes.length!==1||spec.priority.length)return null;
 const r=spec.routes[0],a=spec.machines.find(m=>m.id===r.from),b=spec.machines.find(m=>m.id===r.to),rec=a?.recipe;
 if(!rec||b?.type!=='仓入'||['仓入','仓出','分流','汇流','电脑'].includes(a.type)||Object.keys(rec.inputs||{}).length||b.recipe)return null;
 const port=a.outPorts.find(p=>p.index===0);
 if(!port||r.fromPort!==0||!b.inputPriority.includes(r.toPort)||!Number.isSafeInteger(r.length)||r.length<=0||r.length>Number.MAX_SAFE_INTEGER/10||!r.accepted.includes(rec.output)||port.filter&&port.filter!=='任意'&&port.filter!==rec.output)return null;
 if(!Number.isSafeInteger(rec.qty)||rec.qty<1||rec.qty>Number.MAX_SAFE_INTEGER/20)return null;
 const ticks=A.mul(A.q(rec.seconds),A.q(20));
 if(ticks.d!==1n||ticks.n<=0n||ticks.n>BigInt(Number.MAX_SAFE_INTEGER))return null;
 return {a,b,r,rec,T:ticks.n,Q:BigInt(rec.qty),D:10n*BigInt(r.length)};
}
function iterationAutonomousBatchRates(spec,A){
 const d=iterationAutonomousBatchDescriptor(spec,A);if(!d)return null;
 const {a,b,r,rec}=d;
 const nominal=A.div(A.q(rec.qty),A.q(rec.seconds)),rate=A.cmp(nominal,A.U)<=0?nominal:A.U;
 const R=A.txt(rate),C=A.txt(A.div(rate,A.q(rec.qty))),k=rec.output;
 return {status:'exact-model-analytic',certified:false,method:'autonomous-batch-warehouse-renewal',elapsedMs:0,values:{
  ['cycle:'+a.id]:C,['crafts:'+k]:R,
  ['routeTotal:'+r.id]:R,['flow:'+r.id+'|'+k]:R,
  ['machineTotal:'+a.id+'|out']:R,['machineMaterial:'+a.id+'|out|'+k]:R,
  ['machineTotal:'+b.id+'|in']:R,['machineMaterial:'+b.id+'|in|'+k]:R,
  ['inflow:'+k]:R,['localIn:'+k]:R
 }};
}
// Exact arrivals from empty start, including transport delay.
 // The descriptor excludes every source of backpressure except the
 // source's own batch buffer and the one-second output cooldown.
function iterationAutonomousBatchCalendar(spec,A){
 const d=iterationAutonomousBatchDescriptor(spec,A);if(!d)return null;
 const {T,Q,D,rec}=d,P=20n,first=T+D,saturated=T<=Q*P;
 const tick=x=>{if(typeof x==='number'&&!Number.isSafeInteger(x))throw Error('unsafe time');const n=BigInt(x);if(n<0n)throw Error('negative time');return n};
 const min=(x,y)=>x<y?x:y;
 function cumulative(t){
  t=tick(t);if(t<first)return 0n;
  const v=t-first;
  return saturated?v/P+1n:(v/T)*Q+min(Q,(v%T)/P+1n);
 }
 function next(t){
  const n=cumulative(t);
  return first+(saturated?n*P:(n/Q)*T+(n%Q)*P);
 }
 return {item:rec.output,first,period:saturated?P:T,cumulative,next,between:(lo,hi)=>{if(tick(hi)<tick(lo))throw Error('reversed time');return cumulative(hi)-cumulative(lo)}};
}
// Empty-start invariant: no autonomous producer, warehouse reader, or
// frozen actor means no first material event can occur, even in a cycle.
// A reachable source or malformed recipe is NOT covered by this proof.
function iterationSourceFreeRates(spec){
 if(spec.initial!=='empty'||spec.frozen.length||spec.machines.some(m=>m.type==='仓出'&&m.item))return null;
 for(const m of spec.machines)if(m.recipe){const ns=Object.values(m.recipe.inputs||{});if(!ns.length||!ns.every(n=>Number.isSafeInteger(n)&&n>0))return null;}
 return {status:'exact-model-analytic',certified:false,method:'empty-start-no-source',elapsedMs:0,values:{}};
}
// A finite-buffer acyclic component without a warehouse/consumer sink
// has only finitely many transfers and crafts, including autonomous sources.
// Reverse topological induction: a terminal can only store finitely many
// items/batches; its predecessors have bounded storage and finite dispatches.
// A physical cycle or an inventory actor is deliberately excluded.
function iterationSinklessDagRates(spec){
 if(spec.initial!=='empty'||spec.frozen.length||spec.machines.some(m=>m.type==='仓出'||m.type==='仓入'||m.type==='电脑'))return null;
 const nodes=new Map(spec.machines.map(m=>[m.id,m])),degree=new Map(spec.machines.map(m=>[m.id,0])),adj=new Map(spec.machines.map(m=>[m.id,[]]));
 for(const m of spec.machines){
  if(m.recipe&&(!Number.isSafeInteger(m.recipe.qty)||m.recipe.qty<=0||Object.values(m.recipe.inputs||{}).some(n=>!Number.isSafeInteger(n)||n<=0)))return null;
 }
 for(const r of spec.routes){
  const a=nodes.get(r.from),b=nodes.get(r.to);
  if(!a||!b||!r.length||!a.outPorts.some(p=>p.index===r.fromPort)||!b.inputPriority.includes(r.toPort))continue;
  adj.get(a.id).push(b.id);degree.set(b.id,degree.get(b.id)+1);
 }
 const queue=[...degree].filter(([,n])=>n===0).map(([id])=>id);
 for(let i=0;i<queue.length;i++)for(const id of adj.get(queue[i])){const n=degree.get(id)-1;degree.set(id,n);if(!n)queue.push(id)}
 if(queue.length!==nodes.size)return null;
 return {status:'exact-model-analytic',certified:false,method:'finite-buffer-sinkless-dag',elapsedMs:0,values:{}};
}
function iterationAnalyticRates(spec,A,options={}){
 return iterationIndependentFrozenRates(spec,A)??(options.analyticFrozen!==false?iterationFrozenStockProof(spec,A):null)??(options.analyticBatch!==false?iterationAutonomousBatchRates(spec,A):null)??(options.structuralZero!==false?iterationSourceFreeRates(spec)??iterationSinklessDagRates(spec):null)??(options.analyticTree!==false?iterationForestRates(spec,A,options):null);
}
// An optional proof must never veto the exact transition solver. Retain
// the diagnostic so unexpected analytic failures are not silently hidden.
function iterationAttemptAnalytic(part,A,options){
 try{return {result:iterationAnalyticRates(part,A,options)}}catch(error){return {result:null,analyticError:String(error?.message??error)}}
}
function iterationComponentError(error){return {status:'error',reason:String(error?.message??error)}}
// Per-job memoization of successful exact results only. The same layout is
// compiled twice in the quick/background passes. No global/AST rate cache.
function iterationMemoOrbit(part,A,options,kind,initial={},remaining=options.ms){
 const cache=options.orbitCache,key=JSON.stringify([kind,part.machines.map(m=>m.id),part.routes.map(r=>r.id),part.frozen.map(f=>f.id)]);
 const saved=cache?.get(key);
 if(saved?.result){cache.delete(key);return {...saved.result,reused:true}}
 if(remaining<=0)return {status:'budget',reason:'global-time'};
 let search;
 try{
  search=saved?.search??iterationOrbitSearch(iterationCreateKernel(part,A,initial),{...options,ms:remaining});
  const next=saved?.search?search.next({ms:remaining,maxTicks:options.maxTicks??216000}):search.next();
  const r=next.value;
  if(options.rememberOrbits&&cache){
   const paused=[...cache.values()].filter(x=>x.search).length;
   if(next.done)cache.set(key,{result:r});
   else if(saved?.search||paused<4)cache.set(key,{search});
   else search.return();
  }else {cache?.delete(key);if(!next.done)search.return();}
  return {...r,resumed:!!saved?.search};
 }catch(error){
  cache?.delete(key);
  try{search?.return()}catch{}
  return iterationComponentError(error);
 }
}
// Cross-job cache identities include the entire semantic component, not
// all factory materials. A new warehouse reader/writer changes the group
// itself whenever there is an actual dependency. Internal recipe items
// alone never couple two components.
function iterationComponentKey(part,kind){
 const topology=iterationTopologyMaterialSets(part);
 const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 return canonical([kind,part.initial,part.unlimitedWarehouse,part.machines,part.routes.map(r=>({...r,accepted:r.accepted.filter(k=>topology.routes.get(r.id)?.has(k)).sort()})),part.priority,part.frozen.map(f=>({id:f.id,rates:f.rates}))]);
}
function iterationReuseStats(r){
 const x={...r,reused:true,componentCacheHit:true,resumed:false,elapsedMs:0};
 for(const k of ['stepCalls','quietSkipped','skippedTicks','jumps','symbolicAccepts','symbolicJumps','symbolicReplayTicks','peakCheckpoints','executedTicks'])if(Object.hasOwn(x,k))x[k]=0;
 if(x.pressure)x.pressure=Object.fromEntries(Object.entries(x.pressure).map(([k,v])=>[k,iterationReuseStats(v)]));
 return x;
}
const iterationComponentSizes=new WeakMap();
function iterationRememberComponent(cache,key,value){
 if(!cache||!key)return;
 const limit=1024*1024,bytes=2*(key.length+JSON.stringify(value).length);
 if(bytes>limit)return;
 let meta=iterationComponentSizes.get(cache);
 if(!meta){
  meta={total:0,sizes:new Map()};
  for(const [k,v] of cache){const n=2*(k.length+JSON.stringify(v).length);meta.sizes.set(k,n);meta.total+=n}
  iterationComponentSizes.set(cache,meta);
 }
 meta.total-=meta.sizes.get(key)??0;cache.delete(key);
 cache.set(key,value);meta.sizes.set(key,bytes);meta.total+=bytes;
 while(meta.total>limit&&cache.size){const k=cache.keys().next().value;meta.total-=meta.sizes.get(k);meta.sizes.delete(k);cache.delete(k)}
}
function iterationTouchComponent(cache,key){
 const value=cache.get(key);cache.delete(key);cache.set(key,value);
}
function iterationSolveComponents(spec,A,options={}){
 const started=performance.now(),parts=iterationPartitionSpec(spec).sort((a,b)=>a.machines.length+a.routes.length+a.frozen.length-b.machines.length-b.routes.length-b.frozen.length),results=[],values={},ms=options.ms??30000;
 for(const part of parts){
  const key=options.componentMemo?iterationComponentKey(part,'unlimited'):null,cached=key&&options.componentMemo.get(key);
  const attempt=cached?{result:iterationReuseStats(cached)}:iterationAttemptAnalytic(part,A,options);let result=attempt.result;
  if(!result){
   const remaining=ms-(performance.now()-started);
   result=iterationMemoOrbit(part,A,options,'unlimited',{},remaining);
  }
  if(cached)iterationTouchComponent(options.componentMemo,key);
  else if(result.values)iterationRememberComponent(options.componentMemo,key,result);
  const possibleItems=iterationWarehouseBoundaryItems(part);
  results.push({machines:part.machines.map(m=>m.id),routes:part.routes.map(r=>r.id),frozen:part.frozen.map(f=>f.id),possibleItems,...result,...(attempt.analyticError?{analyticError:attempt.analyticError}:{})});
  if(result.values)for(const [k,v] of Object.entries(result.values))values[k]=A.txt(A.add(A.q(values[k]||'0'),A.q(v)));
 }
 const complete=results.every(r=>!!r.values);
 // A partial sum is not a complete observable: never publish a partial
 // aggregate as a solved factory. Individual component results remain.
 return {status:complete?'exact-model-components':'partial',certified:false,componentCount:parts.length,components:results,
  partialValues:values,...(complete?{values}:{}),elapsedMs:Math.round(performance.now()-started)};
}
