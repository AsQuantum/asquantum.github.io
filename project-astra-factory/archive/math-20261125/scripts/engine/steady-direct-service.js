'use strict';
// Exact continuous-time sufficient service certificates. No simulation step.
// Ideal event convention: service already-ready arrivals before starting a
// batch, then re-evaluate newly freed capacity without advancing physical time.
function factoryDirectSupplyIntervals(g,arith){
 const proven=new Map();
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return proven;
 const {q,cmp,mul,add,U,Z}=arith,P=U;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount;
 const pending=[];
 function candidate(m,e,G,rule,parents){
  if(!proven.has(e.id))pending.push({e,G,rule,parents,machine:m.id});
 }
 for(const m of g.nodes){
  const r=m.recipe,outs=O.get(m.id),ins=I.get(m.id);
  if(!complete(m)||ins.length||outs.length!==1||!r||Object.keys(r.inputs||{}).length||!Number.isSafeInteger(r.qty)||r.qty<1||cmp(q(r.seconds),Z)<=0)continue;
  const e=outs[0];if(!valid(e)||e.fromPort!==0||e.materials[0]!==r.output)continue;
  const H=q(r.seconds),full=cmp(H,mul(q(r.qty),P))<=0;
  candidate(m,e,full?P:H,full?'autonomous-saturated-generator':'autonomous-generator-period-bound',[]);
 }
 // Nondecreasing bound transforms admit Dijkstra-style structural propagation.
 // Each route finalized at most once; no numeric convergence or circular proof.
 while(pending.length){
  pending.sort((a,b)=>cmp(b.G,a.G)||String(b.e.id).localeCompare(String(a.e.id)));
  const p=pending.pop(),e=p.e;if(proven.has(e.id))continue;
  proven.set(e.id,{route:e.id,item:e.materials[0],machine:p.machine,rule:p.rule,parents:p.parents,interval:arith.txt(p.G)});
  const m=ns.get(e.to),ins=I.get(m.id),outs=O.get(m.id),item=e.materials[0];
  if(!complete(m)||!outs.length||ins.some(x=>!valid(x)||x.materials[0]!==item)||outs.some(x=>!valid(x)||x.materials[0]!==item))continue;
  if(m.type==='汇流'&&outs.length===1)
   candidate(m,outs[0],p.G,'homogeneous-merger-known-feed',[e.id]);
  if(m.type==='分流'&&ins.length===1){
   const k=outs.length;
   // While one output is continuously eligible, RR cannot serve more than
   // k-1 other ports before it; each next dispatch is within input interval G.
   // Conservative eligible-send delay d=kG; line readiness bound P+d.
   const G=k===1?p.G:add(P,mul(q(k),p.G));
   for(const o of outs)candidate(m,o,G,k===1?'single-connected-output-relay':'homogeneous-splitter-bounded-RR',[e.id]);
  }
 }
 return proven;
}
function factoryDirectSaturatedSupply(g,arith){return new Map([...factoryDirectSupplyIntervals(g,arith)].filter(([,p])=>arith.cmp(arith.q(p.interval),arith.U)===0));}
function factoryDirectBatchRefillCertificates(g,arith){
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return [];
 const {q,cmp,mul,U,Z}=arith,P=U;
 const ready=factoryDirectSupplyIntervals(g,arith),I=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines)I.get(e.to).push(e);
 const out=[];
 for(const m of g.nodes){
  const r=m.recipe;if(!r||!Object.keys(r.inputs||{}).length||cmp(q(r.seconds),Z)<=0)continue;
  for(const [item,batch] of Object.entries(r.inputs)){
   const ids=I.get(m.id).filter(e=>e.materials.includes(item)),n=ids.length;
   if(n<2||!Number.isSafeInteger(batch)||batch<1||!m.inputPriority?.length)continue;
   if(new Set(ids.map(e=>e.toPort)).size!==n||ids.some(e=>!m.inputPriority.includes(e.toPort)||!ready.has(e.id)))continue;
   const T=q(r.seconds),R=Math.ceil(batch/n),ordered=ids.slice().sort((a,b)=>m.inputPriority.indexOf(a.toPort)-m.inputPriority.indexOf(b.toPort));
   const gaps=ordered.map(e=>q(ready.get(e.id).interval)),G=gaps.reduce((a,b)=>cmp(a,b)>0?a:b,P);
   let method=null;
   if(cmp(G,P)===0&&cmp(T,mul(q(R),P))>=0&&cmp(mul(q(n),T),mul(q(batch),P))>0)
    method='continuous-saturated-service+batch-phase-alignment';
   else if(cmp(T,mul(q(R+1),G))>=0){
    // All heads re-ready before each batch. First round uses priority.
    // If only one extra partial round is needed, its priority prefix
    // must supply exactly at the minimum port interval P.
    if(batch<=n||(batch<2*n&&gaps.slice(0,batch-n).every(v=>cmp(v,P)===0)))
     method='continuous-bounded-service+quiet-batch-prefix';
   }
   if(!method)continue;
   const supplyProof=new Map(),todo=ordered.map(e=>e.id);
   while(todo.length){const e=todo.pop();if(supplyProof.has(e))continue;const p=ready.get(e);supplyProof.set(e,p);todo.push(...p.parents);}
   out.push({machine:m.id,item,provenReady:true,cooldown:arith.txt(P),method,scope:'ideal-continuous-event-model',batch,period:arith.txt(T),maxSupplyInterval:arith.txt(G),ports:ordered.map((e,i)=>({route:e.id,port:e.toPort,perBatch:Math.floor(batch/n)+(i<batch%n?1:0)})),supplyProof:[...supplyProof.values()]});
  }
 }
 return out;
}
if(typeof module!=='undefined')module.exports={factoryDirectSupplyIntervals,factoryDirectSaturatedSupply,factoryDirectBatchRefillCertificates};
