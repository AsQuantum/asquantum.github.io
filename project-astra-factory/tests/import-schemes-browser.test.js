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
  const inspect=()=>evaluate(`({
   active:currentScheme()?.name,activeId:solverSchemeId,
   names:solverSchemes.map(t=>t.name),count:solverSchemes.length,
   machines:state.machines.length,routes:state.routes.length,
   stored:JSON.parse(localStorage.getItem(SCHEME_STORE)).map(t=>({name:t.name,format:t.ast?'ast':'json'}))
  })`);
  const initial=await inspect();
  assert.equal(initial.count,1);
  assert(initial.names[0].includes('49条线路'));

  const prepared=await evaluate(`(()=>{
   state.machines[0].tag='原方案的重要配置';
   afterChange('保存原模板修改');
   const original=solverSchemeId;
   const oldSaved=JSON.parse(localStorage.getItem(SCHEME_STORE))[0];
   const oldCode=oldSaved.json||oldSaved.ast;
   const backupState=state;
   state={name:'生成 AST 输入',machines:[{id:'game-source',type:'垃圾',mode:1,x:15,y:16,face:'E'}],routes:[]};
   const ast=ast1Encode();
   state=backupState;
   window.__astTestCode=ast;
   return {original,oldCode,oldTag:state.machines[0].tag,ast};
  })()`);
  assert(prepared.ast.startsWith('AST1:'));

  const gameFirst=await evaluate(`(()=>{
   document.getElementById('importAst1').click();
   const hint=document.getElementById('ast1PanelHint').textContent;
   document.getElementById('ast1Text').value=' \n '+window.__astTestCode+' \t';
   document.getElementById('ast1Apply').click();
   const t=currentScheme();
   const original=solverSchemes.find(t=>t.id==='builtin-warp');
   return {name:t.name,count:solverSchemes.length,activeId:solverSchemeId,
    machines:state.machines.length,type:state.machines[0]?.type,mode:state.machines[0]?.mode,
    savedAsAST:t.ast===window.__astTestCode,originalPreserved:(original.json||original.ast)===
     window.__originalStoredCode,originalTag:original.json?.includes('原方案的重要配置'),
    panelHidden:document.getElementById('ast1Panel').style.display==='none',hint};
  })()`);
  console.log('AST FIRST',JSON.stringify(gameFirst));
  assert.equal(gameFirst.name,'游戏蓝图1');
  assert.equal(gameFirst.count,2);
  assert(gameFirst.savedAsAST&&gameFirst.originalTag&&gameFirst.panelHidden&&
   gameFirst.hint.includes('新增独立方案'),'AST1 import must add scheme and preserve old layout');
  assert(gameFirst.mode===1&&gameFirst.machines===1);
  await evaluate(`(()=>{
   document.getElementById('importAst1').click();
   document.getElementById('ast1Text').value=window.__astTestCode;
   document.getElementById('ast1Apply').click();
  })()`);
  const afterTwoGames=await inspect();
  assert.equal(afterTwoGames.count,3);
  assert.equal(afterTwoGames.active,'游戏蓝图2');
  assert.deepEqual(afterTwoGames.names.slice(-2),['游戏蓝图1','游戏蓝图2']);
  console.log('PASS: repeated AST1 imports get 游戏蓝图1/2, preserve earlier templates');

  const fileImport=async(filename,payload)=>{
   const raw=typeof payload==='string'?payload:JSON.stringify(payload);
   return await evaluate(`(async()=>{
    const list=new DataTransfer();
    list.items.add(new File([${JSON.stringify(raw)}],${JSON.stringify(filename)},{type:'application/json'}));
    const control=document.getElementById('file');
    control.files=list.files;
    control.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(done=>setTimeout(done,140));
    return {name:currentScheme()?.name,activeId:solverSchemeId,
     count:solverSchemes.length,machines:state.machines.length,routes:state.routes.length,
     feedback:document.getElementById('importFeedbackText').textContent};
   })()`);
  };
  const layout={version:11,machines:[{id:'data',type:'垃圾',mode:0,x:4,y:7,face:'E'}],routes:[]};
  const named=await fileImport('文件名应被忽略.json',{...layout,name:'JSON内部名称'});
  assert.equal(named.name,'JSON内部名称');
  const unnamed=await fileImport('通过文件命名.json',layout);
  assert.equal(unnamed.name,'通过文件命名');
  const wrapped=await fileImport('外部名字.json',{layout:{...layout,name:'嵌套内部名称'}});
  assert.equal(wrapped.name,'嵌套内部名称');
  const longName=await fileImport('即使文件名很短.json',
   {...layout,name:'这是一份非常非常非常非常非常非常非常非常超长的工厂生产方案'});
  assert.equal(longName.name,'外部方案1');
  const longFile=await fileImport('这是一份非常非常非常非常非常非常非常非常超长的工厂文件名称.json',layout);
  assert.equal(longFile.name,'外部方案2');
  const duplicate=await fileImport('重复导入.json',{...layout,name:'JSON内部名称'});
  assert.equal(duplicate.name,'JSON内部名称 (2)');
  console.log('JSON IMPORT NAMES',JSON.stringify({named,unnamed,wrapped,longName,longFile,duplicate}));
  assert(duplicate.count===9,'two game + six JSON imports + original default = nine schemes');
  assert(duplicate.feedback.includes('新增方案'));

  const currentBeforeBad=await inspect();
  const invalidSyntax=await fileImport('坏文件.json','{not-valid');
  const invalidLayout=await fileImport('坏布局.json',
   {name:'错误布局',machines:[{id:'bad',type:'不存在机器',x:2,y:2}],routes:[]});
  assert.equal(invalidSyntax.count,currentBeforeBad.count);
  assert.equal(invalidLayout.count,currentBeforeBad.count);
  assert.equal(invalidLayout.activeId,currentBeforeBad.activeId);
  assert(invalidSyntax.feedback.includes('无法导入')&&invalidLayout.feedback.includes('无法导入'));
  const astInvalid=await evaluate(`(()=>{
   document.getElementById('importAst1').click();
   document.getElementById('ast1Text').value='INVALID-AST';
   document.getElementById('ast1Apply').click();
   return {active:currentScheme()?.name,count:solverSchemes.length,
    feedback:document.getElementById('importFeedbackText').textContent,
    panelVisible:document.getElementById('ast1Panel').style.display!=='none'};
  })()`);
  assert.equal(astInvalid.count,currentBeforeBad.count);
  assert.equal(astInvalid.active,currentBeforeBad.active);
  assert(astInvalid.panelVisible&&astInvalid.feedback.includes('导入失败'));
  console.log('PASS: invalid AST1/JSON imports do not create schemes or replace current state');

  const preservedDefault=await evaluate(`(()=>{
   const current=solverSchemeId;
   document.getElementById('preset').click();
   document.querySelector('[data-choose-scheme="builtin-warp"]').click();
   const original={machineCount:state.machines.length,routeCount:state.routes.length,
    tag:state.machines[0]?.tag};
   document.getElementById('preset').click();
   document.querySelector('[data-choose-scheme="'+current+'"]').click();
   return {original,returned:current===solverSchemeId};
  })()`);
  assert.equal(preservedDefault.original.routeCount,49);
  assert.equal(preservedDefault.original.tag,'原方案的重要配置');
  assert(preservedDefault.returned,'switching back to imported scheme should work');

  await send('Page.reload',{ignoreCache:true});
  await new Promise(r=>setTimeout(r,530));
  const restored=await inspect();
  assert.equal(restored.count,9);
  assert.equal(restored.active,'JSON内部名称 (2)');
  assert(restored.names.includes('游戏蓝图1')&&restored.names.includes('游戏蓝图2')&&
   restored.names.includes('通过文件命名')&&restored.names.includes('外部方案2'));
  assert.equal(exceptions.length,0,'unexpected JS exception: '+exceptions.join(' | '));
  console.log('PASS: imported schemes survive reload, original 49-route layout and edits unchanged');

  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
