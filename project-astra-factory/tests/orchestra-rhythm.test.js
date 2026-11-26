'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const context=vm.createContext({ORCHESTRA_INSTRUMENTS:{piano:{color:'#ffffff'},bass:{color:'#88aaff'}}});
vm.runInContext(fs.readFileSync('scripts/ui/orchestra/rhythm.js','utf8'),context);
const make=vm.runInContext('createOrchestraRhythmModel',context),g=n=>({n,instrument:'piano'});
test('judgement boundaries, score, combo, miss and one-time notes',()=>{
 const m=make(),a=m.add(g(60),2),b=m.add(g(61),2.5),c=m.add(g(62),3),d=m.add(g(63),3.5);
 assert.equal(m.press(a.lane,1.98).hit.grade,'PERFECT');
 assert.equal(m.press(b.lane,2.42).hit.grade,'GREAT');
 assert.equal(m.press(c.lane,3.12).hit.grade,'GOOD');
 assert.equal(m.press(c.lane,3.12).hit,null);
 assert.equal(m.expire(3.69)[0].grade,'MISS');
 const s=m.stats();assert.equal(s.score,2100);assert.equal(s.combo,0);assert.equal(s.maxCombo,3);assert.equal(s.miss,1);assert.equal(s.accuracy,.525);
});
test('density limits do not change supplied audio groups; pause cancels pending without miss',()=>{
 const m=make(4,'advanced'),groups=Array.from({length:100},(_,i)=>g(48+i%24)),snapshot=JSON.stringify(groups);
 for(const a of groups)m.add(a,2);
 assert.equal(m.notes.length,2);assert.equal(JSON.stringify(groups),snapshot);
 m.clearPending();assert.equal(m.notes.length,0);assert.equal(m.expire(10).length,0);assert.equal(m.stats().miss,0);
 const n=m.add(g(60),11);assert(n);assert.equal(m.add(g(60),11.05),null);const n2=m.add(g(60),11.15);assert(n2);assert.notEqual(n.lane,n2.lane);
 m.reset();assert.equal(m.stats().score,0);assert.equal(m.notes.length,0);
});

test('4/6/8 lanes are independent of difficulty and autoplay uses real onsets',()=>{
 for(const count of [4,6,8])for(const [difficulty,chord] of [['easy',1],['advanced',2],['hard',3]]){
  const m=make(count,difficulty);
  for(let i=0;i<40;i++)m.add(g(60+i),2);
  assert.equal(m.notes.length,chord);
  assert(m.notes.every(n=>n.lane<count));
  assert.equal(m.autoplay(1.999).length,0);
  assert.equal(m.autoplay(2).length,chord);
  assert.equal(m.stats().score,1000*chord);
  assert.equal(m.stats().miss,0);assert.equal(m.autoplay(3).length,0);
 }
 for(const count of [4,6,8]){
  const totals=[];
  for(const [difficulty,cap] of [['easy',3],['advanced',6],['hard',10]]){
   const m=make(count,difficulty);
   for(let t=0;t<1000;t++)for(let n=0;n<8;n++)m.add(g(60+n),2+t*.01);
   totals.push(m.notes.length);
   for(const note of m.notes)assert(m.notes.filter(x=>x.at>=note.at&&x.at<note.at+1-1e-9).length<=cap);
   m.configure(count,'easy');assert.equal(m.notes.length,0);assert.equal(m.stats().score,0);
  }
  assert(totals[0]<totals[1]&&totals[1]<totals[2],JSON.stringify({count,totals}));
  console.log('RHYTHM_DENSITY',count,totals);
 }
 const m=make();for(let i=0;i<8;i++)m.add(g(60+i),2);assert.equal(m.notes.length,1);
});

