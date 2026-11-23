'use strict';
// Smartphone workspace. Existing editor, simulation, menus and inspector are reused,
// not duplicated: desktop remains the three-column layout.
const mobileLayoutMedia=window.matchMedia('(max-width: 900px)');
let mobileActiveView='map';
let mobileStampPreviewType=null;
// Center a pending machine's footprint on the visible canvas, not the whole
// 72×72 map. This is a preview only; it never creates a machine or a snapshot.
function mobilePrepareStampPreview(){
 if(!mobileEditorActive())return;
 if(!stampType){mobileStampPreviewType=null;return;}
 if(mobileStampPreviewType===stampType&&hoverCell)return;
 const [w,h]=dims(getStampMachine(0,0));
 const x=Math.floor((pix.w*.5-camera.x)/camera.z-w/2);
 const y=Math.floor((pix.h*.5-camera.y)/camera.z-h/2);
 hoverCell={x:Math.max(0,Math.min(72-w,x)),y:Math.max(0,Math.min(72-h,y))};
 mobileStampPreviewType=stampType;
 draw();
}

function mobileEditorActive(){return mobileLayoutMedia.matches;}
let mobileMapToastTimer=null;
function mobileSetMapStatus(message){
 const status=$('mobileMapState');
 if(!status||status.textContent===message)return;
 status.textContent=message;
 if(mobileMapToastTimer!==null)clearTimeout(mobileMapToastTimer);
 mobileMapToastTimer=null;
 status.classList.toggle('is-visible',Boolean(message));
 if(message)mobileMapToastTimer=setTimeout(()=>{
  status.classList.remove('is-visible');
  mobileMapToastTimer=null;
 },3000);
}
function mobileUpdatePlacement(){
 const bar=$('mobileStampBar');
 if(!bar)return;
 bar.hidden=!stampType;
 let message;
 if(stampType){
  const name=def({type:stampType})?.name||stampType;
  $('mobileStampName').textContent=name;
  message='放置：'+name+' · 拖动虚影定位，松手后再次点按放置';
 }else if(tool==='belt')message='接线：点橙色输出口 → 蓝色输入口';
 else if(tool==='pan')message='平移：单指拖动 · 双指缩放／平移';
 else if(groupTransform)message=groupTransform.mode==='copy'
  ?'连续复制：拖动虚影，点中机器确认；点外面不会放置'
  :'移动预览：拖动虚影，点中机器确认';
 else message='点按选择 · 单指滑动框选 · 双指移动/缩放地图';
 mobileSetMapStatus(message);
}
function mobileOpenView(view){
 if(!mobileEditorActive())return;
 if(!['map','tools','machines','inspector','warehouse'].includes(view))return;
 mobileActiveView=view;
 // Returning from the machine library starts a fresh, centered placement
 // preview even when the user picked the same machine type again.
 if(view==='machines')mobileStampPreviewType=null;
 const main=document.querySelector('.main');
 main.dataset.mobileView=view;
 updateGroupControls();
 for(const button of document.querySelectorAll('.mobile-nav [data-mobile-view]')){
  const selected=button.dataset.mobileView===view;
  button.classList.toggle('active',selected);
  button.setAttribute('aria-pressed',String(selected));
 }
 if(view==='warehouse'&&!warehousePanel.open)warehousePanel.open=true;
 if(view==='map'){
  // The canvas stays in the DOM below the mobile pages, preserving camera pan,
  // zoom, selection and even a half-finished belt route.
  requestAnimationFrame(()=>{
   const bounds=canvas.getBoundingClientRect();
   if(bounds.width>0&&bounds.height>0){
    if(Math.abs(bounds.width-pix.w)>1||Math.abs(bounds.height-pix.h)>1)resize();
    else draw();
    mobilePrepareStampPreview();
   }
  });
 }
 mobileUpdatePlacement();
}
document.querySelectorAll('.mobile-nav [data-mobile-view]').forEach(button=>{
 button.addEventListener('click',()=>mobileOpenView(button.dataset.mobileView));
});
$('mobilePlaceButton')?.addEventListener('click',()=>mobileOpenView('map'));
$('mobileFit')?.addEventListener('click',()=>autoFit());
// On the map, rotate the active placement preview or use the same safe
// group preview for already selected machines (confirm by tapping the ghost).
function mobileRotateEditing(steps){
 if(!mobileEditorActive())return;
 if(groupTransform)rotateGroup(steps);
 else if(stampType)rotateStamp(steps);
 else if(activeMachineSelectionIds().length)rotateGroup(steps);
 else mobileSetMapStatus('请先选择机器或放置预览，再旋转');
}
$('mobileRotateLeft')?.addEventListener('click',()=>mobileRotateEditing(-1));
$('mobileRotateRight')?.addEventListener('click',()=>mobileRotateEditing(1));
$('mobileUndo')?.addEventListener('click',()=>undo());
$('mobileRedo')?.addEventListener('click',()=>redo());
// Choosing "选择" explicitly ends every mobile edit preview. Tapping outside
// a ghost, in contrast, does nothing, avoiding accidental cancellation.
document.querySelector('.top .mobile-sim-tool[data-tool="select"]')?.addEventListener('click',()=>{
 if(!mobileEditorActive())return;
 resetEditorMode();
 mobileStampPreviewType=null;
 hoverCell=null;
 mobileUpdatePlacement();
});
function mobileDeleteSelected(){
 if(!mobileEditorActive())return;
 if(stampType||groupTransform||draft){
  mobileSetMapStatus('请先点「选择」结束当前编辑，再选中要删除的机器或线路');
  return;
 }
 if(multiSelection?.machineIds?.length||multiSelection?.routeIds?.length){
  deleteGroupSelection();
 }else if(selection?.machineId){
  removeMachine(selection.machineId);
 }else if(selection?.routeId){
  deleteRoute(selection.routeId);
 }else{
  mobileSetMapStatus('请先选中机器或线路，再点删除');
 }
}
$('mobileDelete')?.addEventListener('click',mobileDeleteSelected);

// These handlers run after the existing editor actions. Tool selection returns
// to the map. Machine selection instead stays in the library so the user can
// configure recipe, direction and item before tapping "返回地图放置".
document.addEventListener('click',event=>{
 if(!mobileEditorActive())return;
 if(event.target.closest('.side.left .editor-tools [data-tool]')){
  mobileOpenView('map');
 }else if(event.target.closest('[data-stock-chart-open]')){
  mobileOpenView('map');
 }else{
  mobileUpdatePlacement();
 }
});
mobileLayoutMedia.addEventListener('change',()=>{
 if(mobileEditorActive())mobileOpenView('map');
 else{
  document.querySelector('.main').removeAttribute('data-mobile-view');
  mobileUpdatePlacement();
 }
});
if(mobileEditorActive())mobileOpenView('map');
