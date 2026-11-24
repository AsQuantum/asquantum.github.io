'use strict';
// The fast synchronous path preserves immediate results for ordinary graphs.
// Difficult cases have no fixed iteration ceiling in the worker. The total
// wall-clock limit is enforced externally so even graph compilation can stop.
let theoryWorker=null,theoryWorkerTimer=null;
const THEORY_BACKGROUND_MS=60000;
function cancelTheoryCalculation(){
 if(theoryWorker){theoryWorker.terminate();theoryWorker=null;}
 if(theoryWorkerTimer!==null){clearTimeout(theoryWorkerTimer);theoryWorkerTimer=null;}
}
function requestTheoryBudget({quickMs=600,quickIterations=12000,backgroundMs=THEORY_BACKGROUND_MS}={}){
 if(typeof Worker==='undefined')return warehouseTheory();
 cancelTheoryCalculation();
 const started=performance.now();
 const initial=warehouseTheory(null,{maxIterations:quickIterations,deadline:started+quickMs});
 if(!initial.conditionalBudget?.retryable&&!initial.unlimitedStockBudget?.retryable)return initial;
 let worker;
 try{worker=new Worker('scripts/engine/steady-worker.js?v=20261124-frozen-041-ui2');}
 catch(error){return initial;}
 const pending={...initial,calculating:true};
 const layout=state;
 theoryWorker=worker;
 const complete=(result,timedOut=false)=>{
  if(theoryWorker!==worker)return;
  cancelTheoryCalculation();
  if(state!==layout||theoreticalBudget!==pending)return;
  const next=result||{...initial,calculationTimedOut:timedOut};
  // Preserve a validated constrained result if only the overdraft timed out.
  if(initial.conditionalBudget?.status==='conditional-fixed-point'&&next.conditionalBudget?.status!=='conditional-fixed-point'){
   next.conditionalBudget=initial.conditionalBudget;next.status=initial.status;next.diagnostics=initial.diagnostics;
  }
  if(next.conditionalBudget?.retryable||next.unlimitedStockBudget?.retryable)next.calculationTimedOut=timedOut||!!result;
  next.calculating=false;
  theoreticalBudget=next;
  warehouseRefresh();
  if(typeof inspectorRefresh==='function')inspectorRefresh();
  if(typeof draw==='function')draw();
 };
 worker.onmessage=e=>complete(e.data?.result||null);
 worker.onerror=()=>complete(null);
 theoryWorkerTimer=setTimeout(()=>complete(null,true),Math.max(1,backgroundMs-(performance.now()-started)));
 try{worker.postMessage({layout:copy(state),budgetMs:Math.max(1,backgroundMs-(performance.now()-started))});}
 catch(error){cancelTheoryCalculation();return initial;}
 return pending;
}
