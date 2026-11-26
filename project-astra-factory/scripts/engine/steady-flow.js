'use strict';
// Cached result shared by warehouse, inspector, and canvas on every refresh.
let theoreticalBudget=null;
// Shared exact rational arithmetic and the unified automatic supply/demand display entry.
// No synchronous/legacy mathematical solver fallback.
function warehouseTheory(){
 return typeof requestTheoryBudget==='function'?requestTheoryBudget():{proofMode:'strict-counts',status:'calculation-failed',failure:'worker-unavailable',notice:'数学 Worker 未加载',inflow:{},outflow:{},machineCycles:{},routeFlows:{}};
}
function steadyDisplayRateBudget(budget){
 if(budget?.proofMode==='strict-counts')return budget;
 if(typeof requestTheoryBudget==='function')return null;
 if(budget&&!budget.error&&!budget.diagnostics&&budget.machineCycles)return budget;
 return null;
}
function portSteadyRate(m,port){
 const r=routeFor(m.id,port.kind==='in'?'in':'out',port.index);
 if(!r)return 0;
 const b=steadyDisplayRateBudget(theoreticalBudget);
 if((b?.proofMode==='strict-counts'||b?.status==='conditional-exact')&&Object.hasOwn(b.routeTotals||{},r.id)){const v=b.routeTotals[r.id];return v===null?null:v*60;}
 if(b?.proofMode==='strict-counts')return r.to?null:0;
 return Object.values(b?.routeFlows?.[r.id]||{}).reduce((sum,x)=>sum+x,0)*60;
}
// Certified route rates are kept in items/s and shown as items/min in the inspector.
function steadyPortFlowDetails(m,p,theory){
 const route=routeFor(m.id,p.kind==='in'?'in':'out',p.index);
 const valid=!!route&&!!route.to&&!checkPath(route.path,route.from,route.to,route.id);
 const flows=valid?{...(theory.routeFlows?.[route.id]||{})}:{};
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
   const target=route.to&&machineById(route.to.id);
   if(target&&acceptsMaterial(target,item,route.to.port))materials.add(item);
  }
 }
 if(valid&&theory.proofMode==='strict-counts'&&theory.routeTotals?.[route.id]!==0)for(const item of materials)if(!Object.hasOwn(flows,item))flows[item]=null;
 return {port:p,route,valid,flows,materials};
}
function steadyFlowTotal(flows){return Object.values(flows).some(n=>n===null)?null:Object.values(flows).reduce((total,n)=>total+n,0);}
function steadyFlowMaterialRows(flows,materials){
 const all=new Set([...materials,...Object.keys(flows)]);
 const ordered=[...all].filter(Boolean).sort(factoryItemCompare);
 if(!ordered.length)return '<div class="tiny" style="padding:4px 0">\u65e0\u7269\u54c1\u6d41\uff080.00 \u4ef6/\u5206\uff09</div>';
 return ordered.map(item=>{
  const perMinute=flows[item]===null?null:Math.max(0,flows[item]||0)*60;
  return `<div class="kv" style="margin:3px 0"><span style="min-width:0;overflow-wrap:anywhere"><span style="color:${materialColor(item)}">●</span> ${esc(item)}</span><b style="white-space:nowrap;font-variant-numeric:tabular-nums">${perMinute===null?"—":perMinute.toFixed(2)}</b></div>`;
 }).join('');
}
function steadyFlowPortLabel(m,p){
 if(m.type==='\u5206\u6d41'&&p.kind==='out')
  return '\u8f93\u51fa \u00b7 '+ast1FilterPortLabel(m,p.index)+' ('+p.side+')';
 return (p.kind==='in'?'\u8f93\u5165':'\u8f93\u51fa')+' '+(p.index+1)+' ('+p.side+')';
}
function machineProductionDuty(m){
 const theory=steadyDisplayRateBudget(theoreticalBudget),recipe=getRecipe(m);
 if(!recipe)return '';
 if(!theory)return '<div class="item machine-duty-section tiny">理论运行占空比 —</div>';
 const duty=recipe?((theory.proofMode==='strict-counts'||theory.status==='conditional-exact')&&theory.machineCycles?.[m.id]==null?null:Math.max(0,Math.min(1,theory.machineDuty?.[m.id]??(theory.machineCycles?.[m.id]||0)*recipe.seconds))):null;
 return recipe?`<div class="item machine-duty-section"><div class="machine-duty-grid">
  <div><span>理论运行占空比</span><b>${duty===null?"—":(duty*100).toFixed(2)+"%"}</b></div>
 </div></div>`:'';
}
function machineSteadyPanel(m,includeDuty=true){
 const theory=steadyDisplayRateBudget(theoreticalBudget);
 if(!theory){
  return `<div class="item machine-theory" id="inspectorTheory"><div class="machine-analysis-title"><strong>稳态理论</strong></div><div class="tiny">${esc(theoreticalBudget?.notice||theoreticalBudget?.error||'已建立流量方程，当前机器的唯一长期速率仍待证明')}</div>${machineSteadyDemandEquationsMarkup(m)}</div>`;
 }
 const ports=getPorts(m),junction=m.type==='分流'||m.type==='汇流';
 const details=ports.map(p=>steadyPortFlowDetails(m,p,theory));
 const rate=v=>v===null||v===undefined?"—":(Math.max(0,v)*60).toFixed(2);
 const recipe=getRecipe(m);
 const dutyInfo=includeDuty?machineProductionDuty(m):'';
 const kinds=[['in','输入','in'],['out','输出','out']];
 let tiles='',breakdown='';
 for(const [kind,heading,cls] of kinds){
  const subset=details.filter(d=>d.port.kind===kind),amounts={},known=new Set();
  for(const item of subset){
   for(const [name,n] of Object.entries(item.flows))amounts[name]=n===null||amounts[name]===null?null:(amounts[name]||0)+n;
   for(const material of item.materials)known.add(material);
  }
  if(theory.machineMaterials?.[m.id]?.[kind])Object.assign(amounts,theory.machineMaterials[m.id][kind]);
  const aggregate=theory.machineTotals?.[m.id];
  const total=rate(aggregate&&Object.hasOwn(aggregate,kind)?aggregate[kind]:steadyFlowTotal(amounts));
  tiles+=`<div class="machine-flow-tile ${cls}"><span class="tile-label"><i class="tile-dot"></i>${heading}总量</span>
   <b class="tile-value">${total}<small> 件/分</small></b></div>`;
  let rows='';
  if(!subset.length)rows='<div class="tiny">没有'+heading+'接口</div>';
  else if(!junction){
   rows=steadyFlowMaterialRows(amounts,known);
   if(subset.length>1)rows+=`<div class="tiny">${subset.length} 个接口合计</div>`;
  }else{
   for(const d of subset){
    const p=d.port,stateText=d.valid?'已连接':d.route&&!d.route.to?'末端悬空（理论流量 0）':d.route?'线路无效':'未连接';
    const filter=p.kind==='out'&&m.type==='分流'&&p.filter&&p.filter!=='任意'
     ?' · 过滤 '+esc(p.filter):'';
    rows+=`<div class="machine-port-detail-row ${cls==='out'?'is-out':'is-in'}">
     <div class="kv"><b>${esc(steadyFlowPortLabel(m,p))}</b><b>${rate(d.valid&&theory.proofMode==='strict-counts'?(theory.routeTotals?.[d.route.id]??null):d.valid&&Object.hasOwn(theory.routeTotals||{},d.route.id)?theory.routeTotals[d.route.id]:steadyFlowTotal(d.flows))} 件/分</b></div>
     <div class="port-muted">${stateText}${filter}</div>
     ${steadyFlowMaterialRows(d.flows,d.materials)}
    </div>`;
   }
  }
  breakdown+=`<section class="machine-port-details-section"><div class="machine-port-details-heading">${heading}接口 · ${subset.length} 个</div>${rows}</section>`;
 }
 return `<div class="item machine-theory" id="inspectorTheory">
  <div class="machine-analysis-title"><strong>稳态理论</strong><span class="analysis-unit">${['conditional-exact','conditional-fixed-point'].includes(theory.status)?'条件解 · ':''}件/分钟</span></div>
  <div class="machine-flow-summary">${tiles}</div>
  ${dutyInfo}
  <details class="machine-port-details"><summary>接口流量明细 · ${ports.length} 个接口</summary>
   <div class="machine-port-details-body">${breakdown}</div>
  </details>
 </div>`;
}

