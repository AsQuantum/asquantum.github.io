'use strict';
// Exact sufficient clearance bounds, propagated backward from independently
// unblocked exits. Continuous homogeneous FIFO model, P=1, spacing/speed=1/2.
// D_e: if a compatible packet is pending at the sending end from time t,
// it can be injected no later than t+D_e. No assumption about average rates.
function proveRouteClearance(g,arith){
 const {q,add,mul,cmp,txt,U}=arith,P=U,d=q('1/2');
 const proven=new Map(),pending=[];
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return proven;
 const nodes=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(nodes.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return proven;
 for(const e of g.lines){if(!nodes.has(e.from)||!nodes.has(e.to))return proven;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const offer=(e,D,rule,parents)=>{if(valid(e)&&!proven.has(e.id))pending.push({e,D,rule,parents});};
 for(const e of g.lines)if(valid(e)&&nodes.get(e.to).type==='仓入')offer(e,P,'unblocked-warehouse',[]);
 while(pending.length){
  pending.sort((a,b)=>cmp(b.D,a.D)||String(b.e.id).localeCompare(String(a.e.id)));
  const {e,D,rule,parents}=pending.pop();
  if(proven.has(e.id))continue;
  proven.set(e.id,{route:e.id,clearance:txt(D),rule,parents});
  const m=nodes.get(e.from),ins=I.get(m.id),outs=O.get(m.id);
  if(!complete(m)||!ins.length||!outs.length||[...ins,...outs].some(x=>!valid(x)||x.materials[0]!==e.materials[0]))continue;
  if(m.type==='汇流'&&outs.length===1){
   const bound=add(add(P,d),mul(q(ins.length),D));
   for(const x of ins)offer(x,bound,'merger-bounded-scan',[e.id]);
  }else if(m.type==='分流'&&ins.length===1){
   // Empty startup and one free exit: each arrival can leave immediately.
   // Other exits may be obstructed, but do not prevent this compatible exit.
   const free=outs.some(x=>nodes.get(x.to).type==='仓入');
   offer(ins[0],free?P:add(add(P,d),D),free?'splitter-free-exit':'splitter-bounded-exit',[e.id]);
  }
 }
 return proven;
}
// An autonomous source with b items per T can never accumulate a prior
// unfinished batch when b*D<=T. Buffer capacity 20b easily covers the
// coincident boundary event. Therefore its long-run machine and route
// rates follow from actual production counts, not ideal water-fill.
function proveUnthrottledGenerators(g,arith,clearance=proveRouteClearance(g,arith)){
 const rates=[],{q,mul,div,cmp,txt,U,Z}=arith;
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return rates;
 for(const m of g.nodes){
  const r=m.recipe,ins=g.lines.filter(e=>e.to===m.id),outs=g.lines.filter(e=>e.from===m.id);
  if(!r||Object.keys(r.inputs||{}).length||!Number.isSafeInteger(r.qty)||r.qty<1||cmp(q(r.seconds),Z)<=0||ins.length||m.physicalInCount!==0||outs.length!==1||m.physicalOutCount!==1)continue;
  const e=outs[0],p=clearance.get(e.id);
  if(!p||e.materials.length!==1||e.materials[0]!==r.output||cmp(mul(q(r.qty),q(p.clearance)),q(r.seconds))>0)continue;
  rates.push({machine:m.id,route:e.id,rate:txt(div(U,q(r.seconds))),flow:txt(div(q(r.qty),q(r.seconds))),method:'unthrottled-generator-by-clearance',proven:true,clearance:p.clearance});
 }
 return rates;
}
// Independent rate projection: use only actual count certificates.
// If non-permanent port rates are independently known, remaining mass
// divides equally among the permanent ports. No nominal offer/demand
// is treated as a measured or proven flow.
function resolveRoundRobinCounts(cert,known,arith){
 const {q,add,sub,div,cmp,txt,Z}=arith;
 const X=cert.totalRate!=null?q(cert.totalRate):known.has(cert.commonRoute)?q(known.get(cert.commonRoute)):null;
 const us=cert.unskipped,others=cert.ports.filter(id=>!us.includes(id)),rates=new Map();
 if(X===null||!us.length||others.some(id=>!known.has(id)))return {status:'undetermined',rates};
 const total=others.reduce((s,id)=>add(s,q(known.get(id))),Z);
 const lam=div(sub(X,total),q(us.length));
 if(cmp(lam,Z)<0||others.some(id=>cmp(q(known.get(id)),Z)<0||cmp(q(known.get(id)),lam)>0)||us.some(id=>known.has(id)&&cmp(q(known.get(id)),lam)!==0))return {status:'contradiction',rates};
 for(const id of us)rates.set(id,txt(lam));
 for(const id of others)rates.set(id,txt(q(known.get(id))));
 rates.set(cert.commonRoute,txt(X));
 return {status:'proved',rates};
}
if(typeof module!=='undefined')module.exports={proveRouteClearance,proveUnthrottledGenerators,resolveRoundRobinCounts};
