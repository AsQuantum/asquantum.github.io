'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url='file:///'+path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-phone-release-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--window-size=1280,900','--user-data-dir='+dir,url],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn){for(let i=0;i<120;i++){try{const v=await fn();if(v)return v}catch(e){}await sleep(125)}throw Error('Edge startup timed out');}
(async()=>{
 let ws;
 try{
  const portString=await poll(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8'):null);
  const port=portString.trim().split(/\r?\n/)[0];
  const page=await poll(async()=>{const data=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return data.find(p=>p.type==='page'&&p.url.includes('project-astra-factory'));});
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});
  let seq=0,touchId=30;const pending=new Map(),errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
  const send=(method,params={})=>new Promise(ok=>{const id=++seq;pending.set(id,ok);ws.send(JSON.stringify({id,method,params}))});
  const ev=async code=>{const m=await send('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true});if(m.result?.exceptionDetails)throw Error(m.result.exceptionDetails.exception?.description||m.result.exceptionDetails.text);return m.result?.result?.value};
  const vp=async(w,h,mobile=true)=>{await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});await sleep(150)};
  async function tap(p){
   assert(Number.isFinite(p.x)&&Number.isFinite(p.y),'touch coordinates');
   const t={x:p.x,y:p.y,id:touchId++};
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[t]});
   await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await sleep(60);
  }
  async function swipe(a,b){
   const id=touchId++;
   await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x,y:a.y,id}]});
   for(let i=1;i<=5;i++){const k=i/5;await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*k,y:a.y+(b.y-a.y)*k,id}]})}
   await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(70);
  }
  const point=code=>ev("(function(){const r=("+code+").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,right:r.right}})()");
  await send('Runtime.enable');await vp(390,844);
  await poll(()=>ev('document.readyState==="complete"&&typeof mobileOpenView==="function"'));
  let button=await point("document.getElementById('changelogOpen')");
  assert(button.w>24&&button.right<=390,'version button must be visible');
  await tap(button);
  const modal=await ev("(function(){const r=$('changelogClose').getBoundingClientRect();return {visible:!$('changelogOverlay').hidden,n:$('changelogEntries').children.length,scroll:getComputedStyle($('changelogEntries')).scrollbarColor,footer:!!$('changelogDone'),focus:document.activeElement.id,close:{x:r.left+r.width/2,y:r.top+r.height/2}}})()");
  assert(modal.visible&&modal.n>=3&&modal.scroll!=='auto'&&!modal.footer&&modal.focus==='changelogClose');
  await tap(modal.close);assert(await ev("$('changelogOverlay').hidden"));
  console.log('PASS mobile version popup and single close button');
  await ev("(function(){mobileOpenView('map');setTool('belt');const a={id:'a',type:'垃圾',x:3,y:14,face:'E',mode:0},b={id:'b',type:'废料',x:23,y:14,face:'E',mode:'标准'};const p=outPort(a,0),q=inPort(b,0);b.y+=p.ey-q.ey;state={name:'phone belts',machines:[a,b],routes:[]};selection=null;multiSelection=null;draft=null;beltTrim=null;camera.x=0;camera.y=4;camera.z=10;resetSimulation();draw()})()");
  const points=await ev("(function(){const a=state.machines[0],b=state.machines[1],p=outPort(a,0),q=inPort(b,0),r=canvas.getBoundingClientRect();const pt=(x,y)=>({x:r.left+camera.x+(x+.5)*camera.z,y:r.top+camera.y+(y+.5)*camera.z});return {out:pt(p.x,p.y),first:pt(p.ex+4,p.ey),next:pt(p.ex+7,p.ey),inlet:pt(q.x,q.y),map:{x:r.x,y:r.y,w:r.width,h:r.height}}})()");
  console.log('PHONE TOUCH COORDS',JSON.stringify(points));
  for(const key of ['out','first','next','inlet'])assert(points[key].x>=0&&points[key].x<390&&points[key].y>=0&&points[key].y<844,key+' fits phone');
  await tap(points.out);assert.equal(await ev('draft?.phase'),'placing');
  await tap(points.first);
  let length=await ev('state.routes[0]?.path.length');assert(length>=5);
  const tilePt=i=>ev("(function(){const p=state.routes[0].path["+i+"],r=canvas.getBoundingClientRect();return {x:r.left+camera.x+(p[0]+.5)*camera.z,y:r.top+camera.y+(p[1]+.5)*camera.z}})()");
  await tap(await tilePt(length-1));assert.equal(await ev('draft'),null);
  assert.equal(await ev('state.routes[0].path.length'),length);
  await tap(await tilePt(length-1));assert.equal(await ev('draft?.phase'),'editing');
  await tap(points.next);assert.equal(await ev('draft?.phase'),'placing');
  assert((await ev('state.routes[0].path.length'))>length);
  await tap(points.inlet);
  assert.equal(await ev('state.routes[0]?.to?.id'),'b');
  assert.equal(await ev('checkPath(state.routes[0].path,state.routes[0].from,state.routes[0].to,state.routes[0].id)'),null);
  console.log('PASS mobile real touches: output, save, finish, edit-extend, machine inlet');
  await ev("setTool('select');selection=null;");
  const tile=await tilePt(2);
  await tap(tile);assert.equal(await ev('selection?.routeId'),await ev('state.routes[0].id'));
  await tap(tile);assert.equal(await ev('tool'),'belt');assert.equal(await ev('beltTrim?.index'),2);
  const count=await ev('state.routes[0].path.length');
  await tap(tile);assert.equal(await ev('state.routes[0].path.length'),2);assert(count>2);
  console.log('PASS mobile real touches: line select, second click edit, third click trim');
  await ev("setTool('select');selection=null;multiSelection=null;");
  const from=await tilePt(1);
  await swipe({x:from.x-2,y:from.y-2},{x:from.x+40,y:from.y+40});
  assert.equal(await ev('selection?.routeId??null'),null,'touch swipe from belt is marquee, not route tap');
  console.log('PASS mobile swipe from belt does not misselect line');
  await vp(320,640);
  button=await point("document.getElementById('changelogOpen')");
  assert(button.w>22&&button.right<=320&&!(await ev('document.documentElement.scrollWidth>innerWidth')),'320px layout must fit');
  await tap(button);assert(await ev("!$('changelogOverlay').hidden"));
  await tap(await point("document.getElementById('changelogClose')"));assert(await ev("$('changelogOverlay').hidden"));
  console.log('PASS 320px narrow phone release control');
  await send('Emulation.clearDeviceMetricsOverride');await send('Emulation.setTouchEmulationEnabled',{enabled:false});await sleep(120);
  const desktop=await ev("(function(){const b=$('changelogOpen');b.click();const o=!$('changelogOverlay').hidden;$('changelogClose').click();return {open:o,closed:$('changelogOverlay').hidden}})()");
  assert(desktop.open&&desktop.closed);
  assert.deepEqual(errors,[],'no browser JavaScript errors');
  console.log('PASS desktop release dialog');
 }catch(e){console.error(e.stack||e);process.exitCode=1}
 finally{try{ws?.close()}catch(e){}try{child.kill()}catch(e){}try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:4,retryDelay:130})}catch(e){}}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
