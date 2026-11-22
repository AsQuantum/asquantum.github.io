'use strict';
function def(m){return DEF[m.type]}
// Collector modes are AST1 recipe indices (0/1), not names or upgrade levels.
function numericRecipeMode(type){return type==='垃圾'||type==='粒子'||type==='采矿';}
function parseRecipeMode(type,value){
 if(!numericRecipeMode(type))return value;
 // HTML selects deliver "0"/"1"; the actual layout and AST1 modes are numbers.
 if(value===0||value===1||value==='0'||value==='1')return Number(value);
 return NaN;
}
function recipeModes(type){const keys=Object.keys(DEF[type]?.recipes||{});if(typeof AST1_MODE==='undefined'||!AST1_MODE[type])return keys;const ordered=AST1_MODE[type].map(String);return [...ordered.filter(k=>keys.includes(k)),...keys.filter(k=>!ordered.includes(k))];}
function defaultModeFor(type){const key=recipeModes(type)[0];return key===undefined?'':parseRecipeMode(type,key);}
function recipeOptionLabel(type,key){const r=DEF[type]?.recipes?.[key];return r?.output||key;}
// AST1 record Byte 4: panel side relative to machine facing.
// 0 left (default), 1 front, 2 right, 3 back.
const MACHINE_PANEL_LABELS=['左侧','正面','右侧','背面'];
function supportsMachinePanel(m){return !!m&&!['仓入','仓出','分流','汇流'].includes(m.type);}
function machinePanelPosition(m){
 if(!supportsMachinePanel(m))return 0;
 const value=m.panel??m.ast1Meta?.record?.[4]??0;
 return Number.isInteger(value)&&value>=0&&value<=3?value:0;
}
function machinePanelFacing(m){
 const order=['E','S','W','N'],front=order.indexOf(m.face||'E');
 return order[(front+[3,0,1,2][machinePanelPosition(m)]+4)%4];
}
function machinePanelDescription(m){
 return MACHINE_PANEL_LABELS[machinePanelPosition(m)];
}
function setStampType(type){const previous=stampPrefs[type]||{};stampType=type;stampFace=previous.face||'E';const savedMode=previous.mode;stampMode=savedMode!==undefined&&savedMode!==null&&Object.prototype.hasOwnProperty.call(DEF[type].recipes||{},savedMode)?parseRecipeMode(type,savedMode):defaultModeFor(type);stampItem=previous.item||'钛合金锭';stampPanel=Number.isInteger(previous.panel)&&previous.panel>=0&&previous.panel<=3?previous.panel:0;updateStampControls();}
function saveStampPreference(){if(!stampType)return;stampPrefs[stampType]={face:stampFace,mode:stampMode,item:stampItem,panel:stampPanel};try{localStorage.setItem('factory_lab_v3_stamp_prefs',JSON.stringify(stampPrefs));}catch(e){}}
function getStampMachine(x=0,y=0){const mirrored=state.machines.some(m=>m.ast1Mirrored);return {type:stampType,x,y,face:stampFace,mode:stampMode,item:stampItem,panel:supportsMachinePanel({type:stampType})?stampPanel:0,ast1Mirrored:mirrored,ast1GamePorts:mirrored};}
function updateStampControls(){
 const panel=$('stampControls');
 if(!stampType){panel.style.display='none';return;}
 const d=DEF[stampType],modes=recipeModes(stampType),rec=d.recipes?.[stampMode];
 panel.style.display='block';
 $('configContext').textContent='放置设置';
 $('stampName').textContent=d.name;
 $('stampFacing').textContent=({E:'右 →',S:'下 ↓',W:'左 ←',N:'上 ↑'})[stampFace]||'—';
 $('stampModeRow').style.display=modes.length>1?'flex':'none';
 $('stampPanelRow').style.display=supportsMachinePanel({type:stampType})?'flex':'none';
 $('stampPanel').value=String(stampPanel);
 $('stampItemRow').style.display=stampType==='仓出'?'flex':'none';
 $('stampMode').innerHTML=modes.map(key=>`<option value="${esc(key)}" ${String(stampMode)===String(key)?'selected':''}>${esc(recipeOptionLabel(stampType,key))}</option>`).join('');
 $('stampItem').innerHTML=MATERIALS.map(mat=>`<option value="${esc(mat)}" ${stampItem===mat?'selected':''}>${esc(mat)}</option>`).join('');
 $('stampRecipeText').style.display=rec||stampType==='仓出'?'block':'none';
 $('stampRecipeText').innerHTML=rec?
  `<div class="machine-config-recipe-head"><span>配方</span><small>${rec.seconds} 秒/次</small></div><div class="machine-config-flow">${Object.entries(rec.inputs).map(([k,n])=>`<span class="machine-config-input">${esc(k)} ×${n}</span>`).join('')||'<span class="machine-config-none">无输入</span>'}<span class="machine-config-arrow">→</span><strong>${esc(rec.output)} ×${rec.qty}</strong></div>`
  :stampType==='仓出'?`<span>从仓库取出：<strong>${esc(stampItem||'未选择')}</strong></span>`:'';
 $('stampHelp').textContent='单击地图放置；可继续放置同配置机器。按 Esc 结束。';
}
function getRecipe(m){const d=def(m);if(!d?.recipes)return null;const mode=m.mode===undefined||m.mode===null||m.mode===''?Object.keys(d.recipes)[0]:m.mode;return d.recipes[mode]||null;}
// 左边是配方标称加工秒数，括号显示全网联立稳态求解的动态有效加工周期。
// 按「每批加工」计：一次产生 qty 件的配方，周期 = 1 / 每秒完成的批次数。
// 没有有效生产流量时是 ∞；未放入地图的预览机器没有连接，显示「待接线」。
// 与逐件模拟的瞬时缓存/轮转结果不同，这是数学可行稳态的理论周期。
function effectiveCycle(m){
 const rec=getRecipe(m);
 if(!rec)return null;
 if(!m.id||!state.machines.some(e=>e.id===m.id))return null;
 if(!theoreticalBudget||theoreticalBudget.error)return null;
 const cycles=theoreticalBudget.machineCycles?.[m.id]||0;
 if(!(cycles>1e-9))return Infinity;
 // 精确分数的浮点误差可能造成 (1/cycle) 略小于配方标称时间。
 return Math.max(rec.seconds,1/cycles);
}
function fmtT(n){return !Number.isFinite(n)?'∞':String(Math.round(n*100)/100).replace(/\.0+$/,'');}
function timeLabel(m){
 const rec=getRecipe(m);if(!rec)return '';
 const period=effectiveCycle(m);
 const dynamic=period===null?'待接线':fmtT(period)+'s';
 return fmtT(rec.seconds)+'s('+dynamic+')';
}
function machineLabelLines(m){let r=getRecipe(m),result=[{text:def(m).name,color:'#f0f6ff',bold:true}];
 if(r){for(const [k,n] of Object.entries(r.inputs||{}))result.push({text:k+' ×'+n,color:'#60b5ff'});
 result.push({text:r.output+' ×'+r.qty,color:'#ffb16b'});
 result.push({text:timeLabel(m),color:'#d4f4e4'});
 } else if(m.type==='分流'){
 // 视觉上展示三个真实出口（不是抽象的输出口1/2/3）。
 // 一律从 getPorts 读取朝向及过滤配置，旋转时方向文字随端口自动更新。
 for(let slot=0;slot<3;slot++){
   const p=outPort(m,ast1FilterPortFromGame(m,slot));
   if(!p)continue;
   const filter=p.filter&&p.filter!=='任意'?p.filter:'any';
   result.push({text:filter+' '+ast1FilterPortLabel(m,p.index)+'('+p.side+')',color:'#ffb16b'});
  }
 } else if(m.type==='仓入')result.push({text:m.inletItem||'any',color:'#60b5ff'});
 else if(m.type==='仓出')result.push({text:(m.item||'未指定')+' ×1',color:'#ffb16b'});
 return result;
}
// Keep canvas glyphs proportional at every zoom level. Supplying fillText's
// maxWidth compressed long Chinese machine names horizontally; measuring first
// and scaling the FONT avoids that distortion. Split long headings when space permits.
function paintMachineText(m,w,h,preview=false){const lines=machineLabelLines(m);if(!lines.length)return;
 const heightLimit=Math.max(.48,Math.min(.83,(h-.54)/lines.length));
 const spacing=Math.min(1.04,(h-.5)/lines.length),base=m.y+h/2-(lines.length-1)*spacing/2;
 ctx.textAlign='center';ctx.textBaseline='middle';
 lines.forEach((line,i)=>{let sz=i===0?Math.min(1.04,heightLimit*1.22):heightLimit;ctx.font=(line.bold?'bold ':'')+sz+'px system-ui, "Microsoft YaHei", sans-serif';ctx.fillStyle=line.color;
  // Fit with proportional font size; never use fillText(maxWidth), which
  // horizontally compresses glyphs rather than scaling the typography.
  const textWidth=ctx.measureText(line.text).width,available=Math.max(.5,w-.42);
  if(textWidth>available){sz*=available/textWidth;ctx.font=(line.bold?'bold ':'')+sz+'px system-ui, "Microsoft YaHei", sans-serif';}
  ctx.fillText(line.text,m.x+w/2,base+i*spacing);});
}
function label(m){let s=def(m)?.name||m.type; if(m.type==='仓出')s+=' · '+(m.item||'未设置');else if(getRecipe(m))s+=' · '+recipeOptionLabel(m.type,m.mode);return s}
function dims(m){if(Number.isInteger(m.w)&&Number.isInteger(m.h))return [m.w,m.h];let d=def(m)||{w:5,h:5};return m.face==='N'||m.face==='S'?[d.h,d.w]:[d.w,d.h]}
function getPorts(m){
 if(m.ast1Mirrored){
  const original={...m,ast1Mirrored:false,face:ast1MirrorFace(m.face),x:AST1_GRID_WIDTH-m.x-dims(m)[0]};
  return getPorts(original).map(p=>({...p,x:AST1_GRID_WIDTH-1-p.x,ex:AST1_GRID_WIDTH-1-p.ex,side:ast1MirrorFace(p.side)}));
 }
 const d=def(m),f=m.face||'E',[w,h]=dims(m),x=m.x,y=m.y;const ni=d.ins,no=d.outs;const one=(side,off,kind,i)=>{let xx=side==='E'?x+w-1:side==='W'?x:x+off;let yy=side==='S'?y+h-1:side==='N'?y:y+off;let [dx,dy]=V[side];return {kind,index:i,x:xx,y:yy,ex:xx+dx,ey:yy+dy,side,filter:kind==='in'?(m.type==='仓入'?(m.inletItem||''):''):(m.outFilters?.[i]??'')};};const ports=[];const back=OPP[f];
 function sideLength(side){return side==='E'||side==='W'?h:w}
 if(m.type==='汇流') {['E','W','N','S'].filter(q=>q!==f).forEach((s,i)=>ports.push(one(s,Math.floor(sideLength(s)/2),'in',i)));ports.push(one(f,Math.floor(sideLength(f)/2),'out',0));}
 else if(m.type==='分流'){ports.push(one(back,Math.floor(sideLength(back)/2),'in',0));['E','W','N','S'].filter(q=>q!==back).forEach((s,i)=>ports.push(one(s,Math.floor(sideLength(s)/2),'out',i)));}
 else{const len=sideLength(back);let offsets=ni===2?[Math.floor(len/2)-1,Math.floor(len/2)]:Array.from({length:ni},(_,i)=>Math.max(0,Math.floor((len-ni)/2))+i);// 冶炼炉、共鸣谐振器的输入口阵列从输入侧看偏右半格：
 // 朝 E/N 时沿地图坐标正方向偏一格；朝 W/S 时，原偏小索引一侧已是局部右侧。
 if((m.type==='冶炼'||m.type==='共鸣')&&(f==='E'||f==='N'))offsets=offsets.map(off=>off+1);
 // AST1 原游戏中这些旋向的端口相对坐标与旧 HTML 有1格差异，
 // 仅对 AST1 导入的机器应用，不影响现有 JSON 工厂。
 if(m.ast1GamePorts&&m.type==='冶炼'&&f==='N')offsets=offsets.map(off=>off-1);
 if(m.ast1GamePorts&&m.type==='共鸣'&&f==='S')offsets=offsets.map(off=>off+1);
 offsets.forEach((off,i)=>ports.push(one(back,off,'in',i)));if(no)ports.push(one(f,Math.floor(sideLength(f)/2),'out',0));}return ports;}
