'use strict';
// 以事件计数记录真实逐件入库/出库，而不是以物料路径推断实际收入。
function recordWarehouseMovement(direction,item){
 if(!sim)return;
 const bucketIndex=Math.max(0,Math.floor((simTime-1e-7)/60));
 const bucket=sim.minuteBuckets[bucketIndex]||(sim.minuteBuckets[bucketIndex]={inbound:{},outbound:{}});
 bucket[direction][item]=(bucket[direction][item]||0)+1;
}
function ledgerNumber(v,decimals=2){return Number(v||0).toFixed(decimals);}
function ledgerMaterialLabel(item){
 return '<span aria-hidden="true" style="color:'+materialColor(item)+'">●</span> '+esc(item);
}
function ledgerNetCell(net){net=Math.abs(Number(net)||0)<0.005?0:Number(net);return `<td class="${net>1e-8?'positive':net<-1e-8?'negative':''}">${net>1e-8?'+':''}${ledgerNumber(net)}</td>`;}

// Static theory is assembled only on layout changes. Simulation ticks update
// summary and actual accounting without rebuilding the selectable theory table.
function warehouseView(theoryRows=false){
 if(theoreticalBudget===null)theoreticalBudget=warehouseTheory();
 const budget=theoreticalBudget||{inflow:{},outflow:{}};
 const materialSet=new Set([...Object.keys(budget.inflow||{}),...Object.keys(budget.outflow||{}),...Object.keys(ware||{}),
  ...Object.keys(sim?.inbound||{}),...Object.keys(sim?.outbound||{}),
  ...state.machines.filter(m=>m.type==='仓出').map(m=>m.item).filter(Boolean),
  ...state.machines.filter(m=>m.type==='仓入').map(m=>m.inletItem).filter(Boolean)]);
 const known=[...MATERIALS,...REQUIRED_STOCK];
 const materials=[...materialSet].filter(Boolean).sort((a,b)=>{
  const ia=known.indexOf(a),ib=known.indexOf(b);
  return (ia<0?999:ia)-(ib<0?999:ib)||a.localeCompare(b,'zh-CN');
 });
 const tRows=theoryRows?materials.map(mat=>{
  const inc=(budget.inflow[mat]||0)*60,out=(budget.outflow[mat]||0)*60;
  return `<tr><td class="ledger-name" title="${esc(mat)}">${ledgerMaterialLabel(mat)}</td><td>${ledgerNumber(inc)}</td><td>${ledgerNumber(out)}</td>${ledgerNetCell(inc-out)}</tr>`;
 }).join(''):'';
 const elapsedMinutes=Math.floor((simTime+1e-7)/60);
 const finished=elapsedMinutes>0?sim?.minuteBuckets?.[elapsedMinutes-1]:null;
 const showBucket=finished||{inbound:{},outbound:{}};
 const totalsIn=Object.values(sim?.inbound||{}).reduce((a,b)=>a+b,0);
 const totalsOut=Object.values(sim?.outbound||{}).reduce((a,b)=>a+b,0);
 const recentBuckets=(sim?.minuteBuckets||[]).slice(Math.max(0,elapsedMinutes-12),elapsedMinutes);
 return {budget,materials,tRows,elapsedMinutes,showBucket,totalsIn,totalsOut,recentBuckets};
}
function warehouseSummaryMarkup(v){
 return `<div id="warehouseLiveSummary" class="ledger-mini"><div><span>模拟时间</span><b>${(simTime/60).toFixed(1)}分</b></div><div><span>仓库累计进 / 出</span><b>${v.totalsIn} / ${v.totalsOut}</b></div></div>`;
}
function warehouseActualMarkup(v){
 const aRows=v.materials.map(mat=>{
  const inc=v.showBucket.inbound[mat]||0,out=v.showBucket.outbound[mat]||0;
  return `<tr><td class="ledger-name" title="${esc(mat)}">${ledgerMaterialLabel(mat)}</td><td>${inc}</td><td>${out}</td>${ledgerNetCell(inc-out)}<td>${ware[mat]||0}</td></tr>`;
 }).join('');
 const history=v.recentBuckets.map((bk,i)=>{
  const minute=v.elapsedMinutes-v.recentBuckets.length+i+1;
  const iCount=Object.values(bk?.inbound||{}).reduce((a,b)=>a+b,0);
  const oCount=Object.values(bk?.outbound||{}).reduce((a,b)=>a+b,0);
  return `<tr><td>第${minute}分钟</td><td>${iCount}</td><td>${oCount}</td>${ledgerNetCell(iCount-oCount)}</tr>`;
 }).join('');
 return `<div id="warehouseLiveActual" class="ledger-panel"><div class="ledger-head"><strong>实际收支</strong><button type="button" class="warehouse-stock-toggle" data-stock-chart-open title="查看仓库存量随模拟时间变化">▤ 库存趋势</button><span class="ledger-chip">${v.elapsedMinutes>0?'第 '+v.elapsedMinutes+' 分钟':'等待首个完整分钟'}</span></div>
 ${v.elapsedMinutes===0?`<div class="ledger-meta">已模拟 ${simTime.toFixed(1)}秒；运行满60秒后显示第一份准确的每分钟记录。可用顶部「+1分钟」快速计算。</div>`:''}
 <table class="ledger-table"><thead><tr><th>材料</th><th>入库</th><th>出库</th><th>净值</th><th>库存</th></tr></thead><tbody>${aRows||'<tr><td colspan="5">仓库暂无材料</td></tr>'}</tbody></table>

 ${history?`<details><summary class="tiny">最近${v.recentBuckets.length}分钟记录</summary><table class="ledger-table"><thead><tr><th>分钟</th><th>收入</th><th>支出</th><th>净值</th></tr></thead><tbody>${history}</tbody></table></details>`:''}</div>`;
}
function warehouseRefresh(){
 const v=warehouseView(true),budget=v.budget;
 $('warehouse').innerHTML=warehouseSummaryMarkup(v)+`<div class="ledger-panel"><div class="ledger-head"><strong>理论收支</strong><span class="ledger-chip">件/分钟</span></div>
 <table class="ledger-table"><thead><tr><th>材料</th><th>收入</th><th>支出</th><th>净值</th></tr></thead><tbody>${v.tRows||'<tr><td colspan="4">暂无有效仓库物流</td></tr>'}</tbody></table>
 ${budget.error?`<div class="ledger-meta"><span class="bad">求解失败：${esc(budget.error)}</span></div>`:""}</div>`+warehouseActualMarkup(v);
}
// When folded, skip both DOM work and formatting until the panel is opened.
function warehouseRefreshLive(){
 const panel=$('warehousePanel');
 if(panel&&!panel.open)return;
 const summary=$('warehouseLiveSummary'),actual=$('warehouseLiveActual');
 if(!summary||!actual){warehouseRefresh();return;}
 const v=warehouseView(false);
 syncLiveMarkup(summary,warehouseSummaryMarkup(v));
 syncLiveMarkup(actual,warehouseActualMarkup(v));
}