// Explain already proven conservation equations without presenting unknown
// splitter arbitration or FIFO scheduling as an actual steady production rate.
function machineSteadyDemandEquationsMarkup(m){
 if(typeof factoryCertifiedWarehouseTheory==='function'){
  const rec=getRecipe(m);if(!rec)return '';
  const rows=Object.entries(rec.inputs||{}).map(([k,n])=>{
   const rs=state.routes.filter(r=>r.to?.id===m.id&&!checkPath(r.path,r.from,r.to,r.id)&&streamMaterials(r).has(k)&&acceptsMaterial(m,k,r.to.port));
   return '<div class="kv"><span>'+esc(k)+'</span><b>'+esc(rs.map(r=>r.id).join(' + ')||'0')+' = '+esc(n)+'ν</b></div>';
  }).join('');
  return '<details class="machine-port-details"><summary>已建立的配方守恒等式</summary><div class="machine-port-details-body"><div class="tiny">ν 为每秒完成批次；实际率必须独立证明。</div>'+rows+'</div></details>';
 }
 if(!getRecipe(m)||typeof factorySteadyRecipeDemandTrace!=='function')return '';
 const trace=factorySteadyRecipeDemandTrace(m.id);
 if(!trace)return '';
 const rows=trace.inputRequirements.map(part=>{
  const routes=part.routes.map(r=>r.route);
  const sum=routes.length?routes.join(' + '):'∑输入线路';
  const basic='<div class="kv"><span>'+esc(part.item)+'</span><b>'+esc(sum)+' = '+esc(part.neededPerCycle)+'ν</b></div>';
  const upstream=part.routes.filter(r=>r.upstreamJunction).map(r=>{
   const j=r.upstreamJunction;
   const received=j.incomingRoutes.join(' + ')||'∑上游';
   const sent=[r.route,...j.competingOutgoingRoutes].join(' + ');
   return '<div class="tiny" style="padding-left:8px">上游'+esc(j.kind)+
    ' '+esc(j.machine)+'：'+esc(received)+' = '+esc(sent)+
    '（轮询分配待证明）</div>';
  }).join('');
  return basic+upstream;
 }).join('');
 return '<details class="machine-port-details"><summary>已建立的配方反压等式（非实际流量）</summary>'+
  '<div class="machine-port-details-body"><div class="tiny" style="margin-bottom:7px">令 ν 为该机器每秒配方轮数；以下仅是必须成立的比例和守恒方程，不能据此声称已求出 ν。</div>'+
  rows+'</div></details>';
}
