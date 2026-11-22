'use strict';
// 理论产出取已连接产线的稳态产能上限，和小球动画的实际库存互不混用。
// 上游未接齐则该配方的理论产能为0；仓库取出独立统计为支出，允许库存起始不为0。
let theoreticalBudget=null;
// Offline, all-numeric steady-state throughput solver for Factory Lab.
// No shadow simulation, no ticks, no inventory evolution.
// Variables: machine cycle rate (/s), per-route-per-material flow (/s).
// Constraints: exact recipe stoichiometry, 1 item/s per physical belt/port,
// conservation at splitter/merger, global warehouse material balance.
function factorySteadySimplex(inequalities, variableCount, objective){
 const m=inequalities.length,n=variableCount,eps=1e-9;
 if(n===0)return {ok:true,x:[],objective:0,pivots:0};
 // Every constraint has b>=0, so x=0 is an initial feasible basic solution.
 // This allows a single-phase revised tableau (no artificial production).
 const D=Array.from({length:m+1},()=>new Float64Array(n+2));
 const basic=new Int32Array(m),nonbasic=new Int32Array(n+1);
 for(let i=0;i<m;i++){
  const row=inequalities[i];
  for(const [k,v] of row.a)D[i][k]=v;
  D[i][n]=-1;D[i][n+1]=row.b;
  if(row.b < -1e-8)return {ok:false,error:'约束的初始可行性不满足'};
  basic[i]=n+i;
 }
 for(let j=0;j<n;j++){D[m][j]=-objective[j];nonbasic[j]=j;}
 nonbasic[n]=-1;
 let pivots=0;const maxPivots=20000;
 const start=performance.now();
 while(pivots<maxPivots){
  // Deterministic Bland tie-break prevents cycling at zero-flow vertices.
  let col=-1,mostNegative=-eps;
  for(let j=0;j<n;j++){
   const v=D[m][j];
   if(v<mostNegative-1e-10||(v<mostNegative+1e-10&&v<-eps&&(col<0||nonbasic[j]<nonbasic[col]))){col=j;mostNegative=v;}
  }
  if(col<0){
   const x=new Float64Array(n);
   for(let i=0;i<m;i++)if(basic[i]<n)x[basic[i]]=Math.max(0,D[i][n+1]);
   return {ok:true,x,objective:D[m][n+1],pivots,elapsedMs:Math.round(performance.now()-start)};
  }
  let row=-1,minRatio=Infinity;
  for(let i=0;i<m;i++){
   const coef=D[i][col];if(coef<=eps)continue;
   const ratio=D[i][n+1]/coef;
   if(ratio<minRatio-1e-9||(Math.abs(ratio-minRatio)<=1e-9&&(row<0||basic[i]<basic[row]))){row=i;minRatio=ratio;}
  }
  if(row<0)return {ok:false,error:'稳态流量目标无界'};
  const pivotRow=D[row],den=pivotRow[col],inv=1/den;
  for(let i=0;i<=m;i++)if(i!==row){
   const dest=D[i],factor=dest[col]*inv;
   if(Math.abs(factor)>1e-12){
    for(let j=0;j<n+2;j++)if(j!==col)dest[j]-=pivotRow[j]*factor;
   }
   dest[col]=-factor;
  }
  for(let j=0;j<n+2;j++)if(j!==col)pivotRow[j]*=inv;
  pivotRow[col]=inv;
  const old=basic[row];basic[row]=nonbasic[col];nonbasic[col]=old;
  pivots++;
 }
 return {ok:false,error:'线性规划迭代上限（'+maxPivots+' 次）',pivots};
}

