'use strict';
// A single-item periodic source, one single-input frozen consumer, and
// a freely draining lower-priority warehouse outlet. The consumer retains
// one next item, not all later arrivals. Closed count formula under ideal
// instantaneous deposit-before-reservation semantics. No event stepping.
function proveFrozenProtectedItem(g,arith){
 const {q,cmp,add,sub,mul,div,txt,U,Z}=arith;
 const result={duties:[],warehouseBursts:[],machineRates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),fs=g.frozen||[],I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(fs.map(f=>f.id)).size!==fs.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const neg=v=>cmp(q(v),Z)<0,pos=v=>cmp(q(v),Z)>0;
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount;
 function free(e){
  if(!valid(e))return false;
  const m=ns.get(e.to);
  if(m.type==='仓入')return true;
  if(!complete(m)||I.get(m.id).length!==1)return false;
  if(m.type==='电脑'&&O.get(m.id).length===0)return true;
  const r=m.recipe,ks=r&&Object.keys(r.inputs||{});
  if(!r||ks.length!==1||ks[0]!==e.materials[0]||O.get(m.id).length!==1)return false;
  const a=r.inputs[ks[0]],b=r.qty,out=O.get(m.id)[0];
  return Number.isSafeInteger(a)&&a>0&&Number.isSafeInteger(b)&&b>0&&b<=a&&cmp(q(r.seconds),Z)>0&&cmp(q(r.seconds),q(a))<=0&&valid(out)&&out.materials[0]===r.output&&ns.get(out.to).type==='仓入';
 }
 for(const f of fs){
  const needs=Object.entries(f.rates).filter(([,v])=>neg(v));
  if(needs.length!==1)continue;
  const [item,v]=needs[0],reject=reason=>result.refused.push({factory:f.id,item,reason});
  if(fs.some(x=>x.id!==f.id&&Object.hasOwn(x.rates,item)&&neg(x.rates[item]))){reject('multiple frozen consumers');continue;}
  const deposits=g.lines.filter(e=>ns.get(e.to).type==='仓入'&&e.materials.includes(item));
  const producers=fs.filter(x=>Object.hasOwn(x.rates,item)&&pos(x.rates[item]));
  if(deposits.length+producers.length!==1){reject('not a single independent unit arrival source');continue;}
  const outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item===item&&O.get(m.id).length);
  const pool=(g.pools||[]).find(p=>p.item===item);
  if(!outlets.length)continue;
  if(!pool||!Array.isArray(pool.order)||new Set(pool.order).size!==pool.order.length||outlets.some(m=>!pool.order.includes(m.id)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!valid(O.get(m.id)[0]))){reject('unproved outlet order');continue;}
  outlets.sort((a,b)=>pool.order.indexOf(a.id)-pool.order.indexOf(b.id));
  if(!free(O.get(outlets[0].id)[0])){reject('lower priority outlet not free');continue;}
  let H,sourceRate=null;
  if(producers.length){
   const p=producers[0];
   if(Object.values(p.rates).some(neg)||fs.indexOf(p)>=fs.indexOf(f)){reject('producer must be independent and before consumer');continue;}
   H=div(U,q(p.rates[item]));
  }else{
   const e=deposits[0],m=ns.get(e.from),r=m.recipe;
   if(!valid(e)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!r||r.qty!==1||r.output!==item||Object.keys(r.inputs||{}).length){reject('physical unit source unproved');continue;}
   H=q(r.seconds);if(cmp(H,U)<0){reject('unit arrival interval below port cooldown');continue;}
   sourceRate={machine:m.id,rate:txt(div(U,H)),proven:true,method:'independent-periodic-unit-deposit'};
  }
  if(cmp(H,U)<0){reject('unit arrival interval below port cooldown');continue;}
  const a=sub(Z,q(v)),tau=div(U,a),ratio=div(tau,H),n=(ratio.n+ratio.d-1n)/ratio.d;
  // Exact coincident completion / arrival needs the declared convention:
  // if a completed item frees protection at that moment, the new one is
  // protected immediately. Reject that boundary here, rather than rely
  // on the frozen service implementation's within-tick ordering.
  if(ratio.d===1n){reject('coincident completion boundary not certified');continue;}
  const cycle=mul(q(n),H),rate=div(U,cycle),income=div(U,H),duty=div(rate,a),remaining=sub(income,rate);
  result.duties.push({factory:f.id,duty:txt(duty),proven:true,method:'protected-single-item-arrival-count',item,arrivalPeriod:txt(H),servicePerItem:txt(tau),arrivalsPerCycle:String(n),cycle:txt(cycle),consumption:txt(rate)});
  if(sourceRate)result.machineRates.push(sourceRate);
  result.warehouseBursts.push({item,proven:true,method:'protected-single-item-residual',inflow:txt(income),outlets:outlets.map((m,i)=>({machine:m.id,route:O.get(m.id)[0].id,rate:i===0?txt(remaining):'0'}))});
 }
 return result;
}
if(typeof module!=='undefined')module.exports={proveFrozenProtectedItem};
