'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
const ctx=vm.createContext({console,performance,URL,atob,btoa,structuredClone,document:{getElementById(){return{getContext(){return{}}}}}});
for(const name of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/math/arithmetic/rational','engine/steady-flow','engine/math/graph/startup_reachability','engine/math/algebra/direct_algebra','engine/steady-certified-proofs','engine/steady-certified-display']){
 const file=path.join(root,'scripts',name+'.js');vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
}
const run=source=>vm.runInContext(source,ctx);
const arith=run('factoryDirectArithmetic()');
const exported={root,ctx,run,arith};
for(const name of ['solveFactoredCounts','solveDirectRateProblem','projectCountInterval','compileCountProofProblem','proveRecipeTree','proveTandem','provePhysicalRecipeTrees','proveSaturatedRouterCounts','provePermanentFifoBlockage','proveRealRefillPriority','proveJointStockResidualBounds','proveSparseFrozenPriority','proveStructuralZeroFlows','proveStockWorkConservation']){
 const fn=run(name);exported[name]=(...args)=>structuredClone(fn(...args));
}
module.exports=exported;
