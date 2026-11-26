'use strict';
// Exact ordinal schedules for feed-forward, homogeneous physical graphs.
// This is a sufficient no-backpressure certificate, NOT a global tick trace.
// All schedules are finite prefixes + affine repetition in event ordinal.
function proveFeedForwardOrdinals(g,arith,{dt='1/20',maxEvents=24000,maxPeriod=2000000,warehouseWords=[]}={}){
 const {q,div,txt,U,mul,cmp,Z}=arith,D=q(dt),out={machineRates:[],routeRates:[],depositWords:[],certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||cmp(D,Z)<=0)return out;
 const p=div(U,D),d=div(q('1/2'),D);if(p.d!==1n||d.d!==1n||p.n>1000000n)return out;
 const P=Number(p.n),travel=Number(d.n),ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const gcd=(a,b)=>b?gcd(b,a%b):a;
 const fail=r=>{throw new Error(r);};
 const limit=n=>{if(!Number.isSafeInteger(n)||n<0||n>maxEvents)fail('ordinal event budget');return n;};
 const lcm=(a,b)=>{const h=a/gcd(a,b)*b;if(!Number.isSafeInteger(h)||h<1||h>maxPeriod)fail('ordinal period budget');return h;};
 function seq(pre,cyc,H){
  limit(pre.length+cyc.length);
  if(!Number.isSafeInteger(H)||H<1||H>maxPeriod||!cyc.length||[...pre,...cyc].some(t=>!Number.isSafeInteger(t)||t<0)||cyc.at(-1)>cyc[0]+H||pre.length&&pre.at(-1)>cyc[0])fail('invalid ordinal word');
  return {pre,cyc,H};
 }
 const get=(s,i)=>i<s.pre.length?s.pre[i]:s.cyc[(i-s.pre.length)%s.cyc.length]+Math.floor((i-s.pre.length)/s.cyc.length)*s.H;
 const shift=(s,t)=>seq(s.pre.map(x=>x+t),s.cyc.map(x=>x+t),s.H);
 // Max-plus recurrence S_j=max(R_j,S_(j-1)+gap). Its block map is
 // x -> max(x-d,c), with d=H-M*gap >=0. Solve the transient length
 // by one exact ceiling, rather than iterative convergence.
 function serial(r,gap){
  const M=r.cyc.length,H=r.H,drift=H-M*gap;if(drift<0)fail('offered rate exceeds service');
  const C=Math.max(...r.cyc.map((v,i)=>v+(M-1-i)*gap))-H;
  let last=-Infinity,pre=[];
  for(const t of r.pre){last=Math.max(t,last+gap);pre.push(last);}
  const K=last===C?0:last<C?1:drift===0?0:Math.ceil((last-C)/drift);
  limit(pre.length+(K+1)*M);
  for(let k=0;k<K;k++)for(const t of r.cyc){last=Math.max(t+k*H,last+gap);pre.push(last);}
  const cyc=[];for(const t of r.cyc){last=Math.max(t+K*H,last+gap);cyc.push(last);}
  const nextFirst=Math.max(r.cyc[0]+(K+1)*H,last+gap);
  if(nextFirst!==cyc[0]+H)fail('ordinal block boundary mismatch');
  return seq(pre,cyc,H);
 }
 function union(ss){
  if(!ss.length)fail('missing input');
  if(ss.length===1)return ss[0];
  const H=ss.reduce((v,s)=>lcm(v,s.H),1),start=Math.max(...ss.map(s=>Math.max(s.cyc[0],(s.pre.at(-1)??-1)+1)));
  const pre=[],cyc=[];
  for(const s of ss){
   let j=0;
   while(get(s,j)<start+H){const t=get(s,j++);(t<start?pre:cyc).push(t);limit(pre.length+cyc.length);}
  }
  pre.sort((a,b)=>a-b);cyc.sort((a,b)=>a-b);return seq(pre,cyc,H);
 }
 function assertIndexed(start,end,test,reason){limit(end+1);for(let j=start;j<end;j++)if(!test(j))fail(reason);}
 function checkGap(s,gap){const n=s.pre.length+s.cyc.length;assertIndexed(1,n+1,j=>get(s,j)-get(s,j-1)>=gap,'port gap or simultaneous merger arrivals');}
 function split(s,n,i){
  const M=s.cyc.length,H=s.H*(n/gcd(n,M)),N=M*(n/gcd(n,M));limit(s.pre.length+N);
  return seq(s.pre.filter((_,j)=>j%n===i),Array.from({length:N},(_,j)=>get(s,s.pre.length+j)).filter((_,j)=>(s.pre.length+j)%n===i),H);
 }
 const work=g.nodes.filter(m=>m.type!=='仓入'&&(I.get(m.id).length||O.get(m.id).length)),seen=new Set();
 for(const root of work){
  if(seen.has(root.id))continue;
  const ids=[root.id];seen.add(root.id);
  for(let j=0;j<ids.length;j++)for(const e of [...I.get(ids[j]),...O.get(ids[j])]){
   const other=e.from===ids[j]?e.to:e.from;if(ns.get(other).type==='仓入'||seen.has(other))continue;
   seen.add(other);ids.push(other);
  }
  const es=ids.flatMap(id=>O.get(id)),inSet=new Set(ids),rates=[],streams=new Map(),batches=new Map();
  try{
   if(ids.some(id=>!complete(ns.get(id)))||es.some(e=>!valid(e))||ids.some(id=>I.get(id).some(e=>!inSet.has(e.from))))fail('incomplete or heterogeneous component');
   const deg=new Map(ids.map(id=>[id,I.get(id).length])),topo=ids.filter(id=>deg.get(id)===0);
   for(let j=0;j<topo.length;j++)for(const e of O.get(topo[j]))if(inSet.has(e.to)){deg.set(e.to,deg.get(e.to)-1);if(deg.get(e.to)===0)topo.push(e.to);}
   if(topo.length!==ids.length)fail('physical feedback cycle');
   const arrived=e=>shift(streams.get(e.id),e.length*travel);
   for(const id of topo){
    const m=ns.get(id),ins=I.get(id),outs=O.get(id),r=m.recipe;
    let words=[];
    if(r){
     const T=div(q(r.seconds),D),b=r.qty,a=Object.entries(r.inputs||{});
     if(T.d!==1n||T.n<1n||T.n>BigInt(maxPeriod)||!Number.isSafeInteger(b)||b<1||outs.length!==1||outs[0].materials[0]!==r.output)fail('unsupported recipe');
     const t=Number(T.n);
     if(!a.length){
      if(ins.length||t<b*P)fail('autonomous output may backpressure');
      words=[seq([],Array.from({length:limit(b)},(_,j)=>t+j*P),t)];batches.set(id,{n:1,H:t});
     }else{
      if(a.some(([k,v])=>!Number.isSafeInteger(v)||v<1||!ins.some(e=>e.materials[0]===k))||ins.some(e=>!Object.hasOwn(r.inputs,e.materials[0])))fail('missing or wrong ingredient');
      const groups=a.map(([k,a])=>({a,s:union(ins.filter(e=>e.materials[0]===k).map(arrived))}));
      let H=groups.reduce((v,x)=>lcm(v,x.s.H),1);
      for(const {a,s} of groups){const M=s.cyc.length*(H/s.H);H=lcm(H,H*(a/gcd(a,M)));}
      const N=groups[0].s.cyc.length*(H/groups[0].s.H)/groups[0].a;
      if(!Number.isSafeInteger(N)||N<1||groups.some(({a,s})=>s.cyc.length*(H/s.H)!==a*N))fail('ingredients not balanced in offered mean');
      const K=Math.max(...groups.map(({a,s})=>Math.ceil(s.pre.length/a)));limit(K+N);
      const ready=j=>Math.max(...groups.map(({a,s})=>get(s,(j+1)*a-1)));
      const starts=serial(seq(Array.from({length:K},(_,j)=>ready(j)),Array.from({length:N},(_,j)=>ready(K+j)),H),t);
      // At receive phase, the current frame's start has not freed slots.
      for(const {a,s} of groups){
       const J=Math.max(3*a,s.pre.length,a*starts.pre.length+3*a);
       assertIndexed(3*a,J+a*N,j=>get(starts,Math.floor((j-3*a)/a))+1<=get(s,j),'ingredient buffer capacity');
      }
      const release=xs=>xs.flatMap(x=>Array.from({length:b},()=>x+t));
      limit((starts.pre.length+starts.cyc.length)*b);
      const sent=serial(seq(release(starts.pre),release(starts.cyc),H),P);
      // At start phase, this frame's send has not freed output slots.
      const J=Math.max(20,starts.pre.length,Math.ceil((sent.pre.length+20*b+1)/b)-1);
      assertIndexed(20,J+N,j=>get(sent,(j+1)*b-20*b-1)+1<=get(starts,j),'recipe output buffer capacity');
      words=[sent];batches.set(id,{n:N,H});
     }
    }else if(m.type==='仓出'){
     if(ins.length||outs.length!==1||outs[0].materials[0]!==m.item)fail('unsupported warehouse root');
     const w=warehouseWords.find(w=>w.route===outs[0].id&&w.item===m.item&&w.assumption==='unblocked-local-warehouse'&&cmp(q(w.dt),D)===0);
     if(!w)fail('warehouse root has no conditional event word');
     words=[seq(w.pre,w.cyc,w.H)];
    }else if(m.type==='分流'){
     if(ins.length!==1||!outs.length||outs.some(e=>e.materials[0]!==ins[0].materials[0]))fail('unsupported splitter');
     const s=arrived(ins[0]);checkGap(s,P);
     outs.sort((a,b)=>a.fromPort-b.fromPort);words=outs.map((_,i)=>split(s,outs.length,i));
    }else if(m.type==='汇流'){
     if(!ins.length||outs.length!==1||ins.some(e=>e.materials[0]!==outs[0].materials[0]))fail('unsupported merger');
     const inputs=ins.map(arrived),a=union(inputs),N=a.cyc.length,J0=a.pre.length;
     let collision=false;
     for(let j=1;j<=J0+N;j++)if(get(a,j)===get(a,j-1))collision=true;
     let enqueued=a;
     if(collision){
      // A collision group is homogeneous. Its internal RR permutation
      // cannot affect the output word, if all heads are eligible and
      // the entire group clears before the next distinct arrival epoch.
      // Extra per-port gap covers both delayed receive cooldown and the
      // 1m following distance of the next nominal arrival.
      const wait=ins.length-1;
      if(P<travel||wait>=P)fail('collision clearance clock');
      for(const s of inputs)checkGap(s,P+wait);
      enqueued=serial(a,1);
      const K=Math.max(a.pre.length,enqueued.pre.length);
      assertIndexed(0,K+N+1,j=>get(enqueued,j)-get(a,j)<=wait&&(get(a,j)===get(a,j+1)||get(enqueued,j)<get(a,j+1)),'overlapping merger collision groups');
     }
     const sent=serial(shift(enqueued,1),P);
     const J=Math.max(3,enqueued.pre.length,sent.pre.length+3);
     assertIndexed(3,J+N,j=>get(sent,j-3)<=get(enqueued,j),'merger FIFO capacity');
     words=[sent];
    }else if(m.type==='电脑'){
     if(ins.length!==1||outs.length)fail('shared computer not certified');checkGap(arrived(ins[0]),P);
    }else fail('unsupported warehouse withdrawal or device');
    for(let i=0;i<outs.length;i++){const e=outs[i],s=words[i];if(!s)fail('missing output word');checkGap(s,P);streams.set(e.id,s);}
   }
   for(const e of es){
    const s=streams.get(e.id);if(!s)fail('missing route schedule');
    rates.push({route:e.id,item:e.materials[0],rate:txt(div(q(s.cyc.length),mul(q(s.H),D))),proven:true,method:'fixed-tick-feed-forward-no-backpressure'});
   }
   const ms=[...batches].map(([machine,v])=>({machine,rate:txt(div(q(v.n),mul(q(v.H),D))),proven:true,method:'fixed-tick-feed-forward-no-backpressure'}));
   out.machineRates.push(...ms);out.routeRates.push(...rates);
   for(const e of es)if(ns.get(e.to).type==='仓入'){const a=arrived(e);out.depositWords.push({route:e.id,item:e.materials[0],pre:a.pre,cyc:a.cyc,H:a.H,dt:txt(D),proven:true,method:'fixed-tick-feed-forward-independent-deposit'});}

   out.certificates.push({machines:ids,routes:es.map(e=>e.id),machineRates:ms,routeRates:rates,words:[...streams].map(([route,s])=>({route,prefix:s.pre.length,events:s.cyc.length,periodTicks:s.H})),scope:ids.some(id=>ns.get(id).type==='仓出')?'conditional-on-warehouse-words':'exact-rational-fixed-tick'});
  }catch(e){out.refused.push({machines:ids,reason:e.message});}
 }
 return out;
}
module.exports={proveFeedForwardOrdinals};
