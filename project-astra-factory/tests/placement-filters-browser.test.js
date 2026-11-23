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
 groupTransform=null;setStampType('分流');mobileOpenView('machines');
 const left=$('stampSplitterFilterRows');
 const filterCardVisible=left.style.display==='block'&&left.getBoundingClientRect().width>150;
 const allOptions=[0,1,2].every(i=>$('stampSplitFilter'+i).options.length===MATERIALS.length+1);
 const cardScrollable=getComputedStyle($('stampControls')).overflowY==='auto';
 const noDupButtons=!$('stampLeft')&&!$('stampRight');
 mobileOpenView('map');
 const topTools=[...document.querySelector('.top .sim-toolbar').children];
 const select=topTools.findIndex(e=>e.dataset.tool==='select');
 const belt=topTools.findIndex(e=>e.dataset.tool==='belt');
 const run=topTools.findIndex(e=>e.id==='run');
 const topOK=select>=0&&belt>select&&run>belt&&
  getComputedStyle(topTools[select]).display!=='none'&&getComputedStyle(topTools[belt]).display!=='none';
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
 // The original selection toolbar must be directly visible and usable on
 // the map. Reuse the SAME #groupControls card as on desktop.
 updateGroupControls();
 const groupCard=$('groupControls'),groupDock=$('mobileGroupDock');
 const groupDebug={dock:groupCard.parentNode===groupDock,
  style:getComputedStyle(groupCard).display,dockStyle:getComputedStyle(groupDock).display,
  text:$('groupSelectionInfo').textContent,width:groupCard.getBoundingClientRect().width,
  moveDisabled:$('groupMove').disabled,copyDisabled:$('groupCopy').disabled,deleteDisabled:$('groupDelete').disabled,
  view:mobileActiveView};
 const selectedPanelVisible=groupDebug.dock&&groupDebug.style!=='none'&&groupDebug.dockStyle!=='none'&&
  groupDebug.text.includes('已框选 1 台机器 / 0 条线路')&&
  groupDebug.width>200&&
  !groupDebug.moveDisabled&&!groupDebug.copyDisabled&&!groupDebug.deleteDisabled;
 mobileOpenView('tools');
 const groupToolsRestored=groupCard.parentNode.classList.contains('editor-tools')&&
  getComputedStyle(groupCard).display!=='none';
 mobileOpenView('map');
 const groupMapRestored=groupCard.parentNode===groupDock&&
  getComputedStyle(groupCard).display!=='none';
 document.querySelector('.top .mobile-sim-tool[data-tool=select]').click();
 const cleanSelect=tool==='select'&&!selection&&!stampType&&!groupTransform&&
  getComputedStyle(groupCard).display==='none';
 document.querySelector('.top .mobile-sim-tool[data-tool=belt]').click();
 const wiring=tool==='belt';
 return {filterCardVisible,allOptions,cardScrollable,noDupButtons,topOK,rotateButtons,
  previewRotated,previewRestored,groupSafe,canceled,cleanSelect,wiring,
  selectedPanelVisible,groupToolsRestored,groupMapRestored,groupDebug,textOnly,textSizeMatch};
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
   assert.equal(hover.background,'rgb(43, 89, 113)','hover background must be theme blue, not white');
   assert.equal(hover.color,'rgb(248, 255, 255)','hover text must remain light, not black');
   console.log('PASS DESKTOP picker option hover uses dark blue background and light text');
  }

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
  const mobileClicked=await evalJS('({id:selection?.machineId,text:$("groupSelectionInfo").textContent,'+
   'display:getComputedStyle($("groupControls")).display,'+
   'dock:getComputedStyle($("mobileGroupDock")).display,'+
   'width:$("groupControls").getBoundingClientRect().width})');
  assert.equal(mobileClicked.id,'actual-click','real phone finger tap selects existing machine');
  assert(mobileClicked.text.includes('已框选 1 台机器 / 0 条线路')&&
   mobileClicked.display!=='none'&&mobileClicked.dock!=='none'&&mobileClicked.width>170,
   'real phone tap must show the original selected-machine card on map');
  console.log('PASS MOBILE actual finger tap displays original selected-machine group card');
  const mobile=await evalJS('('+mobileCase.toString()+')()');
  for(const key of ['filterCardVisible','allOptions','cardScrollable','noDupButtons','topOK','rotateButtons','previewRotated','previewRestored','groupSafe','canceled','cleanSelect','wiring','selectedPanelVisible','groupToolsRestored','groupMapRestored','textOnly','textSizeMatch'])
   assert(mobile[key], 'mobile '+key+' should be true');
  console.log('PASS MOBILE filter card, top Select/Belt, map rotation for stamp/group, no duplicate controls');
  assert.deepEqual(errors,[]);
 }catch(e){console.error(e.stack||e);process.exitCode=1;}
 finally{try{ws?.close()}catch(_){}
  try{child.kill()}catch(_){}
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100})}catch(_){}
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
