'use strict';
// Warehouse stock history: reconstruct absolute stock from real item movements.
// The chart is read-only; neither the simulated inventory nor the LP is modified.
const stockChartHiddenItems=new Set();
let stockChartWindow='all',stockChartLastDraw=-Infinity,stockChartHoverData=null;

// Floating chart geometry is independent of the factory map and its simulation.
// Save it only after a successful drag or corner resize.
const STOCK_CHART_LAYOUT_KEY='factory-lab.stock-chart.layout.v1';
let stockChartLayoutReady=false,stockChartCustomLayout=false,stockChartPointerDrag=null,stockChartResizeFrame=0;
const stockChartClamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function stockChartGeometry(){
 const panel=$('stockChartPanel');
 const box=panel.getBoundingClientRect(),host=panel.parentElement.getBoundingClientRect();
 return {left:box.left-host.left,top:box.top-host.top,width:box.width,height:box.height,
  sized:panel.classList.contains('stock-chart-sized')};
}
function stockChartLimits(){
 const panel=$('stockChartPanel'),host=panel.parentElement.getBoundingClientRect();
 const gap=8,maxWidth=Math.max(1,host.width-2*gap),maxHeight=Math.max(1,host.height-2*gap);
 return {gap,width:host.width,height:host.height,minWidth:Math.min(360,maxWidth),
  minHeight:Math.min(340,maxHeight),maxWidth,maxHeight};
}
function stockChartApplyGeometry(geometry){
 const panel=$('stockChartPanel');
 if(!panel||panel.hidden||!geometry)return;
 const limit=stockChartLimits();
 if(limit.maxWidth<=1||limit.maxHeight<=1)return;
 const width=stockChartClamp(Number(geometry.width)||limit.minWidth,limit.minWidth,limit.maxWidth);
 const sized=!!geometry.sized;
 panel.style.width=width+'px';
 if(sized){
  const height=stockChartClamp(Number(geometry.height)||limit.minHeight,limit.minHeight,limit.maxHeight);
  panel.classList.add('stock-chart-sized');
  panel.classList.toggle('stock-chart-short',height<435);
  panel.style.height=height+'px';
  panel.style.maxHeight='none';
 }else{
  panel.classList.remove('stock-chart-sized','stock-chart-short');
  panel.style.height='';
  panel.style.maxHeight='calc(100% - 16px)';
 }
 const height=panel.getBoundingClientRect().height;
 panel.style.left=stockChartClamp(Number(geometry.left)||0,limit.gap,Math.max(limit.gap,limit.width-limit.gap-width))+'px';
 panel.style.top=stockChartClamp(Number(geometry.top)||0,limit.gap,Math.max(limit.gap,limit.height-limit.gap-height))+'px';
 panel.style.right='auto';
 panel.style.bottom='auto';
 stockChartCustomLayout=true;
}
function stockChartSaveGeometry(){
 try{localStorage.setItem(STOCK_CHART_LAYOUT_KEY,JSON.stringify(stockChartGeometry()));}catch(e){/* Optional browser preference */ }
}
function stockChartRestoreGeometry(){
 if(stockChartLayoutReady)return;
 stockChartLayoutReady=true;
 try{
  const saved=JSON.parse(localStorage.getItem(STOCK_CHART_LAYOUT_KEY)||'null');
  if(saved&&['left','top','width','height'].every(k=>Number.isFinite(saved[k]))&&typeof saved.sized==='boolean')
   stockChartApplyGeometry(saved);
 }catch(e){/* Private browsing or obsolete preference */ }
}
function stockChartScheduleRender(){
 if(stockChartResizeFrame)return;
 stockChartResizeFrame=requestAnimationFrame(()=>{
  stockChartResizeFrame=0;
  if(!$('stockChartPanel')?.hidden)stockChartRender();
 });
}
function stockChartPointerStart(event){
 if(event.button!==0||stockChartPointerDrag)return;
 const resize=event.target.closest('[data-stock-resize]');
 const head=event.target.closest('.stock-chart-head');
 if(!resize&&!head)return;
 if(!resize&&event.target.closest('button,a,input,select,textarea'))return;
 const panel=$('stockChartPanel');
 // Opening fade must never resume when the pointer is released.
 panel.classList.remove('stock-chart-opening');
 const geometry=stockChartGeometry();
 stockChartPointerDrag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,geometry,
  handle:resize?.dataset.stockResize||'',changed:false};
 panel.classList.add('stock-chart-moving');
 if(!resize)panel.classList.add('stock-chart-dragging');
 try{panel.setPointerCapture(event.pointerId);}catch(e){/* Pointer capture is optional */ }
 event.preventDefault();
 event.stopPropagation();
}
function stockChartPointerUpdate(event){
 const drag=stockChartPointerDrag;
 if(!drag||event.pointerId!==drag.pointerId)return;
 const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
 if(!drag.changed&&Math.abs(dx)+Math.abs(dy)<3)return;
 drag.changed=true;
 const g=drag.geometry,l=stockChartLimits();
 let left=g.left,top=g.top,width=g.width,height=g.height;
 if(!drag.handle){
  left=stockChartClamp(g.left+dx,l.gap,Math.max(l.gap,l.width-l.gap-g.width));
  top=stockChartClamp(g.top+dy,l.gap,Math.max(l.gap,l.height-l.gap-g.height));
 }else{
  const west=drag.handle.includes('w'),north=drag.handle.includes('n');
  const right=g.left+g.width,bottom=g.top+g.height;
  const maxWidth=west?right-l.gap:l.width-l.gap-g.left;
  const maxHeight=north?bottom-l.gap:l.height-l.gap-g.top;
  width=stockChartClamp(g.width+(west?-dx:dx),Math.min(l.minWidth,maxWidth),Math.max(1,maxWidth));
  height=stockChartClamp(g.height+(north?-dy:dy),Math.min(l.minHeight,maxHeight),Math.max(1,maxHeight));
  if(west)left=right-width;
  if(north)top=bottom-height;
 }
 stockChartApplyGeometry({left,top,width,height,sized:!!drag.handle||g.sized});
 // The existing SVG scales smoothly with CSS during resize. Replacing SVG
 // innerHTML on every pointer move makes the graph visibly flash; redraw once
 // after the final size is chosen instead.
 event.preventDefault();
}
function stockChartPointerEnd(event){
 const drag=stockChartPointerDrag;
 if(!drag||(event&&event.pointerId!==drag.pointerId))return;
 stockChartPointerDrag=null;
 const panel=$('stockChartPanel');
 panel.classList.remove('stock-chart-moving','stock-chart-dragging');
 if(drag.changed){
  stockChartSaveGeometry();
  // A single coalesced redraw at the end catches up on any live stock changes
  // skipped during the gesture. Dragging itself never replaces SVG contents.
  stockChartScheduleRender();
 }
 try{if(panel.hasPointerCapture(drag.pointerId))panel.releasePointerCapture(drag.pointerId);}catch(e){}
}

