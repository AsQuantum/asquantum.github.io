'use strict';
const {proveRecipeTree}=require('./recipe_tree_proof');
// Compare a fastest possible ordinal graph and a guaranteed slow envelope.
// Only independently proved finite roots. A rate is exact only if both
// time bounds meet, after adding external conservation constraints.
function provePriorityRecipeTrees(g,arith,options={}){
 const {q,cmp,add,div,txt,mul,U,Z}=arith,result={machineRates:[],machineBounds:[],trees:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 function root(m){
  const es=O.get(m.id);if(m.type!=='仓出'||!complete(m)||I.get(m.id).length||es.length!==1||!valid(es[0])||es[0].materials[0]!==m.item)return null;
  if(g.unlimited)return {gap:U,limit:null,kind:'unlimited-counterfactual'};
  if(options.abundantItems?.has(m.item))return {gap:U,limit:null,kind:'independently-proved-permanent-stock'};
  const fs=(g.frozen||[]).filter(f=>Object.hasOwn(f.rates,m.item)&&cmp(q(f.rates[m.item]),Z)!==0);
  if(fs.some(f=>cmp(q(f.rates[m.item]),Z)<0))return null;
  let v=Z;for(const f of fs)if(Object.values(f.rates).every(x=>cmp(q(x),Z)>=0))v=add(v,q(f.rates[m.item]));
  const outs=g.nodes.filter(x=>x.type==='仓出'&&x.item===m.item&&O.get(x.id).length);
  if(cmp(v,q(outs.length))>0)return {gap:U,limit:null,kind:'abundant'};
  if(options.clock==='fixed-tick')return null; // no continuous smooth-root assumption
  const p=g.pools.find(p=>p.item===m.item),order=p?.order;
  if(!order||new Set(order).size!==order.length||outs.some(x=>!order.includes(x.id))||outs.some(x=>order.indexOf(x.id)<order.indexOf(m.id))||fs.length!==1||!Object.values(fs[0].rates).every(x=>cmp(q(x),Z)>=0)||cmp(v,Z)<=0||g.lines.some(e=>ns.get(e.to).type==='仓入'&&e.materials.includes(m.item)))return null;
  return {gap:cmp(v,U)>=0?U:div(U,v),limit:v,kind:'first-smooth'};
 }
 for(const sink of g.nodes){
  if(!sink.recipe||O.get(sink.id).length!==1||ns.get(O.get(sink.id)[0].to).type!=='仓入')continue;
  const ids=[],stages=[],roots=[],seen=new Set();let reason=null;
  function visit(id,to,a){
   if(reason)return;const m=ns.get(id),r=m.recipe,ins=I.get(id),os=O.get(id),keys=Object.keys(r?.inputs||{});
   if(seen.has(id)||!complete(m)||os.length!==1||!valid(os[0])){reason='not independent tree';return;}
   seen.add(id);const i=ids.length;ids.push(id);
   if(m.type==='仓出'){
    const p=root(m);if(!p){reason='warehouse root not independently guaranteed';return;}
    roots.push({index:i,item:m.item,...p});stages.push({b:1,T:1,length:os[0].length,to,a,readyRoot:true,rootGap:options.clock==='fixed-tick'?undefined:txt(p.gap)});return;
   }
   if(!r||os[0].materials[0]!==r.output||ins.length!==keys.length||keys.some(k=>ins.filter(e=>valid(e)&&e.materials[0]===k).length!==1)){reason='not one route per ingredient';return;}
   stages.push({b:r.qty,T:r.seconds,length:os[0].length,to,a});for(const e of ins)visit(e.from,i,r.inputs[e.materials[0]]);
  }
  visit(sink.id,null,0);
  if(reason||!roots.length){if(reason)result.refused.push({machine:sink.id,reason});continue;}
  const lo=proveRecipeTree(stages.map(s=>({...s,rootGap:undefined})),arith,options),hi=proveRecipeTree(stages,arith,options);
  if(lo.status!=='proved'||hi.status!=='proved'){result.refused.push({machine:sink.id,reason:'ordinal graph not proved'});continue;}
  let Hlo=q(lo.blockTime),Hhi=q(hi.blockTime);
  for(const r of roots)if(r.limit!==null){const t=div(q(hi.packetCounts[r.index]),r.limit);if(cmp(t,Hlo)>0)Hlo=t;}
  if(cmp(Hlo,Hhi)>0)throw Error('contradictory priority-tree envelope');
  const exact=cmp(Hlo,Hhi)===0;
  ids.forEach((id,i)=>{
   if(!ns.get(id).recipe)return;
   if(exact)result.machineRates.push({machine:id,rate:txt(div(q(hi.batchCounts[i]),Hhi)),proven:true,method:'priority-tree-matching-ordinal-envelopes',scope:hi.scope});
   else result.machineBounds.push({machine:id,lower:txt(div(q(hi.batchCounts[i]),Hhi)),upper:txt(div(q(hi.batchCounts[i]),Hlo)),proven:true,method:'priority-tree-ordinal-envelopes',scope:hi.scope});
  });
  result.trees.push({machines:ids,stages,roots:roots.map(r=>({...r,gap:txt(r.gap),limit:r.limit===null?null:txt(r.limit)})),timeLower:txt(Hlo),timeUpper:txt(Hhi),exact,batchCounts:hi.batchCounts});
 }
 return result;
}
// Same ordinal recurrence, with all warehouse roots permanently ready.
// For any actual supply, its event times satisfy all lower precedence
// bounds; critical circuits upper-bound its cumulative counts. For a
// high-stock interval with every required root ready, the exact
// recurrence gives a uniform interval lower service bound (see §6.4.6).
function proveWarehouseTreeServiceCaps(g,arith,options={}){
 const t=provePriorityRecipeTrees({...g,unlimited:true},arith,{...options,clock:'fixed-tick'}),caps=[],routeRateBounds=[],machineBounds=[];
 const {q,div,txt}=arith;
 for(const tree of t.trees){
  if(!tree.exact)continue;
  const H=q(tree.timeLower),items=[...new Set(tree.roots.map(r=>r.item))];
  for(const r of tree.roots){
   const machine=tree.machines[r.index],e=g.lines.find(e=>e.from===machine);
   if(!e)throw Error('missing tree boundary');
   const rate=txt(div(q(tree.batchCounts[r.index]),H));
   caps.push({route:e.id,machine,item:r.item,rate,otherItems:items.filter(k=>k!==r.item),proven:true,method:'fixed-tick-ordinal-service-capacity'});
   routeRateBounds.push({route:e.id,item:r.item,upper:rate,proven:true,method:'fixed-tick-ordinal-service-capacity'});
  }
  for(let i=0;i<tree.machines.length;i++)if(g.nodes.find(m=>m.id===tree.machines[i])?.recipe)machineBounds.push({machine:tree.machines[i],upper:txt(div(q(tree.batchCounts[i]),H)),proven:true,method:'fixed-tick-ordinal-service-capacity'});
 }
 return {caps,routeRateBounds,machineBounds,trees:t.trees,refused:t.refused};
}
module.exports={provePriorityRecipeTrees,proveWarehouseTreeServiceCaps};
