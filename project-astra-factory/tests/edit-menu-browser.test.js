'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file=path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-button-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--window-size=1480,920','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,'file:///'+file],{stdio:'ignore',windowsHide:true});
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
  const brandAndLedger=await evaluate(`(()=>{
   const brand=document.querySelector('.brand');
   const icon=document.querySelector('head link[rel="icon"]');
   const img=brand?.querySelector('img.brand-mark');
   const before=$('warehousePanel').open;
   $('warehousePanel').open=true;
   warehouseRefresh();
   const head=$('warehouse').querySelector('.ledger-panel .ledger-head');
   const result={
    pageTitle:document.title,
    brandText:brand?.textContent.trim().replace(/\\s+/g,' '),
    favicon:icon?.getAttribute('href'),faviconType:icon?.type,
    sameIcon:img?.getAttribute('src')===icon?.getAttribute('href'),
    iconLoaded:img?.complete&&img?.naturalWidth>0,
    theoreticalTitle:head?.querySelector('strong')?.textContent,
    unit:head?.querySelector('.ledger-chip')?.textContent
   };
   $('warehousePanel').open=before;
   return result;
  })()`);
  assert.equal(brandAndLedger.pageTitle,'Factory Lab · Project:Astra');
  assert.equal(brandAndLedger.brandText,'Factory Lab V0.35');
  assert.equal(brandAndLedger.favicon,'favicon.svg');
  assert.equal(brandAndLedger.faviconType,'image/svg+xml');
  assert(brandAndLedger.sameIcon&&brandAndLedger.iconLoaded,'header icon and favicon should use the same transparent SVG');
  assert.equal(brandAndLedger.theoreticalTitle,'理论收支');
  assert.equal(brandAndLedger.unit,'件/分钟');
  console.log('PASS: V0.35 header, transparent SVG hexagon favicon, shorter warehouse headings');

  const ui=await evaluate(`(()=>{
   const menu=$('editMenu');
   const actions=[...menu.querySelectorAll('[data-edit-action]')].map(b=>b.dataset.editAction);
   const help=document.querySelector('.editor-help-disclosure');
   const tools=[...document.querySelectorAll('.editor-tool-grid [data-tool]')].map(b=>b.dataset.tool);
   const left=document.querySelector('.side.left');
   const oldIds=['saveJson','loadJson','importAst1','exportAst1'].map(id=>!!$(id));
   $('editMenuButton').click();
   const opened=!menu.hidden&&$('editMenuButton').getAttribute('aria-expanded')==='true';
   menu.querySelector('[data-edit-submenu="import"]').click();
   const first=menu.querySelector('[data-edit-action="import-json"]');
   const submenu=first.closest('.edit-submenu'),panel=menu.getBoundingClientRect(),sub=submenu.getBoundingClientRect();
   const flyout=getComputedStyle(submenu).display!=='none'&&
    (sub.left>=panel.right-8||sub.right<=panel.left+8);
   $('editMenuButton').click();
   const closed=menu.hidden;
   return {actions,tools,oldIds,opened,flyout,closed,viewport:{w:innerWidth,menuLeft:panel.left,menuRight:panel.right,subLeft:sub.left,subRight:sub.right},
    helpDefaultClosed:!help.open,erase:!!left.querySelector('[data-tool="erase"]'),
    fit:!!left.querySelector('#fit'),clear:!!left.querySelector('#clearRoutes')};
  })()`);
  console.log('EDIT MENU AND TOOLS',JSON.stringify(ui));
  assert.deepEqual(ui.actions,['undo','redo','import-json','import-ast','overwrite-json','overwrite-ast','export-json','export-ast']);
  assert.deepEqual(ui.tools,['select','belt','marquee','pan']);
  assert(!ui.oldIds.some(Boolean)&&ui.opened&&ui.flyout&&ui.closed&&ui.helpDefaultClosed&&
    ui.erase&&ui.fit&&ui.clear,'Photoshop-style Edit flyout and tidy left tools');

  const editInteractions=await evaluate(`(()=>{
   const trigger=$('editMenuButton'),menu=$('editMenu');
   trigger.click();
   trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
   const escapeClosed=menu.hidden;
   trigger.focus();
   trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
   const keyboardOpened=!menu.hidden&&document.activeElement?.hasAttribute('data-edit-submenu');
   const parent=document.activeElement;
   parent.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
   const rightOpened=document.activeElement?.dataset.editAction==='import-json';
   document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
   const outsideClosed=menu.hidden;
   const help=document.querySelector('.editor-help-disclosure');
   const detailsDefault=!help.open;
   help.querySelector('summary').click();
   const helpOpens=help.open;
   help.querySelector('summary').click();
   const helpCloses=!help.open;
   document.querySelector('[data-tool="belt"]').click();
   const beltActive=tool==='belt'&&document.querySelector('[data-tool="belt"]').classList.contains('active');
   document.querySelector('[data-tool="select"]').click();
   const selectRestored=tool==='select';
   return {escapeClosed,keyboardOpened,rightOpened,outsideClosed,detailsDefault,helpOpens,helpCloses,beltActive,selectRestored};
  })()`);
  assert(Object.values(editInteractions).every(Boolean),
   'Edit keyboard navigation or left-tool actions regression: '+JSON.stringify(editInteractions));
  console.log('PASS: menu Escape/arrow-key navigation, outside dismissal, left tool activation and collapsible help');

  const shortcutAndToolbar=await evaluate(`(()=>{
   const rows=[...document.querySelectorAll('.editor-shortcut-row')];
   const allAligned=rows.every(row=>row.querySelector(':scope > .shortcut-keys')&&
    row.querySelector(':scope > .shortcut-desc')&&
    row.querySelector('.shortcut-keys kbd'));
   const names=rows.map(row=>row.textContent.replaceAll(' ',''));
   const need=['Ctrl+Z撤销','Ctrl+Y重做','Ctrl+Shift+Z重做','鼠标中键按住拖动',
    '空格+左键拖动平移画布','滚轮以光标','Ctrl+C复制','Ctrl+V粘贴','Ctrl+D复制',
    'Esc/右键取消全部编辑操作','Backspace删除'];
   const allCommands=need.every(n=>names.some(label=>label.includes(n)));
   const sim=$('run').closest('.sim-toolbar');
   const speed60=[...$('simSpeed').options].some(o=>o.value==='60');
   $('simSpeed').value='60';$('simSpeed').dispatchEvent(new Event('change',{bubbles:true}));
   const speedWorking=simulationSpeed===60;
   $('simSpeed').value='1';$('simSpeed').dispatchEvent(new Event('change',{bubbles:true}));
   const speedRestored=simulationSpeed===1;
   const projectTitle=document.title==='Factory Lab · Project:Astra';
   const duplicateHintGone=!document.querySelector('.editor-quicktip');
   const alternatives=rows.filter(row=>row.querySelector('.key-or')).length===1;
   const grouped=!!sim&&['run','simSpeed','stepMinute','resetSim'].every(id=>sim.contains($(id)))&&
    sim.getAttribute('role')==='group';
   const undoInMenu=$('editMenu').contains($('undo'))&&$('editMenu').contains($('redo'))&&
    !$('undo').closest('.sim-toolbar');
   const caretPositions=['preset','editMenuButton'].map(id=>{
    const button=$(id),caret=button.querySelector('.preset-caret,.edit-caret');
    const a=button.getBoundingClientRect(),b=caret.getBoundingClientRect();
    return {id,errorY:Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2),
      cssBorder:getComputedStyle(caret).borderBottomStyle};
   });
   return {count:rows.length,allAligned,allCommands,missingCommands:need.filter(n=>!names.some(label=>label.includes(n))),
    speed60,speedWorking,speedRestored,projectTitle,duplicateHintGone,alternatives,grouped,undoInMenu,caretPositions};
  })()`);
  console.log('SHORTCUTS AND SIM TOOLBAR',JSON.stringify(shortcutAndToolbar));
  assert(shortcutAndToolbar.count>=19&&shortcutAndToolbar.allAligned&&shortcutAndToolbar.allCommands&&
    shortcutAndToolbar.speed60&&shortcutAndToolbar.speedWorking&&shortcutAndToolbar.speedRestored&&
    shortcutAndToolbar.projectTitle&&shortcutAndToolbar.duplicateHintGone&&shortcutAndToolbar.alternatives&&
    shortcutAndToolbar.grouped&&shortcutAndToolbar.undoInMenu&&
    shortcutAndToolbar.caretPositions.every(c=>c.errorY<4&&c.cssBorder==='solid'),
    'keycap guide, simulator toolbar, centered dropdown or Edit Undo/Redo layout invalid');

  const historyCommands=await evaluate(`(()=>{
   const before=state.machines.length;
   snapshot();
   state.machines.push({id:'history-check',type:'垃圾',mode:0,x:2,y:2,face:'E'});
   afterChange('测试历史操作');
   const changed=state.machines.length===before+1;
   $('editMenuButton').click();
   $('editMenu').querySelector('[data-edit-action="undo"]').click();
   const undoViaMenu=state.machines.length===before&&$('editMenu').hidden;
   $('editMenuButton').click();
   $('editMenu').querySelector('[data-edit-action="redo"]').click();
   const redoViaMenu=state.machines.length===before+1&&$('editMenu').hidden;
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
   const ctrlZWorks=state.machines.length===before;
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));
   const shiftZWorks=state.machines.length===before+1;
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true,cancelable:true}));
   const ctrlYWorks=state.machines.length===before+1;
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
   return {changed,undoViaMenu,redoViaMenu,ctrlZWorks,shiftZWorks,ctrlYWorks,restored:state.machines.length===before};
  })()`);
  console.log('UNDO REDO TEST',JSON.stringify(historyCommands));
  assert(Object.values(historyCommands).every(Boolean),
    'history actions or shortcuts were broken by moving Undo/Redo into Edit menu');

  const codes=await evaluate(`(()=>{
   const old=state;
   const factory={name:'源码',machines:[{id:'ast-source',type:'垃圾',mode:0,x:12,y:14,face:'E'}],routes:[]};
   state=factory;window.__ast0=ast1Encode();
   factory.machines[0].mode=1;window.__ast1=ast1Encode();
   state=old;
   return {code0:window.__ast0.slice(0,5),code1:window.__ast1.slice(0,5),len:window.__ast0.length};
  })()`);
  assert(codes.code0==='AST1:'&&codes.code1==='AST1:');
  const fromMenuAST=await evaluate(`(()=>{
   $('editMenuButton').click();
   $('editMenu').querySelector('[data-edit-submenu="import"]').click();
   $('editMenu').querySelector('[data-edit-action="import-ast"]').click();
   const opening={visible:$('ast1Panel').style.display==='block',mode:ast1ImportOverwrite,
    title:$('ast1PanelTitle').textContent,menuClosed:$('editMenu').hidden};
   $('ast1Text').value=window.__ast0;$('ast1Apply').click();
   return {...opening,schemes:solverSchemes.map(t=>t.name),active:currentScheme().name,
    importedMode:state.machines[0]?.mode,original:solverSchemes[0].name,
    feedback:$('importFeedbackText').textContent};
  })()`);
  console.log('AST1 ADD',JSON.stringify(fromMenuAST));
  assert(fromMenuAST.visible&&!fromMenuAST.mode&&fromMenuAST.menuClosed&&
    fromMenuAST.active==='游戏蓝图1'&&fromMenuAST.importedMode===0&&
    fromMenuAST.schemes.length===2&&fromMenuAST.original.includes('49条线路'));

  const secondAST=await evaluate(`(()=>{
   $('editMenuButton').click();
   $('editMenu').querySelector('[data-edit-action="import-ast"]').click();
   $('ast1Text').value=window.__ast0;$('ast1Apply').click();
   return {names:solverSchemes.map(t=>t.name),selected:currentScheme().name,
    activeMode:state.machines[0]?.mode};
  })()`);
  assert(secondAST.selected==='游戏蓝图2'&&secondAST.names.length===3&&secondAST.activeMode===0);

  const astOverwrite=await evaluate(`(()=>{
   $('editMenuButton').click();
   $('editMenu').querySelector('[data-edit-submenu="overwrite"]').click();
   $('editMenu').querySelector('[data-edit-action="overwrite-ast"]').click();
   $('ast1Text').value=window.__ast1;
   window.confirm=()=>false;
   $('ast1Apply').click();
   const canceled={mode:state.machines[0]?.mode,schemes:solverSchemes.length,active:currentScheme().name,
    shown:$('ast1Panel').style.display==='block'};
   window.confirm=()=>true;
   $('ast1Apply').click();
   const firstAST=solverSchemes.find(t=>t.name==='游戏蓝图1');
   const previous=firstAST.ast?ast1Decode(firstAST.ast):expandCompactFactoryLayout(JSON.parse(firstAST.json));
   return {canceled,now:state.machines[0]?.mode,active:currentScheme().name,
    schemes:solverSchemes.length,otherMode:previous.machines[0]?.mode,
    panelClosed:$('ast1Panel').style.display==='none'};
  })()`);
  console.log('AST1 OVERWRITE',JSON.stringify(astOverwrite));
  assert(astOverwrite.canceled.mode===0&&astOverwrite.canceled.schemes===3&&
    astOverwrite.canceled.active==='游戏蓝图2'&&astOverwrite.canceled.shown&&
    astOverwrite.now===1&&astOverwrite.active==='游戏蓝图2'&&
    astOverwrite.schemes===3&&astOverwrite.otherMode===0&&astOverwrite.panelClosed,
    'AST1 overwrite confirmation should replace only active template');

  // Exercise the actual async JSON <input type=file> change handler.
  const fileChange=async (filename,payload)=>{
   const data=JSON.stringify(payload);
   return await evaluate(`(async()=>{
    const file=new File([@payload],@filename,{type:'application/json'});
    const dt=new DataTransfer();dt.items.add(file);
    const input=$('file');input.files=dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,180));
    return {names:solverSchemes.map(t=>t.name),active:currentScheme()?.name,
     mode:state.machines[0]?.mode,count:solverSchemes.length,
     feedback:$('importFeedbackText').textContent};
   })()`.replace('@payload',JSON.stringify(data)).replace('@filename',JSON.stringify(filename)));
  };
  const jsonFactory=(name,mode=0)=>({
   ...(name===null?{}:{name}),
   machines:[{id:'json-m',type:'垃圾',mode,x:8,y:12,face:'E'}],routes:[]
  });
  const clickAction=async name=>await evaluate(`(()=>{
   $('editMenuButton').click();
   $('editMenu').querySelector('[data-edit-action="@name"]').click();
   return {menuClosed:$('editMenu').hidden,fileMode:$('file').dataset.importMode};
  })()`.replace('@name',name));

  const jsonMode=await clickAction('import-json');
  assert(jsonMode.menuClosed&&jsonMode.fileMode==='new');
  const jsonNamed=await fileChange('ignored.json',jsonFactory('方案来自内部',0));
  assert(jsonNamed.active==='方案来自内部'&&jsonNamed.count===4);
  await clickAction('import-json');
  const jsonFileNamed=await fileChange('我的文件.json',jsonFactory(null,0));
  assert(jsonFileNamed.active==='我的文件'&&jsonFileNamed.count===5,
   'no name in JSON must derive from filename');
  await clickAction('import-json');
  const longName=await fileChange('unused.json',jsonFactory('这是一份非常非常非常非常非常非常非常非常长的布局名称',0));
  assert(longName.active==='外部方案1'&&longName.count===6,
   'oversized JSON names must become sequential external scheme names');
  await clickAction('import-json');
  const duplicated=await fileChange('ignored.json',jsonFactory('方案来自内部',0));
  assert(duplicated.active==='方案来自内部 (2)'&&duplicated.count===7);
  console.log('PASS: JSON file import adds scheme, chooses embedded/file/fallback names and avoids collisions');

  const jsonOverwriteMode=await clickAction('overwrite-json');
  assert(jsonOverwriteMode.fileMode==='overwrite');
  await evaluate(`window.confirm=()=>false`);
  const jsonCanceled=await fileChange('overwrite.json',jsonFactory('其他人名字',1));
  assert(jsonCanceled.active==='方案来自内部 (2)'&&jsonCanceled.mode===0&&
    jsonCanceled.count===7,'canceled JSON overwrite must preserve selected scheme and original data');
  await clickAction('overwrite-json');
  await evaluate(`window.confirm=()=>true`);
  const jsonReplaced=await fileChange('overwrite.json',jsonFactory('其他人名字',1));
  assert(jsonReplaced.active==='方案来自内部 (2)'&&jsonReplaced.mode===1&&
   jsonReplaced.count===7,'approved JSON overwrite must keep active scheme name and count');
  console.log('PASS: JSON overwrite cancel and confirm preserve all other schemes');

  await clickAction('import-json');
  const jsonInvalid=await fileChange('invalid.json',{name:'不是机器地图',goal:'wrong'});
  assert(jsonInvalid.count===7&&jsonInvalid.mode===1,
   'invalid imported JSON must not create a template or change the current map');

  // Export is available through the third flyout and does not change any scheme.
  const exportedJSON=await evaluate(`(async()=>{
   window.__exportContent='';
   Object.defineProperty(window,'showSaveFilePicker',{configurable:true,value:async()=>({
    name:'test-export.json',
    createWritable:async()=>({
     write:async content=>{window.__exportContent=content;},
     close:async()=>{}
    })
   })});
   $('editMenuButton').click();$('editMenu').querySelector('[data-edit-submenu="export"]').click();
   $('editMenu').querySelector('[data-edit-action="export-json"]').click();
   await new Promise(resolve=>setTimeout(resolve,160));
   return {format:JSON.parse(window.__exportContent||'{}').format,count:solverSchemes.length,
    closed:$('editMenu').hidden};
  })()`);
  assert(exportedJSON.format==='factory-lab'&&exportedJSON.count===7&&exportedJSON.closed);
  const exportedAST=await evaluate(`(()=>{
   $('editMenuButton').click();
   $('editMenu').querySelector('[data-edit-action="export-ast"]').click();
   return {visible:$('ast1Panel').style.display==='block',
    code:$('ast1Text').value.slice(0,5),applyHidden:$('ast1Apply').style.display==='none',
    count:solverSchemes.length};
  })()`);
  assert(exportedAST.visible&&exportedAST.code==='AST1:'&&exportedAST.applyHidden&&exportedAST.count===7);
  await send('Page.reload',{ignoreCache:true});
  await new Promise(resolve=>setTimeout(resolve,450));
  const afterReload=await evaluate(`({
   count:solverSchemes.length,active:currentScheme()?.name,mode:state.machines[0]?.mode,
   original:solverSchemes[0]?.name,tools:document.querySelectorAll('.editor-tool-grid [data-tool]').length
  })`);
  assert(afterReload.count===7&&afterReload.active==='方案来自内部 (2)'&&
    afterReload.mode===1&&afterReload.original.includes('49条线路'));
  assert.equal(exceptions.length,0,'uncaught browser exceptions: '+exceptions.join(' | '));
  console.log('PASS: Edit menu three flyouts, new/overwrite JSON+AST1, export JSON+AST1, safe cancel and reload');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
