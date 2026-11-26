'use strict';
const fs=require('node:fs');
const src=fs.readFileSync('tools/iteration/model-environment.js','utf8');
const names=JSON.parse(src.match(/for\(const f of (\[.*?\])\)/)[1].replaceAll("'",'"'));
const body=names.map(n=>fs.readFileSync('scripts/'+n+'.js','utf8')).join('\n');
const el={getContext(){return{}},classList:{add(){},remove(){}}};
const run=new Function('document','requestAnimationFrame',body+'\nconst A={q:steadyRegionQ,add:steadyExactAdd,sub:steadyExactSub,mul:steadyExactMul,div:steadyExactDiv,cmp:steadyExactCmp,txt:steadyExactText,Z:STEADY_ZERO,U:STEADY_ONE};const spec={machines:[],routes:[],priority:[],frozen:[{id:"s",rates:{ore:"41/3",fuel:"13/7"}},{id:"a",rates:{ore:"-57/2",fuel:"-31/3",plate:"11/13"}},{id:"b",rates:{ore:"-1/5",plate:"-1/7",bar:"2/11"}}]};const result=[];for(const frozenLattice of [false,true,false,true]){const k=iterationCreateKernel(spec,A,{frozenLattice});const start=performance.now();for(let i=0;i<100000;i++)k.step();result.push({frozenLattice,ms:performance.now()-start,state:JSON.stringify(k.snapshot())})}return {runs:result.map(({state,...r})=>r),same:result.every(r=>r.state===result[0].state),ticks:100000};');
console.log(JSON.stringify(run({getElementById(){return el}},()=>{})));
