'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const c=vm.createContext({});
for(const name of ['audio','period'])vm.runInContext(fs.readFileSync('scripts/ui/orchestra/'+name+'.js','utf8'),c);
const group=vm.runInContext('orchestraGroupNotes',c),p=vm.runInContext('orchestraPeriod',c);
test('dense same-tick unisons coalesce without losing events or collapsing different ticks',()=>{
 const events=Array.from({length:2000},(_,i)=>({id:'M'+i,time:12+(i>=1000?.05:0),instrument:'piano',n:60,volume:.7}));
 events.push({time:12,instrument:'bass',n:60,volume:.5},{time:12,instrument:'piano',n:64,volume:.5},{time:12,instrument:'piano',n:null,volume:1});
 const a=group(events);assert.equal(a.length,4);
 assert.equal(a.reduce((s,g)=>s+g.events.length,0),2002);
 assert.equal(a[0].events.length,1000);assert.equal(a[0].volume,1);
 assert.equal(a[3].time,12.05);assert(a.every(g=>g.volume<=1));
});
test('reference period is derived from witnessed orbit and exact rates; never guesses from rates alone',()=>{
 const layout={machines:[{id:'A',type:'a'},{id:'B',type:'b'}]},b={diagnostics:{components:[{machines:['A'],actualStatus:'exact-model-period',periodTicks:120,prefixTicks:200},{machines:['B'],actualStatus:'exact-model-period',periodTicks:100,prefixTicks:50}]},fractions:{machineTotals:{A:{out:'1'},B:{out:'1'}}}};
 const length=(_,d)=>d==='out'?16:0;
 const r=p.estimate(layout,b,length,320);assert.equal(r.status,'period');assert.equal(r.ticks,4800n);assert.equal(r.prefix,200);
 assert.equal(p.duration(57600n,120),'24分0秒');
 b.diagnostics.components[1].actualStatus='exact-model-analytic';assert.equal(p.estimate(layout,b,length).status,'unknown');assert.equal(p.estimate(layout,b,length).analytic,1);
 b.fractions.machineTotals.B.out='0';assert.equal(p.estimate(layout,b,length).ticks,960n);
 b.fractions.machineTotals.B.out=null;assert.equal(p.estimate(layout,b,length).status,'unknown');
});

test('nonexistent directions are excluded even for a shared type score',()=>{
 const layout={machines:[{id:'A',type:'same',dir:'in'},{id:'B',type:'same',dir:'out'}]};
 const budget={diagnostics:{components:[{machines:['A','B'],actualStatus:'exact-model-period',periodTicks:20,prefixTicks:0}]},fractions:{machineTotals:{A:{in:'1'},B:{out:'1'}}}};
 const r=p.estimate(layout,budget,(_type,dir,m)=>m.dir===dir?16:0);
 assert.equal(r.status,'period');assert.equal(r.ticks,320n);
});


