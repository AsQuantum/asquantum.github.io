'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../..');
function env(before){
 const c=vm.createContext({console,performance,atob,btoa,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-generic-network','engine/steady-direct-algebra'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 vm.runInContext(fs.readFileSync(before?path.join(__dirname,'before-straight-alias.js'):path.join(root,'scripts/engine/steady-certified-proofs.js'),'utf8'),c);return c;
}
const reports=[];
for(const fixture of ['tests/fixtures/ast1-warehouse-port-balance-v1.txt','research/long-run-rates/user-new-layout.ast1.txt']){
 const runs=[];
 for(const before of [true,false]){
  const c=env(before);c.ast=fs.readFileSync(path.join(root,fixture),'utf8').trim();
  const result=vm.runInContext(`(()=>{state=ast1Decode(ast);const g=factoryCompileDirectGraph(state,null,{countOnly:true}),arith=factoryDirectArithmetic(),p=compileCountProofProblem(g,arith,{htmlQueries:true,structuralZeros:proveStructuralZeroFlows(g)}),r=factoryCertifiedResearchPreview({ms:10000});return {cols:p.variables,assertions:p.assertions??p.smt.split('\\n').filter(x=>x.startsWith('(assert')).length,straight:p.straightRouters||0,actual:r.actual.researchQueries,values:r.values,ms:r.elapsedMs}})()`,c);
  runs.push(JSON.parse(JSON.stringify(result)));
 }
 assert.deepEqual(runs[0].values,runs[1].values);
 reports.push({fixture,before:{...runs[0],values:undefined},after:{...runs[1],values:undefined}});
}
console.log(JSON.stringify(reports));
fs.writeFileSync(path.join(__dirname,'straight-alias-benchmark.json'),JSON.stringify(reports,null,2));
