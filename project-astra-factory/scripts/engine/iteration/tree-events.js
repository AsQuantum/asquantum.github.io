'use strict';
// Exact ordinal event graph for a finite-buffer production in-tree.
// Research-only until recurrence and long-run certificate tests pass.
function iterationTreeEventGraph(spec,A,{maxVertices=2048}={}){
 if(spec.initial!=='empty'||spec.frozen.length||spec.priority.length)return null;
 const nodes=new Map(spec.machines.map(m=>[m.id,m]));
 const sinks=spec.machines.filter(m=>m.type==='仓入');
 if(sinks.length!==1||sinks[0].recipe||nodes.size!==spec.machines.length||spec.routes.length!==nodes.size-1||nodes.size<2)return null;
 const sink=sinks[0],incoming=new Map(spec.machines.map(m=>[m.id,[]])),out=new Map(),rec=new Map();
 for(const m of spec.machines){
  if(m===sink)continue;
  const r=m.recipe;if(!r||['仓出','仓入','电脑','分流','汇流'].includes(m.type)||!Number.isSafeInteger(r.qty)||r.qty<=0)return null;
  const T=A.mul(A.q(r.seconds),A.q(20));if(T.d!==1n||T.n<=0n||T.n>BigInt(Number.MAX_SAFE_INTEGER))return null;
  const inputs=Object.entries(r.inputs||{});if(inputs.some(([,a])=>!Number.isSafeInteger(a)||a<=0))return null;
  rec.set(m.id,{T:T.n,Q:BigInt(r.qty),inputs});
 }
 for(const r of spec.routes){
  const a=nodes.get(r.from),b=nodes.get(r.to),port=a?.outPorts.find(p=>p.index===r.fromPort);
  if(!a||!b||a===sink||!port||r.fromPort!==0||out.has(a.id)||!b.inputPriority.includes(r.toPort)||!Number.isSafeInteger(r.length)||r.length<1||r.length>Number.MAX_SAFE_INTEGER/10||!r.accepted.includes(a.recipe.output)||port.filter&&port.filter!=='任意'&&port.filter!==a.recipe.output)return null;
  if(incoming.get(b.id).some(e=>e.toPort===r.toPort))return null;
  out.set(a.id,r);incoming.get(b.id).push(r);
 }
 if(incoming.get(sink.id).length!==1)return null;
 const root=incoming.get(sink.id)[0].from,ratios=new Map([[root,A.U]]),queue=[root];
 for(let i=0;i<queue.length;i++){
  const id=queue[i],c=rec.get(id),rs=incoming.get(id);
  if(rs.length!==c.inputs.length)return null;
  for(const [k,a] of c.inputs){
   const es=rs.filter(r=>nodes.get(r.from).recipe.output===k);if(es.length!==1)return null;
   const e=es[0];if(ratios.has(e.from))return null;
   ratios.set(e.from,A.div(A.mul(ratios.get(id),A.q(a)),A.q(rec.get(e.from).Q)));queue.push(e.from);
  }
 }
 if(queue.length!==rec.size)return null;
 const gcd=(a,b)=>{while(b){const t=a%b;a=b;b=t}return a},lcm=(a,b)=>a/gcd(a,b)*b;
 let H=1n;for(const r of ratios.values()){H=lcm(H,r.d);if(H>BigInt(maxVertices))return null}
 const streams=new Map(),vertices=[],arcs=[],groups=new Map();
 function stream(key,N){
  if(N<=0n||N>BigInt(maxVertices-vertices.length))return false;
  const ids=[];for(let i=1;i<=Number(N);i++){ids.push(vertices.length);vertices.push({key,index:i})}
  streams.set(key,{N:Number(N),ids});return true;
 }
 const S=id=>'s:'+id,C=id=>'c:'+id,D=id=>'d:'+id,R=id=>'r:'+id;
 for(const id of queue){
  const r=ratios.get(id),n=H*r.n/r.d,e=out.get(id),Q=rec.get(id).Q;
  if(!stream(S(id),n)||!stream(C(id),n)||!stream(D(e.id),n*Q)||!stream(R(e.id),n*Q))return null;
  groups.set(id,n);
 }
 function arc(from,i,to,j,w){
  const a=streams.get(from),b=streams.get(to);
  const lag=-Math.floor((i-1)/a.N),phase=(i-1+lag*a.N);
  if(lag<0||phase<0||phase>=a.N||!Number.isSafeInteger(lag))throw Error('tree event phase');
  arcs.push({from:a.ids[phase],to:b.ids[j-1],lag,w:BigInt(w)});
 }
 let bound=0n;const max=(a,b)=>a>b?a:b;
 for(const id of queue){
  const c=rec.get(id),e=out.get(id),Q=Number(c.Q),N=Number(groups.get(id)),items=N*Q;
  const L=BigInt(e.length)*10n,B=e.length+1;
  if(!Number.isSafeInteger(B))return null;
  const source=c.inputs.length===0;
  bound=max(bound,BigInt(N)*c.T);bound=max(bound,BigInt(items)*20n);
  for(let n=1;n<=N;n++){
   arc(C(id),n-1,S(id),n,source?1:0);
   arc(D(e.id),(n-20)*Q,S(id),n,1);
   arc(S(id),n,C(id),n,c.T-(source?1n:0n));
   for(const [k,a] of c.inputs){
    const upstream=incoming.get(id).find(r=>nodes.get(r.from).recipe.output===k);
    arc(R(upstream.id),n*a,S(id),n,0);
   }
  }
  for(let i=1;i<=items;i++){
   arc(C(id),Math.ceil(i/Q),D(e.id),i,0);
   arc(D(e.id),i-1,D(e.id),i,20);
   arc(R(e.id),i-B,D(e.id),i,10);
   arc(D(e.id),i,R(e.id),i,L);
   arc(R(e.id),i-1,R(e.id),i,20);
   if(e.to!==sink.id){
    const a=nodes.get(e.to).recipe.inputs[nodes.get(id).recipe.output];
    arc(S(e.to),Math.ceil(i/a)-3,R(e.id),i,1);
   }
  }
 }
 const z=Array.from({length:vertices.length},()=>[]),degree=Array(vertices.length).fill(0),dependencies=Array.from({length:vertices.length},()=>[]);
 for(const e of arcs){dependencies[e.to].push(e);if(e.lag===0){z[e.from].push(e.to);degree[e.to]++}}
 const order=degree.flatMap((n,i)=>n===0?[i]:[]);
 for(let i=0;i<order.length;i++)for(const v of z[order[i]])if(!--degree[v])order.push(v);
 if(order.length!==vertices.length)return null;
 return {spec,vertices,arcs,dependencies,order,streams,groups,root,sink:sink.id,H,bound,rec,out};
}
// Integer ordinal recurrence from empty state; no tick iteration.
// Retain rounds for the research trace only (not a production calendar).
function iterationTreeEventRounds(g,rounds){
 const result=[];
 for(let n=0;n<rounds;n++){
  const times=Array(g.vertices.length).fill(1n);
  for(const v of g.order)for(const e of g.dependencies[v]){
   if(e.lag>n)continue;
   const t=(e.lag===0?times:result[n-e.lag])[e.from]+e.w;
   if(t>times[v])times[v]=t;
  }
  result.push(times);
 }
 return result;
}
// Difference constraints at candidate round period lambda. A feasible
// potential certifies a schedule; an improving predecessor cycle yields
// an exact larger lower bound. Cap the search, never approximate a rate.
function iterationTreePeriod(g,A,{maxPasses=32,ms=1000}={}){
 const start=performance.now(),N=g.vertices.length;
 let lambda=A.q(g.bound),witness=null;
 for(let step=0;step<maxPasses;step++){
  const distance=Array(N).fill(0n),pred=Array(N).fill(null);
  const edges=g.arcs.map(e=>({...e,c:e.w*lambda.d-BigInt(e.lag)*lambda.n}));
  let last=-1;
  for(let i=0;i<N;i++){
   if(performance.now()-start>ms)return null;
   last=-1;
   for(const e of edges)if(distance[e.to]<distance[e.from]+e.c){distance[e.to]=distance[e.from]+e.c;pred[e.to]=e;last=e.to}
   if(last<0)break;
  }
  if(last<0){
   if(!edges.every(e=>distance[e.to]>=distance[e.from]+e.c))throw Error('tree schedule certificate');
   return {lambda,phase:distance,denominator:lambda.d,witness,passes:step+1};
  }
  let v=last;for(let i=0;i<N;i++){if(!pred[v])return null;v=pred[v].from}
  const cycle=[];let u=v;
  do{const e=pred[u];if(!e)return null;cycle.push(e);u=e.from;if(cycle.length>N)return null}while(u!==v);
  const lag=cycle.reduce((s,e)=>s+BigInt(e.lag),0n),weight=cycle.reduce((s,e)=>s+e.w,0n);
  if(lag<=0n)return null;
  const next=A.div(A.q(weight),A.q(lag));if(A.cmp(next,lambda)<=0)return null;
  lambda=next;witness=cycle.map(({from,to,lag,w})=>({from,to,lag,w}));
 }
 return null;
}
function iterationTreeRates(spec,A,options={}){
 const g=iterationTreeEventGraph(spec,A,options);if(!g)return null;
 const proof=iterationTreePeriod(g,A,options);if(!proof)return null;
 const values={},add=(k,v)=>values[k]=A.txt(A.add(A.q(values[k]??'0'),v));
 for(const [id,n] of g.groups){
  const e=g.out.get(id),m=spec.machines.find(m=>m.id===id),cycle=A.div(A.q(n*20n),proof.lambda),rate=A.mul(cycle,A.q(m.recipe.qty)),k=m.recipe.output;
  add('cycle:'+id,cycle);add('crafts:'+k,rate);add('routeTotal:'+e.id,rate);add('flow:'+e.id+'|'+k,rate);
  add('machineTotal:'+id+'|out',rate);add('machineMaterial:'+id+'|out|'+k,rate);
  add('machineTotal:'+e.to+'|in',rate);add('machineMaterial:'+e.to+'|in|'+k,rate);
  if(e.to===g.sink){add('inflow:'+k,rate);add('localIn:'+k,rate)}
 }
 return {status:'exact-model-analytic',certified:false,method:'production-tree-event-graph',values,tree:{vertices:g.vertices.length,arcs:g.arcs.length,rootBatches:String(g.H),nominalPeriod:String(g.bound),period:A.txt(proof.lambda),passes:proof.passes}};
}

