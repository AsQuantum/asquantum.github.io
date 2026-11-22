'use strict';
// 理论产出取已连接产线的稳态产能上限，和小球动画的实际库存互不混用。
// 上游未接齐则该配方的理论产能为0；仓库取出独立统计为支出，允许库存起始不为0。
let theoreticalBudget=null;
// Offline, all-numeric steady-state throughput solver for Factory Lab.
// No shadow simulation, no ticks, no inventory evolution.
// Variables: machine cycle rate (/s), per-route-per-material flow (/s).
// Constraints: exact recipe stoichiometry, 1 item/s per physical belt/port,
// conservation at splitter/merger, global warehouse material balance.
function factorySteadySimplex(inequalities, variableCount, objective){
 const m=inequalities.length,n=variableCount,eps=1e-9;
 if(n===0)return {ok:true,x:[],objective:0,pivots:0};
 // Every constraint has b>=0, so x=0 is an initial feasible basic solution.
 // This allows a single-phase revised tableau (no artificial production).
 const D=Array.from({length:m+1},()=>new Float64Array(n+2));
 const basic=new Int32Array(m),nonbasic=new Int32Array(n+1);
 for(let i=0;i<m;i++){
  const row=inequalities[i];
  for(const [k,v] of row.a)D[i][k]=v;
  D[i][n]=-1;D[i][n+1]=row.b;
  if(row.b < -1e-8)return {ok:false,error:'约束的初始可行性不满足'};
  basic[i]=n+i;
 }
 for(let j=0;j<n;j++){D[m][j]=-objective[j];nonbasic[j]=j;}
 nonbasic[n]=-1;
 let pivots=0;const maxPivots=20000;
 const start=performance.now();
 while(pivots<maxPivots){
  // Deterministic Bland tie-break prevents cycling at zero-flow vertices.
  let col=-1,mostNegative=-eps;
  for(let j=0;j<n;j++){
   const v=D[m][j];
   if(v<mostNegative-1e-10||(v<mostNegative+1e-10&&v<-eps&&(col<0||nonbasic[j]<nonbasic[col]))){col=j;mostNegative=v;}
  }
  if(col<0){
   const x=new Float64Array(n);
   for(let i=0;i<m;i++)if(basic[i]<n)x[basic[i]]=Math.max(0,D[i][n+1]);
   return {ok:true,x,objective:D[m][n+1],pivots,elapsedMs:Math.round(performance.now()-start)};
  }
  let row=-1,minRatio=Infinity;
  for(let i=0;i<m;i++){
   const coef=D[i][col];if(coef<=eps)continue;
   const ratio=D[i][n+1]/coef;
   if(ratio<minRatio-1e-9||(Math.abs(ratio-minRatio)<=1e-9&&(row<0||basic[i]<basic[row]))){row=i;minRatio=ratio;}
  }
  if(row<0)return {ok:false,error:'稳态流量目标无界'};
  const pivotRow=D[row],den=pivotRow[col],inv=1/den;
  for(let i=0;i<=m;i++)if(i!==row){
   const dest=D[i],factor=dest[col]*inv;
   if(Math.abs(factor)>1e-12){
    for(let j=0;j<n+2;j++)if(j!==col)dest[j]-=pivotRow[j]*factor;
   }
   dest[col]=-factor;
  }
  for(let j=0;j<n+2;j++)if(j!==col)pivotRow[j]*=inv;
  pivotRow[col]=inv;
  const old=basic[row];basic[row]=nonbasic[col];nonbasic[col]=old;
  pivots++;
 }
 return {ok:false,error:'线性规划迭代上限（'+maxPivots+' 次）',pivots};
}

// Two-phase LP: supports lower bounds/negative RHS when adding non-idling constraints.

