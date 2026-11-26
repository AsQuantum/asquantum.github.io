'use strict';
// Under the current real-buffer rule, a single sparse deposit stream
// and an earliest single-input frozen consumer can have exact priority.
// No old reservation/continuous source model, no phase/orbit search.
function proveSparseFrozenPriority(g,arith){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const {q,cmp,sub,Z,U,txt}=arith,fs=g.frozen||[],ns=new Map(g.nodes.map(m=>[m.id,m]));
 const neg=v=>cmp(q(v),Z)<0,pos=v=>cmp(q(v),Z)>0;
 for(const item of new Set(fs.flatMap(f=>Object.keys(f.rates).filter(k=>neg(f.rates[k]))))){
  // Even an unwired physical outlet can take stock before frozen service.
  if(g.nodes.some(m=>m.type==='仓出'&&m.item===item))continue;
  const cs=fs.filter(f=>Object.hasOwn(f.rates,item)&&neg(f.rates[item]));
  if(cs.length<2)continue;
  const first=cs[0],a=sub(Z,q(first.rates[item]));
  if(cmp(a,U)<0||Object.values(first.rates).filter(neg).length!==1)continue;
  const arrivals=g.lines.filter(e=>ns.get(e.to)?.type==='仓入'&&e.materials.includes(item));
  const producers=fs.filter(f=>Object.hasOwn(f.rates,item)&&pos(f.rates[item]));
  if(arrivals.length+producers.length!==1)continue;
  if(arrivals.some(e=>e.active===false||!Number.isSafeInteger(e.length)||e.length<1||Array.isArray(e.acceptedMaterials)&&!e.acceptedMaterials.includes(item)))continue;
  if(producers.some(f=>fs.indexOf(f)>=fs.indexOf(first)||Object.values(f.rates).some(neg)||cmp(q(f.rates[item]),U)>0))continue;
  const emit=(coefficients,constant='0')=>out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'sparse-unit-frozen-priority',sense:'eq',coefficients,constant});
  emit({['duty:'+first.id]:txt(a),['inflow:'+item]:-1});
  for(const f of cs.slice(1))emit({['duty:'+f.id]:1});
  out.witnesses.push({method:'sparse-unit-frozen-priority',item,first:first.id,demand:txt(a),lower:cs.slice(1).map(f=>f.id),arrival:arrivals[0]?.id??producers[0].id});
 }
 return out;
}
