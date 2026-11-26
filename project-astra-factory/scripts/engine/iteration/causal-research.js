'use strict';
// Research-only graph of causal dependence, not the physical flow graph.
// Finite belt backpressure is bidirectional. Unlimited warehouse erases
// inventory dependencies. Shared readers are coupled through the stock node.
function iterationCausalScc(spec,A){
 const ids=new Map(),edges=[];
 function vertex(id){if(!ids.has(id)){ids.set(id,ids.size);edges.push(new Set())}return ids.get(id)}
 function link(a,b){edges[vertex(a)].add(vertex(b))}
 const machine=id=>'m:'+id,actor=id=>'f:'+id,stock=k=>'w:'+k;
 const nodes=new Map(spec.machines.map(m=>[m.id,m]));
 for(const m of spec.machines)vertex(machine(m.id));
 for(const f of spec.frozen||[])vertex(actor(f.id));
 const readers=new Set();
 if(!spec.unlimitedWarehouse){
  for(const m of spec.machines)if(m.type==='仓出'&&m.item){readers.add(m.item);link(stock(m.item),machine(m.id));link(machine(m.id),stock(m.item))}
  for(const f of spec.frozen||[])for(const [k,v] of Object.entries(f.rates))if(A.q(v).n<0n){readers.add(k);link(stock(k),actor(f.id));link(actor(f.id),stock(k))}
 }
 for(const r of spec.routes){
  const a=nodes.get(r.from),b=nodes.get(r.to);
  if(!a||!b||r.length<=0||!a.outPorts.some(p=>p.index===r.fromPort)||!b.inputPriority.includes(r.toPort))continue;
  link(machine(a.id),machine(b.id));link(machine(b.id),machine(a.id));
  // Accepted items overapproximate possible deposited items, so no actual
  // dependency can be lost. This may conservatively prevent a split.
  if(b.type==='仓入')for(const k of r.accepted)if(readers.has(k))link(machine(b.id),stock(k));
 }
 for(const f of spec.frozen||[])for(const [k,v] of Object.entries(f.rates))if(A.q(v).n>0n&&readers.has(k))link(actor(f.id),stock(k));
 return iterationScc([...ids.keys()],edges);
}
function iterationScc(names,edges){
 const n=names.length,idx=Array(n).fill(-1),low=[],on=new Set(),stack=[],components=[],owner=[];let serial=0;
 function dfs(v){
  idx[v]=low[v]=serial++;stack.push(v);on.add(v);
  for(const w of edges[v]){if(idx[w]===-1){dfs(w);low[v]=Math.min(low[v],low[w])}else if(on.has(w))low[v]=Math.min(low[v],idx[w])}
  if(low[v]===idx[v]){const c=[];let w;do{w=stack.pop();on.delete(w);owner[w]=components.length;c.push(names[w])}while(w!==v);components.push(c)}
 }
 for(let i=0;i<n;i++)if(idx[i]===-1)dfs(i);
 const dag=components.map(()=>new Set()),indeg=components.map(()=>0);
 for(let v=0;v<n;v++)for(const w of edges[v])if(owner[v]!==owner[w]&&!dag[owner[v]].has(owner[w])){dag[owner[v]].add(owner[w]);indeg[owner[w]]++}
 const queue=indeg.flatMap((d,i)=>d===0?[i]:[]),order=[];
 while(queue.length){const i=queue.shift();order.push(i);for(const j of dag[i])if(!--indeg[j])queue.push(j)}
 if(order.length!==components.length)throw Error('SCC condensation cycle');
 return {components,edges:dag.map(s=>[...s]),order};
}
// Karp's maximum cycle mean for a strongly connected unit-lag max-plus
// event graph. This is a mathematical primitive, NOT a factory solver.
function iterationMaxPlusCycleMean(n,arcs,A){
 if(!Number.isSafeInteger(n)||n<1)throw Error('invalid event count');
 const adj=Array.from({length:n},()=>new Set());
 for(const e of arcs){if(!Number.isSafeInteger(e.from)||!Number.isSafeInteger(e.to)||e.from<0||e.from>=n||e.to<0||e.to>=n)throw Error('invalid arc');adj[e.from].add(e.to)}
 if(iterationScc(Array.from({length:n},(_,i)=>i),adj).components.length!==1||!arcs.length)throw Error('strongly connected event graph required');
 const f=[Array(n).fill(null)];f[0][0]=A.Z;
 for(let k=1;k<=n;k++){const next=Array(n).fill(null);for(const e of arcs){const x=f[k-1][e.from];if(x===null)continue;const y=A.add(x,A.q(e.weight));if(next[e.to]===null||A.cmp(y,next[e.to])>0)next[e.to]=y}f.push(next)}
 let mean=null;
 for(let v=0;v<n;v++)if(f[n][v]!==null){let m=null;for(let k=0;k<n;k++)if(f[k][v]!==null){const d=A.div(A.sub(f[n][v],f[k][v]),A.q(n-k));if(m===null||A.cmp(d,m)<0)m=d}if(m!==null&&(mean===null||A.cmp(m,mean)>0))mean=m}
 if(mean===null)throw Error('no reachable cycle');return A.txt(mean);
}
// Fixed, exogenous switch word: create a phase-expanded event graph.
// Endogenous warehouse/priority switching cannot use this contract.
function iterationFixedSwitchGraph(n,modes){
 if(!modes.length)throw Error('empty mode word');
 return {n:n*modes.length,arcs:modes.flatMap((arcs,i)=>arcs.map(a=>({...a,from:i*n+a.from,to:((i+1)%modes.length)*n+a.to})))};
}

