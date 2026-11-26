'use strict';
// A conservative graph reduction from jointly proved cumulative bounds.
// The original graph is always kept for transient/reachability reasoning.
// No numerical rate iteration, orbit, LP, or assumed steady candidate.
const {compileCountProofProblem}=require('./count_proof_compile');
const {projectCountInterval}=require('./count_interval_projection');
const {planWarehouseDependencies}=require('./warehouse_dependency_plan');
const {proveRealRefillPriority}=require('./real_refill_priority_proof');
function deriveWarehouseModeFacts(g,arith,{certificates={},ms=10000,maxRows=12000}={}){
 if(g.unlimited)return {status:'unsupported',reason:'unlimited counterfactual is not constrained stock'};
 const base=planWarehouseDependencies(g,arith);if(base.status!=='planned')return base;
 const {q,cmp,Z,U}=arith,start=performance.now(),netLower={},dutyBounds={},bounds={},unknown=[],rounds=[];
 const priority=proveRealRefillPriority(g),rateRelations=[...(certificates.rateRelations||[]),...priority.relations];
 const certs=[...(certificates.frozenDuties||[])],fullAdded=new Set(certs.filter(x=>cmp(q(x.duty),U)===0).map(x=>x.factory));
 const targets=[...base.pools.filter(x=>x.consumers.length).map(x=>'net:'+x.item),...base.frozen.filter(f=>f.inputs.length).map(f=>'duty:'+f.factory)];
 let plan=base;
 // Each new full-duty fact follows from independently certified abundance
 // for ALL negative inputs. At most one fact per factory. This is finite
 // symbolic substitution, not approximating a fixed point of rates.
 for(let stage=0;stage<=base.frozen.length;stage++){
  const p=compileCountProofProblem(g,arith,{...certificates,rateRelations,frozenDuties:certs});
  if(p.status!=='compiled')return {status:'unsupported',reason:'no necessary count model'};
  unknown.length=0;
  for(const k of targets){
   const left=ms-(performance.now()-start);
   if(left<=0){unknown.push(k);continue;}
   const x=projectCountInterval(p,arith,k,{ms:Math.max(1,left),maxRows});
   if(x.status==='contradiction')return {status:'contradiction',query:k};
   if(x.status!=='interval'){unknown.push(k);continue;}
   bounds[k]=x;
   if(k.startsWith('net:')&&x.lower!==null&&cmp(q(x.lower),Z)>0)netLower[k.slice(4)]=x.lower;
   if(k.startsWith('duty:'))dutyBounds[k.slice(5)]={lower:x.lower,upper:x.upper};
  }
  plan=planWarehouseDependencies(g,arith,{provedNetLower:netLower});
  if(plan.status!=='planned')return plan;
  const fresh=plan.frozen.filter(f=>f.inputs.length&&f.serviceEventuallyUnconstrained&&!fullAdded.has(f.factory));
  rounds.push({stage,abundant:Object.keys(netLower),fullDutyAdded:fresh.map(f=>f.factory)});
  if(!fresh.length)break;
  for(const f of fresh){
   const x=dutyBounds[f.factory];
   if(x?.upper!=null&&cmp(q(x.upper),U)<0)return {status:'contradiction',query:'duty:'+f.factory};
   fullAdded.add(f.factory);
   certs.push({factory:f.factory,duty:'1',proven:true,method:'all-negative-inputs-proved-permanently-abundant'});
   dutyBounds[f.factory]={lower:'1',upper:'1'};
  }
 }
 const modes=plan.frozen.map(f=>{
  const x=dutyBounds[f.factory],zero=x?.upper!==null&&x?.upper!==undefined&&cmp(q(x.upper),Z)===0;
  const full=f.constantDuty==='1'||f.serviceEventuallyUnconstrained||x?.lower!==null&&x?.lower!==undefined&&cmp(q(x.lower),U)===0;
  if(zero&&full)throw Error('contradictory frozen mode');
  return {factory:f.factory,mode:zero?'zero-average-service':full?'full-average-service':'undetermined-or-partial',permanentlyAbundantInputs:f.nonlimitingInputs,possibleLimitingInputs:f.possibleLimitingInputs,
   preserveProtectionCoupling:!zero&&f.possibleLimitingInputs.length>0};
 });
 // Zero average service removes this actor's direct effect on the
 // density-one step equations, in the exact finite rational service grid.
 // It does NOT remove it from the initial-state/phase selection problem.
 // This second plan is conditional on that grid, not a reduced simulator.
 const inactive=new Set(modes.filter(x=>x.mode==='zero-average-service').map(x=>x.factory));
 const normalPlan=planWarehouseDependencies({...g,frozen:(g.frozen||[]).filter(f=>!inactive.has(f.id))},arith,{provedNetLower:netLower});
 if(normalPlan.status!=='planned')return normalPlan;
 return {status:unknown.length?'partial':'proved-structure',base,plan,normalPlan,netLower,dutyBounds,modes,bounds,unknown,rounds,refillPriority:priority,
  normalScope:'density-one necessary equations only, under exact rational fixed-frame common service lattice; retain original graph for phase/initial-state selection'};
}
module.exports={deriveWarehouseModeFacts};
