'use strict';
// Asynchronous event loops share one stable tonal center. No chord change
// is tied to an individual machine's independent transfer cursor.
const orchestraHarmony=(()=>{
 const modes={minor:{chord:[0,3,7,10],scale:[0,3,5,7,10]},major:{chord:[0,4,7,9],scale:[0,2,4,7,9]},pentatonic:{chord:[0,3,7],scale:[0,3,5,7,10]}};
 const roles={
  bass:{octave:36,range:9,root:.66},kick:{octave:36,range:0,root:1},
  percussion:{octave:48,range:0,root:1},glitch:{octave:60,range:7,root:.5},
  synth:{octave:48,range:12,root:.28},pluck:{octave:60,range:12,root:.26},
  piano:{octave:60,range:12,root:.32},marimba:{octave:60,range:12,root:.28},
  chime:{octave:72,range:12,root:.15}
 };
 // Role-aware orchestration rather than assigning nine timbres uniformly.
 const instrumentPools={
  bass:['bass','bass','pluck','marimba'],
  kick:['kick','percussion','bass'],
  percussion:['percussion','kick','marimba','pluck'],
  synth:['synth','piano','pluck','marimba'],
  pluck:['pluck','piano','synth','marimba','chime'],
  piano:['piano','pluck','marimba','synth'],
  marimba:['marimba','pluck','percussion','glitch'],
  chime:['chime','piano','marimba','pluck'],
  glitch:['glitch','percussion','marimba','pluck']
 };
 function chooseHarmony(previous={},random=Math.random){
  const old=Number.isInteger(previous?.key)&&previous.key>=0&&previous.key<12?previous.key:null;
  return {key:old===null?Math.floor(random()*12):(old+1+Math.floor(random()*11))%12,mode:['minor','major','pentatonic'][Math.floor(random()*3)]};
 }
 // Related-key transposition is shared by every voice on the game beat
 // clock, never by independent receive/send cursors. Keep the first bar
 // at the base key and use fourth/fifth neighbors for the other bars.
 // Favor an eight-beat phrase, with occasional short or long phrases.
 function randomBars(random=Math.random){const u=random();return u<.20?1:u<.80?2:4}
 function keyPlan(bars,random=Math.random){
  const patterns=bars===1?[[0]]:bars===2?[[0,5],[0,7]]:[[0,5,0,7],[0,7,5,0],[0,0,5,7]];
  return patterns[Math.floor(random()*patterns.length)].slice();
 }
 function barOffset(time,plan){
  if(!Array.isArray(plan)||!plan.length)return 0;
  const i=Math.max(0,Math.floor((Number(time)||0)/4))%plan.length;
  return [0,5,7].includes(plan[i])?plan[i]:0;
 }
 function transpose(note,time,plan){
  if(note===null||!Number.isInteger(note))return null;
  let n=note+barOffset(time,plan);
  while(n>96)n-=12;while(n<24)n+=12;
  return n;
 }
 function arrange(preferred,previous,random=Math.random){
  const pool=instrumentPools[preferred]||instrumentPools.synth;
  const alternatives=pool.filter(name=>name!==previous),choices=alternatives.length?alternatives:pool;
  const instrument=choices[Math.floor(random()*choices.length)];
  const gain={bass:.76,kick:.60,percussion:.48,glitch:.45,chime:.49,marimba:.63,piano:.68,pluck:.66,synth:.65}[instrument]||.65;
  return {instrument,volume:Math.round((gain+(random()-.5)*.16)*100)/100};
 }
 function make(instrument,dir,length,key=0,mode='minor',random=Math.random){
  const role=roles[instrument]||roles.synth,h=modes[mode]||modes.minor,base=role.octave+((key%12+12)%12),pick=a=>a[Math.min(a.length-1,Math.floor(random()*a.length))];
  const low=instrument==='bass',drum=role.range===0;
  const chord=low?[0,7]:h.chord.filter(n=>n<=role.range);
  const extra=['chime','marimba','pluck'].includes(instrument)?h.scale.filter(n=>n<=role.range):chord;
  // Four event slots form a generation block, not a clocked musical bar.
  // Every block gets its own anchor and contour within the SAME chord/scale.
  // Do not independently transpose a machine: its transfer cursor is async.
  let previous=0,previousAnchor=null;const seq=[],blocks=[];
  const cadence=[0,7],legal=(pool,last)=>pool.filter(n=>Math.abs(n-last)<=7);
  const weighted=(pool,anchor,last,shape)=>{
   const weights=pool.map(n=>(n===anchor?2.6:1)*(n===0?1+role.root:1)*(shape*(n-last)>0?1.65:1));
   let u=random()*weights.reduce((a,b)=>a+b,0);
   for(let j=0;j<pool.length;j++){u-=weights[j];if(u<0)return pool[j]}
   return pool.at(-1);
  };
  for(let start=0;start<length;start+=4){
   const size=Math.min(4,length-start),before=previous;
   let choices=legal(chord,previous);
   if(!choices.length)choices=[0,7].filter(n=>Math.abs(n-previous)<=7);
   const other=choices.filter(n=>n!==previousAnchor);
   const anchor=drum||start===0?0:pick(other.length?other:choices);
   const shape=random()<.5?-1:1,block=[];
   for(let j=0;j<size;j++){
    const i=start+j,first=i===0,last=i===length-1;
    let n;
    if(drum||first)n=0;
    else if(last)n=pick(legal(cadence,previous));
    else if(j===0)n=anchor;
    else{
     const pool=legal(random()<.12?extra:chord,previous);
     n=weighted(pool.length?pool:legal(cadence,previous),anchor,previous,dir==='in'?-shape:shape);
    }
    previous=n;block.push(n);
   }
   // Prefer four different melodic blocks, even for a very limited
   // bass palette. A small legal edit resolves accidental duplicates.
   // Every edit preserves the neighboring pitches and the final cadence.
   if(!drum&&blocks.some(old=>old.length===size&&old.every((n,j)=>n===block[j]))){
    const duplicate=a=>blocks.some(old=>old.length===a.length&&old.every((n,j)=>n===a[j]));
    let found=null;
    for(let j=0;j<size&&!found;j++){
     const i=start+j;if(i===0)continue;
     const left=j?block[j-1]:before;
     const right=j+1<size?block[j+1]:start+size===length?0:null;
     const pool=i===length-1?cadence:chord;
     for(const n of pool){
      if(n===block[j]||Math.abs(n-left)>7||right!==null&&Math.abs(n-right)>7)continue;
      const candidate=block.slice();candidate[j]=n;if(!duplicate(candidate)){found=candidate;break}
     }
    }
    if(found)block.splice(0,size,...found);
   }
   previous=block.at(-1)??before;
   previousAnchor=anchor;blocks.push(block);
   for(const n of block)seq.push(Math.max(24,Math.min(96,base+n)));
  }

  // The one-block setting must not collapse into a two-event loop.
  if(!drum&&length===4&&seq[0]===seq[2]&&seq[1]===seq[3]){
   const left=seq[1],right=seq[3];
   const options=chord.map(n=>base+n).filter(n=>n!==seq[2]&&Math.abs(n-left)<=7&&Math.abs(n-right)<=7);
   if(options.length)seq[2]=pick(options);

  }
  return seq;
 }
 return {make,modes,chooseHarmony,arrange,instrumentPools,keyPlan,barOffset,transpose,randomBars};
})();