// Several independent trees may end at different ports of one warehouse
// inlet. The warehouse accepts additively; there is no shared input buffer.
function iterationProductionForest(spec){
 if(spec.initial!=='empty'||spec.frozen.length||spec.priority.length||spec.machines.length<2)return null;
 const nodes=new Map(spec.machines.map(m=>[m.id,m])),incoming=new Map(spec.machines.map(m=>[m.id,[]])),out=new Map(),used=new Set(),trees=[];
 if(nodes.size!==spec.machines.length||new Set(spec.routes.map(r=>r.id)).size!==spec.routes.length)return null;
 for(const r of spec.routes){
  const a=nodes.get(r.from),b=nodes.get(r.to);
  if(!a?.recipe||!b||out.has(a.id)||incoming.get(b.id).some(e=>e.toPort===r.toPort))return null;
  out.set(a.id,r);incoming.get(b.id).push(r);
 }
 for(const sink of spec.machines.filter(m=>m.type==='仓入')){
  if(!incoming.get(sink.id).length)return null;
  for(const root of incoming.get(sink.id)){
   const ids=[root.from],routes=[root];
   for(let i=0;i<ids.length;i++){
    const id=ids[i];if(used.has(id)||!nodes.get(id)?.recipe)return null;used.add(id);
    for(const r of incoming.get(id)){ids.push(r.from);routes.push(r)}
   }
   trees.push({...spec,machines:spec.machines.filter(m=>m.id===sink.id||ids.includes(m.id)),routes:spec.routes.filter(r=>routes.includes(r))});
  }
  used.add(sink.id);
 }
 return trees.length&&used.size===spec.machines.length?trees:null;
}
// A tree whose sole terminal cannot receive any product has only
// finitely many production and transfer events. With unique outgoing
// routes and no inventory reader, reverse induction bounds all upstream
// activity. Missing an ingredient at any depth can prove this without
// waiting for the blocked branch to fill. Do not infer positive rates
// from reachability, especially with competing same-material inputs.
function iterationStarvedTreeRates(spec,A){
 const trees=iterationProductionForest(spec);
 if(!trees||trees.length!==1)return null;
 const nodes=new Map(spec.machines.map(m=>[m.id,m])),sink=spec.machines.find(m=>m.type==='仓入');
 if(!sink||sink.recipe)return null;
 const inputs=new Map(spec.machines.map(m=>[m.id,[]]));
 for(const m of spec.machines){
  if(m===sink)continue;
  const r=m.recipe;
  if(!r||['仓入','仓出','分流','汇流','电脑'].includes(m.type)||!r.output||!Number.isSafeInteger(r.qty)||r.qty<=0)return null;
  const T=A.mul(A.q(r.seconds),A.q(20));
  if(T.d!==1n||T.n<=0n||T.n>BigInt(Number.MAX_SAFE_INTEGER)||Object.values(r.inputs||{}).some(n=>!Number.isSafeInteger(n)||n<=0))return null;
 }
 for(const r of spec.routes){
  if(!Number.isSafeInteger(r.length)||r.length<0||r.length>Number.MAX_SAFE_INTEGER/10)return null;
  const a=nodes.get(r.from),b=nodes.get(r.to),port=a.outPorts.find(p=>p.index===r.fromPort);
  if(r.fromPort===0&&port&&r.length>0&&b.inputPriority.includes(r.toPort)&&r.accepted.includes(a.recipe.output)&&(!port.filter||port.filter==='任意'||port.filter===a.recipe.output))inputs.get(b.id).push(a);
 }
 // Because every node has a unique successor and the forest recognizer
 // reaches all nodes from the terminal, this traversal is acyclic.
 const order=[sink],seen=new Set([sink.id]);
 for(let i=0;i<order.length;i++)for(const a of inputs.get(order[i].id)){
  if(seen.has(a.id))return null;seen.add(a.id);order.push(a);
 }
 const possible=new Set();
 for(let i=order.length-1;i>0;i--){
  const m=order[i],material=new Set(inputs.get(m.id).filter(a=>possible.has(a.id)).map(a=>a.recipe.output));
  if(Object.keys(m.recipe.inputs||{}).every(k=>material.has(k)))possible.add(m.id);
 }
 if(inputs.get(sink.id).some(a=>possible.has(a.id)))return null;
 return {status:'exact-model-analytic',certified:false,method:'production-tree-structural-zero',values:{},tree:{zero:true,reason:'terminal-unreachable'},elapsedMs:0};
}
function iterationForestRates(spec,A,{treeMs=40,maxVertices=2048,...options}={}){
 const start=performance.now(),trees=iterationProductionForest(spec);if(!trees)return null;
 const values={},details=[];
 for(const tree of trees){
  const ms=treeMs-(performance.now()-start);if(ms<=0)return null;
  const r=iterationTreeRates(tree,A,{...options,maxVertices,ms})??iterationStarvedTreeRates(tree,A);if(!r)return null;
  details.push(r.tree);
  for(const [k,v] of Object.entries(r.values))values[k]=A.txt(A.add(A.q(values[k]??'0'),A.q(v)));
 }
 return {status:'exact-model-analytic',certified:false,method:details.every(t=>t.zero)?'production-tree-structural-zero':'production-tree-event-graph',values,tree:details,elapsedMs:Math.round(performance.now()-start)};
}

