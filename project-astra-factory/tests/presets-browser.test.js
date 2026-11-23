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
  const initial=await evaluate(`({
   list:solverSchemes.map(t=>({id:t.id,name:t.name,format:t.ast?'ast':'json'})),
   active:solverSchemeId,selected:document.querySelector('#presetList [data-choose-scheme][aria-checked="true"]')?.dataset.chooseScheme,
   machines:state.machines.length,routes:state.routes.length,
   nameField:document.getElementById('presetName').value,
   hasNew:!!document.querySelector('#presetList [data-create-scheme]'),
   noLargeDelete:!document.getElementById('presetDelete'),
   rowDeleteCount:document.querySelectorAll('#presetList [data-remove-scheme]').length
  })`);
  console.log('SCHEMES START',JSON.stringify(initial));
  assert.equal(initial.list.length,1);
  assert(initial.list[0].name.includes('曲速线圈')&&initial.hasNew&&
   initial.machines===72&&initial.routes===49&&initial.active===initial.selected&&
   initial.noLargeDelete&&initial.rowDeleteCount===1);

  const comboboxBehavior=await evaluate(`(()=>{
   const input=document.getElementById('presetName'),arrow=document.getElementById('preset');
   const wrapper=document.querySelector('.preset-combo'),panel=document.getElementById('presetList');
   const inputRect=input.getBoundingClientRect(),arrowRect=arrow.getBoundingClientRect(),
    wrapperRect=wrapper.getBoundingClientRect();
   const oneControl=inputRect.right===arrowRect.left&&
    Math.abs(wrapperRect.left-inputRect.left)<3&&Math.abs(wrapperRect.right-arrowRect.right)<3;
   const editable=input.tagName==='INPUT'&&input.type==='text'&&input.getAttribute('role')==='combobox';
   const arrowOnly=!arrow.textContent.includes('方案');
   input.focus();
   const focusOpened=!panel.hidden&&input.getAttribute('aria-expanded')==='true';
   input.value='尚未保存的输入';
   input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
   const escapeRestored=panel.hidden&&input.value===currentScheme().name;
   input.click();
   const clickedOpened=!panel.hidden;
   arrow.click();
   const arrowClosed=panel.hidden;
   arrow.click();
   const arrowOpened=!panel.hidden;
   document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
   const outsideClosed=panel.hidden;
   return {oneControl,editable,arrowOnly,focusOpened,escapeRestored,clickedOpened,
    arrowClosed,arrowOpened,outsideClosed};
  })()`);
  assert(Object.values(comboboxBehavior).every(Boolean),
   'editable combined input/caret behavior failed: '+JSON.stringify(comboboxBehavior));
  console.log('PASS: one editable input, focus/click expands history, arrow toggles, Esc discards, outside closes');

  const menuBehavior=await evaluate(`(()=>{
   const trigger=document.getElementById('preset'),panel=document.getElementById('presetList');
   trigger.click();
   const opened=!panel.hidden&&trigger.getAttribute('aria-expanded')==='true';
   window.confirm=()=>false;
   panel.querySelector('[data-remove-scheme]').click();
   const cancelKeptScheme=solverSchemes.length===1&&solverSchemeId==='builtin-warp';
   panel.querySelector('[data-choose-scheme]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   const escapeClosed=panel.hidden&&trigger.getAttribute('aria-expanded')==='false';
   trigger.click();
   document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
   const outsideClosed=panel.hidden&&trigger.getAttribute('aria-expanded')==='false';
   return {opened,cancelKeptScheme,escapeClosed,outsideClosed};
  })()`);
  assert(Object.values(menuBehavior).every(Boolean),'dropdown open/close or delete cancel regression: '+JSON.stringify(menuBehavior));
  console.log('PASS: dropdown closes on Escape/outside click; canceled row deletion leaves scheme intact');

  const schemeScrollbar=await evaluate(`(()=>{
    const panel=document.getElementById('presetList'),wasHidden=panel.hidden;
    const filler=document.createElement('div');filler.style.height='900px';panel.appendChild(filler);
    panel.hidden=false;
    const style=getComputedStyle(panel);
    const thumb=getComputedStyle(panel,'::-webkit-scrollbar-thumb');
    const track=getComputedStyle(panel,'::-webkit-scrollbar-track');
    const result={overflow:style.overflowY,scrollable:panel.scrollHeight>panel.clientHeight,
     width:style.scrollbarWidth,color:style.scrollbarColor,
     thumb:thumb.backgroundColor,track:track.backgroundColor};
    filler.remove();panel.hidden=wasHidden;
    return result;
   })()`);
  assert(schemeScrollbar.overflow==='auto'&&schemeScrollbar.scrollable&&
   schemeScrollbar.width==='thin'&&schemeScrollbar.color.includes('100, 139, 161')&&
   schemeScrollbar.color.includes('17, 38, 56')&&
   schemeScrollbar.thumb==='rgb(100, 139, 161)'&&
   schemeScrollbar.track==='rgb(17, 38, 56)',
   'scheme dropdown scrollbar must retain its dark track and blue-grey thumb: '+JSON.stringify(schemeScrollbar));
  console.log('PASS: scheme dropdown overflow uses thin dark scrollbar with blue-grey thumb and dark track');

  const created=await evaluate(`(()=>{
   document.getElementById('preset').click();
   const expanded=document.getElementById('preset').getAttribute('aria-expanded')==='true';
   document.querySelector('#presetList [data-create-scheme]').click();
   return {active:solverSchemeId,count:solverSchemes.length,machines:state.machines.length,
    routes:state.routes.length,name:document.getElementById('presetName').value,expanded};
  })()`);
  console.log('NEW SCHEME',JSON.stringify(created));
  assert(created.active!==initial.active&&created.count===2&&created.machines===0&&created.routes===0&&created.expanded);

  const renamed=await evaluate(`(()=>{
   const input=document.getElementById('presetName');
   input.value='实验方案';
   input.dispatchEvent(new Event('change',{bubbles:true}));
   return {stored:JSON.parse(localStorage.getItem(SCHEME_STORE)).find(t=>t.id===solverSchemeId)?.name,
    option:document.querySelector('#presetList [data-choose-scheme][aria-checked="true"] .preset-row-name').textContent,
    layoutName:state.name};
  })()`);
  assert.equal(renamed.stored,'实验方案');
  assert.equal(renamed.option,'实验方案');
  assert.equal(renamed.layoutName,'实验方案');

  const enterRename=await evaluate(`(()=>{
   const input=document.getElementById('presetName');
   input.focus();input.value='回车保存的名称';
   input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
   const result={stored:currentScheme().name,closed:document.getElementById('presetList').hidden};
   input.value='实验方案';
   input.dispatchEvent(new Event('change',{bubbles:true}));
   return {...result,restored:currentScheme().name};
  })()`);
  assert(enterRename.stored==='回车保存的名称'&&enterRename.closed&&enterRename.restored==='实验方案',
    'Enter must commit rename and close the same combo popup');
  console.log('PASS: editing the single scheme input and pressing Enter renames its template');

  const afterEdit=await evaluate(`(()=>{
   state.machines.push({id:'created01',type:'垃圾',mode:1,x:8,y:12,face:'E',tag:'保留机器注释'});
   afterChange('新增测试机器');
   const t=currentScheme();
   const obj=decodeScheme(t);
   return {count:obj.machines.length,tag:obj.machines[0][5]?.tag||obj.machines[0]?.tag,
    mode:obj.machines[0][4]??obj.machines[0]?.mode,
    format:t.ast?'ast':'json'};
  })()`);
  assert(afterEdit.count===1&&afterEdit.tag==='保留机器注释'&&afterEdit.mode===1,
   'editing machines must autosave the active scheme: '+JSON.stringify(afterEdit));

  const switched=await evaluate(`(()=>{
   document.getElementById('preset').click();
   document.querySelector('#presetList [data-choose-scheme="builtin-warp"]').click();
   const openedBuiltin={name:document.getElementById('presetName').value,
    machines:state.machines.length,routes:state.routes.length};
   document.getElementById('preset').click();
   const experimentId=solverSchemes.find(t=>t.name==='实验方案').id;
   [...document.querySelectorAll('#presetList [data-choose-scheme]')]
    .find(button=>button.dataset.chooseScheme===experimentId).click();
   return {builtin:openedBuiltin,active:solverSchemeId,name:state.name,
    machines:state.machines.length,tag:state.machines[0]?.tag,mode:state.machines[0]?.mode};
  })()`);
  console.log('SWITCH BACK',JSON.stringify(switched));
  assert.equal(switched.builtin.machines,72);
  assert.equal(switched.builtin.routes,49);
  assert.equal(switched.machines,1);
  assert.equal(switched.mode,1);
  assert.equal(switched.tag,'保留机器注释');
  assert.equal(switched.name,'实验方案');

  const astStorage=await evaluate(`(()=>{
   state={name:'实验方案',machines:[{id:'ast_source',type:'垃圾',mode:0,x:14,y:18,face:'E'}],routes:[]};
   const firstAst=ast1Encode();
   loadState(ast1Decode(firstAst));
   const t=currentScheme();
   const stored=t.ast||'';
   let diagnostic;
   try{
    const code=ast1Encode(),decoded=ast1Decode(code);
    diagnostic={codeLength:code.length,jsonLength:compactFactoryJSON().length,
     faithful:schemeCanUseAST(state,decoded)};
   }catch(e){diagnostic={error:String(e)};}
   return {hasAst:stored.startsWith('AST1:'),byteExact:stored===firstAst,
    machines:state.machines.length,format:t.ast?'ast':'json',strlen:stored.length,diagnostic};
  })()`);
  console.log('AST STORAGE',JSON.stringify(astStorage));
  assert(astStorage.hasAst&&astStorage.byteExact,'AST1-roundtrippable scheme should use compact AST string');

  const withCustom=await evaluate(`(()=>{
   state.machines[0].tag='自定义注释不能丢失';
   afterChange('修改 AST1 无法表示的注释');
   const t=currentScheme();
   return {usesJSON:!!t.json,usesAST:!!t.ast,tag:decodeScheme(t).machines[0][5]?.tag};
  })()`);
  assert(withCustom.usesJSON&&!withCustom.usesAST&&withCustom.tag==='自定义注释不能丢失',
   'custom fields must trigger lossless JSON fallback');

  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,550));
  const afterReload=await evaluate(`({
   count:solverSchemes.length,activeName:currentScheme()?.name,selected:document.querySelector('#presetList [data-choose-scheme][aria-checked="true"]')?.dataset.chooseScheme,
   input:document.getElementById('presetName').value,mode:state.machines[0]?.mode,
   tag:state.machines[0]?.tag
  })`);
  assert(afterReload.count===2&&afterReload.activeName==='实验方案'&&
   afterReload.input==='实验方案'&&afterReload.mode===0&&
   afterReload.tag==='自定义注释不能丢失');
  console.log('PASS: switch, rename, autosave, AST1 compact storage, JSON fallback and reload');

  const deleted=await evaluate(`(()=>{
   window.confirm=()=>true;
   document.getElementById('preset').click();
   const activeBefore=solverSchemeId;
   // Delete a non-active row without selecting or overwriting the current map.
   document.querySelector('#presetList [data-remove-scheme="builtin-warp"]').click();
   return {remaining:solverSchemes.map(t=>t.name),active:currentScheme()?.name,
    stayedActive:activeBefore===solverSchemeId,
    rowCount:document.querySelectorAll('#presetList [data-remove-scheme]').length,
    menuExpanded:document.getElementById('preset').getAttribute('aria-expanded')==='true',
    machines:state.machines.length,stored:JSON.parse(localStorage.getItem(SCHEME_STORE)).length};
  })()`);
  console.log('DELETE DEFAULT',JSON.stringify(deleted));
  assert.deepEqual(deleted.remaining,['实验方案']);
  assert.equal(deleted.active,'实验方案');
  assert(deleted.stayedActive&&deleted.rowCount===1&&deleted.menuExpanded&&deleted.machines===1,
   'Deleting another scheme via its row X must leave the current map unchanged');
  assert.equal(deleted.stored,1);
  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,500));
  const afterDeleteReload=await evaluate(`({
   count:solverSchemes.length,names:solverSchemes.map(t=>t.name),
   activeName:currentScheme()?.name,tag:state.machines[0]?.tag
  })`);
  assert.deepEqual(afterDeleteReload.names,['实验方案'],'deleted builtin must not regenerate on reload');
  assert.equal(afterDeleteReload.tag,'自定义注释不能丢失');

  const deleteLast=await evaluate(`(()=>{
   window.confirm=()=>true;
   document.querySelector('#presetList [data-remove-scheme]').click();
   return {names:solverSchemes.map(t=>t.name),active:currentScheme()?.name,
    machines:state.machines.length,stored:JSON.parse(localStorage.getItem(SCHEME_STORE)).length};
  })()`);
  assert(deleteLast.names.length===1&&deleteLast.names[0].startsWith('新方案')&&
    deleteLast.machines===0&&deleteLast.stored===1,
    'delete last scheme must leave a new usable blank template');
  // New multi-template version must not discard an existing user layout.
  const oldWorkspaceSeed=`localStorage.removeItem('factory_lab_templates_v1');
    localStorage.removeItem('factory_lab_template_active_v1');
    localStorage.setItem('factory_lab_v12',JSON.stringify({
     format:'factory-lab',version:12,name:'我的旧布局',
     machines:[[0,3,4,0,1,{tag:'重要的旧机器'}]],routes:[]
    }));`;
  const oldInjector=await send('Page.addScriptToEvaluateOnNewDocument',{source:oldWorkspaceSeed});
  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,500));
  if(oldInjector.result?.identifier)
   await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:oldInjector.result.identifier});
  const priorWorkspace=await evaluate(`({
   schemes:solverSchemes.map(t=>t.name),current:currentScheme()?.name,
   machineType:state.machines[0]?.type,mode:state.machines[0]?.mode,
   tag:state.machines[0]?.tag,selected:document.getElementById('preset').value
  })`);
  assert(priorWorkspace.schemes.length===2&&priorWorkspace.schemes[0].includes('49条线路'),
   'default 49-route blueprint must coexist with existing user work');
  assert(priorWorkspace.current==='我的旧布局'&&priorWorkspace.machineType==='垃圾'&&
   priorWorkspace.mode===1&&priorWorkspace.tag==='重要的旧机器');
  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,480));
  const recoveredWork=await evaluate(`({
   count:solverSchemes.length,current:currentScheme()?.name,
   tag:state.machines[0]?.tag
  })`);
  assert(recoveredWork.count===2&&recoveredWork.current==='我的旧布局'&&
   recoveredWork.tag==='重要的旧机器','old user workspace must persist across subsequent restarts');
  console.log('PASS: first-use default template never overwrites pre-existing factory workspace');
  assert.equal(exceptions.length,0,'uncaught browser exceptions: '+exceptions.join(' | '));
  console.log('PASS: delete any scheme including built-in, do not resurrect deleted templates, keep one blank on last deletion');

  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
