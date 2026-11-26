'use strict';
// Exact finite event graph for an empty-start, single-product tandem.
// No guessed downstream cadence, no time stepping. Continuous causal model.
// All quantities are positive integers; one autonomous root, one free deposit.
function proveTandem(stages,lengths,arith,{maxNodes=600,maxEdges=120000}={}){
 const {q,cmp,add,mul,div,txt,U,Z}=arith;
 const fail=reason=>({status:'not-proved',reason});
 if(!Array.isArray(stages)||!stages.length||stages.length!==lengths.length)return fail('invalid tandem');
 const gcd=(a,b)=>{while(b){const c=a%b;a=b;b=c;}return a;},lcm=(a,b)=>a/gcd(a,b)*b;
 for(let i=0;i<stages.length;i++){
  const m=stages[i];if(!Number.isSafeInteger(m.b)||m.b<1||i&&(!Number.isSafeInteger(m.a)||m.a<1)||cmp(q(m.T),Z)<=0||!Number.isSafeInteger(lengths[i])||lengths[i]<1)return fail('invalid stage');
 }
 // Balanced integer repetition vector: N_i*b_i=N_(i+1)*a_(i+1).
 let ratios=[U];for(let i=1;i<stages.length;i++)ratios.push(div(mul(ratios[i-1],q(stages[i-1].b)),q(stages[i].a)));
 const scale=ratios.reduce((s,v)=>lcm(s,v.d),1n);
 const counts=ratios.map(v=>v.n*(scale/v.d));
 const packets=counts.map((v,i)=>v*BigInt(stages[i].b));
 if(counts.reduce((s,v,i)=>s+v+2n*packets[i],0n)>BigInt(maxNodes))return fail('symbolic phase limit');
 const N=counts.map(Number),J=packets.map(Number),P=U,d=q('1/2'),V=[],offsets=[];
 for(let i=0;i<stages.length;i++){
  offsets.push({});
  for(const [kind,n] of [['a',N[i]],['s',J[i]],['r',J[i]]]){
   offsets[i][kind]=V.length;
   for(let k=0;k<n;k++)V.push({stage:i,kind,index:k});
  }
 }
 const edges=[];
 function edge(i,kind,j,h,to,k,w){
  const n=kind==='a'?N[i]:J[i],block=Math.floor(j/n),phase=((j%n)+n)%n;
  if(block>0)throw Error('noncausal block dependency');
  edges.push({from:offsets[i][kind]+phase,to:offsets[h][to]+k,lag:-block,w:q(w)});
 }
 for(let i=0;i<stages.length;i++){
  const {b,a,T}=stages[i],C=20*b,L=lengths[i],K=L+1,A=q({n:BigInt(L),d:2n});
  for(let j=0;j<N[i];j++){
   edge(i,'a',j-1,i,'a',j,T);
   edge(i,'s',(j+1)*b-C-1,i,'a',j,Z);
   if(i)edge(i-1,'r',(j+1)*a-1,i,'a',j,Z);
  }
  for(let j=0;j<J[i];j++){
   edge(i,'s',j-1,i,'s',j,P);
   edge(i,'r',j-K,i,'s',j,d);
   edge(i,'a',Math.floor(j/b),i,'s',j,T);
   edge(i,'s',j,i,'r',j,A);
   edge(i,'r',j-1,i,'r',j,P);
   if(i+1<stages.length){
    const a2=stages[i+1].a,D=3*a2;
    edge(i+1,'a',Math.floor((j-D)/a2),i,'r',j,Z);
   }
  }
 }
 return solveOrdinalGraph(V,edges,N,J,arith,{maxNodes,maxEdges});
}
function solveOrdinalGraph(V,edges,N,J,arith,{maxNodes=600,maxEdges=120000,upperBlockTime=null}={}){
 const {q,cmp,add,mul,div,txt,U,Z}=arith,fail=reason=>({status:"not-proved",reason});
 const gcd=(a,b)=>b?gcd(b,a%b):a,lcm=(a,b)=>a/gcd(a,b)*b;
 // Every original vertex must lie in one strongly connected component.
 const reach=reverse=>{const seen=new Set([0]),todo=[0];for(let i=0;i<todo.length;i++)for(const e of edges)if((reverse?e.to:e.from)===todo[i]){const v=reverse?e.from:e.to;if(!seen.has(v)){seen.add(v);todo.push(v);}}return seen.size;};
 if(reach(false)!==V.length||reach(true)!==V.length)return fail('event graph not strongly connected');
 // Each same-stage, same-kind ordinal phase clock forms a literal
 // directed circuit. Its weight/lag gives an exact lower bound on
 // block time. If a feasible potential exists at that bound on the
 // ORIGINAL weighted-lag graph, the lower and upper bounds coincide.
 // This avoids expanding long conveyor/storage lags into unit vertices.
 const groups=new Map();
 for(let i=0;i<V.length;i++){const v=V[i],k=v.stage+'|'+v.kind;(groups.get(k)||groups.set(k,[]).get(k)).push(i);}
 let clock=null;
 for(const group of groups.values()){
  group.sort((a,b)=>V[a].index-V[b].index);let sum=Z,ok=true;
  for(let j=0;j<group.length;j++){
   const from=group[(j+group.length-1)%group.length],to=group[j],lag=j===0?1:0;
   const es=edges.filter(e=>e.from===from&&e.to===to&&e.lag===lag);
   if(!es.length){ok=false;break;}
   const w=es.reduce((a,e)=>cmp(a,e.w)>=0?a:e.w,es[0].w);sum=add(sum,w);
  }
  if(ok&&(clock===null||cmp(sum,clock)>0))clock=sum;
 }
 // An explicitly supplied lower-model block time is a candidate
 // upper bound only. Its potential must satisfy every original edge;
 // caller compares it with the independently proved fast model.
 if(upperBlockTime!=null&&cmp(q(upperBlockTime),Z)>0){
  const H=q(upperBlockTime),h=Array(V.length).fill(Z);
  for(let i=1;i<V.length;i++){
   let changed=false;
   for(const e of edges){const x=add(h[e.from],arith.sub(e.w,mul(H,q(e.lag))));if(cmp(x,h[e.to])>0){h[e.to]=x;changed=true;}}
   if(!changed)break;
  }
  if(edges.every(e=>cmp(add(h[e.from],arith.sub(e.w,mul(H,q(e.lag)))),h[e.to])<=0))return {status:'upper-proved',blockTime:txt(H),method:'comparison-upper-potential'};
  return fail('comparison upper potential failed');
 }
 if(clock!==null&&cmp(clock,Z)>0){
  const denominator=edges.reduce((d,e)=>lcm(d,e.w.d),clock.d),scaledClock=clock.n*(denominator/clock.d);
  const E=edges.map(e=>({...e,adjusted:e.w.n*(denominator/e.w.d)-scaledClock*BigInt(e.lag)}));
  const h=Array(V.length).fill(0n);
  for(let i=1;i<V.length;i++){
   let change=false;for(const e of E){const x=h[e.from]+e.adjusted;if(x>h[e.to]){h[e.to]=x;change=true;}}
   if(!change)break;
  }
  if(E.every(e=>h[e.from]+e.adjusted<=h[e.to])){
   return {status:'proved',blockTime:txt(clock),batchCounts:N,packetCounts:J,stageRates:N.map(n=>txt(div(q(n),clock))),routeRates:J.map(n=>txt(div(q(n),clock))),vertices:V.length,expandedVertices:V.length,unitEdges:0,criticalCircuit:true,method:'original-lag-clock-potential'};
  }
 }
 // Expand positive ordinal lag into unit-lag edges, then eliminate
 // zero-lag edges by a finite DAG longest-path closure. Lag is a count
 // of repetition blocks, not a physical time grid.
 let size=V.length;const zero=[],one=[];
 const denominator=edges.reduce((s,e)=>lcm(s,e.w.d),1n);
 for(const e of edges){
  const w=e.w.n*(denominator/e.w.d);
  if(!e.lag){zero.push({from:e.from,to:e.to,w});continue;}
  let from=e.from;
  for(let j=0;j<e.lag;j++){
   const to=j===e.lag-1?e.to:size++;
   if(size>maxNodes)return fail('expanded ordinal lag resource limit');
   one.push({from,to,w:j===0?w:0n});from=to;
  }
 }
 const adj=Array.from({length:size},()=>[]),degree=Array(size).fill(0);
 for(const e of zero){adj[e.from].push(e);degree[e.to]++;}
 const topo=degree.flatMap((v,i)=>v===0?[i]:[]);
 for(let i=0;i<topo.length;i++)for(const e of adj[topo[i]])if(--degree[e.to]===0)topo.push(e.to);
 if(topo.length!==size)return fail('zero ordinal-lag circuit');
 const cache=new Map(),unit=new Map();
 for(const e of one){
  let closure=cache.get(e.to);
  if(!closure){closure=Array(size).fill(null);closure[e.to]=0n;
   for(const v of topo)if(closure[v]!==null)for(const z of adj[v]){const x=closure[v]+z.w;if(closure[z.to]===null||x>closure[z.to])closure[z.to]=x;}
   cache.set(e.to,closure);
  }
  for(let v=0;v<size;v++)if(closure[v]!==null){
   const k=e.from*size+v,w=e.w+closure[v];if(!unit.has(k)||w>unit.get(k).w)unit.set(k,{from:e.from,to:v,w});
  }
  if(unit.size>maxEdges)return fail('unit graph edge resource limit');
 }
 // Karp maximum cycle mean on integer weighted unit-lag graph.
 // The graph can have transient vertices; a virtual source reaches all.
 const E=[...unit.values()],dp=[Array(size).fill(0n)];
 for(let i=1;i<=size;i++){
  const next=Array(size).fill(null),prev=dp[i-1];
  for(const e of E)if(prev[e.from]!==null){const w=prev[e.from]+e.w;if(next[e.to]===null||w>next[e.to])next[e.to]=w;}
  dp.push(next);
 }
 let best=null;
 for(let v=0;v<size;v++)if(dp[size][v]!==null){
  let lo=null;
  for(let k=0;k<size;k++)if(dp[k][v]!==null){
   const r={n:dp[size][v]-dp[k][v],d:BigInt(size-k)*denominator};
   if(lo===null||cmp(q(r),lo)<0)lo=q(r);
  }
  if(lo!==null&&(best===null||cmp(lo,best)>0))best=lo;
 }
 if(best===null||cmp(best,Z)<=0)return fail('no positive cycle ratio');
 // Independent upper-potential and tight-circuit certificate on ORIGINAL
 // graph, avoiding reliance on Karp implementation alone.
 const w=e=>arith.sub(e.w,mul(best,q(e.lag)));
 let h=Array(V.length).fill(Z);
 for(let i=1;i<V.length;i++){const next=h.slice();for(const e of edges){const x=add(h[e.from],w(e));if(cmp(x,next[e.to])>0)next[e.to]=x;}h=next;}
 if(edges.some(e=>cmp(add(h[e.from],w(e)),h[e.to])>0))throw Error('cycle ratio upper certificate failed');
 const tight=edges.filter(e=>cmp(add(h[e.from],w(e)),h[e.to])===0),ta=Array.from({length:V.length},()=>[]),td=Array(V.length).fill(0);
 for(const e of tight){ta[e.from].push(e.to);td[e.to]++;}
 const order=td.flatMap((x,i)=>x===0?[i]:[]);for(let i=0;i<order.length;i++)for(const v of ta[order[i]])if(--td[v]===0)order.push(v);
 if(order.length===V.length)throw Error('no tight critical circuit');
 return {status:'proved',blockTime:txt(div(best,U)),batchCounts:N,packetCounts:J,stageRates:N.map(n=>txt(div(q(n),best))),routeRates:J.map(n=>txt(div(q(n),best))),vertices:V.length,expandedVertices:size,unitEdges:E.length,criticalCircuit:true};
}
function provePhysicalTandems(g,arith,options={}){
 const result={certificates:[],chains:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 for(const root of g.nodes){
  if(!root.recipe||Object.keys(root.recipe.inputs||{}).length||I.get(root.id).length)continue;
  const stages=[],lengths=[],ids=[],seen=new Set();let m=root,previous=null,reason=null;
  while(true){
   const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
   if(!r||seen.has(m.id)||ins.length!==m.physicalInCount||outs.length!==m.physicalOutCount||outs.length!==1||!valid(outs[0])||outs[0].materials[0]!==r.output||(!previous?(ins.length||keys.length):(ins.length!==1||keys.length!==1||keys[0]!==previous.materials[0]))){reason='not an isolated compatible tandem';break;}
   seen.add(m.id);ids.push(m.id);stages.push({b:r.qty,a:previous?r.inputs[keys[0]]:0,T:r.seconds});lengths.push(outs[0].length);
   previous=outs[0];m=ns.get(previous.to);
   if(m.type==='仓入')break;
  }
  if(reason){result.refused.push({machine:root.id,reason});continue;}
  const proof=proveTandem(stages,lengths,arith,options);
  if(proof.status!=='proved'){result.refused.push({machine:root.id,reason:proof.reason});continue;}
  result.chains.push({machines:ids,stages,lengths,...proof});
  ids.forEach((id,i)=>result.certificates.push({machine:id,rate:proof.stageRates[i],proven:true,method:'tandem-maximum-ordinal-circuit-ratio'}));
 }
 return result;
}
