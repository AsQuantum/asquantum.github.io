'use strict';
// Last-low-stock bound: a jointly served actor has proportional withdrawals
// and a certified high-stock service clock. Other actors need not have
// unique rates. Their cumulative caps bound the residual available supply.
function proveJointStockResidualBounds(g,arith,values,trees,uppers){
 const {q,cmp,add,sub,mul,div,txt,Z,U}=arith,out={relations:[],witnesses:[]};
 if(g.unlimited)return out;
 const outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item),frozen=g.frozen||[];
 const actors=[
  ...trees.map(t=>({id:t.id,kind:'tree',roots:new Set(t.caps.map(c=>c.machine)),needs:t.caps.reduce((a,c)=>(a[c.item]=add(a[c.item]||Z,q(c.rate)),a),Object.create(null)),queries:t.caps.map(c=>({key:'machineTotal:'+c.machine+'|out',cap:q(c.rate)}))})),
  ...frozen.map(f=>({id:f.id,kind:'frozen',roots:new Set(),needs:Object.fromEntries(Object.entries(f.rates).filter(([,v])=>cmp(q(v),Z)<0).map(([k,v])=>[k,sub(Z,q(v))])),queries:[{key:'duty:'+f.id,cap:U}]}))
 ];
 const known=k=>values[k]==null?null:q(values[k]);
 const min=(a,b)=>cmp(a,b)<=0?a:b,max=(a,b)=>cmp(a,b)>=0?a:b;
 for(const actor of actors){
  const items=Object.entries(actor.needs);if(!items.length||items.some(([,v])=>cmp(v,Z)<=0))continue;
  let lo=U,hi=U;const evidence=[];
  for(const [item,cap] of items){
   const income=known('inflow:'+item);if(income===null){lo=Z;continue;}
   let otherLo=Z,otherHi=Z;
   for(const m of outlets){
    if(m.item!==item||actor.roots.has(m.id))continue;
    const exact=known('machineTotal:'+m.id+'|out');
    otherLo=add(otherLo,exact??Z);otherHi=add(otherHi,exact??q(uppers[m.id]??'1'));
   }
   for(const f of frozen){
    if(actor.kind==='frozen'&&actor.id===f.id)continue;
    const demand=sub(Z,q(f.rates[item]??'0'));if(cmp(demand,Z)<=0)continue;
    const duty=known('duty:'+f.id);
    otherLo=add(otherLo,mul(demand,duty??Z));otherHi=add(otherHi,mul(demand,duty??U));
   }
   lo=min(lo,max(Z,div(sub(income,otherHi),cap)));
   hi=min(hi,max(Z,div(sub(income,otherLo),cap)));
   evidence.push({item,income:txt(income),otherLower:txt(otherLo),otherUpper:txt(otherHi),fullDemand:txt(cap)});
  }
  if(cmp(lo,hi)>0)continue; // necessary model handles any contradiction
  let emitted=false;
  const emit=(key,coef,val,sense)=>{out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'joint-stock-residual-capacity-bounds',sense,coefficients:{[key]:coef},constant:txt(val)});emitted=true;};
  for(const {key,cap} of actor.queries){
   if(known(key)!==null)continue;
   if(cmp(lo,hi)===0)emit(key,1,mul(cap,lo),'eq');
   else{
    if(cmp(lo,Z)>0)emit(key,-1,sub(Z,mul(cap,lo)),'le');
    if(cmp(hi,U)<0)emit(key,1,mul(cap,hi),'le');
   }
  }
  if(emitted)out.witnesses.push({method:'joint-stock-residual-capacity-bounds',actor:actor.id,kind:actor.kind,lower:txt(lo),upper:txt(hi),evidence});
 }
 return out;
}
