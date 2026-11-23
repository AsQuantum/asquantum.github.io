'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file=path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-button-'));
const child=spawn(edge,['--headless=new','--window-size=1450,970','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,'file:///'+file],{stdio:'ignore',windowsHide:true});
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
  const machineTypes=await evaluate(`(()=>{
   const types=['采矿','垃圾','分流','汇流','仓入','仓出','组装'];
   const inspected=[];
   for(const type of types){
    const m={id:'right_'+type,type,mode:defaultModeFor(type),x:12,y:15,face:'E'};
    if(type==='仓出')m.item='太空垃圾';
    state={name:'机器属性检查',machines:[m],routes:[]};theoreticalBudget=null;
    resetSimulation();selection={machineId:m.id};inspectorRefresh();
    const root=$('inspector');
    const theory=[...root.querySelectorAll('.item')].find(el=>el.textContent.includes('稳态理论'));
    const live=root.querySelector('#inspectorLive');
    const props=root.querySelector('.machine-properties');
    const propsCount=Number(!!root.querySelector('#panelSelect'))+Number(!!root.querySelector('#modeSelect'))+
     Number(!!root.querySelector('#itemSelect'))+Number(!!root.querySelector('#warehouseInFilterSelect'))+
     root.querySelectorAll('[data-out-filter]').length;
    const expectedCount=(supportsMachinePanel(m)?1:0)+(recipeModes(type).length>1?1:0)+
     (type==='仓出'?1:0)+(type==='仓入'?1:0)+(type==='分流'?3:0);
    inspected.push({type,propsCount,expectedCount,
     editCardTitle:expectedCount===0?!root.querySelector('.machine-edit-heading'):root.querySelector('.machine-edit-heading')?.textContent==='编辑设置',
     recipeInSummary:!!getRecipe(m)===!!root.querySelector('.machine-summary .machine-recipe-in-summary'),
     noLooseRecipe:!root.querySelector('.inspector-machine > .machine-recipe'),
     correctProperties:(propsCount===expectedCount)&&
     (!!props===(expectedCount>0)),allOnRight:!document.querySelector('.machine-library #itemSelect')&&
      !document.querySelector('.machine-library #warehouseInFilterSelect'),
     noLegacyInputs:!root.querySelector('[data-filter]')&&!root.querySelector('.machine-connections')&&
      !root.querySelector('.machine-edit')&&!root.textContent.includes('接口设置')&&
      !root.textContent.includes('调整机器'),
     leftNotSelected:$('stampControls').style.display==='none',
     noDuplicateActions:!root.querySelector('#duplicate,#deleteM,.machine-actions'),
     leftSelectionActions:!!document.querySelector('#groupMove')&&
       !!document.querySelector('#groupDuplicate')&&!!document.querySelector('#groupDelete'),
     analysisOrder:!!theory&&!!live&&
       !!(theory.compareDocumentPosition(live)&Node.DOCUMENT_POSITION_FOLLOWING),
     fit:root.scrollWidth<=root.clientWidth+1});
   }
   return inspected;
  })()`);
  console.log('RIGHT MACHINE PROPERTIES',JSON.stringify(machineTypes));
  assert(machineTypes.every(t=>t.correctProperties&&t.editCardTitle&&t.recipeInSummary&&t.noLooseRecipe&&t.allOnRight&&t.noLegacyInputs&&
    t.leftNotSelected&&t.noDuplicateActions&&t.leftSelectionActions&&t.analysisOrder&&t.fit),'all machine types need correct compact right-side properties');

  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:840,deviceScaleFactor:1,mobile:false});
  const narrow=await evaluate(`(()=>{
   const m={id:'compact',type:'分流',x:15,y:13,face:'W',outFilters:{0:'太空垃圾'}};
   state={name:'窄屏',machines:[m],routes:[]};theoreticalBudget=null;
   resetSimulation();selection={machineId:m.id};inspectorRefresh();
   const root=$('inspector'),aside=document.querySelector('.side.right');
   const selects=[...root.querySelectorAll('select')];
   return {sidebar:aside.getBoundingClientRect().width,fit:root.scrollWidth<=root.clientWidth+1,
    filterCount:selects.length,selectorsFit:selects.every(el=>
      el.getBoundingClientRect().right<=root.getBoundingClientRect().right+1)};
  })()`);
  console.log('NARROW MACHINE PROPERTIES',JSON.stringify(narrow));
  assert(narrow.sidebar<=250&&narrow.fit&&narrow.filterCount===3&&narrow.selectorsFit);
  await send('Emulation.clearDeviceMetricsOverride');

  const interactions=await evaluate(`(()=>{
   const machine={id:'mining',type:'采矿',mode:0,x:13,y:13,face:'E'};
   state={name:'产物测试',machines:[machine],routes:[]};theoreticalBudget=null;
   resetSimulation();selection={machineId:machine.id};inspectorRefresh();
   const recipeSelector=$('inspector').querySelector('#modeSelect');
   recipeSelector.value='1';recipeSelector.dispatchEvent(new Event('change',{bubbles:true}));
   const recipeChanged=machine.mode===1&&getRecipe(machine)?.output==='钛合金锭';

   const splitter={id:'splitter',type:'分流',x:14,y:13,face:'E',outFilters:{}};
   state={name:'分流测试',machines:[splitter],routes:[]};theoreticalBudget=null;
   resetSimulation();selection={machineId:splitter.id};inspectorRefresh();
   const splitSelects=[...$('inspector').querySelectorAll('[data-out-filter]')];
   const splitterNames=splitSelects.map(select=>select.parentElement.querySelector('span')?.textContent);
   splitSelects[0].value='相位粒子';
   splitSelects[0].dispatchEvent(new Event('change',{bubbles:true}));
   const splitSaved=splitter.outFilters[0]==='相位粒子'&&
    getPorts(splitter).find(p=>p.kind==='out'&&p.index===0).filter==='相位粒子';

   const warehouseOut={id:'withdraw',type:'仓出',x:14,y:13,face:'E',item:'太空垃圾'};
   state={name:'仓出测试',machines:[warehouseOut],routes:[]};theoreticalBudget=null;
   resetSimulation();selection={machineId:warehouseOut.id};inspectorRefresh();
   const outSelect=$('inspector').querySelector('#itemSelect');
   outSelect.value='钛合金锭';outSelect.dispatchEvent(new Event('change',{bubbles:true}));
   const withdrawSaved=warehouseOut.item==='钛合金锭';

   const warehouseIn={id:'deposit',type:'仓入',x:14,y:13,face:'E',inletItem:''};
   state={name:'仓入测试',machines:[warehouseIn],routes:[]};theoreticalBudget=null;
   resetSimulation();selection={machineId:warehouseIn.id};inspectorRefresh();
   const inSelect=$('inspector').querySelector('#warehouseInFilterSelect');
   inSelect.value='星尘粒子';inSelect.dispatchEvent(new Event('change',{bubbles:true}));
   const depositSaved=warehouseIn.inletItem==='星尘粒子'&&
    !acceptsMaterial(warehouseIn,'钛合金锭',0)&&acceptsMaterial(warehouseIn,'星尘粒子',0);
   return {recipeChanged,splitSaved,withdrawSaved,depositSaved,splitterNames};
  })()`);
  console.log('RIGHT PROPERTIES EDITING',JSON.stringify(interactions));
  assert(interactions.recipeChanged&&interactions.splitSaved&&interactions.withdrawSaved&&interactions.depositSaved&&
   interactions.splitterNames.length===3,'right-hand machine properties must remain fully editable');

  const materialFlow=await evaluate(`(()=>{
   const m={id:'flow',type:'冶炼',mode:defaultModeFor('冶炼'),x:12,y:12,face:'E',
    filters:{0:'错误的旧过滤材料'}};
   state={name:'按配方自动',machines:[m],routes:[]};
   resetSimulation();
   const recipe=getRecipe(m),needed=Object.keys(recipe.inputs)[0],
    unwanted='不存在的材料',limit=recipe.inputs[needed]*3;
   const port=getPorts(m).find(p=>p.kind==='in');
   const matches=port.filter===''&&acceptsMaterial(m,needed,port.index)&&
    !acceptsMaterial(m,unwanted,port.index);
   let received=0;
   for(let n=0;n<limit;n++){simTime=n*1.05+1;if(acceptItem(m,port.index,needed))received++;}
   simTime=limit*1.05+1;
   const fullBlocked=!acceptItem(m,port.index,needed);
   const otherBlocked=!acceptItem(m,port.index,unwanted);
   return {matches,needed,limit,received,fullBlocked,otherBlocked};
  })()`);
  console.log('AUTOMATIC RECIPE INPUT',JSON.stringify(materialFlow));
  assert(materialFlow.matches&&materialFlow.received===materialFlow.limit&&
    materialFlow.fullBlocked&&materialFlow.otherBlocked,
    'machine must ignore old input filters, accept recipe materials only and stop when full');

  const left=await evaluate(`(()=>{
   $('search').value='小行星矿石';buildPalette();
   const matching=[...$('palette').querySelectorAll('[data-stamp]')];
   const searched=matching.some(btn=>btn.dataset.stamp==='采矿');
   $('search').value='';buildPalette();
   $('palette').querySelector('[data-stamp="采矿"]').click();
   const opened=stampType==='采矿'&&$('stampControls').style.display==='block'&&
    $('stampModeRow').style.display==='flex';
   const selectedMode=$('stampMode');selectedMode.value='1';
   selectedMode.dispatchEvent(new Event('change',{bubbles:true}));
   const modeChanged=stampMode===1;
   const faceBefore=stampFace;rotateStamp(1);
   const rotated=stampFace!==faceBefore;
   $('stampCancel').click();
   const closed=!stampType&&$('stampControls').style.display==='none';
   return {searched,opened,modeChanged,rotated,closed,
    leftNoWarehouseFilters:!document.querySelector('#selectedInFilterRow,#selectedOutFilterRow')};
  })()`);
  console.log('LEFT PLACEMENT LIBRARY',JSON.stringify(left));
  assert(Object.values(left).every(Boolean),'left palette should only select/prepare machines for placement');

  const panels=await evaluate(`(()=>{
   const expected={E:['N','E','S','W'],S:['E','S','W','N'],W:['S','W','N','E'],N:['W','N','E','S']};
   const directions=Object.fromEntries(Object.keys(expected).map(face=>[face,[0,1,2,3].map(panel=>
     machinePanelFacing({type:'量装',face,panel}))]));
   const m={id:'panelA',type:'垃圾',mode:0,face:'E',x:12,y:12,panel:0};
   const sink={id:'sink',type:'仓入',face:'E',x:22,y:11};
   const route={id:'preserved',from:{id:m.id,port:0},to:{id:sink.id,port:2},
     path:[[17,14],[18,14],[19,14],[20,14],[21,14]]};
   state={name:'面板测试',machines:[m,sink],routes:[route]};selection={machineId:m.id};
   inspectorRefresh();
   const summary=$('inspector').querySelector('.machine-summary');
   const recipe=summary.querySelector('.machine-recipe-in-summary');
   const selector=$('inspector').querySelector('#panelSelect');
   const defaultPanel=selector?.value==='0';
   const inspectorPanelNames=[...selector.options].map(o=>o.textContent.trim());
   const hiddenPanelIds=JSON.stringify(inspectorPanelNames)===
     JSON.stringify([0,1,2,3].map(i=>machinePanelOptionLabel(m,i)))&&
     inspectorPanelNames.every(name=>name.includes(' · '));
   const recipeBelowRate=!!recipe&&!!summary.querySelector('.machine-summary-metrics')&&
    !!(summary.querySelector('.machine-summary-metrics').compareDocumentPosition(recipe)&Node.DOCUMENT_POSITION_FOLLOWING);
   selector.value='3';selector.dispatchEvent(new Event('change',{bubbles:true}));
   const changedPanel=m.panel===3&&machinePanelFacing(m)==='W'&&
     $('inspector').querySelector('#panelSelect').value==='3';
   const oldFacing=m.face;m.face='S';inspectorRefresh();
   // Face S: the machine's right side points left (W) on the map.
   const rightSideLeftArrow=machinePanelFacing({face:'S',panel:2})==='W'&&
     $('inspector').querySelector('#panelSelect').options[2].textContent.trim()==='右侧 · ←';
   const inspectorRotated=JSON.stringify([...$('inspector').querySelector('#panelSelect').options].map(o=>o.textContent.trim()))===
     JSON.stringify([0,1,2,3].map(i=>machinePanelOptionLabel(m,i)))&&
     $('inspector').querySelector('#panelSelect').value==='3';
   m.face=oldFacing;inspectorRefresh();
   const encoded=ast1Encode(),bytes=Uint8Array.from(atob(encoded.slice(5)),c=>c.charCodeAt(0));
   const astByte=bytes[3+4];
   const roundtrip=ast1Decode(encoded).machines[0].panel;
   const rawJSON=compactFactoryJSON(),jsonStored=JSON.parse(rawJSON).machines[0][5]?.panel;
   const expanded=expandCompactFactoryLayout(JSON.parse(rawJSON)).machines[0].panel;
   const selectMode=$('inspector').querySelector('#modeSelect');
   selectMode.value='1';selectMode.dispatchEvent(new Event('change',{bubbles:true}));
   const modeChanged=m.mode===1&&state.routes.length===1&&state.routes[0].id==='preserved'&&
     $('inspector').querySelector('.machine-summary .machine-flow-output')?.textContent.includes('遐想物质');
   const priorMode=m.mode;
   const other={id:'fixed',type:'废料',mode:'标准',face:'W',x:12,y:12,panel:0};
   state={name:'固定配方',machines:[other],routes:[]};selection={machineId:'fixed'};inspectorRefresh();
   const fixedRecipe=!!$('inspector').querySelector('.machine-summary .machine-recipe-in-summary')&&
    !$('inspector').querySelector('#modeSelect')&&!!$('inspector').querySelector('#panelSelect');
   const noPanelLogistics=['分流','汇流','仓入','仓出'].every(type=>!supportsMachinePanel({type}));
   delete stampPrefs['组装'];setStampType('组装');
   const stampDefault=stampPanel===0&&getStampMachine(8,8).panel===0&&
     $('stampPanelRow').style.display==='flex';
   $('stampPanel').value='2';$('stampPanel').dispatchEvent(new Event('change',{bubbles:true}));
   const stampEdited=stampPanel===2&&getStampMachine(8,8).panel===2&&stampPrefs['组装']?.panel===2;
   const labelsBeforeRotation=[...$('stampPanel').options].map(o=>o.textContent.trim());
   const stampFacingBefore=stampFace;rotateStamp(1);
   const labelsAfterRotation=[...$('stampPanel').options].map(o=>o.textContent.trim());
   const stampRotated=stampFace!==stampFacingBefore&&stampPanel===2&&$('stampPanel').value==='2'&&
    JSON.stringify(labelsAfterRotation)===JSON.stringify([0,1,2,3].map(i=>machinePanelOptionLabel({face:stampFace},i)))&&
    labelsAfterRotation.some((v,i)=>v!==labelsBeforeRotation[i]);
   setStampType('仓入');
   const logisticStamp=$('stampPanelRow').style.display==='none'&&getStampMachine(8,8).panel===0;
   const stampPanelNames=[...$('stampPanel').options].map(o=>o.textContent.trim());
   const stampLabelsOnly=JSON.stringify(stampPanelNames)===JSON.stringify([0,1,2,3].map(i=>machinePanelOptionLabel({face:stampFace},i)));
   const noEmptyPlacementCards=['仓入','分流','汇流','发电','电脑','空间锚点'].every(type=>{
    setStampType(type);
    const box=$('stampRecipeText');
    return box.style.display==='none'&&box.innerHTML.trim()==='';
   });
   setStampType('仓出');
   const warehouseOutputCard=$('stampRecipeText').style.display==='block'&&
     $('stampRecipeText').textContent.includes('从仓库取出');
   setStampType('组装');
   const producingRecipeCard=$('stampRecipeText').style.display==='block'&&
     $('stampRecipeText').querySelector('.machine-config-flow')!==null;
   const strokes=[],bars=[],portBoxes=[],arcs=[],moves=[],segments=[];let closedPaths=0;
   const origStroke=ctx.stroke,origArc=ctx.arc,origFill=ctx.fillRect,origBox=ctx.strokeRect,origMove=ctx.moveTo,origLine=ctx.lineTo,origClose=ctx.closePath;
   try{
    ctx.stroke=function(){strokes.push({color:this.strokeStyle,width:this.lineWidth});return origStroke.apply(this,arguments)};
    ctx.arc=function(){arcs.push([...arguments]);return origArc.apply(this,arguments)};
    ctx.fillRect=function(x,y,w,h){bars.push({x,y,w,h,color:this.fillStyle});return origFill.apply(this,arguments)};
    ctx.strokeRect=function(x,y,w,h){portBoxes.push({x,y,w,h,color:this.strokeStyle,width:this.lineWidth});return origBox.apply(this,arguments)};
    ctx.moveTo=function(x,y){moves.push({x,y});return origMove.apply(this,arguments)};
    ctx.lineTo=function(x,y){segments.push({x,y});return origLine.apply(this,arguments)};
    ctx.closePath=function(){closedPaths++;return origClose.apply(this,arguments)};
    const panelMachine={type:'量装',face:'W',panel:3,x:12,y:12},[pw,ph]=dims(panelMachine);
    paintMachineIndicators(panelMachine,pw,ph);
    const triangle=strokes[0],bar=bars[0],tip=moves[0],firstBase=segments[0],lastBase=segments[1];
    const centerY=panelMachine.y+ph/2;
    const within=(p)=>p.x>panelMachine.x&&p.x<panelMachine.x+pw&&
      p.y>panelMachine.y&&p.y<panelMachine.y+ph;
    const machineTriangle=strokes.length===1&&triangle.color===makeColor(panelMachine)&&
      Math.abs(triangle.width-.105)<1e-8&&arcs.length===0&&
      within(tip)&&within(firstBase)&&within(lastBase)&&segments.length===2&&closedPaths===1&&
      tip.x<firstBase.x&&tip.x<lastBase.x&&
      Math.abs(tip.y-centerY)<1e-8&&Math.abs((firstBase.y+lastBase.y)/2-centerY)<1e-8&&
      Math.abs(firstBase.x-tip.x-.33)<1e-8&&
      Math.abs(Math.abs(firstBase.y-lastBase.y)-.32)<1e-8;
    const palePanelBar=bars.length===1&&bar.color==='#9dddff'&&
      Math.abs(bar.x-(panelMachine.x+pw-.21-.02))<1e-8&&
      Math.abs(bar.y-(centerY-1))<1e-8&&
      Math.abs(bar.w-.21)<1e-8&&Math.abs(bar.h-2)<1e-8;
    strokes.length=0;arcs.length=0;bars.length=0;moves.length=0;segments.length=0;
    const logisticMachine={type:'仓入',face:'W',x:12,y:12};
    paintMachineIndicators(logisticMachine,...dims(logisticMachine));
    const ins={kind:'in',x:13,y:16},outs={kind:'out',x:17,y:16};
    bars.length=0;portBoxes.length=0;
    paintPortSocket(ins);paintPortSocket(outs);
    const transparentSockets=bars.length===0&&portBoxes.length===2&&
      portBoxes[0].color==='#5baaff'&&portBoxes[1].color==='#ffae61'&&
      portBoxes.every(b=>Math.abs(b.width-.13)<1e-8&&Math.abs(b.w-.8)<1e-8&&Math.abs(b.h-.8)<1e-8);
    bars.length=0;portBoxes.length=0;
    const preview={type:'冶炼',face:'E',x:12,y:12};
    paintPreviewPorts(preview);
    const previewSockets=bars.length===0&&portBoxes.length===3&&
      portBoxes.filter(b=>b.color==='#5baaff').length===2&&
      portBoxes.filter(b=>b.color==='#ffae61').length===1;
    window.__panelCanvasTest={machineTriangle,palePanelBar,transparentSockets,previewSockets,
      noLogisticPanel:strokes.length===1&&strokes[0].color===makeColor(logisticMachine)&&
      bars.length===0&&arcs.length===0};
   }finally{ctx.stroke=origStroke;ctx.arc=origArc;ctx.fillRect=origFill;ctx.strokeRect=origBox;ctx.moveTo=origMove;ctx.lineTo=origLine;ctx.closePath=origClose;}
   const canvasTest=window.__panelCanvasTest;

   const oldLayout=expandCompactFactoryLayout(JSON.parse(rawJSON));
   delete oldLayout.machines[0].panel;
   const oldDefault=machinePanelPosition(oldLayout.machines[0])===0;
   return {directions,expected,defaultPanel,recipeBelowRate,changedPanel,astByte,roundtrip,stampDefault,stampEdited,logisticStamp,hiddenPanelIds,stampLabelsOnly,noEmptyPlacementCards,warehouseOutputCard,producingRecipeCard,canvasTest,
     jsonStored,expanded,modeChanged,priorMode,fixedRecipe,noPanelLogistics,oldDefault,stampRotated,inspectorRotated,rightSideLeftArrow};
  })()`);
  console.log('AST1 PANEL EDIT AND RECIPE CARD',JSON.stringify(panels));
  assert.deepEqual(panels.directions,panels.expected,'panel side must follow machine facing across all four orientations');
  assert(panels.defaultPanel&&panels.recipeBelowRate,'the default panel is 0 and recipe is under nominal output rate in Machine Details');
  assert(panels.changedPanel&&panels.astByte===3&&panels.roundtrip===3,'panel editor must update AST1 Byte 4');
  assert(panels.jsonStored===3&&panels.expanded===3&&panels.oldDefault,'JSON v12 round-trip must preserve the panel, older files default to zero');
  assert(panels.modeChanged&&panels.fixedRecipe,'multi-output recipe changes keep physical routes, single-output machine shows read-only recipe');
  assert(panels.noPanelLogistics&&panels.logisticStamp,'logistics machines must hide panel selection and default to zero');
  assert(panels.hiddenPanelIds&&panels.stampLabelsOnly&&panels.inspectorRotated&&panels.stampRotated&&panels.rightSideLeftArrow,'panel options must show the correct actual arrow (e.g. 右侧 · ←) and update on rotation');
  assert(panels.noEmptyPlacementCards&&panels.warehouseOutputCard&&panels.producingRecipeCard,
   'placement recipe card must vanish for non-recipe devices and appear only when relevant');
  assert(panels.stampDefault&&panels.stampEdited,'new machine palette must save and preview the chosen panel position');
  assert(panels.canvasTest.machineTriangle&&panels.canvasTest.palePanelBar&&panels.canvasTest.noLogisticPanel&&panels.canvasTest.transparentSockets&&panels.canvasTest.previewSockets,
   'Canvas must draw thin triangle, 2-cell pale-blue edge panel 1.5x thick, transparent colored-outline ports in normal and preview, and no panel on logistics');

  assert.equal(exceptions.length,0,'uncaught Edge exceptions: '+exceptions.join(' | '));
  console.log('PASS: right attributes, auto-recipe inputs, and compact left machine library');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
