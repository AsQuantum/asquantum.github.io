'use strict';
// A clock driven by the actual successful INPUT receipts of a
// homogeneous splitter. Unlike its output dispatches, these are P-spaced
// (its FIFO may dispatch a burst after a stall). Interpolate the input
// receipt count linearly, at one virtual second per packet. This clock
// is nondecreasing and 1-Lipschitz in real time.
//
// A continuously eligible branch is selected within n successful scans.
// Each newly received packet in that eligible interval forces a
// successful dispatch in the same frame. Thus <=n input-clock units
// elapse until selection. The previous send cooldown needs no extra
// input-clock unit: its open P window contains at most one new receipt.
// If no new receipt occurs, the next n successful scans suffice.
// If one occurs and a later successful dispatch occurs before cooldown
// ends, its non-target port advances the pointer away from the first
// connected port after target; at most n-1 scans remain. Otherwise the
// packet is still in FIFO at cooldown end; at least one dispatch then
// occurs before the next input receipt (separated by P), leaving at
// most n-1 new receipts. If the maximum n new receipts is attained,
// the last one coincides with the target dispatch, so interpolation
// cannot add a fractional unit. If belt space recovers later, apply
// the n-scan bound from that recovery instead.
// For the j-th branch head use the clock shifted back by the fixed
// belt travel L/2. The belt-space dependency R_(j-K)+d is no later
// than R_(j-1)-Ld, since receipt gaps >=P, K=L+1, d=P/2.
// The next head/eligible receive is therefore <=n virtual seconds
// after the previous receipt (up to a finite initial boundary).
//
// Other dedicated ingredients have ordinary, real-time head clocks.
// For a warehouse gate we require high stock THROUGHOUT the interval;
// direct or single homogeneous splitter feed only. Reuse the saturated
// root nP head-clock contract of saturated_router_proof.js. A fixed graph supplies a uniform finite
// startup bound independent of the interval start. With free output,
// after each batch start, all needed packets are available in at most
// H=max(T,a_target*n,a_k*h_k) virtual seconds. This proves on
// every such interval Delta batches >= Delta splitter input/H - O(1).
//
// To remove the high-stock hypothesis, examine the LAST low-stock
// frame of any required gate. At that prefix, its net count is O(1).
// If the affine necessary count envelope restricted to net=0 implies
// the same relative inequality, the prefix is bounded too. Concatenate
// the prefix and high-stock suffix. Compactness of bounded prefix
// counts makes the prefix error o(t), without assuming mean existence.
function relativeServiceCandidates(g,A,freeRoutes){
 const {q,cmp,div,mul,txt,Z,U}=A,ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const fixed=t=>cmp(q(t),U)>=0&&div(q(t),q('1/20')).d===1n;
 const free=new Set(freeRoutes),out=[];
 function splitter(m,e){
  if(!complete(m)||m.type!=='分流')return null;
  const ins=I.get(m.id),outs=O.get(m.id),k=e.materials[0];
  return ins.length===1&&ins[0].toPort===0&&outs.length>=2&&outs.length<=3&&outs.includes(e)&&[...ins,...outs].every(x=>valid(x)&&x.materials[0]===k)?{input:ins[0],n:outs.length}:null;
 }
 function root(e){
  const m=ns.get(e.from),r=m.recipe;
  if(!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||e.fromPort!==0||!valid(e))return null;
  if(m.type==='仓出'&&m.item===e.materials[0])return {gap:U,gate:m.item};
  if(r&&Object.keys(r.inputs||{}).length===0&&r.qty===1&&r.output===e.materials[0]&&fixed(r.seconds))return {gap:q(r.seconds),gate:null};
  return null;
 }
 function other(e){
  const direct=root(e);if(direct)return direct;
  const sp=splitter(ns.get(e.from),e);if(!sp)return null;
  const supply=root(sp.input);
  // Only warehouse feeds here, so the source is saturated whenever
  // the gate stays high. No inference from a known average source.
  return supply?.gate?{gap:q(sp.n),gate:supply.gate}:null;
 }
 for(const m of g.nodes){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id);
  if(!r||r.qty!==1||!fixed(r.seconds)||!complete(m)||outs.length!==1||!valid(outs[0])||r.output!==outs[0].materials[0]||
   !(free.has(outs[0].id)||independentFinalReceiver(outs[0],ns,I,O)))continue;
  const keys=Object.keys(r.inputs||{});
  if(!keys.length||keys.length!==ins.length||ins.some(e=>!valid(e))||keys.some(k=>!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<1||ins.filter(e=>e.materials[0]===k).length!==1))continue;
  for(const e of ins){
   const sp=splitter(ns.get(e.from),e);if(!sp)continue;
   const gates=new Set(),clocks=[{route:e.id,kind:'relative',gap:String(sp.n)}];let H=q(r.seconds),ok=true;
   const h=mul(q(r.inputs[e.materials[0]]),q(sp.n));if(cmp(h,H)>0)H=h;
   for(const x of ins.filter(x=>x!==e)){
    const c=other(x);if(!c){ok=false;break;}
    if(c.gate)gates.add(c.gate);
    const v=mul(q(r.inputs[x.materials[0]]),c.gap);if(cmp(v,H)>0)H=v;
    clocks.push({route:x.id,kind:'real',gap:txt(c.gap),gate:c.gate});
   }
   if(ok)out.push({machine:m.id,input:sp.input.id,branch:e.id,item:e.materials[0],gates:[...gates],period:txt(H),ratio:txt(div(U,H)),clocks});
  }
 }
 return out;
}
function proveRelativeSplitterService(g,A,problem,freeRoutes,netLower,options={}){
 const out={relations:[],witnesses:[]},candidates=relativeServiceCandidates(g,A,freeRoutes);
 const deadline=options.deadline??Infinity,remaining=()=>Math.max(0,deadline-performance.now());
 const rat=x=>{const v=A.q(x),n=v.n<0n?-v.n:v.n;const a=v.d===1n?String(n):'(/ '+n+' '+v.d+')';return v.n<0n?'(- '+a+')':a;};
 const term=k=>problem.observables[k]??(Object.hasOwn(problem.structuralConstants,k)?rat(problem.structuralConstants[k]):null);
 for(const c of candidates){
  const target='cycle:'+c.machine,source='routeTotal:'+c.input,a=term(target),b=term(source);if(a==null||b==null)continue;
  const ratio=A.q(c.ratio),negative=A.txt(A.sub(A.Z,ratio)),evidence=[];let ok=true;
  for(const k of c.gates){
   if(g.unlimited||netLower[k]!=null&&A.cmp(A.q(netLower[k]),A.Z)>0)continue;
   const stock=term('net:'+k);
   if(stock==null||remaining()<30){ok=false;break;}
   const name='v_relative_service';
   const p={...problem,smt:problem.smt+'\n(declare-const '+name+' Real)\n(assert (= '+name+' (- '+a+' (* '+rat(ratio)+' '+b+'))))\n(assert (= '+stock+' 0))',observables:{...problem.observables,relativeService:name}};
   const bound=projectCountInterval(p,A,'relativeService',{ms:Math.min(200,remaining()),maxRows:options.maxRows??12000});
   if(bound.status==='contradiction'){evidence.push({gate:k,impossibleLowStock:true});continue;}
   if(bound.status!=='interval'||bound.lower==null||A.cmp(A.q(bound.lower),A.Z)<0){ok=false;break;}
   evidence.push({gate:k,lower:bound.lower});
  }
  if(!ok)continue;
  out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'relative-splitter-service-last-low',sense:'le',coefficients:{[target]:-1,[source]:c.ratio},constant:'0'});
  out.witnesses.push({method:'relative-splitter-service-last-low',...c,lowStockEvidence:evidence});
 }
 return out;
}
