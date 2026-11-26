'use strict';
// Integrate music with the live editor. There is exactly one physical
// simulation, one interactive map, and the original editing controls.
(()=>{
 const settings=(()=>{try{const v=JSON.parse(localStorage.getItem('astra-orchestra-v1'));return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}})();
 settings.bpm=Number.isFinite(settings.bpm)?Math.max(30,Math.min(360,settings.bpm)):120;
 settings.volume=Number.isFinite(settings.volume)?Math.max(0,Math.min(1,settings.volume)):.6;
 const save=()=>{try{localStorage.setItem('astra-orchestra-v1',JSON.stringify(settings))}catch{}};
 const audio=createOrchestraAudio(()=>settings.bpm,()=>settings.volume);
 const wrap=canvas.closest('.canvaswrap'),root=document.createElement('section');
 root.id='orchestraScore';root.hidden=true;const workspace=wrap.closest('.main');workspace.append(root);
 const header=document.querySelector('.app > header.top'),brand=header.querySelector('.brand'),toolbar=header.querySelector('.sim-toolbar');
 const bpm=document.createElement('label');bpm.className='sim-speed orch-control orch-only';bpm.hidden=true;bpm.innerHTML='BPM <input data-orch-bpm type="number" min="30" max="360" step="1" aria-label="BPM">';
 const switcher=document.createElement('button'),randomize=document.createElement('button'),exit=document.createElement('button');
 for(const b of [switcher,randomize,exit]){b.className='sim-reset orch-only';b.type='button';b.hidden=true}
 switcher.dataset.orch='switch';switcher.textContent='音符编辑';exit.dataset.orch='close';exit.textContent='退出';
 randomize.dataset.orch='random';randomize.textContent='随机';randomize.title='重新随机所有工厂共用的音乐配置';toolbar.append(bpm,randomize,switcher,exit);
 const title=document.createElement('span');title.className='orch-brand-title';title.innerHTML='<span class="orch-brand-factory">Factory</span> <span class="orch-brand-orchestra">Orchestra ♫</span>';title.hidden=true;
 const badge=document.createElement('div');badge.className='orch-live-status';badge.hidden=true;badge.innerHTML='<span data-orch-status></span><button type="button" data-orch="sound" hidden>启用声音</button>';wrap.append(badge);
 const originalTitle=document.title;
 let active=false,priorSpeed=1,lastSync=0,previousObserver=null,previousSim=null,previousTime=0,events=[],count=0,anchor=null,signature='',lastPaint=0,taps=[],down=null;
 const score=createOrchestraScore(root,settings,save,()=>{buildPalette();draw()},()=>audio.mix(),()=>count,()=>audio.dropped,()=>{audio.stop();orchestraTheme.clear();events=[];anchor=null;});
 orchestraTheme.score=score;
 function scoreSignature(){return state.machines.map(m=>m.type+':'+getPorts(m).map(p=>p.kind+p.index).join(',')).sort().join('|')}
 function syncScore(force=false){const next=scoreSignature();if(force||next!==signature){signature=next;score.sync();return true}return false}
 function status(){const run=$('run');if(run){run.textContent=running?'Ⅱ 暂停':'▶ 播放';run.classList.toggle('sim-running',running)}badge.querySelector('[data-orch-status]').textContent=(!audio.ready?'声音未启用 · ':settings.volume===0?'主音量为零 · ':'')+(running?'演奏中':'暂停')+' · '+count+' 次收发'+(audio.dropped?' · 音频过载 '+audio.dropped:'');badge.querySelector('button').hidden=audio.ready&&settings.volume>0}
 function resetPlaybackForSimulation(){
  if(previousSim===sim&&simTime>=previousTime)return;
  previousSim=sim;previousTime=simTime;syncScore(true);count=0;anchor=null;events=[];audio.stop();orchestraTheme.clear();
 }
 function transfer(m,dir,port,item,time){previousObserver?.(m,dir,port,item,time);resetPlaybackForSimulation();if(!score.track(m.type)?.ports[dir])syncScore();const i=Math.max(0,orchestraTransferCount(m.id,dir)-1);const track=score.track(m.type);events.push({id:m.id,type:m.type,dir,port,time,n:score.pitch(m.type,dir,i,time),instrument:track?.instrument,volume:track?.volume});count++}
 function playEvents(){
  if(!audio.ready){events.length=0;return}
  if(!events.length)return;
  const groups=orchestraGroupNotes(events.splice(0));if(!groups.length)return;
  const speed=settings.bpm/60;
  // Warm all required samples before choosing the audio clock anchor.
  // If a frame was late, reanchor the earliest event, not the last tick:
  // distinct simulated ticks retain their time separation.
  audio.prepare(groups);const now=audio.time;
  if(!anchor||anchor.real+(groups[0].time-anchor.sim)/speed<now+.025)anchor={sim:groups[0].time,real:now+.065};
  const times=audio.batch(groups,t=>anchor.real+(t-anchor.sim)/speed);
  for(let i=0;i<groups.length;i++){
   const at=times[i];if(!Number.isFinite(at))continue;
   const hitTime=performance.now()+Math.max(0,at-audio.time)*1000;
   for(const ev of groups[i].events){const m=machineById(ev.id);if(m?.type===ev.type)orchestraTheme.hit(m,ev.dir,ev.port,hitTime)}
  }
 }
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
  placeHeader(on);orchestraTheme.active=on;orchestraTheme.paintPalette(performance.now());document.body.classList.toggle('orchestra-active',on);title.hidden=!on;if(on)brand.append(title);else title.remove();document.title=on?originalTitle.replace('Factory Lab','Factory Orchestra'):originalTitle;
  for(const b of [bpm,randomize,switcher,exit])b.hidden=!on;
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
  active=true;priorSpeed=simulationSpeed;simulationSpeed=settings.bpm/60;orchestraTheme.tempo=settings.bpm;bpm.querySelector('input').value=settings.bpm;
  previousObserver=simTransferObserver;simTransferObserver=transfer;previousSim=sim;previousTime=simTime;count=state.machines.reduce((n,m)=>n+orchestraTransferCount(m.id,'in')+orchestraTransferCount(m.id,'out'),0);anchor=null;events=[];orchestraTheme.clear();audio.resetDropped();syncScore(true);if(settings.autoRandom)score.randomAll();
  root.querySelector('[data-orch-volume]').value=Math.round(settings.volume*100);
  setTheme(true);if(!running)$('run').click();transition();audio.unlock();status();
 }
 function close(){
  if(!active)return;active=false;simTransferObserver=previousObserver;previousObserver=null;simulationSpeed=priorSpeed;audio.stop();anchor=null;events=[];score.save();orchestraTheme.clear();setTheme(false);$('run').textContent=running?'❚❚ 暂停模拟':simTime>0?'▶ 继续模拟':'▶ 运行模拟';transition();
 }
 switcher.onclick=()=>{if(!active)return;root.hidden=!root.hidden;workspace.classList.toggle('orch-score-open',!root.hidden);canvas.style.visibility=root.hidden?'':'hidden';badge.hidden=!root.hidden;switcher.textContent=root.hidden?'音符编辑':'返回画布';if(!root.hidden){syncScore();score.render()}else{root.querySelector('.orch-settings').open=false;draw()}audio.unlock()};
 randomize.onclick=()=>{if(active){syncScore();score.randomAll();audio.unlock()}};
 exit.onclick=close;
 bpm.querySelector('input').onchange=e=>{settings.bpm=Math.max(30,Math.min(360,Math.round(Number(e.target.value)||120)));e.target.value=settings.bpm;simulationSpeed=settings.bpm/60;orchestraTheme.tempo=settings.bpm;audio.stop();orchestraTheme.clear();anchor=null;save();audio.unlock()};
 badge.querySelector('button').onclick=()=>{if(!settings.volume){settings.volume=.6;audio.mix();save()}audio.unlock().then(ok=>{if(ok)audio.tone('chime',69,.8,audio.time+.02)})};
 function center(e){const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left-camera.x)/camera.z,y=(e.clientY-r.top-camera.y)/camera.z;return x>=CENTER.x&&x<CENTER.x+CENTER.w&&y>=CENTER.y&&y<CENTER.y+CENTER.h}
 window.addEventListener('pointerdown',e=>{if(active&&e.isTrusted&&!audio.ready)audio.unlock();if(e.target!==canvas||e.button!==0||!e.isPrimary||tool!=='select'||spaceDown||draft||stampType||groupTransform||!center(e)){down=null;taps=[];return}down={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now()}},true);
 window.addEventListener('pointerup',e=>{if(!down||down.id!==e.pointerId)return;const d=down;down=null;const now=performance.now();if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>9||now-d.t>500||!center(e)){taps=[];return}taps=taps.filter(t=>now-t<1400);taps.push(now);if(taps.length===3){taps=[];strike(e.clientX,e.clientY);if(active)close();else{audio.unlock();open()}}},true);
 window.addEventListener('pointercancel',()=>{down=null;taps=[]},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){audio.stop();orchestraTheme.clear();anchor=null;events=[]}});
 function frame(t){
  if(active){
   resetPlaybackForSimulation();
   previousTime=simTime;
   if(t-lastSync>=180){lastSync=t;syncScore()}if(running&&!document.hidden)playEvents();else{if(anchor){audio.stop();orchestraTheme.clear();anchor=null}events.length=0}
   if(t-lastPaint>=1000/24){lastPaint=t;orchestraTheme.paintPalette(performance.now());status();if(!root.hidden)score.paint(t)}
  }
  requestAnimationFrame(frame)
 }
 requestAnimationFrame(frame);
})();
