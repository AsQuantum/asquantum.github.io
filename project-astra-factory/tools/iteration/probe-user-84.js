'use strict';
const fs=require('node:fs');
const src=fs.readFileSync('tools/iteration/model-environment.js','utf8');
const names=JSON.parse(src.match(/for\(const f of (\[.*?\])\)/)[1].replaceAll("'",'"'));
const override=process.env.ASTRA_BENCH_KERNEL;
const body=names.map(n=>fs.readFileSync(override&&n==='engine/iteration/exact-kernel'?override:'scripts/'+n+'.js','utf8')).join('\n');
const el={getContext(){return{}},classList:{add(){},remove(){}}};
const make=new Function('document','requestAnimationFrame','ast','frozen',body+'\nstate=ast1Decode(ast);state.frozenFactories=normalizeFrozenFactories(frozen);const A={q:steadyRegionQ,add:steadyExactAdd,sub:steadyExactSub,mul:steadyExactMul,div:steadyExactDiv,cmp:steadyExactCmp,txt:steadyExactText,Z:STEADY_ZERO,U:STEADY_ONE};return {spec:factoryCompileSymbolicSpec(),run:(s,o)=>iterationFindOrbit(iterationCreateKernel(s,A,{lazyBelts:o.lazyBelts??"adaptive",absoluteClocks:o.absoluteClocks??false}),o),inspect:s=>{const k=iterationCreateKernel(s,A),out=[];let old;for(let i=0;i<=165600;i++){if(i>=136800&&i%7200===0){const x=k.snapshot(),r=k.relaxed(x.control);x.outputs=r.outputs;if(old&&r.key===old.key){const proof=k.replayPeriod(old.x,x,{recordOutputGuards:true}),plan=k.outputCopies(old.x,x,proof);out.push({i,output:x.outputs.M27,prev:old.x.outputs.M27,plan,guard:proof.outputBounds.M27,stock:proof.bounds})}old={x,key:r.key}}if(i<165600)k.step()}return out},parts:iterationPartitionSpec,feed:(s,o)=>iterationPhysicalSourceActual(s,A,o),preview:o=>iterationResearchPreview(state,A,o)}');
const e=make({getElementById(){return el}},()=>{},fs.readFileSync('tests/fixtures/ast1-user-84-78-v1.txt','utf8').trim(),process.argv.includes('--frozen')?[{id:'user-frozen',rates:{'硅晶圆':'-1/6'}}]:[]);
if(process.argv.includes('--inspect')){console.log(JSON.stringify(e.inspect(e.parts(e.spec).sort((a,b)=>b.machines.length-a.machines.length)[0])));process.exit(0)}
if(process.argv.includes('--clock-single')){
 const part=e.parts(e.spec).sort((a,b)=>b.machines.length-a.machines.length)[0],absoluteClocks=process.argv.includes('--absolute');
 const r=e.run(part,{ms:30000,maxTicks:2160000,absoluteClocks,captureBoundary:true,verifyPeriod:true});
 console.log(JSON.stringify({absoluteClocks,ms:r.elapsedMs,prefix:r.prefixTicks,period:r.periodTicks,checks:Object.keys(r.values||{}).length,status:r.status}));process.exit(r.values?0:1);
}
if(process.argv.includes('--clocks')){
 const part=e.parts(e.spec).sort((a,b)=>b.machines.length-a.machines.length)[0],results=[];
 for(const absoluteClocks of [false,true,false,true]){const r=e.run(part,{ms:30000,maxTicks:2160000,absoluteClocks,captureBoundary:true,verifyPeriod:true});results.push(r)}
 const a=results[0],same=results.every(b=>b.status===a.status&&JSON.stringify(b.values)===JSON.stringify(a.values)&&JSON.stringify(b.boundary)===JSON.stringify(a.boundary));
 console.log(JSON.stringify({same,runs:results.map((r,i)=>({absolute:!!(i%2),ms:r.elapsedMs,prefix:r.prefixTicks,period:r.periodTicks,steps:r.stepCalls})),checks:Object.keys(a.values||{}).length}));process.exit(!same||!a.values?1:0);
}
if(process.argv.includes('--belts')){
 const part=e.parts(e.spec).sort((a,b)=>b.machines.length-a.machines.length)[0],results=[];
 for(const lazyBelts of [false,"adaptive",false,"adaptive"]){const r=e.run(part,{ms:30000,maxTicks:2160000,lazyBelts,captureBoundary:true,verifyPeriod:true});results.push(r)}
 const a=results[0],same=results.every(b=>b.status===a.status&&JSON.stringify(b.values)===JSON.stringify(a.values)&&JSON.stringify(b.boundary)===JSON.stringify(a.boundary));
 console.log(JSON.stringify({same,runs:results.map((r,i)=>({lazy:i%2===1?"adaptive":false,ms:r.elapsedMs,prefix:r.prefixTicks,period:r.periodTicks,steps:r.stepCalls})),checks:Object.keys(a.values||{}).length}));process.exit(!same||!a.values?1:0);
}
if(process.argv.includes('--output')){
 const part=e.parts(e.spec).sort((a,b)=>b.machines.length-a.machines.length)[0];
 const a=e.run(part,{ms:30000,maxTicks:2160000,outputAcceleration:false}),b=e.run(part,{ms:30000,maxTicks:2160000,outputAcceleration:true});
 const keys=new Set([...Object.keys(a.values||{}),...Object.keys(b.values||{})]),bad=[...keys].filter(k=>a.values?.[k]!==b.values?.[k]);
 console.log(JSON.stringify({results:[a,b].map(({values,...x})=>x),checks:keys.size,bad}));process.exit(bad.length||!b.values?1:0);
}
if(process.argv.includes('--feed')){
 const part=e.parts(e.spec).sort((a,b)=>b.machines.length-a.machines.length)[0];
 let t=performance.now();const a=e.run(part,{ms:60000,maxTicks:2160000});const baseMs=performance.now()-t;
 const b=e.feed(part,{ms:60000,maxTicks:2160000,treeCalendar:process.argv.includes("--tree-calendar")});
 const keys=new Set([...Object.keys(a.values||{}),...Object.keys(b.values||{})]),bad=[...keys].filter(k=>(a.values?.[k]??'0')!==(b.values?.[k]??'0'));
 console.log(JSON.stringify({baseMs,basePrefix:a.prefixTicks,basePeriod:a.periodTicks,feedMs:b.elapsedMs,feedPrefix:b.prefixTicks,feedPeriod:b.periodTicks,sourcePrefix:b.sourcePrefix,sourcePeriod:b.sourcePeriod,source:b.sourceMachines,residual:b.residualMachines,status:[a.status,b.status],checks:keys.size,bad}));process.exit(bad.length||!b.values?1:0);
}
const x=e.preview({ms:60000,maxTicks:Number(process.argv[2]||2160000),verifyPeriod:process.argv.includes('--verify'),pressureProjection:!process.argv.includes('--no-project')});
console.log(JSON.stringify({status:x.status,elapsed:x.elapsedMs,unknown:x.unknownMetrics?.length,actual:x.actual?.components?.map(c=>({m:c.machines.length,a:c.actualStatus,p:c.periodTicks,pressure:Object.entries(c.pressure).map(([k,v])=>[k,v.status,v.periodTicks,v.reason,v.projectedMachines])})),over:x.unlimited?.components?.map(c=>[c.machines.length,c.status,c.reason,c.tick,c.periodTicks]),rows:Object.fromEntries(Object.entries(x.rows||{}).map(([k,v])=>[k,[v.inflow,v.outflow,v.net,v.potential,v.overdraft]]))}));
