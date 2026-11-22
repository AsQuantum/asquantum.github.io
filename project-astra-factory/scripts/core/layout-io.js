'use strict';

async function exportLayoutJson(){
 let content;
 try{content=compactFactoryJSON();}catch(err){notify('JSON 导出失败：'+err.message,'bad');return;}
 const base=String(state.name||'factory_lab_layout').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').trim()||'factory_lab_layout';
 const suggestedName=base.toLowerCase().endsWith('.json')?base:base+'.json';
 if(typeof window.showSaveFilePicker==='function'){
  let handle;
  try{
   handle=await window.showSaveFilePicker({suggestedName,types:[{description:'JSON \u5e03\u5c40\u6587\u4ef6',accept:{'application/json':['.json']}}]});
  }catch(err){
   if(err&&err.name==='AbortError')return;
   notify('\u65e0\u6cd5\u6253\u5f00\u7cfb\u7edf\u53e6\u5b58\u4e3a\uff0c\u6539\u7528\u6d4f\u89c8\u5668\u4e0b\u8f7d\uff1a'+(err.message||String(err)),'warn');
  }
  if(handle){
   try{
    const stream=await handle.createWritable();
    await stream.write(content);
    await stream.close();
    notify('\u5df2\u4fdd\u5b58\u5e03\u5c40 JSON\uff1a'+handle.name,'good');
   }catch(err){
    notify('\u5bfc\u51fa JSON \u5931\u8d25\uff1a'+(err.message||String(err)),'bad');
   }
   return;
  }
 }
 const chosen=window.prompt('\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u7cfb\u7edf\u53e6\u5b58\u4e3a\u3002\u8bf7\u8f93\u5165\u6587\u4ef6\u540d\uff08\u76ee\u5f55\u7531\u6d4f\u89c8\u5668\u4e0b\u8f7d\u8bbe\u7f6e\u51b3\u5b9a\uff09\uff1a',suggestedName);
 if(chosen===null)return;
 const clean=chosen.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'');
 if(!clean){notify('\u6587\u4ef6\u540d\u4e0d\u80fd\u4e3a\u7a7a','bad');return;}
 const filename=clean.toLowerCase().endsWith('.json')?clean:clean+'.json';
 download(filename,content,'application/json');
 notify('\u5df2\u8bf7\u6c42\u4e0b\u8f7d JSON\uff1a'+filename,'good');
}

function download(filename,content,mime){const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function loadState(v){
 // v12 is decoded only by the current codec; old formats are isolated in old.js.
 // A malformed input throws before touching the currently loaded layout.
 const compact=v?.format===FACTORY_JSON_FORMAT;
 const result=compact?{layout:expandCompactFactoryLayout(v),repair:{renamed:0,ambiguous:0}}:expandOldFactoryLayout(v);
 const {layout,repair}=result;
 state=layout;
 idSeed=Math.max(900,...layout.machines.concat(layout.routes).map(e=>{
  const match=String(e.id||'').match(/(\d+)$/);
  return match?Number(match[1]):0;
 }));
 selection=null;draft=null;clearGroupSelection();undoStack=[];redoStack=[];
 afterChange('已加载 '+state.name+(repair.renamed?'，已修复'+repair.renamed+'个重复机器ID':'')+
  (repair.ambiguous?'，移除'+repair.ambiguous+'条无法判定归属的旧线路':''));
}
function createEmpty(){return {name:'空白工厂',machines:[],routes:[]}}
