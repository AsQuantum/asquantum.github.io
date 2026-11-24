'use strict';
// A rational polyhedral projection of the machine graph. It solves the
// exact feasible *mean-rate* region, not arbitrary queue timing. No objective
// is used to select the physical steady state; maxima are mathematical bounds.
function factorySteadyBuildRateRegion(model,options={}){
 const elimination=factorySteadyAnalyzeEqualities(model);
 const free=elimination.freeVariables,idx=new Map(free.map((v,i)=>[v,i]));
 const expressions=new Map(free.map(v=>[v,new Map([[idx.get(v),STEADY_ONE]])]));
 for(const relation of elimination.pivotRelations){
  const row=new Map();
  for(const t of relation.terms){
   if(!idx.has(t.variable))throw Error('Non-free variable after elimination: '+t.variable);
   const q=steadyRegionQ(t.coefficient);if(q.n)row.set(idx.get(t.variable),q);
  }
  expressions.set(relation.variable,row);
 }
 const inequalities=[];
 function expression(terms){
  const row=new Map();
  for(const [v,coeff] of terms){
   const expr=expressions.get(v);
   if(!expr)throw Error('Unknown rate variable '+v);
   const f=steadyRegionQ(coeff);
   for(const [i,q] of expr){
    const next=steadyExactAdd(row.get(i)||STEADY_ZERO,steadyExactMul(q,f));
    if(next.n)row.set(i,next);else row.delete(i);
   }
  }
  return row;
 }
 function le(label,terms,rhs){
  const a=expression(terms),b=steadyRegionQ(rhs);
  if(b.n<0n)throw Error('Negative RHS unsupported: origin must be feasible: '+label);
  if(a.size)inequalities.push({label,a,b});
 }
 // Free variables are nonnegative by construction. Pivot rates are not.
 for(const v of expressions.keys()){
  if(!idx.has(v))le('nonnegative:'+v,[[v,-1]],0);
 }
 for(const m of model.machineEquations){
  const cap=steadyExactDiv(STEADY_ONE,steadyRegionQ(m.cyclePeriodSeconds));
  le('recipe-capacity:'+m.machine,[[m.cycleVar,1]],cap);
 }
 // Deduplicate identical physical belt/port inequalities.
 const resourceKeys=new Set();
 for(const r of [...(model.sharedLines||[]),...(model.portResources||[])]){
  const terms=[...(r.terms||[])].sort();
  const cap=steadyRegionQ(r.capacityPerSecond);
  const key=JSON.stringify([terms,steadyExactText(cap)]);
  if(resourceKeys.has(key))continue;resourceKeys.add(key);
  le('belt-or-port:'+r.route,terms.map(v=>[v,1]),cap);
 }
 for(const [item,flow] of Object.entries(model.warehouseFlow||{}))
  le('warehouse-nondepletion:'+item,
   [...flow.outflow.map(v=>[v,1]),...flow.inflow.map(v=>[v,-1])],0);
 for(const c of model.queueModels?.quantumConsumers||[]){
  const terms=(model.sharedLines||[]).filter(r=>r.to.id===c.machine).flatMap(r=>r.terms);
  le('consumer-service:'+c.machine,terms.map(v=>[v,1]),
   steadyExactDiv(STEADY_ONE,steadyRegionQ(c.serviceIntervalSeconds)));
 }
 // Optional previously proved zero bounds. Conditional dispatch equalities
 // are explicitly scoped; never manufacture fairness from the graph.
 for(const v of options.forcedZero||[])le('proved-zero:'+v,[[v,1]],0);
 for(const condition of options.assumptions||[]){
  le('assumption:'+condition.label,condition.terms,condition.rhs??0);
  if(condition.equal){
   if(steadyRegionQ(condition.rhs??0).n!==0n)
    throw Error('Nonhomogeneous equality needs a phase-I solver');
   le('assumption-reverse:'+condition.label,condition.terms.map(([v,q])=>
    [v,steadyExactMul(steadyRegionQ(q),steadyRegionQ(-1))]),0);
  }
 }
 // Components of the REDUCED constraint graph: a warehouse inequality or
 // shared local capacity can join physical subgraphs. Truly independent
 // sets of free variables can be solved separately.
 const parent=free.map((_,i)=>i);
 function find(i){if(parent[i]!==i)parent[i]=find(parent[i]);return parent[i];}
 function join(a,b){a=find(a);b=find(b);if(a!==b)parent[b]=a;}
 for(const row of inequalities){
  const ids=[...row.a.keys()];for(let i=1;i<ids.length;i++)join(ids[0],ids[i]);
 }
 const components=new Map();
 for(let i=0;i<free.length;i++){
  const root=find(i);if(!components.has(root))components.set(root,{variables:[],rows:[]});
  components.get(root).variables.push(i);
 }
 for(const row of inequalities){
  const first=row.a.keys().next().value;
  components.get(find(first)).rows.push(row);
 }
 return {method:'rational homogeneous elimination + exact reduced feasible rate region',
  elimination,freeVariables:free,expressions,inequalities,
  components:[...components.values()],assumptionLabels:(options.assumptions||[]).map(x=>x.label),
  actualLongRunRatesSolved:false};
}
// Primal simplex from the feasible origin, using Bland's pivot rule.
// Returns a primal and a dual certificate, both verified with exact fractions.
function steadyRegionMaximizeComponent(component,objective,maxPivots=20000,priority=null){
 const vars=component.variables,rows=component.rows;
 const n=vars.length,m=rows.length,w=n+m,local=new Map(vars.map((v,i)=>[v,i]));
 const matrix=rows.map((r,i)=>{
  const row=Array(w+1).fill(STEADY_ZERO);
  for(const [v,q] of r.a)row[local.get(v)]=q;
  row[n+i]=STEADY_ONE;row[w]=r.b;return row;
 });
 const costs=Array(w).fill(STEADY_ZERO),priorityCosts=Array(w).fill(STEADY_ZERO);
 for(let i=0;i<n;i++){costs[i]=objective.get(vars[i])||STEADY_ZERO;priorityCosts[i]=priority?.get(vars[i])||STEADY_ZERO;}
 const basic=rows.map((_,i)=>n+i);
 let value=STEADY_ZERO,priorityValue=STEADY_ZERO,pivots=0;
 for(;;){
  let enter=-1;
  for(let j=0;j<w;j++)if(priorityCosts[j].n>0n||(priorityCosts[j].n===0n&&costs[j].n>0n)){enter=j;break;}
  if(enter<0)break;
  if(pivots>=maxPivots)return {status:'pivot-limit',pivots};
  let leave=-1,ratio=null;
  for(let i=0;i<m;i++){
   const a=matrix[i][enter];if(a.n<=0n)continue;
   const r=steadyExactDiv(matrix[i][w],a);
   if(leave<0||steadyExactCmp(r,ratio)<0||
    (steadyExactCmp(r,ratio)===0&&basic[i]<basic[leave])){leave=i;ratio=r;}
  }
  if(leave<0)return {status:'unbounded',pivots};
  const pivot=matrix[leave][enter];
  matrix[leave]=matrix[leave].map(q=>q.n?steadyExactDiv(q,pivot):STEADY_ZERO);
  const row=matrix[leave];
  for(let i=0;i<m;i++)if(i!==leave){
   const factor=matrix[i][enter];if(!factor.n)continue;
   for(let j=0;j<=w;j++)if(row[j].n)
    matrix[i][j]=steadyExactSub(matrix[i][j],steadyExactMul(factor,row[j]));
  }
  const f=costs[enter],pf=priorityCosts[enter];
  value=steadyExactAdd(value,steadyExactMul(f,row[w]));
  priorityValue=steadyExactAdd(priorityValue,steadyExactMul(pf,row[w]));
  for(let j=0;j<w;j++)if(row[j].n){costs[j]=steadyExactSub(costs[j],steadyExactMul(f,row[j]));priorityCosts[j]=steadyExactSub(priorityCosts[j],steadyExactMul(pf,row[j]));}
  basic[leave]=enter;pivots++;
 }
 const primal=new Map(vars.map(v=>[v,STEADY_ZERO]));
 for(let i=0;i<m;i++)if(basic[i]<n)primal.set(vars[basic[i]],matrix[i][w]);
 // The final lexicographic basis certifies both priorities. Pick a finite
 // exact multiplier K so K*primary + secondary has nonpositive reduced
 // costs. The resulting dual bound is also a certificate on the primary face.
 let K=STEADY_ZERO;
 if(priority)for(let j=0;j<w;j++){
  if(priorityCosts[j].n>0n)throw Error('Primary is not optimal');
  if(costs[j].n>0n){
   if(priorityCosts[j].n===0n)throw Error('Secondary is not optimal on primary face');
   const ratio=steadyExactDiv(costs[j],steadyExactMul(priorityCosts[j],steadyRegionQ(-1)));
   if(steadyExactCmp(ratio,K)>0)K=ratio;
  }
 }
 const dot=(a,x)=>steadyExactSum([...a].map(([v,q])=>steadyExactMul(q,x.get(v)||STEADY_ZERO)));
 if([...primal.values()].some(q=>q.n<0n))throw Error('Negative primal value');
 for(const row of rows)if(steadyExactCmp(dot(row.a,primal),row.b)>0)
  throw Error('Primal certificate violates '+row.label);
 function verifyDual(costVector,coefficients,optimum){
  const dual=rows.map((_,i)=>steadyExactMul(costVector[n+i],steadyRegionQ(-1)));
  if(dual.some(q=>q.n<0n))throw Error('Negative dual multiplier');
  for(const v of vars){
   const left=steadyExactSum(rows.map((r,i)=>steadyExactMul(dual[i],r.a.get(v)||STEADY_ZERO)));
   if(steadyExactCmp(left,coefficients.get(v)||STEADY_ZERO)<0)
    throw Error('Dual certificate is not an upper bound');
  }
  const bound=steadyExactSum(rows.map((r,i)=>steadyExactMul(r.b,dual[i])));
  if(steadyExactCmp(optimum,bound)!==0||steadyExactCmp(optimum,dot(coefficients,primal))!==0)
   throw Error('Primal/dual objective mismatch');
  return rows.map((r,i)=>({label:r.label,value:dual[i]})).filter(x=>x.value.n);
 }
 if(priority)verifyDual(priorityCosts,priority,priorityValue);
 const combinedCosts=costs.map((q,j)=>steadyExactAdd(q,steadyExactMul(K,priorityCosts[j])));
 const combinedObjective=new Map(vars.map(v=>[v,steadyExactAdd(objective.get(v)||STEADY_ZERO,
  steadyExactMul(K,priority?.get(v)||STEADY_ZERO))]));
 const combinedValue=steadyExactAdd(value,steadyExactMul(K,priorityValue));
 const dual=verifyDual(combinedCosts,combinedObjective,combinedValue);
 return {status:'bounded',value,priorityValue,priorityMultiplier:K,primal,dual,pivots};
}
function factorySteadyRateRegionMaximum(region,terms,options={}){
 const objective=new Map();
 for(const [name,coefficient] of terms){
  const expr=region.expressions.get(name);
  if(!expr)throw Error('Unknown objective rate '+name);
  const c=steadyRegionQ(coefficient);
  for(const [v,q] of expr){
   const next=steadyExactAdd(objective.get(v)||STEADY_ZERO,steadyExactMul(c,q));
   if(next.n)objective.set(v,next);else objective.delete(v);
  }
 }
 let value=STEADY_ZERO,pivots=0;
 const point=new Map(),dual=[];
 for(const component of region.components){
  if(!component.variables.some(v=>objective.has(v)))continue;
  const local=new Map(component.variables.filter(v=>objective.has(v)).map(v=>[v,objective.get(v)]));
  const result=steadyRegionMaximizeComponent(component,local,options.maxPivots??20000);
  pivots+=result.pivots;
  if(result.status!=='bounded')return {status:result.status,pivots,actualLongRunRatesSolved:false};
  value=steadyExactAdd(value,result.value);
  for(const [v,q] of result.primal)point.set(v,q);
  dual.push(...result.dual.map(x=>({constraint:x.label,multiplier:steadyExactText(x.value)})));
 }
 const witness={};
 for(const [name,row] of region.expressions){
  witness[name]=steadyExactText(steadyExactSum([...row].map(([v,q])=>
   steadyExactMul(q,point.get(v)||STEADY_ZERO))));
 }
 return {status:'bounded',upper:steadyExactText(value),pivots,
  mathematicalWitness:witness,dualCertificate:dual,
  assumptions:[...region.assumptionLabels],actualLongRunRatesSolved:false,
  interpretation:'Exact maximum over necessary mean-rate constraints, NOT actual scheduled throughput.'};
}

