'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/engine/simulation.js'),'utf8');
const start=source.indexOf('let simAdvanceBusy=false;');
assert(start>=0,'fast-forward button implementation must exist');
const tail=source.slice(start);

function setup(){
 const elements={simSpeed:{value:'1'},stepMinute:{textContent:'',title:'',disabled:false}};
 const notes=[],ctx={running:true,simTime:0,simulationSpeed:1,steps:0,notifications:notes,
  $:id=>elements[id],setTimeout:callback=>{callback();return 1},
  warehouseRefreshLive(){},inspectorRefreshLive(){},stockChartMaybeRefresh(){},draw(){},
  notify:msg=>notes.push(msg)};
 ctx.simulate=dt=>{ctx.steps++;ctx.simTime+=dt;};
 vm.createContext(ctx);
 vm.runInContext(tail,ctx);
 return {ctx,elements};
}

test('speed change selects 1, 2 or 60 minute button labels and advances exact per-minute ticks',async()=>{
 const {ctx,elements}=setup();
 vm.runInContext('updateStepMinuteButton()',ctx);
 assert.equal(elements.stepMinute.textContent,'⏩ +1分钟');
 elements.simSpeed.value='2';vm.runInContext('updateStepMinuteButton()',ctx);
 assert.equal(elements.stepMinute.textContent,'⏩ +2分钟');
 await vm.runInContext('advanceSimulationMinute()',ctx);
 assert.equal(ctx.steps,2400);
 assert(Math.abs(ctx.simTime-120)<1e-7);
 assert.equal(ctx.running,true);
 assert.equal(elements.stepMinute.disabled,false);
 elements.simSpeed.value='60';vm.runInContext('updateStepMinuteButton()',ctx);
 assert.equal(elements.stepMinute.textContent,'⏩ +60分钟');
 await vm.runInContext('advanceSimulationMinute()',ctx);
 assert.equal(ctx.steps,74400);
 assert(Math.abs(ctx.simTime-3720)<1e-6);
 assert.equal(elements.stepMinute.textContent,'⏩ +60分钟');
 assert.equal(elements.stepMinute.disabled,false);
 assert.equal(ctx.running,true);
 assert(ctx.notifications.at(-1).includes('60 分钟'));
});

test('while a long fast forward runs, repeated taps cannot duplicate time advancement',async()=>{
 const {ctx,elements}=setup();
 elements.simSpeed.value='5';
 const first=vm.runInContext('advanceSimulationMinute()',ctx);
 assert.equal(elements.stepMinute.disabled,true);
 const duplicate=vm.runInContext('advanceSimulationMinute()',ctx);
 await Promise.all([first,duplicate]);
 assert.equal(ctx.steps,6000);
 assert.equal(elements.stepMinute.disabled,false);
});
