'use strict';
self.document={getElementById(){return {getContext(){return {}}}}};
importScripts(...[
 'data/catalog.js','blueprints/machine-ids.js','blueprints/item-ids.js','core/state.js','core/machines.js','core/routing.js','core/audit.js','blueprints/ast1-codec.js','engine/steady-flow.js','engine/steady-equations.js','engine/steady-generic-network.js'
].map(p=>'../../scripts/'+p),'compile_exact.js','direct_algebra.js','batch_ready_certificate.js','direct_graph.js');
self.onmessage=e=>{
 try{
  const t=performance.now();state=e.data.ast?ast1Decode(e.data.ast):e.data.layout;
  const result=factoryDirectTheory({ms:e.data.ms??10000,continuousRefill:e.data.continuousRefill===true});
  postMessage({result,elapsed:Math.round(performance.now()-t),legacyLoaded:typeof factorySteadyAutomaticFluidModel!=='undefined',isolated:self.crossOriginIsolated});
 }catch(error){postMessage({error:error.stack||String(error)});}
};
