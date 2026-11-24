'use strict';
// Factory Lab JSON v13: readable AST1-like machine and route records, without saved IDs.
// Machine and item types use AST1 IDs; internal instance IDs are recreated from
// machine indices, just as AST1 line endpoints refer to machine indices.
const FACTORY_JSON_VERSION=13;
const FACTORY_JSON_FORMAT='factory-lab';
const FACTORY_JSON_FACES=['E','N','W','S'];
const FACTORY_JSON_STEPS=[[1,0],[0,1],[-1,0],[0,-1]]; // E, S, W, N
const FACTORY_JSON_BASE_MACHINE=new Set(['id','type','x','y','face','mode']);
const FACTORY_JSON_BASE_ROUTE=new Set(['id','from','to','path']);
const FACTORY_JSON_DANGEROUS=new Set(['__proto__','prototype','constructor']);
function compactItem(value){
 if(value===''||value==='任意')return value;
 const id=ast1ItemNumber(value);
 return id===undefined?value:id;
}
function expandItem(value){
 if(typeof value==='string')return ast1CanonicalItem(value);
 if(typeof value!=='number')return value;
 return ast1ItemLabel(value);
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
// v13 is a readable decoded AST1-like record layout. No instance IDs are
// serialized. Machine/route array position is its game record index.
function compactFactoryLayout(layout=state){
 if(!layout||!Array.isArray(layout.machines)||!Array.isArray(layout.routes))
  throw Error('JSON layout requires machines and routes arrays');
 if(layout.machines.length>10000||layout.routes.length>20000)
  throw Error('JSON layout too large');
 const ids=new Map();
 const machines=layout.machines.map((m,i)=>{
  if(!m||!DEF[m.type]||!Number.isInteger(m.x)||!Number.isInteger(m.y))
   throw Error('Invalid machine record '+i);
  if(ids.has(m.id))throw Error('Duplicate machine ID in source layout');
  ids.set(m.id,i);
  const face=m.face||'E';
  if(!FACTORY_JSON_FACES.includes(face))throw Error('Invalid machine facing '+i);
  compactModeId(m);
  const row={type:m.type,x:m.x,y:m.y,face,mode:m.mode??defaultModeFor(m.type)};
  for(const [key,value] of Object.entries(m)){
   if(FACTORY_JSON_BASE_MACHINE.has(key)||FACTORY_JSON_DANGEROUS.has(key)||value===undefined)continue;
   row[key]=value;
  }
  return row;
 });
 const routes=layout.routes.map((r,i)=>{
  if(!r||!r.from||!Number.isInteger(r.from.port)||r.from.port<0)
   throw Error('Invalid route source '+i);
  const fi=ids.get(r.from.id),ti=r.to?ids.get(r.to.id):null;
  if(fi===undefined||r.to&&ti===undefined)throw Error('Route '+i+' machine index missing');
  if(ti!==null&&fi===ti)throw Error('JSON 线路不能连接自身输入口');
  if(r.to&&(!Number.isInteger(r.to.port)||r.to.port<0))throw Error('Invalid destination port '+i);
  if(!Array.isArray(r.path)||!r.path.length||r.path.length>10000||
      r.path.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)))
   throw Error('Invalid route path '+i);
  const row={from:[fi,r.from.port],to:r.to?[ti,r.to.port]:null,
   path:r.path.map(p=>p.slice())};
  for(const [key,value] of Object.entries(r)){
   if(FACTORY_JSON_BASE_ROUTE.has(key)||FACTORY_JSON_DANGEROUS.has(key)||value===undefined)continue;
   row[key]=value;
  }
  return row;
 });
 return {format:FACTORY_JSON_FORMAT,version:FACTORY_JSON_VERSION,
  name:layout.name||'工厂布局',machines,routes,...(layout.frozenFactories?.length?{frozenFactories:normalizeFrozenFactories(layout.frozenFactories)}:{})};
}
function expandCompactFactoryLayout(source){
 if(!source||source.format!==FACTORY_JSON_FORMAT||
    source.version!==FACTORY_JSON_VERSION)
  throw Error('Unsupported JSON format or version '+String(source?.version));
 if(!Array.isArray(source.machines)||!Array.isArray(source.routes)||
  source.machines.length>10000||source.routes.length>20000)
  throw Error('JSON machines/routes arrays are invalid');
 const machines=source.machines.map((row,i)=>{
  if(!row||Array.isArray(row)||typeof row!=='object'||!DEF[row.type]||
   !Number.isInteger(row.x)||!Number.isInteger(row.y)||
   !FACTORY_JSON_FACES.includes(row.face))
   throw Error('Invalid machine record '+i);
  const props={};
  for(const [key,value] of Object.entries(row)){
   // Legacy IDs are intentionally never read in the v13 importer.
   if(FACTORY_JSON_BASE_MACHINE.has(key)||FACTORY_JSON_DANGEROUS.has(key))continue;
   props[key]=value;
  }
  const mode=row.mode??defaultModeFor(row.type),parsed=parseRecipeMode(row.type,mode);
  if(DEF[row.type].recipes&&
     !Object.prototype.hasOwnProperty.call(DEF[row.type].recipes,parsed))
   throw Error('Invalid recipe mode '+i);
  const m={...props,id:'M'+i,type:row.type,x:row.x,y:row.y,
   face:row.face,mode:parsed};
  compactModeId(m);
  return m;
 });
 const routes=source.routes.map((r,i)=>{
  if(!r||Array.isArray(r)||typeof r!=='object')throw Error('Invalid route '+i);
  const pair=(value,required)=>{
   if(value===null&&!required)return null;
   if(!Array.isArray(value)||value.length!==2||
      !Number.isInteger(value[0])||value[0]<0||value[0]>=machines.length||
      !Number.isInteger(value[1])||value[1]<0)
    throw Error('Invalid route endpoint '+i);
   return {id:machines[value[0]].id,port:value[1]};
  };
  const from=pair(r.from,true),to=pair(r.to,false);
  if(to&&to.id===from.id)throw Error('Route cannot return to source machine');
  if(!Array.isArray(r.path)||!r.path.length||r.path.length>10000||
     r.path.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)))
   throw Error('Invalid route geometry '+i);
  const props={};
  for(const [key,value] of Object.entries(r)){
   if(FACTORY_JSON_BASE_ROUTE.has(key)||FACTORY_JSON_DANGEROUS.has(key))continue;
   props[key]=value;
  }
  return {...props,id:'R'+i,from,to,path:r.path.map(p=>p.slice())};
 });
 return {name:typeof source.name==='string'?source.name:'导入的工厂布局',
  recordIndexed:true,machines,routes,...(source.frozenFactories!==undefined?{frozenFactories:normalizeFrozenFactories(source.frozenFactories)}:{})};
}
function compactFactoryJSON(layout=state){return JSON.stringify(compactFactoryLayout(layout));}
