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
 map.addEventListener('pointerdown',e=>{
  if(!isMobileTouch(e))return;
  preventEditor(e);
  const p=localPoint(e);
  touches.set(e.pointerId,{...p,clientX:e.clientX,clientY:e.clientY});
  try{map.setPointerCapture(e.pointerId);}catch(_){}
  if(touches.size>=2){beginPinch();return;}
  usedMulti=false;pinch=null;
  single={pointerId:e.pointerId,startX:p.x,startY:p.y,x:p.x,y:p.y,
   clientX:e.clientX,clientY:e.clientY,cameraX:camera.x,cameraY:camera.y,
   forwarded:false,continuation:false,moved:false,hadGroupTransform:!!groupTransform};
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
  // Preserve long one-finger selection/marquee drags. Editing starts only
  // once movement exceeds tap tolerance, keeping a possible second finger safe.
  if(distance>TAP_TOLERANCE&&!stampType&&!draft&&!groupTransform&&
     (tool==='select'||tool==='marquee')){
   if(!single.forwarded){
    replayDown(single,e);
    single.forwarded=true;
   }
   onPointerMove(e);
  }else if(single.forwarded){onPointerMove(e);}
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
    replayDown(wasSingle,e);
    onPointerUp(e);
   }
   single=null;
  }
  try{if(map.hasPointerCapture(e.pointerId))map.releasePointerCapture(e.pointerId);}catch(_){}
 }
 map.addEventListener('pointerup',e=>endPointer(e,false),{capture:true,passive:false});
 map.addEventListener('pointercancel',e=>endPointer(e,true),{capture:true,passive:false});
 function clear(){touches.clear();single=null;pinch=null;usedMulti=false;}
 window.addEventListener('blur',clear);
 mobile.addEventListener?.('change',()=>{if(!mobile.matches)clear();});
})();
