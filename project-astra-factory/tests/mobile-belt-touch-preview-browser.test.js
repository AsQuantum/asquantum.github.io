'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
 {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const root=path.resolve(__dirname,'..'),url='file:///'+path.join(root,'index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astra-mobile-belt-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check',
 '--disable-gpu','--disable-extensions','--remote-allow-origins=*',
 '--remote-debugging-port=0','--user-data-dir='+dir,url],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f){for(let i=0;i<100;i++){try{const x=await f();if(x)return x;}catch{}await sleep(120);}throw Error('Edge startup timeout');}
(async()=>{
 let ws;
 try{
  const port=+(await until(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))
   ?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]:null));
  const targets=await until(async()=>{const x=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
   return x.find(t=>t.type==='page'&&t.url.includes('project-astra-factory'))?x:null;
  });
  ws=new WebSocket(targets.find(t=>t.type==='page'&&t.url.includes('project-astra-factory')).webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let n=0;const waiting=new Map(),errors=[];
  ws.onmessage=e=>{const x=JSON.parse(e.data);
   if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.exception?.description||x.params.exceptionDetails.text);
   if(x.id&&waiting.has(x.id)){waiting.get(x.id)(x);waiting.delete(x.id);}
  };
  const call=(method,params={})=>new Promise(resolve=>{const id=++n;waiting.set(id,resolve);ws.send(JSON.stringify({id,method,params}))});
  const evaluate=async code=>{const x=await call('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true});
   if(x.result?.exceptionDetails)throw Error(x.result.exceptionDetails.exception?.description||x.result.exceptionDetails.text);
   return x.result?.result?.value;
  };
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await call('Page.reload',{ignoreCache:true});
  await until(()=>evaluate('document.readyState==="complete"&&typeof mobileEditorActive==="function"'));
  assert.equal(await evaluate('mobileEditorActive()'),true);
  const result=await evaluate("(()=>{\n canvas.setPointerCapture=()=>{};\n const source={id:'M0',type:'垃圾',mode:0,x:2,y:5,face:'E'};\n const target={id:'M1',type:'废料',mode:'标准',x:20,y:5,face:'E'};\n const sourcePort=outPort(source,0),initialIn=inPort(target,0);\n target.y+=sourcePort.ey-initialIn.ey;\n state={name:'mobile touch belt',machines:[source,target],routes:[]};\n selection=null;multiSelection=null;resetSimulation();\n camera={x:0,y:0,z:11};pix={w:390,h:700,dpr:1};\n setTool('belt');mobileOpenView('map');\n const p=outPort(source,0),q=inPort(target,0);\n const ev=(x,y)=>{const rect=canvas.getBoundingClientRect();return {button:0,pointerId:1,pointerType:'touch',\n  clientX:rect.left+camera.x+(x+.5)*camera.z,clientY:rect.top+camera.y+(y+.5)*camera.z}};\n onPointerDown(ev(p.x,p.y));\n const started=!!draft;\n onPointerMove(ev(q.x,q.y));\n const preview=!!draft?.preview;\n onPointerUp(ev(q.x,q.y));\n const route=state.routes[0],created=!!route;\n const to=route?.to?.id,firstId=route?.id;\n setTool('select');selection=null;inspectorRefresh();\n const middle=route?.path?.[Math.floor(route.path.length/2)];\n if(!middle)return {started,preview,created,to,firstId,middle:null};\n onPointerDown(ev(middle[0],middle[1]));onPointerUp(ev(middle[0],middle[1]));\n const selected=selection?.routeId;\n inspectorRefresh();\n const code=$('inspector')?.querySelector('.inspector-route .machine-summary-eyebrow code')?.textContent;\n const label=$('inspector')?.querySelector('.inspector-route .machine-summary-eyebrow span')?.textContent;\n const name=$('inspector')?.querySelector('.inspector-route .machine-summary-name')?.textContent;\n const beforeLen=route.path.length;\n onPointerDown(ev(middle[0],middle[1]));onPointerUp(ev(middle[0],middle[1]));\n const armed=!!beltTrim&&beltTrim.hoverAnchor===true;\n const hint=$('mobileMapState')?.textContent;\n onPointerLeave();\n const keptAfterLeave=!!beltTrim&&beltTrim.hoverAnchor===true;\n onPointerDown(ev(middle[0],middle[1]));onPointerUp(ev(middle[0],middle[1]));\n return {started,preview,created,to,firstId,selected,code,label,name,\n  beforeLen,afterLen:state.routes[0]?.path.length,armed,keptAfterLeave,hint,\n  draftAfter:!!draft,beltTool:tool};\n})()");
  console.log('SYNTHETIC_TOUCH',JSON.stringify(result));
  assert.equal(result.started,true,'source port should enter draft mode');
  assert.equal(result.preview,true,'dragging should show route preview');
  assert.equal(result.created,true,'release should commit a route');
  assert.equal(result.to,'M1');
  assert.equal(result.firstId,'R0');
  assert.equal(result.selected,'R0');
  assert.equal(result.code,'R0');
  assert.equal(result.label,'传送带详情');
  assert.equal(result.name,'物流线路');
  assert.equal(result.armed,true,'editing highlights the tail');
  assert.equal(result.keptAfterLeave,true,'finger lift cannot erase trim highlight');
  assert.match(result.hint,/红色|删除/);
  assert(result.afterLen<result.beforeLen,'third same-cell touch trims the tail');
  assert.equal(result.beltTool,'belt');
  assert.deepEqual(errors,[]);
  console.log('PASS phone: touch-drag ghost → release creates R0 → select → persistent red tail → tap confirms trim');
 }catch(e){console.error(e);process.exitCode=1;}
 finally{
  try{ws?.close();}catch{}
  try{child.kill();}catch{}
  try{fs.rmSync(dir,{force:true,recursive:true,maxRetries:3});}catch{}
 }
})();
