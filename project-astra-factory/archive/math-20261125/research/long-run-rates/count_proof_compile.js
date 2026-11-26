'use strict';
// Necessary relations for accumulation points of actual cumulative counts.
// Deliberately no S/D offer-demand equations, min-flow assumption, RR
// water-filling, optimization objective, or invented potential rate.
// Only finite resource balances, physical caps, and proven certificates.
function compileCountProofProblem(g,arith,{machineRates=[],routeRates=[],routeRateBounds=[],refills=[],roundRobin=[],warehouseBursts=[],frozenDuties=[],frozenBounds=[],stockPools=[],materialRatios=[],machineBounds=[],returnPools=[],materialRatioBounds=[],rateRelations=[],htmlQueries=false,structuralZeros=null}={}){
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return {status:'unsupported',reason:'incomplete physical graph'};
 const {q,txt,cmp,div,U,Z}=arith;
 const nodes=new Map(g.nodes.map(m=>[m.id,m])),routes=new Map(g.lines.map(e=>[e.id,e]));
 if(nodes.size!==g.nodes.length||routes.size!==g.lines.length||g.lines.some(e=>!nodes.has(e.from)||!nodes.has(e.to)))return {status:'unsupported',reason:'invalid physical graph'};
 const lines=['(set-logic QF_LRA)'];let n=0;const assertions=new Set();
 const assertOnce=x=>{if(!structuralZeros||!assertions.has(x)){lines.push(x);assertions.add(x);}};
 const sym=()=>{const v='v_'+(++n);lines.push('(declare-const '+v+' Real)');return v;};
 const op=(o,...xs)=>{
  if(structuralZeros&&(o==='*'&&xs.includes('0')||o==='-'&&xs.length===2&&xs[0]===xs[1]))return '0';
  return '('+o+' '+xs.join(' ')+')';
 };
 const rat=x=>{const v=q(x),a=v.n<0n?-v.n:v.n,b=v.d,s=b===1n?String(a):op('/',String(a),String(b));return v.n<0n?op('-',s):s;};
 const sum=xs=>{if(structuralZeros)xs=xs.filter(x=>x!=='0');return xs.length===0?'0':xs.length===1?xs[0]:op('+',...xs);};
 const eq=(a,b)=>{if(!structuralZeros||a!==b)assertOnce(op('assert',op('=',a,b)));};
 const le=(a,b)=>{if(!structuralZeros||a!==b)assertOnce(op('assert',op('<=',a,b)));};
 const bounded=(v,hi)=>{le('0',v);le(v,hi);};
 const obs=Object.create(null),structuralConstants=Object.create(null),groups={actual:[]},exprColumns=new Map();
 function column(x){if(!structuralZeros)return null;if(/^v_\d+$/.test(x))return x;return exprColumns.get(x)||null;}
 function expressionColumn(x){const known=column(x);if(known)return known;const v=sym();eq(v,x);if(structuralZeros)exprColumns.set(x,v);return v;}
 function query(k,x){
  // These are already fixed by topology/finite storage, not unknowns.
  // Keep output keys for the UI, but declare no algebraic column.
  if(structuralZeros&&x==='0'){structuralConstants[k]='0';return;}
  obs[k]=expressionColumn(x);groups.actual.push(k);
 }
 const F=new Map(),X=new Map(),N=new Map(),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){I.get(e.to).push(e);O.get(e.from).push(e);}
 // Bounded inventory of a one-input/one-output router proves equality
 // per material, even if it blocks. Share the columns, not belt timing.
 const parents=new Map(g.lines.map(e=>[e.id,e.id]));
 function findRoute(id){let r=id;while(parents.get(r)!==r)r=parents.get(r);while(parents.get(id)!==id){const p=parents.get(id);parents.set(id,r);id=p;}return r;}
 let straightRouters=0;
 if(structuralZeros)for(const m of g.nodes){
  const ins=I.get(m.id),outs=O.get(m.id);
  if(!['分流','汇流'].includes(m.type)||ins.length!==1||outs.length!==1||m.physicalInCount!==1||m.physicalOutCount!==1)continue;
  const a=ins[0],b=outs[0],keys=[...new Set(a.materials)].sort();
  if(keys.join('\u0000')!==[...new Set(b.materials)].sort().join('\u0000')||keys.some(k=>structuralZeros.zero.get(a.id)?.has(k)!==structuralZeros.zero.get(b.id)?.has(k)))continue;
  parents.set(findRoute(b.id),findRoute(a.id));straightRouters++;
 }
 const sharedFlows=new Map(),sharedTotals=new Map();
 for(const e of g.lines){
  const rep=findRoute(e.id);
  let f=sharedFlows.get(rep);
  if(!f){
   f=new Map([...new Set(e.materials)].sort().map(k=>[k,structuralZeros?.zero.get(e.id)?.has(k)?'0':sym()]));
   sharedFlows.set(rep,f);
  }
  F.set(e.id,f);
  let x=sharedTotals.get(rep);
  if(x===undefined){
   const total=sum([...f.values()]);
   if(structuralZeros)x=total==='0'?'0':expressionColumn(total);
   else{x=sym();eq(x,total);}
   sharedTotals.set(rep,x);
  }
  X.set(e.id,x);bounded(x,'1');for(const v of f.values())le('0',v);
  for(const [k,v] of f){if(e.outFilter&&e.outFilter!=='任意'&&e.outFilter!==k||Array.isArray(e.acceptedMaterials)&&!e.acceptedMaterials.includes(k))eq(v,'0');query('flow:'+e.id+'|'+k,v);}
  query('routeTotal:'+e.id,x);
 }
 const material=(es,k)=>sum(es.map(e=>F.get(e.id).get(k)||'0'));
 for(const m of g.nodes){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),kin=new Set(ins.flatMap(e=>e.materials)),kout=new Set(outs.flatMap(e=>e.materials));
  if(r){for(const k of Object.keys(r.inputs||{}))kin.add(k);kout.add(r.output);}
  else if(m.type==='仓出'&&m.item)kout.add(m.item);
  else if(m.type==='仓入'&&m.inletItem)kin.add(m.inletItem);
  if(r){
   const nu=structuralZeros?.cycles.has(m.id)?'0':sym();N.set(m.id,nu);bounded(nu,rat(div(U,q(r.seconds))));
   for(const k of new Set([...kin,...Object.keys(r.inputs||{})]))eq(material(ins,k),op('*',rat(r.inputs?.[k]||0),nu));
   for(const k of new Set([...kout,r.output]))eq(material(outs,k),op('*',rat(k===r.output?r.qty:0),nu));
   query('cycle:'+m.id,nu);query((htmlQueries?'machineDuty:':'duty:')+m.id,op('*',rat(r.seconds),nu));
  }else if(m.type==='分流'||m.type==='汇流'){
   for(const k of new Set([...kin,...kout]))eq(material(ins,k),material(outs,k));
  }else if(m.type==='电脑')le(sum(ins.map(e=>X.get(e.id))),'1');
  else if(!['仓出','仓入'].includes(m.type)&&ins.length+outs.length)return {status:'unsupported',reason:'unknown connected device'};
  for(const [kind,es,ks] of [['in',ins,kin],['out',outs,kout]]){
   query('machineTotal:'+m.id+'|'+kind,sum(es.map(e=>X.get(e.id))));
   for(const k of ks)query('machineMaterial:'+m.id+'|'+kind+'|'+k,material(es,k));
  }
 }
 for(const p of routeRateBounds){
  if(p.proven!==true||!F.get(p.route)?.has(p.item))throw Error('Unproved route rate bound');
  const v=F.get(p.route).get(p.item);
  if(p.lower!=null)le(rat(p.lower),v);
  if(p.upper!=null)le(v,rat(p.upper));
 }
 for(const p of routeRates){
  if(p.proven!==true||!F.get(p.route)?.has(p.item)||cmp(q(p.rate),Z)<0||cmp(q(p.rate),U)>0)throw Error('Unproved route rate');
  eq(F.get(p.route).get(p.item),rat(p.rate));
 }
 for(const p of machineRates){
  if(p.proven!==true||!N.has(p.machine))throw Error('Unproved machine rate');
  eq(N.get(p.machine),rat(p.rate));
 }
 for(const p of machineBounds){
  if(p.proven!==true||!N.has(p.machine))throw Error('Unproved machine bound');
  if(p.lower!=null)le(rat(p.lower),N.get(p.machine));
  if(p.upper!=null)le(N.get(p.machine),rat(p.upper));
 }
 for(const p of refills){
  const m=nodes.get(p.machine);
  if(p.provenReady!==true||!m?.recipe||!N.has(m.id)||!p.ports?.length||p.ports.reduce((s,x)=>s+x.perBatch,0)!==m.recipe.inputs[p.item])throw Error('Invalid refill proof');
  const candidates=I.get(m.id).filter(e=>e.materials.includes(p.item));
  if(candidates.length!==p.ports.length||new Set(p.ports.map(x=>x.route)).size!==p.ports.length||p.ports.some(x=>!Number.isSafeInteger(x.perBatch)||x.perBatch<0||!candidates.some(e=>e.id===x.route&&e.materials.length===1)))throw Error('Invalid refill routes');
  for(const x of p.ports)eq(F.get(x.route).get(p.item),op('*',rat(x.perBatch),N.get(m.id)));
 }
 for(const p of roundRobin){
  const m=nodes.get(p.machine),parts=m?.type==='分流'?O.get(m.id):m?.type==='汇流'?I.get(m.id):null,common=m?.type==='分流'?I.get(m.id):O.get(m.id);
  if(!parts||common.length!==1||common[0].id!==p.commonRoute||parts.length!==p.ports.length||new Set(p.ports).size!==parts.length||p.ports.some(id=>!parts.some(e=>e.id===id))||p.unskipped.some(id=>!p.ports.includes(id)))throw Error('Invalid RR proof');
  if(p.totalRate!=null)eq(X.get(p.commonRoute),rat(p.totalRate));
  if(p.unskipped.length){
   const ref=X.get(p.unskipped[0]);
   for(const id of p.unskipped.slice(1))eq(X.get(id),ref);
   for(const id of p.ports)if(!p.unskipped.includes(id))le(X.get(id),ref);
  }
 }
 for(const p of materialRatios){
  if(p.proven!==true||!F.get(p.route)?.has(p.item)||!Number.isSafeInteger(p.numerator)||!Number.isSafeInteger(p.denominator)||p.numerator<0||p.denominator<=0||p.numerator>p.denominator)throw Error('Invalid material ratio proof');
  eq(op('*',rat(p.denominator),F.get(p.route).get(p.item)),op('*',rat(p.numerator),X.get(p.route)));
 }
 for(const p of materialRatioBounds){
  const {lowerNumerator:l,upperNumerator:u,denominator:d}=p;
  if(p.proven!==true||!F.get(p.route)?.has(p.item)||![l,u,d].every(Number.isSafeInteger)||d<1||l<0||u<l||u>d)throw Error('Invalid material ratio bounds');
  const f=op('*',rat(d),F.get(p.route).get(p.item));
  le(op('*',rat(l),X.get(p.route)),f);le(f,op('*',rat(u),X.get(p.route)));
 }
 for(const p of warehouseBursts){
  if(p.proven!==true||!Array.isArray(p.outlets)||p.outlets.some(a=>!routes.has(a.route)||nodes.get(routes.get(a.route).from)?.type!=='仓出'||nodes.get(routes.get(a.route).from)?.item!==p.item))throw Error('Invalid warehouse burst proof');
  for(const a of p.outlets)eq(X.get(a.route),rat(a.rate));
 }
 // Empty-start structural reachability is an overapproximation, so
 // absent reachable actions never happen. A reachable action is NOT
 // certified positive. Only use the fresh physical compiler's proof.
 const startup=g.emptyStartProof;
 if(startup){
  if(!startup.routeItems||g.lines.some(e=>!Object.hasOwn(startup.routeItems,e.id))||!Array.isArray(startup.cannotProduce)||!Array.isArray(startup.stocked))throw Error('Incomplete startup proof');
  for(const e of g.lines)for(const [k,v] of F.get(e.id))if(!startup.routeItems[e.id].includes(k))eq(v,'0');
  for(const id of startup.cannotProduce)if(N.has(id))eq(N.get(id),'0');
 }
 const frozen=g.frozen||[],duty=frozen.map(f=>{
  const a=sym();bounded(a,'1');
  if(g.unlimited||Object.values(f.rates).every(v=>cmp(q(v),Z)>=0))eq(a,'1');
  if(startup&&!g.unlimited&&Object.entries(f.rates).some(([k,v])=>cmp(q(v),Z)<0&&!startup.stocked.includes(k)))eq(a,'0');
  for(const p of frozenDuties.filter(x=>x.factory===f.id)){if(p.proven!==true)throw Error('Unproved frozen duty');eq(a,rat(p.duty));}
 for(const bound of frozenBounds.filter(x=>x.factory===f.id)){if(bound.proven!==true)throw Error('Unproved frozen bound');le(rat(bound.lower),a);le(a,rat(bound.upper));}
 query('duty:'+f.id,a);return a;
 });
 const items=new Set([...g.lines.filter(e=>nodes.get(e.to).type==='仓入'||nodes.get(e.from).type==='仓出').flatMap(e=>e.materials),...(g.pools||[]).map(p=>p.item),...g.nodes.filter(m=>m.type==='仓出'&&m.item||m.type==='仓入'&&m.inletItem).map(m=>m.type==='仓出'?m.item:m.inletItem),...frozen.flatMap(f=>Object.keys(f.rates))]);
 const totals={inflow:[],outflow:[],net:[],localIn:[],localOut:[],localNet:[],...(htmlQueries?{frozenIn:[],frozenOut:[]}: {})};
 for(const k of items){
  const a=material(g.lines.filter(e=>nodes.get(e.to).type==='仓入'),k),b=material(g.lines.filter(e=>nodes.get(e.from).type==='仓出'),k);
  const pos=[],neg=[];
  frozen.forEach((f,j)=>{if(!Object.hasOwn(f.rates,k))return;const v=q(f.rates[k]);if(cmp(v,Z)>0)pos.push(op('*',rat(v),duty[j]));if(cmp(v,Z)<0)neg.push(op('*',rat({n:-v.n,d:v.d}),duty[j]));});
  const incoming=sum([a,...pos]),outgoing=sum([b,...neg]),net=op('-',incoming,outgoing);
  if(!g.unlimited)le('0',net);
  const returnPool=returnPools.find(x=>x.item===k);
  if(returnPool){
   const withdrawals=g.lines.filter(e=>nodes.get(e.from).type==='仓出'&&nodes.get(e.from).item===k);
   const ids=[...returnPool.returns,...returnPool.sinks];
   if(returnPool.proven!==true||new Set(ids).size!==ids.length||ids.length!==withdrawals.length||withdrawals.some(e=>!ids.includes(e.id))||returnPool.returns.some(id=>nodes.get(routes.get(id)?.to)?.type!=='仓入')||returnPool.sinks.some(id=>nodes.get(routes.get(id)?.to)?.type!=='电脑'))throw Error('Invalid return pool proof');
   eq(sum(returnPool.sinks.map(id=>F.get(id).get(k)||'0')),rat(returnPool.nonreturnOutflow));eq(net,rat(returnPool.net));
  }
  for(const stock of stockPools.filter(x=>x.item===k)){if(stock.proven!==true)throw Error('Unproved stock pool');eq(incoming,rat(stock.income));eq(outgoing,rat(stock.outflow));}
  for(const [name,v] of Object.entries({inflow:incoming,outflow:outgoing,net,localIn:a,localOut:b,localNet:op('-',a,b),...(htmlQueries?{frozenIn:sum(pos),frozenOut:sum(neg)}:{})})){
   query(name+':'+k,v);totals[name].push(v);
  }
 }
 for(const [name,vs] of Object.entries(totals))query('total:'+name,sum(vs));
 // A permanently rejected FIFO head can kill the entire mixed route.
 // Only use a physical spec matching this complete count graph.
 if(g.physicalSpec&&typeof module!=='undefined'&&typeof require==='function'){
  const sp=g.physicalSpec,connected=sp.routes?.filter(r=>r.to!==null)||[];
  if(sp.initial==='empty'&&sp.machines?.length===g.nodes.length&&sp.machines.every(m=>nodes.has(m.id)&&nodes.get(m.id).type===m.type)&&connected.length===g.lines.length&&connected.every(r=>{
   const e=routes.get(r.id);return e&&e.from===r.from&&e.to===r.to&&e.fromPort===r.fromPort&&e.toPort===r.toPort;
  })){
   const p=require('./permanent_fifo_blockage').provePermanentFifoBlockage(sp);
   rateRelations=[...rateRelations,...p.relations];
  }
 }
 // Additional independently proved affine count relations; the same
 // exact elimination can consume inequalities and equalities.
 for(const r of rateRelations){
  if(r.proven!==true||r.ruleVersion!=='real-outlet-buffer-20261125'||!['le','eq'].includes(r.sense)||Object.keys(r.coefficients).some(k=>!Object.hasOwn(obs,k)&&!Object.hasOwn(structuralConstants,k)))throw Error('Invalid real-refill count certificate');
  const x=sum(Object.entries(r.coefficients).map(([k,v])=>op('*',rat(v),obs[k]??structuralConstants[k])));
  (r.sense==='eq'?eq:le)(x,rat(r.constant));
 }
 return {status:'compiled',smt:lines.join('\n'),observables:obs,structuralConstants,groups,variables:n,straightRouters,assertions:lines.length-n-1,scope:'count-limit-necessary-relations-only'};
}
if(typeof module!=='undefined')module.exports={compileCountProofProblem};