// Upper bound on a frozen actor's common service phase lattice from zero.
// This is not a bound on inventory or on a whole factory's running time.
function iterationFrozenPhaseBound(rates,A){
 const gcd=(a,b)=>{while(b){const t=a%b;a=b;b=t}return a<0n?-a:a};
 const lcm=(a,b)=>a/gcd(a,b)*b;
 const values=Object.values(rates).map(A.q).filter(v=>v.n!==0n);
 if(!values.length)return '1';
 const L=values.reduce((d,v)=>lcm(d,v.d),1n);
 let M=20n*L;
 for(const v of values){const p=(v.n<0n?-v.n:v.n)*(L/v.d);M=lcm(M,p)}
 return M.toString();
}

// Exact feed-forward interface experiment: autonomous frozen suppliers only.
// Their full-service phase has no stock read dependencies. Keep a zero-rate
// placeholder at the same frozen stage so later readers see precisely the
// same credit as in the unsplit network. Actual downstream deposits continue.
function iterationAutonomousSourceCalendar(spec,A,{maxPeriod=20000}={}){
 const gcd=(a,b)=>{while(b){const t=a%b;a=b;b=t}return a};
 const lcm=(a,b)=>a/gcd(a,b)*b;
 if(!Number.isSafeInteger(maxPeriod)||maxPeriod<1)throw Error('invalid calendar budget');
 const sources=[],actors=[];
 let period=1n;
 for(const f of spec.frozen||[]){
  const rates=Object.entries(f.rates).map(([k,v])=>[k,A.div(A.q(v),A.q(20))]);
  if(rates.some(([,v])=>v.n<0n)||!rates.some(([,v])=>v.n>0n)){actors.push(f);continue}
  sources.push({id:f.id,rates});
  for(const [,v] of rates)period=lcm(period,v.d);
  actors.push({...f,rates:{}});
 }
 if(!sources.length)return {status:'not-applicable'};
 if(period>BigInt(maxPeriod))return {status:'budget',reason:'calendar-period',period:period.toString()};
 const P=Number(period),frames={};
 for(let i=0;i<P;i++){
  const t=BigInt(i);
  for(const f of sources)for(const [k,v] of f.rates){
   const count=((t+1n)*v.n/v.d)-(t*v.n/v.d);
   if(!count)continue;
   const n=Number(count);if(!Number.isSafeInteger(n))throw Error('calendar count overflow');
   const stage='frozen:'+f.id;((frames[i]??={})[stage]??={})[k]=n;
  }
 }
 return {status:'ready',sourceIds:sources.map(f=>f.id),spec:{...spec,frozen:actors},boundary:{period:P,frames,free:[],additive:true}};
}