// An affine work regime can require a nonzero equality (e.g. r=1/2).
// Homogenize all affine inequalities using t in [0,1]. Origin remains
// feasible. Lexicographically maximize (t, requested expression). A t=1
// solution proves feasibility; t<1 proves this entire regime impossible.
function factorySteadyRateRegionRegimeMaximum(region,conditions=[],terms=[],options={}){
 const scale=region.freeVariables.length;
 const coefficients=xs=>{
  const row=new Map();
  for(const [name,c] of xs){
   const expr=region.expressions.get(name);
   if(!expr)throw Error('Unknown rate variable '+name);
   const q=steadyRegionQ(c);
   for(const [i,v] of expr){
    const sum=steadyExactAdd(row.get(i)||STEADY_ZERO,steadyExactMul(q,v));
    if(sum.n)row.set(i,sum);else row.delete(i);
   }
  }
  return row;
 };
 const rows=[];
 function homogenize(label,a,b){
  const out=new Map(a);
  if(b.n)out.set(scale,steadyExactMul(b,steadyRegionQ(-1)));
  if(out.size)rows.push({label,a:out,b:STEADY_ZERO});
 }
 for(const r of region.inequalities)homogenize(r.label,r.a,r.b);
 for(const condition of conditions){
  const a=coefficients(condition.terms||[]),b=steadyRegionQ(condition.rhs??0);
  homogenize('regime:'+condition.label,a,b);
  if(condition.equal)homogenize('regime-reverse:'+condition.label,
   new Map([...a].map(([i,q])=>[i,steadyExactMul(q,steadyRegionQ(-1))])),
   steadyExactMul(b,steadyRegionQ(-1)));
 }
 rows.push({label:'homogeneous-scale',a:new Map([[scale,STEADY_ONE]]),b:STEADY_ONE});
 const objective=coefficients(terms);
 const result=steadyRegionMaximizeComponent(
  {variables:[...region.freeVariables.map((_,i)=>i),scale],rows},objective,
  options.maxPivots??20000,new Map([[scale,STEADY_ONE]]));
 if(result.status!=='bounded')return {status:result.status,pivots:result.pivots};
 if(steadyExactCmp(result.priorityValue,STEADY_ONE)!==0)
  return {status:'infeasible',maxScale:steadyExactText(result.priorityValue),pivots:result.pivots};
 const witness={};
 for(const [name,row] of region.expressions)
  witness[name]=steadyExactText(steadyExactSum([...row].map(([v,q])=>
   steadyExactMul(q,result.primal.get(v)||STEADY_ZERO))));
 return {status:'feasible',upper:steadyExactText(result.value),witness,pivots:result.pivots,
  dualCertificate:result.dual.map(x=>({constraint:x.label,multiplier:steadyExactText(x.value)})),
  scaleMultiplier:steadyExactText(result.priorityMultiplier),
  actualLongRunRatesSolved:false};
}
// Expressions are affine in rate variables: {terms:[[rate,coefficient]], constant}.
function steadyRegimeExpr(x){
 if(typeof x==='string'&&!/^[-+]?\d+(?:\.\d+)?(?:\/\d+)?$/.test(x))
  return {terms:[[x,1]],constant:STEADY_ZERO};
 if(typeof x==='number'||typeof x==='string'||typeof x==='bigint'||(x&&'n' in x))
  return {terms:[],constant:steadyRegionQ(x)};
 return {terms:(x?.terms||[]).map(([v,c])=>[v,steadyRegionQ(c)]),
  constant:steadyRegionQ(x?.constant??0)};
}
function steadyRegimeSum(xs){
 const terms=[];let constant=STEADY_ZERO;
 for(const value of xs){const x=steadyRegimeExpr(value);terms.push(...x.terms);constant=steadyExactAdd(constant,x.constant);}
 return {terms,constant};
}
function steadyRegimeNeg(value){
 const x=steadyRegimeExpr(value),minus=steadyRegionQ(-1);
 return {terms:x.terms.map(([v,c])=>[v,steadyExactMul(steadyRegionQ(c),minus)]),
  constant:steadyExactMul(x.constant,minus)};
}
function steadyRegimeCompare(label,left,right,equal=false){
 const x=steadyRegimeSum([left,steadyRegimeNeg(right)]);
 return {label,terms:x.terms,rhs:steadyExactMul(x.constant,steadyRegionQ(-1)),equal};
}
// Generic min equality, with all competing expressions explicit. This can
// describe recipe bottlenecks, available capacity, or a conditional scheduler.
function factorySteadyMinimumRegime(label,output,alternatives){
 if(!alternatives.length)throw Error('Minimum requires alternatives');
 const bounds=alternatives.map((v,i)=>steadyRegimeCompare(label+':limit:'+i,output,v));
 return {label,choices:alternatives.map((v,i)=>({label:'active-min-'+i,
  constraints:[...bounds,steadyRegimeCompare(label+':active:'+i,output,v,true)]}))};
}
// Conditional ideal fluid RR: r_i=min(cap_i,lambda). The caller must supply
// independently justified sustainable offers/demands, not circularly use
// the already realized rates as their own caps. Work conservation is a
// SEPARATE minimum rule on aggregate service if it is justified.
function factorySteadyWaterfillRegime(label,participants){
 const count=participants.length;
 if(count>12)throw Error('Too many participants for exact regime enumeration');
 if(!count)throw Error('No service participants');
 const choices=[];
 for(let mask=0;mask<2**count;mask++){
  const capped=[],shared=[];
  for(let i=0;i<count;i++)((mask>>i)&1?capped:shared).push(i);
  const reference=shared.length?participants[shared[0]].rate:null;
  const constraints=[];
  for(const i of capped){
   const p=participants[i];
   constraints.push(steadyRegimeCompare(label+':capped:'+i,p.rate,p.cap,true));
   if(reference!==null)constraints.push(steadyRegimeCompare(label+':below-share:'+i,p.cap,reference));
  }
  for(const i of shared){
   const p=participants[i];
   constraints.push(steadyRegimeCompare(label+':share:'+i,p.rate,reference,true));
   constraints.push(steadyRegimeCompare(label+':below-cap:'+i,p.rate,p.cap));
  }
  choices.push({label:'capped-mask-'+mask,constraints});
 }
 return {label,choices};
}
// Conditional strictly ordered continuous withdrawal from a finite supply.
// This is not an unconditional theorem about finite reservation FIFOs.
function factorySteadyPriorityRegimes(label,supply,participants){
 const used=[],rules=[];
 for(let i=0;i<participants.length;i++){
  const p=participants[i],residual=steadyRegimeSum([supply,...used.map(steadyRegimeNeg)]);
  rules.push(factorySteadyMinimumRegime(label+':priority:'+i,p.rate,[p.cap,residual]));
  used.push(p.rate);
 }
 return rules;
}
// Recursively branch, mathematically prune infeasible partial branches, and
// take the union of exact feasible intervals over all compatible regimes.
// Unique rates are certified ONLY for the explicitly chosen mathematical
// rules. Actual physical scheduling still requires those rules to be proved.
function factorySteadySolveRateRegimes(region,rules,queries=[],options={}){
 const maxBranches=options.maxBranches??10000;
 let explored=0,pruned=0,completed=true,feasibleCount=0;
 const regimes=[],ranges=queries.map(q=>({name:q.name,terms:q.terms,min:null,max:null}));
 function visit(i,conditions,choices){
  if(!completed)return;
  if(explored>=maxBranches){completed=false;return;}
  explored++;
  const feasible=factorySteadyRateRegionRegimeMaximum(region,conditions,[],options);
  if(feasible.status==='infeasible'){pruned++;return;}
  if(feasible.status!=='feasible'){completed=false;return;}
  if(i<rules.length){
   for(const choice of rules[i].choices)visit(i+1,[...conditions,...choice.constraints],
    [...choices,{rule:rules[i].label,choice:choice.label}]);
   return;
  }
  feasibleCount++;
  regimes.push({choices,witness:feasible.witness});
  for(const range of ranges){
   const hi=factorySteadyRateRegionRegimeMaximum(region,conditions,range.terms,options);
   const lo=factorySteadyRateRegionRegimeMaximum(region,conditions,range.terms.map(([v,c])=>
    [v,steadyExactMul(steadyRegionQ(c),steadyRegionQ(-1))]),options);
   if(hi.status!=='feasible'||lo.status!=='feasible'){completed=false;return;}
   const min=steadyExactMul(steadyRegionQ(lo.upper),steadyRegionQ(-1)),max=steadyRegionQ(hi.upper);
   if(range.min===null||steadyExactCmp(min,range.min)<0)range.min=min;
   if(range.max===null||steadyExactCmp(max,range.max)>0)range.max=max;
  }
 }
 visit(0,[],[]);
 return {method:'exact affine active-regime branching, rational feasibility and range projection',
  completed,explored,pruned,feasibleRegimeCount:feasibleCount,
  regimes,ranges:ranges.map(r=>({name:r.name,
   minimum:r.min===null?null:steadyExactText(r.min),
   maximum:r.max===null?null:steadyExactText(r.max),
   uniqueWithinConditionalModel:completed&&r.min!==null&&steadyExactCmp(r.min,r.max)===0})),
  conditionalRules:rules.map(r=>r.label),
  actualLongRunRatesSolved:false,
  caveat:'Uniqueness is conditional on the supplied minimum, service and priority rules. FIFO ordering, reservation timing and finite-buffer liveness are not proved by mean-rate algebra.'};
}

