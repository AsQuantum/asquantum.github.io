'use strict';
function ast1ShowPanel(mode,value=''){
 $('ast1Panel').style.display='block';$('ast1Text').value=value;
 $('ast1PanelTitle').textContent=mode==='import'?'粘贴游戏 AST1 蓝图':'复制游戏 AST1 蓝图';
 $('ast1Apply').style.display=mode==='import'?'':'none';
 $('ast1PanelHint').textContent=mode==='import'?'导入会替换当前布局，请先导出备份':'可复制后在游戏的「复制/导入」栏粘贴';
 $('ast1PanelStatus').textContent=mode==='import'?'':'已生成 '+value.length+' 字符';
 $('ast1Text').focus();if(mode==='export')$('ast1Text').select();
}
$('importAst1').onclick=()=>ast1ShowPanel('import');
$('exportAst1').onclick=()=>{
 try{const code=ast1Encode();ast1ShowPanel('export',code);}
 catch(e){importFeedback('蓝图导出失败：'+e.message,true);}
};
$('ast1Close').onclick=()=>$('ast1Panel').style.display='none';
$('ast1Apply').onclick=()=>{
 try{
  const v=ast1Decode($('ast1Text').value);
  loadState(v);autoFit();$('ast1Panel').style.display='none';
  const w=warnings();importFeedback(`已导入 ${v.machines.length}台机器、${v.routes.length}条线路。HTML线路错误 ${w.invalid.length}；被挡接口 ${w.blocked.length}。`,!!(w.invalid.length||w.blocked.length));
 }catch(e){$('ast1PanelStatus').textContent='导入失败：'+e.message;importFeedback('AST1 解析失败：'+e.message+'；原地图不变',true);}
};
$('ast1Copy').onclick=async()=>{
 const b=$('ast1Text');b.focus();b.select();
 try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(b.value);else document.execCommand('copy');$('ast1PanelStatus').textContent='已复制 '+b.value.length+' 字符';}
 catch(e){$('ast1PanelStatus').textContent='请按 Ctrl+C 复制已选中的内容';}
};

$('loadJson').onclick=()=>$('file').click();$('file').onchange=async e=>{let file=e.target.files[0];if(!file)return;
 try{
  let input;try{input=JSON.parse(await file.text())}catch(e){throw Error('文件内容不是有效 JSON：'+e.message)}
  loadState(input);autoFit();
  importFeedback(`已导入 ${file.name}：${state.machines.length}台设备、${state.routes.length}条传送线路。`,false);
  notify('已从文件导入布局','good');
 }catch(err){
  importFeedback(`无法导入 ${file.name}：${err.message} 当前地图保持不变。`,true);
  notify('导入失败：'+err.message,'bad');
 }finally{e.target.value='';}
};
