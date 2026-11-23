'use strict';
// Mobile canvas: one-finger tap/edit or Pan tool, two-finger pinch and pan.
// Capture touch pointers BEFORE the editor's bubble-phase pointer handlers:
// otherwise the first finger would immediately stamp/erase/connect a machine.
(function initMobileTouchGestures(){
 const map=document.getElementById('map');
 if(!map||!window.PointerEvent)return;
 const touches=new Map();
 const mobile=window.matchMedia('(max-width: 900px)');
 let single=null,pinch=null,usedMulti=false,paintQueued=false;
 const MIN_ZOOM=3,MAX_ZOOM=48,TAP_TOLERANCE=9;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const isMobileTouch=e=>e.pointerType==='touch'&&mobile.matches;
 function localPoint(e){
  const r=map.getBoundingClientRect();
  return {x:e.clientX-r.left,y:e.clientY-r.top};
 }
 function queuePaint(){
  if(paintQueued)return;
  paintQueued=true;
  requestAnimationFrame(()=>{paintQueued=false;draw();});
 }
 function preventEditor(e){e.preventDefault();e.stopImmediatePropagation();}
 function beginPinch(){
  // Cancel any preview started by a single-finger edit drag; never commit it.
  if(single?.forwarded){
   drag=null;marquee=null;
   if(!single.hadGroupTransform&&groupTransform){groupTransform=null;updateGroupControls();}
   queuePaint();
  }
  single=null;usedMulti=true;
  const pair=[...touches.values()].slice(0,2);
  if(pair.length<2){pinch=null;return;}
  const midX=(pair[0].x+pair[1].x)/2,midY=(pair[0].y+pair[1].y)/2;
  pinch={distance:Math.max(1,Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y)),
   zoom:camera.z,worldX:(midX-camera.x)/camera.z,worldY:(midY-camera.y)/camera.z};
 }
 function updatePinch(){
  if(!pinch||touches.size<2)return;
  const pair=[...touches.values()].slice(0,2);
  const midX=(pair[0].x+pair[1].x)/2,midY=(pair[0].y+pair[1].y)/2;
  const distance=Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y);
  const zoom=clamp(pinch.zoom*distance/pinch.distance,MIN_ZOOM,MAX_ZOOM);
  // Keep the same map point under the fingers' moving midpoint. Therefore
  // changing finger spacing zooms, and moving both fingers pans simultaneously.
  camera.z=zoom;
  camera.x=midX-pinch.worldX*zoom;
  camera.y=midY-pinch.worldY*zoom;
  queuePaint();
 }
 // Preserve a group's starting world coordinates for the entire finger gesture.
 // Creating a move preview after the touch threshold must NOT reset its origin
 // or forward onPointerMove (which follows hover and can jump one tile).
 function movePreviewFromTouch(start,p){
  if(!groupTransform||!start?.groupStart)return;
  const t=groupTransform;
  const cell={x:start.groupStart.x+t.anchor.x+
    Math.round((p.x-start.startX)/camera.z),
   y:start.groupStart.y+t.anchor.y+
    Math.round((p.y-start.startY)/camera.z)};
  moveGroupPreviewTo(cell);
  queuePaint();
 }
 function startRemainingPan(){
  const entry=touches.entries().next().value;
  if(!entry){single=null;return;}
  const [pointerId,p]=entry;
  single={pointerId,startX:p.x,startY:p.y,x:p.x,y:p.y,
   clientX:p.clientX,clientY:p.clientY,cameraX:camera.x,cameraY:camera.y,
   forwarded:false,continuation:true,moved:true};
 }
 function replayDown(s,e){
  // On pointerup the original pointer is still active, so the editor may
  // capture/release its pointer normally. Only a genuine tap is replayed.
  onPointerDown({pointerId:e.pointerId,button:0,clientX:s.clientX,clientY:s.clientY,
   pointerType:'touch',preventDefault(){},stopPropagation(){}});
 }
 // The tap must land INSIDE a rendered ghost machine, not just anywhere on
 // the map or inside an empty gap between copied machines.
 function hitPreviewMachine(cell,machines){
  return !!cell&&machines.some(m=>{
   const [w,h]=dims(m);
   return cell.x>=m.x&&cell.x<m.x+w&&cell.y>=m.y&&cell.y<m.y+h;
  });
 }
 // A tap on the canvas can reveal the selected-machine action card *under*
 // that same finger. Chromium may deliver a synthetic click to a newly
 // revealed button afterwards. Suppress only the same-gesture retarget;
 // separate deliberate taps on group buttons still work normally.
 let lastMapTapRelease=null;
 document.addEventListener?.('click',event=>{
  const tap=lastMapTapRelease;
  if(!tap)return;
  if(Date.now()-tap.time>450){lastMapTapRelease=null;return;}
  if(!event.target?.closest?.('#mobileGroupDock #groupControls button'))return;
  if(Math.hypot((event.clientX||0)-tap.x,(event.clientY||0)-tap.y)>12)return;
  event.preventDefault();event.stopImmediatePropagation();lastMapTapRelease=null;
 },true);
 function confirmStampPreview(s,e){
  if(!stampType||!hoverCell)return false;
  const finger=screenToCell(s.x,s.y);
  if(!hitPreviewMachine(finger,[getStampMachine(hoverCell.x,hoverCell.y)]))return false;
  // The ghost is selected. Reuse original desktop placement validation (undo,
  // forbidden cells, ports, warehouse, etc.) at the actual preview position.
  const r=map.getBoundingClientRect();
  replayDown({...s,clientX:r.left+camera.x+(hoverCell.x+.5)*camera.z,
   clientY:r.top+camera.y+(hoverCell.y+.5)*camera.z},e);
  return true;
 }
 function confirmGroupPreview(s){
  const cell=screenToCell(s.x,s.y);
  if(!groupTransform||!hitPreviewMachine(cell,groupTransform.plan?.machines||[]))
   return false;
  return commitGroupTransform();
 }
 map.addEventListener('pointerdown',e=>{
  if(!isMobileTouch(e))return;
  preventEditor(e);
  const p=localPoint(e);
  touches.set(e.pointerId,{...p,clientX:e.clientX,clientY:e.clientY});
  try{map.setPointerCapture(e.pointerId);}catch(_){}
  if(touches.size>=2){beginPinch();return;}
  usedMulti=false;pinch=null;
  const startCell=screenToCell(p.x,p.y);
  const hit=tool==='select'&&!stampType&&!groupTransform&&!draft
   ?cellMachine(startCell.x,startCell.y):null;
  // Only a machine selected BEFORE this touch can be dragged. Sliding over
  // an unselected machine remains a marquee, even when the swipe begins on it.
  const selectedMachineId=hit&&(
   selection?.machineId===hit.id||multiSelection?.machineIds?.includes(hit.id))
   ?hit.id:null;
  single={pointerId:e.pointerId,startX:p.x,startY:p.y,x:p.x,y:p.y,
   clientX:e.clientX,clientY:e.clientY,cameraX:camera.x,cameraY:camera.y,
   forwarded:false,continuation:false,moved:false,hadGroupTransform:!!groupTransform,
   startCell,selectedMachineId,
   previewStart:stampType&&hoverCell?{...hoverCell}:null,
   groupStart:groupTransform?{x:groupTransform.x,y:groupTransform.y}:null};
 },{capture:true,passive:false});
 map.addEventListener('pointermove',e=>{
  if(!touches.has(e.pointerId))return;
  preventEditor(e);
  const p=localPoint(e),saved=touches.get(e.pointerId);
  Object.assign(saved,p,{clientX:e.clientX,clientY:e.clientY});
  if(touches.size>=2){updatePinch();return;}
  if(!single||single.pointerId!==e.pointerId)return;
  single.x=p.x;single.y=p.y;
  const distance=Math.hypot(p.x-single.startX,p.y-single.startY);
  if(distance>TAP_TOLERANCE)single.moved=true;
  // A finger remaining after a pinch may pan, but must never become a tap.
  if(single.continuation||tool==='pan'){
   if(single.moved){camera.x=single.cameraX+p.x-single.startX;
    camera.y=single.cameraY+p.y-single.startY;queuePaint();}
   return;
  }
  // A selected stamp is an editing preview, not a Pan gesture. Drag it by
  // touch displacement relative to its ORIGINAL position so it cannot jump
  // under the finger. Release only fixes the preview; a later tap commits.
  if(stampType){
   if(single.moved){
    const start=single.previewStart||hoverCell||screenToCell(single.startX,single.startY);
    const [w,h]=dims(getStampMachine(0,0));
    const x=clamp(start.x+Math.round((p.x-single.startX)/camera.z),0,72-w);
    const y=clamp(start.y+Math.round((p.y-single.startY)/camera.z),0,72-h);
    if(!hoverCell||hoverCell.x!==x||hoverCell.y!==y){
     hoverCell={x,y};
     queuePaint();
    }
   }
   return;
  }
  // A copied or moved group is also a preview. One finger drags it without
  // placing anything; lifting the finger leaves its new position unchanged.
  if(groupTransform){
   if(single.moved)movePreviewFromTouch(single,p);
   return;
  }
  // An unselected machine is never implicitly picked up by a swipe: marquee
  // starts even when the finger lands on its footprint. A machine which was
  // ALREADY selected at touch-down is the one exception: that swipe explicitly
  // enters move-preview mode, tracking the FULL displacement from touch-down.
  if(distance>TAP_TOLERANCE&&!stampType&&!draft&&!groupTransform&&
     (tool==='select'||tool==='marquee')){
   if(!single.forwarded){
    if(tool==='select'&&single.selectedMachineId){
     const previousHover=hoverCell;
     hoverCell={...single.startCell};
     startGroupTransform('move');
     hoverCell=previousHover;
     if(groupTransform){
      single.groupStart={x:groupTransform.x,y:groupTransform.y};
      single.forwarded=true;
      movePreviewFromTouch(single,p);
      return;
     }
    }
    const from={...single.startCell};
    const fromWorld={x:(single.startX-camera.x)/camera.z,
     y:(single.startY-camera.y)/camera.z};
    marquee={from,to:{...from},fromWorld,toWorld:{...fromWorld}};
    drag={kind:'marquee'};
    single.forwarded=true;
   }
   onPointerMove(e);
  }else if(single.forwarded&&drag?.kind==='marquee'){onPointerMove(e);}
 },{capture:true,passive:false});
 function endPointer(e,cancelled){
  if(!touches.has(e.pointerId))return;
  preventEditor(e);
  const wasPinching=!!pinch||usedMulti;
  const wasSingle=single?.pointerId===e.pointerId?single:null;
  // Remove before deciding whether another contact should continue the pan.
  touches.delete(e.pointerId);
  if(wasPinching){
   if(touches.size>=2){beginPinch();}
   else if(touches.size===1){pinch=null;startRemainingPan();}
   else {pinch=null;single=null;usedMulti=false;}
  }else if(wasSingle){
   if(wasSingle.forwarded){
    if(cancelled){drag=null;marquee=null;draw();}
    else onPointerUp(e);
   }else if(!cancelled&&!wasSingle.moved){
    if(stampType)confirmStampPreview(wasSingle,e);
    else if(groupTransform)confirmGroupPreview(wasSingle);
    else replayDown(wasSingle,e);
    onPointerUp(e);
   }
   single=null;
  }
  if(!cancelled&&!wasPinching&&wasSingle&&!wasSingle.moved)
   lastMapTapRelease={time:Date.now(),x:e.clientX,y:e.clientY};
  try{if(map.hasPointerCapture(e.pointerId))map.releasePointerCapture(e.pointerId);}catch(_){}
 }
 map.addEventListener('pointerup',e=>endPointer(e,false),{capture:true,passive:false});
 map.addEventListener('pointercancel',e=>endPointer(e,true),{capture:true,passive:false});
 function clear(){touches.clear();single=null;pinch=null;usedMulti=false;}
 window.addEventListener('blur',clear);
 mobile.addEventListener?.('change',()=>{if(!mobile.matches)clear();});
})();