function factorySteadyTwoPhase(ineq,n,c){
 const m=ineq.length,eps=1e-8,tab=Array.from({length:m+2},()=>new Float64Array(n+2));
 const B=new Int32Array(m),N=new Int32Array(n+1);
 for(let i=0;i<m;i++){
  for(const [j,v] of ineq[i].a)tab[i][j]+=v;
  tab[i][n]=-1;tab[i][n+1]=ineq[i].b;B[i]=n+i;
 }
 for(let j=0;j<n;j++){N[j]=j;tab[m][j]=-(c[j]||0);}
 N[n]=-1;tab[m+1][n]=1;
 let pivots=0;
 function pivot(r,s){
  const inv=1/tab[r][s];
  for(let i=0;i<m+2;i++){
   if(i===r)continue;
   for(let j=0;j<n+2;j++){
    if(j===s)continue;
    tab[i][j]-=tab[r][j]*tab[i][s]*inv;
   }
  }
  for(let j=0;j<n+2;j++)if(j!==s)tab[r][j]*=inv;
  for(let i=0;i<m+2;i++)if(i!==r)tab[i][s]*=-inv;
  tab[r][s]=inv;
  const v=B[r];B[r]=N[s];N[s]=v;pivots++;
 }
 function simplex(phase){
  const row=phase===1?m+1:m;
  for(let k=0;k<22000;k++){
   let s=-1;
   for(let j=0;j<=n;j++){
    if(phase===2 && N[j]===-1)continue;
    if(s===-1||tab[row][j]<tab[row][s]-eps||(Math.abs(tab[row][j]-tab[row][s])<eps && N[j]<N[s]))s=j;
   }
   if(s<0||tab[row][s]>=-eps)return true;
   let r=-1;
   for(let i=0;i<m;i++){
    if(tab[i][s]<=eps)continue;
    const z=tab[i][n+1]/tab[i][s];
    if(r===-1||z<tab[r][n+1]/tab[r][s]-eps||(Math.abs(z-tab[r][n+1]/tab[r][s])<eps && B[i]<B[r]))r=i;
   }
   if(r<0)return false;
   pivot(r,s);
  }
  return false;
 }
 if(m){
  let r=0;for(let i=1;i<m;i++)if(tab[i][n+1]<tab[r][n+1])r=i;
  if(tab[r][n+1]<-eps){
   pivot(r,n);
   if(!simplex(1)||tab[m+1][n+1]<-eps||Math.abs(tab[m+1][n+1])>eps)return {ok:false,error:'infeasible-phase1',pivots};
   for(let i=0;i<m;i++)if(B[i]===-1){
    let s=0;
    for(let j=1;j<=n;j++)if(tab[i][j]<tab[i][s]-eps||(Math.abs(tab[i][j]-tab[i][s])<eps&&N[j]<N[s]))s=j;
    if(Math.abs(tab[i][s])>eps)pivot(i,s);
    break;
   }
  }
 }
 if(!simplex(2))return {ok:false,error:'unbounded-phase2',pivots};
 const x=new Float64Array(n);
 for(let i=0;i<m;i++)if(B[i]<n && B[i]>=0)x[B[i]]=Math.max(0,tab[i][n+1]);
 return {ok:true,x,objective:tab[m][n+1],pivots};
}

