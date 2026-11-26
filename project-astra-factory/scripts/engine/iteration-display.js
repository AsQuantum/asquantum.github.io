'use strict';
// Presentation adapter only: independent iteration results, unknowns remain null.
function certifiedEmptyBudget(layout=state,{calculating=false,reason=null,failure=null}={}){
 const items=iterationLayoutWarehouseItems(layout);
 const b={proofMode:'strict-counts',engine:'iteration',status:calculating?'calculating':failure?'calculation-failed':'iteration-partial',failure,calculationTimedOut:failure==='timeout',direct:true,calculating,warehouseItems:items,
  inflow:{},outflow:{},net:{},potentialNet:{},overdraftNet:{},routeTotals:{},routeFlows:{},machineCycles:{},machineDuty:{},machineTotals:{},machineMaterials:{},frozenDuty:{},totals:{},overdraftTotal:null,
  diagnostics:{certified:false,exact:false,rateSolved:false},notice:reason||'独立周期迭代；— 表示未求解'};
 for(const m of layout.machines){b.machineTotals[m.id]={in:null,out:null};if(getRecipe(m)){b.machineCycles[m.id]=null;b.machineDuty[m.id]=null;}}
 for(const r of layout.routes){b.routeTotals[r.id]=r.to?null:0;b.routeFlows[r.id]={};}
 return b;
}
// Provenance of successful branches, not a claim of general certification.
function iterationSolutionMethod(preview){
 const actual=preview.actual?.components||[],over=preview.unlimited?.components||[];
 const branches=[...actual.map(c=>({status:c.actualStatus,method:c.method})),...actual.flatMap(c=>Object.values(c.pressure||{})),...over];
 const analytic=branches.filter(b=>b.status==='exact-model-analytic');
 const periodic=branches.filter(b=>b.status==='exact-model-period');
 const methods=[...new Set(analytic.map(b=>b.method).filter(Boolean))];
 const kind=analytic.length&&periodic.length?'mixed':analytic.length?'analytic':periodic.length?'iteration':preview.completeHtmlQueries?'analytic':'unknown';
 return {kind,methods,analyticBranches:analytic.length,periodicBranches:periodic.length};
}
function certifiedDisplayBudget(preview,layout=state){
 const failed=preview.status==='unsupported-layout';
 const b=certifiedEmptyBudget(layout,{failure:failed?'unsupported':null,reason:failed?preview.reason:null}),values=preview.values||{},number=x=>x==null?null:steadyExactNumber(steadyRegionQ(x));
 const map={inflow:'inflow',outflow:'outflow',net:'net',localInflow:'localIn',localOutflow:'localOut',localNet:'localNet',frozenInflow:'frozenIn',frozenOutflow:'frozenOut',frozenDuty:'duty',machineCycles:'cycle',machineDuty:'machineDuty',routeTotals:'routeTotal'};
 b.fractions={};b.warehouseItems=[...new Set([...b.warehouseItems,...Object.keys(preview.rows||{})])];
 for(const [field,prefix] of Object.entries(map)){
  const pairs=Object.entries(values).filter(([k])=>k.startsWith(prefix+':')).map(([k,v])=>[k.slice(prefix.length+1),v]);
  b.fractions[field]=Object.fromEntries(pairs);b[field]=Object.fromEntries(pairs.map(([k,v])=>[k,number(v)]));
 }
 b.fractions.routes={};b.fractions.machineTotals={};b.fractions.machineMaterials={};
 for(const [k,v] of Object.entries(values)){
  if(k.startsWith('flow:')){const [id,item]=k.slice(5).split('|');(b.routeFlows[id]??={})[item]=number(v);(b.fractions.routes[id]??={})[item]=v;}
  if(k.startsWith('machineTotal:')){const [id,kind]=k.slice(13).split('|');(b.machineTotals[id]??={})[kind]=number(v);(b.fractions.machineTotals[id]??={})[kind]=v;}
  if(k.startsWith('machineMaterial:')){const [id,kind,item]=k.slice(16).split('|');((b.machineMaterials[id]??={})[kind]??={})[item]=number(v);((b.fractions.machineMaterials[id]??={})[kind]??={})[item]=v;}
 }
 // An unsupported graph is not a zero graph. Every missing result is null.
 for(const m of layout.machines){
  if(getRecipe(m)){if(!Object.hasOwn(b.machineCycles,m.id))b.machineCycles[m.id]=null;if(!Object.hasOwn(b.machineDuty,m.id))b.machineDuty[m.id]=null;}
  const t=b.machineTotals[m.id]??={};for(const kind of ['in','out'])if(!Object.hasOwn(t,kind))t[kind]=null;
 }
 for(const r of layout.routes){
  if(!Object.hasOwn(b.routeTotals,r.id))b.routeTotals[r.id]=r.to?null:0;
  b.routeFlows[r.id]??={};
 }
 for(const field of ['potentialNet','overdraftNet','withdrawalDemand','localPotential','localDemand'])b.fractions[field]={};
 for(const k of b.warehouseItems){
  const row=preview.rows?.[k];
  for(const [field,src] of [['inflow','inflow'],['outflow','outflow'],['net','net'],['potentialNet','potential'],['overdraftNet','overdraft']]){const v=row?.[src]??null;b[field][k]=number(v);b.fractions[field][k]=v;}
  b.fractions.withdrawalDemand[k]=row?.withdrawalDemand??null;
  b.fractions.localPotential[k]=row?.localPotential??null;b.fractions.localDemand[k]=row?.localDemand??null;
  for(const f of ['localInflow','localOutflow','localNet','frozenInflow','frozenOutflow'])if(!Object.hasOwn(b[f],k)){b[f][k]=null;b.fractions[f][k]=null;}
 }
 b.fractions.totals={...preview.total};b.fractions.machineTimes={...preview.machineTimes};
 b.totals=Object.fromEntries(Object.entries(preview.total||{}).map(([k,v])=>[k,number(v)]));b.overdraftTotal=b.totals.overdraft??null;
 b.status=failed?'calculation-failed':preview.completeHtmlQueries?'iteration-complete':'iteration-partial';
 const coverage=raw=>{const xs=Object.values(raw||{});return {known:xs.filter(x=>x!=null).length,total:xs.length}};
 const limited=(preview.actual?.components||[]).some(c=>c.actualStatus==='budget'||Object.values(c.pressure||{}).some(x=>x.status==='budget'||x.status==='budget-or-no-calendar'))||(preview.unlimited?.components||[]).some(c=>c.status==='budget');
 b.diagnostics={engine:'iteration',certified:false,exactModel:true,rateSolved:!!preview.actual?.actualValues,actualStatus:failed?'unsupported':preview.actual?.status,unknownMetrics:preview.unknownMetrics||[],actualQueries:coverage(preview.values),unlimitedQueries:coverage(preview.unlimitedValues),elapsedMs:preview.elapsedMs??null,proofSearchLimited:limited,components:preview.actual?.components||[],unresolvedComponents:(preview.unlimited?.components||[]).filter(c=>!c.values).map(c=>({machines:c.machines,reason:c.reason,tick:c.tick}))};
 b.diagnostics.solutionMethod=iterationSolutionMethod(preview);
 const search=[...(preview.actual?.components||[]).flatMap(c=>[c,...Object.values(c.pressure||{})]),...(preview.unlimited?.components||[])];
 b.diagnostics.componentErrors=[...new Set(search.filter(x=>x.actualStatus==='error'||x.status==='error').map(x=>x.reason||'unknown component error'))];
 b.diagnostics.recoveredProofErrors=[...new Set(search.map(x=>x.analyticError).filter(Boolean))];
 b.diagnostics.componentCacheHits=[...(preview.actual?.components||[]),...(preview.unlimited?.components||[])].filter(x=>x.componentCacheHit).length;
 b.diagnostics.searchStats={resumedSearches:search.filter(x=>x.resumed).length,reusedSearches:search.filter(x=>x.reused).length,peakCheckpoints:Math.max(0,...search.map(x=>x.peakCheckpoints||0)),quietTicks:search.reduce((n,x)=>n+(x.quietSkipped||0),0),loopTicks:search.reduce((n,x)=>n+(x.skippedTicks||0),0),stepCalls:search.reduce((n,x)=>n+(x.stepCalls||0),0),symbolicAccepts:search.reduce((n,x)=>n+(x.symbolicAccepts||0),0),symbolicJumps:search.reduce((n,x)=>n+(x.symbolicJumps||0),0),symbolicReplayTicks:search.reduce((n,x)=>n+(x.symbolicReplayTicks||0),0)};
 b.notice=failed?'当前数据无法建立计算模型':preview.completeHtmlQueries?'全部查询已求得；新模型仍在验证':'— 表示未求解';
 b.calculationTimedOut=false;
 return b;
}
// Compatibility marker for existing inspector conservation help. No solver here.
function factoryCertifiedWarehouseTheory(){return certifiedEmptyBudget(state,{reason:'独立迭代 Worker 计算'})}
