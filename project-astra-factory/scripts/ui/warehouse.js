'use strict';
// 以事件计数记录真实逐件入库/出库，而不是以物料路径推断实际收入。
function recordWarehouseMovement(direction,item){
 if(!sim)return;
 const bucketIndex=Math.max(0,Math.floor((simTime-1e-7)/60));
 const bucket=sim.minuteBuckets[bucketIndex]||(sim.minuteBuckets[bucketIndex]={inbound:{},outbound:{}});
 bucket[direction][item]=(bucket[direction][item]||0)+1;
}
function ledgerNumber(v,decimals=2){return Number(v||0).toFixed(decimals);}
function ledgerNetCell(net){return `<td class="${net>1e-8?'positive':net<-1e-8?'negative':''}">${net>1e-8?'+':''}${ledgerNumber(net)}</td>`;}
function warehouseRefresh(){
 // 把理论值单独显示：它只是静态的乐观估计，不能代替每分钟真实出入库。
 if(theoreticalBudget===null)theoreticalBudget=warehouseTheory();
 const budget=theoreticalBudget||{inflow:{},outflow:{}};
 const materialSet=new Set([...Object.keys(budget.inflow||{}),...Object.keys(budget.outflow||{}),...Object.keys(ware||{}),
  ...Object.keys(sim?.inbound||{}),...Object.keys(sim?.outbound||{}),
  ...state.machines.filter(m=>m.type==='仓出').map(m=>m.item).filter(Boolean)]);
 const known=[...MATERIALS,...REQUIRED_STOCK];
 const materials=[...materialSet].filter(Boolean).sort((a,b)=>{const ia=known.indexOf(a),ib=known.indexOf(b);return (ia<0?999:ia)-(ib<0?999:ib)||a.localeCompare(b,'zh-CN');});
 const tRows=materials.map(mat=>{
  const inc=(budget.inflow[mat]||0)*60,out=(budget.outflow[mat]||0)*60;
  return `<tr><td class="ledger-name" title="${esc(mat)}">${esc(mat)}</td><td>${ledgerNumber(inc)}</td><td>${ledgerNumber(out)}</td>${ledgerNetCell(inc-out)}</tr>`;
 }).join('');
 const elapsedMinutes=Math.floor((simTime+1e-7)/60);
 const finished=elapsedMinutes>0?sim?.minuteBuckets?.[elapsedMinutes-1]:null;
 const showBucket=finished||{inbound:{},outbound:{}};
 const aRows=materials.map(mat=>{const inc=showBucket.inbound[mat]||0,out=showBucket.outbound[mat]||0;
  return `<tr><td class="ledger-name" title="${esc(mat)}">${esc(mat)}</td><td>${inc}</td><td>${out}</td>${ledgerNetCell(inc-out)}<td>${ware[mat]||0}</td></tr>`;
 }).join('');
 const totalsIn=Object.values(sim?.inbound||{}).reduce((a,b)=>a+b,0),totalsOut=Object.values(sim?.outbound||{}).reduce((a,b)=>a+b,0);
 const recentBuckets=(sim?.minuteBuckets||[]).slice(Math.max(0,elapsedMinutes-12),elapsedMinutes);
 const history=recentBuckets.map((bk,i)=>{const minute=elapsedMinutes-recentBuckets.length+i+1;
  const iCount=Object.values(bk?.inbound||{}).reduce((a,b)=>a+b,0),oCount=Object.values(bk?.outbound||{}).reduce((a,b)=>a+b,0);
  return `<tr><td>第${minute}分钟</td><td>${iCount}</td><td>${oCount}</td>${ledgerNetCell(iCount-oCount)}</tr>`;
 }).join('');
 $('warehouse').innerHTML=`<div class="ledger-mini"><div><span>模拟时间</span><b>${(simTime/60).toFixed(1)}分</b></div><div><span>仓库累计进 / 出</span><b>${totalsIn} / ${totalsOut}</b></div></div>
 <div class="ledger-panel"><div class="ledger-head"><strong>理论收支</strong><span class="ledger-chip">件/分钟 · 联立稳态流量</span></div>
 <table class="ledger-table"><thead><tr><th>材料</th><th>收入</th><th>支出</th><th>净值</th></tr></thead><tbody>${tRows||'<tr><td colspan="4">暂无有效仓库物流</td></tr>'}</tbody></table>
 <div class="ledger-meta">使用纯数字线性规划联立求解机器配方消耗、实际有效接线、混合物料带宽、分/汇流器守恒及仓库持续供需。显示数学可行稳态的优化流量；自动分流器的逐件轮转与缓存抢料可能导致实际速率不同，请对照下方实际收支。${budget.error?`<span class="bad">求解失败：${esc(budget.error)}</span>`:""}</div></div>
 <div class="ledger-panel"><div class="ledger-head"><strong>实际收支</strong><span class="ledger-chip">${elapsedMinutes>0?'第 '+elapsedMinutes+' 分钟':'等待首个完整分钟'}</span></div>
 ${elapsedMinutes===0?`<div class="ledger-meta">已模拟 ${simTime.toFixed(1)}秒；运行满60秒后显示第一份准确的每分钟记录。可用顶部「+1分钟」快速计算。</div>`:''}
 <table class="ledger-table"><thead><tr><th>材料</th><th>入库</th><th>出库</th><th>净值</th><th>库存</th></tr></thead><tbody>${aRows||'<tr><td colspan="5">仓库暂无材料</td></tr>'}</tbody></table>
 <div class="ledger-meta">入库、出库为最近一个完整模拟分钟内逐件记录；库存为当前剩余件数，净值＝入库－出库。未满60秒时不做速率外推。</div>
 ${history?`<details><summary class="tiny">最近${recentBuckets.length}分钟记录</summary><table class="ledger-table"><thead><tr><th>分钟</th><th>收入</th><th>支出</th><th>净值</th></tr></thead><tbody>${history}</tbody></table></details>`:''}</div>`;
}