function warehouseTheory(){
 const byId=new Map(state.machines.map(m=>[m.id,m]));
 const validRoutes=state.routes.filter(r=>byId.has(r.from.id)&&byId.has(r.to.id)&&!checkPath(r.path,r.from,r.to,r.id));
 const routesIn=new Map(),routesOut=new Map();
 const machineRecords=new Map();
 for(const m of state.machines)if(getRecipe(m))machineRecords.set(m.id,getRecipe(m));
 for(const r of validRoutes){
  const ki=r.to.id+':'+r.to.port,ko=r.from.id+':'+r.from.port;
  routesIn.set(ki,r);routesOut.set(ko,r);
 }
 const labels=[],cycleVar=new Map(),routeVar=new Map(),routeItems=new Map();
 for(const [id] of machineRecords){cycleVar.set(id,labels.length);labels.push({type:'cycle',id});}
 for(const r of validRoutes){
  const src=byId.get(r.from.id),dst=byId.get(r.to.id),srcPort=outPort(src,r.from.port);
  const poss=[...streamMaterials(r)].filter(item=>{
   if(!item||!acceptsMaterial(dst,item,r.to.port))return false;
   if(src.type==='分流'&&srcPort?.filter&&srcPort.filter!=='任意'&&srcPort.filter!==item)return false;
   if(getRecipe(src)&&getRecipe(src).output!==item)return false;
   return true;
  });
  routeItems.set(r.id,poss);
  for(const item of poss){
   const key=r.id+'|'+item;routeVar.set(key,labels.length);labels.push({type:'route',id:r.id,item});
  }
 }
 let n=labels.length;const rows=[];
 function add(entries,b=0){
  const arr=[...entries].filter(([,v])=>Math.abs(v)>1e-12);
  if(arr.length)rows.push({a:arr,b});
 }
 function equality(entries){add(entries);add(entries.map(([i,v])=>[i,-v]));}
 function rates(routes,item){const a=new Map();for(const r of routes){const j=routeVar.get(r.id+'|'+item);if(j!==undefined)a.set(j,(a.get(j)||0)+1);}return a;}
 const machineInputs=new Map(),machineOutputs=new Map();
 for(const m of state.machines){machineInputs.set(m.id,[]);machineOutputs.set(m.id,[]);}
 for(const r of validRoutes){machineInputs.get(r.to.id).push(r);machineOutputs.get(r.from.id).push(r);}
 for(const m of state.machines){
  const ins=machineInputs.get(m.id),outs=machineOutputs.get(m.id),rec=machineRecords.get(m.id);
  if(rec){
   const v=cycleVar.get(m.id);
   add([[v,1]],1/rec.seconds);
   // Every produced item must have a real connected output route (no infinite output buffer).
   const prod=[...rates(outs,rec.output)];prod.push([v,-rec.qty]);equality(prod);
   for(const [item,quantity] of Object.entries(rec.inputs||{})){
    const a=[...rates(ins,item)];a.push([v,-quantity]);equality(a);
   }
  }else if(m.type==='分流'||m.type==='汇流'){
   const mats=new Set([...ins,...outs].flatMap(r=>routeItems.get(r.id)||[]));
   for(const item of mats){
    const totals=new Map(rates(ins,item));
    for(const [j,c] of rates(outs,item))totals.set(j,(totals.get(j)||0)-c);
    equality([...totals]);
   }
  }
  // Each physical input/output port has its own TOTAL bandwidth cap 1 item/s.
  for(const which of [ins,outs]){
   const portKey=which===ins?'to':'from',group=new Map();
   for(const r of which){const p=r[portKey].port,items=group.get(p)||[];
    for(const mat of routeItems.get(r.id)||[]){const j=routeVar.get(r.id+'|'+mat);items.push([j,1]);}
    group.set(p,items);
   }
   for(const entries of group.values())add(entries,1);
  }
 }
 for(const r of validRoutes){
  const entries=(routeItems.get(r.id)||[]).map(item=>[routeVar.get(r.id+'|'+item),1]);
  add(entries,1);
 }
   // Round-robin: each eligible unblocked outlet receives a turn.
  // In particular, if a splitter has a branch that is PROVABLY able to drain
  // into the warehouse without output contention, that branch cannot
  // receive less than any other eligible outlet of the same material.
  // This is a necessary fairness bound, not a full min(cap_i,level) solver.
  // Never give the warehouse a higher objective weight or force unconditional
  // equal splitting: blocked/limited branches are supposed to be skipped.
  const routeUpperCache=new Map();
  function upstreamRateUpper(route,visiting=new Set()){
   if(routeUpperCache.has(route.id))return routeUpperCache.get(route.id);
   if(visiting.has(route.id))return 1; // cycle: do not claim safe capacity
   const next=new Set(visiting);next.add(route.id);
   const source=byId.get(route.from.id);
   let bound=1;
   const producer=source&&machineRecords.get(source.id);
   if(producer)bound=Math.min(1,producer.qty/producer.seconds);
   else if(source&&['分流','汇流'].includes(source.type)){
    const inbound=machineInputs.get(source.id)||[];
    bound=Math.min(1,inbound.reduce((sum,r)=>sum+upstreamRateUpper(r,next),0));
   }
   routeUpperCache.set(route.id,bound);
   return bound;
  }
  function guaranteedWarehouseDrain(route,item,seen=new Set()){
   if(seen.has(route.id))return false;
   const dest=byId.get(route.to.id);
   if(!dest)return false;
   if(dest.type==='仓入')return acceptsMaterial(dest,item,route.to.port);
   if(dest.type!=='汇流')return false;
   const incoming=machineInputs.get(dest.id)||[];
   // Total worst-case input must fit the merger output (1 item/s).
   // Otherwise competing materials may fill its buffer and block this path.
   const upper=incoming.reduce((sum,r)=>sum+upstreamRateUpper(r),0);
   if(upper>1-1e-7)return false;
   const downstream=machineOutputs.get(dest.id)||[];
   if(downstream.length!==1||!routeVar.has(downstream[0].id+'|'+item))return false;
   const next=new Set(seen);next.add(route.id);
   return guaranteedWarehouseDrain(downstream[0],item,next);
  }
  let fairSplitConstraints=0;
  for(const splitter of state.machines)if(splitter.type==='分流'){
   const outbound=machineOutputs.get(splitter.id)||[];
   const items=new Set(outbound.flatMap(r=>routeItems.get(r.id)||[]));
   for(const item of items){
    const eligible=outbound.filter(r=>routeVar.has(r.id+'|'+item));
    if(eligible.length<2)continue;
    const drains=eligible.filter(r=>guaranteedWarehouseDrain(r,item));
    if(!drains.length)continue;
    // An always-available outlet gets at least as many successful sends
    // as a blocked one. Two always-available outlets get equal turns.
    for(const drain of drains)for(const rival of eligible){
     if(drain.id===rival.id)continue;
     add([[routeVar.get(rival.id+'|'+item),1],[routeVar.get(drain.id+'|'+item),-1]],0);
     fairSplitConstraints++;
    }
   }
  }
const materials=new Set([...routeVar.keys()].map(k=>labels[routeVar.get(k)].item));
 for(const mat of materials){
  const entries=new Map();
  for(const r of validRoutes){
   const idx=routeVar.get(r.id+'|'+mat);if(idx===undefined)continue;
   if(byId.get(r.from.id).type==='仓出')entries.set(idx,(entries.get(idx)||0)+1);
   if(byId.get(r.to.id).type==='仓入')entries.set(idx,(entries.get(idx)||0)-1);
  }
  // Cold-start sustainable throughput: inventory withdraw <= real deposit for each material.
  add([...entries],0);
 }
  // No product-specific ranking: all manufacturing output is valued equally per item.
   // Fair service is measured in actual items/second, not arbitrary recipe
  // importance ranks. This keeps the whole factory in one numerical solve.
  // Each absolute branch-rate difference is represented by a nonnegative
  // auxiliary LP variable; its penalty is expressed in items/second.
  // The relaxation improves steady throughput estimates but does NOT
  // exactly reproduce finite buffers and discrete round-robin scheduling.
  const fairnessDevs=[];
  for(const splitter of state.machines)if(splitter.type==='分流'){
   const outs=machineOutputs.get(splitter.id)||[];
   const materials=new Set(outs.flatMap(r=>routeItems.get(r.id)||[]));
   for(const item of materials){
    const eligible=outs.map(r=>routeVar.get(r.id+'|'+item)).filter(j=>j!==undefined);
    for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
     const dev=n++;fairnessDevs.push(dev);
     add([[eligible[i],1],[eligible[j],-1],[dev,-1]],0);
     add([[eligible[j],1],[eligible[i],-1],[dev,-1]],0);
    }
   }
  }
  // One unit of an excess two-way branch flow represents half of the
  // absolute branch-rate gap. Both terms are now measured in items/second.
  const FAIRNESS_TRANSFER_COST=0.5;

  const objective=new Float64Array(n);
 for(const [id,rec] of machineRecords)objective[cycleVar.get(id)]=rec.qty;
  for(const j of fairnessDevs)objective[j]=-FAIRNESS_TRANSFER_COST;
 // Warehouse net surplus is secondary to genuinely producing items.
 // A tiny weight favors reusing excess supply rather than wasting it upstream.
 for(const r of validRoutes){
  const src=byId.get(r.from.id),dst=byId.get(r.to.id);
  for(const item of routeItems.get(r.id)||[]){
   const j=routeVar.get(r.id+'|'+item);
   if(dst.type==='仓入')objective[j]+=0.0002;
   if(src.type==='仓出')objective[j]-=0.0002;
  }
 }
   // Stage 1: current all-commodity flow solution with splitter service balancing.
  // Stage 2: an exact Pareto non-idling LP improvement. No machine may slow
  // down compared with Stage 1; unused warehouse resources must be used
  // wherever they can increase ANY useful manufacturing throughput.
  // This is an algebraic LP, never a simulation or time-average.
  let result=factorySteadySimplex(rows,n,objective);
  let paretoAdditionalProductsPerMinute=0,paretoRefinementStatus='skipped';
  if(result.ok && cycleVar.size){
   const baseline=result,refineRows=rows.slice(),tol=1e-8;
   for(const j of cycleVar.values())if(baseline.x[j]>tol)
    refineRows.push({a:[[j,-1]],b:-baseline.x[j]+tol});
   const workObjective=new Float64Array(n);
   for(const [id,rec] of machineRecords)workObjective[cycleVar.get(id)]=rec.qty;
   const better=factorySteadyTwoPhase(refineRows,n,workObjective);
   if(better.ok && [...cycleVar.values()].every(j=>better.x[j]+2e-6>=baseline.x[j])){
    for(const [id,rec] of machineRecords){
     const j=cycleVar.get(id);
     paretoAdditionalProductsPerMinute+=60*Math.max(0,(better.x[j]-baseline.x[j])*rec.qty);
    }
    result=better;paretoRefinementStatus='optimal';
   }else paretoRefinementStatus=better.error||'numerical-inconsistency';
  }
 if(!result.ok)return {inflow:{},outflow:{},machineCycles:{},routeFlows:{},warnings:[result.error],error:result.error,diagnostics:{variables:n,constraints:rows.length,pivots:result.pivots||0}};
 const eps=1e-7,x=result.x,inflow={},outflow={},machineCycles={},routeFlows={},machineNeeds={},machineFeeds=new Map();
 const credit=(obj,item,v)=>{if(v>eps)obj[item]=(obj[item]||0)+v;};
 for(const [id,j] of cycleVar)machineCycles[id]=x[j]||0;
  const machineDuty={},machineIdle={};
  for(const [id,rec] of machineRecords){
   const duty=Math.max(0,Math.min(1,(machineCycles[id]||0)*rec.seconds));
   machineDuty[id]=duty;machineIdle[id]=1-duty;
  }
 for(const r of validRoutes){
  const src=byId.get(r.from.id),dst=byId.get(r.to.id),flows={};
  for(const item of routeItems.get(r.id)||[]){
   const j=routeVar.get(r.id+'|'+item),v=x[j];if(!(v>eps))continue;
   flows[item]=v;
   if(src.type==='仓出')credit(outflow,item,v);
   if(dst.type==='仓入')credit(inflow,item,v);
   if(machineRecords.has(dst.id)){
    const feed=machineFeeds.get(dst.id)||{};credit(feed,item,v);machineFeeds.set(dst.id,feed);
   }
  }
  routeFlows[r.id]=flows;
 }
 for(const [id,rec] of machineRecords){
  const need={};for(const [item,qty] of Object.entries(rec.inputs||{}))need[item]=qty*machineCycles[id];
  machineNeeds[id]=need;
 }
 const warnings=[];
 for(const [id,rec] of machineRecords){
  for(const item of Object.keys(rec.inputs||{})){
   const connected=(machineInputs.get(id)||[]).some(r=>(routeItems.get(r.id)||[]).includes(item));
   if(!connected)warnings.push(id+' 缺少有效上游：'+item);
  }
 }
 return {inflow,outflow,machineCycles,machineDuty,machineIdle,machineNeeds,machineFeeds:Object.fromEntries(machineFeeds),routeFlows,warnings,
  diagnostics:{variables:n,constraints:rows.length,paretoRefinementStatus,paretoAdditionalProductsPerMinute,solverStages:2,fairSplitConstraints,fairnessVariables:fairnessDevs.length,splitterImbalancePerMinute:fairnessDevs.reduce((sum,j)=>sum+(x[j]||0),0)*60,approximate:true,pivots:result.pivots,elapsedMs:result.elapsedMs,objective:result.objective,method:'多物品联立线性规划 + Pareto 非空转优化（纯数字近似）'}};
}

