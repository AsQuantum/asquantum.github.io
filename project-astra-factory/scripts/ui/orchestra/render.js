'use strict';
// Theme hooks for the original canvas. All coordinates are in its world
// space; hit testing, transforms, edit previews and geometry stay shared.
const orchestraTheme={
 active:false,score:null,panelPreview:false,pulses:new Map(),routePulses:new Map(),pendingHits:[],typeHits:new Map(),itemHits:new Map(),warehouseAnimations:new Map(),warehouseHitPending:false,inspectorHits:new Map(),inspectorAnimations:new Map(),inspectorMachine:null,gateHits:new Map(),dirty:false,
 laneWidth:.50,selectionScale:1.5,pulseMs:580,tempo:120,noteHalos:new Map(),
 // Visual hierarchy: background < matte keys < colored hit accents
 // < luminous moving notes. Large surfaces must never flash white.
 lighting:{idleFill:.17,hitFill:.18,idleEdge:.80,hitEdge:.95,idleText:.94,hitText:.95},
 color(type){return this.score?.color(type)||'#809cb9'},
 belt(r){return this.color(machineById(r.from?.id)?.type)},
 port(p){return p.kind==='in'?'#82d6fb':'#f6a3e3'},
 // The factory is a dark score at rest. Only a scheduled note raises
 // a machine's visual envelope; selection and placement are separate cues.
 centerLabel(){
  // Static wordmark in the former visualizer's cool spectrum palette.
  // Draw with normal-sized glyphs and a local scale rather than asking
  // Canvas to rasterize a fractional-pixel font in world coordinates.
  const cx=CENTER.x+CENTER.w/2,cy=CENTER.y+CENTER.h/2;
  ctx.save();ctx.translate(cx,cy);ctx.scale(CENTER.w/1000,CENTER.h/1000);
  ctx.textBaseline='middle';ctx.textAlign='left';
  const family='"Segoe UI",system-ui,sans-serif';
  function word(text,y,size,weight,spacing,maxWidth,fill){
   ctx.font=weight+' '+size+'px '+family;
   const widths=Array.from(text,ch=>ctx.measureText(ch).width);
   const width=widths.reduce((a,b)=>a+b,0)+spacing*(text.length-1);
   const scale=Math.min(1,maxWidth/width);
   ctx.save();ctx.translate(0,y);ctx.scale(scale,scale);
   ctx.fillStyle=fill;let x=-width/2;
   for(let i=0;i<text.length;i++){ctx.fillText(text[i],x,0);x+=widths[i]+spacing}
   ctx.restore();
  }
  const gradient=ctx.createLinearGradient(-390,0,390,0);
  gradient.addColorStop(0,'#79cbe9');gradient.addColorStop(.52,'#a8bdf8');gradient.addColorStop(1,'#d3b5ed');
  // Minimal decorative rules and a small subtitle, not an audio meter.
  ctx.strokeStyle='#9bb7ea';ctx.globalAlpha=.20;ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(-360,-118);ctx.lineTo(-155,-118);ctx.moveTo(155,-118);ctx.lineTo(360,-118);ctx.stroke();
  ctx.globalAlpha=.40;word('FACTORY',-118,49,'500',12,270,'#a5c9ff');
  ctx.globalAlpha=.45;word('ORCHESTRA',0,104,'600',13,810,gradient);
  ctx.globalAlpha=.33;word('PROJECT : ASTRA',115,31,'500',7,490,'#9aafd3');
  ctx.restore();
 },
 clear(){this.pulses.clear();this.routePulses.clear();this.typeHits.clear();this.itemHits.clear();this.warehouseHitPending=false;for(const a of this.warehouseAnimations.values())for(const animation of a.animations)animation.cancel();this.warehouseAnimations.clear();this.clearInspectorHits();this.gateHits.clear();this.pendingHits.length=0;this.dirty=true},
 hasAnimation(){return this.dirty||this.pendingHits.length>0||this.pulses.size>0||this.routePulses.size>0},
 hit(m,dir,index,at=performance.now(),item=null){
  const r=routeFor(m.id,dir,index);
  this.pendingHits.push({id:m.id,type:m.type,dir,index,now:at,route:r?.id,item});
 },
 beginFrame(t){
  let n=0;
  for(const v of this.pendingHits){
   if(v.now>t){this.pendingHits[n++]=v;continue}
   const m=machineById(v.id);if(!m||m.type!==v.type)continue;
   const key=v.id+':'+v.dir+':'+v.index;
   // Audio can have sounded while a frame was stalled. Give the first
   // rendered frame a visible onset instead of expiring before it is drawn.
   // Keep the scheduled timestamp for ordering; shownAt is visual-only.
   if((this.pulses.get(key)?.now??-Infinity)>v.now)continue;
   const shownAt=Math.max(v.now,t-12);
   this.pulses.set(key,{...v,shownAt});
   this.typeHits.set(v.type,Math.max(shownAt,this.typeHits.get(v.type)??-Infinity));
   const flow=v.type==='仓入'&&v.dir==='in'?'income':v.type==='仓出'&&v.dir==='out'?'expense':null;
   if(flow&&v.item){
    const old=this.itemHits.get(v.item);
    if(!old||v.now>=old.now)this.itemHits.set(v.item,{at:shownAt,now:v.now,flow});
    this.warehouseHitPending=true;
   }
   // The inspector belongs to a physical machine, not its machine type.
   if(typeof selection!=='undefined'&&selection?.machineId===v.id){
    this.syncInspectorMachine(v.id);
    const pulse={at:shownAt,now:v.now,color:this.color(v.type)};
    const save=(key,p)=>{if((this.inspectorHits.get(key)?.now??-Infinity)<=p.now)this.inspectorHits.set(key,p)};
    save('machine',pulse);
    if(v.item&&(v.dir==='in'||v.dir==='out'))save(JSON.stringify([v.dir,v.item]),{...pulse,color:materialColor(v.item)});
   }
   if(v.route){
    this.routePulses.set(v.route,Math.max(shownAt,this.routePulses.get(v.route)??-Infinity));
    const k=v.route+":"+v.dir;this.gateHits.set(k,Math.max(shownAt,this.gateHits.get(k)??-Infinity));
   }
  }
  this.pendingHits.length=n;
 },
 // Shared machine-library buttons use exactly the scheduled note envelope,
 // aggregated by type (maximum, not a sum over physical machines).
 typeEnergy(type,t){return this.envelope(t,this.typeHits.get(type)??-Infinity)},
 paintPalette(t){
  const palette=document.getElementById('palette');if(!palette)return;
  for(const button of palette.querySelectorAll('[data-stamp]')){
   const energy=this.active?this.typeEnergy(button.dataset.stamp,t):0;
   if(energy>.005){button.style.setProperty('--orch-hit',energy.toFixed(3));button.classList.add('orch-key-hit')}
   else if(button.classList.contains('orch-key-hit')){button.classList.remove('orch-key-hit');button.style.removeProperty('--orch-hit')}
  }
  for(const [type,at] of this.typeHits)if(t>=at&&!this.envelope(t,at))this.typeHits.delete(type);
 },
 paintPanels(t){
  for(const [item,pulse] of this.itemHits)if(!this.envelope(t,pulse.at))this.itemHits.delete(item);
  for(const [row,entry] of this.warehouseAnimations){
   if(!this.active||!row.isConnected||!this.envelope(t,entry.pulse.at)){
    for(const animation of entry.animations)animation.cancel();
    this.warehouseAnimations.delete(row);
   }
  }
  if(!this.active)return;
  const duration=Math.min(this.pulseMs,this.beatMs()*.85),hold=Math.min(40,duration*.14);
  for(const row of document.querySelectorAll('#warehouseLiveActual tr[data-orch-item]')){
   const pulse=this.itemHits.get(row.dataset.orchItem);
   if(!pulse)continue;
   const old=this.warehouseAnimations.get(row);
   if(old?.pulse===pulse)continue;
   for(const animation of old?.animations||[])animation.cancel();
   const rgb=pulse.flow==='income'?'78,224,155':'255,98,107';
   const points=[0,hold/duration,.35,.65,1].map(offset=>({offset,e:offset===1?0:this.envelope(pulse.at+offset*duration,pulse.at)}));
   const frames=points.map(({offset,e})=>({offset,backgroundColor:'rgba('+rgb+','+(.18*e)+')',boxShadow:'inset 2px 0 rgba('+rgb+','+(.85*e)+')'}));
   const animations=[row.animate(frames,{duration,easing:'linear'})];
   const stock=row.querySelector('[data-orch-stock]');
   if(stock){const base=getComputedStyle(stock).color;animations.push(stock.animate(points.map(({offset,e})=>({offset,color:'color-mix(in srgb,rgb('+rgb+') '+(e*100)+'%,'+base+')',textShadow:'0 0 8px rgba('+rgb+','+(.8*e)+')'})),{duration,easing:'linear'}))}
   for(const animation of animations)animation.currentTime=Math.max(0,t-pulse.at);
   this.warehouseAnimations.set(row,{pulse,animations});
  }
 },
 clearInspectorHits(){
  this.inspectorHits.clear();this.inspectorMachine=null;
  for(const entry of this.inspectorAnimations.values())for(const animation of entry.animations)animation.cancel();
  this.inspectorAnimations.clear();
 },
 syncInspectorMachine(id){
  if(this.inspectorMachine!==id){this.clearInspectorHits();this.inspectorMachine=id}
 },
 paintInspector(t){
  const id=typeof selection!=='undefined'?selection?.machineId??null:null;this.syncInspectorMachine(id);
  const root=document.getElementById('inspector');
  if(!this.active||!id||root?.dataset.inspectorKey!=='machine:'+id){this.clearInspectorHits();return}
  for(const [key,pulse] of this.inspectorHits)if(!this.envelope(t,pulse.at))this.inspectorHits.delete(key);
  for(const [el,entry] of this.inspectorAnimations){
   if(!el.isConnected||!this.envelope(t,entry.pulse.at)){for(const a of entry.animations)a.cancel();this.inspectorAnimations.delete(el)}
  }
  const duration=Math.min(this.pulseMs,this.beatMs()*.85),hold=Math.min(40,duration*.14);
  const animate=(el,pulse,summary=false)=>{
   if(!el||!pulse)return;
   const old=this.inspectorAnimations.get(el);if(old?.pulse===pulse)return;
   for(const a of old?.animations||[])a.cancel();
   const base=getComputedStyle(el),bg=base.backgroundColor,border=base.borderTopColor,c=pulse.color;
   const points=[0,hold/duration,.35,.65,1].map(offset=>({offset,e:offset===1?0:this.envelope(pulse.at+offset*duration,pulse.at)}));
   const mix=(base,e)=>'color-mix(in srgb,'+c+' '+e+'%,'+base+')';
   const frames=points.map(({offset,e})=>({offset,backgroundColor:mix(bg,e*(summary?5:18)),boxShadow:'inset 2px 0 '+mix('transparent',e*80),...(summary?{borderTopColor:mix(border,e*95)}:{})}));
   const animations=[el.animate(frames,{duration,easing:'linear'})];
   const text=el.querySelector(summary?'.machine-summary-name':'.machine-stack-count');
   if(text){const color=getComputedStyle(text).color;animations.push(text.animate(points.map(({offset,e})=>({offset,color:mix(color,e*100),textShadow:'0 0 7px '+mix('transparent',e*75)})),{duration,easing:'linear'}))}
   for(const a of animations)a.currentTime=Math.max(0,t-pulse.at);
   this.inspectorAnimations.set(el,{pulse,animations});
  };
  animate(root.querySelector('.inspector-machine .machine-summary'),this.inspectorHits.get('machine'),true);
  for(const row of root.querySelectorAll('#inspectorStacks .machine-stack-row')){
   const button=row.querySelector('[data-stack-machine][data-stack-item][data-stack-direction]');
   if(button?.dataset.stackMachine!==id)continue;
   animate(row,this.inspectorHits.get(JSON.stringify([button.dataset.stackDirection,button.dataset.stackItem])));
  }
 },
 // A port may trigger once every game second (warehouse inlets can
 // be faster). Scale the slow body tail and the short receptor flash
 // with BPM so repeated hits remain distinguishable at 360 BPM.
 beatMs(){return 60000/Math.max(30,Math.min(360,this.tempo||120))},
 envelope(t,at){const duration=Math.min(this.pulseMs,this.beatMs()*.85),hold=Math.min(40,duration*.14),dt=t-at;
  if(dt<0||dt>=duration)return 0;return dt<=hold?1:Math.pow(1-(dt-hold)/(duration-hold),1.5)},
 portEnvelope(t,at){const duration=Math.min(210,this.beatMs()*.48),hold=Math.min(26,duration*.26),dt=t-at;
  if(dt<0||dt>=duration)return 0;return dt<=hold?1:Math.pow(1-(dt-hold)/(duration-hold),1.25)},

 text(m,w,h,energy=0,preview=false,overlay=false){
  const name=DEF[m.type]?.name||m.type,color=this.color(m.type);
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=color;ctx.globalAlpha=overlay?this.lighting.hitText*energy:preview?.95:this.lighting.idleText;
  let size=Math.min(1.15,h*.30);const family='"Microsoft YaHei UI","PingFang SC","Noto Sans CJK SC",sans-serif';
  ctx.font='500 '+size+'px '+family;
  const actual=ctx.measureText(name).width,available=Math.max(.25,w-.65);
  if(actual>available){size*=available/actual;ctx.font='500 '+size+'px '+family}
  ctx.fillText(name,m.x+w/2,m.y+h/2);ctx.restore();
 },
 socket(p,energy=0,preview=false,overlay=false){
  ctx.save();ctx.strokeStyle=this.port(p);ctx.globalAlpha=overlay?.90*energy:preview?.9:.60+.40*energy;
  ctx.lineWidth=.075+.055*energy;ctx.strokeRect(p.x+.24,p.y+.24,.52,.52);ctx.restore();
 },
 machineBorder(energy=0){return .095+.055*energy},
 indicators(m,w,h,energy=0,preview=false,overlay=false){
  const d=V[m.face||'E'],cx=m.x+w/2,cy=m.y+h/2,extent=(d[0]?w:h)/2;
  const tip=extent-.22,base=tip-.25,tx=-d[1],ty=d[0],color=this.color(m.type);
  ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.globalAlpha=overlay?.95*energy:preview?.85:.42;ctx.lineWidth=.065;
  ctx.beginPath();ctx.moveTo(cx+d[0]*tip,cy+d[1]*tip);
  ctx.lineTo(cx+d[0]*base+tx*.12,cy+d[1]*base+ty*.12);
  ctx.lineTo(cx+d[0]*base-tx*.12,cy+d[1]*base-ty*.12);ctx.closePath();ctx.stroke();
  if(supportsMachinePanel(m)){
   const n=V[machinePanelFacing(m)],edge=(n[0]?w:h)/2-.13,x=cx+n[0]*edge,y=cy+n[1]*edge;
   ctx.fillStyle=color;ctx.globalAlpha=overlay?energy:preview?.8:.40;
   const len=Math.min(1.35,(n[0]?h:w)*.5),width=this.machineBorder(energy)*this.selectionScale;
   if(n[0])ctx.fillRect(x-width/2,cy-len/2,width,len);
   else ctx.fillRect(cx-len/2,y-width/2,len,width);
  }
  ctx.restore();
 },
 machine(m,w,h,{energy=0,preview=false,selected=false,valid=true,warn=false,activePorts=null,overlay=false}={}){
  const color=this.color(m.type),accent=!valid?'#ff828e':warn?'#f3d875':selected?'#f3d875':color;
  const inset=.14,x=m.x+inset,y=m.y+inset,mw=w-2*inset,mh=h-2*inset;
  ctx.save();
  // A matte colored key at rest; an emissive key on a real note.
  ctx.beginPath();ctx.roundRect(x,y,mw,mh,.15);
  if(!overlay&&!preview){ctx.fillStyle='#142434';ctx.globalAlpha=.97;ctx.fill()}
  ctx.fillStyle=color;ctx.globalAlpha=overlay?this.lighting.hitFill*energy:preview?.16:this.lighting.idleFill;ctx.fill();
  if(overlay){
   // Three cheap concentric strokes approximate neon bloom without
   // a per-machine blur filter or full-screen postprocessing.
   if(!selected){
    for(const [width,alpha] of [[.48,.055],[.30,.12],[.17,.25]]){
     ctx.strokeStyle=color;ctx.globalAlpha=alpha*energy;ctx.lineWidth=width;ctx.stroke();
    }
   }
  }
  ctx.strokeStyle=accent;
  ctx.globalAlpha=overlay?this.lighting.hitEdge*energy:selected||preview?.9:this.lighting.idleEdge;
  ctx.lineWidth=this.machineBorder(energy)*(selected?this.selectionScale:1);ctx.stroke();
  // Four short corner brackets give the pad a distinct hit-target shape.
  // Keep them subdued until a note; no full-panel white flash.
  const edge=.17,len=Math.min(.57,mw*.18,mh*.18);
  ctx.strokeStyle=accent;ctx.globalAlpha=overlay?.95*energy:preview?.6:.30;
  ctx.lineWidth=(.065+.075*energy)*(selected?this.selectionScale:1);ctx.lineCap='round';ctx.beginPath();
  for(const [cx,cy,sx,sy] of [[x+edge,y+edge,1,1],[x+mw-edge,y+edge,-1,1],[x+edge,y+mh-edge,1,-1],[x+mw-edge,y+mh-edge,-1,-1]]){
   ctx.moveTo(cx+sx*len,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+sy*len);
  }
  ctx.stroke();
  for(const p of getPorts(m)){
   const a=activePorts?.get(p.kind+':'+p.index)||0;
   this.socket(p,Math.max(a,energy*.35),preview,overlay);
  }
  this.indicators(m,w,h,energy,preview,overlay);
  this.text(m,w,h,energy,preview,overlay);
  ctx.restore();
 },
 // All dimensions are world-grid units. Keep the lane inside half a
 // cell and the single note block comfortably between its two rails.
 rails(r,selected){
  if(selected||!r.to){this.editRails(selected?'#f3d875':'#d2a94b',false);return}
  const color=this.belt(r);ctx.save();ctx.lineJoin='round';ctx.lineCap='butt';
  ctx.strokeStyle=color;ctx.globalAlpha=.035;ctx.lineWidth=.56;ctx.stroke();
  ctx.globalAlpha=.36;ctx.lineWidth=this.laneWidth;ctx.stroke();
  ctx.strokeStyle='#142234';ctx.globalAlpha=1;ctx.lineWidth=.43;ctx.stroke();
  ctx.strokeStyle=color;ctx.globalAlpha=.16;ctx.lineWidth=.036;ctx.stroke();
  ctx.restore();
 },
 // Edit highlights scale with the same note envelope as normal rails,
 // without changing the lane footprint or the crossing geometry.
 railInner(energy=0,selected=false){return this.laneWidth-2*(.035+.020*energy)*(selected?this.selectionScale:1)},
 railDash(energy=0,selected=false){return (.036+.016*energy)*(selected?this.selectionScale:1)},
 editRails(color,dashed=false,energy=0,path=null){
  ctx.save();ctx.lineJoin='round';ctx.lineCap='butt';ctx.setLineDash([]);
  const stroke=()=>path?ctx.stroke(path):ctx.stroke();
  ctx.globalAlpha=1;ctx.strokeStyle='#142234';ctx.lineWidth=this.laneWidth;stroke();
  ctx.strokeStyle=color;ctx.globalAlpha=.82+.16*energy;ctx.lineWidth=this.laneWidth;
  if(dashed)ctx.setLineDash([.35,.15]);
  stroke();
  ctx.setLineDash([]);ctx.strokeStyle='#142234';ctx.globalAlpha=1;ctx.lineWidth=this.railInner(energy,true);stroke();
  ctx.strokeStyle=color;ctx.globalAlpha=.45+.40*energy;ctx.lineWidth=this.railDash(energy,true);ctx.setLineDash([.12,.13]);stroke();
  ctx.restore();
 },
 routeEnergy(r,t){const at=this.routePulses.get(r.id);return at==null?0:this.envelope(t,at)},
 railPulse(row,t){
  const {r,connected,yellow}=row;
  if(!connected)return;
  const energy=this.routeEnergy(r,t);if(!energy)return;
  if(!row.pulsePaths){
   const path=new Path2D(),red=new Path2D();
   const preview=draft?.routeId===r.id&&draft.preview?.length>=r.path.length;
   const trim=beltTrim?.routeId===r.id&&beltTrim.hoverAnchor===true?beltTrim.index:Infinity;
   for(let i=0;i<r.path.length;i++){
    if(preview&&i===r.path.length-1)continue;
    const tile=routeTile(r,i);if(!tile)continue;
    const [x,y]=r.path[i],a=V[tile.incoming],b=V[tile.outgoing],cx=x+.5,cy=y+.5,p=i>=trim?red:path;
    p.moveTo(cx+a[0]*.5,cy+a[1]*.5);p.lineTo(cx,cy);p.lineTo(cx+b[0]*.5,cy+b[1]*.5);
   }
   row.pulsePaths={path,red,trim};
  }
  const {path,red,trim}=row.pulsePaths;
  if(yellow){
   this.editRails('#f3d875',false,energy,path);
   if(trim!==Infinity)this.editRails('#ff6478',true,energy,red);
   return;
  }
  ctx.save();ctx.lineJoin='round';ctx.lineCap='butt';
  ctx.strokeStyle=this.belt(r);ctx.globalAlpha=.375*energy;ctx.lineWidth=this.laneWidth;ctx.stroke(path);
  ctx.strokeStyle='#142234';ctx.globalAlpha=1;ctx.lineWidth=this.railInner(energy);ctx.stroke(path);
  ctx.strokeStyle=this.belt(r);ctx.globalAlpha=.16+.30*energy;ctx.lineWidth=this.railDash(energy);ctx.stroke(path);
  ctx.restore();
 },
 // Route paint order defines the same top strand as the static scene.
 // Cache local underpass rectangles; do not sort whole routes by orientation.
 underpasses(occupancy=occupiedRouteMap()){
  const cuts=new Map(),w=this.laneWidth;
  for(const entries of occupancy.values()){
   if(entries.length!==2)continue;
   const [lower,upper]=entries,a=orientation(lower.r,lower.i),b=orientation(upper.r,upper.i);
   if(!a||!b||a===b)continue;
   const [x,y]=upper.r.path[upper.i],rect=b==='V'?[x+.5-w/2,y,w,1]:[x,y+.5-w/2,1,w];
   if(!cuts.has(lower.r.id))cuts.set(lower.r.id,[]);
   cuts.get(lower.r.id).push(rect);
  }
  return cuts;
 },
 clipUnderpasses(rects){
  if(!rects?.length)return false;
  ctx.save();ctx.beginPath();ctx.rect(-2,-2,76,76);
  for(const r of rects)ctx.rect(...r);
  ctx.clip('evenodd');return true;
 },
 // Render-only continuation of the next discrete belt step. Respect the
 // head's endpoint and the same spacing constraint as the physical kernel.
 packetDistance(distance,ahead,end,fraction){
  return Math.max(distance,Math.min(end,ahead,distance+BELT_SPEED*Math.max(0,Math.min(SIMULATION_STEP_SECONDS,fraction))));
 },
 // Cache one tiny soft-glow texture per instrument color. No blur
 // filter per moving item and no second scene canvas.
 noteHalo(color){
  let sprite=this.noteHalos.get(color);if(sprite)return sprite;
  sprite=document.createElement('canvas');sprite.width=sprite.height=64;
  const c=sprite.getContext('2d'),g=c.createRadialGradient(32,32,0,32,32,32);
  for(const [stop,alpha] of [[0,.92],[.28,.85],[.48,.56],[.68,.24],[.85,.07],[1,0]])g.addColorStop(stop,hexAlpha(color,alpha));
  c.fillStyle=g;c.fillRect(0,0,64,64);this.noteHalos.set(color,sprite);return sprite;
 },
 packet(r,x,y){
  const color=this.belt(r);ctx.save();ctx.translate(x,y);
  // A square emitter inside a smoothly fading halo. The white center
  // remains square and opaque even when crossing machine hit overlays.
  ctx.globalAlpha=1;ctx.drawImage(this.noteHalo(color),-.36,-.36,.72,.72);
  ctx.fillStyle=color;ctx.fillRect(-.155,-.155,.31,.31);
  ctx.fillStyle='#f3fbff';ctx.fillRect(-.09,-.09,.18,.18);
  ctx.restore();
 },
 // The moving transverse marks are the belt's rhythm display.
 // Accent them on either endpoint's scheduled note, without changing
 // the lane footprint or competing with the luminous packet core.
 motion(row,t=performance.now()){
  const {r,g,connected,yellow}=row;if(!connected)return;
  ctx.save();ctx.lineCap='butt';
  const phase=beltMotionPhase.get(r.id)??.5,pulse=this.routeEnergy(r,t);
  const half=yellow?Math.min(.15,this.railInner(pulse,true)*.35):.15+.025*pulse;
  const trim=beltTrim?.routeId===r.id&&beltTrim.hoverAnchor===true?beltTrim.index:Infinity;
  for(const red of trim===Infinity?[false]:[false,true]){
   ctx.strokeStyle=red?'#ff6478':yellow?'#f3d875':this.belt(r);
   ctx.beginPath();
   for(let d=phase%1;d<g.n;d+=1){
    if((Math.floor(d)>=trim)!==red)continue;
    const [x,y,dx,dy]=beltTreadPoint(g,d);
    if(x*camera.z+camera.x< -2||y*camera.z+camera.y< -2||x*camera.z+camera.x>pix.w+2||y*camera.z+camera.y>pix.h+2)continue;
    ctx.moveTo(x-dy*half,y+dx*half);ctx.lineTo(x+dy*half,y-dx*half);
   }
   if(pulse>0){ctx.globalAlpha=.07*pulse;ctx.lineWidth=.145;ctx.stroke()}
   ctx.globalAlpha=yellow?.65+.25*pulse:.28+pulse*.29;ctx.lineWidth=(.045+pulse*.035)*(yellow?this.selectionScale:1);ctx.stroke();
  }
  ctx.restore();
 },
 gate(row,t){
  const {r,g,connected}=row;if(!connected)return;
  ctx.save();ctx.lineCap='round';
  for(const dir of ['in','out']){
   const at=this.gateHits.get(r.id+':'+dir),energy=this.portEnvelope(t,at??-Infinity);
   const d=dir==='out'?Math.min(.18,g.n/2):Math.max(g.n-.18,g.n/2);
   const [x,y,dx,dy]=beltTreadPoint(g,d),color=dir==='in'?'#82d6fb':'#f6a3e3',w=.18;
   // A receptor line stays visible even when idle; it flashes locally
   // rather than lighting the whole transport route.
   ctx.strokeStyle=color;ctx.lineWidth=.065;ctx.globalAlpha=.32;
   ctx.beginPath();ctx.moveTo(x-dy*w,y+dx*w);ctx.lineTo(x+dy*w,y-dx*w);ctx.stroke();
   if(energy>0){
    ctx.globalAlpha=.27*energy;ctx.lineWidth=.25;ctx.stroke();
    ctx.globalAlpha=.95*energy;ctx.lineWidth=.115;ctx.stroke();
    // Travel a short distance away from the receptor as a hit echo.
    const offset=(1-energy)*.65,d2=Math.max(0,Math.min(g.n,d+(dir==='out'?offset:-offset)));
    const [xx,yy,ux,uy]=beltTreadPoint(g,d2);
    ctx.globalAlpha=.58*energy;ctx.lineWidth=.065;ctx.beginPath();
    ctx.moveTo(xx-uy*w,yy+ux*w);ctx.lineTo(xx+uy*w,yy-ux*w);ctx.stroke();
   }
  }
  ctx.restore();
 },
 animate(t){
  const lit=new Map();
  for(const [key,v] of this.pulses){
   const at=v.shownAt??v.now,a=this.envelope(t,at),port=this.portEnvelope(t,at),m=machineById(v.id);
   if((!a&&!port)||!m||m.type!==v.type){this.pulses.delete(key);continue}
   let entry=lit.get(v.id);
   if(!entry){entry={m,energy:0,ports:new Map(),hits:[]};lit.set(v.id,entry)}
   entry.energy=Math.max(entry.energy,a);entry.ports.set(v.dir+':'+v.index,port);if(port>0)entry.hits.push(v);
  }
  // Composite exactly once per machine, even on simultaneous inputs.
  // The static layer contains only the dim idle styling.
  for(const {m,energy,ports,hits} of lit.values()){
   const [w,h]=dims(m),selected=selection?.machineId===m.id||multiSelection?.machineIds.includes(m.id);
   this.machine(m,w,h,{energy,activePorts:ports,selected,overlay:true});
   ctx.save();
   for(const v of hits){
    const a=ports.get(v.dir+':'+v.index),p=getPorts(m).find(p=>p.kind===v.dir&&p.index===v.index);
    if(!p)continue;
    const x=p.x+.5,y=p.y+.5,u=1-a;
    ctx.strokeStyle=this.port(p);ctx.globalAlpha=.97*a;ctx.lineWidth=.15;const radius=.42+u*.46;ctx.beginPath();ctx.roundRect(x-radius,y-radius,radius*2,radius*2,.09+u*.13);ctx.stroke();
    ctx.globalAlpha=.24*a;ctx.lineWidth=.27;ctx.stroke();
    ctx.fillStyle=this.port(p);ctx.globalAlpha=.95*a;ctx.fillRect(x-.18,y-.18,.36,.36);
    ctx.fillStyle='#e4f2ff';ctx.globalAlpha=.75*a;ctx.fillRect(x-.085,y-.085,.17,.17);
   }
   ctx.restore();
  }
  if(draft?.from&&draft.preview?.length){
   const r=state.routes.find(r=>r.id===draft.routeId),energy=r?this.routeEnergy(r,t):0;
   if(energy>0){
    const pts=draft.preview,locked=draft.path||[],source=machineById(draft.from.id),port=source&&outPort(source,draft.from.port);
    if(port){
     const paint=(start,end,color,dashed)=>{
      const path=new Path2D();
      for(let i=start;i<end;i++){
       const tile=draftPreviewTile(pts,i,port,draft.previewTo);if(!tile)continue;
       const [x,y]=pts[i],a=V[tile.incoming],b=V[tile.outgoing],cx=x+.5,cy=y+.5;
       path.moveTo(cx+a[0]*.5,cy+a[1]*.5);path.lineTo(cx,cy);path.lineTo(cx+b[0]*.5,cy+b[1]*.5);
      }
      this.editRails(color,dashed,energy,path);
     };
     if(locked.length){paint(locked.length-1,locked.length,'#f3d875',false);paint(locked.length,pts.length,'#ffd176',true)}
     else paint(0,pts.length,'#ffd176',true);
    }
   }
  }
  for(const [id,time] of this.routePulses)if(!this.envelope(t,time))this.routePulses.delete(id);
  for(const [key,time] of this.gateHits)if(!this.portEnvelope(t,time))this.gateHits.delete(key);
  this.dirty=false;
 }

};
