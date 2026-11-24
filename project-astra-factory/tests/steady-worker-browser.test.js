'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file=path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-button-'));
let child;const http=require('http');const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/project-astra-factory\//,'');const full=path.resolve(__dirname,'..',p);const root=path.resolve(__dirname,'..');if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',full.endsWith('.js')?'application/javascript':full.endsWith('.css')?'text/css':full.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(fs.readFileSync(full));});
async function poll(f){for(let i=0;i<120;i++){try{const v=await f();if(v)return v;}catch(e){}await new Promise(r=>setTimeout(r,200));}throw new Error('Edge CDP timeout');}
(async()=>{
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,'http://127.0.0.1:'+server.address().port+'/project-astra-factory/index.html'],{stdio:'ignore',windowsHide:true});
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



  const fixture=fs.readFileSync(path.join(__dirname,'fixtures/ast1-warp-coil-only.txt'),'utf8').trim();
  const pendingResult=await evaluate(`(()=>{state=ast1Decode(${JSON.stringify(fixture)});theoreticalBudget=null;
   theoreticalBudget=requestTheoryBudget({quickIterations:1,backgroundMs:60000});warehouseRefresh();
   return {pending:theoreticalBudget.calculating,text:$('warehouse').innerText,roundtrip:ast1Encode()===${JSON.stringify(fixture)}};})()`);
  assert(pendingResult.pending,JSON.stringify(pendingResult));assert(pendingResult.roundtrip);assert(pendingResult.text.includes('计算中'));assert(pendingResult.text.includes('曲速线圈'));assert(!pendingResult.text.includes('暂无有效仓库物流'));
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  const result=await evaluate(`(()=>({status:theoreticalBudget.status,reason:theoreticalBudget.notice,
    rate:theoreticalBudget.conditionalBudget?.fractions?.inflow?.['曲速线圈'],
    label:timeLabel(machineById('M1')),text:$('warehouse').innerText,done:theoryWorker===null}))()`);
  console.log('WORKER',JSON.stringify(result));assert.equal(result.status,'conditional-fixed-point');assert.equal(result.rate,'1/128');assert.equal(result.label,'22.5s(128s)');assert(result.done);
  const timed=await evaluate(`(()=>{theoreticalBudget=requestTheoryBudget({quickIterations:1,backgroundMs:1});warehouseRefresh();return theoreticalBudget.calculating})()`);
  assert(timed);await poll(async()=>await evaluate('theoreticalBudget?.calculationTimedOut===true'));
  assert((await evaluate("$('warehouse').innerText")).includes('计算超时'));
  const cancelled=await evaluate(`(()=>{theoreticalBudget=requestTheoryBudget({quickIterations:1});const pending=theoreticalBudget;cancelTheoryCalculation();theoreticalBudget=null;return theoryWorker===null&&theoryWorkerTimer===null&&pending.calculating===true})()`);
  assert(cancelled);assert.equal(exceptions.length,0,exceptions.join(' | '));
  console.log('PASS: real HTTP page background solver, exact warp rate, timeout and cancellation');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child?.kill();server.close();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
