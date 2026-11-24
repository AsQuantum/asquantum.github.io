'use strict';
function deleteRoute(id){let index=state.routes.findIndex(r=>r.id===id);if(index<0)return;snapshot();let [r]=state.routes.splice(index,1);selection=null;afterChange('删除线路：'+routeTitle(r));}
function removeMachine(id){
 const m=machineById(id);if(!m)return;
 snapshot();
 // Incoming belts have a physical end tile OUTSIDE this machine. Removing
 // the receiver must detach the endpoint, never erase that upstream route.
 // Capture the actual final outgoing arm before removing the receiver ports:
 // otherwise a final corner would silently become a straight piece.
 for(const r of state.routes){
  if(r.to?.id!==id||r.from.id===id)continue;
  const last=routeTile(r,r.path.length-1);
  r.to=null;
  if(last?.outgoing)r.openEndSide=last.outgoing;
  else delete r.openEndSide;
 }
 state.routes=state.routes.filter(r=>r.from.id!==id);
 state.machines=state.machines.filter(a=>a.id!==id);
 if(draft?.from?.id===id)draft=null;
 beltTrim=null;selection=null;
 afterChange('删除机器 '+label(m)+'（连接其输入口的传送带保留为悬空线路）');
}
function snapshot(){undoStack.push(JSON.stringify(state));if(undoStack.length>80)undoStack.shift();redoStack=[];}
function undo(){if(!undoStack.length)return;clearGroupSelection();redoStack.push(JSON.stringify(state));state=JSON.parse(undoStack.pop());selection=null;draft=null;
 if(typeof beltTrim!=='undefined')beltTrim=null;
 if(typeof beltEditExitPending!=='undefined')beltEditExitPending=false;
 if(typeof beltPostTrimRouteId!=='undefined')beltPostTrimRouteId=null;
 afterChange('已撤销');}
function redo(){if(!redoStack.length)return;clearGroupSelection();undoStack.push(JSON.stringify(state));state=JSON.parse(redoStack.pop());selection=null;draft=null;
 if(typeof beltTrim!=='undefined')beltTrim=null;
 if(typeof beltEditExitPending!=='undefined')beltEditExitPending=false;
 if(typeof beltPostTrimRouteId!=='undefined')beltPostTrimRouteId=null;
 afterChange('已重做');}
function afterChange(message,{resetRuntime=false}={}){synchronizeAst1MachineRecords();theoreticalBudget=null;if(resetRuntime||typeof reconcileSimulationLayout!=='function')resetSimulation();else reconcileSimulationLayout();if(message)notify(message,'good');try{localStorage.setItem('factory_lab_v13',compactFactoryJSON());}catch(e){notify('当前环境无法使用 localStorage；请用导出 JSON 手动备份','warn');}
 saveCurrentScheme();updateGroupControls();refresh();}
function notify(text,style=''){const el=$('statusText');el.className=style;el.textContent=text;simLog.unshift(text);simLog=simLog.slice(0,18);$('logs').innerHTML=simLog.map(e=>'<div>'+esc(e)+'</div>').join('');}
function getBlockedCount(){let oc=new Set();for(let m of state.machines){let[w,h]=dims(m);for(let y=m.y;y<m.y+h;y++)for(let x=m.x;x<m.x+w;x++)oc.add(x+','+y);}return oc.size;}
function getBeltCount(){return new Set(state.routes.flatMap(r=>r.path.map(p=>p.join(',')))).size;}
// Resolve a junction's actual upstream materials instead of treating a connected
// splitter or merger as a magical source for every ingredient.
