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
// The panel index is relative to machine facing; exactly the same
// world-facing side is used by Canvas and the two panel dropdowns.
function machinePanelWorldSide(face,index){
 const order=['E','S','W','N'],front=order.indexOf(face||'E');
 return order[(Math.max(0,front)+[3,0,1,2][index]+4)%4];
}
function machinePanelFacing(m){
 return machinePanelWorldSide(m.face,machinePanelPosition(m));
}
function machinePanelOptionLabel(m,index){
 return MACHINE_PANEL_LABELS[index]+' · '+portDirectionArrow(machinePanelWorldSide(m.face,index));
}
function machinePanelDescription(m){
 return machinePanelOptionLabel(m,machinePanelPosition(m));
}
// Only catalog entries can be picked for new machines. Imported unknown IDs
// still remain visible and roundtrip through the existing Inspector and codecs.
function stampKnownFilter(item){return MATERIALS.includes(item)?item:'';}
function setStampType(type){
 const previous=stampPrefs[type]||{};
 stampType=type;stampFace=previous.face||'E';
 const savedMode=previous.mode;
 stampMode=savedMode!==undefined&&savedMode!==null&&Object.prototype.hasOwnProperty.call(DEF[type].recipes||{},savedMode)
  ?parseRecipeMode(type,savedMode):defaultModeFor(type);
 stampItem=previous.item||'钛合金锭';
 stampPanel=Number.isInteger(previous.panel)&&previous.panel>=0&&previous.panel<=3?previous.panel:0;
 stampInletItem=stampKnownFilter(previous.inletItem);
 stampSplitterFilters=[0,1,2].map(i=>stampKnownFilter(previous.splitterFilters?.[i]));
 updateStampControls();
}
function saveStampPreference(){
 if(!stampType)return;
 stampPrefs[stampType]={face:stampFace,mode:stampMode,item:stampItem,panel:stampPanel,
  inletItem:stampInletItem,splitterFilters:stampSplitterFilters.slice()};
 try{localStorage.setItem('factory_lab_v3_stamp_prefs',JSON.stringify(stampPrefs));}catch(e){}
}
function getStampMachine(x=0,y=0){
 const mirrored=state.machines.some(m=>m.ast1Mirrored);
 const m={type:stampType,x,y,face:stampFace,mode:stampMode,item:stampItem,
  panel:supportsMachinePanel({type:stampType})?stampPanel:0,
  ast1Mirrored:mirrored,ast1GamePorts:mirrored};
 if(stampType==='仓入')m.inletItem=stampInletItem;
 if(stampType==='分流'){
  // Preferences are [front,right,left], never physical port indices.
  m.outFilters={};
  for(let slot=0;slot<3;slot++){
   const item=stampSplitterFilters[slot];
   if(item)m.outFilters[ast1FilterPortFromGame(m,slot)]=item;
  }
 }
 return m;
}
function updateStampControls(){
 const panel=$('stampControls');
 if(!stampType){panel.style.display='none';return;}
 const d=DEF[stampType],modes=factoryRecipeModesByItem(stampType,recipeModes(stampType)),rec=d.recipes?.[stampMode];
 panel.style.display='block';
 $('configContext').textContent='放置设置';
 $('stampName').textContent=d.name;
 $('stampFacing').textContent=({E:'右 →',S:'下 ↓',W:'左 ←',N:'上 ↑'})[stampFace]||'—';
 $('stampModeRow').style.display=modes.length>1?'flex':'none';
 $('stampPanelRow').style.display=supportsMachinePanel({type:stampType})?'flex':'none';
 const preview={type:stampType,face:stampFace,panel:stampPanel};
  $('stampPanel').innerHTML=MACHINE_PANEL_LABELS.map((_,i)=>
   '<option value="'+i+'"'+(stampPanel===i?' selected':'')+'>'+
   machinePanelOptionLabel(preview,i)+'</option>').join('');
  $('stampPanel').value=String(stampPanel);
 $('stampItemRow').style.display=stampType==='仓出'?'flex':'none';
 $('stampMode').innerHTML=modes.map(key=>`<option value="${esc(key)}" ${String(stampMode)===String(key)?'selected':''}>${esc(recipeOptionLabel(stampType,key))}</option>`).join('');
 $('stampItem').innerHTML=MATERIALS.map(mat=>`<option value="${esc(mat)}" ${stampItem===mat?'selected':''}>${esc(mat)}</option>`).join('');
 // Warehouse inlet and the three splitter outlets are placement options.
 const filterOptions=selected=>'<option value="">任意</option>'+
  MATERIALS.map(mat=>'<option value="'+esc(mat)+'"'+(selected===mat?' selected':'')+'>'+esc(mat)+'</option>').join('');
 $('stampInletFilterRow').style.display=stampType==='仓入'?'flex':'none';
 $('stampInletFilter').innerHTML=filterOptions(stampInletItem);
 $('stampSplitterFilterRows').style.display=stampType==='分流'?'block':'none';
 if(stampType==='分流'){
  const splitter=getStampMachine(),ports=getPorts(splitter);
  for(let slot=0;slot<3;slot++){
   const index=ast1FilterPortFromGame(splitter,slot);
   const port=ports.find(p=>p.kind==='out'&&p.index===index);
   $('stampSplitFilterLabel'+slot).textContent=ast1FilterPortLabel(splitter,index)+' · '+portDirectionArrow(port.side);
   $('stampSplitFilter'+slot).innerHTML=filterOptions(stampSplitterFilters[slot]);
  }
 }
 $('stampRecipeText').style.display=rec||stampType==='仓出'?'block':'none';
 $('stampRecipeText').innerHTML=rec?
  `<div class="machine-config-recipe-head"><span>配方</span><small>${rec.seconds} 秒/次</small></div><div class="machine-config-flow">${Object.entries(rec.inputs).sort(([a],[b])=>factoryItemCompare(a,b)).map(([k,n])=>`<span class="machine-config-input">${esc(k)} ×${n}</span>`).join('')||'<span class="machine-config-none">无输入</span>'}<span class="machine-config-arrow">→</span><strong>${esc(rec.output)} ×${rec.qty}</strong></div>`
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
 if(!rec||!m.id||!state.machines.some(e=>e.id===m.id))return null;
 const budget=typeof steadyDisplayRateBudget==='function'?steadyDisplayRateBudget(theoreticalBudget):theoreticalBudget;
 if(!budget||budget.error)return null;
 const cycles=budget.machineCycles;
 if(!cycles||!Object.prototype.hasOwnProperty.call(cycles,m.id))return null;
 const rate=cycles[m.id];
 if(!(rate>0))return Infinity;
 return Math.max(rec.seconds,1/rate);
}
function fmtT(n){return !Number.isFinite(n)?'∞':String(Math.round(n*100)/100).replace(/\.0+$/,'');}
// Wiring is a TOPOLOGICAL fact. The global proof being unfinished never
// turns an already connected machine into one that is 'waiting for wiring'.
function machineWiredForTheory(m){
 if(!m?.id||!state.machines.some(x=>x.id===m.id))return false;
 const rec=getRecipe(m);
 if(rec&&typeof missingMaterials==='function'&&missingMaterials(m).length)return false;
 return state.routes.some(r=>r.from?.id===m.id&&r.to&&
  (typeof checkPath!=='function'||!checkPath(r.path,r.from,r.to,r.id)));
}
// Read the BigInt rational certificates as exact fractions. rec.seconds is
// first converted from the catalog DECIMAL STRING, not a floating division.
function theoryRateUpperFraction(text){
 if(text===undefined||text===null||typeof steadyExactFraction!=='function')return null;
 const str=String(text);
 const parts=str.split('/');
 if(parts.length===2&&parts.every(p=>/^\d+$/.test(p)))
  return steadyExactFraction(BigInt(parts[0]),BigInt(parts[1]));
 return typeof steadyExactQ==='function'?steadyExactQ(str):null;
}
function theoryPeriodLowerText(rateText,nominalSeconds){
 const rate=theoryRateUpperFraction(rateText);
 if(!rate)return null;
 if(rate.n===0n)return '∞';
 if(rate.n<0n)return null;
 const period=steadyExactFraction(rate.d,rate.n);
 const nominal=steadyExactQ(String(nominalSeconds));
 if(steadyExactCmp(period,nominal)<=0)return null;
 // FLOOR, not rounding up: the displayed decimal remains a valid lower
 // bound, even when the exact fraction is a recurring decimal.
 const hundredths=period.n*100n/period.d;
 const whole=hundredths/100n;
 const cents=String(hundredths%100n).padStart(2,'0').replace(/0+$/,'');
 return '≥'+whole.toString()+(cents?'.'+cents:'')+'s';
}
function theoryMachinePeriodHint(m){
 const proof=theoreticalBudget?.diagnostics?.symbolicModel?.provenUpperBounds;
 if(!proof?.completed)return null;
 return theoryPeriodLowerText(proof.machineCycleUpper?.[m.id],getRecipe(m)?.seconds);
}
function timeLabel(m){
 const rec=getRecipe(m);if(!rec)return '';
 const nominal=String(rec.seconds)+'s';
 if(!machineWiredForTheory(m))return nominal+'(待接线)';
 const period=effectiveCycle(m);
 if(period!==null)return nominal+'('+(Number.isFinite(period)?fmtT(period)+'s':'∞')+')';
 const hint=theoryMachinePeriodHint(m);
 return nominal+'('+(hint||(!theoreticalBudget||theoreticalBudget.calculating?'计算中':theoreticalBudget.calculationTimedOut?'超时':'待证明'))+')';
}
// The warehouse outlet's own rate must come from its actual route, NOT
// aggregate shared-item warehouse withdrawals by other machines.
function warehouseOutletTimeLabel(m){
 const nominal=typeof PORT_INTERVAL==='number'?PORT_INTERVAL:1;
 const label=String(nominal)+'s';
 if(!machineWiredForTheory(m))return label+'(待接线)';
 const connected=state.routes.filter(r=>r.from?.id===m.id&&r.from?.port===0&&r.to&&
  (typeof checkPath!=='function'||!checkPath(r.path,r.from,r.to,r.id)));
 const budget=typeof steadyDisplayRateBudget==='function'?steadyDisplayRateBudget(theoreticalBudget):theoreticalBudget;
 if(budget&&!budget.error){
  const flows=budget.routeFlows||{};
  if(connected.length&&connected.every(r=>Object.prototype.hasOwnProperty.call(flows,r.id))){
   const rate=connected.reduce((sum,r)=>sum+Number(flows[r.id]?.[m.item]||0),0);
   return label+'('+(rate>0?fmtT(Math.max(nominal,1/rate))+'s':'∞')+')';
  }
 }
 const upper=theoreticalBudget?.diagnostics?.symbolicModel?.provenUpperBounds?.routeItemUpper;
 const hints=connected.map(r=>theoryRateUpperFraction(upper?.[r.id+'|'+m.item])).filter(Boolean);
 if(hints.length===1){
  const hint=theoryPeriodLowerText(upper[connected[0].id+'|'+m.item],nominal);
  if(hint)return label+'('+hint+')';
 }
 return label+'('+(!theoreticalBudget?'待计算':'待证明')+')';
}
function portDirectionArrow(side){return ({N:'↑',S:'↓',W:'←',E:'→'})[side]||side;}
// Fixed, softly whitened input/output text colors: no item-dependent hue.
const MACHINE_INPUT_LABEL_COLOR='#60b5ff';
const MACHINE_OUTPUT_LABEL_COLOR='#ffb16b';
function machineLabelLines(m){let r=getRecipe(m),result=[{text:def(m).name,color:'#f0f6ff',bold:true}];
 if(r){for(const [k,n] of Object.entries(r.inputs||{}).sort(([a],[b])=>factoryItemCompare(a,b)))result.push({text:k+' ×'+n,color:MACHINE_INPUT_LABEL_COLOR});
 result.push({text:r.output+' ×'+r.qty,color:MACHINE_OUTPUT_LABEL_COLOR});
 result.push({text:timeLabel(m),color:'#d4f4e4'});
 } else if(m.type==='分流'){
 // 视觉上展示三个真实出口（不是抽象的输出口1/2/3）。
 // 一律从 getPorts 读取朝向及过滤配置，旋转时方向文字随端口自动更新。
 for(let slot=0;slot<3;slot++){
   const p=outPort(m,ast1FilterPortFromGame(m,slot));
   if(!p)continue;
   const filter=p.filter&&p.filter!=='任意'?p.filter:'any';
   result.push({text:portDirectionArrow(p.side)+' '+filter,color:MACHINE_OUTPUT_LABEL_COLOR});
  }
 } else if(m.type==='仓入')result.push({text:m.inletItem||'any',color:MACHINE_INPUT_LABEL_COLOR});
 else if(m.type==='仓出'){
  result.push({text:(m.item||'未指定')+' ×1',color:MACHINE_OUTPUT_LABEL_COLOR});
  result.push({text:warehouseOutletTimeLabel(m),color:'#d4f4e4'});
 }
 return result;
}
// Keep canvas glyphs proportional at every zoom level. Supplying fillText's
// maxWidth compressed long Chinese machine names horizontally; measuring first
// and scaling the FONT avoids that distortion. Split long headings when space permits.
// Rectangles occupied by input/output text. Socket squares are clipped only
// where their outlines would cross these labels; no opaque rectangle is ever
// painted over the machine body, panel marks or belts.
function machineLabelGeometry(m,h,lineCount,topInset=0){
 const available=Math.max(.1,h-topInset-.5),spacing=Math.min(1.04,available/lineCount);
 const heightLimit=topInset?Math.min(.83,spacing*.80):Math.max(.48,Math.min(.83,(h-.54)/lineCount));
 return {heightLimit,spacing,base:m.y+topInset+(h-topInset)/2-(lineCount-1)*spacing/2};
}
function machineMaterialTextBounds(m,w,h,topInset=0){
 // The headless geometry-only test painter has no text metrics; browsers do.
 if(typeof ctx.measureText!=='function')return [];
 const lines=machineLabelLines(m);
 if(!lines.length)return [];
 const {heightLimit,spacing,base}=machineLabelGeometry(m,h,lines.length,topInset);
 const bounds=[];
 ctx.save();
 lines.forEach((line,i)=>{
  if(i===0||(line.color!==MACHINE_INPUT_LABEL_COLOR&&line.color!==MACHINE_OUTPUT_LABEL_COLOR))return;
  let size=heightLimit;
  ctx.font=(line.bold?'bold ':'')+size+'px system-ui, "Microsoft YaHei", sans-serif';
  let width=ctx.measureText(line.text).width;
  const available=Math.max(.5,w-.42);
  if(width>available){
   size*=available/width;
   ctx.font=(line.bold?'bold ':'')+size+'px system-ui, "Microsoft YaHei", sans-serif';
   width=ctx.measureText(line.text).width;
  }
  const padding=.075;
  bounds.push({x:m.x+w/2-width/2-padding,
   y:base+i*spacing-size*.58-padding,
   w:width+padding*2,h:size*1.16+padding*2});
 });
 ctx.restore();
 return bounds;
}
function paintMachineText(m,w,h,preview=false,topInset=0){const lines=machineLabelLines(m);if(!lines.length)return;
 const {heightLimit,spacing,base}=machineLabelGeometry(m,h,lines.length,topInset);
 ctx.textAlign='center';ctx.textBaseline='middle';
 lines.forEach((line,i)=>{let sz=i===0?Math.min(1.04,heightLimit*1.22):heightLimit;ctx.font=(line.bold?'bold ':'')+sz+'px system-ui, "Microsoft YaHei", sans-serif';ctx.fillStyle=line.color;
  // Fit with proportional font size; never use fillText(maxWidth), which
  // horizontally compresses glyphs rather than scaling the typography.
  const textWidth=ctx.measureText(line.text).width,available=Math.max(.5,w-.42);
  if(textWidth>available){sz*=available/textWidth;ctx.font=(line.bold?'bold ':'')+sz+'px system-ui, "Microsoft YaHei", sans-serif';}
  // Plain glyphs with no halo or shadow; original label colors remain.
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
 if(m.ast1GamePorts&&m.ast1PortProfile!=='standard'&&m.type==='冶炼'&&f==='N')offsets=offsets.map(off=>off-1);
 if(m.ast1GamePorts&&m.ast1PortProfile!=='standard'&&m.type==='共鸣'&&f==='S')offsets=offsets.map(off=>off+1);
 offsets.forEach((off,i)=>ports.push(one(back,off,'in',i)));if(no)ports.push(one(f,Math.floor(sideLength(f)/2),'out',0));}return ports;}
// 配方机器的所有输入口均自动接收配方所需材料；输入口手动过滤已停用。
function inPort(m,i){return getPorts(m).find(p=>p.kind==='in'&&p.index===i)}function outPort(m,i){return getPorts(m).find(p=>p.kind==='out'&&p.index===i)}
function inMap(x,y){return x>=0&&y>=0&&x<W&&y<H}
function reserved(x,y){return x>=29&&x<43&&y>=29&&y<43;}
function rectOverlap(x,y,w,h,a,b,c,d){return x<a+c&&x+w>a&&y<b+d&&y+h>b}
function cellMachine(x,y,except){return state.machines.find(m=>m.id!==except&&x>=m.x&&y>=m.y&&x<m.x+dims(m)[0]&&y<m.y+dims(m)[1])}
function cellRoutes(x,y){return state.routes.filter(r=>r.path.some(p=>p[0]===x&&p[1]===y))}
// Necessary ports are audited for accessibility, not reserved for placement.
// Unused splitter outputs, merger inputs and computer inputs are optional.
// Connected belt tiles remain protected by physical collision checks.
function needsClearOutside(m,p){
  // Consumer inlet is optional; it needs exterior clearance only while wired.
  if(m.type==='电脑'&&p.kind==='in'&&!routeFor(m.id,'in',p.index))return false;
 if(m.type==='分流'&&p.kind==='out'&&!routeFor(m.id,'out',p.index))return false;
 if(m.type==='汇流'&&p.kind==='in'&&!routeFor(m.id,'in',p.index))return false;
 return true;
}
function canPlace(m,exceptId=m.id){
 const [w,h]=dims(m);if(![m.x,m.y,w,h].every(Number.isInteger)||w<=0||h<=0||m.x<0||m.y<0||m.x+w>W||m.y+h>H)return false;
 for(let yy=m.y;yy<m.y+h;yy++)for(let xx=m.x;xx<m.x+w;xx++)
  if(reserved(xx,yy)||cellMachine(xx,yy,exceptId)||cellRoutes(xx,yy).length)return false;
 return true;
}
// Soft warning for a newly placed machine, including ports of its neighbours.
function placementPortWarningCount(m){
 const [w,h]=dims(m);let count=0;
 for(const p of getPorts(m))if(needsClearOutside(m,p)&&(!inMap(p.ex,p.ey)||reserved(p.ex,p.ey)||cellMachine(p.ex,p.ey,m.id)))count++;
 for(const other of state.machines)if(other.id!==m.id)for(const p of getPorts(other))
  if(needsClearOutside(other,p)&&p.ex>=m.x&&p.ex<m.x+w&&p.ey>=m.y&&p.ey<m.y+h)count++;
 return count;
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
function routeFor(id,kind,index){return state.routes.find(r=>{const p=r[kind==='out'?'from':'to'];return p?.id===id&&p.port===index;})}
function routeTitle(r){let a=machineById(r.from.id),b=r.to&&machineById(r.to.id);return `${a?label(a):'?'} → ${r.to?(b?label(b):'?'):'悬空终点'}`}

// Warehouse outputs competing for the same shared item reserve in MACHINE-ID
// order, not insertion/DOM layout order. AST1 uses ast1_48 before ast1_114.
// Use a numeric suffix (BigInt avoids precision loss for large IDs) and
// lexical fallback for custom IDs without matching numeric namespaces.
function warehouseMachinePriorityCompare(a,b){
 const left=String(a.id||""),right=String(b.id||"");
 const la=left.match(/^(.*?)(\d+)$/),lb=right.match(/^(.*?)(\d+)$/);
 if(la&&lb&&la[1]===lb[1]){
  const x=BigInt(la[2]),y=BigInt(lb[2]);
  if(x!==y)return x<y?-1:1;
 }
 return left<right?-1:left>right?1:0;
}


// AST1 machine IDs represent current GAME BLUEPRINT RECORD INDICES. They
// renumber after deletion; existing belts and editor references must follow.
// Ordinary layouts using arbitrary JSON machine IDs remain untouched.
// The machine array is authoritative for both game serialization and physical
// warehouse-out priority. Movement must retain the original array slots.
// Game record indices are canonical M0..M(n-1) and R0..R(n-1).
// Existing AST1 JSONs may have ast1_N, m1 and r1 IDs; the imported
// AST1 metadata identifies the game layout, and all references are remapped.
function synchronizeAst1MachineRecords(){
 const machines=state?.machines,routes=state?.routes;
 if(!Array.isArray(machines)||!Array.isArray(routes)||!machines.length)return false;
 const game=state.recordIndexed===true||machines.some(m=>m.ast1GamePorts===true||m.ast1Mirrored===true)||
  machines.every(m=>/^(?:M|ast1_)\d+$/.test(String(m.id||'')));
 if(!game)return false;
 const machinesMap=new Map(),routesMap=new Map();
 for(const [i,m] of machines.entries()){
  if(machinesMap.has(m.id))throw Error('Duplicate game machine ID '+m.id);
  machinesMap.set(m.id,'M'+i);
 }
 for(const [i,r] of routes.entries()){
  if(routesMap.has(r.id))throw Error('Duplicate game route ID '+r.id);
  routesMap.set(r.id,'R'+i);
 }
 const machineId=id=>machinesMap.get(id)??id,routeId=id=>routesMap.get(id)??id;
 for(const r of routes){r.from.id=machineId(r.from.id);if(r.to)r.to.id=machineId(r.to.id);}
 if(selection?.machineId)selection.machineId=machineId(selection.machineId);
 if(selection?.routeId)selection.routeId=routeId(selection.routeId);
 if(multiSelection?.machineIds)multiSelection.machineIds=multiSelection.machineIds.map(machineId);
 if(multiSelection?.routeIds)multiSelection.routeIds=multiSelection.routeIds.map(routeId);
 if(draft?.from?.id)draft.from.id=machineId(draft.from.id);
 if(draft?.routeId)draft.routeId=routeId(draft.routeId);
 if(beltTrim?.routeId)beltTrim.routeId=routeId(beltTrim.routeId);
 if(hoverPort?.machineId)hoverPort.machineId=machineId(hoverPort.machineId);
 if(drag?.machineId)drag.machineId=machineId(drag.machineId);
 if(drag?.routeId)drag.routeId=routeId(drag.routeId);
 for(const [i,m] of machines.entries())m.id='M'+i;
 for(const [i,r] of routes.entries())r.id='R'+i;
 state.recordIndexed=true;
 return true;
}

// Record numbers visible to users always follow array positions.
// Stable underlying arbitrary JSON IDs remain unchanged.
function machineRecordDisplayId(m){
 const i=state.machines.findIndex(x=>x.id===m?.id);
 return i<0?String(m?.id||''):'M'+i;
}
function routeRecordDisplayId(r){
 const i=state.routes.findIndex(x=>x.id===r?.id);
 return i<0?String(r?.id||''):'R'+i;
}
function nextFactoryMachineId(){
 return state.recordIndexed===true||!state.machines.length||
  state.machines.every(m=>/^M\d+$/.test(String(m.id||'')))?
  'M'+state.machines.length:'m'+(++idSeed);
}
function nextFactoryRouteId(){
 return state.recordIndexed===true||
  state.machines.every(m=>/^M\d+$/.test(String(m.id||'')))?
  'R'+state.routes.length:'r'+(++idSeed);
}
