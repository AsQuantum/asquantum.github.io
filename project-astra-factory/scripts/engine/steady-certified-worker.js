'use strict';
// Dedicated strict proof worker. Never loads the simulation, continuous
// S/D solver, or legacy direct budget adapter.
self.document={getElementById(){return {getContext(){return {}}}}};
const revision=new URL(self.location.href).search||'';
importScripts(...[
 '../data/catalog.js','../blueprints/machine-ids.js','../blueprints/item-ids.js','../core/state.js','../core/machines.js','../core/routing.js','../core/audit.js','../blueprints/ast1-codec.js',
 'math/arithmetic/rational.js','math/graph/startup_reachability.js','math/algebra/direct_algebra.js','steady-certified-proofs.js','steady-certified-display.js'
].map(f=>f+revision));
self.onmessage=e=>{
 try{
  state=e.data.ast?ast1Decode(e.data.ast):e.data.layout;
  const result=factoryCertifiedResearchPreview({ms:Math.min(60000,Math.max(1,e.data.budgetMs||8000))});
  self.postMessage({result:e.data.uiBudget?certifiedDisplayBudget(result):result});
 }catch(error){self.postMessage({error:String(error.stack||error)});}
};
