'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{compileCountProofProblem:compile}=require('./count_proof_compile'),{solveDirectRateProblem:solve,makeRateAlgebra}=require('./direct_algebra');
const {proveGeneralBatchCadence}=require('./general_batch_cadence'),{refillInvariant}=require('./refill_invariant'),{proveBatchBackpressure}=require('./batch_backpressure_bounds'),{proveRouteClearance,proveUnthrottledGenerators}=require('./rr_bounded_service'),{factoryDirectRoundRobinCertificates:rr}=require('./round_robin_certificates');
const {provePhysicalRecipeTrees}=require('./recipe_tree_proof'),{provePriorityRecipeTrees,proveWarehouseTreeServiceCaps}=require('./warehouse_priority_tree_proof'),{proveSplitRecipeBranches}=require('./split_recipe_branch_proof'),{proveMergerRecipeTrees}=require('./merger_recipe_tree_proof'),{proveSharedRecipeInputs}=require('./shared_recipe_input_proof'),{proveMixedCountRelations}=require('./mixed_count_proof');
const {proveSaturatedTransferRegions}=require('./saturated_transfer_regions');
const {proveFeedForwardOrdinals}=require('./feed_forward_ordinal_proof');
const {proveUnlimitedFreeExits}=require('./counterfactual_metrics');
const {projectCountInterval}=require('./count_interval_projection');
const {solveFactoredCounts}=require('./count_factored_projection');
const {projectCountAtWitness}=require('./count_witness_projection');
const {proveFrozenFiniteComponents}=require('./frozen_finite_components');
const {proveFrozenSingleItemFinite}=require('./frozen_single_item_finite');
const {proveFrozenTickPriority}=require('./frozen_tick_priority_proof');
const {proveExclusiveFrozenDuties}=require('./frozen_exclusive_proof'),{proveExclusiveFrozenNetwork}=require('./frozen_exclusive_network_proof'),{proveFedFrozenRings}=require('./frozen_fed_ring_proof'),{proveFrozenProtectedItem}=require('./frozen_protected_item_proof');
const {proveWarehouseBurstPriority}=require('./warehouse_burst_proof'),{proveWarehouseOverlapping}=require('./warehouse_overlap_proof'),{proveWarehouseNoOverflow}=require('./warehouse_envelope_proof'),{proveSmoothWarehousePriority}=require('./warehouse_smooth_priority_proof'),{proveSharedStockService}=require('./shared_stock_proof'),{proveWarehouseReturnSurplus}=require('./warehouse_return_proof');
// A conservative diagnostic for large systems where full feasibility
// or uniqueness projection could not finish. Equality-only identities
// are necessary for all actual accumulation points, conditional on the
// certificates being sound. No feasibility or nonconstant projection claim.
function equalityProjection(problem){
 if(problem.status!=='compiled')return {status:'unsupported',identities:{}};
 const A=makeRateAlgebra(arith),m=A.parse(problem),solved=new Map();
 for(const row of m.eqs.slice().sort((a,b)=>A.vars(a).length-A.vars(b).length))if(!A.pivot(row,solved))return {status:'contradiction',identities:{}};
 for(const row of m.les){const r=A.substitute(row,solved);if(!A.vars(r).length&&A.val(r).n>0n)return {status:'contradiction',identities:{}};}
 const identities={};
 for(const [k,id] of Object.entries(m.observables)){const r=solved.get(id)||A.variable(id);if(!A.vars(r).length)identities[k]=A.txt(A.val(r));}
 return {status:'necessary-identities-only',identities,unresolved:Object.keys(m.observables).length-Object.keys(identities).length};
}
function combine(g,{ms=10000,maxPasses=4,candidate=null,htmlQueries=false,fixedOnly=false}={}){
 const opts={ms},bare=solve(compile(g,arith),arith,opts),p={htmlQueries,machineRates:[],routeRates:[],routeRateBounds:[],machineBounds:[],refills:[],roundRobin:[],warehouseBursts:[],materialRatios:[],materialRatioBounds:[],stockPools:[],returnPools:[],frozenDuties:[],frozenBounds:[]},sources={};
 function add(name,key,entries){sources[name]=(sources[name]||0)+entries.length;for(const x of entries)if(!p[key].some(y=>JSON.stringify(x)===JSON.stringify(y)))p[key].push(x);}
 if(!fixedOnly){
 const cad=proveGeneralBatchCadence(g,arith,refillInvariant,proveBatchBackpressure);
 add('cadence','machineBounds',cad.machineBounds);add('cadence','machineRates',cad.rateCertificates);add('cadence','refills',cad.certificates);
 add('clearance','machineRates',proveUnthrottledGenerators(g,arith,proveRouteClearance(g,arith)));
 add('round-robin','roundRobin',rr(g,arith,cad.supply));
 add('recipe-tree','machineRates',provePhysicalRecipeTrees(g,arith).certificates);
 for(const [name,fn] of [['priority-tree',provePriorityRecipeTrees],['split-tree',proveSplitRecipeBranches],['merger-tree',proveMergerRecipeTrees],['shared-inlet',proveSharedRecipeInputs],['mixed',proveMixedCountRelations]]){
  const a=fn(g,arith);for(const k of Object.keys(p))if(a[k])add(name,k,a[k]);
 }
 for(const [name,fn] of [['burst',proveWarehouseBurstPriority],['overlap',proveWarehouseOverlapping],['envelope',proveWarehouseNoOverflow],['smooth',proveSmoothWarehousePriority]]){
  const a=fn(g,arith);add(name,'warehouseBursts',a.certificates);add(name,'machineRates',a.certificates.flatMap(x=>x.sourceRates||[]));
 }
 }else{
  add('fixed-recipe-tree','machineRates',provePhysicalRecipeTrees(g,arith,{clock:'fixed-tick'}).certificates);
  const t=provePriorityRecipeTrees(g,arith,{clock:'fixed-tick'});
  add('fixed-priority-tree','machineRates',t.machineRates);add('fixed-priority-tree','machineBounds',t.machineBounds);
 }
 const saturated=proveSaturatedTransferRegions(g,arith);
 add('saturated-transfer','machineRates',saturated.machineRates);add('saturated-transfer','roundRobin',saturated.roundRobin);
 add('unlimited-free','warehouseBursts',proveUnlimitedFreeExits(g,arith));
 const treeCapacity=proveWarehouseTreeServiceCaps(g,arith);
 add('ordinal-capacity','routeRateBounds',treeCapacity.routeRateBounds);
 add('ordinal-capacity','machineBounds',treeCapacity.machineBounds);
 // A graph with no physical lines uses the exact fixed-tick negative
 // competition certificate without combining it with physical ideal-event claims.
 if(!g.lines.length){const t=proveFrozenTickPriority(g,arith);add('frozen-fixed-tick','frozenDuties',t.frozenDuties);const finite=proveFrozenSingleItemFinite(g,arith,{skipItems:t.certificates.map(x=>x.item)});add('frozen-finite-single-item','frozenDuties',finite.frozenDuties);}
 const feed=proveFeedForwardOrdinals(g,arith);add('feed-forward','machineRates',feed.machineRates);add('feed-forward','routeRates',feed.routeRates);
 if(!fixedOnly){const protectedItem=proveFrozenProtectedItem(g,arith);
 add('frozen-protection','frozenDuties',protectedItem.duties);add('frozen-protection','machineRates',protectedItem.machineRates);add('frozen-protection','warehouseBursts',protectedItem.warehouseBursts);}
 let witnessDiagnostic=null;
 function project(){
  const problem=compile(g,arith,p),f=solveFactoredCounts(problem,arith,opts);
  if(f.status==='sat'||f.status==='unsat')return f;
  const r=solve(problem,arith,opts);
  if(r.status==='unknown'&&candidate){
   witnessDiagnostic=projectCountAtWitness(problem,arith,candidate,opts);
   if(witnessDiagnostic.status==='sat')return witnessDiagnostic;
  }
  return r;
 }
 let result=project(),passes=[{status:result.status,unique:Object.keys(result.unique||{}).length,unknown:result.multiple?.length??null}];
 // Discrete finite proof propagation: only proven exact queries enter the
 // next pass. Stop on no new equations, no new exact facts, or resource cap.
 // No numerical rate iterations or guessed feedback.
 for(let i=0;i<maxPasses&&result.status==='sat'&&result.multiple.length;i++){
  const knownDuties=(g.frozen||[]).filter(f=>Object.hasOwn(result.unique,'duty:'+f.id)).map(f=>({factory:f.id,duty:result.unique['duty:'+f.id],proven:true}));
  const a=proveSharedStockService(g,arith,result.unique,knownDuties,{serviceCaps:treeCapacity.caps,fixedOnly}),b=fixedOnly?{returnPools:[],certificates:[]}:proveWarehouseReturnSurplus(g,arith,result.unique);
  const before=JSON.stringify(p);add('stock','stockPools',a.pools);add('stock','frozenBounds',a.frozenBounds);add('stock-free-exits','warehouseBursts',a.warehouseBursts);
  const abundantItems=new Set(a.inventory.filter(x=>x.permanentlyAbundant).map(x=>x.item));
  if(abundantItems.size){const t=provePriorityRecipeTrees(g,arith,{clock:'fixed-tick',abundantItems});add('proved-stock-tree','machineRates',t.machineRates);add('proved-stock-tree','machineBounds',t.machineBounds);const z=proveSaturatedTransferRegions(g,arith,{abundantItems});add('proved-stock-region','machineRates',z.machineRates);add('proved-stock-region','roundRobin',z.roundRobin);}
  if(!fixedOnly&&(g.frozen||[]).some(f=>Object.values(f.rates).some(v=>arith.cmp(arith.q(v),arith.Z)<0))){add('frozen-exclusive','frozenDuties',proveExclusiveFrozenDuties(g,arith,result.unique).certificates);add('frozen-ring','frozenDuties',proveFedFrozenRings(g,arith,result.unique).certificates);add('frozen-network','frozenDuties',proveExclusiveFrozenNetwork(g,arith,solve,result.unique,opts).certificates);}add('return','returnPools',b.returnPools);add('return','warehouseBursts',b.certificates);
  if(JSON.stringify(p)===before)break;
  const next=project();passes.push({status:next.status,unique:Object.keys(next.unique||{}).length,unknown:next.multiple?.length??null});
  if(next.status!=='sat'){result=next;break;}
  for(const [k,v] of Object.entries(result.unique))assert.equal(next.unique[k],v,'proof facts must be monotone');
  const progressed=Object.keys(next.unique).length>Object.keys(result.unique).length;result=next;if(!progressed)break;
 }
 // Last resort after existing exact aggregate, exclusive and closed-form
 // proofs: independent warehouse components with certified free boundaries.
 if(result.status==='sat'&&result.multiple.length&&!g.unlimited){
  const known=(g.frozen||[]).filter(f=>Object.hasOwn(result.unique,'duty:'+f.id)).map(f=>({factory:f.id,duty:result.unique['duty:'+f.id],proven:true}));
  const x=proveFrozenFiniteComponents(g,arith,{knownDuties:known,knownPhysical:result.unique,depositWords:feed.depositWords,certifyConditionalExits:true});
  if(x.frozenDuties.length||x.warehouseBursts.length||x.machineRates.length||x.routeRates.length){add('frozen-finite-components','frozenDuties',x.frozenDuties);add('warehouse-finite-components','warehouseBursts',x.warehouseBursts);add('warehouse-finite-components','machineRates',x.machineRates);add('warehouse-finite-components','routeRates',x.routeRates);const next=project();passes.push({status:next.status,unique:Object.keys(next.unique||{}).length,unknown:next.multiple?.length??null});if(next.status==='sat')for(const [k,v] of Object.entries(result.unique))assert.equal(next.unique[k],v);result=next;}
 }
 const partial=result.status==='unknown'?equalityProjection(compile(g,arith,p)):null;
 const intervals=Object.fromEntries(Object.keys(compile(g,arith,p).observables).filter(k=>k.startsWith('net:')).map(k=>[k,Object.hasOwn(result.unique||{},k)?{status:'interval',lower:result.unique[k],upper:result.unique[k],unique:true}:projectCountInterval(compile(g,arith,p),arith,k,{ms:1000,maxRows:12000})]));
 return {scope:fixedOnly?'exact-rational-fixed-tick':'research-mixed-clock-contracts',partial,intervals,witnessDiagnostic:witnessDiagnostic&&{status:witnessDiagnostic.status,reason:witnessDiagnostic.reason,stats:witnessDiagnostic.stats},bare:{status:bare.status,unique:Object.keys(bare.unique||{}).length,unknown:bare.multiple?.length??null},passes,sources,result};
}
if(require.main===module){
 const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
 const cases=[['legal-net-branch',()=>{c.layout=JSON.parse(fs.readFileSync(path.join(__dirname,'legal-net-branch.json'),'utf8')).layout;vm.runInContext('state=layout',c)}],...['research/long-run-rates/new-warp.ast1.txt','tests/fixtures/ast1-warp-coil-only.txt','tests/fixtures/ast1-warehouse-port-balance-v1.txt'].map(f=>[f,()=>{c.code=fs.readFileSync(path.join(root,f),'utf8').trim();vm.runInContext('state=ast1Decode(code)',c)}])];
 const report=[];
 for(const [name,load] of cases){
  load();const g=JSON.parse(vm.runInContext('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))',c));const t=performance.now();
  if(g.status!=='compiled'||!g.completePhysicalRoutes){report.push({name,status:'unsupported',n:g.nodes.length,l:g.lines.length,issues:g.issues});continue;}
  try{const file=name.includes('warehouse-port-balance')?'ast1-warehouse-port-balance-v1.direct.result.json':null;const candidate=file?JSON.parse(fs.readFileSync(path.join(__dirname,file),'utf8')).witness:null;const a=combine(g,{ms:12000,maxPasses:3,candidate});const row={name,n:g.nodes.length,l:g.lines.length,ms:Math.round(performance.now()-t),bare:a.bare,passes:a.passes,sources:a.sources,status:a.result.status,intervals:a.intervals,witnessDiagnostic:a.witnessDiagnostic,stats:a.result.stats,partial:a.partial&&{status:a.partial.status,identities:Object.keys(a.partial.identities).length,unresolved:a.partial.unresolved,net:Object.fromEntries(Object.entries(a.partial.identities).filter(([k])=>k.startsWith('net:')))},net:Object.fromEntries(Object.entries(a.result.unique||{}).filter(([k])=>k.startsWith('net:'))),unknown:(a.result.multiple||[]).filter(k=>/^(net:|cycle:)/.test(k))};
  report.push(row);console.log(JSON.stringify(row));}catch(e){const row={name,n:g.nodes.length,l:g.lines.length,status:'error',message:e.message};report.push(row);console.log(JSON.stringify(row));}
 }
 fs.writeFileSync(path.join(__dirname,'combined-count-results.json'),JSON.stringify(report,null,2));
}
module.exports={combine,equalityProjection};
