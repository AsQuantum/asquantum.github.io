'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url='file:///'+path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-mobile-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--window-size=1280,900','--user-data-dir='+dir,url],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(fn){for(let i=0;i<120;i++){try{const v=await fn();if(v)return v;}catch(e){}await delay(130)}throw Error('Edge startup timed out')}
(async()=>{
 let ws;
 try{
  const active=await poll(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8'):null);
  const port=active.trim().split(/\r?\n/)[0];
  const target=await poll(async()=>{const all=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return all.find(t=>t.type==='page'&&t.url.includes('project-astra-factory'))});
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
  let seq=0;const pending=new Map(),errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
  const send=(method,params={})=>new Promise(resolve=>{const id=++seq;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}))});
  async function evalJS(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text);return r.result?.result?.value}
  async function viewport(width,height){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});
   await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
   await delay(120);
  }
  const measure=()=>evalJS(`(()=>{
    const el=selector=>document.querySelector(selector);
    const box=selector=>{const r=el(selector).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,display:getComputedStyle(el(selector)).display}};
    return{screen:{w:innerWidth,h:innerHeight},main:box('.main'),header:box('.top'),map:box('.canvaswrap'),canvas:box('#map'),
     nav:box('.mobile-nav'),tools:box('.mobile-map-tools'),left:box('.side.left'),right:box('.side.right'),
     brand:box('.brand'),preset:box('#presetDropdown'),editMenu:box('#editMenuWrap'),sim:box('.sim-toolbar'),simButtons:[...el('.sim-toolbar').querySelectorAll('button')].map(b=>{let r=b.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width}}),
     contentOverflow:document.documentElement.scrollWidth>innerWidth+1,view:el('.main').dataset.mobileView,
     activeNav:[...document.querySelectorAll('.mobile-nav button.active')].map(b=>b.dataset.mobileView)};
   })()`);
  await send('Runtime.enable');
  await viewport(390,844);
  await poll(()=>evalJS('document.readyState==="complete" && typeof mobileOpenView==="function"'));
  const home=await measure();console.log('PHONE HOME',JSON.stringify(home));
  assert.equal(home.nav.display,'grid');assert.equal(home.activeNav[0],'map');
  assert(home.map.w>=380&&home.canvas.h>350,'full map available');
  assert(home.right.display==='none'&&home.left.display==='none','mobile sides initially hidden');
  assert(home.nav.bottom<=844+1,'nav inside viewport');
  assert(!home.contentOverflow,'no horizontal document overflow');
  assert(home.preset.right<=390&&home.editMenu.right<=390,'top preset and editor menu must fit screen');

  // Mobile Edit takes the full viewport; its submenus expand downward in flow.
  const editMobile=await evalJS(`(()=>{
   $('editMenuButton').click();
   const menu=$('editMenu'),r=menu.getBoundingClientRect();
   const openButton=menu.querySelector('[data-edit-submenu="import"]');
   openButton.click();
   const group=openButton.closest('.edit-menu-parent');
   const child=group.querySelector('.edit-submenu').getBoundingClientRect();
   const heading=openButton.getBoundingClientRect();
   const show=getComputedStyle(group.querySelector('.edit-submenu'));
   const state={rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
     role:menu.getAttribute('role'),modal:menu.getAttribute('aria-modal'),
     expanded:openButton.getAttribute('aria-expanded'),
     submenu:{left:child.left,right:child.right,top:child.top,bottom:child.bottom},
     trigger:{top:heading.top,bottom:heading.bottom},
     display:show.display};
   $('mobileEditClose').click();
   return {...state,closed:menu.hidden};
  })()`);
  console.log('MOBILE FULL SCREEN EDIT',JSON.stringify(editMobile));
  assert(Math.abs(editMobile.rect.left)<2&&Math.abs(editMobile.rect.top)<2);
  assert(Math.abs(editMobile.rect.right-390)<2&&Math.abs(editMobile.rect.bottom-844)<2);
  assert.equal(editMobile.role,'dialog');assert.equal(editMobile.modal,'true');
  assert.equal(editMobile.expanded,'true');
  assert(editMobile.submenu.top>=editMobile.trigger.bottom-2);
  assert(editMobile.submenu.left>=0&&editMobile.submenu.right<=390);
  assert.equal(editMobile.display,'flex');assert.equal(editMobile.closed,true);
  // Tap the expanded export submenu through the emulated touch screen.
  const exportButtonPoint=await evalJS(`(()=>{
   state={name:'touch menu export',machines:[{id:'one',type:'垃圾',mode:0,x:6,y:12,face:'E'}],routes:[]};
   $('editMenuButton').click();
   $('editMenu').querySelector('[data-edit-submenu="export"]').click();
   const item=$('editMenu').querySelector('[data-edit-action="export-ast"]');
   item.scrollIntoView({block:'center'});
   const r=item.getBoundingClientRect();
   return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};
  })()`);
  assert(exportButtonPoint.y>0&&exportButtonPoint.y<844,'mobile submenu export action is reachable on the screen');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:exportButtonPoint.x,y:exportButtonPoint.y,id:19}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const exported=await evalJS("({menuClosed:$('editMenu').hidden,dialogVisible:$('ast1Panel').style.display==='block',prefix:$('ast1Text').value.slice(0,5)})");
  console.log('MOBILE TOUCH EXPORT AST',JSON.stringify({exportButtonPoint,exported}));
  assert(exported.menuClosed&&exported.dialogVisible&&exported.prefix==='AST1:','touch must activate secondary Export AST option and open code dialog');
  await evalJS("$('ast1Close').click()");
  const tooling=await evalJS(`(()=>{
   document.querySelector('.mobile-nav [data-mobile-view="tools"]').click();
   return{view:document.querySelector('.main').dataset.mobileView,
    left:getComputedStyle(document.querySelector('.side.left')).display,
    editVisible:getComputedStyle(document.querySelector('.editor-tools')).display,
    libraryHidden:getComputedStyle(document.querySelector('.machine-library')).display};
  })()`);
  console.log('MOBILE TOOLS',JSON.stringify(tooling));
  assert.equal(tooling.view,'tools');assert.equal(tooling.left,'flex');
  assert.equal(tooling.libraryHidden,'none');
  assert.equal(tooling.editVisible,'block');
  const choose=await evalJS(`(()=>{
   document.querySelector('.side.left .editor-tools [data-tool="belt"]').click();
   return{tool,view:document.querySelector('.main').dataset.mobileView,
    quickActive:document.querySelector('.mobile-map-tools [data-tool="belt"]').classList.contains('active')};
  })()`);
  assert.deepEqual(choose,{tool:'belt',view:'map',quickActive:true});
  const library=await evalJS(`(()=>{
   document.querySelector('.mobile-nav [data-mobile-view="machines"]').click();
   const btn=document.querySelector('#palette [data-stamp="垃圾"]');btn.click();
   const choose={view:document.querySelector('.main').dataset.mobileView,stampType,
    stampBarHidden:document.querySelector('#mobileStampBar').hidden,
    editingVisible:getComputedStyle(document.querySelector('#stampControls')).display,
    machineScroll:document.querySelector('.machine-library-scroll').clientHeight};
   document.querySelector('#mobilePlaceButton').click();
   return {...choose,viewAfterPlace:document.querySelector('.main').dataset.mobileView};
  })()`);
  console.log('MOBILE MACHINE LIBRARY',JSON.stringify(library));
  assert.equal(library.view,'machines');assert.equal(library.stampType,'垃圾');
  assert(!library.stampBarHidden&&library.editingVisible!=='none');
  assert(library.machineScroll>100,'machine library can scroll within panel');
  assert.equal(library.viewAfterPlace,'map');
  // Test an actual touch on the mobile map, not just clicking the palette.
  const touchPoint=await evalJS(`(()=>{
   // Test on a controlled empty layout to avoid blocked cells in the initial preset.
   state={name:'mobile touch regression',machines:[],routes:[]};resetSimulation();autoFit();
   const m=getStampMachine(7,15);
   if(!canPlace(m))throw Error('Touch test placement area is blocked');
   const r=canvas.getBoundingClientRect();
   return {x:r.left+camera.x+7.5*camera.z,y:r.top+camera.y+15.5*camera.z,
    countBefore:state.machines.length};
  })()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchPoint.x,y:touchPoint.y,id:21}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const placed=await evalJS("({count:state.machines.length,selected:selection?.machineId,tool,stampType})");
  console.log('MOBILE TOUCH PLACEMENT',JSON.stringify({touchPoint,placed}));
  assert.equal(placed.count,touchPoint.countBefore+1,'single-finger tap places one machine');
  assert(placed.selected,'placed machine selected');

  const pane=await evalJS(`(()=>{
   document.querySelector('.mobile-nav [data-mobile-view="inspector"]').click();
   const a={view:document.querySelector('.main').dataset.mobileView,
    right:getComputedStyle(document.querySelector('.side.right')).display,
    inspector:getComputedStyle(document.querySelector('#inspector')).display,
    warehouseHidden:getComputedStyle(document.querySelector('#warehousePanel')).display};
   document.querySelector('.mobile-nav [data-mobile-view="warehouse"]').click();
   return{...a,warehouse:{view:document.querySelector('.main').dataset.mobileView,
    open:document.querySelector('#warehousePanel').open,
    warehouseDisplay:getComputedStyle(document.querySelector('#warehousePanel')).display,
    inspectorHidden:getComputedStyle(document.querySelector('#inspector')).display}};
  })()`);
  console.log('MOBILE RIGHT PANES',JSON.stringify(pane));
  assert.equal(pane.right,'block');assert.equal(pane.warehouseHidden,'none');
  assert.equal(pane.warehouse.view,'warehouse');assert(pane.warehouse.open);
  assert.equal(pane.warehouse.inspectorHidden,'none');
  const chart=await evalJS(`(()=>{
   warehouseRefresh();
   const btn=document.querySelector('[data-stock-chart-open]');
   if(!btn)return {missing:true};
   btn.click();return{view:document.querySelector('.main').dataset.mobileView,
    chartVisible:!document.querySelector('#stockChartPanel').hidden};
  })()`);
  console.log('MOBILE STOCK CHART',JSON.stringify(chart));
  assert(!chart.missing&&chart.chartVisible&&chart.view==='map','opening warehouse chart returns to map with floating graph');

  const narrowSizes=[[360,740],[320,680],[768,850],[844,390]];
  for(const [width,height] of narrowSizes){
   await viewport(width,height);
   const m=await measure();
   console.log('MOBILE VIEWPORT',width,height,JSON.stringify({header:m.header,nav:m.nav,map:m.map,overflow:m.contentOverflow}));
   assert.equal(m.nav.display,'grid');
   assert(m.map.h>200,'map must keep usable height');
   assert(m.nav.bottom<=height+1);
   assert(!m.contentOverflow);
   const menuCheck=await evalJS(`(()=>{
    $('editMenuButton').click();
    const menu=$('editMenu'),r=menu.getBoundingClientRect();
    const trigger=menu.querySelector('[data-edit-submenu="export"]');trigger.click();
    const child=menu.querySelector('[data-edit-action="export-ast"]').getBoundingClientRect();
    const button=trigger.getBoundingClientRect();
    const v={width:r.width,height:r.height,childLeft:child.left,childRight:child.right,
     childTop:child.top,triggerBottom:button.bottom,scrollbarColor:getComputedStyle(menu).scrollbarColor};
    $('mobileEditClose').click();
    return v;
   })()`);
   assert(Math.abs(menuCheck.width-width)<2&&Math.abs(menuCheck.height-height)<2,'mobile Edit fills the viewport');
   assert(menuCheck.childTop>=menuCheck.triggerBottom-2,'submenu expands below its parent in all orientations');
   assert(menuCheck.childLeft>=0&&menuCheck.childRight<=width,'submenu remains horizontally visible');
   if(width===320){
    assert(m.preset.w>=280,'small phone gives scheme picker a full row');
    assert(m.header.h<=190,'small phone header remains compact');
    assert(m.simButtons.every(button=>button.left>=0&&button.right<=width+1),'all simulation buttons usable without horizontal clipping');
   }
  }
  // AST1 export's scrollbars use a consistent dark palette across devices.
  await evalJS(`(()=>{state={name:'AST1 scroll',machines:[{id:'one',type:'垃圾',mode:0,x:6,y:12,face:'E'}],routes:[]};openAST1Export()})()`);
  const astMobile=await evalJS(`(()=>{
   const field=$('ast1Text'),panel=$('ast1Panel');
   return {field:getComputedStyle(field).scrollbarColor,
    panel:getComputedStyle(panel).scrollbarColor,
    track:getComputedStyle(field,'::-webkit-scrollbar-track').backgroundColor,
    thumb:getComputedStyle(field,'::-webkit-scrollbar-thumb').backgroundColor,
    visible:panel.style.display==='block',code:field.value.slice(0,5)};
  })()`);
  console.log('AST1 CUSTOM SCROLLBAR MOBILE',JSON.stringify(astMobile));
  assert(astMobile.visible&&astMobile.code==='AST1:');
  assert(astMobile.field!=='auto'&&astMobile.panel!=='auto','AST1 scrollbars on phone are custom');
  await send('Emulation.clearDeviceMetricsOverride');
  const astDesktop=await evalJS(`({field:getComputedStyle($('ast1Text')).scrollbarColor,
   panel:getComputedStyle($('ast1Panel')).scrollbarColor})`);
  assert(astDesktop.field!=='auto'&&astDesktop.panel!=='auto','AST1 scrollbars on desktop are custom');
  await evalJS("$('ast1Close').click()");

  await delay(80);
  const desktop=await measure();
  console.log('DESKTOP RESTORE',JSON.stringify({nav:desktop.nav,left:desktop.left,right:desktop.right,canvas:desktop.canvas}));
  assert.equal(desktop.nav.display,'none');
  assert(desktop.left.w>150&&desktop.right.w>200,'desktop restores 3-column sidebars');
  assert.deepEqual(errors,[]);
  console.log('PASS: phone nav and mobile map/tools/machines/attributes/warehouse, editor controls, chart, 320-768 widths, desktop unchanged');
 }finally{
  try{ws?.close()}catch(e){}
  child.kill();
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch(e){}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
