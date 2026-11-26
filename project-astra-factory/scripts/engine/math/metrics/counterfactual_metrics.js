'use strict';
// Reuse the independent service theorems in the separately compiled
// unlimited-stock graph. Potential demand remains the HTML's own
// conditional D semantics, not a substitution of actual rates.
function proveUnlimitedFreeExits(g,arith,freeCertificates=[]){
 if(g.status!=='compiled'||!g.completePhysicalRoutes||!g.unlimited)return [];
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return [];I.get(e.to).push(e);O.get(e.from).push(e);}
 const out=[],certifiedFree=new Set(freeCertificates.filter(c=>c.proven===true&&c.method==='refill-buffer-always-has-space-eventually').map(c=>c.machine));
 for(const e of g.lines){
  const m=ns.get(e.from),d=ns.get(e.to);
  if(m.type!=='仓出'||m.physicalOutCount!==1||O.get(m.id).length!==1||I.get(m.id).length||e.active===false||e.compatible!==true||e.materials.length!==1||e.materials[0]!==m.item||!Number.isSafeInteger(e.length)||e.length<1)continue;
  if(certifiedFree.has(m.id)||d.type==='仓入'||d.type==='电脑'&&d.physicalInCount===1&&I.get(d.id).length===1&&!O.get(d.id).length)out.push({proven:true,item:m.item,method:'unlimited-independent-free-terminal',outlets:[{machine:m.id,route:e.id,rate:'1'}]});
 }
 return out;
}
// Only structural cases where current HTML conditional D is independent
// of every unknown competing offer. The income must be an exact actual
// proof. These are deliberately not assertions about general latent D.
function projectTrivialPotential(g,arith,actual){
 const {q,add,sub,div,cmp,mul,txt,Z,U}=arith,ns=new Map(g.nodes.map(m=>[m.id,m])),out={};
 const I=id=>g.lines.filter(e=>e.to===id),O=id=>g.lines.filter(e=>e.from===id);
 for(const [key,income] of Object.entries(actual||{})){
  if(!key.startsWith('inflow:')||income==null)continue;
  const k=key.slice(7),withdrawals=g.lines.filter(e=>ns.get(e.from)?.type==='仓出'&&ns.get(e.from).item===k),consumers=(g.frozen||[]).filter(f=>Object.hasOwn(f.rates,k)&&cmp(q(f.rates[k]),Z)<0);
  let demand=Z,ok=true;
  for(const e of withdrawals){
   const m=ns.get(e.to);
   if(e.compatible!==true||e.materials.length!==1){ok=false;break;}
   if(m.type==='仓入'||m.type==='电脑'&&I(m.id).length===1){demand=add(demand,U);continue;}
   const r=m.recipe,keys=Object.keys(r?.inputs||{}),os=O(m.id);
   if(!r||keys.length!==1||keys[0]!==k||I(m.id).length!==1||os.length!==1||os[0].compatible!==true||ns.get(os[0].to)?.type!=='仓入'){ok=false;break;}
   const a=q(r.inputs[k]),b=q(r.qty),T=q(r.seconds);
   const options=[U,div(a,T),div(a,b)],v=options.reduce((x,y)=>cmp(x,y)<=0?x:y);
   demand=add(demand,v);
  }
  if(!ok)continue;
  for(const f of consumers){
   if(Object.values(f.rates).filter(v=>cmp(q(v),Z)<0).length!==1){ok=false;break;}
   demand=add(demand,sub(Z,q(f.rates[k])));
  }
  if(ok)out[k]={potential:txt(sub(q(income),demand)),withdrawalDemand:txt(demand),method:'structurally-independent-demand'};
 }
 return out;
}