function stockChartHistory(){
 const buckets=sim?.minuteBuckets||[],names=new Set(Object.keys(ware||{}));
 for(const b of buckets)if(b){
  for(const key of Object.keys(b.inbound||{}))names.add(key);
  for(const key of Object.keys(b.outbound||{}))names.add(key);
  for(const key of Object.keys(b.manualStock||{}))names.add(key);
 }
 const items=[...names].filter(Boolean).sort(factoryItemCompare);
 const current=Object.fromEntries(items.map(item=>[item,0]));
 const points=[{minute:0,stocks:{...current}}];
 const minute=simTime/60,completed=Math.floor(minute+1e-8);
 const apply=b=>{
  if(!b)return;
  for(const [item,n] of Object.entries(b.inbound||{}))current[item]=(current[item]||0)+n;
  for(const [item,n] of Object.entries(b.outbound||{}))current[item]=(current[item]||0)-n;
  for(const [item,n] of Object.entries(b.manualStock||{}))current[item]=(current[item]||0)+n;
 };
 for(let i=0;i<completed;i++){
  apply(buckets[i]);
  points.push({minute:i+1,stocks:{...current}});
 }
 if(minute>completed+1e-8){
  apply(buckets[completed]);
  points.push({minute,stocks:{...current}});
 }
 return {items,points,minute};
}

