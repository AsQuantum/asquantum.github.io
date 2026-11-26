'use strict';
// Exact event-boundary reachability certificate. Integer fixed-frame
// semantics, not a convergence test. Supports constrained inventories
// only when the reachable clipping-lift certificate succeeds.
function proveExactEventOrbit(spec,arith,{dt='1/20',ms=30000,maxEvents=5000000,maxCheckpoints=30000,skipIdle=true,stockFactor=8,diagnosticTicks=null}={}){
 const {q,cmp,div,mul,txt,U,Z}=arith,D=q(dt),whole=x=>{if(x.d!==1n||x.n<0n||x.n>100000000n)throw Error('noncommensurate grid');return Number(x.n);};
 const fail=(reason,extra={})=>({status:'unknown',reason,...extra,scope:'exact-rational-fixed-tick'});
 try{
 const P=whole(div(U,D)),spacing=whole(div(q('1/2'),D));if(!P||!spacing||spec.initial!=='empty')return fail('unsupported clock/initial');
 const fs=spec.frozen||[];
 if(!Number.isSafeInteger(stockFactor)||stockFactor<1||diagnosticTicks!==null&&(!Number.isSafeInteger(diagnosticTicks)||diagnosticTicks<1))return fail('invalid stock factor or diagnostic limit');
 if(new Set(fs.map(f=>f.id)).size!==fs.length)return fail('duplicate frozen IDs');
 const states=spec.machines.map(m=>({m,ins:[],outs:new Map(),input:new Map(Object.entries(m.recipe?.inputs||{}).map(([k])=>[k,0])),queue:[],claim:0,output:0,timer:0,rr:0,send:new Map(),recv:new Map(),T:m.recipe?whole(div(q(m.recipe.seconds),D)):0}));
 const by=new Map(states.map(s=>[s.m.id,s]));if(by.size!==states.length)return fail('duplicate machines');
 const codes=new Map(),code=k=>{if(!codes.has(k))codes.set(k,codes.size+1);return codes.get(k);};
 const belts=spec.routes.map(r=>{
  const a=by.get(r.from),b=r.to===null?null:by.get(r.to);if(!a||r.to!==null&&!b||!Number.isSafeInteger(r.length)||r.length<1||a.outs.has(r.fromPort)||b?.ins.some(e=>e.r.toPort===r.toPort)||!a.m.outPorts.some(p=>p.index===r.fromPort)||b&&!b.m.inputPriority.includes(r.toPort))throw Error('invalid physical topology');
  const e={r,a,b,end:r.length*spacing,items:[],pos:[],filter:a.m.outPorts.find(p=>p.index===r.fromPort).filter||'',accepted:new Set(r.accepted)};
  a.outs.set(r.fromPort,e);a.send.set(r.fromPort,0);if(b){b.ins.push(e);b.recv.set(r.toPort,0);}return e;
 });
 if(new Set(belts.map(e=>e.r.id)).size!==belts.length)return fail('duplicate routes');
 for(const s of states){
  s.ins.sort((a,b)=>s.m.inputPriority.indexOf(a.r.toPort)-s.m.inputPriority.indexOf(b.r.toPort));
  if(s.m.recipe&&(!s.T||!Number.isSafeInteger(s.m.recipe.qty)||s.m.recipe.qty<1||Object.values(s.m.recipe.inputs).some(n=>!Number.isSafeInteger(n)||n<1)))return fail('invalid recipe');
  if(s.m.recipe){code(s.m.recipe.output);for(const k of s.input.keys())code(k);}
  if(s.m.item)code(s.m.item);
  s.order=s.m.type==='分流'?s.m.outPorts.map(p=>p.index):s.m.mergerPriority||[];
  if(s.m.type==='分流'&&s.ins.length>1)return fail('multi-input splitter');
  if((s.ins.length||s.outs.size)&&!s.m.recipe&&!['分流','汇流','电脑','仓入','仓出'].includes(s.m.type))return fail('unsupported device');
 }
 const active=states.filter(s=>s.m.recipe||s.ins.length||s.outs.size);
 const counter=new Map(),inc=(k,n=1n)=>counter.set(k,(counter.get(k)||0n)+BigInt(n));
 const outlets=spec.priority.map(id=>by.get(id)).filter(s=>s?.m.type==='仓出'&&s.m.item&&s.outs.has(0));
 if(outlets.length!==active.filter(s=>s.m.type==='仓出'&&s.m.item&&s.outs.has(0)).length||new Set(outlets).size!==outlets.length)return fail('invalid warehouse priority');
 const neg=v=>cmp(q(v),Z)<0,abs=v=>neg(v)?arith.sub(Z,q(v)):q(v);
 const ceil=x=>(x.n+x.d-1n)/x.d,gcd=(a,b)=>b?gcd(b,a%b):a,lcm=(a,b)=>a/gcd(a,b)*b;
 const tracked=new Set(spec.unlimitedWarehouse?[]:[...outlets.map(s=>s.m.item),...fs.flatMap(f=>Object.entries(f.rates).filter(([,v])=>neg(v)).map(([k])=>k))]);
 const stock=new Map(),caps=new Map(),thresholds=new Map(),clipped=new Set(),reserved=new Map(),frozenReserved=new Map();
 for(const k of tracked){
  const Q=4n*BigInt(outlets.filter(s=>s.m.item===k).length)+fs.reduce((n,f)=>n+(Object.hasOwn(f.rates,k)&&neg(f.rates[k])?ceil(mul(abs(f.rates[k]),D))+1n:0n),0n);
  const B=BigInt(belts.filter(e=>e.b?.m.type==='仓入'&&e.accepted.has(k)).length)+fs.reduce((n,f)=>n+(Object.hasOwn(f.rates,k)&&!neg(f.rates[k])?ceil(mul(abs(f.rates[k]),D)):0n),0n);
  stock.set(k,0n);thresholds.set(k,Q);caps.set(k,Q+BigInt(stockFactor)*(B+BigInt(fs.length+1)));reserved.set(k,0n);
 }
 const stockAdd=(k,n)=>{if(stock.has(k))stock.set(k,stock.get(k)+BigInt(n));};
 const available=k=>{const v=(stock.get(k)||0n)-(reserved.get(k)||0n)-(frozenReserved.get(k)||0n);return v>0n?v:0n;};
 const clocks=[];
 for(const f of fs){
  const entries=Object.entries(f.rates).filter(([,v])=>cmp(q(v),Z)!==0);
  if(!entries.length)continue;
  if(spec.unlimitedWarehouse||!entries.some(([k])=>tracked.has(k)))continue; // constant duty 1, no scheduling effect
  const vals=entries.map(([,v])=>abs(v)),den=vals.reduce((a,v)=>lcm(a,v.d),1n),ints=vals.map(v=>v.n*(den/v.d)),num=ints.reduce((a,v)=>gcd(a,v),0n),unit=q({n:num,d:den}),ratios=ints.map(v=>v/num),step=mul(unit,D);
  const L=entries.reduce((a,[,v],i)=>neg(v)?lcm(a,ratios[i]):a,step.d),stepInt=step.n*(L/step.d);
  if(L>1000000000000n||stepInt>1000000000000000n)return fail('frozen phase budget');
  clocks.push({id:f.id,entries,ratios,L,stepInt,p:0n});
 }
 function frozenStep(){
  frozenReserved.clear();
  for(const f of clocks){
   const {entries,ratios,L,stepInt,p}=f,phases=ratios.map(v=>p*v%L);
   let service=stepInt;
   for(let i=0;i<entries.length;i++)if(neg(entries[i][1])){
    const a=available(entries[i][0]),limit=a===0n?0n:(a*L-phases[i])/ratios[i];if(limit<service)service=limit;
   }
   if(service<=0n)continue;
   for(let i=0;i<entries.length;i++){
    const [k,v]=entries[i],n=(phases[i]+service*ratios[i])/L,minus=neg(v);
    stockAdd(k,minus?-n:n);
    inc((minus?'outflow:':'inflow:')+k,n);inc((minus?'frozenOut:':'frozenIn:')+k,n);
   }
   f.p=(p+service)%L;inc('service:'+f.id,service);
   const inputs=entries.filter(([,v])=>neg(v)).map(([k])=>k);
   if(inputs.every(k=>available(k)>=1n))for(const k of inputs)frozenReserved.set(k,(frozenReserved.get(k)||0n)+1n);
  }
 }
 function reserve(){
  for(const s of outlets){
   const k=s.m.item,a=spec.unlimitedWarehouse?3n:available(k),n=Number(a<BigInt(3-s.claim)?a:BigInt(3-s.claim));
   if(n){s.claim+=n;changed=true;if(!spec.unlimitedWarehouse)reserved.set(k,reserved.get(k)+BigInt(n));}
  }
 }
 let clock=0,events=0,changed=true,checkpoints=0;
 const started=performance.now(), seen=new Map();
 function send(s,p,k){
  const e=s.outs.get(p);if(!e||s.send.get(p)>0||e.pos.length&&e.pos.at(-1)<spacing||e.filter&&e.filter!=='任意'&&e.filter!==k||e.b&&!e.accepted.has(k))return false;
  e.items.push(k);e.pos.push(0);s.send.set(p,P);changed=true;inc('routeTotal:'+e.r.id);inc('flow:'+e.r.id+'|'+k);return true;
 }
 function accept(e){
  const s=e.b;if(!s||!e.items.length||e.pos[0]!==e.end)return false;
  const k=e.items[0],p=e.r.toPort;if(!e.accepted.has(k))return false;
  if(s.m.type==='仓入'){inc('inflow:'+k);inc('localIn:'+k);stockAdd(k,1n);}
  else{
   if(s.recv.get(p)>0)return false;
   if(s.m.recipe){const n=s.input.get(k);if(n===undefined||n>=3*s.m.recipe.inputs[k])return false;s.input.set(k,n+1);}
   else if(['分流','汇流','电脑'].includes(s.m.type)){if(s.queue.length>=(s.m.type==='电脑'?10:3))return false;s.queue.push(k);}
   else return false;
   s.recv.set(p,P);
  }
  e.items.shift();e.pos.shift();changed=true;return true;
 }
 function scan(s,fn){for(let i=0;i<s.order.length;i++){const j=(s.rr+i)%s.order.length,r=fn(s.order[j]);if(r===-1)break;if(r){s.rr=(j+1)%s.order.length;break;}}}
 const marker=active.filter(s=>s.m.recipe).sort((a,b)=>b.T-a.T)[0]?.m.id;
 let markerChanged=false;
 function batch(s){inc('cycle:'+s.m.id);if(s.m.id===marker)markerChanged=true;changed=true;s.output+=s.m.recipe.qty;}
 function nextGap(){
  if(!skipIdle||changed||clocks.length)return 1;
  let h=Infinity;const consider=x=>{if(x>0&&x<h)h=x;};
  for(const s of active){
   for(const x of s.send.values())consider(x);
   for(const x of s.recv.values())consider(x);
   if(s.m.recipe){
    if(s.input.size)consider(s.timer);
    else if(s.output+s.m.recipe.qty<=20*s.m.recipe.qty)consider(s.T-s.timer);
   }else if(s.m.type==='电脑'&&s.queue.length)consider(P-s.timer);
  }
  for(const e of belts)if(e.pos.length){
   consider(e.end-e.pos[0]);
   if(e.end-(e.pos.length-1)*spacing>=spacing)consider(spacing-e.pos.at(-1));
  }
  return Number.isFinite(h)?h:1;
 }
 function step(h){
  clock+=h;events++;changed=false;markerChanged=false;
  for(const s of active){
   s.wasEmpty=s.queue.length===0;
   for(const [p,x] of s.send)s.send.set(p,Math.max(0,x-h));
   for(const [p,x] of s.recv)s.recv.set(p,Math.max(0,x-h));
  }
  for(const e of belts)for(let j=0;j<e.pos.length;j++)e.pos[j]=Math.min(e.pos[j]+h,e.end-j*spacing);
  for(const s of active)if(s.m.type!=='汇流')for(const e of s.ins)accept(e);
  frozenStep();reserve();
  for(const s of active){
   const m=s.m,r=m.recipe;
   if(m.type==='仓出'){if(m.item&&s.claim&&(spec.unlimitedWarehouse||stock.get(m.item)>0n)&&send(s,0,m.item)){s.claim--;if(!spec.unlimitedWarehouse){stockAdd(m.item,-1n);reserved.set(m.item,reserved.get(m.item)-1n);}inc('outflow:'+m.item);inc('localOut:'+m.item);}continue;}
   if(m.type==='电脑'){
    if(s.queue.length){s.timer+=s.wasEmpty?1:h;if(s.timer>=P){s.timer-=P;s.queue.shift();changed=true;}if(!s.queue.length)s.timer=0;}else s.timer=0;continue;
   }
   if(m.type==='分流'){
    if(s.queue.length)scan(s,p=>{const e=s.outs.get(p),k=s.queue[0];if(!e)return false;if(e.filter&&e.filter!=='任意'&&e.filter!==k)return -1;if(send(s,p,k)){s.queue.shift();return true;}return false;});
    continue;
   }
   if(m.type==='汇流'){
    if(s.queue.length&&send(s,0,s.queue[0]))s.queue.shift();
    if(s.queue.length<3)scan(s,p=>{const e=s.ins.find(x=>x.r.toPort===p);return !!e&&accept(e);});
    continue;
   }
   if(!r)continue;
   if(s.input.size){
    if(s.timer){s.timer=Math.max(0,s.timer-h);if(!s.timer)batch(s);}
    if(!s.timer&&s.output+r.qty<=20*r.qty&&[...s.input].every(([k,n])=>n>=r.inputs[k])){
     for(const [k,n] of s.input)s.input.set(k,n-r.inputs[k]);s.timer=s.T;changed=true;
    }
   }else if(s.output+r.qty<=20*r.qty){
    s.timer+=h;if(s.timer>=s.T){s.timer-=s.T;batch(s);}
   }
   if(s.output&&send(s,0,r.output))s.output--;
  }
  for(const [k,v] of stock)if(v>caps.get(k)){stock.set(k,caps.get(k));clipped.add(k);changed=true;}
 }
 function key(){
  const a=[changed?1:0];
  for(const s of active){
   a.push(s.timer,s.output,s.rr,s.claim,...s.input.values(),...s.send.values());
   if(s.m.type!=='仓入')a.push(...s.recv.values());
   a.push(s.queue.length,...s.queue.map(code));
  }
  for(const e of belts){a.push(e.pos.length);for(let i=0;i<e.pos.length;i++)a.push(e.pos[i],code(e.items[i]));}
  for(const [k,v] of stock)a.push(v,clipped.has(k)?1:0);for(const f of clocks)a.push(f.p);
  return a.join(',');
 }
 function checkpoint(){
  const k=key(),prev=seen.get(k);
  if(!prev){if(seen.size>=maxCheckpoints)return fail('checkpoint memory budget',{clock,events,checkpoints});seen.set(k,{clock,events,counter:new Map(counter)});checkpoints++;return null;}
  const period=clock-prev.clock;if(period<=0)throw Error('invalid repeated state');
  const duration=mul(q(period),D),values={},routeRates=[],machineRates=[],frozenDuties=[];
  for(const [k,v] of counter)if(!k.startsWith('service:'))values[k]=txt(div(q(String(v-(prev.counter.get(k)||0n))),duration));
  for(const f of fs){
   const fc=clocks.find(c=>c.id===f.id),k='service:'+f.id,duty=fc?txt(div(q(String((counter.get(k)||0n)-(prev.counter.get(k)||0n))),q(String(BigInt(period)*fc.stepInt)))):'1';
   frozenDuties.push({factory:f.id,duty,proven:true,method:'exact-event-recurrent-state'});values['duty:'+f.id]=duty;
  }
  for(const e of belts)for(const item of codes.keys()){
   const k='flow:'+e.r.id+'|'+item,rate=values[k]||'0';
   routeRates.push({route:e.r.id,item,rate,proven:true,method:'exact-event-recurrent-state'});
  }
  for(const s of active)if(s.m.recipe)machineRates.push({machine:s.m.id,rate:values['cycle:'+s.m.id]||'0',proven:true,method:'exact-event-recurrent-state'});
  return {status:'proved',scope:'exact-rational-fixed-tick',method:'integer-event-boundary-repeated-state',prefixTicks:prev.clock,periodTicks:period,periodSeconds:txt(duration),events,cycleEvents:events-prev.events,checkpoints,clipped:[...clipped],stockCaps:Object.fromEntries([...caps].map(([k,v])=>[k,String(v)])),values,routeRates,machineRates,frozenDuties,elapsedMs:Math.round(performance.now()-started)};
 }
 checkpoint();
 while(events<maxEvents){
  if(events%256===0&&performance.now()-started>ms)return fail('event time budget',{clock,events,checkpoints});
  for(const k of clipped)if(stock.get(k)<thresholds.get(k))return fail('clipping followed by low stock',{item:k,clock,events,checkpoints,stockFactor});
  step(diagnosticTicks===null?nextGap():Math.min(nextGap(),diagnosticTicks-clock));
  for(const k of clipped)if(stock.get(k)<thresholds.get(k))return fail('clipping followed by low stock',{item:k,clock,events,checkpoints,stockFactor});
  if(diagnosticTicks!==null){if(clock===diagnosticTicks)return {status:'diagnostic-only',clock,events,counts:Object.fromEntries([...counter].map(([k,v])=>[k,String(v)])),stateKey:key()};continue;}
  if(markerChanged||events%1024===0||(!changed&&nextGap()===1)){
   const r=checkpoint();if(r)return r;
  }
 }
 return fail('event count budget',{clock,events,checkpoints});
 }catch(e){if(/noncommensurate|invalid physical topology/.test(e.message))return fail(e.message);throw e;}
}
module.exports={proveExactEventOrbit};
