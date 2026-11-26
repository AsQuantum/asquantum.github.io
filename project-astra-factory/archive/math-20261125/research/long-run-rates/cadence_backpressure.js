'use strict';
// Continuous-time sufficient structural theorem. No measurements, frame
// intervals, time traces, candidate periods, or numerical rate iteration.
// Scope: homogeneous physical belts, compatible filters, work-conserving
// ideal continuous events. All bounds follow from finite resource rules.
function proveCadenceBackpressure(g,arith,refillInvariant){
 const result={supply:[],cadences:[],certificates:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const {q,cmp,mul,add,txt,Z,U}=arith,P=U;
 const max=(a,b)=>cmp(a,b)>=0?a:b,ns=new Map(g.nodes.map(m=>[m.id,m]));
 const I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount;
 const supply=new Map(),ready=new Map(),todo=[];
 function offer(e,G,rule,parents){if(valid(e)&&!supply.has(e.id))todo.push({e,G,rule,parents});}
 function recipeInfo(m){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id);
  if(!complete(m)||!r||r.qty!==1||!Object.keys(r.inputs||{}).length||
    cmp(q(r.seconds),Z)<=0||outs.length!==1||!valid(outs[0])||
    outs[0].materials[0]!==r.output||ins.some(e=>!valid(e)||!Object.hasOwn(r.inputs,e.materials[0])))return null;
  const groups=Object.entries(r.inputs).map(([item,n])=>({item,n,edges:ins.filter(e=>e.materials[0]===item)}));
  if(groups.some(x=>!Number.isSafeInteger(x.n)||x.n<1||!x.edges.length))return null;
  return {r,groups,out:outs[0]};
 }
 // Seed autonomous generators and a warehouse's provably independent
 // positive constant feed. A shared warehouse with competing consumers
 // cannot be assumed to provide a continuously ready output.
 for(const m of g.nodes){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id);
  if(!complete(m)||ins.length||outs.length!==1||!valid(outs[0]))continue;
  const e=outs[0],item=e.materials[0];
  if(r&&Object.keys(r.inputs||{}).length===0&&r.output===item&&Number.isSafeInteger(r.qty)&&r.qty>0&&cmp(q(r.seconds),Z)>0){
   const H=q(r.seconds);offer(e,cmp(H,mul(q(r.qty),P))<=0?P:H,'autonomous-generator',[]);
  }else if(m.type==='仓出'&&m.item===item){
   const alone=g.nodes.filter(x=>x.type==='仓出'&&x.item===item).length===1;
   const positive=(g.frozen||[]).some(f=>f.reachable!==false&&Object.values(f.rates).every(v=>cmp(q(v),Z)>=0)&&Object.hasOwn(f.rates,item)&&cmp(q(f.rates[item]),U)>=0);
   const noCompetingFrozen=(g.frozen||[]).every(f=>!Object.hasOwn(f.rates,item)||cmp(q(f.rates[item]),Z)>=0);
   if(g.unlimited||(alone&&positive&&noCompetingFrozen))offer(e,P,'independent-warehouse-source',[]);
  }
 }
 // Each bound is >= every chosen parent bound. Finalizing the smallest
 // candidate once is a structural proof traversal, not fixed-point rates.
 while(todo.length){
  todo.sort((a,b)=>cmp(b.G,a.G)||String(b.e.id).localeCompare(String(a.e.id)));
  const {e,G,rule,parents}=todo.pop();
  if(supply.has(e.id))continue;
  supply.set(e.id,{route:e.id,interval:txt(G),rule,parents});
  const m=ns.get(e.to),ins=I.get(m.id),outs=O.get(m.id),item=e.materials[0];
  if(!complete(m)||!outs.length||ins.some(x=>!valid(x))||outs.some(x=>!valid(x)))continue;
  if(ins.every(x=>x.materials[0]===item)&&outs.every(x=>x.materials[0]===item)){
   if(m.type==='汇流'&&outs.length===1)offer(outs[0],G,'homogeneous-merger',[e.id]);
   if(m.type==='分流'&&ins.length===1){
    const H=outs.length===1?G:add(P,mul(q(outs.length),G));
    for(const x of outs)offer(x,H,'homogeneous-splitter',[e.id]);
   }
  }
  const info=recipeInfo(m);
  if(info){
   const chosen=info.groups.map(gr=>gr.edges.filter(x=>supply.has(x.id)).sort((a,b)=>cmp(q(supply.get(a.id).interval),q(supply.get(b.id).interval)))[0]);
   if(chosen.every(Boolean)){
    const H=info.groups.reduce((a,gr,i)=>max(a,mul(q(gr.n),q(supply.get(chosen[i].id).interval))),max(P,q(info.r.seconds)));
    const proof={machine:m.id,interval:txt(H),parents:chosen.map(x=>x.id)};
    ready.set(m.id,proof);offer(info.out,H,'single-product-unit-recipe',proof.parents);
   }
  }
 }
 // A terminal unit-output recipe with one feed per ingredient and enough
 // guaranteed supply for every batch has exact nominal cadence after start.
 const cadence=new Map(),queue=[];
 function mark(m,H,rule,via){
  if(cadence.has(m.id))return;
  cadence.set(m.id,{machine:m.id,period:txt(H),rule,via});queue.push(m);
 }
 for(const m of g.nodes){
  const info=recipeInfo(m);
  if(!info||ns.get(info.out.to).type!=='仓入'||cmp(q(info.r.seconds),P)<0)continue;
  const H=q(info.r.seconds);
  if(info.groups.every(gr=>gr.edges.length===1&&supply.has(gr.edges[0].id)&&cmp(mul(q(gr.n),q(supply.get(gr.edges[0].id).interval)),H)<=0))
   mark(m,H,'terminal-single-inlet-per-ingredient',info.out.id);
 }
 // Backward saturation lemma: a single-unit ingredient released every H
 // and supplied by a strictly faster unit-output recipe forces that upstream
 // recipe to the same cadence. Finite FIFO belt/output-cache delay vanishes
 // after the transient. The proof uses an ordinal max-plus inequality, not
 // numerical evaluation of its recurrence.
 for(let i=0;i<queue.length;i++){
  const m=queue[i],H=q(cadence.get(m.id).period),info=recipeInfo(m);
  for(const gr of info.groups){
   if(gr.n!==1||gr.edges.length!==1)continue;
   const e=gr.edges[0],up=ns.get(e.from),u=recipeInfo(up),b=ready.get(up.id);
   if(!u||u.out.id!==e.id||!b||!supply.has(e.id)||cmp(q(b.interval),H)>=0)continue;
   mark(up,H,'unit-demand-strict-surplus-backpressure',e.id);
  }
 }
 // General preferred-inlet phase alignment: the first inlet has G=P;
 // H>qP, H>max(1,floor(q/2))*G_i for each other inlet.
 // Once the shared cache first fills, the first inlet alone refills it by
 // qP; its phase reaches zero in finitely many batches. Every other inlet
 // gets at most floor(q/2) pieces per batch, so its phase also reaches zero.
 // The independent rank bound then checks the proposed allocation.
 for(const m of queue){
  const H=q(cadence.get(m.id).period),info=recipeInfo(m);
  for(const gr of info.groups){
   const ids=gr.edges,prior=m.inputPriority||[],n=ids.length;
   if(n<2||new Set(ids.map(x=>x.toPort)).size!==n||ids.some(x=>!prior.includes(x.toPort)||!supply.has(x.id)))continue;
   const ordered=ids.slice().sort((a,b)=>prior.indexOf(a.toPort)-prior.indexOf(b.toPort));
   const ports=ordered.map(e=>({id:e.id,interval:supply.get(e.id).interval}));
   if(cmp(q(ports[0].interval),P)!==0||cmp(H,mul(q(gr.n),P))<=0)continue;
   if(ports.slice(1).some(p=>cmp(H,mul(q(Math.max(1,Math.floor(gr.n/2))),q(p.interval)))<=0))continue;
   const invariant=refillInvariant(gr.n,ports,txt(P),txt(H),arith);
   if(invariant.status!=='conditional-invariant')continue;
   result.certificates.push({machine:m.id,item:gr.item,provenReady:true,cooldown:txt(P),method:'continuous-cadence-backpressure+preferred-inlet-alignment',scope:'ideal-continuous-event-model',batch:gr.n,period:txt(H),minNominalPeriod:txt(q(info.r.seconds)),ports:ordered.map(e=>({route:e.id,port:e.toPort,perBatch:invariant.counts[e.id]})),required:invariant.required});
  }
 }
 result.supply=[...supply.values()];result.cadences=[...cadence.values()];
 return result;
}
if(typeof module!=='undefined')module.exports={proveCadenceBackpressure};
