'use strict';
// Local fixed-tick warehouse quotient. Eliminate independently proved
// free routes; only retain stock, claims, cooldowns and service phases.
// Arbitrary unrelated graph components are allowed. No initial-state
// time trace, rate approximation, or layout-specific constants.
function proveFrozenFiniteComponents(g,arith,{dt='1/20',maxStates=600000,knownDuties=[],knownPhysical={},depositWords=[],certifyConditionalExits=false,capFactors=[1,2,4]}={}){
 const {q,cmp,add,sub,mul,div,txt,Z,U}=arith,D=q(dt),out={frozenDuties:[],warehouseBursts:[],machineRates:[],routeRates:[],certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited||cmp(D,Z)<=0||g.emptyStartProof?.initialWarehouseItems?.length)return out;
 if(!Number.isSafeInteger(maxStates)||maxStates<1||maxStates>=2147483647)return out;
 const P=div(U,D),half=div(q('1/2'),D);
 if(P.d!==1n||half.d!==1n||P.n>1000000n)return out;
 const fs=g.frozen||[],neg=v=>cmp(q(v),Z)<0,abs=v=>neg(v)?sub(Z,q(v)):q(v);
 if(new Set(fs.map(f=>f.id)).size!==fs.length)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount;
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const withdrawals=g.lines.filter(e=>ns.get(e.from).type==='仓出');
 const deposits=g.lines.filter(e=>ns.get(e.to).type==='仓入');
 const needed=new Set(knownDuties.filter(x=>x.proven===true).map(x=>x.factory));
 const items=[...new Set([...fs.flatMap(f=>Object.entries(f.rates).filter(([,v])=>neg(v)).map(([k])=>k)),...withdrawals.map(e=>ns.get(e.from).item)])].filter(Boolean);
 const track=new Set(items),actors=fs.map(f=>({id:f.id,entries:Object.entries(f.rates).filter(([k,v])=>track.has(k)&&cmp(q(v),Z)!==0)})).filter(f=>f.entries.length);
 const byItem=new Map(items.map(k=>[k,actors.filter(f=>f.entries.some(([j])=>j===k))]));
 const seen=new Set(),components=[];
 for(const k of items){if(seen.has(k))continue;const keys=[k],as=new Set();seen.add(k);
  for(let i=0;i<keys.length;i++)for(const f of byItem.get(keys[i])){if(as.has(f))continue;as.add(f);for(const [j] of f.entries)if(!seen.has(j)){seen.add(j);keys.push(j);}}
  components.push({keys,actors:actors.filter(f=>as.has(f))});
 }
 const gcd=(a,b)=>b?gcd(b,a%b):a,lcm=(a,b)=>a/gcd(a,b)*b,ceil=x=>(x.n+x.d-1n)/x.d;
 // A free isolated sink accepts any input word with gaps >= P.
 // For an ordinary terminal recipe, each a arrivals make a batch;
 // T<=aP and b<=a imply both input and output queues clear by the next
 // batch, even under arbitrary gaps. All timing is on the fixed grid.
 function free(e){
  if(!valid(e))return false;
  const m=ns.get(e.to),r=m.recipe;
  if(!complete(m)||I.get(m.id).length!==1)return false;
  if(m.type==='电脑'&&!O.get(m.id).length)return true;
  if(!r||Object.keys(r.inputs||{}).length!==1||!Object.hasOwn(r.inputs,e.materials[0])||O.get(m.id).length!==1)return false;
  const a=r.inputs[e.materials[0]],b=r.qty,T=div(q(r.seconds),D),x=O.get(m.id)[0];
  return Number.isSafeInteger(a)&&a>0&&Number.isSafeInteger(b)&&b>0&&b<=a&&T.d===1n&&T.n>0n&&T.n<=BigInt(a)*P.n&&valid(x)&&x.materials[0]===r.output&&ns.get(x.to).type==='仓入';
 }
 for(const comp of components){
  const {keys,actors}=comp,targets=actors.filter(f=>f.entries.some(([,v])=>neg(v)));
  const refuse=reason=>out.refused.push({items:keys,reason});
  const exits=withdrawals.filter(e=>keys.includes(ns.get(e.from).item));
  if(targets.every(f=>needed.has(f.id))&&exits.every(e=>knownPhysical['flow:'+e.id+'|'+ns.get(e.from).item]!=null))continue;
  if(keys.length>30){refuse('too many simultaneously tracked items');continue;}
  const exitData=[];let invalid=false;
  for(const k of keys){
   const es=exits.filter(e=>ns.get(e.from).item===k),order=(g.pools||[]).find(p=>p.item===k)?.order;
   if(es.length&&(!Array.isArray(order)||new Set(order).size!==order.length||es.some(e=>!order.includes(e.from)||!complete(ns.get(e.from))||I.get(e.from).length||O.get(e.from).length!==1||e.materials[0]!==k||!valid(e)||!certifyConditionalExits&&!free(e)))){invalid=true;break;}
   es.sort((a,b)=>order.indexOf(a.from)-order.indexOf(b.from));
   for(const e of es)exitData.push({machine:e.from,route:e.id,item:keys.indexOf(k),conditional:!free(e)});
  }
  if(invalid){refuse('warehouse outlet clearance or priority not proved');continue;}
  const conditional=exitData.some(e=>e.conditional);if(conditional&&exitData.length>30){refuse('conditional exit count budget');continue;}
  // An independent autonomous source with T>=bP is a deterministic
  // arrival clock. Include the finite initial travel delay exactly.
  const sourceData=[];
  for(const e of deposits.filter(e=>e.materials.some(k=>keys.includes(k)))){
   const m=ns.get(e.from),r=m.recipe,k=e.materials[0];
   const w=depositWords.find(w=>w.route===e.id&&w.item===k&&w.proven===true&&w.method==='fixed-tick-feed-forward-independent-deposit'&&cmp(q(w.dt),D)===0);
   if(w&&valid(e)&&Array.isArray(w.pre)&&Array.isArray(w.cyc)&&w.cyc.length&&Number.isSafeInteger(w.H)&&w.H>0){
    const pTicks=Number(P.n),first=w.cyc[0],all=[...w.pre,...w.cyc,first+w.H];
    if(all.every((v,i)=>Number.isSafeInteger(v)&&v>=1&&(!i||v-all[i-1]>=pTicks))){
     sourceData.push({machine:null,item:keys.indexOf(k),T:BigInt(w.H),first:BigInt(first),pre:new Set(w.pre),offsets:new Set(w.cyc.map(t=>t-first))});
     continue;
    }
   }
   if(!valid(e)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!r||Object.keys(r.inputs||{}).length||r.output!==k||!Number.isSafeInteger(r.qty)||r.qty<1){invalid=true;break;}
   const T=div(q(r.seconds),D);
   if(T.d!==1n||T.n<BigInt(r.qty)*P.n){invalid=true;break;}
   sourceData.push({machine:m.id,item:keys.indexOf(k),T:T.n,first:T.n+BigInt(e.length)*half.n,b:r.qty,rate:txt(div(U,q(r.seconds)))});
  }
  if(invalid){refuse('deposit is not an independent periodic autonomous source');continue;}
  const Q=keys.map((k,i)=>4n*BigInt(exitData.filter(e=>e.item===i).length)+actors.reduce((s,f)=>{const e=f.entries.find(([j])=>j===k);return s+(e&&neg(e[1])?ceil(mul(abs(e[1]),D))+1n:0n);},0n));
  const B=keys.map((k,i)=>BigInt(sourceData.filter(e=>e.item===i).length)+actors.reduce((s,f)=>{const e=f.entries.find(([j])=>j===k);return s+(e&&!neg(e[1])?ceil(mul(abs(e[1]),D)):0n);},0n));
  // All nonnegative frozen sources and independent deposits share one
  // deterministic frame clock. Only throttled actor phases are separate.
  let phaseCount=0,period=1n,prefix=0n;
  for(const s of sourceData){period=lcm(period,s.T);if(s.first>prefix)prefix=s.first;}
  const ad=actors.map(f=>{
   const vals=f.entries.map(([,v])=>abs(v)),den=vals.reduce((a,v)=>lcm(a,v.d),1n);
   const ints=vals.map(v=>v.n*(den/v.d)),num=ints.reduce((a,v)=>gcd(a,v),0n),unit=q({n:num,d:den});
   const ratios=ints.map(v=>v/num),step=mul(unit,D);
   const L=f.entries.reduce((l,[,v],i)=>neg(v)?lcm(l,ratios[i]):l,step.d),u=step.n*(L/step.d);
   const pure=f.entries.every(([,v])=>!neg(v)),index=pure?-1:phaseCount++;
   if(pure)period=lcm(period,L/gcd(L,u));
   return {id:f.id,L,step:u,index,pure,entries:f.entries.map(([k,v],i)=>({item:keys.indexOf(k),negative:neg(v),ratio:ratios[i]}))};
  });
  const clockSize=prefix+period;
  let accepted=false,last='state budget exceeded';
  for(const factor of capFactors){
   if(!Number.isSafeInteger(factor)||factor<1)continue;
   const caps=Q.map((v,i)=>v+BigInt(factor)*(B[i]+BigInt(actors.length+exitData.length+sourceData.length)));
   let N=clockSize;for(const c of caps)N*=c+1n;for(const a of ad)if(!a.pure)N*=a.L;for(const e of exitData)N*=4n*P.n;
   if(N>BigInt(maxStates)){last='state budget exceeded: '+N;break;}
   const safe=ad.every(a=>a.step+a.L<9007199254740991n&&(!a.pure||(clockSize-1n)*a.step<9007199254740991n)&&a.entries.every(e=>(a.step+a.L)*e.ratio<9007199254740991n&&(caps[e.item]+B[e.item]+1n)*a.L<9007199254740991n));
   if(!safe){last='integer arithmetic budget exceeded';break;}
   const C=caps.map(Number),threshold=Q.map(Number),A=ad.map(a=>({...a,L:Number(a.L),step:Number(a.step),entries:a.entries.map(e=>({...e,ratio:Number(e.ratio)}))}));
   const src=sourceData.map(s=>({...s,T:Number(s.T),first:Number(s.first)})),pTicks=Number(P.n),clockN=Number(clockSize),prefixN=Number(prefix);
   const size=Number(N),stock=new Float64Array(keys.length),reserved=new Float64Array(keys.length),phase=new Float64Array(phaseCount),claims=new Uint8Array(exitData.length),cd=new Int32Array(exitData.length),strides=[];
   const base=[...C.map(c=>c+1),...A.filter(a=>!a.pure).map(a=>a.L),clockN,...exitData.flatMap(()=>[4,pTicks])],clockIndex=keys.length+phaseCount;
   let stride=1;for(const b of base){strides.push(stride);stride*=b;}
   function transition(id,reward){
    let z=id,low=0,clip=0,sentMask=0;
    for(let i=0;i<stock.length;i++){stock[i]=z%base[i];z=Math.floor(z/base[i]);reserved[i]=0;if(stock[i]<threshold[i])low|=1<<i;}
    for(let i=0;i<phaseCount;i++){const b=base[stock.length+i];phase[i]=z%b;z=Math.floor(z/b);}
    const clock=z%clockN;z=Math.floor(z/clockN);const t=clock+1;
    for(let i=0;i<exitData.length;i++){claims[i]=z%4;z=Math.floor(z/4);cd[i]=z%pTicks;z=Math.floor(z/pTicks);reserved[exitData[i].item]+=claims[i];}
    for(const s of src){if(s.offsets){if(t<s.first?s.pre.has(t):s.offsets.has((t-s.first)%s.T))stock[s.item]++;}else if(t>=s.first){const r=(t-s.first)%s.T;if(r%pTicks===0&&r/pTicks<s.b)stock[s.item]++;}}
    for(let i=0;i<A.length;i++){
     const a=A[i],p=a.pure?(clock*a.step)%a.L:phase[a.index];let service=a.step;
     for(const e of a.entries)if(e.negative){
      const available=stock[e.item]-reserved[e.item];
      if(available<1){service=0;break;}
      const ph=(p*e.ratio)%a.L,limit=(available*a.L-ph)/e.ratio;
      if(!Number.isSafeInteger(limit))throw Error('service phase not on rational grid');
      service=Math.min(service,limit);
     }
     if(service<=0)continue;
     for(const e of a.entries){
      const whole=Math.floor(((p*e.ratio)%a.L+service*e.ratio)/a.L);
      stock[e.item]+=e.negative?-whole:whole;
     }
     if(!a.pure)phase[a.index]=(p+service)%a.L;
     if(reward)reward.actors[i]+=BigInt(service);
     if(a.entries.every(e=>!e.negative||stock[e.item]-reserved[e.item]>=1))for(const e of a.entries)if(e.negative)reserved[e.item]++;
    }
    // All claims are assigned before any dispatch, exactly as in HTML.
    for(let i=0;i<exitData.length;i++){
     const k=exitData[i].item,n=Math.max(0,Math.min(3-claims[i],stock[k]-reserved[k]));
     claims[i]+=n;reserved[k]+=n;
    }
    for(let i=0;i<exitData.length;i++){
     const k=exitData[i].item;
     if(cd[i]===0&&claims[i]>0&&stock[k]>0){claims[i]--;stock[k]--;cd[i]=pTicks-1;if(reward)reward.exits[i]++;if(conditional)sentMask|=1<<i;}
     else if(cd[i]>0)cd[i]--;
    }
    let next=0;
    for(let i=0;i<stock.length;i++){
     if(stock[i]<0)throw Error('negative inventory in compiled state');
     if(stock[i]>C[i]){stock[i]=C[i];clip|=1<<i;}
     next+=stock[i]*strides[i];
    }
    for(let i=0;i<phaseCount;i++)next+=phase[i]*strides[stock.length+i];
    next+=(t===clockN?prefixN:t)*strides[clockIndex];
    for(let i=0;i<exitData.length;i++){next+=claims[i]*strides[clockIndex+1+2*i]+cd[i]*strides[clockIndex+2+2*i];}
    return [next,low,clip,sentMask];
   }
   const successor=new Int32Array(size),degree=new Int32Array(size),low=new Int32Array(size),clip=new Int32Array(size),sends=conditional?new Int32Array(size):null;
   for(let i=0;i<size;i++){const [j,l,c,mask]=transition(i);successor[i]=j;degree[j]++;low[i]=l;clip[i]=c;if(sends)sends[i]=mask;}
   const peel=new Int32Array(size);let head=0,tail=0;
   for(let i=0;i<size;i++)if(!degree[i])peel[tail++]=i;
   while(head<tail){const j=successor[peel[head++]];if(--degree[j]===0)peel[tail++]=j;}
   const label=new Int32Array(size),futureLow=new Int32Array(size),bad=new Int32Array(size),cycles=[null];
   for(let i=0;i<size;i++)if(degree[i]&&!label[i]){
    const k=cycles.length,reward={actors:A.map(()=>0n),exits:exitData.map(()=>0n)};let j=i,length=0,L=0,Cm=0;
    do{label[j]=k;L|=low[j];Cm|=clip[j];length++;transition(j,reward);j=successor[j];}while(j!==i);
    do{futureLow[j]=L;bad[j]=L&Cm;j=successor[j];}while(j!==i);
    cycles.push({length,reward});
   }
   for(let k=tail-1;k>=0;k--){const i=peel[k],j=successor[i];label[i]=label[j];futureLow[i]=low[i]|futureLow[j];bad[i]=bad[j]|(clip[i]&futureLow[j]);}
   if(bad[0]){last='clipped stock can later affect eligibility: '+keys.filter((_,i)=>bad[0]&(1<<i)).join(',');continue;}
   const chosen=cycles[label[0]],duration=mul(q(chosen.length),D);
   const duties=A.flatMap((a,i)=>a.pure?[]:[{factory:a.id,duty:txt(div(q(chosen.reward.actors[i]),q(BigInt(a.step)*BigInt(chosen.length)))),proven:true,method:'exact-fixed-tick-certified-frozen-component-quotient'}]);
   const flows=exitData.map((e,i)=>({...e,item:keys[e.item],rate:txt(div(q(chosen.reward.exits[i]),duration))}));
   const sourceRates=sourceData.filter(s=>s.machine!==null).map(s=>({machine:s.machine,rate:s.rate,proven:true,method:'exact-fixed-tick-independent-autonomous-deposit'}));
   let joint=null;
   if(conditional){
    // Extract only exit events from the already compiled exact relation.
    // This candidate assumes every exit is unblocked; it is not yet a
    // certificate. The downstream ordinal graph must prove that premise.
    const words=exitData.map(e=>({route:e.route,item:keys[e.item],dt:txt(D),assumption:'unblocked-local-warehouse',pre:[],cyc:[],H:chosen.length}));
    let j=0,t=1,events=0;
    const collect=kind=>{const mask=sends[j];for(let i=0;i<words.length;i++)if(mask&(1<<i)){words[i][kind].push(t);events++;}j=successor[j];t++;};
    while(!degree[j]&&events<=24000)collect('pre');
    if(events>24000){last='conditional outlet ordinal event budget';continue;}
    const start=j;do{collect('cyc');}while(j!==start&&events<=24000);
    if(events>24000){last='conditional outlet ordinal event budget';continue;}
    const v=require('./feed_forward_ordinal_proof').proveFeedForwardOrdinals(g,arith,{dt:txt(D),warehouseWords:words.filter(w=>w.cyc.length)});
    const selected=v.certificates.filter(c=>c.scope==='conditional-on-warehouse-words'&&c.routes.some(id=>exitData.some(e=>e.conditional&&e.route===id)));
    if(exitData.some(e=>e.conditional&&!selected.some(c=>c.routes.includes(e.route)))||selected.some(c=>c.routes.some(id=>deposits.some(e=>e.id===id&&e.materials.some(k=>keys.includes(k)))))){
     last='conditional downstream acceptance not proved';continue;
    }
    // Mutual implication is closed by induction from the shared empty
    // initial state: actual warehouse and downstream both realize the
    // candidate; no feedback to this component's stock is permitted.
    joint={routes:[...new Set(selected.flatMap(c=>c.routes))],events,words:words.map(w=>({route:w.route,prefix:w.pre.length,events:w.cyc.length,period:w.H}))};
    out.machineRates.push(...selected.flatMap(c=>c.machineRates));out.routeRates.push(...selected.flatMap(c=>c.routeRates));
   }
   out.frozenDuties.push(...duties);out.machineRates.push(...sourceRates);
   for(const k of keys){const es=flows.filter(e=>e.item===k);if(es.length)out.warehouseBursts.push({item:k,proven:true,method:'exact-fixed-tick-warehouse-component-quotient',outlets:es.map(({machine,route,rate})=>({machine,route,rate}))});}
   out.certificates.push({items:keys,states:size,caps:C,thresholds:threshold,clockStates:clockN,clockPrefix:prefixN,certifiedPhysicalWords:sourceData.filter(s=>s.offsets).length,cycleTicks:chosen.length,cycleClasses:cycles.length-1,duties,outlets:flows,sourceRates,joint});accepted=true;break;
  }
  if(!accepted)refuse(last);
 }
 return out;
}
module.exports={proveFrozenFiniteComponents};
