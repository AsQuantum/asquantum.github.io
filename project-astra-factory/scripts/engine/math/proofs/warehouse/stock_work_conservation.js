'use strict';
// High-stock interval theorem: aggregate demand is work-conserving even
// with arbitrary correlated arrivals and multiple partially served actors.
// Only independent exact facts and strict positive net lower bounds enter.
function proveStockWorkConservation(g,arith,values={},netLower={},readyCaps=[],freeCertificates=[]){
 const {q,add,sub,mul,cmp,txt,Z,U}=arith;
 const out={relations:[],witnesses:[],abundant:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const fs=g.frozen||[],outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item),items=new Set([...outlets.map(m=>m.item),...fs.flatMap(f=>Object.keys(f.rates))]);
 const read=k=>values[k]==null?null:q(values[k]);
 const positive=k=>[values['net:'+k],netLower[k]].some(v=>v!=null&&cmp(q(v),Z)>0);
 const abundant=new Set([...items].filter(positive));out.abundant=[...abundant];
 const certifiedFree=new Set(freeCertificates.filter(c=>c.proven===true&&c.method==='refill-buffer-always-has-space-eventually').map(c=>c.machine));
 const negs=f=>Object.entries(f.rates).filter(([,v])=>cmp(q(v),Z)<0);
 function free(m){
  const a=O.get(m.id);
  if(I.get(m.id).length||a.length!==1||m.physicalOutCount!==1)return false;
  const e=a[0],d=ns.get(e.to);
  return e.compatible===true&&e.materials.length===1&&e.materials[0]===m.item&&Number.isSafeInteger(e.length)&&e.length>=1&&
   (certifiedFree.has(m.id)||d.type==='仓入'||d.type==='电脑'&&I.get(d.id).length===1&&d.physicalInCount===1&&O.get(d.id).length===0);
 }
 function emit(query,v,method,detail){
  if(values[query]!=null&&cmp(q(values[query]),v)===0)return;
  out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method,sense:'eq',coefficients:{[query]:1},constant:txt(v)});
  out.witnesses.push({query,value:txt(v),method,...detail});
 }
 const capOf=m=>{const c=readyCaps.find(x=>x.proven===true&&x.machine===m.id&&x.item===m.item&&(x.requiredItems||[m.item]).every(k=>k===m.item||abundant.has(k)));return c?q(c.rate):free(m)?U:null;};
 for(const m of outlets)if(abundant.has(m.item)&&capOf(m)!==null)emit('machineTotal:'+m.id+'|out',capOf(m),'abundant-stock-independent-refill',{machine:m.id,item:m.item});
 for(const f of fs){const inputs=negs(f);if(inputs.length&&inputs.every(([k])=>abundant.has(k)))emit('duty:'+f.id,U,'all-inputs-eventually-abundant',{factory:f.id});}
 for(const item of items){
  const income=read('inflow:'+item);if(income===null)continue;
  let fixed=Z,capacity=Z,valid=true;const remaining=[],fixedActors=[];
  for(const m of outlets.filter(m=>m.item===item)){
   const rate=read('machineTotal:'+m.id+'|out');
   if(rate!==null){fixed=add(fixed,rate);fixedActors.push(m.id);continue;}
   const cap=capOf(m);if(cap===null){valid=false;break;}
   capacity=add(capacity,cap);remaining.push({id:m.id,kind:'outlet',cap:txt(cap)});
  }
  if(!valid)continue;
  for(const f of fs){
   const inputs=negs(f),entry=inputs.find(([k])=>k===item);if(!entry)continue;
   const cap=sub(Z,q(entry[1])),duty=read('duty:'+f.id);
   if(duty!==null){fixed=add(fixed,mul(cap,duty));fixedActors.push(f.id);continue;}
   if(inputs.some(([k])=>k!==item&&!abundant.has(k))){valid=false;break;}
   capacity=add(capacity,cap);remaining.push({id:f.id,kind:'frozen',cap:txt(cap)});
  }
  if(!valid||!remaining.length)continue;
  const residual=sub(income,fixed);if(cmp(residual,Z)<0)continue;
  const service=cmp(residual,capacity)<=0?residual:capacity;
  emit('outflow:'+item,add(fixed,service),'high-stock-interval-work-conservation',{item,income:txt(income),fixed:txt(fixed),capacity:txt(capacity),remaining,fixedActors});
 }
 return out;
}


