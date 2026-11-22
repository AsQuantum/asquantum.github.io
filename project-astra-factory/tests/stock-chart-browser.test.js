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
  assert.deepEqual(errors,[]);
  console.log('PASS: history chart axis ticks do not overlap minute label, interactive controls and pause has hue-shifted dark gold background and outline; recent charts auto-scale Y from selected-series extrema');
 }finally{
  try{ws?.close();}catch(e){}
  child.kill();
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch(e){}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
