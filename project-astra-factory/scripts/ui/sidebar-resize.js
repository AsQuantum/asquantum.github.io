'use strict';
// Resizing is a view preference, independent of the layout and simulation.
(()=>{
 const host=document.querySelector('.main');
 if(!host)return;
 const left=host.querySelector('.side.left'),right=host.querySelector('.side.right');
 const handles=[...host.querySelectorAll('[data-sidebar-resize]')];
 if(!left||!right||handles.length!==2)return;
 const desktop=window.matchMedia('(min-width:901px)');
 const key='factory-lab.desktop-sidebar-widths.v1',divider=12,centerMin=260;
 const minima={left:180,right:220};
 const defaults=()=>window.innerWidth<=1100?{left:205,right:248}:{left:245,right:292};
 let preference={left:null,right:null},drag=null,frame=0;
 try{
  const data=JSON.parse(localStorage.getItem(key)||'null');
  for(const side of ['left','right'])if(Number.isFinite(data?.[side]))preference[side]=data[side];
 }catch(e){}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(preference))}catch(e){}};
 const maxFor=(side,other)=>Math.max(minima[side],host.clientWidth-divider-centerMin-other);
 const bound=(n,min,max)=>Math.max(min,Math.min(max,Math.round(n)));
 function measured(){return {left:left.getBoundingClientRect().width,right:right.getBoundingClientRect().width};}
 function apply(changed=null){
  if(!desktop.matches)return;
  const d=defaults(),limit=Math.max(minima.left+minima.right,host.clientWidth-divider-centerMin);
  let l=Math.max(minima.left,preference.left??d.left),r=Math.max(minima.right,preference.right??d.right);
  // Prefer the side being adjusted; on viewport shrink reduce both within limits.
  if(changed==='left')l=bound(l,minima.left,maxFor('left',r));
  else if(changed==='right')r=bound(r,minima.right,maxFor('right',l));
  if(l+r>limit){
   let excess=l+r-limit;
   const available=(l-minima.left)+(r-minima.right);
   if(available>0){
    const cut=Math.min(l-minima.left,Math.round(excess*(l-minima.left)/available));
    l-=cut;excess-=cut;r=Math.max(minima.right,r-excess);
   }
  }
  l=Math.round(l);r=Math.round(r);
  host.style.setProperty('--sidebar-left-width',l+'px');
  host.style.setProperty('--sidebar-right-width',r+'px');
  for(const h of handles){
   const side=h.dataset.sidebarResize,other=side==='left'?r:l;
   h.setAttribute('aria-valuemin',String(minima[side]));
   h.setAttribute('aria-valuemax',String(maxFor(side,other)));
   h.setAttribute('aria-valuenow',String(side==='left'?l:r));
  }
 }
 function resizeMap(){
  if(frame)return;
  frame=requestAnimationFrame(()=>{
   frame=0;
   if(!desktop.matches)return;
   const rect=canvas.getBoundingClientRect();
   const w=rect.width,h=rect.height,dpr=Math.max(1,window.devicePixelRatio||1);
   if(!w||!h||(w===pix.w&&h===pix.h&&dpr===pix.dpr))return;
   // Keep the same world point at the center and preserve zoom.
   camera.x+=(w-pix.w)/2;camera.y+=(h-pix.h)/2;
   pix={w,h,dpr};canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
   draw();
  });
 }
 function finish(e){
  if(!drag||(e?.pointerId!=null&&e.pointerId!==drag.id))return;
  const h=drag.handle,id=drag.id;
  h.classList.remove('is-dragging');document.body.classList.remove('sidebar-resizing');drag=null;
  try{if(h.hasPointerCapture(id))h.releasePointerCapture(id);}catch(e){}
  save();resizeMap();
 }
 for(const h of handles){
  const side=h.dataset.sidebarResize;
  h.addEventListener('pointerdown',e=>{
   if(!desktop.matches||e.button!==0||drag)return;
   e.preventDefault();
   const current=measured();
   drag={handle:h,id:e.pointerId,side,x:e.clientX,width:current[side],other:current[side==='left'?'right':'left']};
   // Keep the opposite side exactly where it was at the start of the drag.
   preference[side==='left'?'right':'left']=drag.other;
   h.setPointerCapture(e.pointerId);h.classList.add('is-dragging');document.body.classList.add('sidebar-resizing');
  });
  h.addEventListener('pointermove',e=>{
   if(!drag||e.pointerId!==drag.id||h!==drag.handle)return;
   const dx=e.clientX-drag.x;
   preference[side]=bound(drag.width+(side==='left'?dx:-dx),minima[side],maxFor(side,drag.other));
   apply(side);resizeMap();
  });
  h.addEventListener('pointerup',finish);
  h.addEventListener('pointercancel',finish);
  h.addEventListener('lostpointercapture',finish);
  h.addEventListener('dblclick',()=>{preference[side]=null;apply(side);save();resizeMap();});
  h.addEventListener('keydown',e=>{
   if(!desktop.matches||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
   e.preventDefault();
   const current=measured(),other=current[side==='left'?'right':'left'];
   preference[side==='left'?'right':'left']=other;
   const step=e.shiftKey?40:12,delta=(e.key==='ArrowRight'?1:-1)*(side==='left'?1:-1)*step;
   preference[side]=e.key==='Home'?minima[side]:e.key==='End'?maxFor(side,other):bound(current[side]+delta,minima[side],maxFor(side,other));
   apply(side);save();resizeMap();
  });
 }
 window.addEventListener('blur',()=>finish());
 window.addEventListener('resize',()=>{if(!desktop.matches){finish();return;}apply();resizeMap();});
 desktop.addEventListener?.('change',()=>{if(desktop.matches){apply();resizeMap();}else finish();});
 apply();resizeMap();
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(resizeMap).observe(host.querySelector('.canvaswrap'));
})();
