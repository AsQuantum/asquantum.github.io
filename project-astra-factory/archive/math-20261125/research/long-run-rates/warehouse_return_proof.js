'use strict';
// Positive-surplus direct warehouse recirculation. Augment warehouse stock
// by the finite in-flight inventory on its direct return belts. Only
// independent count-proved external physical deposits may supply a lower bound.
function proveWarehouseReturnSurplus(g,arith,knownPhysical={}){
 const {q,cmp,add,sub,txt,U,Z}=arith,out={certificates:[],returnPools:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount;
 const frozen=g.frozen||[];
 for(const item of new Set(g.nodes.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item))){
  const withdrawals=g.lines.filter(e=>ns.get(e.from).type==='仓出'&&ns.get(e.from).item===item);
  if(withdrawals.some(e=>!complete(ns.get(e.from))||I.get(e.from).length||O.get(e.from).length!==1)){out.refused.push({item,reason:'unknown withdrawal structure'});continue;}
  const returns=withdrawals.filter(e=>valid(e)&&e.materials[0]===item&&ns.get(e.to).type==='仓入');
  if(!returns.length)continue;
  const ret=new Set(returns.map(e=>e.id)),external=g.lines.filter(e=>ns.get(e.to).type==='仓入'&&e.materials.includes(item)&&!ret.has(e.id));
  let lower=Z,cap=q(withdrawals.length-returns.length),exact=true,nonnegative=true;
  for(const e of external){
   const k='flow:'+e.id+'|'+item;
   if(Object.hasOwn(knownPhysical,k)&&knownPhysical[k]!==null){const v=q(knownPhysical[k]);if(cmp(v,Z)<0||cmp(v,U)>0)throw Error('invalid deposit proof');lower=add(lower,v);}else exact=false;
  }
  for(const f of frozen){
   if(!Object.hasOwn(f.rates,item))continue;
   const v=q(f.rates[item]);
   if(cmp(v,Z)<0){cap=add(cap,sub(Z,v));nonnegative=false;}
   else if(Object.values(f.rates).every(x=>cmp(q(x),Z)>=0))lower=add(lower,v);else if(cmp(v,Z)>0)exact=false;
  }
  const sinks=withdrawals.filter(e=>!ret.has(e.id));
  const freeSinks=sinks.filter(e=>valid(e)&&e.materials[0]===item&&ns.get(e.to).type==='电脑'&&complete(ns.get(e.to))&&I.get(e.to).length===1&&O.get(e.to).length===0);
  if(exact&&nonnegative&&freeSinks.length===sinks.length){
   const consumption=cmp(lower,cap)<0?lower:cap;
   out.returnPools.push({proven:true,item,method:'augmented-stock-aggregate-return',externalIncome:txt(lower),nonreturnOutflow:txt(consumption),net:txt(sub(lower,consumption)),returns:[...ret],sinks:sinks.map(e=>e.id)});
  }
  if(cmp(lower,cap)<=0){out.refused.push({item,reason:'strict external surplus not proved for individual return exits',externalLower:txt(lower),nonreturnDemandUpper:txt(cap)});continue;}
  out.certificates.push({proven:true,item,method:'augmented-stock-strict-return-surplus',externalLower:txt(lower),nonreturnDemandUpper:txt(cap),returns:[...ret],outlets:[...returns,...freeSinks].map(e=>({machine:e.from,route:e.id,rate:'1'}))});
 }
 return out;
}
if(typeof module!=='undefined')module.exports={proveWarehouseReturnSurplus};
