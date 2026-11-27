'use strict';
// The warehouse panel is folded by default; remember the user's last toggle.
const warehousePanel=$('warehousePanel');
try{warehousePanel.open=localStorage.getItem('factory_lab_warehouse_expanded')==='true';}catch(e){}
warehousePanel.addEventListener('toggle',()=>{
 try{localStorage.setItem('factory_lab_warehouse_expanded',String(warehousePanel.open));}catch(e){}
});
$('map').addEventListener('pointerdown',onPointerDown);$('map').addEventListener('pointermove',onPointerMove);$('map').addEventListener('pointerleave',onPointerLeave);$('map').addEventListener('pointerup',onPointerUp);$('map').addEventListener('pointercancel',onPointerUp);$('map').addEventListener('contextmenu',e=>e.preventDefault());
for(const [id,fn] of [['groupMove',()=>startGroupTransform('move')],['groupCopy',copyGroupSelection],['groupDuplicate',duplicateGroup],['groupPaste',pasteGroup],['groupLeft',()=>stampType&&tool==='stamp'?rotateStamp(-1):rotateGroup(-1)],['groupRight',()=>stampType&&tool==='stamp'?rotateStamp(1):rotateGroup(1)],['groupDelete',deleteGroupSelection],['groupCancel',()=>stampType&&tool==='stamp'?setTool('select'):cancelGroupTransform()]])$(id).onclick=fn;
$('map').addEventListener('wheel',e=>{e.preventDefault();const p=eventCoords(e),factor=Math.exp(-e.deltaY*.0012),nz=Math.max(3,Math.min(48,camera.z*factor));camera.x=p.x-(p.x-camera.x)*nz/camera.z;camera.y=p.y-(p.y-camera.y)*nz/camera.z;camera.z=nz;draw();},{passive:false});
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('search').oninput=buildPalette;
$('palette').onclick=e=>{let b=e.target.closest('[data-stamp]');if(!b)return;setStampType(b.dataset.stamp);tool='stamp';selection=null;multiSelection=null;groupTransform=null;draft=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.remove('active'));document.querySelectorAll('#palette button').forEach(b=>b.classList.toggle('active',b.dataset.stamp===stampType));updateGroupControls();updateHint();draw();};
$('stampCancel').onclick=()=>setTool('select');
$('stampMode').onchange=e=>{stampMode=parseRecipeMode(stampType,e.target.value);saveStampPreference();updateStampControls();updateHint();draw();};
$('stampItem').onchange=e=>{stampItem=e.target.value;saveStampPreference();updateStampControls();updateHint();draw();};
$('stampInletFilter').onchange=e=>{
 stampInletItem=stampKnownFilter(e.target.value);
 saveStampPreference();updateStampControls();draw();
};
for(let slot=0;slot<3;slot++)$('stampSplitFilter'+slot).onchange=e=>{
 stampSplitterFilters[slot]=stampKnownFilter(e.target.value);
 saveStampPreference();updateStampControls();draw();
};
$('stampPanel').onchange=e=>{stampPanel=Number(e.target.value);saveStampPreference();updateStampControls();draw();};$('undoBend').onclick=undoDraftBend;$('cancelBelt').onclick=cancelDraft;
$('inspector').onclick=e=>{let b=e.target.closest('button');if(!b)return;if(b.dataset.stackDirection){
 const n=transferMachineStack(b.dataset.stackMachine,b.dataset.stackItem,b.dataset.stackDirection);
 if(n){warehouseRefreshLive();inspectorRefreshLive();stockChartRender();draw(true);}
 else inspectorRefreshLive();
 }else if(b.dataset.rotate)rotateSelected(Number(b.dataset.rotate));else if(b.dataset.selectRoute){selection={routeId:b.dataset.selectRoute};inspectorRefresh();draw();}else if(b.dataset.deleteRoute)deleteRoute(b.dataset.deleteRoute);};
