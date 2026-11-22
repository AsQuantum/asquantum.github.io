'use strict';
const makeColor=m=>DEF[m.type]?.color||'#8796ac';
// The factory geometry rarely changes. Cache the static canvas in device pixels and
// overlay only moving packages; this avoids redrawing all machines and 1300+ belt tiles
// up to 60 times per second while simulating.
let cachedMap=null,cachedMapCtx=null,staticReady=false,frameLastPaint=0;
// Preview machines need the same physical port positions and direction colors as placed machines.
// Render above the translucent placement tint so input/output sockets remain readable.
function paintPreviewPorts(m){
 ctx.save();ctx.globalAlpha=1;
 for(const port of getPorts(m)){
  ctx.fillStyle=port.kind==='in'?'#5baaff':'#ffae61';
  ctx.fillRect(port.x+.08,port.y+.08,.84,.84);
  ctx.strokeStyle='#132434';ctx.lineWidth=.08;
  ctx.strokeRect(port.x+.08,port.y+.08,.84,.84);
 }
 ctx.restore();
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
  let selected=selection?.routeId===r.id||multiSelection?.routeIds.includes(r.id);
  ctx.strokeStyle=selected?'#f3d875':'#50e0a0';ctx.lineWidth=selected?.44:.32;
  ctx.lineCap='butt';ctx.lineJoin='round';ctx.beginPath();
  for(let i=0;i<r.path.length;i++){
   let [x,y]=r.path[i],t=routeTile(r,i);
   if(!t)continue;
   let vin=V[t.incoming],vout=V[t.outgoing],cx=x+.5,cy=y+.5;
   ctx.moveTo(cx+vin[0]*.5,cy+vin[1]*.5);
   ctx.lineTo(cx,cy);
   ctx.lineTo(cx+vout[0]*.5,cy+vout[1]*.5);
  }
  ctx.stroke();
 }
 for(let entries of occupancy.values())if(entries.length===2){let one=entries.find(a=>orientation(a.r,a.i)==='V');if(one){let [x,y]=one.r.path[one.i];ctx.fillStyle='#142434';ctx.fillRect(x+.33,y+.22,.34,.56);ctx.strokeStyle='#9affd0';ctx.lineWidth=.26;ctx.beginPath();ctx.moveTo(x+.5,y+.16);ctx.lineTo(x+.5,y+.84);ctx.stroke();}}
 for(let m of state.machines){let[w,h]=dims(m),c=makeColor(m);ctx.fillStyle=hexAlpha(c,.18);ctx.fillRect(m.x+.08,m.y+.08,w-.16,h-.16);ctx.lineWidth=(selection?.machineId===m.id||multiSelection?.machineIds.includes(m.id)) ? .29 : .14;ctx.strokeStyle=(selection?.machineId===m.id||multiSelection?.machineIds.includes(m.id))?'#f5dc77':c;ctx.strokeRect(m.x+.08,m.y+.08,w-.16,h-.16);
 const ports=getPorts(m);for(let p of ports){ctx.fillStyle=p.kind==='in'?'#5baaff':'#ffae61';ctx.fillRect(p.x+.08,p.y+.08,.84,.84);ctx.strokeStyle='#132434';ctx.lineWidth=.08;ctx.strokeRect(p.x+.08,p.y+.08,.84,.84);if(draft&&draft.from.id===m.id&&draft.from.port===p.index&&p.kind==='out'){ctx.strokeStyle='#ffee88';ctx.lineWidth=.17;ctx.strokeRect(p.x-.06,p.y-.06,1.12,1.12);}}
 if(z>=6.5)paintMachineText(m,w,h);
 // Connectivity warnings are drawn on the machine itself; they are not hidden behind the audit panel.
 const miss=missingMaterials(m),isProduct=!!getRecipe(m)&&!!outPort(m,0),idle=isProduct&&!routeFor(m.id,'out',0);
 if(miss.length||idle){ctx.save();ctx.strokeStyle=miss.length?'#ff657d':'#ffd16e';ctx.lineWidth=.18;ctx.setLineDash([.4,.18]);ctx.strokeRect(m.x+.16,m.y+.16,w-.32,h-.32);ctx.setLineDash([]);
 if(z>=5){ctx.fillStyle=miss.length?'#ff657d':'#ffd16e';ctx.font='bold .84px system-ui';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(miss.length?`缺料${miss.length}`:'无出线',m.x+.25,m.y+.22,w-.4);}ctx.restore();}
 }
 // Machine port squares already indicate the contacts. Never add a separate green port stub.
 // The belt shape in its first outer cell already starts at the appropriate grid edge.
 if(stampType&&hoverCell){let d=DEF[stampType],m=getStampMachine(hoverCell.x,hoverCell.y),[w,h]=dims(m),ok=canPlace(m);ctx.fillStyle=ok?'#4ce4a34b':'#fe547755';ctx.fillRect(m.x,m.y,w,h);ctx.strokeStyle=ok?'#6ef5b0':'#ff8f91';ctx.lineWidth=.2;ctx.strokeRect(m.x,m.y,w,h);
 for(let port of getPorts(m)){ctx.fillStyle=port.kind==='in'?'#5baaff':'#ffae61';ctx.fillRect(port.x+.10,port.y+.10,.8,.8);}
 if(z>=5)paintMachineText(m,w,h,true);}
 if(draft){let locked=draft.path||[],all=draft.preview||locked;
 let startMachine=machineById(draft.from.id),startPort=startMachine&&outPort(startMachine,draft.from.port);
 const drawCells=(pts,color,dashed)=>{
  if(!pts?.length||!startPort)return;
  ctx.strokeStyle=color;ctx.lineWidth=.29;ctx.lineCap='butt';ctx.lineJoin='round';
  ctx.setLineDash(dashed?[.35,.16]:[]);ctx.beginPath();
  for(let i=0;i<pts.length;i++){
   const [x,y]=pts[i],prev=i?pts[i-1]:[startPort.x,startPort.y],next=pts[i+1];
   const inc=edgeFromTo([x,y],prev),out=next?edgeFromTo([x,y],next):null;
   if(!inc)continue;
   ctx.moveTo(x+.5+V[inc][0]*.5,y+.5+V[inc][1]*.5);
   ctx.lineTo(x+.5,y+.5);
   if(out&&out!==inc)ctx.lineTo(x+.5+V[out][0]*.5,y+.5+V[out][1]*.5);
  }
  ctx.stroke();ctx.setLineDash([]);
 };
 if(all&&all.length>locked.length){drawCells(all,'#ffd176',true);}
 drawCells(locked,'#3fe6ac',false);
 if(locked.length){let [x,y]=locked.at(-1);ctx.strokeStyle='#ffde74';ctx.lineWidth=.16;ctx.strokeRect(x+.12,y+.12,.76,.76);}
 }
 if(marquee){const x=Math.min(marquee.from.x,marquee.to.x),y=Math.min(marquee.from.y,marquee.to.y),w=Math.abs(marquee.to.x-marquee.from.x)+1,h=Math.abs(marquee.to.y-marquee.from.y)+1;ctx.fillStyle='rgba(110,180,240,.13)';ctx.fillRect(x,y,w,h);ctx.lineWidth=.16;ctx.strokeStyle='#8dcfff';ctx.setLineDash([.45,.25]);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);}
 if(groupTransform?.plan){const plan=groupTransform.plan,ok=plan.valid;ctx.save();ctx.globalAlpha=.7;for(const r of plan.routes){ctx.strokeStyle=ok?'#8af7c1':'#ff828e';ctx.lineWidth=.32;ctx.beginPath();const a=plan.machines.find(m=>m.id===r.from.id),b=plan.machines.find(m=>m.id===r.to.id),src=a&&outPort(a,r.from.port),dst=b&&inPort(b,r.to.port);if(!src||!dst)continue;for(let i=0;i<r.path.length;i++){const t=tileShape(r.path,i,src,dst);if(!t)continue;const [x,y]=r.path[i];ctx.moveTo(x+.5+V[t.incoming][0]*.5,y+.5+V[t.incoming][1]*.5);ctx.lineTo(x+.5,y+.5);ctx.lineTo(x+.5+V[t.outgoing][0]*.5,y+.5+V[t.outgoing][1]*.5);}ctx.stroke();}for(const m of plan.machines){const [w,h]=dims(m);ctx.fillStyle=ok?'rgba(76,228,163,.3)':'rgba(254,84,119,.35)';ctx.fillRect(m.x,m.y,w,h);ctx.strokeStyle=ok?'#6ef5b0':'#ff8f91';ctx.lineWidth=.23;ctx.strokeRect(m.x,m.y,w,h);paintPreviewPorts(m);if(z>=5)paintMachineText(m,w,h,true);}ctx.restore();}
 ctx.strokeStyle='#637991';ctx.lineWidth=.1;ctx.strokeRect(0,0,72,72);ctx.restore();$('beltText').textContent=`${getBeltCount()}格传送带`;}
