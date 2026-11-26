'use strict';
// Sufficient no-overflow receiver certificate, then batch-priority warehouse
// count theorem. No event stepping, average-demand guesses or fixture IDs.
// Assumes empty startup, continuous instant service with the simulator's
// ordering at simultaneous arrivals: all deposits, all reservations in
// numeric priority order, then dispatch; reservations cannot be stolen.
function proveWarehouseBurstPriority(g,arith){
 const {q,cmp,mul,div,add,sub,txt,U,Z}=arith,P=U;
 const result={certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount;
 // These sinks cannot backpressure their sole input from an empty start:
 // (i) direct deposit; (ii) computer, 10 slots, rate 1/P;
 // (iii) single-ingredient recipe, q items per batch, processing T<=qP,
 // b<=q, unique product output to free deposit. Each qth arrival may
 // start a batch; previous batch already completed, output drained.
 function free(e){
  if(!valid(e))return false;
  const m=ns.get(e.to);
  if(m.type==='仓入')return true;
  if(!complete(m)||I.get(m.id).length!==1)return false;
  if(m.type==='电脑'&&O.get(m.id).length===0)return true;
  const r=m.recipe,need=r&&Object.keys(r.inputs||{});
  if(!r||need.length!==1||need[0]!==e.materials[0]||O.get(m.id).length!==1)return false;
  const a=r.inputs[need[0]],b=r.qty,out=O.get(m.id)[0];
  return Number.isSafeInteger(a)&&a>0&&Number.isSafeInteger(b)&&b>0&&b<=a&&cmp(q(r.seconds),Z)>0&&cmp(q(r.seconds),mul(q(a),P))<=0&&valid(out)&&out.materials[0]===r.output&&ns.get(out.to).type==='仓入';
 }
 for(const pool of g.pools||[]){
  const k=pool.item,ins=g.lines.filter(e=>ns.get(e.to).type==='仓入'&&e.materials.includes(k)),
   outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item===k&&O.get(m.id).length);
  const reject=reason=>result.refused.push({item:k,reason});
  if(!ins.length||!outlets.length)continue;
  if((g.frozen||[]).some(f=>Object.hasOwn(f.rates,k)&&cmp(q(f.rates[k]),Z)!==0)){reject('frozen contribution to this item');continue;}
  if(!Array.isArray(pool.order)||new Set(pool.order).size!==pool.order.length||outlets.some(m=>!pool.order.includes(m.id))){reject('unknown reservation priority');continue;}
  if(outlets.some(m=>!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!free(O.get(m.id)[0]))){reject('outlet clearance not proven');continue;}
  const src=ins.map(e=>ns.get(e.from));
  if(ins.some((e,i)=>!valid(e)||!complete(src[i])||I.get(src[i].id).length||O.get(src[i].id).length!==1||!src[i].recipe||Object.keys(src[i].recipe.inputs||{}).length||src[i].recipe.qty!==1||src[i].recipe.output!==k||cmp(q(src[i].recipe.seconds),P)<0)){reject('not independent unit sources');continue;}
  const H=q(src[0].recipe.seconds);
  if(src.some(m=>cmp(q(m.recipe.seconds),H)!==0)){reject('no common source period');continue;}
  // For independent single-item generators with a common period, the
  // residue of propagation delay determines arrival groups. No trajectory
  // or periodic-state search is needed. Earlier incomplete groups during
  // startup can only allocate fewer items than their eventual full group.
  const groups=new Map();
  for(const e of ins){
   const a=div(q(e.length),q(2)),ratio=div(a,H),phase=sub(a,mul(q(ratio.n/ratio.d),H)),key=txt(phase);
   if(!groups.has(key))groups.set(key,{phase,count:0});
   groups.get(key).count++;
  }
  const word=[...groups.values()].sort((a,b)=>cmp(a.phase,b.phase));
  const ordered=outlets.slice().sort((a,b)=>pool.order.indexOf(a.id)-pool.order.indexOf(b.id)),B=src.length,C=3;
  const counts=ordered.map(()=>0),bursts=[];
  let safe=true;
  for(let j=0;j<word.length;j++){
   const x=word[j],gap=sub(j+1<word.length?word[j+1].phase:add(word[0].phase,H),x.phase);
   if(x.count>C*ordered.length){reject('burst exceeds all reservation queues');safe=false;break;}
   const allocation=ordered.map((_,i)=>Math.min(C,Math.max(0,x.count-i*C)));
   if(allocation.some(a=>a>0&&cmp(mul(q(a),P),gap)>=0)){reject('not enough time to clear one burst strictly before next');safe=false;break;}
   allocation.forEach((a,i)=>counts[i]+=a);
   bursts.push({phase:txt(x.phase),count:x.count,gap:txt(gap),allocation});
  }
  if(!safe)continue;
  const rates=ordered.map((m,i)=>({machine:m.id,route:O.get(m.id)[0].id,count:counts[i],rate:txt(div(q(counts[i]),H))}));
  result.certificates.push({proven:true,item:k,method:'separated-finite-reservation-bursts',period:txt(H),burst:B,bursts,queueCapacity:C,sourceRates:src.map(m=>({machine:m.id,rate:txt(div(U,H)),proven:true,method:'independent-free-deposit-generator'})),inflow:txt(div(q(B),H)),outlets:rates});

 }
 return result;
}
if(typeof module!=='undefined')module.exports={proveWarehouseBurstPriority};
