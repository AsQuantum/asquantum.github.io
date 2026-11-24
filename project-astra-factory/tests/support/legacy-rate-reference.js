'use strict';
// Historical restricted solver and diagnostic renderers, for offline independent regression only. Never load from index.html.
function legacyReferenceWarehouseTheory(targetItem=null){
 const recipeCertified=typeof steadyExactTryIndependentRecipeStar==='function'?steadyExactTryIndependentRecipeStar():null;
 if(recipeCertified)return recipeCertified;
 const mergedCertified=typeof steadyExactTryMergeForest==='function'?steadyExactTryMergeForest():null;
 if(mergedCertified)return mergedCertified;
 const machineCycles={},machineDuty={},machineIdle={},machineNeeds={},machineFeeds={},routeFlows={};
 const inflow={},outflow={},warnings=[];
 const mixedRoutes=[];
 function unsupported(why,m=null){return {inflow:{},outflow:{},machineCycles:{},machineDuty:{},machineIdle:{},
  machineNeeds:{},machineFeeds:{},routeFlows:{},warnings:[why],
  status:'modelled-unresolved',notice:'全网数学方程已建立，精确产率仍需联立实际分流和反压工作区间；未知速率不显示为零。',
  diagnostics:{blockingMachine:m?{id:m.id,name:machineRef(m),type:m.type,recipe:getRecipe(m)?.inputs||null}:null,method:'有理数守恒 + 物理容量 + 库存非负 + 条件性调度区间',exact:false,certified:false,modelled:true,rateSolved:false,unresolvedReason:why,modelledMixedRoutes:mixedRoutes.map(x=>x.route),
   symbolicModel:typeof factorySteadyBuildEquations==='function'?(()=>{const model=factorySteadyBuildEquations();const bounds=typeof factorySteadyProveRateBounds==='function'?factorySteadyProveRateBounds(model):null;const algebra=typeof factorySteadyAnalyzeEqualities==='function'?factorySteadyAnalyzeEqualities(model):null;const warehouseNodes=algebra&&typeof factorySteadyWarehouseSupernodes==='function'?factorySteadyWarehouseSupernodes(model,algebra):null;const feedback=warehouseNodes&&bounds&&typeof factorySteadyPropagateWarehouseBounds==='function'?factorySteadyPropagateWarehouseBounds(warehouseNodes,bounds):null;const rateUpper={...(bounds?.upper||{})};for(const [key,entry] of Object.entries(feedback?.tightened||{}))rateUpper[key]=entry.upper;const structure=typeof factorySteadyDependencyComponents==='function'?factorySteadyDependencyComponents(state,model):null;const priority=typeof factorySteadyWarehousePriorityModel==='function'?factorySteadyWarehousePriorityModel(state):null;const scheduler=typeof factorySteadySchedulingStructure==='function'?factorySteadySchedulingStructure(state,model):null;return {warehouseCutGraph:typeof factorySteadyWarehouseCutGraph==='function'?factorySteadyWarehouseCutGraph(state):null,conditionalRateRegime:null,algebraicStatus:algebra?{variables:algebra.variables,equations:algebra.equations,rank:algebra.rank,freeDegrees:algebra.freeDegrees,freeVariables:algebra.freeVariables}:null,fullModelStructure:{machineEquations:model.machineEquations.length,junctionEquations:model.junctionEquations.length,rateVariables:model.rateVariables.length,portResources:model.portResources.length,warehousePools:model.warehousePools.length,conditionalJunctions:model.conditionalFairness.length,fifoRecipeInlets:model.fifoRecipeInlets.length,modelledAllConnectedLines:model.sharedLines.length},isolatedDepositTrees:typeof factorySteadyIsolatedDepositTrees==='function'?factorySteadyIsolatedDepositTrees(state):null,isolatedDepositChains:typeof factorySteadyIsolatedDepositChains==='function'?factorySteadyIsolatedDepositChains(state):null,scheduleTopology:scheduler,warehouseOutletPriority:priority,networkDecomposition:structure?{machineCount:structure.machineCount,activeMachineCount:structure.activeMachineCount,sourceCount:structure.sourceCount,sourceTypes:Object.entries(structure.sources.reduce((acc,x)=>(acc[x.item]=(acc[x.item]||0)+1,acc),{})).map(([item,count])=>({item,count})),terminalWarehouseItems:structure.terminalWarehouse.map(x=>x.item),feedbackWarehouseItems:structure.feedbackWarehouseItems,componentCount:structure.componentCount,cyclicComponents:structure.cyclicComponents.map(x=>({size:x.size,machines:x.machineLabels,warehouseItems:x.warehouseItems})),caveat:structure.caveat}:null,warehouseSupernodes:warehouseNodes?{materialCount:warehouseNodes.materialCount,totalWarehouseInputPorts:warehouseNodes.totalWarehouseInputPorts,totalWarehouseOutputPorts:warehouseNodes.totalWarehouseOutputPorts,globalRateFreedom:warehouseNodes.globalRateFreedom,nodes:warehouseNodes.nodes.map(p=>({item:p.item,inputs:p.inputPorts.map(port=>port.route),outputs:p.outputPorts.map(port=>port.route),netAsFreeVariables:p.netAsFreeVariables,mustBalanceToZero:p.mustBalanceToZero,stockCapacity:p.stockCapacity}))}:null,sharedLines:model.sharedLines.length,flowVariables:model.rateVariables.length,recipes:model.machineEquations.length,junctions:model.junctionEquations.length,mixedRoutes:model.sharedLines.filter(x=>x.materials.length>1).map(x=>x.route),provenUpperBounds:bounds?{completed:bounds.completed,warehouseFeedbackUpper:feedback?.tightened||{},machineCycleUpper:Object.fromEntries(Object.entries(rateUpper).filter(([k])=>k.startsWith("cycles:")).map(([k,v])=>[k.slice(7),v])),routeItemUpper:Object.fromEntries(Object.entries(bounds.upper).filter(([k])=>k.startsWith("flow:")).map(([k,v])=>[k.slice(5),v])),machine:m?{id:m.id,label:machineRef(m),cycleUpper:rateUpper['cycles:'+m.id]||null}:null,mixedLines:bounds.sharedLineUpper.filter(r=>r.materials.length>1).map(r=>({route:r.route,upperSum:r.upperSum,capacity:r.capacity,strictlyBelowCapacity:r.strictlyBelowCapacity}))}:null};})():null}};}
 const machineRef=m=>(typeof label==='function'?label(m):(def(m)?.name||m.type))+'（'+m.id+'）';
 const byId=new Map(state.machines.map(m=>[m.id,m]));
 const valid=state.routes.filter(r=>r.to&&byId.has(r.from.id)&&byId.has(r.to.id)&&
  !checkPath(r.path,r.from,r.to,r.id));
 const inMap=new Map(),outMap=new Map(),materialFor=new Map();
 for(const m of state.machines){inMap.set(m.id,[]);outMap.set(m.id,[]);}
 for(const r of valid){
  inMap.get(r.to.id).push(r);outMap.get(r.from.id).push(r);
  const materials=[...streamMaterials(r)].filter(item=>item&&acceptsMaterial(byId.get(r.to.id),item,r.to.port)&&
   (byId.get(r.from.id).type!=='分流'||!outPort(byId.get(r.from.id),r.from.port)?.filter||
    ['任意',item].includes(outPort(byId.get(r.from.id),r.from.port)?.filter)));
  if(materials.length>1)mixedRoutes.push({route:r.id,materials});
  materialFor.set(r.id,materials.length===1?materials[0]:null);
 }
 // A filtered output is NOT a capacity-zero branch that may be skipped.
 // The discrete splitter stalls if the selected exit rejects the FIFO head.
 // This local solver cannot prove which mixed head is selected over time.
 for(const m of state.machines){
  if(m.type!=='分流')continue;
  const inputItems=new Set((inMap.get(m.id)||[]).flatMap(r=>[...streamMaterials(r)]));
  for(const r of outMap.get(m.id)||[]){
   const filter=outPort(m,r.from.port)?.filter||'';
   if(filter&&filter!=='任意'&&[...inputItems].some(item=>item!==filter))
    return unsupported('分流器 '+machineRef(m)+' 轮询到过滤出口时可能发生队首物品冲突；不能把该出口略过并重新分配流量',m);
  }
 }
 for(const m of state.machines){
  const ins=inMap.get(m.id),outs=outMap.get(m.id),rec=getRecipe(m);
  for(const dir of ['in','out']){
   const list=dir==='in'?ins:outs,side=dir==='in'?'to':'from';
   const used=new Set();for(const r of list){
    const k=r[side].port;if(used.has(k))return unsupported('同一物理端口存在多条线路：'+machineRef(m)+' / '+dir+'/'+k,m);
    used.add(k);
   }
  }
   if(m.type==='仓出'&&outs.some(r=>materialFor.get(r.id)))
    return unsupported('共享仓库出口 '+machineRef(m)+' 的可持续供给与调度尚未联立证明',m);
   if(rec&&Object.keys(rec.inputs||{}).length>1&&(ins.length||outs.length)){
    const needs=Object.entries(rec.inputs).map(([item,qty])=>item+'×'+qty).join('、');
    return unsupported(machineRef(m)+'：多原料配方（'+needs+'；周期 '+rec.seconds+' 秒）已建立投入产出守恒方程，输入 '+ins.length+' 条线路；尚需联立原料独立 FIFO、上游反压、配方同步生产与共享库存才能证明全局唯一稳态',m);
   }
   if(ins.length>1&&m.type==='汇流')
    return unsupported(machineRef(m)+'：物理输入端口轮询与共享 3 件出口 FIFO 需要和上下游反压联立',m);
   if(ins.length>1&&rec)
    return unsupported(machineRef(m)+'：多个端口供应同一机器原料，需联立独立缓存与上游反压，不能仅凭守恒方程证明唯一产率',m);
   if(ins.length>1&&m.type==='分流')
    return unsupported(machineRef(m)+'：出现多个输入连接，不符合单输入物理模型',m);
   if(rec&&outs.length>1)return unsupported(machineRef(m)+'：配方机器多个输出连接，需要联立共用成品 FIFO 的输出分配',m);
 }
 const visiting=new Set(),visited=new Set();
 function dfs(id){
  if(visiting.has(id))return true;if(visited.has(id))return false;
  visiting.add(id);
  for(const r of outMap.get(id)||[])if(dfs(r.to.id))return true;
  visiting.delete(id);visited.add(id);return false;
 }
 for(const m of state.machines)if(dfs(m.id))return unsupported('线路拓扑存在循环，当前证明仅覆盖有向无环网络');
 // A local fair split is not generally the global Max-Min allocation of
 // terminal demands when a path passes through multiple splitters.
 function nestedSplitter(id,seen=false){
  const m=byId.get(id);if(m.type==='分流'&&seen)return true;
  const next=seen||m.type==='分流';
  return (outMap.get(id)||[]).some(r=>nestedSplitter(r.to.id,next));
 }
 for(const m of state.machines){
  if(nestedSplitter(m.id))return unsupported('多级分流器的全局 Max-Min 公平分配尚无严格证明');
 }
 if(mixedRoutes.length)return unsupported('混合线路已建立逐物品守恒与整带共享容量方程，但当前网络还有尚未联立的多来源/多配方调度条件');
 const capCache=new Map();
 function capacity(r,item){
  if(!r||materialFor.get(r.id)!==item)return STEADY_ZERO;
  const key=r.id+'|'+item;if(capCache.has(key))return capCache.get(key);
  const dest=byId.get(r.to.id),recipe=getRecipe(dest),outputs=outMap.get(dest.id)||[];
  let cap=STEADY_ZERO;
  if(dest.type==='仓入'||dest.type==='电脑')cap=STEADY_ONE;
  else if(dest.type==='分流'){
   cap=steadyExactMin(STEADY_ONE,steadyExactSum(outputs.map(out=>capacity(out,item))));
  }else if(dest.type==='汇流'){
   cap=steadyExactMin(STEADY_ONE,capacity(outputs[0],item));
  }else if(recipe){
   const req=recipe.inputs?.[item];
   if(req&&outputs.length){
    const outCap=capacity(outputs[0],recipe.output);
    cap=steadyExactMin(STEADY_ONE,steadyExactMin(
     steadyExactDiv(steadyExactQ(req),steadyExactQ(recipe.seconds)),
     steadyExactDiv(steadyExactMul(outCap,steadyExactQ(req)),steadyExactQ(recipe.qty))));
   }
  }
  capCache.set(key,cap);return cap;
 }
 const fRates=new Map(),cycleRates=new Map(),feedRates=new Map(),depositRates=new Map();
 function increase(map,key,value){map.set(key,steadyExactAdd(map.get(key)||STEADY_ZERO,value));}
 function emit(route,item,rate){
  if(!route||steadyExactCmp(rate,STEADY_ZERO)===0)return;
  if(materialFor.get(route.id)!==item||steadyExactCmp(rate,capacity(route,item))>0)
   throw Error('flow exceeds sustainable capacity: '+route.id);
  increase(fRates,route.id+'|'+item,rate);
  const m=byId.get(route.to.id),rec=getRecipe(m),outs=outMap.get(m.id)||[];
  if(m.type==='仓入'){increase(depositRates,item,rate);return;}
  if(m.type==='电脑')return;
  if(m.type==='分流'){
   const caps=outs.map(r=>capacity(r,item)),parts=steadyExactWaterfill(rate,caps);
   for(let i=0;i<outs.length;i++)emit(outs[i],item,parts[i]);
   return;
  }
  if(m.type==='汇流'){emit(outs[0],item,rate);return;}
  if(rec){
   const cycles=steadyExactDiv(rate,steadyExactQ(rec.inputs[item]));
   increase(cycleRates,m.id,cycles);
   const feeds=feedRates.get(m.id)||new Map();increase(feeds,item,rate);feedRates.set(m.id,feeds);
   emit(outs[0],rec.output,steadyExactMul(cycles,steadyExactQ(rec.qty)));
  }
 }
 try{
  for(const m of state.machines){
   const rec=getRecipe(m),outs=outMap.get(m.id)||[];
   if(!rec||Object.keys(rec.inputs||{}).length||outs.length!==1)continue;
   const offer=steadyExactMin(STEADY_ONE,steadyExactDiv(steadyExactQ(rec.qty),steadyExactQ(rec.seconds)));
   const sent=steadyExactMin(offer,capacity(outs[0],rec.output));
   increase(cycleRates,m.id,steadyExactDiv(sent,steadyExactQ(rec.qty)));
   emit(outs[0],rec.output,sent);
  }
  for(const m of state.machines){
   const rec=getRecipe(m);if(!rec)continue;
   const cycles=cycleRates.get(m.id)||STEADY_ZERO,duty=steadyExactMul(cycles,steadyExactQ(rec.seconds));
   if(steadyExactCmp(duty,STEADY_ONE)>0)throw Error('machine exceeds physical maximum: '+m.id);
   machineCycles[m.id]=steadyExactNumber(cycles);
   machineDuty[m.id]=steadyExactNumber(duty);
   machineIdle[m.id]=steadyExactNumber(steadyExactSub(STEADY_ONE,duty));
   machineNeeds[m.id]=Object.fromEntries(Object.entries(rec.inputs||{}).map(([item,q])=>[item,steadyExactNumber(steadyExactMul(cycles,steadyExactQ(q)))]));
   machineFeeds[m.id]=Object.fromEntries([...(feedRates.get(m.id)||new Map())].map(([item,q])=>[item,steadyExactNumber(q)]));
  }
  for(const r of valid){
   const item=materialFor.get(r.id),rate=item?(fRates.get(r.id+'|'+item)||STEADY_ZERO):STEADY_ZERO;
   if(steadyExactCmp(rate,STEADY_ONE)>0)throw Error('line capacity violation: '+r.id);
   routeFlows[r.id]=item&&steadyExactCmp(rate,STEADY_ZERO)>0?{[item]:steadyExactNumber(rate)}:{};
  }
  for(const [item,rate] of depositRates)inflow[item]=steadyExactNumber(rate);
  const fractions={routes:Object.fromEntries([...fRates].map(([k,v])=>[k,steadyExactText(v)])),
   machineCycles:Object.fromEntries([...cycleRates].map(([k,v])=>[k,steadyExactText(v)])),
   inflow:Object.fromEntries([...depositRates].map(([k,v])=>[k,steadyExactText(v)]))};
  return {inflow,outflow,machineCycles,machineDuty,machineIdle,machineNeeds,machineFeeds,
   routeFlows,warnings,diagnostics:{method:'有理数守恒 + Max-Min Progressive Filling',
   exact:true,certified:true,network:'单物料无环单输入',fractions,variables:fRates.size}};
 }catch(err){return unsupported(err.message||String(err));}
}