function warehouseTheory(){
 const byId=new Map(state.machines.map(m=>[m.id,m]));
 const validRoutes=state.routes.filter(r=>byId.has(r.from.id)&&byId.has(r.to.id)&&!checkPath(r.path,r.from,r.to,r.id));
 const routesIn=new Map(),routesOut=new Map();
 const machineRecords=new Map();
 for(const m of state.machines)if(getRecipe(m))machineRecords.set(m.id,getRecipe(m));
 for(const r of validRoutes){
  const ki=r.to.id+':'+r.to.port,ko=r.from.id+':'+r.from.port;
  routesIn.set(ki,r);routesOut.set(ko,r);
 }
 const labels=[],cycleVar=new Map(),routeVar=new Map(),routeItems=new Map();
 for(const [id] of machineRecords){cycleVar.set(id,labels.length);labels.push({type:'cycle',id});}
 for(const r of validRoutes){
  const src=byId.get(r.from.id),dst=byId.get(r.to.id),srcPort=outPort(src,r.from.port);
  const poss=[...streamMaterials(r)].filter(item=>{
   if(!item||!acceptsMaterial(dst,item,r.to.port))return false;
   if(src.type==='分流'&&srcPort?.filter&&srcPort.filter!=='任意'&&srcPort.filter!==item)return false;
   if(getRecipe(src)&&getRecipe(src).output!==item)return false;
   return true;
  });
  routeItems.set(r.id,poss);
  for(const item of poss){
   const key=r.id+'|'+item;routeVar.set(key,labels.length);labels.push({type:'route',id:r.id,item});
  }
 }
 const n=labels.length,rows=[];
 function add(entries,b=0){
  const arr=[...entries].filter(([,v])=>Math.abs(v)>1e-12);
  if(arr.length)rows.push({a:arr,b});
 }
 function equality(entries){add(entries);add(entries.map(([i,v])=>[i,-v]));}
 function rates(routes,item){const a=new Map();for(const r of routes){const j=routeVar.get(r.id+'|'+item);if(j!==undefined)a.set(j,(a.get(j)||0)+1);}return a;}
 const machineInputs=new Map(),machineOutputs=new Map();
 for(const m of state.machines){machineInputs.set(m.id,[]);machineOutputs.set(m.id,[]);}
 for(const r of validRoutes){machineInputs.get(r.to.id).push(r);machineOutputs.get(r.from.id).push(r);}
 for(const m of state.machines){
  const ins=machineInputs.get(m.id),outs=machineOutputs.get(m.id),rec=machineRecords.get(m.id);
  if(rec){
   const v=cycleVar.get(m.id);
   add([[v,1]],1/rec.seconds);
   // Every produced item must have a real connected output route (no infinite output buffer).
   const prod=[...rates(outs,rec.output)];prod.push([v,-rec.qty]);equality(prod);
   for(const [item,quantity] of Object.entries(rec.inputs||{})){
    const a=[...rates(ins,item)];a.push([v,-quantity]);equality(a);
   }
  }else if(m.type==='分流'||m.type==='汇流'){
   const mats=new Set([...ins,...outs].flatMap(r=>routeItems.get(r.id)||[]));
   for(const item of mats){
    const totals=new Map(rates(ins,item));
    for(const [j,c] of rates(outs,item))totals.set(j,(totals.get(j)||0)-c);
    equality([...totals]);
   }
  }
  // Each physical input/output port has its own TOTAL bandwidth cap 1 item/s.
  for(const which of [ins,outs]){
   const portKey=which===ins?'to':'from',group=new Map();
   for(const r of which){const p=r[portKey].port,items=group.get(p)||[];
    for(const mat of routeItems.get(r.id)||[]){const j=routeVar.get(r.id+'|'+mat);items.push([j,1]);}
    group.set(p,items);
   }
   for(const entries of group.values())add(entries,1);
  }
 }
 for(const r of validRoutes){
  const entries=(routeItems.get(r.id)||[]).map(item=>[routeVar.get(r.id+'|'+item),1]);
  add(entries,1);
 }
 const materials=new Set([...routeVar.keys()].map(k=>labels[routeVar.get(k)].item));
 for(const mat of materials){
  const entries=new Map();
  for(const r of validRoutes){
   const idx=routeVar.get(r.id+'|'+mat);if(idx===undefined)continue;
   if(byId.get(r.from.id).type==='仓出')entries.set(idx,(entries.get(idx)||0)+1);
   if(byId.get(r.to.id).type==='仓入')entries.set(idx,(entries.get(idx)||0)-1);
  }
  // Cold-start sustainable throughput: inventory withdraw <= real deposit for each material.
  add([...entries],0);
 }
 const rank={'曲速线圈':1000,'引力透镜':200,'量子处理器':200,'等离子电池':120,'共鸣水晶':60,'古代芯片':40,'框架模块':40,'电动机':40,'齿轮组':50,'导线线圈':25};
 const objective=new Float64Array(n);
 for(const [id,rec] of machineRecords)objective[cycleVar.get(id)]=(rank[rec.output]||1)*rec.qty;
 // Warehouse net surplus is secondary to genuinely producing items.
 // A tiny weight favors reusing excess supply rather than wasting it upstream.
 for(const r of validRoutes){
  const src=byId.get(r.from.id),dst=byId.get(r.to.id);
  for(const item of routeItems.get(r.id)||[]){
   const j=routeVar.get(r.id+'|'+item);
   if(dst.type==='仓入')objective[j]+=0.0002;
   if(src.type==='仓出')objective[j]-=0.0002;
  }
 }
 const result=factorySteadySimplex(rows,n,objective);
 if(!result.ok)return {inflow:{},outflow:{},machineCycles:{},routeFlows:{},warnings:[result.error],error:result.error,diagnostics:{variables:n,constraints:rows.length,pivots:result.pivots||0}};
 const eps=1e-7,x=result.x,inflow={},outflow={},machineCycles={},routeFlows={},machineNeeds={},machineFeeds=new Map();
 const credit=(obj,item,v)=>{if(v>eps)obj[item]=(obj[item]||0)+v;};
 for(const [id,j] of cycleVar)machineCycles[id]=x[j]||0;
 for(const r of validRoutes){
  const src=byId.get(r.from.id),dst=byId.get(r.to.id),flows={};
  for(const item of routeItems.get(r.id)||[]){
   const j=routeVar.get(r.id+'|'+item),v=x[j];if(!(v>eps))continue;
   flows[item]=v;
   if(src.type==='仓出')credit(outflow,item,v);
   if(dst.type==='仓入')credit(inflow,item,v);
   if(machineRecords.has(dst.id)){
    const feed=machineFeeds.get(dst.id)||{};credit(feed,item,v);machineFeeds.set(dst.id,feed);
   }
  }
  routeFlows[r.id]=flows;
 }
 for(const [id,rec] of machineRecords){
  const need={};for(const [item,qty] of Object.entries(rec.inputs||{}))need[item]=qty*machineCycles[id];
  machineNeeds[id]=need;
 }
 const warnings=[];
 for(const [id,rec] of machineRecords){
  for(const item of Object.keys(rec.inputs||{})){
   const connected=(machineInputs.get(id)||[]).some(r=>(routeItems.get(r.id)||[]).includes(item));
   if(!connected)warnings.push(id+' 缺少有效上游：'+item);
  }
 }
 return {inflow,outflow,machineCycles,machineNeeds,machineFeeds:Object.fromEntries(machineFeeds),routeFlows,warnings,
  diagnostics:{variables:n,constraints:rows.length,pivots:result.pivots,elapsedMs:result.elapsedMs,objective:result.objective,method:'纯数字线性规划：配方守恒＋端口／线路限流＋分流／汇流守恒＋仓库收支约束'}};
}

