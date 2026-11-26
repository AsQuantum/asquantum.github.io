'use strict';
const fs=require('node:fs');
const src=fs.readFileSync('tools/iteration/model-environment.js','utf8');
const names=JSON.parse(src.match(/for\(const f of (\[.*?\])\)/)[1].replaceAll("'",'"'));
const body=names.map(n=>fs.readFileSync('scripts/'+n+'.js','utf8')).join('\n');
const el={getContext(){return{}},classList:{add(){},remove(){}}};
const run=new Function('document','requestAnimationFrame','ast','stress',body+'\nfunction stockChartReset(){}function warehouseRefresh(){}function draw(){}function recordWarehouseMovement(){};state=ast1Decode(ast);state.frozenFactories=[];if(stress){const m=state.machines.find(m=>m.id==="M3"),r=state.routes.find(r=>r.id==="R4");m.item="合金板";r.path=Array.from({length:180},(_,i)=>[i,0]);}const results=[];for(const lazyBelts of [false,true,true,false]){resetSimulation();if(stress)ware["合金板"]=100000;simulateBatchSteps(12000,.05,{lazyBelts});const start=performance.now();for(let i=0;i<60;i++)simulateBatchSteps(1200,.05,{lazyBelts});results.push({lazyBelts,ms:performance.now()-start,state:JSON.stringify({simTime,sim,ware})})}return {same:results.every(r=>r.state===results[0].state),ticks:72000,runs:results.map(({state,...r})=>r)};');
const stress=process.argv.includes('--stress');const result=run({getElementById(){return el}},()=>{},fs.readFileSync('tests/fixtures/'+(stress?'ast1-priority-armour-backpressure-v1.txt':'ast1-user-84-78-v1.txt'),'utf8').trim(),stress);console.log(JSON.stringify(result));if(!result.same)process.exitCode=1;
