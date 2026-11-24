'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function context(){
 const c=vm.createContext({console,atob,btoa,performance,
  document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-equations','engine/steady-algebra','engine/steady-bounds',
  'engine/steady-components','engine/steady-warehouse-node',
  'engine/steady-feedforward-islands','engine/steady-generic-network','engine/steady-rate-region','engine/steady-auto-fluid',
  'engine/steady-structural-scheduling','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 c.code=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 vm.runInContext('state=ast1Decode(code)',c);
 return c;
}
test('generic equations cover the entire fixture, no layout-specific rate rules',()=>{
 const c=context(),x=vm.runInContext("(()=>{const m=factorySteadyBuildEquations(),a=factorySteadyAnalyzeEqualities(m);return {lines:m.sharedLines.length,recipes:m.machineEquations.length,junctions:m.junctionEquations.length,pools:m.warehousePools.length,variables:a.variables,rank:a.rank,freedom:a.freeDegrees}})()",c);
 assert.equal(x.lines,84);assert.equal(x.recipes,49);assert.equal(x.junctions,14);assert.equal(x.pools,14);
 assert.equal(x.variables,138);assert.equal(x.rank,118);assert.equal(x.freedom,20);
});
test('production entry computes constrained and overdraft solutions from generic equations',()=>{
 const c=context(),r=vm.runInContext('warehouseTheory()',c),a=r.conditionalBudget;
 assert.equal(r.status,'conditional-fixed-point');assert.equal(r.diagnostics.certified,false);
 assert.equal(a.exactLocalEquations,true);assert.equal(a.fractions.machineCycles.M24,'11/180');
 assert.equal(a.fractions.inflow['钛合金锭'],'4/3');assert.equal(a.fractions.outflow['钛合金锭'],'71/60');
 assert.equal(r.unlimitedStockBudget.warehouseSupply,'unlimited');
 assert.equal(r.unlimitedStockBudget.exactLocalEquations,true);
 assert.equal(Object.keys(r.inflow).length,0);
});
test('production solves using the same generic equations after changing machine record IDs',()=>{
 const c=context();
 const v=vm.runInContext("(()=>{const before=warehouseTheory().conditionalBudget;const rename=new Map(state.machines.map((m,i)=>[m.id,'M'+(1000+i)]));for(const m of state.machines)m.id=rename.get(m.id);for(const r of state.routes){r.from.id=rename.get(r.from.id);if(r.to)r.to.id=rename.get(r.to.id);}const after=warehouseTheory().conditionalBudget;return {before:before.fractions.inflow,after:after.fractions?.inflow,status:after.status}})()",c);
 assert.equal(v.status,'conditional-fixed-point');assert.deepEqual(v.after,v.before);
});
test('incompatible selected splitter filter leaves the model unresolved instead of reusing an old blueprint result',()=>{
 const c=context();
 const v=vm.runInContext("(()=>{state.machines.find(m=>m.id==='M36').outFilters[0]='齿轮组';return warehouseTheory()})()",c);
 assert.equal(v.status,'modelled-unresolved');assert.equal(v.diagnostics.certified,false);
 assert.equal(v.conditionalBudget.status,'unresolved');assert.equal(Object.keys(v.routeFlows).length,0);
});
test('index loads only the unified supply/demand solver and necessary mathematical helpers',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const old of ['steady-active-regimes','steady-recipe-exact','steady-merge-exact','steady-feedforward-islands','steady-warehouse-node','steady-rate-region','legacy-rate-reference'])assert(!html.includes(old+'.js'),old);
 const source=fs.readFileSync(path.join(root,'scripts/engine/steady-flow.js'),'utf8');
 assert(!source.includes('warehouseTheoryCertifiedOrDiagnostic'));assert(!source.includes('legacyReferenceWarehouseTheory'));
 assert(source.includes('factorySteadyAutomaticFluidBudget(state,model,solveOptions)'));
});

test('72-machine warp-only blueprint roundtrips and converges past the former iteration limit',()=>{
 const c=context();c.code=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warp-coil-only.txt'),'utf8').trim();
 const x=vm.runInContext("(()=>{state=ast1Decode(code);const model=factorySteadyBuildEquations(),short=factorySteadyAutomaticFluidBudget(state,model,{maxIterations:2500}),expired=factorySteadyAutomaticFluidBudget(state,model,{maxIterations:Infinity,deadline:0}),full=warehouseTheory();return {machines:state.machines.length,routes:state.routes.length,invalid:state.routes.filter(r=>checkPath(r.path,r.from,r.to,r.id)).length,roundtrip:ast1Encode()===code,short,expired,full,period:(1/full.conditionalBudget.machineCycles.M1)}})()",c);
 assert.equal(x.machines,72);assert.equal(x.routes,49);assert.equal(x.invalid,0);assert(x.roundtrip);
 assert.equal(x.short.retryable,true);assert.equal(x.expired.retryable,true);
 assert.equal(x.full.status,'conditional-fixed-point');
 assert.equal(x.full.conditionalBudget.fractions.inflow['曲速线圈'],'1/128');
 assert.equal(x.full.conditionalBudget.fractions.machineCycles.M1,'1/128');
 assert.equal(x.period,128);assert(x.full.warehouseItems.includes('曲速线圈'));
 assert(x.full.conditionalBudget.iterations.every(n=>n>2500));
});
