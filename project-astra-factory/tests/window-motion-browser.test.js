'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url='file:///'+path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-window-motion-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--window-size=1460,920','--user-data-dir='+dir,url],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(res=>setTimeout(res,ms));
async function poll(fn){for(let i=0;i<120;i++){try{const value=await fn();if(value)return value;}catch(e){}await delay(150)}throw Error('Edge CDP startup timeout')}
(async()=>{
 let ws;
 try{
  const active=await poll(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8'):null);
  const port=active.trim().split(/\r?\n/)[0];
  const page=await poll(async()=>{const list=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return list.find(entry=>entry.type==='page'&&entry.url.includes('project-astra-factory'))});
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
  let seq=0;const pending=new Map(),errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
  const send=(method,params={})=>new Promise(resolve=>{const id=++seq;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}))});
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text);return r.result?.result?.value}
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await poll(()=>evaluate('document.readyState==="complete" && typeof stockChartOpen==="function" && typeof mobileOpenView==="function"'));
  const desktop=await evaluate('(()=>{stockChartOpen(true);const chart=$("stockChartPanel");const geometry=stockChartGeometry();const chartAnimation=getComputedStyle(chart).animationName;stockChartOpen(false);setEditMenuOpen(true);const menuAnimation=getComputedStyle($("editMenu")).animationName;setEditMenuOpen(false);ast1ShowPanel("import");const astAnimation=getComputedStyle($("ast1Panel")).animationName;$("ast1Close").click();return {chartAnimation,menuAnimation,astAnimation,geometry,chartHidden:chart.hidden};})()');
  console.log('DESKTOP MOTION',JSON.stringify(desktop));
  assert(desktop.chartAnimation.includes('factoryChartReveal'));
  assert(desktop.menuAnimation.includes('factoryPopoverReveal'));
  assert(desktop.astAnimation.includes('factoryPopupReveal'));
  assert(desktop.chartHidden);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await delay(120);
  const mobile=await evaluate('(()=>{setEditMenuOpen(true);const menuAnimation=getComputedStyle($("editMenu")).animationName;const item=$("editMenu").querySelector("[data-edit-submenu=import]");item.click();const sub=item.closest(".edit-menu-parent").querySelector(".edit-submenu");const submenuAnimation=getComputedStyle(sub).animationName;setEditMenuOpen(false);mobileOpenView("machines");const pageAnimation=getComputedStyle(document.querySelector(".side.left")).animationName;return{menuAnimation,submenuAnimation,pageAnimation}})()');
  console.log('MOBILE MOTION',JSON.stringify(mobile));
  assert(mobile.menuAnimation.includes('factoryMobileEditReveal'));
  assert(mobile.submenuAnimation.includes('factoryMobileSectionReveal'));
  assert(mobile.pageAnimation.includes('factoryTabReveal'));

  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const reduced=await evaluate('(()=>{mobileOpenView("map");mobileOpenView("tools");setEditMenuOpen(true);const menu=getComputedStyle($("editMenu")).animationName;const item=$("editMenu").querySelector("[data-edit-submenu=export]");item.click();const submenu=getComputedStyle(item.closest(".edit-menu-parent").querySelector(".edit-submenu")).animationName;const page=getComputedStyle(document.querySelector(".side.left")).animationName;setEditMenuOpen(false);stockChartOpen(true);const chart=getComputedStyle($("stockChartPanel")).animationName;stockChartOpen(false);ast1ShowPanel("import");const ast=getComputedStyle($("ast1Panel")).animationName;$("ast1Close").click();return{menu,submenu,page,chart,ast,media:matchMedia("(prefers-reduced-motion: reduce)").matches}})()');
  console.log('REDUCED MOTION',JSON.stringify(reduced));
  assert(reduced.media&&['menu','submenu','page','chart','ast'].every(name=>reduced[name]==='none'),'reduced-motion must disable all window animations');
  assert.deepEqual(errors,[]);
  console.log('PASS: desktop chart/Edit/AST1 and mobile Edit/submenu/tabs animate; prefers-reduced-motion eliminates motion');
 }finally{
  try{ws?.close()}catch(e){}
  child.kill();
  try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch(e){}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