function stockChartOpen(open){
 const panel=$('stockChartPanel');
 if(!panel)return;
 const wasHidden=panel.hidden;
 panel.hidden=!open;
 if(open){
  if(wasHidden)panel.classList.add('stock-chart-opening');
  stockChartRestoreGeometry();
  if(stockChartCustomLayout)stockChartApplyGeometry(stockChartGeometry());
  stockChartRender();
 }else{
  panel.classList.remove('stock-chart-opening');
 }
}
// Clear animation state after the first open; subsequent live redraws,
// dragging, resizing, tab switches and pointer release never restart it.
$('stockChartPanel')?.addEventListener('animationend',event=>{
 if(event.target===$('stockChartPanel')&&event.animationName==='factoryChartReveal')
  event.target.classList.remove('stock-chart-opening');
});

function stockChartReset(){
 stockChartHiddenItems.clear();
 stockChartLastDraw=-Infinity;
 if(!$('stockChartPanel')?.hidden)stockChartRender();
}

function stockChartMaybeRefresh(){
 if(!$('stockChartPanel')||$('stockChartPanel').hidden||stockChartPointerDrag)return;
 if(simTime-stockChartLastDraw>=1||simTime<stockChartLastDraw)stockChartRender();
}

function stockChartRender(){
 const panel=$('stockChartPanel');
 if(!panel||panel.hidden)return;
 stockChartLastDraw=simTime;
 const {items,points,minute}=stockChartHistory();
 const start=stockChartWindow==='all'?0:Math.max(0,minute-Number(stockChartWindow));
 const shown=items.filter(item=>!stockChartHiddenItems.has(item));
 const total=Object.values(ware||{}).reduce((sum,n)=>sum+n,0);
 $('stockChartStats').textContent='总库存 '+total.toLocaleString('zh-CN')+' 件 · '+minute.toFixed(1)+' 分钟';
 $('stockChartHint').textContent=items.length?'真实逐件收支累计 · 仅重置模拟时清空':'开始模拟后，这里将显示仓库库存的变化';
 for(const button of panel.querySelectorAll('[data-stock-window]')){
  button.classList.toggle('selected',button.dataset.stockWindow===stockChartWindow);
  button.setAttribute('aria-pressed',String(button.dataset.stockWindow===stockChartWindow));
 }
 $('stockChartLegend').innerHTML=items.length?items.map(item=>{
  const active=!stockChartHiddenItems.has(item),value=ware?.[item]||0;
  return '<button type="button" class="stock-legend-item'+(active?'':' muted')+'" data-stock-item="'+encodeURIComponent(item)+'" title="'+esc(item)+'：'+value+' 件（点击切换）" aria-pressed="'+active+'">'+
   '<span class="stock-legend-color" style="background:'+materialColor(item)+'"></span>'+
   '<span class="stock-legend-name">'+esc(item)+'</span><b>'+value.toLocaleString('zh-CN')+'</b></button>';
 }).join(''):'<div class="stock-chart-empty-legend">模拟仓库尚无物品记录</div>';
 $('stockChartSelection').textContent='已显示 '+shown.length+' / '+items.length+' 种';
 // Reserve two separate bottom rows: tick values and an axis unit label.
// The old y=height-1 label overlapped the rightmost tick and was clipped.
 const sized=panel.classList.contains('stock-chart-sized'),chartArea=$('stockChartPlot');
 const width=sized?Math.max(280,Math.round(chartArea.clientWidth)):850;
 const height=sized?Math.max(155,Math.round(chartArea.clientHeight)):315;
 const margin={left:60,right:24,top:20,bottom:54},plotW=width-margin.left-margin.right,plotH=height-margin.top-margin.bottom;
 const end=Math.max(1,minute),from=Math.min(start,end),span=Math.max(1e-8,end-from);
 const inside=points.filter(p=>p.minute>=from-1e-8);
 if(from>0&&points.length){
  let before=points[0],after=points[points.length-1];
  for(let i=1;i<points.length;i++)if(points[i].minute>=from){
   after=points[i];before=points[i-1];break;
  }
  const f=(from-before.minute)/Math.max(1e-8,after.minute-before.minute);
  const interpolated={};
  for(const item of items)interpolated[item]=(before.stocks[item]||0)+(after.stocks[item]-before.stocks[item])*Math.max(0,Math.min(1,f));
  inside.unshift({minute:from,stocks:interpolated});
 }
 // Use the minimum AND maximum of every VISIBLE material in the selected
 // time window, including the interpolated stock at the window boundary.
 // Full history intentionally retains its zero baseline; recent windows
 // must zoom vertically rather than waste space below the lowest curve.
 let minValue=Infinity,maxValue=-Infinity;
 for(const point of inside)for(const item of shown){
  const value=point.stocks[item]||0;
  if(value<minValue)minValue=value;
  if(value>maxValue)maxValue=value;
 }
 let yMin=0,yMax=1;
 if(Number.isFinite(minValue)){
  if(stockChartWindow==='all'){
   const top=Math.max(1,maxValue),rough=top/5;
   const power=Math.pow(10,Math.floor(Math.log10(rough)));
   const multiplier=[1,2,5,10].find(k=>k*power>=rough)||10,step=power*multiplier;
   yMax=Math.max(step,Math.ceil(top/step)*step);
  }else if(maxValue>minValue){
   yMin=minValue;yMax=maxValue;
  }else{
   // A flat, positive curve still needs a visible vertical range.
   const pad=Math.max(1,Math.abs(minValue)*.05);
   yMin=Math.max(0,minValue-pad);
   yMax=maxValue+pad;
  }
 }
 const X=t=>margin.left+(t-from)/span*plotW;
 const Y=v=>margin.top+plotH-(v-yMin)/(yMax-yMin)*plotH;
 const fmt=v=>Number.isInteger(v)?v.toLocaleString('zh-CN'):
  v.toFixed((yMax-yMin)<1?3:(yMax-yMin)<10?2:1);
 const svg=[];
 svg.push('<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="仓库库存随模拟分钟变化的折线图" xmlns="http://www.w3.org/2000/svg">');
 svg.push('<defs><clipPath id="stockLinesClip"><rect x="'+margin.left+'" y="'+margin.top+'" width="'+plotW+'" height="'+plotH+'"/></clipPath></defs>');
 for(let i=0;i<=5;i++){
  const v=yMin+(yMax-yMin)*i/5,y=Y(v);
  svg.push('<line class="stock-gridline" x1="'+margin.left+'" x2="'+(width-margin.right)+'" y1="'+y+'" y2="'+y+'"/>');
  svg.push('<text class="stock-tick" text-anchor="end" x="'+(margin.left-11)+'" y="'+(y+4)+'">'+fmt(v)+'</text>');
 }
 for(let i=0;i<=5;i++){
  const t=from+span*i/5,x=X(t);
  svg.push('<line class="stock-xgrid" x1="'+x+'" x2="'+x+'" y1="'+margin.top+'" y2="'+(margin.top+plotH)+'"/>');
  svg.push('<text class="stock-tick" text-anchor="middle" x="'+x+'" y="'+(height-38)+'">'+fmt(Number(t.toFixed(1)))+'</text>');
 }
 svg.push('<text class="stock-axis-label" x="'+margin.left+'" y="12">库存（件）</text>');
 svg.push('<text class="stock-axis-label" x="'+(width-margin.right)+'" text-anchor="end" y="'+(height-10)+'">时间（分钟）</text>');
 svg.push('<g clip-path="url(#stockLinesClip)">');
 for(const item of shown){
  const d=inside.map((p,i)=>(i?'L':'M')+X(p.minute).toFixed(2)+','+Y(p.stocks[item]||0).toFixed(2)).join(' ');
  if(d)svg.push('<path d="'+d+'" fill="none" stroke="'+materialColor(item)+'" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity=".94"/>');
 }
 svg.push('</g>');
 svg.push('<line id="stockChartGuide" class="stock-guide" x1="0" x2="0" y1="'+margin.top+'" y2="'+(margin.top+plotH)+'" visibility="hidden"/>');
 svg.push('<rect id="stockChartHitArea" x="'+margin.left+'" y="'+margin.top+'" width="'+plotW+'" height="'+plotH+'" fill="transparent" style="cursor:crosshair"/>');
 svg.push('</svg>');
 $('stockChartSvg').innerHTML=svg.join('');
 stockChartHoverData={points:inside,items:shown,from,span,margin,plotW,width,height,yMin,yMax};
 $('stockChartTooltip').hidden=true;
}

