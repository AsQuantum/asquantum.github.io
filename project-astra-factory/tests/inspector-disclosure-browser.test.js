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
   const candidates=state.machines;
   const first=candidates.find(m=>m.type==='分流')||candidates[0];
   const second=candidates.find(m=>m.type==='组装'&&m.id!==first.id)||candidates.find(m=>m.id!==first.id);
   if(!first||!second)return {error:'Two machines required for switching test'};
   if(!theoreticalBudget)warehouseRefresh();
   selection={machineId:first.id};inspectorRefresh();
   const get=()=>({theory:$('inspector').querySelector('.machine-port-details'),
     live:$('inspector').querySelector('.machine-live-detail'),
     history:$('inspector').querySelector('.machine-live-history')});
   const a=get();
   if(!a.theory||!a.live||!a.history)return {error:'Expected theory/live detail elements',types:[first.type,second.type]};
   a.theory.open=true;a.live.open=true;a.history.open=true;
   selection={machineId:second.id};inspectorRefresh();
   const b=get();
   const switchedOpen=b.theory?.open&&b.live?.open&&b.history?.open;
   inspectorRefreshLive();
   const afterLive=!!get().theory?.open&&!!get().live?.open&&!!get().history?.open;
   const route=state.routes[0];
   if(route){selection={routeId:route.id};inspectorRefresh();}
   selection={machineId:first.id};inspectorRefresh();
   const afterRoute=get().theory?.open&&get().live?.open&&get().history?.open;
   const panel=$('inspector').querySelector('.machine-analysis-panel');
   const css=element=>getComputedStyle(element);
   const tiles=[...panel.querySelectorAll('.machine-flow-tile')];
   const duties=[...panel.querySelectorAll('.machine-duty-grid>div')];
   const counts=[...panel.querySelectorAll('.machine-live-summary>div')];
   const noNestedTiles=[...tiles,...duties,...counts].every(el=>{
    const st=css(el);
    return st.backgroundColor==='rgba(0, 0, 0, 0)'&&
     st.borderTopWidth==='0px'&&st.borderLeftWidth==='0px'&&
     st.display==='flex';
   });
   const oneCard=css(panel).backgroundColor!=='rgba(0, 0, 0, 0)'&&
    css(panel).borderTopWidth==='1px'&&
    [...panel.querySelectorAll(':scope > .item')].every(el=>
      css(el).backgroundColor==='rgba(0, 0, 0, 0)'&&css(el).borderLeftWidth==='0px');
   const aligned=tiles.every(el=>el.querySelector('.tile-label')&&el.querySelector('.tile-value'));
   const rows=tiles.map(el=>el.getBoundingClientRect());
   const values=tiles.map(el=>el.querySelector('.tile-value').getBoundingClientRect());
   const flowStacked=rows.length===2&&Math.abs(rows[0].left-rows[1].left)<2&&
    rows[0].bottom<=rows[1].top+1&&Math.abs(values[0].right-values[1].right)<3&&
    rows.every(r=>r.width>180);
   const metrics=$('inspector').querySelector('.machine-summary-metrics');
   const machineRows=!!metrics&&css(metrics).display==='block'&&
    [...metrics.children].every(el=>css(el).display==='flex');
   // Closing one disclosure must also stay closed across selection, not just opened.
   get().theory.open=false;
   selection={machineId:second.id};inspectorRefresh();
   const respectsManualClose=!get().theory.open&&get().live.open&&get().history.open;
   // Restore defaults to avoid influencing other tests within this run.
   get().theory.open=false;get().live.open=false;get().history.open=false;
   return {types:[first.type,second.type],switchedOpen,afterLive,afterRoute,
    noNestedTiles,oneCard,aligned,flowStacked,flowRects:rows.map(r=>({x:r.x,y:r.y,w:r.width,h:r.height})),valueRight:values.map(r=>r.right),flowDisplay:css(panel.querySelector('.machine-flow-summary')).display,machineRows,respectsManualClose,
    tileCount:tiles.length,dutyCount:duties.length,countRows:counts.length};
  })()`);
  console.log('FLAT INSPECTOR PERSISTENCE',JSON.stringify(result));
  assert(!result.error&&result.switchedOpen&&result.afterLive&&result.afterRoute&&
   result.noNestedTiles&&result.oneCard&&result.aligned&&result.flowStacked&&result.machineRows&&
   result.respectsManualClose&&result.tileCount===2&&result.countRows===2,
   'inspector must be one row-based card and keep user disclosure state across machine/route selections');
  assert.equal(exceptions.length,0,'uncaught Edge exceptions: '+exceptions.join(' | '));
  console.log('PASS: flat row/number inspector and open/closed details persist on machine switch and live refresh');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
