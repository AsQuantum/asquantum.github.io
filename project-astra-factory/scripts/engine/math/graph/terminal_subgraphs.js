'use strict';
// Start from individual deposit lines, not warehouse machine IDs.
// Shared physical devices (including a shared computer FIFO) join
// upstream dependency cones. Warehouse inventory is a separate boundary.
function buildTerminalSubgraphs(g){
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))throw Error('Invalid subgraph edge');I.get(e.to).push(e);O.get(e.from).push(e);}
 const parents=new Map(g.lines.map(e=>[e.id,e.id])),covered=new Set(),owner=new Map();
 function find(id){let r=id;while(parents.get(r)!==r)r=parents.get(r);while(parents.get(id)!==id){const p=parents.get(id);parents.set(id,r);id=p;}return r;}
 function join(a,b){a=find(a);b=find(b);if(a!==b)parents.set(b,a);}
 function visit(seed){
  const stack=[seed];
  while(stack.length){
   const e=stack.pop();if(covered.has(e.id)){join(seed.id,e.id);continue;}
   covered.add(e.id);join(seed.id,e.id);
   for(const id of [e.from,e.to]){
    const m=ns.get(id);
    if(m.type==='仓入')continue;
    if(owner.has(id))join(e.id,owner.get(id));
    else{owner.set(id,e.id);stack.push(...I.get(id));}
   }
  }
 }
 const terminals=g.lines.filter(e=>ns.get(e.to).type==='仓入'||ns.get(e.to).type==='电脑');
 for(const e of terminals)visit(e);
 // Unconnected tails, closed cycles and dangling consumers are not
 // silently discarded or converted to free terminals.
 for(const e of g.lines)if(!covered.has(e.id))visit(e);
 const groups=new Map();
 for(const e of g.lines){const root=find(e.id);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(e);}
 const terminalIds=new Set(terminals.map(e=>e.id));
 const subgraphs=[...groups.values()].map(lines=>{
  const ids=new Set(lines.flatMap(e=>[e.from,e.to])),localIn=new Map();
  for(const e of lines)localIn.set(e.to,(localIn.get(e.to)||0)+1);
  const nodes=g.nodes.filter(m=>ids.has(m.id)).map(m=>m.type==='仓入'?{...m,physicalInCount:localIn.get(m.id)||0}:m);
  const deposits=lines.filter(e=>ns.get(e.to).type==='仓入').map(e=>e.id);
  const withdrawals=nodes.filter(m=>m.type==='仓出').map(m=>({machine:m.id,item:m.item}));
  const id=lines.map(e=>e.id).sort()[0];
  return {id,nodes,lines,deposits,withdrawals,terminals:lines.filter(e=>terminalIds.has(e.id)).map(e=>e.id)};
 });
 // Explicit separate warehouse coupling: same-material outlets must
 // not be treated as independent supplies in the actual model.
 const pools=new Map();
 function pool(k){if(!pools.has(k))pools.set(k,{item:k,deposits:[],withdrawals:[]});return pools.get(k);}
 for(const s of subgraphs){
  for(const e of s.lines)if(ns.get(e.to).type==='仓入')for(const k of e.materials)pool(k).deposits.push({subgraph:s.id,route:e.id});
  for(const x of s.withdrawals)if(x.item)pool(x.item).withdrawals.push({subgraph:s.id,machine:x.machine});
 }
 return {subgraphs,pools:[...pools.values()],isolated:g.nodes.filter(m=>!I.get(m.id).length&&!O.get(m.id).length).map(m=>m.id)};
}
function terminalProofViews(g){
 return buildTerminalSubgraphs(g).subgraphs.map(s=>({...g,nodes:s.nodes,lines:s.lines}));
}


