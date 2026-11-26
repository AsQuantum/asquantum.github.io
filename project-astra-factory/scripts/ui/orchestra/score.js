'use strict';
// The physical counters follow surviving machines through live edits and
// record-ID renumbering, including time spent outside music mode.
function orchestraTransferCount(id,dir){
 const counter=sim?.byMachine?.[id]?.[dir==='in'?'received':'sent'];
 return Object.values(counter||{}).reduce((sum,n)=>sum+n,0);
}
// Shared per-type score; no physical state is stored or mutated here.
function createOrchestraScore(root,settings,onSave,onPalette,onVolume,getCount,getDropped,onReroll=()=>{}){
 const instruments=ORCHESTRA_INSTRUMENTS,q=s=>root.querySelector(s);
 if(!settings.harmony||!Number.isInteger(settings.harmony.key)||settings.harmony.key<0||settings.harmony.key>11||!Object.hasOwn(orchestraHarmony.modes,settings.harmony.mode))delete settings.harmony;
 if(!Array.isArray(settings.keyPlan)||![1,2,4].includes(settings.keyPlan.length)||!settings.keyPlan.every(n=>[0,5,7].includes(n)))delete settings.keyPlan;
 let periodPaint=-Infinity,tracks={},trackList=[],layoutKey='shared-machine-events-v1',selected='',expanded=new Set(),pitchWindows=new Map(),trackHeights=new Map(),bars=1,stepWidth=26,followUntil=0;

 const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
 const fullName=m=>DEF[m.type]?.name||m.type;
 const noteName=n=>n===null?'休止':names[n%12]+(Math.floor(n/12)-1);
 const safeNote=n=>n===null||Number.isInteger(n)&&n>=24&&n<=96;
 const machineTracks=()=>state.machines.filter(m=>getPorts(m).some(p=>p.kind==='in'||p.kind==='out'));
 function instrumentFor(m){
  const type=m.type;if(!DEF[type])return 'synth';
  if(type==='仓出')return 'kick';if(type==='仓入')return 'chime';if(type==='分流')return 'marimba';if(type==='汇流')return 'piano';if(type==='电脑')return 'glitch';
  if(/冶炼|熔炼/.test(type))return 'percussion';if(/组装|量装/.test(type))return 'synth';
  return getRecipe(m)&&!Object.keys(getRecipe(m).inputs||{}).length?'bass':'pluck';
 }
 // One shared pattern per direction and machine type. Each physical
 // machine independently advances the pattern on successful transfers.
 const STEPS_PER_BEAT=1,STEPS_PER_BAR=4,MAX_BARS=16,MAX_STEPS=MAX_BARS*STEPS_PER_BAR,DEFAULT_BARS=4;
 const randomLength=()=> (Number(q('[data-orch-length]').value)||DEFAULT_BARS)*STEPS_PER_BAR;
 const portKey=p=>p.kind;
 const portTitle=k=>k==='in'?'收入物品':'发出物品';
 const basePitch=instrument=>['bass','kick'].includes(instrument)?36:instrument==='chime'?72:60;
 function defaultTrack(m){
  const instrument=instrumentFor(m),ports={};
  for(const p of m.ports){
   ports[portKey(p)]=orchestraHarmony.make(instrument,p.kind,randomLength(),settings.harmony?.key||0,settings.harmony?.mode||'minor');
  }
  return {instrument,volume:.7,ports};
 }
 function catalogTracks(){
  const map=new Map();
  for(const type of Object.keys(DEF)){
   const m={id:type,type,x:0,y:0,face:'E',mode:defaultModeFor(type)};
   m.ports=getPorts(m);if(m.ports.length)map.set(type,m);
  }
  for(const m of trackList)map.set(m.type,m);
  return [...map.values()];
 }
 function persistedTrack(m,full=false){
  const old=settings.scores?.[layoutKey]?.[m.id],preferred=instrumentFor(m);
  const d=full||!old?orchestraHarmony.arrange(preferred,old?.instrument):{instrument:Object.hasOwn(instruments,old.instrument)?old.instrument:preferred,volume:Number.isFinite(old.volume)?Math.max(0,Math.min(1,old.volume)):.7};
  const key=settings.harmony?.key||0,mode=settings.harmony?.mode||'minor',length=randomLength();
  d.ports={};for(const dir of new Set(m.ports.map(p=>p.kind))){
   const seq=old?.ports?.[dir];
   d.ports[dir]=!full&&Array.isArray(seq)&&seq.length&&seq.length<=MAX_STEPS&&seq.every(safeNote)?seq.slice():orchestraHarmony.make(d.instrument,dir,length,key,mode);
  }
  return d;
 }
 function ensureShared(){
  const scores=settings.scores??={},all=scores[layoutKey]??={};
  const first=!Object.keys(all).length;
  const missingHarmony=!settings.harmony;
  if(first||missingHarmony){
   const h=orchestraHarmony.chooseHarmony(settings.harmony);
   q('[data-orch-key]').value=h.key;q('[data-orch-scale]').value=h.mode;
   settings.harmony=h;
  }
  let changed=first||missingHarmony;
  if(settings.modulate&&!settings.keyPlan){settings.keyPlan=orchestraHarmony.keyPlan(Number(q('[data-orch-length]').value)||DEFAULT_BARS);changed=true}
  for(const m of catalogTracks()){
   const old=all[m.id];
   if(!old||!Object.hasOwn(instruments,old.instrument)||m.ports.some(p=>!Array.isArray(old.ports?.[p.kind])||!old.ports[p.kind].length||old.ports[p.kind].length>MAX_STEPS||!old.ports[p.kind].every(safeNote))){
    all[m.id]=persistedTrack(m);changed=true;
   }
  }
  if(changed)onSave();
 }
 function scoreBars(){
  let end=1;
  for(const track of [...Object.values(settings.scores?.[layoutKey]||{}),...Object.values(tracks)])for(const seq of Object.values(track.ports||{}))if(Array.isArray(seq))end=Math.max(end,Math.min(MAX_STEPS,seq.length));
  return Math.max(1,Math.ceil(end/STEPS_PER_BAR))
 }
 function setCell(id,key,i,n){
  const seq=tracks[id]?.ports[key];if(!seq||i<0||i>=MAX_STEPS||!safeNote(n))return false;
  while(seq.length<=i)seq.push(null);seq[i]=n;
  bars=scoreBars();save();return true;
 }

 root.innerHTML='<section class="orch-editor" data-orch-view="edit"><div class="orch-edit-toolbar"><div class="orch-now" data-orch-current title="已保存的共同调性"></div><details class="orch-settings"><summary>音乐设置 <span aria-hidden="true">⌄</span></summary><div class="orch-settings-panel"><div class="orch-settings-heading">随机生成</div><label class="orch-control">调性 <select data-orch-key>'+names.map((n,i)=>'<option value="'+i+'">'+n+'</option>').join('')+'</select><select data-orch-scale><option value="minor">小七和声</option><option value="major">大六和声</option><option value="pentatonic">小调五声</option></select></label><label class="orch-control">长度 <select data-orch-length><option value="1">4音符位</option><option value="2">8音符位</option><option value="4" selected>16音符位</option></select></label><label class="orch-control orch-auto-random"><input type="checkbox" data-orch-random-length>长度也随机</label><label class="orch-control orch-auto-random"><input type="checkbox" data-orch-auto-random>每次进入随机</label><div class="orch-settings-heading">演奏</div><label class="orch-control orch-auto-random"><input type="checkbox" data-orch-modulate>小节转调</label><div data-orch-key-plan class="orch-key-plan"></div><div class="orch-settings-actions"><button data-orch="random-all" title="随机主音、和声、各类型乐器、音量及旋律">全部随机</button><button data-orch="random-fixed" title="使用所选调性、保留音色音量">固定调性随机</button></div></div></details><button data-orch="random-track" title="仅重新生成当前选中的机器类型">随机本轨</button><div class="orch-grow"></div><label class="orch-control">音量 <input data-orch-volume type="range" min="0" max="100" aria-label="主音量"></label><span class="orch-loop" data-orch-loop>4/4 · 16 音符位</span></div><div class="orch-timeline" tabindex="0" aria-label="多轨乐谱"><div class="orch-score"></div></div><div class="orch-editor-foot"><span>滚轮上下 · Shift+滚轮水平 · Ctrl+滚轮时间缩放 · Ctrl+Shift+滚轮音高缩放</span><span data-orch-period title="基于空库存初始状态的理论稳定物流；实际当前库存、运行中改造及手动补料可能改变周期。不是最短听觉周期。"></span><span title="全局节拍参考；每台机器按收发次数独立推进" data-orch-position></span></div></section>';
 const save=()=>{const scores=settings.scores??={},all={...(scores[layoutKey]||{})};for(const [id,track] of Object.entries(tracks))all[id]={...track,ports:{...(all[id]?.ports||{}),...track.ports}};scores[layoutKey]=all;onSave()};
 function initScore(){
  const groups=new Map();
  for(const m of machineTracks()){
   let g=groups.get(m.type);
   if(!g){g={...m,id:m.type,ports:[],count:0,portDirections:{}};groups.set(m.type,g)}
   g.count++;
   for(const p of getPorts(m))if(p.kind==='in'||p.kind==='out'){
    const key=portKey(p);if(!g.ports.some(x=>portKey(x)===key))g.ports.push(p);
    (g.portDirections[key]??=new Set()).add(p.kind);
   }
  }
  trackList=[...groups.values()];for(const m of trackList)m.ports.sort((a,b)=>a.index-b.index);
  layoutKey='shared-machine-events-v1';
  const previous=tracks;tracks=Object.create(null);const stored=settings.scores?.[layoutKey]||{};
  for(const m of trackList){
   const d=defaultTrack(m),old=stored[m.id]||previous[m.id],legacy=settings.scores?.['shared-machine-types-v2']?.[m.id];
   if(legacy&&Object.hasOwn(instruments,legacy.instrument))d.instrument=legacy.instrument;
   if(Number.isFinite(legacy?.volume))d.volume=Math.max(0,Math.min(1,legacy.volume));
   if(old&&Object.hasOwn(instruments,old.instrument))d.instrument=old.instrument;
   if(Number.isFinite(old?.volume))d.volume=Math.max(0,Math.min(1,old.volume));
   for(const key of Object.keys(d.ports)){
    const seq=old?.ports?.[key];
    if(Array.isArray(seq)&&seq.length>0&&seq.length<=MAX_STEPS&&seq.every(safeNote))d.ports[key]=seq.slice();
    else d.ports[key]=orchestraHarmony.make(d.instrument,key,randomLength(),settings.harmony?.key||0,settings.harmony?.mode||"minor");
   }
   tracks[m.id]=d;
  }
  if(!tracks[selected])selected=trackList[0]?.id||'';for(const id of expanded)if(!tracks[id])expanded.delete(id);bars=scoreBars();
 }
 const timeline=()=>q('.orch-timeline'),score=()=>q('.orch-score');
 const gridSteps=()=>Math.min(MAX_STEPS,(bars+1)*STEPS_PER_BAR);
 function blocks(seq,w,color,hi=null,rh=17){
  let out='';
  for(let i=0;i<seq.length;){const n=seq[i];if(n===null){i++;continue}let j=i+1;while(j<seq.length&&seq[j]===n)j++;
   if(hi!==null&&(n>hi||n<hi-12)){i=j;continue}
   const y=hi===null?7:(hi-n)*rh+2,h=hi===null?13:rh-4;
   out+='<rect x="'+(i*w+1)+'" y="'+y+'" width="'+Math.max(2,(j-i)*w-2)+'" height="'+h+'" rx="3" fill="'+color+'"><title>'+noteName(n)+'</title></rect>';i=j;
  }return out;
 }
 function gridBackground(count,w,h){
  let out='';
  for(let i=0;i<=count;i++){const x=i*w;out+='<path d="M'+x+' 0V'+h+'" stroke="'+(i%4===0?'#52677e':i%1===0?'#30465e':'#223348')+'" stroke-width="'+(i%4===0?1.4:.6)+'"/>'}return out;
 }
 function portRoll(id,key,seq,color){
  const active=seq.filter(n=>n!==null),center=active.length?Math.round((Math.min(...active)+Math.max(...active))/2):basePitch(tracks[id].instrument);
  const windowKey=id+'|'+key,rowHeight=trackHeights.get(id)||17,initialLo=Math.max(24,Math.min(84,center-6,active.length?Math.min(...active):center));
  const lo=pitchWindows.get(windowKey)??initialLo,hi=Math.min(96,lo+12);
  const h=(hi-lo+1)*rowHeight,w=gridSteps()*stepWidth;
  let labels='',grid='<rect width="'+w+'" height="'+h+'" fill="#0d1828"/>';
  for(let n=hi;n>=lo;n--){const y=(hi-n)*rowHeight,black=[1,3,6,8,10].includes(n%12);
   labels+='<div style="height:'+rowHeight+'px">'+noteName(n)+'</div>';
   if(black)grid+='<rect y="'+y+'" width="'+w+'" height="'+rowHeight+'" fill="#17263a"/>';
   grid+='<path d="M0 '+y+'H'+w+'" stroke="#273b52" stroke-width=".5"/>';
  }
  grid+=gridBackground(gridSteps(),stepWidth,h)+blocks(seq,stepWidth,color,hi,rowHeight);
  return '<div class="orch-lane"><div class="orch-left orch-port-name"><b>'+portTitle(key)+'</b><small>'+([...trackList.find(m=>m.id===id).portDirections[key]].map(k=>k==='in'?'输入':'输出').join(' / '))+'</small><div class="orch-octave"><button data-octave="-12" data-machine-id="'+esc(id)+'" data-port-key="'+esc(key)+'" aria-label="降低八度">−</button><button data-octave="12" data-machine-id="'+esc(id)+'" data-port-key="'+esc(key)+'" aria-label="升高八度">＋</button></div><div class="orch-pitches">'+labels+'</div></div><svg class="orch-port-roll" data-machine="'+esc(id)+'" data-port="'+esc(key)+'" data-hi="'+hi+'" data-lo="'+lo+'" data-row-height="'+rowHeight+'" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-label="'+esc(id+' '+portTitle(key))+'">'+grid+'<g data-orch-cursor="'+esc(id+'|'+key)+'"></g></svg></div>';
 }
 function renderEditor(){
  periodPaint=-Infinity;
  const sc=score(),t=timeline(),left=t.scrollLeft,top=t.scrollTop,count=gridSteps(),w=count*stepWidth;
  sc.style.setProperty('--score-width',w+'px');
  let ruler='<div class="orch-ruler"><div class="orch-left orch-ruler-label">乐器 / 机器</div><div class="orch-ruler-time" style="width:'+w+'px">';
  for(let i=0;i<count;i++)ruler+='<span class="'+(i%4===0?'bar':'')+(i>=bars*4?' extra':'')+'" style="left:'+(i*stepWidth)+'px">'+(i%4===0?Math.floor(i/4)+1:i%4+1)+'</span>';
  ruler+='</div></div>';
  let rows='';
  for(const m of trackList){
   const id=m.id,d=tracks[id],inst=instruments[d.instrument],isOpen=expanded.has(id);
   const seqs=Object.values(d.ports),height=Math.max(28,seqs.length*8+8);
   let preview='<rect width="'+w+'" height="'+height+'" fill="#101d2f"/>'+gridBackground(count,stepWidth,height);
   Object.entries(d.ports).forEach(([dir,seq],j)=>{for(let i=0;i<seq.length;){if(seq[i]===null){i++;continue}let k=i+1;while(k<seq.length&&seq[k]===seq[i])k++;preview+='<rect x="'+(i*stepWidth+1)+'" y="'+(5+j*8)+'" width="'+Math.max(2,(k-i)*stepWidth-2)+'" height="5" rx="2" fill="'+inst.color+'"/>';i=k}preview+='<g transform="translate(0,'+(3+j*8)+')" data-orch-cursor="'+esc(id+'|'+dir)+'"></g>'});
   rows+='<div class="orch-track'+(selected===id?' selected':'')+'"><div class="orch-left orch-track-label"><button class="orch-expand" data-track="'+esc(id)+'" aria-expanded="'+isOpen+'">'+(isOpen?'▾':'▸')+' <span>'+esc(fullName(m)+' ×'+m.count)+'</span></button><select aria-label="'+esc(id+' 音色')+'" data-instrument="'+esc(id)+'">'+Object.entries(instruments).map(([k,v])=>'<option value="'+k+'"'+(k===d.instrument?' selected':'')+'>'+v.name+'</option>').join('')+'</select></div><svg class="orch-overview" data-track="'+esc(id)+'" width="'+w+'" height="'+height+'" viewBox="0 0 '+w+' '+height+'">'+preview+'</svg></div>';
   if(isOpen){
    rows+='<div class="orch-track-options"><div class="orch-left"><label>音量 <input aria-label="轨道音量" data-track-volume="'+esc(id)+'" type="range" min="0" max="100" value="'+Math.round(d.volume*100)+'"></label></div></div>';
    for(const [key,seq] of Object.entries(d.ports))rows+=portRoll(id,key,seq,inst.color);
   }
  }
  sc.innerHTML=ruler+(rows||'<p class="orch-no-tracks">当前没有带输入或输出接口的机器。</p>')+'<div class="orch-loop-boundary" style="left:calc(var(--orch-label) + '+(bars*4*stepWidth)+'px)"></div><div class="orch-playhead"></div>';
  t.scrollLeft=left;t.scrollTop=top;q('[data-orch-loop]').textContent='4/4 · '+bars*4+' 音符位';paintPlayhead(performance.now(),false);
 }
 function paintPeriod(t){
  if(t-periodPaint<1000)return;periodPaint=t;
  const el=q('[data-orch-period]');if(!el)return;
  const b=typeof theoreticalBudget==='undefined'?null:theoreticalBudget;
  // Reuse only the existing budget for the current layout; never start a
  // second solve. The reference is not a proof about edited live inventory.
  const current=b&&typeof theoryLayoutKey!=='undefined'&&theoryLayoutKey===theorySignature()?b:null;
  const p=orchestraPeriod.estimate(state,current,(type,dir)=>tracks[type]?.ports[dir]?.length||0,settings.modulate?Math.max(1,settings.keyPlan?.length||1)*80:1);
  el.textContent=p.status==='period'?'稳态参考循环 · '+orchestraPeriod.duration(p.ticks,settings.bpm):p.status==='silent'?'稳态无收发':p.status==='waiting'?'等待物流周期':'物流周期未证实';
  el.title=p.status==='period'?'理论稳定事件与音符游标重复周期：'+p.ticks+' ticks；稳定前缀 '+p.prefix+' ticks。仅参考理论初始条件，不保证当前实际库存状态，也不保证最短听觉循环。': '仅复用已有精确物流周期；产率解析解或未完成求解时不猜测周期。';
 }
 // Show all physical machines' NEXT slot on the corresponding shared lane.
 // Several machines can legitimately be at different positions.
 function paintCursors(){
  const positions=new Map();
  for(const m of state.machines){
   const d=tracks[m.type];if(!d)continue;
   for(const [dir,seq] of Object.entries(d.ports)){
    if(!seq.length||!getPorts(m).some(p=>p.kind===dir))continue;
    const k=m.type+'|'+dir,map=positions.get(k)||new Map(),slot=orchestraTransferCount(m.id,dir)%seq.length;
    map.set(slot,(map.get(slot)||0)+1);positions.set(k,map);
   }
  }
  for(const el of root.querySelectorAll('[data-orch-cursor]')){
   const [type,dir]=el.dataset.orchCursor.split('|'),slots=positions.get(type+'|'+dir)||new Map(),next=[...slots].sort((a,b)=>a[0]-b[0]);
   const signature=JSON.stringify(next);if(el.dataset.positions===signature)continue;
   el.dataset.positions=signature;el.innerHTML=next.map(([i,n])=>'<rect x="'+(i*stepWidth+stepWidth/2-2)+'" y="1" width="4" height="5" rx="1.5" fill="#edf7ff"><title>下一音符 '+(i+1)+' · '+n+' 台机器</title></rect>').join('');
  }
 }
 function paintPlayhead(t,follow=true){
  if(root.hidden)return;
  paintPeriod(t);
  const pos=((simTime+(typeof simClockRemainder==='number'?simClockRemainder:0))*STEPS_PER_BEAT)%(bars*STEPS_PER_BAR),x=pos*stepWidth,head=q('.orch-playhead');
  if(head)head.style.left='calc(var(--orch-label) + '+x+'px)';
  paintCursors();
  q('[data-orch-position]').textContent='参考拍 '+(Math.floor(pos/4)+1)+'.'+(Math.floor(pos%4)+1)+' · '+getCount()+' 次收发'+(getDropped()?' · 音频过载 '+getDropped():'');
  const sc=timeline(),label=q('.orch-ruler-label')?.offsetWidth||180;
  if(follow&&performance.now()>followUntil&&head){const right=sc.scrollLeft+sc.clientWidth-label;if(x<sc.scrollLeft||x>right-32)sc.scrollLeft=Math.max(0,x-40)}
 }
 function randomTrack(m){
  const d=tracks[m.id],key=Number(q('[data-orch-key]').value)||0,mode=q('[data-orch-scale]').value,length=randomLength();
  for(const dir of Object.keys(d.ports))d.ports[dir]=orchestraHarmony.make(d.instrument,dir,length,key,mode);
 }
 function rememberHarmony(){settings.harmony={key:Number(q('[data-orch-key]').value)||0,mode:q('[data-orch-scale]').value};}
 function refreshKeyPlan(){
  const plan=settings.modulate?settings.keyPlan||[0]:[0],key=settings.harmony?.key||0;
  q('[data-orch-current]').textContent=names[key]+' · '+({minor:'小七',major:'大六',pentatonic:'小调五声'}[settings.harmony?.mode]||'小七')+(settings.modulate?' · 转调':'');
  q('[data-orch-key-plan]').textContent=plan.map(n=>names[(key+n)%12]).join(' → ');q('[data-orch-key-plan]').title='乐谱显示基础音高；演奏时所有旋律声部按全局小节同步转调，打击乐除外';
 }
 function randomAll(full=true){
  if(full){
   if(settings.shuffleLength){const length=orchestraHarmony.randomBars();q('[data-orch-length]').value=String(length);settings.randomLength=String(length)}
   const next=orchestraHarmony.chooseHarmony(settings.harmony);
   q('[data-orch-key]').value=next.key;q('[data-orch-scale]').value=next.mode;
  }
  rememberHarmony();
  const scores=settings.scores??={},all=scores[layoutKey]??={};
  for(const m of catalogTracks()){
   const old=all[m.id];
   if(full||!old)all[m.id]=persistedTrack(m,true);
   else{
    const d=persistedTrack(m),length=randomLength();
    for(const dir of Object.keys(d.ports))d.ports[dir]=orchestraHarmony.make(d.instrument,dir,length,settings.harmony.key,settings.harmony.mode);
    all[m.id]=d;
   }
  }
  if(full||!settings.keyPlan||settings.keyPlan.length!==Number(q('[data-orch-length]').value))settings.keyPlan=orchestraHarmony.keyPlan(Number(q('[data-orch-length]').value)||DEFAULT_BARS);
  initScore();pitchWindows.clear();bars=scoreBars();save();refreshKeyPlan();if(!root.hidden)renderEditor();onPalette();onReroll();
 }
 q('[data-orch-key]').value=settings.harmony?.key??0;q('[data-orch-scale]').value=settings.harmony?.mode||'minor';
 q('[data-orch-length]').value=['1','2','4'].includes(String(settings.randomLength))?String(settings.randomLength):String(DEFAULT_BARS);
 q('[data-orch-auto-random]').checked=!!settings.autoRandom;
 q('[data-orch-random-length]').checked=!!settings.shuffleLength;
 q('[data-orch-modulate]').checked=!!settings.modulate;
 refreshKeyPlan();

 root.addEventListener('click',e=>{
  if(!e.target.closest('.orch-settings'))q('.orch-settings').open=false;
  const roll=e.target.closest('[data-port]');
  if(roll){
   const r=roll.getBoundingClientRect(),id=roll.dataset.machine,key=roll.dataset.port,i=Math.floor((e.clientX-r.left)/stepWidth),n=Number(roll.dataset.hi)-Math.floor((e.clientY-r.top)/Number(roll.dataset.rowHeight)),seq=tracks[id]?.ports[key];
   if(seq&&n>=Number(roll.dataset.lo)&&n<=Number(roll.dataset.hi)){selected=id;setCell(id,key,i,seq[i]===n?null:n);renderEditor()}return;
  }
  const track=e.target.closest('[data-track]');
  if(track){selected=track.dataset.track;if(expanded.has(selected))expanded.delete(selected);else expanded.add(selected);renderEditor();return}
  const b=e.target.closest('button');if(!b)return;const action=b.dataset.orch;
  if(b.dataset.octave){const id=b.dataset.machineId,key=b.dataset.portKey,roll=[...root.querySelectorAll('[data-port]')].find(x=>x.dataset.machine===id&&x.dataset.port===key);if(roll){pitchWindows.set(id+'|'+key,Math.max(24,Math.min(84,Number(roll.dataset.lo)+Number(b.dataset.octave))));renderEditor()}return}


  if(action==='random-all'||action==='random-fixed'){randomAll(action==='random-all');return}
  if(action==='random-track'){const m=trackList.find(m=>m.id===selected);if(m){q('[data-orch-key]').value=settings.harmony?.key??0;q('[data-orch-scale]').value=settings.harmony?.mode||'minor';randomTrack(m);for(const key of Object.keys(tracks[m.id].ports))pitchWindows.delete(m.id+'|'+key);bars=scoreBars();save();renderEditor();onReroll()}}
 });
 root.addEventListener('contextmenu',e=>{const roll=e.target.closest('[data-port]');if(!roll)return;e.preventDefault();const r=roll.getBoundingClientRect();setCell(roll.dataset.machine,roll.dataset.port,Math.floor((e.clientX-r.left)/stepWidth),null);renderEditor()});
 root.addEventListener('change',e=>{
  const el=e.target;
  if(el.matches('[data-orch-auto-random]'))settings.autoRandom=el.checked;
  if(el.matches('[data-orch-random-length]'))settings.shuffleLength=el.checked;
  if(el.matches('[data-orch-modulate]')){settings.modulate=el.checked;if(!settings.keyPlan)settings.keyPlan=orchestraHarmony.keyPlan(Number(q('[data-orch-length]').value)||DEFAULT_BARS);refreshKeyPlan()}
  if(el.matches('[data-orch-length]'))settings.randomLength=el.value;
  if(el.matches('[data-instrument]')&&tracks[el.dataset.instrument]){selected=el.dataset.instrument;tracks[selected].instrument=el.value;renderEditor();onPalette()}
  save();
 });
 root.addEventListener('input',e=>{
  const el=e.target;if(el.dataset.trackVolume&&tracks[el.dataset.trackVolume]){tracks[el.dataset.trackVolume].volume=Number(el.value)/100;save()}
  if(el.matches('[data-orch-volume]')){settings.volume=Number(el.value)/100;onVolume();save()}
 });
 timeline().addEventListener('wheel',e=>{
  followUntil=performance.now()+2200;
  const t=timeline();
  if(e.ctrlKey||e.metaKey){
   e.preventDefault();const factor=Math.exp(-e.deltaY*.002),label=q('.orch-ruler-label')?.offsetWidth||180;
   if(e.shiftKey){const id=e.target.closest('[data-machine]')?.dataset.machine||selected;if(id){trackHeights.set(id,Math.round(Math.max(10,Math.min(38,(trackHeights.get(id)||17)*factor))));renderEditor()}}
   else{const x=Math.max(0,e.clientX-t.getBoundingClientRect().left-label),beat=(t.scrollLeft+x)/stepWidth;stepWidth=Math.round(Math.max(8,Math.min(80,stepWidth*factor)));renderEditor();t.scrollLeft=Math.max(0,beat*stepWidth-x)}
  }else if(e.shiftKey){e.preventDefault();t.scrollLeft+=e.deltaY}
 },{passive:false});
 timeline().addEventListener('pointerdown',()=>{followUntil=performance.now()+4000});

 function sync(){ensureShared();initScore();refreshKeyPlan();if(!root.hidden)renderEditor()}
 return {sync,save,randomAll,render:renderEditor,paint:paintPlayhead,track:type=>tracks[type],pitch:(type,port,cursor,time=0)=>orchestraHarmony.transpose(tracks[type]?.ports[String(port)]?.[cursor%Math.max(1,tracks[type]?.ports[String(port)]?.length||1)]??null,time,settings.modulate&&!["kick","percussion"].includes(tracks[type]?.instrument)?settings.keyPlan||[0]:[0]),color:type=>instruments[tracks[type]?.instrument||settings.scores?.[layoutKey]?.[type]?.instrument]?.color||instruments[instrumentFor({type,mode:Object.keys(DEF[type]?.recipes||{})[0]})]?.color||'#697b99'};
}
