'use strict';
const AST1_DIRECTIONS=[[0,1],[1,0],[0,-1],[-1,0]];
function ast1Rotations(t){return t==='仓入'?AST1_ROTATION.warehouseIn:['分流','汇流','仓出'].includes(t)?AST1_ROTATION.router:AST1_ROTATION.regular;}
const AST1_GRID_WIDTH=72;
function ast1MirrorFace(f){return f==='E'?'W':f==='W'?'E':f;}
function ast1GameFacing(m,side){return m.ast1Mirrored?ast1MirrorFace(side):side;}
function ast1MirrorMachine(m){
 const n={...m};n.x=AST1_GRID_WIDTH-m.x-dims(m)[0];
 n.face=ast1MirrorFace(m.face);n.ast1Mirrored=true;
 return n;
}
function ast1GameSide(f,kind){const lhs={E:'N',N:'W',W:'S',S:'E'},rhs={E:'S',S:'W',W:'N',N:'E'};return kind==='left'?lhs[f]:rhs[f]}
function ast1PortFromGame(m,kind,i){
 const ports=getPorts(m).filter(p=>p.kind===kind).map(p=>({...p,side:ast1GameFacing(m,p.side)})),f=ast1GameFacing(m,m.face||'E'),ix=Number(i);
 if(kind==='out'&&m.type==='分流'){
  const sides=[f,ast1GameSide(f,'left'),ast1GameSide(f,'right')];return ports.find(p=>p.side===sides[ix])?.index;
 }
 if(kind==='in'&&m.type==='汇流'){
  const sides=[OPP[f],ast1GameSide(f,'left'),ast1GameSide(f,'right')];return ports.find(p=>p.side===sides[ix])?.index;
 }
 if(kind==='in'&&(f==='W'||f==='S'||(m.type==='冶炼'&&f==='E')))return ports.length-1-ix;
 return ix;
}
function ast1PortToGame(m,kind,i){
 const ports=getPorts(m).filter(p=>p.kind===kind);
 for(let game=0;game<ports.length;game++)if(ast1PortFromGame(m,kind,game)===i)return game;
 throw Error(`无法把 ${label(m)} ${kind}口${i} 映射到游戏接口编号`);
}
function ast1GetPort(m,kind,index){return getPorts(m).find(p=>p.kind===kind&&p.index===index)}
// Belt-route indices [front,left,right], but filter fields [front,right,left].
// Keep route indexing unchanged; only translate filter entries.
function ast1FilterPortFromGame(m,filterIndex){
 const face=m.face||'E';
 const sides=[face,ast1GameSide(face,'right'),ast1GameSide(face,'left')];
 const side=sides[filterIndex];
 if(side===undefined)throw Error('Unknown AST1 filter slot '+filterIndex);
 const port=getPorts(m).find(p=>p.kind==='out'&&p.side===side);
 if(!port)throw Error('Split outlet not found for relative '+filterIndex+' facing '+face);
 return port.index;
}
function ast1FilterPortLabel(m,portIndex){
 const index=[0,1,2].find(i=>ast1FilterPortFromGame(m,i)===portIndex);
 return ['前','右','左'][index]||'?';
}
function ast1Decode(code){
 const raw=String(code||'').replace(/\s+/g,'');
 if(!raw.startsWith('AST1:'))throw Error('蓝图必须以 AST1: 开头');
 const b64=raw.slice(5);
 if(b64.length>1000000||!/^([\w+/]{4})*([\w+/]{2}==|[\w+/]{3}=)?$/.test(b64))throw Error('Base64 蓝图格式错误/过长');
 let decoded;try{decoded=atob(b64)}catch(e){throw Error('Base64 不能解码')}
 const data=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 if(data.length<5||data[0]!==4)throw Error('当前只支持已识别的 AST1 v4 二进制格式');
 const u16=p=>data[p]|(data[p+1]<<8), count=u16(1);
 if(count>10000)throw Error('机器数量异常');
 let off=3;const machines=[];
 for(let i=0;i<count;i++){
  if(off+7>data.length)throw Error(`第${i}台机器记录不完整`);
  const typeId=data[off],t=AST1_TYPE_BY_ID[typeId],x=data[off+1],y=data[off+2],rot=data[off+3],modeId=data[off+5],extend=data[off+6],len=7+2*extend;
  if(!t)throw Error(`机器序号${i}的类型 ${typeId} 未识别，无法安全转换`);
  if(off+len>data.length)throw Error(`机器序号${i}扩展数据越界`);
  if(rot>=4)throw Error(`机器序号${i}旋转参数无效`);
  const record=Array.from(data.slice(off,off+len));off+=len;
  const face=ast1Rotations(t)[rot],known=AST1_MODE[t];
  if(known&&!known[modeId])throw Error(`第${i}台${t}存在未知游戏配方序号 ${modeId}`);
  const mode=known?known[modeId]:(['废料','浇筑','燃料','电池','共鸣'].includes(t)?'标准':'');
  const m={id:'ast1_'+i,type:t,x,y,face:ast1MirrorFace(face),mode,ast1GamePorts:true,ast1Mirrored:true,
   ast1Meta:{record,originalType:typeId,originalMode:mode,originalItem:null,originalInletItem:null,originalOutFilters:null,filterOrderVersion:3}};
  if(t==='仓出'){
   if(extend!==1)throw Error(`第${i}台仓库取出口配置结构暂不支持`);
   const itemId=record[7]|record[8]<<8;
   m.item=AST1_ITEMS[itemId]||`未识别游戏物品 #${itemId}`;
   m.ast1Meta.originalItem=m.item;
  }
  if(t==='仓入'){
    if(extend!==0&&extend!==1)throw Error('Unsupported AST1 warehouse inlet data at index '+i);
    const matid=extend===1?(record[7]|(record[8]<<8)):0;
    m.inletItem=matid?(AST1_ITEMS[matid]||('未识别游戏物品 #'+matid)):'';
    m.ast1Meta.originalInletItem=m.inletItem;
   }
  if(t==='分流'){
   if(extend!==0&&extend!==3)throw Error(`第${i}台分流器过滤参数结构暂不支持`);
   const filters={};for(let port=0;port<(extend===3?3:0);port++){
    const matid=record[7+2*port]|record[8+2*port]<<8;
    if(matid){const p=ast1FilterPortFromGame(m,port);filters[p]=AST1_ITEMS[matid]||`未识别游戏物品 #${matid}`;}
   }
   m.outFilters=filters;m.ast1Meta.originalOutFilters=JSON.stringify(filters);
  }
  m.x=AST1_GRID_WIDTH-x-dims(m)[0];
  machines.push(m);
 }
 if(off+2>data.length)throw Error('线路数量字段丢失');
 const routeCount=u16(off);off+=2;
 if(routeCount>20000)throw Error('线路数量异常');
 const routes=[];
 for(let ri=0;ri<routeCount;ri++){
  if(off+7>data.length)throw Error(`第${ri}条线路头不完整`);
  const fi=u16(off),fp=data[off+2],ti=u16(off+3),tp=data[off+5],steps=data[off+6],np=Math.ceil(Math.max(0,steps-1)/4);
  if(fi>=machines.length||ti>=machines.length||steps<1||off+7+np>data.length)throw Error(`第${ri}条线路索引、步数或二进制长度无效`);
  const sm=machines[fi],tm=machines[ti],outidx=ast1PortFromGame(sm,'out',fp),inidx=ast1PortFromGame(tm,'in',tp),sp=ast1GetPort(sm,'out',outidx),ep=ast1GetPort(tm,'in',inidx);
  if(!sp||!ep)throw Error(`第${ri}条线路连接了无效的机器接口`);
  const path=[[sp.ex,sp.ey]];
  for(let j=0;j<steps-1;j++){
   const d=(data[off+7+Math.floor(j/4)]>>((j%4)*2))&3,vec=AST1_DIRECTIONS[d],v=path[path.length-1];
   path.push([v[0]+(sm.ast1Mirrored?-vec[0]:vec[0]),v[1]+vec[1]]);
  }
  if(path.at(-1)[0]!==ep.ex||path.at(-1)[1]!==ep.ey)throw Error(`第${ri}条线路解码后未命中游戏接口 ${path.at(-1)}≠${[ep.ex,ep.ey]}`);
  routes.push({id:'ast1_r'+ri,from:{id:sm.id,port:outidx},to:{id:tm.id,port:inidx},path});
  off+=7+np;
 }
 if(off!==data.length)throw Error(`蓝图尾部还有${data.length-off}字节未解析，可能是另一个格式版本`);
 return {name:`AST1 游戏蓝图 · ${machines.length}台机器 · ${routes.length}条线路`,machines,routes};
}
function ast1WriteU16(out,x){if(x<0||x>65535||!Number.isInteger(x))throw Error('蓝图字段超出16位');out.push(x&255,x>>8);}
function ast1ToBytes(){
 const ms=state.machines,rs=state.routes,buf=[4];
 if(ms.length>65535||rs.length>65535)throw Error('机器或线路数量超过游戏 AST1 限制');
 ast1WriteU16(buf,ms.length);
 const ids=new Map();
 ms.forEach((m,i)=>{
  const type=AST1_ID_BY_TYPE[m.type];if(type===undefined)throw Error(`设备${i+1}类型 ${m.type} 尚无游戏编号`);
  if(ids.has(m.id))throw Error('重复机器编号：'+m.id);
  ids.set(m.id,i);
  if(!Number.isInteger(m.x)||!Number.isInteger(m.y)||m.x<0||m.y<0||m.x>255||m.y>255)throw Error('游戏坐标须为0–255的整数');
  const r=ast1Rotations(m.type).indexOf(ast1GameFacing(m,m.face||'E'));if(r<0)throw Error('机器旋转异常');
  const old=m.ast1Meta?.record;
  const rec=old&&old[0]===type?old.slice():[type,0,0,0,0,0,0];
  rec[0]=type;rec[1]=m.ast1Mirrored?AST1_GRID_WIDTH-m.x-dims(m)[0]:m.x;rec[2]=m.y;rec[3]=r;
  const modes=AST1_MODE[m.type];if(modes){
   const mode=m.mode||modes[0],k=modes.indexOf(mode);
   if(k<0)throw Error(`${label(m)} 配方 ${mode} 没有游戏编码`);
   rec[5]=k;
  }
  if(m.type==='仓出'){
   const item=m.item||m.ast1Meta?.originalItem;
   let id=AST1_ITEM_IDS[item];
   if(id===undefined&&item===m.ast1Meta?.originalItem&&rec[6]===1)id=rec[7]|(rec[8]<<8);
   if(id===undefined)throw Error(`仓库取出口 ${m.id} 的物料 ${item} 尚未获得游戏物品ID，不能安全导出`);
   rec[6]=1;rec.splice(7,rec.length-7,id&255,(id>>8)&255);
  }else if(m.type==='仓入'){
    const item=m.inletItem||'';
    let id=!item||item==='任意'?0:AST1_ITEM_IDS[item];
    if(id===undefined&&old?.[6]===1&&item===m.ast1Meta?.originalInletItem)id=old[7]|(old[8]<<8);
    if(id===undefined)throw Error('Warehouse inlet '+m.id+' has unknown filter item ID: '+item);
    if(!old||item!==m.ast1Meta?.originalInletItem){rec[6]=id?1:0;rec.splice(7,rec.length-7,...(id?[id&255,(id>>8)&255]:[]));}
  }else if(m.type==='分流'){
   const orig=m.ast1Meta?.originalOutFilters;
   if(!old||JSON.stringify(m.outFilters||{})!==orig){
    let extra=[],filtered=false;
    for(let gp=0;gp<3;gp++){
     const hp=ast1FilterPortFromGame(m,gp),item=m.outFilters?.[hp]||'';
     const id=!item||item==='任意'?0:AST1_ITEM_IDS[item];
     if(id===undefined)throw Error(`分流器 ${m.id} 出口${gp+1} 的过滤物料 ${item} 尚未识别游戏ID`);
     if(id!==0)filtered=true;
     extra.push(id&255,(id>>8)&255);
    }
    // 游戏支持无附加过滤字段的分流器：无字段及三个0均代表所有出口任意。
    // 有实际过滤才附加 3×u16；旧游戏蓝图记录没变化则原样保留，保证无损往返。
    rec[6]=filtered?3:0;rec.splice(7,rec.length-7,...(filtered?extra:[]));
   }
  }else if(!old&&m.type==='电脑'){
   rec[6]=1;rec.push(0,0);
  }
  if(rec.length!==7+2*rec[6])throw Error(`机器 ${m.id} AST1 扩展字段数量错误`);
  buf.push(...rec);
 });
 ast1WriteU16(buf,rs.length);
 for(let i=0;i<rs.length;i++){
  const route=rs[i],fi=ids.get(route.from.id),ti=ids.get(route.to.id);
  if(fi===undefined||ti===undefined)throw Error('第'+i+'条线路引用了不存在的机器');
  const sm=machineById(route.from.id),tm=machineById(route.to.id),sp=outPort(sm,route.from.port),ep=inPort(tm,route.to.port),path=route.path;
  if(!sp||!ep||!Array.isArray(path)||!path.length||path.length>255)throw Error(`第${i}条线路的接口或长度无法用AST1编码（最多255格）`);
  if(path[0][0]!==sp.ex||path[0][1]!==sp.ey||path.at(-1)[0]!==ep.ex||path.at(-1)[1]!==ep.ey)
   throw Error(`第${i}条线路首尾端口不匹配，无法导出游戏蓝图`);
  const fp=ast1PortToGame(sm,'out',route.from.port),tp=ast1PortToGame(tm,'in',route.to.port);
  ast1WriteU16(buf,fi);buf.push(fp);ast1WriteU16(buf,ti);buf.push(tp,path.length);
  let byte=0;
  for(let k=1;k<path.length;k++){
   const delta=[path[k][0]-path[k-1][0],path[k][1]-path[k-1][1]];
   const direction=AST1_DIRECTIONS.findIndex(d=>d[0]===(sm.ast1Mirrored?-delta[0]:delta[0])&&d[1]===delta[1]);
   if(direction<0)throw Error(`第${i}条线路在第${k}格不连续`);
   byte|=direction<<((k-1)%4*2);
   if((k-1)%4===3||k===path.length-1){buf.push(byte);byte=0;}
  }
 }
 return new Uint8Array(buf);
}
function ast1Encode(){
 const b=ast1ToBytes();
 // Chunking avoids call-argument limits for very large factories.
 let str='';for(let i=0;i<b.length;i+=4096)str+=String.fromCharCode(...b.slice(i,i+4096));
 return 'AST1:'+btoa(str);
}
