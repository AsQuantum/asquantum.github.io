'use strict';
// Direct finite-prefix obstruction certificate for fixed physical layouts.
// Does not enumerate states, calculate arrival times or run an orbit.
// An infinite-throughput FIFO merger cannot indefinitely starve a persistent
// eligible inlet head; its scanner is round-robin and the port cooldown is finite.
function provePermanentFifoBlockage(spec){
 const result={ruleVersion:'real-outlet-buffer-20261125',relations:[],witnesses:[],status:'unsupported'};
 if(!spec||spec.initial!=='empty'||!Array.isArray(spec.machines)||!Array.isArray(spec.routes))return result;
 const ns=new Map(spec.machines.map(m=>[m.id,m])),rs=new Map(spec.routes.map(r=>[r.id,r]));
 if(ns.size!==spec.machines.length||rs.size!==spec.routes.length)return result;
 const I=new Map(spec.machines.map(m=>[m.id,[]])),O=new Map(spec.machines.map(m=>[m.id,[]]));
 for(const r of spec.routes){
  const a=ns.get(r.from),d=ns.get(r.to);
  if(!a||!Number.isSafeInteger(r.length)||r.length<1||!Array.isArray(r.accepted)||!a.outPorts?.some(p=>p.index===r.fromPort)||O.get(a.id).some(e=>e.fromPort===r.fromPort))return result;
  if(r.to!==null&&(!d||!d.inputPriority?.includes(r.toPort)||I.get(d.id).some(e=>e.toPort===r.toPort)))return result;
  O.get(a.id).push(r);if(d)I.get(d.id).push(r);
 }
 const possibleItems=new Set(spec.machines.flatMap(m=>[m.item,m.recipe?.output].filter(Boolean)));
 const filter=r=>ns.get(r.from).outPorts.find(p=>p.index===r.fromPort)?.filter;
 const unrestricted=r=>!filter(r)||filter(r)==='任意';
 const canSend=(r,k)=>unrestricted(r)||filter(r)===k;
 // An autonomous source has an eventual first batch even if all belts are
 // blocked, because its true output buffer is initially empty.
 // Follow only exclusive output ports and FIFO mergers; never assume that
 // a splitter will select the branch carrying the incompatible item.
 const found=new Set();
 for(const m of ns.values()){
  const recipe=m.recipe;
  if(!recipe||Object.keys(recipe.inputs||{}).length||!recipe.output||!(Number(recipe.seconds)>0)||!Number.isFinite(Number(recipe.seconds))||!Number.isSafeInteger(recipe.qty)||recipe.qty<1||m.outPorts.length!==1||m.outPorts[0].index!==0)continue;
  const k=recipe.output,seen=new Set(),chain=[];
  let node=m;
  while(node&&!seen.has(node.id)){
   seen.add(node.id);
   const outs=O.get(node.id);
   if(outs.length!==1||outs[0].to===null||outs[0].fromPort!==0)break;
   const r=outs[0],target=ns.get(r.to);
   if(!canSend(r,k))break;
   chain.push(r.id);
   if(!r.accepted.includes(k)){
    if(!found.has(r.id)){
     found.add(r.id);
     result.relations.push({proven:true,ruleVersion:result.ruleVersion,method:'unavoidable-fifo-incompatible-head',sense:'eq',coefficients:{['routeTotal:'+r.id]:1},constant:'0'});
     result.witnesses.push({source:m.id,item:k,chain:[...chain],blockedRoute:r.id,receiver:r.to});
    }
    break;
   }
   if(target.type!=='汇流'||target.outPorts?.length!==1||target.outPorts[0].index!==0)break;
   // An outlet filter on a merger could stop a DIFFERENT earlier item.
   // Such a stop can only decrease output, but we avoid claiming upstream
   // liveness across nonstandard filter semantics.
   if(O.get(target.id).some(e=>!unrestricted(e)))break;
   // Ordinary mergers accept every material. Require this contract also
   // on externally constructed specs, to exclude an earlier rejected head.
   if(I.get(target.id).some(e=>[...possibleItems].some(k=>!e.accepted.includes(k))))break;
   const ports=target.mergerPriority;
   if(!Array.isArray(ports)||!ports.includes(r.toPort)||new Set(ports).size!==ports.length||I.get(target.id).some(e=>!ports.includes(e.toPort)))break;
   node=target;
  }
 }
 result.status='proved';return result;
}
if(typeof module!=='undefined')module.exports={provePermanentFifoBlockage};
