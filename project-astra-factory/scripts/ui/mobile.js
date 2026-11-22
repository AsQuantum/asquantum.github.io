'use strict';
// Smartphone workspace. Existing editor, simulation, menus and inspector are reused,
// not duplicated: desktop remains the three-column layout.
const mobileLayoutMedia=window.matchMedia('(max-width: 900px)');
let mobileActiveView='map';

function mobileEditorActive(){return mobileLayoutMedia.matches;}
function mobileUpdatePlacement(){
 const bar=$('mobileStampBar'),status=$('mobileMapState');
 if(!bar||!status)return;
 bar.hidden=!stampType;
 if(stampType){
  const name=def({type:stampType})?.name||stampType;
  $('mobileStampName').textContent=name;
  status.textContent='放置：'+name+' · 点击地图格子';
 }else if(tool==='belt')status.textContent='接线：点橙色输出口 → 蓝色输入口';
 else if(tool==='pan')status.textContent='平移：单指拖动 · 双指缩放／平移';
 else if(groupTransform)status.textContent='移动预览：点击地图确认';
 else status.textContent='双指缩放、平移地图';
}
function mobileOpenView(view){
 if(!mobileEditorActive())return;
 if(!['map','tools','machines','inspector','warehouse'].includes(view))return;
 mobileActiveView=view;
 const main=document.querySelector('.main');
 main.dataset.mobileView=view;
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
   }
  });
 }
 mobileUpdatePlacement();
}
function mobileZoom(factor){
 if(!mobileEditorActive())return;
 const center={x:pix.w/2,y:pix.h/2},old=camera.z;
 const next=Math.max(3,Math.min(48,old*factor));
 if(next===old)return;
 camera.x=center.x-(center.x-camera.x)*next/old;
 camera.y=center.y-(center.y-camera.y)*next/old;
 camera.z=next;
 draw();
}

document.querySelectorAll('.mobile-nav [data-mobile-view]').forEach(button=>{
 button.addEventListener('click',()=>mobileOpenView(button.dataset.mobileView));
});
$('mobilePlaceButton')?.addEventListener('click',()=>mobileOpenView('map'));
$('mobileFit')?.addEventListener('click',()=>autoFit());
$('mobileZoomIn')?.addEventListener('click',()=>mobileZoom(1.3));
$('mobileZoomOut')?.addEventListener('click',()=>mobileZoom(1/1.3));

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
