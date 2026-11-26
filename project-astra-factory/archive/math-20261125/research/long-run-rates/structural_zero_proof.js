'use strict';
// Eliminate only variables proved zero by nonnegative bounded-buffer
// conservation or empty-start material reachability. Do NOT delete machines
// from the physical layout: finite initial production/refills still matter.
function proveStructuralZeroFlows(g){
 const zero=new Map(g.lines.map(e=>[e.id,new Set()])),cycles=new Set(g.emptyStartProof?.cannotProduce||[]),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){I.get(e.to).push(e);O.get(e.from).push(e);}
 let changed=false,passes=0;
 const set=(e,k)=>{const z=zero.get(e.id);if(!z.has(k)){z.add(k);changed=true;}};
 const setAll=es=>{for(const e of es)for(const k of e.materials)set(e,k);};
 const live=(es,k)=>es.some(e=>e.materials.includes(k)&&!zero.get(e.id).has(k));
 // Split physical weak components without coupling distinct warehouse-in
 // ports. A computer has one shared finite FIFO and remains a single node.
 const ns=new Map(g.nodes.map(m=>[m.id,m])),seen=new Set(),excludedComponents=[];
 for(const m of g.nodes){
  if(m.type==='仓入'||seen.has(m.id))continue;
  const ids=[m.id];seen.add(m.id);
  for(let j=0;j<ids.length;j++)for(const e of [...I.get(ids[j]),...O.get(ids[j])]){
   const other=e.from===ids[j]?e.to:e.from;
   if(ns.get(other).type==='仓入'||seen.has(other))continue;
   seen.add(other);ids.push(other);
  }
  const members=new Set(ids),es=ids.flatMap(id=>O.get(id)),sources=ids.filter(id=>{
   const a=ns.get(id);return a.type==='仓出'&&!!a.item||!!a.recipe&&!Object.keys(a.recipe.inputs||{}).length;
  }),terminals=[...ids.filter(id=>ns.get(id).type==='电脑'),...es.filter(e=>ns.get(e.to).type==='仓入').map(e=>'warehouse-in:'+e.id)];
  // For terminal-less DAGs, reverse topological bounded-flow conservation
  // proves zero independently of any initial finite contents. Preserve
  // possible closed circulating components rather than deleting by fiat.
  let cyclic=false;
  if(!terminals.length){
   const indeg=new Map(ids.map(id=>[id,I.get(id).filter(e=>members.has(e.from)).length])),queue=ids.filter(id=>indeg.get(id)===0);
   for(let j=0;j<queue.length;j++)for(const e of O.get(queue[j]))if(members.has(e.to)){indeg.set(e.to,indeg.get(e.to)-1);if(indeg.get(e.to)===0)queue.push(e.to);}
   cyclic=queue.length!==ids.length;
  }
  const reason=!sources.length?'no-source-empty-start':!terminals.length&&!cyclic?'no-terminal-acyclic':null;
  if(!reason)continue;
  for(const id of ids)if(ns.get(id).recipe)cycles.add(id);
  setAll(es);
  excludedComponents.push({machines:ids,routes:es.map(e=>e.id),x:sources.length,y:ids.length-sources.length-ids.filter(id=>ns.get(id).type==='电脑').length,z:terminals.length,reason});
 }
 for(const e of g.lines)for(const k of e.materials)if(e.outFilter&&e.outFilter!=='任意'&&e.outFilter!==k||Array.isArray(e.acceptedMaterials)&&!e.acceptedMaterials.includes(k)||g.emptyStartProof?.routeItems&&Object.hasOwn(g.emptyStartProof.routeItems,e.id)&&!g.emptyStartProof.routeItems[e.id].includes(k))set(e,k);
 do{
  changed=false;passes++;
  for(const m of g.nodes){
   const ins=I.get(m.id),outs=O.get(m.id),r=m.recipe;
   if(r){
    if(!cycles.has(m.id)&&(!live(outs,r.output)||Object.keys(r.inputs||{}).some(k=>!live(ins,k)))){cycles.add(m.id);changed=true;}
    if(cycles.has(m.id)){setAll(ins);setAll(outs);}
    else{
     for(const e of ins)for(const k of e.materials)if(!Object.hasOwn(r.inputs||{},k))set(e,k);
     for(const e of outs)for(const k of e.materials)if(k!==r.output)set(e,k);
    }
   }else if(m.type==='分流'||m.type==='汇流'){
    const keys=new Set([...ins,...outs].flatMap(e=>e.materials));
    for(const k of keys)if(!live(ins,k)||!live(outs,k))for(const e of [...ins,...outs])if(e.materials.includes(k))set(e,k);
   }
  }
 }while(changed);
 const routes=g.lines.filter(e=>e.materials.every(k=>zero.get(e.id).has(k))).map(e=>e.id);
 return {cycles,zero,routes,passes,summary:{cycles:[...cycles],routes,passes,excludedComponents,materialZeros:[...zero.values()].reduce((n,s)=>n+s.size,0)}};
}
if(typeof module!=='undefined')module.exports={proveStructuralZeroFlows};
