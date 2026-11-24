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


  const fixture=fs.readFileSync(path.join(__dirname,'fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
  const result=await evaluate(`(()=>{state=ast1Decode(${JSON.stringify(fixture)});theoreticalBudget=null;resetSimulation();warehouseRefresh();
   const b=theoreticalBudget,c=b.conditionalBudget;
   const label=timeLabel(machineById('M24'));
   selection={machineId:'M24'};inspectorRefresh();
   const row=[...document.querySelectorAll('#warehouse .ledger-panel:first-of-type tr')].find(r=>r.querySelector('.ledger-name[title="钛合金锭"]'));
   const theory=document.querySelector('#warehouse .ledger-table-scroll');
   const rowCells=[...theory.querySelectorAll('tbody tr')].find(r=>r.querySelector('.ledger-name[title="钛合金锭"]'))?.cells;
   return {status:c?.status,unrestricted:b.unlimitedStockBudget?.status,label,
     theoryCells:[...rowCells||[]].map(x=>x.textContent.trim()),
     headers:[...theory.querySelectorAll('th')].map(x=>x.textContent),
     inspector:$('inspector').innerText,oldSolver:typeof warehouseTheoryCertifiedOrDiagnostic,oldAST1:typeof factorySteadyAst1ConditionalRegime};})()`);
  console.log('UNIFIED',JSON.stringify(result));
  assert.equal(result.status,'conditional-fixed-point');assert.equal(result.unrestricted,'conditional-fixed-point');
  assert.equal(result.label,'6s(16.36s)');
  assert.deepEqual(result.headers,['材料','收入','支出','净值','潜在净值','透支净值']);
  assert.deepEqual(result.theoryCells.slice(1),['80.00','71.00','+9.00','+9.00','-34.00']);
  assert.equal(result.oldSolver,'undefined');assert.equal(result.oldAST1,'undefined');
  assert(result.inspector.includes('条件解'));
  assert.equal(exceptions.length,0,exceptions.join(' | '));
  console.log('PASS: real production page computes both balances and uses the same cycle rates');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
