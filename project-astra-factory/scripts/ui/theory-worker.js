'use strict';
// Strict proof jobs never execute in the render loop. file:// browsers
// reject external Worker URLs; use an identical self-contained Blob worker.
let theoryWorker=null,theoryWorkerTimer=null,theoryProgressTimer=null,theoryLayoutKey=null,theoryJob=null,offlineTheorySourcePromise=null;
const THEORY_BACKGROUND_MS=60000,THEORY_REVISION='20261126-iteration-58';
const THEORY_WORKER_URL='scripts/engine/iteration-worker.js?v='+THEORY_REVISION;
function loadOfflineTheorySource(){
 if(typeof FACTORY_ITERATION_OFFLINE_SOURCE==='string')return Promise.resolve(FACTORY_ITERATION_OFFLINE_SOURCE);
 if(!offlineTheorySourcePromise)offlineTheorySourcePromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='scripts/engine/iteration-offline.js?v='+THEORY_REVISION;
  script.onload=()=>typeof FACTORY_ITERATION_OFFLINE_SOURCE==='string'?resolve(FACTORY_ITERATION_OFFLINE_SOURCE):reject(Error('离线数学资源内容无效'));
  script.onerror=()=>reject(Error('离线数学资源加载失败：'+script.src));document.head.appendChild(script);
 }).catch(e=>{offlineTheorySourcePromise=null;throw e;});
 return offlineTheorySourcePromise;
}
async function createStrictTheoryWorker(){
 if(typeof Worker==='undefined')throw Error('当前浏览器不支持数学 Worker');
 if(location.protocol!=='file:')return new Worker(THEORY_WORKER_URL);
 const source=await loadOfflineTheorySource(),url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
 try{const w=new Worker(url);w.factoryBlobURL=url;w.factoryWorkerSource=source;return w;}catch(e){URL.revokeObjectURL(url);throw e;}
}
function theoryWorkerLimit({hardwareConcurrency=1,deviceMemory,mobile=false}={}){
 const cores=Number.isFinite(hardwareConcurrency)?Math.max(1,Math.floor(hardwareConcurrency)):1;
 const cap=Number.isFinite(deviceMemory)&&deviceMemory<=2?1:mobile||Number.isFinite(deviceMemory)&&deviceMemory<=4?2:4;
 return Math.max(1,Math.min(cap,cores-1));
}
function theoryDeviceWorkerLimit(){
 return theoryWorkerLimit({hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,mobile:navigator.userAgentData?.mobile||(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.maxTouchPoints>1&&/Mac/i.test(navigator.platform))});
}
function disposeStrictTheoryWorker(w){
 if(!w)return;w.terminate();if(w.factoryBlobURL)URL.revokeObjectURL(w.factoryBlobURL);
}
// Object key order is not a physical change; array order still matters for
// tie-breaking, path direction and frozen priority. Rates are canonical rationals.
function theoryCanonicalJSON(value){
 return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
}
function theorySignature(layout=state){
 return theoryCanonicalJSON([
  layout.machines.map(m=>[m.id,m.type,m.x,m.y,dims(m),m.face||'E',getRecipe(m),m.item,m.inletItem,m.outFilters,!!m.ast1GamePorts,!!m.ast1Mirrored,m.ast1PortProfile]),
  layout.routes.map(r=>[r.id,r.from,r.to,r.path,r.openEndSide]),
  activeFrozenFactories(layout).map(f=>[f.id,f.rates])
 ]);
}
// Cache identity excludes scheme/name and frozen actor IDs, but preserves
// actor order (priority) and the grouping of each actor's signed rates.
function theoryCacheKey(layout=state){
 const signature=JSON.parse(theorySignature(layout));
 signature[2]=signature[2].map(([,rates])=>Object.entries(rates).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([item,rate])=>[item,rate]));
 return JSON.stringify(signature);
}
const THEORY_CACHE_MAX_ENTRIES=12,THEORY_CACHE_MAX_BYTES=2*1024*1024;
const THEORY_CACHE_STORAGE='astra-theory-cache-v2';
let theoryComponentMemo=[];
const theoryResultCache=new Map();let theoryCacheBytes=0,theoryCacheLoaded=false;
function theoryCacheValid(result){
 return result?.engine==='iteration'&&result.status==='iteration-complete'&&!result.calculating&&!result.failure&&!result.calculationTimedOut&&result.diagnostics?.unknownMetrics?.length===0;
}
function theoryCacheLoad(){
 if(theoryCacheLoaded)return;theoryCacheLoaded=true;
 try{
  const raw=localStorage.getItem(THEORY_CACHE_STORAGE);
  if(!raw||raw.length*2>THEORY_CACHE_MAX_BYTES)return;
  const data=JSON.parse(raw);
  if(data.revision!==THEORY_REVISION||!Array.isArray(data.entries))return;
  if(Array.isArray(data.componentMemo)&&JSON.stringify(data.componentMemo).length*2<=1024*1024)theoryComponentMemo=data.componentMemo;
  for(const [key,entry] of data.entries.slice(-THEORY_CACHE_MAX_ENTRIES)){
   if(typeof key!=='string'||typeof entry?.json!=='string'||!Array.isArray(entry.ids)||theoryResultCache.has(key))continue;
   const bytes=2*(key.length+entry.json.length+JSON.stringify(entry.ids).length);
   if(theoryCacheBytes+bytes>THEORY_CACHE_MAX_BYTES||!theoryCacheValid(JSON.parse(entry.json)))continue;
   theoryResultCache.set(key,{json:entry.json,ids:entry.ids,bytes});theoryCacheBytes+=bytes;
  }
 }catch{ /* unavailable, corrupt or blocked storage: in-memory cache remains usable */ }
}
function theoryCachePersist(){
 try{
  const encode=()=>JSON.stringify({revision:THEORY_REVISION,componentMemo:theoryComponentMemo,entries:[...theoryResultCache].map(([key,{json,ids}])=>[key,{json,ids}])});
  let raw=encode();
  while(raw.length*2>THEORY_CACHE_MAX_BYTES&&theoryResultCache.size){theoryCacheForget(theoryResultCache.keys().next().value,false);raw=encode();}
  localStorage.setItem(THEORY_CACHE_STORAGE,raw);
 }catch{ /* storage quota must not prevent computation */ }
}
function theoryCacheForget(key,persist=true){
 theoryCacheLoad();
 const old=theoryResultCache.get(key);if(!old)return;
 theoryCacheBytes-=old.bytes;theoryResultCache.delete(key);if(persist)theoryCachePersist();
}
function theoryCacheGet(key,layout=state){
 theoryCacheLoad();
 const entry=theoryResultCache.get(key);if(!entry)return null;
 const ids=activeFrozenFactories(layout).map(f=>f.id);
 if(ids.length!==entry.ids.length)return null;
 const value=JSON.parse(entry.json);
 for(const target of [value,value.fractions]){
  if(target?.frozenDuty)target.frozenDuty=Object.fromEntries(ids.map((id,i)=>[id,target.frozenDuty[entry.ids[i]]]));
 }
 theoryResultCache.delete(key);theoryResultCache.set(key,entry);theoryCachePersist();
 value.diagnostics={...value.diagnostics,cacheHit:true};
 return value;
}
function theoryCachePut(key,result,layout=state){
 theoryCacheLoad();if(!theoryCacheValid(result))return false;
 const {componentMemo,...stored}=result;
 const ids=activeFrozenFactories(layout).map(f=>f.id),json=JSON.stringify(stored),bytes=2*(key.length+json.length+JSON.stringify(ids).length);
 if(bytes>THEORY_CACHE_MAX_BYTES)return false;
 theoryCacheForget(key,false);
 while(theoryResultCache.size>=THEORY_CACHE_MAX_ENTRIES||theoryCacheBytes+bytes>THEORY_CACHE_MAX_BYTES)theoryCacheForget(theoryResultCache.keys().next().value,false);
 theoryResultCache.set(key,{json,ids,bytes});theoryCacheBytes+=bytes;theoryCachePersist();return theoryResultCache.has(key);
}
function cancelTheoryCalculation(){
 theoryJob=null;
 if(theoryProgressTimer!==null){clearInterval(theoryProgressTimer);theoryProgressTimer=null;}
 if(theoryWorker){disposeStrictTheoryWorker(theoryWorker);theoryWorker=null;}
 if(theoryWorkerTimer!==null){clearTimeout(theoryWorkerTimer);theoryWorkerTimer=null;}
}
function invalidateTheoryIfChanged(){
 const key=theorySignature();
 if(theoryLayoutKey===key&&theoreticalBudget!==null)return false;
 cancelTheoryCalculation();theoryLayoutKey=null;theoreticalBudget=null;return true;
}
// A failed request must not permanently lock the same layout to an error.
function retryTheoryCalculation(){
 theoryComponentMemo=[];theoryCacheForget(theoryCacheKey());
 cancelTheoryCalculation();theoryLayoutKey=null;theoreticalBudget=null;
 warehouseRefresh();inspectorRefresh();draw();
}
function requestTheoryBudget({backgroundMs=THEORY_BACKGROUND_MS}={}){
 const key=theorySignature();
 if(key===theoryLayoutKey&&theoreticalBudget!==null)return theoreticalBudget;
 cancelTheoryCalculation();theoryLayoutKey=key;
 const cacheKey=theoryCacheKey(),cached=theoryCacheGet(cacheKey);if(cached){theoreticalBudget=cached;return cached;}
 const pending=certifiedEmptyBudget(state,{calculating:true}),job={key,current:pending,partial:null,started:performance.now(),budgetMs:backgroundMs},layout=copy(state);
 theoryJob=job;
 theoryProgressTimer=setInterval(()=>{if(theoryJob===job&&typeof updateTheoryProgress==='function')updateTheoryProgress()},100);
 function complete(result,reason=null,timedOut=false){
  if(theoryJob!==job)return;
  cancelTheoryCalculation();
  if(theorySignature()!==key||theoreticalBudget!==job.current)return;
  theoreticalBudget=result||(job.partial?{...job.partial,calculating:false,calculationTimedOut:timedOut,notice:reason||'后台计算中断，保留首轮结果',diagnostics:{...job.partial.diagnostics,proofSearchLimited:true}}:certifiedEmptyBudget(state,{reason:reason||'数学 Worker 未返回有效结果',failure:timedOut?'timeout':'worker-error'}));
  theoreticalBudget.diagnostics={...theoreticalBudget.diagnostics,wallElapsedMs:Math.max(0,Math.round(performance.now()-job.started))};
  if(Array.isArray(result?.componentMemo))theoryComponentMemo=result.componentMemo;
  if(result)theoryCachePut(cacheKey,theoreticalBudget,layout);
  warehouseRefresh();
  if(typeof inspectorRefreshTheory==='function')inspectorRefreshTheory();else if(typeof inspectorRefresh==='function')inspectorRefresh();
  if(typeof draw==='function')draw();
 }
 theoryWorkerTimer=setTimeout(()=>complete(null,'周期迭代预算耗尽',true),backgroundMs);
 createStrictTheoryWorker().then(worker=>{
  if(theoryJob!==job){disposeStrictTheoryWorker(worker);return;}
  theoryWorker=worker;
  worker.onmessage=e=>{
   if(e.data?.progress){
    if(theoryJob!==job||theorySignature()!==key||theoreticalBudget!==job.current)return;
    job.partial=e.data.progress;job.current={...job.partial,calculating:true,background:true};
    theoreticalBudget=job.current;warehouseRefresh();if(typeof inspectorRefreshTheory==='function')inspectorRefreshTheory();else if(typeof inspectorRefresh==='function')inspectorRefresh();return;
   }
   complete(e.data?.result||null,e.data?.error);
  };
  worker.onerror=e=>{e.preventDefault?.();complete(null,'独立迭代 Worker 执行失败：'+(e.message||e.filename||'检查脚本是否完整部署'));};
  worker.onmessageerror=()=>complete(null,'数学 Worker 消息无法读取');
  worker.postMessage({layout,componentMemo:theoryComponentMemo,budgetMs:Math.max(1,backgroundMs-200),uiBudget:true,progress:true,workerSource:worker.factoryWorkerSource,workerLimit:theoryDeviceWorkerLimit()});
 }).catch(error=>complete(null,'无法启动独立迭代 Worker：'+String(error.message||error)));
 return pending;
}
