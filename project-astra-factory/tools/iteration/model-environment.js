'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
function environment(){
 const el={getContext(){return{}},classList:{add(){},remove(){}}};
 const c=vm.createContext({console,performance,atob,btoa,document:{getElementById(){return el}},requestAnimationFrame(){}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/math/arithmetic/rational','engine/math/graph/symbolic_physical_spec','engine/iteration/period-candidate','engine/iteration/exact-kernel','engine/iteration/components','engine/iteration/boundary-pressure','engine/iteration/research-preview','engine/iteration/causal-research','engine/iteration/tree-events','engine/simulation'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 const run=s=>vm.runInContext(s,c);
 run('function stockChartReset(){} function warehouseRefresh(){} function draw(){} function recordWarehouseMovement(){};const A={q:steadyRegionQ,add:steadyExactAdd,sub:steadyExactSub,mul:steadyExactMul,div:steadyExactDiv,cmp:steadyExactCmp,txt:steadyExactText,Z:STEADY_ZERO,U:STEADY_ONE};');
 return {c,run};
}
function fixture(env,name,frozen=[]){
 env.c.ast=fs.readFileSync(path.join(root,'tests/fixtures',name),'utf8').trim();env.c.frozen=frozen;
 env.run('state=ast1Decode(ast);state.frozenFactories=normalizeFrozenFactories(frozen);resetSimulation();');
}
module.exports={environment,fixture,root};