test('envelope analysis excludes queued notes, accounts for tails and coherent duplicates',()=>{
 const analyse=vm.runInContext('orchestraMixAnalysis',c),gain=vm.runInContext('orchestraChannelGain',c),output=vm.runInContext('orchestraOutputGain',c);
 const sample={rms:Float32Array.from([.3,.2,.1,0]),peak:Float32Array.from([.6,.4,.2,0]),dt:.01};
 const voice=(when,n=60,instrument='piano')=>({instrument,n,when,end:when+.04,rate:1,sample,fade:.01,level:1});
 const a=analyse([voice(0),voice(0),voice(1)],0,5,.01).get('piano');
 assert(Math.abs(a.power[0]-.36)<1e-6);assert(a.power[3]===0);assert(a.power[4]===0);
 const b=analyse([voice(0),voice(0,64)],0,5,.01).get('piano');
 assert(Math.abs(b.power[0]-.18)<1e-6);
 assert.equal(gain(.05),.86);assert(gain(.3)<gain(.1));
 assert(output(.01,.2)===1);assert(output(.04,1)<=.58);
});
test('stop resets every mix bus even with suspended audio; stale endings cannot affect the new session',async()=>{
 const ctx=vm.createContext({});
 vm.runInContext(fs.readFileSync('scripts/ui/orchestra/audio.js','utf8'),ctx);
 vm.runInContext(`
 const gains=[],sources=[];
 function param(){return {value:0,calls:[],setValueAtTime(v,t){this.value=v;this.calls.push(['set',v,t])},setTargetAtTime(v,t,k){this.calls.push(['target',v,t,k])},cancelScheduledValues(t){this.calls.push(['cancel',t])},cancelAndHoldAtTime(t){this.calls.push(['hold',t])},linearRampToValueAtTime(v,t){this.calls.push(['ramp',v,t])}}}
 class Audio{constructor(){this.state='running';this.currentTime=1;this.destination={};globalThis.ac=this}
  resume(){this.state='running';return Promise.resolve()}
  createGain(){const g={gain:param(),connect(){},disconnect(){}};gains.push(g);return g}
  createBuffer(ch,n,sr){const data=new Float32Array(n);return {duration:n/sr,getChannelData:()=>data}}
  createBufferSource(){const s={playbackRate:param(),connect(){},disconnect(){this.disconnected=true},start(){},stop(){}};sources.push(s);return s}
 }
 globalThis.window={AudioContext:Audio};const player=createOrchestraAudio(()=>120,()=>.6);
 `,ctx);
 await vm.runInContext('player.unlock()',ctx);
 vm.runInContext(`
 player.batch(Array.from({length:32},()=>({instrument:'piano',n:60,volume:.7,time:1.06})),t=>t);
 const master=gains[0].gain,mix=gains[1].gain,piano=gains[7].gain,dense=Math.min(...piano.calls.filter(x=>x[0]==='ramp').map(x=>x[1]));
 ac.state='suspended';player.stop();const reset=piano.value,resetCalls=piano.calls.slice(-2);
 `,ctx);
 await vm.runInContext('player.unlock()',ctx);
 vm.runInContext(`
 player.tone('piano',60,.7,1.06);const before=gains.reduce((s,g)=>s+g.gain.calls.length,0);
 for(const src of sources.slice(0,32))src.onended();
 const result={dense,reset,resetCalls,stale:gains.reduce((s,g)=>s+g.gain.calls.length,0)-before,after:piano.value,master:master.value,mix:mix.value,disconnected:sources.slice(0,32).every(s=>s.disconnected)};
 `,ctx);
 const r=vm.runInContext('result',ctx);
 assert(r.dense<.1);assert.equal(r.reset,.86);assert.equal(r.after,.86);assert.equal(r.master,.6);assert.equal(r.mix,1);assert.equal(r.stale,0);assert(r.disconnected);assert.equal(r.resetCalls[0][0],'cancel');assert.equal(r.resetCalls[0][1],0);
});
test('gain curve does not reduce early gain for a distant onset and releases smoothly',()=>{
 const curve=vm.runInContext('orchestraGainCurve',c),a=curve([.86,.86,.86,.2,.86,.86],.86);
 assert.equal(a[1],.86);assert.equal(a[2],.86);assert.equal(a[3],.2);assert(a[5]>.2&&a[5]<.86);
});

test('synthesized samples are bounded and start smoothly; pitch roots stay within one semitone',async()=>{
 const ctx=vm.createContext({});
 vm.runInContext(fs.readFileSync('scripts/ui/orchestra/audio.js','utf8'),ctx);
 vm.runInContext(`
 const buffers=[];
 class Audio{constructor(){this.state='running';this.currentTime=0;this.destination={}}
  createGain(){return {gain:{value:0},connect(){}}}
  createBuffer(ch,n,sr){const data=new Float32Array(n),b={data,sr,duration:n/sr,getChannelData:()=>data};buffers.push(b);return b}
 }
 globalThis.window={AudioContext:Audio};const player=createOrchestraAudio(()=>120,()=>.6);
 `,ctx);
 await vm.runInContext('player.unlock()',ctx);
 const result=vm.runInContext(`
 const checks=[];
 for(const instrument of Object.keys(ORCHESTRA_INSTRUMENTS))for(const n of [36,60,84]){
  player.prepare([{instrument,n}]);const b=buffers.at(-1),d=b.data;let peak=0,dc=0,energy=0;
  for(const x of d){peak=Math.max(peak,Math.abs(x));dc+=x;energy+=x*x}
  checks.push({instrument,n,sr:b.sr,peak,dc:dc/d.length,rms:Math.sqrt(energy/d.length),first:d[0],end:d.at(-1)});
 }
 const count=buffers.length;player.prepare([{instrument:'piano',n:59},{instrument:'piano',n:61}]);
 ({checks,reused:buffers.length===count})
 `,ctx);
 assert(result.reused);
 for(const q of result.checks){
  assert.equal(q.sr,32000);assert(q.peak<=.780001&&q.peak>.77);assert.equal(q.first,0);assert(Math.abs(q.dc)<.004);assert(q.rms>0&&Number.isFinite(q.rms));assert(Math.abs(q.end)<.01);
 }
});

