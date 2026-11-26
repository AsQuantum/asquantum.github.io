'use strict';
// Necessary count relations for a saturated homogeneous splitter with a
// free outlet. Bounded scan waits feed a conservative ordinal graph for
// each independent downstream recipe tree. The graph yields LOWER rates,
// not guessed actual rates. Exact count elimination resolves the remainder.
const {proveRecipeTree}=require('./recipe_tree_proof');
function proveSplitRecipeBranches(g,arith,options={}){
 const {q,cmp,mul,add,div,txt,U,Z}=arith;
 const result={machineRates:[],machineBounds:[],roundRobin:[],branches:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 function saturatedWarehouse(m){
  if(m.type!=='仓出'||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!valid(O.get(m.id)[0])||O.get(m.id)[0].materials[0]!==m.item)return false;
  if(g.unlimited)return true;
  const consumers=g.nodes.filter(x=>x.type==='仓出'&&x.item===m.item&&O.get(x.id).length);
  let income=Z;
  for(const f of g.frozen||[]){
   if(!Object.hasOwn(f.rates,m.item))continue;
   const v=q(f.rates[m.item]);
   if(cmp(v,Z)<0)return false;
   if(Object.values(f.rates).every(x=>cmp(q(x),Z)>=0))income=add(income,v);
  }
  return cmp(income,q(consumers.length))>0;
 }
 function saturatedAutonomous(m,e){
  const r=m.recipe;
  return !!r&&complete(m)&&I.get(m.id).length===0&&O.get(m.id).length===1&&Object.keys(r.inputs||{}).length===0&&r.output===e.materials[0]&&Number.isSafeInteger(r.qty)&&r.qty>0&&cmp(q(r.seconds),q(r.qty))===0;
 }
 for(const split of g.nodes){
  if(split.type!=='分流'||!complete(split))continue;
  const ins=I.get(split.id),outs=O.get(split.id);
  if(ins.length!==1||outs.length<2||[...ins,...outs].some(e=>!valid(e)||e.materials[0]!==ins[0].materials[0]))continue;
  // A recipe terminal with one ingredient and enough service capacity
  // for even a full-rate input is also independently free.
  const free=outs.filter(e=>{
   const m=ns.get(e.to);if(m.type==='仓入')return true;
   const r=m.recipe,keys=Object.keys(r?.inputs||{}),es=O.get(m.id);
   return complete(m)&&I.get(m.id).length===1&&keys.length===1&&keys[0]===e.materials[0]&&es.length===1&&valid(es[0])&&es[0].materials[0]===r.output&&ns.get(es[0].to).type==='仓入'&&Number.isSafeInteger(r.inputs[keys[0]])&&r.inputs[keys[0]]>0&&Number.isSafeInteger(r.qty)&&r.qty>0&&r.qty<=r.inputs[keys[0]]&&cmp(q(r.seconds),q(r.inputs[keys[0]]))<=0;
  });
  const source=ns.get(ins[0].from);
  if(!(free.length&&saturatedAutonomous(source,ins[0]))&&!saturatedWarehouse(source)){result.refused.push({machine:split.id,reason:'saturated splitter feed not proved'});continue;}
  const D=free.length?q(outs.length):add(U,mul(q(outs.length),add(U,div(q(ins[0].length),q(2)))));
  if(free.length)result.roundRobin.push({machine:split.id,kind:'splitter',ports:outs.map(e=>e.id),unskipped:free.map(e=>e.id),commonRoute:ins[0].id,totalRate:'1'});
  if(source.recipe)result.machineRates.push({machine:source.id,rate:txt(arith.div(U,q(source.recipe.seconds))),proven:true,method:'free-splitter-saturated-autonomous'});
  for(const branch of outs.filter(e=>ns.get(e.to).type!=='仓入')){
   // Walk forward to the free terminal along unique recipe outputs.
   let m=ns.get(branch.to),reason=null;const forward=new Set();
   while(m.type!=='仓入'){
    const es=O.get(m.id);
    if(!m.recipe||forward.has(m.id)||!complete(m)||es.length!==1||!valid(es[0])){reason='non-tree downstream branch';break;}
    forward.add(m.id);m=ns.get(es[0].to);
   }
   if(reason){result.refused.push({route:branch.id,reason});continue;}
   // Walk backward from that terminal recipe, with one virtual splitter
   // root and optional independently abundant warehouse roots.
   const terminal=[...forward].at(-1),ids=[],stages=[],seen=new Set();let hasBranch=false;
   function visit(id,to,a,via){
    if(reason)return;
    if(id===split.id){
     if(via?.id!==branch.id||hasBranch){reason='shared splitter feeds multiple ingredients';return;}
     hasBranch=true;ids.push(null);stages.push({b:1,T:txt(D),offerGap:txt(D),length:branch.length,to,a});return;
    }
    const m=ns.get(id),r=m.recipe,ins=I.get(id),es=O.get(id);
    if(seen.has(id)||!complete(m)||es.length!==1||!valid(es[0])){reason='shared or invalid upstream machine';return;}
    seen.add(id);
    const i=ids.length;
    if(saturatedWarehouse(m)){ids.push(null);stages.push({b:1,T:1,offerGap:1,length:es[0].length,to,a});return;}
    const keys=Object.keys(r?.inputs||{});
    if(!r||es[0].materials[0]!==r.output||ins.length!==keys.length||keys.some(k=>ins.filter(e=>valid(e)&&e.materials[0]===k).length!==1)){reason='upstream ingredient not independent';return;}
    ids.push(id);stages.push({b:r.qty,T:r.seconds,length:es[0].length,to,a});
    for(const e of ins)visit(e.from,i,r.inputs[e.materials[0]],e);
   }
   visit(terminal,null,0,null);
   if(reason||!hasBranch){result.refused.push({route:branch.id,reason:reason||'branch not found'});continue;}
   const p=proveRecipeTree(stages,arith,options);
   if(p.status!=='proved'){result.refused.push({route:branch.id,reason:p.reason});continue;}
   ids.forEach((id,i)=>{if(id!==null)result.machineBounds.push({machine:id,lower:p.stageRates[i],proven:true,method:'bounded-splitter-scan-ordinal-envelope'});});
   result.branches.push({route:branch.id,machines:ids,stages,...p,offerGap:txt(D),scope:'lower-rates-only'});
  }
 }
 return result;
}
module.exports={proveSplitRecipeBranches};
