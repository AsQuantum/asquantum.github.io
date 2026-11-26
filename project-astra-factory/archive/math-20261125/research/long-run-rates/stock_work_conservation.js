'use strict';
// High-stock interval theorem: aggregate demand is work-conserving even
// with arbitrary correlated arrivals and multiple partially served actors.
// Only independent exact facts and strict positive net lower bounds enter.
function proveStockWorkConservation(g,arith,values={},netLower={},readyCaps=[],freeCertificates=[]){
 const {q,add,sub,mul,cmp,txt,Z,U}=arith;
 const out={relations:[],witnesses:[],abundant:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const fs=g.frozen||[],outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item),items=new Set([...outlets.map(m=>m.item),...fs.flatMap(f=>Object.keys(f.rates))]);
 const read=k=>values[k]==null?null:q(values[k]);
 const positive=k=>[values['net:'+k],netLower[k]].some(v=>v!=null&&cmp(q(v),Z)>0);
 const abundant=new Set([...items].filter(positive));out.abundant=[...abundant];
 const certifiedFree=new Set(freeCertificates.filter(c=>c.proven===true&&c.method==='refill-buffer-always-has-space-eventually').map(c=>c.machine));
 const negs=f=>Object.entries(f.rates).filter(([,v])=>cmp(q(v),Z)<0);
 function free(m){
  const a=O.get(m.id);
  if(I.get(m.id).length||a.length!==1||m.physicalOutCount!==1)return false;
  const e=a[0],d=ns.get(e.to);
  return e.compatible===true&&e.materials.length===1&&e.materials[0]===m.item&&Number.isSafeInteger(e.length)&&e.length>=1&&
   (certifiedFree.has(m.id)||d.type==='仓入'||d.type==='电脑'&&I.get(d.id).length===1&&d.physicalInCount===1&&O.get(d.id).length===0);
 }
 function emit(query,v,method,detail){
  if(values[query]!=null&&cmp(q(values[query]),v)===0)return;
  out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method,sense:'eq',coefficients:{[query]:1},constant:txt(v)});
  out.witnesses.push({query,value:txt(v),method,...detail});
 }
 const capOf=m=>{const c=readyCaps.find(x=>x.proven===true&&x.machine===m.id&&x.item===m.item&&(x.requiredItems||[m.item]).every(k=>k===m.item||abundant.has(k)));return c?q(c.rate):free(m)?U:null;};
 for(const m of outlets)if(abundant.has(m.item)&&capOf(m)!==null)emit('machineTotal:'+m.id+'|out',capOf(m),'abundant-stock-independent-refill',{machine:m.id,item:m.item});
 for(const f of fs){const inputs=negs(f);if(inputs.length&&inputs.every(([k])=>abundant.has(k)))emit('duty:'+f.id,U,'all-inputs-eventually-abundant',{factory:f.id});}
 for(const item of items){
  const income=read('inflow:'+item);if(income===null)continue;
  let fixed=Z,capacity=Z,valid=true;const remaining=[],fixedActors=[];
  for(const m of outlets.filter(m=>m.item===item)){
   const rate=read('machineTotal:'+m.id+'|out');
   if(rate!==null){fixed=add(fixed,rate);fixedActors.push(m.id);continue;}
   const cap=capOf(m);if(cap===null){valid=false;break;}
   capacity=add(capacity,cap);remaining.push({id:m.id,kind:'outlet',cap:txt(cap)});
  }
  if(!valid)continue;
  for(const f of fs){
   const inputs=negs(f),entry=inputs.find(([k])=>k===item);if(!entry)continue;
   const cap=sub(Z,q(entry[1])),duty=read('duty:'+f.id);
   if(duty!==null){fixed=add(fixed,mul(cap,duty));fixedActors.push(f.id);continue;}
   if(inputs.some(([k])=>k!==item&&!abundant.has(k))){valid=false;break;}
   capacity=add(capacity,cap);remaining.push({id:f.id,kind:'frozen',cap:txt(cap)});
  }
  if(!valid||!remaining.length)continue;
  const residual=sub(income,fixed);if(cmp(residual,Z)<0)continue;
  const service=cmp(residual,capacity)<=0?residual:capacity;
  emit('outflow:'+item,add(fixed,service),'high-stock-interval-work-conservation',{item,income:txt(income),fixed:txt(fixed),capacity:txt(capacity),remaining,fixedActors});
 }
 return out;
}
if(typeof module!=='undefined')module.exports={proveStockWorkConservation};
