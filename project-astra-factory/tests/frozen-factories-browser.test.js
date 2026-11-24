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
  const source=await evaluate("(()=>({id:solverSchemeId,name:state.name,snapshot:frozenSnapshot(theoreticalBudget,state.name)}))()");
  assert.equal(source.snapshot.rates['曲速线圈'],'1/128');
  const targetSchemeId=await evaluate("(()=>{const t=addScheme('冻结配置测试');$('warehousePanel').open=true;warehouseCardOpen.frozen=true;warehouseRefresh();return t.id})()");
  const selectImport=await evaluate("(()=>{const b=()=>document.querySelector('[data-frozen-action=import]'),s=$('frozenSchemeImport');const initiallyDisabled=b().disabled;s.value="+JSON.stringify(source.id)+";s.dispatchEvent(new Event('change',{bubbles:true}));const enabled=!b().disabled;warehouseRefresh();const retained=$('frozenSchemeImport').value==="+JSON.stringify(source.id)+"&&!b().disabled;b().click();return {initiallyDisabled,enabled,retained,pending:b().disabled&&b().textContent.includes('计算中')};})()");
  assert(selectImport.initiallyDisabled&&selectImport.enabled&&selectImport.retained&&selectImport.pending,JSON.stringify(selectImport));

  await poll(async()=>await evaluate("state.frozenFactories?.length===1"));
  await poll(async()=>await evaluate("document.querySelector('[data-frozen-import-status]')?.textContent.includes('已导入')"));
  const imported=await evaluate("(()=>({id:solverSchemeId,rate:state.frozenFactories[0].rates['曲速线圈'],duty:theoreticalBudget.conditionalBudget.frozenDuty.f1,income:theoreticalBudget.conditionalBudget.inflow['曲速线圈'],machines:state.machines.length}))()");
  assert.equal(imported.id,targetSchemeId);assert.equal(imported.rate,'1/128');assert.equal(imported.duty,1);assert.equal(imported.income,1/128);assert.equal(imported.machines,0);
  assert(await evaluate("!document.querySelector('[data-frozen-action=paste]')&&$('frozenSchemeImport').options[0].textContent==='选择其他方案'"));
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

  assert(await evaluate("Object.keys(frozenSnapshot(theoreticalBudget,state.name).rates).length===0"));
  const history=await evaluate("(()=>{for(let i=0;i<2600;i++)simulate(.05);const t=simTime,w=ware['曲速线圈'];document.querySelector('[data-frozen-id=f3] [data-frozen-action=rename]').click();const box=document.querySelector('[data-frozen-id=f3] [data-frozen-name]');box.value='手动来源';box.dispatchEvent(new Event('change',{bubbles:true}));return {t,after:simTime,stock:w,afterStock:ware['曲速线圈'],saved:JSON.parse(currentScheme().json).frozenFactories.length}})()");
  assert.equal(history.t,history.after);assert.equal(history.stock,1);assert.equal(history.afterStock,1);assert.equal(history.saved,3);
  const switching=await evaluate("(()=>{saveCurrentScheme();activateScheme("+JSON.stringify(source.id)+");const sourceCount=(state.frozenFactories||[]).length;activateScheme("+JSON.stringify(targetSchemeId)+");return {sourceCount,targetCount:state.frozenFactories.length,rate:state.frozenFactories[2].rates['硅晶圆']}})()");
  assert.equal(switching.sourceCount,0);assert.equal(switching.targetCount,3);assert.equal(switching.rate,'1');
  const collapse=await evaluate("(()=>{for(const key of ['frozen','theory','actual']){const b=document.querySelector('[data-ledger-toggle='+key+']');if(b.getAttribute('aria-expanded')==='true')b.click();}warehouseRefreshLive();return {closed:[...document.querySelectorAll('[data-ledger-toggle]')].every(b=>b.getAttribute('aria-expanded')==='false'),hidden:[...document.querySelectorAll('.ledger-card-body')].every(e=>e.hidden),frozen:!document.querySelector('.frozen-body')}})()");
  assert(collapse.closed&&collapse.hidden&&collapse.frozen,JSON.stringify(collapse));
  await send('Page.reload',{ignoreCache:true});await poll(async()=>await evaluate("document.readyState==='complete'&&typeof solverSchemesReady!=='undefined'&&solverSchemesReady"));
  const restored=await evaluate("(()=>({id:solverSchemeId,count:state.frozenFactories?.length,rate:state.frozenFactories?.[2]?.rates['合金板'],folded:[...document.querySelectorAll('[data-ledger-toggle]')].every(b=>b.getAttribute('aria-expanded')==='false')}))()");
  assert.equal(restored.id,targetSchemeId);assert.equal(restored.count,3);assert.equal(restored.rate,'-1/2');assert(restored.folded);
  assert.equal(exceptions.length,0,exceptions.join(' | '));
  console.log('PASS: matching card styles, default collapse, no clipboard controls, scheme import, manual editing, simulation preserved, scheme switching and reload');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child?.kill();server.close();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