function warehouseProvenBoundsMarkup(budget){
 const proof=budget?.diagnostics?.symbolicModel?.provenUpperBounds;
 if(!proof?.completed)return '';
 const mixed=proof.mixedLines||[];
 const machine=proof.machine;
 if(!mixed.length&&!machine?.cycleUpper)return '';
 const rows=mixed.map(r=>'<tr><td>'+esc(r.route)+'</td><td>≤ '+esc(r.upperSum)+' 件/秒</td></tr>').join('');
 const machineRow=machine?.cycleUpper?'<tr><td>'+esc(machine.label)+'</td><td>≤ '+esc(machine.cycleUpper)+' 轮/秒</td></tr>':'';
 const feedbackRows=Object.entries(proof.warehouseFeedbackUpper||{}).map(([key,bound])=>{const id=key.startsWith('cycles:')?key.slice(7):key;const m=state?.machines?.find(x=>x.id===id);const name=m&&typeof label==='function'?label(m)+'（'+id+'）':id;return '<tr><td>'+esc(name)+'（仓库反压）</td><td>≤ '+esc(bound.upper)+' 轮/秒</td></tr>';}).join('');
 return '<details class="ledger-meta"><summary>已证明的数学上界（不是实际稳态产率）</summary>'+
  '<table class="ledger-table"><thead><tr><th>对象</th><th>严格上界</th></tr></thead><tbody>'+
  machineRow+feedbackRows+rows+'</tbody></table></details>';
}
function warehouseSupernodeExpression(node){
 const variables=node.netAsFreeVariables||[];
 if(!variables.length)return '0';
 return variables.map((part,i)=>{
  const sign=part.coefficient.startsWith('-')?'-':'+';
  const mag=sign==='-'?part.coefficient.slice(1):part.coefficient;
  const name=part.variable.startsWith('cycles:')?'ν('+part.variable.slice(7)+')':
   part.variable.startsWith('flow:')?'x('+part.variable.slice(5)+')':part.variable;
  const term=(mag==='1'?'':mag+'×')+name;
  return (i===0?(sign==='-'?'−':''):(sign==='-'?' − ':' + '))+term;
 }).join('');
}
function warehouseSupernodesMarkup(budget){
 const model=budget?.diagnostics?.symbolicModel?.warehouseSupernodes;
 if(!model?.nodes?.length)return '';
 const rows=model.nodes.map(node=>
  '<tr><td>'+esc(node.item)+'</td><td>'+node.inputs.length+' / '+node.outputs.length+'</td><td>'+
  esc(warehouseSupernodeExpression(node))+'</td></tr>').join('');
 return '<details class="ledger-meta"><summary>仓库超级节点：'+model.materialCount+' 种物品的守恒方程（未求出唯一速率）</summary>'+
  '<p class="tiny">每种物品共享一个库存池。ΔS/Δt = Σ入库 − Σ出库，单位件/秒。允许库存增长，不能强行设为零；ν 表示机器每秒的配方轮次。若下游可服务出库需求 D 高于补货 I，长期缺货时出库只能跟随 I；若 I 高于 D 则多余物品入库积累。O=min(I,D) 只适用于无额外 FIFO/调度障碍的理想服务条件，不代表整个 AST1 已求解。</p>'+
  '<table class="ledger-table"><thead><tr><th>材料</th><th>入/出口</th><th>ΔS/Δt 精确等式</th></tr></thead><tbody>'+
  rows+'</tbody></table><p class="tiny">仅为精确代数恒等式；分流轮询、FIFO 可达性和唯一长期产率尚待证明。</p></details>';
}
function warehouseNetworkDecompositionMarkup(budget){
 const decomposition=budget?.diagnostics?.symbolicModel?.networkDecomposition;
 if(!decomposition)return '';
 const types=(decomposition.sourceTypes||[]).map(x=>esc(x.item)+' ×'+x.count).join('、');
 const loops=(decomposition.cyclicComponents||[]).map(c=>
  '<p class="tiny">循环依赖分量：'+c.size+' 台设备；仓库反馈物品：'+esc(c.warehouseItems.join('、'))+'</p>'+
  '<details><summary class="tiny">查看循环内设备</summary><div class="tiny">'+c.machines.map(m=>esc(m.name)+'（'+esc(m.id)+'）').join('、')+'</div></details>').join('');
 return '<details class="ledger-meta"><summary>物料网络分解：'+
   decomposition.sourceCount+' 个生产源、'+decomposition.terminalWarehouseItems.length+
   ' 种最终入库物品、'+decomposition.cyclicComponents.length+' 个循环核心</summary>'+
  '<p class="tiny">源头：'+types+'</p>'+
  '<p class="tiny">只入库不取出：'+esc(decomposition.terminalWarehouseItems.join('、'))+'</p>'+
  '<p class="tiny">可再次取出的库存：'+esc(decomposition.feedbackWarehouseItems.join('、'))+'</p>'+
  loops+'<p class="tiny">注意：强连通分量仅划分物料流向的反馈，不代表反压被消除或全局速率已求出。</p></details>';
}
function warehouseOutletPriorityMarkup(budget){
 const model=budget?.diagnostics?.symbolicModel?.warehouseOutletPriority;
 if(!model?.groups)return '';
 const shared=model.groups.filter(group=>group.competing);
 if(!shared.length)return '';
 const rows=shared.map(group=>{
  const ordered=group.outlets.filter(outlet=>outlet.eligibleToReserve)
   .map(outlet=>outlet.id+'（记录 #'+outlet.gameMachineIndex+'）').join(' → ');
  return '<tr><td>'+esc(group.item)+'</td><td>'+esc(ordered)+'</td></tr>';
 }).join('');
 return '<details class="ledger-meta"><summary>共享库存仓出优先级：'+shared.length+' 种物品存在多出口争用</summary>'+
  '<p class="tiny">同种物品按机器在游戏蓝图中的记录顺序逐个预留。每台仓出最多保留 3 件；靠前的仓出可能持续占用有限补货，靠后的仓出不保证正流量。不是平均分配，也不是轮询。</p>'+
  '<table class="ledger-table"><thead><tr><th>物品</th><th>仓出抢占顺序</th></tr></thead><tbody>'+rows+'</tbody></table>'+
  '<p class="tiny">该优先级是精确离散转移规则；各端口最终长期平均产率仍需与 FIFO 发货及下游反压联合证明。</p></details>';
}
function warehouseScheduleTopologyMarkup(budget){
 const s=budget?.diagnostics?.symbolicModel?.scheduleTopology;
 if(!s)return '';
 const lines=(s.mixedTerminalWarehouseRoutes||[]).map(r=>
  esc(r.route)+' → '+esc(r.warehouse)+'（'+esc(r.materials.join('、'))+'）').join('；');
 const outlets=(s.sharedWarehouseOutletCompetition||[]).map(x=>
  esc(x.item)+'：'+esc(x.machineOrder.join(' → '))).join('；');
 const filterRisks=s.splitterFilterMismatchRisks||[];
 const blockers=(s.mixedRecipeInlets||[]).length+(s.mixedSplitterInputs||[]).length+
  (s.incompatibleRecipeInlets||[]).length+filterRisks.length;
 return '<details class="ledger-meta"><summary>实际布局的调度约束：'+
   s.homogeneousSplitterIDs.length+'/'+s.splitterCount+' 台单物品分流器，'+
   s.mixedTerminalWarehouseRoutes.length+' 条混合尾线</summary>'+
  '<p class="tiny">直接对当前线路和物料类型进行静态检查：混合配方输入 '+s.mixedRecipeInlets.length+
  ' 条，混合分流输入 '+s.mixedSplitterInputs.length+' 条，输入物料不匹配 '+s.incompatibleRecipeInlets.length+
  ' 条，分流器出口潜在过滤不匹配 '+filterRisks.length+' 处。'+(blockers===0?'当前布局不需要求解这些类型的颜色 FIFO 阻塞。':'这些入口或出口仍有物料次序/过滤阻塞约束。')+'</p>'+
  '<p class="tiny">汇入仓库的混合线路：'+(lines||'无')+'</p>'+
  '<p class="tiny">有同物品仓出竞争的库存：'+(outlets||'无')+'</p>'+
  '<p class="tiny">结构化简不等于实际产率已求出。仍需联立机器缺料反压、单物品分流轮询、汇流共享端口和仓库预留优先顺序。</p></details>';
}
function warehouseSerialIslandMarkup(budget){
 const diag=budget?.diagnostics?.symbolicModel;
 const n=diag?.isolatedDepositTrees?.networks||diag?.isolatedDepositChains?.chains;
 if(!n?.length)return '';
 const rows=n.map(x=>'<tr><td>'+esc(x.label||x.machineSequence.join(' → '))+
  '</td><td>'+esc(x.item)+'</td><td>≤ '+esc(x.outputRateUpper)+' 件/秒</td></tr>').join('');
 return '<details class="ledger-meta"><summary>独立生产链/配方树：'+n.length+
 ' 组，理想速率与可证明上界（不是实际速率）</summary>'+
 '<p class="tiny">只用机器配方、输入供给和传送带 1 件/秒容量计算，包含多原料的无竞争生产链。理想连续流体模型下速率等于表值；真实离散模拟器是否达到上界仍需要单独证明。</p>'+
 '<table class="ledger-table"><thead><tr><th>生产子网</th><th>物品</th><th>长期入库速率上界</th></tr></thead><tbody>'+
 rows+'</tbody></table></details>';
}
function warehouseRateProblemMarkup(budget){
 const s=budget?.diagnostics?.symbolicModel;
 const a=s?.algebraicStatus,shape=s?.fullModelStructure;
 if(!a||!shape)return '';
 return '<details class="ledger-meta"><summary>全图速率数学模型：已建立 '+shape.modelledAllConnectedLines+' 条线路的方程，待唯一求解</summary>'+
  '<p class="tiny">'+shape.machineEquations+' 台配方机器、'+shape.junctionEquations+' 个分/汇流节点、'+shape.warehousePools+' 种共享仓库物品；'+
  a.variables+' 个速率变量，'+a.rank+' 个独立守恒关系，另有物理端口容量、配方周期、库存非负与候选调度区间约束。</p>'+
  '<p class="tiny">仅靠这些守恒等式仍有 '+a.freeDegrees+' 个代数自由维度；它们不是需要额外填写的用户参数。下一步通过分流轮询、原料供需、反压与仓出抢占的有效工作区间联立消除。</p>'+
  '<p class="tiny">全图流量已建模，不代表全图的长期实际速率已求出。下方可查看配方树上界、仓库恒等式与已证明的容量限制。</p></details>';
}
function warehouseActiveRegimeMarkup(budget){
 const candidate=budget?.conditionalBudget;
 if(!candidate)return '';
 if(candidate.status!=='conditional-fixed-point'){
  const issues=(candidate.issues||[]).map(x=>esc(x.machine+'：'+x.reason)).join('；');
  return '<details class="ledger-meta"><summary>自动供需模型：尚未得到可验证的固定点</summary><p class="tiny">'+
   esc(candidate.reason||'当前布局存在需要物品顺序约束的节点')+(issues?'；'+issues:'')+'</p></details>';
 }
 return '<details class="ledger-meta"><summary>通用自动供需模型 · 条件性精确分数</summary>'+
  '<p class="tiny">自动根据当前机器图生成局部供需方程，不使用固定蓝图编号或模拟统计。两种初始供需猜测收敛至相同流率，并通过精确有理数方程、配方及库存守恒校验。</p>'+
  '<p class="tiny">适用假设：连续可服务、理想端口轮询、仓出严格连续优先级；有限缓存、物品顺序、轮询相位以及全局唯一性仍未证明。上表是条件模型结果，不是已证明的实际长期产率。</p></details>';
}
function warehouseCutGraphMarkup(budget){
 const g=budget?.diagnostics?.symbolicModel?.warehouseCutGraph;
 if(!g)return '';
 const trees=budget?.diagnostics?.symbolicModel?.isolatedDepositTrees?.networks||[];
 const independent=g.warehouseInRoots.filter(r=>r.independentOfWarehouseOut);
 const dependent=g.warehouseInRoots.filter(r=>!r.independentOfWarehouseOut);
 const roots=independent.map(r=>{
  const tree=trees.find(t=>t.terminalRoute===r.terminalRoute);
  return '<tr><td>'+esc(r.terminalRoute+' → '+r.warehouseIn)+'</td><td>'+
   esc(r.sourceGeneratorRoots.join(' + ')||'—')+'</td><td>'+
   (tree?'≤ '+esc(tree.outputRateUpper)+' 件/秒 · '+esc(tree.item):'速率需联立')+'</td></tr>';
 }).join('');
 const dependentRows=dependent.map(r=>'<tr><td>'+esc(r.terminalRoute+' → '+r.warehouseIn)+'</td><td>'+
  esc(r.warehouseOutRoots.join('、')||'—')+'</td></tr>').join('');
 const coneGroups=g.entryConeGroups?.groups||[];
 const groupSummary=coneGroups.map(c=>'<tr><td>'+esc(c.terminalRoutes.join('、'))+'</td><td>'+esc(c.sharedUpstreamMachines.join('、')||'无')+'</td><td>'+esc(c.independentOfWarehouseOut?'无仓出':'有仓出')+'</td></tr>').join('');
 const feedback=g.feedbackGroups.map(x=>esc(x.warehouseItems.join('、'))+'（'+x.componentIds.length+' 个相关生产子图）').join('；');
 return '<details class="ledger-meta"><summary>按仓库切图：'+independent.length+' 条独立入库线路，'+
  dependent.length+' 条依赖仓出的线路</summary>'+
  '<details><summary>按共享上游资源合并：'+coneGroups.length+' 组（'+g.warehouseInRoots.length+' 个独立线路终点）</summary><table class="ledger-table"><thead><tr><th>终点线路</th><th>共享上游机器</th><th>仓出依赖</th></tr></thead><tbody>'+groupSummary+'</tbody></table></details>'+
  '<p class="tiny">每条仓入端口单独作为终点；仓出作为生产子图的起点。同一物品的所有仓入/仓出共享一份库存，不按机器配对。</p>'+
  '<table class="ledger-table"><thead><tr><th>优先求解的仓入路线</th><th>无仓出上游源头</th><th>理想流率/上界</th></tr></thead><tbody>'+roots+'</tbody></table>'+
  '<details><summary>依赖仓出的后续子图（'+dependent.length+' 条仓入线路）</summary>'+
  '<table class="ledger-table"><thead><tr><th>仓入线路</th><th>上游仓出起点</th></tr></thead><tbody>'+dependentRows+'</tbody></table></details>'+
  '<p class="tiny">库存反馈联立组：'+(feedback||'无')+'。先求无仓出生产链，再按照共享仓库物品依赖次序计算；有向环不能通过单向传播求解。</p>'+
  '<p class="tiny">这里显示的是数学求解顺序与必要条件，不等于全网实际长期速率已经唯一证明。</p></details>';
}
