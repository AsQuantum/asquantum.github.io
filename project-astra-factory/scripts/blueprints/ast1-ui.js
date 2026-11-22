'use strict';
let ast1ImportOverwrite=false;
function ast1ShowPanel(mode,value='',overwrite=false){
 ast1ImportOverwrite=mode==='import'&&!!overwrite;
 $('ast1Panel').style.display='block';$('ast1Text').value=value;
 $('ast1Text').readOnly=mode==='export';
 $('ast1Copy').textContent='复制全部蓝图代码';
 $('ast1PanelTitle').textContent=mode==='import'
  ?(ast1ImportOverwrite?'导入 AST1 并覆盖当前方案':'导入 AST1 为新方案')
  :'复制游戏 AST1 蓝图';
 $('ast1Apply').style.display=mode==='import'?'':'none';
 $('ast1Apply').textContent=ast1ImportOverwrite?'确认导入并覆盖':'导入为新方案';
 $('ast1PanelHint').textContent=mode==='import'
  ?(ast1ImportOverwrite?'需要再次确认；仅覆盖当前方案，其他方案不变':'创建独立方案，不覆盖现有方案')
  :'可复制后在游戏的「复制/导入」栏粘贴';
 $('ast1PanelStatus').textContent=mode==='import'?'':'已生成 '+value.length+' 字符';
 // Never focus/select the export textarea on open: iOS may zoom the page
 // and reveal its keyboard. Clipboard writes happen only on a real button tap.
 if(mode==='import'&&!window.matchMedia('(max-width: 900px)').matches)
  $('ast1Text').focus({preventScroll:true});
}
function openAST1Export(){
 try{const code=ast1Encode();ast1ShowPanel('export',code);}
 catch(e){importFeedback('蓝图导出失败：'+e.message,true);}
}
function openAST1Import(overwrite=false){ast1ShowPanel('import','',overwrite);}
$('ast1Close').onclick=()=>$('ast1Panel').style.display='none';
$('ast1Apply').onclick=()=>{
 try{
  const astCode=String($('ast1Text').value).replace(/\s+/g,'');
  const v=ast1Decode(astCode);
  const scheme=ast1ImportOverwrite
   ?importOverwriteScheme(v,{kind:'ast',astCode})
   :importNewScheme(v,{kind:'ast',astCode});
  if(!scheme){$('ast1PanelStatus').textContent='已取消导入并覆盖，原有方案不变';return;}
  $('ast1Panel').style.display='none';
  const w=warnings();
  const verb=ast1ImportOverwrite?'已覆盖当前方案':'已新增方案';
  importFeedback(verb+'「'+scheme.name+'」：'+v.machines.length+'台机器、'+v.routes.length+
   '条线路。HTML线路错误 '+w.invalid.length+'；被挡接口 '+w.blocked.length+'。',!!(w.invalid.length||w.blocked.length));
 }catch(e){$('ast1PanelStatus').textContent='导入失败：'+e.message;importFeedback('AST1 导入失败：'+e.message+'；已有方案保持不变',true);}
};
// Writes plain text into the *system* clipboard. This lets the user paste
// the blueprint with Ctrl+V (desktop) or Paste (phone) in the game or elsewhere.
// Modern Clipboard API works on HTTPS with user activation. On unsupported or
// denied browsers, try the legacy copy command and verify its boolean result.
function ast1LegacyCopy(){
 const field=$('ast1Text');
 try{
  field.focus({preventScroll:true});
  field.select();
  field.setSelectionRange(0,field.value.length);
  const copied=!!document.execCommand('copy');
  if(copied)field.blur();
  return copied;
 }catch(e){return false;}
}
async function ast1WriteClipboard(text){
 if(navigator.clipboard&&typeof navigator.clipboard.writeText==='function'){
  try{
   await navigator.clipboard.writeText(text);
   return true;
  }catch(e){/* Permission/availability error: fall back below. */}
 }
 return ast1LegacyCopy();
}
$('ast1Copy').onclick=async()=>{
 const field=$('ast1Text'),button=$('ast1Copy'),status=$('ast1PanelStatus');
 const code=field.value;
 if(!code){
  status.textContent='当前没有可复制的蓝图代码';
  return;
 }
 button.disabled=true;
 try{
  if(await ast1WriteClipboard(code)){
   button.textContent='✓ 已复制';
   status.textContent='已复制 '+code.length+' 字符到系统剪贴板，可直接粘贴';
  }else{
   button.textContent='复制全部蓝图代码';
   status.textContent='浏览器未允许自动复制；代码已选中，请手动复制（电脑 Ctrl+C／手机长按复制）';
  }
 }finally{button.disabled=false;}
};

function openJSONImport(overwrite=false){
 $('file').dataset.importMode=overwrite?'overwrite':'new';
 $('file').click();
}
$('file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 const overwrite=e.target.dataset.importMode==='overwrite';
 try{
  let input;
  try{input=JSON.parse(await file.text());}catch(err){throw Error('文件内容不是有效 JSON：'+err.message);}
  const scheme=overwrite
   ?importOverwriteScheme(input,{kind:'json',filename:file.name})
   :importNewScheme(input,{kind:'json',filename:file.name});
  if(!scheme){notify('已取消导入并覆盖，当前方案未改动','warn');return;}
  const verb=overwrite?'已覆盖当前方案':'已新增方案';
  importFeedback(verb+'「'+scheme.name+'」（来自 '+file.name+'）：'+state.machines.length+
   '台设备、'+state.routes.length+'条传送线路。',false);
  notify('已从 JSON 文件'+(overwrite?'覆盖当前方案':'新增方案')+'「'+scheme.name+'」','good');
 }catch(err){
  importFeedback('无法导入 '+file.name+'：'+err.message+'。当前方案未被覆盖。',true);
  notify('导入失败：'+err.message,'bad');
 }finally{e.target.value='';e.target.dataset.importMode='new';}
};
