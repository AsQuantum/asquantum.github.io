'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file=path.resolve(__dirname,'direct-test.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-button-'));
let child;const http=require('http');const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/project-astra-factory\//,'');const full=path.resolve(__dirname,'../..',p);const root=path.resolve(__dirname,'../..');if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',full.endsWith('.js')?'application/javascript':full.endsWith('.css')?'text/css':full.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(fs.readFileSync(full));});
async function poll(f){for(let i=0;i<120;i++){try{const v=await f();if(v)return v;}catch(e){}await new Promise(r=>setTimeout(r,200));}throw new Error('Edge CDP timeout');}
(async()=>{
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,'http://127.0.0.1:'+server.address().port+'/project-astra-factory/research/long-run-rates/direct-test.html'],{stdio:'ignore',windowsHide:true});
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




  const root=path.resolve(__dirname,'../..');
  async function workerResult(data,limit=15000){
   return await evaluate('new Promise(resolve=>{const w=new Worker("../../scripts/engine/steady-certified-worker.js?v=certified-test");const done=x=>{clearTimeout(timer);w.terminate();resolve(x)};const timer=setTimeout(()=>done({timeout:true}),'+limit+');w.onmessage=e=>done(e.data);w.onerror=e=>done({error:e.message});w.postMessage('+JSON.stringify(data)+')})');
  }
  const f=(id,rates)=>({id,name:id,enabled:true,rates}),layout=frozenFactories=>({name:'test',machines:[],routes:[],frozenFactories});
  const a=await workerResult({layout:layout([f('s',{'合金板':'1'}),f('a',{'合金板':'-2','硅晶圆':'3'}),f('b',{'合金板':'-3','能量电池':'5'})]),budgetMs:4000});
  assert(!a.error&&!a.timeout,JSON.stringify(a));assert.equal(a.result.rows['合金板'].outflow,'1');assert.equal(a.result.values['duty:a'],null);assert.equal(a.result.values['duty:b'],null);assert.equal(a.result.status,'partial');
  const b=await workerResult({layout:layout([f('s',{'合金板':'1','星尘粒子':'5'}),f('a',{'合金板':'-2','星尘粒子':'-1','硅晶圆':'3'})]),budgetMs:4000});
  assert(!b.error&&!b.timeout,JSON.stringify(b));assert.equal(b.result.values['duty:a'],'1/2');assert.equal(b.result.rows['星尘粒子'].net,'9/2');
  const c=await workerResult({layout:layout([f('s',{'合金板':'2'}),f('a',{'合金板':'-1','硅晶圆':'2'}),f('b',{'硅晶圆':'-1','能量电池':'1'})]),budgetMs:4000});
  assert(!c.error&&!c.timeout,JSON.stringify(c));assert.equal(c.result.values['duty:a'],'1');assert.equal(c.result.values['duty:b'],'1');
  const ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
  const diagnostic=await workerResult({ast,budgetMs:3500},12000);
  assert(!diagnostic.error,JSON.stringify(diagnostic.error));
  const d=diagnostic.result?{status:diagnostic.result.status,actualStatus:diagnostic.result.actual.status,known:Object.values(diagnostic.result.values).filter(x=>x!==null).length,unknown:diagnostic.result.actual.unknown.length,unknownMetrics:diagnostic.result.unknownMetrics.length,ms:Math.round(diagnostic.result.elapsedMs)}:{timeout:!!diagnostic.timeout};
  const report={browser:true,partialAggregate:a.result.rows['合金板'],multiResourceDuty:b.result.values['duty:a'],abundanceChain:[c.result.values['duty:a'],c.result.values['duty:b']],largeLayoutReadinessDiagnostic:d};
  fs.writeFileSync(path.join(__dirname,'browser-certified-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  assert.equal(exceptions.length,0,exceptions.join(' | '));
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child?.kill();server.close();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