// 配方机器的所有输入口均自动接收配方所需材料；输入口手动过滤已停用。
function inPort(m,i){return getPorts(m).find(p=>p.kind==='in'&&p.index===i)}function outPort(m,i){return getPorts(m).find(p=>p.kind==='out'&&p.index===i)}
function inMap(x,y){return x>=0&&y>=0&&x<W&&y<H}
function reserved(x,y){return x>=29&&x<43&&y>=29&&y<43;}
function rectOverlap(x,y,w,h,a,b,c,d){return x<a+c&&x+w>a&&y<b+d&&y+h>b}
function cellMachine(x,y,except){return state.machines.find(m=>m.id!==except&&x>=m.x&&y>=m.y&&x<m.x+dims(m)[0]&&y<m.y+dims(m)[1])}
function cellRoutes(x,y){return state.routes.filter(r=>r.path.some(p=>p[0]===x&&p[1]===y))}
// Unconnected splitter outputs and merger inputs are optional contact edges.
// A neighboring machine may occupy their exterior tiles. Every connected port
// remains protected by its belt tile and checkPath(), and a merger's output
// remains a required clear port even when not connected.
function needsClearOutside(m,p){
  // Consumer inlet is optional; it needs exterior clearance only while wired.
  if(m.type==='电脑'&&p.kind==='in'&&!routeFor(m.id,'in',p.index))return false;
 if(m.type==='分流'&&p.kind==='out'&&!routeFor(m.id,'out',p.index))return false;
 if(m.type==='汇流'&&p.kind==='in'&&!routeFor(m.id,'in',p.index))return false;
 return true;
}
function canPlace(m,exceptId=m.id){
 const [w,h]=dims(m);if(m.x<0||m.y<0||m.x+w>W||m.y+h>H)return false;
 // Reserve exterior contact tiles only for real/required machine ports.
 // Unused splitter outputs and merger inputs do not force a one-tile gap.
 const outsideOtherPorts=new Set();
 for(const o of state.machines)if(o.id!==exceptId)for(const p of getPorts(o))
  if(needsClearOutside(o,p))outsideOtherPorts.add(p.ex+','+p.ey);
 for(let yy=m.y;yy<m.y+h;yy++)for(let xx=m.x;xx<m.x+w;xx++)
  if(reserved(xx,yy)||cellMachine(xx,yy,exceptId)||cellRoutes(xx,yy).length||outsideOtherPorts.has(xx+','+yy))return false;
 // Only active/required candidate ports must face a clear exterior tile.
 for(const p of getPorts(m))if(needsClearOutside(m,p)&&inMap(p.ex,p.ey)&&cellMachine(p.ex,p.ey,exceptId))return false;
 return true;
}
function findFree(m,hintX=9,hintY=2){let cand=[];for(let y=0;y<72;y++)for(let x=0;x<72;x++){let v={...m,x,y};if(canPlace(v)){let score=Math.abs(x-hintX)+Math.abs(y-hintY)+Math.random()*0.0001;cand.push([score,x,y]);}}cand.sort((a,b)=>a[0]-b[0]);return cand.length?{x:cand[0][1],y:cand[0][2]}:null;}
function machineById(id){return state.machines.find(m=>m.id===id)}
function portAt(x,y){const m=cellMachine(x,y);if(!m)return null;const p=getPorts(m).find(p=>p.x===x&&p.y===y);return p?{m,p}:null;}
function recipeOutput(m){if(m.type==='仓出')return m.item||'';return getRecipe(m)?.output||''}
// 所有普通生产机器输入口都按配方自动接受混合原料；仓库入库的独立
// 物品限制仍可配置。分流/汇流接受混合物品，出口过滤不受影响。
function acceptsMaterial(m,item,idx){
 if(!m||!inPort(m,idx)||!item)return false;
 const filter=(m.type==='仓入'||m.type==='电脑')?(m.inletItem||''):'';
 if(filter&&filter!=='任意'&&filter!==item)return false;
 const rec=getRecipe(m);
 if(rec)return Object.prototype.hasOwnProperty.call(rec.inputs||{},item);
 return true;
}
function routeFor(id,kind,index){return state.routes.find(r=>r[kind==='out'?'from':'to'].id===id&&r[kind==='out'?'from':'to'].port===index)}
function routeTitle(r){let a=machineById(r.from.id),b=machineById(r.to.id);return `${a?label(a):'?'} → ${b?label(b):'?'}`}
