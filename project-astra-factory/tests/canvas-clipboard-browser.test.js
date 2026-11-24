'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
 {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url='file:///'+path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astra-copy-scope-'));
const child=spawn(edge,['--headless=new','--window-size=1440,920','--no-first-run',
 '--no-default-browser-check','--disable-extensions','--disable-gpu',
 '--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,url],
 {windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f){for(let i=0;i<80;i++){try{const v=await f();if(v)return v;}catch{}await sleep(150);}throw Error('Browser CDP timed out');}
(async()=>{
 let ws;
 try{
  const port=+(await until(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))?
   fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]:null));
  const targets=await until(async()=>{
   const a=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
   return a.find(t=>t.type==='page'&&t.url.includes('project-astra-factory'))?a:null;
  });
  const page=targets.find(t=>t.type==='page'&&t.url.includes('project-astra-factory'));
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let seq=0;const pending=new Map(),exceptions=[];
  ws.onmessage=event=>{
   const msg=JSON.parse(event.data);
   if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);
   if(msg.id&&pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id);}
  };
  const call=(method,params={})=>new Promise(resolve=>{
   const id=++seq;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));
  });
  const ev=async expression=>{
   const r=await call('Runtime.evaluate',{expression,returnByValue:true});
   if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.text);
   return r.result?.result?.value;
  };
  await call('Runtime.enable');await call('Page.enable');
  await until(async()=>await ev("document.readyState==='complete'&&document.getElementById('inspector')!==null"));
  const area=await ev("(()=>{const map=$('map').getBoundingClientRect(),right=document.querySelector('.side.right').getBoundingClientRect();return {map:{x:map.left+map.width/2,y:map.top+map.height/2},right:{x:right.left+right.width/2,y:right.top+right.height/2}}})()");
  const move=async pos=>{await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x,y:pos.y});await sleep(60);};
  await ev("(()=>{state={name:'Shortcut test',machines:[{id:'copy_machine',type:'采矿',mode:0,x:10,y:10,face:'E'}],routes:[]};selection={machineId:'copy_machine'};multiSelection=null;groupClipboard=null;resetSimulation();inspectorRefresh();})()");
  const key=(k)=>"(()=>{const e=new KeyboardEvent('keydown',{key:"+JSON.stringify(k)+",ctrlKey:true,bubbles:true,cancelable:true});document.dispatchEvent(e);return {prevented:e.defaultPrevented,groupClipboard:!!groupClipboard,selectedText:window.getSelection().toString().length}})()";
  await move(area.right);
  const right=await ev(key('c'));
  assert.equal(right.prevented,false,'Ctrl+C over the right sidebar must stay native');
  assert.equal(right.groupClipboard,false,'Right panel must not overwrite a group clipboard');
  const styling=await ev("({select:getComputedStyle($('inspector')).userSelect,background:getComputedStyle($('inspector'),'::selection').backgroundColor})");
  assert.equal(styling.select,'text');
  assert.notEqual(styling.background,'rgba(0, 0, 0, 0)');
  await ev("(()=>{const node=$('inspector').querySelector('.item')||$('inspector');const range=document.createRange();range.selectNodeContents(node);const s=window.getSelection();s.removeAllRanges();s.addRange(range);})()");
  await move(area.map);
  const withText=await ev(key('c'));
  assert(withText.selectedText>0);
  assert.equal(withText.prevented,false,'A native text selection wins over canvas hover');
  assert.equal(withText.groupClipboard,false);
  await ev('window.getSelection().removeAllRanges()');
  const canvasCopy=await ev(key('c'));
  assert.equal(canvasCopy.prevented,true,'Canvas Ctrl+C copies the selected machine');
  assert.equal(canvasCopy.groupClipboard,true);
  await move(area.right);
  const pasteOutside=await ev(key('v'));
  assert.equal(pasteOutside.prevented,false,'Ctrl+V over sidebar must stay native');
  const dupOutside=await ev(key('d'));
  assert.equal(dupOutside.prevented,false,'Ctrl+D over sidebar must stay native');
  await move(area.map);
  const pasteCanvas=await ev(key('v'));
  assert.equal(pasteCanvas.prevented,true,'Ctrl+V over canvas must keep machine paste');
  assert.equal(exceptions.length,0,'No unexpected browser runtime exceptions '+exceptions.join('; '));
  console.log('PASS keyboard scopes: native right-panel Ctrl+C/V/D, native text selection over map, canvas group Ctrl+C/V, high-contrast text selection');
 }catch(e){console.error(e);process.exitCode=1;}
 finally{
  try{ws?.close();}catch{}
  try{child.kill();}catch{}
  try{fs.rmSync(dir,{force:true,recursive:true,maxRetries:3});}catch{}
 }
})();
