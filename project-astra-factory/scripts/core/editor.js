'use strict';
function deleteRoute(id){let index=state.routes.findIndex(r=>r.id===id);if(index<0)return;snapshot();let [r]=state.routes.splice(index,1);selection=null;afterChange('删除线路：'+routeTitle(r));}
function removeMachine(id){let m=machineById(id);if(!m)return;snapshot();state.machines=state.machines.filter(a=>a.id!==id);state.routes=state.routes.filter(r=>r.from.id!==id&&r.to.id!==id);selection=null;afterChange('删除机器 '+label(m));}
function snapshot(){undoStack.push(JSON.stringify(state));if(undoStack.length>80)undoStack.shift();redoStack=[];}
function undo(){if(!undoStack.length)return;clearGroupSelection();redoStack.push(JSON.stringify(state));state=JSON.parse(undoStack.pop());selection=null;draft=null;afterChange('已撤销');}
function redo(){if(!redoStack.length)return;clearGroupSelection();undoStack.push(JSON.stringify(state));state=JSON.parse(redoStack.pop());selection=null;draft=null;afterChange('已重做');}
function afterChange(message){theoreticalBudget=null;resetSimulation();if(message)notify(message,'good');try{localStorage.setItem('factory_lab_v2',JSON.stringify(state));}catch(e){notify('当前环境无法使用 localStorage；请用导出 JSON 手动备份','warn');} updateGroupControls();refresh();}
function notify(text,style=''){const el=$('statusText');el.className=style;el.textContent=text;simLog.unshift(text);simLog=simLog.slice(0,18);$('logs').innerHTML=simLog.map(e=>'<div>'+esc(e)+'</div>').join('');}
function getBlockedCount(){let oc=new Set();for(let m of state.machines){let[w,h]=dims(m);for(let y=m.y;y<m.y+h;y++)for(let x=m.x;x<m.x+w;x++)oc.add(x+','+y);}return oc.size;}
function getBeltCount(){return new Set(state.routes.flatMap(r=>r.path.map(p=>p.join(',')))).size;}
// Resolve a junction's actual upstream materials instead of treating a connected
// splitter or merger as a magical source for every ingredient.