$('inspector').onchange=e=>{let m=machineById(selection?.machineId);if(!m)return; if(e.target.id==='modeSelect'){
  const mode=parseRecipeMode(m.type,e.target.value);
  if(!Object.prototype.hasOwnProperty.call(DEF[m.type]?.recipes||{},mode))return;
  if(String(m.mode)===String(mode))return;
  snapshot();m.mode=mode;
  // Recipe selection does not alter machine ports; transport routes stay wired.
  afterChange('已更改产物为 '+recipeOptionLabel(m.type,mode));
 }else if(e.target.id==='panelSelect'){
  const value=Number(e.target.value);
  if(!supportsMachinePanel(m)||!Number.isInteger(value)||value<0||value>3||machinePanelPosition(m)===value)return;
  snapshot();m.panel=value;afterChange('面板方向：'+machinePanelDescription(m));
 }else if(e.target.id==='warehouseInFilterSelect'){snapshot();m.inletItem=e.target.value;afterChange('仓库入口过滤：'+(m.inletItem||'任意'));}else if(e.target.id==='itemSelect'){snapshot();m.item=e.target.value;afterChange('仓库取出口改为 '+m.item);}else if(e.target.dataset.outFilter!==undefined){snapshot();(m.outFilters??={})[Number(e.target.dataset.outFilter)]=e.target.value;afterChange('已更新分流器出口材料限制');}};
$('fit').onclick=autoFit;$('clearRoutes').onclick=()=>{if(!state.routes.length)return;if(!confirm('确定清除所有传送带连接？'))return;snapshot();state.routes=[];afterChange('全部线路已清除');};


 let importFeedbackDismissTimer=null;
 function importFeedback(message,failed=false){
  clearTimeout(importFeedbackDismissTimer);
  importFeedbackDismissTimer=null;
  const el=$('importFeedback');$('importFeedbackText').textContent=message;
  el.style.display='block';el.style.background=failed?'#4a2934':'#173f35';el.style.borderColor=failed?'#ff9aa5':'#6addad';
  el.style.color=failed?'#ffe8e8':'#ddffef';
  if(!failed){
   importFeedbackDismissTimer=setTimeout(()=>{
    el.style.display='none';
    importFeedbackDismissTimer=null;
   },5000);
  }
 }
 $('importFeedbackClose').onclick=()=>{
  clearTimeout(importFeedbackDismissTimer);
  importFeedbackDismissTimer=null;
  $('importFeedback').style.display='none';
 };

// Simulation controls are independent of the removed acceptance/check panels.
$('run').onclick=()=>{if(simAdvanceBusy)return;rebaseSimulationClock();warehouseRefreshLive();running=!running;if(typeof orchestraTheme!=='undefined')orchestraTheme.onTransport?.(running);if(running)setTool('select');$('run').textContent=running?'❚❚ 暂停模拟':'▶ 继续模拟';$('run').classList.add('primary');$('run').classList.toggle('sim-running',running);inspectorRefreshLive();notify(running?'模拟已开始：仓库每60秒保存一份真实收支记录':'模拟已暂停');};
$('simSpeed').onchange=e=>{rebaseSimulationClock();simulationSpeed=Number(e.target.value)||1;updateStepMinuteButton();notify(`模拟速度已设为 ${simulationSpeed}×`);};
$('stepMinute').onclick=advanceSimulationMinute;
$('addTestStock').onclick=addWarehouseTestStock;
$('warehouse').addEventListener('change',e=>{if(e.target?.id==='warehouseNetWindow')warehouseSetNetWindow(e.target.value);});
$('warehouse').addEventListener('click',e=>{const mode=e.target.closest('[data-warehouse-mode]');if(mode){warehouseSetActualMode(mode.dataset.warehouseMode);return}if(e.target.closest('[data-theory-retry]'))retryTheoryCalculation();});
updateStepMinuteButton();
$('resetSim').onclick=()=>{resetSimulation();inspectorRefreshLive();notify('已清空模拟库存、生产队列和分钟统计记录');};

$('audit').addEventListener('click',e=>{const b=e.target.closest('[data-audit-kind][data-audit-id]');if(b)auditFocus(b.dataset.auditKind,b.dataset.auditId);});
