'use strict';
// Exact sufficient shared-ingredient certificates. No arrival phase search.
// A. Independent periodic autonomous sources, subcritical aggregate arrival
// envelope, one-ingredient terminal recipe: no capacity rejection.
// B. Independent permanently stocked warehouse ports: prove nominal batch
// rate by bounded refill for every ingredient, without claiming inlet shares.
function proveSharedRecipeInputs(g,arith){
 const {q,cmp,add,mul,div,txt,U,Z}=arith;
 const result={machineRates:[],refills:[],certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 function abundant(m){
  if(m.type!=='仓出'||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!valid(O.get(m.id)[0])||O.get(m.id)[0].materials[0]!==m.item)return false;
  if(g.unlimited)return true;
  let supply=Z;
  for(const f of g.frozen||[]){
   if(!Object.hasOwn(f.rates,m.item))continue;
   const v=q(f.rates[m.item]);if(cmp(v,Z)<0)return false;
   if(Object.values(f.rates).every(x=>cmp(q(x),Z)>=0))supply=add(supply,v);
  }
  return cmp(supply,q(g.nodes.filter(x=>x.type==='仓出'&&x.item===m.item&&O.get(x.id).length).length))>0;
 }
 for(const m of g.nodes){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
  if(!r||!keys.length||!complete(m)||outs.length!==1||!valid(outs[0])||outs[0].materials[0]!==r.output||ns.get(outs[0].to).type!=='仓入'||ins.some(e=>!valid(e)||!keys.includes(e.materials[0]))||!Number.isSafeInteger(r.qty)||r.qty<1||cmp(q(r.seconds),q(r.qty))<0)continue;
  const groups=keys.map(k=>({item:k,a:r.inputs[k],edges:ins.filter(e=>e.materials[0]===k)}));
  if(groups.some(p=>!Number.isSafeInteger(p.a)||p.a<1||!p.edges.length)||!groups.some(p=>p.edges.length>1))continue;
  // All ingredients can refill before the previous batch completes.
  if(groups.every(p=>p.edges.every(e=>abundant(ns.get(e.from)))&&cmp(q(Math.ceil(p.a/p.edges.length)),q(r.seconds))<=0)){
   const rate=txt(div(U,q(r.seconds)));
   result.machineRates.push({machine:m.id,rate,proven:true,method:'parallel-abundant-input-nominal'});
   result.certificates.push({machine:m.id,method:'parallel-abundant-input-nominal',rate,groups:groups.map(p=>({item:p.item,need:p.a,ports:p.edges.length,refillBound:Math.ceil(p.a/p.edges.length)}))});
   // If there is a full additional cooldown after the worst refill, all
   // heads are ready together at the next release. Strict supply surplus
   // first forces a full shared cache, even with arbitrary starting phases.
   for(const p of groups){
    const n=p.edges.length,R=Math.ceil(p.a/n),priority=m.inputPriority||[];
    if(n<2||cmp(q(r.seconds),q(R+1))<=0||p.edges.some(e=>!priority.includes(e.toPort)))continue;
    const ordered=p.edges.slice().sort((a,b)=>priority.indexOf(a.toPort)-priority.indexOf(b.toPort));
    result.refills.push({machine:m.id,item:p.item,provenReady:true,method:'abundant-shared-input-full-cache-priority-refill',batch:p.a,period:txt(q(r.seconds)),ports:ordered.map((e,i)=>({route:e.id,port:e.toPort,perBatch:Math.floor(p.a/n)+(i<p.a%n?1:0)}))});
   }

   continue;
  }
  if(groups.length!==1){result.refused.push({machine:m.id,reason:'multiple ingredient refill not proved'});continue;}
  const {a,item,edges}=groups[0];let B=0,rho=Z,why=null;
  const sources=[];
  for(const e of edges){
   const s=ns.get(e.from),r0=s.recipe;
   if(!complete(s)||I.get(s.id).length||O.get(s.id).length!==1||!r0||Object.keys(r0.inputs||{}).length||r0.output!==item||!Number.isSafeInteger(r0.qty)||r0.qty<1||cmp(q(r0.seconds),q(r0.qty))<0){why='not independent periodic source';break;}
   B+=r0.qty;rho=add(rho,div(q(r0.qty),q(r0.seconds)));
   sources.push({machine:s.id,rate:txt(div(U,q(r0.seconds))),proven:true,method:'shared-input-arrival-envelope'});
  }
  if(why||B>a+1||cmp(rho,div(q(a),q(r.seconds)))>0){result.refused.push({machine:m.id,reason:why||'arrival envelope exceeds input guarantee',burst:B,rate:txt(rho)});continue;}
  const rate=txt(div(rho,q(a)));
  result.machineRates.push(...sources,{machine:m.id,rate,proven:true,method:'shared-input-arrival-envelope'});
  result.certificates.push({machine:m.id,method:'shared-input-arrival-envelope',rate,item,burst:B,supply:txt(rho),bufferUpper:2*a-1+B,capacity:3*a,sources});
 }
 return result;
}
module.exports={proveSharedRecipeInputs};
