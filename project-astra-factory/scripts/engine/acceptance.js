'use strict';
// End-to-end acceptance test is simulated from the actual 72x72 map, not LP output.
// Preheat for 300s; measure 900s. All 13 materials must have positive *warehouse
// net item count*, gears >=40/min and coils >=60/min within a 0.5% measuring tolerance.
function runAcceptance(){
 const btn=$('acceptance');btn.disabled=true;btn.textContent='正在逐件模拟...';running=false;
 const warningsAtStart=warnings(),portMix=mixedInputWarnings(),start=performance.now();
 resetSimulation();
 for(let k=0;k<6000;k++)simulate(.05);
 const before={ware:{...ware},inbound:{...sim.inbound},outbound:{...sim.outbound},crafts:{...sim.crafts}};
 for(let k=0;k<18000;k++)simulate(.05);
 const diff=(a,b,key)=>(b[key]||0)-(a[key]||0);
 const lines=REQUIRED_STOCK.map(item=>{const inc=diff(before.inbound,sim.inbound,item),out=diff(before.outbound,sim.outbound,item);
  return {item,inbound:inc,outbound:out,net:diff(before.ware,ware,item),pass:diff(before.ware,ware,item)>0};});
 const gear=diff(before.crafts,sim.crafts,'齿轮组')/15;
 const coil=diff(before.crafts,sim.crafts,'导线线圈')/15;
 const gearOK=gear>=40*.995,coilOK=coil>=60*.995;
 const topologyOK=warningsAtStart.invalid.length===0&&warningsAtStart.blocked.length===0&&portMix.length===0&&warningsAtStart.unconnected.length===0;
 const allOK=lines.every(x=>x.pass)&&gearOK&&coilOK&&topologyOK;
 const rows=lines.map(x=>`<tr><td>${esc(x.item)}</td><td>${(x.inbound/15).toFixed(2)}</td><td>${(x.outbound/15).toFixed(2)}</td><td class="${x.pass?'good':'bad'}">${x.net>0?'+':''}${(x.net/15).toFixed(2)}</td></tr>`).join('');
 $('acceptanceReport').innerHTML=`<div class="item"><strong class="${allOK?'good':'bad'}">${allOK?'全部通过：可继续压缩占地':'未通过：当前布局不是可行解'}</strong>
  <div class="tiny">预热300秒 + 测量900秒；模拟物品逐件移动、受输入缓存及端口速度限制。单位为件/分钟。模拟校验不等于已证明对真实游戏的精确一致性。</div>
  <div class="kv"><span>齿轮组实际产率</span><b class="${gearOK?'good':'bad'}">${gear.toFixed(2)} / 40.00</b></div>
  <div class="kv"><span>导线线圈实际产率</span><b class="${coilOK?'good':'bad'}">${coil.toFixed(2)} / 60.00</b></div>
  <div class="kv"><span>线路与全部原料入口</span><b class="${topologyOK?'good':'bad'}">${topologyOK?'通过':'未通过'}</b></div>
  <table class="table-mini"><thead><tr><td>材料</td><td>入库</td><td>出库</td><td>净值</td></tr></thead><tbody>${rows}</tbody></table>
  <div class="tiny">耗时 ${Math.round(performance.now()-start)} ms。净值大于0才视为正入库。</div></div>`;
 btn.disabled=false;btn.textContent='✓ 重新验收15分钟';warehouseRefresh();draw();
 window.lastFactoryAcceptance={passed:allOK,topologyOK,gearPerMin:gear,coilPerMin:coil,lines,missing:warningsAtStart.unconnected,invalid:warningsAtStart.invalid,blocked:warningsAtStart.blocked,portMix};
 notify(allOK?'逐件验收通过':'逐件验收失败：见右侧实际验收结果',allOK?'good':'bad');
 return window.lastFactoryAcceptance;
}
$('acceptance').onclick=()=>{runAcceptance();};
// V17: bounded end-to-end acceptance of ONE product from empty stocks.
// This is a computational test, not a proof of perpetual liveness or true-game equivalence.
function runWarpChainAcceptance(){
 const btn=$('warpCheck');btn.disabled=true;btn.textContent='正在逐件验收曲速线圈…';running=false;
 const start=performance.now();
 const problems=warnings();const mixed=mixedInputWarnings();
 const geometryOK=problems.invalid.length===0 && problems.blocked.length===0 && mixed.length===0;
 // No presumption that unconnected optional/irrelevant machines disqualify this narrower chain.
 resetSimulation();
 const steps=seconds=>{for(let i=0;i<Math.round(seconds/.05);i++)simulate(.05)};
 steps(300);
 const snap=()=>({warehouse:ware['曲速线圈']||0, received:sim.inbound['曲速线圈']||0, crafts:sim.crafts['曲速线圈']||0});
 const a=snap();steps(900);const b=snap();steps(900);const c=snap();
 const half1=b.received-a.received, half2=c.received-b.received;
 const manufacture1=b.crafts-a.crafts,manufacture2=c.crafts-b.crafts;
 const pass=geometryOK && half1>0 && half2>0 && b.warehouse>a.warehouse && c.warehouse>b.warehouse;
 const n=v=>Number(v).toLocaleString('zh-CN');
 $('warpReport').innerHTML=`<div class="item"><strong class="${pass?'good':'bad'}">${pass?'单链验收通过：两个时段均有曲速线圈入库':'未通过：不能判定曲速线圈生产链持续运行'}</strong>
 <div class="tiny">空库存启动，预热300秒，再连续测量2×900秒。旧版13种净入库要求不适用于本项测试。曲速线圈必须真实进入仓库存入口，不能只滞留在生产机输出缓存。</div>
 <div class="kv"><span>逐格线形、接口及材料兼容</span><b class="${geometryOK?'good':'bad'}">${geometryOK?'通过':'有错误'}</b></div>
 <div class="kv"><span>前900秒入库</span><b class="${half1>0?'good':'bad'}">${n(half1)}件</b></div>
 <div class="kv"><span>后900秒入库</span><b class="${half2>0?'good':'bad'}">${n(half2)}件</b></div>
 <div class="kv"><span>前/后900秒制造</span><b>${n(manufacture1)} / ${n(manufacture2)}件</b></div>
 <div class="kv"><span>仓库最终曲速线圈库存</span><b>${n(c.warehouse)}件</b></div>
 <div class="tiny">${geometryOK?'没有发现线路几何或材料不兼容错误。':'存在'+problems.invalid.length+'条非法线路、'+problems.blocked.length+'个堵住的接口、'+mixed.length+'项输入材料不兼容。'} 运行时${((performance.now()-start)/1000).toFixed(2)}秒。有限时间内两次成功不等于证明无限持续生产。</div></div>`;
 btn.disabled=false;btn.textContent='◎ 再次验证曲速线圈单链';warehouseRefresh();draw();
 window.lastWarpChainAcceptance={passed:pass,geometryOK,firstWindowInbound:half1,secondWindowInbound:half2,firstWindowCrafted:manufacture1,secondWindowCrafted:manufacture2,finalWarehouse:c.warehouse,periodSeconds:900,preheatSeconds:300,invalid:problems.invalid,blocked:problems.blocked,portMix:mixed};
 notify(pass?'曲速线圈单链已通过两段逐件入库测试':'曲速线圈单链未通过，详见右侧报告',pass?'good':'bad');
 return window.lastWarpChainAcceptance;
}
$('warpCheck').onclick=()=>runWarpChainAcceptance();

$('run').onclick=()=>{warehouseRefresh();running=!running;if(running)setTool('select');$('run').textContent=running?'❚❚ 暂停模拟':'▶ 继续模拟';$('run').classList.toggle('primary',!running);notify(running?'模拟已开始：仓库每60秒保存一份真实收支记录':'模拟已暂停');};
$('simSpeed').onchange=e=>{simulationSpeed=Number(e.target.value)||1;notify(`模拟速度已设为 ${simulationSpeed}×`);};
$('stepMinute').onclick=advanceSimulationMinute;
$('resetSim').onclick=()=>{resetSimulation();notify('已清空模拟库存、生产队列和分钟统计记录');};
