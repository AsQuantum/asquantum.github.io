'use strict';
const makeColor=m=>DEF[m.type]?.color||'#8796ac';
// An output linked to an open belt does not yet reach any receiving machine.
function machineOutputWarning(m){
 const ports=getPorts(m).filter(p=>p.kind==='out');
 const dangling=ports.some(p=>{
  const r=routeFor(m.id,'out',p.index);
  return r&&!r.to;
 });
 if(dangling)return '出线悬空';
 return getRecipe(m)&&ports.length&&!routeFor(m.id,'out',ports[0].index)?'无出线':null;
}
// Share the same machine placement diagnostics as the factory audit.
function machineWarningHints(m,placement){
 const errors=[],miss=missingMaterials(m),blocked=placement?.blockedByMachine?.get(m.id)||0;
 if(placement?.geometryIds?.has(m.id))errors.push('位置错误');
 if(blocked)errors.push('接口堵塞'+blocked);
 if(miss.length)errors.push('缺料'+miss.length);
 const warning=machineOutputWarning(m);
 return {errors,warning,lines:[...errors.map(text=>({text,color:'#ff657d'})),...(warning?[{text:warning,color:'#ffd16e'}]:[])]};
}
// Reserve vertical space for separate warning rows. Fit the actual font, never
// pass a maxWidth to fillText (which would squeeze glyphs horizontally).
function machineHintLayout(hints,w,h,z){
 if(z<5||!hints.lines.length)return {rows:[],inset:0};
 const rows=hints.lines,available=Math.max(.1,w-.50),font='system-ui, "Microsoft YaHei", sans-serif';
 let size=Math.min(.84,Math.max(.1,(h-.5)*.45/rows.length/1.2));
 ctx.save();
 for(const row of rows){ctx.font='bold '+size+'px '+font;const width=ctx.measureText(row.text).width;if(width>available)size*=available/width;}
 ctx.restore();
 const step=size*1.2;
 return {rows,font:'bold '+size+'px '+font,step,inset:rows.length*step+.12};
}
// The factory geometry rarely changes. Cache the static canvas in device pixels and
// overlay only moving packages; this avoids redrawing all machines and 1300+ belt tiles
// up to 60 times per second while simulating.
let cachedMap=null,cachedMapCtx=null,staticReady=false,frameLastPaint=0;
// Input/output ports are transparent squares: blue for input, orange for output.
function paintPortSocket(port,labelMasks=null){
 ctx.save();
 const x=port.x+.10,y=port.y+.10,w=.8,h=.8;
 // The original port square is always drawn in full, with a transparent
 // center. Repaint only the portions of its STROKE underneath material text.
 // Never fill the square's interior or a rectangle behind the label.
 ctx.strokeStyle=port.kind==='in'?'#5baaff':'#ffae61';
 ctx.lineWidth=.13;
 ctx.strokeRect(x,y,w,h);
 if(labelMasks?.length&&typeof ctx.clip==='function'&&typeof ctx.rect==='function'){
  // A single clip path is the UNION of all label rectangles. Paint the
  // darkened outline ONCE, even if several material rows overlap this port.
  // Repeated per-label strokes previously stacked alpha at intersections.
  const half=ctx.lineWidth/2;
  let overlaps=false;
  ctx.beginPath();
  for(const b of labelMasks){
   const x0=Math.max(x-half,b.x),y0=Math.max(y-half,b.y);
   const x1=Math.min(x+w+half,b.x+b.w),y1=Math.min(y+h+half,b.y+b.h);
   if(x1<=x0||y1<=y0)continue;
   ctx.rect(x0,y0,x1-x0,y1-y0);
   overlaps=true;
  }
  if(overlaps){
   ctx.save();
   ctx.clip(); // overlapping same-winding rectangles form one region
   ctx.strokeStyle='rgba(8,18,29,.70)';
   ctx.strokeRect(x,y,w,h);
   ctx.restore();
  }
 }
 ctx.restore();
}
// Preview machines share the identical port appearance with placed machines.
function paintPreviewPorts(m){
 ctx.save();ctx.globalAlpha=1;
 const [w,h]=dims(m),labelMasks=typeof machineMaterialTextBounds==='function'?machineMaterialTextBounds(m,w,h):null;
 for(const port of getPorts(m))paintPortSocket(port,labelMasks);
 ctx.restore();
}
// Compact machine markings, centered on their actual physical edges.
// Outline triangle: within the machine and pointing at its facing edge,
// same color as its normal machine border (no second outline).
// Control panel: pale-blue 2-cell bar directly on the relevant edge,
// with 1.5x the original .14-cell thickness (.21 cell).
function paintMachineIndicators(m,w,h){
 const front=m.face||'E',cx=m.x+w/2,cy=m.y+h/2,d=V[front];
 const normalExtent=(d[0]?w:h)/2,tx=-d[1],ty=d[0];
 // World-space lines used to become subpixel strokes when zoomed out.
 // Keep indicators at least 1 CSS pixel thick without changing their shape
 // or edge locations at normal zoom. This is independent of devicePixelRatio.
 const z=Math.max(.1,camera.z),stroke=Math.max(.105,1.05/z);
 const triangleDepth=Math.max(.33,2/z),triangleHalfBase=Math.max(.16,1.15/z);
 const tip=normalExtent-.28,base=tip-triangleDepth;
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 ctx.beginPath();
 ctx.moveTo(cx+d[0]*tip,cy+d[1]*tip);
 ctx.lineTo(cx+d[0]*base+tx*triangleHalfBase,cy+d[1]*base+ty*triangleHalfBase);
 ctx.lineTo(cx+d[0]*base-tx*triangleHalfBase,cy+d[1]*base-ty*triangleHalfBase);
 ctx.closePath();
 ctx.lineWidth=stroke;ctx.strokeStyle=makeColor(m);ctx.stroke();
 if(supportsMachinePanel(m)){
  const side=machinePanelFacing(m),n=V[side];
  const thickness=Math.max(.21,1.2/z);
  const edge=(n[0]?w:h)/2-thickness/2-.02;
  const x=cx+n[0]*edge,y=cy+n[1]*edge;
  ctx.fillStyle='#9dddff';
  if(n[0])ctx.fillRect(x-thickness/2,cy-1,thickness,2);
  else ctx.fillRect(cx-1,y-thickness/2,2,thickness);
 }
 ctx.restore();
}
// Never gate machine text on zoom. Canvas will clip naturally at the physical
// pixel limit, but a zoom threshold must never replace the full name/recipe.
function paintMachineTextAtZoom(m,w,h,z,preview=false,topInset=0){
 paintMachineText(m,w,h,preview,topInset);
}
function drawStaticScene(){ctx.setTransform(pix.dpr,0,0,pix.dpr,0,0);ctx.clearRect(0,0,pix.w,pix.h);ctx.fillStyle='#0c1622';ctx.fillRect(0,0,pix.w,pix.h);ctx.save();ctx.translate(camera.x,camera.y);ctx.scale(camera.z,camera.z);const z=camera.z;
 ctx.fillStyle='#142434';ctx.fillRect(0,0,72,72);ctx.fillStyle='#344255';ctx.fillRect(CENTER.x,CENTER.y,CENTER.w,CENTER.h);

 if(z>5){ctx.lineWidth=.03;ctx.strokeStyle='rgba(175,212,232,.12)';ctx.beginPath();for(let x=0;x<=72;x++){ctx.moveTo(x,0);ctx.lineTo(x,72);}for(let y=0;y<=72;y++){ctx.moveTo(0,y);ctx.lineTo(72,y);}ctx.stroke();}
 // roads first; same-cell independent cross strands
 const occupancy=new Map();for(let r of state.routes)for(let i=0;i<r.path.length;i++){const key=r.path[i].join(',');const ar=occupancy.get(key)||[];ar.push({r,i});occupancy.set(key,ar);}
 // A belt is an oriented tile, not a polyline between tile centers.
 // Its two arms reach the TILE EDGES, including the first and final belt cells.
 // No extra line is drawn inside machine ports.
 for(let r of state.routes){
  let selected=selection?.routeId===r.id||multiSelection?.routeIds.includes(r.id)||
  draft?.routeId===r.id||beltTrim?.routeId===r.id;
  ctx.strokeStyle=selected?'#f3d875':r.to?'#50e0a0':'#f2bf4b';ctx.lineWidth=selected?.44:.32;
  ctx.lineCap='butt';ctx.lineJoin='round';ctx.beginPath();
  const previewReplacesEnd=draft?.routeId===r.id&&draft.preview?.length>=r.path.length;
  for(let i=0;i<r.path.length;i++){
   // A valid endpoint preview can rotate the already confirmed final tile.
   // Hide its old arm so the preview cannot look like an illegal T junction.
   if(previewReplacesEnd&&i===r.path.length-1)continue;
   let [x,y]=r.path[i],t=routeTile(r,i);
   if(!t)continue;
   let vin=V[t.incoming],vout=V[t.outgoing],cx=x+.5,cy=y+.5;
   ctx.moveTo(cx+vin[0]*.5,cy+vin[1]*.5);
   ctx.lineTo(cx,cy);
   ctx.lineTo(cx+vout[0]*.5,cy+vout[1]*.5);
  }
  ctx.stroke();
 }
 // A crossing contains two independent straight belts. Use only a dark X
 // connecting the four corners of their overlapping belt-width square.
 // This is STATIC map artwork and is always painted UNDER moving item dots.
 for(const entries of occupancy.values())if(entries.length===2){
  const vertical=entries.find(a=>orientation(a.r,a.i)==='V');
  const horizontal=entries.find(a=>orientation(a.r,a.i)==='H');
  if(!vertical||!horizontal)continue;
  const [x,y]=vertical.r.path[vertical.i],cx=x+.5,cy=y+.5;
  const beltWidth=r=>(selection?.routeId===r.id||multiSelection?.routeIds.includes(r.id)||
   draft?.routeId===r.id||beltTrim?.routeId===r.id)?.44:.32;
  const half=Math.min(beltWidth(vertical.r),beltWidth(horizontal.r))*.5;
  ctx.strokeStyle='#080e17';ctx.lineWidth=.075;ctx.lineCap='butt';
  ctx.beginPath();
  ctx.moveTo(cx-half,cy-half);ctx.lineTo(cx+half,cy+half);
  ctx.moveTo(cx+half,cy-half);ctx.lineTo(cx-half,cy+half);
  ctx.stroke();
 }
 if(typeof beltTrim!=='undefined'&&beltTrim){
  const r=state.routes.find(q=>q.id===beltTrim.routeId);
  if(r&&beltTrim.index>=0&&beltTrim.hoverAnchor===true){
   ctx.strokeStyle='#ff6478';ctx.lineWidth=.45;ctx.lineCap='butt';ctx.beginPath();
   for(let i=beltTrim.index;i<r.path.length;i++){
    const [x,y]=r.path[i],t=routeTile(r,i);if(!t)continue;
    ctx.moveTo(x+.5+V[t.incoming][0]*.5,y+.5+V[t.incoming][1]*.5);
    ctx.lineTo(x+.5,y+.5);
    ctx.lineTo(x+.5+V[t.outgoing][0]*.5,y+.5+V[t.outgoing][1]*.5);
   }
   ctx.stroke();
  }
 }
 const placement=typeof machinePlacementIssues==='function'?machinePlacementIssues():null;
 for(let m of state.machines){let[w,h]=dims(m),c=makeColor(m);ctx.fillStyle=hexAlpha(c,.18);ctx.fillRect(m.x+.08,m.y+.08,w-.16,h-.16);ctx.lineWidth=(selection?.machineId===m.id||multiSelection?.machineIds.includes(m.id)) ? .29 : .14;ctx.strokeStyle=(selection?.machineId===m.id||multiSelection?.machineIds.includes(m.id))?'#f5dc77':c;ctx.strokeRect(m.x+.08,m.y+.08,w-.16,h-.16);
 const hints=machineWarningHints(m,placement),hintLayout=machineHintLayout(hints,w,h,z);
 const ports=getPorts(m),labelMasks=typeof machineMaterialTextBounds==='function'?machineMaterialTextBounds(m,w,h,hintLayout.inset):null;
  for(let p of ports){paintPortSocket(p,labelMasks);if(draft&&draft.from.id===m.id&&draft.from.port===p.index&&p.kind==='out'){ctx.strokeStyle='#ffee88';ctx.lineWidth=.17;ctx.strokeRect(p.x-.06,p.y-.06,1.12,1.12);}}
 // Compositing order: socket squares < always-visible facing/panel marks < text.
 paintMachineIndicators(m,w,h);
 paintMachineTextAtZoom(m,w,h,z,false,hintLayout.inset);
 // All diagnostics share one border (red takes priority) but each gets its own row.
 if(hints.lines.length){ctx.save();ctx.strokeStyle=hints.errors.length?'#ff657d':'#ffd16e';ctx.lineWidth=.18;ctx.setLineDash([.4,.18]);ctx.strokeRect(m.x+.16,m.y+.16,w-.32,h-.32);ctx.setLineDash([]);
 if(hintLayout.rows.length){
  ctx.font=hintLayout.font;ctx.textAlign='left';ctx.textBaseline='top';
  hintLayout.rows.forEach((row,i)=>{ctx.fillStyle=row.color;ctx.fillText(row.text,m.x+.25,m.y+.22+i*hintLayout.step);});
 }ctx.restore();}
 }
 // Machine port squares already indicate the contacts. Never add a separate green port stub.
 // The belt shape in its first outer cell already starts at the appropriate grid edge.
 if(stampType&&hoverCell){let d=DEF[stampType],m=getStampMachine(hoverCell.x,hoverCell.y),[w,h]=dims(m),ok=canPlace(m),warn=ok&&placementPortWarningCount(m)>0;ctx.fillStyle=ok?(warn?'#f3d87540':'#4ce4a34b'):'#fe547755';ctx.fillRect(m.x,m.y,w,h);ctx.strokeStyle=ok?(warn?'#f3d875':'#6ef5b0'):'#ff8f91';ctx.lineWidth=.2;ctx.strokeRect(m.x,m.y,w,h);
 paintPreviewPorts(m);
 paintMachineIndicators(m,w,h);
 paintMachineTextAtZoom(m,w,h,z,true);}
 if(draft){let locked=draft.path||[],all=draft.preview||locked;
 let startMachine=machineById(draft.from.id),startPort=startMachine&&outPort(startMachine,draft.from.port);
 const drawCells=(pts,color,dashed,startIndex=0,to=null,endIndex=pts.length)=>{
  if(!pts?.length||!startPort)return;
  ctx.strokeStyle=color;ctx.lineWidth=.29;ctx.lineCap='butt';ctx.lineJoin='round';
  ctx.setLineDash(dashed?[.35,.16]:[]);ctx.beginPath();
  for(let i=startIndex;i<endIndex;i++){
   const [x,y]=pts[i],tile=draftPreviewTile(pts,i,startPort,to);
   if(!tile)continue;
   // Draw both arms of the last tile. The target inlet determines whether
   // that tile points straight ahead or turns into the machine.
   ctx.moveTo(x+.5+V[tile.incoming][0]*.5,y+.5+V[tile.incoming][1]*.5);
   ctx.lineTo(x+.5,y+.5);
   ctx.lineTo(x+.5+V[tile.outgoing][0]*.5,y+.5+V[tile.outgoing][1]*.5);
  }
  ctx.stroke();ctx.setLineDash([]);
 };
 // A confirmed final tile EXISTS already: it may change facing, but must
 // stay SOLID. Only new, uncommitted belt cells are shown dashed.
 const persisted=!!draft.routeId&&state.routes.some(r=>r.id===draft.routeId);
 if(draft.preview){
  if(persisted&&locked.length){
   const lastConfirmed=locked.length-1;
   drawCells(all,'#f3d875',false,lastConfirmed,draft.previewTo,locked.length);
   if(all.length>locked.length)
    drawCells(all,'#ffd176',true,locked.length,draft.previewTo);
  }else drawCells(all,'#ffd176',true,0,draft.previewTo);
 }
 if(!persisted&&!draft.preview)drawCells(locked,'#f2bf4b',false);
 }
 if(marquee){const m=marquee,a=m.fromWorld||m.from,b=m.toWorld||m.to,x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);ctx.fillStyle='rgba(110,180,240,.13)';ctx.fillRect(x,y,w,h);ctx.lineWidth=.16;ctx.strokeStyle='#8dcfff';ctx.setLineDash([.45,.25]);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);}
 if(groupTransform?.plan){const plan=groupTransform.plan,ok=plan.valid;ctx.save();ctx.globalAlpha=.7;for(const r of plan.routes){ctx.strokeStyle=ok?'#8af7c1':'#ff828e';ctx.lineWidth=.32;ctx.beginPath();const a=plan.machines.find(m=>m.id===r.from.id),b=r.to&&plan.machines.find(m=>m.id===r.to.id),src=a&&outPort(a,r.from.port),dst=r.to?(b&&inPort(b,r.to.port)):openRouteVirtualEnd(r.path,src);if(!src||!dst)continue;for(let i=0;i<r.path.length;i++){const t=tileShape(r.path,i,src,dst);if(!t)continue;const [x,y]=r.path[i];ctx.moveTo(x+.5+V[t.incoming][0]*.5,y+.5+V[t.incoming][1]*.5);ctx.lineTo(x+.5,y+.5);ctx.lineTo(x+.5+V[t.outgoing][0]*.5,y+.5+V[t.outgoing][1]*.5);}ctx.stroke();}for(const m of plan.machines){const [w,h]=dims(m);ctx.fillStyle=ok?(plan.blockedPortsAdded?'rgba(243,216,117,.25)':'rgba(76,228,163,.3)'):'rgba(254,84,119,.35)';ctx.fillRect(m.x,m.y,w,h);ctx.strokeStyle=ok?(plan.blockedPortsAdded?'#f3d875':'#6ef5b0'):'#ff8f91';ctx.lineWidth=.23;ctx.strokeRect(m.x,m.y,w,h);paintPreviewPorts(m);paintMachineIndicators(m,w,h);paintMachineTextAtZoom(m,w,h,z,true);}ctx.restore();}
 ctx.strokeStyle='#637991';ctx.lineWidth=.1;ctx.strokeRect(0,0,72,72);ctx.restore();$('beltText').textContent=`${getBeltCount()}格传送带`;}
