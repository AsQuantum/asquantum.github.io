'use strict';
 const ORCHESTRA_INSTRUMENTS={
  bass:{name:'Bass',color:'#59d3ab',wave:'triangle',attack:.008,decay:.32},
  kick:{name:'Kick',color:'#ec9978',wave:'sine',attack:.003,decay:.25},
  pluck:{name:'Pluck',color:'#c2a0f5',wave:'triangle',attack:.004,decay:.22},
  synth:{name:'Synth',color:'#80adfa',wave:'sine',attack:.025,decay:.4},
  marimba:{name:'Marimba',color:'#e9b974',wave:'sine',attack:.004,decay:.22},
  piano:{name:'Piano',color:'#c2d5ee',wave:'triangle',attack:.004,decay:.45},
  chime:{name:'Chime',color:'#f4d98f',wave:'sine',attack:.005,decay:.7},
  percussion:{name:'Percussion',color:'#ee8cb2',wave:'sine',attack:.002,decay:.13},
  glitch:{name:'Glitch',color:'#7bd3e8',wave:'square',attack:.003,decay:.1}
 };

// Equal timbre/pitch on the SAME simulation tick is one acoustic voice.
 // Preserve every physical event for cursors and interface lights; combine
 // amplitudes by RMS rather than creating phase-aligned duplicate sources.
function orchestraGroupNotes(events){
 const groups=new Map();
 for(const ev of events){
  if(!Object.hasOwn(ORCHESTRA_INSTRUMENTS,ev.instrument)||!Number.isInteger(ev.n)||ev.n<24||ev.n>96||!Number.isFinite(ev.volume)||ev.volume<=0||!Number.isFinite(ev.time))continue;
  const tick=Math.round(ev.time*20),key=tick+'|'+ev.instrument+'|'+ev.n;
  let g=groups.get(key);if(!g){g={time:tick/20,instrument:ev.instrument,n:ev.n,power:0,events:[]};groups.set(key,g)}
  g.power+=Math.min(1,ev.volume)**2;g.events.push(ev);
 }
 return [...groups.values()].sort((a,b)=>a.time-b.time).map(g=>({...g,volume:Math.min(1,Math.sqrt(g.power))}));
}

