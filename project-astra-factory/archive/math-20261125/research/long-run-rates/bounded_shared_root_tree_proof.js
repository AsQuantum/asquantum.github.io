'use strict';
// An isolated converging recipe tree may have several leaves that are
// outputs of the SAME saturated splitter. Each leaf has an independent
// conservative service clock, not an assumed fixed allocation. The
// true sequence is bracketed between optimistic and pessimistic
// ordinal constraints; only matching slopes become exact rates.
function proveBoundedSharedRootTrees(g,arith,sharedRoots,{abundantItems=[],maxNodes=180,maxEdges=12000}={}){
 const out={certificates:[],witnesses:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||!sharedRoots.length)return out;
 const {q,cmp,Z,U}=arith,ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]])),roots=new Map(sharedRoots.map(x=>[x.route,x]));
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&e.rawMaterials?.length===1&&e.rawMaterials[0]===e.materials[0]&&Number.isSafeInteger(e.length)&&e.length>=1;
 for(const sink of g.nodes){
  if(!sink.recipe||O.get(sink.id).length!==1||ns.get(O.get(sink.id)[0].to).type!=='仓入'||O.get(sink.id)[0].terminalWait!=null)continue;
  const stages=[],ids=[],seen=new Set(),shared=[];let bad=false;
  function visit(m,to,a){
   if(bad)return;
   const ins=I.get(m.id),outs=O.get(m.id),r=m.recipe;
   if(seen.has(m.id)||ins.length!==m.physicalInCount||outs.length!==m.physicalOutCount||outs.length!==1||!valid(outs[0])){bad=true;return;}
   seen.add(m.id);const index=stages.length;
   if(m.type==='仓出'){
    if(ins.length||to===null||!m.item||outs[0].materials[0]!==m.item||!(g.unlimited||abundantItems.includes(m.item))){bad=true;return;}
    stages.push({b:1,T:'1',length:outs[0].length,to,a,readyRoot:true});ids.push(null);return;
   }
   const keys=Object.keys(r?.inputs||{});
   if(!r||outs[0].materials[0]!==r.output||ins.length!==keys.length||new Set(ins.map(e=>e.toPort)).size!==ins.length||keys.some(k=>ins.filter(e=>valid(e)&&e.materials[0]===k).length!==1)){bad=true;return;}
   stages.push({b:r.qty,T:r.seconds,length:outs[0].length,to,a});ids.push(m.id);
   for(const e of ins){
    const amount=r.inputs[e.materials[0]],c=roots.get(e.id);
    if(c&&c.item===e.materials[0]){
     shared.push({index:stages.length,...c});stages.push({b:1,T:'1',length:e.length,to:index,a:amount,readyRoot:true});ids.push(null);
    }else visit(ns.get(e.from),index,amount);
   }
  }
  visit(sink,null,0);
  if(bad||!shared.length)continue;
  const options={clock:'fixed-tick',maxNodes,maxEdges},fast=proveRecipeTree(stages,arith,options);
  if(fast.status!=='proved'){out.refused.push({machine:sink.id,reason:'upper '+fast.reason});continue;}
  const slower=stages.map(x=>({...x}));
  for(const c of shared){slower[c.index].rootGap=c.gap;slower[c.index].rootSpaceWait=c.spaceWait;}
  const slow=proveRecipeTree(slower,arith,options);
  if(slow.status!=='proved'||slow.stageRates.some((v,i)=>v!==fast.stageRates[i])){out.refused.push({machine:sink.id,reason:slow.reason||'shared service slopes differ',upper:fast.stageRates,lower:slow.stageRates});continue;}
  for(let i=0;i<ids.length;i++)if(ids[i]!==null)out.certificates.push({machine:ids[i],rate:fast.stageRates[i],proven:true,method:'bounded-shared-root-tree-equal-slopes',scope:'exact-rational-fixed-tick'});
  out.witnesses.push({method:'bounded-shared-root-tree-equal-slopes',machine:sink.id,shared,stages:ids,stageRates:fast.stageRates,upper:fast.blockTime,lower:slow.blockTime});
 }
 return out;
}
if(typeof module!=='undefined')module.exports={proveBoundedSharedRootTrees};
