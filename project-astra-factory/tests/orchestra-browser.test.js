'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file=path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-orchestra-'));
let child;const http=require('http');const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/project-astra-factory\//,'');const full=path.resolve(__dirname,'..',p);const root=path.resolve(__dirname,'..');if(!full.startsWith(root+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',full.endsWith('.js')?'application/javascript':full.endsWith('.css')?'text/css':full.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(fs.readFileSync(full));});
async function poll(f){for(let i=0;i<75;i++){try{const v=await f();if(v)return v;}catch(e){}await new Promise(r=>setTimeout(r,200));}throw new Error('Edge CDP timeout');}
(async()=>{
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--mute-audio','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,(process.argv.includes('--file')?'file:///'+file:'http://127.0.0.1:'+server.address().port+'/project-astra-factory/index.html')],{stdio:'ignore',windowsHide:true});
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
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method))},12000);pending.set(id,v=>{clearTimeout(timer);resolve(v)});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expr=>{const ret=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return ret.result?.result?.value??ret.result?.exceptionDetails?.text??ret.error??ret;};
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.reload',{ignoreCache:true});
  await poll(async()=>await evaluate('document.readyState==="complete"'));
  await new Promise(r=>setTimeout(r,350));




  const mobile=process.argv.includes('--mobile');
  if(!mobile){await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await poll(()=>evaluate('innerWidth===1440'))}
  if(mobile){await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await send('Page.reload',{ignoreCache:true});await poll(()=>evaluate('document.readyState==="complete"'))}
  const setup=await evaluate(`(()=>{const a={id:'M0',type:'垃圾',mode:0,x:2,y:6,face:'E'},b={id:'M1',type:'仓入',x:20,y:6,face:'E'};const src=outPort(a,0),dst=inPort(b,0);b.y+=src.ey-dst.ey;const p=outPort(a,0),q=inPort(b,0);const r={id:'R0',from:{id:a.id,port:0},to:{id:b.id,port:0},path:Array.from({length:q.x-p.x-1},(_,i)=>[p.x+i+1,p.y])};state={name:'orchestra test',machines:[a,b,{id:'M2',type:'分流',x:4,y:20,face:'E'},{id:'M3',type:'分流',x:12,y:20,face:'E'}],routes:[r],frozenFactories:[]};selection=null;draft=null;resetSimulation();setTool('select');simulateBatchSteps(240,.05);ware.test=19;running=false;const snapshot=JSON.stringify({state,ware,sim,simTime,simulationSpeed});const bounds=canvas.getBoundingClientRect();camera={x:bounds.width/2-36*4,y:bounds.height/2-36*4,z:4};draw();return {snapshot,point:{x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2},connected:beltConnected(r),geometry:!!beltPathGeometry(r)}})()`);
  console.log('ORCHESTRA_SETUP',JSON.stringify({...setup,snapshot:undefined}));
  assert(setup.connected&&setup.geometry);
  const tap=async p=>{if(mobile){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x,y:p.y}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}else{await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1})}};

  const sidebarColors=await evaluate("Array.from(document.querySelectorAll('.side.right > h3,.side.right > details > summary'),e=>getComputedStyle(e).color)");
  await evaluate("(()=>{window.orchOriginalCanvas=canvas;window.orchOriginalRun=$('run');window.orchOriginalSim=sim;window.orchOriginalCamera=JSON.stringify({x:canvas.getBoundingClientRect().left+camera.x,y:canvas.getBoundingClientRect().top+camera.y,z:camera.z});const createGain=AudioContext.prototype.createGain;AudioContext.prototype.createGain=function(){const node=createGain.call(this),connect=node.connect.bind(node);node.connect=function(target,...args){if(target===this.context.destination){const a=this.context.createAnalyser();connect(a);a.connect(target);window.orchAnalyser=a;return target}return connect(target,...args)};return node};return true})()");
  await tap(setup.point);await tap(setup.point);assert.equal(await evaluate("orchestraTheme.active"),false);await tap(setup.point);
  await poll(()=>evaluate("orchestraTheme.active&&running"));console.log('ORCH_STAGE','entered');
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.side.right > h3,.side.right > details > summary'),e=>getComputedStyle(e).color)"),sidebarColors);

  const volumeHeader=await evaluate(`(()=>{const v=document.querySelector('[data-orch-volume]'),b=document.querySelector('[data-orch-bpm]'),toolbar=document.querySelector('.sim-toolbar');v.value=42;v.dispatchEvent(new Event('input',{bubbles:true}));const saved=JSON.parse(localStorage.getItem('astra-orchestra-v1')).volume,visible=v.getBoundingClientRect().width>0,order=v.closest('label').nextElementSibling===b.closest('label');return {saved,visible,order,one:document.querySelectorAll('[data-orch-volume]').length===1,inHeader:toolbar.contains(v),label:document.querySelector('[data-orch-volume-value]').textContent}})()`);
  assert(volumeHeader.saved===.42&&volumeHeader.visible&&volumeHeader.order&&volumeHeader.one&&volumeHeader.inHeader&&volumeHeader.label==='42%',JSON.stringify(volumeHeader));
  await evaluate("(()=>{const v=document.querySelector('[data-orch-volume]');v.value=60;v.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
  const globalScore=await evaluate("(()=>{const s=JSON.parse(localStorage.getItem('astra-orchestra-v1')),tracks=s.scores['shared-machine-events-v1'],types=Object.keys(DEF).filter(type=>getPorts({type,x:0,y:0,face:'E',mode:defaultModeFor(type)}).length);return {defaultModulate:s.modulate===true&&document.querySelector('[data-orch-modulate]').checked&&s.keyPlan?.length===4&&s.keyPlan.some(n=>n!==0),count:types.length,complete:types.every(k=>!!tracks[k]),lengths16:types.every(k=>Object.values(tracks[k].ports).every(p=>p.length===16&&p.every(Number.isInteger))),unused:types.some(k=>!state.machines.some(m=>m.type===k))}})()");
  assert(globalScore.defaultModulate&&globalScore.complete&&globalScore.lengths16&&globalScore.unused,JSON.stringify(globalScore));

  assert.match(await evaluate('document.title'),/Factory Orchestra/);
  const wordmark=await evaluate("(()=>{const save=ctx.fillText,letters=[];ctx.fillText=function(ch,x,y,...args){letters.push({ch,x,y});return save.call(this,ch,x,y,...args)};try{orchestraTheme.centerLabel()}finally{ctx.fillText=save}return letters.map(x=>x.ch).join('')})()");
  assert.equal(wordmark,'FACTORYORCHESTRAPROJECT : ASTRA');
  assert.equal(await evaluate("document.querySelector('[data-orch=switch]').textContent"),'音符编辑');

  const brandColors=await evaluate("(()=>{const b=document.querySelector('.brand'),f=b.querySelector('.orch-brand-factory'),o=b.querySelector('.orch-brand-orchestra');return {factory:getComputedStyle(f).color,orchestra:getComputedStyle(o).color,old:getComputedStyle(b.querySelector('span:not(.orch-brand-title)')).display,baseSize:getComputedStyle(b).fontSize}})()");
  assert.deepEqual(brandColors,{factory:'rgb(165, 201, 255)',orchestra:'rgb(213, 195, 255)',old:'none',baseSize:'0px'});

  assert.equal(await evaluate("(()=>{const g=document.querySelector('.orch-left-header');return g&&g.children[0]===document.querySelector('.brand')&&g.children[1]===$('presetDropdown')&&g.children[2]===$('editMenuWrap')})()"),true);
  const entry=await evaluate("(()=>{const i=document.querySelector('.orch-transition-image');return {snapshot:!!i,animation:!!i?.getAnimations().length,oneCanvas:!document.getElementById('orchestraCanvas')}})()");
  assert(entry.snapshot&&entry.animation&&entry.oneCanvas,JSON.stringify(entry));

  assert.equal(await evaluate("canvas===window.orchOriginalCanvas&&sim===window.orchOriginalSim&&$('run')===window.orchOriginalRun&&JSON.stringify({x:canvas.getBoundingClientRect().left+camera.x,y:canvas.getBoundingClientRect().top+camera.y,z:camera.z})===window.orchOriginalCamera"),true);
  assert.equal(await evaluate("!document.getElementById('orchestraCanvas')&&!document.getElementById('orchestraDialog')&&!!document.querySelector('.side.left')&&!!document.querySelector('.side.right')"),true);
  const color=await evaluate("(()=>{const b=document.querySelector('[data-stamp=垃圾]');return b.style.getPropertyValue('--palette-machine-color')===orchestraTheme.color('垃圾')&&makeColor(state.machines[0])===orchestraTheme.color('垃圾')})()");
  assert(color,'placed and palette machine color shared');
  await evaluate("document.querySelector('[data-orch-bpm]').value=360;document.querySelector('[data-orch-bpm]').dispatchEvent(new Event('change',{bubbles:true}));true");
  await poll(()=>evaluate("simTime>14&&Number(document.querySelector('[data-orch-status]').textContent.match(/(\\d+) 次收发/)?.[1]||0)>0"));
  // Measure real frame-to-frame drawing at 30 BPM, not just tick positions.
  const smooth=await evaluate("new Promise(resolve=>{const theme=orchestraTheme,original=theme.packetDistance,rows=[];let last=-1;theme.packetDistance=function(d,a,e,f){const v=original.call(this,d,a,e,f);if(v>d&&simTime!==last){last=simTime;rows.push({tick:simTime,values:[]})}if(v>d&&rows.length)rows.at(-1).values.push(v-d);return v};const bpm=document.querySelector('[data-orch-bpm]');bpm.value=30;bpm.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(()=>{theme.packetDistance=original;const varied=rows.filter(r=>new Set(r.values.map(x=>x.toFixed(5))).size>1).length;const blocked=theme.packetDistance(3,3,8,.04)===3&&theme.packetDistance(8,8,8,.04)===8;const free=Math.abs(theme.packetDistance(3,8,8,.025)-3.05)<1e-9;bpm.value=360;bpm.dispatchEvent(new Event('change',{bubbles:true}));resolve({ticks:rows.length,varied,blocked,free})},850)})");
  assert(smooth.varied>=2&&smooth.blocked&&smooth.free,JSON.stringify(smooth));
  console.log('ORCH_SMOOTH_30_BPM',JSON.stringify(smooth));
  const space=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32})};
  await evaluate("document.activeElement?.blur();true");await space();await poll(()=>evaluate("!running"));
  const paused=await evaluate("simTime");await new Promise(r=>setTimeout(r,120));assert.equal(await evaluate("simTime"),paused);
  const pausedStyle=await evaluate("(()=>{const b=$('run');return {w:b.getBoundingClientRect().width,bg:getComputedStyle(b).backgroundColor}})()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await new Promise(r=>setTimeout(r,420));
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  assert.equal(await evaluate('running'),false,'long space must not resume a paused factory');
  await space();await poll(()=>evaluate("running"));const playingStyle=await evaluate("(()=>{const b=$('run');return {w:b.getBoundingClientRect().width,bg:getComputedStyle(b).backgroundColor}})()");
  assert.equal(pausedStyle.w,playingStyle.w);assert.match(pausedStyle.bg,/rgb\(52, 74, 121\)/);
  await new Promise(r=>setTimeout(r,1050));
  const headerLayout=await evaluate("(()=>{const a=document.querySelector('.brand').getBoundingClientRect(),b=$('presetDropdown').getBoundingClientRect(),c=$('editMenuWrap').getBoundingClientRect(),d=document.querySelector('.sim-toolbar').getBoundingClientRect();return {ordered:a.right<=b.left+1&&b.right<=c.left+1,center:(d.left+d.right)/2,width:innerWidth,leftFits:c.right<=innerWidth+1,overlap:!(c.right<=d.left+1||c.bottom<=d.top+1),fadeDone:!document.querySelector('.orch-transition-image')}})()");
  const volumeRows=await evaluate(`(()=>{const v=document.querySelector('[data-orch-volume]').closest('label').getBoundingClientRect(),b=document.querySelector('[data-orch-bpm]').closest('label').getBoundingClientRect(),actions=[...document.querySelectorAll('.sim-toolbar [data-orch]')].map(e=>e.getBoundingClientRect());return {wrapped:b.top>=v.bottom-1&&actions.every(r=>r.top>=v.bottom-1),inline:Math.abs(b.top-v.top)<3&&v.right<=b.left+1,inside:actions.every(r=>r.left>=-1&&r.right<=innerWidth+1)}})()`);
  assert(volumeRows.inside&&(mobile?volumeRows.wrapped:volumeRows.inline),JSON.stringify(volumeRows));
  console.log('ORCH_HEADER',JSON.stringify(headerLayout));
  assert(headerLayout.ordered&&headerLayout.leftFits&&!headerLayout.overlap&&headerLayout.fadeDone&&Math.abs(headerLayout.center-headerLayout.width/2)<3,JSON.stringify(headerLayout));
  if(!mobile){
   const r=await evaluate("(()=>{const r=canvas.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,cx:camera.x,cy:camera.y}})()");
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',buttons:1,clickCount:1});
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x+12,y:r.y+8,button:'left',buttons:1});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x+12,y:r.y+8,button:'left',clickCount:1});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
   assert.equal(await evaluate('running'),true,'Space+drag does not toggle playback');
   assert(await evaluate('camera.x!=='+r.cx+'||camera.y!=='+r.cy),'Space+drag still pans');
   await evaluate('camera.x='+r.cx+';camera.y='+r.cy+';draw();true');
  }
  const point=async expression=>evaluate("(()=>{const [x,y]="+expression+",r=canvas.getBoundingClientRect();return {x:r.left+camera.x+x*camera.z,y:r.top+camera.y+y*camera.z}})()");
  await tap(await point("[4.5,8.5]"));console.log('ORCH_STAGE','machineTap');
  await poll(()=>evaluate("selection?.machineId==='M0'"));console.log('ORCH_STAGE','machine');
  await tap(await point("state.routes[0].path[3].map(x=>x+.5)"));
  await poll(()=>evaluate("selection?.routeId==='R0'"));console.log('ORCH_STAGE','route');
  // Place a new machine with the normal stamp tool during playback.
  await evaluate("setStampType('粒子');tool='stamp';hoverCell={x:15,y:34};draw();true");
  if(mobile)await tap(await point("(()=>{const m=getStampMachine(15,34),d=dims(m);return [m.x+d[0]/2,m.y+d[1]/2]})()"));else await tap(await point("[15.5,34.5]"));
  await poll(()=>evaluate("state.machines.some(m=>m.type==='粒子')&&running"));console.log('ORCH_STAGE','placed');
  const duplicate=await evaluate("(()=>{setTool('select');selection={machineId:'M0'};hoverCell={x:4,y:45};duplicateGroup();moveGroupPreviewTo({x:4,y:45});const g=groupTransform?.plan;if(!g?.valid)return {ok:false,error:g?.error};const m=g.machines[0],color=makeColor(m);const ok=commitGroupTransform();setTool('select');return {ok,color,expected:orchestraTheme.color('垃圾'),running,count:state.machines.filter(m=>m.type==='垃圾').length}})()");
  console.log('ORCH_DUPLICATE',JSON.stringify(duplicate));assert(duplicate.ok&&duplicate.running&&duplicate.count===2&&duplicate.color===duplicate.expected,JSON.stringify(duplicate));
  await evaluate("setTool('select');document.querySelector('[data-orch=switch]').click();true");
  await poll(()=>evaluate("!document.getElementById('orchestraScore').hidden&&!!document.querySelector('[data-track=粒子]')"));
  const cover=await evaluate("(()=>{const r=document.getElementById('orchestraScore').getBoundingClientRect(),m=document.querySelector('.main').getBoundingClientRect();return {width:r.width,main:m.width,left:r.left-m.left,sideHidden:getComputedStyle(document.querySelector('.side.left')).visibility==='hidden',canvasHidden:getComputedStyle(canvas).visibility==='hidden'}})()");
  assert(Math.abs(cover.width-cover.main)<1&&Math.abs(cover.left)<1&&cover.sideHidden&&cover.canvasHidden,JSON.stringify(cover));
  const continuity=await evaluate(`(()=>{
   const button=document.querySelector('[data-orch=switch]'),root=document.getElementById('orchestraScore'),score=orchestraTheme.score;
   const old=running;running=false;
   const snapshot=()=>({time:simTime,phase:root.querySelector('.orch-playhead').style.left,slots:[...root.querySelectorAll('[data-orch-cursor]')].map(e=>[e.dataset.orchCursor,e.dataset.positions]),next:state.machines.map(m=>[m.id,orchestraTransferCount(m.id,'in'),orchestraTransferCount(m.id,'out')])});
   score.paint(performance.now(),false);const a=snapshot();button.click();button.click();const b=snapshot();
   const markers=a.slots.length>0&&a.slots.every(([k,s])=>{const [type,dir]=k.split('|'),len=score.track(type).ports[dir].length,expected=new Map();for(const m of state.machines.filter(m=>m.type===type&&getPorts(m).some(p=>p.kind===dir))){const i=orchestraTransferCount(m.id,dir)%len;expected.set(i,(expected.get(i)||0)+1)}return s===JSON.stringify([...expected].sort((a,b)=>a[0]-b[0]))});
   const menu=root.querySelector('.orch-settings');menu.open=true;const panel=menu.querySelector('.orch-settings-panel').getBoundingClientRect(),fits=panel.left>=0&&panel.right<=innerWidth+1&&panel.bottom<=innerHeight+1;menu.open=false;
   running=old;return {same:JSON.stringify(a)===JSON.stringify(b),markers,fits,phase:a.phase,slots:a.slots.length};
  })()`);
  console.log('ORCH_CONTINUITY',JSON.stringify(continuity));assert(continuity.same&&continuity.markers&&continuity.fits,JSON.stringify(continuity));
  const harmony=await evaluate("(()=>{let count=0;for(const mode of Object.keys(orchestraHarmony.modes))for(let key=0;key<12;key++)for(const inst of Object.keys(ORCHESTRA_INSTRUMENTS))for(let k=0;k<8;k++){const a=orchestraHarmony.make(inst,'out',8,key,mode),scale=orchestraHarmony.modes[mode].scale;if(a.length!==8||a[0]===null||a.at(-1)===null||a.some(n=>n!==null&&(!Number.isInteger(n)||n<24||n>96||!scale.includes((n-key+120)%12))))return {ok:false,mode,key,inst,a};count++}return {ok:true,count}})()");
  assert(harmony.ok,JSON.stringify(harmony));console.log('ORCH_HARMONY',JSON.stringify(harmony));
  const reroll=await evaluate("(()=>{const root=document.getElementById('orchestraScore'),click=a=>root.querySelector('[data-orch='+a+']').click(),read=()=>{const s=JSON.parse(localStorage.getItem('astra-orchestra-v1'));return {h:s.harmony,t:s.scores['shared-machine-events-v1']}};click('random-all');const a=read();click('random-all');const b=read();const fixedBefore=JSON.stringify(Object.fromEntries(Object.entries(b.t).map(([k,v])=>[k,[v.instrument,v.volume]])));click('random-fixed');const c=read(),fixedAfter=JSON.stringify(Object.fromEntries(Object.entries(c.t).map(([k,v])=>[k,[v.instrument,v.volume]])));return {differentKey:a.h.key!==b.h.key,changedTimbre:a.t['垃圾'].instrument!==b.t['垃圾'].instrument,fixedKey:JSON.stringify(b.h)===JSON.stringify(c.h),fixedTimbre:fixedBefore===fixedAfter,autoDefault:root.querySelector('[data-orch-auto-random]').checked}})()");
  console.log('ORCH_REROLL',JSON.stringify(reroll));
  assert(reroll.differentKey&&reroll.changedTimbre&&reroll.fixedKey&&reroll.fixedTimbre&&!reroll.autoDefault,JSON.stringify(reroll));
  const modulation=await evaluate("(()=>{const root=document.getElementById('orchestraScore'),toggle=root.querySelector('[data-orch-modulate]');toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));const s=JSON.parse(localStorage.getItem('astra-orchestra-v1')),plan=s.keyPlan,score=orchestraTheme.score,track=score.track('垃圾');const old=track.instrument;track.instrument='bass';const a=score.pitch('垃圾','out',0,0),b=score.pitch('垃圾','out',0,4),c=score.pitch('垃圾','out',0,16);track.instrument='kick';const drum=score.pitch('垃圾','out',0,4);track.instrument=old;toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true}));return {plan,a,b,c,drum,savedOff:JSON.parse(localStorage.getItem('astra-orchestra-v1')).modulate===false,off:score.pitch('垃圾','out',0,4)}})()");
  assert(modulation.savedOff&&modulation.plan.length===4&&[0,5,7].includes(modulation.plan[1])&&(modulation.b-modulation.a+120)%12===modulation.plan[1]&&modulation.c===modulation.a&&modulation.drum===modulation.a&&modulation.off===modulation.a,JSON.stringify(modulation));
  console.log('ORCH_GLOBAL_SCORE',JSON.stringify({globalScore,modulation}));
  const lengths=await evaluate("(()=>{const root=document.getElementById('orchestraScore'),box=root.querySelector('[data-orch-random-length]'),select=root.querySelector('[data-orch-length]'),click=()=>root.querySelector('[data-orch=random-all]').click(),read=()=>JSON.parse(localStorage.getItem('astra-orchestra-v1'));box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));let valid=true;const seen=[];for(const r of [.1,.5,.9]){const old=Math.random;try{Math.random=()=>r;click()}finally{Math.random=old}const s=read(),n=Number(select.value)*4;seen.push(n);valid&&=Object.values(s.scores['shared-machine-events-v1']).every(t=>Object.values(t.ports).every(p=>p.length===n))&&s.keyPlan.length===n/4}box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}));select.value='4';select.dispatchEvent(new Event('change',{bubbles:true}));return {seen,valid}})()");
  assert.deepEqual(lengths,{seen:[4,8,16],valid:true});console.log('ORCH_LENGTHS',JSON.stringify(lengths));
  const edit=await evaluate("(()=>{const root=document.getElementById('orchestraScore');root.querySelector('[data-orch=random-all]').click();const stored=JSON.parse(localStorage.getItem('astra-orchestra-v1')).scores['shared-machine-events-v1'];return {length:stored['垃圾'].ports['out'].length,loop:root.querySelector('[data-orch-loop]').textContent,playing:running}})()");
  console.log('ORCH_EDIT',JSON.stringify(edit));assert.equal(edit.length,16);assert.match(edit.loop,/16 音符位/);assert(edit.playing);
  const presetTest=await evaluate(`(()=>{
   const root=document.getElementById('orchestraScore'),score=orchestraTheme.score,select=root.querySelector('[data-orch-preset]'),old=select.value,code=score.exportCode(),layout=compactFactoryJSON(),runtime=sim,time=simTime;
   const choose=id=>{select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}))};
   choose('__new');const second=select.value,newCode=score.exportCode(),fresh=second!==old&&newCode!==code;
   choose(old);const firstRestored=score.exportCode()===code;
   choose(second);const secondRestored=score.exportCode()===newCode;
   const p=window.prompt,c=window.confirm;window.prompt=()=> '节奏测试';window.confirm=()=>true;
   let renamed,deleted;
   try{root.querySelector('[data-orch=rename-preset]').click();renamed=select.selectedOptions[0].textContent==='节奏测试';
   root.querySelector('[data-orch=delete-preset]').click();deleted=select.value===old&&score.exportCode()===code&&select.options.length===2}
   finally{window.prompt=p;window.confirm=c}
   const saved=JSON.parse(localStorage.getItem('astra-orchestra-v1'));
   return {fresh,firstRestored,secondRestored,renamed,deleted,persisted:saved.activeMusicPreset===old&&saved.musicPresets.length===1&&saved.musicPresets[0].code===code,unchanged:compactFactoryJSON()===layout&&runtime===sim&&time===simTime,placement:select.nextElementSibling?.classList.contains('orch-settings')};
  })()`);
  console.log('ORCH_PRESETS',JSON.stringify(presetTest));assert(Object.values(presetTest).every(Boolean),JSON.stringify(presetTest));
  const share=await evaluate(`(()=>{
   const root=document.getElementById('orchestraScore'),score=orchestraTheme.score,field=root.querySelector('[data-orch-code]'),click=action=>root.querySelector('[data-orch='+action+']').click();
   const before=compactFactoryJSON(),oldSim=sim,oldTime=simTime;
   root.querySelector('.orch-settings').open=true;root.querySelector('.orch-code-share').open=true;
   click('export-code');const code=field.value,original=orchestraDecodeCode(code);
   click('random-all');const changed=score.exportCode()!==code;
   field.value='ORCH1:broken';const current=score.exportCode();click('import-code');const badRejected=score.exportCode()===current;
   const bad=orchestraDecodeCode(code);delete bad.tracks[Object.keys(bad.tracks)[0]];field.value=orchestraEncodeCode(bad);click('import-code');const incompleteRejected=score.exportCode()===current;
   field.value=code;click('import-code');
   const actual=orchestraDecodeCode(score.exportCode()),status=root.querySelector('[data-orch-code-status]').textContent;
   root.querySelector('.orch-settings').open=false;document.activeElement?.blur();
   return {prefix:code.startsWith('ORCH1:'),changed,badRejected,incompleteRejected,roundtrip:JSON.stringify(original)===JSON.stringify(actual),unchanged:compactFactoryJSON()===before&&sim===oldSim&&simTime===oldTime,shared:!JSON.parse(localStorage.getItem('astra-orchestra-v1')).autoRandom,complete:Object.keys(original.tracks).length>state.machines.length,status};
  })()`);
  console.log('ORCH_CODE_SHARE',JSON.stringify(share));assert(share.prefix&&share.changed&&share.badRejected&&share.incompleteRejected&&share.roundtrip&&share.unchanged&&share.shared&&share.complete&&share.status.includes('已导入'),JSON.stringify(share));
  await evaluate("document.querySelector('[data-orch=switch]').click();true");
  const levels=[];for(let i=0;i<28;i++){levels.push(await evaluate("(()=>{const a=window.orchAnalyser;if(!a)return 0;const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);return Math.max(...b.map(Math.abs))})()"));await new Promise(r=>setTimeout(r,45))}
  assert(Math.max(...levels)>.001,'audible mixed signal');

  console.log('ORCH_LEVEL',Math.max(...levels));const before=await evaluate("({t:simTime,n:state.machines.length,speed:simulationSpeed})");
  await evaluate("document.querySelector('[data-orch=close]').click();true");
  assert.equal(await evaluate("!orchestraTheme.active&&sim===window.orchOriginalSim&&canvas===window.orchOriginalCanvas&&running&&simulationSpeed===1"),true);
  assert.equal(await evaluate("!document.querySelector('.orch-left-header')&&$('presetDropdown').parentElement===document.querySelector('.top')&&$('editMenuWrap').parentElement===document.querySelector('.top')&&!!document.querySelector('.orch-transition-image')"),true);

  assert.equal(await evaluate("state.machines.length"),before.n);assert.match(await evaluate('document.title'),/Factory Lab/);
  await evaluate('document.activeElement?.blur();true');await space();await poll(()=>evaluate('!running'));await space();await poll(()=>evaluate('running'));
  assert(await evaluate("simTime>="+before.t));
  await evaluate("setTool('select');true");
  const sharedBefore=await evaluate("JSON.stringify(JSON.parse(localStorage.getItem('astra-orchestra-v1')).scores['shared-machine-events-v1'])");
  console.log('ORCH_CLOSED');const centerPoint=await point("[36,36]");await tap(centerPoint);await tap(centerPoint);await tap(centerPoint);
  await poll(()=>evaluate("orchestraTheme.active"));console.log('ORCH_REENTERED',centerPoint,await point("[36,36]"));
  assert.equal(await evaluate("JSON.stringify(JSON.parse(localStorage.getItem('astra-orchestra-v1')).scores['shared-machine-events-v1'])"),sharedBefore);
  const topRandom=await evaluate("(()=>{const read=()=>JSON.parse(localStorage.getItem('astra-orchestra-v1')),a=read(),t=simTime;document.querySelector('[data-orch=random]').click();const b=read(),name=Object.keys(a.scores['shared-machine-events-v1']).find(k=>!state.machines.some(m=>m.type===k));return {key:a.harmony.key!==b.harmony.key,unused:JSON.stringify(a.scores['shared-machine-events-v1'][name])!==JSON.stringify(b.scores['shared-machine-events-v1'][name]),continues:running&&simTime===t}})()");
  assert(topRandom.key&&topRandom.unused&&topRandom.continues,JSON.stringify(topRandom));

  const currentCenter=await point("[36,36]");assert(Math.hypot(currentCenter.x-centerPoint.x,currentCenter.y-centerPoint.y)<1.5,'theme does not move world projection');
  const exitPoint=await point("[36,36]");await tap(exitPoint);await tap(exitPoint);await tap(exitPoint);
  await poll(()=>evaluate("!orchestraTheme.active"));
  assert.equal(await evaluate("canvas===window.orchOriginalCanvas&&running&&simulationSpeed===1"),true);

  const autoBefore=await evaluate("(()=>{const el=document.querySelector('[data-orch-auto-random]');el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));return JSON.parse(localStorage.getItem('astra-orchestra-v1')).harmony.key})()");
  const restPoint=await point("[36,36]");await tap(restPoint);await tap(restPoint);await tap(restPoint);
  await poll(()=>evaluate("orchestraTheme.active&&running"));
  assert.notEqual(await evaluate("JSON.parse(localStorage.getItem('astra-orchestra-v1')).harmony.key"),autoBefore);
  await evaluate("(()=>{const el=document.querySelector('[data-orch-auto-random]');el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));return true})()");

  const cursorTrace=await evaluate(`new Promise(resolve=>{
   const score=orchestraTheme.score,old=score.pitch;let count=0,valid=true;
   score.pitch=function(type,dir,cursor,time){const candidates=state.machines.filter(m=>m.type===type);valid&&=candidates.some(m=>Math.max(0,orchestraTransferCount(m.id,dir)-1)===cursor);count++;return old.call(this,type,dir,cursor,time)};
   setTimeout(()=>{score.pitch=old;resolve({count,valid})},650);
  })`);
  assert(cursorTrace.count>0&&cursorTrace.valid,JSON.stringify(cursorTrace));console.log('ORCH_CURSOR_TRACE',JSON.stringify(cursorTrace));
  const rest=await evaluate("new Promise(resolve=>{const theme=orchestraTheme,original=theme.hit,score=theme.score,old=new Map();for(const m of state.machines){const track=score.track(m.type);if(track&&!old.has(track)){old.set(track,track.ports);track.ports=Object.fromEntries(Object.keys(track.ports).map(k=>[k,[null]]))}}theme.clear();let hits=0,transfers=0;const observer=simTransferObserver;simTransferObserver=(...a)=>{transfers++;observer(...a)};theme.hit=function(...a){hits++;return original.apply(this,a)};setTimeout(()=>{const during={transfers,hits,pending:theme.pendingHits.length,active:theme.pulses.size};for(const [track,ports] of old)track.ports=ports;simTransferObserver=observer;theme.hit=original;resolve(during)},950)})");
  assert(rest.transfers>0&&rest.hits===0&&rest.pending===0&&rest.active===0,JSON.stringify(rest));
  await poll(()=>evaluate("orchestraTheme.pulses.size>0"));
  await poll(()=>evaluate("!!document.querySelector('#palette .orch-key-hit')"));
  // Trace successful transfers all the way through the real controller's
  // note grouping and hit scheduling at 360 BPM, including warehouse inputs.
  const trace=await evaluate(`new Promise(resolve=>{
   const theme=orchestraTheme,group=orchestraGroupNotes,hit=theme.hit,score=theme.score,old=new Map(),expected=new Map(),actual=new Map();
   let input=0,output=0;
   for(const m of state.machines){const track=score.track(m.type);if(track&&!old.has(track)){old.set(track,track.ports);track.ports=Object.fromEntries(Object.keys(track.ports).map(k=>[k,[60]]))}}
   const key=(id,dir,port)=>id+'|'+dir+'|'+port,add=(map,k)=>map.set(k,(map.get(k)||0)+1);
   orchestraGroupNotes=function(events){const groups=group(events);for(const g of groups)for(const ev of g.events){add(expected,key(ev.id,ev.dir,ev.port));if(ev.dir==='in')input++;else output++}return groups};
   theme.hit=function(m,dir,port,at){add(actual,key(m.id,dir,port));return hit.call(this,m,dir,port,at)};
   setTimeout(()=>{orchestraGroupNotes=group;theme.hit=hit;for(const [track,ports] of old)track.ports=ports;
    resolve({input,output,expected:[...expected.values()].reduce((a,b)=>a+b,0),actual:[...actual.values()].reduce((a,b)=>a+b,0),same:[...expected].every(([k,n])=>actual.get(k)===n)&&expected.size===actual.size});
   },1200);
  })`);
  console.log('ORCH_HIT_TRACE',JSON.stringify(trace));assert(trace.input>0&&trace.output>0&&trace.same,JSON.stringify(trace));
  const libraryHit=await evaluate("(()=>{const theme=orchestraTheme,m=state.machines[0],p=getPorts(m).find(p=>p.kind==='out'),b=document.querySelector('#palette [data-stamp=垃圾]'),other=document.querySelector('#palette [data-stamp=分流]'),t=performance.now();theme.clear();theme.paintPalette(t);const idle=getComputedStyle(b).backgroundColor;theme.hit(m,p.kind,p.index,t+100);theme.beginFrame(t);theme.paintPalette(t);const future=!b.classList.contains('orch-key-hit');theme.beginFrame(t+100);theme.paintPalette(t+100);const hit=getComputedStyle(b).backgroundColor,energy=Number(b.style.getPropertyValue('--orch-hit')),only=!other.classList.contains('orch-key-hit');theme.hit(m,p.kind,p.index,t+100);theme.beginFrame(t+100);theme.paintPalette(t+100);const bounded=Number(b.style.getPropertyValue('--orch-hit'))===1;theme.paintPalette(t+681);const reset=!b.classList.contains('orch-key-hit')&&getComputedStyle(b).backgroundColor===idle;theme.clear();return {future,hit:hit!==idle,energy,only,bounded,reset}})()");
  console.log('ORCH_LIBRARY_HIT',JSON.stringify(libraryHit));
  assert(libraryHit.future&&libraryHit.hit&&libraryHit.energy===1&&libraryHit.only&&libraryHit.bounded&&libraryHit.reset,JSON.stringify(libraryHit));

  // Real hold gesture, preview clock, key judgement, pause, and close.
  await evaluate("(()=>{setTool('select');selection=null;multiSelection=null;draft=null;stampType=null;camera.z=8;const m=state.machines[0],[w,h]=dims(m);camera.x=pix.w/2-(m.x+w/2)*8;camera.y=pix.h/2-(m.y+h/2)*8;draw();return true})()");
  const machinePoint=await point("(()=>{const m=state.machines[0],[w,h]=dims(m);return [m.x+w/2,m.y+h/2]})()");
  const hold=async()=>{
   if(mobile){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:machinePoint.x,y:machinePoint.y}]});await new Promise(r=>setTimeout(r,620));await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
   else{await send('Input.dispatchMouseEvent',{type:'mousePressed',x:machinePoint.x,y:machinePoint.y,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,620));await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:machinePoint.x,y:machinePoint.y,button:'left',clickCount:1})}
  };
  const oldTempo=await evaluate("Number(document.querySelector('[data-orch-bpm]').value)");
  await evaluate(`(()=>{const theme=orchestraTheme;window.__previewProbe={packets:0,warehouse:false,inspector:false,rail:false,enter:false};const probe=window.__previewProbe;
   const packet=theme.packet;theme.packet=function(...args){if(ctx.canvas===orchestraTheme.rhythm.previewCanvas)probe.packets++;return packet.apply(this,args)};
   const pp=theme.paintPanels,pi=theme.paintInspector;
   theme.paintPanels=function(...args){const result=pp.apply(this,args);if(this.rhythm.active&&[...document.querySelectorAll('#warehouseLiveActual [data-orch-item]')].some(e=>e.getAnimations().length))probe.warehouse=true;return result};
   theme.paintInspector=function(...args){const result=pi.apply(this,args);if(this.rhythm.active&&document.querySelector('#inspector .machine-summary')?.getAnimations().length)probe.inspector=true;return result};
   const monitor=()=>{if(theme.rhythm.active){if(document.querySelector('.orch-rhythm-transition-map')||theme.rhythm.root.getAnimations().length)probe.enter=true;
   if([...document.querySelectorAll('.orch-rhythm-rail-glow')].some(e=>e.getAnimations().length&&e.style.getPropertyValue('--rail-color')))probe.rail=true}requestAnimationFrame(monitor)};requestAnimationFrame(monitor);return true})()`);
  await hold();await hold();assert.equal(await evaluate('orchestraTheme.rhythm.active'),false);
  await hold();await poll(()=>evaluate('orchestraTheme.rhythm.active'));
  const rhythmLayout=await evaluate(`(()=>{const el=document.querySelector('.orch-rhythm'),r=el.getBoundingClientRect(),w=canvas.closest('.canvaswrap').getBoundingClientRect();return {sameCanvas:document.querySelectorAll('#map').length===1,hiddenMap:getComputedStyle(canvas).visibility==='hidden',fits:Math.abs(r.width-w.width)<1&&Math.abs(r.height-w.height)<1,lanes:el.querySelectorAll('[data-rhythm-lane]').length,lead:orchestraTheme.rhythm.lead,auto:orchestraTheme.rhythm.auto,difficulty:orchestraTheme.rhythm.difficulty,keys:[...el.querySelectorAll('[data-rhythm-key]')].map(b=>b.textContent).join(''),tempo:simulationSpeed,locked:document.querySelector('[data-orch-bpm]').disabled,running}})()`);
  assert(rhythmLayout.sameCanvas&&rhythmLayout.hiddenMap&&rhythmLayout.fits&&rhythmLayout.lanes===4&&rhythmLayout.lead===1.2&&!rhythmLayout.auto&&rhythmLayout.difficulty==='easy'&&rhythmLayout.keys==='DFJK'&&rhythmLayout.tempo===2&&rhythmLayout.locked&&rhythmLayout.running,JSON.stringify(rhythmLayout));
  assert.equal(await evaluate("(()=>{const v=document.querySelector('[data-orch-volume]');v.value=37;v.dispatchEvent(new Event('input',{bubbles:true}));const ok=!v.disabled&&v.getBoundingClientRect().width>0&&JSON.parse(localStorage.getItem('astra-orchestra-v1')).volume===.37;v.value=60;v.dispatchEvent(new Event('input',{bubbles:true}));return ok})()"),true);
  assert.equal(await evaluate("$('warehousePanel').open&&warehouseCardOpen.actual"),true);
  const frozen=await evaluate("(()=>{window.__rhythmOriginal={sim,ware,time:simTime,remainder:simClockRemainder,bytes:JSON.stringify({sim,ware}),cache:frozenSimCache,snapshot:simLayoutSnapshot};return {time:simTime,plan:orchestraRhythmSongPlan()}})()");
  assert.equal(frozen.plan.duration,64);assert.equal(frozen.plan.bars,16);assert.equal(frozen.plan.repeats,2);
  await poll(()=>evaluate("orchestraTheme.rhythm.model.notes.length>0"));
  const previewFit=await evaluate(`(()=>{
   const c=document.querySelector('[data-rhythm-factory]'),r=c.getBoundingClientRect(),stage=document.querySelector('.orch-rhythm-stage').getBoundingClientRect(),box=document.querySelector('.orch-rhythm-body').getBoundingClientRect();
   const visible=r.width>0&&r.height>0;
   let rendered=false;
   if(visible){const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;rendered=a.some((v,i)=>i%4===3&&v>0)}
   return {visible,rendered,left:r.right<=stage.left+1,centered:Math.abs((stage.left+stage.right-box.left-box.right)/2)<2,isolated:ctx.canvas===canvas,real:sim===window.__rhythmOriginal.sim&&simTime===window.__rhythmOriginal.time};
  })()`);
  console.log('ORCH_PREVIEW_FIT',JSON.stringify(previewFit));
  assert(previewFit.isolated&&previewFit.real&&previewFit.centered&&(mobile?!previewFit.visible:previewFit.visible&&previewFit.rendered&&previewFit.left),JSON.stringify(previewFit));
  const beforeRhythm=await evaluate("(()=>{const r=orchestraTheme.rhythm;return {time:simTime,notes:r.model.notes.length,first:r.model.notes[0].at}})()");
  await poll(()=>evaluate("document.querySelector('#warehouseLiveSummary')?.textContent.includes('音游预演时间')"));
  const previewPanels=await evaluate("(()=>({preview:document.querySelector('#warehouseLiveSummary').textContent.includes('音游预演时间'),real:sim===window.__rhythmOriginal.sim&&simTime===window.__rhythmOriginal.time}))()");
  assert(previewPanels.preview&&previewPanels.real,JSON.stringify(previewPanels));
  // Use the actual audio clock (the browser fixture exposes its analyser).
  const judged=await evaluate(`new Promise(resolve=>{const r=orchestraTheme.rhythm,started=performance.now();let target=null;function loop(){const n=r.model.notes[0];if(n){const key=document.querySelector('[data-rhythm-key="'+n.lane+'"]');if(!target)target=n;const el=document.querySelector('[data-rhythm-lane="'+n.lane+'"] .orch-rhythm-note'),line=document.querySelector('.orch-rhythm-judge-line');if(el&&Math.abs(el.getBoundingClientRect().top+el.getBoundingClientRect().height/2-line.getBoundingClientRect().top)<12){if(${mobile}){key.dispatchEvent(new PointerEvent('pointerdown',{pointerId:999}));key.dispatchEvent(new PointerEvent('pointerup',{pointerId:999}))}else{const code=r.keys[n.lane],keyName=r.labels[n.lane].toLowerCase();window.dispatchEvent(new KeyboardEvent('keydown',{code,key:keyName,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,key:keyName,bubbles:true}))}resolve(r.model.stats());return}}if(performance.now()-started>5000){resolve(r.model.stats());return}requestAnimationFrame(loop)}loop()})`);
  console.log('ORCH_RHYTHM',JSON.stringify({rhythmLayout,beforeRhythm,judged}));assert(judged.score>0,JSON.stringify(judged));
  assert.equal(await evaluate("!document.querySelector('.orch-rhythm-hit-ring') && [...document.querySelectorAll('.orch-rhythm-hit-beam')].some(e=>e.getAnimations().length>0) && [...document.querySelectorAll('.orch-rhythm-grade')].some(e=>e.textContent&&e.getAnimations().length>0)"),true);
  await poll(()=>evaluate("window.__previewProbe.rail&&window.__previewProbe.inspector&&window.__previewProbe.enter&&("+mobile+"||window.__previewProbe.packets>0)"));
  // Actual warehouse note (not a synthetic pulse) must reach the right ledger.
  await poll(()=>evaluate("window.__previewProbe.warehouse"));
  console.log('ORCH_PREVIEW_LIVE',JSON.stringify(await evaluate('window.__previewProbe')));
  const panelHits=await evaluate(`(async()=>{
   const theme=orchestraTheme,normal=state.machines.find(m=>m.type==='垃圾'),inlet=state.machines.find(m=>m.type==='仓入');
   const row=document.querySelector('#warehouseLiveActual tr[data-orch-item]'),item=row?.dataset.orchItem;
   if(!normal||!inlet||!row)return {available:false};
   const stock=row.querySelector('[data-orch-stock]'),t=performance.now(),outlet={id:'__test_warehouse_out',type:'仓出'};
   theme.clear();theme.hit(normal,'out',0,t,item);theme.beginFrame(t);theme.paintPanels(t);
   const ordinaryIgnored=!theme.warehouseHitPending&&!theme.itemHits.size&&!row.getAnimations().length;
   theme.hit(inlet,'in',0,t,item);theme.beginFrame(t);theme.paintPanels(t);
   const green=row.getAnimations()[0]?.effect.getKeyframes()[0].backgroundColor,greenStock=stock.getAnimations().length>0;
   state.machines.push(outlet);
   try{theme.hit(outlet,'out',0,t+1,item);theme.beginFrame(t+1);theme.paintPanels(t+1)}finally{state.machines.pop()}
   const red=row.getAnimations()[0]?.effect.getKeyframes()[0].backgroundColor,redStock=stock.getAnimations().length>0,onlyOne=row.getAnimations().length===1;
   const before=theme.warehouseHitPending;
   const original=warehouseRefreshLive;let refreshes=0;warehouseRefreshLive=function(){refreshes++;return original()};
   try{await new Promise(r=>setTimeout(r,90))}finally{warehouseRefreshLive=original}
   return {available:true,ordinaryIgnored,green,red,greenStock,redStock,onlyOne,before,refreshes,after:theme.warehouseHitPending,inspectorUntouched:!document.querySelector('#inspector [data-orch-dir]')};
  })()`);
  console.log('ORCH_PANEL_HITS',JSON.stringify({previewPanels,panelHits}));
  assert(panelHits.available&&panelHits.ordinaryIgnored&&panelHits.green.includes('78, 224, 155')&&panelHits.red.includes('255, 98, 107')&&panelHits.greenStock&&panelHits.redStock&&panelHits.onlyOne&&panelHits.before&&panelHits.refreshes>0&&!panelHits.after&&panelHits.inspectorUntouched,JSON.stringify(panelHits));
  const inspectorHits=await evaluate(`(()=>{
   const theme=orchestraTheme,oldSelection=selection,oldMarkup=$('inspector').innerHTML,oldKey=$('inspector').dataset.inspectorKey;
   const type=Object.keys(DEF).find(type=>{const rec=getRecipe({type,mode:defaultModeFor(type)});return rec&&Object.keys(rec.inputs||{}).length>0});
   const m={id:'__inspector_test',type,mode:defaultModeFor(type),x:1,y:1,face:'E'},other={...m,id:'__inspector_other'},rec=getRecipe(m),input=Object.keys(rec.inputs)[0],output=rec.output;
   state.machines.push(m,other);sim.byMachine[m.id]=simMachineState();
   try{
    selection={machineId:m.id};inspectorRefresh();
    const root=$('inspector'),summary=root.querySelector('.machine-summary'),row=(dir,item)=>[...root.querySelectorAll('#inspectorStacks .machine-stack-row')].find(el=>{const b=el.querySelector('[data-stack-item]');return b?.dataset.stackItem===item&&b.dataset.stackDirection===dir});
    const a=row('in',input),b=row('out',output),t=performance.now();
    theme.clearInspectorHits();theme.hit(other,'in',0,t,input);theme.beginFrame(t);theme.paintInspector(t);
    const otherIgnored=!summary.getAnimations().length&&!a.getAnimations().length;
    theme.hit(m,'in',0,t+1,input);theme.beginFrame(t+1);theme.paintInspector(t+1);
    const inOnly=a.getAnimations().length===1&&!b.getAnimations().length,summaryFlash=summary.getAnimations().length===1,materialColorCorrect=theme.inspectorHits.get(JSON.stringify(['in',input])).color===materialColor(input),machineColorCorrect=theme.inspectorHits.get('machine').color===theme.color(type),countFlash=a.querySelector('.machine-stack-count').getAnimations().length===1;
    theme.hit(m,'out',0,t+2,output);theme.beginFrame(t+2);theme.paintInspector(t+2);
    const outputFlash=b.getAnimations().length===1&&theme.inspectorHits.get(JSON.stringify(['out',output])).color===materialColor(output);
    const summaryFill=summary.getAnimations()[0].effect.getKeyframes()[0].backgroundColor;
    const subdued=summaryFill.includes('5%')||summaryFill.includes('0.05')||summaryFill.includes('0.95')||summaryFill.includes('95%');
    const saved={state,sim,ware,simTime,frozenSimCache,simVisualDirty,simTransferObserver};let noCraftFlash=false;
    try{
     state={...state,machines:[m],routes:[],frozenFactories:[]};sim={byMachine:{[m.id]:simMachineState()},routes:{},inbound:{},outbound:{},crafts:{},consumed:{},editReturns:{},minuteBuckets:[]};ware={};simTime=0;frozenSimCache=null;
     const ms=sim.byMachine[m.id];for(const [k,n] of Object.entries(rec.inputs))ms.inputs[k]=n;
     let events=0;simTransferObserver=()=>events++;
     simulateBatchSteps(Math.ceil(rec.seconds*20)+2,.05);
     noCraftFlash=events===0&&sim.crafts[output]===rec.qty&&ms.queue.length===rec.qty;
    }finally{state=saved.state;sim=saved.sim;ware=saved.ware;simTime=saved.simTime;frozenSimCache=saved.frozenSimCache;simVisualDirty=saved.simVisualDirty;simTransferObserver=saved.simTransferObserver}

    selection={machineId:other.id};theme.paintInspector(t+3);
    return {otherIgnored,inOnly,summaryFlash,materialColorCorrect,machineColorCorrect,countFlash,outputFlash,subdued,noCraftFlash,cleared:!summary.getAnimations().length&&!a.getAnimations().length&&!b.getAnimations().length};
   }finally{theme.clearInspectorHits();state.machines.splice(-2);delete sim.byMachine[m.id];selection=oldSelection;$('inspector').innerHTML=oldMarkup;$('inspector').dataset.inspectorKey=oldKey||'none'}
  })()`);
  console.log('ORCH_INSPECTOR_HITS',JSON.stringify(inspectorHits));
  assert(inspectorHits&&Object.values(inspectorHits).every(v=>v===true),JSON.stringify(inspectorHits));
  await poll(()=>evaluate('orchestraTheme.rhythm.model.stats().miss>0'));
  assert.equal(await evaluate("document.querySelector('[data-rhythm-miss]').textContent===String(orchestraTheme.rhythm.model.stats().miss)"),true);
  if(!mobile){
   const before=await evaluate('JSON.stringify({tool,selection,m:state.machines.length})');
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'b',code:'KeyB',windowsVirtualKeyCode:66});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'b',code:'KeyB',windowsVirtualKeyCode:66});
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
   assert.equal(await evaluate('JSON.stringify({tool,selection,m:state.machines.length})'),before);
  }

  await evaluate("document.activeElement?.blur();true");await space();await poll(()=>evaluate('!running'));
  const sidebarLock=await evaluate(`(()=>{
   const side=document.querySelector('.main>.side.left'),right=document.querySelector('.main>.side.right'),button=side.querySelector('[data-stamp]'),before=JSON.stringify({tool,stampType,selection,ware,state});
   button.click();const locked=JSON.stringify({tool,stampType,selection,ware,state})===before;
   return {locked,scrollable:!side.inert&&!right.inert,pan:getComputedStyle(side).touchAction,control:getComputedStyle(button).pointerEvents};
  })()`);
  assert(sidebarLock.locked&&sidebarLock.scrollable&&sidebarLock.pan==='pan-y'&&sidebarLock.control==='none',JSON.stringify(sidebarLock));
  if(mobile){
   await evaluate("document.querySelector('[data-mobile-view=warehouse]').click();true");
   await poll(()=>evaluate("mobileActiveView==='warehouse'&&orchestraTheme.rhythm.active&&!running"));
  }
  for(const name of mobile?['right']:['left','right']){
   const pt=await evaluate(`(()=>{const side=document.querySelector('.main>.side.${name}'),spacer=document.createElement('div');spacer.dataset.orchScrollTest='1';spacer.style.cssText='height:1800px;min-height:1800px;flex:none';side.append(spacer);side.scrollTop=0;const r=side.getBoundingClientRect();return {x:r.left+r.width/2,y:${mobile?'r.top+r.height/2':'r.bottom-35'}}})()`);
   if(mobile){await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:pt.x,y:pt.y+90}]});for(let j=1;j<=6;j++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:pt.x,y:pt.y+90-j*30}]});await new Promise(r=>setTimeout(r,16))}await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
   else await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:pt.x,y:pt.y,deltaX:0,deltaY:450});
   await poll(()=>evaluate(`(()=>{const side=document.querySelector('.main>.side.${name}');return side.scrollTop>0||[...side.querySelectorAll('*')].some(el=>el.scrollTop>0)})()`));
   await evaluate("document.querySelector('[data-orch-scroll-test]').remove();true");
  }
  if(mobile){await evaluate("document.querySelector('[data-mobile-view=map]').click();true");await poll(()=>evaluate("mobileActiveView==='map'&&orchestraTheme.rhythm.active&&!running"))}
  console.log('ORCH_SIDEBAR_SCROLL',JSON.stringify(sidebarLock));
  await new Promise(r=>setTimeout(r,80));
  const pauseStats=await evaluate("JSON.stringify({stats:orchestraTheme.rhythm.model.stats(),notes:orchestraTheme.rhythm.model.notes,positions:[...document.querySelectorAll('.orch-rhythm-note')].map(e=>e.style.transform),time:document.querySelector('[data-rhythm-time]').textContent})");
  await new Promise(r=>setTimeout(r,200));
  assert.equal(await evaluate("JSON.stringify({stats:orchestraTheme.rhythm.model.stats(),notes:orchestraTheme.rhythm.model.notes,positions:[...document.querySelectorAll('.orch-rhythm-note')].map(e=>e.style.transform),time:document.querySelector('[data-rhythm-time]').textContent})"),pauseStats);
  const scrollPreserved=await evaluate("(()=>{const r=orchestraTheme.rhythm,score=JSON.stringify(r.model.stats()),notes=JSON.stringify(r.model.notes),e=document.querySelector('[data-rhythm-lead]');e.value=1.37;e.dispatchEvent(new Event('change',{bubbles:true}));return e.type==='number'&&r.lead===1.37&&JSON.stringify(r.model.stats())===score&&JSON.stringify(r.model.notes)===notes})()");
  assert(scrollPreserved,'scroll speed must not restart or change the chart');

  await space();await poll(()=>evaluate('running'));
  const rerollPreview=await evaluate(`(async()=>{
   const theme=orchestraTheme,r=theme.rhythm,old=theme.color('垃圾'),before=JSON.stringify(r.model.notes),original=theme.machine,rendered=[];
   theme.machine=function(m,...args){if(ctx.canvas!==canvas&&ctx.canvas!==r.previewCanvas&&m.type==='垃圾')rendered.push(this.color(m.type));return original.call(this,m,...args)};
   try{
    document.querySelector('[data-orch=random]').click();
    const color=theme.color('垃圾'),reset=r.model.notes.length===0&&r.model.stats().score===0;
    await new Promise(resolve=>setTimeout(resolve,250));
    return {changed:color!==old,reset,rebuilt:rendered.includes(color),oldGone:rendered.every(c=>c===color),isolated:ctx.canvas===canvas,real:sim===window.__rhythmOriginal.sim&&simTime===window.__rhythmOriginal.time};
   }finally{theme.machine=original}
  })()`);
  console.log('ORCH_REROLL_PREVIEW',JSON.stringify(rerollPreview));
  assert(rerollPreview.changed&&rerollPreview.reset&&rerollPreview.isolated&&rerollPreview.real&&(mobile||rerollPreview.rebuilt&&rerollPreview.oldGone),JSON.stringify(rerollPreview));
  const options=await evaluate(`(()=>{
   const r=orchestraTheme.rhythm,set=(q,v)=>{const e=document.querySelector(q);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))};
   set('[data-rhythm-difficulty]','advanced');const advanced=r.difficulty==='advanced'&&r.keys.length===4;set('[data-rhythm-count]',6);const six=r.keys.length===6&&document.querySelectorAll('[data-rhythm-lane]').length===6;
   const only468=[...document.querySelector('[data-rhythm-count]').options].map(e=>e.value).join(',')==='4,6,8';set('[data-rhythm-count]',8);const eight=r.keys.length===8&&document.querySelectorAll('[data-rhythm-key]').length===8&&r.keys[7]==='Semicolon';
   const independent=r.difficulty==='advanced';set('[data-rhythm-difficulty]','hard');const hard=r.difficulty==='hard'&&r.keys.length===8;set('[data-rhythm-count]',4);set('[data-rhythm-difficulty]','easy');set('[data-rhythm-lead]',.8);
   window.__originalRhythmPlan=orchestraRhythmSongPlan;orchestraRhythmSongPlan=()=>({bars:2,repeats:2,phraseSeconds:4,duration:8});
   const a=document.querySelector('[data-rhythm-auto]');a.checked=true;a.dispatchEvent(new Event('change',{bubbles:true}));
   return {advanced,independent,hard,easy:r.difficulty==='easy',six,eight,only468,four:r.keys.length===4,lead:r.lead,auto:r.auto,reset:r.model.stats().score===0,stored:JSON.parse(localStorage.getItem('astra-orchestra-v1')).rhythm};
  })()`);
  assert(options.advanced&&options.independent&&options.hard&&options.easy&&options.stored.difficulty==='easy'&&options.six&&options.eight&&options.only468&&options.four&&options.lead===.8&&options.auto&&options.reset&&options.stored.auto,JSON.stringify(options));
  await poll(()=>evaluate('orchestraTheme.rhythm.model.stats().perfect>0'));
  const autoResult=await evaluate('orchestraTheme.rhythm.model.stats()');
  assert(autoResult.score>0&&autoResult.miss===0&&autoResult.accuracy===1,JSON.stringify(autoResult));
  console.log('ORCH_RHYTHM_AUTO',JSON.stringify({options,autoResult}));
  // A shortened repeated two-bar phrase exercises the actual audio clock.
  const finishDeadline=Date.now()+14000;
  while(Date.now()<finishDeadline&&!await evaluate('orchestraTheme.rhythm.finished'))await new Promise(r=>setTimeout(r,40));
  const finish=await evaluate("(()=>{const r=orchestraTheme.rhythm;return {finished:r.finished,paused:!running,locked:$('run').disabled,result:!document.querySelector('.orch-rhythm-result').hidden,score:r.model.stats().score,miss:r.model.stats().miss}})()");
  console.log('ORCH_RHYTHM_FINISH',JSON.stringify(finish));assert(finish.finished&&finish.paused&&finish.locked&&finish.result&&finish.score>=autoResult.score&&finish.miss===0,JSON.stringify(finish));
  await evaluate("orchestraRhythmSongPlan=window.__originalRhythmPlan;document.querySelector('[data-rhythm-restart]').click();true");
  assert.equal(await evaluate("!orchestraTheme.rhythm.finished&&running&&orchestraTheme.rhythm.model.stats().score===0"),true);
  await evaluate(`(()=>{const a=document.querySelector('[data-rhythm-auto]');a.checked=false;a.dispatchEvent(new Event('change',{bubbles:true}));const l=document.querySelector('[data-rhythm-lead]');l.value=1.2;l.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  const restored=await evaluate("(()=>{const o=window.__rhythmOriginal,same=sim===o.sim&&ware===o.ware&&simTime===o.time&&simClockRemainder===o.remainder&&JSON.stringify({sim,ware})===o.bytes&&frozenSimCache===o.cache&&simLayoutSnapshot===o.snapshot;document.querySelector('[data-rhythm-close]').click();return {same,restored:sim===o.sim&&ware===o.ware&&simTime===o.time&&simClockRemainder===o.remainder&&JSON.stringify({sim,ware})===o.bytes,ghost:!!document.querySelector('.orch-rhythm-transition-ghost')}})()");
  console.log('ORCH_RHYTHM_CONTINUATION',JSON.stringify(restored));assert(restored.same&&restored.restored&&restored.ghost,JSON.stringify(restored));
  await poll(()=>evaluate("!document.querySelector('.orch-rhythm-transition-ghost,.orch-rhythm-transition-map')"));
  assert.equal(await evaluate("!orchestraTheme.rhythm.active&&getComputedStyle(canvas).visibility==='visible'&&running"),true);
  assert.equal(await evaluate("Number(document.querySelector('[data-orch-bpm]').value)"),oldTempo);
  await tap(machinePoint);await tap(machinePoint);await tap(machinePoint);
  await poll(()=>evaluate('orchestraTheme.rhythm.active'));
  await evaluate("document.querySelector('[data-rhythm-close]').click();true");

  await evaluate("document.querySelector('[data-orch=close]').click();true");
  const retrigger=await evaluate(`(()=>{
   const th=orchestraTheme,m=state.machines[0],p=getPorts(m).find(p=>p.kind==='out'),k=m.id+':'+p.kind+':'+p.index,t=performance.now()+1000;
   th.tempo=360;th.clear();th.hit(m,p.kind,p.index,t);th.beginFrame(t-1);
   const future=!th.pulses.size&&th.pendingHits.length===1;
   th.beginFrame(t);const first=th.portEnvelope(t,th.pulses.get(k).shownAt),gap=th.portEnvelope(t+150,th.pulses.get(k).shownAt),bodyGap=th.envelope(t+150,th.pulses.get(k).shownAt);
   th.hit(m,p.kind,p.index,t+167);th.beginFrame(t+167);const second=th.portEnvelope(t+167,th.pulses.get(k).shownAt);
   th.clear();th.hit(m,p.kind,p.index,t);th.beginFrame(t+1600);const late=th.pulses.get(k),latePort=th.portEnvelope(t+1600,late.shownAt),lateBody=th.envelope(t+1600,late.shownAt);
   // Two different ports on one physical machine are separate keys.
   th.clear();const multi=state.machines.find(x=>getPorts(x).length>=2),[a,b]=getPorts(multi);th.hit(multi,a.kind,a.index,t);th.hit(multi,b.kind,b.index,t+70);th.beginFrame(t);th.beginFrame(t+70);
   const ka=multi.id+':'+a.kind+':'+a.index,kb=multi.id+':'+b.kind+':'+b.index,independent=th.portEnvelope(t+70,th.pulses.get(ka).shownAt)<1&&th.portEnvelope(t+70,th.pulses.get(kb).shownAt)===1;
   th.clear();th.tempo=120;
   return {future,first,gap,bodyGap,second,latePort,lateBody,independent};
  })()`);
  console.log('ORCH_RETRIGGER',JSON.stringify(retrigger));
  assert(retrigger.future&&retrigger.first===1&&retrigger.gap===0&&retrigger.bodyGap===0&&retrigger.second===1&&retrigger.latePort===1&&retrigger.lateBody===1&&retrigger.independent,JSON.stringify(retrigger));
  // Controlled pixel test: idle body, future scheduled hit, peak, decay and
  // exact restoration of the cached idle artwork.
  const light=await evaluate(`(()=>{
   running=false;simClockRemainder=0;selection=null;multiSelection=null;draft=null;orchestraTheme.active=true;orchestraTheme.tempo=120;orchestraTheme.clear();
   const m=state.machines[0],[w,h]=dims(m),p=getPorts(m).find(p=>p.kind==='out'),t=performance.now();
   camera={x:pix.w/2-(m.x+w/2)*40,y:pix.h/2-(m.y+h/2)*40,z:40};
   draw();const x=Math.round((camera.x+(m.x+w*.28)*camera.z)*pix.dpr),y=Math.round((camera.y+(m.y+h*.28)*camera.z)*pix.dpr);
   const pixel=()=>Array.from(ctx.getImageData(x,y,1,1).data),sum=a=>a.slice(0,3).reduce((a,b)=>a+b,0);
   const idle=pixel();orchestraTheme.hit(m,p.kind,p.index,t+1000);draw(true);const future=pixel(),pending=orchestraTheme.pendingHits.length;
   function at(time){ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(cachedMap,0,0);ctx.save();ctx.setTransform(pix.dpr,0,0,pix.dpr,0,0);ctx.translate(camera.x,camera.y);ctx.scale(camera.z,camera.z);orchestraTheme.beginFrame(time);orchestraTheme.animate(time);ctx.restore();return pixel()}
   const peak=at(t+1000),decay=at(t+1290),end=at(t+1581),same=(a,b)=>a.every((v,i)=>v===b[i]);
   const luminance=rgb=>rgb.slice(0,3).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   ctx.save();ctx.setTransform(pix.dpr,0,0,pix.dpr,0,0);ctx.translate(camera.x,camera.y);ctx.scale(camera.z,camera.z);
   orchestraTheme.packet(state.routes[0],m.x+w*.28,m.y+h*.28);ctx.restore();const note=pixel();
   const hierarchy=luminance(peak)<luminance(note)*.18&&luminance(idle)<luminance(peak);
   orchestraTheme.active=false;orchestraTheme.clear();draw();
   return {idle,peak,decay,end,note,hierarchy,pending,futureIdle:same(idle,future),restored:same(idle,end),brightens:sum(peak)>sum(idle)+25,decays:sum(peak)>sum(decay)&&sum(decay)>sum(idle)};
  })()`);
  console.log('ORCH_MACHINE_LIGHT',JSON.stringify({rest,light}));
  assert(light.pending===1&&light.futureIdle&&light.brightens&&light.decays&&light.restored&&light.hierarchy,JSON.stringify(light));
  // A hit overlay must not paint over the white note core at either end.
  const endpoint=await evaluate(`(()=>{
   running=false;simClockRemainder=0;orchestraTheme.active=true;
   const r=state.routes[0],g=beltPathGeometry(r);
   const samples=[];
   for(const dir of ['out','in']){
    const m=machineById((dir==='out'?r.from:r.to).id),port=(dir==='out'?r.from:r.to).port,d=dir==='out'?0:g.n,[x,y]=beltPathPoint(g,d);
    camera={x:pix.w/2-x*60,y:pix.h/2-y*60,z:60};orchestraTheme.clear();
    sim.routes[r.id]=[{item:'太空垃圾',distance:d}];draw();
    const px=()=>Array.from(ctx.getImageData(Math.round(pix.w/2*pix.dpr),Math.round(pix.h/2*pix.dpr),1,1).data).slice(0,3);
    const idle=px();orchestraTheme.hit(m,dir,port,performance.now()-220);draw(true);const hit=px();
    samples.push({dir,idle,hit,visible:idle.every((v,i)=>v===hit[i])&&Math.min(...hit)>230});
   }
   orchestraTheme.clear();return samples;
  })()`);
  console.log('ORCH_ENDPOINT',JSON.stringify(endpoint));
  assert(endpoint.every(x=>x.visible),JSON.stringify(endpoint));
  // Check the actual transverse tread pixel, both endpoint hits and decay.
  const treadPulse=await evaluate(`(()=>{
   running=false;simClockRemainder=0;orchestraTheme.active=true;orchestraTheme.tempo=120;orchestraTheme.clear();
   const r=state.routes[0],g=beltPathGeometry(r),d=Math.floor(g.n/2)+.5,[x,y]=beltPathPoint(g,d);
   camera={x:pix.w/2-x*80,y:pix.h/2-y*80,z:80};sim.routes[r.id]=[];beltMotionPhase.set(r.id,.5);draw();
   const row=beltVisualRows().find(row=>row.r.id===r.id),t=performance.now()+1000;
   const read=(dx=0,dy=0)=>Array.from(ctx.getImageData(Math.round((pix.w/2+dx*80)*pix.dpr),Math.round((pix.h/2+dy*80)*pix.dpr),1,1).data).slice(0,3);
   const sample=time=>{
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(cachedMap,0,0);
    ctx.setTransform(pix.dpr,0,0,pix.dpr,0,0);ctx.translate(camera.x,camera.y);ctx.scale(camera.z,camera.z);
    orchestraTheme.railPulse(row,time);orchestraTheme.motion(row,time);ctx.restore();return [read(),read(.3,-.231),read(.3,.231),read(.3,0)]
   };
   const same=(a,b)=>a.every((v,i)=>v===b[i]),sum=a=>a.reduce((n,v)=>n+v,0);
   const samples=[];
   for(const dir of ['in','out']){
    orchestraTheme.clear();const m=machineById((dir==='in'?r.to:r.from).id),port=(dir==='in'?r.to:r.from).port;
    const idle=sample(t);orchestraTheme.hit(m,dir,port,t+100);orchestraTheme.beginFrame(t);
    const future=sample(t);orchestraTheme.beginFrame(t+100);const peak=sample(t+100),tail=sample(t+310),end=sample(t+600);
    const valid=idle.every((v,i)=>same(v,future[i])&&sum(peak[i])>sum(v)+(i===0?45:12)&&sum(tail[i])>sum(v)&&sum(tail[i])<sum(peak[i])&&same(end[i],v)&&Math.max(...peak[i])<243);
    samples.push({dir,idle,peak,tail,end,valid});
   }
   orchestraTheme.clear();return samples;
  })()`);
  console.log('ORCH_TREAD_PULSE',JSON.stringify(treadPulse));assert(treadPulse.every(x=>x.valid),JSON.stringify(treadPulse));
  const halo=await evaluate(`(()=>{
   const color=orchestraTheme.belt(state.routes[0]),sprite=orchestraTheme.noteHalo(color),c=sprite.getContext('2d');
   const alpha=x=>c.getImageData(x,32,1,1).data[3],a=[32,44,52,60,63].map(alpha);
   return {a,reused:sprite===orchestraTheme.noteHalo(color),smooth:a.every((v,i)=>i===0||v<a[i-1])};
  })()`);
  console.log('ORCH_NOTE_HALO',JSON.stringify(halo));assert(halo.reused&&halo.smooth&&halo.a[0]>200&&halo.a.at(-1)<10,JSON.stringify(halo));
  // Actual canvas pixels at a crossing: the later-painted route is on top.
  // Both route orders are tested, as well as the unchanged normal renderer.
  const crossing=await evaluate(`(()=>{
   running=false;simClockRemainder=0;
   const h=state.routes[0],hm=machineById(h.from.id),ht=machineById(h.to.id),cell=h.path[Math.floor(h.path.length/2)],[x,y]=cell;
   const a={...hm,id:'cross-source',x:x-2,y:0,face:'S'},b={...ht,id:'cross-target',x:x-2,y:22,face:'S'};
   a.x+=x-outPort(a,0).x;b.x+=x-inPort(b,0).x;
   const op=outPort(a,0),ip=inPort(b,0),v={id:'cross-v',from:{id:a.id,port:0},to:{id:b.id,port:0},path:Array.from({length:ip.y-op.y-1},(_,i)=>[x,op.y+i+1])};
   state={...state,machines:[hm,ht,a,b],routes:[h,v]};selection=null;multiSelection=null;draft=null;beltTrim=null;
   resetSimulation();simClockRemainder=0;orchestraTheme.active=true;orchestraTheme.clear();
   camera={x:Math.floor(pix.w/2)-(x+.5)*100,y:Math.floor(pix.h/2)-(y+.5)*100,z:100};
   const hp=h.path.findIndex(p=>p[0]===x&&p[1]===y)+.5,vp=v.path.findIndex(p=>p[0]===x&&p[1]===y)+.5;
   if(hp<0||vp<0||!beltConnected(v)||!beltConnected(h))return {valid:false,op,ip,hp,vp,cell};
   const pixel=(dx=0,dy=0)=>Array.from(ctx.getImageData(Math.round((camera.x+(x+.5+dx)*camera.z)*pix.dpr),Math.round((camera.y+(y+.5+dy)*camera.z)*pix.dpr),1,1).data).slice(0,3);
   const same=(a,b)=>a.every((v,i)=>v===b[i]);
   function check(lower,upper,lp,up){
    orchestraTheme.clear();state.routes=[lower,upper];sim.routes={[lower.id]:[],[upper.id]:[]};draw();const empty=pixel(),cuts=orchestraTheme.underpasses(),edge=lower===h?[.22,0]:[0,.22],upperRail=pixel(...edge);
    const m=machineById(lower.from.id);orchestraTheme.hit(m,'out',lower.from.port,performance.now());
    sim.routes[lower.id]=[{item:'太空垃圾',distance:lp}];draw(true);const hidden=pixel(),railHidden=same(upperRail,pixel(...edge)),railPixels=[upperRail,pixel(...edge)];
    sim.routes[upper.id]=[{item:'太空垃圾',distance:up}];draw(true);const visible=pixel();
    return {cut:cuts.get(lower.id)?.length===1&&!cuts.has(upper.id),hidden:same(empty,hidden),railHidden,railPixels,visible:!same(hidden,visible)&&Math.min(...visible)>180};
   }
   const horizontalBelow=check(h,v,hp,vp),verticalBelow=check(v,h,vp,hp);
   state.routes=[h,v];sim.routes={[h.id]:[],[v.id]:[]};draw();
   // In music mode the marks are transverse to the centerline.
   const row=beltVisualRows().find(r=>r.r.id===h.id),moves=[],lines=[],move=ctx.moveTo,line=ctx.lineTo;
   ctx.moveTo=function(x,y){moves.push([x,y]);return move.call(this,x,y)};
   ctx.lineTo=function(x,y){lines.push([x,y]);return line.call(this,x,y)};
   try{orchestraTheme.motion(row)}finally{ctx.moveTo=move;ctx.lineTo=line}
   const transverse=moves.length>0&&moves.every((m,i)=>Math.abs(m[0]-lines[i][0])<1e-8&&Math.abs(m[1]-lines[i][1])>.1);
   orchestraTheme.active=false;sim.routes={[h.id]:[],[v.id]:[]};draw();const ordinary=pixel();
   sim.routes[h.id]=[{item:'太空垃圾',distance:hp}];draw(true);const normalVisible=!same(ordinary,pixel());
   return {valid:true,horizontalBelow,verticalBelow,transverse,normalVisible};
  })()`);
  console.log('ORCH_CROSSING',JSON.stringify(crossing));
  assert(crossing.valid&&crossing.horizontalBelow.cut&&crossing.horizontalBelow.hidden&&crossing.horizontalBelow.railHidden&&crossing.horizontalBelow.visible&&crossing.verticalBelow.cut&&crossing.verticalBelow.hidden&&crossing.verticalBelow.railHidden&&crossing.verticalBelow.visible&&crossing.transverse&&crossing.normalVisible,JSON.stringify(crossing));
  const selectionStyle=await evaluate(`(()=>{
   const theme=orchestraTheme,old={active:theme.active,selection,multiSelection,beltTrim,draft},r=state.routes[0],m=machineById(r.from.id),original=ctx.stroke,strokes=[];
   ctx.stroke=function(...args){strokes.push({color:this.strokeStyle,width:this.lineWidth,dash:this.getLineDash(),alpha:this.globalAlpha});return original.apply(this,args)};
   const sample=fn=>{strokes.length=0;fn();return strokes.slice()};
   const contains=(a,c,w,d)=>a.some(x=>x.color===c&&Math.abs(x.width-w)<1e-6&&(!d||x.dash.length>0));
   try{
    theme.active=true;draft=null;beltTrim=null;multiSelection=null;
    selection={machineId:m.id};const machine=sample(()=>drawStaticScene());
    selection={routeId:r.id};const belt=sample(()=>drawStaticScene());
    beltTrim={routeId:r.id,index:Math.floor(r.path.length/2),hoverAnchor:true};const trim=sample(()=>drawStaticScene());
    beltTrim.hoverAnchor=false;const idleTrim=sample(()=>drawStaticScene());
    beltTrim=null;const preview=sample(()=>{ctx.beginPath();ctx.moveTo(1,1);ctx.lineTo(3,1);theme.editRails('#ffd176',true)});
    const peak=sample(()=>theme.machine(m,...dims(m),{selected:true,energy:1,overlay:true}));
    const railPeak=sample(()=>{ctx.beginPath();ctx.moveTo(1,1);ctx.lineTo(3,1);theme.editRails('#ffd176',true,1)});
    const panelMachine=state.machines.find(supportsMachinePanel),panelWidths=[];
    if(panelMachine){
     const fill=ctx.fillRect;
     ctx.fillRect=function(x,y,w,h){panelWidths.push(Math.min(w,h));return fill.call(this,x,y,w,h)};
     try{theme.indicators(panelMachine,...dims(panelMachine),0);theme.indicators(panelMachine,...dims(panelMachine),1,false,true)}finally{ctx.fillRect=fill}
    }
    theme.active=false;beltTrim={routeId:r.id,index:0,hoverAnchor:true};const normal=sample(()=>drawStaticScene());
    return {machine:contains(machine,'#f3d875',.095*1.5),belt:contains(belt,'#f3d875',.5)&&contains(belt,'#142234',.395),trim:contains(trim,'#ff6478',.5,true)&&contains(trim,'#f3d875',.5),trimNotHover:!idleTrim.some(x=>x.color==='#ff6478'),preview:contains(preview,'#ffd176',.5,true),machinePulse:contains(peak,'#f3d875',.15*1.5),panelPulse:panelWidths.length===2&&Math.abs(panelWidths[0]-.1425)<1e-6&&Math.abs(panelWidths[1]-.225)<1e-6,railPulse:contains(railPeak,'#142234',.335)&&contains(railPeak,'#ffd176',.052*1.5,true),normal:contains(normal,'#ff6478',.45)&&!contains(normal,'#ff6478',.5,true)};
   }finally{ctx.stroke=original;theme.active=old.active;selection=old.selection;multiSelection=old.multiSelection;beltTrim=old.beltTrim;draft=old.draft;draw()}
  })()`);
  console.log('ORCH_SELECTION_STYLE',JSON.stringify(selectionStyle));assert(Object.values(selectionStyle).every(v=>v===true),JSON.stringify(selectionStyle));
  const dense=await evaluate(`(async()=>{
   const a=createOrchestraAudio(()=>120,()=>.8);if(!await a.unlock())return {ready:false};
   const events=Array.from({length:1800},(_,i)=>({id:'dense'+i,time:0.05*Math.floor(i/600),instrument:'piano',n:60+(i%3)*4,volume:.7}));
   const groups=orchestraGroupNotes(events);a.prepare(groups);const start=a.time+.08,at=a.batch(groups,t=>start+t/2);
   const timing=at.every((v,i)=>Math.abs(v-(start+groups[i].time/2))<.0001);
   let peak=0;const buf=new Float32Array(window.orchAnalyser.fftSize);
   for(let i=0;i<16;i++){await new Promise(r=>setTimeout(r,20));window.orchAnalyser.getFloatTimeDomainData(buf);for(const x of buf)peak=Math.max(peak,Math.abs(x))}
   const dropped=a.dropped;a.stop();return {ready:true,groups:groups.length,timing,dropped,peak};
  })()`);
  console.log('ORCH_DENSE',JSON.stringify(dense));
  assert(dense.ready&&dense.groups===9&&dense.timing&&dense.dropped===0&&dense.peak>.001&&dense.peak<1,JSON.stringify(dense));
  const recovery=await evaluate(`(async()=>{
   const a=createOrchestraAudio(()=>120,()=>.6);if(!await a.unlock())return {ready:false};
   a.prepare([{instrument:'piano',n:60}]);const analyser=window.orchAnalyser,ctx=analyser.context,buf=new Float32Array(analyser.fftSize),wait=ms=>new Promise(r=>setTimeout(r,ms));
   async function measure(){a.tone('piano',60,.7,a.time+.04);let peak=0;for(let i=0;i<20;i++){await wait(12);analyser.getFloatTimeDomainData(buf);for(const x of buf)peak=Math.max(peak,Math.abs(x))}return peak}
   const baseline=await measure();a.stop();
   async function dense(){const t=a.time+.03;a.batch(Array.from({length:48},(_,i)=>({instrument:'piano',n:60+i%3,volume:.7,time:t+i*.003})),t=>t);await wait(90)}
   a.prepare([{instrument:'piano',n:61},{instrument:'piano',n:62}]);
   await dense();a.stop();const afterPause=await measure();a.stop();
   await dense();await ctx.suspend();a.stop();await wait(100);await a.unlock();const afterSuspend=await measure();a.stop();
   return {ready:true,baseline,afterPause,afterSuspend};
  })()`);
  console.log('ORCH_AUDIO_RECOVERY',JSON.stringify(recovery));
  assert(recovery.ready&&recovery.baseline>.01&&Math.abs(recovery.afterPause/recovery.baseline-1)<.15&&Math.abs(recovery.afterSuspend/recovery.baseline-1)<.15,JSON.stringify(recovery));
  const channels=await evaluate(`(async()=>{
   const original=AudioContext.prototype.createGain,nodes=[];
   AudioContext.prototype.createGain=function(){const n=original.call(this);nodes.push(n);return n};
   const a=createOrchestraAudio(()=>120,()=>.6);
   try{if(!await a.unlock())return {ready:false}}finally{AudioContext.prototype.createGain=original}
   const names=Object.keys(ORCHESTRA_INSTRUMENTS),master=nodes[0];
   let mix=nodes[1],piano=nodes[2+names.indexOf('piano')],bass=nodes[2+names.indexOf('bass')],kick=nodes[2+names.indexOf('kick')];
   function stopAndTrack(){
    const fresh=[];AudioContext.prototype.createGain=function(){const n=original.call(this);if(this===master.context)fresh.push(n);return n};
    try{a.stop()}finally{AudioContext.prototype.createGain=original}
    if(fresh.length){mix=fresh[0];piano=fresh[1+names.indexOf('piano')];bass=fresh[1+names.indexOf('bass')];kick=fresh[1+names.indexOf('kick')]}
   }
   const wait=ms=>new Promise(r=>setTimeout(r,ms)),analyser=window.orchAnalyser,buf=new Float32Array(analyser.fftSize);
   a.prepare([{instrument:'piano',n:60},{instrument:'bass',n:48},{instrument:'kick',n:36}]);
   async function measure(n,queued=0){
    stopAndTrack();await wait(60);const t=a.time+.08,groups=[{instrument:'bass',n:48,volume:.7,time:t},{instrument:'kick',n:36,volume:.7,time:t},...Array.from({length:n},()=>({instrument:'piano',n:60,volume:.7,time:t})),...Array.from({length:queued},(_,i)=>({instrument:'piano',n:60,volume:.7,time:t+2+i*.01}))];
    a.batch(groups,t=>t);
    while(a.time<t+.01)await wait(1);
    const g={piano:piano.gain.value,bass:bass.gain.value,kick:kick.gain.value,master:master.gain.value,mix:mix.gain.value};
    let peak=0;for(let i=0;i<12;i++){analyser.getFloatTimeDomainData(buf);for(const v of buf)peak=Math.max(peak,Math.abs(v));await wait(12)}
    return {...g,peak};
   }
   const light=await measure(8),dense=await measure(64),sparse=await measure(1),queued=await measure(1,32);
   a.stop();
   const all=names.map((instrument,i)=>({instrument,n:48+i*3,volume:1}));
   a.prepare(all);
   let peak=0,energy=0,samples=0,ms=0;const start=a.time+.07;
   // Simulate actual streaming rather than queue the entire song at once.
   for(let i=0;i<65;i++){
    if(i<48){const t=performance.now();a.batch(all.map(g=>({...g,time:Math.max(a.time+.035,start+i*.035)})),t=>t);ms=Math.max(ms,performance.now()-t)}
    await wait(35);analyser.getFloatTimeDomainData(buf);
    for(const x of buf){peak=Math.max(peak,Math.abs(x));if(i>10&&i<48){energy+=x*x;samples++}}
   }
   a.stop();return {ready:true,light,dense,sparse,queued,peak,rms:Math.sqrt(energy/samples),dropped:a.dropped,maxBatchMs:ms};
  })()`);
  console.log('ORCH_TIMBRE_MIX',JSON.stringify(channels));
  assert(channels.ready&&Math.abs(channels.light.bass-channels.dense.bass)<.02&&Math.abs(channels.light.kick-channels.dense.kick)<.02&&Math.abs(channels.light.master-.6)<.001&&Math.abs(channels.dense.master-.6)<.001&&channels.dense.piano<channels.light.piano&&Math.abs(channels.queued.peak/channels.sparse.peak-1)<.15&&channels.peak<.45&&channels.rms>.001&&channels.rms<.12&&channels.dropped===0,JSON.stringify(channels));
  const transportFade=await evaluate(`(async()=>{
   const sr=48000,c=new OfflineAudioContext(1,sr*.2,sr),source=c.createConstantSource(),gain=c.createGain();
   source.offset.value=.3;gain.gain.value=0;source.connect(gain);gain.connect(c.destination);
   function schedule(from,to,start,duration){const p=orchestraTransportFade(from,to,start,duration);gain.gain.setValueAtTime(from,start);for(let i=1;i<p.times.length;i++)gain.gain.linearRampToValueAtTime(p.values[i],p.times[i])}
   schedule(0,1,.01,.03);schedule(1,0,.09,.045);source.start(0);
   const d=(await c.startRendering()).getChannelData(0);let maxJump=0;
   for(let i=1;i<d.length;i++)maxJump=Math.max(maxJump,Math.abs(d[i]-d[i-1]));
   return {maxJump,initial:d[0],steady:d[Math.round(.06*sr)],half:d[Math.round(.1125*sr)],end:d[Math.round(.14*sr)]};
  })()`);
  console.log('ORCH_TRANSPORT_FADE',JSON.stringify(transportFade));
  assert(transportFade.maxJump<.001&&Math.abs(transportFade.steady-.3)<.001&&Math.abs(transportFade.half-.15)<.001&&Math.abs(transportFade.initial)<.00001&&Math.abs(transportFade.end)<.00001,JSON.stringify(transportFade));
  assert.equal(exceptions.length,0,exceptions.join('\n'));
  console.log('ORCHESTRA_SHARED_PASS',JSON.stringify({mobile,edit,peak:Math.max(...levels),machines:before.n}));
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{if(child?.pid&&process.platform==='win32'){try{require('node:child_process').spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:5000})}catch{}}else child?.kill();server.close();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
