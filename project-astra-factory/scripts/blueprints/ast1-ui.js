'use strict';
let ast1ImportOverwrite=false;
function ast1ShowPanel(mode,value='',overwrite=false){
 ast1ImportOverwrite=mode==='import'&&!!overwrite;
 $('ast1Panel').style.display='block';$('ast1Text').value=value;
 $('ast1PanelTitle').textContent=mode==='import'
  ?(ast1ImportOverwrite?'导入 AST1 并覆盖当前方案':'导入 AST1 为新方案')
  :'复制游戏 AST1 蓝图';
 $('ast1Apply').style.display=mode==='import'?'':'none';
 $('ast1Apply').textContent=ast1ImportOverwrite?'确认导入并覆盖':'导入为新方案';
 $('ast1PanelHint').textContent=mode==='import'
  ?(ast1ImportOverwrite?'需要再次确认；仅覆盖当前方案，其他方案不变':'创建独立方案，不覆盖现有方案')
  :'可复制后在游戏的「复制/导入」栏粘贴';
 $('ast1PanelStatus').textContent=mode==='import'?'':'已生成 '+value.length+' 字符';
 $('ast1Text').focus();if(mode==='export')$('ast1Text').select();
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
$('ast1Copy').onclick=async()=>{
 const b=$('ast1Text');b.focus();b.select();
 try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(b.value);else document.execCommand('copy');$('ast1PanelStatus').textContent='已复制 '+b.value.length+' 字符';}
 catch(e){$('ast1PanelStatus').textContent='请按 Ctrl+C 复制已选中的内容';}
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
