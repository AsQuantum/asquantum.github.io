'use strict';
// Deterministic chart adapter for live scheduled audio. The chart never
// generates or removes music; it only selects a playable subset of onsets.
const ORCHESTRA_RHYTHM_LAYOUTS={
 4:{keys:['KeyD','KeyF','KeyJ','KeyK'],labels:['D','F','J','K']},
 6:{keys:['KeyS','KeyD','KeyF','KeyJ','KeyK','KeyL'],labels:['S','D','F','J','K','L']},
 8:{keys:['KeyA','KeyS','KeyD','KeyF','KeyJ','KeyK','KeyL','Semicolon'],labels:['A','S','D','F','J','K','L',';']}
};
// Key count changes the lane assignment only. Difficulty controls the
// chart's global note rate, chord size and recovery between onsets.
const ORCHESTRA_RHYTHM_DIFFICULTIES={
 easy:{density:3,chord:1,gap:.40,onsetGap:.30,label:'简单'},
 advanced:{density:6,chord:2,gap:.22,onsetGap:.105,label:'进阶'},
 hard:{density:10,chord:3,gap:.16,onsetGap:.065,label:'困难'},
 crazy:{all:true,label:'疯狂'}
};
function orchestraRhythmDifficulty(value){return Object.hasOwn(ORCHESTRA_RHYTHM_DIFFICULTIES,value)?value:'easy'}
const ORCHESTRA_RHYTHM_LEAD=1.2,ORCHESTRA_RHYTHM_BPM=120,ORCHESTRA_RHYTHM_LOOKAHEAD=3,ORCHESTRA_RHYTHM_MIN_LEAD=.5;
// Repeat one 16-bar zero-start factory phrase twice at 120 BPM.
function orchestraRhythmSongPlan(){
 const bars=16,repeats=2,phraseSeconds=bars*4*60/ORCHESTRA_RHYTHM_BPM;
 return {bars,repeats,phraseSeconds,duration:phraseSeconds*repeats};
}
function orchestraRhythmLoopGroups(groups,plan){
 const out=[];
 for(let i=0;i<plan.repeats;i++)for(const g of groups){
  const offset=g.time/2,at=i*plan.phraseSeconds+offset;
  if(offset>=0&&offset<=plan.phraseSeconds+1e-9&&at<=plan.duration+1e-9)out.push({g,at});
 }
 return out;
}
// Both visual consumers use this same phrase-relative physical clock.
// At a repeat boundary the next phrase starts at zero; at the final
// endpoint retain the completed last phrase for the result.
function orchestraRhythmPhysicalTime(plan,elapsed){
 const t=Math.max(0,Math.min(plan.duration,elapsed));
 return 2*(t>=plan.duration?plan.phraseSeconds:t%plan.phraseSeconds);
}
function orchestraRhythmTime(seconds){const n=Math.max(0,Math.ceil(seconds));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')}

function createOrchestraRhythmModel(laneCount=4,difficulty='easy'){
 let layout=ORCHESTRA_RHYTHM_LAYOUTS[laneCount]||ORCHESTRA_RHYTHM_LAYOUTS[4],last=Array(layout.keys.length).fill(-Infinity),limits=ORCHESTRA_RHYTHM_DIFFICULTIES[orchestraRhythmDifficulty(difficulty)];
 const windows={perfect:.060,great:.115,good:.180},notes=[],recent=[];
 let chordAt=-Infinity,chordStacks=[];
 let serial=0,score=0,combo=0,maxCombo=0,perfect=0,great=0,good=0,miss=0;
 function clearPending(){notes.length=0;last.fill(-Infinity);recent.length=0;chordAt=-Infinity;chordStacks=[]}
 function resetStats(){score=combo=maxCombo=perfect=great=good=miss=0}
 function reset(){clearPending();serial=0;resetStats()}
 function configure(count,difficulty){layout=ORCHESTRA_RHYTHM_LAYOUTS[count]||ORCHESTRA_RHYTHM_LAYOUTS[4];if(difficulty!==undefined)limits=ORCHESTRA_RHYTHM_DIFFICULTIES[orchestraRhythmDifficulty(difficulty)];last=Array(layout.keys.length).fill(-Infinity);reset()}
 function add(group,at){
  if(!Number.isFinite(at)||!Number.isInteger(group.n)||at<0)return null;
  // Real audio onsets, not a ranking of high-throughput machines.
  // Keep a preferred pitch/timbre lane when possible, use a free lane
  // for collisions, and thin bursts independently of audio playback.
  const inst=Object.keys(ORCHESTRA_INSTRUMENTS).indexOf(group.instrument),count=last.length,preferred=((group.n+Math.max(0,inst)*3)%count+count)%count;
  let lane=-1,stack=null,slot=0;
  if(limits.all){
   // Keep every audible group at its original time. Spread a chord
   // across all keys before stacking overflow on the same onset.
   if(Math.abs(at-chordAt)>1e-9){chordAt=at;chordStacks=Array.from({length:count},()=>({count:0}))}
   for(let i=0;i<count;i++){
    const k=(preferred+i)%count;
    if(lane<0||chordStacks[k].count<chordStacks[lane].count||
       (chordStacks[k].count===chordStacks[lane].count&&last[k]<last[lane]))lane=k;
   }
   stack=chordStacks[lane];slot=stack.count++;
  }else{
   while(recent.length&&recent[0]<=at-1)recent.shift();
   if(recent.length>=limits.density||recent.filter(t=>Math.abs(at-t)<.04).length>=limits.chord)return null;
   const latest=recent.at(-1);
   if(latest!=null&&at-latest>=.04&&at-latest<limits.onsetGap)return null;
   for(let i=0;i<count;i++){const k=(preferred+i)%count;if(at-last[k]>=limits.gap-1e-9){lane=k;break}}
   if(lane<0)return null;
   recent.push(at);
  }
  const note={id:++serial,lane,at,color:ORCHESTRA_INSTRUMENTS[group.instrument]?.color||'#a5c9ff'};
  if(stack){note.stack=stack;note.slot=slot}
  notes.push(note);last[lane]=at;return note;
 }
 function judge(note,grade,delta=0){
  const i=notes.indexOf(note);if(i<0)return null;notes.splice(i,1);
  if(grade==='MISS'){miss++;combo=0}
  else{if(grade==='PERFECT'){perfect++;score+=1000}else if(grade==='GREAT'){great++;score+=700}else{good++;score+=400}combo++;maxCombo=Math.max(maxCombo,combo)}
  return {note,grade,delta};
 }
 function expire(now){
  const out=[];for(const n of notes.slice())if(now-n.at>windows.good)out.push(judge(n,'MISS',now-n.at));return out;
 }
 function autoplay(now){const out=[];for(const n of notes.slice())if(n.at<=now)out.push(judge(n,'PERFECT',0));return out}
 function press(lane,now){
  const expired=expire(now);let best=null,dist=Infinity;
  for(const n of notes)if(n.lane===lane&&Math.abs(now-n.at)<dist){best=n;dist=Math.abs(now-n.at)}
  const hits=[];
  if(best&&dist<=windows.good){
   const grade=dist<=windows.perfect?'PERFECT':dist<=windows.great?'GREAT':'GOOD';
   const simultaneous=limits.all?notes.filter(n=>n.lane===lane&&Math.abs(n.at-best.at)<=1e-9):[best];
   for(const n of simultaneous)hits.push(judge(n,grade,now-n.at));
  }
  return {expired,hit:hits[0]||null,hits};
 }
 function stats(){const total=perfect+great+good+miss;return {score,combo,maxCombo,perfect,great,good,miss,accuracy:total?(perfect+great*.7+good*.4)/total:1}}
 return {notes,windows,add,expire,press,autoplay,clearPending,reset,resetStats,configure,stats};
}
function orchestraRhythmLead(value,fallback=ORCHESTRA_RHYTHM_LEAD){
 const n=Number(value);return value==null||String(value).trim()===''||!Number.isFinite(n)?fallback:Math.round(Math.max(ORCHESTRA_RHYTHM_MIN_LEAD,Math.min(ORCHESTRA_RHYTHM_LOOKAHEAD,n))*100)/100;
}
const ORCHESTRA_RHYTHM_GRADE_COLORS={MISS:'#ff626b',GOOD:'#60aaff',GREAT:'#60e397',PERFECT:'#ffd268'};
// Shared compact judgement display for the live HUD and final result.
const ORCHESTRA_RHYTHM_GRADES=['MISS','GOOD','GREAT','PERFECT'];
function orchestraRhythmGradeMarkup(live=false){
 return '<div class="orch-rhythm-grade-summary" data-rhythm-grades><div class="orch-rhythm-grade-counts">'+ORCHESTRA_RHYTHM_GRADES.map(g=>'<span style="--grade-color:'+ORCHESTRA_RHYTHM_GRADE_COLORS[g]+'"><small>'+g+'</small><b data-rhythm-grade-count="'+g+'"'+(live&&g==='MISS'?' data-rhythm-miss':'')+'>0</b></span>').join('')+'</div>'+(live?'':'<div class="orch-rhythm-grade-bar" aria-hidden="true">'+ORCHESTRA_RHYTHM_GRADES.map(g=>'<i data-rhythm-grade-segment="'+g+'" style="background:'+ORCHESTRA_RHYTHM_GRADE_COLORS[g]+';width:0%"></i>').join('')+'</div>')+'</div>';
}
function createOrchestraRhythm(wrap,{clock,ready,isRunning,onClose,onTimingChange=()=>{},onRestart=()=>{},onUnlock=()=>{},onSave=()=>{},settings={}}){
 let laneCount=[4,6,8].includes(settings.lanes)?settings.lanes:4,lead=orchestraRhythmLead(settings.lead),auto=settings.auto===true,difficulty=orchestraRhythmDifficulty(settings.difficulty);
 const model=createOrchestraRhythmModel(laneCount,difficulty),root=document.createElement('section'),els=new Map(),held=new Set(),flashes=new Map(),railFlashes=new Map();
 let active=false,finished=false,lastStats='',lanes=[],keys=[],railOnsets=[],railIndex=0,plan=orchestraRhythmSongPlan(null);
 root.className='orch-rhythm';root.hidden=true;root.setAttribute('aria-label','Factory Rhythm');
 root.innerHTML='<div class="orch-rhythm-top"><div><span class="orch-rhythm-eyebrow">FACTORY ORCHESTRA</span><strong>Rhythm</strong></div><div class="orch-rhythm-stats"><div><small>分数</small><b data-rhythm-score>000000</b></div><div><small>准确率</small><b data-rhythm-accuracy>100.0%</b></div><div><small>连击</small><b data-rhythm-combo>0</b></div>'+orchestraRhythmGradeMarkup(true)+'</div><button type="button" data-rhythm-close aria-label="关闭音游">×</button></div><div class="orch-rhythm-controls"><label>轨道 <select data-rhythm-count><option value="4">4K</option><option value="6">6K</option><option value="8">8K</option></select></label><label>难度 <select data-rhythm-difficulty aria-label="谱面难度"><option value="easy">简单</option><option value="advanced">进阶</option><option value="hard">困难</option><option value="crazy">疯狂</option></select></label><label>下落 <input type="number" data-rhythm-lead min="0.5" max="3" step="0.01" inputmode="decimal" aria-label="下落时间（秒）"> 秒</label><label class="orch-rhythm-auto"><input type="checkbox" data-rhythm-auto> 自动演奏</label><span data-rhythm-mode>手动模式</span></div><div class="orch-rhythm-song"><span class="orch-rhythm-tempo">120 BPM</span><span data-rhythm-time>0:00 / 1:04</span><div class="orch-rhythm-progress"><i></i></div><span data-rhythm-plan>限时演奏</span></div><div class="orch-rhythm-body"><div class="orch-rhythm-factory" aria-label="工厂预演"><canvas data-rhythm-factory aria-label="工厂全图"></canvas><span>工厂预演</span></div><div class="orch-rhythm-stage"><div class="orch-rhythm-field"><div class="orch-rhythm-lanes"></div><div class="orch-rhythm-judge-line"></div><div class="orch-rhythm-hint"></div></div><div class="orch-rhythm-keys"></div></div><div class="orch-rhythm-balance" aria-hidden="true"></div></div><div class="orch-rhythm-result" hidden><div class="orch-rhythm-result-card"><small data-rhythm-result-mode></small><strong>演奏结束</strong><b data-rhythm-final-score></b><div data-rhythm-result-detail></div>'+orchestraRhythmGradeMarkup()+'<div class="orch-rhythm-result-actions"><button type="button" data-rhythm-restart>再演奏一次</button><button type="button" data-rhythm-return>返回工厂</button></div></div></div><div class="orch-rhythm-foot"><span>音符抵达判定线时按键 · 触屏可直接点击</span><span>Esc 退出 · 短按空格暂停</span></div>';
 wrap.append(root);
 const q=s=>root.querySelector(s),field=q('.orch-rhythm-field'),hint=q('.orch-rhythm-hint');
 function saveOptions(){settings.lanes=laneCount;settings.difficulty=difficulty;settings.lead=lead;settings.auto=auto;onSave()}
 function paintOptions(){
  q('[data-rhythm-count]').value=laneCount;q('[data-rhythm-difficulty]').value=difficulty;q('[data-rhythm-lead]').value=lead;q('[data-rhythm-auto]').checked=auto;
  q('[data-rhythm-mode]').textContent=auto?'AUTO · 演示计分':'手动模式';root.classList.toggle('orch-rhythm-auto-on',auto);
 }
 function buildLanes(){
  const labels=ORCHESTRA_RHYTHM_LAYOUTS[laneCount].labels;root.style.setProperty('--rhythm-lanes',laneCount);
  q('.orch-rhythm-lanes').innerHTML=labels.map((_,i)=>'<div class="orch-rhythm-lane" data-rhythm-lane="'+i+'"><i class="orch-rhythm-hit-beam"></i><i class="orch-rhythm-rail-glow"></i><div class="orch-rhythm-grade" aria-hidden="true"></div></div>').join('');
  q('.orch-rhythm-keys').innerHTML=labels.map((key,i)=>'<button type="button" data-rhythm-key="'+i+'" aria-label="'+key+' 音轨">'+key+'</button>').join('');
  lanes=[...root.querySelectorAll('[data-rhythm-lane]')];keys=[...root.querySelectorAll('[data-rhythm-key]')];
  for(const b of keys){
   const lane=Number(b.dataset.rhythmKey);
   b.addEventListener('pointerdown',e=>{e.preventDefault();try{b.setPointerCapture?.(e.pointerId)}catch{}press(lane)});
   for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,()=>release(lane));
  }
 }
 function clearFlashes(){for(const a of railFlashes.values())a.cancel();railFlashes.clear();for(const list of flashes.values())for(const a of list)a.cancel();flashes.clear();for(const el of [...keys,...lanes]){el.classList.remove('pressed');delete el.dataset.grade}}
 function flash(note,grade){
  const i=note.lane,lane=lanes[i],key=keys[i];if(!lane||!key)return;
  for(const a of flashes.get(i)||[])a.cancel();
  const miss=grade==='MISS',color=ORCHESTRA_RHYTHM_GRADE_COLORS[grade];
  key.style.setProperty('--hit-color',color);lane.style.setProperty('--hit-color',color);
  const label=lane.querySelector('.orch-rhythm-grade'),beam=lane.querySelector('.orch-rhythm-hit-beam');
  label.textContent=grade;label.dataset.grade=grade;label.style.setProperty('--grade-color',color);
  const animate=(el,frames,options)=>el.animate?.(frames,options);
  const anims=[animate(label,[{opacity:0,transform:'translate(-50%,0)'},{opacity:.9,transform:'translate(-50%,-3px)',offset:.12},{opacity:.9,transform:'translate(-50%,-6px)',offset:.45},{opacity:0,transform:'translate(-50%,-15px)'}],{duration:460,easing:'ease-out'})];
  if(!miss){
   anims.push(animate(beam,[{opacity:.48},{opacity:.19,offset:.32},{opacity:0}],{duration:220,easing:'ease-out'}));
   anims.push(animate(key,[{backgroundColor:color+'55',boxShadow:'inset 0 0 12px '+color+'b0,0 0 9px '+color+'88',borderColor:color},{backgroundColor:'#1e3048',boxShadow:'none',borderColor:'#506789'}],{duration:240,easing:'ease-out'}));
  }
  flashes.set(i,anims.filter(Boolean));
 }
 paintOptions();buildLanes();
 function paintStats(){
  const s=model.stats(),sig=JSON.stringify(s);if(sig===lastStats)return;lastStats=sig;
  q('[data-rhythm-score]').textContent=String(s.score).padStart(6,'0');
  q('[data-rhythm-accuracy]').textContent=(s.accuracy*100).toFixed(1)+'%';
  q('[data-rhythm-combo]').textContent=s.combo;
  const total=s.miss+s.good+s.great+s.perfect;
  for(const display of root.querySelectorAll('[data-rhythm-grades]'))for(const grade of ORCHESTRA_RHYTHM_GRADES){
   const count=s[grade.toLowerCase()];
   display.querySelector('[data-rhythm-grade-count="'+grade+'"]').textContent=count;
   const segment=display.querySelector('[data-rhythm-grade-segment="'+grade+'"]');if(segment)segment.style.width=(total?100*count/total:0)+'%';
  }
 }
 function release(lane){held.delete(lane);keys[lane]?.classList.remove('pressed');lanes[lane]?.classList.remove('pressed')}
 function clearPending(){
  model.clearPending();railOnsets=[];railIndex=0;for(const el of els.values())el.remove();els.clear();for(let i=0;i<keys.length;i++)release(i);clearFlashes();
  hint.textContent='';paintStats();
 }
 function progress(elapsed){
  const t=Math.max(0,Math.min(plan.duration,elapsed));q('[data-rhythm-time]').textContent=orchestraRhythmTime(t)+' / '+orchestraRhythmTime(plan.duration);
  q('.orch-rhythm-progress i').style.width=(100*t/plan.duration)+'%';
 }
 function start(song){plan=song;finished=false;model.reset();clearPending();q('.orch-rhythm-result').hidden=true;
  q('[data-rhythm-plan]').textContent=plan.bars+' 小节 × '+plan.repeats;
  q('[data-rhythm-plan]').title='从零开始生成一段工厂音乐并重复演奏，不修改真实工厂库存。';
  progress(0);hint.textContent='等待工厂音符…';lastStats='';paintStats();
 }
 function open(song){active=true;root.hidden=false;start(song)}
 function finish(empty=false){
  if(finished)return;finished=true;if(!empty)progress(plan.duration);const s=model.stats();paintStats();clearFlashes();
  q('[data-rhythm-result-mode]').textContent=(auto?'AUTO · 演示成绩':'MANUAL · 手动成绩')+' · '+laneCount+'K · '+ORCHESTRA_RHYTHM_DIFFICULTIES[difficulty].label;
  q('[data-rhythm-final-score]').textContent=s.score.toLocaleString();
  q('[data-rhythm-result-detail]').textContent=empty?'整首曲目没有可播放的音符，请检查工厂是否有正常物流。':'准确率 '+(s.accuracy*100).toFixed(1)+'% · 最大连击 '+s.maxCombo;
  q('.orch-rhythm-result').hidden=false;hint.textContent='';
 }

 function close(){active=false;finished=false;clearPending();root.hidden=true;q('.orch-rhythm-result').hidden=true}
 function reset(){model.reset();clearPending()}
 function add(group,at){
  if(!active||finished)return;
  const n=model.add(group,at);if(!n)return;railOnsets.push(n);
  const el=document.createElement('div');el.className='orch-rhythm-note';el.style.setProperty('--note-color',n.color);el.style.transform='translateY(-100px)';lanes[n.lane].append(el);els.set(n.id,el);
 }
 function result(r,show=true){
  if(!r)return;els.get(r.note.id)?.remove();els.delete(r.note.id);
  if(show)flash(r.note,r.grade);
 }
 function results(list){
  const latest=new Map();
  for(const r of list){if(!r)continue;result(r,false);latest.set(r.note.lane,r)}
  for(const r of latest.values())flash(r.note,r.grade);
 }
 function press(lane){
  if(!active||finished||!isRunning())return;if(!ready()){onUnlock();return}if(auto||held.has(lane))return;
  held.add(lane);keys[lane].classList.add('pressed');lanes[lane].classList.add('pressed');
  const r=model.press(lane,clock());results([...r.expired,...r.hits]);paintStats();
 }
 function tick(elapsed=0,preparing=false){
  if(!active||finished)return;progress(elapsed);
  if(preparing){hint.textContent='正在生成'+plan.bars+'小节谱面…';return}
  if(!ready()||!isRunning()){hint.textContent=ready()?'已暂停':'点击任意音轨启用声音';return}
  const now=clock(),height=field.clientHeight,hitY=height*.84;
  const pulseByLane=new Map();
  while(railIndex<railOnsets.length&&railOnsets[railIndex].at<=now){
   const n=railOnsets[railIndex++];pulseByLane.set(n.lane,n);
  }
  for(const n of pulseByLane.values()){
   const el=lanes[n.lane]?.querySelector('.orch-rhythm-rail-glow');if(!el)continue;
   railFlashes.get(n.lane)?.cancel();el.style.setProperty('--rail-color',n.color);
   railFlashes.set(n.lane,el.animate([{opacity:.85},{opacity:.55,offset:.22},{opacity:0}],{duration:280,easing:'ease-out'}));
  }
  results(auto?model.autoplay(now):model.expire(now));
  for(const n of model.notes){
   const el=els.get(n.id);if(!el)continue;
   const y=hitY*(1-(n.at-now)/lead);el.style.transform='translateY('+Math.round(y)+'px)';
   if(n.stack&&n.stack.count>1&&el.dataset.stackSize!==String(n.stack.count)){
    el.dataset.stackSize=String(n.stack.count);
    const w=82/n.stack.count;el.style.left=(9+n.slot*w)+'%';el.style.width=w+'%';
    el.classList.add('orch-rhythm-stacked-note');
   }
  }
  root.style.setProperty('--rhythm-tread-offset',((Math.max(0,elapsed)*128)%32)+'px');
  hint.textContent=model.notes.length?'':'等待工厂音符…';paintStats();
 }
 q('[data-rhythm-close]').onclick=onClose;q('[data-rhythm-return]').onclick=onClose;q('[data-rhythm-restart]').onclick=onRestart;
 q('[data-rhythm-count]').onchange=e=>{const n=Number(e.target.value);if(n===laneCount||!ORCHESTRA_RHYTHM_LAYOUTS[n])return;clearPending();laneCount=n;model.configure(n,difficulty);buildLanes();paintOptions();saveOptions();onTimingChange();paintStats();e.target.blur()};
 q('[data-rhythm-difficulty]').onchange=e=>{const n=orchestraRhythmDifficulty(e.target.value);if(n===difficulty)return;clearPending();difficulty=n;model.configure(laneCount,difficulty);paintOptions();saveOptions();onTimingChange();paintStats();e.target.blur()};
 q('[data-rhythm-lead]').onchange=e=>{const n=orchestraRhythmLead(e.target.value,lead);e.target.value=n;if(n!==lead){lead=n;saveOptions()}e.target.blur()};
 q('[data-rhythm-auto]').onchange=e=>{auto=e.target.checked;for(let i=0;i<keys.length;i++)release(i);clearFlashes();model.resetStats();lastStats='';paintOptions();saveOptions();onTimingChange();paintStats();document.activeElement?.blur()};
 // Capture before the ordinary factory shortcuts (notably B, Z, C, V).
 window.addEventListener('keydown',e=>{
  if(!active||e.target?.closest?.('input,select,textarea,[contenteditable]'))return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();onClose();return}
  if(finished&&e.key===' '){e.preventDefault();e.stopImmediatePropagation();return}
  const lane=ORCHESTRA_RHYTHM_LAYOUTS[laneCount].keys.indexOf(e.code);
  if(lane>=0&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)press(lane)}
  else if(e.key!==' '&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.length===1){e.preventDefault();e.stopImmediatePropagation()}
 },true);
 window.addEventListener('keyup',e=>{if(!active)return;const lane=ORCHESTRA_RHYTHM_LAYOUTS[laneCount].keys.indexOf(e.code);if(lane>=0){release(lane);e.preventDefault();e.stopImmediatePropagation()}},true);
 window.addEventListener('blur',()=>{for(let i=0;i<keys.length;i++)release(i)});
 return {open,close,reset,start,finish,add,tick,clearPending,model,root,previewCanvas:q('[data-rhythm-factory]'),get finished(){return finished},get active(){return active},get lead(){return lead},get keys(){return ORCHESTRA_RHYTHM_LAYOUTS[laneCount].keys},get labels(){return ORCHESTRA_RHYTHM_LAYOUTS[laneCount].labels},get auto(){return auto},get difficulty(){return difficulty}};
}
