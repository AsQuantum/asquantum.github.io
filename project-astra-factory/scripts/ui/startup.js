'use strict';
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();resetEditorMode();return;}
 const target=e.target;
 if(target?.closest?.('input,select,textarea,[contenteditable]'))return;
 if(e.key===' '){spaceDown=true;e.preventDefault();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&activeMachineSelectionIds().length){e.preventDefault();copyGroupSelection();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&groupClipboard){e.preventDefault();pasteGroup();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'&&activeMachineSelectionIds().length){e.preventDefault();duplicateGroup();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 // S toggles wiring only from an idle, unselected editor; never hijack a live operation.
 if(e.key.toLowerCase()==='s'&&!e.repeat&&!selection&&!multiSelection&&!groupTransform&&!stampType&&!draft&&(tool==='select'||tool==='belt')){
  setTool(tool==='select'?'belt':'select');e.preventDefault();return;
 }
 if(e.key.toLowerCase()==='g'&&activeMachineSelectionIds().length&&!groupTransform){startGroupTransform('move');e.preventDefault();return;}
 if(e.key.toLowerCase()==='b'&&!groupTransform){setTool('marquee');e.preventDefault();return;}
 if(groupTransform&&(e.key.toLowerCase()==='q'||e.key.toLowerCase()==='e'||e.key.toLowerCase()==='r')){rotateGroup(e.key.toLowerCase()==='q'?-1:1);e.preventDefault();return;}
 if(groupTransform&&(e.key==='Enter')){commitGroupTransform();e.preventDefault();return;}
 const k=e.key.toLowerCase();
 if(k==='q'||k==='e'||k==='r'){if(stampType)rotateStamp(k==='q'?-1:1);else rotateSelected(k==='q'?-1:1);e.preventDefault();return;}
 if(e.key==='Backspace'||e.key==='Delete'){
  if(multiSelection&&!groupTransform){deleteGroupSelection();e.preventDefault();return;}
  if(draft){undoDraftBend();e.preventDefault();return;}
  if(selection?.machineId){removeMachine(selection.machineId);e.preventDefault();return;}
  if(selection?.routeId){deleteRoute(selection.routeId);e.preventDefault();return;}
 }
});
document.addEventListener('keyup',e=>{if(e.key===' ')spaceDown=false;});
window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{if(document.hidden){try{localStorage.setItem('factory_lab_v12',compactFactoryJSON());saveCurrentScheme();}catch(e){}}});
try{stampPrefs=JSON.parse(localStorage.getItem('factory_lab_v3_stamp_prefs')||'{}')||{};}catch(e){stampPrefs={};}
let savedLayout=null,storageKey=null;
try{
 // Current compact format takes precedence. Older raw JSON is imported only by old.js.
 storageKey=localStorage.getItem('factory_lab_v12')?'factory_lab_v12':'factory_lab_v2';
 savedLayout=localStorage.getItem(storageKey);
 loadState(savedLayout?JSON.parse(savedLayout):createEmpty());
}catch(err){
 // Keep the original invalid bytes for manual recovery; never overwrite that backup.
 let backedUp=false;
 const backupKey=storageKey+'_incompatible_backup';
 if(savedLayout){try{localStorage.setItem(backupKey,savedLayout);backedUp=true;}catch(e){}}
 loadState(createEmpty());
 notify('原工厂存档无法加载：'+(err.message||err)+
  (backedUp?'；原始 JSON 已备份至 localStorage 键 '+backupKey:'；请检查原始存档'),'warn');
}
initSchemes(!!savedLayout);buildPalette();renderMaterialLegend();updateHint();setTool('select');resize();requestAnimationFrame(stepLoop);
