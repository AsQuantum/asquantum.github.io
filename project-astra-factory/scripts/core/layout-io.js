'use strict';

async function exportLayoutJson(){
 const content=JSON.stringify({...state,version:11,map:{width:72,height:72,centerReserved:{x:29,y:29,width:14,height:14}},description:'Factory Lab \u00b7 72x72 center 14x14 reserved'},null,2);
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
// Fix old exports where the editor restarted the id counter at 900 and reused IDs.
// Recalculate the counter from imported IDs, then give each duplicate a new unique ID.
// If a legacy route references a duplicate, resolve it by its actual belt endpoint cell.
function repairImportedIdentifiers(layout){
 const all=[...layout.machines.map(m=>m.id),...layout.routes.map(r=>r.id)];
 idSeed=Math.max(900,...all.map(id=>/^\D+(\d+)$/.test(String(id))?Number(String(id).match(/(\d+)$/)[1]):0));
 const groups=new Map();
 for(const m of layout.machines){const key=String(m.id??'');const old=groups.get(key)||[];old.push(m);groups.set(key,old);}
 const seen=new Set();let renamed=0,ambiguous=0;
 for(const m of layout.machines){
  const key=String(m.id??'');
  if(!key||seen.has(key)){m.id='m'+(++idSeed);renamed++;}
  seen.add(m.id);
 }
 for(const r of layout.routes){
  for(const kind of ['from','to']){
   if(!r[kind])continue;
   const candidates=groups.get(String(r[kind].id))||[];
   if(candidates.length<2)continue;
   const actualCell=kind==='from'?r.path?.[0]:r.path?.[r.path.length-1];
   const matching=candidates.filter(m=>{const p=kind==='from'?outPort(m,r[kind].port):inPort(m,r[kind].port);return p&&actualCell&&p.ex===actualCell[0]&&p.ey===actualCell[1];});
   if(matching.length===1)r[kind].id=matching[0].id;
   else {r.invalidLegacyReference=true;ambiguous++;}
  }
 }
 // Old ambiguous routes cannot be trusted to point to the intended machine.
 layout.routes=layout.routes.filter(r=>!r.invalidLegacyReference);
 const routeIds=new Set();
 for(const r of layout.routes){if(!r.id||routeIds.has(r.id))r.id='r'+(++idSeed);routeIds.add(r.id);}
 return {renamed,ambiguous};
}
function unwrapLayoutJSON(v){
 if(v&&Array.isArray(v.machines)&&Array.isArray(v.routes))return v;
 if(v?.layout&&Array.isArray(v.layout.machines)&&Array.isArray(v.layout.routes))return v.layout;
 if(v?.goal&&Array.isArray(v.per_material_flow))throw Error('此文件是产能蓝图，不含机器坐标和传送带；请导入 factory_lab_layout_v10_importable.json 等布局文件。');
 if(v?.warehouse_net_possible||v?.solo_max||v?.port_bottlenecks)throw Error('此文件是流量校验报告，不是工厂地图。请选择包含 machines 和 routes 的布局 JSON。');
 throw Error('文件不是工厂布局 JSON：根对象必须包含 machines（机器数组）和 routes（线路数组）。');
}
function loadState(v){
 // Validate and repair a COPY first. A failed import must not overwrite current work.
 const source=unwrapLayoutJSON(v);
 const incoming={name:source.name||'导入的工厂布局',machines:copy(source.machines),routes:copy(source.routes)};
  // Convert older unmirrored AST1 autosaves exactly once, including route tiles.
  if(incoming.machines.some(m=>m.ast1Meta?.record&&!m.ast1Mirrored)){
   for(const m of incoming.machines){
    m.x=AST1_GRID_WIDTH-m.x-dims(m)[0];
    m.face=ast1MirrorFace(m.face||'E');
    m.ast1Mirrored=true;
   }
   for(const r of incoming.routes)r.path=r.path.map(p=>[AST1_GRID_WIDTH-1-p[0],p[1]]);
  }
 const oldSeed=idSeed;
 let repair;
 try{
  for(const [i,m] of incoming.machines.entries()){
   if(m?.type==='AST1未知16')m.type='空间锚点';
   if(!m||!DEF[m.type])throw Error(`第${i+1}台机器的类型无法识别：${m?.type??'缺失'}`);
   if(!Number.isInteger(m.x)||!Number.isInteger(m.y))throw Error(`第${i+1}台机器缺少有效的格子坐标 x/y`);
   m.face=m.face||'E';if(!V[m.face])throw Error(`第${i+1}台机器朝向错误：${m.face}`);
   m.mode=m.mode||Object.keys(DEF[m.type].recipes||{})[0]||'';
    // Repair old AST1 imports whose furnace/assembler recipe mapping was incorrect.
    // Preserve deliberate user edits when mode differs from originalMode.
    if(m.ast1Meta?.record&&typeof AST1_MODE!=='undefined'){
     const corrected=AST1_MODE[m.type]?.[m.ast1Meta.record[5]];
     if(corrected&&m.mode===m.ast1Meta.originalMode){m.mode=corrected;m.ast1Meta.originalMode=corrected;}
    }
   m.item=m.item||'钛合金锭';delete m.level;
    if(m.type==='仓入'&&m.inletItem===undefined){
     const raw=m.ast1Meta?.record;
     const id=raw?.[0]===10&&raw[6]===1?(raw[7]|(raw[8]<<8)):0;
     m.inletItem=id?(AST1_ITEMS[id]||('未识别游戏物品 #'+id)):'';
     if(m.ast1Meta)m.ast1Meta.originalInletItem=m.inletItem;
    }
     // Restore original game item IDs after correcting the coil/wafer ID map.
     if(m.type==='仓出'&&m.ast1Meta?.record?.[6]===1){
      const meta=m.ast1Meta,id=meta.record[7]|(meta.record[8]<<8);
      const item=AST1_ITEMS[id];
      if(item&&m.item===meta.originalItem){m.item=item;meta.originalItem=item;}
     }
     if(m.type==='仓入'&&m.ast1Meta?.record?.[6]===1){
      const meta=m.ast1Meta,id=meta.record[7]|(meta.record[8]<<8);
      const item=AST1_ITEMS[id];
      if(item&&m.inletItem===meta.originalInletItem){m.inletItem=item;meta.originalInletItem=item;}
     }
     // Reconstruct untouched AST1 filters from the binary record using visible relative directions.
     if(m.type==='分流'&&m.ast1Meta?.record?.[0]===8){
      const meta=m.ast1Meta,raw=meta.record;
      if(meta.originalOutFilters===JSON.stringify(m.outFilters||{})){
       const fixed={};
       if(raw[6]===3)for(let gp=0;gp<3;gp++){
        const id=raw[7+gp*2]|(raw[8+gp*2]<<8);
        if(id)fixed[ast1FilterPortFromGame(m,gp)]=AST1_ITEMS[id]||('未识别游戏物品 #'+id);
       }
       m.outFilters=fixed;meta.originalOutFilters=JSON.stringify(fixed);
      }
      meta.filterOrderVersion=3;
     }
  }
  for(const [i,r] of incoming.routes.entries()){
   if(!r||!r.from?.id||!r.to?.id||!Array.isArray(r.path)||!r.path.length||r.path.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)))
    throw Error(`第${i+1}条线路数据不完整（需要 from、to、path 坐标数组）`);
  }
  repair=repairImportedIdentifiers(incoming);
 }catch(err){idSeed=oldSeed;throw err;}
 state=incoming;
 selection=null;draft=null;clearGroupSelection();undoStack=[];redoStack=[];resetSimulation();
 afterChange('已加载 '+state.name+(repair.renamed?`，已修复${repair.renamed}个重复机器ID`:``)+(repair.ambiguous?`，移除${repair.ambiguous}条无法判定归属的旧线路`:``));
}
function createEmpty(){return {name:'空白工厂',machines:[],routes:[]}}