// The physical catalog has a finite set of local operators, but arbitrary
// compositions of these operators are not a finite list of graph shapes.
// Keep topology features orthogonal: one graph can need several contracts.
function independentFinalReceiver(e,ns,I,O){
 const m=ns.get(e.to);
 return m.type==='仓入'||m.type==='电脑'&&m.physicalInCount===1&&I.get(m.id).length===1&&I.get(m.id)[0]===e&&m.physicalOutCount===0&&O.get(m.id).length===0;
}
function classifyTerminalSubgraph(s){
 const I=new Map(s.nodes.map(m=>[m.id,[]])),O=new Map(s.nodes.map(m=>[m.id,[]])),ns=new Map(s.nodes.map(m=>[m.id,m]));
 for(const e of s.lines){I.get(e.to).push(e);O.get(e.from).push(e);}
 const initial=[],middle=[],final=[],features=new Set(),missing=[];
 for(const m of s.nodes){
  const ins=I.get(m.id),outs=O.get(m.id),r=m.recipe;
  if(m.type==='仓入'||m.type==='电脑'){
   for(const e of ins)final.push({machine:m.id,port:e.toPort,route:e.id,kind:m.type==='仓入'?'deposit':'destroy'});
   if(m.type==='电脑'&&ins.length>1)features.add('shared-destroy-cache');
  }else if(m.type==='仓出'||r&&!Object.keys(r.inputs||{}).length){
   initial.push({machine:m.id,kind:m.type==='仓出'?'warehouse':'autonomous',item:m.item||r?.output});
  }else{
   const kind=r?'recipe':m.type==='分流'?'split':m.type==='汇流'?'merge':'other';
   middle.push({machine:m.id,kind,in:ins.length,out:outs.length});
   if(kind==='split'&&outs.length>1)features.add('split');
   if(kind==='merge'&&ins.length>1)features.add('merge');
   if(r){
    if(Object.keys(r.inputs||{}).length>1)features.add('multi-material-recipe');
    for(const k of Object.keys(r.inputs||{})){
     const count=ins.filter(e=>e.materials.includes(k)).length;
     if(count>1)features.add('shared-ingredient-cache');
     if(!count)missing.push({machine:m.id,item:k});
    }
    if(r.qty>1||Object.values(r.inputs||{}).some(a=>a>1))features.add('batch');
   }
  }
  if(m.type!=='仓入'&&m.type!=='电脑'&&!outs.length)features.add('dead-end');
 }
 if(s.lines.some(e=>e.materials.length>1||e.rawMaterials?.length>1))features.add('mixed-fifo');
 if(s.lines.some(e=>(e.rawMaterials||e.materials).some(k=>!e.materials.includes(k)||Array.isArray(e.acceptedMaterials)&&!e.acceptedMaterials.includes(k)||e.outFilter&&e.outFilter!=='任意'&&e.outFilter!==k)))features.add('rejected-material');
 if(missing.length)features.add('missing-ingredient');
 if(initial.length>1)features.add('multi-source');
 if(final.length>1)features.add('multi-final');
 if(initial.some(x=>x.kind==='warehouse'))features.add('stock-input');
 if(final.some(x=>x.kind==='destroy'))features.add('destroy');
 // Structural SCCs include currently inactive edges; do not confuse
 // structural feedback with proven reachable feedback.
 const topology=buildProofDepthPlan({nodes:s.nodes,lines:s.lines.map(e=>({...e,active:true}))});
 const loops=topology.components.filter(c=>c.cyclic).map(c=>c.members);
 if(loops.length)features.add('physical-loop');
 if(!initial.length)features.add('no-initial');
 if(!final.length)features.add('no-final');
 if(!features.has('split')&&!features.has('merge')&&!loops.length&&initial.length===1&&final.length===1&&!missing.length&&!features.has('dead-end'))features.add('serial');
 // Reconvergence is a structural marker, not a second count equation.
 for(const m of s.nodes.filter(m=>m.type==='分流'&&O.get(m.id).length>1)){
  const visited=new Map();
  for(const branch of O.get(m.id)){
   const stack=[branch.to],seen=new Set();
   while(stack.length){const id=stack.pop();if(seen.has(id)||id===m.id)continue;seen.add(id);
    if(ns.get(id).type==='仓入')continue; // separate deposit ports
    if(visited.has(id)&&visited.get(id)!==branch.id){features.add('reconvergence');break;}
    visited.set(id,branch.id);for(const e of O.get(id))stack.push(e.to);
   }
  }
 }
 return {initial,middle,final,features:[...features].sort(),loops,maxDepth:topology.maxDepth,missing};
}
// Inventory actors are a second directed graph. Frozen sources and
// consumers participate explicitly; the actual priority order is retained.
function buildStockDependencyPlan(g,terminalPlan,arith){
 const nodes=[],lines=[],nodeIds=new Set(),pools=new Map();
 function node(id,kind,extra={}){if(!nodeIds.has(id)){nodeIds.add(id);nodes.push({id,kind,...extra});}return id;}
 function pool(k){if(!pools.has(k)){const id=node('stock:'+k,'stock',{item:k});pools.set(k,{id,item:k,priority:(g.pools||[]).find(p=>p.item===k)?.order||[],deposits:[],withdrawals:[],frozen:[]});}return pools.get(k);}
 function link(from,to,kind,detail){lines.push({id:'dependency:'+lines.length,from,to,kind,...detail});}
 for(const p of g.pools||[])pool(p.item);
 for(const s of terminalPlan.subgraphs)node('subgraph:'+s.id,'physical',{subgraph:s.id});
 for(const p of terminalPlan.pools){
  const x=pool(p.item);x.deposits=p.deposits;x.withdrawals=p.withdrawals;
  for(const d of p.deposits)link('subgraph:'+d.subgraph,x.id,'deposit',{route:d.route,item:p.item});
  for(const w of p.withdrawals)link(x.id,'subgraph:'+w.subgraph,'withdrawal',{machine:w.machine,item:p.item});
 }
 for(const f of g.frozen||[]){
  const id=node('frozen:'+f.id,'frozen',{factory:f.id});
  for(const [k,r] of Object.entries(f.rates)){
   const sign=arith.cmp(arith.q(r),arith.Z);if(!sign)continue;
   const x=pool(k);x.frozen.push({factory:f.id,rate:r});
   link(sign>0?id:x.id,sign>0?x.id:id,sign>0?'frozen-deposit':'frozen-withdrawal',{item:k,rate:r});
  }
 }
 const plan=buildProofDepthPlan({nodes,lines});
 const feedback=plan.components.filter(c=>c.cyclic).map(c=>c.members),cyclicActors=new Set(feedback.flat());
 const actors=nodes.filter(n=>n.kind!=='stock').map(n=>{
  const inputs=[...new Set(lines.filter(e=>e.to===n.id).map(e=>e.item))],outputs=[...new Set(lines.filter(e=>e.from===n.id).map(e=>e.item))];
  const contested=inputs.filter(k=>{const p=pools.get(k);return p.withdrawals.length+p.frozen.filter(f=>arith.cmp(arith.q(f.rate),arith.Z)<0).length>1;});
  return {id:n.id,inputs,outputs,dependency:inputs.length===0?'independent':cyclicActors.has(n.id)?'feedback':'acyclic',directReturn:inputs.filter(k=>outputs.includes(k)),contested};
 });
 return {nodes,links:lines,pools:[...pools.values()],actors,layers:plan.layers.map(l=>l.map(n=>n.id)),feedback};
}
// A known boundary count is a constant, not an unresolved dependency.
// Removing it from the rate-dependency graph does NOT remove any belt,
// stock condition or event phase from the physical proof. In particular a
// fixed mean does not certify a fixed arrival calendar.
function resolveStockDependencyPlan(plan,values,arith){
 const rate=e=>{
  if(e.kind==='deposit')return values['flow:'+e.route+'|'+e.item];
  if(e.kind==='withdrawal')return values['machineTotal:'+e.machine+'|out'];
  const id=(e.kind==='frozen-deposit'?e.from:e.to).slice(7),d=values['duty:'+id];
  if(d==null)return null;
  const r=arith.q(e.rate),abs=r.n<0n?{n:-r.n,d:r.d}:r;
  return arith.txt(arith.mul(abs,arith.q(d)));
 };
 const links=plan.links.map(e=>({...e,rate:rate(e)??null}));
 const unresolved=links.filter(e=>e.rate===null),p=buildProofDepthPlan({nodes:plan.nodes,lines:unresolved});
 return {...plan,links,unresolvedRateFeedback:p.components.filter(c=>c.cyclic).map(c=>c.members),unresolvedRateLayers:p.layers.map(l=>l.map(n=>n.id))};
}
