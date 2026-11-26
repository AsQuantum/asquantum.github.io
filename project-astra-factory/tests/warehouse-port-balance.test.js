'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),file=fs.readFileSync(path.join(__dirname,'fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim(),read=f=>fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8');
function setup(){
 const c=vm.createContext({console,performance,atob,btoa,document:{getElementById(){return{getContext(){return{}}}}},localStorage:{getItem(){},setItem(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/math/arithmetic/rational','engine/steady-flow','core/compact-json','blueprints/ast1-codec'])vm.runInContext(read(f),c);
 c.ast=file;vm.runInContext('state=ast1Decode(ast)',c);return c;
}
test('AST1 warehouse outlet displays 1s nominal and does not invent an effective period',()=>{
 const c=setup();const info=vm.runInContext("(()=>{theoreticalBudget=legacyReferenceWarehouseTheory();const m=state.machines.find(m=>m.id==='M114');return {status:theoreticalBudget.status,label:warehouseOutletTimeLabel(m)}})()",c);
 assert.equal(info.status,'modelled-unresolved');assert(info.label.startsWith('1s('));
 assert(info.label.includes('待证明'));
 assert(!info.label.includes('待接线'));
 assert(!info.label.includes('未计算'));
});
test('removing each garbage source cannot create a false all-material exact balance',()=>{
 const c=setup();
 for(const id of ['M0','M1','M52','M89']){
  c.id=id;
  const info=vm.runInContext("(()=>{state=ast1Decode(ast);state.machines=state.machines.filter(m=>m.id!==id);state.routes=state.routes.filter(r=>r.from.id!==id&&r.to?.id!==id);const t=legacyReferenceWarehouseTheory();return {status:t.status,certified:t.diagnostics.certified,materials:Object.keys(t.inflow).length}})()",c);
  assert.equal(info.status,'modelled-unresolved',id);assert.equal(info.certified,false,id);assert.equal(info.materials,0,id);
 }
});
