'use strict';
// Phase-independent priority proof using an arrival envelope. Sources
// may have unrelated positive rational periods and arbitrary belt delays.
// No phase groups, common-period expansion, clock grid, or event simulation.
function proveWarehouseNoOverflow(g,arith){
 const {q,cmp,add,div,mul,txt,U,Z}=arith;
 const out={certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount;
 function free(e){
  if(!valid(e))return false;
  const m=ns.get(e.to);
  if(m.type==='仓入')return true;
  if(!complete(m)||I.get(m.id).length!==1)return false;
  if(m.type==='电脑'&&O.get(m.id).length===0)return true;
  const r=m.recipe,need=r&&Object.keys(r.inputs||{});
  if(!r||need.length!==1||need[0]!==e.materials[0]||O.get(m.id).length!==1)return false;
  const a=r.inputs[need[0]],b=r.qty,x=O.get(m.id)[0];
  return Number.isSafeInteger(a)&&a>0&&Number.isSafeInteger(b)&&b>0&&b<=a&&cmp(q(r.seconds),Z)>0&&cmp(q(r.seconds),q(a))<=0&&valid(x)&&x.materials[0]===r.output&&ns.get(x.to).type==='仓入';
 }
 for(const p of g.pools||[]){
  const item=p.item,reject=reason=>out.refused.push({item,reason}),
   ins=g.lines.filter(e=>ns.get(e.to).type==='仓入'&&e.materials.includes(item)),
   outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item===item&&O.get(m.id).length);
  const frozen=(g.frozen||[]).filter(f=>Object.hasOwn(f.rates,item)&&cmp(q(f.rates[item]),Z)!==0);
  if(!outlets.length||!ins.length&&!frozen.length)continue;
  if(frozen.some(f=>Object.values(f.rates).some(v=>cmp(q(v),Z)<0))){reject('signed frozen competition');continue;}
  if(!Array.isArray(p.order)||new Set(p.order).size!==p.order.length||outlets.some(m=>!p.order.includes(m.id)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!valid(O.get(m.id)[0]))){reject('unproved priority or route');continue;}
  const ordered=outlets.slice().sort((a,b)=>p.order.indexOf(a.id)-p.order.indexOf(b.id));
  if(!free(O.get(ordered[0].id)[0])){reject('first outlet is not freely draining');continue;}
  let B=frozen.length,rho=Z;const sources=[];for(const f of frozen)rho=add(rho,q(f.rates[item]));
  for(const e of ins){
   const m=ns.get(e.from),r=m.recipe;
   if(!valid(e)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!r||Object.keys(r.inputs||{}).length||!Number.isSafeInteger(r.qty)||r.qty<1||r.output!==item||cmp(q(r.seconds),q(r.qty))<0){reject('source arrival envelope unproved');break;}
   B+=r.qty;rho=add(rho,div(q(r.qty),q(r.seconds)));
   sources.push({machine:m.id,rate:txt(div(U,q(r.seconds))),proven:true,method:'free-autonomous-deposit'});
  }
  if(sources.length!==ins.length)continue;
  // B=C is allowed for STRICT rho<1/P; at equality reserve one slot
  // of headroom to account for reservation-before-simultaneous-dispatch.
  const C=3;
  if(!(B<=C&&cmp(rho,U)<0||B<C&&cmp(rho,U)<=0)){reject('arrival envelope exceeds reservation guarantee');continue;}
  out.certificates.push({proven:true,item,method:'phase-independent-no-overflow-envelope',envelope:{burst:B,rate:txt(rho)},inflow:txt(rho),frozenSources:frozen.map(f=>f.id),sourceRates:sources,outlets:ordered.map((m,i)=>({machine:m.id,route:O.get(m.id)[0].id,rate:i===0?txt(rho):'0'}))});
 }
 return out;
}
if(typeof module!=='undefined')module.exports={proveWarehouseNoOverflow};