// If a stock has a known income slope I, a free physical outlet with
// capacity c and every competing prefix-count upper bound U_j,
// then the outlet liminf is at least min(c,max(0,I-sum U_j)).
// At the last low-stock frame s, all withdrawals up to s account for
// the income up to s minus O(1). After s the free outlet can run at c.
// Prefix limsup bounds suffice; do NOT subtract them on arbitrary
// subintervals. This remains valid even without existence of all means.
function proveFreeOutletPrefixResidual(g,A,values,upper,freeCertificates){
 const {q,cmp,add,sub,mul,txt,Z,U}=A,out={relations:[],witnesses:[]};
 if(g.unlimited)return out;
 const free=new Set(freeCertificates.filter(c=>c.proven===true&&c.method==='refill-buffer-always-has-space-eventually').map(c=>c.machine));
 const outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item);
 for(const m of outlets){
  const key='machineTotal:'+m.id+'|out',income=values['inflow:'+m.item];
  if(!free.has(m.id)||income==null||values[key]!=null)continue;
  let competitors=Z;const evidence=[];
  for(const n of outlets.filter(n=>n!==m&&n.item===m.item)){
   const k='machineTotal:'+n.id+'|out',v=values[k]??upper[k]??'1';
   competitors=add(competitors,q(v));evidence.push({key:k,upper:v});
  }
  for(const f of g.frozen||[]){
   const r=q(f.rates[m.item]??'0');if(cmp(r,Z)>=0)continue;
   const k='duty:'+f.id,v=values[k]??upper[k]??'1';
   competitors=add(competitors,mul(sub(Z,r),q(v)));evidence.push({key:k,upper:v});
  }
  let lo=sub(q(income),competitors);if(cmp(lo,Z)<=0)continue;if(cmp(lo,U)>0)lo=U;
  out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'free-outlet-prefix-residual',sense:cmp(lo,U)===0?'eq':'le',coefficients:{[key]:cmp(lo,U)===0?1:-1},constant:txt(cmp(lo,U)===0?lo:sub(Z,lo))});
  out.witnesses.push({method:'free-outlet-prefix-residual',machine:m.id,item:m.item,lower:txt(lo),income,competitors:evidence});
 }
 return out;
}


