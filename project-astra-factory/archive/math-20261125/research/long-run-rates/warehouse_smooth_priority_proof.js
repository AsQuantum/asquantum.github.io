'use strict';
// Uniform unit arrivals from ONE positive frozen source.
// Prefix of free warehouse outputs, finite reservations C=3.
// Continuous model: certify the first free or independently cadence-limited
// unit-demand outlet; certify the second free outlet if the residual is <1/s.
// No physical deposit or negative frozen consumer of this item.
function proveSmoothWarehousePriority(g,arith){
 const {q,cmp,sub,add,div,txt,U,Z}=arith,out={certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 function free(e){
  if(!valid(e))return false;const m=ns.get(e.to);
  if(m.type==='仓入')return true;
  if(!complete(m)||I.get(m.id).length!==1)return false;
  if(m.type==='电脑')return O.get(m.id).length===0;
  const r=m.recipe,keys=Object.keys(r?.inputs||{}),es=O.get(m.id),a=r?.inputs?.[e.materials[0]];
  return !!r&&keys.length===1&&keys[0]===e.materials[0]&&Number.isSafeInteger(a)&&a>0&&Number.isSafeInteger(r.qty)&&r.qty>0&&r.qty<=a&&cmp(q(r.seconds),Z)>0&&cmp(q(r.seconds),q(a))<=0&&es.length===1&&valid(es[0])&&es[0].materials[0]===r.output&&ns.get(es[0].to).type==='仓入';
 }
 function abundant(m){
  if(!m||m.type!=='仓出'||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!valid(O.get(m.id)[0])||O.get(m.id)[0].materials[0]!==m.item)return false;
  let income=Z;
  for(const f of g.frozen||[]){
   if(!Object.hasOwn(f.rates,m.item))continue;
   const v=q(f.rates[m.item]);if(cmp(v,Z)<0)return false;
   if(Object.values(f.rates).every(x=>cmp(q(x),Z)>=0))income=add(income,v);
  }
  return cmp(income,q(g.nodes.filter(x=>x.type==='仓出'&&x.item===m.item&&O.get(x.id).length).length))>0;
 }
 // A unit-demand terminal recipe with independent other ingredients.
 // Its highest-priority source has G=max(P,1/v). Each next start is
 // bounded by max(G,T), and counting gives the matching upper bound.
 function terminalCadence(e){
  const m=ns.get(e.to),r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
  if(!r||!complete(m)||r.qty!==1||r.inputs[e.materials[0]]!==1||cmp(q(r.seconds),U)<0||outs.length!==1||!valid(outs[0])||outs[0].materials[0]!==r.output||ns.get(outs[0].to).type!=='仓入'||ins.length!==keys.length)return null;
  const T=q(r.seconds);
  if(!keys.every(k=>{
   const es=ins.filter(x=>valid(x)&&x.materials[0]===k),a=r.inputs[k];
   return es.length===1&&Number.isSafeInteger(a)&&a>0&&cmp(q(a),T)<=0&&(es[0].id===e.id||abundant(ns.get(es[0].from)));
  }))return null;
  return {T,machine:m.id};
 }
 for(const p of g.pools||[]){
  const item=p.item,reject=reason=>out.refused.push({item,reason});
  const os=g.nodes.filter(m=>m.type==='仓出'&&m.item===item&&O.get(m.id).length);
  if(!os.length)continue;
  const sources=(g.frozen||[]).filter(f=>Object.hasOwn(f.rates,item)&&cmp(q(f.rates[item]),Z)!==0);
  if(sources.length!==1||Object.values(sources[0].rates).some(v=>cmp(q(v),Z)<0)||g.lines.some(e=>ns.get(e.to).type==='仓入'&&e.materials.includes(item))){reject('not a single independent smooth source');continue;}
  const v=q(sources[0].rates[item]);
  if(cmp(v,Z)<=0){reject('nonpositive source rate');continue;}
  if(!Array.isArray(p.order)||new Set(p.order).size!==p.order.length||os.some(m=>!p.order.includes(m.id)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!valid(O.get(m.id)[0])||O.get(m.id)[0].materials[0]!==item)){reject('unknown withdrawal topology or priority');continue;}
  const ordered=os.slice().sort((a,b)=>p.order.indexOf(a.id)-p.order.indexOf(b.id));
  const first=O.get(ordered[0].id)[0],terminal=free(first)?{T:U,machine:null}:terminalCadence(first);
  if(!terminal){reject('first outlet free or unit-demand cadence not proved');continue;}
  const cap=div(U,terminal.T),high=cmp(v,cap)<=0?v:cap,rest=sub(v,high);
  const all=cmp(v,cap)<=0||ordered.length===1||cmp(rest,U)<0&&free(O.get(ordered[1].id)[0]);
  out.certificates.push({proven:true,item,method:'single-smooth-source-priority-prefix',inflow:txt(v),firstCapacity:txt(cap),firstCadence:txt(terminal.T),firstSupplyGap:txt(cmp(v,U)>=0?U:div(U,v)),completeAllocation:all,residualEnvelope:cmp(v,cap)>0?{burst:3,rate:txt(rest)}:null,outlets:(all?ordered:ordered.slice(0,1)).map((m,i)=>({machine:m.id,route:O.get(m.id)[0].id,rate:txt(i===0?high:i===1?rest:Z)}))});
  if(!all)reject('lower-priority allocation not proved');

 }
 return out;
}
module.exports={proveSmoothWarehousePriority};
