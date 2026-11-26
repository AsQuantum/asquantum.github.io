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

  const globalScore=await evaluate("(()=>{const s=JSON.parse(localStorage.getItem('astra-orchestra-v1')),tracks=s.scores['shared-machine-events-v1'],types=Object.keys(DEF).filter(type=>getPorts({type,x:0,y:0,face:'E',mode:defaultModeFor(type)}).length);return {count:types.length,complete:types.every(k=>!!tracks[k]),lengths16:types.every(k=>Object.values(tracks[k].ports).every(p=>p.length===16&&p.every(Number.isInteger))),unused:types.some(k=>!state.machines.some(m=>m.type===k))}})()");
  assert(globalScore.complete&&globalScore.lengths16&&globalScore.unused,JSON.stringify(globalScore));

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
  await space();await poll(()=>evaluate("running"));const playingStyle=await evaluate("(()=>{const b=$('run');return {w:b.getBoundingClientRect().width,bg:getComputedStyle(b).backgroundColor}})()");
  assert.equal(pausedStyle.w,playingStyle.w);assert.match(pausedStyle.bg,/rgb\(52, 74, 121\)/);
  await new Promise(r=>setTimeout(r,1050));
  const headerLayout=await evaluate("(()=>{const a=document.querySelector('.brand').getBoundingClientRect(),b=$('presetDropdown').getBoundingClientRect(),c=$('editMenuWrap').getBoundingClientRect(),d=document.querySelector('.sim-toolbar').getBoundingClientRect();return {ordered:a.right<=b.left+1&&b.right<=c.left+1,center:(d.left+d.right)/2,width:innerWidth,leftFits:c.right<=innerWidth+1,overlap:!(c.right<=d.left+1||c.bottom<=d.top+1),fadeDone:!document.querySelector('.orch-transition-image')}})()");
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
  const modulation=await evaluate("(()=>{const root=document.getElementById('orchestraScore'),toggle=root.querySelector('[data-orch-modulate]');toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));const s=JSON.parse(localStorage.getItem('astra-orchestra-v1')),plan=s.keyPlan,score=orchestraTheme.score,track=score.track('垃圾');const old=track.instrument;track.instrument='bass';const a=score.pitch('垃圾','out',0,0),b=score.pitch('垃圾','out',0,4),c=score.pitch('垃圾','out',0,16);track.instrument='kick';const drum=score.pitch('垃圾','out',0,4);track.instrument=old;toggle.checked=false;toggle.dispatchEvent(new Event('change',{bubbles:true}));return {plan,a,b,c,drum,off:score.pitch('垃圾','out',0,4)}})()");
  assert(modulation.plan.length===4&&[0,5,7].includes(modulation.plan[1])&&(modulation.b-modulation.a+120)%12===modulation.plan[1]&&modulation.c===modulation.a&&modulation.drum===modulation.a&&modulation.off===modulation.a,JSON.stringify(modulation));
  console.log('ORCH_GLOBAL_SCORE',JSON.stringify({globalScore,modulation}));
  const lengths=await evaluate("(()=>{const root=document.getElementById('orchestraScore'),box=root.querySelector('[data-orch-random-length]'),select=root.querySelector('[data-orch-length]'),click=()=>root.querySelector('[data-orch=random-all]').click(),read=()=>JSON.parse(localStorage.getItem('astra-orchestra-v1'));box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));let valid=true;const seen=[];for(const r of [.1,.5,.9]){const old=Math.random;try{Math.random=()=>r;click()}finally{Math.random=old}const s=read(),n=Number(select.value)*4;seen.push(n);valid&&=Object.values(s.scores['shared-machine-events-v1']).every(t=>Object.values(t.ports).every(p=>p.length===n))&&s.keyPlan.length===n/4}box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}));select.value='4';select.dispatchEvent(new Event('change',{bubbles:true}));return {seen,valid}})()");
  assert.deepEqual(lengths,{seen:[4,8,16],valid:true});console.log('ORCH_LENGTHS',JSON.stringify(lengths));
  const edit=await evaluate("(()=>{const root=document.getElementById('orchestraScore');root.querySelector('[data-orch=random-all]').click();const stored=JSON.parse(localStorage.getItem('astra-orchestra-v1')).scores['shared-machine-events-v1'];return {length:stored['垃圾'].ports['out'].length,loop:root.querySelector('[data-orch-loop]').textContent,playing:running}})()");
  console.log('ORCH_EDIT',JSON.stringify(edit));assert.equal(edit.length,16);assert.match(edit.loop,/16 音符位/);assert(edit.playing);
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
   camera={x:pix.w/2-(x+.5)*40,y:pix.h/2-(y+.5)*40,z:40};
   const hp=h.path.findIndex(p=>p[0]===x&&p[1]===y)+.5,vp=v.path.findIndex(p=>p[0]===x&&p[1]===y)+.5;
   if(hp<0||vp<0||!beltConnected(v)||!beltConnected(h))return {valid:false,op,ip,hp,vp,cell};
   const pixel=(dx=0,dy=0)=>Array.from(ctx.getImageData(Math.round((camera.x+(x+.5+dx)*camera.z)*pix.dpr),Math.round((camera.y+(y+.5+dy)*camera.z)*pix.dpr),1,1).data).slice(0,3);
   const same=(a,b)=>a.every((v,i)=>v===b[i]);
   function check(lower,upper,lp,up){
    state.routes=[lower,upper];sim.routes={[lower.id]:[],[upper.id]:[]};draw();const empty=pixel(),cuts=orchestraTheme.underpasses();
    sim.routes[lower.id]=[{item:'太空垃圾',distance:lp}];draw(true);const hidden=pixel();
    sim.routes[upper.id]=[{item:'太空垃圾',distance:up}];draw(true);const visible=pixel();
    return {cut:cuts.get(lower.id)?.length===1&&!cuts.has(upper.id),hidden:same(empty,hidden),visible:!same(hidden,visible)&&Math.min(...visible)>180};
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
  assert(crossing.valid&&crossing.horizontalBelow.cut&&crossing.horizontalBelow.hidden&&crossing.horizontalBelow.visible&&crossing.verticalBelow.cut&&crossing.verticalBelow.hidden&&crossing.verticalBelow.visible&&crossing.transverse&&crossing.normalVisible,JSON.stringify(crossing));
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
  assert.equal(exceptions.length,0,exceptions.join('\n'));
  console.log('ORCHESTRA_SHARED_PASS',JSON.stringify({mobile,edit,peak:Math.max(...levels),machines:before.n}));
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{if(child?.pid&&process.platform==='win32'){try{require('node:child_process').spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:5000})}catch{}}else child?.kill();server.close();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
