'use strict';
// Real warehouse refill: after inventory stays high, the 3-slot physical
// buffer is always ready at an eligible dispatch (possibly after <=1s).
// Certify one or more warehouse roots per otherwise independent ordinary
// recipe tree, with an unrestricted compatible warehouse terminal.
function proveWarehouseReadyTrees(g,arith,{maxNodes=600,maxEdges=30000}={}){
 const result={caps:[],trees:[],refused:[]};
 g=(typeof module!=='undefined'?require('./recipe_tree_proof').buildStraightRecipeProofView:buildStraightRecipeProofView)(g);
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 for(const sink of g.nodes){
  if(!sink.recipe||O.get(sink.id).length!==1||ns.get(O.get(sink.id)[0].to).type!=='仓入')continue;
  const ids=[],stages=[],seen=new Set(),roots=[];let bad=false;
  function visit(id,to,a){
   if(bad)return;
   const m=ns.get(id),r=m.recipe,ins=I.get(id),outs=O.get(id);
   if(seen.has(id)||ins.length!==m.physicalInCount||outs.length!==m.physicalOutCount||outs.length!==1||!valid(outs[0])){bad=true;return;}
   seen.add(id);const i=ids.length;ids.push(id);
   if(m.type==='仓出'){
    if(to===null||ins.length||!m.item||outs[0].materials[0]!==m.item){bad=true;return;}
    roots.push({id,item:m.item,route:outs[0].id,index:i});stages.push({b:1,T:'1',length:outs[0].length,transit:outs[0].transit,to,a,readyRoot:true});return;
   }
   const keys=Object.keys(r?.inputs||{});
   if(!r||outs[0].materials[0]!==r.output||ins.length!==keys.length||new Set(ins.map(e=>e.toPort)).size!==ins.length||keys.some(k=>ins.filter(e=>valid(e)&&e.materials[0]===k).length!==1)){bad=true;return;}
   stages.push({b:r.qty,T:r.seconds,length:outs[0].length,transit:outs[0].transit,to,a});
   for(const e of ins)visit(e.from,i,r.inputs[e.materials[0]]);
  }
  visit(sink.id,null,0);
  if(bad||!roots.length)continue;
  const proof=proveRecipeTree(stages,arith,{clock:'fixed-tick',maxNodes,maxEdges});
  if(proof.status!=='proved'){result.refused.push({machine:sink.id,reason:proof.reason});continue;}
  const wait=O.get(sink.id)[0].terminalWait;
  if(wait!=null){
   const slow=proveRecipeTree(stages,arith,{clock:'fixed-tick',maxNodes,maxEdges,terminalWait:wait});
   if(slow.status!=='proved'||slow.stageRates.some((v,i)=>v!==proof.stageRates[i])){result.refused.push({machine:sink.id,reason:'bounded receiver slope not invariant'});continue;}
   proof.receiverWaitProof={wait,stageRates:slow.stageRates,criticalCircuit:slow.criticalCircuit};
  }
  const items=[...new Set(roots.map(w=>w.item))],caps=roots.map(w=>({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'warehouse-ready-fixed-frame-ordinal-tree',machine:w.id,item:w.item,route:w.route,rate:proof.routeRates[w.index],machines:ids,stageRates:proof.stageRates,criticalCircuit:proof.criticalCircuit,receiverWaitProof:proof.receiverWaitProof,tree:sink.id,requiredItems:items}));
  result.caps.push(...caps);result.trees.push({id:sink.id,caps,machines:ids,stageRates:proof.stageRates});
 }
 return result;
}
// For any synchronous window a consumer's cumulative consumption is <=
// its static bound * duration + O(1). For direct recipe inputs this follows
// from the bounded belt + input/active/output queues and nominal batch clock.
function proveWarehouseCapacityBounds(g,arith,readyCaps=[]){
 const {q,cmp,div,mul,txt,U,Z}=arith,ns=new Map(g.nodes.map(m=>[m.id,m])),out={};
 for(const m of g.nodes.filter(m=>m.type==='仓出'&&m.item)){
  let upper=U;
  const es=g.lines.filter(e=>e.from===m.id);
  if(!es.length)upper=Z;
  else if(es.length===1){
   const e=es[0],d=ns.get(e.to),r=d?.recipe;
   if(!e.materials.includes(m.item))upper=Z;
   else if(r&&Object.hasOwn(r.inputs,m.item)){
    const a=q(r.inputs[m.item]),b=q(r.qty),T=q(r.seconds),outs=g.lines.filter(x=>x.from===d.id&&x.materials.includes(r.output)).length;
    for(const v of [div(a,T),div(mul(a,q(outs)),b)])if(cmp(v,upper)<0)upper=v;
   }
  }
  const cap=readyCaps.find(x=>x.machine===m.id);
  if(cap&&cmp(q(cap.rate),upper)<0)upper=q(cap.rate);
  out[m.id]=txt(upper);
 }
 return out;
}
// At or above the sum of ALL consumers' cumulative upper capacities,
// every independently high-stock work-conserving subnetwork attains its
// own cap. No need for the other consumers to be free or known individually.
function proveBalancedStockSaturation(g,arith,values,readyCaps,uppers,netLower={}){
 const {q,cmp,add,sub,txt,Z,U}=arith,out={relations:[],witnesses:[]};
 if(g.unlimited)return out;
 for(const cap of readyCaps){
  const item=cap.item,income=values['inflow:'+item];if(income==null)continue;
  if((cap.requiredItems||[item]).some(k=>k!==item&&![values['net:'+k],netLower[k]].some(v=>v!=null&&cmp(q(v),Z)>0)))continue;
  let total=Z;
  for(const m of g.nodes.filter(m=>m.type==='仓出'&&m.item===item))total=add(total,q(uppers[m.id]??'1'));
  for(const f of g.frozen||[]){const v=q(f.rates[item]??'0');if(cmp(v,Z)<0)total=sub(total,v);}
  if(cmp(q(income),total)<0)continue;
  const query='machineTotal:'+cap.machine+'|out';
  if(values[query]===cap.rate)continue;
  out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'balanced-stock-ready-tree-saturation',sense:'eq',coefficients:{[query]:1},constant:cap.rate});
  out.witnesses.push({query,rate:cap.rate,income,totalUpper:txt(total),cap});
 }
 return out;
}
// Joint low-stock boundary proof for an independent converging tree.
// All its withdrawals are proportional to one terminal batch counter,
// up to bounded buffers. Outside consumers may be arbitrary, provided
// their actual cumulative average is independently fixed.
function proveJointWarehouseTreeBottleneck(g,arith,values,trees){
 const {q,cmp,add,sub,mul,div,txt,Z,U}=arith,out={relations:[],witnesses:[]};
 if(g.unlimited)return out;
 for(const tree of trees){
  const roots=new Set(tree.caps.map(c=>c.machine)),need=new Map();
  for(const c of tree.caps)need.set(c.item,add(need.get(c.item)||Z,q(c.rate)));
  let scale=U,ok=true;const evidence=[];
  for(const [item,cap] of need){
   const income=values['inflow:'+item];if(income==null||cmp(cap,Z)<=0){ok=false;break;}
   let other=Z;
   for(const m of g.nodes.filter(m=>m.type==='仓出'&&m.item===item&&!roots.has(m.id))){
    const r=values['machineTotal:'+m.id+'|out'];if(r==null){ok=false;break;}other=add(other,q(r));
   }
   if(!ok)break;
   for(const f of g.frozen||[]){
    const r=q(f.rates[item]??'0');if(cmp(r,Z)>=0)continue;
    const duty=values['duty:'+f.id];if(duty==null){ok=false;break;}other=sub(other,mul(r,q(duty)));
   }
   if(!ok)break;
   const available=sub(q(income),other);if(cmp(available,Z)<0){ok=false;break;}
   const ratio=div(available,cap);if(cmp(ratio,scale)<0)scale=ratio;
   evidence.push({item,income,other:txt(other),fullDemand:txt(cap),ratio:txt(ratio)});
  }
  if(!ok)continue;
  for(const c of tree.caps){
   const query='machineTotal:'+c.machine+'|out',rate=txt(mul(q(c.rate),scale));
   if(values[query]===rate)continue;
   out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'joint-warehouse-tree-bottleneck',sense:'eq',coefficients:{[query]:1},constant:rate});
  }
  out.witnesses.push({method:'joint-warehouse-tree-bottleneck',tree:tree.id,scale:txt(scale),evidence});
 }
 return out;
}
if(typeof module!=='undefined')module.exports={proveWarehouseReadyTrees,proveWarehouseCapacityBounds,proveBalancedStockSaturation,proveJointWarehouseTreeBottleneck};