function drawMovingPackets(){
 if(!sim)return;
 ctx.save();ctx.setTransform(pix.dpr,0,0,pix.dpr,0,0);
 ctx.translate(camera.x,camera.y);ctx.scale(camera.z,camera.z);
 for(const r of state.routes){
  for(const packet of sim.routes[r.id]||[]){
   const xy=packetCoords(r,packet);if(!xy)continue;
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
function materialColor(s){let x=0;for(let i=0;i<s.length;i++)x=(x*31+s.charCodeAt(i))>>>0;return `hsl(${x%360} 85% 71%)`;}
function renderMaterialLegend(){
 $('materialLegend').innerHTML=MATERIALS.map(item=>`<div class="material-legend-row" title="${esc(item)}"><span class="material-legend-dot" style="background:${materialColor(item)}" aria-hidden="true"></span><span class="material-legend-name">${esc(item)}</span></div>`).join('');
}

function interpolate(path,pos){if(!path.length)return null;let p=Math.max(0,Math.min(path.length-1.00001,pos*(path.length-1))),i=Math.floor(p),j=Math.min(path.length-1,i+1),t=p-i;return [path[i][0]*(1-t)+path[j][0]*t,path[i][1]*(1-t)+path[j][1]*t]}
function onPointerDown(e){if(groupTransform){if(e.button===2){cancelGroupTransform();return;}if(e.button===0){commitGroupTransform();return;}}if(e.button===2){if(draft){draft=null;updateHint();draw();}else setTool('select');return;}const pt=eventCoords(e),c=screenToCell(pt.x,pt.y);canvas.setPointerCapture(e.pointerId);
 if(e.button===1||tool==='pan'||spaceDown){drag={kind:'pan',x:pt.x,y:pt.y,sx:camera.x,sy:camera.y};return;}
 if(tool==='marquee'||(tool==='select'&&e.shiftKey)){marquee={from:c,to:c};drag={kind:'marquee'};draw();return;}
 if(stampType){let m={...getStampMachine(c.x,c.y),id:'m'+(++idSeed)};if(!canPlace(m))return notify('不能放这里：与障碍物、机器或传送带重叠','bad');snapshot();state.machines.push(m);selection={machineId:m.id};afterChange('放置 '+label(m)+'；可继续放置');return;}
 if(tool==='erase'){let r=cellRoutes(c.x,c.y).at(-1);if(r)deleteRoute(r.id);else notify('点绿色传送带删除整条线路');return;}
 if(tool==='belt'){const hit=portAt(c.x,c.y);if(!draft){if(hit?.p.kind==='out'){
  if(routeFor(hit.m.id,'out',hit.p.index))return notify('该输出口已接线；请先拆线或使用分流器','bad');
  draft={from:{id:hit.m.id,port:hit.p.index},fromName:label(hit.m),path:[],history:[],preview:null};updateDraftPreview();updateHint();draw();
 }else notify('请先点击机器内部的橙色输出口');}
 else if(hit?.p.kind==='in'){let target=[hit.p.ex,hit.p.ey],candidate=draftSegment(target,hit.p);
  if(!candidate)return notify('无法从当前段到达该输入口；请撤销上一段或换个转折点','bad');
  let to={id:hit.m.id,port:hit.p.index};connect(draft.from,to,[],candidate);updateHint();draw();
 }else if(inMap(c.x,c.y)&&!cellMachine(c.x,c.y)&&!reserved(c.x,c.y)){
  let candidate=draftSegment([c.x,c.y]);if(!candidate)return notify('该格无法从当前线段正交连通；可撤销上一段重试','bad');
  if(candidate.length===draft.path.length&&draft.path.length)return notify('这里已经是当前段的终点');
  draft.history.push(draft.path.map(p=>p.slice()));draft.path=candidate;updateDraftPreview();updateHint();draw();notify('当前路段已固定；继续选择下一个拐点或蓝色输入口');
 }else notify('请选择蓝色输入口或空白格作为转折点');return;}
 const hit=portAt(c.x,c.y);let m=cellMachine(c.x,c.y);if(m){beginMachineDragPress(m.id,pt,c,e.pointerId);return;}
 const hitRoutes=cellRoutes(c.x,c.y);
 let rt=hitRoutes.at(-1);
 if(hitRoutes.length===2){
   // On a cross: clicking farther to the left/right selects the horizontal strand;
   // clicking farther up/down selects the vertical strand. A switch button is also shown.
   const localX=pt.x-camera.x-(c.x+.5)*camera.z,localY=pt.y-camera.y-(c.y+.5)*camera.z;
   const wanted=Math.abs(localX)>Math.abs(localY)?'H':'V';
   rt=hitRoutes.find(q=>{let i=q.path.findIndex(p=>p[0]===c.x&&p[1]===c.y);return orientation(q,i)===wanted;})||rt;
 }
 clearGroupSelection();if(!rt){selection=null;marquee={from:c,to:c};drag={kind:'marquee'};inspectorRefresh();draw();return;}selection=rt?{routeId:rt.id,crossAt:hitRoutes.length===2?[c.x,c.y]:null}:null;inspectorRefresh();draw();}
function onPointerMove(e){const p=eventCoords(e),oldCell=hoverCell;hoverCell=screenToCell(p.x,p.y);if(draft&&(!oldCell||oldCell.x!==hoverCell.x||oldCell.y!==hoverCell.y))updateDraftPreview();const here=cellRoutes(hoverCell.x,hoverCell.y);
 const stateAt=here.map(r=>{let i=r.path.findIndex(([x,y])=>x===hoverCell.x&&y===hoverCell.y);let t=routeTile(r,i);return t?(t.type==='straight'?'直线':'转角')+' '+t.key:'无效状态';});
 $('cursorText').textContent=`格子 (${hoverCell.x},${hoverCell.y})${inMap(hoverCell.x,hoverCell.y)?'':' · 地图外'}${stateAt.length?' · '+(stateAt.length===2?'十字交叉 / ':'')+stateAt.join(' × '):''}`;
 if(drag?.kind==='machine-press')updateMachineDragPress(p,hoverCell,e.pointerId);
 if(groupTransform)moveGroupPreviewTo(hoverCell);
 if(drag?.kind==='marquee'&&marquee)marquee.to=hoverCell;
 if(drag?.kind==='pan'){camera.x=drag.sx+(p.x-drag.x);camera.y=drag.sy+(p.y-drag.y);}
 draw();}
function onPointerUp(e){
 if(drag?.kind==='machine-preview'||drag?.kind==='machine-press'){
  // Releasing the dragging button must NOT silently commit (or break belts).
  drag=null;draw();return;
 }
 if(drag?.kind==='marquee'&&marquee){
  const box=marquee;marquee=null;drag=null;selectGroupRectangle(box.from,box.to);return;
 }
 drag=null;draw();
}
function rotateSelected(steps){rotateGroup(steps);}