test('transport fade preserves phase and smooth endpoints without delaying new onsets',async()=>{
 const fade=vm.runInContext('orchestraTransportFade',c),out=fade(1,0,2,.045),incoming=fade(0,1,2,.03);
 assert.equal(out.values[0],1);assert.equal(out.values.at(-1),0);assert.equal(incoming.values[0],0);assert.equal(incoming.values.at(-1),1);
 assert(Math.abs(out.times.at(-1)-2.045)<1e-9);
 assert(out.values.every((v,i)=>i===0||v<=out.values[i-1]));assert(incoming.values.every((v,i)=>i===0||v>=incoming.values[i-1]));
 assert(1-out.values[1]<.02&&out.values.at(-2)<.02);
 const ctx=vm.createContext({});
 vm.runInContext(fs.readFileSync('scripts/ui/orchestra/audio.js','utf8'),ctx);
 vm.runInContext(`
 const gains=[],sources=[];
 function param(){return {value:0,calls:[],setValueAtTime(v,t){this.value=v;this.calls.push(['set',v,t])},setTargetAtTime(v,t,k){this.calls.push(['target',v,t,k])},cancelScheduledValues(t){this.calls.push(['cancel',t])},cancelAndHoldAtTime(t){this.calls.push(['hold',t])},linearRampToValueAtTime(v,t){this.calls.push(['ramp',v,t])}}}
 class Audio{constructor(){this.state='running';this.currentTime=1;this.destination={};globalThis.ac=this}
  createGain(){const g={gain:param(),connect(){},disconnect(){this.disconnected=true}};gains.push(g);return g}
  createBuffer(ch,n,sr){const data=new Float32Array(n);return {duration:n/sr,getChannelData:()=>data}}
  createBufferSource(){const s={playbackRate:param(),connect(){},disconnect(){this.disconnected=true},start(t){this.startAt=t},stop(t){this.stopAt=t}};sources.push(s);return s}
 }
 globalThis.window={AudioContext:Audio};const player=createOrchestraAudio(()=>120,()=>.6);
 `,ctx);
 await vm.runInContext('player.unlock()',ctx);
 const r=vm.runInContext(`
 player.tone('piano',60,.7,1.06);player.tone('bass',48,.7,1.8);
 const oldGate=gains[11],oldMix=gains[1],oldPiano=gains[7];
 ac.currentTime=1.12;player.stop();
 const oldFade=oldGate.gain.calls.at(-1),oldHeld=oldGate.gain.calls.slice(-13)[0],oldStop=sources[0].stopAt;
 const futureCanceled=sources[1].disconnected,oldAlive=!sources[0].disconnected;
 const newGate=gains.at(-1),newAt=player.tone('piano',60,.7,1.135);
 const newFade=newGate.gain.calls.at(-1),freshBefore=newGate.gain.calls.length;
 sources[0].onended();sources[1].onended();
 ({oldFade,oldHeld,oldStop,futureCanceled,oldAlive,newAt,newFade,newStarts:sources[2].startAt,newUnaffected:newGate.gain.calls.length===freshBefore,oldDetached:oldGate.disconnected&&oldMix.disconnected&&oldPiano.disconnected,newConnected:!newGate.disconnected})
 `,ctx);
 assert(r.oldAlive&&r.futureCanceled&&r.oldDetached&&r.newConnected&&r.newUnaffected);
 assert.equal(r.oldHeld[0],'set');assert.equal(r.oldHeld[1],1);
 assert.equal(r.oldFade[1],0);assert(Math.abs(r.oldFade[2]-1.165)<1e-9);
 assert(Math.abs(r.oldStop-1.17)<1e-9);assert.equal(r.newAt,1.135);assert.equal(r.newStarts,1.135);assert.equal(r.newFade[1],1);assert(Math.abs(r.newFade[2]-1.165)<1e-9);
});
