'use strict';
// Saved schemes are a list of {id, name, ast} or {id, name, json}.
// AST1 is chosen only if its decoded layout preserves the editor's geometry and
// machine settings; otherwise v12 RLE JSON is used, never lossy AST1 conversion.
const SCHEME_STORE='factory_lab_templates_v1';
const SCHEME_ACTIVE_STORE='factory_lab_template_active_v1';
let solverSchemes=[],solverSchemeId=null,solverSchemesReady=false,solverSchemePaused=false;
function currentScheme(){return solverSchemes.find(t=>t.id===solverSchemeId)||null;}
function freshSchemeId(){
 let i=1;const ids=new Set(solverSchemes.map(t=>t.id));
 while(ids.has('scheme'+i))i++;
 return 'scheme'+i;
}
function schemeSaveRegistry(){
 try{
  localStorage.setItem(SCHEME_STORE,JSON.stringify(solverSchemes));
  if(solverSchemeId)localStorage.setItem(SCHEME_ACTIVE_STORE,solverSchemeId);
  else localStorage.removeItem(SCHEME_ACTIVE_STORE);
  return true;
 }catch(e){notify('方案保存失败：'+e.message+'；请导出 JSON 备份','bad');return false;}
}
function schemePortsEqual(a,b){
 const ports=m=>getPorts(m).map(p=>[p.kind,p.index,p.x,p.y,p.ex,p.ey,p.side]);
 return JSON.stringify(ports(a))===JSON.stringify(ports(b));
}
function schemeCanUseAST(src,decoded){
 if(src.machines.length!==decoded.machines.length||src.routes.length!==decoded.routes.length)return false;
 const allowed=new Set(['id','type','x','y','face','mode','item','inletItem',
  'outFilters','filters','ast1Meta','ast1Mirrored','ast1GamePorts','w','h']);
 for(let i=0;i<src.machines.length;i++){
  const a=src.machines[i],b=decoded.machines[i];
  if(a.type!==b.type||a.x!==b.x||a.y!==b.y||(a.face||'E')!==b.face||
    (a.mode??defaultModeFor(a.type))!==(b.mode??defaultModeFor(b.type))||
    !schemePortsEqual(a,b))return false;
  if(Object.entries(a).some(([key,val])=>!allowed.has(key)&&val!==undefined&&val!==null&&val!==''))return false;
  if(a.item!==undefined&&a.type==='仓出'&&a.item!==b.item)return false;
  // A non-warehouse item other than the legacy default, custom filter or label cannot be encoded.
  if(a.item!==undefined&&a.type!=='仓出'&&a.item!=='钛合金锭')return false;
  if(a.inletItem!==undefined&&a.type==='仓入'&&(a.inletItem||'')!==(b.inletItem||''))return false;
  if(a.inletItem!==undefined&&a.type!=='仓入')return false;
  if(a.filters&&Object.values(a.filters).some(Boolean))return false;
  const normalizeFilters=filters=>Object.fromEntries(Object.entries(filters||{})
   .filter(([key,item])=>item&&item!=='任意').sort(([a],[b])=>Number(a)-Number(b)));
  if(JSON.stringify(normalizeFilters(a.outFilters))!==JSON.stringify(normalizeFilters(b.outFilters)))return false;
  if(a.w!==undefined||a.h!==undefined){
   if(JSON.stringify(dims(a))!==JSON.stringify(dims(b)))return false;
  }
 }
 const sourceIndices=new Map(src.machines.map((m,i)=>[m.id,i]));
 for(let i=0;i<src.routes.length;i++){
  const a=src.routes[i],b=decoded.routes[i];
  if(Object.keys(a).some(k=>!['id','from','to','path'].includes(k)))return false;
  if(sourceIndices.get(a.from.id)!==Number(String(b.from.id).slice(5))||
     sourceIndices.get(a.to.id)!==Number(String(b.to.id).slice(5))||
     a.from.port!==b.from.port||a.to.port!==b.to.port||
     JSON.stringify(a.path)!==JSON.stringify(b.path))return false;
 }
 return true;
}
function encodeScheme(layout=state){
 const json=compactFactoryJSON(layout);
 // AST1 uses the live state and cannot encode arbitrary custom attributes.
 if(layout!==state||!layout.machines.length)return {json};
 try{
  const ast=ast1Encode();
  if(ast.length<json.length&&schemeCanUseAST(layout,ast1Decode(ast)))return {ast};
 }catch(e){/* An incomplete or non-AST1 layout remains fully valid in v12 JSON. */}
 return {json};
}
function decodeScheme(t){
 if(typeof t.ast==='string'&&t.ast.startsWith('AST1:'))return ast1Decode(t.ast);
 if(typeof t.json==='string')return JSON.parse(t.json);
 throw Error('方案「'+t.name+'」没有有效布局内容');
}
function saveCurrentScheme(){
 if(!solverSchemesReady||solverSchemePaused)return;
 const t=currentScheme();if(!t)return;
 try{
  const value=encodeScheme();
  delete t.ast;delete t.json;
  Object.assign(t,value);
  schemeSaveRegistry();
 }catch(e){notify('自动保存方案失败：'+e.message+'；请导出 JSON 备份','bad');}
}
function setSchemeMenuOpen(open){
 const panel=$('presetList');
 panel.hidden=!open;
 $('preset').setAttribute('aria-expanded',String(!!open));
 $('presetName').setAttribute('aria-expanded',String(!!open));
}
function renderSchemeSelector(){
 const menu=$('presetList');
 menu.innerHTML=solverSchemes.map(t=>`<div class="preset-row ${t.id===solverSchemeId?'is-active':''}" role="none">
  <button type="button" class="preset-row-choice" role="menuitemradio" aria-checked="${t.id===solverSchemeId}" data-choose-scheme="${esc(t.id)}" title="${esc(t.name)}">
   <span class="preset-row-check" aria-hidden="true">${t.id===solverSchemeId?'✓':''}</span><span class="preset-row-name">${esc(t.name)}</span>
  </button>
  <button type="button" class="preset-row-delete" data-remove-scheme="${esc(t.id)}" title="删除：${esc(t.name)}" aria-label="删除方案：${esc(t.name)}">×</button>
 </div>`).join('')+
 '<button type="button" class="preset-new" role="menuitem" data-create-scheme>＋ 新建方案</button>';
 const current=currentScheme();
 $('presetName').value=current?.name||'';
 $('presetName').disabled=!current;
}
function activateScheme(id,fit=true){
 const next=solverSchemes.find(t=>t.id===id);
 if(!next)throw Error('未找到方案：'+id);
 const previous=solverSchemeId;
 const parsed=decodeScheme(next);
 // Validate while preserving the previous scheme's saved content.
 solverSchemePaused=true;
 try{
  solverSchemeId=id;
  loadState(parsed);
  state.name=next.name;
  try{localStorage.setItem('factory_lab_v12',compactFactoryJSON());}catch(e){}
  schemeSaveRegistry();
  renderSchemeSelector();
  if(fit)autoFit();
 }catch(err){
  solverSchemeId=previous;
  renderSchemeSelector();
  throw err;
 }finally{solverSchemePaused=false;}
}
function addScheme(name){
 saveCurrentScheme();
 const t={id:freshSchemeId(),name,json:compactFactoryJSON({...createEmpty(),name})};
 solverSchemes.push(t);
 schemeSaveRegistry();
 activateScheme(t.id);
 return t;
}
// Imports always create an independent scheme. The active scheme is saved first;
// validation happens before a new entry is created, so failed imports change nothing.
const IMPORT_SCHEME_NAME_MAX=24;
function nextSchemeName(prefix){
 let n=1;
 const names=new Set(solverSchemes.map(t=>t.name));
 while(names.has(prefix+n))n++;
 return prefix+n;
}
function uniqueSchemeName(name){
 const names=new Set(solverSchemes.map(t=>t.name));
 if(!names.has(name))return name;
 let n=2;
 while(names.has(name+' ('+n+')'))n++;
 return name+' ('+n+')';
}
function jsonImportedSchemeName(input,filename){
 const declared=input?.name??input?.layout?.name;
 const fallback=String(filename||'').replace(/\.json$/i,'');
 const candidate=(typeof declared==='string'&&declared.trim()?declared:fallback).trim();
 if(!candidate||[...candidate].length>IMPORT_SCHEME_NAME_MAX)
  return nextSchemeName('外部方案');
 return uniqueSchemeName(candidate);
}
function importNewScheme(input,{kind='json',filename='',astCode=''}={}){
 if(!solverSchemesReady)throw Error('方案管理器尚未初始化');
 const previousSeed=idSeed;
 let entry;
 try{
  if(kind==='ast'){
   if(typeof astCode!=='string'||!astCode.startsWith('AST1:'))throw Error('缺少有效 AST1 蓝图');
   // The caller already decoded it; parse the stored representation again
   // before touching the scheme registry to guarantee it is recoverable.
   const parsed=ast1Decode(astCode);
   if(!Array.isArray(parsed.machines)||!Array.isArray(parsed.routes))throw Error('AST1 线路或机器数据无效');
   entry={id:freshSchemeId(),name:nextSchemeName('游戏蓝图'),ast:astCode};
  }else if(kind==='json'){
   const parsed=input?.format===FACTORY_JSON_FORMAT
    ?expandCompactFactoryLayout(input)
    :expandOldFactoryLayout(input).layout;
   const json=compactFactoryJSON(parsed);
   entry={id:freshSchemeId(),name:jsonImportedSchemeName(input,filename),json};
  }else throw Error('不支持的导入格式：'+kind);
 }finally{
  // Legacy JSON repair may temporarily allocate IDs while validating.
  idSeed=previousSeed;
 }
 saveCurrentScheme();
 const priorId=solverSchemeId;
 solverSchemes.push(entry);
 try{
  // Keep the existing scheme completely separate during loadState/afterChange.
  activateScheme(entry.id,false);
 }catch(err){
  solverSchemes.pop();
  solverSchemeId=priorId;
  renderSchemeSelector();
  throw err;
 }
 // Imported AST1 is stored as AST1; imported JSON was normalized into compact v12.
 try{autoFit();}catch(e){/* The validated imported scheme still exists. */}
 return entry;
}
// Explicit overwrite replaces only the selected scheme. Importing without
// overwrite still calls importNewScheme and always creates a separate scheme.
function importOverwriteScheme(input,{kind='json',astCode=''}={}){
 if(!solverSchemesReady||!currentScheme())throw Error('没有可覆盖的当前方案');
 const target=currentScheme();
 const oldSeed=idSeed;
 let parsed;
 try{
  if(kind==='ast'){
   if(typeof astCode!=='string'||!astCode.startsWith('AST1:'))throw Error('缺少有效 AST1 蓝图');
   parsed=ast1Decode(astCode);
  }else if(kind==='json'){
   parsed=input?.format===FACTORY_JSON_FORMAT
    ?expandCompactFactoryLayout(input):expandOldFactoryLayout(input).layout;
  }else throw Error('不支持的导入格式：'+kind);
  // Full strict v12 encode check before asking to overwrite; no partial imports.
  compactFactoryJSON(parsed);
 }finally{idSeed=oldSeed;}
 if(!confirm('导入并覆盖当前方案「'+target.name+'」？\n当前机器和线路将被替换，无法通过撤销恢复。其他方案不受影响。'))return null;
 saveCurrentScheme();
 const preserved=copy(state);
 const previousSchemeId=solverSchemeId;
 const previousName=target.name;
 const loaded={...parsed,name:previousName};
 solverSchemePaused=true;
 try{
  loadState(loaded);
  state.name=previousName;
 }catch(err){
  // loadState normally validates before changing state; restore the workspace
  // if a later rendering/storage failure occurs.
  state=preserved;solverSchemeId=previousSchemeId;
  throw err;
 }finally{solverSchemePaused=false;}
 saveCurrentScheme();
 renderSchemeSelector();
 autoFit();
 return target;
}
function removeScheme(id){
 const t=solverSchemes.find(entry=>entry.id===id);
 if(!t)return false;
 if(!confirm('确定删除方案「'+t.name+'」？删除后无法撤销。'))return false;
 const previous=solverSchemes.slice(),previousActive=solverSchemeId;
 const index=solverSchemes.indexOf(t),wasActive=t.id===solverSchemeId;
 solverSchemes.splice(index,1);
 if(!solverSchemes.length){
  const name='新方案 1';
  solverSchemes.push({id:freshSchemeId(),name,json:compactFactoryJSON({...createEmpty(),name})});
 }
 try{
  if(wasActive){
   const fallback=solverSchemes[Math.min(index,solverSchemes.length-1)];
   activateScheme(fallback.id);
  }else{
   schemeSaveRegistry();
   renderSchemeSelector();
  }
 }catch(err){
  solverSchemes=previous;
  solverSchemeId=previousActive;
  renderSchemeSelector();
  notify('删除方案失败：'+err.message,'bad');
  return false;
 }
 notify('已删除方案「'+t.name+'」','good');
 return true;
}
function renameCurrentScheme(text){
 const t=currentScheme();if(!t)return;
 const name=String(text||'').trim().slice(0,64);
 if(!name){$('presetName').value=t.name;return;}
 t.name=name;
 state.name=name;
 const row=[...$('presetList').querySelectorAll('[data-choose-scheme]')]
  .find(btn=>btn.dataset.chooseScheme===t.id);
 if(row){
  row.querySelector('.preset-row-name').textContent=name;
  row.title=name;
  const del=row.parentElement.querySelector('[data-remove-scheme]');
  if(del){del.title='删除：'+name;del.setAttribute('aria-label','删除方案：'+name);}
 }
 schemeSaveRegistry();
 // Also update the current workspace cache without resetting simulation.
 try{localStorage.setItem('factory_lab_v12',compactFactoryJSON());}catch(e){}
}
function initSchemes(hadSavedWorkspace=false){
 let stored=null,loaded=false;
 try{
  const raw=localStorage.getItem(SCHEME_STORE);
  if(raw!==null){
   stored=JSON.parse(raw);
   if(!Array.isArray(stored))throw Error('方案列表不是数组');
   if(stored.some(t=>!t||typeof t.id!=='string'||typeof t.name!=='string'||
      (typeof t.ast!=='string'&&typeof t.json!=='string'))||new Set(stored.map(t=>t.id)).size!==stored.length)
    throw Error('方案列表包含无效内容');
   loaded=true;
  }
 }catch(e){notify('已保存的方案列表读取失败：'+e.message+'（原始数据没有覆盖）','bad');return;}
 solverSchemes=loaded?stored:[{
  id:'builtin-warp',name:'曲速线圈 · 49条线路',
  json:compactFactoryJSON(window.FACTORY_WARP_PRESET)
 }];
 solverSchemesReady=true;
 if(!loaded&&hadSavedWorkspace&&state.machines.length){
  const name=state.name||'原有工作区';
  solverSchemes.push({id:freshSchemeId(),name,...encodeScheme()});
  solverSchemeId=solverSchemes.at(-1).id;
  schemeSaveRegistry();
  renderSchemeSelector();
  return;
 }
 if(!solverSchemes.length){
  // All templates were intentionally deleted previously; do not resurrect default.
  const name='新方案 1';
  solverSchemes.push({id:freshSchemeId(),name,json:compactFactoryJSON({...createEmpty(),name})});
 }
 const storedActive=loaded?localStorage.getItem(SCHEME_ACTIVE_STORE):null;
 const preferred=solverSchemes.some(t=>t.id===storedActive)?storedActive:solverSchemes[0].id;
 try{activateScheme(preferred,!hadSavedWorkspace);}
 catch(e){notify('无法加载方案：'+e.message+'；已保留当前工作区','bad');renderSchemeSelector();}
}
// One control: click/focus the editable text field to show scheme history,
// or click the arrow to toggle the same list.
$('presetName').addEventListener('focus',()=>setSchemeMenuOpen(true));
$('presetName').addEventListener('click',()=>setSchemeMenuOpen(true));
$('preset').onclick=()=>setSchemeMenuOpen($('presetList').hidden);
$('presetList').addEventListener('click',e=>{
 const remove=e.target.closest('[data-remove-scheme]');
 if(remove){
  e.stopPropagation();
  removeScheme(remove.dataset.removeScheme);
  return;
 }
 const choose=e.target.closest('[data-choose-scheme]');
 if(choose){
  try{
   if(choose.dataset.chooseScheme!==solverSchemeId){
    saveCurrentScheme();activateScheme(choose.dataset.chooseScheme);
   }
   setSchemeMenuOpen(false);
   $('preset').focus();
  }catch(err){notify('切换方案失败：'+err.message,'bad');renderSchemeSelector();}
  return;
 }
 if(e.target.closest('[data-create-scheme]')){
  try{
   const n=solverSchemes.filter(t=>t.name.startsWith('新方案 ')).length+1;
   const t=addScheme('新方案 '+n);
   setSchemeMenuOpen(false);
   $('preset').focus();
   notify('已新建方案「'+t.name+'」，后续机器和线路改动自动保存','good');
  }catch(err){notify('新建方案失败：'+err.message,'bad');renderSchemeSelector();}
 }
});
$('presetDropdown').addEventListener('keydown',e=>{
 if(e.key==='Escape'){
  // Esc closes the popup without changing the saved name or editor selection.
  if(e.target===$('presetName'))$('presetName').value=currentScheme()?.name||'';
  setSchemeMenuOpen(false);
  if(e.target!==$('presetName'))$('preset').focus();
  e.preventDefault();e.stopPropagation();
 }else if(e.key==='ArrowDown'&&e.target===$('presetName')){
  setSchemeMenuOpen(true);
  $('presetList').querySelector('[data-choose-scheme][aria-checked="true"]')?.focus();
  e.preventDefault();e.stopPropagation();
 }else if(e.key==='Enter'&&e.target===$('presetName')){
  renameCurrentScheme($('presetName').value);
  setSchemeMenuOpen(false);
  e.preventDefault();e.stopPropagation();
 }
});
document.addEventListener('pointerdown',e=>{
 if(!$('presetDropdown').contains(e.target))setSchemeMenuOpen(false);
});
$('presetName').addEventListener('change',e=>renameCurrentScheme(e.target.value));
