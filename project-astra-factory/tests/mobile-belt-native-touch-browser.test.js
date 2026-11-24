'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
 {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astra-real-touch-'));
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url='file:///'+path.join(root,'index.html').replace(/\\/g,'/');
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check',
 '--disable-gpu','--disable-extensions','--remote-allow-origins=*',
 '--remote-debugging-port=0','--user-data-dir='+dir,url],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f){
 for(let i=0;i<100;i++){try{const x=await f();if(x)return x;}catch{}await sleep(100);}
 throw Error('Edge startup timeout');
}
(async()=>{
 let ws;
 try{
  const port=+(await until(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))
   ?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]:null));
  const pages=await until(async()=>{
   const list=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
   return list.find(x=>x.type==='page'&&x.url.includes('project-astra-factory'))?list:null;
  });
  ws=new WebSocket(pages.find(x=>x.type==='page'&&x.url.includes('project-astra-factory')).webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});
  const waiting=new Map(),exceptions=[];let seq=0;
  ws.onmessage=e=>{
   const x=JSON.parse(e.data);
   if(x.method==='Runtime.exceptionThrown')
    exceptions.push(x.params.exceptionDetails.exception?.description||x.params.exceptionDetails.text);
   if(x.id&&waiting.has(x.id)){waiting.get(x.id)(x);waiting.delete(x.id);}
  };
  const call=(method,params={})=>new Promise(resolve=>{
   const id=++seq;waiting.set(id,resolve);ws.send(JSON.stringify({id,method,params}));
  });
  const js=async expression=>{
   const x=await call('Runtime.evaluate',{expression,returnByValue:true});
   if(x.result?.exceptionDetails)
    throw Error(x.result.exceptionDetails.exception?.description||x.result.exceptionDetails.text);
   return x.result?.result?.value;
  };
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await call('Page.reload',{ignoreCache:true});
  await until(()=>js('document.readyState==="complete"&&typeof mobileEditorActive==="function"'));
  const setup=await js("(()=>{\n const a={id:'M0',type:'垃圾',mode:0,x:2,y:6,face:'E'},\n       b={id:'M1',type:'废料',mode:'标准',x:20,y:6,face:'E'};\n const src=outPort(a,0),dst=inPort(b,0);\n b.y+=src.ey-dst.ey;\n state={name:'real touch',recordIndexed:true,machines:[a,b],routes:[]};\n selection=null;multiSelection=null;draft=null;beltTrim=null;\n resetSimulation();setTool('belt');\n camera={x:0,y:0,z:11};\n const bounds=canvas.getBoundingClientRect(),p=outPort(a,0),q=inPort(b,0);\n return {p:{x:bounds.left+(p.x+.5)*11,y:bounds.top+(p.y+.5)*11},\n  q:{x:bounds.left+(q.x+.5)*11,y:bounds.top+(q.y+.5)*11},\n  mobile:mobileEditorActive()};\n})()");
  assert.equal(setup.mobile,true);
  const point=(id,p)=>({id,x:p.x,y:p.y,force:1,radiusX:2,radiusY:2});
  const send=async(type,points)=>call('Input.dispatchTouchEvent',{type,touchPoints:points});
  async function tap(p){
   await send('touchStart',[point(7,p)]);
   await send('touchEnd',[]);
   await sleep(35);
  }
  await send('touchStart',[point(7,setup.p)]);
  await sleep(40);
  const started=await js('({draft:!!draft,kind:drag?.kind})');
  await send('touchMove',[point(7,setup.q)]);
  await sleep(55);
  const during=await js('({preview:!!draft?.preview,kind:drag?.kind})');
  await send('touchEnd',[]);
  await sleep(70);
  const connected=await js("(()=>{\n const r=state.routes[0],pt=r?.path?.[Math.floor(r.path.length/2)];\n const bounds=canvas.getBoundingClientRect();\n return {count:state.routes.length,id:r?.id,to:r?.to?.id,length:r?.path?.length,\n  middle:pt?{x:bounds.left+camera.x+(pt[0]+.5)*camera.z,\n   y:bounds.top+camera.y+(pt[1]+.5)*camera.z}:null};\n})()");
  assert.equal(started.draft,true,'real touch should begin drafting');
  assert.equal(started.kind,'mobile-belt-gesture');
  assert.equal(during.preview,true,'drag should render preview');
  assert.equal(connected.count,1);
  assert.equal(connected.id,'R0');
  assert.equal(connected.to,'M1');
  assert(connected.middle);
  assert.equal(await js('selection?.routeId'),'R0','newly saved belt remains selected');
  await js("setTool('select');selection=null;inspectorRefresh()");
  await tap(connected.middle);
  assert.equal(await js('selection?.routeId'),'R0');
  await tap(connected.middle);
  const trim=await js('({mode:tool,red:beltTrim?.hoverAnchor,hint:document.getElementById("mobileMapState").textContent})');
  assert.equal(trim.mode,'belt');
  assert.equal(trim.red,true);
  assert.match(trim.hint,/红色|删除/);
  await tap(connected.middle);
  const afterTrim=await js('({length:state.routes[0].path.length,selected:selection?.routeId,hasDraft:!!draft,hasTrim:!!beltTrim,post:beltPostTrimRouteId,tool})');
  assert(afterTrim.length<connected.length);
  assert.equal(afterTrim.selected,'R0','partial cut keeps yellow selection and Inspector');
  assert.equal(afterTrim.hasDraft,false,'mobile partial cut must not auto-preview a new belt');
  assert.equal(afterTrim.hasTrim,false);
  assert.equal(afterTrim.post,'R0');
  const tip=await js("(()=>{const p=state.routes[0].path.at(-1),b=canvas.getBoundingClientRect();return {x:b.left+camera.x+(p[0]+.5)*camera.z,y:b.top+camera.y+(p[1]+.5)*camera.z}})()");
  await tap(tip);
  assert.equal(await js("draft?.phase"),'placing','real finger tap on new open tip resumes placement');
  assert.equal(await js("state.routes[0].path.length"),afterTrim.length,'starting placement must not change the saved belt');
  await js("setTool('belt');draft=null;beltTrim=null;");
  const beforeZoom=await js('camera.z');
  await send('touchStart',[point(7,setup.p)]);
  await send('touchStart',[point(7,setup.p),point(8,setup.q)]);
  await send('touchMove',[point(7,setup.p),point(8,{x:setup.q.x+40,y:setup.q.y})]);
  await send('touchEnd',[]);
  await sleep(60);
  const pinch=await js('({draft:!!draft,count:state.routes.length,zoom:camera.z})');
  assert.equal(pinch.draft,false,'pinch cancels uncommitted drawing');
  assert.equal(pinch.count,1,'pinch must not add a route');
  assert.notEqual(pinch.zoom,beforeZoom,'existing two-finger zoom is preserved');
  // A connected existing route has a genuinely trim-only edit state.
  // Unlike a new open route, its first non-belt tap must only deselect.
  const editTap=await js("(()=>{camera={x:0,y:0,z:11};setTool('select');"+
   "const a=state.machines[0],b=state.machines[1],p=outPort(a,0),q=inPort(b,0);"+
   "const path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);"+
   "state.routes=[{id:'R0',from:{id:'M0',port:0},to:{id:'M1',port:0},path}];"+
   "selection=null;draft=null;beltTrim=null;beltEditExitPending=false;"+
   "const rect=canvas.getBoundingClientRect(),xy=(x,y)=>({x:rect.left+(x+.5)*camera.z,y:rect.top+(y+.5)*camera.z});"+
   "return {belt:xy(path[3][0],path[3][1]),machine:xy(a.x+1,a.y+1),"+
   "blank:xy(1,18),original:state.routes[0].path.length};})()");
  await tap(editTap.belt);
  assert.equal(await js('selection?.routeId'),'R0');
  await tap(editTap.belt);
  assert.deepEqual(await js('({tool,selected:selection?.routeId,trim:beltTrim?.index})'),
   {tool:'belt',selected:'R0',trim:3});
  await tap(editTap.machine);
  assert.deepEqual(await js('({tool,selected:selection?.routeId||null,trim:!!beltTrim,pending:beltEditExitPending})'),
   {tool:'belt',selected:null,trim:false,pending:true},
   'first non-belt machine touch deselects only');
  await tap(editTap.machine);
  assert.deepEqual(await js('({tool,selected:selection?.routeId||null,pending:beltEditExitPending})'),
   {tool:'select',selected:null,pending:false},
   'second non-belt machine touch returns to Select');
  await tap(editTap.belt);await tap(editTap.belt);
  assert.equal(await js('tool'),'belt');
  await tap(editTap.blank);
  assert.deepEqual(await js('({tool,selected:selection?.routeId||null,pending:beltEditExitPending})'),
   {tool:'belt',selected:null,pending:true});
  await tap(editTap.blank);
  assert.equal(await js('tool'),'select','second empty-grid touch exits editing');
  assert.equal(await js('state.routes[0].path.length'),editTap.original,'editing exit retains belt cells');
  assert.deepEqual(exceptions,[]);
  console.log('PASS native mobile touch: drag-preview/release R0, red trim confirmation, two-finger zoom without accidental belt');
 }catch(err){console.error(err);process.exitCode=1;}
 finally{
  try{ws?.close();}catch{}
  try{child.kill();}catch{}
  try{fs.rmSync(dir,{force:true,recursive:true,maxRetries:3});}catch{}
 }
})();
