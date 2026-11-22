'use strict';
function possibleSourceMaterials(m,seen=new Set(),throughOutputPort=null){
 const result=new Set();if(!m||seen.has(m.id))return result;
 const rec=getRecipe(m);if(rec?.output){result.add(rec.output);return result;}
 if(m.type==='仓出'){if(m.item)result.add(m.item);return result;}
 if(m.type!=='分流'&&m.type!=='汇流')return result;
 const next=new Set(seen);next.add(m.id);
 for(const r of state.routes.filter(r=>r.to.id===m.id)){
  if(checkPath(r.path,r.from,r.to,r.id))continue;
  for(const mat of possibleSourceMaterials(machineById(r.from.id),next,r.from.port))result.add(mat);
 }
 if(m.type==='分流'&&throughOutputPort!==null){
  const outlet=outPort(m,throughOutputPort), filter=outlet?.filter;
  if(!outlet)return new Set();
  if(filter&&filter!=='任意')return new Set([...result].filter(mat=>mat===filter));
 }
 return result;
}
// A single physical recipe inlet may receive several recipe materials sequentially.
// The shared 1 item/s capacity is enforced by acceptItem() per port.
function streamMaterials(r){
 if(!r)return new Set();
 return possibleSourceMaterials(machineById(r.from.id),new Set(),r.from.port);
}
function inletMaterials(m,idx){
 const r=routeFor(m.id,'in',idx);
 if(!r||checkPath(r.path,r.from,r.to,r.id))return new Set();
 return streamMaterials(r);
}
function dedicatedPortItem(m,idx){
 const mats=inletMaterials(m,idx);return mats.size===1?[...mats][0]:null;
}
// Only incompatible mixed streams are errors; valid multi-item inputs are expected.
function mixedInputWarnings(){
 const problems=[];
 for(const m of state.machines){
  if(!getRecipe(m))continue;
  for(const p of getPorts(m).filter(p=>p.kind==='in')){
   const mats=inletMaterials(m,p.index);
   for(const mat of mats)if(!acceptsMaterial(m,mat,p.index))
    problems.push(`${label(m)} [${m.id}] 入口${p.index+1}：不兼容材料 ${mat}（当前配方/手动过滤不接收）`);
  }
 }
 return problems;
}
function validMixedInlets(){
 const result=[];
 for(const m of state.machines)if(getRecipe(m))for(const p of getPorts(m).filter(p=>p.kind==='in')){
  const mats=[...inletMaterials(m,p.index)];
  if(mats.length>1&&mats.every(mat=>acceptsMaterial(m,mat,p.index)))
   result.push(`${label(m)} [${m.id}] 入口${p.index+1}：${mats.join('、')}（共享1件/秒）`);
 }
 return result;
}
function missingMaterials(m){
 const r=getRecipe(m);if(!r||!Object.keys(r.inputs||{}).length)return [];
 const materials=new Set();
 for(const p of getPorts(m).filter(p=>p.kind==='in'))
  for(const mat of inletMaterials(m,p.index))if(acceptsMaterial(m,mat,p.index))materials.add(mat);
 return Object.keys(r.inputs).filter(item=>!materials.has(item));
}
function blockedPorts(){
 const items=[];
 for(const m of state.machines)for(const p of getPorts(m)){
  // Unused splitter outputs and merger inputs are optional contact edges.
  if(!needsClearOutside(m,p))continue;
  const other=cellMachine(p.ex,p.ey,m.id);
  if(other)items.push(`${label(m)} [${m.id}] ${p.kind==='in'?'输入':'输出'}口${p.index+1}：被 ${label(other)} [${other.id}] 占住了外侧接线格 (${p.ex},${p.ey})`);
  else if(!inMap(p.ex,p.ey)||reserved(p.ex,p.ey))items.push(`${label(m)} [${m.id}] ${p.kind==='in'?'输入':'输出'}口${p.index+1}：朝向地图外或中央禁区`);
 }
 return items;
}
function warnings(){
 const unconnected=[],invalid=[],unservedOutputs=[];
 for(const m of state.machines){
  if(['仓入','仓出','分流','汇流','发电','电脑','空间锚点'].includes(m.type))continue;
  for(const mat of missingMaterials(m))unconnected.push(`${label(m)} [${m.id}]：缺 ${mat}`);
  if(outPort(m,0)&&!routeFor(m.id,'out',0))unservedOutputs.push(`${label(m)} [${m.id}]`);
 }
 for(const r of state.routes){const error=checkPath(r.path,r.from,r.to,r.id);if(error)invalid.push(`${r.label||r.id}: ${error}`);}
 return {unconnected,invalid,unservedOutputs,blocked:blockedPorts()};
}
// Hard-condition precheck. It only proves necessary structural properties;
// the external fixed-layout LP is the authoritative steady-state feasibility test.
const REQUIRED_STOCK=['合金板','钛合金锭','硅晶圆','燃料罐','齿轮组','导线线圈','能量电池','电动机','框架模块','量子处理器','等离子电池','曲速线圈','引力透镜'];
function hasProducerWarehousePath(mat){
 const roots=state.machines.filter(m=>getRecipe(m)?.output===mat);
 for(const root of roots){
  const seen=new Set(),queue=[root.id];
  while(queue.length){const id=queue.shift();if(seen.has(id))continue;seen.add(id);
   for(const r of state.routes.filter(q=>q.from.id===id&&!checkPath(q.path,q.from,q.to,q.id))){
    const dest=machineById(r.to.id),source=machineById(r.from.id);
    if(source?.type==='分流'){const f=outPort(source,r.from.port)?.filter;if(f&&f!=='任意'&&f!==mat)continue;}
    if(!dest||!acceptsMaterial(dest,mat,r.to.port))continue;
    if(dest.type==='仓入')return true;
    if(dest.type==='汇流'||dest.type==='分流')queue.push(dest.id);
   }
  }
 }
 return false;
}
function actualInPortUpper(m,mat){
 // Each physically connected input is independently limited to one item/s.
 // A junction's downstream material may still be absent: this is only an upper bound.
 return getPorts(m).filter(p=>p.kind==='in' && state.routes.some(r=>r.to.id===m.id&&r.to.port===p.index&&
  inletMaterials(m,p.index).has(mat)&&acceptsMaterial(m,mat,p.index))).length;
}
function fullRatePrecheck(){
 const goals=[['组装','齿轮组',40],['组装','导线线圈',60]];
 return goals.map(([typ,mode,needed])=>{
  const machines=state.machines.filter(m=>m.type===typ&&m.mode===mode);let best=0;
  for(const m of machines){const rec=getRecipe(m);let cycle=1/rec.seconds;
   const needs=Object.entries(rec.inputs);
   const physical=getPorts(m).filter(p=>p.kind==='in'&&routeFor(m.id,'in',p.index)&&
     !checkPath(routeFor(m.id,'in',p.index).path,routeFor(m.id,'in',p.index).from,routeFor(m.id,'in',p.index).to,routeFor(m.id,'in',p.index).id));
   // Every nonempty subset of required ingredients shares the physical ports able to carry it.
   for(let mask=1;mask<(1<<needs.length);mask++){
    const group=needs.filter((_,i)=>mask&(1<<i));
    const demand=group.reduce((sum,[,qty])=>sum+qty,0);
    const portCount=physical.filter(p=>group.some(([mat])=>inletMaterials(m,p.index).has(mat)&&acceptsMaterial(m,mat,p.index))).length;
    cycle=Math.min(cycle,portCount/demand);
   }
   best+=Math.min(cycle*rec.qty,1)*60;
  }
  return {typ,mode,needed,upper:best,pass:best+1e-7>=needed};
 });
}
function auditRefresh(){
 const {unconnected,invalid,unservedOutputs,blocked}=warnings(),mixed=mixedInputWarnings(),legalMixed=validMixedInlets();
 let crossings=0;for(const entries of occupiedRouteMap().values())if(entries.length===2)crossings++;
 const nondecor=state.machines.filter(m=>!['发电','电脑','空间锚点'].includes(m.type));
 const complete=state.machines.filter(m=>getRecipe(m)&&Object.keys(getRecipe(m).inputs||{}).length>0&&missingMaterials(m).length===0).length;
 const required=state.machines.filter(m=>getRecipe(m)&&Object.keys(getRecipe(m).inputs||{}).length>0).length;
 const stockPaths=REQUIRED_STOCK.map(mat=>({mat,path:hasProducerWarehousePath(mat)}));
 const ratePrecheck=fullRatePrecheck();
 $('audit').innerHTML=`<div class="item"><strong>线路概览</strong>
 <div class="tiny">几何与入口材料是否接通；并不代表产能或净入库达标。</div>
 <details><summary class="tiny">展开13种材料入库路径预检（${stockPaths.filter(v=>v.path).length}/13）</summary>
 ${stockPaths.map(v=>`<div class="kv"><span>${esc(v.mat)}</span><b class="${v.path?'warn':'bad'}">${v.path?'有路径':'无路径'}</b></div>`).join('')}
 <div class="tiny">纯曲速线圈单链只要求最终产物入库，其他材料不必单独入库。</div></details>
 <details><summary class="tiny">展开齿轮/线圈输入口上限</summary>
 ${ratePrecheck.map(v=>`<div class="kv"><span>${esc(v.mode)}</span><b class="${v.pass?'warn':'bad'}">${v.upper.toFixed(2)} / ${v.needed.toFixed(2)} 件/分</b></div>`).join('')}
 <div class="tiny">同一入口接入多种原料时共享1件/秒，这里是乐观上界而非实际产率。</div></details></div>
 <div class="kv"><span>已绘制的线路</span><b>${state.routes.length}</b></div>
 <div class="kv"><span>有原料需求的机器</span><b>${complete}/${required} 台已连齐原料种类</b></div>
 <div class="kv"><span>尚未接入的材料</span><b class="${unconnected.length?'bad':'good'}">${unconnected.length} 项</b></div>
 <div class="kv"><span>生产机器没有出线</span><b class="${unservedOutputs.length?'warn':'good'}">${unservedOutputs.length} 台</b></div>
 <div class="kv"><span>占用传送带格</span><b>${getBeltCount()}</b></div>
 <div class="kv"><span>合法十字形</span><b>${crossings}</b></div>
 <div class="kv"><span>线路几何错误</span><b class="${invalid.length?'bad':'good'}">${invalid.length}</b></div>
 <div class="kv"><span>被邻居封死的接口</span><b class="${blocked.length?'bad':'good'}">${blocked.length}</b></div>
 <div class="kv"><span>合法混料入口</span><b class="good">${legalMixed.length}</b></div>
 <div class="kv"><span>不兼容输入材料</span><b class="${mixed.length?'bad':'good'}">${mixed.length}</b></div>
 ${legalMixed.length?`<details><summary class="tiny">混合原料输入口 (${legalMixed.length})</summary><div class="tiny">${legalMixed.map(esc).join('<br>')}</div></details>`:''}
 ${mixed.length?`<details open><summary class="bad tiny">材料不兼容 (${mixed.length})</summary><div class="bad tiny">${mixed.map(esc).join('<br>')}</div></details>`:''}
 ${blocked.length?`<details open><summary class="bad tiny">接口被挡住 (${blocked.length})</summary><div class="bad tiny" style="max-height:125px;overflow:auto">${blocked.map(esc).join('<br>')}</div></details>`:''}
 ${unconnected.length?`<details open><summary class="tiny">尚未连到机器的原料 (${unconnected.length})</summary><div class="tiny" style="max-height:170px;overflow:auto">${unconnected.map(esc).join('<br>')}</div></details>`:''}
 ${unservedOutputs.length?`<details><summary class="tiny">未连接任何下游的产出机器 (${unservedOutputs.length})</summary><div class="tiny" style="max-height:110px;overflow:auto">${unservedOutputs.map(esc).join('<br>')}</div></details>`:''}
 ${invalid.length?`<details open><summary class="bad tiny">错误线路 (${invalid.length})</summary><div class="bad tiny">${invalid.map(esc).join('<br>')}</div></details>`:''}
 <p class="tiny">红色标记＝缺配方原料；橙色标记＝尚无产出线路。几何合法不表示工厂可以运行，更不代表吞吐已达标。</p>`;
}
