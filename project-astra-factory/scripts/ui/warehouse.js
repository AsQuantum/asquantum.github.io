'use strict';
// 以事件计数记录真实逐件入库/出库，而不是以物料路径推断实际收入。
function recordWarehouseMovement(direction,item,count=1){
 if(!sim)return;
 const bucketIndex=typeof simMinuteIndex==='function'?simMinuteIndex():Math.max(0,Math.floor((simTime-1e-7)/60));
 const bucket=sim.minuteBuckets[bucketIndex]||(sim.minuteBuckets[bucketIndex]={inbound:{},outbound:{}});
 bucket[direction][item]=(bucket[direction][item]||0)+count;
}
function ledgerNumber(v,decimals=2){return Number(v||0).toFixed(decimals);}
function ledgerMaterialLabel(item){
 return '<span aria-hidden="true" style="color:'+materialColor(item)+'">●</span> '+esc(item);
}
function ledgerNetCell(net){net=Math.abs(Number(net)||0)<0.005?0:Number(net);return `<td class="${net>1e-8?'positive':net<-1e-8?'negative':''}">${net>1e-8?'+':''}${ledgerNumber(net)}</td>`;}

// Certified rates and explicitly marked conditional mathematical candidates are separate; unresolved is not zero.
const WAREHOUSE_NET_WINDOWS=[1,10,30,60];
let warehouseNetWindowMinutes=10,warehouseActualMode='rate';
const WAREHOUSE_ACTUAL_MODE_KEY='factory_lab_warehouse_actual_mode_v1';
try{if(localStorage.getItem(WAREHOUSE_ACTUAL_MODE_KEY)==='count')warehouseActualMode='count'}catch(e){}
const WAREHOUSE_NET_WINDOW_KEY='factory_lab_warehouse_net_window_v1';
try{const saved=Number(localStorage.getItem(WAREHOUSE_NET_WINDOW_KEY));if(WAREHOUSE_NET_WINDOWS.includes(saved))warehouseNetWindowMinutes=saved;}catch(e){}
function warehouseSetNetWindow(value){
 const minutes=Number(value);
 if(!WAREHOUSE_NET_WINDOWS.includes(minutes))return false;
 warehouseNetWindowMinutes=minutes;
 try{localStorage.setItem(WAREHOUSE_NET_WINDOW_KEY,String(minutes));}catch(e){}
 warehouseRefreshLive();
 return true;
}
function warehouseSetActualMode(value){
 if(value!=='rate'&&value!=='count')return false;
 warehouseActualMode=value;
 try{localStorage.setItem(WAREHOUSE_ACTUAL_MODE_KEY,value)}catch(e){}
 warehouseRefreshLive();
 return true;
}
function warehouseTotalRow(income,expense,netCell,stock=null){
 return '<tr class="ledger-total"><td class="ledger-name">总计</td><td>'+income+
  '</td><td>'+expense+'</td>'+netCell+(stock===null?'':'<td>'+stock+'</td>')+'</tr>';
}
function warehouseView(theoryRows=false){
 if(theoreticalBudget===null)theoreticalBudget=typeof requestTheoryBudget==='function'?requestTheoryBudget():warehouseTheory();
 const budget=theoreticalBudget||{inflow:{},outflow:{}};
 const conditional=budget.diagnostics?.certified!==true&&['conditional-exact','conditional-fixed-point'].includes(budget.conditionalBudget?.status);
 const displayBudget=conditional?budget.conditionalBudget:budget;
 const potentialNet=displayBudget.potentialNet??null,overdraftNet=budget.overdraftNet??null;
 // Theory follows current structural boundary, actual ledger retains history.
 const materials=[...new Set(budget.warehouseItems||[])].filter(Boolean).sort(factoryItemCompare);
 const actualMaterials=[...new Set([...materials,...Object.keys(ware||{}),...Object.keys(sim?.inbound||{}),...Object.keys(sim?.outbound||{})])].filter(Boolean).sort(factoryItemCompare);
 const theoryCertified=budget?.diagnostics?.certified===true;
 const exactRate=(xs,k)=>xs&&Object.hasOwn(xs,k)?xs[k]:null;
 const directNet=v=>v===null||v===undefined?'<td title="尚未求得结果，不代表零">—</td>':ledgerNetCell(v*60);
 const directNumber=v=>v===null||v===undefined?'—':ledgerNumber(v*60);
 const tRows=theoryRows?materials.map(mat=>{
  const name='<td class="ledger-name" title="'+esc(mat)+'">'+ledgerMaterialLabel(mat)+'</td>';
  if(budget.direct){
   const absent=!(budget.warehouseItems||[]).includes(mat), read=(xs)=>absent&&conditional?0:exactRate(xs,mat);
   const breakdown=direction=>{if(!state.frozenFactories?.length)return '';const local=direction==='inflow'?displayBudget.localInflow:displayBudget.localOutflow,frozen=direction==='inflow'?displayBudget.frozenInflow:displayBudget.frozenOutflow;return ' title="当前工厂 '+directNumber(read(local))+'；冻结工厂 '+directNumber(read(frozen))+' 件/分钟"';};
   return '<tr>'+name+'<td'+breakdown('inflow')+'>'+directNumber(read(displayBudget.inflow))+'</td><td'+breakdown('outflow')+'>'+directNumber(read(displayBudget.outflow))+'</td>'+directNet(read(displayBudget.net))+directNet(read(potentialNet))+directNet(read(overdraftNet))+'</tr>';
  }
  const unrestricted=potentialNet?ledgerNetCell((potentialNet[mat]||0)*60):'<td>—</td>';
  const overdraft=overdraftNet?ledgerNetCell((overdraftNet[mat]||0)*60):'<td>—</td>';
  if(!theoryCertified&&!conditional)return '<tr>'+name+'<td>—</td><td>—</td><td>—</td>'+unrestricted+overdraft+'</tr>';
  const inc=(displayBudget.inflow[mat]||0)*60,out=(displayBudget.outflow[mat]||0)*60;
  const breakdown=(direction)=>{const local=direction==='inflow'?displayBudget.localInflow:displayBudget.localOutflow,frozen=direction==='inflow'?displayBudget.frozenInflow:displayBudget.frozenOutflow;if(!frozen||!state.frozenFactories?.length)return '';return ' title="当前工厂 '+ledgerNumber((local?.[mat]||0)*60)+'；冻结工厂 '+ledgerNumber((frozen[mat]||0)*60)+' 件/分钟"';};
  return '<tr>'+name+'<td'+breakdown('inflow')+'>'+ledgerNumber(inc)+'</td><td'+breakdown('outflow')+'>'+ledgerNumber(out)+'</td>'+ledgerNetCell(inc-out)+unrestricted+overdraft+'</tr>';
 }).join(''):'';
 let theoryTotal=warehouseTotalRow('—','—','<td>—</td>');
 if(theoryCertified||conditional){
  const inc=materials.reduce((sum,item)=>sum+(displayBudget.inflow[item]||0)*60,0);
  const out=materials.reduce((sum,item)=>sum+(displayBudget.outflow[item]||0)*60,0);
  theoryTotal=warehouseTotalRow(ledgerNumber(inc),ledgerNumber(out),ledgerNetCell(inc-out));
 }
 const unrestrictedTotal=potentialNet?ledgerNetCell(materials.reduce((sum,item)=>sum+(potentialNet[item]||0)*60,0)):'<td>—</td>';
 const overdraftTotal=overdraftNet?ledgerNetCell(materials.reduce((sum,item)=>sum+(overdraftNet[item]||0)*60,0)):'<td>—</td>';
 theoryTotal=theoryTotal.replace('</tr>',unrestrictedTotal+overdraftTotal+'</tr>');
 if(budget.direct){const t=displayBudget.totals||{};theoryTotal=warehouseTotalRow(directNumber(t.inflow),directNumber(t.outflow),directNet(t.net)).replace('</tr>',directNet(t.potential)+directNet(budget.overdraftTotal)+'</tr>');}
 const elapsedMinutes=Math.floor((simTime+1e-7)/60);
 const totalsIn=Object.values(sim?.inbound||{}).reduce((a,b)=>a+b,0);
 const totalsOut=Object.values(sim?.outbound||{}).reduce((a,b)=>a+b,0);
 const windowMinutes=warehouseNetWindowMinutes;
 const windowReady=elapsedMinutes>=windowMinutes;
 // Count only completed minute buckets; skipped buckets mean no movement.
 // Current partial and future buckets are excluded from the rolling window.
 const windowTotals={};
 if(windowReady){
  const buckets=sim?.minuteBuckets||[];
  for(let minute=elapsedMinutes-windowMinutes;minute<elapsedMinutes;minute++){
   const entry=buckets[minute];
   if(!entry)continue;
   for(const [item,count] of Object.entries(entry.inbound||{})){
    const total=windowTotals[item]??={inbound:0,outbound:0};total.inbound+=count;
   }
   for(const [item,count] of Object.entries(entry.outbound||{})){
    const total=windowTotals[item]??={inbound:0,outbound:0};total.outbound+=count;
   }
  }
 }
 const recentBuckets=[];
 for(let minute=Math.max(0,elapsedMinutes-12);minute<elapsedMinutes;minute++){
  const data=sim?.minuteBuckets?.[minute];
  recentBuckets.push({minute:minute+1,inbound:data?.inbound||{},outbound:data?.outbound||{}});
 }
 return {budget,conditional,materials,actualMaterials,tRows,theoryTotal,elapsedMinutes,recentBuckets,
  windowMinutes,windowReady,windowTotals,totalsIn,totalsOut,actualMode:warehouseActualMode,
  cumulativeIn:sim?.inbound||{},cumulativeOut:sim?.outbound||{},
  tenMinuteReady:windowReady,tenMinuteTotals:windowTotals};
}
function warehouseSummaryMarkup(v){
 return '<div id="warehouseLiveSummary" class="ledger-mini"><div><span>'+((typeof orchestraTheme!=='undefined'&&orchestraTheme.panelPreview)?'音游预演时间':'模拟时间')+'</span><b>'+
 (simTime/60).toFixed(1)+'分</b></div><div><span>仓库累计进 / 出</span><b>'+
 v.totalsIn+' / '+v.totalsOut+'</b></div></div>';
}
function warehouseActualMarkup(v){
 const missingTitle='尚未累计完整的'+v.windowMinutes+'分钟窗口';
 const missingCell='<td title="'+missingTitle+'">—</td>';
 const rateText=count=>v.windowReady?ledgerNumber(count/v.windowMinutes):'—';
 const countMode=v.actualMode==='count';
 const flowText=(count,total)=>countMode?String(total):rateText(count);
 const flowCell=(count,total)=>countMode||v.windowReady?'<td>'+flowText(count,total)+'</td>':missingCell;
 const aRows=v.actualMaterials.map(mat=>{
  const sample=v.windowTotals[mat]||{inbound:0,outbound:0};
  const netCell=v.windowReady?ledgerNetCell((sample.inbound-sample.outbound)/v.windowMinutes):missingCell;
  return '<tr data-orch-item="'+esc(mat)+'"><td class="ledger-name" title="'+esc(mat)+'">'+ledgerMaterialLabel(mat)+
   '</td>'+flowCell(sample.inbound,v.cumulativeIn[mat]||0)+flowCell(sample.outbound,v.cumulativeOut[mat]||0)+netCell+'<td data-orch-stock title="拆除返库累计 '+(sim?.editReturns?.[mat]||0)+' 件（不计入常规收入）">'+(ware[mat]||0)+'</td></tr>';
 }).join('');
 const income=v.actualMaterials.reduce((sum,mat)=>sum+(v.windowTotals[mat]?.inbound||0),0);
 const expense=v.actualMaterials.reduce((sum,mat)=>sum+(v.windowTotals[mat]?.outbound||0),0);
 const stock=v.actualMaterials.reduce((sum,mat)=>sum+(ware[mat]||0),0);
 const total=warehouseTotalRow(flowText(income,v.totalsIn),flowText(expense,v.totalsOut),
  v.windowReady?ledgerNetCell((income-expense)/v.windowMinutes):missingCell,stock);
 const history=v.recentBuckets.map(bucket=>{
  const iCount=Object.values(bucket.inbound).reduce((sum,n)=>sum+n,0);
  const oCount=Object.values(bucket.outbound).reduce((sum,n)=>sum+n,0);
  return '<tr><td>第'+bucket.minute+'分钟</td><td>'+iCount+'</td><td>'+oCount+'</td>'+ledgerNetCell(iCount-oCount)+'</tr>';
 }).join('');
 const flowTitle=direction=>countMode?'本次模拟累计'+direction+'量（件，含当前未完成分钟）':'最近'+v.windowMinutes+'个完整分钟的平均'+direction+'量（件/分钟）';
 const modeButtons='<div class="warehouse-actual-mode" role="group" aria-label="收入支出显示方式">'+
  ['rate','count'].map(mode=>'<button type="button" data-warehouse-mode="'+mode+'" aria-pressed="'+(v.actualMode===mode)+'" title="'+(mode==='rate'?'完整窗口平均件/分钟':'本次模拟累计件数')+'">'+(mode==='rate'?'速率':'数量')+'</button>').join('')+'</div>';
 const windowOptions=WAREHOUSE_NET_WINDOWS.map(n=>'<option value="'+n+'"'+
  (n===v.windowMinutes?' selected':'')+'>'+n+'m</option>').join('');
 return '<div id="warehouseLiveActual" class="ledger-panel">'+
  '<div class="ledger-head">'+(typeof ledgerCollapseButton==='function'?ledgerCollapseButton('actual','实际收支'):'<strong>实际收支</strong>')+
  '<button type="button" class="warehouse-stock-toggle" data-stock-chart-open title="查看仓库存量随模拟时间变化">▤ 库存趋势</button>'+
  '<span class="ledger-chip">'+(v.windowReady?'近'+v.windowMinutes+'分钟':v.elapsedMinutes>0?
    '已完成'+v.elapsedMinutes+'/'+v.windowMinutes+'分钟':'等待首个完整分钟')+'</span></div>'+
  '<div class="ledger-card-body"'+(typeof warehouseCardOpen!=='undefined'&&!warehouseCardOpen.actual?' hidden':'')+'><div class="warehouse-net-window-row"><label class="warehouse-net-window" for="warehouseNetWindow">净值窗口 <select id="warehouseNetWindow" aria-label="实际收支速率计算窗口">'+windowOptions+'</select></label>'+modeButtons+'</div>'+
  '<div class="ledger-table-scroll" tabindex="0" aria-label="实际收支表，可横向滚动"><table class="ledger-table"><thead><tr><th>物品</th><th title="'+flowTitle('入库')+'">收入</th>'+
  '<th title="'+flowTitle('出库')+'">支出</th><th title="最近'+v.windowMinutes+
  '个完整分钟的平均每分钟净收支（件/分钟）">净值</th><th>库存</th></tr></thead>'+
  '<tbody>'+(aRows||'<tr><td colspan="5">仓库暂无材料</td></tr>')+
  total+'</tbody></table></div>'+
  (history?'<details class="warehouse-recent-history"><summary class="tiny">最近'+v.recentBuckets.length+'分钟记录</summary>'+
   '<div class="ledger-table-scroll" tabindex="0" aria-label="分钟记录，可横向滚动"><table class="ledger-table"><thead><tr><th>分钟</th><th>收入</th><th>支出</th><th>净值</th></tr></thead><tbody>'+
   history+'</tbody></table></div></details>':'')+'</div></div>';
}
// Expose partial-proof diagnostics separately from mathematical rates.
function theorySolutionLabel(b){
 const kind=b.diagnostics?.solutionMethod?.kind;
 const label=kind==='mixed'?'迭代+精确解':kind==='analytic'?'精确解':kind==='iteration'?'迭代解':'未求解';
 return b.status==='iteration-partial'&&kind&&kind!=='unknown'?'部分'+label:label;
}
// Preserve the original wall time on cache hits, not cache lookup latency.
function theorySolutionChip(b){
 const label=theorySolutionLabel(b),d=b.diagnostics||{},ms=d.wallElapsedMs??d.elapsedMs;
 if((d.solutionMethod?.kind==='iteration'||d.solutionMethod?.kind==='mixed')&&Number.isFinite(ms)&&ms>=0)
  return label+' · 用时'+(ms/1000).toFixed(3)+'s · 件/分钟';
 return label+' · 件/分钟';
}
function theoryDiagnosticsMarkup(b,expanded=false){
 const d=b.diagnostics||{},q=x=>x?x.known+'/'+x.total:'—';
 const rev=typeof THEORY_REVISION==='undefined'?'未加载':THEORY_REVISION;
 if(b.calculating)return '';
 const summary='数学方法：'+theorySolutionLabel(b)+' · '+rev;
 const names={'independent-frozen-full-service':'独立冻结满负荷','frozen-empty-no-source':'冻结空启动无源零解','frozen-strict-surplus':'冻结严格供料盈余证明','autonomous-batch-warehouse-renewal':'自主批次生产公式','empty-start-no-source':'空启动无源结构零','finite-buffer-sinkless-dag':'无消费终点的有界无环网络','production-tree-event-graph':'有限缓存生产树事件图','production-tree-structural-zero':'缺料或堵塞生产树结构零'};
 const methods=d.solutionMethod?.methods||[];
 const detail='实际 '+q(d.actualQueries)+'；透支 '+q(d.unlimitedQueries)+'；未解字段 '+(d.unknownMetrics?.length??'—')+
  ((d.wallElapsedMs??d.elapsedMs)==null?'':'；'+(d.cacheHit?'缓存命中（原耗时 ':'耗时 ')+Math.round(d.wallElapsedMs??d.elapsedMs)+'ms'+(d.cacheHit?'）':''))+
  (methods.length?'；精确方法：'+methods.map(m=>names[m]||m).join('、'):'')+(d.componentCacheHits?'；复用独立组件 '+d.componentCacheHits:'')+(d.proofSearchLimited?'；迭代预算受限':'')+(d.searchStats?'；峰值检查点 '+d.searchStats.peakCheckpoints+'；跳过空闲 tick '+d.searchStats.quietTicks+'；循环快进 tick '+d.searchStats.loopTicks:'');
 const reason=b.failure?b.notice:b.status==='iteration-partial'?(d.proofSearchLimited?'周期搜索受资源预算限制，未知值保留为 —。':'当前迭代未求得全部查询。'):'';
 return '<details class="tiny theory-diagnostics"'+(expanded?' open':'')+'><summary>'+esc(summary)+'</summary><div>'+esc(detail)+'</div>'+
  (reason?'<div role="status">'+esc(reason)+'</div>':'')+
  (d.componentErrors?.length?'<div role="status">'+esc('部分组件计算异常：'+d.componentErrors.join('；'))+'</div>':'')+
  (d.recoveredProofErrors?.length?'<div>'+esc('可选优化异常，已尝试新版迭代：'+d.recoveredProofErrors.join('；'))+'</div>':'')+
  (b.failure||b.status==='iteration-partial'?'<button type="button" data-theory-retry>重新计算</button>':'')+'</details>';
}
function theoryProgressMarkup(b){
 if(!b.calculating||!theoryJob)return '';
 const max=theoryJob.budgetMs,elapsed=Math.min(max,Math.max(0,performance.now()-theoryJob.started));
 return '<div class="theory-progress" data-theory-progress><div class="theory-progress-caption"><span>'+(b.background?'后台计算中':'计算中')+'</span><span data-theory-elapsed>'+(elapsed/1000).toFixed(1)+' / '+(max/1000)+'s</span></div><progress aria-label="理论计算已用时间（非求解完成百分比）" max="'+max+'" value="'+elapsed+'"></progress></div>';
}
function updateTheoryProgress(){
 const el=$('warehouse')?.querySelector('[data-theory-progress]'),job=theoryJob;
 if(!el||!job)return;
 const elapsed=Math.min(job.budgetMs,Math.max(0,performance.now()-job.started));
 el.querySelector('progress').value=elapsed;
 el.querySelector('[data-theory-elapsed]').textContent=(elapsed/1000).toFixed(1)+' / '+(job.budgetMs/1000)+'s';
}
function warehouseRefresh(){
 if(typeof orchestraTheme!=='undefined'&&orchestraTheme.rhythm?.active&&!orchestraTheme.panelPreview)orchestraTheme.panelRefreshNeeded=true;
 const expanded=!!$('warehouse').querySelector('.theory-diagnostics')?.open;
 const v=warehouseView(true),budget=v.budget;
 $('warehouse').innerHTML=warehouseSummaryMarkup(v)+(typeof frozenFactoriesMarkup==='function'?frozenFactoriesMarkup(v):'')+`<div class="ledger-panel"><div class="ledger-head">${typeof ledgerCollapseButton==='function'?ledgerCollapseButton('theory','长期理论收支'):'<strong>长期理论收支</strong>'}<span class="ledger-chip">${budget.calculating?(budget.background?"后台计算中…":"计算中…"):budget.failure?(budget.failure==="timeout"?"计算超时":budget.failure==="contradiction"?"约束矛盾":budget.failure==="unsupported"?"模型不支持":"计算失败"):budget.proofMode==="strict-counts"?theorySolutionChip(budget):budget.calculationTimedOut?(v.conditional?"条件解 · 透支超时":"计算超时"):v.conditional?"条件解 · 件/分钟":budget.status==="modelled-unresolved"&&v.materials.length?"未求解 · 件/分钟":"件/分钟"}</span></div>
 <div class="ledger-card-body"${typeof warehouseCardOpen!=='undefined'&&!warehouseCardOpen.theory?' hidden':''}>${theoryProgressMarkup(budget)}<div class="ledger-table-scroll" tabindex="0" aria-label="长期理论收支表，单位件/分钟，可横向滚动"><table class="ledger-table"><thead><tr><th>材料</th><th>收入</th><th>支出</th><th>净值</th><th title="当前实际收入 − 当前服务边界下的有效需求；计入传送带、加工、缓存和竞争，不重新求解仓库稳态。负值表示未满足需求">潜在净值</th><th title="允许所有仓库库存为负，重新求解全网络长期流率：新收入 − 新支出">透支净值</th></tr></thead><tbody>${v.tRows||'<tr><td colspan="6">暂无有效仓库物流</td></tr>'}${v.theoryTotal}</tbody></table></div>
 ${theoryDiagnosticsMarkup(budget,expanded)}
 </div></div>`+warehouseActualMarkup(v);
 if(typeof orchestraTheme!=='undefined'&&orchestraTheme.rhythm?.active&&!orchestraTheme.panelPreview)orchestraTheme.refreshRhythmWarehouse?.();
}
// When folded, skip both DOM work and formatting until the panel is opened.
function warehouseRefreshLive(){
 if(typeof orchestraTheme!=='undefined'&&orchestraTheme.rhythm?.active&&!orchestraTheme.panelPreview)return;
 const panel=$('warehousePanel');
 if(panel&&!panel.open)return;
 const summary=$('warehouseLiveSummary'),actual=$('warehouseLiveActual');
 if(!summary||!actual){warehouseRefresh();return;}
 const v=warehouseView(false);
 syncLiveMarkup(summary,warehouseSummaryMarkup(v));
 if(typeof warehouseCardOpen==='undefined'||warehouseCardOpen.actual)syncLiveMarkup(actual,warehouseActualMarkup(v));
 if(typeof frozenRefreshLive==='function'&&warehouseCardOpen.frozen&&!(typeof orchestraTheme!=='undefined'&&orchestraTheme.panelPreview))frozenRefreshLive(v);
}
