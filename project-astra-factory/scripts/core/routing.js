'use strict';
function occupiedRouteMap(excludeId){let grid=new Map();for(const r of state.routes){if(r.id===excludeId)continue;for(let i=0;i<r.path.length;i++){const [x,y]=r.path[i];let key=`${x},${y}`, list=grid.get(key)||[];list.push({r,i});grid.set(key,list);}}return grid;}
// A belt's terminal cell is connected to the physical port inside its machine.
// Use those port cells as virtual endpoints for crossing geometry checks.
// 方向化格子模型：一个格子只能是 4 种有向直线或 8 种有向直角。
// 机器接口格子是物理端点；线路 path 只记录机器外部的格子。
const EDGE_NAMES=['N','E','S','W'];
function edgeFromTo(a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1];
 if(dx===1&&dy===0)return 'E';
 if(dx===-1&&dy===0)return 'W';
 if(dx===0&&dy===1)return 'S';
 if(dx===0&&dy===-1)return 'N';
 return null;
}
function tileShape(path,i,src,dst){
 const cell=path[i];if(!cell)return null;
 const a=i>0?path[i-1]:[src.x,src.y];
 const b=i<path.length-1?path[i+1]:[dst.x,dst.y];
 const incoming=edgeFromTo(cell,a),outgoing=edgeFromTo(cell,b);
 if(!incoming||!outgoing||incoming===outgoing)return null; // 对角、空边或 U 型反转
 const straight=OPP[incoming]===outgoing;
 return {incoming,outgoing,type:straight?'straight':'turn',axis:straight?(incoming==='N'||incoming==='S'?'V':'H'):null,
  // N→E and E→N have identical geometry, but are two distinct directed turns.
  key:incoming+'>'+outgoing};
}
function routeTile(r,i){
 const a=machineById(r.from.id),b=machineById(r.to.id);
 const src=a&&outPort(a,r.from.port),dst=b&&inPort(b,r.to.port);
 return src&&dst?tileShape(r.path,i,src,dst):null;
}
function orientation(r,i){return routeTile(r,i)?.axis||null;}
function pathAxis(path,i,src,dst){return tileShape(path,i,src,dst)?.axis||null;}
function checkPath(path,from,to,excluded){
 if(!Array.isArray(path)||path.length===0)return '线路为空';
 const sm=machineById(from.id),tm=machineById(to.id);
 const src=sm&&outPort(sm,from.port),dst=tm&&inPort(tm,to.port);
 if(!src||!dst)return '源或目标接口无效';
 if(path[0][0]!==src.ex||path[0][1]!==src.ey||path.at(-1)[0]!==dst.ex||path.at(-1)[1]!==dst.ey)return '线路首尾没有连接到机器实际接口';
 // Each physical interface can be wired once (no hidden branching or merging).
 if(state.routes.some(r=>r.id!==excluded&&r.from.id===from.id&&r.from.port===from.port))return '输出接口已连接其他线路';
 if(state.routes.some(r=>r.id!==excluded&&r.to.id===to.id&&r.to.port===to.port))return '输入接口已连接其他线路';
 const seen=new Set(),occupied=occupiedRouteMap(excluded);
 for(let i=0;i<path.length;i++){
  const [x,y]=path[i],key=x+','+y;
  if(!Number.isInteger(x)||!Number.isInteger(y)||!inMap(x,y)||reserved(x,y)||cellMachine(x,y))return `第${i+1}格穿过机器或障碍物 (${x},${y})`;
  if(seen.has(key))return `第${i+1}格发生自交 (${x},${y})`;
  seen.add(key);
  const node=tileShape(path,i,src,dst);
  if(!node)return `第${i+1}格的入边/出边不连续或出现回头弯 (${x},${y})`;
  const existing=occupied.get(key)||[];
  if(existing.length>1)return `格 (${x},${y}) 已被两条直线占用，不可再叠加`;
  if(existing.length===1){
   const old=routeTile(existing[0].r,existing[0].i);
   if(!old||node.type!=='straight'||old.type!=='straight'||node.axis===old.axis)
    return `交叉格 (${x},${y}) 只能容纳一横一直两条互不相连的直线，拐角不能重叠`;
  }
 }
 return null;
}
// Direction-aware A* permits a single perpendicular crossing on any belt cell,
// including the cell immediately outside an output or input port.
// A crossing MUST be traversed straight. Turns can start in the next free cell.
function pathSearch(start,end,avoid=new Set(),options={}){
 if(!inMap(...start)||!inMap(...end))return null;
 const directions=[[1,0],[0,1],[-1,0],[0,-1]],occ=occupiedRouteMap();
 const kOf=(x,y)=>x+','+y,at=(x,y)=>occ.get(kOf(x,y))||[];
 const dir=(a,b)=>directions.findIndex(d=>a[0]+d[0]===b[0]&&a[1]+d[1]===b[1]);
 const axis=d=>d%2===0?'H':'V';
 const initial=options.startPrev?dir(options.startPrev,start):-1;
 const endExit=options.endNext?dir(end,options.endNext):-1;
 if(options.startPrev&&initial<0)return null;
 if(options.endNext&&endExit<0)return null;
 if(avoid.has(kOf(...start))||reserved(...start)||cellMachine(...start))return null;
 const startOther=at(...start);
 if(startOther.length){if(startOther.length!==1||initial===-1||orientation(startOther[0].r,startOther[0].i)!==(axis(initial)==='H'?'V':'H'))return null;}
 const id=(x,y,d)=>x+'/'+y+'/'+d,heur=(x,y)=>Math.abs(x-end[0])+Math.abs(y-end[1]);
 const root={x:start[0],y:start[1],d:initial,g:0,f:heur(...start),id:id(...start,initial)};
 let heap=[],dist=new Map([[root.id,0]]),prev=new Map(),nodes=new Map([[root.id,root]]),serial=0;
 const push=node=>{heap.push(node);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=node.f)break;heap[i]=heap[p];i=p;}heap[i]=node;};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){const l=2*i+1,r=l+1;if(l>=heap.length)break;const j=r<heap.length&&heap[r].f<heap[l].f?r:l;if(last.f<=heap[j].f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return top;};
 push(root);
 let count=0;
 while(heap.length&&count++<65000){
  const a=pop();if(a.g>(dist.get(a.id)??Infinity)+1e-8)continue;
  const currOther=at(a.x,a.y);
  if(a.x===end[0]&&a.y===end[1]){
   if(currOther.length){
    if(currOther.length!==1||a.d===-1)continue;
    if(endExit!==-1&&a.d!==endExit)continue;
    if(endExit===-1&&!options.allowOpenCrossingEnd)continue;
   }
   let seq=[];for(let k=a.id;k;k=prev.get(k)){const n=nodes.get(k);seq.push([n.x,n.y]);}
   return seq.reverse();
  }
  for(let d=0;d<4;d++){
   if(a.d!==-1&&d===(a.d+2)%4)continue;
   // If a is occupied, its orthogonal strand must not bend inside this cell.
   if(currOther.length){
    if(currOther.length!==1||a.d!==d)continue;
    const old=orientation(currOther[0].r,currOther[0].i);
    if(!old||old===axis(d))continue;
   }
   const v=directions[d],nx=a.x+v[0],ny=a.y+v[1],key=kOf(nx,ny);
   if(!inMap(nx,ny)||reserved(nx,ny)||cellMachine(nx,ny)||avoid.has(key))continue;
   const nextOther=at(nx,ny);
   if(nextOther.length){
    if(nextOther.length!==1)continue;
    const old=orientation(nextOther[0].r,nextOther[0].i);
    if(!old||old===axis(d))continue;
    if(nx===end[0]&&ny===end[1]){
     if(endExit!==-1&&endExit!==d)continue;
     if(endExit===-1&&!options.allowOpenCrossingEnd)continue;
    }
   }
   const ng=a.g+1+(a.d!==-1&&a.d!==d?.7:0)+(nextOther.length?2:0),k=id(nx,ny,d);
   if(ng>=(dist.get(k)??Infinity)-1e-8)continue;
   const node={x:nx,y:ny,d,g:ng,f:ng+heur(nx,ny),id:k};
   dist.set(k,ng);nodes.set(k,node);prev.set(k,a.id);push(node);
  }
 }
 return null;
}
function connect(from,to,waypoints=[],manualPath=null){let a=machineById(from.id),b=machineById(to.id);if(!a||!b)return notify('接口所属机器不存在','bad');let p=outPort(a,from.port),q=inPort(b,to.port);if(!p||!q)return notify('请选择橙色输出口、蓝色输入口','bad');if(routeFor(a.id,'out',from.port)||routeFor(b.id,'in',to.port))return notify('接口已被线路使用；一对一连接需要先删除旧线或放分流器 / 汇流器','bad');let item=recipeOutput(a);if(a.type==='分流'){const f=p.filter;if(f&&f!=='任意'&&!acceptsMaterial(b,f,to.port))return notify('分流器出口过滤物品 '+f+' 不符合目标配方','bad');}
 if(getRecipe(b)){
  // Mixed upstream streams are valid if every known material matches this recipe
  // and any player-selected input filter. Unknown stream is permitted for later wiring.
  const mats=[...possibleSourceMaterials(a,new Set(),from.port)];
  const incompatible=mats.filter(mat=>!acceptsMaterial(b,mat,to.port));
  if(incompatible.length)return notify('输入流包含当前配方或手动过滤不接收的材料：'+incompatible.join('、')+'；可选择“按配方自动”或重新分流。','bad');
 }
 if(item&&!acceptsMaterial(b,item,to.port))return notify(`材料不匹配：${item} 不能送入该机器当前配方或手动过滤的入口`,'bad');
 let checkpoints=[[p.ex,p.ey],...waypoints,[q.ex,q.ey]],path=manualPath?manualPath.map(v=>v.slice()):[];
 if(!manualPath)for(let j=0;j<checkpoints.length-1;j++){
  const startPrev=j===0?[p.x,p.y]:(path.length>1?path[path.length-2]:[p.x,p.y]);
  const endNext=j===checkpoints.length-2?[q.x,q.y]:null;
  let segment=pathSearch(checkpoints[j],checkpoints[j+1],new Set(path.slice(0,-1).map(c=>c.join(','))),{startPrev,endNext,allowOpenCrossingEnd:!endNext});
  if(!segment)return notify('找不到合法路径：可尝试移动机器，或改变转折点','bad');
  if(j)segment.shift();path.push(...segment);
 }
 if(!manualPath&&checkpoints.length===2&&p.ex===q.ex&&p.ey===q.ey)path=[[p.ex,p.ey]];
 let reason=checkPath(path,from,to);if(reason)return notify('线路验证失败：'+reason,'bad');snapshot();state.routes.push({id:'r'+(++idSeed),from,to,path});draft=null;selection={routeId:state.routes.at(-1).id};afterChange('已连接 '+label(a)+' → '+label(b));}