function portSteadyRate(m,port){
 const r=routeFor(m.id,port.kind==='in'?'in':'out',port.index);
 if(!r)return 0;
 return Object.values(theoreticalBudget?.routeFlows?.[r.id]||{}).reduce((sum,x)=>sum+x,0)*60;
}
// The LP stores per-route, per-item rates in items/s; show items/min in the inspector.
function steadyPortFlowDetails(m,p,theory){
 const route=routeFor(m.id,p.kind==='in'?'in':'out',p.index);
 const valid=!!route&&!checkPath(route.path,route.from,route.to,route.id);
 const flows=valid?(theory.routeFlows?.[route.id]||{}):{};
 const materials=new Set(Object.keys(flows)),rec=getRecipe(m);
 if(rec){
  if(p.kind==='in')for(const item of Object.keys(rec.inputs||{}))materials.add(item);
  else if(rec.output)materials.add(rec.output);
 }
 if(m.type==='\u4ed3\u51fa'&&p.kind==='out'&&m.item)materials.add(m.item);
 if(m.type==='\u4ed3\u5165'&&p.kind==='in'&&m.inletItem)materials.add(m.inletItem);
 if(m.type==='\u5206\u6d41'&&p.kind==='out'&&p.filter&&p.filter!=='\u4efb\u610f')materials.add(p.filter);
 if(valid)for(const item of streamMaterials(route)){
  if(p.kind==='in'){
   if(acceptsMaterial(m,item,p.index))materials.add(item);
  }else{
   const target=machineById(route.to.id);
   if(target&&acceptsMaterial(target,item,route.to.port))materials.add(item);
  }
 }
 return {port:p,route,valid,flows,materials};
}
function steadyFlowTotal(flows){return Object.values(flows).reduce((total,n)=>total+n,0);}
function steadyFlowMaterialRows(flows,materials){
 const all=new Set([...materials,...Object.keys(flows)]);
 const ordered=[...all].filter(Boolean).sort((a,b)=>{
  const ai=MATERIALS.indexOf(a),bi=MATERIALS.indexOf(b);
  return (ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b,'zh-CN');
 });
 if(!ordered.length)return '<div class="tiny" style="padding:4px 0">\u65e0\u7269\u54c1\u6d41\uff080.00 \u4ef6/\u5206\uff09</div>';
 return ordered.map(item=>{
  const perMinute=Math.max(0,flows[item]||0)*60;
  return `<div class="kv" style="margin:3px 0"><span style="min-width:0;overflow-wrap:anywhere"><span style="color:${materialColor(item)}">●</span> ${esc(item)}</span><b style="white-space:nowrap;font-variant-numeric:tabular-nums">${perMinute.toFixed(2)}</b></div>`;
 }).join('');
}
function steadyFlowPortLabel(m,p){
 if(m.type==='\u5206\u6d41'&&p.kind==='out')
  return '\u8f93\u51fa \u00b7 '+ast1FilterPortLabel(m,p.index)+' ('+p.side+')';
 return (p.kind==='in'?'\u8f93\u5165':'\u8f93\u51fa')+' '+(p.index+1)+' ('+p.side+')';
}
function machineSteadyPanel(m){
 const theory=theoreticalBudget;
 if(!theory||theory.error)return `<div class="item"><strong>\u7a33\u6001\u7406\u8bba \u00b7 \u7eaf\u6570\u5b57</strong><div class="tiny">${esc(theory?.error||'\u5c1a\u672a\u8ba1\u7b97')}</div></div>`;
 const ports=getPorts(m),junction=m.type==='\u5206\u6d41'||m.type==='\u6c47\u6d41';
 const details=ports.map(p=>steadyPortFlowDetails(m,p,theory));
 const rate=v=>(Math.max(0,v)*60).toFixed(2);
   const recipe=getRecipe(m);
  const duty=recipe?Math.max(0,Math.min(1,theory.machineDuty?.[m.id]??(theory.machineCycles?.[m.id]||0)*recipe.seconds)):null;
  const dutyInfo=recipe?`<div class="kv" style="margin-top:6px"><strong>理论运行占空比</strong><b>${(duty*100).toFixed(2)}%</b></div>
   <div class="kv"><span>等效停机比例（缺料/堵塞）</span><b>${((1-duty)*100).toFixed(2)}%</b></div>`:'';
const dirs=[['in','\u8f93\u5165','#65b3fc'],['out','\u8f93\u51fa','#ffb477']];
 let content='';
 for(const [kind,heading,color] of dirs){
  const subset=details.filter(d=>d.port.kind===kind);
  const amounts={},known=new Set();
  for(const d of subset){
   for(const [item,n] of Object.entries(d.flows))amounts[item]=(amounts[item]||0)+n;
   for(const item of d.materials)known.add(item);
  }
  const sum=rate(steadyFlowTotal(amounts));
  content+=`<div class="divider"></div><div class="kv"><strong style="color:${color}">${heading}${junction?'\u63a5\u53e3':'\u603b\u8ba1'}</strong><b style="white-space:nowrap">${sum} \u4ef6/\u5206</b></div>`;
  if(!subset.length){
   content+=`<div class="tiny">\u65e0${heading}\u63a5\u53e3</div>`;
   continue;
  }
  if(!junction){
   content+=steadyFlowMaterialRows(amounts,known);
   if(subset.length>1)content+=`<div class="tiny">${subset.length} \u4e2a${heading}\u63a5\u53e3\u5408\u8ba1</div>`;
   continue;
  }
  for(const d of subset){
   const p=d.port,portName=steadyFlowPortLabel(m,p);
   const stateText=d.valid?'\u5df2\u8fde\u7ebf':d.route?'\u7ebf\u8def\u65e0\u6548':'\u672a\u63a5\u7ebf';
   const rateText=rate(steadyFlowTotal(d.flows));
   const selectedFilter=p.kind==='out'&&m.type==='\u5206\u6d41'&&p.filter&&p.filter!=='\u4efb\u610f'
    ?'\u8fc7\u6ee4: '+esc(p.filter):'';
   content+=`<div style="border-left:2px solid ${color};padding:3px 0 5px 9px;margin:8px 0 6px">
    <div class="kv" style="align-items:center;margin:2px 0"><b style="color:${color}">${esc(portName)}</b><b style="white-space:nowrap">${rateText} \u4ef6/\u5206</b></div>
    <div class="tiny">${stateText}${selectedFilter?' \u00b7 '+selectedFilter:''}</div>
    ${steadyFlowMaterialRows(d.flows,d.materials)}
   </div>`;
  }
 }
 return `<div class="item"><strong>\u7a33\u6001\u7406\u8bba \u00b7 \u7eaf\u6570\u5b57</strong>
  <div class="tiny">\u901f\u7387\u5355\u4f4d\uff1a\u4ef6/\u5206\uff1b\u53ea\u7edf\u8ba1\u6709\u6548\u7ebf\u8def\u7684\u7406\u8bba\u7269\u6599\u6d41</div>
     ${dutyInfo}
${content}
  <div class="tiny" style="margin-top:8px">\u6b64\u5904\u663e\u793a\u5f53\u524d\u7ebf\u6027\u89c4\u5212\u89e3\u7684\u6d41\u901f\uff0c\u4e0d\u662f\u673a\u5668\u7684\u4e0a\u9650\u4ea7\u80fd\uff1b\u81ea\u52a8\u5206\u6d41\u5668\u7684\u52a8\u6001\u5835\u585e\u5206\u6d41\u4e0e\u9010\u4ef6\u6a21\u62df\u4ecd\u53ef\u80fd\u4e0d\u540c\u3002</div>
 </div>`;
}