// Convert explicit sustainable-service assumptions into generic node rules.
// No AST1 IDs or fixed topology. Missing service assumptions are reported;
// never replace them by independent global maxima or unconditional RR.
function factorySteadyCompileConditionalRegimes(model,service={}){
 const rules=[],unresolved=[];
 const own=(o,k)=>o!=null&&Object.prototype.hasOwnProperty.call(o,k);
 const sumRates=terms=>({terms:terms.map(v=>[v,1]),constant:0});
 const scale=(value,coefficient)=>{
  const e=steadyRegimeExpr(value),c=steadyRegionQ(coefficient);
  return {terms:e.terms.map(([v,q])=>[v,steadyExactMul(steadyRegionQ(q),c)]),
   constant:steadyExactMul(e.constant,c)};
 };
 for(const machine of model.machineEquations){
  const spec=service.recipes?.[machine.machine];
  if(!spec||!own(spec,'outputDemand')||
   machine.inputs.some(i=>!own(spec.inputOffer,i.item))){
   unresolved.push({kind:'timed-recipe',machine:machine.machine,reason:'missing independent sustainable input offers or output demand'});
   continue;
  }
  const alternatives=[
   steadyExactDiv(STEADY_ONE,steadyRegionQ(machine.cyclePeriodSeconds)),
   scale(spec.outputDemand,steadyExactDiv(STEADY_ONE,steadyRegionQ(machine.output.amountPerCycle))),
   ...machine.inputs.map(i=>scale(spec.inputOffer[i.item],
    steadyExactDiv(STEADY_ONE,steadyRegionQ(i.amountPerCycle))))
  ];
  rules.push(factorySteadyMinimumRegime('recipe:'+machine.machine,machine.cycleVar,alternatives));
 }
 for(const junction of model.conditionalFairness||[]){
  const participants=junction.participants.filter(p=>p.terms.length);
  if(!participants.length)continue;
  const spec=service.junctions?.[junction.machine];
  if(!spec||!own(spec,'sharedLimit')||
   participants.some(p=>!own(spec.capByPort,p.physicalPort))){
   unresolved.push({kind:'split-or-merge',machine:junction.machine,
    reason:'missing independently sustainable port caps or shared limit; physical FIFO/RR phase unresolved'});
   continue;
  }
  const entries=participants.map(p=>({rate:sumRates(p.terms),cap:spec.capByPort[p.physicalPort]}));
  rules.push(factorySteadyMinimumRegime('service:'+junction.machine,
   steadyRegimeSum(entries.map(p=>p.rate)),
   [spec.sharedLimit,steadyRegimeSum(entries.map(p=>p.cap))]));
  rules.push(factorySteadyWaterfillRegime('rr:'+junction.machine,entries));
 }
 for(const pool of model.warehousePools||[]){
  const outlets=pool.withdrawalMachineOrder.filter(id=>
   (model.sharedLines||[]).some(r=>r.from.id===id&&r.terms.some(t=>pool.outflowTerms.includes(t))));
  if(!outlets.length)continue;
  const spec=service.warehouses?.[pool.item];
  if(!spec||outlets.some(id=>!own(spec.capByMachine,id))){
   unresolved.push({kind:'warehouse-priority',item:pool.item,reason:'missing independent sustainable withdrawal demands'});
   continue;
  }
  const participants=outlets.map(id=>({
   rate:sumRates((model.sharedLines||[]).filter(r=>r.from.id===id)
    .flatMap(r=>r.terms.filter(t=>pool.outflowTerms.includes(t)))),
   cap:spec.capByMachine[id]
  }));
  rules.push(...factorySteadyPriorityRegimes('warehouse:'+pool.item,
   own(spec,'supply')?spec.supply:sumRates(pool.inflowTerms),participants));
 }
 return {rules,unresolved,completeServiceAssumptions:unresolved.length===0,
  interpretation:'Conditional fluid service rules only. Explicit caps must be established separately; FIFO liveness is not inferred.'};
}
// Unified entry point for offline mathematical analysis of the current layout.
// Uses the same symbolic model in the abstract graph and exact region.
function factorySteadyAnalyzeMachineModel({initialWarehouseItems=null,service=null,queries=[],
 maxBranches=10000,maxPivots=20000}={}){
 const model=factorySteadyBuildEquations();
 const graph=factorySteadyCompileAbstractNetwork(state,model);
 let startup=null,forcedZero=[];
 if(initialWarehouseItems!==null){
  startup=factorySteadyProveRateBounds(model,{startupLayout:state,initialWarehouseItems});
  forcedZero=startup.forcedZero;
 }
 const region=factorySteadyBuildRateRegion(model,{forcedZero});
 const maximums=queries.map(q=>({name:q.name,...factorySteadyRateRegionMaximum(region,q.terms,{maxPivots})}));
 const compilation=service===null?null:factorySteadyCompileConditionalRegimes(model,service);
 const conditional=compilation===null?null:factorySteadySolveRateRegimes(region,compilation.rules,queries,{maxBranches,maxPivots});
 return {graph,model,region,maximums,startup,conditional,serviceCompilation:compilation,
  actualLongRunRatesSolved:false};
}
