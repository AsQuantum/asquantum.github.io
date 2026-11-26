'use strict';
function possibleSourceMaterials(m,seen=new Set(),throughOutputPort=null){
 const result=new Set();if(!m||seen.has(m.id))return result;
 const rec=getRecipe(m);if(rec?.output){result.add(rec.output);return result;}
 if(m.type==='仓出'){if(m.item)result.add(m.item);return result;}
 if(m.type!=='分流'&&m.type!=='汇流')return result;
 const next=new Set(seen);next.add(m.id);
 for(const r of state.routes.filter(r=>r.to?.id===m.id)){
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
// Incompatible streams are soft diagnostics, not invalid physical routes.
function mixedInputWarnings(detailed=false){
 const problems=[];
 for(const m of state.machines){
  if(!getRecipe(m)&&!['仓入','电脑'].includes(m.type))continue;
  for(const p of getPorts(m).filter(p=>p.kind==='in')){
   const mats=inletMaterials(m,p.index);
   for(const mat of mats)if(!acceptsMaterial(m,mat,p.index))
    problems.push({id:m.id,message:`${label(m)} [${m.id}] 入口${p.index+1}：不兼容材料 ${mat}（允许连线；到达入口后拒收，可能堵塞传送带）`});
  }
 }
 return detailed?problems:problems.map(x=>x.message);
}
function validMixedInlets(detailed=false){
 const result=[];
 for(const m of state.machines)if(getRecipe(m))for(const p of getPorts(m).filter(p=>p.kind==='in')){
  const mats=[...inletMaterials(m,p.index)];
  if(mats.length>1&&mats.every(mat=>acceptsMaterial(m,mat,p.index)))
   result.push({id:m.id,message:`${label(m)} [${m.id}] 入口${p.index+1}：${mats.join('、')}（共享1件/秒）`});
 }
 return detailed?result:result.map(x=>x.message);
}
function missingMaterials(m){
 const r=getRecipe(m);if(!r||!Object.keys(r.inputs||{}).length)return [];
 const materials=new Set();
 for(const p of getPorts(m).filter(p=>p.kind==='in'))
  for(const mat of inletMaterials(m,p.index))if(acceptsMaterial(m,mat,p.index))materials.add(mat);
 return Object.keys(r.inputs).filter(item=>!materials.has(item));
}
function blockedPortIssues(){
 const items=[];
 for(const m of state.machines)for(const p of getPorts(m)){
  // Unused splitter outputs and merger inputs are optional contact edges.
  if(!needsClearOutside(m,p))continue;
  const other=cellMachine(p.ex,p.ey,m.id);
  if(other)items.push({id:m.id,key:m.id+':'+p.kind+':'+p.index,message:`${label(m)} [${m.id}] ${p.kind==='in'?'输入':'输出'}口${p.index+1}：被 ${label(other)} [${other.id}] 占住了外侧接线格 (${p.ex},${p.ey})`});
  else if(!inMap(p.ex,p.ey)||reserved(p.ex,p.ey))items.push({id:m.id,key:m.id+':'+p.kind+':'+p.index,message:`${label(m)} [${m.id}] ${p.kind==='in'?'输入':'输出'}口${p.index+1}：朝向地图外或中央禁区`});
 }
 return items;
}
function blockedPorts(){return blockedPortIssues().map(x=>x.message);}
// Audit existing layouts without enforcing editor placement restrictions on import.
function machinePlacementIssues(){
 const geometry=new Map(),occupied=new Map();
 const issue=(id,reason)=>{if(!geometry.has(id))geometry.set(id,new Set());geometry.get(id).add(reason);};
 for(const m of state.machines){
  const [w,h]=dims(m);
  if(![m.x,m.y,w,h].every(Number.isInteger)||w<=0||h<=0){issue(m.id,'机器坐标或尺寸无效');continue;}
  if(m.x<0||m.y<0||m.x+w>W||m.y+h>H)issue(m.id,'机器超出地图范围');
  for(let y=Math.max(0,m.y);y<Math.min(H,m.y+h);y++)for(let x=Math.max(0,m.x);x<Math.min(W,m.x+w);x++){
   if(reserved(x,y))issue(m.id,'机器占用中央禁区');
   const k=x+','+y,prior=occupied.get(k)||[];
   for(const id of prior){issue(m.id,'与机器 '+id+' 重叠');issue(id,'与机器 '+m.id+' 重叠');}
   prior.push(m.id);occupied.set(k,prior);
  }
 }
 const ports=blockedPortIssues(),invalidIds=new Set([...geometry.keys(),...ports.map(p=>p.id)]),blockedByMachine=new Map();
 for(const p of ports)blockedByMachine.set(p.id,(blockedByMachine.get(p.id)||0)+1);
 const geometryIssues=state.machines.filter(m=>geometry.has(m.id)).map(m=>({id:m.id,message:`${label(m)} [${m.id}]：${[...geometry.get(m.id)].join('；')}`}));
 const geometryMessages=geometryIssues.map(x=>x.message);
 return {invalidIds,geometryIssues,portIssues:ports,geometryIds:new Set(geometry.keys()),geometryMessages,blockedByMachine,blocked:ports.map(p=>p.message),blockedMachineCount:blockedByMachine.size};
}
function warnings(detailed=false){
 const unconnected=[],invalid=[],unservedOutputs=[],noOutputLine=[],openEnds=[],noSourceMaterial=[];
 let connectedRoutes=0;
 for(const m of state.machines){
  if(['仓入','仓出','分流','汇流','发电','电脑','空间锚点'].includes(m.type))continue;
  for(const mat of missingMaterials(m))unconnected.push({id:m.id,message:`${label(m)} [${m.id}]：缺 ${mat}`});
  if(outPort(m,0)){
   const r=routeFor(m.id,'out',0),name=`${label(m)} [${m.id}]`;
   if(!r?.to)unservedOutputs.push({id:m.id,message:name});
   if(!r)noOutputLine.push({id:m.id,message:name});
  }
 }
 for(const r of state.routes){
  const error=checkPath(r.path,r.from,r.to,r.id),name=r.label||r.id;
  if(error){invalid.push({routeId:r.id,message:`${name}: ${error}`});continue;}
  if(!r.to){
   const end=r.path.at(-1);
   openEnds.push({routeId:r.id,message:`${name}：${routeTitle(r)} · 末端 (${end?.join(', ')||'未知'})`});
   continue;
  }
  connectedRoutes++;
  if(streamMaterials(r).size===0)noSourceMaterial.push({routeId:r.id,message:`${name}：${routeTitle(r)}`});
 }
 const result={unconnected,invalid,unservedOutputs,noOutputLine,openEnds,noSourceMaterial};
 if(!detailed)for(const k of Object.keys(result))result[k]=result[k].map(x=>x.message);
 return {...result,connectedRoutes,blocked:detailed?blockedPortIssues():blockedPorts()};
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
    const dest=r.to&&machineById(r.to.id),source=machineById(r.from.id);
    if(source?.type==='分流'){const f=outPort(source,r.from.port)?.filter;if(f&&f!=='任意'&&f!==mat)continue;}
    if(!dest||!acceptsMaterial(dest,mat,r.to.port))continue;
    if(dest.type==='仓入')return true;
    if(dest.type==='汇流'||dest.type==='分流')queue.push(dest.id);
   }
  }
 }
 return false;
}
function auditItemList(){
 const items=new Set(MATERIALS);
 const add=item=>{if(typeof item==='string'&&item&&item!=='任意')items.add(item);};
 for(const m of state.machines){
  const rec=getRecipe(m);
  if(rec){add(rec.output);for(const item of Object.keys(rec.inputs||{}))add(item);}
  if(m.type==='仓出')add(m.item);
  if(m.type==='仓入'||m.type==='电脑')add(m.inletItem);
  if(m.type==='分流')for(const item of Object.values(m.outFilters||{}))add(item);
 }
 for(const f of state.frozenFactories||[])for(const item of Object.keys(f.rates||{}))add(item);
 return [...items].sort(factoryItemCompare);
}
function auditRefresh(){
 const root=$('audit'),previous=root.querySelector?.('.audit-stock-paths'),stockOpen=!!previous?.open;
 const openKeys=new Set([...(root.querySelectorAll?.('[data-audit-group][open]')||[])].map(d=>d.dataset.auditGroup));
 const {unconnected,invalid,noOutputLine,openEnds,noSourceMaterial,connectedRoutes}=warnings(true);
 const placement=machinePlacementIssues(),blocked=placement.blocked;
 const mixed=mixedInputWarnings(true),legalMixed=validMixedInlets(true);
 let crossings=0;
 for(const entries of occupiedRouteMap().values())if(entries.length===2)crossings++;
 const complete=state.machines.filter(m=>getRecipe(m)&&Object.keys(getRecipe(m).inputs||{}).length>0&&missingMaterials(m).length===0).length;
 const required=state.machines.filter(m=>getRecipe(m)&&Object.keys(getRecipe(m).inputs||{}).length>0).length;
 // Inspect ALL required stock types on every layout change, not just one
 // representative. This is structural reachability, not a throughput claim.
 // MATERIALS is the complete game item registry, not the historic 13-item subset.
 const auditItems=auditItemList();
 const stockPaths=auditItems.map(mat=>({mat,path:hasProducerWarehousePath(mat)}));
 const foundPaths=stockPaths.filter(v=>v.path).length;
 const machineItems=state.machines.map(m=>({id:m.id,message:label(m)+' ['+m.id+']'}));
 const routeItems=state.routes.map(r=>({routeId:r.id,message:(r.label||r.id)+'：'+routeTitle(r)}));
 const connectedIds=new Set(state.routes.filter(r=>r.to&&!checkPath(r.path,r.from,r.to,r.id)).map(r=>r.id));
 const machineRows=[
  ['机器总数',state.machines.length+' 台','',machineItems],
  ['存在位置或接口问题的机器',placement.invalidIds.size+' 台',placement.invalidIds.size?'bad':'good',state.machines.filter(m=>placement.invalidIds.has(m.id)).map(m=>({id:m.id,message:label(m)+' ['+m.id+']'}))],
  ['机器位置错误',placement.geometryMessages.length+' 台',placement.geometryMessages.length?'bad':'good',placement.geometryIssues],
  ['被堵塞的必要接口',blocked.length+' 个',blocked.length?'bad':'good',placement.portIssues],
  ['有原料需求的机器',complete+' / '+required+' 台已连齐'],
  ['尚未接入的材料',unconnected.length+' 项',unconnected.length?'bad':'good',unconnected],
  ['生产机器没有出线',noOutputLine.length+' 台',noOutputLine.length?'warn':'good',noOutputLine]
 ];
 const summaryRows=[
  ['已绘制的线路',state.routes.length,'',routeItems],
  ['已连接终点',connectedRoutes+' 条','',routeItems.filter(x=>connectedIds.has(x.routeId))],
  ['未连接终点（悬空）',openEnds.length+' 条',openEnds.length?'warn':'good',openEnds],
  ['无可识别上游物料',noSourceMaterial.length+' 条',noSourceMaterial.length?'warn':'good',noSourceMaterial],
  ['占用传送带格',getBeltCount()],
  ['合法十字形',crossings],
  ['线路几何错误',invalid.length,invalid.length?'bad':'good',invalid],
  ['合法混料入口',legalMixed.length,'good',legalMixed],
  ['不兼容输入材料',mixed.length,mixed.length?'warn':'good',mixed]
 ];
 const renderRows=items=>items.map(([title,value,status,issues])=>{
  const row=`<span class="audit-label">${esc(title)}</span><span class="audit-value ${status||''}">${esc(value)}</span>`;
  if(!issues?.length)return `<div class="audit-row">${row}</div>`;
  return `<details class="audit-inline-detail" data-audit-group="${esc(title)}" ${openKeys.has(title)?'open':''}><summary class="audit-row">${row}</summary><div class="audit-diagnostic-body">${issues.map(x=>`<button type="button" class="audit-focus-item" data-audit-kind="${x.routeId!=null?'route':'machine'}" data-audit-id="${esc(x.routeId??x.id)}">${esc(x.message)}</button>`).join('')}</div></details>`;
 }).join('');
 const materialRows=stockPaths.map(({mat,path})=>
  `<div class="audit-row audit-material-row"><span class="audit-label">${esc(mat)}</span><span class="audit-value ${path?'good':'bad'}">${path?'有入库路径':'无入库路径'}</span></div>`).join('');
 $('audit').innerHTML=`<section class="audit-card audit-machine-card">
  <div class="audit-card-title">机器概览</div>
  <div class="audit-stat-list">${renderRows(machineRows)}</div>
  ${placement.invalidIds.size?'<div class="audit-hint">接口堵塞不限制放置或导入，但需清理后才能接线。</div>':''}
 </section><section class="audit-card audit-route-card">
  <div class="audit-card-title">线路概览</div>
  <div class="audit-stat-list">${renderRows(summaryRows)}</div>
  <details class="audit-stock-paths" ${stockOpen?'open':''}>
   <summary class="audit-section-heading"><span class="audit-stock-title">物品入库路径预检</span><span class="audit-section-meta">已检查 ${stockPaths.length}/${auditItems.length} · 有路径 ${foundPaths}/${stockPaths.length}</span></summary>
   <div class="audit-material-list">${materialRows}</div>
   <div class="audit-hint">按物品 ID 检查当前地图的生产机 → 传送带 → 仓库入口。未找到路径不代表不能作为原料使用；冻结工厂直接增减库存，不需要入库线路。</div>
  </details>
 </section>`;
}

// Select from a structured diagnostic, never parse a displayed label.
function auditFocus(kind,id){
 const m=kind==='machine'?machineById(id):null,r=kind==='route'?state.routes.find(x=>x.id===id):null;
 if(!m&&!r)return false;
 const src=r&&machineById(r.from?.id),b=groupBounds(m?[m]:r&&!r.path?.length&&src?[src]:[],r?.path?.length?[r]:[]);if(!b)return false;
 resetEditorMode();selection=m?{machineId:id}:{routeId:id};
 const fit=Math.min((pix.w-48)/Math.max(1,b.w),(pix.h-48)/Math.max(1,b.h));
 camera.z=Math.max(3,Math.min(48,fit,Math.max(camera.z,12)));
 camera.x=pix.w/2-(b.x+b.w/2)*camera.z;camera.y=pix.h/2-(b.y+b.h/2)*camera.z;
 updateGroupControls();inspectorRefresh();draw();return true;
}
