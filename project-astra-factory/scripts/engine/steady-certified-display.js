'use strict';
// The runtime display contract: only proved rational invariants, never
// continuous S/D, a fitted rate or an arbitrary feasible point.
function certifiedEmptyBudget(layout=state,{calculating=false,reason=null,failure=null}={}){
 const items=[...new Set([...layout.machines.filter(m=>m.type==='仓出'||m.type==='仓入').map(m=>m.type==='仓出'?m.item:m.inletItem).filter(Boolean),...activeFrozenFactories(layout).flatMap(f=>Object.keys(f.rates))])];
 const b={proofMode:'strict-counts',status:calculating?'calculating':failure?'calculation-failed':'proved-partial',failure,calculationTimedOut:failure==='timeout',direct:true,calculating,warehouseItems:items,
  inflow:{},outflow:{},net:{},potentialNet:{},overdraftNet:{},routeTotals:{},routeFlows:{},machineCycles:{},machineDuty:{},machineTotals:{},machineMaterials:{},frozenDuty:{},totals:{},overdraftTotal:null,
  diagnostics:{certified:false,exact:false,rateSolved:false},notice:reason||'固定布局空启动精确证明；— 表示尚未证明'};
 for(const m of layout.machines){b.machineTotals[m.id]={in:null,out:null};if(getRecipe(m)){b.machineCycles[m.id]=null;b.machineDuty[m.id]=null;}}
 for(const r of layout.routes){b.routeTotals[r.id]=r.to?null:0;b.routeFlows[r.id]={};}
 return b;
}
function certifiedDisplayBudget(preview,layout=state){
 const failed=['unsupported','contradiction'].includes(preview.actual?.status);
 const b=certifiedEmptyBudget(layout,{failure:failed?preview.actual.status:null,reason:failed?preview.actual.reason:null}),values=preview.values||{},number=x=>x==null?null:steadyExactNumber(steadyRegionQ(x));
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
 b.status=failed?'calculation-failed':preview.completeHtmlQueries?'proved-complete':'proved-partial';
 b.diagnostics={certified:!!preview.completeHtmlQueries,exact:true,rateSolved:preview.actual?.status==='proved',proofScope:preview.scope,actualStatus:preview.actual?.status,unknown:preview.actual?.unknown||[],unknownMetrics:preview.unknownMetrics||[],proofCount:preview.actual?.proofs?.length||0};
 b.notice=failed?'数学模型'+(preview.actual.status==='contradiction'?'约束矛盾':'不支持当前图')+'：'+(preview.actual.reason||'未知原因'):preview.completeHtmlQueries?'固定布局空启动：全部查询已证明':'固定布局空启动：仅显示已证明的精确值，— 表示未知';
 b.diagnostics.proofSearchLimited=!!(preview.actual?.retryable||preview.unlimited?.retryable);
 b.diagnostics.actualQueries=preview.actual?.researchQueries??null;
 b.diagnostics.unlimitedQueries=preview.unlimited?.researchQueries??null;
 b.diagnostics.elapsedMs=preview.elapsedMs??null;
 // A returned partial proof is not a Worker timeout.
 b.calculationTimedOut=false;
 return b;
}
function factoryCertifiedWarehouseTheory(options={}){
 if(typeof factoryCertifiedResearchPreview!=='function')return certifiedEmptyBudget(state,{reason:'严格数学引擎需要浏览器 Worker'});
 return certifiedDisplayBudget(factoryCertifiedResearchPreview({ms:Math.max(1,Math.min(options.ms??60000,(options.deadline??Infinity)-performance.now()))}));
}
