'use strict';
// Strict preview path. No conditional S/D solve, old reservation proofs,
// simulated event orbit, numerical fixed point or optimization objective.
// Each value is a rational constant on a necessary count envelope.
function solveCertifiedCountGraph(g,arith,{ms=8000,maxRows=12000,maxRounds=8,maxNodes=180}={}){
 const start=performance.now(),deadline=start+ms,remaining=()=>Math.max(0,deadline-performance.now());
 const empty={status:'unsupported',values:{},unknown:[],proofs:[],netLower:{},retryable:false};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return {...empty,reason:'incomplete or unsupported physical graph'};
 const {q,cmp,txt,Z,U}=arith,structuralZeros=proveStructuralZeroFlows(g);
 const routers=proveSaturatedRouterCounts(g,arith);
 function makeProofGraph(r){
  const waits=new Map((r.boundedReceiverRoutes||[]).map(x=>[x.id,x.wait]));
  for(const id of r.freeReceiverRoutes||[])waits.delete(id);
  const freeReceiverIds=new Set([...(r.freeReceiverRoutes||[]),...waits.keys()]);
  // Proof-only view; no warehouse movement or real terminal is fabricated.
  const usedIds=new Set(g.nodes.map(m=>m.id)),terminalIds=new Map();
  for(const id of freeReceiverIds){let name='@free-splitter:'+id;while(usedIds.has(name))name+=':';usedIds.add(name);terminalIds.set(id,name);}
  return freeReceiverIds.size?{...g,nodes:[...g.nodes,...[...terminalIds.values()].map(id=>({id,type:'仓入',physicalInCount:1,physicalOutCount:0}))],lines:g.lines.map(e=>freeReceiverIds.has(e.id)?{...e,to:terminalIds.get(e.id),toPort:0,terminalWait:waits.get(e.id)}:e)}:g;
 }
 const proofGraph=makeProofGraph(routers);

 // Only pure, exclusively connected fixed-frame recipe trees. No virtual
 // warehouse roots or old event-order claims are imported.
 const trees=provePhysicalRecipeTrees(proofGraph,arith,{clock:'fixed-tick',maxNodes,maxEdges:12000});
 const sharedTrees=proveBoundedSharedRootTrees(proofGraph,arith,routers.sharedRootCertificates,{maxNodes,maxEdges:12000});
 const fifo=g.physicalSpec?provePermanentFifoBlockage(g.physicalSpec):{relations:[],witnesses:[]};
 const priority=proveRealRefillPriority(g,{maxRelations:1500,freeCertificates:routers.freeOutletCertificates});
 const sparseFrozen=proveSparseFrozenPriority(g,arith);
 const bursts=proveUnlimitedFreeExits(g,arith,routers.freeOutletCertificates);
 const ready=proveWarehouseReadyTrees(proofGraph,arith,{maxNodes:600,maxEdges:20000}),uppers=proveWarehouseCapacityBounds(g,arith,ready.caps);
 const warehouseBounds=Object.entries(uppers).map(([id,v])=>({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'warehouse-uniform-capacity-bound',sense:'le',coefficients:{['machineTotal:'+id+'|out']:1},constant:v}));
 const unlimitedReady=g.unlimited?ready.caps.map(c=>({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:c.method,sense:'eq',coefficients:{['machineTotal:'+c.machine+'|out']:1},constant:c.rate})):[];

 const relations=[...fifo.relations,...priority.relations,...sparseFrozen.relations,...warehouseBounds,...unlimitedReady,...routers.relations],seen=new Set(relations.map(x=>JSON.stringify([x.sense,x.coefficients,x.constant])));
 const proofs=[...trees.certificates,...sharedTrees.witnesses,...fifo.witnesses,...priority.relations,...sparseFrozen.witnesses,...bursts,...ready.caps,...routers.witnesses];
 const netLower=Object.create(null),values=Object.create(null);
 const targets=[...new Set([...g.nodes.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item),...(g.frozen||[]).flatMap(f=>Object.entries(f.rates).filter(([,v])=>cmp(q(v),Z)<0).map(([k])=>k))])];
 const build=()=>compileCountProofProblem(g,arith,{htmlQueries:true,machineRates:[...trees.certificates,...sharedTrees.certificates],warehouseBursts:bursts,rateRelations:relations,structuralZeros});
 let problem=build(),stats=[],retryable=false,round=0,globallyFeasible=false;
 if(problem.status!=='compiled')return {...empty,reason:problem.reason};
 Object.assign(values,problem.structuralConstants);
 for(;round<maxRounds;round++){
  if(remaining()<=0){retryable=true;break;}
  const r=solveFactoredCounts(problem,arith,{ms:remaining(),maxRows,partialFactors:true});
  stats.push({status:r.status,unique:Object.keys(r.unique||{}).length,unresolved:r.unresolved?.length||0,globallyFeasible:r.globallyFeasible??null,factors:r.stats?.factors||[]});
  if(r.status==='unsat')return {...empty,status:'contradiction',reason:'necessary certificates inconsistent',proofs,stats};
  if(!['sat','partial'].includes(r.status)){retryable=true;break;}
  for(const [k,v] of Object.entries(r.unique||{})){
   if(Object.hasOwn(values,k)&&values[k]!==v)return {...empty,status:'contradiction',reason:'certificates disagree at '+k,proofs,stats};
   values[k]=v;
  }
  globallyFeasible=r.globallyFeasible===true;
  if(r.status==='partial')retryable=true;
  if(g.unlimited||!targets.length||remaining()<=0||Object.keys(problem.observables).every(k=>Object.hasOwn(values,k)))break;
  // Exact projection of an interval, never minimization to pick a rate.
  for(const k of targets){
   if(values['net:'+k]!=null){
    if(cmp(q(values['net:'+k]),Z)>0)netLower[k]=values['net:'+k];
    continue;
   }
   if(netLower[k]!=null||remaining()<25||!Object.hasOwn(problem.observables,'net:'+k))continue;
   const p=projectCountInterval(problem,arith,'net:'+k,{ms:Math.min(150,remaining()),maxRows});
   if(p.status==='contradiction')return {...empty,status:'contradiction',reason:'net projection inconsistent',proofs,stats};
   if(p.status==='interval'&&p.lower!=null&&cmp(q(p.lower),Z)>0)netLower[k]=p.lower;
   if(p.status==='interval'&&p.unique)values['net:'+k]=p.lower;
  }
  const work=proveStockWorkConservation(g,arith,values,netLower,ready.caps,routers.freeOutletCertificates);
  const balanced=proveBalancedStockSaturation(g,arith,values,ready.caps,uppers,netLower);
  const jointTrees=proveJointWarehouseTreeBottleneck(g,arith,values,ready.trees);
  const residual=proveJointStockResidualBounds(g,arith,values,ready.trees,uppers);
  const hasFrozen=(g.frozen||[]).some(f=>Object.values(f.rates).some(v=>cmp(q(v),Z)<0));
  const exclusive=hasFrozen?proveExclusiveFrozenDuties(g,arith,values).certificates:[];
  const rings=hasFrozen?proveFedFrozenRings(g,arith,values).certificates:[];
  // Only unresolved exclusive components need the bounded exact
  // disjunctive algebra; no fixed point iteration or orbit search.
  const handled=new Set([...exclusive,...rings].map(x=>x.factory));
  const network=hasFrozen&&remaining()>30&&(g.frozen||[]).some(f=>values['duty:'+f.id]==null&&!handled.has(f.id))?
   proveExclusiveFrozenNetwork(g,arith,solveDirectRateProblem,values,{ms:Math.min(150,remaining()),maxNodes:2000}).certificates:[];
  const frozenProofs=[...exclusive,...rings,...network];
  const frozenRelations=frozenProofs.map(c=>({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:c.method,sense:'eq',coefficients:{['duty:'+c.factory]:1},constant:c.duty}));

  // Independently abundant inventory also makes the real refill root ready.
  for(const c of ready.caps)if((c.requiredItems||[c.item]).every(k=>netLower[k]!=null&&cmp(q(netLower[k]),Z)>0))balanced.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:c.method,sense:'eq',coefficients:{['machineTotal:'+c.machine+'|out']:1},constant:c.rate});

  const abundantItems=Object.keys(netLower).filter(k=>cmp(q(netLower[k]),Z)>0);
  const abundantRouters=proveSaturatedRouterCounts(g,arith,{abundantItems});
  const abundantShared=abundantItems.length?proveBoundedSharedRootTrees(makeProofGraph(abundantRouters),arith,abundantRouters.sharedRootCertificates,{abundantItems,maxNodes,maxEdges:12000}):{certificates:[],witnesses:[]};
  const sharedRelations=abundantShared.certificates.map(c=>({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:c.method,sense:'eq',coefficients:{['cycle:'+c.machine]:1},constant:c.rate}));
  let fresh=0;
  for(const x of [...work.relations,...balanced.relations,...jointTrees.relations,...residual.relations,...abundantRouters.relations,...sharedRelations,...frozenRelations]){
   const key=JSON.stringify([x.sense,x.coefficients,x.constant]);
   if(seen.has(key))continue;
   seen.add(key);relations.push(x);fresh++;
  }
  if(!fresh)break;
  proofs.push(...work.witnesses,...balanced.witnesses,...jointTrees.witnesses,...residual.witnesses,...abundantRouters.witnesses,...abundantShared.witnesses,...frozenProofs);problem=build();
 }
 const all=Object.keys(problem.observables),unknown=all.filter(k=>!Object.hasOwn(values,k));
 const known={...problem.structuralConstants,...Object.fromEntries(all.map(k=>[k,values[k]??null]))};
 return {status:unknown.length||!globallyFeasible?'partial':'proved',values:known,unknown,proofs,netLower,retryable:retryable||remaining()<=0&&unknown.length>0,rounds:stats,depthSchedule:routers.schedule,structuralZeros:{...structuralZeros.summary,constantQueries:Object.keys(problem.structuralConstants||{}).length},researchQueries:{total:all.length,known:all.length-unknown.length,unknown:unknown.length},algebraSize:{variables:problem.variables,assertions:problem.assertions,straightRouters:problem.straightRouters},elapsedMs:performance.now()-start,scope:'exact-rational-fixed-frame-empty-start'};
}
// Potential is a different, conditional demand query. Only the structurally
// independent cases are used; no actual flow is substituted for unknown D.
function certifiedIndependentPotential(g,arith,values,readyCaps=[]){
 const {q,cmp,sub,add,mul,div,txt,Z,U}=arith,ns=new Map(g.nodes.map(m=>[m.id,m])),out={};
 // Conditional demand holds actual income fixed but removes the queried
 // stock restriction. Actual surplus alone is NOT sufficient: relaxing
 // another input may increase consumption. Use uniform capacity bounds
 // for all other consumers, or an exclusive common-service actor.
 const caps=readyCaps.filter(x=>x.method==='warehouse-ready-fixed-frame-ordinal-tree'&&x.rate!=null);
 const uppers=proveWarehouseCapacityBounds(g,arith,caps),outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item);
 const totalUpper=new Map(),treeGroups=new Map();
 const bump=(m,k,v)=>m.set(k,add(m.get(k)||Z,v));
 for(const m of outlets)bump(totalUpper,m.item,q(uppers[m.id]??'1'));
 for(const f of g.frozen||[])for(const [k,v] of Object.entries(f.rates))if(cmp(q(v),Z)<0)bump(totalUpper,k,sub(Z,q(v)));
 for(const c of caps){const group=treeGroups.get(c.tree)||[];if(!group.some(x=>x.machine===c.machine))group.push(c);treeGroups.set(c.tree,group);}
 function scaleFor(needs,k,otherUpper){
  let scale=U;
  for(const [item,D] of needs){
   if(item===k||cmp(D,Z)===0)continue;
   const I=values['inflow:'+item];if(I==null)return null;
   if(cmp(q(I),totalUpper.get(item)||Z)>=0)continue;
   // Independent exclusive shortage is a common-service bottleneck.
   // Do not allocate contested stock merely from average rates.
   if(cmp(otherUpper(item),Z)>0)return null;
   const ratio=div(q(I),D);
   if(cmp(ratio,scale)<0)scale=ratio;
  }
  return scale;
 }
 const treeScale=new Map();
 function capScale(c,k){
  const id=c.tree+'|'+k;if(treeScale.has(id))return treeScale.get(id);
  const group=treeGroups.get(c.tree)||[c],roots=new Set(group.map(x=>x.machine)),needs=new Map();
  for(const x of group)bump(needs,x.item,q(x.rate));
  // Refuse incomplete root certificates for a multi-input actor.
  if((c.requiredItems||[k]).some(i=>!needs.has(i)))return null;
  const otherUpper=item=>{
   let u=Z;
   for(const m of outlets)if(m.item===item&&!roots.has(m.id))u=add(u,q(uppers[m.id]??'1'));
   for(const f of g.frozen||[]){const v=q(f.rates[item]??'0');if(cmp(v,Z)<0)u=sub(u,v);}
   return u;
  };
  const result=scaleFor(needs,k,otherUpper);treeScale.set(id,result);return result;
 }
 for(const key of Object.keys(values).filter(k=>k.startsWith('inflow:'))){
  const k=key.slice(7),income=values[key],localIncome=values['localIn:'+k];
  // A positive long-run stock slope makes every sufficiently late
  // frame independent of this stock's availability. Removing ONLY
  // that gate from the current regime leaves the trajectory unchanged.
  const net=values['net:'+k];
  if(net!=null&&cmp(q(net),Z)>0){
   out[k]={potential:net,withdrawalDemand:values['outflow:'+k]??null,localPotential:values['localNet:'+k]??null,localDemand:values['localOut:'+k]??null,method:'positive-stock-gate-inactive'};
   continue;
  }
  let demand=Z,physicalOK=true;
  for(const m of g.nodes.filter(m=>m.type==='仓出'&&m.item===k)){
   const es=g.lines.filter(e=>e.from===m.id);
   if(!es.length)continue;
   const e=es[0],d=ns.get(e.to);
   if(readyCaps.some(x=>x.method==='refill-buffer-always-has-space-eventually'&&x.machine===m.id&&x.item===k)){demand=add(demand,U);continue;}
   const cap=caps.find(x=>x.machine===m.id&&x.item===k);
   if(cap){const scale=capScale(cap,k);if(scale!==null){demand=add(demand,mul(q(cap.rate),scale));continue;}}
   if(es.length!==1||e.compatible!==true||e.materials.length!==1||e.materials[0]!==k||!d||!(d.type==='仓入'||d.type==='电脑'&&g.lines.filter(x=>x.to===d.id).length===1)){physicalOK=false;break;}
   demand=add(demand,U);
  }
  const localDemand=physicalOK?txt(demand):null,localPotential=physicalOK&&localIncome!=null?txt(sub(q(localIncome),demand)):null;
  let ok=physicalOK;
  if(ok)for(const f of g.frozen||[]){
   const needs=Object.entries(f.rates).filter(([,v])=>cmp(q(v),Z)<0),r=needs.find(([i])=>i===k);
   if(!r)continue;
   const need=new Map(needs.map(([i,v])=>[i,sub(Z,q(v))])),otherUpper=item=>{
    let u=Z;
    for(const m of outlets)if(m.item===item)u=add(u,q(uppers[m.id]??'1'));
    for(const x of g.frozen||[])if(x!==f){const v=q(x.rates[item]??'0');if(cmp(v,Z)<0)u=sub(u,v);}
    return u;
   },scale=scaleFor(need,k,otherUpper);
   if(scale===null){ok=false;break;}
   demand=add(demand,mul(sub(Z,q(r[1])),scale));
  }
  out[k]={localDemand,localPotential,withdrawalDemand:ok?txt(demand):null,potential:ok&&income!=null?txt(sub(q(income),demand)):null};
 }
 return out;
}
function factoryCertifiedResearchPreview({ms=8000,maxRows=12000,maxRounds=8,maxNodes=180}={}){
 const t=performance.now(),arith=factoryDirectArithmetic(),g=factoryCompileDirectGraph(state,null,{countOnly:true}),ug=factoryCompileDirectGraph(state,null,{countOnly:true,unlimitedWarehouse:true});
 g.physicalSpec=factoryCompileSymbolicSpec(state);ug.physicalSpec=factoryCompileSymbolicSpec(state,{unlimitedWarehouse:true});
 const bundle={g,ug};
 const opts={ms:Math.max(1,ms*.55),maxRows,maxRounds,maxNodes},actual=solveCertifiedCountGraph(bundle.g,arith,opts);
 const hasConsumers=bundle.g.nodes.some(m=>m.type==='仓出'&&bundle.g.lines.some(e=>e.from===m.id))||(bundle.g.frozen||[]).some(f=>Object.values(f.rates).some(v=>arith.cmp(arith.q(v),arith.Z)<0));
 const unlimited=hasConsumers?solveCertifiedCountGraph(bundle.ug,arith,{...opts,ms:Math.max(0,ms-(performance.now()-t))}):actual;
 // Long-run open-route rates are zero by the new physical rule, and
 // permanently rejected materials have zero mean by bounded FIFO balance.
 // Keep these explicit in the query contract instead of silently omitting.
 function addPhysicalZeros(result,g){
  if(g.status!=='compiled'||!g.completePhysicalRoutes||!['proved','partial'].includes(result.status))return;
  for(const r of state.routes){
   if(!r.to){
    result.values['routeTotal:'+r.id]='0';
    for(const k of streamMaterials(r))result.values['flow:'+r.id+'|'+k]='0';
   }
  }
  for(const e of g.lines)for(const k of e.rawMaterials||[])if(!e.materials.includes(k))result.values['flow:'+e.id+'|'+k]='0';
 }
 addPhysicalZeros(actual,bundle.g);addPhysicalZeros(unlimited,bundle.ug);
 const v=actual.values,u=unlimited.values,potential=['proved','partial'].includes(actual.status)?certifiedIndependentPotential(bundle.g,arith,v,actual.proofs||[]):{},items=[...new Set([...Object.keys(v).filter(k=>k.startsWith('net:')).map(k=>k.slice(4)),...Object.keys(u).filter(k=>k.startsWith('net:')).map(k=>k.slice(4)),...bundle.g.nodes.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item),...(bundle.g.frozen||[]).flatMap(f=>Object.keys(f.rates))])];
 // If only one stock gate exists, lifting it is exactly the all-stock
 // counterfactual for DEMAND, but retain actual income for potential.
 const consumers=new Set([...bundle.g.nodes.filter(m=>m.type==='仓出'&&bundle.g.lines.some(e=>e.from===m.id)).map(m=>m.item),...(bundle.g.frozen||[]).flatMap(f=>Object.entries(f.rates).filter(([,r])=>arith.cmp(arith.q(r),arith.Z)<0).map(([k])=>k))]);
 // For the new single-stock case require a grounded, state-independent
 // nominal terminal cadence for every directly supplied recipe. Do not
 // infer equivalence of arbitrary empty-start and mid-run attractors.
 const roots=bundle.ug.nodes.filter(m=>m.type==='仓出'&&bundle.ug.lines.some(e=>e.from===m.id));
 const directNominal=roots.length>0&&!(bundle.g.frozen||[]).length&&!unlimited.depthSchedule?.cyclicComponents?.length&&roots.every(m=>{
  const es=bundle.ug.lines.filter(e=>e.from===m.id);if(es.length!==1)return false;
  const e=es[0],r=bundle.ug.nodes.find(n=>n.id===e.to);
  return e.compatible===true&&e.materials.length===1&&e.materials[0]===m.item&&r?.recipe&&
   bundle.ug.lines.filter(x=>x.to===r.id&&x.materials.includes(m.item)).length===1&&
   unlimited.proofs.some(w=>w.method==='composed-ingredient-ready-free-recipe'&&w.machine===r.id);
 });
 if(consumers.size===1&&directNominal&&['proved','partial'].includes(unlimited.status)){
  const k=[...consumers][0],d=u['outflow:'+k],ld=u['localOut:'+k],income=v['inflow:'+k],li=v['localIn:'+k];
  if(d!=null&&income!=null&&potential[k]?.potential==null)potential[k]={withdrawalDemand:d,potential:arith.txt(arith.sub(arith.q(income),arith.q(d))),localDemand:ld??null,localPotential:ld!=null&&li!=null?arith.txt(arith.sub(arith.q(li),arith.q(ld))):null,method:'single-stock-relaxation-equivalence'};
 }
 const read=(o,k)=>o[k]??null,rows=Object.fromEntries(items.map(k=>[k,{inflow:read(v,'inflow:'+k),outflow:read(v,'outflow:'+k),net:read(v,'net:'+k),potential:potential[k]?.potential??null,overdraft:read(u,'net:'+k),withdrawalDemand:potential[k]?.withdrawalDemand??null,localNet:read(v,'localNet:'+k),localPotential:potential[k]?.localPotential??null,localDemand:potential[k]?.localDemand??null}]));
 const demandKnown=items.every(k=>potential[k]?.withdrawalDemand!=null),sumDemand=demandKnown?items.reduce((a,k)=>arith.add(a,arith.q(potential[k].withdrawalDemand)),arith.Z):null;
 const inc=read(v,'total:inflow'),total={inflow:inc,outflow:read(v,'total:outflow'),net:read(v,'total:net'),potential:items.every(k=>rows[k].potential!=null)?arith.txt(items.reduce((a,k)=>arith.add(a,arith.q(rows[k].potential)),arith.Z)):sumDemand!==null&&inc!==null?arith.txt(arith.sub(arith.q(inc),sumDemand)):null,overdraft:read(u,'total:net')};
 const machineTimes={};
 for(const m of bundle.g.nodes){
  if(!m.recipe&&m.type!=='仓出')continue;
  const r=read(v,m.recipe?'cycle:'+m.id:'machineTotal:'+m.id+'|out');
  machineTimes[m.id]=r===null?null:arith.cmp(arith.q(r),arith.Z)===0?'Infinity':arith.txt(arith.div(arith.U,arith.q(r)));
 }
 const unknownMetrics=items.flatMap(k=>['inflow','outflow','net','potential','overdraft'].filter(f=>rows[k][f]===null).map(f=>f+':'+k)).concat(Object.keys(total).filter(k=>total[k]===null).map(k=>'total:'+k));
 const complete=actual.status==='proved'&&unlimited.status==='proved'&&!unknownMetrics.length;
 return {status:complete?'proved-for-contract':'partial',scope:'exact-rational-fixed-frame-empty-start',actual,unlimited,rows,total,machineTimes,values:v,unknownMetrics,completeHtmlQueries:complete,elapsedMs:performance.now()-t};
}
