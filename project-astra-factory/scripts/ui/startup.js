'use strict';
document.addEventListener('keydown',e=>{
 const target=e.target;
 if(target?.closest?.('input,select,textarea,[contenteditable]'))return;
 if(e.key===' '){spaceDown=true;e.preventDefault();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 const k=e.key.toLowerCase();
 if(k==='q'||k==='e'||k==='r'){if(stampType)rotateStamp(k==='q'?-1:1);else rotateSelected(k==='q'?-1:1);e.preventDefault();return;}
 if(e.key==='Escape'){if(draft)cancelDraft();else setTool('select');e.preventDefault();return;}
 if(e.key==='Backspace'||e.key==='Delete'){
  if(draft){undoDraftBend();e.preventDefault();return;}
  if(selection?.machineId){removeMachine(selection.machineId);e.preventDefault();return;}
  if(selection?.routeId){deleteRoute(selection.routeId);e.preventDefault();return;}
 }
});
document.addEventListener('keyup',e=>{if(e.key===' ')spaceDown=false;});
window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{if(document.hidden){try{localStorage.setItem('factory_lab_v2',JSON.stringify(state));}catch(e){}}});
try{stampPrefs=JSON.parse(localStorage.getItem('factory_lab_v3_stamp_prefs')||'{}')||{};}catch(e){stampPrefs={};}try{const saved=localStorage.getItem('factory_lab_v2');loadState(saved?JSON.parse(saved):createEmpty());}catch(err){loadState(createEmpty());}buildPalette();renderMaterialLegend();updateHint();setTool('select');resize();requestAnimationFrame(stepLoop);