test('16 bars repeat twice at 120 BPM without resetting the song clock',()=>{
 const plan=vm.runInContext('orchestraRhythmSongPlan',context)();
 assert.equal(plan.bars,16);assert.equal(plan.repeats,2);assert.equal(plan.phraseSeconds,32);assert.equal(plan.duration,64);
 const loop=vm.runInContext('orchestraRhythmLoopGroups',context);
 const groups=[{n:60,time:1},{n:62,time:64},{n:64,time:65}],song=loop(groups,plan);
 assert.deepEqual(Array.from(song,x=>x.at),[.5,32,32.5,64]);assert.deepEqual(Array.from(song,x=>x.g.n),[60,62,60,62]);
});
test('source simulates one 16-bar phrase once and repeats its events',()=>{
 const c=vm.createContext({structuredClone,performance:{now:()=>0},sim:{real:true},ware:{real:9},simTime:777,frozenSimCache:{real:true},simVisualDirty:false,simTransferObserver:()=>{},state:{machines:[{id:'M0',type:'仓入'}],routes:[{id:'R0'}]},simMachineState:()=>({sent:0})});
 vm.runInContext(fs.readFileSync('scripts/ui/orchestra/rhythm.js','utf8'),c);
 vm.runInContext(fs.readFileSync('scripts/ui/orchestra/rhythm-source.js','utf8'),c);
 vm.runInContext(`
 const original={sim,ware,simTime,frozenSimCache,simTransferObserver};let ticks=0,resets=0,last=null;
 function orchestraTransferCount(id){return sim.byMachine[id].sent}
 function orchestraGroupNotes(events){return events}
 function simulateBatchSteps(n,dt,{afterStep}={}){
  if(sim!==last){last=sim;resets++}
  for(let i=0;i<n;i++){ticks++;simTime=ticks*dt;ware.count=(ware.count||0)+1;sim.byMachine.M0.sent++;sim.routes.R0=[{item:"test",distance:ticks*.05}];
   if(ticks===7||ticks%1280===0)simTransferObserver(state.machines[0],'in',0,'item',simTime);afterStep?.();}
 }
 const source=createOrchestraRhythmSource({track:()=>({instrument:'piano',volume:1}),pitch:(type,dir,i)=>i},orchestraRhythmSongPlan(),true,"M0");
 while(!source.step()){};const song=source.finish(),frames=source.panelFrames(),packets=source.packetFrames();
 `,c);
 const result=vm.runInContext('({ticks,resets,ats:song.map(x=>x.at),counts:song.map(x=>x.g.n),frames:frames.length,packetFrames:packets.length,packetLast:packets.at(-1).time,packetStart:packets[1].routes.R0[0],packetEnd:packets.at(-1).routes.R0[0],first:frames[0].time,last:frames.at(-1).time,stock:frames.at(-1).ware.count,inspector:frames.at(-1).sim.byMachine.M0.sent,inspectorFirst:frames[0].sim.byMachine.M0.sent,restored:sim===original.sim&&ware===original.ware&&simTime===original.simTime&&frozenSimCache===original.frozenSimCache&&simTransferObserver===original.simTransferObserver})',c);
 assert.equal(result.ticks,1280);assert.equal(result.resets,1);assert.deepEqual(Array.from(result.ats),[.17500000000000002,32,32.175,64]);assert.deepEqual(Array.from(result.counts),[6,1279,6,1279]);assert.equal(result.frames,258);assert.equal(result.packetFrames,641);assert.equal(result.packetLast,64);assert(Math.abs(result.packetStart-.1)<1e-6);assert.equal(result.packetEnd,64);assert.equal(result.first,0);assert.equal(result.last,64);assert.equal(result.stock,1280);assert.equal(result.inspector,1280);assert.equal(result.inspectorFirst,0);assert(result.restored);
});

test('grade colors and bounded fall duration',()=>{
 const colors=vm.runInContext('ORCHESTRA_RHYTHM_GRADE_COLORS',context),lead=vm.runInContext('orchestraRhythmLead',context);
 assert.equal(colors.MISS,'#ff626b');assert.equal(colors.GOOD,'#60aaff');assert.equal(colors.GREAT,'#60e397');assert.equal(colors.PERFECT,'#ffd268');
 assert.equal(lead('1.37'),1.37);assert.equal(lead(.1),.5);assert.equal(lead(99),3);assert.equal(lead('',1.37),1.37);assert.equal(lead(undefined),1.2);
});

test('crazy preserves every audible group, fills all lanes and groups simultaneous overflow per key',()=>{
 for(const count of [4,6,8]){
  const m=make(count,'crazy'),groups=Array.from({length:37},(_,i)=>g(48+i)),before=JSON.stringify(groups);
  const chord=groups.map(a=>m.add(a,2));assert(chord.every(Boolean));
  assert.equal(new Set(chord.map(n=>n.lane)).size,count);
  assert.equal(chord.length,37);assert.equal(JSON.stringify(groups),before);
  const lane=chord[0].lane,stack=chord.filter(n=>n.lane===lane);
  assert(stack.every(n=>n.stack.count===stack.length));assert.deepEqual(stack.map(n=>n.slot),Array.from({length:stack.length},(_,i)=>i));
  const next=m.add(g(60),2.025);assert(next);
  const pressed=m.press(lane,2);
  assert.equal(pressed.hits.length,stack.length);assert(pressed.hits.every(r=>r.grade==='PERFECT'&&r.note.at===2));
  assert(m.notes.includes(next),'a distinct later onset must remain independent');
  assert.equal(m.autoplay(2.025).length,38-stack.length);
  assert.equal(m.stats().perfect,38);assert.equal(m.stats().score,38000);
  m.reset();
  for(let t=0;t<40;t++)for(let i=0;i<12;i++)assert(m.add(g(48+i),3+t*.025));
  assert.equal(m.notes.length,480);assert.equal(m.expire(5).length,480);assert.equal(m.stats().miss,480);
 }
});
