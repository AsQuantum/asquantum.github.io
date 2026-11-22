'use strict';
// File operations live under a compact Photoshop-style Edit > Action > Format menu.
// Import creates a new scheme unless explicitly choosing "Import and overwrite".
const editMenuWrap=$('editMenuWrap'),editMenu=$('editMenu'),editMenuButton=$('editMenuButton');
const editMenuOperations={
 'undo':()=>undo(),
 'redo':()=>redo(),
 'import-json':()=>openJSONImport(false),
 'import-ast':()=>openAST1Import(false),
 'overwrite-json':()=>openJSONImport(true),
 'overwrite-ast':()=>openAST1Import(true),
 'export-json':()=>exportLayoutJson(),
 'export-ast':()=>openAST1Export()
};
const mobileEditMode=()=>window.matchMedia('(max-width: 900px)').matches;
function setEditMenuOpen(open){
 editMenu.hidden=!open;
 editMenuButton.setAttribute('aria-expanded',String(!!open));
 if(open&&mobileEditMode()){
  editMenu.setAttribute('role','dialog');
  editMenu.setAttribute('aria-modal','true');
 }else{
  editMenu.setAttribute('role','menu');
  editMenu.removeAttribute('aria-modal');
 }
 if(!open)editMenu.querySelectorAll('.edit-menu-parent').forEach(p=>{
  p.classList.remove('submenu-open');
  p.querySelector('[data-edit-submenu]').setAttribute('aria-expanded','false');
 });
}
function openEditSubmenu(parent){
 editMenu.querySelectorAll('.edit-menu-parent').forEach(p=>{
  const active=p===parent;
  p.classList.toggle('submenu-open',active);
  p.querySelector('[data-edit-submenu]').setAttribute('aria-expanded',String(active));
 });
}
editMenu.querySelectorAll('.edit-menu-parent').forEach(parent=>{
 parent.addEventListener('pointerenter',()=>{if(!editMenu.hidden&&!mobileEditMode())openEditSubmenu(parent);});
});
editMenuButton.onclick=()=>setEditMenuOpen(editMenu.hidden);
$('mobileEditClose').onclick=()=>{setEditMenuOpen(false);editMenuButton.focus();};
editMenu.onclick=e=>{
 const action=e.target.closest('[data-edit-action]');
 if(action){
  const handler=editMenuOperations[action.dataset.editAction];
  if(!handler)return;
  setEditMenuOpen(false);
  try{handler();}catch(err){importFeedback('操作失败：'+err.message,true);}
  return;
 }
 const trigger=e.target.closest('[data-edit-submenu]');
 if(trigger){
  const group=trigger.closest('.edit-menu-parent');
  if(group.classList.contains('submenu-open')){
   group.classList.remove('submenu-open');
   trigger.setAttribute('aria-expanded','false');
  }else openEditSubmenu(group);
 }
};
editMenuWrap.addEventListener('keydown',e=>{
 if(e.key==='Escape'){
  setEditMenuOpen(false);
  editMenuButton.focus();
  e.preventDefault();e.stopPropagation();
 }else if(e.key==='ArrowDown'&&e.target===editMenuButton){
  setEditMenuOpen(true);
  editMenu.querySelector('[data-edit-submenu]')?.focus();
  e.preventDefault();e.stopPropagation();
 }else if(e.key==='ArrowRight'&&e.target.matches('[data-edit-submenu]')){
  openEditSubmenu(e.target.closest('.edit-menu-parent'));
  e.target.closest('.edit-menu-parent').querySelector('[data-edit-action]')?.focus();
  e.preventDefault();e.stopPropagation();
 }else if(e.key==='ArrowLeft'&&e.target.matches('[data-edit-action]')){
  e.target.closest('.edit-menu-parent').querySelector('[data-edit-submenu]')?.focus();
  e.preventDefault();e.stopPropagation();
 }
});
document.addEventListener('pointerdown',e=>{
 if(!editMenuWrap.contains(e.target))setEditMenuOpen(false);
});
