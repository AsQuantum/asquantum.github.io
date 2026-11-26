'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-filter-ui-'));
const url='file:///'+path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,'--window-size=1400,900',url],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function poll(fn){for(let i=0;i<110;i++){try{const x=await fn();if(x)return x}catch(_){}await sleep(130)}throw Error('Edge CDP timeout');}
function desktopCase(){
 state={name:'splitter placement',machines:[],routes:[]};
 selection=null;multiSelection=null;groupTransform=null;resetSimulation();
 delete stampPrefs['分流'];delete stampPrefs['仓入'];setStampType('分流');
 const items=['太空垃圾','相位粒子','星尘粒子'];
 if(!items.every(x=>MATERIALS.includes(x)))throw Error('Missing test catalog item');
 const firstRender=$('stampSplitterFilterRows').style.display==='block'&&$('stampInletFilterRow').style.display==='none'&&
  [0,1,2].every(i=>$('stampSplitFilter'+i).options.length===MATERIALS.length+1);
 const unknownBlocked=[...$('stampSplitFilter0').options].every(o=>o.value!=='物品#462');
 const choose=(id,value)=>{const q=$(id);q.value=value;q.dispatchEvent(new Event('change',{bubbles:true}));};
 for(let i=0;i<3;i++)choose('stampSplitFilter'+i,items[i]);
 const saved=JSON.stringify(stampPrefs['分流'].splitterFilters)===JSON.stringify(items);
 const rotations=[],ast=[];
 for(let n=0;n<4;n++){
  const m=getStampMachine(13,15),ports=getPorts(m);
  const mapping=[0,1,2].every(i=>{
   const ix=ast1FilterPortFromGame(m,i),port=ports.find(p=>p.kind==='out'&&p.index===ix);
   return m.outFilters[ix]===items[i]&&$('stampSplitFilter'+i).value===items[i]&&
    $('stampSplitFilterLabel'+i).textContent===ast1FilterPortLabel(m,ix)+' · '+portDirectionArrow(port.side);
  });
  rotations.push({face:m.face,mapping});
  state={name:'one splitter',machines:[m],routes:[]};
  const encoded=ast1Encode(),read=ast1Decode(encoded),mm=read.machines[0];
  const decoded=[0,1,2].map(i=>mm.outFilters?.[ast1FilterPortFromGame(mm,i)]||'');
  ast.push(JSON.stringify(decoded)===JSON.stringify(items));
  state={name:'splitter placement',machines:[],routes:[]};rotateStamp(1);
 }
 setStampType('仓入');
 const inletOpen=$('stampInletFilterRow').style.display==='flex'&&
  $('stampSplitterFilterRows').style.display==='none'&&$('stampInletFilter').options.length===MATERIALS.length+1;
 choose('stampInletFilter',items[2]);
 const inMachine=getStampMachine(19,19);
 state={name:'one inlet',machines:[inMachine],routes:[]};
 const inDecode=ast1Decode(ast1Encode()).machines[0];
 const inletOK=inMachine.inletItem===items[2]&&inDecode.inletItem===items[2]&&
  acceptsMaterial(inMachine,items[2],0)&&!acceptsMaterial(inMachine,items[0],0);
 setStampType('分流');
 const prefsKept=JSON.stringify(stampSplitterFilters)===JSON.stringify(items);
 state={name:'right filters',machines:[{id:'s1',type:'分流',face:'E',x:12,y:12,outFilters:{}}],routes:[]};
 selection={machineId:'s1'};inspectorRefresh();
 const rightSelect=$('inspector').querySelector('[data-out-filter]');
 const rightTheme={scheme:getComputedStyle(rightSelect).colorScheme,
  scrollbar:getComputedStyle(rightSelect).scrollbarColor,
  option:getComputedStyle(rightSelect.options[0]).backgroundColor};
 state={name:'inlet props',machines:[{id:'in1',type:'仓入',face:'E',x:12,y:12}],routes:[]};
 selection={machineId:'in1'};inspectorRefresh();
 const inletRight=$('inspector').querySelector('#warehouseInFilterSelect');
 const warehouseTheme={scheme:getComputedStyle(inletRight).colorScheme,
  scrollbar:getComputedStyle(inletRight).scrollbarColor};
 const leftSelect=$('stampSplitFilter0');
 const leftTheme={scheme:getComputedStyle(leftSelect).colorScheme,
  scrollbar:getComputedStyle(leftSelect).scrollbarColor};
 const baseSelectSupported=CSS.supports('appearance','base-select');
 const globalSelects=[...document.querySelectorAll('select')];
 const uniformSelects=globalSelects.every(x=>getComputedStyle(x).colorScheme==='dark'&&
  (!baseSelectSupported||getComputedStyle(x).appearance==='base-select'));
 const pickerBg=getComputedStyle(rightSelect,'::picker(select)').backgroundColor;
 const optionBg=getComputedStyle(rightSelect.options[0]).backgroundColor;
 return {firstRender,unknownBlocked,saved,rotations,ast,inletOpen,inletOK,prefsKept,rightTheme,warehouseTheme,leftTheme,
  baseSelectSupported,uniformSelects,pickerBg,optionBg,selectorCount:globalSelects.length};
}
function mobileCase(){
 state={name:'mobile filters',machines:[],routes:[]};selection=null;multiSelection=null;
 groupTransform=null;mobileOpenView('machines');
 const paletteButton=[...document.querySelectorAll('#palette [data-stamp]')].find(b=>b.dataset.stamp==='分流');
 paletteButton.click();
 const groupCard=$('groupControls'),library=$('stampControls').parentElement,originalGroupHome=groupCard.parentNode;
 const machineLibraryHasNoGroupPanel=originalGroupHome.classList.contains('editor-tools')&&
  !library.contains(groupCard)&&groupCard.getBoundingClientRect().width===0;
 const libraryIsOriginal=document.querySelectorAll('#groupControls').length===1&&
  groupCard.parentNode===originalGroupHome&&!library.contains(groupCard);
 // Placement controls stay in the existing Tools card, not the machine list.
 mobileOpenView('tools');
 const cancelButton=$('groupCancel'),cancelHint=cancelButton.querySelector('small');
 const cancelStyle=getComputedStyle(cancelButton),cancelHintStyle=getComputedStyle(cancelHint);
 const cancelRect=cancelButton.getBoundingClientRect(),hintRect=cancelHint.getBoundingClientRect();
 const cancelEscInline=cancelStyle.display==='flex'&&cancelStyle.flexDirection==='row'&&
  cancelStyle.whiteSpace==='nowrap'&&cancelHintStyle.display!=='block'&&
  cancelHintStyle.whiteSpace==='nowrap'&&
  Math.abs((hintRect.top+hintRect.height/2)-(cancelRect.top+cancelRect.height/2))<4;
 mobileOpenView('machines');
 const pendingFace=stampFace;$('mobileRotateRight').click();
 const pendingRotates=stampFace!==pendingFace;
 $('mobileRotateLeft').click();
 const pendingRestores=stampFace===pendingFace;
 const left=$('stampSplitterFilterRows');
 const filterCardVisible=left.style.display==='block'&&left.getBoundingClientRect().width>150;
 const allOptions=[0,1,2].every(i=>$('stampSplitFilter'+i).options.length===MATERIALS.length+1);
 const cardScrollable=getComputedStyle($('stampControls')).overflowY==='auto';
 const noDupButtons=!$('stampLeft')&&!$('stampRight');
 mobileOpenView('map');
 const mapHasNoGroupOverlay=!document.querySelector('.canvaswrap #groupControls')&&
  groupCard.parentNode===originalGroupHome;
 const topTools=[...document.querySelector('.top .sim-toolbar').children];
 const select=topTools.findIndex(e=>e.dataset.tool==='select');
 const belt=topTools.findIndex(e=>e.dataset.tool==='belt');
 const run=topTools.findIndex(e=>e.id==='run');
 const topOK=select>=0&&belt>select&&run>belt&&
  getComputedStyle(topTools[select]).display!=='none'&&getComputedStyle(topTools[belt]).display!=='none';
 const simStep=$('stepMinute'),simStepStyle=getComputedStyle(simStep);
 const minuteSymbolVisible=simStep.textContent.includes('⏩')&&
  parseFloat(simStepStyle.fontSize)>=10&&
  getComputedStyle(simStep,'::after').content==='none';
 const mapTools=document.querySelector('.mobile-map-tools');
 const rotateButtons=!!$('mobileRotateLeft')&&!!$('mobileRotateRight')&&
  !mapTools.querySelector('[data-tool=select]')&&!mapTools.querySelector('[data-tool=belt]');
 const quick=[...mapTools.querySelectorAll('button')];
 const textOnly=JSON.stringify(quick.map(x=>x.textContent.trim()))===
  JSON.stringify(['左转','右转','删除','撤销','重做','适应']);
 const textSizeMatch=quick.every(b=>getComputedStyle(b).fontSize===getComputedStyle(quick[0]).fontSize&&
  getComputedStyle(b).fontWeight===getComputedStyle(quick[0]).fontWeight);
 const oldFace=stampFace;
 $('mobileRotateRight').click();
 const previewRotated=stampFace!==oldFace&&stampType==='分流';
 $('mobileRotateLeft').click();
 const previewRestored=stampFace===oldFace;
 state={name:'selected machine',machines:[{id:'rotate',type:'垃圾',x:15,y:20,face:'E',mode:0}],routes:[]};
 stampType=null;tool='select';selection={machineId:'rotate'};multiSelection=null;groupTransform=null;
 $('mobileRotateRight').click();
 const groupSafe=groupTransform?.rotation===1&&state.machines[0].face==='E';
 cancelGroupTransform();
 const canceled=groupTransform===null&&state.machines[0].face==='E';
 // Keep the original #groupControls card in its editor-tools home. It is
 // intentionally NOT duplicated or overlaid on the phone map.
 updateGroupControls();
 const cancelHiddenForSelection=getComputedStyle($('groupCancel')).display==='none';
 const groupHome=groupCard.parentNode;
 const groupDebug={originalSlot:groupHome.classList.contains('editor-tools'),
  style:getComputedStyle(groupCard).display,
  text:$('groupSelectionInfo').textContent,width:groupCard.getBoundingClientRect().width,
  moveDisabled:$('groupMove').disabled,copyDisabled:$('groupCopy').disabled,
  deleteDisabled:$('groupDelete').disabled,view:mobileActiveView};
 const originalSlotPreserved=groupDebug.originalSlot&&
  !document.querySelector('.canvaswrap #groupControls');
 mobileOpenView('tools');
 const selectedPanelVisible=originalSlotPreserved&&groupCard.parentNode===groupHome&&
  getComputedStyle(groupCard).display!=='none'&&
  groupDebug.text.includes('已框选 1 台机器')&&
  groupCard.getBoundingClientRect().width>200&&
  !groupDebug.moveDisabled&&!groupDebug.copyDisabled&&!groupDebug.deleteDisabled;
 const groupToolsRestored=selectedPanelVisible;
 mobileOpenView('machines');
 const selectedCardHiddenInMachineLibrary=groupCard.parentNode===groupHome&&
  !$('stampControls').parentNode.contains(groupCard)&&groupCard.getBoundingClientRect().width===0&&
  $('groupSelectionInfo').textContent.includes('已框选 1 台机器');
 mobileOpenView('map');
 const groupMapRestored=groupCard.parentNode===groupHome&&
  groupCard.style.display==='block'&&groupCard.getBoundingClientRect().width===0;
 document.querySelector('.top .mobile-sim-tool[data-tool=select]').click();
 const cleanSelect=tool==='select'&&!selection&&!stampType&&!groupTransform&&
  getComputedStyle(groupCard).display==='none';
 document.querySelector('.top .mobile-sim-tool[data-tool=belt]').click();
 const wiring=tool==='belt';
 return {filterCardVisible,allOptions,cardScrollable,noDupButtons,topOK,rotateButtons,
  previewRotated,previewRestored,groupSafe,canceled,cleanSelect,wiring,
  selectedPanelVisible,groupToolsRestored,groupMapRestored,originalSlotPreserved,cancelHiddenForSelection,groupDebug,textOnly,textSizeMatch,minuteSymbolVisible,machineLibraryHasNoGroupPanel,libraryIsOriginal,cancelEscInline,pendingRotates,pendingRestores,mapHasNoGroupOverlay,selectedCardHiddenInMachineLibrary};
}
(async()=>{
 let ws;
 try{
  const active=await poll(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8'):null);
  const port=active.trim().split(/\r?\n/)[0];
  const target=await poll(async()=>{const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return pages.find(p=>p.type==='page'&&p.url.includes('project-astra-factory'))});
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});
  let next=0;const pending=new Map(),errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);
   if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
   if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=(method,params={})=>new Promise(ok=>{const id=++next;pending.set(id,ok);ws.send(JSON.stringify({id,method,params}))});
  const evalJS=async expr=>{const m=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
   if(m.result?.exceptionDetails)throw Error(m.result.exceptionDetails.exception?.description||m.result.exceptionDetails.text);
   return m.result?.result?.value;};
  await send('Runtime.enable');
  await poll(()=>evalJS('document.readyState==="complete"&&typeof stampKnownFilter==="function"'));
  const desktop=await evalJS('('+desktopCase.toString()+')()');
  assert(desktop.firstRender&&desktop.unknownBlocked&&desktop.saved&&desktop.inletOpen&&desktop.inletOK&&desktop.prefsKept,
   'splitter/warehouse stamp filters must persist and map into machines');
  assert(desktop.rotations.length===4&&desktop.rotations.every(x=>x.mapping),
   'three relative splitter filters must follow correct ports through all rotations');
  assert(desktop.ast.every(Boolean),'all four splitter orientations must preserve filters through AST1');
  for(const theme of [desktop.rightTheme,desktop.warehouseTheme,desktop.leftTheme]){
   assert(theme.scheme.includes('dark'),'native select popup must use dark color-scheme');
   assert(theme.scrollbar!=='auto'&&theme.scrollbar.includes('rgb'),'native selector scrollbars must be dark themed');
  }
  assert.notEqual(desktop.rightTheme.option,'rgb(255, 255, 255)');
  assert(desktop.uniformSelects,'all selects in the app must share the same dark native/customizable picker');
  if(desktop.baseSelectSupported)assert.notEqual(desktop.pickerBg,'rgb(255, 255, 255)','picker popup itself must be dark');
  console.log('PASS DESKTOP '+desktop.selectorCount+' global dark selectors, customizable picker '+desktop.baseSelectSupported+
   ', popup '+desktop.pickerBg+', splitter/warehouse filters and AST1');
  const desktopPalette=await evalJS('(()=>{'+
   'const b=[...document.querySelectorAll("#palette [data-stamp]")].find(x=>x.dataset.stamp==="分流");'+
   'b.click();const card=$("groupControls"),info=$("groupSelectionInfo").textContent;'+
   'const shown=getComputedStyle(card).display!=="none"&&'+
   'card.parentNode.classList.contains("editor-tools")&&info.includes("已框选 1 台机器")&&'+
   '!$("groupLeft").disabled&&!$("groupRight").disabled&&$("groupMove").disabled;'+
   'const f=stampFace;$("groupRight").click();const rotated=stampFace!==f;'+
   '$("groupCancel").click();const canceled=!stampType&&tool==="select"&&'+
   'getComputedStyle($("stampControls")).display==="none"&&card.style.display==="none";'+
   'return {shown,rotated,canceled};})()');
  assert(desktopPalette.shown&&desktopPalette.rotated&&desktopPalette.canceled,
   'desktop palette click must restore original group card, preview rotation and cancel');
  console.log('PASS DESKTOP machine library click restores original selected-preview action menu');
  // Force a real Chromium :hover state on a dropdown option: its highlight
  // must follow the Factory Lab dark theme rather than the white OS palette.
  if(desktop.baseSelectSupported){
   await send('DOM.enable');await send('CSS.enable');
   const dom=await send('DOM.getDocument',{depth:1});
   const optionNode=await send('DOM.querySelector',{
    nodeId:dom.result.root.nodeId,selector:'#stampSplitFilter0 option:nth-child(2)'});
   assert(optionNode.result.nodeId,'splitter placement option exists');
   await send('CSS.forcePseudoState',{nodeId:optionNode.result.nodeId,forcedPseudoClasses:['hover']});
   const hover=await evalJS('(()=>{const o=document.querySelector("#stampSplitFilter0 option:nth-child(2)");'+
    'const c=getComputedStyle(o);return {background:c.backgroundColor,color:c.color};})()');
   await send('CSS.forcePseudoState',{nodeId:optionNode.result.nodeId,forcedPseudoClasses:[]});
   assert.equal(hover.background,'rgb(43, 64, 88)','hover background must be theme blue, not white');
   assert.equal(hover.color,'rgb(244, 246, 249)','hover text must remain light, not black');
   console.log('PASS DESKTOP picker option hover uses dark blue background and light text');
  }

  // Base-select must retain the closed control's dimensions and one-line
  // selected label. The old Inspector display:block caused 50px + two rows.
  const selectMetrics=await evalJS('(()=>{'+
   'state={name:"selector layout",machines:[{id:"s",type:"分流",face:"E",x:12,y:12,outFilters:{}}],routes:[]};'+
   'selection={machineId:"s"};inspectorRefresh();setStampType("分流");'+
   'return ["#simSpeed","#stampSplitFilter0","#inspector [data-out-filter]"].map(sel=>{'+
   'let e=document.querySelector(sel),c=getComputedStyle(e),i=getComputedStyle(e,"::picker-icon");'+
   'return {sel,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,'+
   'display:c.display,align:c.alignItems,appearance:c.appearance,'+
   'bg:c.backgroundColor,iconWidth:parseFloat(i.width)};});})()');
  const bySel=Object.fromEntries(selectMetrics.map(x=>[x.sel,x]));
  assert.equal(await evalJS('getComputedStyle(document.querySelector(".top .mobile-sim-tool")).display'),'none',
   'Select/Belt quick actions must never appear on desktop');
  assert.equal(bySel['#simSpeed'].height,30,'multiplier selected text must be vertically aligned in 30px');
  assert.equal(bySel['#stampSplitFilter0'].height,34,'left machine dropdown must remain 34px');
  assert.equal(bySel['#inspector [data-out-filter]'].height,35,
   'right Inspector dropdown must not expand to 50px with a second-row chevron');
  for(const m of selectMetrics){
   assert.equal(m.display,'flex',m.sel+' needs one-line flex layout');
   assert.equal(m.align,'center',m.sel+' selected label must be centered vertically');
   assert(m.iconWidth<16,m.sel+' picker icon must be compact rather than full width');
   assert.equal(m.bg,'rgb(23, 37, 56)',m.sel+' uses unified closed-box theme');
  }
  console.log('PASS DESKTOP closed dropdowns: speed 30px, left 34px, right 35px and centered labels; mobile quick tools hidden');
  // Test a real mouse moving through the expanded right-hand picker, not just
  // forcePseudoState on an unrelated option.
  const point=await evalJS('(()=>{const e=document.querySelector("#inspector [data-out-filter]");'+
   'e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();'+
   'return{x:r.left+r.width/2,y:r.top+r.height/2};})()');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
  assert(await evalJS('document.querySelector("#inspector [data-out-filter]").matches(":open")'),
   'right Inspector popup must open');
  await sleep(230);
  const openMotion=await evalJS('(()=>{const e=document.querySelector("#inspector [data-out-filter]");window.__testSelect=e;'+
   'const icon=getComputedStyle(e,"::picker-icon"),picker=getComputedStyle(e,"::picker(select)");'+
   'return {open:e.matches(":open"),iconTransform:icon.transform,iconTransition:icon.transitionDuration,'+
   'pickerOpacity:picker.opacity,pickerTransform:picker.transform,pickerTransition:picker.transition};})()');
  assert(openMotion.open,'dropdown is in the open state');
  assert.equal(openMotion.iconTransform,'matrix(-1, 0, 0, -1, 0, 0)',
   'open dropdown chevron must rotate upward');
  assert.equal(openMotion.iconTransition,'0.18s','chevron rotation must animate');
  assert.equal(openMotion.pickerOpacity,'1','opened picker must finish its fade-in');
  assert(openMotion.pickerTransition.includes('opacity 0.16s')&&
   openMotion.pickerTransition.includes('transform 0.18s')&&
   openMotion.pickerTransition.includes('allow-discrete'),
   'picker must animate opacity/position and transition into the top layer');
  console.log('PASS DESKTOP dropdown open animation: upward chevron + popup fade/slide');
  const hoveredOption=await evalJS('(()=>{const o=document.querySelector("#inspector [data-out-filter] option:nth-child(3)");'+
   'const r=o.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:hoveredOption.x,y:hoveredOption.y});
  const realHover=await evalJS('(()=>{const o=document.querySelector("#inspector [data-out-filter] option:nth-child(3)");'+
   'const c=getComputedStyle(o);return {hover:o.matches(":hover"),bg:c.backgroundColor,color:c.color};})()');
  assert(realHover.hover,'actual mouse must hover right Inspector option');
  assert.equal(realHover.bg,'rgb(43, 64, 88)','right Inspector hovered background must be dark blue');
  assert.equal(realHover.color,'rgb(244, 246, 249)','right Inspector hovered text must be light');
  // Click the same select to close its picker without clearing machine
  // selection (Escape intentionally exits the editor's selection mode).
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
  await sleep(220);
  const closeMotion=await evalJS('(()=>{const e=window.__testSelect,icon=getComputedStyle(e,"::picker-icon");'+
   'return {open:e.matches(":open"),iconTransform:icon.transform};})()');
  assert.equal(closeMotion.open,false,'closed dropdown must leave :open state');
  assert(!closeMotion.iconTransform.includes('matrix(-1,'),'closed chevron must no longer point upward');
  console.log('PASS DESKTOP dropdown close animation: chevron returns downward');

  console.log('PASS DESKTOP real mouse hover in right-hand expanded picker stays themed');
  // Click an actually drawn machine with the real mouse event path; the
  // already-existing shared #groupControls card must appear immediately.
  const prepareMachineTap=()=>evalJS('(()=>{'+
   'state={name:"single click",machines:[{id:"actual-click",type:"垃圾",x:22,y:22,face:"E",mode:0}],routes:[]};'+
   'stampType=null;tool="select";selection=null;multiSelection=null;groupTransform=null;draft=null;'+
   'updateGroupControls();resize();'+
   'const r=canvas.getBoundingClientRect(),mid={x:r.width*.5,y:r.height*.6};'+
   'camera.z=10;camera.x=mid.x-23*camera.z;camera.y=mid.y-23*camera.z;draw();'+
   'return {x:r.left+mid.x,y:r.top+mid.y};})()');
  const desktopTap=await prepareMachineTap();
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:desktopTap.x,y:desktopTap.y});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:desktopTap.x,y:desktopTap.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:desktopTap.x,y:desktopTap.y,button:'left',clickCount:1});
  const desktopClicked=await evalJS('({id:selection?.machineId,text:$("groupSelectionInfo").textContent,'+
   'display:getComputedStyle($("groupControls")).display,count:activeMachineSelectionIds().length})');
  assert.equal(desktopClicked.id,'actual-click','desktop click should select placed machine');
  assert(desktopClicked.text.includes('已框选 1 台机器 / 0 条线路')&&
   desktopClicked.display!=='none'&&desktopClicked.count===1,
   'desktop selected machine must display existing group card');
  console.log('PASS DESKTOP real machine click displays original selected-machine group card');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await sleep(150);
  const mobileTap=await prepareMachineTap();
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...mobileTap,id:93}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const mobileClicked=await evalJS('({id:selection?.machineId,text:$(\"groupSelectionInfo\").textContent,'+
   'display:getComputedStyle($(\"groupControls\")).display,'+
   'parent:$(\"groupControls\").parentNode.className,'+
   'count:activeMachineSelectionIds().length,mapDock:!!$(\"mobileGroupDock\")})');
  assert.equal(mobileClicked.id,'actual-click','real phone finger tap selects existing machine');
  assert(mobileClicked.text.includes('已框选 1 台机器')&&
   mobileClicked.display!=='none'&&mobileClicked.parent.includes('editor-tools')&&
   mobileClicked.count===1&&!mobileClicked.mapDock,
   'real phone tap must update original editor-tools selected-machine card without a map overlay');
  await evalJS('mobileOpenView(\"tools\")');
  const mobileOriginalMenu=await evalJS('({parent:$(\"groupControls\").parentNode.className,'+
   'display:getComputedStyle($(\"groupControls\")).display,'+
   'width:$(\"groupControls\").getBoundingClientRect().width,'+
   'text:$(\"groupSelectionInfo\").textContent})');
  assert(mobileOriginalMenu.parent.includes('editor-tools')&&mobileOriginalMenu.display!=='none'&&
   mobileOriginalMenu.width>170&&mobileOriginalMenu.text.includes('已框选 1 台机器'),
   'opening Tools after selecting a machine must reveal the original selected-machine menu');
  await evalJS('mobileOpenView(\"map\")');
  console.log('PASS MOBILE actual tap restores selected-machine menu in original Tools panel; no map overlay');
  const mobile=await evalJS('('+mobileCase.toString()+')()');
  for(const key of ['filterCardVisible','allOptions','cardScrollable','noDupButtons','topOK','rotateButtons','previewRotated','previewRestored','groupSafe','canceled','cleanSelect','wiring','selectedPanelVisible','groupToolsRestored','groupMapRestored','originalSlotPreserved','cancelHiddenForSelection','textOnly','textSizeMatch','minuteSymbolVisible','machineLibraryHasNoGroupPanel','libraryIsOriginal','cancelEscInline','pendingRotates','pendingRestores','mapHasNoGroupOverlay','selectedCardHiddenInMachineLibrary'])
   assert(mobile[key], 'mobile '+key+' should be true');
  console.log('PASS MOBILE filter card, top Select/Belt, map rotation for stamp/group, no duplicate controls');
  assert.deepEqual(errors,[]);
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
 finally{try{ws?.close()}catch(_){}
  try{child.kill()}catch(_){}
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100})}catch(_){}
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
