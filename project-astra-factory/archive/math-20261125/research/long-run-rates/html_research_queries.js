'use strict';
// Research-only adapter for the existing HTML contract. Only the fixed
// rational scheduler's proofs may populate actual or overdraft values.
// The demand column retains the existing conditional D/latent semantics;
// a demand envelope proves independence, not a new physical meaning.
const {arith}=require('./run_direct');
const {combine}=require('./combine_count_proofs');
const {compileExactRateProblem}=require('./compile_exact');
const {solveDirectRateProblem}=require('./direct_algebra');
const {compileCountProofProblem}=require('./count_proof_compile');
const {solveFactoredCounts}=require('./count_factored_projection');
const {proveExactEventOrbit}=require('./exact_event_orbit');
function sameLayout(a,b){
 if(!a||!b)return false;
 function signature(g){
  const sort=(xs)=>xs.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return JSON.stringify({
   nodes:sort(g.nodes).map(m=>[m.id,m.type,m.item,m.recipe,m.face,m.physicalInCount,m.physicalOutCount,m.inputPriority]),
   lines:sort(g.lines).map(e=>[e.id,e.from,e.to,e.fromPort,e.toPort,e.length,e.outFilter]),
   frozen:(g.frozen||[]).map(f=>[f.id,f.rates]),
   pools:(g.pools||[]).slice().sort((a,b)=>String(a.item).localeCompare(String(b.item))).map(p=>[p.item,p.order])
  });
 }
 return signature(a)===signature(b);
}
// The physical specification is produced by factoryCompileHtmlResearchBundle
// from the same raw layout, not by guessing port order or alphabets from rates.
function specMatches(g,spec){
 if(!spec||spec.initial!=='empty'||!!spec.unlimitedWarehouse!==!!g.unlimited||spec.machines.length!==g.nodes.length||spec.routes.length!==g.lines.length)return false;
 const ns=new Map(spec.machines.map(m=>[m.id,m])),es=new Map(spec.routes.map(e=>[e.id,e]));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(ns.size!==g.nodes.length||es.size!==g.lines.length)return false;
 for(const m of g.nodes){
  const x=ns.get(m.id);
  if(!x||x.type!==m.type||x.item!==m.item||!equal(x.recipe,m.recipe)||!equal(x.inputPriority,m.inputPriority))return false;
 }
 for(const e of g.lines){
  const x=es.get(e.id),p=ns.get(e.from)?.outPorts.find(p=>p.index===e.fromPort);
  if(!x||x.from!==e.from||x.to!==e.to||x.fromPort!==e.fromPort||x.toPort!==e.toPort||x.length!==e.length||(p?.filter||'')!==(e.outFilter||''))return false;
  if(e.materials.some(k=>x.accepted.includes(k)!==(e.acceptedMaterials||e.materials).includes(k)))return false;
 }
 if(!equal((spec.frozen||[]).map(f=>[f.id,f.rates]),(g.frozen||[]).map(f=>[f.id,f.rates])))return false;
 for(const p of g.pools||[]){
  const ids=spec.priority.filter(id=>ns.get(id)?.item===p.item&&spec.routes.some(r=>r.from===id));
  if(!equal(ids,p.order.filter(id=>spec.routes.some(r=>r.from===id))))return false;
 }
 return true;
}
function solveActual(g,options){
 const useOrbit=specMatches(g,g.physicalSpec),prior=combine(g,useOrbit?{...options,ms:Math.min(options.ms,600),maxPasses:Math.min(options.maxPasses,2)}:options);
 if(!useOrbit||prior.result.status==='unsat'||prior.result.status==='sat'&&!prior.result.multiple.length)return prior;
 let proof=null;
 for(const stockFactor of [8,32,128]){
  proof=proveExactEventOrbit(g.physicalSpec,arith,{ms:options.ms,stockFactor});
  if(proof.reason!=='clipping followed by low stock')break;
 }
 if(proof.status!=='proved')return {...prior,orbit:{status:proof.status,reason:proof.reason,clock:proof.clock,events:proof.events}};
 const lineMap=new Map(g.lines.map(e=>[e.id,e]));
 const routeRates=proof.routeRates.filter(r=>lineMap.get(r.route)?.materials.includes(r.item));
 const problem=compileCountProofProblem(g,arith,{htmlQueries:true,machineRates:proof.machineRates,routeRates,frozenDuties:proof.frozenDuties});
 const result=solveFactoredCounts(problem,arith,{ms:options.ms});
 const orbit={status:proof.status,method:proof.method,prefixTicks:proof.prefixTicks,periodTicks:proof.periodTicks,periodSeconds:proof.periodSeconds,events:proof.events,elapsedMs:proof.elapsedMs,clipped:proof.clipped,stockCaps:proof.stockCaps};
 if(result.status!=='sat')return {...prior,orbit:{...orbit,status:'rejected-by-count-equations',result:result.status}};
 if(prior.result.status==='sat')for(const [k,v] of Object.entries(prior.result.unique))if(result.unique[k]!==v)return {...prior,result:{status:'unknown',unique:{},multiple:Object.keys(problem.observables)},orbit:{...orbit,status:'proof-conflict',query:k,direct:v,orbit:result.unique[k]}};
 return {...prior,result,sources:{...prior.sources,'exact-event-recurrent-state':routeRates.length+proof.machineRates.length+proof.frozenDuties.length},orbit};
}
function solveHtmlResearchQueries(g,{unlimitedGraph,demandGraph,ms=10000,maxPasses=4}={}){
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return {status:'unsupported',reason:'requires constrained count graph'};
 const {q,div,sub,add,txt,Z,U,cmp}=arith;
 const options={ms,maxPasses,htmlQueries:true,fixedOnly:true},actual=solveActual(g,options);
 const keys=Object.keys(compileCountProofProblem(g,arith,{htmlQueries:true}).observables),values=Object.fromEntries(keys.map(k=>[k,actual.result.status==='sat'?actual.result.unique[k]??null:null]));
 const hasWarehouseEffects=g.nodes.some(m=>m.type==='仓出'&&g.lines.some(e=>e.from===m.id))||(g.frozen||[]).some(f=>Object.values(f.rates).some(v=>cmp(q(v),Z)<0));
 let unlimited=null,over={};
 if(!hasWarehouseEffects){over=values;}
 else if(unlimitedGraph?.unlimited&&unlimitedGraph.status==='compiled'&&unlimitedGraph.completePhysicalRoutes&&sameLayout(g,unlimitedGraph)){
  unlimited=solveActual(unlimitedGraph,options);
  if(unlimited.result.status==='sat')over=unlimited.result.unique;
 }
 const items=keys.filter(k=>k.startsWith('net:')).map(k=>k.slice(4));
 let demandResult=null,demand={},demandScope='unproved';
 if(!hasWarehouseEffects){
  demand=Object.fromEntries([...items.map(k=>['withdrawalDemand:'+k,'0']),['total:withdrawalDemand','0']]);
  demandResult={status:'sat'};demandScope='no-withdrawals';
 }else if(demandGraph?.status==='compiled'&&demandGraph.completePhysicalRoutes&&!demandGraph.unlimited&&sameLayout(g,demandGraph)){
  const facts=Object.fromEntries(Object.entries(values).filter(([k,v])=>v!==null&&/^(flow:|routeTotal:|duty:)/.test(k)));
  // Preserve the existing conditional D/latent equations. Restore their
  // warehouse offer boundary using proven actual flow/duty facts, but
  // NEVER restore the physically unproved X=min(S,D) assumption.
  const dp=compileExactRateProblem(demandGraph,{demandEnvelope:true,demandFacts:facts});
  demandResult=solveDirectRateProblem(dp,arith,{ms});
  if(demandResult.status==='sat'){demand=demandResult.unique;demandScope='actual-boundary-conditional-demand';}
  // A demand invariant on the broader, unanchored envelope is still
  // usable if the more informative conditional calculation is unresolved.
  if(demandResult.status!=='sat'){
   const fallback=solveDirectRateProblem(compileExactRateProblem(demandGraph,{demandEnvelope:true}),arith,{ms});
   if(fallback.status==='sat'){demandResult=fallback;demand=fallback.unique;demandScope='structural-demand-envelope';}
  }
 }
 const read=(v,k)=>v[k]??null,minus=(a,b)=>a===null||b===null?null:txt(sub(q(a),q(b)));
 const rows={},totalDemand=read(demand,'total:withdrawalDemand');
 for(const k of items){
  const income=read(values,'inflow:'+k),d=read(demand,'withdrawalDemand:'+k);
  rows[k]={inflow:income,outflow:read(values,'outflow:'+k),net:read(values,'net:'+k),potential:minus(income,d),overdraft:read(over,'net:'+k),withdrawalDemand:d,localNet:read(values,'localNet:'+k)};
 }
 const total={inflow:read(values,'total:inflow'),outflow:read(values,'total:outflow'),net:read(values,'total:net'),potential:minus(read(values,'total:inflow'),totalDemand),overdraft:read(over,'total:net'),withdrawalDemand:totalDemand};
 const machineTimes={};
 for(const m of g.nodes){
  const rate=m.recipe?read(values,'cycle:'+m.id):m.type==='仓出'?read(values,'machineTotal:'+m.id+'|out'):null;
  if(m.recipe||m.type==='仓出')machineTimes[m.id]=rate===null?null:cmp(q(rate),Z)===0?'Infinity':txt(div(U,q(rate)));
 }
 const unknown=keys.filter(k=>values[k]===null),unknownMetrics=[];
 for(const [k,row] of Object.entries(rows))for(const name of ['inflow','outflow','net','potential','overdraft'])if(row[name]===null)unknownMetrics.push(name+':'+k);
 for(const name of ['inflow','outflow','net','potential','overdraft'])if(total[name]===null)unknownMetrics.push('total:'+name);
 return {status:!unknown.length&&!unknownMetrics.length?'proved-for-contract':'partial',scope:'exact-rational-fixed-tick-counts + existing-demand-envelope',demandScope,orbit:actual.orbit??null,unlimitedOrbit:unlimited?.orbit??null,actual:actual.result.status,unlimited:unlimited?.result.status??(!hasWarehouseEffects?actual.result.status:'unsupported'),demand:demandResult?.status??'unsupported',values,rows,total,machineTimes,unknown,unknownMetrics,proofSources:actual.sources,actualLongRunRatesSolved:unknown.length===0,completeHtmlQueries:unknown.length===0&&unknownMetrics.length===0};
}
module.exports={solveHtmlResearchQueries,sameLayout,specMatches,solveActual};