// Current-boundary pressure query. The actual graph and actual counts
// remain untouched. Each query concerns a separate vector of demand
// counts on the physical component, with the CURRENT warehouse supply
// contracts as boundary conditions. Positive-growth stocks have a
// permanently ready gate in this regime. For a scarce non-target stock
// we retain its certified independent deposit calendar, including its
// priority competition. The queried gate has no stock ceiling, but
// every physical belt, recipe, cooldown, FIFO and router still applies.
// Do not infer a new warehouse income, or impose a new inventory
// equilibrium on these demand counts. A unique projected demand is a
// sufficient certificate; a nonunique projection remains unknown.
//
// Currently restricted to no frozen actors, independently certified
// complete scarce deposit calendars, and noncyclic physical components.
// A boundary contract is not a claim about stocks after a real upgrade.
function projectCurrentBoundaryDemand(g,A,actual,prior,{ms=1000,maxRows=12000,maxNodes=180}={}){
 const out={},start=performance.now(),remaining=()=>Math.max(0,ms-(performance.now()-start));
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited||(g.frozen||[]).length||actual.status!=='proved'||actual.depthSchedule?.cyclicComponents?.length)return out;
 const {q,cmp,txt,sub,Z}=A,v=actual.values,roots=g.nodes.filter(m=>m.type==='仓出'&&m.item&&g.lines.some(e=>e.from===m.id)),items=[...new Set(roots.map(m=>m.item))],ready=items.filter(k=>v['net:'+k]!=null&&cmp(q(v['net:'+k]),Z)>0);
 if(!items.some(k=>prior[k]?.potential==null&&v["inflow:"+k]!=null)||remaining()<60)return out;
 const originalPaced=provePriorityPacedRecipeCalendars(g,A);
 const deposits=completeDepositContracts(g,A,originalPaced.calendars);
 const byItem=new Map(deposits.map(c=>[c.item,c]));
 // Current supply calendars are boundary data, not conditional output
 // predictions. Use only exact actual income and complete calendar rate.
 const available=k=>{const c=byItem.get(k);return c&&v['inflow:'+k]!=null&&cmp(q(c.rate),q(v['inflow:'+k]))===0;};
 for(const item of items){
  if(prior[item]?.potential!=null||v['inflow:'+item]==null||remaining()<60)continue;
  const abundantItems=[...ready,item],scarce=items.filter(k=>!abundantItems.includes(k));
  if(scarce.some(k=>!available(k)))continue;
  const boundary=Object.fromEntries(scarce.map(k=>[k,v['inflow:'+k]]));
  const routers=proveSaturatedRouterCounts(g,A,{abundantItems});
  const free=routers.freeReceiverRoutes,open=new Set(abundantItems),freeSet=new Set(free);
  // The priority certificate is valid only for the fixed scarce pool;
  // do not carry its restrictive actual rates into a ready pool query.
  const paced={...originalPaced,witnesses:originalPaced.witnesses.filter(w=>scarce.includes(w.item)),relations:originalPaced.relations.filter(r=>originalPaced.witnesses.some(w=>scarce.includes(w.item)&&(Object.hasOwn(r.coefficients,'cycle:'+w.machine)||Object.hasOwn(r.coefficients,'routeTotal:'+w.inputCalendar?.route)||Object.hasOwn(r.coefficients,'routeTotal:'+g.lines.find(e=>e.from===w.root)?.id))))};
  const priority=proveResidualPrioritySplitterElementLaw(g,A,paced,{abundantItems,freeRoutes:free});
  const record=provePeriodicStockSplitterRecordLaw(g,A,originalPaced.calendars,{abundantItems,freeRoutes:free,periodicInputs:priority.calendars});
  const split=proveSaturatedPacedSplitterLaw(g,A,{abundantItems,freeRoutes:free});
  const multi=proveMultiInputSplitterElementLaw(g,A,{abundantItems,freeRoutes:free});
  const relations=[...routers.relations,...paced.relations,...priority.relations,...record.relations,...split.relations,...multi.relations];
  const witnesses=[...routers.witnesses,...paced.witnesses,...priority.witnesses,...record.witnesses,...split.witnesses,...multi.witnesses];
  const emit=(key,constant,method)=>relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method,sense:'eq',coefficients:{[key]:1},constant});
  // Apply the ready-tree capacity only when ALL its supply gates are
  // ready in this demand contract. The previously certified independent
  // terminal must be free here too (or be a real free warehouse end).
  const readyCaps=actual.proofs.filter(c=>c.method==='warehouse-ready-fixed-frame-ordinal-tree'&&c.proven===true&&c.rate!=null&&(c.requiredItems||[c.item]).every(k=>open.has(k)));
  const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
  for(const e of g.lines){I.get(e.to).push(e);O.get(e.from).push(e);}
  for(const c of readyCaps){
   const end=O.get(c.tree)||[];
   if(end.length!==1||!(freeSet.has(end[0].id)||independentFinalReceiver(end[0],ns,I,O)))continue;
   emit('machineTotal:'+c.machine+'|out',c.rate,'pressure-ready-tree');witnesses.push(c);
  }
  // Terminalize only independently certified free receiving paths for
  // the existing shared-root slope comparison; no physical node is
  // changed in the demand equation compiler.
  const usedIds=new Set(g.nodes.map(m=>m.id)),terminalIds=new Map();
  for(const id of free){let key='@pressure-free:'+id;while(usedIds.has(key))key+=':';usedIds.add(key);terminalIds.set(id,key);}
  const pg={...g,nodes:[...g.nodes,...[...terminalIds.values()].map(id=>({id,type:'仓入',physicalInCount:1,physicalOutCount:0}))],lines:g.lines.map(e=>freeSet.has(e.id)?{...e,to:terminalIds.get(e.id),toPort:0}:e)};
  const shared=proveBoundedSharedRootTrees(pg,A,routers.sharedRootCertificates,{abundantItems,maxNodes,maxEdges:12000});
  for(const c of shared.certificates)emit('cycle:'+c.machine,c.rate,c.method);
  witnesses.push(...shared.witnesses);
  // Pure algebraic necessary count relations. Empty-start zero-stock
  // reachability is not a constraint on conditional demands.
  const structuralZeros=proveStructuralZeroFlows({...g,emptyStartProof:null});
  const build=()=>compileCountProofProblem(g,A,{htmlQueries:true,structuralZeros,demandBoundary:boundary,rateRelations:relations});
  const key='outflow:'+item;
  let problem=build(),r=solveFactoredCounts(problem,A,{ms:remaining(),maxRows,partialFactors:true});
  if(r.status==='unsat'||!r.globallyFeasible)continue;
  const residual=proveSaturatedResidualEnvelopeLaw(g,A,r.unique||{},{abundantItems,freeRoutes:free,headClocks:record.headClocks.filter(c=>['abundant-warehouse','autonomous-unit','saturated-splitter','periodic-stock-requested-splitter','proved-free-periodic-splitter'].includes(c.kind))});
  if(residual.relations.length&&remaining()>20){
   relations.push(...residual.relations);witnesses.push(...residual.witnesses);problem=build();
   r=solveFactoredCounts(problem,A,{ms:remaining(),maxRows,partialFactors:true});
   if(r.status==='unsat'||!r.globallyFeasible)continue;
  }
  let demand=r.unique?.[key]??problem.structuralConstants[key];
  if(demand==null&&remaining()>20&&Object.hasOwn(problem.observables,key)){
   const p=projectCountInterval(problem,A,key,{ms:remaining(),maxRows});if(p.status==='interval'&&p.unique)demand=p.lower;
  }
  if(demand==null)continue;
  // The demand query must not underestimate the observed served demand.
  if(v[key]==null||cmp(q(demand),q(v[key]))<0)continue;
  out[item]={potential:txt(sub(q(v['inflow:'+item]),q(demand))),withdrawalDemand:demand,localDemand:demand,localPotential:txt(sub(q(v['localIn:'+item]),q(demand))),method:'current-boundary-demand-counts',certificate:{item,ready:abundantItems,scarce:boundary,relations,witnesses}};
 }
 return out;
}