// Non-materialized autonomous supply clock. A source emits floor(t*a/b)
// from empty startup. No common period array or floating-point rounding.
// t denotes elapsed integer ticks; next(t) is the next strictly later
// tick that emits any item, even for rates greater than one item/tick.
function iterationAutonomousSourceClock(spec,A){
 const channels=[];
 for(const f of spec.frozen||[]){
  const rates=Object.entries(f.rates).map(([item,v])=>[item,A.div(A.q(v),A.q(20))]);
  if(rates.some(([,v])=>v.n<0n))continue;
  for(const [item,v] of rates)if(v.n>0n)channels.push({stage:'frozen:'+f.id,item,a:v.n,b:v.d});
 }
 const tick=t=>{if(typeof t==='number'&&!Number.isSafeInteger(t))throw Error('unsafe tick');const n=BigInt(t);if(n<0n)throw Error('negative tick');return n};
 const count=(c,t)=>t*c.a/c.b;
 const ceil=(a,b)=>(a+b-1n)/b;
 function between(lo,hi){
  lo=tick(lo);hi=tick(hi);if(hi<lo)throw Error('reversed interval');
  const result={};
  for(const c of channels){
   const n=count(c,hi)-count(c,lo);
   if(n) (result[c.stage]??={})[c.item]=n.toString();
  }
  return result;
 }
 function next(t){
  t=tick(t);let n=null;
  for(const c of channels){
   const k=ceil((count(c,t)+1n)*c.b,c.a);
   if(n===null||k<n)n=k;
  }
  return n===null?null:n.toString();
 }
 function phase(t){t=tick(t);return channels.map(c=>(t*c.a%c.b).toString());}
 return {between,next,phase,channelCount:channels.length};
}

