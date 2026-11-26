'use strict';
// Exact composition of the finite reservation loss maps at *arrival groups*.
// The gaps must be integral multiples of the physical dispatch cooldown P.
// No sampling grid, simulated transient, or numeric fixed-point iteration.
function composeReservationCycle(groups,capacities){
 if(!groups.length||!capacities.length||capacities.some(c=>!Number.isSafeInteger(c)||c<=0)||groups.some(g=>!Number.isSafeInteger(g.count)||g.count<0||!Number.isSafeInteger(g.gap)||g.gap<=0))return {status:'not-proved',reason:'invalid arrival groups'};
 const clamp=(x,l,u)=>Math.min(u,Math.max(l,x));
 let incoming=groups.map(g=>g.count);const outlets=[];
 for(const C of capacities){
  // Domain [0,C]; a composition has form clamp(x+A,L,U).
  let A=0,L=0,U=C;const prefixes=[];
  for(let j=0;j<groups.length;j++){
   prefixes.push({A,L,U});
   const gap=groups[j].gap,delta=incoming[j]-gap,upper=Math.max(0,C-gap);
   A+=delta;L=clamp(L+delta,0,upper);U=clamp(U+delta,0,upper);
   if(!Number.isSafeInteger(A))return {status:'not-proved',reason:'unsafe integer'};
  }
  const fixed=A>0?U:L;
  const queue=prefixes.map(p=>clamp(fixed+p.A,p.L,p.U));
  const admitted=queue.map((v,j)=>Math.min(C-v,incoming[j]));
  const overflow=incoming.map((v,j)=>v-admitted[j]);
  if(queue.some((v,j)=>Math.max(0,v+admitted[j]-groups[j].gap)!==queue[(j+1)%queue.length]))throw Error('invalid algebraic cycle');
  outlets.push({capacity:C,count:admitted.reduce((s,v)=>s+v,0),fixed,composition:{A,L,U},queue,admitted,overflow});
  incoming=overflow;
 }
 if(incoming.some(v=>v!==0))return {status:'not-proved',reason:'unreserved carryover not excluded',outlets,residual:incoming};
 return {status:'proved',outlets};
}
function proveWarehouseOverlapping(g,arith,{maxGroups=4096}={}){
 const {q,cmp,div,add,sub,mul,txt,U,Z}=arith,result={certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
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
  const a=r.inputs[need[0]],b=r.qty,out=O.get(m.id)[0];
  return Number.isSafeInteger(a)&&a>0&&Number.isSafeInteger(b)&&b>0&&b<=a&&cmp(q(r.seconds),Z)>0&&cmp(q(r.seconds),q(a))<=0&&valid(out)&&out.materials[0]===r.output&&ns.get(out.to).type==='仓入';
 }
 const gcd=(a,b)=>{while(b){const c=a%b;a=b;b=c;}return a;};
 for(const pool of g.pools||[]){
  const item=pool.item,ins=g.lines.filter(e=>ns.get(e.to).type==='仓入'&&e.materials.includes(item)),outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item===item&&O.get(m.id).length),reject=reason=>result.refused.push({item,reason});
  if(!ins.length||!outlets.length)continue;
  if((g.frozen||[]).some(f=>Object.hasOwn(f.rates,item)&&cmp(q(f.rates[item]),Z)!==0)){reject('frozen competition');continue;}
  if(!Array.isArray(pool.order)||new Set(pool.order).size!==pool.order.length||outlets.some(m=>!pool.order.includes(m.id)||!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!free(O.get(m.id)[0]))){reject('priority or unblocked sink not proved');continue;}
  const src=ins.map(e=>ns.get(e.from));
  if(ins.some((e,i)=>!valid(e)||!complete(src[i])||I.get(src[i].id).length||O.get(src[i].id).length!==1||!src[i].recipe||Object.keys(src[i].recipe.inputs||{}).length||src[i].recipe.qty!==1||src[i].recipe.output!==item||q(src[i].recipe.seconds).d!==1n||cmp(q(src[i].recipe.seconds),U)<0)){reject('not independent unit sources with integral cooldown periods');continue;}
  // All physical transport phases must share the same residue modulo P.
  if(ins.some(e=>e.length%2!==ins[0].length%2)){reject('arrival epochs not aligned to physical cooldown');continue;}
  const periods=src.map(m=>q(m.recipe.seconds).n);
  const H=periods.reduce((a,b)=>a/gcd(a,b)*b,1n);
  const count=periods.reduce((a,b)=>a+H/b,0n);
  const ordered=outlets.slice().sort((a,b)=>pool.order.indexOf(a.id)-pool.order.indexOf(b.id));
  const rate=div(q(count),q(H));
  const sourceRates=src.map(m=>({machine:m.id,rate:txt(div(U,q(m.recipe.seconds))),proven:true,method:'independent-free-deposit-generator'}));
  // Overload and the critical equality need no arrival phase information:
  // proved separately by cumulative stock and aggregate service.
  if(cmp(rate,q(ordered.length))>=0){
   result.certificates.push({proven:true,item,method:'free-outlet-aggregate-saturation',inflow:txt(rate),sourceRates,outlets:ordered.map(m=>({machine:m.id,route:O.get(m.id)[0].id,rate:'1'}))});continue;
  }
  if(count>BigInt(maxGroups)||H>BigInt(Number.MAX_SAFE_INTEGER)){reject('arrival group resource limit');continue;}
  const groups=new Map();
  for(let i=0;i<ins.length;i++){
   const phase=(BigInt(Math.floor(ins[i].length/2)))%periods[i];
   for(let a=phase;a<H;a+=periods[i])groups.set(Number(a),(groups.get(Number(a))||0)+1);
  }
  const keys=[...groups.keys()].sort((a,b)=>a-b),word=keys.map((a,j)=>({phase:a,count:groups.get(a),gap:(j+1<keys.length?keys[j+1]:keys[0]+Number(H))-a}));
  const p=composeReservationCycle(word,ordered.map(()=>3));
  if(p.status!=='proved'){reject(p.reason);continue;}
  result.certificates.push({proven:true,item,method:'overlapping-reservation-closed-composition',period:String(H),inflow:txt(rate),groups:word,sourceRates,outlets:ordered.map((m,i)=>({machine:m.id,route:O.get(m.id)[0].id,rate:txt(div(q(p.outlets[i].count),q(H))),count:p.outlets[i].count})),proof:p});
 }
 return result;
}
if(typeof module!=='undefined')module.exports={composeReservationCycle,proveWarehouseOverlapping};