// Visual-only belt tread phase, in meters. The simulation counters and
// physical packet movement remain independent of this display clock.
const beltMotionPhase=new Map();
let beltMotionLast=null,beltMotionSimLast=null;
function resetBeltMotionClock(){beltMotionLast=null;beltMotionSimLast=simTime;}
function advanceBeltMotion(t){
 if(simAdvanceBusy){resetBeltMotionClock();return false;}
 const realElapsed=beltMotionLast===null?0:Math.min(.12,Math.max(0,(t-beltMotionLast)/1000));beltMotionLast=t;
 const now=simTime,simElapsed=beltMotionSimLast===null?0:Math.max(0,now-beltMotionSimLast);
 beltMotionSimLast=now;
 // During actual simulation, use the same completed game-time steps as
 // packets, not a second wall clock. Before running, retain idle preview.
 const elapsed=running?simElapsed:realElapsed;
 let dirty=false;const live=new Set();
 for(const r of state.routes){
  if(!beltConnected(r))continue;
  live.add(r.id);
  const old=beltMotionPhase.get(r.id)??.5;
  // A seven-tread repeat avoids the whole pattern appearing stationary
  // when high-speed playback advances an integer number of meters per paint.
  const phase=beltFullyBlocked(r,sim?.routes?.[r.id])?old:(old+elapsed*BELT_SPEED)%7;
  if(phase!==old)dirty=true;
  beltMotionPhase.set(r.id,phase);
 }
 for(const id of beltMotionPhase.keys())if(!live.has(id))beltMotionPhase.delete(id);
 return dirty;
}
// Tread orientation is visual only: keep its center on the exact
// piecewise-linear packet path and blend the incoming/outgoing tangent
// across the middle 0.4m of a corner tile.
function beltTreadPoint(g,d){
 const [x,y,dx,dy]=beltPathPoint(g,d),i=Math.min(g.n-1,Math.max(0,Math.floor(d)));
 const offset=d-(i+.5),half=.2;
 if(Math.abs(offset)>=half)return [x,y,dx,dy];
 const before=beltPathPoint(g,i+.5-half),after=beltPathPoint(g,i+.5+half);
 const ax=before[2],ay=before[3],bx=after[2],by=after[3];
 if(ax===bx&&ay===by)return [x,y,dx,dy];
 const angle=Math.atan2(ay,ax)+Math.atan2(ax*by-ay*bx,ax*bx+ay*by)*(offset+half)/(2*half);
 return [x,y,Math.cos(angle),Math.sin(angle)];
}
function paintBeltMotion(){
 for(const r of state.routes){
  const connected=beltConnected(r);
  const g=beltPathGeometry(r);if(!g)continue;
  const selected=selection?.routeId===r.id||multiSelection?.routeIds.includes(r.id)||draft?.routeId===r.id||beltTrim?.routeId===r.id;
  ctx.lineWidth=.065;ctx.lineCap='butt';
  const phase=connected?(beltMotionPhase.get(r.id)??.5):.5,first=Math.floor(phase);
  // Exactly one transverse tread per meter. A slightly deeper mark every
  // seven meters travels with the same phase (not a different velocity).
  for(const accent of [false,true]){
   ctx.strokeStyle=!connected||selected?(accent?'#654b20':'#8e7230'):(accent?'#164e36':'#23794f');ctx.beginPath();
   for(let i=0,d=phase-first;d<g.n;i++,d+=1){
    if((((i-first)%7+7)%7===0)!==accent)continue;
    const [x,y,dx,dy]=beltTreadPoint(g,d),w=.11;
    ctx.moveTo(x-dy*w,y+dx*w);ctx.lineTo(x+dy*w,y-dx*w);
   }
   ctx.stroke();
  }
 }
}
function drawMovingPackets(){
 ctx.save();ctx.setTransform(pix.dpr,0,0,pix.dpr,0,0);
 ctx.translate(camera.x,camera.y);ctx.scale(camera.z,camera.z);
 paintBeltMotion();
 for(const r of state.routes){
  const packets=sim?.routes?.[r.id];if(!packets?.length)continue;
  const g=beltPathGeometry(r);if(!g)continue;
  for(const packet of packets){
   const xy=beltPathPoint(g,packet.distance);
   ctx.fillStyle=materialColor(packet.item);ctx.beginPath();ctx.arc(xy[0],xy[1],.25,0,2*Math.PI);ctx.fill();
  }
 }
 ctx.restore();
}
// Called without arguments on editor interaction; all static visual changes are
// immediately recaptured. Only the animation calls draw(true), which reuses cache.
function draw(animationOnly=false){
 const w=canvas.width,h=canvas.height;
 if(!cachedMap || cachedMap.width!==w || cachedMap.height!==h){
  cachedMap=document.createElement('canvas');cachedMap.width=w;cachedMap.height=h;
  cachedMapCtx=cachedMap.getContext('2d',{alpha:false});staticReady=false;
 }
 if(!animationOnly||!staticReady){
  drawStaticScene();
  cachedMapCtx.setTransform(1,0,0,1,0,0);
  cachedMapCtx.clearRect(0,0,w,h);cachedMapCtx.drawImage(canvas,0,0);
  staticReady=true;
 }
 ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(cachedMap,0,0);
 drawMovingPackets();
}

