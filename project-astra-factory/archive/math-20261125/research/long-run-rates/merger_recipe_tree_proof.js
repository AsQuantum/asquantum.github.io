'use strict';
// A homogeneous merger whose independently stocked inputs are always
// eligible at each post-transient refill. Treat only the OUTPUT as a
// permanently ready virtual root; preserve input counts via RR.
const {proveRecipeTree}=require('./recipe_tree_proof');
function proveMergerRecipeTrees(g,arith,options={}){
 const {q,cmp,add,mul,div,txt,U,Z}=arith,result={machineRates:[],roundRobin:[],trees:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 function abundant(m){
  if(m.type!=='仓出'||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!valid(O.get(m.id)[0])||O.get(m.id)[0].materials[0]!==m.item)return false;
  if(g.unlimited)return true;
  let income=Z;
  for(const f of g.frozen||[]){
   if(!Object.hasOwn(f.rates,m.item))continue;
   const v=q(f.rates[m.item]);if(cmp(v,Z)<0)return false;
   if(Object.values(f.rates).every(x=>cmp(q(x),Z)>=0))income=add(income,v);
  }
  return cmp(income,q(g.nodes.filter(x=>x.type==='仓出'&&x.item===m.item&&O.get(x.id).length).length))>0;
 }
 for(const sink of g.nodes){
  if(!sink.recipe||O.get(sink.id).length!==1||ns.get(O.get(sink.id)[0].to).type!=='仓入')continue;
  const ids=[],stages=[],seen=new Set(),rr=[],slowRates=[];let reason=null;
  function visit(id,to,a){
   if(reason)return;
   const m=ns.get(id),r=m.recipe,ins=I.get(id),outs=O.get(id),keys=Object.keys(r?.inputs||{});
   if(seen.has(id)||!complete(m)||outs.length!==1||!valid(outs[0])){reason='shared or invalid node';return;}
   seen.add(id);const i=ids.length;
   if(abundant(m)){ids.push(null);stages.push({b:1,T:1,length:outs[0].length,to,a,readyRoot:true});return;}
   if(m.type==='汇流'){
    if(!ins.length||ins.some(e=>!valid(e)||e.materials[0]!==outs[0].materials[0]||seen.has(e.from))){reason='not compatible homogeneous merger';return;}
    const ready=ins.filter(e=>abundant(ns.get(e.from)));
    const slow=ins.filter(e=>!ready.includes(e));
    if(!ready.length||slow.some(e=>{const s=ns.get(e.from),r=s.recipe;return !complete(s)||I.get(s.id).length||O.get(s.id).length!==1||!r||Object.keys(r.inputs||{}).length||r.output!==e.materials[0];})){reason='no permanent ready feed or unsupported intermittent source';return;}
    for(const e of ins)seen.add(e.from);
    rr.push({machine:id,kind:'merger',ports:ins.map(e=>e.id),unskipped:ready.length>=2?ready.map(e=>e.id):[],commonRoute:outs[0].id,totalRate:null});
    // A free single-ingredient terminal allows the existing clearance
    // theorem for a warehouse deposit to be reused without assuming
    // downstream total flow or slow-inlet fairness.
    const dest=ns.get(outs[0].to),dr=dest.recipe,di=I.get(dest.id),doo=O.get(dest.id);
    const demand=dr?.inputs?.[outs[0].materials[0]];
    const free=complete(dest)&&dr&&Object.keys(dr.inputs||{}).length===1&&di.length===1&&doo.length===1&&valid(doo[0])&&doo[0].materials[0]===dr.output&&ns.get(doo[0].to).type==='仓入'&&Number.isSafeInteger(demand)&&demand>=1&&dr.qty<=demand&&cmp(q(dr.seconds),q(demand))<=0;
    // A unit-demand terminal with proved nominal cadence H>P induces
    // H-spaced output slots by the established reverse-pressure lemma.
    // Two-input RR then alternates once the slow port has had a service
    // and can replenish within 2H. No mean-rate-to-cadence inference.
    const H=dr?q(dr.seconds):Z;
    const periodic=ins.length===2&&ready.length===1&&slow.length===1&&complete(dest)&&dr&&demand===1&&dr.qty===1&&cmp(H,q(2))>0&&doo.length===1&&valid(doo[0])&&doo[0].materials[0]===dr.output&&ns.get(doo[0].to).type==='仓入'&&di.length===Object.keys(dr.inputs||{}).length&&Object.entries(dr.inputs).every(([k,a])=>{
     const es=di.filter(e=>valid(e)&&e.materials[0]===k);
     return es.length===1&&Number.isSafeInteger(a)&&a>0&&cmp(q(a),H)<=0&&(es[0].id===outs[0].id||abundant(ns.get(es[0].from)));
    });
    if(periodic){
     const r0=ns.get(slow[0].from).recipe;
     if(r0.qty===1&&cmp(q(r0.seconds),U)>=0&&cmp(q(r0.seconds),mul(q(2),H))<0){
      const cert=rr.at(-1);
      cert.unskipped=ins.map(e=>e.id);cert.rule='two-input-alternation-proved-output-cadence';
     }
    }
    if(free){
     const D=add(q(ins.length+1),q('1/2'));
     for(const e of slow){
      const s=ns.get(e.from),r=s.recipe;
      if(Number.isSafeInteger(r.qty)&&r.qty>=1&&cmp(mul(q(r.qty),D),q(r.seconds))<=0)
       slowRates.push({machine:s.id,rate:txt(div(U,q(r.seconds))),proven:true,method:'merger-functional-free-terminal-clearance'});
     }
    }
    ids.push(null);stages.push({b:1,T:1,length:outs[0].length,to,a,readyRoot:true});return;
   }
   if(!r||outs[0].materials[0]!==r.output||ins.length!==keys.length||keys.some(k=>ins.filter(e=>valid(e)&&e.materials[0]===k).length!==1)){reason='not independent recipe tree';return;}
   ids.push(id);stages.push({b:r.qty,T:r.seconds,length:outs[0].length,to,a});
   for(const e of ins)visit(e.from,i,r.inputs[e.materials[0]]);
  }
  visit(sink.id,null,0);
  if(reason||!rr.length){if(reason)result.refused.push({machine:sink.id,reason});continue;}
  const p=proveRecipeTree(stages,arith,options);if(p.status!=='proved'){result.refused.push({machine:sink.id,reason:p.reason});continue;}
  result.roundRobin.push(...rr);result.machineRates.push(...slowRates);result.trees.push({machines:ids,stages,...p});
  ids.forEach((id,i)=>{if(id!==null)result.machineRates.push({machine:id,rate:p.stageRates[i],proven:true,method:'permanently-ready-merger-root-ordinal-graph'});});
 }
 return result;
}
module.exports={proveMergerRecipeTrees};
