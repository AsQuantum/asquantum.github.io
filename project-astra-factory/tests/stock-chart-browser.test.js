'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url='file:///'+path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-stock-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--window-size=1560,900','--user-data-dir='+dir,url],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(fn){for(let i=0;i<120;i++){try{const result=await fn();if(result)return result;}catch(e){}await delay(150);}throw Error('browser startup timed out');}
(async()=>{
 let ws;
 try{
  const active=await poll(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8'):null);
  const port=active.trim().split(/\r?\n/)[0];
  const target=await poll(async()=>{
   const all=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
   return all.find(x=>x.type==='page'&&x.url.includes('project-astra-factory'));
  });
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let next=0;const pending=new Map();const errors=[];
  ws.onmessage=e=>{
   const msg=JSON.parse(e.data);
   if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);
   if(msg.id&&pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id);}
  };
  const send=(method,params={})=>new Promise(resolve=>{
   const id=++next;pending.set(id,resolve);
   ws.send(JSON.stringify({id,method,params}));
  });
  async function evaluate(expression){
   const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(result.result?.exceptionDetails)throw Error(result.result.exceptionDetails.exception?.description||result.result.exceptionDetails.text);
   return result.result?.result?.value;
  }
  await send('Runtime.enable');
  await poll(()=>evaluate('document.readyState==="complete" && typeof stockChartHistory==="function"'));
  const basic=await evaluate('({overlayHidden:document.getElementById("stockChartPanel").hidden,chartButton:!!document.querySelector("[data-stock-chart-open]"),hint:document.getElementById("stockChartHint").textContent})');
  assert.equal(basic.overlayHidden,true);
  assert.equal(basic.chartButton,true);
  const result=await evaluate('(()=>{resetSimulation();simTime=180*60;sim.minuteBuckets=Array.from({length:180},(_,i)=>({inbound:{"太空垃圾":2,"曲速线圈":i%5===0?1:0},outbound:{"太空垃圾":1}}));ware={"太空垃圾":180,"曲速线圈":36};document.querySelector("[data-stock-chart-open]").click();let h=stockChartHistory();let bounds=$("stockChartPanel").getBoundingClientRect();let map=$("map").getBoundingClientRect();return {open:!$("stockChartPanel").hidden,points:h.points.length,last:h.points.at(-1).stocks,legend:$("stockChartLegend").querySelectorAll("button").length,paths:$("stockChartSvg").querySelectorAll("path").length,tooltip:!!$("stockChartTooltip"),stats:$("stockChartStats").textContent,bounds:{width:bounds.width,height:bounds.height,withinMap:bounds.left>=map.left && bounds.right<=map.right+1}}})()');
  assert.equal(result.open,true);
  assert.equal(result.points,181);
  assert.equal(result.last['太空垃圾'],180);
  assert.equal(result.last['曲速线圈'],36);
  assert.equal(result.legend,2);
  assert.equal(result.paths,2);
  assert.equal(result.tooltip,true);
  assert.match(result.stats,/216/);
  assert.equal(result.bounds.withinMap,true);
  assert.ok(result.bounds.width>=400);
  // SVG axis labels must occupy separate rows, remain in viewBox, and not
  // collide with the final minute tick at the right edge.
  const axis=await evaluate(`(()=>{
   const svg=$('stockChartSvg').querySelector('svg');
   const ticks=[...svg.querySelectorAll('.stock-tick')];
   const labels=[...svg.querySelectorAll('.stock-axis-label')];
   const minuteUnit=labels.find(e=>e.textContent==='时间（分钟）');
   const rightTick=ticks.at(-1);
   const rect=e=>{const b=e.getBBox();return{x:b.x,y:b.y,right:b.x+b.width,bottom:b.y+b.height}};
   return {svgHeight:svg.viewBox.baseVal.height,unit:minuteUnit&&rect(minuteUnit),
    tick:rightTick&&rect(rightTick),unitText:minuteUnit?.textContent,
    unitPosition:minuteUnit?.getAttribute('y')};
  })()`);
  console.log('CHART AXIS',JSON.stringify(axis));
  assert.equal(axis.unitText,'时间（分钟）');
  assert(axis.unit.y>axis.tick.bottom+7,'axis unit must not overlap final x tick');
  assert(axis.unit.bottom<axis.svgHeight,'axis unit must fit in SVG viewBox');
  assert(axis.unit.right<=850,'axis unit must stay within SVG right edge');

  // Rolling windows must use the extrema of ALL selected curves, not the
  // full-history zero baseline. Hiding a series recomputes the domain.
  const domain=await evaluate(`(()=>{
   const windowButton=value=>$('stockChartPanel').querySelector('[data-stock-window="'+value+'"]');
   const current=()=>({
    min:stockChartHoverData.yMin,max:stockChartHoverData.yMax,
    firstTick:$('stockChartSvg').querySelector('.stock-tick')?.textContent
   });
   windowButton('60').click();
   const allSeries=current();
   stockChartHiddenItems.add('曲速线圈');stockChartRender();
   const onlyGarbage=current();
   stockChartHiddenItems.clear();stockChartHiddenItems.add('太空垃圾');stockChartRender();
   const onlyCoils=current();
   stockChartHiddenItems.clear();stockChartRender();
   windowButton('180').click();const last180=current();
   windowButton('all').click();const full=current();
   return {allSeries,onlyGarbage,onlyCoils,last180,full};
  })()`);
  console.log('CHART WINDOW Y DOMAIN',JSON.stringify(domain));
  assert.equal(domain.allSeries.min,24,'last 60 minutes: lowest of BOTH visible curves is 24, not 0');
  assert.equal(domain.allSeries.max,180);
  assert.equal(domain.allSeries.firstTick,'24','bottom Y tick must show actual local minimum');
  assert.equal(domain.onlyGarbage.min,120,'hiding low-valued series must raise Y minimum');
  assert.equal(domain.onlyGarbage.max,180);
  assert.equal(domain.onlyCoils.min,24,'remaining coil line determines local minimum');
  assert.equal(domain.onlyCoils.max,36);
  assert.equal(domain.last180.min,0,'past 180 minutes includes zero at minute 0');
  assert.equal(domain.full.min,0,'all history keeps zero baseline');

  const interaction=await evaluate('(()=>{const legend=$("stockChartLegend").querySelector("button");legend.click();const pathsAfter=$("stockChartSvg").querySelectorAll("path").length;$("stockChartPanel").querySelector("[data-stock-window=\\"60\\"]").click();const newWindow=stockChartWindow;const box=$("stockChartPlot").getBoundingClientRect();$("stockChartHitArea").dispatchEvent(new PointerEvent("pointermove",{bubbles:true,clientX:box.left+200,clientY:box.top+80}));const hovering=!$("stockChartTooltip").hidden;document.querySelector("[data-stock-chart-close]").click();const closed=$("stockChartPanel").hidden;document.querySelector("[data-stock-chart-open]").click();const reopened=!$("stockChartPanel").hidden;resetSimulation();return {pathsAfter,newWindow,hovering,closed,reopened,resetItems:stockChartHistory().items.length,resetTime:simTime,resetPaths:$("stockChartSvg").querySelectorAll("path").length}})()');
  assert.equal(interaction.pathsAfter,1);
  assert.equal(interaction.newWindow,'60');
  assert.equal(interaction.hovering,true);
  assert.equal(interaction.closed,true);
  assert.equal(interaction.reopened,true);
  assert.equal(interaction.resetItems,0);
  assert.equal(interaction.resetTime,0);
  assert.equal(interaction.resetPaths,0);
  // The start and pause states share one primary action color.
  const toggle=await evaluate(`(()=>{
   const btn=$('run');
   const start={primary:btn.classList.contains('primary'),bg:getComputedStyle(btn).backgroundColor,
    border:getComputedStyle(btn).borderColor,text:btn.textContent};
   btn.click();
   const runningState={primary:btn.classList.contains('primary'),bg:getComputedStyle(btn).backgroundColor,
    border:getComputedStyle(btn).borderColor,color:getComputedStyle(btn).color,text:btn.textContent,running};
   btn.click();
   const paused={primary:btn.classList.contains('primary'),bg:getComputedStyle(btn).backgroundColor,
    border:getComputedStyle(btn).borderColor,text:btn.textContent,running};
   resetSimulation();
   const reset={primary:btn.classList.contains('primary'),bg:getComputedStyle(btn).backgroundColor,text:btn.textContent,running};
   return {start,runningState,paused,reset};
  })()`);
  console.log('RUN/PAUSE PRIMARY',JSON.stringify(toggle));
  assert(toggle.start.primary&&toggle.runningState.primary&&toggle.paused.primary,'run and pause must both be primary');
  assert(toggle.runningState.running&&!toggle.paused.running,'button must toggle simulation state');
  assert.match(toggle.runningState.text,/暂停/);
  assert.equal(toggle.start.bg,'rgb(24, 99, 71)','original Run background remains dark green');
  assert.equal(toggle.start.border,'rgb(49, 154, 116)','original Run border remains green');
  assert.equal(toggle.runningState.bg,'rgb(99, 80, 24)','Pause background is the same dark-green button hue-shifted to gold');
  assert.equal(toggle.runningState.border,'rgb(154, 128, 49)','Pause border hue-shifts independently, keeping original contrast');
  assert.equal(toggle.runningState.color,'rgb(255, 255, 255)','original white text remains readable');
  assert.equal(toggle.paused.bg,toggle.start.bg,'Resume restores original green background');
  assert.equal(toggle.paused.border,toggle.start.border,'Resume restores original green border');
  assert.equal(toggle.reset.bg,toggle.start.bg,'reset must restore green');
  assert(toggle.runningState.primary&&toggle.paused.primary&&toggle.reset.primary);
  // Real browser pointer input: drag by the title, then resize from every corner.
  // These are end-to-end CDP mouse operations, not calls to the geometry helpers.
  async function stockMouseDrag(from,dx,dy){
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x,y:from.y});
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x:from.x,y:from.y,button:'left',clickCount:1});
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+dx,y:from.y+dy,button:'left',buttons:1});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:from.x+dx,y:from.y+dy,button:'left',clickCount:1});
   await delay(90);
  }
  const chartGeo=()=>evaluate('(()=>{const g=stockChartGeometry(),l=stockChartLimits(),svg=$("stockChartSvg").querySelector("svg");return {...g,hostW:l.width,hostH:l.height,viewW:svg.viewBox.baseVal.width,viewH:svg.viewBox.baseVal.height,plotH:$("stockChartPlot").clientHeight}})()');
  const chartAnchor=selector=>evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
  const initial=await chartGeo();
  const heading=await chartAnchor('.stock-chart-head h3');
  await stockMouseDrag(heading,-35,45);
  const moved=await chartGeo();
  console.log('CHART TITLE MOVE',JSON.stringify({initial,moved}));
  assert(Math.abs(moved.left-(initial.left-35))<3,'title drag should move chart horizontally');
  assert(Math.abs(moved.top-(initial.top+45))<3,'title drag should move chart vertically');
  assert(moved.left>=7&&moved.top>=7&&moved.left+moved.width<=moved.hostW-7,'drag must remain inside map');
  // Leave room to grow in either direction for exact four-corner tests.
  await evaluate('(()=>{const l=stockChartLimits();stockChartApplyGeometry({left:75,top:70,width:Math.min(540,l.maxWidth-70),height:Math.min(390,l.maxHeight-70),sized:true});stockChartRender()})()');
  const corners=[
   {dir:'se',dx:34,dy:31,mode:'grow-both'},
   {dir:'nw',dx:27,dy:22,mode:'shrink-from-top-left'},
   {dir:'ne',dx:-32,dy:23,mode:'shrink-from-top-right'},
   {dir:'sw',dx:-24,dy:29,mode:'grow-from-bottom-left'}
  ];
  for(const test of corners){
   const before=await chartGeo();
   const anchor=await chartAnchor('[data-stock-resize="'+test.dir+'"]');
   await stockMouseDrag(anchor,test.dx,test.dy);
   const after=await chartGeo();
   console.log('CHART RESIZE '+test.dir.toUpperCase(),JSON.stringify({before,after}));
   const west=test.dir.includes('w'),north=test.dir.includes('n');
   const expectedW=before.width+(west?-test.dx:test.dx);
   const expectedH=before.height+(north?-test.dy:test.dy);
   assert(Math.abs(after.width-expectedW)<3,'resize '+test.dir+' width delta');
   assert(Math.abs(after.height-expectedH)<3,'resize '+test.dir+' height delta');
   assert(Math.abs((west?after.left+after.width:after.left)-(west?before.left+before.width:before.left))<3,'resize '+test.dir+' fixed horizontal edge');
   assert(Math.abs((north?after.top+after.height:after.top)-(north?before.top+before.height:before.top))<3,'resize '+test.dir+' fixed vertical edge');
   assert(after.left>=7&&after.top>=7&&after.left+after.width<=after.hostW-7&&after.top+after.height<=after.hostH-7,'chart cannot resize offscreen');
   assert.equal(after.viewW,Math.round(after.width-26),'resized chart SVG X scale tracks plot width');
   assert(after.viewH>=155,'resized chart preserves a usable graph height');
   assert.equal(await evaluate('getComputedStyle($("stockChartPanel")).animationName'),'none',
    'dragging or resizing must not restart the chart opening fade');
  }
  // Simulate a continuous resize while the production simulation advances.
  // The live chart must retain its existing SVG (no full redraw/flicker)
  // until the pointer is released, when a single redraw refreshes it.
  const stableResize=await evaluate(`(()=>{
   const panel=$('stockChartPanel'),handle=panel.querySelector('[data-stock-resize="se"]');
   const bounds=handle.getBoundingClientRect(),x=bounds.left+bounds.width/2,y=bounds.top+bounds.height/2;
   const original=$('stockChartSvg').firstElementChild;
   handle.dispatchEvent(new PointerEvent('pointerdown',{pointerId:713,button:0,bubbles:true,cancelable:true,clientX:x,clientY:y}));
   const active=!!stockChartPointerDrag;
   stockChartPointerUpdate(new PointerEvent('pointermove',{pointerId:713,button:0,cancelable:true,clientX:x+15,clientY:y+10}));
   const sameAfterMove=$('stockChartSvg').firstElementChild===original;
   simTime+=2;
   stockChartMaybeRefresh();
   const sameAfterLiveUpdate=$('stockChartSvg').firstElementChild===original;
   const animation=getComputedStyle(panel).animationName;
   stockChartPointerEnd(new PointerEvent('pointerup',{pointerId:713,button:0,cancelable:true}));
   return{active,sameAfterMove,sameAfterLiveUpdate,animation};
  })()`);
  console.log('CHART NO FLASH DURING RESIZE',JSON.stringify(stableResize));
  assert(stableResize.active&&stableResize.sameAfterMove&&stableResize.sameAfterLiveUpdate,
    'live SVG must not be reconstructed during a drag or resize');
  assert.equal(stableResize.animation,'none','opening animation does not re-activate during resize');
  await delay(90);
  const beforeClose=await chartGeo();
  const save=await evaluate('JSON.parse(localStorage.getItem(STOCK_CHART_LAYOUT_KEY)||"null")');
  assert(save?.sized,'successful corner drag should persist a resized chart');
  assert(Math.abs(save.width-beforeClose.width)<3&&Math.abs(save.height-beforeClose.height)<3);
  await evaluate('(()=>{document.querySelector("[data-stock-chart-close]").click();document.querySelector("[data-stock-chart-open]").click()})()');
  const reopened=await chartGeo();
  assert(Math.abs(reopened.left-beforeClose.left)<3&&Math.abs(reopened.width-beforeClose.width)<3&&Math.abs(reopened.height-beforeClose.height)<3,'close/reopen retains chart geometry');
  // Opening after a complete page reload restores the local layout preference.
  await send('Page.reload',{ignoreCache:true});
  await poll(()=>evaluate('document.readyState==="complete" && typeof stockChartOpen==="function"'));
  const restored=await evaluate('(()=>{document.querySelector("[data-stock-chart-open]").click();return stockChartGeometry()})()');
  console.log('CHART PERSISTED GEOMETRY',JSON.stringify({beforeClose,restored}));
  assert(Math.abs(restored.left-beforeClose.left)<3&&Math.abs(restored.top-beforeClose.top)<3&&Math.abs(restored.width-beforeClose.width)<3&&Math.abs(restored.height-beforeClose.height)<3,'chart should restore position and size across reload');
  // Regression: at 360px panel width, all three time-range buttons must stay
  // on one row BELOW the stock summary, never wrap into its column.
  // The legend uses a dark scrollbar, not native Windows white.
  const compact=await evaluate(`(()=>{
   resetSimulation();ware=Object.fromEntries(MATERIALS.slice(0,14).map((m,i)=>[m,(i+1)*11]));
   simTime=48.3*60;
   sim.minuteBuckets=Array.from({length:49},()=>({inbound:Object.fromEntries(MATERIALS.slice(0,14).map(m=>[m,1])),outbound:{}}));
   stockChartApplyGeometry({left:30,top:30,width:360,height:340,sized:true});
   stockChartRender();
   const panel=$('stockChartPanel'),toolbar=panel.querySelector('.stock-chart-topline'),
    stats=$('stockChartStats'),buttons=[...panel.querySelectorAll('[data-stock-window]')],
    legend=$('stockChartLegend'),plot=$('stockChartPlot'),footer=panel.querySelector('.stock-chart-footer');
   const pos=el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   return {panel:pos(panel),topline:pos(toolbar),stats:pos(stats),buttonRects:buttons.map(pos),
    statsOverflows:stats.scrollWidth>stats.clientWidth+1,compactHeight:panel.classList.contains('stock-chart-short'),
    legend:pos(legend),legendScrollHeight:legend.scrollHeight,legendClientHeight:legend.clientHeight,
    legendScrollbarColor:getComputedStyle(legend).scrollbarColor,
    legendScrollbarWidth:getComputedStyle(legend).scrollbarWidth,
    legendTrack:getComputedStyle(legend,'::-webkit-scrollbar-track').backgroundColor,
    legendThumb:getComputedStyle(legend,'::-webkit-scrollbar-thumb').backgroundColor,
    plot:pos(plot),footerDisplay:getComputedStyle(footer).display};
  })()`);
  console.log('MINIMUM CHART 360×340',JSON.stringify(compact));
  assert.equal(compact.buttonRects.length,3);
  assert(compact.buttonRects.every(b=>Math.abs(b.top-compact.buttonRects[0].top)<2),'all 3 time buttons must be one row');
  assert(compact.buttonRects[0].top>=compact.stats.bottom+3,'time buttons must be below stock statistics');
  assert(compact.buttonRects.every(b=>b.left>=compact.panel.left&&b.right<=compact.panel.right),'all time buttons remain inside compact chart');
  assert(!compact.statsOverflows,'stock summary must not overflow at minimum width');
  assert(compact.plot.height>=90,'compact chart must keep graph usable');
  assert(compact.legend.height>=25,'compact chart must show the item legend');
  assert(compact.legendScrollHeight>compact.legendClientHeight+4,'legend must remain vertically scrollable');
  assert(compact.legendScrollbarColor!=='auto'&&compact.legendScrollbarWidth==='thin','dark custom scrollbar should override native Windows white');
  assert.equal(compact.footerDisplay,'none','minimum-height panel prioritizes plot and legend');
  // +100 replenishes displayed warehouse items but not actual receipts,
  // and the inventory trend must reflect the separate manual adjustment.
  const stockAid=await evaluate(`(()=>{
   resetSimulation();
   const beforeRun=addWarehouseTestStock()===false;
   state={name:'stock test',machines:[{id:'ingot-source',type:'仓出',item:'钛合金锭',x:1,y:1,face:'E'}],routes:[]};
   theoreticalBudget={inflow:{},outflow:{},machineCycles:{},routeFlows:{}};
   simTime=60;
   sim.inbound={'硅晶圆':12,'导线线圈':8};
   sim.outbound={'硅晶圆':12,'导线线圈':8};
   sim.minuteBuckets=[{inbound:{'硅晶圆':12,'导线线圈':8},
    outbound:{'硅晶圆':12,'导线线圈':8}}];
   const beforeMovements={inbound:{...sim.inbound},outbound:{...sim.outbound}};
   const button=$('addTestStock'),step=$('stepMinute');
   const rightOfStep=button.getBoundingClientRect().left>=step.getBoundingClientRect().right-2;
   button.click();
   const firstStock={...ware},firstHistory=stockChartHistory(),
    firstLast=firstHistory.points.at(-1).stocks;
   button.click();
   const afterSecond={...ware},afterHistory=stockChartHistory(),
    secondLast=afterHistory.points.at(-1).stocks;
   const unchangedMovements=JSON.stringify(beforeMovements.inbound)===JSON.stringify(sim.inbound)&&
    JSON.stringify(beforeMovements.outbound)===JSON.stringify(sim.outbound)&&
    sim.minuteBuckets[0].inbound['硅晶圆']===12&&
    sim.minuteBuckets[0].outbound['导线线圈']===8;
   const manual=sim.minuteBuckets[0].manualStock;
   resetSimulation();
   return {beforeRun,rightOfStep,firstStock,firstLast,afterSecond,secondLast,
    unchangedMovements,manual,cleared:sim.minuteBuckets.length===0&&Object.keys(ware).length===0};
  })()`);
  assert(stockAid.beforeRun&&stockAid.rightOfStep&&stockAid.unchangedMovements&&stockAid.cleared,
   '+100 requires running first, sits right of +time, and does not change actual warehouse accounting');
  for(const item of ['硅晶圆','导线线圈','钛合金锭']){
   assert.equal(stockAid.firstStock[item],100,'first click gives 100 '+item);
   assert.equal(stockAid.firstLast[item],100,'stock chart includes first +100 for '+item);
   assert.equal(stockAid.afterSecond[item],200,'second click gives another 100 '+item);
   assert.equal(stockAid.secondLast[item],200,'stock chart includes repeated +100 for '+item);
   assert.equal(stockAid.manual[item],200,'manual stock must not enter actual income for '+item);
  }
  console.log('PASS: +100 replenishes empty sources and real warehouse materials, preserves actual accounting, and appears in inventory trend');
  assert.deepEqual(errors,[]);
  console.log('PASS: chart title dragging, all four resize corners, responsive SVG size, bounds, close/reopen and reload persistence; existing chart and simulation controls unchanged');
 }finally{
  try{ws?.close();}catch(e){}
  child.kill();
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch(e){}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
