'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file=path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-button-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,'file:///'+file],{stdio:'ignore',windowsHide:true});
async function poll(f){for(let i=0;i<120;i++){try{const v=await f();if(v)return v;}catch(e){}await new Promise(r=>setTimeout(r,200));}throw new Error('Edge CDP timeout');}
(async()=>{
 try{
  const active=await poll(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8'):null);
  const port=active.trim().split(/\r?\n/)[0];
  const targets=await poll(async()=>{const a=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return a.find(x=>x.type==='page'&&x.url.includes('project-astra-factory'))?a:null;});
  const target=targets.find(x=>x.type==='page'&&x.url.includes('project-astra-factory'));
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let next=0;const pending=new Map();const exceptions=[];
  ws.onmessage=ev=>{
   const msg=JSON.parse(ev.data);
   if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.text+' '+(msg.params.exceptionDetails.exception?.description||''));
   if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);p(msg);}}
  };
  const send=(method,params={})=>new Promise(resolve=>{const id=++next;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expr=>{const ret=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return ret.result?.result?.value??ret.result?.exceptionDetails?.text??ret.error??ret;};
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.reload',{ignoreCache:true});
  await poll(async()=>await evaluate('document.readyState==="complete"'));
  await new Promise(r=>setTimeout(r,350));
  await send('Emulation.setDeviceMetricsOverride',{width:1470,height:1000,deviceScaleFactor:1,mobile:false});
  const result=await evaluate(`(()=>{
   const m=state.machines.find(x=>x.type==='分流')||state.machines[0];
   selection={machineId:m.id};inspectorRefresh();
   const computed=x=>getComputedStyle(x).backgroundColor;
   const original=getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
   const colors={original,left:computed(document.querySelector('.side.left')),
    right:computed(document.querySelector('.side.right')),
    summary:computed(document.querySelector('#inspector .machine-summary')),
    analysis:computed(document.querySelector('#inspector .machine-analysis-panel')),
    warehouse:computed(document.querySelector('.side.right .ledger-panel'))};
   const ctxFill=CanvasRenderingContext2D.prototype.fillRect,
    ctxStroke=CanvasRenderingContext2D.prototype.strokeText;
   let fills=0,strokes=0;
   CanvasRenderingContext2D.prototype.fillRect=function(...args){fills++;return ctxFill.apply(this,args)};
   CanvasRenderingContext2D.prototype.strokeText=function(...args){strokes++;return ctxStroke.apply(this,args)};
   try{const dimsNow=dims(m);ctx.save();paintMachineText(m,...dimsNow);ctx.restore();}
   finally{CanvasRenderingContext2D.prototype.fillRect=ctxFill;
     CanvasRenderingContext2D.prototype.strokeText=ctxStroke;}
   selection=null;inspectorRefresh();
   const idleCardRemoved=$('inspector').childElementCount===0;
   selection={machineId:m.id};inspectorRefresh();
   return {colors,fills,strokes,idleCardRemoved,selectedTitle:document.querySelector('.machine-summary-name')?.textContent};
  })()`);
  console.log('GIT-ORIGINAL THEME',JSON.stringify(result));
  assert.equal(result.colors.original,'#141e2b');
  assert.equal(result.colors.left,'rgb(20, 30, 43)');
  assert.equal(result.colors.right,'rgb(20, 30, 43)');
  assert.equal(result.colors.summary,'rgb(27, 41, 59)');
  assert.equal(result.colors.analysis,'rgb(27, 41, 59)');
  assert.equal(result.colors.warehouse,'rgb(27, 41, 59)');
  assert.equal(result.fills,0,'paintMachineText must not draw a rectangular black overlay');
  assert.equal(result.strokes,0,'restored original text should have no extra glyph outlines');
  assert(result.idleCardRemoved,'idle right side should have no redundant instruction card');
  assert.equal(exceptions.length,0,'uncaught Edge exceptions: '+exceptions.join(' | '));
  console.log('PASS: unified semantic dark theme, original unoutlined machine labels, no idle help card');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
