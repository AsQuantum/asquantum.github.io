'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function model(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return {getContext(){return{}}}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const name of [
 'data/catalog','blueprints/machine-ids','blueprints/item-ids',
 'core/state','core/machines','core/routing','core/audit',
 'engine/steady-flow','engine/steady-local-rates','engine/steady-recipe-exact',
 'engine/steady-merge-exact','engine/steady-equations','engine/steady-algebra',
 'core/compact-json','blueprints/ast1-codec']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',name+'.js'),'utf8'),c,{filename:name+'.js'});
 }
 c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 vm.runInContext('state=ast1Decode(ast)',c);
 return c;
}
test('AST1 multi-reagent resonance reports name and missing coupled proof, not merger fairness',()=>{
 const c=model();
 const m=vm.runInContext("state.machines.find(m=>m.id==='M24')",c);
 assert.equal(m.type,'共鸣');
 const r=vm.runInContext('legacyReferenceWarehouseTheory()',c);
 assert(r.diagnostics.unresolvedReason,'the full AST1 physical fixed point remains unproved');
 assert.match(r.diagnostics.unresolvedReason,/M24/);
 assert.match(r.diagnostics.unresolvedReason,/共鸣谐振/);
 assert.match(r.diagnostics.unresolvedReason,/多原料配方/);
 assert.match(r.diagnostics.unresolvedReason,/原料独立 FIFO/);
 assert.doesNotMatch(r.diagnostics.unresolvedReason,/节点 M24 有多个有效输入，需证明汇流公平/);
 assert.equal(r.diagnostics.blockingMachine?.id,'M24');
 assert.equal(r.diagnostics.blockingMachine?.type,'共鸣');
 assert.equal(Object.keys(r.diagnostics.blockingMachine.recipe).length,4);
 assert.equal(r.diagnostics.certified,false);
 assert.deepEqual(Object.keys(r.routeFlows),[]);
});
test('AST1 4-input recipe is exact locally, but 20 global algebraic degrees still need scheduling constraints',()=>{
 const c=model();
 const expr="(()=>{const mod=factorySteadyBuildEquations();const r=factorySteadyAnalyzeEqualities(mod);const recipe=mod.machineEquations.find(m=>m.machine==='M24');return {r,recipe,connected:state.routes.filter(x=>x.to?.id==='M24').length};})()";
 const result=vm.runInContext(expr,c);
 assert.equal(result.connected,4);
 assert.equal(result.recipe.inputs.length,4);
 assert.equal(result.recipe.cyclePeriodSeconds,'6');
 assert.equal(result.r.variables,138);
 assert.equal(result.r.rank,118);
 assert.equal(result.r.freeDegrees,20);
 assert(result.r.warnings.some(t=>t.includes('FIFO')));
});
