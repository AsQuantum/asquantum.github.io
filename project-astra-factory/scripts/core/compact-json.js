'use strict';
// Factory Lab JSON v12: compact, versioned, independent of the AST1 binary format.
// Machine and item types use AST1 IDs; internal instance IDs are recreated from
// machine indices, just as AST1 line endpoints refer to machine indices.
const FACTORY_JSON_VERSION=12;
const FACTORY_JSON_FORMAT='factory-lab';
const FACTORY_JSON_FACES=['E','N','W','S'];
const FACTORY_JSON_STEPS=[[1,0],[0,1],[-1,0],[0,-1]]; // E, S, W, N
const FACTORY_JSON_BASE_MACHINE=new Set(['id','type','x','y','face','mode']);
const FACTORY_JSON_BASE_ROUTE=new Set(['id','from','to','path']);
const FACTORY_JSON_DANGEROUS=new Set(['__proto__','prototype','constructor']);
function compactItem(value){
 return typeof value==='string'&&AST1_ITEM_IDS[value]!==undefined?AST1_ITEM_IDS[value]:value;
}
function expandItem(value){
 if(typeof value!=='number')return value;
 if(!Number.isInteger(value)||!AST1_ITEMS[value])throw Error('JSON 物品 ID 不存在：'+value);
 return AST1_ITEMS[value];
}
function compactOptionalFields(obj,skip){
 const extras={};
 for(const [key,value] of Object.entries(obj)){
  if(skip.has(key)||value===undefined||FACTORY_JSON_DANGEROUS.has(key))continue;
  if(key==='item'||key==='inletItem')extras[key]=compactItem(value);
  else if((key==='filters'||key==='outFilters')&&value&&typeof value==='object'){
   extras[key]=Object.fromEntries(Object.entries(value).map(([port,item])=>[port,compactItem(item)]));
  }else extras[key]=value;
 }
 return Object.keys(extras).length?extras:null;
}
function expandOptionalFields(extra,skip){
 if(extra===undefined||extra===null)return {};
 if(!extra||Array.isArray(extra)||typeof extra!=='object')throw Error('JSON 额外属性格式错误');
 const out={};
 for(const [key,value] of Object.entries(extra)){
  if(skip.has(key)||FACTORY_JSON_DANGEROUS.has(key))throw Error('JSON 包含非法额外字段：'+key);
  if(key==='item'||key==='inletItem')out[key]=expandItem(value);
  else if(key==='filters'||key==='outFilters'){
   if(value===null){out[key]=null;continue;}
   if(!value||Array.isArray(value)||typeof value!=='object')throw Error('JSON 接口过滤器格式错误');
   out[key]=Object.fromEntries(Object.entries(value).map(([port,item])=>[port,expandItem(item)]));
  }else out[key]=value;
 }
 return out;
}
function compactModeId(m){
 const choices=AST1_MODE[m.type],value=m.mode===undefined||m.mode===null||m.mode===''?defaultModeFor(m.type):parseRecipeMode(m.type,m.mode);
 if(choices){
  const id=choices.indexOf(value);
  if(id<0)throw Error('设备 '+m.id+' 的配方无 AST1 数字编号：'+String(value));
  return id;
 }
 if(DEF[m.type].recipes&&!Object.prototype.hasOwnProperty.call(DEF[m.type].recipes,value))
  throw Error('设备 '+m.id+' 的配方无效：'+String(value));
 return 0;
}
function expandModeId(type,id){
 if(!Number.isInteger(id)||id<0)throw Error('JSON 配方 ID 必须为非负整数');
 const choices=AST1_MODE[type];
 if(choices){
  if(id>=choices.length)throw Error(type+' 的配方 ID 不存在：'+id);
  return choices[id];
 }
 if(id!==0)throw Error(type+' 不支持配方编号 '+id);
 return defaultModeFor(type);
}
function packRouteRuns(path){
 if(!Array.isArray(path)||!path.length)throw Error('不能保存空传送带路径');
 const start=path[0];
 if(!Array.isArray(start)||start.length!==2||!start.every(Number.isInteger))throw Error('线路起点必须为整数坐标');
 const runs=[];let prev=start;
 for(let i=1;i<path.length;i++){
  const cur=path[i];
  if(!Array.isArray(cur)||cur.length!==2||!cur.every(Number.isInteger))throw Error('线路包含非整数坐标');
  const dx=cur[0]-prev[0],dy=cur[1]-prev[1];
  const direction=FACTORY_JSON_STEPS.findIndex(([x,y])=>x===dx&&y===dy);
  if(direction<0){
   // Old invalid/teleporting paths can still be saved exactly; never drop cells.
   runs.push([4,cur[0],cur[1]]);
  }else if(runs.length&&runs[runs.length-1][0]===direction){
   runs[runs.length-1][1]++;
  }else runs.push([direction,1]);
  prev=cur;
 }
 return [start.slice(),runs];
}
function unpackRouteRuns(start,runs){
 if(!Array.isArray(start)||start.length!==2||!start.every(Number.isInteger)||
    !Array.isArray(runs)||runs.length>10000)throw Error('JSON 线路压缩路径头格式错误');
 const path=[start.slice()];
 for(const run of runs){
  if(!Array.isArray(run))throw Error('JSON 线路段不是数组');
  if(run[0]===4){
   if(run.length!==3||!Number.isInteger(run[1])||!Number.isInteger(run[2]))throw Error('JSON 跳点格式错误');
   path.push([run[1],run[2]]);
  }else{
   const d=run[0],count=run[1];
   if(run.length!==2||!Number.isInteger(d)||d<0||d>3||!Number.isInteger(count)||count<1||count>10000)
    throw Error('JSON 线路方向或长度无效');
   const step=FACTORY_JSON_STEPS[d];
   for(let i=0;i<count;i++){
    const [x,y]=path[path.length-1];
    path.push([x+step[0],y+step[1]]);
   }
  }
  if(path.length>10000)throw Error('JSON 单条线路超过10000格，拒绝展开');
 }
 return path;
}
function compactFactoryLayout(layout=state){
 if(!layout||!Array.isArray(layout.machines)||!Array.isArray(layout.routes))throw Error('布局缺少机器或线路数组');
 const indices=new Map();
 const machines=layout.machines.map((m,index)=>{
  if(!m||!Number.isInteger(m.x)||!Number.isInteger(m.y))throw Error('第'+index+'台设备坐标无效');
  if(indices.has(m.id))throw Error('布局存在重复机器 ID：'+m.id);
  indices.set(m.id,index);
  const typeId=AST1_ID_BY_TYPE[m.type],face=FACTORY_JSON_FACES.indexOf(m.face||'E');
  if(typeId===undefined||face<0)throw Error('无法编码设备 '+m.id+' 的类型或方向');
  const row=[typeId,m.x,m.y,face,compactModeId(m)];
  const extra=compactOptionalFields(m,FACTORY_JSON_BASE_MACHINE);
  if(extra)row.push(extra);
  return row;
 });
 const routes=layout.routes.map((r,index)=>{
  const from=indices.get(r?.from?.id),to=r?.to===null?-1:indices.get(r?.to?.id);
  if(r?.to&&r.from?.id===r.to.id)throw Error('JSON 不能将机器输出口连接到自身输入口');
  if(from===undefined||to===undefined)throw Error('第'+index+'条线路引用了不存在的机器');
  if(!Number.isInteger(r.from.port)||r.from.port<0||(to!==-1&&(!Number.isInteger(r.to.port)||r.to.port<0)))
   throw Error('第'+index+'条线路接口编号无效');
  const [start,runs]=packRouteRuns(r.path);
  const row=[from,r.from.port,to,to===-1?0:r.to.port,start,runs];
  const extra=compactOptionalFields(r,FACTORY_JSON_BASE_ROUTE);
  if(extra)row.push(extra);
  return row;
 });
 return {format:FACTORY_JSON_FORMAT,version:FACTORY_JSON_VERSION,name:layout.name||'工厂布局',machines,routes};
}
function expandCompactFactoryLayout(source){
 if(!source||source.format!==FACTORY_JSON_FORMAT||source.version!==FACTORY_JSON_VERSION)
  throw Error('不支持的 Factory Lab JSON 格式版本：'+source?.version);
 if(!Array.isArray(source.machines)||!Array.isArray(source.routes)||
    source.machines.length>10000||source.routes.length>20000)throw Error('JSON 机器/线路数组错误或过长');
 const machines=source.machines.map((row,i)=>{
  if(!Array.isArray(row)||(row.length!==5&&row.length!==6))throw Error('JSON 第'+i+'台机器数组格式错误');
  const [typeId,x,y,faceId,modeId,extra]=row;
  if(!Number.isInteger(typeId)||!AST1_TYPE_BY_ID[typeId]||!Number.isInteger(x)||!Number.isInteger(y)||
     !Number.isInteger(faceId)||!FACTORY_JSON_FACES[faceId])throw Error('JSON 第'+i+'台机器类型/位置/方向无效');
  const type=AST1_TYPE_BY_ID[typeId];
  const props=expandOptionalFields(extra,FACTORY_JSON_BASE_MACHINE);
  return {...props,id:'m'+(i+1),type,x,y,face:FACTORY_JSON_FACES[faceId],mode:expandModeId(type,modeId)};
 });
 const routes=source.routes.map((row,i)=>{
  if(!Array.isArray(row)||(row.length!==6&&row.length!==7))throw Error('JSON 第'+i+'条线路数组格式错误');
  const [fi,fp,ti,tp,start,runs,extra]=row;
  if(fi===ti)throw Error('JSON 线路不能将机器输出口连接到自身输入口');
  if(!Number.isInteger(fi)||!machines[fi]||!Number.isInteger(ti)||(ti!==-1&&!machines[ti])||
     !Number.isInteger(fp)||fp<0||!Number.isInteger(tp)||tp<0)throw Error('JSON 第'+i+'条线路机器/接口索引无效');
  const props=expandOptionalFields(extra,FACTORY_JSON_BASE_ROUTE);
  return {...props,id:'r'+(i+1),from:{id:machines[fi].id,port:fp},to:ti===-1?null:{id:machines[ti].id,port:tp},path:unpackRouteRuns(start,runs)};
 });
 return {name:typeof source.name==='string'?source.name:'导入的工厂布局',machines,routes};
}
function compactFactoryJSON(layout=state){return JSON.stringify(compactFactoryLayout(layout));}
