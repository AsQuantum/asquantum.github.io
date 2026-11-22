'use strict';
// The warehouse panel is folded by default; remember the user's last toggle.
const warehousePanel=$('warehousePanel');
try{warehousePanel.open=localStorage.getItem('factory_lab_warehouse_expanded')==='true';}catch(e){}
warehousePanel.addEventListener('toggle',()=>{
 try{localStorage.setItem('factory_lab_warehouse_expanded',String(warehousePanel.open));}catch(e){}
 if(warehousePanel.open&&$('warehouse').firstElementChild)warehouseRefreshLive();
});
$('map').addEventListener('pointerdown',onPointerDown);$('map').addEventListener('pointermove',onPointerMove);$('map').addEventListener('pointerup',onPointerUp);$('map').addEventListener('pointercancel',onPointerUp);$('map').addEventListener('contextmenu',e=>e.preventDefault());
for(const [id,fn] of [['groupMove',()=>startGroupTransform('move')],['groupCopy',copyGroupSelection],['groupDuplicate',duplicateGroup],['groupPaste',pasteGroup],['groupLeft',()=>rotateGroup(-1)],['groupRight',()=>rotateGroup(1)],['groupDelete',deleteGroupSelection],['groupCancel',cancelGroupTransform]])$(id).onclick=fn;
$('map').addEventListener('wheel',e=>{e.preventDefault();const p=eventCoords(e),factor=Math.exp(-e.deltaY*.0012),nz=Math.max(3,Math.min(48,camera.z*factor));camera.x=p.x-(p.x-camera.x)*nz/camera.z;camera.y=p.y-(p.y-camera.y)*nz/camera.z;camera.z=nz;draw();},{passive:false});
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('search').oninput=buildPalette;
$('palette').onclick=e=>{let b=e.target.closest('[data-stamp]');if(!b)return;setStampType(b.dataset.stamp);tool='stamp';selection=null;draft=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.remove('active'));document.querySelectorAll('#palette button').forEach(b=>b.classList.toggle('active',b.dataset.stamp===stampType));updateHint();draw();};
$('stampLeft').onclick=()=>rotateStamp(-1);$('stampRight').onclick=()=>rotateStamp(1);$('stampCancel').onclick=()=>setTool('select');
$('stampMode').onchange=e=>{stampMode=parseRecipeMode(stampType,e.target.value);saveStampPreference();updateStampControls();updateHint();draw();};
$('stampItem').onchange=e=>{stampItem=e.target.value;saveStampPreference();updateStampControls();updateHint();draw();};$('undoBend').onclick=undoDraftBend;$('cancelBelt').onclick=cancelDraft;
$('inspector').onclick=e=>{let b=e.target.closest('button');if(!b)return;if(b.dataset.rotate)rotateSelected(Number(b.dataset.rotate));else if(b.dataset.selectRoute){selection={routeId:b.dataset.selectRoute,crossAt:selection?.crossAt||null};inspectorRefresh();draw();}else if(b.dataset.deleteRoute)deleteRoute(b.dataset.deleteRoute);};
$('inspector').onchange=e=>{let m=machineById(selection?.machineId);if(!m)return; if(e.target.id==='modeSelect'){snapshot();m.mode=parseRecipeMode(m.type,e.target.value);let rcount=state.routes.length;state.routes=state.routes.filter(r=>r.from.id!==m.id&&r.to.id!==m.id);afterChange(`配方已更改，删除${rcount-state.routes.length}条旧连接`);}else if(e.target.id==='warehouseInFilterSelect'){snapshot();m.inletItem=e.target.value;afterChange('仓库入口过滤：'+(m.inletItem||'任意'));}else if(e.target.id==='itemSelect'){snapshot();m.item=e.target.value;afterChange('仓库取出口改为 '+m.item);}else if(e.target.dataset.outFilter!==undefined){snapshot();(m.outFilters??={})[Number(e.target.dataset.outFilter)]=e.target.value;afterChange('已更新分流器出口材料限制');}};
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
$('run').onclick=()=>{warehouseRefreshLive();running=!running;if(running)setTool('select');$('run').textContent=running?'❚❚ 暂停模拟':'▶ 继续模拟';$('run').classList.add('primary');$('run').classList.toggle('sim-running',running);notify(running?'模拟已开始：仓库每60秒保存一份真实收支记录':'模拟已暂停');};
$('simSpeed').onchange=e=>{simulationSpeed=Number(e.target.value)||1;notify(`模拟速度已设为 ${simulationSpeed}×`);};
$('stepMinute').onclick=advanceSimulationMinute;
$('resetSim').onclick=()=>{resetSimulation();inspectorRefreshLive();notify('已清空模拟库存、生产队列和分钟统计记录');};
