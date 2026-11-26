'use strict';
// Exact rational fixed-step semantics, not continuous approximation.
// A single unit-periodic source precedes the highest-priority consumer.
// Either it finishes before the next arrival, or the next consumer
// clears each surplus unit before the next arrival and first completion.
function proveFrozenTickPriority(g,arith,{dt='1/20'}={}){
 const {q,cmp,div,mul,sub,txt,U,Z}=arith,D=q(dt),out={frozenDuties:[],warehouseBursts:[],certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited||cmp(D,Z)<=0)return out;
 const fs=g.frozen||[],ns=new Map(g.nodes.map(m=>[m.id,m]));
 const neg=v=>cmp(q(v),Z)<0,pos=v=>cmp(q(v),Z)>0;
 const ceil=x=>(x.n+x.d-1n)/x.d;
 for(const item of new Set(fs.flatMap(f=>Object.keys(f.rates).filter(k=>neg(f.rates[k]))))){
  const reject=reason=>out.refused.push({item,reason}),cs=fs.filter(f=>Object.hasOwn(f.rates,item)&&neg(f.rates[item])),ps=fs.filter(f=>Object.hasOwn(f.rates,item)&&pos(f.rates[item]));
  if(ps.length!==1||fs.indexOf(ps[0])>=fs.indexOf(cs[0])||Object.values(ps[0].rates).some(neg)||g.lines.some(e=>ns.get(e.to)?.type==='仓入'&&e.materials.includes(item))){reject('single independent preceding unit source required');continue;}
  const h=div(U,mul(q(ps[0].rates[item]),D)),first=cs[0],a=sub(Z,q(first.rates[item])),tau=div(U,a),m=ceil(div(tau,D));
  const hFloor=h.n/h.d;
  if(hFloor<1n||Object.values(first.rates).filter(neg).length!==1){reject('unit arrivals and single first input required');continue;}
  let n=1n,fast=null,clearance=null;
  if(m>hFloor){
   n=ceil(div(q(m),h));
   // Every arrival index j has tick ceil(j*h). Differences over
   // l arrivals lie between floor(l*h) and ceil(l*h), independently
   // of the current source phase. Certify one and the same n.
   const next=mul(q(n),h),last=ceil(mul(q(n-1n),h));
   if(next.n/next.d<m||last>m-2n){reject('variable arrival count or completion-tick collision');continue;}
   clearance=hFloor<m-1n-last?hFloor:m-1n-last;
   fast=cs[1];
   if(!fast||Object.values(fast.rates).filter(neg).length!==1||ceil(div(U,mul(sub(Z,q(fast.rates[item])),D)))>clearance){reject('second consumer cannot clear each surplus before the next arrival or first completion');continue;}
  }
  const cycle=mul(mul(q(n),h),D),x=div(U,cycle),v=q(ps[0].rates[item]),duty=mul(x,tau);
  const duties=cs.map(f=>({factory:f.id,duty:txt(f===first?duty:f===fast?div(sub(v,x),sub(Z,q(f.rates[item]))):Z),proven:true,method:'fixed-tick-shared-frozen-priority'}));
  out.frozenDuties.push(...duties);
  const outlets=g.lines.filter(e=>ns.get(e.from)?.type==='仓出'&&ns.get(e.from).item===item);
  if(outlets.length)out.warehouseBursts.push({proven:true,item,method:'fixed-tick-frozen-claims-all',outlets:outlets.map(e=>({machine:e.from,route:e.id,rate:'0'}))});
  out.certificates.push({item,dt:txt(D),arrivalTicks:txt(h),serviceTicks:String(m),arrivalsPerCycle:String(n),secondClearanceTicks:clearance===null?null:String(clearance),cycle:txt(cycle),first:txt(x),second:txt(sub(v,x)),duties});
 }
 return out;
}
module.exports={proveFrozenTickPriority};