function stockChartPointerMove(event){
 const data=stockChartHoverData,plot=$('stockChartPlot'),tip=$('stockChartTooltip'),guide=$('stockChartGuide');
 if(!data||!data.points.length||!plot||!tip||!guide)return;
 const rect=plot.getBoundingClientRect();
 const px=(event.clientX-rect.left)*data.width/rect.width;
 const x=Math.max(data.margin.left,Math.min(data.margin.left+data.plotW,px));
 const target=data.from+(x-data.margin.left)/data.plotW*data.span;
 let closest=data.points[0];
 for(const p of data.points)if(Math.abs(p.minute-target)<Math.abs(closest.minute-target))closest=p;
 const gx=data.margin.left+(closest.minute-data.from)/data.span*data.plotW;
 guide.setAttribute('x1',gx);guide.setAttribute('x2',gx);guide.setAttribute('visibility','visible');
 const sorted=data.items.slice().sort(factoryItemCompare);
 const lines=sorted.slice(0,7).map(item=>'<div><span><i style="background:'+materialColor(item)+'"></i>'+esc(item)+'</span><b>'+(closest.stocks[item]||0).toLocaleString('zh-CN')+'</b></div>').join('');
 tip.innerHTML='<strong>第 '+closest.minute.toFixed(1)+' 分钟</strong>'+lines+(sorted.length>7?'<small>另有 '+(sorted.length-7)+' 种物品，可在下方图例筛选</small>':'');
 tip.hidden=false;
 const left=event.clientX-rect.left;
 tip.style.left=Math.max(5,Math.min(rect.width-215,left+15))+'px';
 tip.style.top='12px';
}
function stockChartPointerLeave(){
 const guide=$('stockChartGuide'),tip=$('stockChartTooltip');
 if(guide)guide.setAttribute('visibility','hidden');
 if(tip)tip.hidden=true;
}
document.addEventListener('click',event=>{
 const open=event.target.closest('[data-stock-chart-open]');
 if(open){stockChartOpen(true);return;}
 if(event.target.closest('[data-stock-chart-close]')){stockChartOpen(false);return;}
 const windowButton=event.target.closest('[data-stock-window]');
 if(windowButton){stockChartWindow=windowButton.dataset.stockWindow;stockChartRender();return;}
 const legend=event.target.closest('[data-stock-item]');
 if(legend){
  const item=decodeURIComponent(legend.dataset.stockItem);
  if(stockChartHiddenItems.has(item))stockChartHiddenItems.delete(item);else stockChartHiddenItems.add(item);
  stockChartRender();return;
 }
 if(event.target.closest('[data-stock-show-all]')){stockChartHiddenItems.clear();stockChartRender();}
});
$('stockChartPlot')?.addEventListener('pointermove',stockChartPointerMove);
$('stockChartPlot')?.addEventListener('pointerleave',stockChartPointerLeave);
$('stockChartPanel')?.addEventListener('pointerdown',stockChartPointerStart);
document.addEventListener('pointermove',stockChartPointerUpdate);
document.addEventListener('pointerup',stockChartPointerEnd);
document.addEventListener('pointercancel',stockChartPointerEnd);
window.addEventListener('blur',()=>stockChartPointerEnd());
if(typeof ResizeObserver!=='undefined'){
 const chartHost=$('stockChartPanel')?.parentElement;
 if(chartHost)new ResizeObserver(()=>{
  if(stockChartCustomLayout&&!$('stockChartPanel').hidden){
   stockChartApplyGeometry(stockChartGeometry());
   stockChartScheduleRender();
  }
 }).observe(chartHost);
}