function hexAlpha(h,a){const x=h.replace('#','');let r=parseInt(x.slice(0,2),16),g=parseInt(x.slice(2,4),16),b=parseInt(x.slice(4,6),16);return `rgba(${r},${g},${b},${a})`;}
function materialColor(s){
 const label=String(s??'');
 // Imported unknown item colors are deterministic hashes of ItemID.
 // Unknown items never enter the selectable catalog.
 const number=/^(?:物品\s*#\s*|(?:未识别|未知)游戏物品\s*#\s*)(\d+)$/u.exec(label);
 if(number){
  let hash=Number(number[1])>>>0;
  hash=Math.imul(hash^(hash>>>16),0x45d9f3b)>>>0;
  hash=Math.imul(hash^(hash>>>16),0x45d9f3b)>>>0;
  hash=(hash^(hash>>>16))>>>0;
  return 'hsl('+(hash%360)+' 82% 67%)';
 }
 let hash=0;
 for(let i=0;i<label.length;i++)hash=(Math.imul(hash,31)+label.charCodeAt(i))>>>0;
 return 'hsl('+(hash%360)+' 85% 71%)';
}
function renderMaterialLegend(){
 $('materialLegend').innerHTML=MATERIALS.map(item=>`<div class="material-legend-row" title="${esc(item)}"><span class="material-legend-dot" style="background:${materialColor(item)}" aria-hidden="true"></span><span class="material-legend-name">${esc(item)}</span></div>`).join('');
}

function interpolate(path,pos){if(!path.length)return null;let p=Math.max(0,Math.min(path.length-1.00001,pos*(path.length-1))),i=Math.floor(p),j=Math.min(path.length-1,i+1),t=p-i;return [path[i][0]*(1-t)+path[j][0]*t,path[i][1]*(1-t)+path[j][1]*t]}
function onPointerDown(e){
 // Touch-only belt drag: keep the real path-search preview under the finger;
 // nothing is committed until pointerup (except arming the output port).
 if(!e._mobileCommit&&e.button===0&&tool==="belt"&&
    typeof mobileEditorActive==="function"&&mobileEditorActive()){
  const p=eventCoords(e),c=screenToCell(p.x,p.y),hit=portAt(c.x,c.y);
  const sourceStart=!draft&&!beltTrim&&!beltPostTrimRouteId&&!beltEditExitPending&&hit?.p.kind==="out"&&!routeFor(hit.m.id,"out",hit.p.index);
  if(sourceStart)onPointerDown({button:0,pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType,_mobileCommit:true});
  drag={kind:"mobile-belt-gesture",pointerId:e.pointerId,startCell:c,sourceStart};
  hoverCell=c;
  if(draft)updateDraftPreview();
  if(typeof mobileUpdatePlacement==="function")mobileUpdatePlacement();
  draw();return;
 }
 if(e.button===2){resetEditorMode();return;}if(groupTransform){if(e.button===0){commitGroupTransform();return;}}const pt=eventCoords(e),c=screenToCell(pt.x,pt.y);canvas.setPointerCapture(e.pointerId);
 if(e.button===1||tool==='pan'||spaceDown){drag={kind:'pan',x:pt.x,y:pt.y,sx:camera.x,sy:camera.y};return;}
 if(tool==='marquee'||(tool==='select'&&e.shiftKey)){
  const w={x:(pt.x-camera.x)/camera.z,y:(pt.y-camera.y)/camera.z};
  marquee={from:c,to:c,fromWorld:w,toWorld:{...w}};
  drag={kind:'marquee'};draw();return;
 }
 if(stampType){let m={...getStampMachine(c.x,c.y),id:nextFactoryMachineId()};if(!canPlace(m))return notify('不能放这里：与障碍物、机器或传送带重叠','bad');const blocked=placementPortWarningCount(m);snapshot();state.machines.push(m);selection={machineId:m.id};afterChange('放置 '+label(m)+(blocked?'；新增 '+blocked+' 个堵塞接口，详见工厂检查':'；可继续放置'),{messageStyle:blocked?'warn':'good'});return;}
 if(tool==='erase'){let r=cellRoutes(c.x,c.y).at(-1);if(r)deleteRoute(r.id);else notify('点绿色传送带删除整条线路');return;}
 if(tool==='belt'){
  // A tap may occur without a preceding pointermove (notably on mobile).
  hoverCell=c;
  const hit=portAt(c.x,c.y),beltHit=beltCellHit(c,pt);
  const r=beltHit?.route,idx=beltHit?.index;
  if(beltTrim?.index>=0){
   const selected=state.routes.find(q=>q.id===beltTrim.routeId);
   const sameCell=!!selected&&r?.id===selected.id&&idx===beltTrim.index&&
    beltTrim.cell?.[0]===c.x&&beltTrim.cell?.[1]===c.y;
   if(sameCell){
    snapshot();
    if(idx===0){
     state.routes=state.routes.filter(q=>q.id!==selected.id);
     selection=null;draft=null;beltPostTrimRouteId=null;
     beltEditExitPending=true;
    }else{
     const lastKept=routeTile(selected,idx-1);
     selected.path=selected.path.slice(0,idx);selected.to=null;
     if(lastKept?.type==='turn')selected.openEndSide=lastKept.outgoing;
     else delete selected.openEndSide;
     // A partial cut keeps the actual route and its yellow selection.
     // Placement is started ONLY by a later deliberate tap on the open tip.
     draft=null;selection={routeId:selected.id};
     beltPostTrimRouteId=selected.id;beltEditExitPending=false;
    }
    beltTrim=null;
    afterChange(idx===0?'已删除整条传送带':'已删除从选中格开始的尾段；可从保留终点继续接线');
    updateHint();draw();
    if(idx>0&&typeof mobileEditorActive==='function'&&mobileEditorActive()){
     mobileSetMapStatus('已裁剪并选中：点新线头继续接线；点中间格重新预览裁剪；点非线路区域取消选中',true);
    }
    return;
   }
   // Only the SAME selected tile confirms deletion. Another belt tile,
   // including the rest of the red suffix, only cancels selection.
   // An open belt may additionally be extended by a legal off-route click.
   if(r||!draft||draft.routeId!==selected?.id){
    // A click on another EXISTING belt can be a legal perpendicular crossing
    // for an active open line, not necessarily a request to edit that belt.
    if(r&&r.id!==selected?.id&&draft&&commitDraftAtCrossing(c,r))return;
    clearBeltTrimSelection({awaitExit:!r});return;
   }
   const targetPort=hit?.p.kind==='in'?hit.p:null;
   const target=targetPort?[targetPort.ex,targetPort.ey]:
    inMap(c.x,c.y)&&!cellMachine(c.x,c.y)&&!reserved(c.x,c.y)?[c.x,c.y]:null;
   const candidate=target?draftSegment(target,targetPort):null;
   if(!candidate||candidate.length<draft.path.length||(!targetPort&&candidate.length===draft.path.length)){
    clearBeltTrimSelection({awaitExit:true});return;
   }
   const previous=copy(draft.path);
   const historyEntry={path:previous,endSide:selected?.openEndSide||null};
   if(saveDraftRoute(candidate,targetPort?{id:hit.m.id,port:hit.p.index}:null)&&draft)
    draft.history.push(historyEntry);
   return;
  }
  if(r){
   // After a partial cut, the new tip explicitly starts placement.
   // A middle tile instead re-arms a non-destructive trim preview.
   if(beltPostTrimRouteId===r.id&&r.to===null&&idx===r.path.length-1){
    beltPostTrimRouteId=null;beltEditExitPending=false;
    draft={from:copy(r.from),fromName:routeTitle(r),path:copy(r.path),
     routeId:r.id,history:[],preview:null,phase:'placing'};
    beltTrim={routeId:r.id,index:-1,cell:null,hoverOutside:false};
    selection={routeId:r.id};
    updateDraftPreview();updateHint();inspectorRefresh();draw();
    if(typeof mobileEditorActive==='function'&&mobileEditorActive())mobileUpdatePlacement();
    return;
   }
   // Clicking an actual belt is never a blank-space exit gesture.
   beltPostTrimRouteId=null;beltEditExitPending=false;
   // During continuous placement a click on the LAST confirmed tile means
   // finish, not select that tile for a destructive second click.
   if(draft?.phase==='placing'&&draft.routeId===r.id&&
      idx===r.path.length-1){finishBeltPlacement();return;}
   // An unfinished route may END on another belt (or its own earlier straight
   // strand) if it arrives perpendicularly. Keep the two routes unconnected.
   if(draft&&commitDraftAtCrossing(c,r))return;
   // Do not implicitly switch from placement to modifying an existing route.
   if(draft?.phase==='placing'){finishBeltPlacement();return;}
   // An invalid attempt on someone else's belt cancels the active route edit;
   // it must never silently switch to selecting or deleting the other route.
   if(draft&&draft.routeId&&draft.routeId!==r.id){
    clearBeltTrimSelection();return;
   }
   // First edit click only arms a tail; a THIRD tap confirms deletion.
   beginExistingRouteEdit(r,idx,c);
   return;
  }
  if(!draft){
   beltTrim=null;
   // Existing-route editing exits in TWO deliberate non-route taps.
   // A machine (including its output port) counts as non-route space.
   // First tap cancels route selection/trim; second returns to Select.
   if(beltEditExitPending){
    selection=null;setTool('select');inspectorRefresh();draw();return;
   }
   if(selection?.routeId){
     // Completed placement and existing-route editing share the same
     // two-tap exit. A direct tap on a free output immediately after
     // completion still starts the next belt without an extra tool tap.
     const startNext=beltPostTrimRouteId!==selection.routeId&&
      hit?.p.kind==='out'&&!routeFor(hit.m.id,'out',hit.p.index);
     clearBeltTrimSelection({awaitExit:!startNext});
     if(!startNext)return;
    }
   if(hit?.p.kind==='out'){
    if(routeFor(hit.m.id,'out',hit.p.index))
     return notify('该输出口已有线路；请点击对应传送带进行编辑','bad');
    draft={from:{id:hit.m.id,port:hit.p.index},fromName:label(hit.m),
     path:[],history:[],preview:null,routeId:null,phase:'placing'};
    updateDraftPreview();updateHint();draw();
   }else notify('请先点击机器内部的橙色输出口');
  }else{
   const targetPort=hit?.p.kind==='in'?hit.p:null;
   const target=targetPort?[targetPort.ex,targetPort.ey]:
    inMap(c.x,c.y)&&!cellMachine(c.x,c.y)&&!reserved(c.x,c.y)?[c.x,c.y]:null;
   const candidate=target?draftSegment(target,targetPort):null;
   if(!candidate||(!targetPort&&candidate.length===draft.path.length)){
    if(draft.routeId)clearBeltTrimSelection();
    else notify('无法合法接线；不能回头、重叠或穿越障碍物','bad');
    return;
   }
   const previous=copy(draft.path);
   const existing=draft.routeId&&state.routes.find(q=>q.id===draft.routeId);
   const historyEntry={path:previous,endSide:existing?.openEndSide||null};
   if(saveDraftRoute(candidate,targetPort?{id:hit.m.id,port:hit.p.index}:null)&&draft)
    draft.history.push(historyEntry);
  }
  return;
 }
 const hit=portAt(c.x,c.y);let m=cellMachine(c.x,c.y);
 if(m){
  if(selection?.machineId===m.id||multiSelection?.machineIds?.includes(m.id))
   beginMachineDragPress(m.id,pt,c,e.pointerId);
  else beginUnselectedMachinePress(m.id,pt,c,e.pointerId);
  return;
 }
 const hitRoutes=cellRoutes(c.x,c.y);
 let rt=hitRoutes.at(-1);
 if(hitRoutes.length===2){
   // On a cross: clicking farther to the left/right selects the horizontal strand;
   // clicking farther up/down selects the vertical strand. A switch button is also shown.
   const localX=pt.x-camera.x-(c.x+.5)*camera.z,localY=pt.y-camera.y-(c.y+.5)*camera.z;
   const wanted=Math.abs(localX)>Math.abs(localY)?'H':'V';
   rt=hitRoutes.find(q=>{let i=q.path.findIndex(p=>p[0]===c.x&&p[1]===c.y);return orientation(q,i)===wanted;})||rt;
 }
 clearGroupSelection();
 if(!rt){
  selection=null;
  const world={x:(pt.x-camera.x)/camera.z,y:(pt.y-camera.y)/camera.z};
  marquee={from:c,to:c,fromWorld:world,toWorld:{...world}};
  drag={kind:'marquee'};inspectorRefresh();draw();return;
 }
 // A route gets inspected only on a COMPLETED click. Dragging from a
 // route's tile creates a marquee instead of selecting that route by accident.
 drag={kind:'route-select-press',pointerId:e.pointerId,routeId:rt.id,
  wasSelected:selection?.routeId===rt.id,
  crossAt:hitRoutes.length===2?[c.x,c.y]:null,
  startX:pt.x,startY:pt.y,startCell:{...c}};
}
function onPointerMove(e){
 if(drag?.kind==="mobile-belt-gesture"){
  const p=eventCoords(e),cell=screenToCell(p.x,p.y);
  hoverCell=cell;
  if(beltTrim)previewBeltTrim(cell,p);
  else if(draft)updateDraftPreview();
  draw();return;
 }
 const p=eventCoords(e),oldCell=hoverCell;
 hoverCell=screenToCell(p.x,p.y);
 const cellChanged=!oldCell||oldCell.x!==hoverCell.x||oldCell.y!==hoverCell.y;
 // Crossing strands can change under the pointer without changing grid cell.
 // The gesture-only editor test loads these handlers without full belt state.
 const activeTrim=typeof beltTrim!=='undefined'?beltTrim:null;
 const onAnchorCell=activeTrim?.index>=0&&activeTrim.cell?.[0]===hoverCell.x&&
  activeTrim.cell?.[1]===hoverCell.y;
 let trimHoverChanged=false;
 if(tool==='belt'&&activeTrim&&(cellChanged||onAnchorCell)){
  const previous=activeTrim.hoverAnchor;
  previewBeltTrim(hoverCell,p);
  trimHoverChanged=previous!==activeTrim.hoverAnchor;
 }else if(cellChanged&&draft)updateDraftPreview();
 if(cellChanged){
  const here=cellRoutes(hoverCell.x,hoverCell.y);
  const stateAt=here.map(r=>{
   let i=r.path.findIndex(([x,y])=>x===hoverCell.x&&y===hoverCell.y);
   let t=routeTile(r,i);
   return t?(t.type==='straight'?'直线':'转角')+' '+t.key:'无效状态';
  });
  $('cursorText').textContent=`格子 (${hoverCell.x},${hoverCell.y})${inMap(hoverCell.x,hoverCell.y)?'':' · 地图外'}${stateAt.length?' · '+(stateAt.length===2?'十字交叉 / ':'')+stateAt.join(' × '):''}`;
 }
 const wasPress=drag?.kind==='machine-press';
 if(wasPress)updateMachineDragPress(p,hoverCell,e.pointerId);
 if((drag?.kind==='machine-select-press'||drag?.kind==='route-select-press')&&
    drag.pointerId===e.pointerId&&Math.hypot(p.x-drag.startX,p.y-drag.startY)>=5){
  const start=drag;
  const a={x:(start.startX-camera.x)/camera.z,y:(start.startY-camera.y)/camera.z};
  marquee={from:start.startCell,to:hoverCell,fromWorld:a,toWorld:{
   x:(p.x-camera.x)/camera.z,y:(p.y-camera.y)/camera.z}};
  drag={kind:'marquee',pointerId:e.pointerId};
 }
 if(groupTransform)moveGroupPreviewTo(hoverCell);
 if(drag?.kind==='marquee'&&marquee){
  marquee.to=hoverCell;
  marquee.toWorld={x:(p.x-camera.x)/camera.z,y:(p.y-camera.y)/camera.z};
 }
 if(drag?.kind==='pan'){
  camera.x=drag.sx+(p.x-drag.x);
  camera.y=drag.sy+(p.y-drag.y);
 }
 // Hover text is independent of the canvas. Paint only when a visible overlay
 // or camera actually moves; simulation particles are painted by the RAF loop.
 if(trimHoverChanged||(cellChanged&&(draft||stampType||groupTransform||marquee||(tool==='belt'&&activeTrim)))||
    drag?.kind==='pan'||drag?.kind==='marquee'||(wasPress&&drag?.kind==='machine-preview'))draw();
}
function onPointerLeave(){
 // Touch screens have no hover. Keep the selected red tail until
 // the second confirmation tap or an explicit cancellation.
 if(typeof mobileEditorActive==="function"&&mobileEditorActive())return;
 // The deletion cue must disappear as soon as the pointer leaves the map.
 if(typeof beltTrim!=='undefined'&&beltTrim?.hoverAnchor){
  beltTrim.hoverAnchor=false;draw();
 }
}
function onPointerUp(e){
 if(drag?.kind==="mobile-belt-gesture"){
  const gesture=drag;drag=null;
  const p=eventCoords(e),cell=screenToCell(p.x,p.y);
  hoverCell=cell;
  // A source-port tap starts routing; dragging that same touch to a
  // different cell also places the first segment when released.
  if(!gesture.sourceStart||cell.x!==gesture.startCell.x||cell.y!==gesture.startCell.y)
   onPointerDown({button:0,pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType,_mobileCommit:true});
  if(typeof mobileUpdatePlacement==="function")mobileUpdatePlacement();
  draw();return;
 }
 if(drag?.kind==='route-select-press'){
  const {routeId,crossAt,wasSelected,startCell}=drag;drag=null;
  const route=state.routes.find(r=>r.id===routeId);
  if(wasSelected&&route){
   const index=route.path.findIndex(([x,y])=>x===startCell.x&&y===startCell.y);
   if(index>=0){
    beginExistingRouteEdit(route,index,startCell);
    return;
   }
  }
  clearGroupSelection();selection={routeId,crossAt};
  inspectorRefresh();draw();
  if(typeof mobileEditorActive==="function"&&mobileEditorActive()&&
     typeof mobileSetMapStatus==="function")
   mobileSetMapStatus("已选 "+routeId+"；在选中的传送带某一格再轻点，可预览并确认删除该格之后的尾段。");
  return;
 }
 if(drag?.kind==='machine-select-press'){
  const id=drag.machineId;drag=null;
  clearGroupSelection();selection={machineId:id};
  updateGroupControls();inspectorRefresh();draw();return;
 }
 if(drag?.kind==='machine-preview'||drag?.kind==='machine-press'){
  // Releasing the dragging button must NOT silently commit (or break belts).
  drag=null;draw();return;
 }
 if(drag?.kind==='marquee'&&marquee){
  const box=marquee;marquee=null;drag=null;
  if(box.fromWorld&&box.toWorld)selectEnclosedRectangle(box.fromWorld,box.toWorld);
  else selectGroupRectangle(box.from,box.to);
  return;
 }
 drag=null;draw();
}
function rotateSelected(steps){rotateGroup(steps);}