// A lower service contract on an interval where all needed stocks stay
// high can close the net of one candidate pool without assuming that its
// mean is positive (or even exists). Restrict to dedicated homogeneous
// recipe inlets directly fed by warehouses or by one splitter, with a
// globally proved free output. Root and splitter service clocks are
// the same fixed-frame contracts used by proveSaturatedRouterCounts.
// Known whole-root rates are accounted once; other branch counts are
// disjoint contributions to actual withdrawal (bounded buffer error).
function proveHighStockDemandExhaustion(g,A,values,netLower,freeRoutes){
 const out={relations:[],witnesses:[]};
 if(g.unlimited||g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const {q,cmp,add,mul,div,txt,Z,U}=A,ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0])&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const fixed=t=>cmp(q(t),U)>=0&&div(q(t),q('1/20')).d===1n;
 const positive=k=>[netLower[k],values['net:'+k]].some(v=>v!=null&&cmp(q(v),Z)>0);
 const free=new Set(freeRoutes),outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item);
 function direct(e){
  const m=ns.get(e.from),r=m.recipe;
  if(!valid(e)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||e.fromPort!==0)return null;
  if(m.type==='仓出'&&m.item===e.materials[0])return {gap:U,gate:m.item,root:m.id};
  if(r&&Object.keys(r.inputs||{}).length===0&&r.qty===1&&r.output===e.materials[0]&&fixed(r.seconds))return {gap:q(r.seconds),gate:null,root:m.id};
  return null;
 }
 function supply(e){
  const d=direct(e);if(d)return d;
  const m=ns.get(e.from),ins=I.get(m.id),outs=O.get(m.id),k=e.materials[0];
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0].toPort!==0||outs.length<2||outs.length>3||!outs.includes(e)||![...ins,...outs].every(x=>valid(x)&&x.materials[0]===k))return null;
  const root=direct(ins[0]);return root?.gate?{...root,gap:q(outs.length)}:null;
 }
 for(const k of new Set(outlets.map(m=>m.item))){
  const inc=values['inflow:'+k];if(inc==null||values['net:'+k]!=null||positive(k))continue;
  let demand=Z;const knownRoots=new Set(),evidence=[];
  for(const m of outlets.filter(m=>m.item===k)){
   const r=values['machineTotal:'+m.id+'|out'];
   if(r!=null){knownRoots.add(m.id);demand=add(demand,q(r));evidence.push({root:m.id,rate:r,kind:'known-prefix'});}
  }
  for(const f of g.frozen||[]){
   const r=q(f.rates[k]??'0'),d=values['duty:'+f.id];
   if(cmp(r,Z)<0&&d!=null){const x=mul(A.sub(Z,r),q(d));demand=add(demand,x);evidence.push({factory:f.id,rate:txt(x),kind:'known-prefix'});}
  }
  for(const m of g.nodes){
   const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
   if(!r||r.qty!==1||!fixed(r.seconds)||!complete(m)||outs.length!==1||!valid(outs[0])||outs[0].materials[0]!==r.output||!(free.has(outs[0].id)||independentFinalReceiver(outs[0],ns,I,O))||!keys.includes(k)||keys.length!==ins.length||ins.some(e=>!valid(e))||keys.some(j=>!Number.isSafeInteger(r.inputs[j])||r.inputs[j]<1||ins.filter(e=>e.materials[0]===j).length!==1))continue;
   const inputs=ins.map(e=>({e,c:supply(e)}));
   if(inputs.some(({c})=>!c||c.gate&&c.gate!==k&&!positive(c.gate)))continue;
   const target=inputs.find(({e})=>e.materials[0]===k);
   if(!target||target.c.gate!==k||knownRoots.has(target.c.root))continue;
   let H=q(r.seconds);
   for(const {e,c} of inputs){const gap=mul(q(r.inputs[e.materials[0]]),c.gap);if(cmp(gap,H)>0)H=gap;}
   const service=div(q(r.inputs[k]),H);
   demand=add(demand,service);evidence.push({machine:m.id,root:target.c.root,route:target.e.id,period:txt(H),rate:txt(service),kind:'high-stock-interval',inputs:inputs.map(({e,c})=>({route:e.id,gap:txt(c.gap),gate:c.gate}))});
  }
  if(!evidence.some(x=>x.kind==='high-stock-interval')||cmp(demand,q(inc))<0)continue;
  // At the last low-stock frame s, stock is O(1). All other required
  // gates are eventually high. On [s,t] the clock certificates give
  // lower withdrawals >= demand*(t-s)-O(1); exact known prefixes
  // contribute their differences with o(t) error. Income has an exact
  // prefix slope. Thus stock(t)<=o(t), and nonnegativity gives net=0.
  out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'high-stock-demand-exhaustion',sense:'eq',coefficients:{['net:'+k]:1},constant:'0'});
  out.witnesses.push({method:'high-stock-demand-exhaustion',item:k,income:inc,demandLower:txt(demand),evidence});
 }
 return out;
}

