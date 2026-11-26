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

// Musical gain staging: keep independent timbre buses, estimate their energy
// on the audio timeline, and use linear gain only. Never count queued nodes
// as current sound. Peak bounds retain headroom without waveform clipping.
const ORCHESTRA_CHANNEL_GAIN=.86,ORCHESTRA_MIX_STEP=.025,ORCHESTRA_CHANNEL_RMS=.11,ORCHESTRA_TOTAL_RMS=.15,ORCHESTRA_OUTPUT_PEAK=.58;
// Transport fades affect only the audio graph, never the simulation clock.
const ORCHESTRA_FADE_IN=.030,ORCHESTRA_FADE_OUT=.045;
function orchestraTransportFade(from,to,start,duration){
 const times=[],values=[];
 for(let i=0;i<=12;i++){const u=i/12,w=.5-.5*Math.cos(Math.PI*u);times.push(start+u*duration);values.push(from+(to-from)*w)}
 return {times,values};
}
const ORCHESTRA_ROLE_TRIM={bass:.92,kick:1,pluck:1,synth:.78,marimba:1,piano:1,chime:.9,percussion:1,glitch:.83};
function orchestraSampleStats(data,sr){
 const size=Math.max(1,Math.round(sr*.01)),count=Math.ceil(data.length/size),rms=new Float32Array(count),peak=new Float32Array(count);
 for(let i=0;i<data.length;i++){const k=Math.floor(i/size),x=data[i];rms[k]+=x*x;peak[k]=Math.max(peak[k],Math.abs(x))}
 for(let i=0;i<count;i++)rms[i]=Math.sqrt(rms[i]/Math.min(size,data.length-i*size));
 return {rms,peak,dt:size/sr};
}
function orchestraVoiceStats(v,from,to){
 const a=Math.max(from,v.when),b=Math.min(to,v.end);
 if(b<=a)return [0,0];
 const first=Math.max(0,Math.floor((a-v.when)*v.rate/v.sample.dt)),last=Math.min(v.sample.rms.length-1,Math.floor((b-v.when)*v.rate/v.sample.dt));
 let rms=0,peak=0;
 for(let i=first;i<=last;i++){rms=Math.max(rms,v.sample.rms[i]);peak=Math.max(peak,v.sample.peak[i])}
 const gain=v.level*Math.max(0,Math.min(1,(v.end-a)/v.fade));
 return [rms*gain,peak*gain];
}
// Exact same-pitch/onset sources can be coherent; other onsets are treated
// as energy contributions. The separate peak sum remains conservative.
function orchestraMixAnalysis(voices,start,count,step=ORCHESTRA_MIX_STEP){
 const tracks=new Map();
 for(const v of voices){
  let track=tracks.get(v.instrument);
  if(!track){track={power:new Float64Array(count),peak:new Float64Array(count),same:new Map()};tracks.set(v.instrument,track)}
  const first=Math.max(0,Math.floor((v.when-start)/step)),last=Math.min(count-1,Math.floor((v.end-start)/step));
  if(last<first)continue;
  const key=v.n+'|'+Math.round(v.when*1000000);
  let group=track.same.get(key);
  // Identical onsets may be batched independently by a caller. Combine
  // their amplitudes before squaring, rather than assuming independence.
  if(!group){group=new Map();track.same.set(key,group)}
  for(let i=first;i<=last;i++){
   const [r,p]=orchestraVoiceStats(v,start+i*step,start+(i+1)*step);
   if(!r&&!p)continue;
   const old=group.get(i)||0;track.power[i]+=r*r+2*r*old;group.set(i,old+r);track.peak[i]+=p;
  }
 }
 for(const t of tracks.values())delete t.same;
 return tracks;
}
function orchestraChannelGain(rms,ceiling=ORCHESTRA_CHANNEL_GAIN){return Math.min(ceiling,ORCHESTRA_CHANNEL_RMS/Math.max(.000001,rms))}
function orchestraOutputGain(power,peak){return Math.min(1,ORCHESTRA_TOTAL_RMS/Math.max(.000001,Math.sqrt(power)),ORCHESTRA_OUTPUT_PEAK/Math.max(.000001,peak))}
function orchestraGainCurve(targets,initial,step=ORCHESTRA_MIX_STEP){
 const out=[initial];let gain=initial;
 for(let i=0;i<targets.length;i++){
  const next=Math.min(targets[i],targets[i+1]??1),dt=i===0?.004:step;
  gain=next<gain?next:gain+(next-gain)*(-Math.expm1(-dt/.12));out.push(gain);
 }
 return out;
}
function createOrchestraAudio(getBpm,getVolume){
 const instruments=ORCHESTRA_INSTRUMENTS,safeNote=n=>Number.isInteger(n)&&n>=24&&n<=96;
 let audio=null,master=null,mixBus=null,unlocking=null,sampleBank=new Map(),voices=new Map(),channels=new Map(),dropped=0,status='',gainTarget=0,batching=false,profile=null,mixPlan=null,gate=null,gatePlan=null,gateStart=Infinity;
 const retiring=new Set();
 function instrumentSample(name,n){
  const root=Math.max(24,Math.min(96,Math.round(n/3)*3)),key=name+':'+root;
  if(sampleBank.has(key))return sampleBank.get(key);
  const sr=32000,f=440*2**((root-69)/12),len=name==='piano'?1.8:name==='chime'?2.1:name==='synth'?1.2:name==='bass'?.9:name==='kick'?.48:name==='percussion'?.45:.85;
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
  const partials=(spectra[name]||[]).filter(([r])=>f*r*2**(1.5/12)<sr*.44);
  let rng=((root+1)*0x9e3779b1^(Object.keys(instruments).indexOf(name)+1)*0x85ebca6b)|0,noiseLP=0,prev=0,dc=0,peak=0;
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
   const attack=instruments[name].attack;
   const ramp=Math.min(1,t/attack),tail=Math.min(1,(len-t)/.055);
   x*=.5*(1-Math.cos(Math.PI*ramp))*.5*(1-Math.cos(Math.PI*tail));
   // Real DC blocker at about 8 Hz; unlike a differentiator mix it
   // removes the zero-frequency component without boosting treble.
   dc=x-prev+.99843*dc;prev=x;data[i]=dc;peak=Math.max(peak,Math.abs(data[i]));
  }
  if(peak>0)for(let i=0;i<data.length;i++)data[i]*=.78/peak;
  const stats=orchestraSampleStats(data,sr);
  const count=Math.min(stats.rms.length,20),rms=Math.sqrt(stats.rms.slice(0,count).reduce((sum,x)=>sum+x*x,0)/Math.max(1,count));
  // Gentle calibration: never amplify quiet transients excessively.
  // Deliberately keep sustained synths behind the foreground.
  const trim=Math.max(.65,Math.min(1.12,.29/Math.max(.01,rms)))*(ORCHESTRA_ROLE_TRIM[name]||1);
  const result={buffer:b,root,trim,...stats};sampleBank.set(key,result);if(sampleBank.size>160)sampleBank.delete(sampleBank.keys().next().value);return result;
 }
 function createMixGraph(){
  mixBus=audio.createGain();mixBus.gain.value=1;channels=new Map();mixPlan=null;
  for(const name of Object.keys(instruments)){
   const node=audio.createGain();node.gain.value=ORCHESTRA_CHANNEL_GAIN;node.connect(mixBus);
   channels.set(name,{node,plan:null});
  }
  gate=audio.createGain();gate.gain.value=0;mixBus.connect(gate);gate.connect(master);
  gatePlan=null;gateStart=Infinity;
 }
 function disconnectGraph(graph){
  for(const c of graph.channels.values())try{c.node.disconnect()}catch{}
  try{graph.mixBus.disconnect();graph.gate.disconnect()}catch{}
  retiring.delete(graph);
 }
 function stopSource(src){try{src.stop()}catch{}try{src.disconnect()}catch{}}
 function discardRetiring(){
  for(const graph of retiring){
   for(const src of graph.sources)stopSource(src);
   graph.sources.clear();disconnectGraph(graph);
  }
 }
 function holdGain(node,plan,now,fallback){
  const value=plannedValue(plan,now,fallback),p=node.gain;
  if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(now);else p.cancelScheduledValues(now);
  p.setValueAtTime(value,now);return value;
 }
 function fadeGate(node,from,to,start,duration){
  const plan=orchestraTransportFade(from,to,start,duration),p=node.gain;
  if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(start);else p.cancelScheduledValues(start);
  p.setValueAtTime(from,start);
  for(let i=1;i<plan.times.length;i++)p.linearRampToValueAtTime(plan.values[i],plan.times[i]);
  return plan;
 }
 function startGate(when){
  if(gateStart!==Infinity&&(audio.currentTime>=gateStart||when>=gateStart))return;
  gate.gain.cancelScheduledValues(0);gate.gain.setValueAtTime(0,audio.currentTime);
  gateStart=when;gatePlan=fadeGate(gate,0,1,when,ORCHESTRA_FADE_IN);
 }
 async function unlock(){
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio){status='此浏览器不支持 Web Audio';return false}
  try{
   if(!audio){
    audio=new Audio();master=audio.createGain();master.gain.value=getVolume();gainTarget=master.gain.value;
    master.connect(audio.destination);createMixGraph();
   }
   if(audio.state!=='running'){if(!unlocking)stopSound();status='音频尚未启用，点击启用声音';if(!unlocking)unlocking=audio.resume().finally(()=>{unlocking=null});await unlocking}
   if(audio.state!=='running')status='点击启用声音';else status='';
   return audio.state==='running';
  }catch(e){status='音频不可用：'+e.message;return false}
 }
 function mixGain(){
  if(!master||!audio)return;
  const next=getVolume(),now=audio.currentTime;if(next===gainTarget)return;
  const p=master.gain;
  if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(now);else p.cancelScheduledValues(now);
  p.setTargetAtTime(next,now,.025);gainTarget=next;
 }
 function voiceInfo(instrument,n,velocity,when){
  const d=instruments[instrument],sample=instrumentSample(instrument,n),rate=2**((n-sample.root)/12);
  const natural=sample.buffer.duration/rate,duration=Math.min(natural,Math.max(.10,d.decay*2.2)*Math.min(1,150/getBpm()));
  return {instrument,n,when,end:when+duration,rate,sample,fade:Math.min(.08,duration*.35),level:.42*velocity*sample.trim};
 }
 function plannedValue(plan,now,fallback){
  if(!plan)return fallback;
  const {times,values}=plan;
  if(now>=times.at(-1))return values.at(-1);
  let lo=0,hi=times.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]<now)lo=mid;else hi=mid}
  return values[lo]+(values[hi]-values[lo])*Math.max(0,Math.min(1,(now-times[lo])/(times[hi]-times[lo])));
 }
 function automate(node,old,targets,now,fallback){
  const initial=plannedValue(old,now,fallback),values=orchestraGainCurve(targets,initial),times=[now,...targets.map((_,i)=>now+(i===0?.004:i*ORCHESTRA_MIX_STEP))];
  const p=node.gain;
  if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(now);else p.cancelScheduledValues(now);
  p.setValueAtTime(initial,now);
  // Collapse constant stretches, but retain the endpoint before a change.
  for(let i=1;i<times.length;i++)if(i===times.length-1||Math.abs(values[i]-values[i-1])>1e-6||Math.abs(values[i+1]-values[i])>1e-6)p.linearRampToValueAtTime(values[i],times[i]);
  return {times,values};
 }
 function planMix(){
  if(!audio||!mixBus||batching)return;
  const now=audio.currentTime,active=[...voices.values()].filter(v=>v.end>now),end=active.reduce((t,v)=>Math.max(t,v.end),now);
  const count=Math.max(2,Math.ceil((end-now)/ORCHESTRA_MIX_STEP)+25);
  const analysis=orchestraMixAnalysis(active,now,count),power=new Float64Array(count),peaks=new Float64Array(count);
  for(const [name,c] of channels){
   const track=analysis.get(name),cap=profile?.get(name)??ORCHESTRA_CHANNEL_GAIN;
   if(!track&&(!c.plan||now>=c.plan.times.at(-1))&&cap===ORCHESTRA_CHANNEL_GAIN)continue;
   const target=Array.from({length:count},(_,i)=>orchestraChannelGain(Math.sqrt(track?.power[i]||0),cap));
   c.plan=automate(c.node,c.plan,target,now,ORCHESTRA_CHANNEL_GAIN);
   if(track)for(let i=0;i<count;i++){
    // Include the actual planned ramp at both edges of each block.
    const g=Math.max(plannedValue(c.plan,now+i*ORCHESTRA_MIX_STEP,cap),plannedValue(c.plan,now+(i+1)*ORCHESTRA_MIX_STEP,cap));
    power[i]+=track.power[i]*g*g;peaks[i]+=track.peak[i]*g;
   }
  }
  mixPlan=automate(mixBus,mixPlan,Array.from({length:count},(_,i)=>orchestraOutputGain(power[i],peaks[i])),now,1);
 }
 function setSongProfile(song){
  profile=null;
  if(!song?.length)return;
  const items=song.filter(x=>Object.hasOwn(instruments,x.g.instrument)&&safeNote(x.g.n)).map(x=>voiceInfo(x.g.instrument,x.g.n,x.g.volume,x.at));
  const end=items.reduce((t,v)=>Math.max(t,v.end),0),count=Math.max(1,Math.ceil(end/.05));
  const analysis=orchestraMixAnalysis(items,0,count,.05);profile=new Map();
  for(const [name,track] of analysis){
   const powers=Array.from(track.power).filter(x=>x>1e-6).sort((a,b)=>a-b);
   const rms=Math.sqrt(powers[Math.floor((powers.length-1)*.85)]||0);
   // A modest fixed fader adjustment for the phrase, not loudness
   // normalization to a broadcast target. Preserve musical dynamics.
   profile.set(name,Math.max(.62,orchestraChannelGain(rms)));
  }
 }
 function prepare(groups){if(audio)for(const g of groups)instrumentSample(g.instrument,g.n)}
 function batch(groups,when){
  const result=[];batching=true;
  try{for(const g of groups){const at=tone(g.instrument,g.n,g.volume,when(g.time));result.push(at)}}finally{batching=false;planMix()}
  return result;
 }
 function stopSound(){
  if(!master||!audio)return;
  const now=audio.currentTime,old=[...voices];voices.clear();
  const audible=audio.state==='running',tail=new Set();
  // Never allow a future queued onset to play after a transport change.
  // Already-started voices keep their phase and original note envelopes.
  for(const [src,v] of old){
   if(audible&&v.when<=now&&v.end>now)tail.add(src);
   else stopSource(src);
  }
  if(tail.size){
   const graph={channels,mixBus,gate,sources:tail};retiring.add(graph);
   // Freeze old musical gains before the transport fade. Resetting them
   // here would boost the dying chord or create a discontinuity.
   for(const c of channels.values())holdGain(c.node,c.plan,now,ORCHESTRA_CHANNEL_GAIN);
   holdGain(mixBus,mixPlan,now,1);
   const level=holdGain(gate,gatePlan,now,0);
   fadeGate(gate,level,0,now,ORCHESTRA_FADE_OUT);
   for(const [src,v] of old)if(tail.has(src)){
    v.retiring=graph;
    try{src.stop(Math.min(v.end+.015,now+ORCHESTRA_FADE_OUT+.005))}catch{}
   }
   // A new graph can accept notes immediately while the old one fades.
   createMixGraph();
  }else{
   if(!audible)discardRetiring();
   function reset(node,value){node.gain.cancelScheduledValues(0);node.gain.setValueAtTime(value,now)}
   for(const c of channels.values()){c.plan=null;reset(c.node,ORCHESTRA_CHANNEL_GAIN)}
   mixPlan=null;reset(mixBus,1);reset(gate,0);gateStart=Infinity;gatePlan=null;
   if(!audible){gainTarget=getVolume();reset(master,gainTarget)}
  }
 }
 function tone(instrument,n,velocity,at){
  if(!audio||audio.state!=='running'||n===null||!safeNote(n)||!Number.isFinite(velocity)||velocity<=0)return;velocity=Math.min(1,velocity);
  if(voices.size>=512){dropped++;return}
  instrument=Object.hasOwn(instruments,instrument)?instrument:'synth';
  const channel=channels.get(instrument),when=Math.max(audio.currentTime+.012,at||0),src=audio.createBufferSource(),env=audio.createGain(),v=voiceInfo(instrument,n,velocity,when);
  src.buffer=v.sample.buffer;src.playbackRate.value=v.rate;
  env.gain.setValueAtTime(v.level,when);env.gain.setValueAtTime(v.level,v.end-v.fade);env.gain.linearRampToValueAtTime(0,v.end);
  src.connect(env);env.connect(channel.node);src.start(when);src.stop(v.end+.015);voices.set(src,v);startGate(when);planMix();
  src.onended=()=>{
   voices.delete(src);try{src.disconnect();env.disconnect()}catch{}
   if(v.retiring){const g=v.retiring;g.sources.delete(src);if(!g.sources.size)disconnectGraph(g)}
  };
  return when;
 }

 return {unlock,stop:stopSound,tone,prepare,batch,setSongProfile,mix:mixGain,get ready(){return audio?.state==='running'},get time(){return audio?.currentTime||0},get dropped(){return dropped},get status(){return status},resetDropped(){dropped=0}};
}
