'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
 {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
const url='file:///'+path.join(root,'index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astra-order-browser-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check',
 '--disable-gpu','--disable-extensions','--remote-allow-origins=*',
 '--remote-debugging-port=0','--user-data-dir='+dir,url],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn){
 for(let i=0;i<100;i++){try{const v=await fn();if(v)return v;}catch(e){}await sleep(120);}
 throw Error('Edge startup timeout');
}
(async()=>{
 let ws;
 try{
  const port=+(await poll(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))
   ?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]:null));
  const targets=await poll(async()=>{const list=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
   return list.find(x=>x.type==='page'&&x.url.includes('project-astra-factory'))?list:null;
  });
  const target=targets.find(x=>x.type==='page'&&x.url.includes('project-astra-factory'));
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});
  let serial=0;const awaiting=new Map(),errors=[];
  ws.onmessage=e=>{
   const reply=JSON.parse(e.data);
   if(reply.method==='Runtime.exceptionThrown')
    errors.push(reply.params.exceptionDetails.exception?.description||reply.params.exceptionDetails.text);
   if(reply.id&&awaiting.has(reply.id)){awaiting.get(reply.id)(reply);awaiting.delete(reply.id);}
  };
  const call=(method,params={})=>new Promise(resolve=>{
   const id=++serial;awaiting.set(id,resolve);ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expr=>{
   const r=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
   if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text);
   return r.result?.result?.value;
  };
  await call('Runtime.enable');
  await poll(()=>evaluate('document.readyState==="complete"'));
  const cmd="(()=>{state=ast1Decode("+JSON.stringify(fixture)+");afterChange('import');"+
   "removeMachine('M10');"+
   "const shifted=state.machines.every((m,i)=>m.id==='M'+i);"+
   "const inserted=copy(state.machines[0]);inserted.id='m123456';inserted.x=1;inserted.y=1;"+
   "state.machines.push(inserted);selection={machineId:inserted.id};afterChange('append');"+
   "const expected=state.machines.every((m,i)=>m.id==='M'+i);"+
   "const valid=state.routes.every(r=>state.machines.some(m=>m.id===r.from.id)&&(!r.to||state.machines.some(m=>m.id===r.to.id)));"+
   "const restored=ast1Decode(ast1Encode());return {shifted,expected,valid,newSelection:selection?.machineId,"+
   "machineCount:state.machines.length,decodeCount:restored.machines.length,errors:0};})()";
  const result=await evaluate(cmd);
  assert.equal(result.shifted,true);
  assert.equal(result.expected,true);
  assert.equal(result.valid,true);
  assert.equal(result.newSelection,'M114');
  assert.equal(result.machineCount,115);
  assert.equal(result.decodeCount,115);
  assert.deepEqual(errors,[]);
  console.log('PASS browser AST1: deleted IDs compacted, new machine appended at 114, belt refs valid, export/import matches');
 }catch(err){console.error(err);process.exitCode=1;}
 finally{
  try{ws?.close();}catch(e){}
  try{child.kill();}catch(e){}
  try{fs.rmSync(dir,{force:true,recursive:true,maxRetries:3});}catch(e){}
 }
})();