// Exact startup and repeated ordinal-event history, independent of ticks.
// A repeated normalized history of all lagged event times proves future
// translation. Only root arrival frames are exported to the warehouse.
function iterationTreeDepositCalendar(spec,A,{ms=1000,maxRounds=4096,maxHistoryCells=100000,maxCalendarTicks=200000}={}){
 const start=performance.now(),g=iterationTreeEventGraph(spec,A);
 if(!g)return null;
 const maxLag=Math.max(1,...g.arcs.map(e=>e.lag));
 if(maxLag*g.vertices.length>maxHistoryCells)return null;
 const root=g.streams.get('r:'+g.out.get(g.root).id),item=g.rec.get(g.root)?spec.machines.find(m=>m.id===g.root).recipe.output:null;
 const history=[],arrivals=[],seen=new Map();
 for(let n=0;n<maxRounds;n++){
  if(performance.now()-start>ms)return null;
  const times=Array(g.vertices.length).fill(1n);
  for(const v of g.order)for(const e of g.dependencies[v]){
   if(e.lag>n)continue;
   const x=(e.lag===0?times:history[(n-e.lag)%maxLag])[e.from]+e.w;
   if(x>times[v])times[v]=x;
  }
  history[n%maxLag]=times;
  for(const v of root.ids)arrivals.push(times[v]);
  const t=times[root.ids.at(-1)];if(t>BigInt(maxCalendarTicks))return null;
  if(n<maxLag-1)continue;
  const key=history.map((_,i)=>history[(n-maxLag+1+i)%maxLag].map(x=>String(x-t)).join(',')).join(';');
  const old=seen.get(key);
  if(old!==undefined){
   const P=t-old;if(P<=0n)return null;
   const frames={},periodFrames={};
   for(const a of arrivals){
    if(a<=old)frames[Number(a-1n)]={physical:{[item]:1}};
    else periodFrames[Number(a-old-1n)]={physical:{[item]:1}};
   }
   return {prefix:Number(old),period:Number(P),frames,periodFrames,item,rounds:n+1,vertices:g.vertices.length};
  }
  seen.set(key,t);
  if(seen.size>Math.min(128,Math.max(1,Math.floor(maxHistoryCells/(maxLag*g.vertices.length)))))seen.delete(seen.keys().next().value);
 }
 return null;
}
function iterationForestDepositCalendar(spec,A,options={}){
 const start=performance.now(),ms=options.ms??1000,trees=iterationProductionForest(spec);
 if(!trees)return null;
 const calendars=[];let prefix=0,P=1n;
 const gcd=(a,b)=>{while(b){const t=a%b;a=b;b=t}return a};
 for(const tree of trees){
  const c=iterationTreeDepositCalendar(tree,A,{...options,ms:Math.max(0,ms-(performance.now()-start))});
  if(!c)return null;calendars.push(c);prefix=Math.max(prefix,c.prefix);
  P=P/gcd(P,BigInt(c.period))*BigInt(c.period);
  if(P>BigInt(options.maxCalendarTicks??200000))return null;
 }
 function window(lo,hi){
  const result={},insert=(t,k,v)=>{if(t>=lo&&t<hi){const x=(result[t-lo]??={physical:{}}).physical;x[k]=(x[k]??0)+v}};
  for(const c of calendars){
   for(const [t,v] of Object.entries(c.frames))insert(Number(t),c.item,v.physical[c.item]);
   for(const [t,v] of Object.entries(c.periodFrames)){
    const first=c.prefix+Number(t);
    for(let at=first+Math.max(0,Math.ceil((lo-first)/c.period))*c.period;at<hi;at+=c.period)insert(at,c.item,v.physical[c.item]);
   }
  }
  return result;
 }
 return {prefix,period:Number(P),calendars,window};
}
