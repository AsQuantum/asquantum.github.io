'use strict';
// Exact finite transition-relation decomposition for a shared warehouse
// item under the fixed-step rational scheduler. NOT an initial-state
// time trace: compile every bounded state, peel the acyclic graph, and
// project the initial state onto its closed recurrent class.
function proveFrozenSingleItemFinite(g,arith,{dt='1/20',maxStates=600000,skipItems=[]}={}){
 const {q,cmp,mul,div,add,sub,txt,Z,U}=arith,D=q(dt),out={frozenDuties:[],certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited||g.lines.length||cmp(D,Z)<=0||g.emptyStartProof?.initialWarehouseItems?.length)return out;
 const fs=g.frozen||[],neg=v=>cmp(q(v),Z)<0,pos=v=>cmp(q(v),Z)>0;
 if(new Set(fs.map(f=>f.id)).size!==fs.length)return out;
 const ceil=r=>(r.n+r.d-1n)/r.d;
 for(const item of new Set(fs.flatMap(f=>Object.keys(f.rates).filter(k=>neg(f.rates[k]))))){
  if(skipItems.includes(item))continue;
  const reject=reason=>out.refused.push({item,reason});
  const actors=fs.filter(f=>Object.hasOwn(f.rates,item)&&cmp(q(f.rates[item]),Z)!==0);
  const data=actors.map(f=>{const rate=q(f.rates[item]),source=cmp(rate,Z)>0,abs=source?rate:sub(Z,rate);return {f,source,abs,step:mul(abs,D)};});
  if(data.some(x=>x.source?Object.values(x.f.rates).some(neg):Object.values(x.f.rates).filter(neg).length!==1)){reject('coupled source or multiple required ingredients');continue;}
  const cs=data.filter(x=>!x.source),ps=data.filter(x=>x.source);
  const income=ps.reduce((a,x)=>add(a,x.abs),Z),demand=cs.reduce((a,x)=>add(a,x.abs),Z);
  if(cmp(income,Z)===0||cmp(income,demand)>=0){
   const duty=cmp(income,Z)===0?'0':'1',cert=cs.map(x=>({factory:x.f.id,duty,proven:true,method:'single-item-zero-or-aggregate-full'}));
   out.frozenDuties.push(...cert);out.certificates.push({item,method:'existing-aggregate-theorem',income:txt(income),demand:txt(demand),duties:cert});continue;
  }
  // If pre-tick stock >= Q, even after all earlier debits and
  // protections every negative consumer can advance a full step.
  // On any such consecutive interval the net stock drift is <=
  // (income-demand)*duration + number of integer phase accumulators.
  const Q=cs.reduce((a,x)=>a+ceil(x.step)+1n,0n);
  const B=ps.reduce((a,x)=>a+ceil(x.step),0n);
  const Wmax=Q+B+BigInt(data.length),cap=Wmax+1n;
  let states=cap;for(const x of data){states*=x.step.d;if(states>BigInt(maxStates))break;}
  if(states>BigInt(maxStates)||data.some(x=>(cap+B)*x.step.d+x.step.n>BigInt(Number.MAX_SAFE_INTEGER))){reject('finite state budget exceeded: '+states);continue;}
  const N=Number(states),K=Number(cap),overflow=N;
  const step=data.map(x=>({source:x.source,n:Number(x.step.n),d:Number(x.step.d)}));
  const phase=new Int32Array(data.length);
  // All integer operations are exact in JS Number at the guarded sizes.
  function transition(id,reward){
   let w=id%K,z=Math.floor(id/K),reserved=0;
   for(let i=0;i<step.length;i++){const d=step[i].d;phase[i]=z%d;z=Math.floor(z/d);}
   for(let i=0;i<step.length;i++){
    const {source,n,d}=step[i],p=phase[i];
    if(source){const acc=p+n,whole=Math.floor(acc/d);phase[i]=acc%d;w+=whole;}
    else{
     const avail=w-reserved;if(avail<1)continue;
     const acc=Math.min(p+n,avail*d),whole=Math.floor(acc/d);phase[i]=acc%d;w-=whole;
     if(reward)reward[i]+=BigInt(whole);
     if(w-reserved>=1)reserved++;
    }
   }
   if(w<0||w>=K)return overflow;
   let next=w,stride=K;
   for(let i=0;i<step.length;i++){next+=stride*phase[i];stride*=step[i].d;}
   return next;
  }
  // Compile the entire finite transition relation, including states not
  // reachable from reset. Out-of-bound transitions go to a sentinel.
  const successor=new Int32Array(N+1),indegree=new Int32Array(N+1);
  for(let i=0;i<N;i++){const j=transition(i);successor[i]=j;indegree[j]++;}
  successor[overflow]=overflow;indegree[overflow]++;
  const peel=new Int32Array(N+1);let head=0,tail=0;
  for(let i=0;i<=N;i++)if(!indegree[i])peel[tail++]=i;
  while(head<tail){const j=successor[peel[head++]];if(--indegree[j]===0)peel[tail++]=j;}
  // On the remaining graph, each component is a cycle. Count each
  // state's one-step reward once, and assign class labels backwards.
  const labels=new Int32Array(N+1),cycles=[null];
  for(let i=0;i<=N;i++)if(indegree[i]&&labels[i]===0){
   const label=cycles.length,reward=data.map(()=>0n);let j=i,length=0,invalid=false;
   do{labels[j]=label;length++;if(j===overflow)invalid=true;else transition(j,reward);j=successor[j];}while(j!==i);
   cycles.push({length,reward,invalid});
  }
  for(let i=tail-1;i>=0;i--){const j=peel[i];labels[j]=labels[successor[j]];}
  const chosen=cycles[labels[0]];
  if(!chosen||chosen.invalid){reject('initial class reaches overflow: stock proof or compiler contradiction');continue;}
  const duration=mul(q(chosen.length),D),duties=[];
  for(let i=0;i<data.length;i++)if(!data[i].source){
   const rate=div(q(chosen.reward[i]),duration),duty=div(rate,data[i].abs);
   if(cmp(duty,Z)<0||cmp(duty,U)>0)throw Error('invalid finite-state duty');
   duties.push({factory:data[i].f.id,duty:txt(duty),proven:true,method:'exact-fixed-tick-single-item-state-quotient'});
  }
  out.frozenDuties.push(...duties);
  out.certificates.push({item,method:'finite-state-recurrent-class',income:txt(income),demand:txt(demand),stockBound:String(Wmax),states:N,cycleClasses:cycles.length-1,cycleTicks:chosen.length,consumptions:data.flatMap((x,i)=>x.source?[]:[{factory:x.f.id,items:String(chosen.reward[i])}]),duties});
 }
 return out;
}
module.exports={proveFrozenSingleItemFinite};
