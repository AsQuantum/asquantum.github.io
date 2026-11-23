'use strict';
function setTool(t){if(groupTransform)cancelGroupTransform();if(t!=='marquee'&&t!=='select')clearGroupSelection();tool=t;stampType=null;draft=null;beltTrim=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));document.querySelectorAll('#palette button').forEach(b=>b.classList.remove('active'));updateHint();draw();}
// Escape/right-click always return to an idle, unselected editor.
// Never touch persistent layout, undo history, or the copied clipboard.
function resetEditorMode(){
 selection=null;
 multiSelection=null;
 groupTransform=null;
 marquee=null;
 drag=null;
 draft=null;
 beltTrim=null;
 spaceDown=false;
 setTool('select');
 updateGroupControls();
 inspectorRefresh();
}
function rotateStamp(steps=1){if(!stampType)return;const faces=['E','S','W','N'];stampFace=faces[(faces.indexOf(stampFace)+steps+4)%4];saveStampPreference();updateStampControls();updateHint();draw();}
function cancelDraft(){if(!draft&&!beltTrim)return;draft=null;beltTrim=null;updateHint();notify('已退出线路编辑；已确认的传送带保留');draw();}
// A placement is not an interaction with an already drawn route.
// While placing, clicking the last confirmed tile FINISHES placement rather
// than arming a destructive red-tail edit. Belt tool remains selected.
function finishBeltPlacement(){
 if(!draft||draft.phase!=='placing')return false;
 draft=null;beltTrim=null;updateHint();
 notify('已结束当前线路铺设；确认的线段已保留');
 draw();return true;
}
function undoDraftBend(){
 if(!draft)return;
 if(!draft.history?.length)return cancelDraft();
 const historyEntry=draft.history.pop();
 const previous=Array.isArray(historyEntry)?historyEntry:historyEntry.path;
 const route=draft.routeId&&state.routes.find(r=>r.id===draft.routeId);
 if(route){
  snapshot();
  if(previous.length){
   route.path=copy(previous);route.to=null;
   if(!Array.isArray(historyEntry)&&historyEntry.endSide)route.openEndSide=historyEntry.endSide;
   else delete route.openEndSide;
  }
  else{state.routes=state.routes.filter(r=>r.id!==route.id);draft.routeId=null;}
 }
 draft.path=copy(previous);draft.preview=null;
 if(route)afterChange('已撤销最后一段已确认线路');
 updateDraftPreview();updateHint();draw();
}
// A confirmed waypoint is a real, persistent open-ended AST1 belt.
// It must survive Escape, switching tools and JSON/AST1 export.
function saveDraftRoute(path,to=null){
 if(!draft||!Array.isArray(path)||!path.length)return false;
 if(to&&to.id===draft.from.id){notify('不能将机器输出口连接到自身输入口','bad');return false;}
 if(to){
  const source=machineById(draft.from.id),target=machineById(to.id);
  const outlet=source&&outPort(source,draft.from.port);
  if(!outlet||!target){notify('源或目标机器不存在','bad');return false;}
  if(outlet.filter&&outlet.filter!=='任意'&&!acceptsMaterial(target,outlet.filter,to.port)){
   notify('分流出口过滤物品不符合目标配方：'+outlet.filter,'bad');return false;
  }
  if(getRecipe(target)){
   const incompatible=[...possibleSourceMaterials(source,new Set(),draft.from.port)]
    .filter(item=>!acceptsMaterial(target,item,to.port));
   if(incompatible.length){notify('目标入口不接收材料：'+incompatible.join('、'),'bad');return false;}
  }
  const item=recipeOutput(source);
  if(item&&!acceptsMaterial(target,item,to.port)){
   notify('材料不匹配：'+item+' 无法接入当前目标输入口','bad');return false;
  }
 }
 const existing=draft.routeId&&state.routes.find(r=>r.id===draft.routeId);
 const reason=checkPath(path,draft.from,to,existing?.id);
 if(reason){notify('线路验证失败：'+reason,'bad');return false;}
 snapshot();
 if(existing){existing.path=copy(path);existing.to=to?copy(to):null;delete existing.openEndSide;}
 else{
  const route={id:'r'+(++idSeed),from:copy(draft.from),to:to?copy(to):null,path:copy(path)};
  state.routes.push(route);draft.routeId=route.id;
 }
 draft.path=copy(path);
 // A confirmed open segment stays active for another placement leg.
 // It is no longer an edit selection: clicking its last confirmed tile
 // finishes placing, and no red deletion preview is armed. Escape only exits
 // the editor, never removes already saved route cells.
 if(to){draft=null;beltTrim=null;}
 else{
  // Every successfully confirmed waypoint begins a NEW placement leg, even
  // if the route had originally been opened through existing-line editing.
  draft.phase='placing';
  beltTrim={routeId:draft.routeId,index:-1,cell:null,hoverOutside:false};
 }
 afterChange(to?'已连接线路到输入口':'已确认放置悬空线路；可继续延长或连接蓝色输入口');
 if(draft)updateDraftPreview();
 updateHint();draw();return true;
}
function draftEndpoint(){if(!draft)return null;const s=outPort(machineById(draft.from.id),draft.from.port);return draft.path.length?draft.path.at(-1):s?[s.ex,s.ey]:null;}
// Commit waypoints as actual orthogonal belt cells. Locked segments are never recalculated afterwards.
function draftSegment(target,targetPort=null){
 if(!draft||!target||!inMap(...target))return null;
 const start=draftEndpoint();if(!start)return null;
 const src=outPort(machineById(draft.from.id),draft.from.port);
 const startPrev=draft.path.length>1?draft.path.at(-2):src?[src.x,src.y]:null;
 const endNext=targetPort?[targetPort.x,targetPort.y]:null;
 const moveX=target[0]-start[0],moveY=target[1]-start[1];
 if(draft.path.length&&Math.abs(moveX)+Math.abs(moveY)===1){
  const crossing=(occupiedRouteMap(draft.routeId).get(start.join(','))||[]).length>0||
   draft.path.slice(0,-1).some(p=>p[0]===start[0]&&p[1]===start[1]);
  if(crossing&&(!startPrev||moveX!==start[0]-startPrev[0]||
     moveY!==start[1]-startPrev[1]))return null;
 }
 const existing=draft.routeId&&state.routes.find(r=>r.id===draft.routeId);
 const segment=pathSearch(start,target,new Set(),{
  startPrev,endNext,allowOpenCrossingEnd:!endNext,excludeRouteId:draft.routeId,
  priorPath:draft.path,priorSource:src,priorEndSide:existing?.openEndSide
 });
 if(!segment)return null;
 const combined=draft.path.length?[...draft.path,...segment.slice(1)]:segment;
 // For an inlet preview the physical port, rather than an imagined open-end
 // continuation, determines whether the final cell is straight or a turn.
 // In particular, a crossing cannot turn inside its occupied cell.
 const inletHit=targetPort&&portAt(targetPort.x,targetPort.y);
 const to=targetPort?(inletHit?.p.kind==='in'?{id:inletHit.m.id,port:targetPort.index}:null):null;
 if(targetPort&&!to)return null;
 if(checkPath(combined,draft.from,to,draft.routeId))return null;
 return combined;
}
function draftTarget(cell){if(!cell||!inMap(cell.x,cell.y))return null;let hit=portAt(cell.x,cell.y);if(hit?.p.kind==='in')return [hit.p.ex,hit.p.ey];if(!cellMachine(cell.x,cell.y)&&!reserved(cell.x,cell.y))return [cell.x,cell.y];return null;}
function draftPreviewTile(path,i,src,to=null){
 const machine=to&&machineById(to.id);
 const dst=to?(machine&&inPort(machine,to.port)):openRouteVirtualEnd(path,src);
 return dst?tileShape(path,i,src,dst):null;
}
function updateDraftPreview(){
 if(!draft)return;
 const onSameBelt=draft.routeId&&hoverCell&&cellRoutes(hoverCell.x,hoverCell.y)
  .some(r=>r.id===draft.routeId);
 // A selected red tail wins over the inlet preview, but leaving the belt
 // restores both the preview path and its endpoint direction.
 if(onSameBelt&&beltTrim?.index>=0){
  draft.preview=null;draft.previewTo=null;return;
 }
 const target=draftTarget(hoverCell);
 const hit=hoverCell&&portAt(hoverCell.x,hoverCell.y);
 const port=hit?.p.kind==='in'?hit.p:null;
 draft.preview=target?draftSegment(target,port):null;
 draft.previewTo=draft.preview&&port?{id:hit.m.id,port:port.index}:null;
}
function commitDraftAtCrossing(cell,route){
 if(!draft||!route)return false;
 const target=[cell.x,cell.y];
 const candidate=draftSegment(target);
 if(!candidate||candidate.length<=draft.path.length)return false;
 const sm=machineById(draft.from.id),src=sm&&outPort(sm,draft.from.port);
 if(!src)return false;
 const terminal=tileShape(candidate,candidate.length-1,src,openRouteVirtualEnd(candidate,src));
 // Crossing is legal only for two perpendicular straight sections, even when
 // the existing strand belongs to this SAME route's earlier portion.
 if(terminal?.type!=='straight')return false;
 const matching=route.path.some((p,i)=>p[0]===cell.x&&p[1]===cell.y&&
  routeTile(route,i)?.type==='straight'&&routeTile(route,i).axis!==terminal.axis);
 if(!matching)return false;
 const previous=copy(draft.path);
 const existing=draft.routeId&&state.routes.find(r=>r.id===draft.routeId);
 const historyEntry={path:previous,endSide:existing?.openEndSide||null};
 if(!saveDraftRoute(candidate))return false;
 if(draft)draft.history.push(historyEntry);
 return true;
}
// When a crossing occupies one cell, select its horizontal/vertical strand
// according to cursor position rather than arbitrarily trimming the wrong line.
function beltCellHit(cell,pt){
 if(!cell)return null;
 const matches=[];
 for(const r of cellRoutes(cell.x,cell.y))
  for(let i=0;i<r.path.length;i++)
   if(r.path[i][0]===cell.x&&r.path[i][1]===cell.y)
    matches.push({route:r,index:i});
 if(matches.length<2)return matches[0]||null;
 const x=pt.x-camera.x-(cell.x+.5)*camera.z;
 const y=pt.y-camera.y-(cell.y+.5)*camera.z;
 const wanted=Math.abs(x)>Math.abs(y)?'H':'V';
 return matches.find(h=>orientation(h.route,h.index)===wanted)||matches.at(-1);
}
function beltRouteAtCell(cell,pt){return beltCellHit(cell,pt)?.route||null;}
function previewBeltTrim(cell,pt){
 if(!beltTrim)return;
 const route=state.routes.find(r=>r.id===beltTrim.routeId);
 if(!route){beltTrim=null;return;}
 const hit=beltCellHit(cell,pt);
 const onThisRoute=hit?.route.id===route.id;
 beltTrim.hoverOutside=!onThisRoute;
 // Red is a confirmation cue, not a persistent selection: it is visible
 // ONLY while hovering the exact grid tile (and crossing strand) first clicked.
 // The confirmation cell itself never changes when the pointer moves.
 beltTrim.hoverAnchor=!!(beltTrim.index>=0&&onThisRoute&&
  hit.index===beltTrim.index&&beltTrim.cell?.[0]===cell.x&&beltTrim.cell?.[1]===cell.y);
 if(draft?.routeId===route.id){
  if(onThisRoute&&beltTrim.index>=0)draft.preview=null;
  else updateDraftPreview();
 }
}
// Enter edit mode only after an explicit tap on an EXISTING route.
// This merely arms a red suffix (on the exact tile), never deletes data;
// a further same-tile tap is required to confirm deletion.
function beginExistingRouteEdit(route,index,cell){
 setTool('belt');
 selection=null;
 beltTrim={routeId:route.id,index,cell:[cell.x,cell.y],
  hoverOutside:false,hoverAnchor:true};
 draft=route.to?null:{
  from:copy(route.from),fromName:routeTitle(route),
  path:copy(route.path),routeId:route.id,history:[],preview:null,phase:'editing'
 };
 updateHint();updateDraftPreview();draw();
 notify('已进入线路编辑；再次点击原格才会删除尾段，移到其他位置可继续未完成线路');
}
function clearBeltTrimSelection(){
 beltTrim=null;draft=null;updateHint();draw();
}

