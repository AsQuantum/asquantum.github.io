'use strict';
// Sole production calculation engine: no old direct proof bundle.
self.document={getElementById(){return {getContext(){return {}}}}};
const revision=new URL(self.location.href).search||'';
importScripts(...[
 '../data/catalog.js','../blueprints/machine-ids.js','../blueprints/item-ids.js','../core/state.js','../core/machines.js','../core/routing.js','../core/audit.js','../blueprints/ast1-codec.js',
 'math/arithmetic/rational.js','math/graph/symbolic_physical_spec.js','iteration/period-candidate.js','iteration/exact-kernel.js','iteration/tree-events.js','iteration/components.js','iteration/boundary-pressure.js','iteration/research-preview.js','iteration-display.js'
].map(f=>f+revision));
// The user-facing deadline, not a 30-hour simulated-time cap, limits
// background search. A finite tick cap remains available to test callers.
const ITERATION_FULL_TICKS=Number.MAX_SAFE_INTEGER;
const iterationArithmetic={q:steadyRegionQ,add:steadyExactAdd,sub:steadyExactSub,mul:steadyExactMul,div:steadyExactDiv,cmp:steadyExactCmp,txt:steadyExactText,Z:STEADY_ZERO,U:STEADY_ONE};
self.onmessage=async e=>{
 const children=new Set(),urls=new Set();
 try{
  state=e.data.ast?ast1Decode(e.data.ast):e.data.layout;
  const A=iterationArithmetic,start=performance.now(),budget=Math.min(60000,Math.max(1,e.data.budgetMs||59000)),orbitCache=new Map(),componentMemo=new Map(e.data.componentMemo||[]);
  const remaining=()=>Math.max(0,budget-(performance.now()-start));
  if(e.data.branch==='unlimited'){
   const spec={...factoryCompileSymbolicSpec(state),unlimitedWarehouse:true};
   const result=iterationSolveComponents(spec,A,{ms:remaining(),maxTicks:ITERATION_FULL_TICKS,orbitCache:new Map(e.data.completed||[]),componentMemo});self.postMessage({branchResult:{...result,componentMemo:[...componentMemo]}});return;
  }
  if(e.data.branch==='pressure'){
   const {part,initial,kind}=e.data.task;
   self.postMessage({branchResult:iterationSolvePressure(part,A,{maxTicks:ITERATION_FULL_TICKS},kind,initial,remaining())});return;
  }
  const format=r=>e.data.uiBudget?certifiedDisplayBudget(r):r;
  const finalFormat=r=>({...format(r),componentMemo:[...componentMemo]});
  const quick=iterationResearchPreview(state,A,{ms:Math.min(400,budget*.3),maxTicks:4000,orbitCache,componentMemo,rememberOrbits:true});
  if(quick.completeHtmlQueries||quick.status==='unsupported-layout'){
   self.postMessage({result:finalFormat(quick)});return;
  }
  if(e.data.progress)self.postMessage({progress:format(quick)});
  let result,parallelBranches=1,parallelPressure=0;
  const cores=self.navigator?.hardwareConcurrency??1,limit=Math.max(1,Math.min(4,Math.floor(e.data.workerLimit??2),cores-1)),slots=limit-1;
  let workerURL=self.location.href;
  if(e.data.workerSource){workerURL=URL.createObjectURL(new Blob([e.data.workerSource],{type:'application/javascript'}));urls.add(workerURL)}
  function spawn(payload){
   if(remaining()<=30)return null;
   let w;
   try{w=new Worker(workerURL);children.add(w)}catch{return null}
   const promise=new Promise(resolve=>{
    let done=false;
    const finish=v=>{if(done)return;done=true;clearTimeout(timer);w.terminate();children.delete(w);resolve(v)};
    const timer=setTimeout(()=>finish(null),remaining());
    w.onmessage=ev=>finish(ev.data?.branchResult??null);
    w.onerror=ev=>{ev.preventDefault?.();finish(null)};
    w.onmessageerror=()=>finish(null);
    try{w.postMessage({...payload,budgetMs:Math.max(1,remaining()-20)})}catch{finish(null)}
   });
   return promise;
  }
  if(remaining()>50&&e.data.parallel!==false&&typeof Worker==='function'&&limit>=2){
   const task=spawn({branch:'unlimited',layout:state,componentMemo:[...componentMemo].filter(([k])=>JSON.parse(k)[0]==='unlimited'),completed:[...orbitCache].filter(([k,v])=>JSON.parse(k)[0]==='unlimited'&&v.result)});
   if(task){
    const spec=factoryCompileSymbolicSpec(state),plan={actual:new Map(),tasks:[],results:new Map()};
    iterationBoundaryPressure(spec,A,{ms:remaining(),maxTicks:ITERATION_FULL_TICKS,orbitCache,componentMemo,preparePressure:plan});
    // Independent conditional queries use fixed actual calendars. They
    // share neither mutable inventory nor rewards; exact join is unchanged.
    const queue=plan.tasks.sort((a,b)=>b.part.machines.length-a.part.machines.length||b.initial.boundary.period-a.initial.boundary.period);
    async function pressureLane(){
     while(queue.length&&remaining()>30){
      const t=queue.shift(),p=spawn({branch:'pressure',task:t,layout:{machines:[],routes:[],frozenFactories:[]}});
      if(!p){queue.unshift(t);return}
      const r=await p;
      if(r){plan.results.set(t.id,r);parallelPressure++}
      else {queue.unshift(t);return}
     }
    }
    // Use at most two additional lanes while the unlimited branch is active.
    const lanes=Array.from({length:Math.max(0,slots-1)},()=>pressureLane());
    // Use the current worker for one lane; retain paused quick searches.
    while(queue.length&&remaining()>0){
     const t=queue.shift();plan.results.set(t.id,iterationSolvePressure(t.part,A,{ms:remaining(),maxTicks:ITERATION_FULL_TICKS,orbitCache},t.kind,t.initial,remaining()));
     // Allow completed child messages to dispatch before scheduling more.
     await new Promise(resolve=>setTimeout(resolve,0));
    }
    await Promise.all(lanes);
    const u=await task;
    if(u?.componentMemo){for(const [k,v] of u.componentMemo)iterationRememberComponent(componentMemo,k,v);delete u.componentMemo;}
    parallelBranches=u?2:1;
    // Failed child tasks may be retried locally within the same deadline.
    while(queue.length&&remaining()>0){
     const t=queue.shift();plan.results.set(t.id,iterationSolvePressure(t.part,A,{ms:remaining(),maxTicks:ITERATION_FULL_TICKS,orbitCache},t.kind,t.initial,remaining()));
    }
    const actual=iterationBoundaryPressure(spec,A,{ms:remaining(),maxTicks:ITERATION_FULL_TICKS,componentMemo,preparedActual:plan.actual,pressureResults:plan.results});
    const unlimited=u??iterationSolveComponents({...spec,unlimitedWarehouse:true},A,{ms:remaining(),maxTicks:ITERATION_FULL_TICKS,orbitCache,componentMemo});
    result=iterationAssemblePreview(state,spec,A,actual,unlimited,start);
   }
  }
  if(!result)result=remaining()>0?iterationResearchPreview(state,A,{ms:remaining(),maxTicks:ITERATION_FULL_TICKS,orbitCache,componentMemo}):quick;
  result.elapsedMs=Math.round(performance.now()-start);
  const output=finalFormat(result);if(output.diagnostics){output.diagnostics.parallelBranches=parallelBranches;output.diagnostics.parallelPressure=parallelPressure;output.diagnostics.workerLimit=limit;}
  self.postMessage({result:output});
 }catch(error){self.postMessage({error:String(error.stack||error)});}
 finally{for(const w of children)w.terminate();for(const url of urls)URL.revokeObjectURL(url);}
};
