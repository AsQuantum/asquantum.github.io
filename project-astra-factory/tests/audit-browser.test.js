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
  const visual=await evaluate(`(()=>{
   const auditPanel=$('auditPanel');
   auditPanel.open=true;
   auditRefresh();
   const auditRoot=$('audit'),card=auditRoot.querySelector('.audit-card');
   const rows=[...card.querySelector('.audit-stat-list').querySelectorAll('.audit-row')];
   const stocks=[...card.querySelectorAll('.audit-material-row')];
   const materialNames=stocks.map(x=>x.querySelector('.audit-label')?.textContent);
   const computed=el=>getComputedStyle(el);
   const ledger=$('warehouse');
   $('warehousePanel').open=true;warehouseRefresh();
   const heading=ledger.querySelector('.ledger-panel .ledger-head strong');
   const sidebar=document.querySelector('.side.right');
   const firstLevel=[
     sidebar.querySelector(':scope > .warehouse-panel > summary'),
     sidebar.querySelector(':scope > h3'),
     sidebar.querySelector(':scope > #auditPanel > summary'),
     sidebar.querySelector(':scope > #logsPanel > summary')
   ].map(el=>({text:el.textContent.trim(),size:parseFloat(computed(el).fontSize),
     weight:Number(computed(el).fontWeight),color:computed(el).color}));
   const inspectMachine=state.machines.find(x=>!!getRecipe(x));
   selection={machineId:inspectMachine.id};inspectorRefresh();
   const secondLevel=[
     document.querySelector('#inspector .machine-summary-eyebrow'),
     document.querySelector('#inspector .machine-analysis-panel > .machine-analysis-heading'),
     document.querySelector('#warehouse .ledger-head strong'),
     document.querySelector('#audit .audit-card-title')
   ].map(el=>({text:el.textContent.trim(),size:parseFloat(computed(el).fontSize),
     weight:Number(computed(el).fontWeight),color:computed(el).color}));
   const thirdLevel=[
     document.querySelector('#inspector .machine-analysis-title strong'),
     document.querySelector('#inspector .machine-live-head strong')
   ].map(el=>({text:el.textContent.trim(),size:parseFloat(computed(el).fontSize),
     weight:Number(computed(el).fontWeight)}));
   const warehouseKpis=[...document.querySelectorAll('#warehouseLiveSummary b')]
     .map(el=>({text:el.textContent,weight:computed(el).fontWeight,size:parseFloat(computed(el).fontSize)}));
   const noLegacyUpperBound=!card.textContent.includes('齿轮／线圈输入口上限')&&
     !card.textContent.includes('混合输入口共享每秒 1 件吞吐量');
   const vals=rows.map(row=>({
    text:row.querySelector('.audit-label')?.textContent,
    value:row.querySelector('.audit-value')?.textContent,
    leftFont:computed(row.querySelector('.audit-label')).fontSize,
    rightFont:computed(row.querySelector('.audit-value')).fontSize,
    rightWeight:computed(row.querySelector('.audit-value')).fontWeight,
    inCard:card.contains(row),
    aligned:row.querySelector('.audit-label').getBoundingClientRect().left<
      row.querySelector('.audit-value').getBoundingClientRect().right
   }));
   const rates=[...card.querySelectorAll('.audit-section-heading')];
   const details=[...card.querySelectorAll('.audit-diagnostic')];
   const summary=card.querySelector('.audit-section-meta')?.textContent;
   return {count:stocks.length,materialNames,allChecked:stocks.length===MATERIALS.length&&
     MATERIALS.every(x=>materialNames.includes(x)),
    matchState:stocks.every(row=>{
     const found=row.querySelector('.audit-value').textContent==='有入库路径';
     return found===hasProducerWarehousePath(row.querySelector('.audit-label').textContent);
    }),
    allResultsVisible:stocks.every(row=>row.getBoundingClientRect().height>0),
    allInsideCard:vals.every(x=>x.inCard),
    consistentFonts:new Set(vals.map(x=>x.leftFont)).size===1&&
      new Set(vals.map(x=>x.rightFont)).size===1,
    normals:vals.every(x=>x.rightWeight==='400'),
    summary,statCount:vals.length,statLabels:vals.map(x=>x.text),
    cardBackground:computed(card).backgroundColor,
    headingColor:computed(heading).color,
    headingWeight:computed(heading).fontWeight,
    firstLevel,secondLevel,thirdLevel,warehouseKpis,noLegacyUpperBound,
    cardVisible:card.getBoundingClientRect().height>0,
    detailsCount:details.length,sections:rates.map(x=>x.textContent.trim())};
  })()`);
  console.log('ROUTE AUDIT AND LEDGER UI',JSON.stringify(visual));
  assert(visual.allChecked&&visual.matchState&&visual.allResultsVisible&&visual.allInsideCard&&
   visual.consistentFonts&&visual.normals&&visual.statCount===10&&visual.cardVisible,
   'every catalog item and route counter must appear together in one uniform card');
  assert(visual.summary.includes('已检查 23/23')&&visual.summary.includes('有路径 '),
   'distinguish total inspected materials from routes actually found');
  assert(visual.noLegacyUpperBound,'gear/coil upper-bound text should be fully removed');
  assert.equal(visual.firstLevel.length,4);
  assert(visual.firstLevel.every(x=>x.size===14&&x.weight===650&&x.color==='rgb(213, 229, 241)'),
   'all four main headings need the same high-contrast 14px typographic level');
  assert(visual.secondLevel.every(x=>x.size===12.5&&x.weight===560),
   'card headings must be subordinate to the main sidebar headings');
  assert(visual.thirdLevel.every(x=>x.size<12.5&&x.weight===500),
   'inner steady/live headings must be subordinate to card headings');
  assert(visual.warehouseKpis.length===2&&visual.warehouseKpis.every(x=>x.weight==='700'&&x.size===16),
   'only the two simulation summary numbers must be bold 16px');
  assert.equal(visual.headingWeight,'560','ledger heading should be moderate, not bold');
  assert.equal(visual.headingColor,'rgb(182, 205, 221)','ledger heading should be muted blue, not bright white');
  assert.equal(exceptions.length,0,'uncaught Edge exceptions: '+exceptions.join(' | '));
  console.log('PASS: all 23 materials checked, no obsolete upper-bound block, four readable primary headings and two bold warehouse KPIs');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
