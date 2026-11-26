'use strict';
// Cumulative stock/service theorem, no arrival pattern or event time grid.
// Inputs knownPhysical/knownDuties must come from independent count proofs,
// never the old conditional S/D model. All arithmetic is exact rational.
function proveSharedStockService(g,arith,knownPhysical={},knownDuties=[],{serviceCaps=[],fixedOnly=false}={}){
 const {q,cmp,add,sub,mul,div,txt,U,Z}=arith;
 const out={pools:[],frozenBounds:[],warehouseBursts:[],refused:[],inventory:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]])),fs=g.frozen||[];
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length||new Set(fs.map(f=>f.id)).size!==fs.length)return out;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount;
 const neg=v=>cmp(q(v),Z)<0,pos=v=>cmp(q(v),Z)>0,absneg=v=>sub(Z,q(v)),min=(a,b)=>cmp(a,b)<=0?a:b,max=(a,b)=>cmp(a,b)>=0?a:b;
 const fd=new Map();
 for(const f of fs)if(Object.values(f.rates).every(v=>!neg(v)))fd.set(f.id,U);
 for(const p of knownDuties)if(p.proven===true&&fs.some(f=>f.id===p.factory)&&cmp(q(p.duty),Z)>=0&&cmp(q(p.duty),U)<=0)fd.set(p.factory,q(p.duty));
 function free(e){
  if(!valid(e))return false;
  const m=ns.get(e.to);
  if(m.type==='仓入')return true;
  if(!complete(m)||I.get(m.id).length!==1)return false;
  if(m.type==='电脑'&&O.get(m.id).length===0)return true;
  const r=m.recipe,need=r&&Object.keys(r.inputs||{});
  if(!r||need.length!==1||need[0]!==e.materials[0]||O.get(m.id).length!==1)return false;
  const a=r.inputs[need[0]],b=r.qty,x=O.get(m.id)[0];
  return Number.isSafeInteger(a)&&a>0&&Number.isSafeInteger(b)&&b>0&&b<=a&&cmp(q(r.seconds),Z)>0&&(!fixedOnly||div(q(r.seconds),q('1/20')).d===1n)&&cmp(q(r.seconds),q(a))<=0&&valid(x)&&x.materials[0]===r.output&&ns.get(x.to).type==='仓入';
 }
 const certifiedCaps=new Map(serviceCaps.filter(c=>c.proven===true&&c.method==='fixed-tick-ordinal-service-capacity').map(c=>[c.route,c]));
 function capOf(e){const p=certifiedCaps.get(e.id);return p&&p.item===ns.get(e.from).item?q(p.rate):U;}
 const items=new Set([...(g.pools||[]).map(p=>p.item),...fs.flatMap(f=>Object.keys(f.rates)),...g.nodes.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item),...g.lines.filter(e=>ns.get(e.to).type==='仓入').flatMap(e=>e.materials)]);
 const info=new Map();
 for(const item of items){
  let lo=Z,hi=Z,cap=Z;
  const deposits=g.lines.filter(e=>ns.get(e.to).type==='仓入'&&e.materials.includes(item)),withdrawals=g.lines.filter(e=>ns.get(e.from).type==='仓出'&&ns.get(e.from).item===item),consumers=fs.filter(f=>Object.hasOwn(f.rates,item)&&neg(f.rates[item]));
  for(const e of deposits){
   const k='flow:'+e.id+'|'+item;
   if(Object.hasOwn(knownPhysical,k)&&knownPhysical[k]!=null){
    const v=q(knownPhysical[k]);if(cmp(v,Z)<0||cmp(v,U)>0)throw Error('Invalid proven physical flow');lo=add(lo,v);hi=add(hi,v);
   }else hi=add(hi,U);
  }
  for(const f of fs)if(Object.hasOwn(f.rates,item)&&pos(f.rates[item])){
   const v=q(f.rates[item]);
   if(fd.has(f.id)){const a=mul(v,fd.get(f.id));lo=add(lo,a);hi=add(hi,a);}
   else hi=add(hi,v);
  }
  cap=withdrawals.reduce((s,e)=>add(s,capOf(e)),Z);
  for(const f of consumers)cap=add(cap,absneg(f.rates[item]));
  // Strict surplus over all nominal demands proves eventual permanent
  // stock abundance, even if individual consumer limits do not exist.
  const net=knownPhysical['net:'+item],strictNet=net!=null&&cmp(q(net),Z)>0;
  const abundant=strictNet||cmp(lo,cap)>0;
  info.set(item,{lo,hi,cap,abundant,withdrawals,consumers});
  out.inventory.push({item,incomeLower:txt(lo),incomeUpper:txt(hi),nominalDemand:txt(cap),permanentlyAbundant:abundant,abundanceMethod:strictNet?'proved-positive-net':abundant?'income-lower-exceeds-nominal-cap':null});
 }
 // A blocked tree has uniform saturated service on high-stock
 // intervals, provided every other warehouse root is permanently ready.
 // Do not treat a mere unconditional upper bound as this lower contract.
 const service=e=>{
  if(!complete(ns.get(e.from))||I.get(e.from).length||O.get(e.from).length!==1)return null;
  if(free(e))return U;
  const c=certifiedCaps.get(e.id);
  return c&&c.item===ns.get(e.from).item&&c.otherItems.every(k=>info.get(k)?.abundant)?q(c.rate):null;
 };
 // Abundance is a service-eligibility fact, not a claim that all
 // withdrawals are full. Only independently free outlets must saturate.
 for(const [item,p] of info)if(p.abundant){
  const exits=p.withdrawals.filter(e=>service(e)!==null);
  if(exits.length)out.warehouseBursts.push({item,proven:true,method:'permanent-stock-free-outlet',outlets:exits.map(e=>({machine:e.from,route:e.id,rate:txt(service(e))}))});
 }
 for(const f of fs){
  const needs=Object.entries(f.rates).filter(([,v])=>neg(v));
  if(needs.length&&needs.every(([k])=>info.get(k)?.abundant)){
   out.frozenBounds.push({factory:f.id,lower:'1',upper:'1',proven:true,method:'all-required-stocks-permanently-abundant'});
   continue;
  }
  if(fd.has(f.id))continue;
  const inputs=Object.entries(f.rates).filter(([,v])=>neg(v));
  let lower=U,upper=U;const premises=[];
  for(const [item,v] of inputs){
   const d=absneg(v),p=info.get(item);
   // Use nominal cap for every unproved competitor, exact rates when
   // already independently certified. Reservations contribute O(1).
   let other=Z;
   for(const e of p.withdrawals){
    const k='flow:'+e.id+'|'+item;
    other=add(other,Object.hasOwn(knownPhysical,k)&&knownPhysical[k]!=null?q(knownPhysical[k]):capOf(e));
   }
   for(const c of p.consumers)if(c.id!==f.id)other=add(other,mul(absneg(c.rates[item]),fd.get(c.id)??U));
   lower=min(lower,div(sub(p.lo,other),d));upper=min(upper,div(p.hi,d));
   premises.push({item,incomeLower:txt(p.lo),otherConsumptionUpper:txt(other),demand:txt(d)});
  }
  lower=max(Z,lower);
  if(cmp(lower,upper)>0)throw Error('Contradictory independent stock bounds');
  if(cmp(lower,Z)>0||cmp(upper,U)<0)out.frozenBounds.push({factory:f.id,lower:txt(lower),upper:txt(upper),proven:true,method:'last-shortage-residual-bound',premises});
 }
 for(const [item,p] of info){
  if(cmp(p.lo,p.hi)!==0){out.refused.push({item,reason:'total income not proved'});continue;}
  // Subtract independently proved physical AND signed frozen consumers.
  // Their actual cumulative consumption has a known slope, so the
  // original last-low-stock argument applies to the residual slope.
  const known=p.withdrawals.filter(e=>Object.hasOwn(knownPhysical,'flow:'+e.id+'|'+item)&&knownPhysical['flow:'+e.id+'|'+item]!=null);
  const remaining=p.withdrawals.filter(e=>!known.includes(e));
  const knownFrozen=p.consumers.filter(f=>fd.has(f.id)),remainingFrozen=p.consumers.filter(f=>!fd.has(f.id));
  if((known.length||knownFrozen.length)&&remaining.every(e=>service(e)!==null)&&remainingFrozen.every(f=>Object.entries(f.rates).every(([k,v])=>k===item||!neg(v)||info.get(k)?.abundant))){
   let fixed=Z;
   for(const e of known){const v=q(knownPhysical['flow:'+e.id+'|'+item]);if(cmp(v,Z)<0||cmp(v,U)>0)throw Error('Invalid known withdrawal');fixed=add(fixed,v);}
   for(const f of knownFrozen)fixed=add(fixed,mul(absneg(f.rates[item]),fd.get(f.id)));
   const residual=sub(p.lo,fixed);
   if(cmp(residual,Z)<0)throw Error('Contradictory independently known withdrawal totals');
   let capacity=remaining.reduce((s,e)=>add(s,service(e)),Z);for(const f of remainingFrozen)capacity=add(capacity,absneg(f.rates[item]));
   const x=add(fixed,min(residual,capacity));
   out.pools.push({item,income:txt(p.lo),outflow:txt(x),net:txt(sub(p.lo,x)),capacity:txt(add(fixed,capacity)),proven:true,method:'aggregate-stock-after-proved-withdrawals',fixed:txt(fixed),remaining:remaining.map(e=>e.id),remainingFrozen:remainingFrozen.map(f=>f.id),routes:p.withdrawals.map(e=>e.id),factories:p.consumers.map(f=>f.id)});
   continue;
  }
  if(p.withdrawals.some(e=>service(e)===null)){out.refused.push({item,reason:'withdrawal clearance not proved'});continue;}
  // If a factory needs other items, it is a work-conserving consumer
  // of this item only when all its other inputs are permanently abundant.
  // Known full-duty consumers also satisfy the required interval bound.
  if(p.consumers.some(f=>!fd.has(f.id)||cmp(fd.get(f.id),U)!==0?Object.entries(f.rates).some(([k,v])=>k!==item&&neg(v)&&!info.get(k)?.abundant):false)){
   out.refused.push({item,reason:'another frozen ingredient may block service'});continue;
  }
  const x=min(p.lo,p.cap);
  out.pools.push({item,income:txt(p.lo),outflow:txt(x),net:txt(sub(p.lo,x)),capacity:txt(p.cap),proven:true,method:'aggregate-stock-work-conservation',routes:p.withdrawals.map(e=>e.id),factories:p.consumers.map(f=>f.id)});
 }
 return out;
}
if(typeof module!=='undefined')module.exports={proveSharedStockService};
