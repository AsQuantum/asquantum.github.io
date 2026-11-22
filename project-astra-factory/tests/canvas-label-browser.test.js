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
  const fontResults=await evaluate(`(()=>{
   const desiredTypes=['采矿','分流','量装','发电','电脑','空间锚点'];
   const origFill=CanvasRenderingContext2D.prototype.fillText;
   const origStroke=CanvasRenderingContext2D.prototype.strokeText;
   const samples=[];
   CanvasRenderingContext2D.prototype.fillText=function(...args){
    samples.push({text:String(args[0]),argCount:args.length,
     measured:this.measureText(String(args[0])).width,
     font:this.font});
    return origFill.apply(this,args);
   };
   let outlined=0;
   CanvasRenderingContext2D.prototype.strokeText=function(...args){
    outlined++;
    return origStroke.apply(this,args);
   };
   const records=[];
   try{
    for(const type of desiredTypes){
     const m=state.machines.find(x=>x.type===type)||{
      type,id:'test_'+type,x:4,y:4,face:'E',mode:defaultModeFor(type)
     };
     const [w,h]=dims(m);
     const begin=samples.length,outlineBegin=outlined;
     const context=ctx;
     context.save();paintMachineText(m,w,h);context.restore();
     const lines=samples.slice(begin);
     records.push({type,rawName:def(m)?.name,width:w,drawn:lines.map(x=>x.text),
      allWithinWidth:lines.every(x=>x.measured<=w-.42+.02),
      noMaxWidth:lines.every(x=>x.argCount===3),
      restoredPlainText:outlineBegin===outlined});
    }
   }finally{
    CanvasRenderingContext2D.prototype.fillText=origFill;
    CanvasRenderingContext2D.prototype.strokeText=origStroke;
   }
   return {
    records,
    decorNames:['发电','电脑','空间锚点'].map(t=>def({type:t})?.name),
    decorClean:['发电','电脑','空间锚点'].every(t=>!def({type:t})?.name.includes('（装饰）')),
    namedMineLines:records.find(x=>x.type==='采矿')?.drawn.length
   };
  })()`);
  console.log('MACHINE CANVAS LABELS',JSON.stringify(fontResults));
  assert(fontResults.decorClean);
  assert(fontResults.records.every(r=>r.allWithinWidth&&r.noMaxWidth&&r.restoredPlainText),
    'all labels must preserve original appearance while using proportional font sizing, never fillText(maxWidth)');
  assert(fontResults.namedMineLines>=2,'machine names and recipe must render without horizontal glyph compression');
  assert.equal(exceptions.length,0,'uncaught Edge exceptions: '+exceptions.join(' | '));
  console.log('PASS: original vivid machine text with no overlays; proportional font resizing and clean decorative names');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
