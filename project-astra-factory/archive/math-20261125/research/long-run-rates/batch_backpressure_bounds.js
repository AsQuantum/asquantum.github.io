'use strict';
// Independent exact periodic *bounds* for a batch producer, one physical FIFO
// belt, and a known downstream batch-release word. No event simulation.
// All times are rational. Each closed walk must lose strict time in the
// periodically indexed upper graph; otherwise do not infer cadence.
function proveBatchBackpressure({batch,demand,producerPeriod,inputReady,downstream,beltLength,outputCapacity,receiverCapacity,cooldown='1',spacing='1',speed='2',maxNodes=240},arith){
 const {q,cmp,add,sub,mul,div,txt,Z}=arith, P=q(cooldown),d=div(q(spacing),q(speed)),A=div(q(beltLength),q(speed)),T=q(producerPeriod),F=q(inputReady),H=q(downstream.period);
 const fail=reason=>({status:'not-proved',reason});
 if(![batch,demand,outputCapacity,receiverCapacity,beltLength].every(Number.isSafeInteger)||batch<1||demand<1||outputCapacity<batch||receiverCapacity<demand||beltLength<1||cmp(P,d)<0||cmp(T,Z)<=0||cmp(F,T)<0||cmp(H,Z)<=0)return fail('invalid parameters');
 const slots=div(q(beltLength),q(spacing));
 if(slots.d!==1n||slots.n<1n||slots.n>=BigInt(Number.MAX_SAFE_INTEGER))return fail('nonintegral belt spacing');
 const K=Number(slots.n)+1,pl=(downstream.phases||downstream.lower||[]).map(q),pu=(downstream.phases||downstream.upper||[]).map(q),m=pl.length;
 if(!m||pu.length!==m||pl.some((v,i)=>cmp(v,pu[i])>0)||[pl,pu].some(ph=>ph.some((v,i)=>i&&cmp(v,ph[i-1])<=0)||cmp(add(ph[0],H),ph.at(-1))<=0))return fail('invalid downstream cadence envelope');
 function gcd(a,b){while(b){const c=a%b;a=b;b=c;}return a;}
 const M=m*demand,J=batch/gcd(batch,M)*M,N=J/batch,W=mul(H,q(J/M)),V=N+2*J;
 if(!Number.isSafeInteger(J)||V>maxNodes)return fail('symbolic word too large');
 const split=(i,n)=>[Math.floor(i/n),((i%n)+n)%n];
 const offset=(kind,i)=>{
  const n=kind==='a'?N:J,[cycle,index]=split(i,n);
  return {v:(kind==='a'?0:kind==='s'?N:N+J)+index,shift:mul(q(cycle),W)};
 };
 const edges=[],anchorsLow=Array(V).fill(null),anchorsHigh=Array(V).fill(null);
 function edge(from,i,to,j,lo,hi=lo){
  const a=offset(from,i),b=offset(to,j);
  if(cmp(b.shift,Z)!==0)throw Error('target outside representative word');
  if(cmp(a.shift,Z)>0)throw Error('noncausal forward dependency');
  edges.push({from:a.v,to:b.v,lo:add(lo,a.shift),hi:add(hi,a.shift),lag:cmp(a.shift,Z)<0});
 }
 for(let i=0;i<N;i++){
  // Starts reserve a complete output batch; prior start + ingredient
  // readiness is an upper bound, not an equality assumed from average.
  edge('a',i-1,'a',i,T,F);
  edge('s',(i+1)*batch-outputCapacity-1,'a',i,Z);
 }
 for(let j=0;j<J;j++){
  edge('s',j-1,'s',j,P);
  edge('r',j-K,'s',j,d);
  edge('a',Math.floor(j/batch),'s',j,T);
  edge('s',j,'r',j,A);
  edge('r',j-1,'r',j,P);
  // Initially empty downstream ingredient cache has receiverCapacity
  // initial free slots. Thereafter each actual start creates demand slots.
  const slot=Math.floor((j-receiverCapacity)/demand),[k,i]=split(slot,m);
  anchorsLow[N+J+j]=add(pl[i],mul(q(k),H));
  anchorsHigh[N+J+j]=add(pu[i],mul(q(k),H));
 }
 // Reject nonnegative cycles by exact lexicographic path weights
 // (weight, length). A zero-weight nonempty cycle is lex-positive.
 // Starting all nodes at 0 detects every component, including unreachable.
 let dist=Array.from({length:V},()=>({w:Z,n:0}));
 for(let k=0;k<V;k++){
  const next=dist.slice();let changed=false;
  for(const e of edges){
   const a=dist[e.from],b=next[e.to],w=add(a.w,e.hi),n=a.n+1,c=cmp(w,b.w);
   if(c>0||c===0&&n>b.n){next[e.to]={w,n};changed=true;}
  }
  if(!changed)break;
  if(k===V-1)return fail('upper recurrence has nonnegative circuit');
  dist=next;
 }
 // For strict-negative circuits any maximal path from an anchor is simple.
 // V-1 edges suffice; this is finite graph longest-path algebra, not
 // advancing physical time or testing convergence of rate guesses.
 function closure(field){
  let v=(field==='lo'?anchorsLow:anchorsHigh).slice();
  for(let k=1;k<V;k++){
   const next=v.slice();let changed=false;
   for(const e of edges)if(v[e.from]!==null){
    const x=add(v[e.from],e[field]);
    if(next[e.to]===null||cmp(x,next[e.to])>0){next[e.to]=x;changed=true;}
   }
   v=next;if(!changed)break;
  }
  return v;
 }
 const low=closure('lo'),high=closure('hi');
 if(low.some((v,i)=>v===null||high[i]===null))return fail('unanchored event component');
 const exact=low.slice(0,N).every((v,i)=>cmp(v,high[i])===0);
 const result={status:exact?'proven-cadence':'proven-envelope',period:txt(W),batchCount:N,items:J,cycleCheck:'strict-negative-upper-circuits',vertices:V,edges:edges.length,lower:low.slice(0,N).map(txt),upper:high.slice(0,N).map(txt)};
 if(exact)result.phases=low.slice(0,N).map(txt);
 // Minimum actual gap after finite transient follows from the sandwich,
 // even if phases do not coincide. Clip by nominal recipe lower bound.
 let min=null;
 for(let i=0;i<N;i++){
  const gap=sub(i===N-1?add(low[0],W):low[i+1],high[i]);
  const bound=cmp(gap,T)>0?gap:T;
  if(min===null||cmp(bound,min)<0)min=bound;
 }
 result.minGap=txt(min);
 result.rate=txt(div(q(N),W)); // bounded phase envelopes prove exact mean
 return result;
}
if(typeof module!=='undefined')module.exports={proveBatchBackpressure};
