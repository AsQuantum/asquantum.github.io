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




  assert.equal(await evaluate("document.querySelector('[data-ledger-toggle=theory] strong')?.textContent.trim()||document.querySelector('[data-ledger-toggle=theory]')?.textContent.trim().replace(/^[▸▾]\\s*/,'')"),'长期理论收支');
  const initial=await evaluate("(()=>{const cards=[...document.querySelectorAll('[data-ledger-toggle]')],style=e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.borderColor,s.borderRadius,s.padding]};return {closed:cards.length===3&&cards.every(b=>b.getAttribute('aria-expanded')==='false'),header:$('warehousePanel').querySelector('summary').textContent,styles:[style($('warehouseFrozen')),...[...document.querySelectorAll('#warehouse .ledger-panel')].map(style)],copy:!!document.querySelector('[data-copy-frozen-net]')}})()");
  assert(initial.closed);assert.equal(initial.header,'仓库材料');assert(!initial.copy);assert(initial.styles.every(v=>JSON.stringify(v)===JSON.stringify(initial.styles[0])),JSON.stringify(initial.styles));
  // A known provable independent physical source, rather than assuming
  // the old default warp-coil continuous model is a certified result.
  await evaluate(`(()=>{const a={id:'M0',type:'垃圾',mode:1,x:5,y:10,face:'E'},b={id:'M1',type:'仓入',x:25,y:10,face:'E'};const p=outPort(a,0);b.y+=p.ey-inPort(b,0).ey;const q=inPort(b,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);state={name:'冻结来源验证',machines:[a,b],routes:[{id:'R0',from:{id:a.id,port:0},to:{id:b.id,port:0},path}]};invalidateTheoryIfChanged();resetSimulation();refresh();saveCurrentScheme();return true;})()`);
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  const source=await evaluate("(()=>({id:solverSchemeId,name:state.name,snapshot:frozenSnapshot(theoreticalBudget,state.name)}))()");
  assert.equal(source.snapshot.rates['遐想物质'],'2/15');
  const selfImport=await evaluate(`(async()=>{
   warehouseCardOpen.frozen=true;warehouseRefresh();
   const own=$('frozenSchemeImport'),option=[...own.options].find(x=>x.value===solverSchemeId);
   const select=$('frozenImportMetric');
   const a=await frozenImportScheme(solverSchemeId,'net');
   const b=await frozenImportScheme(solverSchemeId,'potential');
   const result={own:option?.textContent,metrics:[...select.options].map(x=>x.value),a:a.rates['遐想物质'],b:b.rates['遐想物质'],name:b.name,count:state.frozenFactories.length};
   frozenCommit([],'清理自导入测试');return result;
  })()`);
  assert(selfImport.own.includes('（当前）'));assert.deepEqual(selfImport.metrics,['net','potential']);assert.equal(selfImport.a,'2/15');assert.equal(selfImport.b,'2/15');assert(selfImport.name.includes('潜在净值'));assert.equal(selfImport.count,2);
  const targetSchemeId=await evaluate("(()=>{const t=addScheme('冻结配置测试');$('warehousePanel').open=true;warehouseCardOpen.frozen=true;warehouseRefresh();return t.id})()");
  const selectImport=await evaluate("(()=>{const b=()=>document.querySelector('[data-frozen-action=import]'),s=$('frozenSchemeImport');const initiallyDisabled=b().disabled;s.value="+JSON.stringify(source.id)+";s.dispatchEvent(new Event('change',{bubbles:true}));const enabled=!b().disabled;warehouseRefresh();const retained=$('frozenSchemeImport').value==="+JSON.stringify(source.id)+"&&!b().disabled;b().click();return {initiallyDisabled,enabled,retained,pending:b().disabled&&b().textContent.includes('计算中')};})()");
  assert(selectImport.initiallyDisabled&&selectImport.enabled&&selectImport.retained&&selectImport.pending,JSON.stringify(selectImport));

  await poll(async()=>await evaluate("state.frozenFactories?.length===1"));
  await poll(async()=>await evaluate("document.querySelector('[data-frozen-import-status]')?.textContent.includes('已导入')"));
  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  const imported=await evaluate("(()=>({id:solverSchemeId,rate:state.frozenFactories[0].rates['遐想物质'],duty:theoreticalBudget.frozenDuty.f1,income:theoreticalBudget.inflow['遐想物质'],machines:state.machines.length}))()");
  assert.equal(imported.id,targetSchemeId);assert.equal(imported.rate,'2/15');assert.equal(imported.duty,1);assert.equal(imported.income,2/15);assert.equal(imported.machines,0);
  assert(await evaluate("!document.querySelector('[data-frozen-action=paste]')&&$('frozenSchemeImport').options[0].textContent==='选择方案'"));
  await evaluate("(()=>{frozenAdd('手动供给', {'合金板':'1'});return true})()");
  const manual=await evaluate("(()=>{document.querySelector('[data-frozen-action=add]').click();const card=document.querySelector('[data-frozen-id=f3]');card.querySelector('[data-frozen-new-item]').value='合金板';card.querySelector('[data-frozen-new-rate]').value='-30';card.querySelector('[data-frozen-action=add-item]').click();const next=document.querySelector('[data-frozen-id=f3]');next.querySelector('[data-frozen-new-item]').value='硅晶圆';next.querySelector('[data-frozen-new-rate]').value='60';next.querySelector('[data-frozen-action=add-item]').click();return state.frozenFactories[2].rates})()");
  assert.equal(manual['合金板'],'-1/2');assert.equal(manual['硅晶圆'],'1');
  const palette=await evaluate("(()=>{const css=(q)=>{const s=getComputedStyle(document.querySelector(q));return [s.backgroundColor,s.borderColor]};return {outer:css('#warehouseFrozen'),inner:css('.frozen-source'),button:css('[data-frozen-action=add]'),select:css('#frozenSchemeImport'),remove:css('.frozen-delete')}})()");
  assert.deepEqual(palette.inner,['rgb(32, 47, 66)','rgb(53, 73, 95)']);assert.notEqual(palette.outer[0],palette.inner[0]);assert.deepEqual(palette.button,['rgb(34, 51, 72)','rgb(71, 97, 123)']);console.log('PASS: nested surface palette',JSON.stringify(palette));
  const hierarchy=await evaluate("(()=>{const q=['#warehousePanel>summary','#warehouseFrozen .ledger-head strong','.frozen-source-name'];return q.map(sel=>{const s=getComputedStyle(document.querySelector(sel));return [s.color,parseFloat(s.fontSize),Number(s.fontWeight)]})})()");
  assert.deepEqual(hierarchy,[['rgb(213, 229, 241)',15,700],['rgb(201, 218, 235)',13.5,600],['rgb(169, 191, 213)',12,550]]);
  console.log('PASS: three distinct heading levels',JSON.stringify(hierarchy));
  const controls=await evaluate("(()=>{const card=()=>document.querySelector('[data-frozen-id=f3]'),input=()=>card().querySelector('[data-frozen-enabled]'),style=()=>{const s=getComputedStyle(input());return [s.appearance,s.backgroundColor,s.borderColor,s.borderRadius]},select=card().querySelector('[data-frozen-new-item]'),ids=[...select.options].map(o=>ast1ItemNumber(o.value)),expected=MATERIALS.filter(k=>!Object.hasOwn(state.frozenFactories[2].rates,k)).map(ast1ItemNumber).sort((a,b)=>a-b),before=style();input().click();const off=!state.frozenFactories[2].enabled,after=style();input().click();const on=state.frozenFactories[2].enabled;frozenAdd('待删除');let c=document.querySelector('[data-frozen-id=f4]');c.querySelector('[data-frozen-action=expand]').click();c=document.querySelector('[data-frozen-id=f4]');const folded=!c.querySelector('.frozen-source-body'),remove=c.querySelector('[data-frozen-action=remove]'),head=!!remove.closest('.frozen-source-head');remove.click();return {ids,expected,before,after,off,on,folded,head,deleted:state.frozenFactories.length===3}})()");
  assert.deepEqual(controls.ids,controls.expected);assert.equal(controls.before[0],'none');assert.notEqual(controls.before[1],controls.after[1]);assert(controls.off&&controls.on&&controls.folded&&controls.head&&controls.deleted,JSON.stringify(controls));
  console.log('PASS: numeric item ID order, themed checkbox, enable/disable, delete while collapsed',JSON.stringify(controls));

  await poll(async()=>await evaluate('theoreticalBudget?.calculating===false'));
  assert(await evaluate("Object.keys(frozenSnapshot(theoreticalBudget,state.name).rates).length===0"));
  const history=await evaluate("(()=>{for(let i=0;i<2600;i++)simulate(.05);const t=simTime,w=ware['遐想物质'];document.querySelector('[data-frozen-id=f3] [data-frozen-action=rename]').click();const box=document.querySelector('[data-frozen-id=f3] [data-frozen-name]');box.value='手动来源';box.dispatchEvent(new Event('change',{bubbles:true}));return {t,after:simTime,stock:w,afterStock:ware['遐想物质'],saved:JSON.parse(currentScheme().json).frozenFactories.length}})()");
  assert.equal(history.t,history.after);assert.equal(history.stock,17);assert.equal(history.afterStock,17);assert.equal(history.saved,3);
  const switching=await evaluate("(()=>{saveCurrentScheme();activateScheme("+JSON.stringify(source.id)+");const sourceCount=(state.frozenFactories||[]).length;activateScheme("+JSON.stringify(targetSchemeId)+");return {sourceCount,targetCount:state.frozenFactories.length,rate:state.frozenFactories[2].rates['硅晶圆']}})()");
  assert.equal(switching.sourceCount,0);assert.equal(switching.targetCount,3);assert.equal(switching.rate,'1');
  const collapse=await evaluate("(()=>{for(const key of ['frozen','theory','actual']){const b=document.querySelector('[data-ledger-toggle='+key+']');if(b.getAttribute('aria-expanded')==='true')b.click();}warehouseRefreshLive();return {closed:[...document.querySelectorAll('[data-ledger-toggle]')].every(b=>b.getAttribute('aria-expanded')==='false'),hidden:[...document.querySelectorAll('.ledger-card-body')].every(e=>e.hidden),frozen:!document.querySelector('.frozen-body')}})()");
  assert(collapse.closed&&collapse.hidden&&collapse.frozen,JSON.stringify(collapse));
  await send('Page.reload',{ignoreCache:true});await poll(async()=>await evaluate("document.readyState==='complete'&&typeof solverSchemesReady!=='undefined'&&solverSchemesReady"));
  const restored=await evaluate("(()=>({id:solverSchemeId,count:state.frozenFactories?.length,rate:state.frozenFactories?.[2]?.rates['合金板'],folded:[...document.querySelectorAll('[data-ledger-toggle]')].every(b=>b.getAttribute('aria-expanded')==='false')}))()");
  assert.equal(restored.id,targetSchemeId);assert.equal(restored.count,3);assert.equal(restored.rate,'-1/2');assert(restored.folded);
  const pot=await evaluate(`(async()=>{
   const a={id:'M0',type:'仓出',item:'合金板',x:5,y:10,face:'E'},b={id:'M1',type:'电脑',x:25,y:10,face:'E'};
   const p=outPort(a,0);b.y+=p.ey-inPort(b,0).ey;const q=inPort(b,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
   state={name:'潜在净值验证',machines:[a,b],routes:[{id:'R0',from:{id:a.id,port:0},to:{id:b.id,port:0},path}],frozenFactories:[{id:'s',rates:{'合金板':'1/2'}}]};
   invalidateTheoryIfChanged();resetSimulation();refresh();warehouseCardOpen.frozen=true;warehouseRefresh();
   const snapshot=await frozenComputeScheme(copy(state)),net=frozenSnapshot(snapshot,state.name,'net'),potential=frozenSnapshot(snapshot,state.name,'potential');
   const sel=$('frozenSchemeImport');sel.value=solverSchemeId;sel.dispatchEvent(new Event('change',{bubbles:true}));
   const metric=$('frozenImportMetric');metric.value='potential';metric.dispatchEvent(new Event('change',{bubbles:true}));warehouseRefresh();
   return {net:net.rates['合金板'],potential:potential.rates['合金板'],retained:$('frozenImportMetric').value,selected:$('frozenSchemeImport').value===solverSchemeId};
  })()`);
  assert.deepEqual(pot,{net:'-1/2',potential:'-1',retained:'potential',selected:true});
  assert.equal(exceptions.length,0,exceptions.join(' | '));
  console.log('PASS: matching card styles, default collapse, no clipboard controls, scheme import, manual editing, simulation preserved, scheme switching and reload');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child?.kill();server.close();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
