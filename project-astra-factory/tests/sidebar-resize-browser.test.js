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

  const waitFrame=()=>new Promise(r=>setTimeout(r,100));
  await send('Emulation.setDeviceMetricsOverride',{width:1470,height:1000,deviceScaleFactor:1,mobile:false});
  await waitFrame();
  const initial=await evaluate(`(()=>{
   $('warehousePanel').open=true;
   ware={'曲速线圈':123456789012345,'古代芯片':10,'合金板':40,'硅晶圆':20};warehouseRefresh();
   const l=document.querySelector('.side.left'),r=document.querySelector('.side.right'),c=document.querySelector('.canvaswrap');
   return {left:l.getBoundingClientRect().width,right:r.getBoundingClientRect().width,center:c.getBoundingClientRect().width,
    x:camera.x,y:camera.y,z:camera.z,handles:[...document.querySelectorAll('.sidebar-divider')].map(h=>{const b=h.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}}),
    scrolls:[...document.querySelectorAll('#warehouse .ledger-table-scroll')].map(s=>({client:s.clientWidth,scroll:s.scrollWidth,card:s.closest('.ledger-panel').getBoundingClientRect().width,inside:s.getBoundingClientRect().right<=s.closest('.ledger-panel').getBoundingClientRect().right+1})),
    itemIds:MATERIALS.map(ast1ItemNumber)};
  })()`);
  console.log('initial',JSON.stringify(initial));
  assert.equal(initial.handles.length,2);
  assert(initial.scrolls.length>=2&&initial.scrolls.every(s=>s.inside));
  assert(initial.scrolls.some(s=>s.scroll>s.client),'narrow table should scroll');
  assert.deepEqual(initial.itemIds,[...initial.itemIds].sort((a,b)=>a-b));
  async function mouseDrag(p,dx){
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+dx,y:p.y,button:'left',buttons:1});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx,y:p.y,button:'left',buttons:0,clickCount:1});
   await waitFrame();
  }
  await mouseDrag(initial.handles[1],-180);
  const resized=await evaluate(`(()=>{
   const l=document.querySelector('.side.left'),r=document.querySelector('.side.right'),c=document.querySelector('.canvaswrap');
   const m=state.machines.find(m=>m.type==='分流');selection={machineId:m.id};inspectorRefresh();
   return {left:l.getBoundingClientRect().width,right:r.getBoundingClientRect().width,center:c.getBoundingClientRect().width,z:camera.z,
   pixelWidth:pix.w,viewCenter:(pix.w/2-camera.x)/camera.z,filters:[...document.querySelectorAll('#inspector [data-out-filter]')].map(s=>[...s.options].map(o=>ast1ItemNumber(o.value))),
   rows:[...document.querySelectorAll('#warehouse .ledger-table-scroll:first-of-type .ledger-name[title]')].map(x=>ast1ItemNumber(x.title)),
   saved:JSON.parse(localStorage.getItem('factory-lab.desktop-sidebar-widths.v1')),
   leftHandle:(()=>{const b=document.querySelector('[data-sidebar-resize="left"]').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}})()};
  })()`);
  console.log('resized',JSON.stringify(resized));
  assert(resized.right>=initial.right+175&&resized.center<=initial.center-175);
  assert.equal(resized.left,initial.left);assert.equal(resized.z,initial.z);
  assert.equal(resized.pixelWidth,resized.center);
  assert(Math.abs(resized.viewCenter-(initial.center/2-initial.x)/initial.z)<1e-8);
  for(const ids of resized.filters){assert.equal(ids[0],0);assert.deepEqual(ids.slice(1),[...ids.slice(1)].sort((a,b)=>a-b));}
  assert.equal(resized.saved.right,resized.right);
  const sorted=await evaluate(`(()=>{stockChartOpen(true);const chart=[...$('stockChartLegend').querySelectorAll('[data-stock-item]')].map(x=>ast1ItemNumber(decodeURIComponent(x.dataset.stockItem)));const tables=[...document.querySelectorAll('#warehouse .ledger-table-scroll')].map(x=>[...x.querySelectorAll('td.ledger-name[title]')].map(t=>ast1ItemNumber(t.title)));stockChartOpen(false);return {chart,tables};})()`);
  console.log('item ordering',JSON.stringify(sorted));
  assert(sorted.chart.length>=4);for(const list of [sorted.chart,...sorted.tables])assert.deepEqual(list,[...list].sort((a,b)=>a-b));
  await mouseDrag(resized.leftHandle,80);
  const both=await evaluate("({left:document.querySelector('.side.left').getBoundingClientRect().width,right:document.querySelector('.side.right').getBoundingClientRect().width,center:pix.w})");
  assert(both.left>=initial.left+75);assert.equal(both.right,resized.right);
  await send('Page.reload',{ignoreCache:true});
  await poll(async()=>await evaluate('document.readyState==="complete"'));
  await waitFrame();
  const restored=await evaluate("({left:document.querySelector('.side.left').getBoundingClientRect().width,right:document.querySelector('.side.right').getBoundingClientRect().width})");
  assert.deepEqual(restored,{left:both.left,right:both.right});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await waitFrame();
  const mobile=await evaluate("({handles:[...document.querySelectorAll('.sidebar-divider')].map(x=>getComputedStyle(x).display),width:document.documentElement.scrollWidth,inner:window.innerWidth})");
  assert(mobile.handles.every(s=>s==='none'));assert(mobile.width<=mobile.inner+1);
  assert.equal(exceptions.length,0,exceptions.join(' | '));
  console.log('PASS: scroll containment, real pointer drag, persistence, sorting, and mobile isolation');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
