'use strict';
const {makeBDD,makeWords,solveSymbolicFunction}=require('./symbolic_bdd');
function compileSymbolicPhysical(spec,arith,{dt='1/20',maxNodes=350000,ms=15000,maxBits=1200,stockFactor=1,collectGuards=false}={}){
 const {q,cmp,mul,div,Z,U}=arith,D=q(dt),b=makeBDD({maxNodes,ms}),w=makeWords(b),{c,pick,add,sub,lt,le,eq,nonzero,min,max,satSub,mul:times,divmod,bit}=w;
 const {and,or,not}=b,neg=v=>cmp(q(v),Z)<0,abs=v=>neg(v)?arith.sub(Z,q(v)):q(v);
 const whole=(r,label)=>{if(r.d!==1n||r.n<0n||r.n>1000000n)throw Error('unsupported grid '+label);return Number(r.n);};
 const P=whole(div(U,D),'cooldown'),spacing=whole(div(q('1/2'),D),'spacing');
 if(P<1||spacing<1||!Number.isSafeInteger(stockFactor)||stockFactor<1||spec.initial!=='empty')throw Error('unsupported initial or clock');
 const ns=new Map(spec.machines.map(m=>[m.id,m])),rs=new Map(spec.routes.map(r=>[r.id,r]));
 const I=new Map(spec.machines.map(m=>[m.id,[]])),O=new Map(spec.machines.map(m=>[m.id,[]])),fs=spec.frozen||[];
 if(ns.size!==spec.machines.length||rs.size!==spec.routes.length||new Set(fs.map(f=>f.id)).size!==fs.length)throw Error('duplicate IDs');
 for(const r of spec.routes){
  if(!ns.has(r.from)||r.to!==null&&!ns.has(r.to)||!Number.isSafeInteger(r.length)||r.length<1||!ns.get(r.from).outPorts.some(p=>p.index===r.fromPort)||r.to!==null&&!ns.get(r.to).inputPriority.includes(r.toPort)||O.get(r.from).some(e=>e.fromPort===r.fromPort)||r.to!==null&&I.get(r.to).some(e=>e.toPort===r.toPort))throw Error('invalid physical topology');
  O.get(r.from).push(r);if(r.to!==null)I.get(r.to).push(r);
 }
 const items=[...new Set([...spec.machines.flatMap(m=>[...(m.item?[m.item]:[]),...(m.recipe?[m.recipe.output,...Object.keys(m.recipe.inputs)]:[])]),...fs.flatMap(f=>Object.keys(f.rates))])],itemCode=new Map(items.map((k,i)=>[k,i+1]));
 const id=k=>c(itemCode.get(k)||0),filter=r=>ns.get(r.from).outPorts.find(p=>p.index===r.fromPort)?.filter||'';
 // Overapproximate alphabets by finite set closure, including unreachable
 // warehouse sources. Never infer numerical rates from this closure.
 const alph=new Map(spec.routes.map(r=>[r.id,new Set()]));
 let changed=true;while(changed){changed=false;for(const r of spec.routes){
  if(r.to===null)continue;
  const m=ns.get(r.from),k=filter(r),a=m.recipe?[m.recipe.output]:m.type==='仓出'?[m.item]:['分流','汇流'].includes(m.type)?I.get(m.id).flatMap(e=>[...alph.get(e.id)].filter(j=>e.accepted.includes(j))):[];
  for(const j of a)if(itemCode.has(j)&&(!k||k==='任意'||k===j)&&!alph.get(r.id).has(j)){alph.get(r.id).add(j);changed=true;}
 }}
 const fields=[],initial=[],next=[],rewards={},guards={},clips=[],keys=new Set();
 function field(name,cap,init=0){
  cap=BigInt(cap);if(cap<0n||cap>1000000000000n||keys.has(name))throw Error('invalid state field '+name);keys.add(name);
  const len=cap===0n?0:c(cap).length,offset=initial.length;
  if(offset+len>maxBits)throw Error('symbolic bit budget');
  const a=Array.from({length:len},(_,j)=>{initial.push(Number((BigInt(init)>>BigInt(j))&1n));return b.variable(2*(offset+j));});
  const f={name,cap,bits:len,offset,v:a.length?a:c(0),set(x){this.v=x.slice(0,len||1);}};fields.push(f);return f;
 }
 const put=(f,v,cond=1)=>f.set(pick(cond,v,f.v));
 const inc=(f,n,cond=1)=>put(f,add(f.v,c(n)),cond),dec=(f,n,cond=1)=>put(f,satSub(f.v,c(n)),cond);
 function reward(k,value){rewards[k]=add(rewards[k]||c(0),value);}
 const pulse=(k,cond)=>reward(k,[cond]);
 function mark(k,r){if(collectGuards)guards[k]=or(guards[k]||0,r);}
 const any=xs=>xs.reduce(or,0),all=xs=>xs.reduce(and,1);
 function queue(name,cap,alphabet,positions=0){
  const a=[...new Set(alphabet)],hom=a.length<=1;
  const len=field(name+'.len',a.length?cap:0);
  const material=hom?[]:Array.from({length:cap},(_,i)=>field(name+'.item'+i,items.length));
  const pos=positions&&a.length?Array.from({length:cap},(_,i)=>field(name+'.pos'+i,positions)):[];
  function front(){return hom?id(a[0]):material[0].v;}
  function lastPos(){let p=c(0);for(let i=0;i<pos.length;i++)p=pick(eq(len.v,c(i+1)),pos[i].v,p);return p;}
  function pop(cond){
   for(let i=0;i<material.length;i++)put(material[i],material[i+1]?.v||c(0),cond);
   for(let i=0;i<pos.length;i++)put(pos[i],pos[i+1]?.v||c(0),cond);
   dec(len,1,cond);
  }
  function push(cond,item){
   const old=len.v;
   for(let i=0;i<material.length;i++)put(material[i],item,and(cond,eq(old,c(i))));
   for(let i=0;i<pos.length;i++)put(pos[i],c(0),and(cond,eq(old,c(i))));
   inc(len,1,cond);
  }
  return {cap,len,pos,alphabet:a,front,lastPos,pop,push};
 }
 // Inventory is finite only after the separately verified clipping lift.
 const outlets=spec.machines.filter(m=>m.type==='仓出'&&m.item);
 const tracked=new Set([...outlets.map(m=>m.item),...fs.flatMap(f=>Object.entries(f.rates).filter(([,v])=>neg(v)).map(([k])=>k))]);
 const ceil=x=>(x.n+x.d-1n)/x.d;
 const stock=new Map(),frozenReserved=new Map(),thresholds=new Map(),caps=new Map(),low=new Map();
 for(const k of tracked){
  const Q=4n*BigInt(outlets.filter(m=>m.item===k).length)+fs.reduce((s,f)=>s+(Object.hasOwn(f.rates,k)&&neg(f.rates[k])?ceil(mul(abs(f.rates[k]),D))+1n:0n),0n);
  const B=BigInt(spec.routes.filter(r=>r.to!==null&&ns.get(r.to).type==='仓入'&&alph.get(r.id).has(k)).length)+fs.reduce((s,f)=>s+(Object.hasOwn(f.rates,k)&&!neg(f.rates[k])?ceil(mul(abs(f.rates[k]),D)):0n),0n);
  const C=Q+BigInt(stockFactor)*(B+BigInt(fs.length+1));
  thresholds.set(k,Q);caps.set(k,C);const f=field('stock:'+k,spec.unlimitedWarehouse?0:C);stock.set(k,{f,v:f.v});low.set(k,lt(f.v,c(Q)));frozenReserved.set(k,c(0));
 }
 const states=new Map(),belts=new Map();
 for(const m of spec.machines){
  const r=m.recipe,s={m,rec:r,send:new Map(),receive:new Map()};
  for(const e of O.get(m.id))if(alph.get(e.id).size)s.send.set(e.fromPort,field(m.id+'.send'+e.fromPort,P));
  for(const e of I.get(m.id))if(m.type!=='仓入'&&alph.get(e.id).size)s.receive.set(e.toPort,field(m.id+'.recv'+e.toPort,P));
  if(r){
   if(!Number.isSafeInteger(r.qty)||r.qty<1||Object.values(r.inputs).some(x=>!Number.isSafeInteger(x)||x<1))throw Error('invalid recipe');
   s.T=whole(div(q(r.seconds),D),'recipe period');if(!s.T)throw Error('invalid period');
   s.output=field(m.id+'.output',20*r.qty);s.timer=field(m.id+'.timer',s.T);
   s.inputs=new Map(Object.entries(r.inputs).map(([k,a])=>[k,field(m.id+'.input:'+k,3*a)]));
  }else if(m.type==='分流'||m.type==='汇流'||m.type==='电脑'){
   const a=I.get(m.id).flatMap(e=>[...alph.get(e.id)].filter(j=>e.accepted.includes(j)));s.fifo=queue(m.id+'.fifo',m.type==='电脑'?10:3,a);
   if(m.type==='电脑')s.timer=field(m.id+'.consumer',P-1);
   else{s.order=m.type==='分流'?m.outPorts.map(p=>p.index):m.mergerPriority;s.rr=field(m.id+'.rr',Math.max(0,s.order.length-1));}
  }else if(m.type==='仓出'){
   s.buffer=field(m.id+'.outletBuffer',m.item?3:0);
   s.refill=field(m.id+'.refill',m.item?P:0,m.item?P:0);
  }
  states.set(m.id,s);
 }
 for(const r of spec.routes){const len=r.length*spacing,queue0=queue('belt:'+r.id,r.length+1,[...alph.get(r.id)],len);belts.set(r.id,{...queue0,r,end:len});}
 // Cooldown ages saturate at zero and never retain absolute time.
 for(const s of states.values())for(const f of [...s.send.values(),...s.receive.values(),...(s.refill?[s.refill]:[])])dec(f,1);
 for(const e of belts.values())for(let i=0;i<e.pos.length;i++){
  const f=e.pos[i],bound=i?satSub(e.pos[i-1].v,c(spacing)):c(e.end),mov=max(f.v,min(bound,add(f.v,c(1))));
  f.set(pick(lt(c(i),e.len.v),mov,c(0)));
 }
 function stockAdd(k,v,subtract=false){if(spec.unlimitedWarehouse||!stock.has(k))return;const x=stock.get(k);x.v=subtract?sub(x.v,v):add(x.v,v);}
 function wareReward(k,direction,value,local){reward(direction+':'+k,value);if(local)reward('local'+(direction==='inflow'?'In':'Out')+':'+k,value);else reward('frozen'+(direction==='inflow'?'In':'Out')+':'+k,value);}
 function accept(e,allowed=1){
  const {r}=e;if(r.to===null||!e.alphabet.length)return 0;
  const s=states.get(r.to),item=e.front(),head=all([allowed,nonzero(e.len.v),eq(e.pos[0].v,c(e.end)),any(e.alphabet.filter(k=>r.accepted.includes(k)).map(k=>eq(item,id(k))))]);
  let ready=head;
  if(s.m.type==='仓入'){
   for(const k of e.alphabet){const v=and(ready,eq(item,id(k)));stockAdd(k,[v]);wareReward(k,'inflow',[v],true);}
  }else{
   const recv=s.receive.get(r.toPort);if(!recv)return 0;mark('recvCooldown:'+r.id,and(head,nonzero(recv.v)));ready=and(ready,not(nonzero(recv.v)));
   if(s.rec){
    const allow=any([...s.inputs].map(([k,f])=>and(eq(item,id(k)),lt(f.v,c(3*s.rec.inputs[k])))));
    mark('recvBufferFull:'+r.id,and(ready,not(allow)));ready=and(ready,allow);for(const [k,f] of s.inputs)inc(f,1,and(ready,eq(item,id(k))));
   }else if(s.fifo){const space=lt(s.fifo.len.v,c(s.fifo.cap));mark('recvBufferFull:'+r.id,and(ready,not(space)));ready=and(ready,space);s.fifo.push(ready,item);}
   else return 0;
   put(recv,c(P),ready);
  }
  e.pop(ready);mark('accepted:'+r.id,ready);return ready;
 }
 // All ordinary deliveries precede frozen consumers; only same-machine
 // simultaneous arrivals compete. Per-machine rank is physical, not ID.
 for(const m of spec.machines)if(m.type!=='汇流')for(const r of I.get(m.id).slice().sort((a,d)=>m.inputPriority.indexOf(a.toPort)-m.inputPriority.indexOf(d.toPort)))accept(belts.get(r.id));
 // One common exact rational service-clock phase per frozen configuration.
 const gcd=(a,d)=>d?gcd(d,a%d):a,lcm=(a,d)=>a/gcd(a,d)*d;
 function available(k){if(spec.unlimitedWarehouse)return c(0);const x=stock.get(k);return x?satSub(x.v,frozenReserved.get(k)):c(0);}
 // Actual stock transfers before any frozen producer or consumer.
 if(new Set(spec.priority).size!==spec.priority.length||outlets.some(m=>!spec.priority.includes(m.id)))throw Error('invalid warehouse priority');
 for(const id0 of spec.priority){
  const s=states.get(id0),k=s?.m.item;if(!s?.buffer||!k)continue;
  const space=lt(s.buffer.v,c(3)),cool=not(nonzero(s.refill.v)),has=spec.unlimitedWarehouse?1:nonzero(stock.get(k).v);
  const ok=all([space,cool,has]);
  mark('refillFull:'+id0,not(space));mark('refillCooling:'+id0,not(cool));mark('refillShort:'+id0,all([space,cool,not(has)]));
  mark('refilled:'+id0,ok);pulse('refill:'+id0,ok);
  inc(s.buffer,1,ok);put(s.refill,c(P),ok);stockAdd(k,[ok],true);wareReward(k,'outflow',[ok],true);
 }
 for(const f of fs){
  const entries=Object.entries(f.rates).filter(([,v])=>cmp(q(v),Z)!==0);
  if(!entries.length)continue;
  const vals=entries.map(([,v])=>abs(v)),den=vals.reduce((a,v)=>lcm(a,v.d),1n),ints=vals.map(v=>v.n*(den/v.d)),num=ints.reduce((a,v)=>gcd(a,v),0n),unit=q({n:num,d:den}),ratios=ints.map(v=>v/num),step=mul(unit,D);
  const L=entries.reduce((a,[,v],i)=>neg(v)?lcm(a,ratios[i]):a,step.d),stepInt=step.n*(L/step.d);
  if(L>1000000n||stepInt>1000000000000n||ratios.some(v=>v>1000000000000n))throw Error('frozen clock budget');
  const phase=field('frozen:'+f.id+'.phase',L-1n),p=phase.v;
  const phases=ratios.map(v=>divmod(times(p,v),L)[1]);
  let service=c(stepInt);
  if(!spec.unlimitedWarehouse)for(let i=0;i<entries.length;i++)if(neg(entries[i][1])){
   const k=entries[i][0],avail=available(k);
   const limit=divmod(satSub(times(avail,L),phases[i]),ratios[i])[0];
   mark('frozenResourceLimited:'+f.id+'|'+k,or(not(nonzero(avail)),lt(limit,c(stepInt))));service=pick(nonzero(avail),min(service,limit),c(0));
  }
  for(let i=0;i<entries.length;i++){const [k,v]=entries[i],n=divmod(add(phases[i],times(service,ratios[i])),L)[0];stockAdd(k,n,neg(v));wareReward(k,neg(v)?'outflow':'inflow',n,false);}
  phase.set(divmod(add(p,service),L)[1]);reward('service:'+f.id,service);
  mark('frozenLimited:'+f.id,lt(service,c(stepInt)));mark('frozenStopped:'+f.id,not(nonzero(service)));
  if(!spec.unlimitedWarehouse){
   const inputs=entries.filter(([,v])=>neg(v)).map(([k])=>k),protect=and(nonzero(service),all(inputs.map(k=>nonzero(available(k)))));
   for(const k of inputs)frozenReserved.set(k,add(frozenReserved.get(k),[protect]));
  }
  f.serviceUnit=String(stepInt);
 }
 function send(s,port,item,allowed){
  const r=O.get(s.m.id).find(e=>e.fromPort===port);if(!r||r.to===null)return 0;
  const e=belts.get(r.id),cool=s.send.get(port);if(!cool||!e.alphabet.length)return 0;
  const readyCool=not(nonzero(cool.v)),readySpace=and(lt(e.len.v,c(e.cap)),or(not(nonzero(e.len.v)),le(c(spacing),e.lastPos()))),compatible=any(e.alphabet.map(k=>eq(item,id(k))));
  mark('sendCooldown:'+r.id,and(allowed,not(readyCool)));
  mark('sendBlocked:'+r.id,all([allowed,readyCool,compatible,not(readySpace)]));
  const ok=all([allowed,readyCool,readySpace,compatible]);
  e.push(ok,item);put(cool,c(P),ok);
  pulse('routeTotal:'+r.id,ok);for(const k of e.alphabet)pulse('flow:'+r.id+'|'+k,and(ok,eq(item,id(k))));
  return ok;
 }
 function scan(s,fn){
  const order=s.order;if(!order?.length)return;
  const rr=s.rr.v;let chosen=0,stop=0;const crossings=new Map(),skips=new Map();
  for(let step=0;step<order.length;step++)for(let i=0;i<order.length;i++){
   const start=(i-step+order.length)%order.length,port=order[i],eligible=all([eq(rr,c(start)),not(chosen),not(stop)]);
   const {ok,blocked=0}=fn(port,eligible);
   if(collectGuards){
    crossings.set(port,or(crossings.get(port)||0,eligible));
    skips.set(port,or(skips.get(port)||0,all([eligible,not(ok),not(blocked)])));
    mark('rrSent:'+s.m.id+'|'+port,ok);
    mark('rrFilterStop:'+s.m.id+'|'+port,blocked);
   }
   chosen=or(chosen,ok);stop=or(stop,blocked);put(s.rr,c((i+1)%order.length),ok);
  }
  if(collectGuards)for(const port of order){
   mark('rrCross:'+s.m.id+'|'+port,and(chosen,crossings.get(port)||0));
   mark('rrSkip:'+s.m.id+'|'+port,and(chosen,skips.get(port)||0));
  }
 }
 for(const m of spec.machines){
  const s=states.get(m.id),r=s.rec;
  if(m.type==='仓出'){
   const k=m.item;if(!k||!s.buffer)continue;mark('outletEmpty:'+m.id,not(nonzero(s.buffer.v)));const ok=send(s,0,id(k),nonzero(s.buffer.v));
   dec(s.buffer,1,ok);pulse('dispatch:'+m.id,ok);
  }else if(m.type==='电脑'){
   const has=nonzero(s.fifo.len.v),time=add(s.timer.v,c(1)),consume=and(has,le(c(P),time));s.fifo.pop(consume);
   s.timer.set(pick(nonzero(s.fifo.len.v),pick(consume,sub(time,c(P)),time),c(0)));
  }else if(m.type==='分流'){
   const item=s.fifo.front(),has=nonzero(s.fifo.len.v);
   scan(s,(port,eligible)=>{
    const r=O.get(m.id).find(e=>e.fromPort===port);if(!r||r.to===null)return {ok:0};
    const k=filter(r),match=!k||k==='任意'?1:eq(item,id(k)),allow=and(eligible,has),ok=send(s,port,item,and(allow,match));
    s.fifo.pop(ok);return {ok,blocked:and(allow,not(match))};
   });
  }else if(m.type==='汇流'){
   const ok=send(s,0,s.fifo.front(),nonzero(s.fifo.len.v));s.fifo.pop(ok);
   scan(s,(port,eligible)=>{const r=I.get(m.id).find(e=>e.toPort===port);return {ok:r?accept(belts.get(r.id),eligible):0};});
  }else if(r){
   const hasInputs=s.inputs.size>0,space=le(add(s.output.v,c(r.qty)),c(20*r.qty));
   if(!hasInputs){
    const tick=add(s.timer.v,c(1)),finish=and(space,le(c(s.T),tick));
    mark('working:'+m.id,space);mark('waitOutput:'+m.id,not(space));
    s.timer.set(pick(space,pick(finish,sub(tick,c(s.T)),tick),s.timer.v));inc(s.output,r.qty,finish);pulse('batch:'+m.id,finish);
   }else{
    const busy=nonzero(s.timer.v),finish=and(busy,eq(s.timer.v,c(1)));dec(s.timer,1);inc(s.output,r.qty,finish);pulse('batch:'+m.id,finish);
    const readyInput=all(Array.from(s.inputs,([k,f])=>le(c(r.inputs[k]),f.v))),readyOutput=le(add(s.output.v,c(r.qty)),c(20*r.qty));
    const start=all([not(nonzero(s.timer.v)),readyOutput,readyInput]);
    for(const [k,f] of s.inputs)dec(f,r.inputs[k],start);put(s.timer,c(s.T),start);
    const working=nonzero(s.timer.v),idle=not(working);
    mark('working:'+m.id,working);mark('waitInput:'+m.id,and(idle,not(readyInput)));
    mark('waitOutput:'+m.id,all([idle,readyInput,not(readyOutput)]));
    mark('batchStart:'+m.id,start);
   }
   const ok=send(s,0,id(r.output),nonzero(s.output.v));dec(s.output,1,ok);
  }
 }
 // Clip only at end of complete transition. No truncation of intermediate
 // stock calculations. The symbolic lift checks all reachable clipping.
 for(const [k,x] of stock){
  if(spec.unlimitedWarehouse)continue;const C=c(caps.get(k)),event=lt(C,x.v);clips.push({item:k,event,low:low.get(k)});x.f.set(min(C,x.v));
 }
 for(const f of fields)for(let i=0;i<f.bits;i++)next[f.offset+i]=bit(f.v,i);
 return {ruleVersion:'real-outlet-buffer-20261125',b,next,initial,rewards,guards,clips,fields:fields.map(({name,bits,cap,offset})=>({name,bits,cap:String(cap),offset})),alphabets:Object.fromEntries([...alph].map(([k,v])=>[k,[...v]])),frozenUnits:Object.fromEntries(fs.map(f=>[f.id,f.serviceUnit]))};
}
function proveSymbolicPhysical(spec,arith,options={}){
 try{
  const m=compileSymbolicPhysical(structuredClone(spec),arith,options),r=solveSymbolicFunction(m.b,m.next,m.initial,m.rewards,m.clips,options);
  if(r.status!=='proved')return {...r,scope:'exact-rational-fixed-tick'};
  const {q,div,mul,txt}=arith,duration=mul(q(r.count),q(options.dt??'1/20')),values={};
  for(const [k,v] of Object.entries(r.sums)){
   if(k.startsWith('service:'))values['duty:'+k.slice(8)]=txt(div(q(v),mul(q(r.count),q(m.frozenUnits[k.slice(8)]))));
   else values[k.startsWith('batch:')?'cycle:'+k.slice(6):k]=txt(div(q(v),duration));
  }
  return {...r,values,scope:'exact-rational-fixed-tick',fields:m.fields.length};
 }catch(e){if(/budget|unsupported grid|invalid physical topology|unsupported initial|invalid state field|invalid recipe|invalid period/.test(e.message))return {status:'unknown',reason:e.message,scope:'exact-rational-fixed-tick'};throw e;}
}
module.exports={compileSymbolicPhysical,proveSymbolicPhysical};
