'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file=path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-button-'));
let child;const http=require('http');const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/project-astra-factory\//,'');const full=path.resolve(__dirname,'..',p);const root=path.resolve(__dirname,'..');if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',full.endsWith('.js')?'application/javascript':full.endsWith('.css')?'text/css':full.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(fs.readFileSync(full));});
async function poll(f){for(let i=0;i<650;i++){try{const v=await f();if(v)return v;}catch(e){}await new Promise(r=>setTimeout(r,200));}throw new Error('Edge CDP timeout');}
(async()=>{
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,(process.argv.includes('--file')?'file:///'+file:'http://127.0.0.1:'+server.address().port+'/project-astra-factory/index.html')],{stdio:'ignore',windowsHide:true});
  const active=await poll(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8'):null);
  const port=active.trim().split(/\r?\n/)[0];
  const targets=await poll(async()=>{const a=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return a.find(x=>x.type==='page'&&x.url.includes('project-astra-factory'))?a:null;});
  const target=targets.find(x=>x.type==='page'&&x.url.includes('project-astra-factory'));
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let next=0;const pending=new Map();const exceptions=[];
  ws.onmessage=ev=>{
   const msg=JSON.parse(ev.data);
   if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.text+' '+(msg.params.exceptionDetails.exception?.description||''));
   if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);p(msg);}}
  };
  const send=(method,params={})=>new Promise(resolve=>{const id=++next;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expr=>{const ret=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return ret.result?.result?.value??ret.result?.exceptionDetails?.text??ret.error??ret;};
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.reload',{ignoreCache:true});
  await poll(async()=>await evaluate('document.readyState==="complete"'));
  await new Promise(r=>setTimeout(r,350));




  if(process.argv.includes('--resonance')){
   const ast=fs.readFileSync(path.join(__dirname,'fixtures','ast1-user-resonance-boundary-v1.txt'),'utf8').trim();
   await evaluate(`(()=>{document.querySelector('[data-edit-action="import-ast"]').click();$('ast1Text').value=${JSON.stringify(ast)};$('ast1Apply').click();$('warehousePanel').open=true;if(!warehouseCardOpen.theory)document.querySelector('[data-ledger-toggle="theory"]').click();return true})()`);
   await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
   const base=await evaluate("(()=>{const b=theoreticalBudget;return {status:b.status,items:b.warehouseItems,wall:b.diagnostics.wallElapsedMs,steps:b.diagnostics.searchStats?.stepCalls,memo:theoryComponentMemo.length,readers:state.machines.filter(m=>m.type==='仓出').length,fractions:b.fractions}})()");
   console.log('RESONANCE_BASE',JSON.stringify({...base,fractions:undefined}));
   assert.equal(base.status,'iteration-complete');assert.deepEqual(base.items,['曲速线圈']);assert.equal(base.readers,0);
   for(const rate of ['1/3','-1/2']){
    await evaluate(`(()=>{frozenCommit([{id:'resonance',name:'共鸣水晶',enabled:true,rates:{'共鸣水晶':${JSON.stringify(rate)}}}],'test');return true})()`);
    await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
    const r=await evaluate("(()=>{const b=theoreticalBudget;return {status:b.status,wall:b.diagnostics.wallElapsedMs,steps:b.diagnostics.searchStats.stepCalls,hits:b.diagnostics.componentCacheHits,items:b.warehouseItems,fractions:b.fractions}})()");
    assert.equal(r.status,'iteration-complete');assert.equal(r.steps,0);assert(r.hits>0);
    for(const k of ['machineCycles','machineTotals','machineMaterials','routeTotals','routes','machineTimes'])assert.deepEqual(r.fractions[k],base.fractions[k],k);
    assert.equal(r.fractions.net['共鸣水晶'],rate.startsWith('-')?'0':rate);
    assert.equal(r.fractions.potentialNet['共鸣水晶'],rate);assert.equal(r.fractions.overdraftNet['共鸣水晶'],rate);
    console.log('RESONANCE_EDIT',JSON.stringify({rate,status:r.status,wall:r.wall,steps:r.steps,hits:r.hits,net:r.fractions.net['共鸣水晶']}));
   }
   ws.close();return;
  }
  const user84=process.argv.includes('--user84');
  const fixture=user84?'ast1-user-84-78-v1.txt':process.argv.includes('--file')?'ast1-warehouse-slow-miner-v1.txt':'ast1-warehouse-port-balance-v1.txt';
  const variant=fixture.includes('slow-miner'),ast=fs.readFileSync(path.join(__dirname,'fixtures',fixture),'utf8').trim();
  assert.equal(await evaluate('typeof factoryCertifiedResearchPreview'),'undefined');
  assert.equal(await evaluate('THEORY_WORKER_URL.includes("iteration-worker.js")'),true);
  const caps=await evaluate("JSON.stringify([theoryWorkerLimit({hardwareConcurrency:1}),theoryWorkerLimit({hardwareConcurrency:2}),theoryWorkerLimit({hardwareConcurrency:4,mobile:true}),theoryWorkerLimit({hardwareConcurrency:8,deviceMemory:2}),theoryWorkerLimit({hardwareConcurrency:8,deviceMemory:4}),theoryWorkerLimit({hardwareConcurrency:24,deviceMemory:16})])");
  assert.deepEqual(JSON.parse(caps),[1,1,2,1,2,4]);

  const imported=await evaluate(`(()=>{document.querySelector('[data-edit-action="import-ast"]').click();$('ast1Text').value=${JSON.stringify(ast)};$('ast1Apply').click();$('warehousePanel').open=true;if(!warehouseCardOpen.theory)document.querySelector('[data-ledger-toggle="theory"]').click();return {machines:state.machines.length,routes:state.routes.length,saved:currentScheme()?.ast===${JSON.stringify(ast)}}})()`);
  assert.deepEqual(imported,user84?{machines:84,routes:78,saved:true}:{machines:115,routes:84,saved:true});
  const machineProgress=await evaluate(`(()=>{const m=state.machines.find(m=>getRecipe(m)&&Object.keys(getRecipe(m).inputs||{}).length);selection={machineId:m.id};inspectorRefresh();const root=$('inspector'),track=root.querySelector('.machine-progress-track'),fill=root.querySelector('.machine-progress-fill'),style=getComputedStyle(track),bar=getComputedStyle(fill);return {height:style.height,border:style.borderTopWidth,background:style.backgroundColor,fill:bar.backgroundColor,value:track.getAttribute('aria-valuenow'),status:root.querySelector('[data-progress-status]').textContent}})()`);
  assert.deepEqual(machineProgress,{height:'5px',border:'0px',background:'rgb(49, 70, 92)',fill:'rgb(105, 167, 207)',value:'0',status:'等待原料'});
  console.log('MACHINE_PROGRESS_STYLE',JSON.stringify(machineProgress));
  let initialItems=null;
  if(user84){
   assert.equal(await evaluate('THEORY_BACKGROUND_MS'),60000);
   const pending=await evaluate("(()=>{const root=$('warehouse').querySelector('.ledger-panel'),p=root.querySelector('[data-theory-progress]');return {items:theoreticalBudget.warehouseItems,rows:root.querySelectorAll('tbody tr').length,max:p?.querySelector('progress').max,before:!!p?.nextElementSibling?.querySelector('table'),job:!!theoryJob}})()");
   assert.equal(pending.max,60000);assert(pending.before&&pending.job);assert.equal(pending.items.length,8);assert.equal(pending.rows,9);initialItems=pending.items;

   await poll(async()=>await evaluate('theoreticalBudget?.background===true'));
   const progress=await evaluate("(()=>new Promise(resolve=>{const start=performance.now();setTimeout(()=>{warehouseRefresh();resolve({elapsed:performance.now()-start,background:theoreticalBudget.background,calculating:theoreticalBudget.calculating,worker:!!theoryWorker,known:theoreticalBudget.diagnostics.actualQueries.known,text:$('warehouse').innerText.includes('后台计算中')})},50)}))()");
   assert(progress.elapsed<1000,JSON.stringify(progress));assert(progress.background&&progress.calculating&&progress.worker&&progress.text);assert(progress.known>0);
   const live=await evaluate("(()=>new Promise(resolve=>{const p=$('warehouse').querySelector('[data-theory-progress] progress'),v=p.value,j=theoryJob;setTimeout(()=>{const q=$('warehouse').querySelector('[data-theory-progress] progress');resolve({advanced:q.value>v,sameJob:j===theoryJob,items:theoreticalBudget.warehouseItems,rows:$('warehouse').querySelector('.ledger-panel').querySelectorAll('tbody tr').length})},250)}))()");
   assert(live.advanced&&live.sameJob);assert.deepEqual(live.items,initialItems);assert.equal(live.rows,9);

   console.log('BACKGROUND_RESPONSIVE',JSON.stringify(progress));
  }
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  const actual=await evaluate(`(()=>{const b=theoreticalBudget,unknown=[],root=$('inspector');
   for(const m of state.machines){selection={machineId:m.id};inspectorRefresh();const v=b.machineTotals[m.id];if(v?.in==null||v?.out==null||getRecipe(m)&&b.machineCycles[m.id]==null)unknown.push(m.id);if([...root.querySelectorAll('.machine-flow-tile .tile-value,.machine-port-details-body b,.machine-duty-grid b')].some(e=>e.textContent.trim().startsWith('—')))unknown.push('DOM:'+m.id)}
   for(const r of state.routes){selection={routeId:r.id};inspectorRefresh();if(b.routeTotals[r.id]==null)unknown.push(r.id);if([...root.querySelectorAll('.machine-flow-tile .tile-value,.machine-theory .kv b')].some(e=>e.textContent.trim().startsWith('—')))unknown.push('DOM:'+r.id)}
   const table=[...$('warehouse').querySelector('.ledger-panel').querySelectorAll('tbody tr')].flatMap(r=>[...r.cells].slice(1).map(c=>c.textContent.trim()));
   return {engine:b.engine,method:b.diagnostics.solutionMethod,status:b.status,failure:b.failure,unknown,metrics:b.diagnostics.unknownMetrics,elapsed:b.diagnostics.elapsedMs,parallel:b.diagnostics.parallelBranches,workerLimit:b.diagnostics.workerLimit,pressure:b.diagnostics.parallelPressure,cores:navigator.hardwareConcurrency,searchStats:b.diagnostics.searchStats,alloy:b.fractions?.potentialNet?.['合金板'],wire:b.fractions?.potentialNet?.['导线线圈'],totals:b.fractions?.totals,periods:Object.keys(b.fractions?.machineTimes||{}).length,tableKnown:table.filter(x=>x!=='—').length,tableCount:table.length,simTime,offline:typeof FACTORY_ITERATION_OFFLINE_SOURCE,notice:$('warehouse').innerText.includes('解 · 用时'),wall:b.diagnostics.wallElapsedMs,chip:$('warehouse').querySelector('.ledger-panel .ledger-chip').textContent};})()`);
  console.log('ITERATION_BROWSER',JSON.stringify(actual));
  assert.equal(await evaluate("!!$('warehouse').querySelector('[data-theory-progress]')"),false);
  if(user84)assert.deepEqual(await evaluate('theoreticalBudget.warehouseItems'),initialItems);
  assert.equal(actual.engine,'iteration');assert.equal(actual.status,'iteration-complete');assert.equal(actual.failure,null);assert.deepEqual(actual.unknown,[]);assert.deepEqual(actual.metrics,[]);
  assert.equal(actual.alloy,user84?'1/18':variant?'-1/9':'-2/3');assert.equal(actual.wire,user84?'-1/3':variant?'-3/10':'-4/15');if(!user84)assert.equal(actual.totals.potential,variant?'23/30':'2/45');
  if(user84)assert(actual.searchStats.resumedSearches>0);assert(actual.searchStats.peakCheckpoints<=257);assert(actual.searchStats.quietTicks>0);if(!user84)assert.equal(actual.periods,57);else assert.equal(actual.periods,await evaluate('state.machines.filter(m=>getRecipe(m)||m.type==="仓出").length'));assert.equal(actual.tableKnown,user84?45:75);assert.equal(actual.tableCount,user84?45:75);assert.equal(actual.simTime,0);assert(actual.notice);
  assert(actual.method.kind==='mixed'||actual.method.kind==='iteration');
  const label=await evaluate("theorySolutionLabel(theoreticalBudget)");
  assert.equal(label,actual.method.kind==='mixed'?'迭代+精确解':'迭代解');
  assert(Number.isFinite(actual.wall)&&actual.wall>=0);assert.equal(actual.chip,label+' · 用时'+(actual.wall/1000).toFixed(3)+'s · 件/分钟');
  const methodLabels=await evaluate("JSON.stringify([['exact-model-period'],['exact-model-analytic'],['exact-model-period','exact-model-analytic'],[]].map(xs=>{const p={completeHtmlQueries:xs.length>0,actual:{components:xs.map(actualStatus=>({actualStatus}))}};return theorySolutionLabel({status:xs.length?'iteration-complete':'iteration-partial',diagnostics:{solutionMethod:iterationSolutionMethod(p)}})}))");
  assert.deepEqual(JSON.parse(methodLabels),['迭代解','精确解','迭代+精确解','未求解']);

  assert.equal(actual.offline,process.argv.includes('--file')?'string':'undefined');
  const diagnostic=await evaluate(`(()=>{const d=$('warehouse').querySelector('.theory-diagnostics'),table=d.previousElementSibling;const before={open:d.open,summary:d.querySelector('summary').textContent,afterTable:!!table?.querySelector('table')};d.open=true;warehouseRefresh();before.retained=$('warehouse').querySelector('.theory-diagnostics').open;return before})()`);
  assert.equal(diagnostic.open,false);assert(diagnostic.afterTable);assert(diagnostic.retained);assert(!/\d+机|\d+线/.test(diagnostic.summary));assert(diagnostic.summary.includes('数学方法'));
  if(user84){
   const cache=await evaluate(`(()=>{const original=copy(state),key=theoryCacheKey(),rates=JSON.stringify(theoreticalBudget.fractions);const start=performance.now();state={machines:[],routes:[],frozenFactories:[]};invalidateTheoryIfChanged();requestTheoryBudget();state=original;invalidateTheoryIfChanged();const b=requestTheoryBudget();warehouseRefresh();return {same:JSON.stringify(b.fractions)===rates,hit:b.diagnostics.cacheHit===true,idle:theoryJob===null,elapsed:performance.now()-start,progress:!!$('warehouse').querySelector('[data-theory-progress]'),entries:theoryResultCache.size,bytes:theoryCacheBytes,key:theoryResultCache.has(key),wall:b.diagnostics.wallElapsedMs,chip:$('warehouse').querySelector('.ledger-panel .ledger-chip').textContent}})()`);
   assert(cache.same&&cache.hit&&cache.idle&&cache.key&&!cache.progress);assert.equal(cache.wall,actual.wall);assert.equal(cache.chip,actual.chip);assert(cache.elapsed<1000);assert(cache.entries<=12&&cache.bytes<=4*1024*1024);
   const lru=await evaluate(`(()=>{const b={engine:'iteration',status:'iteration-complete',diagnostics:{unknownMetrics:[]}};for(let i=0;i<12;i++)theoryCachePut('test:'+i,b);theoryCacheGet('test:0');theoryCachePut('test:12',b);const x={size:theoryResultCache.size,retained:theoryResultCache.has('test:0'),evicted:!theoryResultCache.has('test:1'),partial:theoryCachePut('partial',{...b,status:'iteration-partial'}),oversized:theoryCachePut('oversized',{...b,notice:'x'.repeat(3*1024*1024)}),bounded:theoryCacheBytes<=THEORY_CACHE_MAX_BYTES};for(const k of [...theoryResultCache.keys()])if(k.startsWith('test:'))theoryCacheForget(k);return x})()`);
   assert.deepEqual(lru,{size:12,retained:true,evicted:true,partial:false,oversized:false,bounded:true});
   console.log('THEORY_CACHE',JSON.stringify({cache,lru}));
  }
  if(process.argv.includes('--compare-parallel')){
   const result=await evaluate(`(async()=>{const run=async parallel=>{const w=await createStrictTheoryWorker();return new Promise((resolve,reject)=>{const started=performance.now();const timeout=setTimeout(()=>{disposeStrictTheoryWorker(w);reject(Error('benchmark timeout'))},60000);w.onmessage=e=>{if(!e.data.result){if(e.data.error){clearTimeout(timeout);disposeStrictTheoryWorker(w);reject(Error(e.data.error))}return}const r=e.data.result;clearTimeout(timeout);disposeStrictTheoryWorker(w);resolve({elapsed:performance.now()-started,branches:r.diagnostics.parallelBranches,complete:r.status,exact:r.fractions})};w.onerror=e=>{clearTimeout(timeout);disposeStrictTheoryWorker(w);reject(Error(e.message))};w.postMessage({layout:copy(state),budgetMs:59000,uiBudget:true,parallel,workerSource:w.factoryWorkerSource,workerLimit:theoryDeviceWorkerLimit()})})};const a=await run(false),b=await run(true);return {serial:a.elapsed,parallel:b.elapsed,branches:b.branches,same:JSON.stringify(a.exact)===JSON.stringify(b.exact),status:[a.complete,b.complete]}})()`);
   assert(result.same&&result.status.every(s=>s==='iteration-complete'),JSON.stringify(result));console.log('PARALLEL_COMPARISON',JSON.stringify(result));
  }
  if(process.argv.includes('--compare-device')){
   const result=await evaluate(`(async()=>{const layout=copy(state);const run=async workerLimit=>{const w=await createStrictTheoryWorker();return new Promise((resolve,reject)=>{const start=performance.now(),timer=setTimeout(()=>{disposeStrictTheoryWorker(w);reject(Error('device timeout'))},60000);w.onmessage=e=>{if(!e.data.result){if(e.data.error){clearTimeout(timer);disposeStrictTheoryWorker(w);reject(Error(e.data.error))}return}const r=e.data.result;clearTimeout(timer);disposeStrictTheoryWorker(w);resolve({ms:performance.now()-start,limit:r.diagnostics.workerLimit,branches:r.diagnostics.parallelBranches,status:r.status,fractions:r.fractions})};w.onerror=e=>{clearTimeout(timer);disposeStrictTheoryWorker(w);reject(Error(e.message))};w.postMessage({layout,workerLimit,budgetMs:59000,uiBudget:true,workerSource:w.factoryWorkerSource})})};const a=await run(1),b=await run(2);return {a:{ms:a.ms,limit:a.limit,branches:a.branches,status:a.status},b:{ms:b.ms,limit:b.limit,branches:b.branches,status:b.status},same:JSON.stringify(a.fractions)===JSON.stringify(b.fractions)}})()`);
   assert(result.same&&result.a.status==='iteration-complete'&&result.b.status==='iteration-complete');assert.equal(result.a.limit,1);assert.equal(result.a.branches,1);assert.equal(result.b.limit,2);assert.equal(result.b.branches,2);
   console.log('DEVICE_LIMIT_COMPARISON',JSON.stringify(result));
  }
  // Real frozen input conversion, joint consumption, and independent worker path.
  await evaluate(`(()=>{state={name:'frozen',machines:[],routes:[],frozenFactories:[{id:'s',rates:{'合金板':'1/2','能量电池':'3/4'}},{id:'m',rates:{'合金板':'-1','能量电池':'-1','硅晶圆':'1'}}]};invalidateTheoryIfChanged();resetSimulation();refresh();return true})()`);
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  const frozen=await evaluate(`(()=>{const b=theoreticalBudget;return {status:b.status,net:b.fractions.net['合金板'],potential:b.fractions.potentialNet['合金板'],overdraft:b.fractions.overdraftNet['合金板'],duty:b.fractions.frozenDuty.m,parsed:frozenFromMinute('16/3'),display:frozenDisplayMinute('4/45'),simTime}})()`);
  assert.deepEqual(frozen,{status:'iteration-complete',net:'0',potential:'-1/4',overdraft:'-1/2',duty:'1/2',parsed:'4/45',display:'16/3',simTime:0});
  assert.equal(exceptions.length,0,exceptions.join(' | '));
  console.log('FROZEN_BROWSER',JSON.stringify(frozen));
  assert.equal(await evaluate("theorySolutionLabel(theoreticalBudget)"),'迭代+精确解');
  // Real pure analytical worker result, followed by restoring the mixed layout.
  const methodCheck=await evaluate(`(async()=>{const saved=copy(state),wait=async()=>{for(let i=0;i<250;i++){if(theoreticalBudget?.calculating===false)return;await new Promise(r=>setTimeout(r,20))}throw Error('method timeout')};state={machines:[],routes:[],frozenFactories:[{id:'solo',rates:{'合金板':'1/997'}}]};invalidateTheoryIfChanged();refresh();await wait();const label=theorySolutionLabel(theoreticalBudget),rate=theoreticalBudget.fractions.inflow['合金板'],chip=$('warehouse').querySelector('.ledger-panel .ledger-chip').textContent;state=saved;invalidateTheoryIfChanged();refresh();await wait();return {label,rate,chip,restored:theorySolutionLabel(theoreticalBudget)}})()`);
  assert.deepEqual(methodCheck,{label:'精确解',rate:'1/997',chip:'精确解 · 件/分钟',restored:'迭代+精确解'});
  console.log('SOLUTION_METHOD',JSON.stringify(methodCheck));

  const combo=await evaluate(`(()=>{const b=theoreticalBudget,old=theoryCacheKey(),other=copy(state);other.name='another scheme';other.frozenFactories[0].id='different-source';other.frozenFactories[1].id='different-reader';other.frozenFactories[0].rates['合金板']='2/4';other.frozenFactories[0].rates['燃料罐']='0';other.frozenFactories.push({id:'disabled',enabled:false,rates:{'合金板':'123'}});const same=theoryCacheKey(other)===old,c=theoryCacheGet(old,other);const reversed=copy(other);reversed.frozenFactories.reverse();const grouped=copy(other);grouped.frozenFactories[0].rates['硅晶圆']='1';delete grouped.frozenFactories[1].rates['硅晶圆'];return {same,renamed:c?.fractions.frozenDuty['different-reader'],source:c?.fractions.frozenDuty['different-source'],reversed:theoryCacheKey(reversed)!==old,grouped:theoryCacheKey(grouped)!==old,stored:JSON.parse(localStorage.getItem(THEORY_CACHE_STORAGE)).revision===THEORY_REVISION}})()`);
  assert.deepEqual(combo,{same:true,renamed:'1/2',source:'1',reversed:true,grouped:true,stored:true});
  console.log('CACHE_COMBINATION',JSON.stringify(combo));
  const keyShape=await evaluate("JSON.parse(theoryCacheKey())[2]");
  assert.deepEqual(keyShape,[[['合金板','1/2'],['能量电池','3/4']],[['合金板','-1'],['硅晶圆','1'],['能量电池','-1']]]);


  // Equivalence edits use the real commit path; a true change replaces the job.
  const noOp=await evaluate(`(()=>{const b=theoreticalBudget,key=theoryLayoutKey;const list=frozenFactoriesList();list[0].rates['合金板']='2/4';list[0].rates['燃料罐']='0';frozenCommit(list);return {same:b===theoreticalBudget,key:theoryLayoutKey===key,idle:theoryJob===null,items:theoreticalBudget.warehouseItems}})()`);
  assert(noOp.same&&noOp.key&&noOp.idle);assert(!noOp.items.includes('燃料罐'));
  if(user84){
   const changes=await evaluate(`(()=>{const a=frozenFactoriesList();a[0].rates['合金板']='2';frozenCommit(a);const j=theoryJob,b=theoreticalBudget,key=theoryLayoutKey;const a2=frozenFactoriesList();a2[0].rates['合金板']='4/2';a2[0].rates['燃料罐']='0';frozenCommit(a2);const same=theoryJob===j&&theoreticalBudget===b&&theoryLayoutKey===key;const a3=frozenFactoriesList();a3[0].rates['合金板']='3';frozenCommit(a3);return {same,replaced:!!theoryJob&&theoryJob!==j,reset:theoryJob.started>=j.started,max:$('warehouse').querySelector('[data-theory-progress] progress')?.max}})()`);
   assert.deepEqual(changes,{same:true,replaced:true,reset:true,max:60000});
   await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
   assert.equal(await evaluate("theoreticalBudget.fractions.inflow['合金板']"),'3');
   console.log('NOOP_AND_RESET',JSON.stringify({noOp,changes}));
  }

  if(user84){
   const priority=await evaluate(`(async()=>{const initial=copy(state);const wait=async()=>{for(let i=0;i<200;i++){if(theoreticalBudget?.calculating===false)return;await new Promise(r=>setTimeout(r,20))}throw Error('priority wait timeout')};const apply=async list=>{state={machines:[],routes:[],frozenFactories:list};invalidateTheoryIfChanged();resetSimulation();refresh();await wait();return {key:theoryCacheKey(),hit:theoreticalBudget.diagnostics.cacheHit===true,duty:theoreticalBudget.fractions.frozenDuty}};const source={id:'s',rates:{'合金板':'20'}},a={id:'a',rates:{'合金板':'-20','硅晶圆':'20'}},b={id:'b',rates:{'合金板':'-20','燃料罐':'20'}};const first=await apply([source,a,b]),second=await apply([source,b,a]),back=await apply([source,a,b]);state=initial;invalidateTheoryIfChanged();resetSimulation();refresh();await wait();return {different:first.key!==second.key,first:first.duty,second:second.duty,back:back.duty,hit:back.hit,sameKey:first.key===back.key}})()`);
   assert.deepEqual(priority,{different:true,first:{s:'1',a:'1',b:'0'},second:{s:'1',b:'1',a:'0'},back:{s:'1',a:'1',b:'0'},hit:true,sameKey:true});
   console.log('PRIORITY_CACHE_RESTORE',JSON.stringify(priority));
  }
  const placement=await evaluate(`(async()=>{const saved=copy(state),wait=async()=>{for(let i=0;i<250;i++){if(theoreticalBudget?.calculating===false)return;await new Promise(r=>setTimeout(r,20))}throw Error('placement timeout')};state={name:'placement warning',machines:[{id:'M0',type:'垃圾',mode:1,x:5,y:10,face:'E'},{id:'M1',type:'仓入',x:25,y:10,face:'E'},{id:'M2',type:'组装',mode:'框架模块',x:5,y:30,face:'E'},{id:'M3',type:'垃圾',mode:0,x:5,y:45,face:'E'}],routes:[{id:'R0',from:{id:'M0',port:0},to:{id:'M1',port:0},path:[[0,0],[1,0]]},{id:'R1',from:{id:'M3',port:0},to:null,path:[[0,1]]}],frozenFactories:[]};const warning=!!checkPath(state.routes[0].path,state.routes[0].from,state.routes[0].to,'R0');invalidateTheoryIfChanged();resetSimulation();refresh();await wait();const b=theoreticalBudget,result={warning,complete:b.status,failure:b.failure,income:b.fractions.inflow['遐想物质'],open:b.fractions.routeTotals.R1,isolated:b.fractions.machineTimes.M2,dead:b.fractions.machineTimes.M3};state=saved;invalidateTheoryIfChanged();resetSimulation();refresh();await wait();return result})()`);
  assert.deepEqual(placement,{warning:true,complete:'iteration-complete',failure:null,income:'2/15',open:'0',isolated:'Infinity',dead:'Infinity'});
  console.log('PLACEMENT_NOT_MATH_FAILURE',JSON.stringify(placement));
  // Refresh must reset the details disclosure even if it was expanded.
  await evaluate("(()=>{const d=$('warehouse').querySelector('.theory-diagnostics');d.open=true;return d.open})()");
  const cachedLayout=await evaluate("copy(state)"),cachedKey=await evaluate("theoryCacheKey()"),cachedTime=await evaluate("theoreticalBudget.diagnostics.wallElapsedMs??theoreticalBudget.diagnostics.elapsedMs");
  await send('Page.reload',{ignoreCache:true});
  await poll(async()=>await evaluate('document.readyState==="complete"&&typeof theoreticalBudget!=="undefined"'));
  await evaluate("(()=>{$('warehousePanel').open=true;if(!warehouseCardOpen.theory)document.querySelector('[data-ledger-toggle=theory]').click();return true})()");
  await poll(async()=>await evaluate("theoreticalBudget?.calculating===false&&!!$('warehouse').querySelector('.theory-diagnostics')"));
  assert.equal(await evaluate("$('warehouse').querySelector('.theory-diagnostics').open"),false);
  const persisted=await evaluate(`(()=>{const l=${JSON.stringify(cachedLayout)},k=${JSON.stringify(cachedKey)},b=theoryCacheGet(k,l);return {hit:b?.diagnostics.cacheHit===true,entries:theoryResultCache.size,bytes:theoryCacheBytes,revision:JSON.parse(localStorage.getItem(THEORY_CACHE_STORAGE)).revision,originalTime:b?.diagnostics.wallElapsedMs??b?.diagnostics.elapsedMs}})()`);
  assert(persisted.hit&&persisted.entries<=12&&persisted.bytes<=2*1024*1024);assert.equal(persisted.originalTime,cachedTime);console.log('CACHE_RELOAD',JSON.stringify(persisted));

  console.log('DIAGNOSTICS_UI',JSON.stringify(diagnostic),'reloadCollapsed=true');

  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child?.kill();server.close();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