function portSteadyRate(m,port){
 const r=routeFor(m.id,port.kind==='in'?'in':'out',port.index);
 if(!r)return 0;
 return Object.values(theoreticalBudget?.routeFlows?.[r.id]||{}).reduce((sum,x)=>sum+x,0)*60;
}
function machineSteadyPanel(m){
 const theory=theoreticalBudget;
 if(!theory||theory.error)return `<div class="item"><strong>稳态理论产能</strong><div class="tiny">${esc(theory?.error||'尚未计算')}</div></div>`;
 const r=getRecipe(m),cy=theory.machineCycles?.[m.id]||0;
 if(!r&&!['汇流','分流','仓入','仓出'].includes(m.type))return '';
 let rows='';
 if(r){
  rows+=`<div class="kv"><span>实际可达理论产出</span><b>${(cy*r.qty*60).toFixed(2)} /分钟</b></div>`;
  rows+=`<div class="kv"><span>理论有效加工周期</span><b>${fmtT(effectiveCycle(m))} 秒/批</b></div>`;
  if(r.qty>1){const secPerUnit=cy>1e-9?1/(cy*r.qty):Infinity;
   rows+=`<div class="kv"><span>平均每件产出间隔</span><b>${fmtT(secPerUnit)} 秒/件</b></div>`;}

  rows+=`<div class="kv"><span>设备利用率</span><b>${Math.max(0,Math.min(100,cy*r.seconds*100)).toFixed(1)}%</b></div>`;
  for(const [item,qty] of Object.entries(r.inputs||{})){
   const need=(theory.machineNeeds?.[m.id]?.[item]||0)*60;
   const feed=(theory.machineFeeds?.[m.id]?.[item]||0)*60;
   rows+=`<div class="kv"><span>${esc(item)} · 需/供</span><b>${need.toFixed(2)} / ${feed.toFixed(2)}</b></div>`;
  }
 }else{
  const ins=state.routes.filter(rt=>rt.to.id===m.id),outs=state.routes.filter(rt=>rt.from.id===m.id);
  const summarize=rs=>rs.reduce((a,rt)=>a+Object.values(theory.routeFlows?.[rt.id]||{}).reduce((s,v)=>s+v,0),0)*60;
  rows+=`<div class="kv"><span>理论输入量</span><b>${summarize(ins).toFixed(2)} /分钟</b></div>`;
  rows+=`<div class="kv"><span>理论输出量</span><b>${summarize(outs).toFixed(2)} /分钟</b></div>`;
 }
 return `<div class="item"><strong>稳态理论 · 纯数字</strong>${rows}<div class="tiny">机器标签：前面的秒数是配方标称加工时间；括号内是联立稳态理论有效加工周期（秒/批）。∞ 表示该稳态解中未生产。根据全网物料守恒计算，不推进模拟时间；多种可行分流比例时取目标函数优化解，未模拟分流器的逐件轮转顺序。</div></div>`;
}