// Research-only actual feed-forward decomposition. Autonomous physical
// groups have no warehouse readers and no connected physical boundary.
function iterationPhysicalSourcePlan(spec,A,{ms=30000,maxTicks=2160000,maxCalendarTicks=200000,treeCalendar=false}={}){
 if(spec.frozen.length||spec.unlimitedWarehouse)return {status:'not-applicable'};
 const started=performance.now(),remaining=()=>Math.max(0,ms-(performance.now()-started));
 const physical=iterationPartitionSpec({...spec,unlimitedWarehouse:true}),reads=new Set(spec.machines.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item));
 const sourceGroups=physical.filter(g=>!g.machines.some(m=>m.type==='仓出')&&iterationWarehouseBoundaryItems(g).some(k=>reads.has(k)));
 if(!sourceGroups.length)return {status:'not-applicable'};
 const removed=new Set(sourceGroups.flatMap(g=>g.machines.map(m=>m.id))),sources=[];
 const residual={...spec,machines:spec.machines.filter(m=>!removed.has(m.id)),routes:spec.routes.filter(r=>!removed.has(r.from)),priority:spec.priority.filter(id=>!removed.has(id))};
 const gcd=(a,b)=>{while(b){const t=a%b;a=b;b=t}return a};
 let period=1n,prefix=0;
 for(const group of sourceGroups){
  const g={...group,unlimitedWarehouse:false};
  if(treeCalendar){
   const c=iterationForestDepositCalendar(g,A,{ms:Math.min(1000,remaining()),maxCalendarTicks});
   const v=c&&iterationForestRates(g,A,{treeMs:Math.min(1000,remaining())});
   if(c&&v){
    sources.push({group:g,prefix:c.prefix,frames:c.window(0,c.prefix),orbit:{...v,periodTicks:c.period,boundary:{frames:c.window(c.prefix,c.prefix+c.period)}}});
    prefix=Math.max(prefix,c.prefix);const p=BigInt(c.period);period=period/gcd(period,p)*p;
    if(period>BigInt(maxCalendarTicks))return {status:'budget',reason:'source-calendar-lcm'};
    continue;
   }
  }
  const r=iterationFindOrbit(iterationCreateKernel(g,A),{ms:remaining(),maxTicks,captureBoundary:true});
  if(!r.values||!r.boundary)return {status:'budget',reason:'source-orbit'};
  if(r.prefixTicks>maxCalendarTicks)return {status:'budget',reason:'source-prefix'};
  const k=iterationCreateKernel(g,A,{captureDeposits:true});
  for(let i=0;i<r.prefixTicks;){if(remaining()<=0)return {status:'budget',reason:'source-prefix-time'};i+=k.advance(r.prefixTicks-i)}
  const snapshot=k.snapshot();
  if(snapshot.control!==r.boundary.initialControl)throw Error('source prefix mismatch');
  sources.push({group:g,prefix:r.prefixTicks,frames:k.recordedCalendar(),orbit:r});
  prefix=Math.max(prefix,r.prefixTicks);
  const p=BigInt(r.periodTicks);period=period/gcd(period,p)*p;
  if(period>BigInt(maxCalendarTicks))return {status:'budget',reason:'source-calendar-lcm'};
 }
 const P=Number(period);
 function window(lo,hi){
  if(!Number.isSafeInteger(lo)||!Number.isSafeInteger(hi)||lo<0||hi<lo||hi-lo>maxCalendarTicks)throw Error('source window range');
  const frames={};
  const insert=(t,frame)=>{if(t<lo||t>=hi)return;for(const [stage,items] of Object.entries(frame))for(const [k,v] of Object.entries(items)){
   const d=((frames[t-lo]??={})[stage]??={});d[k]=(d[k]??0)+v;if(!Number.isSafeInteger(d[k]))throw Error('calendar overflow');
  }};
  for(const s of sources){
   for(const [t,v] of Object.entries(s.frames))insert(Number(t),v);
   for(const [t,v] of Object.entries(s.orbit.boundary.frames)){
    const first=s.prefix+Number(t),p=s.orbit.periodTicks;
    for(let j=Math.max(0,Math.ceil((lo-first)/p)),at=first+j*p;at<hi;at+=p)insert(at,v);
   }
  }
  return frames;
 }
 return {status:'ready',residual,sources,prefix,period:P,window,remaining};
}
function iterationPhysicalSourceActual(spec,A,options={}){
 const started=performance.now(),plan=iterationPhysicalSourcePlan(spec,A,options);
 if(plan.status!=='ready')return plan;
 const {prefix,period,residual,sources}=plan;
 const start=iterationCreateKernel(residual,A,{boundary:{period:Math.max(1,prefix),frames:plan.window(0,prefix),free:[],additive:true}});
 for(let i=0;i<prefix;){if(plan.remaining()<=0)return {status:'budget',reason:'downstream-prefix'};i+=start.advance(prefix-i)}
 const x=start.snapshot();
 const boundary={period,frames:plan.window(prefix,prefix+period),free:[],additive:true};
 const k=iterationCreateKernel(residual,A,{initialControl:x.control,initialStock:x.stock,boundary});
 const r=iterationFindOrbit(k,{ms:plan.remaining(),maxTicks:options.maxTicks??2160000});
 if(!r.values)return r;
 const values={...r.values};
 // Downstream additive credits already account for upstream warehouse
 // deposits. Only merge other upstream observables.
 for(const s of sources)for(const [k,v] of Object.entries(s.orbit.values)){
  if(k.startsWith('inflow:')||k.startsWith('localIn:'))continue;
  values[k]=A.txt(A.add(A.q(values[k]??'0'),A.q(v)));
 }
 return {...r,values,sourceMachines:sources.reduce((n,s)=>n+s.group.machines.length,0),residualMachines:residual.machines.length,sourcePrefix:prefix,sourcePeriod:period,elapsedMs:Math.round(performance.now()-started)};
}
