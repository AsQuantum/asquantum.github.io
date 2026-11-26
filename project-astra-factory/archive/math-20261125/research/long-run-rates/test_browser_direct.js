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
  async function workerResult(data){
   const r=await evaluate('new Promise((resolve)=>{const w=new Worker("direct-worker.js");w.onmessage=e=>{w.terminate();resolve(e.data)};w.onerror=e=>{w.terminate();resolve({error:e.message})};w.postMessage('+JSON.stringify(data)+')})');
   assert(!r.error,JSON.stringify(r));assert.equal(r.legacyLoaded,false);assert.equal(r.isolated,false);
   return r;
  }
  const cases=[
   [path.join(__dirname,'new-warp.ast1.txt'),'1/99','1/99'],
   [path.join(root,'tests/fixtures/ast1-warp-coil-only.txt'),'1/128','1/128'],
   [path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'11/1440','1/80']
  ];
  const results=[];
  for(const [fixture,normal,unlimited] of cases){
   const ast=fs.readFileSync(fixture,'utf8').trim(),r=await workerResult({ast});
   assert.equal(r.result.status,'conditional-exact',JSON.stringify({status:r.result.status,issues:r.result.constrained.issues}));
   assert.equal(r.result.rows['曲速线圈'].net,normal);
   assert.equal(r.result.rows['曲速线圈'].overdraft,unlimited);
   results.push({fixture:path.basename(fixture),ms:r.elapsed,normal,unlimited,unknown:r.result.constrained.unknown.length});
   console.log('BROWSER',JSON.stringify(results.at(-1)));
  }
  const branch=JSON.parse(fs.readFileSync(path.join(__dirname,'legal-shared-input-branch.json'),'utf8'));
  const r=await workerResult({layout:branch.layout});
  assert.equal(r.result.status,'conditional-exact');assert.equal(r.result.rows['合金板'].inflow,null);assert.equal(r.result.rows['合金板'].outflow,null);assert.equal(r.result.rows['合金板'].net,'3/2');assert.equal(r.result.rows['合金板'].localNet,'-1/2');assert.equal(r.result.rows['导线线圈'].net,'1');
  assert.equal(r.result.total.net,'3');assert.equal(r.result.total.inflow,null);assert.equal(r.result.total.outflow,null);
  console.log('BROWSER legal branch',JSON.stringify({rows:r.result.rows,total:r.result.total,ms:r.elapsed}));
  const direct=await workerResult({ast:fs.readFileSync(path.join(__dirname,'double-inlet.ast1.txt'),'utf8').trim(),continuousRefill:true});
  assert.equal(direct.result.constrained.certificates.length,1);
  const cert=direct.result.constrained.certificates[0],right=cert.ports[0].route,left=cert.ports[1].route;
  assert.equal(direct.result.constrained.values['flow:'+right+'|小行星矿石'],'1');
  assert.equal(direct.result.constrained.values['flow:'+left+'|小行星矿石'],'1/2');
  assert.equal(direct.result.rows['钛合金锭'].net,'1/2');
  const netBranch=JSON.parse(fs.readFileSync(path.join(__dirname,'legal-net-branch.json'),'utf8'));
  const branchCertificate=await workerResult({layout:netBranch.layout,continuousRefill:true});
  assert.equal(branchCertificate.result.constrained.certificates.length,0);
  assert.equal(branchCertificate.result.rows['小行星矿石'].net,null);
  console.log('BROWSER refill certificate',JSON.stringify({cert,net:direct.result.rows['钛合金锭'].net,rejectedBranch:true}));
  // Actual legal layout with the side branch removed: single-output
  // logistics relay, not a hardcoded generator-to-recipe exception.
  const relayLayout=structuredClone(netBranch.layout);relayLayout.routes=relayLayout.routes.filter(x=>x.id!=='R2');relayLayout.machines=relayLayout.machines.filter(m=>m.id!=='M5');
  const relay=await workerResult({layout:relayLayout,continuousRefill:true});
  assert.equal(relay.result.constrained.certificates.length,1);
  assert(relay.result.constrained.certificates[0].supplyProof.some(p=>p.rule==='single-connected-output-relay'));
  assert.equal(relay.result.constrained.values['flow:R1|小行星矿石'],'1/4');assert.equal(relay.result.constrained.values['flow:R3|小行星矿石'],'1/2');
  assert.equal(relay.result.rows['复合装甲板'].net,'1/4');
  console.log('BROWSER relay proof',JSON.stringify({net:relay.result.rows['复合装甲板'].net,certificate:relay.result.constrained.certificates[0]}));
  const timeout=await workerResult({ast:fs.readFileSync(cases[0][0],'utf8').trim(),ms:0});
  assert.equal(timeout.result.status,'unresolved');assert.equal(timeout.result.rows['曲速线圈'].net,null);assert.equal(timeout.result.constrained.retryable,true);
  const scientific=await workerResult({layout:{machines:[],routes:[],frozenFactories:[{id:'a',name:'a',enabled:true,rates:{'合金板':'1e-3'}}]}});
  assert.equal(scientific.result.rows['合金板'].net,'1/1000');
  assert.equal(exceptions.length,0,exceptions.join(' | '));
  fs.writeFileSync(path.join(__dirname,'browser-direct-results.json'),JSON.stringify({results,branch:r.result.rows,total:r.result.total,timeout:timeout.result.status,scientific:scientific.result.rows},null,2));
  console.log('PASS: real ordinary static HTTP, JS-only exact Worker, six real-blueprint solves, partial unknowns, exact scientific rate, timeout');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child?.kill();server.close();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
