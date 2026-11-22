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
  const info=await evaluate('({title:document.title,run:!!document.getElementById("run"),onClick:typeof document.getElementById("run").onclick,running,simTime,machines:state.machines.length,routes:state.routes.length,topStats:document.getElementById("topStats").textContent})');
  console.log('BEFORE',JSON.stringify(info));
  const warehouseInitial=await evaluate('({open:document.getElementById("warehousePanel").open,content:!!document.getElementById("warehouse").innerHTML})');
  assert.equal(warehouseInitial.open,false,'warehouse should start collapsed for a new user');
  assert(warehouseInitial.content,'warehouse content should still be rendered while collapsed');
  await evaluate('document.querySelector("#warehousePanel > summary").click()');
  await new Promise(r=>setTimeout(r,200));
  assert.equal(await evaluate('localStorage.getItem("factory_lab_warehouse_expanded")'),'true','expansion must persist');
  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,400));
  assert.equal(await evaluate('document.getElementById("warehousePanel").open'),true,'expanded state must survive reload');
  await evaluate('document.querySelector("#warehousePanel > summary").click()');
  await new Promise(r=>setTimeout(r,200));
  assert.equal(await evaluate('localStorage.getItem("factory_lab_warehouse_expanded")'),'false','collapse must persist');
  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,400));
  assert.equal(await evaluate('document.getElementById("warehousePanel").open'),false,'collapsed state must survive reload');
  console.log('PASS: warehouse folded by default, expandable, localStorage persistence in Edge');

  const started=Date.now();
  const click=await evaluate('(()=>{try{document.getElementById("run").click();return {ok:true,running,simTime,text:document.getElementById("run").textContent}}catch(e){return {ok:false,error:String(e),stack:e.stack}}})()');
  console.log('CLICK',Date.now()-started+'ms',JSON.stringify(click));
  assert.equal(info.onClick,'function','Run button must be bound');
  assert(click.ok&&click.running,'Run button must start simulation');
  await new Promise(r=>setTimeout(r,1500));
  const playing=await evaluate('({running,simTime,text:document.getElementById("run").textContent})');
  console.log('PLAYING',JSON.stringify(playing));
  assert(playing.running&&playing.simTime>0,'simulated time must advance');
  const paused=await evaluate('(()=>{document.getElementById("run").click();return {running,simTime}})()');
  assert.equal(paused.running,false,'second click must pause');
  const stepped=await evaluate('(()=>{document.getElementById("stepMinute").click();return simTime})()');
  assert(stepped>=paused.simTime+59.99,'+1 minute must advance by 60 simulated seconds');
  const reset=await evaluate('(()=>{document.getElementById("resetSim").click();return {running,simTime}})()');
  assert(!reset.running&&reset.simTime===0,'reset must stop and zero time');
  assert.equal(exceptions.length,0,'uncaught errors: '+exceptions.join('; '));
  console.log('PASS: run, pause, +1 minute, reset in real Edge');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
