'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),test=require('node:test');
const c=vm.createContext({});vm.runInContext(fs.readFileSync('scripts/ui/orchestra/harmony.js','utf8'),c);
const h=vm.runInContext('orchestraHarmony',c);
const instruments=Object.keys(h.instrumentPools),drums=new Set(['kick','percussion']);
function rng(seed){return ()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296}}
test('random phrases retain tonality, cyclic voice leading and real event length',()=>{
 let count=0,short=0,duplicateBlocks=0;const random=rng(843927);
 for(const mode of Object.keys(h.modes))for(let key=0;key<12;key++)for(const inst of instruments)for(const dir of ['in','out'])for(const length of [4,8,16])for(let rep=0;rep<64;rep++){
  const a=h.make(inst,dir,length,key,mode,random),n=a.filter(x=>x!==null);
  assert.equal(a.length,length);assert.equal((a[0]-key+120)%12,0);
  assert.notEqual(a.at(-1),null);
  assert(a.every(x=>Number.isInteger(x)&&x>=24&&x<=96&&h.modes[mode].scale.includes((x-key+120)%12)));
  assert(n.every((x,i)=>Math.abs(x-n[(i+1)%n.length])<=7),JSON.stringify({mode,key,inst,dir,a}));
  assert([0,7].includes((a.at(-1)-key+120)%12));
  if(!drums.has(inst)&&a.every((v,i)=>v===a[i%(length/2)]))short++;
  if(!drums.has(inst)){const blocks=Array.from({length:length/4},(_,i)=>JSON.stringify(a.slice(i*4,i*4+4)));if(new Set(blocks).size!==blocks.length)duplicateBlocks++}
  count++;
 }
 assert.equal(short,0);assert.equal(duplicateBlocks,0);console.log('HARMONY_PHRASES',count,'short melodic periods',short,'duplicate melodic blocks',duplicateBlocks);
});
test('shared orchestration and optional modulation remain bounded',()=>{
 const random=rng(88321);
 for(let i=0;i<5000;i++){
  const prev={key:i%12},next=h.chooseHarmony(prev,random);assert.notEqual(next.key,prev.key);
  for(const inst of instruments){const a=h.arrange(inst,inst,random);assert(h.instrumentPools[inst].includes(a.instrument));assert.notEqual(a.instrument,inst);assert(a.volume>0&&a.volume<1)}
  for(const bars of [1,2,4]){const p=h.keyPlan(bars,random);assert.equal(p.length,bars);assert.equal(h.barOffset(4*bars,p),0);assert(p.every(x=>[0,5,7].includes(x)))}
 }
});
