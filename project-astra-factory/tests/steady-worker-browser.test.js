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




  const absent=await evaluate('({condition:typeof factoryDirectWarehouseTheory,legacy:typeof factorySteadyAutomaticFluidBudget,oldEquations:typeof factorySteadyBuildEquations})');
  assert.deepEqual(absent,{condition:'undefined',legacy:'undefined',oldEquations:'undefined'});
  const f=(id,rates)=>({id,name:id,enabled:true,rates});
  const sample={name:'strict-competition',machines:[],routes:[],frozenFactories:[f('s',{'合金板':'1'}),f('a',{'合金板':'-2','硅晶圆':'3'}),f('b',{'合金板':'-3','能量电池':'5'})]};
  const started=await evaluate(`(()=>{state=${JSON.stringify(sample)};invalidateTheoryIfChanged();theoreticalBudget=requestTheoryBudget();warehouseCardOpen.theory=true;warehouseRefresh();return {pending:theoreticalBudget.calculating,notice:theoreticalBudget.notice}})()`);
  assert(started.pending,JSON.stringify(started));
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  const first=await evaluate(`(()=>({status:theoreticalBudget.status,mode:theoreticalBudget.proofMode,rate:theoreticalBudget.fractions?.net?.['合金板'],out:theoreticalBudget.fractions?.outflow?.['合金板'],duty:theoreticalBudget.fractions?.frozenDuty?.a,text:$('warehouse').innerText,worker:theoryWorker===null}))()`);
  assert.equal(first.status,'iteration-complete');assert.equal(first.mode,'strict-counts');assert.equal(first.rate,'0');assert.equal(first.out,'1');assert.equal(first.duty,'1/2');assert(first.text.includes('解 · 用时'));assert(first.worker);
  const cache=await evaluate(`(()=>{const b=theoreticalBudget,k=theoryLayoutKey;state.name='only name';const invalid=invalidateTheoryIfChanged();for(let i=0;i<10;i++){warehouseView(false);draw(true)}return {invalid,same:b===theoreticalBudget,key:k===theoryLayoutKey,worker:theoryWorker===null}})()`);
  assert.deepEqual(cache,{invalid:false,same:true,key:true,worker:true});
  const edit=await evaluate(`(()=>{state.frozenFactories[0].rates['合金板']='2';const invalid=invalidateTheoryIfChanged();warehouseRefresh();return {invalid,pending:theoreticalBudget.calculating}})()`);
  assert.deepEqual(edit,{invalid:true,pending:true});
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  assert.equal(await evaluate("theoreticalBudget.fractions.outflow['合金板']"),'2');
  // Independent structural cases: actual route, open belt, missing recipe.
  const physical=await evaluate(`(()=>{
   const a={id:'M0',type:'垃圾',mode:1,x:5,y:10,face:'E'},b={id:'M1',type:'仓入',x:25,y:10,face:'E'},c={id:'M2',type:'组装',mode:'框架模块',x:5,y:30,face:'E'};
   const p=outPort(a,0);b.y+=p.ey-inPort(b,0).ey;const q=inPort(b,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
   state={name:'physical',machines:[a,b,c],routes:[{id:'R0',from:{id:a.id,port:0},to:{id:b.id,port:0},path}]};invalidateTheoryIfChanged();resetSimulation();refresh();return true;
  })()`);
  assert.equal(physical,true);
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  const actual=await evaluate(`(()=>({status:theoreticalBudget.status,income:theoreticalBudget.fractions.inflow['遐想物质'],zero:theoreticalBudget.fractions.machineCycles.M2,time:timeLabel(machineById('M2')),old:typeof factoryDirectTheory,complete:theoreticalBudget.diagnostics.rateSolved}))()`);
  assert.equal(actual.income,'2/15');assert.equal(actual.zero,'0');assert.equal(actual.time,'6s(∞)');assert.equal(actual.old,'undefined');
  const disconnected=await evaluate(`(()=>{state.routes[0].to=null;invalidateTheoryIfChanged();reconcileSimulationLayout();refresh();return theoreticalBudget.calculating})()`);assert.equal(disconnected,true);
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  assert.equal(await evaluate('theoreticalBudget.fractions.routeTotals.R0'),'0');
  const stacks=await evaluate(`(()=>{
   const a={id:'M0',type:'电池',mode:'标准',x:8,y:8,face:'E'},w={id:'M1',type:'仓入',x:35,y:8,face:'E'},c={id:'M2',type:'电脑',x:8,y:25,face:'E'};
   const p=outPort(a,0);w.y+=p.ey-inPort(w,0).ey;const q=inPort(w,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
   state={name:'manual stacks',machines:[a,w,c],routes:[{id:'R0',from:{id:a.id,port:0},to:{id:w.id,port:0},path}]};invalidateTheoryIfChanged();resetSimulation();refresh();
   simTime=1;ware['废金属']=8;sim.byMachine.M0.queue.push('能量电池','能量电池');
   selection={machineId:'M0'};inspectorRefresh();
   const root=$('inspector'),b=theoreticalBudget;
   const first=root.querySelector('.machine-production-panel > .item')?.id;
   const sections=[...root.querySelectorAll('.machine-analysis-heading')].map(x=>x.textContent.trim());
   sim.byMachine.M0.busy=1.25;simClockRemainder=0;running=true;inspectorRefreshLive();
   const initialFill=root.querySelector('.machine-progress-fill').style.transform;
   simClockRemainder=.02;inspectorRefreshProgress();
   const interpolatedFill=root.querySelector('.machine-progress-fill').style.transform;
   const clockUnchanged=sim.byMachine.M0.busy===1.25;
   running=false;inspectorRefreshProgress();const pausedFill=root.querySelector('.machine-progress-fill').style.transform;running=true;
   simClockRemainder=0;inspectorRefreshProgress();running=false;
   const dutyInAnalysis=!!root.querySelector('.machine-logistics-panel .machine-duty-section'),noIdle=!root.innerText.includes('等效停机比例');
   const progress=root.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),progressText=root.querySelector('#inspectorProgress').innerText;
   const noOld=!root.innerText.includes('查看缓存与接口明细');
   root.querySelector('[data-stack-direction="in"]').click();root.querySelector('[data-stack-direction="out"]').click();
   const stackText=root.querySelector('#inspectorStacks').innerText;
   const count=root.querySelector('.machine-stack-count'),label=count.parentElement;
   const style={weight:getComputedStyle(count).fontWeight,color:getComputedStyle(count).color,labelColor:getComputedStyle(label).color,boldAncestor:!!count.closest('b,strong')};
   const cached=b===theoreticalBudget;
   const values={input:sim.byMachine.M0.inputs['废金属'],stock:ware['废金属'],output:ware['能量电池'],empty:sim.byMachine.M0.queue.length};
   selection={routeId:'R0'};inspectorRefresh();
   const cards=[...root.querySelector('.inspector-route').children].filter(e=>e.tagName==='SECTION').map(e=>e.className);
   const routeText=root.innerText;
   return {first,sections,progress,progressText,noOld,stackText,style,cached,values,cards,routeText,initialFill,interpolatedFill,pausedFill,clockUnchanged,dutyInAnalysis,noIdle};
  })()`);
  assert.equal(stacks.style.weight,'400');assert.equal(stacks.style.color,stacks.style.labelColor);assert(!stacks.style.boldAncestor);assert.equal(stacks.first,'inspectorProgress');assert.deepEqual(stacks.sections,['生产','分析']);assert.equal(stacks.initialFill,'scaleX(0.5)');assert.equal(stacks.interpolatedFill,'scaleX(0.508)');assert.equal(stacks.pausedFill,stacks.interpolatedFill);assert(stacks.clockUnchanged&&stacks.dutyInAnalysis&&stacks.noIdle);assert.equal(stacks.progress,'50');assert(stacks.progressText.includes('加工中'));assert(stacks.noOld);assert.equal(stacks.cached,true);
  assert.deepEqual(stacks.values,{input:6,stock:2,output:2,empty:0});
  assert.deepEqual(stacks.cards,['machine-summary','machine-analysis-panel']);
  assert(stacks.routeText.includes('运输与物流分析'));assert(stacks.stackText.includes('存入')&&stacks.stackText.includes('取出'));
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  const separators=await evaluate(`(()=>{
   selection={machineId:'M0'};inspectorRefresh();const root=$('inspector');
   return [['.machine-production-progress+.machine-stack-controls','borderTopWidth'],['.machine-duty-section+.machine-theory','borderTopWidth'],['.machine-duty-grid>div:last-child','borderBottomWidth'],['.machine-theory .machine-port-details','borderTopWidth'],['.machine-flow-summary>.machine-flow-tile:last-child','borderBottomWidth']].map(([sel,k])=>{const el=root.querySelector(sel);return el?getComputedStyle(el)[k]:null;});
  })()`);
  assert.deepEqual(separators,['0px','0px','0px','0px','0px']);
  const cardStyle=await evaluate(`(()=>{
   const root=$('inspector'),track=root.querySelector('.machine-progress-track'),heading=root.querySelector('.machine-analysis-heading'),stack=root.querySelector('#inspectorStacks'),fold=root.querySelector('.machine-port-details>summary'),rows=[...root.querySelectorAll('#inspectorStacks .machine-stack-row')];
   const css=(el,k)=>getComputedStyle(el)[k];
   return {track:css(track,'height'),trackBorder:css(track,'borderTopColor'),divider:css(heading,'borderBottomColor'),trackBackground:css(track,'backgroundColor'),stackGap:css(stack,'marginTop'),lastRow:css(rows.at(-1),'borderBottomWidth'),fold:css(fold,'backgroundColor')};
  })()`);
  assert.equal(cardStyle.track,'5px');assert.notEqual(cardStyle.trackBackground,'rgba(0, 0, 0, 0)');assert.equal(cardStyle.stackGap,'15px');assert.equal(cardStyle.lastRow,'0px');assert.notEqual(cardStyle.fold,'rgba(0, 0, 0, 0)');

  const buffers=await evaluate(`(()=>{
   state={name:'readonly buffers',machines:[{id:'w',type:'仓出',item:'小行星矿石',x:4,y:4,face:'E'},{id:'sp',type:'分流',x:14,y:4,face:'E'},{id:'me',type:'汇流',x:24,y:4,face:'E'},{id:'in',type:'仓入',x:34,y:4,face:'E'},{id:'gen',type:'发电',x:44,y:4,face:'E'}],routes:[]};
   invalidateTheoryIfChanged();resetSimulation();refresh();
   sim.byMachine.w.warehouseQueue.push('小行星矿石','废金属');state.machines[0].item='合金板';
   sim.byMachine.sp.portQueues[0]=['废金属','合金板','废金属'];
   sim.byMachine.me.mergerQueue=[{item:'硅晶圆',port:1},{item:'合金板',port:0}];
   const root=$('inspector'),results={};
   for(const m of state.machines){
    selection={machineId:m.id};inspectorRefresh();
    const b=root.querySelector('#inspectorLogisticsBuffers');
    results[m.id]=b?{title:b.querySelector('.machine-live-subhead').textContent,rows:[...b.querySelectorAll('.machine-stack-name')].map(x=>x.textContent.trim()),buttons:b.querySelectorAll('button').length,first:root.querySelector('.machine-logistics-panel > .item')===b}:null;
   }
   selection={machineId:'me'};inspectorRefresh();
   const detail=()=>root.querySelector('.machine-buffer-details');
   results.initiallyClosed=!detail().open;
   const initialHeight=detail().getBoundingClientRect().height;
   sim.byMachine.me.mergerQueue.push({item:'废金属',port:0});inspectorRefreshLive();
   results.closedStable=!detail().open&&detail().getBoundingClientRect().height===initialHeight;
   sim.byMachine.me.mergerQueue.pop();
   detail().open=true;sim.byMachine.me.mergerQueue.shift();inspectorRefreshLive();
   results.openPreserved=detail().open;
   inspectorRefresh();results.fullRefreshPreserved=detail().open;
   detail().open=false;inspectorRefreshLive();results.closedPreserved=!detail().open;
   results.updated=[...root.querySelectorAll('#inspectorLogisticsBuffers .machine-stack-name')].map(x=>x.textContent.trim());
   return results;
  })()`);
  assert.deepEqual(buffers.w,{title:'出口缓存物品 · 2/3',rows:['● 小行星矿石','● 废金属'],buttons:0,first:true});
  assert.deepEqual(buffers.sp,{title:'入口缓存物品 · 3/3',rows:['● 废金属','● 合金板','● 废金属'],buttons:0,first:true});
  assert.deepEqual(buffers.me,{title:'出口缓存物品 · 2/3',rows:['● 硅晶圆','● 合金板'],buttons:0,first:true});
  assert(buffers.initiallyClosed&&buffers.closedStable&&buffers.openPreserved&&buffers.fullRefreshPreserved&&buffers.closedPreserved);
  assert.equal(buffers.in,null);assert.equal(buffers.gen,null);assert.deepEqual(buffers.updated,['● 合金板']);
  await evaluate(`(()=>{
   const a={id:'M0',type:'仓出',item:'废金属',x:5,y:8,face:'E'},b={id:'M1',type:'电脑',x:25,y:8,face:'E'};
   const p=outPort(a,0);b.y+=p.ey-inPort(b,0).ey;const q=inPort(b,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
   state={name:'filter change',machines:[a,b],routes:[{id:'R0',from:{id:a.id,port:0},to:{id:b.id,port:0},path}],frozenFactories:[{id:'source',name:'source',enabled:true,rates:{'合金板':'1/2'}}]};
   invalidateTheoryIfChanged();resetSimulation();refresh();
   selection={machineId:'M0'};inspectorRefresh();return true;
  })()`);
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  assert.equal(await evaluate("theoreticalBudget.fractions.routeTotals.R0"),'0');
  const filterEdit=await evaluate(`(()=>{
   sim.byMachine.M0.warehouseQueue.push('废金属');sim.routes.R0.push({item:'废金属',distance:1});simTime=10;
   const w=sim.byMachine.M0;w.lastWarehouseFill=9.5;
   const old=theoreticalBudget,sel=$('itemSelect');sel.value='合金板';sel.dispatchEvent(new Event('change',{bubbles:true}));
   return {preserved:sim.byMachine.M0===w,queue:w.warehouseQueue,packets:sim.routes.R0.map(x=>x.item),refill:w.lastWarehouseFill,newTheory:theoreticalBudget!==old,pending:theoreticalBudget.calculating,rows:[...$('inspector').querySelectorAll('#inspectorLogisticsBuffers .machine-stack-name')].map(x=>x.textContent.trim())};
  })()`);
  assert.deepEqual(filterEdit,{preserved:true,queue:['废金属'],packets:['废金属'],refill:9.5,newTheory:true,pending:true,rows:['● 废金属']});
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  const newFlow=await evaluate("theoreticalBudget.fractions.routes.R0");
  assert.equal(newFlow['合金板'],'1/2');assert(!Object.hasOwn(newFlow,'废金属'));
  const exactInput=await evaluate(`(()=>({decimal:frozenFromMinute('0.1'),negative:frozenFromMinute('-12.345'),fraction:frozenFromMinute('1/3'),scientific:frozenFromMinute('1e-3'),leading:frozenFromMinute('.5'),canonical:normalizeFrozenFactories([{id:'a',rates:{'废金属':'0.10','合金板':'2/4'}}])[0].rates}))()`);
  assert.deepEqual(exactInput,{decimal:'1/600',negative:'-823/4000',fraction:'1/180',scientific:'1/60000',leading:'1/120',canonical:{'废金属':'1/10','合金板':'1/2'}});
  // Test a real imported layout through the same page/worker path, not
  // only constructed toy graphs. Partial is allowed; missing all facts isn't.
  const ast=fs.readFileSync(path.resolve(__dirname,'fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
  // Use the real user-facing import and persisted scheme path, not direct state injection.
  const imported=await evaluate(`(()=>{
   document.querySelector('[data-edit-action="import-ast"]').click();
   document.getElementById('ast1Text').value=${JSON.stringify(ast)};
   document.getElementById('ast1Apply').click();
   document.getElementById('warehousePanel').open=true;
   if(!warehouseCardOpen.theory)document.querySelector('[data-ledger-toggle="theory"]').click();
   return {machines:state.machines.length,routes:state.routes.length,scheme:currentScheme()?.id,saved:currentScheme()?.ast===${JSON.stringify(ast)}};
  })()`);
  assert.equal(imported.machines,115);assert.equal(imported.routes,84);assert(imported.saved);
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  assert.equal(await evaluate('theoreticalBudget.status'),'iteration-complete');
  assert.equal(await evaluate('simTime'),0);
  // Reload without ignoring browser cache, exactly as a normal page reload.
  await send('Page.reload',{ignoreCache:false});
  await poll(async()=>await evaluate('document.readyState==="complete" && typeof theoreticalBudget!=="undefined" && theoreticalBudget?.calculating===false'));
  assert.deepEqual(await evaluate(`({machines:state.machines.length,routes:state.routes.length,scheme:currentScheme()?.id,status:theoreticalBudget.status,time:simTime})`),
   {machines:115,routes:84,scheme:imported.scheme,status:'iteration-complete',time:0});
  await evaluate(`(()=>{document.getElementById('warehousePanel').open=true;if(!warehouseCardOpen.theory)document.querySelector('[data-ledger-toggle="theory"]').click();return true;})()`);
  const complex=await evaluate(`(()=>({status:theoreticalBudget.status,failure:theoreticalBudget.failure,known:theoreticalBudget.fractions?.inflow?.['合金板'],wire:theoreticalBudget.fractions?.inflow?.['导线线圈'],gear:theoreticalBudget.fractions?.inflow?.['齿轮组'],engine:theoreticalBudget.engine}))()`);
  assert.equal(complex.failure,null,JSON.stringify(complex));assert.equal(complex.known,'2/3');assert.equal(complex.wire,'2/3');assert.equal(complex.gear,'1/2');assert.equal(complex.engine,"iteration");
  // Inspect rendered fields for every machine and route, not just
  // the number of internal algebraic queries.
  const audit115=await evaluate(`(()=>{
   const b=theoreticalBudget,root=$('inspector'),machines=[],routes=[],mismatch=[],outletTimes=[];
   const missing=el=>!!el&&el.textContent.trim().startsWith('—');
   const text=el=>el?.textContent.trim()??null;
   for(const m of state.machines){
    selection={machineId:m.id};inspectorRefresh();
    const rec=getRecipe(m),v=b.machineTotals[m.id],rate=b.machineCycles[m.id],eff=rec?effectiveCycle(m):null;
    if(m.type==='仓出')outletTimes.push([m.id,m.item,warehouseOutletTimeLabel(m)]);
    const input=missing(root.querySelector('.machine-flow-tile.in .tile-value')),output=missing(root.querySelector('.machine-flow-tile.out .tile-value'));
    const duty=rec&&missing(root.querySelector('.machine-duty-grid b'));
    const detail=[...root.querySelectorAll('.machine-port-details-body b')].filter(missing).length;
    if(input!==(v.in==null)||output!==(v.out==null)||rec&&(duty!==(rate==null)||(eff==null)!==(rate==null)))mismatch.push(m.id);
    if(input||output||duty||detail)machines.push({id:m.id,type:m.type,item:rec?.output||m.item||'',input,output,duty:!!duty,detail,period:rec?(eff==null?'—':fmtT(eff)):null,label:rec?timeLabel(m):m.type==='仓出'?warehouseOutletTimeLabel(m):null});
   }
   for(const r of state.routes){
    selection={routeId:r.id};inspectorRefresh();
    const total=missing(root.querySelector('.machine-flow-tile .tile-value')),detail=[...root.querySelectorAll('.machine-theory .kv b')].filter(missing).length;
    if(total!==(b.routeTotals[r.id]==null)||root.querySelector('[data-delete-route]'))mismatch.push(r.id);
    if(total||detail)routes.push({id:r.id,title:routeTitle(r),total,detail});
   }
   const warehouse=[...$('warehouse').querySelectorAll('[aria-label^="长期理论收支表"] tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.trim()));
   return {machineCount:state.machines.length,recipeCount:state.machines.filter(m=>getRecipe(m)).length,routeCount:state.routes.length,machines,routes,warehouse,outletTimes,mismatch};
  })()`);
  assert.equal(audit115.machineCount,115);assert.equal(audit115.routeCount,84);
  const diagnostics=await evaluate(`(()=>{const d=theoreticalBudget.diagnostics;return {actual:d.actualQueries,unlimited:d.unlimitedQueries,unknown:d.unknownMetrics.length,limited:d.proofSearchLimited,rev:THEORY_REVISION,rendered:$('warehouse').querySelector('.theory-diagnostics').textContent,simTime};})()`);
  assert(diagnostics.actual.total>0);assert.equal(diagnostics.actual.known,diagnostics.actual.total);
  assert(diagnostics.unlimited.total>0);assert.equal(diagnostics.unlimited.known,diagnostics.unlimited.total);
  assert.equal(diagnostics.unknown,0);assert.equal(diagnostics.limited,false);assert.equal(diagnostics.simTime,0);
  assert(diagnostics.rendered.includes(diagnostics.rev)&&diagnostics.rendered.includes('实际 '+diagnostics.actual.known+'/'+diagnostics.actual.total));
  console.log('DIAGNOSTICS115 '+JSON.stringify(diagnostics));
  assert.deepEqual(audit115.mismatch,[]);
  assert.deepEqual(audit115.warehouse.find(r=>r[0].includes('合金板')).slice(1,4),['40.00','40.00','0.00']);
  for(const [item,rates] of [['钛合金锭',['80.00','71.00','+9.00']],['齿轮组',['30.00','14.33','+15.67']],['能量电池',['20.00','15.33','+4.67']],['硅晶圆',['30.00','28.00','+2.00']],['导线线圈',['40.00','40.00','0.00']]])assert.deepEqual(audit115.warehouse.find(r=>r[0].includes(item)).slice(1,4),rates);
  assert.equal(audit115.warehouse.flatMap(r=>r.slice(1)).filter(x=>x!=='—').length,75);
  assert.deepEqual(audit115.warehouse.find(r=>r[0].includes('合金板')).slice(1,6),['40.00','40.00','0.00','-40.00','-40.00']);
  assert.deepEqual(audit115.warehouse.find(r=>r[0].includes('导线线圈')).slice(1,6),['40.00','40.00','0.00','-16.00','-20.00']);
  assert.deepEqual(audit115.machines,[]);
  assert.deepEqual(audit115.routes,[]);
  assert(audit115.outletTimes.every(r=>!r[2].includes('待证明')));
  assert(!audit115.machines.some(m=>m.id==='M50'));
  assert(!audit115.routes.some(r=>r.id==='R51'));
  assert(audit115.machines.filter(m=>m.duty).every(m=>!m.label.includes('超时')));
  console.log('AUDIT115 '+JSON.stringify(audit115));
  // R37 crosses six different belts in the actual 115-machine fixture.
  const crossings=await evaluate(`(()=>{
   selection={routeId:'R37'};inspectorRefresh();
   const root=$('inspector'),details=()=>root.querySelector('.route-packet-details');
   const buttons=()=>[...root.querySelectorAll('.route-crossing-button')];
   const ids=buttons().map(b=>b.dataset.selectRoute);
   const defaultOpen=details().open;
   const color=getComputedStyle(details().querySelector('summary'),'::before').color;
   const headingColor=getComputedStyle($('warehousePanel').querySelector('summary'),'::before').color;
   const frozenColor=getComputedStyle($('warehouse').querySelector('.right-disclosure-arrow')).color;
   details().open=false;
   const height=details().getBoundingClientRect().height;
   sim.routes.R37=[{item:'齿轮组',distance:1}];inspectorRefreshLive();
   const closedLive=!details().open&&details().getBoundingClientRect().height===height;
   inspectorRefresh();const closedRebuild=!details().open;
   buttons().find(b=>b.dataset.selectRoute==='R33').click();
   const switched=selection.routeId==='R33'&&root.dataset.inspectorKey==='route:R33'&&!details().open;
   const reciprocal=buttons().some(b=>b.dataset.selectRoute==='R37');
   buttons().find(b=>b.dataset.selectRoute==='R37').click();
   details().open=true;inspectorRefreshLive();
   const opened=details().open&&root.querySelectorAll('.route-packet').length===1;
   sim.routes.R37=[];inspectorRefreshLive();
   return {ids,defaultOpen,color,headingColor,frozenColor,closedLive,closedRebuild,switched,reciprocal,opened};
  })()`);
  assert.deepEqual(crossings.ids.slice().sort(),['R32','R33','R34','R35','R36','R41']);
  assert(crossings.defaultOpen&&crossings.closedLive&&crossings.closedRebuild&&crossings.switched&&crossings.reciprocal&&crossings.opened,JSON.stringify(crossings));
  assert.equal(crossings.color,'rgb(134, 196, 173)');
  assert.equal(crossings.headingColor,crossings.color);assert.equal(crossings.frozenColor,crossings.color);
  console.log('PASS: all crossings, live packet disclosure and green markers',JSON.stringify(crossings));
  for(const [fixture,frozen,item,expected] of [
   ['ast1-priority-armour-backpressure-v1.txt',[],'合金板',['0','0','0','-1','-1']],
   ['ast1-warehouse-feedback-loop-v1.txt',[{id:'frozen-alloy',name:'Frozen alloy',enabled:true,rates:{'合金板':'1'}}],'太空垃圾',['3/2','1/2','1','1','1']]
  ]){
   const ast=fs.readFileSync(path.resolve(__dirname,'fixtures',fixture),'utf8').trim();
   await evaluate(`(()=>{state=ast1Decode(${JSON.stringify(ast)});state.frozenFactories=${JSON.stringify(frozen)};invalidateTheoryIfChanged();resetSimulation();refresh();return true;})()`);
   await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
   const result=await evaluate(`(()=>{const b=theoreticalBudget;return {failure:b.failure,rates:['inflow','outflow','net','potentialNet','overdraftNet'].map(k=>b.fractions[k][${JSON.stringify(item)}]),alloy:b.fractions.net['合金板']};})()`);
   assert.equal(result.failure,null);assert.deepEqual(result.rates,expected,fixture);
   if(frozen.length)assert.equal(result.alloy,'1');
  }
  // A transport failure must not masquerade as mathematical uncertainty.
  await evaluate(`(()=>{window.savedStrictFactory=createStrictTheoryWorker;createStrictTheoryWorker=async()=>{throw Error('test missing worker asset');};state={name:'failure case',machines:[],routes:[],frozenFactories:[]};invalidateTheoryIfChanged();warehouseCardOpen.theory=true;warehouseRefresh();return true;})()`);
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  const failure=await evaluate(`(()=>({failure:theoreticalBudget.failure,status:theoreticalBudget.status,text:$('warehouse').innerText}))()`);
  assert.equal(failure.failure,'worker-error');assert.equal(failure.status,'calculation-failed');assert(failure.text.includes('计算失败')&&failure.text.includes('test missing worker asset'));
  // A transient failure must be recoverable without editing or switching layouts.
  await evaluate(`(()=>{createStrictTheoryWorker=window.savedStrictFactory;delete window.savedStrictFactory;document.querySelector('[data-theory-retry]').click();return true;})()`);
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  assert.equal(await evaluate('theoreticalBudget.status'),'iteration-complete');
  await evaluate(`(()=>{state={name:'recovered',machines:[],routes:[],frozenFactories:[{id:'s',rates:{'合金板':'1/600'}}]};invalidateTheoryIfChanged();warehouseRefresh();return true;})()`);
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  assert.equal(await evaluate("theoreticalBudget.fractions.inflow['合金板']"),'1/600');
  assert.equal(exceptions.length,0,exceptions.join(' | '));
  console.log(JSON.stringify({first,cache,edit,actual,disconnected:true}));
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child?.kill();server.close();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
