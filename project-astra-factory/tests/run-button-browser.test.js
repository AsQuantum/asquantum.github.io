'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file=path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-button-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,'file:///'+file],{stdio:'ignore',windowsHide:true});
async function poll(f){for(let i=0;i<120;i++){try{const v=await f();if(v)return v;}catch(e){}await new Promise(r=>setTimeout(r,200));}throw new Error('Edge CDP timeout');}
(async()=>{
 try{
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
  const info=await evaluate('({title:document.title,run:!!document.getElementById("run"),onClick:typeof document.getElementById("run").onclick,running,simTime,machines:state.machines.length,routes:state.routes.length,topStats:document.getElementById("topStats").textContent})');
  console.log('BEFORE',JSON.stringify(info));
  // Restore a real pre-v12 localStorage save during page initialization.
  const legacyScript=`localStorage.removeItem('factory_lab_v12');
    localStorage.removeItem('factory_lab_templates_v1');
    localStorage.removeItem('factory_lab_template_active_v1');
    localStorage.setItem('factory_lab_v2',JSON.stringify({version:11,name:'旧自动存档',
      machines:[{id:'old_1',type:'垃圾',mode:'LV4',x:4,y:6,face:'W'}],routes:[]}));`;
  const injected=await send('Page.addScriptToEvaluateOnNewDocument',{source:legacyScript});
  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,450));
  if(injected.result?.identifier)
   await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected.result.identifier});
  const oldStartup=await evaluate(`({
   name:state.name,mode:state.machines[0]?.mode,
   version:JSON.parse(localStorage.getItem('factory_lab_v12')).version,
   oldStillThere:!!localStorage.getItem('factory_lab_v2')
  })`);
  assert.equal(oldStartup.name,'旧自动存档');
  assert.equal(oldStartup.mode,1);
  assert.equal(oldStartup.version,12);
  assert(oldStartup.oldStillThere,'keep original legacy backup in browser storage');
  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,450));
  const resumed=await evaluate(`({name:state.name,mode:state.machines[0]?.mode,
    version:JSON.parse(localStorage.getItem('factory_lab_v12')).version})`);
  assert.equal(resumed.name,'旧自动存档');
  assert.equal(resumed.mode,1);
  assert.equal(resumed.version,12);
  console.log('PASS: startup auto-upgrades localStorage v2 to v12 and restores v12 on next reload');
  // Legacy converter lives only in old.js. Bad imports do not replace active state.
  const legacyChecks=await evaluate(`(()=>{
   const legacy={version:11,name:'旧版等级存档',machines:[
    {id:'lv_first',type:'垃圾',mode:'LV3',x:4,y:6,face:'E'},
    {id:'lv_second',type:'粒子',mode:'LV4',x:10,y:6,face:'S'},
    {id:'lv_third',type:'采矿',mode:'LV3',x:18,y:6,face:'W'}
   ],routes:[]};
   loadState(legacy);
   const modes=state.machines.map(m=>m.mode);
   const outputs=state.machines.map(getRecipe).map(r=>r?.output);
   const compact=JSON.parse(localStorage.getItem('factory_lab_v12'));
   const before=compactFactoryJSON();
   let rejected=false;
   try{loadState({name:'坏配方',machines:[{id:'bad',type:'垃圾',mode:'nonsense',x:1,y:1,face:'E'}],routes:[]});}
   catch(e){rejected=true;}
   const safe=compactFactoryJSON()===before;
   const storedUnchanged=localStorage.getItem('factory_lab_v12')===before;
   loadState(createEmpty());
   return {modes,outputs,format:compact.format,version:compact.version,rejected,safe,storedUnchanged};
  })()`);
  assert.deepEqual(legacyChecks.modes,[0,1,0]);
  assert.deepEqual(legacyChecks.outputs,['太空垃圾','相位粒子','小行星矿石']);
  assert.equal(legacyChecks.format,'factory-lab');
  assert.equal(legacyChecks.version,12);
  assert(legacyChecks.rejected&&legacyChecks.safe&&legacyChecks.storedUnchanged,
   'legacy import or non-destructive validation failed: '+JSON.stringify(legacyChecks));
  console.log('PASS: old.js converts old LV3/LV4 to numeric IDs, bad JSON cannot replace current layout');
  // Collectors use original numeric AST1 recipe IDs, not upgrade levels.
  const catalogChecks=await evaluate(`(()=>{
   const sources=[
    ['垃圾','太空垃圾',0,0],['垃圾','遐想物质',0,1],
    ['粒子','星尘粒子',1,0],['粒子','相位粒子',1,1],
    ['采矿','小行星矿石',12,0],['采矿','钛合金锭',12,1]
   ];
   const matches=sources.every(([type,product,typeId,modeId])=>
    AST1_ID_BY_TYPE[type]===typeId&&AST1_MODE[type][modeId]===modeId&&
    DEF[type].recipes[modeId]?.output===product);
   const originals=sources.map(([type,product,typeId,modeId],i)=>({
    id:'editor_'+i,type,mode:modeId,x:2+(i%4)*11,y:2+Math.floor(i/4)*12,face:'E'
   }));
   state.machines=originals;state.routes=[];
   const bytes=ast1ToBytes();
   const decoded=ast1Decode(ast1Encode());
   const roundtripOK=decoded.machines.every((m,i)=>m.mode===originals[i].mode&&
     m.id==='ast1_'+i&&getRecipe(m)?.output===sources[i][1]);
   const bytesOK=originals.every((m,i)=>bytes[3+7*i]===AST1_ID_BY_TYPE[m.type]&&
      bytes[3+7*i+5]===i%2);
   const presetsOK=[SAMPLE,window.FACTORY_WARP_PRESET].every(layout=>
    layout.machines.filter(m=>numericRecipeMode(m.type)).every(m=>
     (m.mode===0||m.mode===1)&&getRecipe(m)?.output===DEF[m.type].recipes[m.mode].output));
   const itemsOK=Object.entries({
     1:'古代芯片',11:'复合装甲板',451:'框架模块',17:'星尘粒子',19:'遐想物质',444:'小行星矿石'
   }).every(([id,name])=>AST1_ITEMS[id]===name&&AST1_ITEM_IDS[name]===Number(id));
   const labelsOK=originals.every((m,i)=>label(m).includes(sources[i][1])&&
    recipeOptionLabel(m.type,m.mode)===sources[i][1]);
   const optionsOK=recipeModes('垃圾').join(',')==='0,1'&&
    defaultModeFor('垃圾')===0;
   loadState({name:'数字配方ID',machines:originals,routes:[]});
   const loadedOK=state.machines.every((m,i)=>m.mode===originals[i].mode&&typeof m.mode==='number');
   stampPrefs.垃圾={mode:1,face:'E'};setStampType('垃圾');
   const stampOK=stampMode===1&&document.getElementById('stampMode').value==='1';
   setTool('select');
   loadState(createEmpty());
   return {matches,roundtripOK,bytesOK,itemsOK,labelsOK,optionsOK,loadedOK,stampOK,presetsOK};
  })()`);
  assert(Object.values(catalogChecks).every(Boolean),
    'AST1 numeric mode IDs must roundtrip: '+JSON.stringify(catalogChecks));
  console.log('PASS: numeric collector mode IDs, Chinese labels, AST1 roundtrip and JSON/stamp ID persistence');
  const compactChecks=await evaluate(`(()=>{
   const cases=[SAMPLE,window.FACTORY_WARP_PRESET];
   const reports=[];
   for(const src of cases){
    const compact=compactFactoryLayout(src);
    const restored=expandCompactFactoryLayout(JSON.parse(JSON.stringify(compact)));
    const machinesOK=restored.machines.length===src.machines.length&&
     restored.machines.every((m,i)=>{
      const orig=src.machines[i];
      const sameKeys=Object.keys(orig).filter(k=>k!=='id');
      return sameKeys.every(k=>JSON.stringify(m[k])===JSON.stringify(orig[k]))&&
       m.type===orig.type&&m.x===orig.x&&m.y===orig.y&&m.face===(orig.face||'E');
     });
    const routesOK=restored.routes.length===src.routes.length&&restored.routes.every((r,i)=>{
     const orig=src.routes[i],fi=src.machines.findIndex(m=>m.id===orig.from.id),
      ti=src.machines.findIndex(m=>m.id===orig.to.id);
     return JSON.stringify(r.path)===JSON.stringify(orig.path)&&
      r.from.id===restored.machines[fi]?.id&&r.to.id===restored.machines[ti]?.id&&
      r.from.port===orig.from.port&&r.to.port===orig.to.port&&
      r.label===orig.label;
    });
    const bytesOld=new Blob([JSON.stringify(src)]).size;
    const bytesNew=new Blob([JSON.stringify(compact)]).size;
    reports.push({machinesOK,routesOK,bytesOld,bytesNew,count:src.routes.length,
     factor:Number((bytesOld/bytesNew).toFixed(2)),
     longSegments:compact.routes.filter(r=>r[5].some(seg=>seg[1]>=5&&seg[0]<4)).length});
   }
   const straight=[[3,4],[4,4],[5,4],[6,4],[6,5],[6,6],[5,6],[5,6],[18,9]];
   const packed=packRouteRuns(straight);
   const pathOK=JSON.stringify(unpackRouteRuns(...packed))===JSON.stringify(straight);
   const runsOK=JSON.stringify(packed[1])===JSON.stringify([[0,3],[1,2],[2,1],[4,5,6],[4,18,9]]);
   // All known items and inlet/splitter filters must be stored as numeric IDs.
   const machine={id:'filter-original',type:'分流',x:2,y:2,face:'E',
      mode:'',outFilters:{'0':'曲速线圈','1':'相位粒子'},filters:{'0':'钛合金锭'},
      inletItem:'小行星矿石',item:'引力透镜',tag:'测试机器',ast1Meta:{record:[8,2,2,0,0,0,0]}};
   const packedMachine=compactFactoryLayout({name:'验证',machines:[machine],routes:[]});
   const restoredMachine=expandCompactFactoryLayout(packedMachine).machines[0];
   const encodedFields=packedMachine.machines[0][5];
   const filtersOK=encodedFields.item===454&&encodedFields.inletItem===444&&
      encodedFields.outFilters['0']===455&&encodedFields.outFilters['1']===20&&
      encodedFields.filters['0']===445&&
      JSON.stringify(restoredMachine.outFilters)===JSON.stringify(machine.outFilters)&&
      JSON.stringify(restoredMachine.ast1Meta)===JSON.stringify(machine.ast1Meta)&&
      restoredMachine.tag===machine.tag;
   // AST1 original records and splitter/warehouse filters must survive JSON too.
   const savedState=state;
   state={name:'game',machines:[
    {id:'a',type:'分流',x:10,y:10,face:'E',outFilters:{0:'太空垃圾',1:'曲速线圈'}},
    {id:'b',type:'仓出',x:30,y:10,face:'S',item:'钛合金锭'},
    {id:'c',type:'垃圾',x:48,y:20,face:'W',mode:1}
   ],routes:[]};
   const astBefore=ast1Encode();
   const imported=ast1Decode(astBefore);
   state=expandCompactFactoryLayout(compactFactoryLayout(imported));
   const astAfter=ast1Encode();
   const astRecordOK=astBefore===astAfter;
   state=savedState;
   const corrupt=JSON.parse(JSON.stringify(packedMachine));
   corrupt.routes.push([999,0,0,0,[1,1],[]]);
   let invalidRejected=false;
   try{expandCompactFactoryLayout(corrupt);}catch(e){invalidRejected=true;}
   return {reports,pathOK,runsOK,filtersOK,invalidRejected,astRecordOK};
  })()`);
  console.log('COMPACT JSON',JSON.stringify(compactChecks));
  assert(compactChecks.pathOK&&compactChecks.runsOK&&compactChecks.filtersOK&&compactChecks.invalidRejected&&compactChecks.astRecordOK,
    'compressed route or numeric item fields failed: '+JSON.stringify(compactChecks));
  assert(compactChecks.reports.every(r=>r.machinesOK&&r.routesOK&&r.bytesNew<r.bytesOld&&r.longSegments>0),
    'full sample/warp roundtrip lost geometry or failed compression');
  console.log('PASS: sample and warp layout RLE roundtrip, item/filter IDs, unknown path jumps and reduced file sizes');
  const warehouseInitial=await evaluate('({open:document.getElementById("warehousePanel").open,content:!!document.getElementById("warehouse").innerHTML})');
  assert.equal(warehouseInitial.open,false,'warehouse should start collapsed for a new user');
  assert(warehouseInitial.content,'warehouse content should still be rendered while collapsed');
  await evaluate('document.querySelector("#warehousePanel > summary").click()');
  await new Promise(r=>setTimeout(r,200));
  assert.equal(await evaluate('localStorage.getItem("factory_lab_warehouse_expanded")'),'true','expansion must persist');
  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,400));
  assert.equal(await evaluate('document.getElementById("warehousePanel").open'),true,'expanded state must survive reload');
  await evaluate('document.querySelector("#warehousePanel > summary").click()');
  await new Promise(r=>setTimeout(r,200));
  assert.equal(await evaluate('localStorage.getItem("factory_lab_warehouse_expanded")'),'false','collapse must persist');
  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,400));
  assert.equal(await evaluate('document.getElementById("warehousePanel").open'),false,'collapsed state must survive reload');
  console.log('PASS: warehouse folded by default, expandable, localStorage persistence in Edge');

  // Real user gesture: select theory text, then run simulation for several UI ticks.
  const theorySelection=await evaluate(`(()=>{
   state.machines=[{id:'m_copy_test',type:'分流',x:15,y:15,face:'E'}];
   state.routes=[];resetSimulation();selection={machineId:'m_copy_test'};inspectorRefresh();
   const inspector=document.getElementById('inspector');
   const theory=[...inspector.querySelectorAll('.item')].find(n=>n.textContent.includes('稳态理论'));
   const properties=inspector.querySelector('.machine-properties');
   const live=inspector.querySelector('#inspectorLive');
   if(!properties||!theory||!live||
      inspector.querySelector('#deleteM,#duplicate,.machine-actions')||
      !(properties.compareDocumentPosition(theory)&Node.DOCUMENT_POSITION_FOLLOWING)||
      !(theory.compareDocumentPosition(live)&Node.DOCUMENT_POSITION_FOLLOWING))
     return {ok:false,reason:'Machine properties must precede theory/live, without redundant right-side edit buttons'};
   const textNode=theory?.querySelector('strong')?.firstChild;
   if(!textNode||textNode.nodeType!==Node.TEXT_NODE)return {ok:false,html:inspector.textContent.slice(0,400)};
   const range=document.createRange();range.selectNodeContents(textNode);
   const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
   window.__theoryNode=textNode;window.__theoryBlock=theory;
   window.__staticInspectorFirst=inspector.firstElementChild;
   window.__machineLive=inspector.querySelector('#inspectorLive');
   window.__inspectorReplacements=0;
   const observer=new MutationObserver(mutations=>{
    window.__inspectorReplacements+=mutations.filter(m=>m.type==='childList').length;
   });
   observer.observe(inspector,{childList:true,subtree:false});
   window.__theoryObserver=observer;
   window.__canvasAnimatedDraws=0;
   window.__canvasStaticDraws=0;
   const savedDraw=window.draw;
   window.draw=function(animationOnly){
    if(animationOnly)window.__canvasAnimatedDraws++;
    else window.__canvasStaticDraws++;
    return savedDraw.apply(this,arguments);
   };
   return {ok:true,text:range.toString(),rangeText:range.toString(),nodeValue:textNode.nodeValue,theoryText:theory.textContent.slice(0,150),selectionRanges:sel.rangeCount,inventory:!!window.__machineLive};
  })()`);
  console.log('SELECT THEORY',JSON.stringify(theorySelection));
  assert(theorySelection.ok&&theorySelection.text.includes('稳态理论')&&theorySelection.inventory);
  const started=Date.now();
  const click=await evaluate('(()=>{try{document.getElementById("run").click();return {ok:true,running,simTime,text:document.getElementById("run").textContent}}catch(e){return {ok:false,error:String(e),stack:e.stack}}})()');
  console.log('CLICK',Date.now()-started+'ms',JSON.stringify(click));
  assert.equal(info.onClick,'function','Run button must be bound');
  assert(click.ok&&click.running,'Run button must start simulation');
  const idleHover=await evaluate(`(()=>{
   const before=window.__canvasStaticDraws;
   const map=document.getElementById('map'),rect=map.getBoundingClientRect();
   for(let i=0;i<8;i++){
    map.dispatchEvent(new PointerEvent('pointermove',
     {bubbles:true,pointerId:27,clientX:rect.left+100+i*10,clientY:rect.top+100}));
   }
   return {before,after:window.__canvasStaticDraws,cursor:document.getElementById('cursorText').textContent};
  })()`);
  assert.equal(idleHover.before,idleHover.after,'ordinary hover should not repaint static factory map');
  assert(idleHover.cursor.includes('格子'),'hover coordinate label must still update');
  console.log('PASS: ordinary canvas pointer hover updates coordinates without redrawing the factory');

  await new Promise(r=>setTimeout(r,1500));
  const playing=await evaluate('({running,simTime,text:document.getElementById("run").textContent})');
  console.log('PLAYING',JSON.stringify(playing));
  assert(playing.running&&playing.simTime>0,'simulated time must advance');
  const theoryAfter=await evaluate(`(()=>{
   const root=document.getElementById('inspector');
   return {selected:window.getSelection().getRangeAt(0).toString(),nodeIntact:window.__theoryNode.isConnected,
    theorySame:window.__theoryBlock.contains(window.__theoryNode),
    liveSame:root.querySelector('#inspectorLive')===window.__machineLive,
    replaced:window.__inspectorReplacements,animatedDraws:window.__canvasAnimatedDraws,
    liveMarkup:root.querySelector('#inspectorLive')?.textContent.slice(0,140),dynamicBlocked:hasSelectionInside(root.querySelector('#inspectorLive')),liveTime:Number(root.querySelector('#inspectorLive')?.textContent.split('模拟时间 ')[1]?.split('秒')[0])};
  })()`);
  console.log('THEORY AFTER TICKS',JSON.stringify(theoryAfter));
  assert.equal(theoryAfter.selected,theorySelection.text,'theory text selection must survive live updates');
  assert(theoryAfter.nodeIntact&&theoryAfter.theorySame&&theoryAfter.liveSame,'static inspector DOM must survive');
  assert.equal(theoryAfter.replaced,0,'runtime must never replace inspector top-level nodes');
  assert.equal(theoryAfter.animatedDraws,0,'no packets: avoid pointless GPU canvas draws');
  assert(Number(theoryAfter.liveTime)>0,'machine runtime values still update');

  // Selecting the changing live section also pauses edits to the selected subtree.
  const liveSelected=await evaluate(`(()=>{
   const node=document.querySelector('#inspectorLive strong').firstChild;
   const r=document.createRange();r.selectNodeContents(node);
   const s=window.getSelection();s.removeAllRanges();s.addRange(r);
   window.__liveTextNode=node;
   return r.toString();
  })()`);
  await new Promise(r=>setTimeout(r,650));
  const liveAfter=await evaluate(`({selected:window.getSelection().getRangeAt(0).toString(),intact:window.__liveTextNode.isConnected})`);
  assert.equal(liveAfter.selected,liveSelected,'copying from live values should not lose selection');
  assert(liveAfter.intact);

  // Warehouse theory text is also immutable while actual warehouse stats update.
  const warehouseText=await evaluate(`(()=>{
   const panel=document.getElementById('warehousePanel');panel.open=true;
   const node=document.querySelector('#warehouse .ledger-panel .ledger-head strong').firstChild;
   const r=document.createRange();r.selectNodeContents(node);
   const s=window.getSelection();s.removeAllRanges();s.addRange(r);
   window.__warehouseTheoryNode=node;
   return r.toString();
  })()`);
  await new Promise(r=>setTimeout(r,700));
  const warehouseAfter=await evaluate(`({selected:window.getSelection().getRangeAt(0).toString(),intact:window.__warehouseTheoryNode.isConnected,simTime})`);
  assert.equal(warehouseAfter.selected,warehouseText,'warehouse theoretical text selection must persist');
  assert(warehouseAfter.intact&&warehouseAfter.simTime>playing.simTime);
  console.log('PASS: selected theory/live text survives periodic UI refresh; idle canvas paint skipped');

  const paused=await evaluate('(()=>{document.getElementById("run").click();return {running,simTime}})()');
  assert.equal(paused.running,false,'second click must pause');
  const stepped=await evaluate('(()=>{document.getElementById("stepMinute").click();return simTime})()');
  assert(stepped>=paused.simTime+59.99,'+1 minute must advance by 60 simulated seconds');
  const reset=await evaluate('(()=>{document.getElementById("resetSim").click();return {running,simTime}})()');
  assert(!reset.running&&reset.simTime===0,'reset must stop and zero time');
  assert.equal(exceptions.length,0,'uncaught errors: '+exceptions.join('; '));
  console.log('PASS: run, pause, +1 minute, reset in real Edge');
  // Live route packets should still move/repaint while static theoretical text stays selected.
  const routeSetup=await evaluate(`(()=>{
   const a={id:'m_route_a',type:'分流',x:3,y:3,face:'E'};
   const b={id:'m_route_b',type:'分流',x:17,y:3,face:'E'};
   state.machines=[a,b];state.routes=[];
   const out=outPort(a,0),input=inPort(b,0);
   const path=pathSearch([out.ex,out.ey],[input.ex,input.ey],new Set(),
    {startPrev:[out.x,out.y],endNext:[input.x,input.y]});
   if(!path)return {ok:false,reason:'no route path'};
   state.routes=[{id:'r_live',from:{id:a.id,port:0},to:{id:b.id,port:0},path}];
   theoreticalBudget=null;resetSimulation();selection={routeId:'r_live'};inspectorRefresh();
   const title=document.querySelector('#inspector strong').firstChild;
   const range=document.createRange();range.selectNodeContents(title);
   const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
   window.__routeLabelNode=title;
   window.__routeLabelSelection=range.toString();
   sim.routes.r_live.push({item:'太空垃圾',distance:0});
   simVisualDirty=true;
   window.__canvasAnimatedDraws=0;
   return {ok:true,label:range.toString(),pathLength:path.length};
  })()`);
  assert(routeSetup.ok,'valid route test setup: '+JSON.stringify(routeSetup));
  await evaluate('document.getElementById("run").click()');
  await new Promise(r=>setTimeout(r,800));
  const routeRun=await evaluate(`(()=>{
   const packet=sim.routes.r_live[0];
   return {running,simTime,position:packet?.distance??null,
    visual:window.__canvasAnimatedDraws,selected:window.getSelection().getRangeAt(0).toString(),
    nodeIntact:window.__routeLabelNode.isConnected,
    routeTime:document.querySelector('#inspector [data-live-route-time]')?.textContent,
    packets:document.querySelector('#inspectorRoutePackets')?.textContent.slice(0,120)};
  })()`);
  console.log('ROUTE LIVE',JSON.stringify(routeRun));
  assert(routeRun.running&&routeRun.position>0&&routeRun.visual>0,'moving packets must draw on canvas');
  assert.equal(routeRun.selected,routeSetup.label,'selected static route text must survive moving packets');
  assert(routeRun.nodeIntact&&routeRun.packets.includes('太空垃圾'),'live route inventory must update in place');
  await evaluate('document.getElementById("run").click()');
  console.log('PASS: active route packets render while theoretical/route text selection persists');

  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
