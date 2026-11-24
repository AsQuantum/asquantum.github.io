'use strict';
// Cached result shared by warehouse, inspector, and canvas on every refresh.
let theoreticalBudget=null;
// Shared exact rational arithmetic and the unified automatic supply/demand display entry.
function steadyExactGcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){const t=a%b;a=b;b=t;}return a||1n;}
function steadyExactFraction(a,b=1n){
 a=BigInt(a);b=BigInt(b);if(!b)throw Error('zero denominator');
 if(b<0n){a=-a;b=-b;}const g=steadyExactGcd(a,b);
 return {n:a/g,d:b/g};
}
function steadyExactQ(value){
 if(value&&typeof value==='object'&&'n' in value&&'d' in value)return value;
 const s=String(value),match=s.match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
 if(!match)throw Error('invalid physical coefficient: '+s);
 const decimals=(match[3]||'').length,exponent=Number(match[4]||0)-decimals;
 if(Math.abs(exponent)>50)throw Error('unsupported decimal exponent');
 let n=BigInt(match[2]+(match[3]||''));
 if(match[1])n=-n;
 return exponent>=0?steadyExactFraction(n*10n**BigInt(exponent)):steadyExactFraction(n,10n**BigInt(-exponent));
}
function steadyRegionQ(x){
 if(typeof x==='string'&&/^-?\d+\/\d+$/.test(x)){
  const [a,b]=x.split('/');return steadyExactFraction(BigInt(a),BigInt(b));
 }
 return steadyExactQ(x);
}
function steadyExactAdd(a,b){return steadyExactFraction(a.n*b.d+b.n*a.d,a.d*b.d);}
function steadyExactSub(a,b){return steadyExactFraction(a.n*b.d-b.n*a.d,a.d*b.d);}
function steadyExactMul(a,b){return steadyExactFraction(a.n*b.n,a.d*b.d);}
function steadyExactDiv(a,b){return steadyExactFraction(a.n*b.d,a.d*b.n);}
function steadyExactCmp(a,b){const diff=a.n*b.d-b.n*a.d;return diff<0n?-1:diff>0n?1:0;}
function steadyExactMin(a,b){return steadyExactCmp(a,b)<=0?a:b;}
function steadyExactText(a){return a.d===1n?String(a.n):String(a.n)+'/'+String(a.d);}
function steadyExactNumber(a){return Number(a.n)/Number(a.d);}
const STEADY_ZERO=steadyExactQ(0),STEADY_ONE=steadyExactQ(1);
function steadyExactSum(xs){return xs.reduce((s,x)=>steadyExactAdd(s,x),STEADY_ZERO);}
// No optimization objective and no fairness penalties. This is the exact
// progressive-filling solution for a single resource with finite demand caps.
function steadyExactWaterfill(supply,caps){
 const total=steadyExactSum(caps),budget=steadyExactMin(supply,total);
 if(steadyExactCmp(budget,STEADY_ZERO)<0||caps.some(c=>steadyExactCmp(c,STEADY_ZERO)<0))
  throw Error('negative physical rate');
 const sorted=caps.map((cap,i)=>({cap,i})).sort((a,b)=>steadyExactCmp(a.cap,b.cap)||a.i-b.i);
 const result=caps.map(()=>STEADY_ZERO);
 let remaining=budget;
 for(let j=0;j<sorted.length;j++){
  const share=steadyExactDiv(remaining,steadyExactQ(sorted.length-j));
  if(steadyExactCmp(sorted[j].cap,share)<=0){
   result[sorted[j].i]=sorted[j].cap;
   remaining=steadyExactSub(remaining,sorted[j].cap);
  }else{
   for(let k=j;k<sorted.length;k++)result[sorted[k].i]=share;
   remaining=STEADY_ZERO;break;
  }
 }
 if(steadyExactCmp(remaining,STEADY_ZERO)!==0)throw Error('fairness conservation failure');
 return result;
}
function warehouseTheory(targetItem=null){
 const result={inflow:{},outflow:{},machineCycles:{},routeFlows:{},
  status:'modelled-unresolved',diagnostics:{certified:false,exact:false,modelled:true,rateSolved:false}};
 if(typeof factorySteadyAutomaticFluidBudget!=='function'||typeof factorySteadyBuildEquations!=='function'){
  result.notice='数学模型未加载';
  return result;
 }
 try{
  const model=factorySteadyBuildEquations();
  const current=factorySteadyAutomaticFluidBudget(state,model);
  result.conditionalBudget=current;
  if(current.status==='conditional-fixed-point'){
   result.status='conditional-fixed-point';
   result.diagnostics.rateSolved=true;
   result.notice='连续供需模型已求解；真实有限 FIFO / 轮询调度尚未完全证明。';
  }else{
   result.notice='当前布局的供需模型尚未求解：'+(current.reason||current.issues?.map(x=>x.machine+' '+x.reason).join('；')||'未知原因');
   // Necessary bounds are useful only for an unresolved model. Do not
   // substitute them for actual solved rates.
   if(typeof factorySteadyProveRateBounds==='function'){
    const bounds=factorySteadyProveRateBounds(model);
    result.diagnostics.symbolicModel={provenUpperBounds:{
     completed:bounds.completed,
     machineCycleUpper:Object.fromEntries(Object.entries(bounds.upper).filter(([k])=>k.startsWith('cycles:')).map(([k,v])=>[k.slice(7),v])),
     routeItemUpper:Object.fromEntries(Object.entries(bounds.upper).filter(([k])=>k.startsWith('flow:')).map(([k,v])=>[k.slice(5),v]))
    }};
   }
  }
  if(!model.warehousePools.some(p=>p.withdrawalMachineOrder.length)){
   if(current.status==='conditional-fixed-point')
    result.overdraftNet=Object.fromEntries([...new Set([...Object.keys(current.inflow),...Object.keys(current.outflow)])].map(k=>[k,(current.inflow[k]||0)-(current.outflow[k]||0)]));
  }else{
   const unlimited=factorySteadyAutomaticFluidBudget(state,model,{unlimitedWarehouse:true});
   result.unlimitedStockBudget=unlimited;
   if(unlimited.status==='conditional-fixed-point')
    result.overdraftNet=Object.fromEntries([...new Set([...Object.keys(unlimited.inflow),...Object.keys(unlimited.outflow)])].map(k=>[k,(unlimited.inflow[k]||0)-(unlimited.outflow[k]||0)]));
  }
 }catch(error){result.notice='数学模型尚未求解：'+error.message;result.conditionalBudget={status:'unresolved',reason:error.message};}
 return result;
}
function steadyDisplayRateBudget(budget){
 if(budget?.diagnostics?.certified===true)return budget;
 if(budget?.conditionalBudget?.status==='conditional-fixed-point')return budget.conditionalBudget;
 // Legacy exact-rate callers and isolated geometry tests supply a budget
 // without diagnostics; never accept a declared unresolved budget.
 if(budget&&!budget.error&&!budget.diagnostics&&budget.machineCycles)return budget;
 return null;
}
function portSteadyRate(m,port){
 const r=routeFor(m.id,port.kind==='in'?'in':'out',port.index);
 if(!r)return 0;
 return Object.values(steadyDisplayRateBudget(theoreticalBudget)?.routeFlows?.[r.id]||{}).reduce((sum,x)=>sum+x,0)*60;
}
// Certified route rates are kept in items/s and shown as items/min in the inspector.
function steadyPortFlowDetails(m,p,theory){
 const route=routeFor(m.id,p.kind==='in'?'in':'out',p.index);
 const valid=!!route&&!!route.to&&!checkPath(route.path,route.from,route.to,route.id);
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
   const target=route.to&&machineById(route.to.id);
   if(target&&acceptsMaterial(target,item,route.to.port))materials.add(item);
  }
 }
 return {port:p,route,valid,flows,materials};
}
function steadyFlowTotal(flows){return Object.values(flows).reduce((total,n)=>total+n,0);}
function steadyFlowMaterialRows(flows,materials){
 const all=new Set([...materials,...Object.keys(flows)]);
 const ordered=[...all].filter(Boolean).sort(factoryItemCompare);
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
 const theory=steadyDisplayRateBudget(theoreticalBudget);
 if(!theory){
  return `<div class="item machine-theory" id="inspectorTheory"><div class="machine-analysis-title"><strong>稳态理论</strong></div><div class="tiny">${esc(theoreticalBudget?.notice||theoreticalBudget?.error||'已建立流量方程，当前机器的唯一长期速率仍待证明')}</div>${machineSteadyDemandEquationsMarkup(m)}</div>`;
 }
 const ports=getPorts(m),junction=m.type==='分流'||m.type==='汇流';
 const details=ports.map(p=>steadyPortFlowDetails(m,p,theory));
 const rate=v=>(Math.max(0,v)*60).toFixed(2);
 const recipe=getRecipe(m);
 const duty=recipe?Math.max(0,Math.min(1,theory.machineDuty?.[m.id]??(theory.machineCycles?.[m.id]||0)*recipe.seconds)):null;
 const dutyInfo=recipe?`<div class="machine-duty-grid">
  <div><span>理论运行占空比</span><b>${(duty*100).toFixed(2)}%</b></div>
  <div><span>等效停机比例</span><b>${((1-duty)*100).toFixed(2)}%</b></div>
 </div>`:'';
 const kinds=[['in','输入','in'],['out','输出','out']];
 let tiles='',breakdown='';
 for(const [kind,heading,cls] of kinds){
  const subset=details.filter(d=>d.port.kind===kind),amounts={},known=new Set();
  for(const item of subset){
   for(const [name,n] of Object.entries(item.flows))amounts[name]=(amounts[name]||0)+n;
   for(const material of item.materials)known.add(material);
  }
  const total=rate(steadyFlowTotal(amounts));
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
     <div class="kv"><b>${esc(steadyFlowPortLabel(m,p))}</b><b>${rate(steadyFlowTotal(d.flows))} 件/分</b></div>
     <div class="port-muted">${stateText}${filter}</div>
     ${steadyFlowMaterialRows(d.flows,d.materials)}
    </div>`;
   }
  }
  breakdown+=`<section class="machine-port-details-section"><div class="machine-port-details-heading">${heading}接口 · ${subset.length} 个</div>${rows}</section>`;
 }
 return `<div class="item machine-theory" id="inspectorTheory">
  <div class="machine-analysis-title"><strong>稳态理论</strong><span class="analysis-unit">${theory.status==='conditional-fixed-point'?'条件解 · ':''}件/分钟</span></div>
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
