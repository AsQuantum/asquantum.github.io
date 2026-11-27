'use strict';
// Integrate music with the live editor. There is exactly one physical
// simulation, one interactive map, and the original editing controls.
(()=>{
 const settings=(()=>{try{const v=JSON.parse(localStorage.getItem('astra-orchestra-v1'));return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}})();
 settings.bpm=Number.isFinite(settings.bpm)?Math.max(30,Math.min(360,Math.round(settings.bpm))):120;
 settings.volume=Number.isFinite(settings.volume)?Math.max(0,Math.min(1,settings.volume)):.6;
 // Enable shared bar modulation for new scores; respect an explicit opt-out.
 settings.modulate=typeof settings.modulate==='boolean'?settings.modulate:true;
 const save=()=>{try{orchestraStoreMusicPreset(settings);localStorage.setItem('astra-orchestra-v1',JSON.stringify(settings))}catch(e){console.warn('音乐配置保存失败',e)}};
 const audio=createOrchestraAudio(()=>effectiveBpm(),()=>settings.volume);
 const wrap=canvas.closest('.canvaswrap'),root=document.createElement('section');
 root.id='orchestraScore';root.hidden=true;const workspace=wrap.closest('.main');workspace.append(root);
 const header=document.querySelector('.app > header.top'),brand=header.querySelector('.brand'),toolbar=header.querySelector('.sim-toolbar');
 const volumeControl=document.createElement('label');volumeControl.className='sim-speed orch-control orch-only orch-master-volume';volumeControl.hidden=true;
 volumeControl.innerHTML='<span>音量</span><input data-orch-volume type="range" min="0" max="100" step="1" aria-label="主音量"><output data-orch-volume-value></output>';
 const volumeInput=volumeControl.querySelector('input'),volumeValue=volumeControl.querySelector('output');
 function paintVolume(){const n=Math.round(settings.volume*100);volumeInput.value=n;volumeValue.textContent=n+'%'}
 function setVolume(value){settings.volume=Math.max(0,Math.min(1,value));paintVolume();audio.mix();save()}
 volumeInput.addEventListener('input',()=>setVolume(Number(volumeInput.value)/100));
 volumeInput.addEventListener('change',()=>volumeInput.blur());
 paintVolume();
 const bpm=document.createElement('label');bpm.className='sim-speed orch-control orch-only';bpm.hidden=true;bpm.innerHTML='BPM <input data-orch-bpm type="number" min="30" max="360" step="1" aria-label="BPM">';
 const switcher=document.createElement('button'),randomize=document.createElement('button'),exit=document.createElement('button');
 for(const b of [switcher,randomize,exit]){b.className='sim-reset orch-only';b.type='button';b.hidden=true}
 switcher.dataset.orch='switch';switcher.textContent='音符编辑';exit.dataset.orch='close';exit.textContent='退出';
 randomize.dataset.orch='random';randomize.textContent='随机';randomize.title='重新随机所有工厂共用的音乐配置';toolbar.append(volumeControl,bpm,randomize,switcher,exit);
 const title=document.createElement('span');title.className='orch-brand-title';title.innerHTML='<span class="orch-brand-factory">Factory</span> <span class="orch-brand-orchestra">Orchestra ♫</span>';title.hidden=true;
 const badge=document.createElement('div');badge.className='orch-live-status';badge.hidden=true;badge.innerHTML='<span data-orch-status></span><button type="button" data-orch="sound" hidden>启用声音</button>';wrap.append(badge);
 const originalTitle=document.title;
 let active=false,priorSpeed=1,lastSync=0,previousObserver=null,previousSim=null,previousTime=0,events=[],count=0,anchor=null,signature='',lastPaint=0,taps=[],down=null;
 let scoreRevision=0;
 let holds=[],rhythmSession=null,resumeAfterRhythm=false,rhythmLocks=[],transitionLayers=[];
 function effectiveBpm(){return rhythm.active?ORCHESTRA_RHYTHM_BPM:settings.bpm}
 function rhythmClock(){
  const s=rhythmSession;if(!s)return 0;
  return s.anchor===null?s.elapsed:Math.max(s.elapsed,audio.time-s.anchor);
 }
 const rhythm=createOrchestraRhythm(wrap,{clock:rhythmClock,ready:()=>audio.ready,isRunning:()=>running,onClose:closeRhythm,onTimingChange:()=>startRhythmSong(false),onRestart:()=>startRhythmSong(true),onUnlock:()=>audio.unlock(),onSave:save,settings:settings.rhythm&&typeof settings.rhythm==='object'&&!Array.isArray(settings.rhythm)?settings.rhythm:(settings.rhythm={})});
 const factoryPreview=createRhythmFactoryPreview(rhythm.previewCanvas);
 orchestraTheme.rhythm=rhythm;
 orchestraTheme.refreshRhythmWarehouse=()=>{if(rhythm.active)paintRhythmPanels(rhythmSession,rhythmClock(),true)};
 function clearScheduled(){
  audio.stop();audio.setSongProfile(null);orchestraTheme.clear();events=[];anchor=null;rhythm.clearPending();
 }
 function rhythmTempo(on){
  const value=on?ORCHESTRA_RHYTHM_BPM:settings.bpm,input=bpm.querySelector('input');
  simulationSpeed=value/60;orchestraTheme.tempo=value;input.value=value;input.disabled=on;
 }
 function lockFactory(on){
  if(on){
   // While a song plays the original simulator is frozen; editing and
   // manual inventory changes must not modify that saved continuation.
   const inert=[preset,edit];
   workspace.classList.add('orch-rhythm-readonly');
   const disabled=['resetSim','stepMinute','addTestStock','simSpeed'].map(id=>$(id)).filter(Boolean);
   rhythmLocks=[];
   for(const el of inert)if(el){rhythmLocks.push([el,'inert',el.inert]);el.inert=true}
   for(const el of disabled){rhythmLocks.push([el,'disabled',el.disabled]);el.disabled=true}
   const ledger=$('warehousePanel');
   if(ledger){rhythmLocks.push([ledger,'open',ledger.open]);ledger.open=true}
   if(typeof warehouseCardOpen!=='undefined'){rhythmLocks.push([warehouseCardOpen,'actual',warehouseCardOpen.actual]);warehouseCardOpen.actual=true;warehouseRefresh()}
   const panel=$('stockChartPanel');if(panel){rhythmLocks.push([panel,'hidden',panel.hidden]);panel.hidden=true}
  }else{
   for(const [el,k,v] of rhythmLocks)el[k]=v;rhythmLocks=[];workspace.classList.remove('orch-rhythm-readonly');
  }
 }
 // Sidebars remain scrollable. Block delegated and native editing
 // actions, including keyboard activation, without cancelling wheel/touch pan.
 function lockedSide(e){return rhythm.active&&e.target?.closest?.('.main > .side')}
 for(const name of ['click','dblclick','auxclick','contextmenu','submit','input','change','keydown','keyup']){
  document.addEventListener(name,e=>{if(!lockedSide(e))return;e.preventDefault();e.stopImmediatePropagation()},true);
 }
 for(const name of ['pointerdown','pointerup','pointermove','mousedown','mouseup']){
  document.addEventListener(name,e=>{if(lockedSide(e))e.stopImmediatePropagation()},true);
 }
 document.addEventListener('focusin',e=>{if(lockedSide(e))e.target.blur?.()},true);
 function newRhythmSession(plan){
  return {plan,source:createOrchestraRhythmSource(score,plan,true,selection?.machineId??null),song:null,panelFrames:null,packetFrames:null,panelIndex:-1,panelPaintAt:-Infinity,visualQueue:[],chartIndex:0,audioIndex:0,elapsed:-Math.max(1.8,rhythm.lead),anchor:null};
 }
 function startRhythmSong(restart){
  if(!rhythm.active)return;
  const resume=restart||rhythm.finished||running;
  clearScheduled();factoryPreview.reset();const plan=orchestraRhythmSongPlan();
  rhythmSession=newRhythmSession(plan);rhythm.start(plan);paintRhythmPanels(rhythmSession,0,true);$('run').disabled=false;
  if(resume&&!running)$('run').click();audio.unlock();
 }
 function cancelRhythmTransition(){for(const el of transitionLayers)el.remove();transitionLayers=[];for(const a of rhythm.root.getAnimations())a.cancel()}
 function rhythmTransition(enter){
  cancelRhythmTransition();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const c=rhythm.previewCanvas,rect=c.getBoundingClientRect(),host=wrap.getBoundingClientRect();
  const duration=360,easing='cubic-bezier(.22,.75,.25,1)';
  if(!enter){
   const ghost=rhythm.root.cloneNode(true);ghost.classList.add('orch-rhythm-transition-ghost');ghost.inert=true;ghost.setAttribute('aria-hidden','true');
   ghost.querySelectorAll('canvas').forEach(x=>x.remove());wrap.append(ghost);transitionLayers.push(ghost);
   ghost.animate([{opacity:1},{opacity:0}],{duration:240,easing}).onfinish=()=>ghost.remove();
  }else rhythm.root.animate([{opacity:0},{opacity:0,offset:.18},{opacity:1}],{duration,easing});
  if(rect.width<=0||rect.height<=0||!c.width)return;
  const image=document.createElement('canvas');image.width=c.width;image.height=c.height;image.getContext('2d').drawImage(c,0,0);
  image.className='orch-rhythm-transition-map';image.style.cssText='left:'+(rect.left-host.left)+'px;top:'+(rect.top-host.top)+'px;width:'+rect.width+'px;height:'+rect.height+'px';
  const z=Math.max(.01,Math.min(rect.width-12,rect.height-12)/72),scale=camera.z/z;
  const dx=camera.x+36*camera.z-(rect.left-host.left+rect.width/2),dy=camera.y+36*camera.z-(rect.top-host.top+rect.height/2);
  const big={transform:'translate('+dx+'px,'+dy+'px) scale('+scale+')',opacity:1},small={transform:'translate(0,0) scale(1)',opacity:1};
  wrap.append(image);transitionLayers.push(image);
  image.animate(enter?[big,small,{...small,opacity:0}]:[small,big,{...big,opacity:0}],{duration,easing}).onfinish=()=>image.remove();
 }
 function previewFactory(t){
  const s=rhythmSession,frames=s?.packetFrames;
  if(!frames?.length){const initial=s?.source?.initialPackets?.();factoryPreview.render(t,initial||null,initial?-initial.time:0,null,scoreRevision);return}
  const target=orchestraRhythmPhysicalTime(s.plan,rhythmClock());
  let lo=0,hi=frames.length;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(frames[mid].time<=target+1e-8)lo=mid;else hi=mid}
  factoryPreview.render(t,frames[lo],target-frames[lo].time,frames[lo+1],scoreRevision);
 }
 function openRhythm(machine=null){
  if(!active||rhythm.active||!root.hidden||simAdvanceBusy)return;
  rebaseSimulationClock();clearScheduled();document.activeElement?.blur();resumeAfterRhythm=running;
  // The trigger machine remains the selected inspector, even when
  // pointerup has not yet reached the ordinary editor selection handler.
  if(machine){selection={machineId:machine.id};multiSelection=null;inspectorRefresh()}
  const plan=orchestraRhythmSongPlan();rhythmSession=newRhythmSession(plan);
  orchestraTheme.previewItems=new Set(warehouseView(false).actualMaterials);
  rhythm.open(plan);factoryPreview.reset();rhythmTempo(true);lockFactory(true);wrap.classList.add('orch-rhythm-open');canvas.style.visibility='hidden';badge.hidden=true;
  paintRhythmPanels(rhythmSession,0,true);previewFactory(performance.now());rhythmTransition(true);
  if(!running)$('run').click();audio.unlock();
 }
 function closeRhythm(){
  if(!rhythm.active)return;
  rhythmTransition(false);clearScheduled();rhythm.close();rhythmSession=null;orchestraTheme.previewItems=null;rhythmTempo(false);lockFactory(false);$('run').disabled=false;running=resumeAfterRhythm;
  // The real factory never advanced during playback; preserve its
  // original inventory, counters, exact phases and fractional clock.
  resetBeltMotionClock();animationLast=performance.now();wrap.classList.remove('orch-rhythm-open');canvas.style.visibility=root.hidden?'':'hidden';badge.hidden=!root.hidden;draw();warehouseRefresh();warehouseRefreshLive();inspectorRefreshLive();status();
 }
 function pauseRhythmClock(){
  const s=rhythmSession;if(!s||s.anchor===null)return;
  s.elapsed=rhythmClock();s.anchor=null;
  const stoppedAt=audio.time;
  // Only scheduled audio that has actually begun may flash. Future audio
  // is cancelled with the transport and rescheduled on resume.
  for(const entry of s.visualQueue)if(entry.at>stoppedAt)s.audioIndex=Math.min(s.audioIndex,entry.index);
  s.visualQueue.length=0;audio.stop();
  // Requeue only not-yet-started notes that were scheduled just ahead of
  // the pause. Keep the existing chart and all earned judgements.
  // Dropped sources remain dropped; accepted but unstarted sources were
  // requeued above using their actual scheduled start.
 }
 function finishRhythmSong(empty=false){
  paintRhythmPanels(rhythmSession,rhythmSession?.plan.duration||0,true);rhythm.finish(empty);running=false;$('run').disabled=true;audio.stop();orchestraTheme.clear();status();
 }
 function paintRhythmPanels(s,elapsed,force=false){
  if(!s)return;
  if(!s.panelFrames?.length){if(force&&s.source)paintPanelSnapshot(s.source.initialFrame(),0);return}
  const frames=s.panelFrames,target=orchestraRhythmPhysicalTime(s.plan,elapsed);
  let lo=0,hi=frames.length;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(frames[mid].time<=target+1e-8)lo=mid;else hi=mid}
  const now=performance.now();
  if(!force&&!orchestraTheme.panelRefreshNeeded&&(s.panelIndex===lo||lo>s.panelIndex&&now-s.panelPaintAt<40))return;
  s.panelIndex=lo;s.panelPaintAt=now;orchestraTheme.panelRefreshNeeded=false;
  paintPanelSnapshot(frames[lo],target);
 }
 function paintPanelSnapshot(f,target=f.time){
  const saved={sim,ware,simTime,simClockRemainder};
  try{
   orchestraTheme.panelPreview=true;sim=f.sim;ware=f.ware;simTime=f.simTime;simClockRemainder=Math.max(0,Math.min(.05,target-f.time));
   warehouseRefreshLive();inspectorRefreshLive();
  }finally{orchestraTheme.panelPreview=false;sim=saved.sim;ware=saved.ware;simTime=saved.simTime;simClockRemainder=saved.simClockRemainder}
 }
 function flashGroup(group,hitTime){
  for(const ev of group.events||[]){const m=machineById(ev.id);if(m?.type===ev.type)orchestraTheme.hit(m,ev.dir,ev.port,hitTime,ev.item)}
 }
 function updateRhythmSong(){
  const s=rhythmSession;if(!s||rhythm.finished)return;
  if(document.hidden||!audio.ready){pauseRhythmClock();paintRhythmPanels(s,s.elapsed);rhythm.tick(s.elapsed,!!s.source&&running);return}
  if(s.source){
   try{
    if(!s.source.step()){rhythm.tick(0,true);return}
    s.song=s.source.finish();s.panelFrames=s.source.panelFrames();for(const f of s.panelFrames)for(const item of [...Object.keys(f.ware),...Object.keys(f.sim.inbound),...Object.keys(f.sim.outbound)])orchestraTheme.previewItems.add(item);s.packetFrames=s.source.packetFrames();s.source=null;audio.prepare(s.song.map(x=>x.g));audio.setSongProfile(s.song);
   }catch(err){console.error('Rhythm song generation failed',err);s.source=null;s.song=[]}
   if(!s.song.length){finishRhythmSong(true);return}
  }
  if(!running){pauseRhythmClock();paintRhythmPanels(s,s.elapsed);rhythm.tick(s.elapsed);return}
  if(s.anchor===null)s.anchor=audio.time-s.elapsed;
  const now=rhythmClock();s.elapsed=now;
  while(s.chartIndex<s.song.length&&s.song[s.chartIndex].at<=now+ORCHESTRA_RHYTHM_LOOKAHEAD){
   const x=s.song[s.chartIndex++];rhythm.add(x.g,x.at);
  }
  const due=[];
  while(s.audioIndex<s.song.length&&s.song[s.audioIndex].at<=now+.18)due.push(s.song[s.audioIndex++]);
  if(due.length){
   const groups=due.map(x=>x.g);audio.prepare(groups);let i=0;
   const starts=audio.batch(groups,()=>s.anchor+due[i++].at);
   for(let j=0;j<starts.length;j++)if(Number.isFinite(starts[j]))s.visualQueue.push({g:groups[j],at:starts[j],index:s.audioIndex-due.length+j});
  }
  // Audio source starts, not chart lookahead, recipe completions or
  // dropped audio, determine the transfer highlights.
  const heardAt=audio.time;let pending=0;
  for(const entry of s.visualQueue){
   if(entry.at<=heardAt)flashGroup(entry.g,performance.now()-(heardAt-entry.at)*1000);
   else s.visualQueue[pending++]=entry;
  }
  s.visualQueue.length=pending;
  rhythm.tick(now);
  if(now>=s.plan.duration+1.6&&!rhythm.model.notes.length&&s.audioIndex===s.song.length)finishRhythmSong();
 }
 const score=createOrchestraScore(root,settings,save,()=>{scoreRevision++;factoryPreview.reset();buildPalette();draw()},()=>audio.mix(),()=>count,()=>audio.dropped,()=>{if(rhythm.active)startRhythmSong(false);else{rebaseSimulationClock();rhythmTempo(false);clearScheduled();warehouseRefreshLive();inspectorRefreshLive()}});
 // Move the actual controls (not copies) into the music settings on
 // narrow screens. Their listeners, values and shared volume stay intact.
 const compactTransport=matchMedia('(max-width:900px)');
 const mobileSoundSettings=document.createElement('div');
 mobileSoundSettings.className='orch-mobile-sound-settings';
 root.querySelector('.orch-settings-panel').prepend(mobileSoundSettings);
 function placeSoundControls(){
  if(compactTransport.matches){mobileSoundSettings.append(volumeControl,bpm);mobileSoundSettings.hidden=false}
  else{toolbar.insertBefore(volumeControl,randomize);toolbar.insertBefore(bpm,randomize);mobileSoundSettings.hidden=true}
 }
 compactTransport.addEventListener('change',placeSoundControls);placeSoundControls();
 orchestraTheme.score=score;
 function scoreSignature(){return state.machines.map(m=>m.type+':'+getPorts(m).map(p=>p.kind+p.index).join(',')).sort().join('|')}
 function syncScore(force=false){
  const next=scoreSignature();
  if(force||next!==signature){signature=next;score.sync();scoreRevision++;factoryPreview.reset();return true}
  return false
 }
 function status(){const run=$('run');if(run){run.textContent=running?'Ⅱ 暂停':'▶ 播放';run.classList.toggle('sim-running',running)}badge.querySelector('[data-orch-status]').textContent=(!audio.ready?'声音未启用 · ':settings.volume===0?'主音量为零 · ':'')+(running?'演奏中':'暂停')+' · '+count+' 次收发'+(audio.dropped?' · 音频过载 '+audio.dropped:'');badge.querySelector('button').hidden=audio.ready&&settings.volume>0}
 function resetPlaybackForSimulation(){
  if(previousSim===sim&&simTime>=previousTime)return;
  if(rhythm.active)closeRhythm();previousSim=sim;previousTime=simTime;syncScore(true);count=0;clearScheduled();
 }
 function transfer(m,dir,port,item,time){previousObserver?.(m,dir,port,item,time);if(simAdvanceBusy)return;resetPlaybackForSimulation();if(!score.track(m.type)?.ports[dir])syncScore();const i=Math.max(0,orchestraTransferCount(m.id,dir)-1);const track=score.track(m.type);events.push({id:m.id,type:m.type,dir,port,item,time,n:score.pitch(m.type,dir,i,time),instrument:track?.instrument,volume:track?.volume});count++}
 function playEvents(){
  if(!audio.ready){events.length=0;return}
  if(!events.length)return;
  const groups=orchestraGroupNotes(events.splice(0));if(!groups.length)return;
  const speed=settings.bpm/60;
  audio.prepare(groups);const now=audio.time;
  if(!anchor||anchor.real+(groups[0].time-anchor.sim)/speed<now+.025)anchor={sim:groups[0].time,real:now+.065};
  dispatchAudio(groups,t=>anchor.real+(t-anchor.sim)/speed);
 }
 function dispatchAudio(groups,when){
  const times=audio.batch(groups,when);
  for(let i=0;i<groups.length;i++){
   const at=times[i];if(!Number.isFinite(at))continue;
   const hitTime=performance.now()+Math.max(0,at-audio.time)*1000;
   flashGroup(groups[i],hitTime)
  }
 }
 // Transport actions run synchronously, so a pause/resume within one
 // browser frame cannot leave stale audio queued from the old run.
 orchestraTheme.onTransport=on=>{
  if(!active)return;
  if(!on){if(rhythm.active)pauseRhythmClock();else clearScheduled()}
  else audio.unlock();
 };
 orchestraTheme.onFastForward=()=>{if(!active)return;clearScheduled();count=state.machines.reduce((n,m)=>n+orchestraTransferCount(m.id,'in')+orchestraTransferCount(m.id,'out'),0);previousSim=sim;previousTime=simTime};
 const preset=$('presetDropdown'),edit=$('editMenuWrap'),leftHeader=document.createElement('div');
 leftHeader.className='orch-left-header';
 const headerNodes=[brand,preset,edit],slots=new Map();
 function placeHeader(on){
  if(on){
   for(const el of headerNodes){const marker=document.createComment('orchestra header slot');el.before(marker);slots.set(el,marker)}
   header.insertBefore(leftHeader,slots.get(brand));leftHeader.append(...headerNodes);
  }else{
   for(const el of headerNodes)slots.get(el)?.replaceWith(el);
   slots.clear();leftHeader.remove();
  }
 }
 function setTheme(on){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Capture only the existing static map, never a second interactive
  // canvas or frozen logistics simulation. The overlay cannot intercept input.
  const before=canvas.getBoundingClientRect(),positions=[...headerNodes,toolbar].map(el=>[el,el.getBoundingClientRect()]);
  let previous=null;
  if(!reduced&&canvas.style.visibility!=='hidden'&&cachedMap){try{previous=cachedMap.toDataURL()}catch{}}
  wrap.querySelectorAll('.orch-transition-image').forEach(el=>el.remove());
  for(const [el] of positions)for(const a of el.getAnimations())a.cancel();
  placeHeader(on);orchestraTheme.active=on;orchestraTheme.paintPalette(performance.now());orchestraTheme.paintPanels(performance.now());document.body.classList.toggle('orchestra-active',on);title.hidden=!on;if(on)brand.append(title);else title.remove();document.title=on?originalTitle.replace('Factory Lab','Factory Orchestra'):originalTitle;
  for(const b of [volumeControl,bpm,randomize,switcher,exit])b.hidden=!on;
  badge.hidden=!on;root.hidden=true;workspace.classList.remove('orch-score-open');canvas.style.visibility='';switcher.textContent='音符编辑';
  const after=canvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1);
  camera.x+=before.left-after.left;camera.y+=before.top-after.top;
  if(after.width!==pix.w||after.height!==pix.h||dpr!==pix.dpr){
   pix={w:after.width,h:after.height,dpr};canvas.width=Math.round(pix.w*dpr);canvas.height=Math.round(pix.h*dpr);
  }
  resetBeltMotionClock();buildPalette();draw();
  if(!reduced){
   for(const [el,from] of positions){const to=el.getBoundingClientRect();el.animate([{transform:'translate('+(from.left-to.left)+'px,'+(from.top-to.top)+'px)'},{transform:'none'}],{duration:1000,easing:'cubic-bezier(.2,.75,.2,1)'})}
   if(previous){
    const img=document.createElement('img'),r=wrap.getBoundingClientRect();img.className='orch-transition-image';img.alt='';img.setAttribute('aria-hidden','true');
    Object.assign(img.style,{left:(before.left-r.left)+'px',top:(before.top-r.top)+'px',width:before.width+'px',height:before.height+'px'});
    img.src=previous;wrap.append(img);
    const fade=img.animate([{opacity:1},{opacity:0}],{duration:850,easing:'ease-in-out',fill:'forwards'});
    fade.onfinish=()=>img.remove();fade.oncancel=()=>img.remove();
   }
  }
 }
 function strike(x,y){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const fx=document.createElement('div');fx.className='orch-strike';fx.style.left=x+'px';fx.style.top=y+'px';fx.innerHTML='<i></i><i></i><i></i><b></b>'+Array.from({length:12},(_,i)=>'<em style="--angle:'+(i*30)+'deg"></em>').join('');
  document.body.append(fx);setTimeout(()=>fx.remove(),1500);
 }
 function transition(){if(!matchMedia('(prefers-reduced-motion: reduce)').matches)canvas.animate([{filter:'brightness(1.1) saturate(1.12)'},{filter:'none'}],{duration:850,easing:'ease-out'})}
 function open(){
  if(active||simAdvanceBusy)return;
  rebaseSimulationClock();active=true;priorSpeed=simulationSpeed;simulationSpeed=settings.bpm/60;orchestraTheme.tempo=settings.bpm;bpm.querySelector('input').value=settings.bpm;
  previousObserver=simTransferObserver;simTransferObserver=transfer;previousSim=sim;previousTime=simTime;count=state.machines.reduce((n,m)=>n+orchestraTransferCount(m.id,'in')+orchestraTransferCount(m.id,'out'),0);anchor=null;events=[];orchestraTheme.clear();audio.resetDropped();syncScore(true);if(settings.autoRandom)score.randomAll();
  paintVolume();
  setTheme(true);if(!running)$('run').click();transition();audio.unlock();status();
 }
 function close(){
  if(!active)return;closeRhythm();rebaseSimulationClock();active=false;simTransferObserver=previousObserver;previousObserver=null;simulationSpeed=priorSpeed;audio.stop();anchor=null;events=[];score.save();orchestraTheme.clear();setTheme(false);$('run').textContent=running?'❚❚ 暂停模拟':simTime>0?'▶ 继续模拟':'▶ 运行模拟';transition();
 }
 switcher.onclick=()=>{if(!active)return;closeRhythm();root.hidden=!root.hidden;workspace.classList.toggle('orch-score-open',!root.hidden);canvas.style.visibility=root.hidden?'':'hidden';badge.hidden=!root.hidden;switcher.textContent=root.hidden?'音符编辑':'返回画布';if(!root.hidden){syncScore();score.render()}else{root.querySelector('.orch-settings').open=false;draw()}audio.unlock()};
 randomize.onclick=()=>{if(active){syncScore();score.randomAll();audio.unlock()}};
 exit.onclick=close;
 bpm.querySelector('input').onchange=e=>{if(rhythm.active){e.target.value=ORCHESTRA_RHYTHM_BPM;return}rebaseSimulationClock();settings.bpm=Math.max(30,Math.min(360,Math.round(Number(e.target.value)||120)));e.target.value=settings.bpm;simulationSpeed=settings.bpm/60;orchestraTheme.tempo=settings.bpm;clearScheduled();save();audio.unlock()};
 badge.querySelector('button').onclick=()=>{if(!settings.volume){setVolume(.6)}audio.unlock().then(ok=>{if(ok)audio.tone('chime',69,.8,audio.time+.02)})};
 function worldPoint(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left-camera.x)/camera.z,(e.clientY-r.top-camera.y)/camera.z]}
 function center(e){const [x,y]=worldPoint(e);return x>=CENTER.x&&x<CENTER.x+CENTER.w&&y>=CENTER.y&&y<CENTER.y+CENTER.h}
 function heldMachine(e){const [x,y]=worldPoint(e);return state.machines.find(m=>{const [w,h]=dims(m);return x>=m.x&&x<m.x+w&&y>=m.y&&y<m.y+h})}
 function clearGestures(){down=null;taps=[];holds=[]}
 window.addEventListener('pointerdown',e=>{
  if(active&&e.isTrusted&&!audio.ready)audio.unlock();
  if(e.target!==canvas||e.button!==0||!e.isPrimary||e.shiftKey||tool!=='select'||spaceDown||draft||stampType||groupTransform){clearGestures();return}
  const m=active&&!rhythm.active?heldMachine(e):null;
  if(!center(e)&&!m){clearGestures();return}
  down={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now(),machine:m,sim};if(m)taps=[];else holds=[];
 },true);
 window.addEventListener('pointermove',e=>{if(down?.id===e.pointerId&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>9)clearGestures()},true);
 window.addEventListener('pointerup',e=>{
  if(!down||down.id!==e.pointerId)return;
  const d=down;down=null;const now=performance.now(),duration=now-d.t;
  if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>9||d.sim!==sim){clearGestures();return}
  if(d.machine){
   if(!active||rhythm.active||heldMachine(e)?.id!==d.machine.id){holds=[];return}
   // Both a deliberate triple-click and three long holds work. Keep
   // separate timing windows so ordinary machine selection is unaffected.
   const long=duration>=550;if(!long&&duration>500){holds=[];return}
   holds=holds.filter(h=>h.id===d.machine.id&&h.long===long&&now-h.at<(long?10000:1500));holds.push({id:d.machine.id,long,at:now});
   if(holds.length===3){holds=[];strike(e.clientX,e.clientY);openRhythm(d.machine)}
   return;
  }
  if(duration>500||!center(e)){taps=[];return}
  taps=taps.filter(t=>now-t<1400);taps.push(now);if(taps.length===3){taps=[];strike(e.clientX,e.clientY);if(active)close();else{audio.unlock();open()}}
 },true);
 window.addEventListener('pointercancel',clearGestures,true);
 window.addEventListener('blur',clearGestures);
 document.addEventListener('visibilitychange',()=>{
  if(!active)return;
  if(document.hidden){if(rhythm.active){pauseRhythmClock();running=false;status()}else clearScheduled();clearGestures()}
  else if(!rhythm.active){clearScheduled();if(running)audio.unlock()}
 });

 function frame(t){
  if(active){
   resetPlaybackForSimulation();
   previousTime=simTime;
   if(t-lastSync>=180){lastSync=t;syncScore()}
   if(rhythm.active){
    if(typeof mobileEditorActive==='function'&&mobileEditorActive()&&mobileActiveView!=='map'){if(running){pauseRhythmClock();running=false;status()}}
    else if(!wrap.getClientRects().length||getComputedStyle(wrap).visibility==='hidden')closeRhythm();else updateRhythmSong();
   }else if(running&&!document.hidden)playEvents();
   else{if(anchor)clearScheduled();events.length=0}
   if(t-lastPaint>=1000/24){
    lastPaint=t;
    // RAF's timestamp can precede a canvas draw in the same frame.
    // All panel consumers must use the current monotonic clock.
    const now=performance.now();orchestraTheme.beginFrame(now);
    const hit=orchestraTheme.warehouseHitPending,inspect=orchestraTheme.inspectorHitPending;
    orchestraTheme.warehouseHitPending=orchestraTheme.inspectorHitPending=false;
    if(rhythm.active)paintRhythmPanels(rhythmSession,rhythmClock(),hit||inspect);
    else{if(hit)warehouseRefreshLive();if(inspect)inspectorRefreshLive()}
    orchestraTheme.paintPalette(now);orchestraTheme.paintPanels(now);orchestraTheme.paintInspector(now);
    if(rhythm.active)previewFactory(now);status();if(!root.hidden)score.paint(now)
   }
  }
  requestAnimationFrame(frame)
 }
 requestAnimationFrame(frame);
})();
