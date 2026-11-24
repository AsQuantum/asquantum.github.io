'use strict';
// Math-only worker. No UI, simulation time, localStorage or network actions.
// The shared state module requires a canvas at initialization; this shim is
// never used by the mathematical functions.
self.document={getElementById(){return {getContext(){return {}}}}};
const revision=new URL(self.location.href).search||'';
importScripts(...[
 '../data/catalog.js','../blueprints/machine-ids.js','../blueprints/item-ids.js',
 '../core/state.js','../core/machines.js','../core/routing.js','../core/audit.js',
 '../blueprints/ast1-codec.js','steady-flow.js','steady-equations.js',
 'steady-generic-network.js','steady-bounds.js','steady-auto-fluid.js'
].map(p=>p+revision));
self.onmessage=event=>{
 try{
  state=event.data.layout;
  const deadline=performance.now()+Math.max(0,event.data.budgetMs||60000);
  const result=warehouseTheory(null,{maxIterations:Infinity,deadline});
  self.postMessage({result});
 }catch(error){self.postMessage({error:String(error.message||error)});}
};
