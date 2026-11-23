'use strict';
// A selection is editor-only; saved JSON still contains only machines and routes.
// Only complete, internally connected belts are transformed with a group.
function groupBounds(machines,routes){
 const points=[];
 for(const m of machines){const [w,h]=dims(m);points.push([m.x,m.y],[m.x+w-1,m.y+h-1]);}
 for(const r of routes)for(const [x,y] of r.path)points.push([x,y]);
 if(!points.length)return null;
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const x=Math.min(...xs),y=Math.min(...ys);
 return {x,y,w:Math.max(...xs)-x+1,h:Math.max(...ys)-y+1};
}
function activeMachineSelectionIds(){
 if(multiSelection?.machineIds.length)return multiSelection.machineIds;
 return machineById(selection?.machineId)?[selection.machineId]:[];
}
function selectedGroupData(){
 const selected=activeMachineSelectionIds();
 if(!selected.length)return null;
 const ids=new Set(selected);
 const machines=copy(state.machines.filter(m=>ids.has(m.id)));
 // Keep only the source-connected prefix inside a marquee. A middle/tail-only
 // fragment has no output machine and is not a legal AST1 route.
 const box=multiSelection?.bounds;
 const inside=([x,y])=>!box||(x>=box.x&&y>=box.y&&x<box.x+box.w&&y<box.y+box.h);
 const routes=state.routes.filter(r=>multiSelection?.routeIds.includes(r.id)&&ids.has(r.from.id))
  .map(r=>{
   const prefix=[];
   for(const cell of r.path){if(!inside(cell))break;prefix.push(cell);}
   if(!prefix.length)return null;
   const keepDestination=prefix.length===r.path.length&&r.to&&ids.has(r.to.id);
   return {...copy(r),path:copy(prefix),to:keepDestination?copy(r.to):null};
  }).filter(Boolean);
 return {machines,routes,bounds:groupBounds(machines,routes)};
}
function updateGroupControls(){
 const panel=$('groupControls');if(!panel)return;
 const count=activeMachineSelectionIds().length,belts=multiSelection?.routeIds.length||0;
 panel.style.display=(count||belts||groupClipboard||groupTransform)?'block':'none';
 $('groupSelectionInfo').textContent=groupTransform
  ?`正在${groupTransform.mode==='move'?'移动':'复制'} · ${groupTransform.plan?.valid?'可放置':'位置无效'} · ${typeof mobileEditorActive==='function'&&mobileEditorActive()?'点中虚影确认 / 点「选择」取消':'左键放置 / Esc 取消'}`
  :count||belts?`已框选 ${count} 台机器 / ${belts} 条完整线路`:'已复制选区，可粘贴';
 $('groupMove').disabled=!count||!!groupTransform;
 $('groupCopy').disabled=!count||!!groupTransform;
 $('groupDuplicate').disabled=!count||!!groupTransform;
 $('groupPaste').disabled=!groupClipboard||!!groupTransform;
 $('groupDelete').disabled=!(count||belts)||!!groupTransform;
 $('groupCancel').style.display=groupTransform?'block':'none';
}
function clearGroupSelection(){
 multiSelection=null;groupTransform=null;marquee=null;updateGroupControls();
}
function selectGroupRectangle(a,b){
 const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x);
 const top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
 const machines=state.machines.filter(m=>{const [w,h]=dims(m);
  return m.x<=right&&m.x+w-1>=left&&m.y<=bottom&&m.y+h-1>=top;});
 const routes=state.routes.filter(r=>r.path.length&&r.path.some(([x,y])=>x>=left&&x<=right&&y>=top&&y<=bottom));
 multiSelection=machines.length||routes.length?{machineIds:machines.map(m=>m.id),routeIds:routes.map(r=>r.id),bounds:{x:left,y:top,w:right-left+1,h:bottom-top+1}}:null;
 groupTransform=null;selection=null;inspectorRefresh();updateGroupControls();draw();
 if(multiSelection)notify(`框选 ${machines.length} 台机器、${routes.length} 条完整线路（G 移动 / Ctrl+D 复制）`,'good');
}
// A mouse press only selects. Moving more than 5 screen pixels switches to
// the same non-destructive placement preview used by G (never mutates state).
function beginMachineDragPress(machineId,point,cell,pointerId){
 if(!multiSelection?.machineIds.includes(machineId)){
  clearGroupSelection();
  selection={machineId};
 }
 drag={kind:'machine-press',pointerId,startX:point.x,startY:point.y,startCell:{...cell}};
 updateGroupControls();inspectorRefresh();draw();
}
function updateMachineDragPress(point,cell,pointerId){
 if(drag?.kind!=='machine-press'||drag.pointerId!==pointerId)return false;
 if(Math.hypot(point.x-drag.startX,point.y-drag.startY)<5)return false;
 // The cursor's grab offset is measured at mouse-down, not on the frame
 // crossing the drag threshold: the machine cannot jump under the pointer.
 const currentHover=hoverCell;
 hoverCell=drag.startCell;
 startGroupTransform('move');
 hoverCell=currentHover;
 if(!groupTransform){drag=null;return false;}
 drag.kind='machine-preview';
 moveGroupPreviewTo(cell);
 return true;
}
function copyGroupSelection(){
 const source=selectedGroupData();
 if(!source)return notify('请先框选至少一台机器，再复制','bad');
 groupClipboard=source;updateGroupControls();
 notify(`已复制 ${source.machines.length} 台机器、${source.routes.length} 条内部线路；Ctrl+V 粘贴`,'good');
}
function startGroupTransform(mode='move',fromClipboard=false){
 if(groupTransform)return;
 const source=fromClipboard?groupClipboard:selectedGroupData();
 if(!source?.machines.length)return notify('请先框选至少一台机器','bad');
 const cursor=hoverCell&&inMap(hoverCell.x,hoverCell.y)?hoverCell:source.bounds;
 groupTransform={mode,source:copy(source),rotation:0,
  anchor:mode==='move'?{x:cursor.x-source.bounds.x,y:cursor.y-source.bounds.y}:{x:0,y:0},
  x:mode==='move'?source.bounds.x:cursor.x,
  y:mode==='move'?source.bounds.y:cursor.y,plan:null};
 stampType=null;draft=null;tool='select';
 document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool==='select'));
 updateGroupPreview();updateGroupControls();draw();
}
function pasteGroup(){startGroupTransform('copy',true);}
function duplicateGroup(){copyGroupSelection();if(groupClipboard)pasteGroup();}
function rotateFace(face,steps){const directions=['E','S','W','N'];return directions[(directions.indexOf(face||'E')+steps+4)%4];}
function groupRotateCell(x,y,bounds,rotation){
 const dx=x-bounds.x,dy=y-bounds.y;
 if(rotation===1)return [bounds.h-1-dy,dx];
 if(rotation===2)return [bounds.w-1-dx,bounds.h-1-dy];
 if(rotation===3)return [dy,bounds.w-1-dx];
 return [dx,dy];
}
function createGroupPlan(transform){
 const {source,rotation,mode}=transform,b=source.bounds;
 const remap=new Map(),portRemaps=new Map();
 const machines=source.machines.map((old,i)=>{
  const next=copy(old),[w,h]=dims(old),[rx,ry]=groupRotateCell(old.x,old.y,b,rotation);
  // Rectangles rotate about their outermost occupied tiles, not their top-left.
  const coords=[[old.x,old.y],[old.x+w-1,old.y],[old.x,old.y+h-1],[old.x+w-1,old.y+h-1]]
   .map(([x,y])=>groupRotateCell(x,y,b,rotation));
  next.x=transform.x+Math.min(...coords.map(p=>p[0]));
  next.y=transform.y+Math.min(...coords.map(p=>p[1]));
  next.face=rotateFace(old.face,rotation);
  if(rotation%2){if(Number.isInteger(old.w)&&Number.isInteger(old.h)){next.w=h;next.h=w;}}
  if(mode==='copy')next.id='__group_preview_m'+i;
  remap.set(old.id,next.id);
  const indices={in:{},out:{}},oldPorts=getPorts(old),newPorts=getPorts(next),used=new Set();
  for(const p of oldPorts){
   const [px,py]=groupRotateCell(p.x,p.y,b,rotation);
   const tx=transform.x+px,ty=transform.y+py,side=rotateFace(p.side,rotation);
   const candidates=newPorts.filter(q=>q.kind===p.kind&&q.side===side&&!used.has(q.kind+q.index));
   candidates.sort((a,z)=>(Math.abs(a.x-tx)+Math.abs(a.y-ty))-(Math.abs(z.x-tx)+Math.abs(z.y-ty)));
   if(!candidates.length)continue;
   const chosen=candidates[0];used.add(chosen.kind+chosen.index);
   indices[p.kind][p.index]=chosen.index;
  }
  // Preserve filter meaning by physical port, not by numerical port slot.
  if(rotation){
   for(const [kind,key] of [['in','filters'],['out','outFilters']]){
    if(!old[key])continue;
    const filters={};
    for(const [i,value] of Object.entries(old[key])){
     const newIndex=indices[kind][i];if(newIndex!==undefined)filters[newIndex]=value;
    }
    next[key]=filters;
   }
  }
  portRemaps.set(old.id,indices);
  return next;
 });
 const routes=source.routes.map((old,i)=>{
  const next=copy(old);
  if(mode==='copy')next.id='__group_preview_r'+i;
  next.from.id=remap.get(old.from.id);if(next.to)next.to.id=remap.get(old.to.id);
  next.from.port=portRemaps.get(old.from.id)?.out[old.from.port]??old.from.port;
  if(next.to)next.to.port=portRemaps.get(old.to.id)?.in[old.to.port]??old.to.port;
  next.path=old.path.map(([x,y])=>{const [rx,ry]=groupRotateCell(x,y,b,rotation);return [transform.x+rx,transform.y+ry];});
  return next;
 });
 const moving=new Set(mode==='move'?source.machines.map(m=>m.id):[]);
 const keptMachines=state.machines.filter(m=>!moving.has(m.id));
 // Any route crossing a moved-group boundary is deliberately disconnected.
 const removedRoutes=state.routes.filter(r=>moving.has(r.from.id)||moving.has(r.to?.id));
 const keptRoutes=state.routes.filter(r=>!moving.has(r.from.id)&&!moving.has(r.to?.id));
 const candidate={...state,machines:[...keptMachines,...machines],routes:[...keptRoutes,...routes]};
 let error=null;
 const original=state;
 try{
  state=candidate;
  for(const m of machines)if(!canPlace(m)){error='机器、线路、端口或禁建区域发生冲突';break;}
  if(!error)for(const r of routes){error=checkPath(r.path,r.from,r.to,r.id);if(error)break;}
 }finally{state=original;}
 return {valid:!error,error,machines,routes,candidate,disconnected:removedRoutes.length-source.routes.length};
}
function updateGroupPreview(){
 if(!groupTransform)return;
 groupTransform.plan=createGroupPlan(groupTransform);
 updateGroupControls();
}
function moveGroupPreviewTo(cell){
 if(!groupTransform||!cell)return;
 const tx=cell.x-groupTransform.anchor.x,ty=cell.y-groupTransform.anchor.y;
 if(tx===groupTransform.x&&ty===groupTransform.y)return;
 groupTransform.x=tx;groupTransform.y=ty;updateGroupPreview();
}
function rotateGroup(steps){
 if(!groupTransform){
  if(activeMachineSelectionIds().length)startGroupTransform('move');
  else return;
 }
 groupTransform.rotation=(groupTransform.rotation+steps+4)%4;
 updateGroupPreview();draw();
}
function cancelGroupTransform(){
 if(!groupTransform)return;
 groupTransform=null;updateGroupControls();draw();notify('已取消组放置，原布局未改变');
}
function commitGroupTransform(){
 const t=groupTransform;
 if(!t)return false;
 // Clicking without moving/rotating is a no-op; preserve all existing connections.
 if(t.mode==='move'&&t.rotation===0&&t.x===t.source.bounds.x&&t.y===t.source.bounds.y){cancelGroupTransform();return true;}
 const plan=t.plan||createGroupPlan(t);
 if(!plan.valid){notify('无法放置：'+plan.error,'bad');draw();return false;}
 const result=copy(plan.candidate),placed=plan.machines.map(m=>m.id),routeIds=plan.routes.map(r=>r.id);
 if(t.mode==='copy'){
  const ids=new Map();
  for(const m of result.machines)if(placed.includes(m.id)){const id='m'+(++idSeed);ids.set(m.id,id);m.id=id;}
  for(const r of result.routes)if(routeIds.includes(r.id)){
   r.id='r'+(++idSeed);r.from.id=ids.get(r.from.id);if(r.to)r.to.id=ids.get(r.to.id);
  }
  for(let i=0;i<placed.length;i++)placed[i]=ids.get(placed[i]);
 }
 const finalRoutes=t.mode==='copy'?result.routes.filter(r=>r.id.startsWith('r')&&!state.routes.some(x=>x.id===r.id)).map(r=>r.id):routeIds;
 // Mobile group copy remains in preview mode for repeated placement.
 // Desktop keeps the original one-shot copy behavior.
 const keepMobileCopy=t.mode==='copy'&&typeof mobileEditorActive==='function'&&mobileEditorActive();
 snapshot();state=result;selection=null;marquee=null;groupTransform=null;
 multiSelection={machineIds:placed,routeIds:finalRoutes};
 afterChange(t.mode==='copy'?`已放置 ${placed.length} 台复制机器及 ${plan.routes.length} 条内部线路`
  :`已移动 ${placed.length} 台机器及 ${plan.routes.length} 条内部线路，断开 ${Math.max(0,plan.disconnected)} 条外部线路`);
 if(keepMobileCopy){
  // A fresh red (occupied) ghost appears at the last copied coordinates.
  // The user can drag it elsewhere, then tap ON a ghost machine to duplicate
  // again. No further layout changes happen until that explicit confirmation.
  groupTransform={...t,source:copy(t.source),anchor:{...t.anchor},plan:null};
  updateGroupPreview();
  if(typeof mobileUpdatePlacement==='function')mobileUpdatePlacement();
 }
 updateGroupControls();draw();return true;
}
function deleteGroupSelection(){
 if(groupTransform)return;
 const ids=new Set(activeMachineSelectionIds()),routeIds=new Set(multiSelection?.routeIds||[]);
 if(!ids.size&&!routeIds.size)return;
 snapshot();
 const before=state.routes.length;
 state.machines=state.machines.filter(m=>!ids.has(m.id));
 state.routes=state.routes.filter(r=>!ids.has(r.from.id)&&!ids.has(r.to?.id)&&!routeIds.has(r.id));
 const count=ids.size,lines=before-state.routes.length;
 clearGroupSelection();selection=null;
 afterChange(`已删除 ${count} 台机器和 ${lines} 条线路`);
}