function createOrchestraAudio(getBpm,getVolume){
 const instruments=ORCHESTRA_INSTRUMENTS,safeNote=n=>Number.isInteger(n)&&n>=24&&n<=96;
 let audio=null,master=null,unlocking=null,sampleBank=new Map(),voices=new Set(),dropped=0,status='',gainTarget=0,batching=false;
 function instrumentSample(name,n){
  const root=Math.max(24,Math.min(96,Math.round(n/12)*12)),key=name+':'+root;
  if(sampleBank.has(key))return sampleBank.get(key);
  const sr=24000,f=440*2**((root-69)/12),len=name==='piano'?1.8:name==='chime'?2.1:name==='synth'?1.2:name==='bass'?.9:name==='kick'?.48:name==='percussion'?.45:.85;
  const b=audio.createBuffer(1,Math.ceil(sr*len),sr),data=b.getChannelData(0),pi=2*Math.PI;
  const spectra={
   piano:[[1,1,3.1],[2.001,.48,5.4],[3.005,.27,8],[4.012,.18,11],[5.02,.09,14],[6.035,.05,20]],
   pluck:[[1,1,3.8],[2,.45,6.5],[3,.32,10],[4,.18,15],[5,.12,20],[6,.08,27]],
   marimba:[[1,1,4.4],[3.997,.31,18],[9.02,.06,35]],
   chime:[[1,1,2.5],[2.01,.21,3.9],[2.76,.34,4.8],[5.42,.16,7.4],[8.93,.07,12]],
   bass:[[1,1,2.9],[2,.32,5.6],[3,.13,8],[4,.05,11],[5,.03,17]],
   synth:[[1,1,1.7],[2,.32,2.8],[3,.22,3.2],[4,.13,4.3],[5,.08,5.6]],
   glitch:[[1,.75,9],[3,.21,13],[5,.12,17],[7,.07,24]]
  };
  const partials=(spectra[name]||[]).filter(([r])=>f*r<sr*.44);
  let rng=(root+1)*0x9e3779b1|0,noiseLP=0,prev=0,peak=0;
  for(let i=0;i<data.length;i++){
   const t=i/sr; rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;
   const noise=(rng>>>0)/2147483648-1;noiseLP+=(noise-noiseLP)*.18;let x=0;
   if(name==='kick'){
    const base=Math.max(38,Math.min(100,f*.48)),drop=145,k=32;
    x=Math.sin(pi*(base*t+drop*(1-Math.exp(-k*t))/k))*Math.exp(-t*10)+.12*(noise-noiseLP)*Math.exp(-t*95);
   }else if(name==='percussion'){
    x=.7*(noise-noiseLP)*Math.exp(-t*18)+.45*Math.sin(pi*(Math.max(90,f)*t+1.8*(1-Math.exp(-45*t))))*Math.exp(-t*22);
   }else{
    for(const [r,g,d] of partials){const phase=pi*f*r*t;x+=g*Math.sin(phase)*Math.exp(-d*t);}
    if(name==='piano'){x+=.13*Math.sin(pi*f*1.003*t)*Math.exp(-t*3.7)+.09*(noise-noiseLP)*Math.exp(-t*75)}
    if(name==='pluck')x+=.14*(noise-noiseLP)*Math.exp(-t*85);
    if(name==='marimba')x+=.07*noise*Math.exp(-t*95);
    if(name==='synth')x=.76*x+.19*Math.sin(pi*f*1.004*t)*Math.exp(-t*2.2)+.12*Math.sin(pi*f*.997*t)*Math.exp(-t*2.2);
    if(name==='glitch')x+=.16*noise*Math.exp(-t*35);
   }
   const attack=name==='synth'?.032:name==='bass'?.007:.0025;
   x*=Math.min(1,t/attack)*Math.min(1,(len-t)/.055);
   // remove DC and tame sharp digital edges.
   const hp=x-prev;prev=x;data[i]=x*.94+hp*.06;peak=Math.max(peak,Math.abs(data[i]));
  }
  if(peak>0)for(let i=0;i<data.length;i++)data[i]*=.78/peak;
  const result={buffer:b,root};sampleBank.set(key,result);return result;
 }
 async function unlock(){
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio){status='此浏览器不支持 Web Audio';return false}
  try{
   if(!audio){
    audio=new Audio();master=audio.createGain();master.gain.value=getVolume()*.86;gainTarget=master.gain.value;
    // Keep the signal path simple. A silent wet/compressor branch must not
    // suppress the dry instruments. Bound the simultaneous-voice mix instead.
    master.connect(audio.destination);
   }
   if(audio.state!=='running'){status='音频尚未启用，点击启用声音';if(!unlocking)unlocking=audio.resume().finally(()=>{unlocking=null});await unlocking}
   if(audio.state!=='running')status='点击启用声音';else status='';
   return audio.state==='running';
  }catch(e){status='音频不可用：'+e.message;return false}
 }
 function mixGain(){
  if(!master||!audio||batching)return;
  const next=getVolume()*Math.min(.86,2.4/Math.max(1,voices.size)),now=audio.currentTime;
  if(next===gainTarget)return;
  master.gain.cancelScheduledValues(now);
  // Attenuate before the next sample attack, recover gradually.
  if(next<gainTarget)master.gain.setValueAtTime(next,now);
  else master.gain.setTargetAtTime(next,now,.045);
  gainTarget=next;
 }
 function prepare(groups){if(audio)for(const g of groups)instrumentSample(g.instrument,g.n)}
 function batch(groups,when){
  const result=[];batching=true;
  try{for(const g of groups){const at=tone(g.instrument,g.n,g.volume,when(g.time));result.push(at)}}finally{batching=false;mixGain()}
  return result;
 }
 function stopSound(){

  for(const v of voices){try{v.stop()}catch{}}voices.clear();mixGain();
 }
 function tone(instrument,n,velocity,at){
  if(!audio||audio.state!=='running'||n===null||!safeNote(n)||!Number.isFinite(velocity)||velocity<=0)return;velocity=Math.min(1,velocity);
  if(voices.size>=512){dropped++;return}
  const d=instruments[instrument]||instruments.synth,s=instrumentSample(instrument,n),when=Math.max(audio.currentTime+.006,at||0),src=audio.createBufferSource(),env=audio.createGain();
  src.buffer=s.buffer;src.playbackRate.value=2**((n-s.root)/12);
  const natural=s.buffer.duration/src.playbackRate.value,duration=Math.min(natural,Math.max(.10,d.decay*2.2)*Math.min(1,150/getBpm())),fade=Math.min(.08,duration*.35);
  env.gain.setValueAtTime(.42*velocity,when);env.gain.setValueAtTime(.42*velocity,when+duration-fade);env.gain.linearRampToValueAtTime(0,when+duration);
  src.connect(env);env.connect(master);src.start(when);src.stop(when+duration+.015);voices.add(src);mixGain();
  src.onended=()=>{voices.delete(src);src.disconnect();env.disconnect();mixGain()};
  return when;
 }

 return {unlock,stop:stopSound,tone,prepare,batch,mix:mixGain,get ready(){return audio?.state==='running'},get time(){return audio?.currentTime||0},get dropped(){return dropped},get status(){return status},resetDropped(){dropped=0}};
}