function updateHint(){
 updateStampControls();
 $('beltControls').style.display=draft?'grid':'none';
}
function buildPalette(){
 const terms=$('search').value.trim().toLowerCase(),grouped={};
 for(const [key,d] of Object.entries(DEF)){
  const recipeWords=Object.values(d.recipes||{}).flatMap(rec=>[rec.output,...Object.keys(rec.inputs||{})]);
  if(![d.name,key,...recipeWords].join(' ').toLowerCase().includes(terms))continue;
  (grouped[d.cat]??=[]).push([key,d]);
 }
 $('palette').innerHTML=Object.entries(grouped).map(([category,list])=>
  `<div class="machine-palette-group"><div class="machine-palette-heading"><span>${esc(category)}</span><small>${list.length} 种</small></div>
    ${list.map(([key,d])=>`<button type="button" data-stamp="${esc(key)}" style="--palette-machine-color:${d.color}" title="选择 ${esc(d.name)} 放置"><span class="machine-palette-label"><i class="machine-palette-mark" style="background:${d.color}"></i><span>${esc(d.name)}</span></span><small>${d.w}×${d.h}</small></button>`).join('')}
   </div>`).join('')||'<div class="tiny" style="padding:12px 3px">没有匹配的机器或配方</div>';
}
function screenToCell(px,py){return {x:Math.floor((px-camera.x)/camera.z),y:Math.floor((py-camera.y)/camera.z)};}
function eventCoords(e){const rect=canvas.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top};}
function autoFit(){camera.z=Math.min((pix.w-40)/72,(pix.h-40)/72);camera.x=(pix.w-72*camera.z)/2;camera.y=(pix.h-72*camera.z)/2;draw();}
function resize(){let rect=canvas.getBoundingClientRect();pix={w:rect.width,h:rect.height,dpr:Math.max(1,window.devicePixelRatio||1)};canvas.width=Math.round(pix.w*pix.dpr);canvas.height=Math.round(pix.h*pix.dpr);autoFit();}
