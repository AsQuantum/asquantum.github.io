'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file=path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-button-'));
const child=spawn(edge,['--headless=new','--window-size=1450,970','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,'file:///'+file],{stdio:'ignore',windowsHide:true});
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
  const machineTypes=await evaluate(`(()=>{
   const types=['采矿','垃圾','分流','汇流','仓入','仓出','组装'];
   const inspected=[];
   for(const type of types){
    const m={id:'right_'+type,type,mode:defaultModeFor(type),x:12,y:15,face:'E'};
    if(type==='仓出')m.item='太空垃圾';
    state={name:'机器属性检查',machines:[m],routes:[]};theoreticalBudget=null;
    resetSimulation();selection={machineId:m.id};inspectorRefresh();
    const root=$('inspector');
    const theory=[...root.querySelectorAll('.item')].find(el=>el.textContent.includes('稳态理论'));
    const live=root.querySelector('#inspectorLive');
    const props=root.querySelector('.machine-properties');
    const propsCount=Number(!!root.querySelector('#modeSelect'))+
     Number(!!root.querySelector('#itemSelect'))+Number(!!root.querySelector('#warehouseInFilterSelect'))+
     root.querySelectorAll('[data-out-filter]').length;
    const expectedCount=(recipeModes(type).length>1?1:0)+
     (type==='仓出'?1:0)+(type==='仓入'?1:0)+(type==='分流'?3:0);
    inspected.push({type,propsCount,expectedCount,correctProperties:(propsCount===expectedCount)&&
     (!!props===(expectedCount>0)),allOnRight:!document.querySelector('.machine-library #itemSelect')&&
      !document.querySelector('.machine-library #warehouseInFilterSelect'),
     noLegacyInputs:!root.querySelector('[data-filter]')&&!root.querySelector('.machine-connections')&&
      !root.querySelector('.machine-edit')&&!root.textContent.includes('接口设置')&&
      !root.textContent.includes('调整机器'),
     leftNotSelected:$('stampControls').style.display==='none',
     noDuplicateActions:!root.querySelector('#duplicate,#deleteM,.machine-actions'),
     leftSelectionActions:!!document.querySelector('#groupMove')&&
       !!document.querySelector('#groupDuplicate')&&!!document.querySelector('#groupDelete'),
     analysisOrder:!!theory&&!!live&&
       !!(theory.compareDocumentPosition(live)&Node.DOCUMENT_POSITION_FOLLOWING),
     fit:root.scrollWidth<=root.clientWidth+1});
   }
   return inspected;
  })()`);
  console.log('RIGHT MACHINE PROPERTIES',JSON.stringify(machineTypes));
  assert(machineTypes.every(t=>t.correctProperties&&t.allOnRight&&t.noLegacyInputs&&
    t.leftNotSelected&&t.noDuplicateActions&&t.leftSelectionActions&&t.analysisOrder&&t.fit),'all machine types need correct compact right-side properties');

  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:840,deviceScaleFactor:1,mobile:false});
  const narrow=await evaluate(`(()=>{
   const m={id:'compact',type:'分流',x:15,y:13,face:'W',outFilters:{0:'太空垃圾'}};
   state={name:'窄屏',machines:[m],routes:[]};theoreticalBudget=null;
   resetSimulation();selection={machineId:m.id};inspectorRefresh();
   const root=$('inspector'),aside=document.querySelector('.side.right');
   const selects=[...root.querySelectorAll('select')];
   return {sidebar:aside.getBoundingClientRect().width,fit:root.scrollWidth<=root.clientWidth+1,
    filterCount:selects.length,selectorsFit:selects.every(el=>
      el.getBoundingClientRect().right<=root.getBoundingClientRect().right+1)};
  })()`);
  console.log('NARROW MACHINE PROPERTIES',JSON.stringify(narrow));
  assert(narrow.sidebar<=250&&narrow.fit&&narrow.filterCount===3&&narrow.selectorsFit);
  await send('Emulation.clearDeviceMetricsOverride');

  const interactions=await evaluate(`(()=>{
   const machine={id:'mining',type:'采矿',mode:0,x:13,y:13,face:'E'};
   state={name:'产物测试',machines:[machine],routes:[]};theoreticalBudget=null;
   resetSimulation();selection={machineId:machine.id};inspectorRefresh();
   const recipeSelector=$('inspector').querySelector('#modeSelect');
   recipeSelector.value='1';recipeSelector.dispatchEvent(new Event('change',{bubbles:true}));
   const recipeChanged=machine.mode===1&&getRecipe(machine)?.output==='钛合金锭';

   const splitter={id:'splitter',type:'分流',x:14,y:13,face:'E',outFilters:{}};
   state={name:'分流测试',machines:[splitter],routes:[]};theoreticalBudget=null;
   resetSimulation();selection={machineId:splitter.id};inspectorRefresh();
   const splitSelects=[...$('inspector').querySelectorAll('[data-out-filter]')];
   const splitterNames=splitSelects.map(select=>select.parentElement.querySelector('span')?.textContent);
   splitSelects[0].value='相位粒子';
   splitSelects[0].dispatchEvent(new Event('change',{bubbles:true}));
   const splitSaved=splitter.outFilters[0]==='相位粒子'&&
    getPorts(splitter).find(p=>p.kind==='out'&&p.index===0).filter==='相位粒子';

   const warehouseOut={id:'withdraw',type:'仓出',x:14,y:13,face:'E',item:'太空垃圾'};
   state={name:'仓出测试',machines:[warehouseOut],routes:[]};theoreticalBudget=null;
   resetSimulation();selection={machineId:warehouseOut.id};inspectorRefresh();
   const outSelect=$('inspector').querySelector('#itemSelect');
   outSelect.value='钛合金锭';outSelect.dispatchEvent(new Event('change',{bubbles:true}));
   const withdrawSaved=warehouseOut.item==='钛合金锭';

   const warehouseIn={id:'deposit',type:'仓入',x:14,y:13,face:'E',inletItem:''};
   state={name:'仓入测试',machines:[warehouseIn],routes:[]};theoreticalBudget=null;
   resetSimulation();selection={machineId:warehouseIn.id};inspectorRefresh();
   const inSelect=$('inspector').querySelector('#warehouseInFilterSelect');
   inSelect.value='星尘粒子';inSelect.dispatchEvent(new Event('change',{bubbles:true}));
   const depositSaved=warehouseIn.inletItem==='星尘粒子'&&
    !acceptsMaterial(warehouseIn,'钛合金锭',0)&&acceptsMaterial(warehouseIn,'星尘粒子',0);
   return {recipeChanged,splitSaved,withdrawSaved,depositSaved,splitterNames};
  })()`);
  console.log('RIGHT PROPERTIES EDITING',JSON.stringify(interactions));
  assert(interactions.recipeChanged&&interactions.splitSaved&&interactions.withdrawSaved&&interactions.depositSaved&&
   interactions.splitterNames.length===3,'right-hand machine properties must remain fully editable');

  const materialFlow=await evaluate(`(()=>{
   const m={id:'flow',type:'冶炼',mode:defaultModeFor('冶炼'),x:12,y:12,face:'E',
    filters:{0:'错误的旧过滤材料'}};
   state={name:'按配方自动',machines:[m],routes:[]};
   resetSimulation();
   const recipe=getRecipe(m),needed=Object.keys(recipe.inputs)[0],
    unwanted='不存在的材料',limit=recipe.inputs[needed]*3;
   const port=getPorts(m).find(p=>p.kind==='in');
   const matches=port.filter===''&&acceptsMaterial(m,needed,port.index)&&
    !acceptsMaterial(m,unwanted,port.index);
   let received=0;
   for(let n=0;n<limit;n++){simTime=n*1.05+1;if(acceptItem(m,port.index,needed))received++;}
   simTime=limit*1.05+1;
   const fullBlocked=!acceptItem(m,port.index,needed);
   const otherBlocked=!acceptItem(m,port.index,unwanted);
   return {matches,needed,limit,received,fullBlocked,otherBlocked};
  })()`);
  console.log('AUTOMATIC RECIPE INPUT',JSON.stringify(materialFlow));
  assert(materialFlow.matches&&materialFlow.received===materialFlow.limit&&
    materialFlow.fullBlocked&&materialFlow.otherBlocked,
    'machine must ignore old input filters, accept recipe materials only and stop when full');

  const left=await evaluate(`(()=>{
   $('search').value='小行星矿石';buildPalette();
   const matching=[...$('palette').querySelectorAll('[data-stamp]')];
   const searched=matching.some(btn=>btn.dataset.stamp==='采矿');
   $('search').value='';buildPalette();
   $('palette').querySelector('[data-stamp="采矿"]').click();
   const opened=stampType==='采矿'&&$('stampControls').style.display==='block'&&
    $('stampModeRow').style.display==='flex';
   const selectedMode=$('stampMode');selectedMode.value='1';
   selectedMode.dispatchEvent(new Event('change',{bubbles:true}));
   const modeChanged=stampMode===1;
   const faceBefore=stampFace;$('stampRight').click();
   const rotated=stampFace!==faceBefore;
   $('stampCancel').click();
   const closed=!stampType&&$('stampControls').style.display==='none';
   return {searched,opened,modeChanged,rotated,closed,
    leftNoWarehouseFilters:!document.querySelector('#selectedInFilterRow,#selectedOutFilterRow')};
  })()`);
  console.log('LEFT PLACEMENT LIBRARY',JSON.stringify(left));
  assert(Object.values(left).every(Boolean),'left palette should only select/prepare machines for placement');

  assert.equal(exceptions.length,0,'uncaught Edge exceptions: '+exceptions.join(' | '));
  console.log('PASS: right attributes, auto-recipe inputs, and compact left machine library');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
