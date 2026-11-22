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
function auditRefresh(){
 const {unconnected,invalid,unservedOutputs,blocked}=warnings();
 const mixed=mixedInputWarnings(),legalMixed=validMixedInlets();
 let crossings=0;
 for(const entries of occupiedRouteMap().values())if(entries.length===2)crossings++;
 const complete=state.machines.filter(m=>getRecipe(m)&&Object.keys(getRecipe(m).inputs||{}).length>0&&missingMaterials(m).length===0).length;
 const required=state.machines.filter(m=>getRecipe(m)&&Object.keys(getRecipe(m).inputs||{}).length>0).length;
 // Inspect ALL required stock types on every layout change, not just one
 // representative. This is structural reachability, not a throughput claim.
 // MATERIALS is the complete game item registry, not the historic 13-item subset.
 const auditItems=[...new Set(MATERIALS)];
 const stockPaths=auditItems.map(mat=>({mat,path:hasProducerWarehousePath(mat)}));
 const foundPaths=stockPaths.filter(v=>v.path).length;
 const summaryRows=[
  ['已绘制的线路',state.routes.length],
  ['有原料需求的机器',complete+' / '+required+' 台已连齐'],
  ['尚未接入的材料',unconnected.length+' 项',unconnected.length?'bad':'good'],
  ['生产机器没有出线',unservedOutputs.length+' 台',unservedOutputs.length?'warn':'good'],
  ['占用传送带格',getBeltCount()],
  ['合法十字形',crossings],
  ['线路几何错误',invalid.length,invalid.length?'bad':'good'],
  ['被邻居封死的接口',blocked.length,blocked.length?'bad':'good'],
  ['合法混料入口',legalMixed.length,'good'],
  ['不兼容输入材料',mixed.length,mixed.length?'bad':'good']
 ];
 const rows=summaryRows.map(([title,value,status])=>
  `<div class="audit-row"><span class="audit-label">${esc(title)}</span><span class="audit-value ${status||''}">${esc(value)}</span></div>`).join('');
 const materialRows=stockPaths.map(({mat,path})=>
  `<div class="audit-row audit-material-row"><span class="audit-label">${esc(mat)}</span><span class="audit-value ${path?'good':'bad'}">${path?'有入库路径':'无入库路径'}</span></div>`).join('');
 const diagnostic=(title,items,state='')=>items.length?
  `<details class="audit-diagnostic" ${state?'open':''}><summary class="${state}">${esc(title)} · ${items.length} 项</summary><div class="audit-diagnostic-body">${items.map(item=>`<div>${esc(item)}</div>`).join('')}</div></details>`:'';
 $('audit').innerHTML=`<section class="audit-card">
  <div class="audit-card-title">线路概览</div>
  <div class="audit-stat-list">${rows}</div>
  <div class="audit-section-heading"><span>物品入库路径预检</span><span class="audit-section-meta">已检查 ${stockPaths.length}/${auditItems.length} · 有路径 ${foundPaths}/${stockPaths.length}</span></div>
  <div class="audit-material-list">${materialRows}</div>
  <div class="audit-hint">按照完整物品目录逐项检查生产机 → 有效传送带 → 仓库入口的可达性；未找到路径不代表无法作为原料使用，也不代表产能不足。</div>
  ${diagnostic('混合原料输入口',legalMixed)}
  ${diagnostic('材料不兼容',mixed,'bad')}
  ${diagnostic('接口被挡住',blocked,'bad')}
  ${diagnostic('尚未连到机器的原料',unconnected,'warn')}
  ${diagnostic('未连接下游的产出机器',unservedOutputs)}
  ${diagnostic('错误线路',invalid,'bad')}
  <div class="audit-hint audit-footer-hint">红色表示缺失或错误，橙色表示未连接产出。几何与路径合法，不等于工厂能持续生产。</div>
 </section>`;
}