// Compositional high-stock service for independent unit-output recipe
// trees with dedicated inlets. Leaves carry actual head-clock contracts
// (saturated root or proved periodic splitter input), not mean offers.
// Shared splitters are allowed at leaves; their worst per-port service
// is uniform even with arbitrary sibling backpressure.
//
// A recipe with H=max(T,max a*h+delta) can replenish all ingredients
// by its previous start+H. The next start only additionally depends on
// output cache space (20 unit packets). Thus B_j<=max(B_(j-1)+H,
// S_(j-20)+delta); completion is B_j+T. Since H>=T and 19P>=delta,
// S_j<=max(S_(j-1)+H,R_(j-K)+d). Hence the next head, when wanted,
// has clock H, including arbitrary finite initial buffer states after
// a uniformly bounded warmup. Compose this backwards/forwards in a
// finite tree. At its proved-free terminal, batch count >=length/H-O(1).
//
// One optional scarce leaf pool may be eliminated on a high-stock
// interval using its LAST low frame. If all of that pool's consuming
// leaves lie in this exclusive tree, its consumption is a*B+O(1)
// over ANY interval. At that last low frame, nonnegative starting
// stock gives Delta B >= I*duration/a-o(t). The remaining suffix has
// every gate high, giving min(I/a,1/H) over the whole interval.
// Sum disjoint terminal-tree demands, then use the last low frame of
// the target pool. If the resulting demand covers its exact income,
// its net slope is zero. No rate is chosen from a feasible interval.
function proveComposedStockExhaustion(g,A,values,netLower,freeRoutes,periodicInputs=[]){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const {q,cmp,add,mul,div,txt,Z,U}=A,delta=q('1/20'),ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>m&&I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>e.active!==false&&e.compatible===true&&Number.isSafeInteger(e.length)&&e.length>=1&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&e.acceptedMaterials?.includes(e.materials[0])&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===e.materials[0]);
 const fixed=t=>cmp(q(t),U)>=0&&div(q(t),delta).d===1n;
 const free=new Set(freeRoutes),positive=k=>[values['net:'+k],netLower[k]].some(v=>v!=null&&cmp(q(v),Z)>0);
 const periodic=new Map(periodicInputs.map(c=>[c.route,c]));
 function direct(e){
  const m=ns.get(e.from),r=m.recipe;
  if(!valid(e)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||e.fromPort!==0)return null;
  if(m.type==='仓出'&&m.item===e.materials[0])return {gap:U,gate:m.item,item:m.item,root:m.id,kind:'warehouse'};
  if(r&&Object.keys(r.inputs||{}).length===0&&r.qty===1&&r.output===e.materials[0]&&fixed(r.seconds))return {gap:q(r.seconds),gate:null,item:null,root:m.id,kind:'autonomous-unit'};
  return null;
 }
 function splitterLeaf(e){
  const m=ns.get(e.from),ins=I.get(m.id),outs=O.get(m.id),k=e.materials[0];
  if(m.type!=='分流'||!complete(m)||ins.length!==1||ins[0].toPort!==0||outs.length<2||outs.length>3||!outs.includes(e)||![...ins,...outs].every(x=>valid(x)&&x.materials[0]===k))return null;
  const r=direct(ins[0]);if(!r?.gate)return null;
  const p=periodic.get(ins[0].id);
  if(p&&p.item===k){
   const c=combinePeriodicCalendars([p]);
   if(c&&periodicSpanBounds(c,1).lower>=20)return {...r,gate:null,gap:div(q(periodicSpanBounds(c,outs.length).upper),q(20)),kind:'proved-periodic-splitter'};
  }
  return {...r,gap:q(outs.length),kind:'saturated-splitter'};
 }
 function makeTree(sink){
  const seen=new Set(),leaves=[],nodes=[];
  function visit(m,weight){
   if(seen.has(m.id))return null;seen.add(m.id);
   const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
   if(!r||r.qty!==1||!fixed(r.seconds)||!keys.length||!complete(m)||ins.length!==keys.length||outs.length!==1||outs[0].fromPort!==0||!valid(outs[0])||outs[0].materials[0]!==r.output||ins.some(e=>!valid(e))||keys.some(k=>!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<1||ins.filter(e=>e.materials[0]===k).length!==1))return null;
   let H=q(r.seconds);const clocks=[];
   for(const e of ins){
    const a=r.inputs[e.materials[0]],w=mul(weight,q(a)),l=direct(e)||splitterLeaf(e);
    let h;
    if(l){h=l.gap;leaves.push({route:e.id,...l,amount:txt(w),gap:txt(h)});}
    else{
     const child=visit(ns.get(e.from),w);if(!child)return null;
     h=child.H;
    }
    const v=add(mul(q(a),h),delta);if(cmp(v,H)>0)H=v;
    clocks.push({route:e.id,gap:txt(h),batch:a});
   }
   nodes.push({machine:m.id,weight:txt(weight),H:txt(H),inputs:clocks});return {H};
  }
  const r=visit(sink,U);if(!r)return null;
  const needs=new Map();
  for(const l of leaves)if(l.item)needs.set(l.item,add(needs.get(l.item)||Z,q(l.amount)));
  return {sink:sink.id,H:r.H,leaves,nodes,needs,actors:new Set(nodes.map(n=>n.machine)),gates:[...new Set(leaves.filter(l=>l.gate).map(l=>l.gate))]};
 }
 // A secondary gate's entire withdrawal must enter this one tree.
 // Reject extra consumers, even a branch with unproved zero flow.
 function exclusive(k,tree){
  if((g.frozen||[]).some(f=>f.rates[k]!=null&&cmp(q(f.rates[k]),Z)<0))return false;
  const leaf=new Set(tree.leaves.filter(l=>l.item===k).map(l=>l.route));
  const routes=[];
  for(const m of g.nodes.filter(m=>m.type==='仓出'&&m.item===k)){
   const es=O.get(m.id);
   if(!complete(m)||I.get(m.id).length||es.length!==1||!valid(es[0]))return false;
   const d=ns.get(es[0].to);
   if(d.type==='分流'){
    const bs=O.get(d.id);
    if(!complete(d)||I.get(d.id).length!==1||!bs.length||bs.some(e=>!valid(e)||e.materials[0]!==k))return false;
    routes.push(...bs.map(e=>e.id));
   }else routes.push(es[0].id);
  }
  return routes.length===leaf.size&&routes.every(id=>leaf.has(id));
 }
 const trees=g.nodes.filter(m=>m.recipe&&O.get(m.id).length===1&&(free.has(O.get(m.id)[0].id)||independentFinalReceiver(O.get(m.id)[0],ns,I,O))).map(makeTree).filter(Boolean);
 for(const k of new Set(g.nodes.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item))){
  const inc=values['inflow:'+k];
  if(inc==null||values['net:'+k]!=null||positive(k))continue;
  const candidates=[];
  for(const t of trees){
   if(!t.needs.has(k)||!t.gates.includes(k))continue;
   const unknown=t.gates.filter(j=>j!==k&&!positive(j));
   if(unknown.length>1)continue;
   let rate=div(U,t.H),secondary=null;
   if(unknown.length){
    const j=unknown[0],I=values['inflow:'+j],a=t.needs.get(j);
    if(I==null||!a||!exclusive(j,t))continue;
    const v=div(q(I),a);
    if(cmp(v,rate)<0)rate=v;
    secondary={item:j,income:I,perBatch:txt(a),rate:txt(v)};
   }
   candidates.push({tree:t,rate,demand:mul(t.needs.get(k),rate),secondary});
  }
  candidates.sort((a,b)=>cmp(b.demand,a.demand));
  const used=new Set(),chosen=[];let demand=Z;
  for(const c of candidates){
   if([...c.tree.actors].some(id=>used.has(id)))continue;
   for(const id of c.tree.actors)used.add(id);
   demand=add(demand,c.demand);
   chosen.push({sink:c.tree.sink,H:txt(c.tree.H),rate:txt(c.rate),perBatch:txt(c.tree.needs.get(k)),demand:txt(c.demand),secondary:c.secondary,nodes:c.tree.nodes,leaves:c.tree.leaves});
  }
  if(!chosen.length||cmp(demand,q(inc))<0)continue;
  out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'composed-stock-demand-exhaustion',sense:'eq',coefficients:{['net:'+k]:1},constant:'0'});
  out.witnesses.push({method:'composed-stock-demand-exhaustion',item:k,income:inc,demandLower:txt(demand),trees:chosen});
 }
 return out;
}
