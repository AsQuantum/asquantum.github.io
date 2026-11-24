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

// Certified rates and explicitly marked conditional mathematical candidates are separate; unresolved is not zero.
const WAREHOUSE_NET_WINDOWS=[1,10,30,60];
let warehouseNetWindowMinutes=10;
function warehouseSetNetWindow(value){
 const minutes=Number(value);
 if(!WAREHOUSE_NET_WINDOWS.includes(minutes))return false;
 warehouseNetWindowMinutes=minutes;
 warehouseRefreshLive();
 return true;
}
function warehouseTotalRow(income,expense,netCell,stock=null){
 return '<tr class="ledger-total"><td class="ledger-name">总计</td><td>'+income+
  '</td><td>'+expense+'</td>'+netCell+(stock===null?'':'<td>'+stock+'</td>')+'</tr>';
}
function warehouseView(theoryRows=false){
 if(theoreticalBudget===null)theoreticalBudget=warehouseTheory();
 const budget=theoreticalBudget||{inflow:{},outflow:{}};
 const conditional=budget.diagnostics?.certified!==true&&budget.conditionalBudget?.status==='conditional-fixed-point';
 const displayBudget=conditional?budget.conditionalBudget:budget;
 const potentialNet=displayBudget.potentialNet??null,overdraftNet=budget.overdraftNet??null;
 const materialSet=new Set([...Object.keys(displayBudget.inflow||{}),...Object.keys(displayBudget.outflow||{}),
  ...Object.keys(potentialNet||{}),...Object.keys(overdraftNet||{}),
  ...Object.keys(ware||{}),
  ...Object.keys(sim?.inbound||{}),...Object.keys(sim?.outbound||{}),
  ...(budget?.diagnostics?.symbolicModel?.warehouseSupernodes?.nodes||[]).map(x=>x.item),
  ...state.machines.filter(m=>m.type==='仓出').map(m=>m.item).filter(Boolean),
  ...state.machines.filter(m=>m.type==='仓入').map(m=>m.inletItem).filter(Boolean)]);
 const materials=[...materialSet].filter(Boolean).sort(factoryItemCompare);
 const theoryCertified=budget?.diagnostics?.certified===true;
 const tRows=theoryRows?materials.map(mat=>{
  const name='<td class="ledger-name" title="'+esc(mat)+'">'+ledgerMaterialLabel(mat)+'</td>';
  const unrestricted=potentialNet?ledgerNetCell((potentialNet[mat]||0)*60):'<td>—</td>';
  const overdraft=overdraftNet?ledgerNetCell((overdraftNet[mat]||0)*60):'<td>—</td>';
  if(!theoryCertified&&!conditional)return '<tr>'+name+'<td>—</td><td>—</td><td>—</td>'+unrestricted+overdraft+'</tr>';
  const inc=(displayBudget.inflow[mat]||0)*60,out=(displayBudget.outflow[mat]||0)*60;
  return '<tr>'+name+'<td>'+ledgerNumber(inc)+'</td><td>'+ledgerNumber(out)+'</td>'+ledgerNetCell(inc-out)+unrestricted+overdraft+'</tr>';
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
 const elapsedMinutes=Math.floor((simTime+1e-7)/60);
 const finished=elapsedMinutes>0?sim?.minuteBuckets?.[elapsedMinutes-1]:null;
 const showBucket=finished||{inbound:{},outbound:{}};
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
 return {budget,conditional,materials,tRows,theoryTotal,elapsedMinutes,showBucket,recentBuckets,
  windowMinutes,windowReady,windowTotals,totalsIn,totalsOut,
  tenMinuteReady:windowReady,tenMinuteTotals:windowTotals};
}
function warehouseSummaryMarkup(v){
 return '<div id="warehouseLiveSummary" class="ledger-mini"><div><span>模拟时间</span><b>'+
 (simTime/60).toFixed(1)+'分</b></div><div><span>仓库累计进 / 出</span><b>'+
 v.totalsIn+' / '+v.totalsOut+'</b></div></div>';
}
function warehouseActualMarkup(v){
 const aRows=v.materials.map(mat=>{
  const inc=v.showBucket.inbound[mat]||0,out=v.showBucket.outbound[mat]||0;
  const sample=v.windowTotals[mat]||{inbound:0,outbound:0};
  const netCell=v.windowReady?ledgerNetCell((sample.inbound-sample.outbound)/v.windowMinutes):
   '<td title="尚未累计完整的'+v.windowMinutes+'分钟窗口">—</td>';
  return '<tr><td class="ledger-name" title="'+esc(mat)+'">'+ledgerMaterialLabel(mat)+
   '</td><td>'+inc+'</td><td>'+out+'</td>'+netCell+'<td>'+(ware[mat]||0)+'</td></tr>';
 }).join('');
 const income=v.materials.reduce((sum,mat)=>sum+(v.showBucket.inbound[mat]||0),0);
 const expense=v.materials.reduce((sum,mat)=>sum+(v.showBucket.outbound[mat]||0),0);
 const stock=v.materials.reduce((sum,mat)=>sum+(ware[mat]||0),0);
 const net=v.materials.reduce((sum,mat)=>{
  const x=v.windowTotals[mat]||{inbound:0,outbound:0};
  return sum+x.inbound-x.outbound;
 },0);
 const total=warehouseTotalRow(income,expense,
  v.windowReady?ledgerNetCell(net/v.windowMinutes):'<td>—</td>',stock);
 const history=v.recentBuckets.map(bucket=>{
  const iCount=Object.values(bucket.inbound).reduce((sum,n)=>sum+n,0);
  const oCount=Object.values(bucket.outbound).reduce((sum,n)=>sum+n,0);
  return '<tr><td>第'+bucket.minute+'分钟</td><td>'+iCount+'</td><td>'+oCount+'</td>'+ledgerNetCell(iCount-oCount)+'</tr>';
 }).join('');
 const windowOptions=WAREHOUSE_NET_WINDOWS.map(n=>'<option value="'+n+'"'+
  (n===v.windowMinutes?' selected':'')+'>'+n+'m</option>').join('');
 return '<div id="warehouseLiveActual" class="ledger-panel">'+
  '<div class="ledger-head"><strong>实际收支</strong>'+
  '<button type="button" class="warehouse-stock-toggle" data-stock-chart-open title="查看仓库存量随模拟时间变化">▤ 库存趋势</button>'+
  '<span class="ledger-chip">'+(v.windowReady?'近'+v.windowMinutes+'分钟':v.elapsedMinutes>0?
    '已完成'+v.elapsedMinutes+'/'+v.windowMinutes+'分钟':'等待首个完整分钟')+'</span></div>'+
  '<div class="warehouse-net-window-row"><label class="warehouse-net-window" for="warehouseNetWindow">净值窗口 <select id="warehouseNetWindow" aria-label="实际收支净值计算窗口">'+windowOptions+'</select></label></div>'+
  '<div class="ledger-table-scroll" tabindex="0" aria-label="实际收支表，可横向滚动"><table class="ledger-table"><thead><tr><th>物品</th><th title="上一完整分钟入库量">收入</th>'+
  '<th title="上一完整分钟出库量">支出</th><th title="最近'+v.windowMinutes+
  '个完整分钟的平均每分钟净收支（件/分钟）">净值</th><th>库存</th></tr></thead>'+
  '<tbody>'+(aRows||'<tr><td colspan="5">仓库暂无材料</td></tr>')+
  total+'</tbody></table></div>'+
  (history?'<details class="warehouse-recent-history"><summary class="tiny">最近'+v.recentBuckets.length+'分钟记录</summary>'+
   '<div class="ledger-table-scroll" tabindex="0" aria-label="分钟记录，可横向滚动"><table class="ledger-table"><thead><tr><th>分钟</th><th>收入</th><th>支出</th><th>净值</th></tr></thead><tbody>'+
   history+'</tbody></table></div></details>':'')+'</div>';
}
function warehouseRefresh(){
 const v=warehouseView(true),budget=v.budget;
 $('warehouse').innerHTML=warehouseSummaryMarkup(v)+`<div class="ledger-panel"><div class="ledger-head"><strong>理论收支</strong><span class="ledger-chip">${v.conditional?"条件解 · 件/分钟":"件/分钟"}</span></div>
 <div class="ledger-table-scroll" tabindex="0" aria-label="理论收支表，可横向滚动"><table class="ledger-table"><thead><tr><th>材料</th><th>收入</th><th>支出</th><th>净值</th><th title="保持当前稳态收入及其他供需不变，收入减去各仓出的下游需求（解除仓库缺货限制，可为负）">潜在净值</th><th title="所有仓出不限库存，重新联立求解整个生产网络的新平衡点：收入减支出">透支净值</th></tr></thead><tbody>${v.tRows||'<tr><td colspan="6">暂无有效仓库物流</td></tr>'}${v.theoryTotal}</tbody></table></div>
 </div>`+warehouseActualMarkup(v);
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
