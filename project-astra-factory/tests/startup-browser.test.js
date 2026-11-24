'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url='file:///'+path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astra-startup-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,url],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<80;i++){try{const v=await fn();if(v)return v;}catch{}await sleep(125);}throw Error('Timed out awaiting browser startup');}
(async()=>{
let ws;
try{
 const port=+(await until(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]:null));
 const targets=await until(async()=>{const x=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return x.find(v=>v.type==='page'&&v.url.includes('project-astra-factory'))?x:null;});
 const target=targets.find(v=>v.type==='page'&&v.url.includes('project-astra-factory'));
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});
 let seq=0;const waiting=new Map(),errors=[];
 ws.onmessage=ev=>{const msg=JSON.parse(ev.data);if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);if(msg.id&&waiting.has(msg.id)){waiting.get(msg.id)(msg);waiting.delete(msg.id)}};
 const call=(method,params={})=>new Promise(resolve=>{const id=++seq;waiting.set(id,resolve);ws.send(JSON.stringify({id,method,params}))});
 const evalJs=async expression=>{const x=await call('Runtime.evaluate',{expression,returnByValue:true});if(x.result?.exceptionDetails)throw Error(x.result.exceptionDetails.text);return x.result?.result?.value};
 await call('Runtime.enable');await call('Page.enable');await call('Page.reload',{ignoreCache:true});
 await until(async()=>await evalJs('document.readyState==="complete"'));
 const status=await until(async()=>{const v=await evalJs("({top:document.getElementById('topStats')?.textContent,warehouse:document.getElementById('warehouse')?.textContent,defined:typeof theoreticalBudget})");return v?.top&&!v.top.includes('加载中')?v:null;});
 assert.equal(status.defined,'object','global theoreticalBudget must be initialized to null or model');
 assert(status.warehouse?.length>0,'warehouse panel must render on initial load');
 assert.equal(errors.length,0,'Unexpected JavaScript exceptions: '+errors.join('; '));
 console.log('PASS startup:',JSON.stringify({top:status.top,warehouseLoaded:true,exceptions:errors.length}));
}catch(e){console.error(e);process.exitCode=1}
finally{try{ws?.close()}catch{}try{child.kill()}catch{}try{fs.rmSync(dir,{force:true,recursive:true,maxRetries:3})}catch{}}
})();