'use strict';
// Research utility: a sufficient period of the transfer-driven score, not
// the minimum audible period. Accept only witnessed physical orbit periods.
const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a};
const lcm=(a,b)=>a/gcd(a,b)*b;
function countPeriod(count,length){
 const c=BigInt(count),L=BigInt(length);
 if(c<0n||L<1n)throw Error('invalid cursor count');
 return L/gcd(L,c);
}
function componentMusicPeriod(periodTicks,counts){
 const p=BigInt(periodTicks);if(p<1n)throw Error('invalid physical period');
 let repeats=1n;for(const {count,length} of counts)repeats=lcm(repeats,countPeriod(count,length));
 return p*repeats;
}
function scorePeriod(components,modulationTicks=1){
 let result=BigInt(modulationTicks);if(result<1n)throw Error('invalid modulation period');
 for(const c of components)result=lcm(result,componentMusicPeriod(c.periodTicks,c.counts));
 return result;
}
module.exports={countPeriod,componentMusicPeriod,scorePeriod};
if(require.main===module){
 const fs=require('node:fs');
 const files=JSON.parse(fs.readFileSync('tools/iteration/model-environment.js','utf8').match(/for\(const f of (\[.*?\])\)/)[1].replaceAll("'",'"'));
 const body=files.map(n=>fs.readFileSync('scripts/'+n+'.js','utf8')).join('\n');
 const el={getContext(){return{}},classList:{add(){},remove(){}}};
 const make=new Function('document','requestAnimationFrame','ast',body+'\nstate=ast1Decode(ast);const A={q:steadyRegionQ,add:steadyExactAdd,sub:steadyExactSub,mul:steadyExactMul,div:steadyExactDiv,cmp:steadyExactCmp,txt:steadyExactText,Z:STEADY_ZERO,U:STEADY_ONE};return {parts:iterationPartitionSpec(factoryCompileSymbolicSpec()),orbit:p=>iterationFindOrbit(iterationCreateKernel(p,A),{ms:6000,maxTicks:2160000,includeCertificate:true})}');
 // Independently compare the editor's actual successful-transfer events
 // over two computed periods, including the note cursor and global bar phase.
 function verifyRuntime(ast,prefix,period,length){
  const run=new Function('document','requestAnimationFrame','ast','prefix','period','length',body+
   '\nfunction stockChartReset(){} function warehouseRefresh(){} function draw(){} function recordWarehouseMovement(){}\n'+
   `state=ast1Decode(ast);resetSimulation();
   const cursors=new Map(),first=[];let phase=0,base=0,index=0,mismatch=null;
   simTransferObserver=(m,dir,port,item,time)=>{
    const k=m.id+'|'+dir,c=cursors.get(k)||0;cursors.set(k,(c+1)%length);
    if(!phase)return;
    const tick=Math.round(time*20),record=JSON.stringify([tick-base,m.id,dir,port,item,c,tick%320]);
    if(phase===1)first.push(record);else{if(first[index]!==record&&!mismatch)mismatch={index,expected:first[index],actual:record};index++}
   };
   const step=n=>{while(n>0){const batch=Math.min(n,20000);simulateBatchSteps(batch,.05);n-=batch}};
   step(prefix);phase=1;base=prefix;step(period);phase=2;base=prefix+period;step(period);simTransferObserver=null;
   return {events:first.length,nextEvents:index,equal:!mismatch&&index===first.length,mismatch};`);
  return run({getElementById(){return el}},()=>{},ast,prefix,period,length);
 }
 const fixture=process.argv[2]||'tests/fixtures/ast1-user-84-78-v1.txt',length=Number(process.argv[3]||16);
 const ast=fs.readFileSync(fixture,'utf8').trim(),e=make({getElementById(){return el}},()=>{},ast),components=[],unknown=[];
 for(const part of e.parts){
  const r=e.orbit(part);
  if(r.status!=='exact-model-period'||!r.certificate){unknown.push({machines:part.machines.length,status:r.status});continue}
  const {start,end}=r.certificate,counts=[];
  for(const m of part.machines)for(const dir of ['in','out']){
   const k='machineTotal:'+m.id+'|'+dir,c=(end.count[k]||0)-(start.count[k]||0);if(c)counts.push({count:c,length});
  }
  components.push({machines:part.machines.length,prefixTicks:r.prefixTicks,periodTicks:r.periodTicks,counts});
 }
 const period=unknown.length?null:scorePeriod(components),modulated=unknown.length?null:scorePeriod(components,320);
 const prefix=Math.max(0,...components.map(c=>c.prefixTicks));
 const runtime=process.argv.includes('--verify-runtime')&&modulated!==null&&modulated<=2160000n?verifyRuntime(ast,prefix,Number(modulated),length):null;
 console.log(JSON.stringify({fixture,length,runtime,components:components.map(c=>({machines:c.machines,prefix:c.prefixTicks,physical:c.periodTicks,voices:c.counts.length,music:String(componentMusicPeriod(c.periodTicks,c.counts))})),unknown,periodTicks:period===null?null:String(period),modulatedTicks:modulated===null?null:String(modulated)}));
}
