'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function model(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return {}}}}}});
 for(const file of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit',
  'engine/steady-equations','core/compact-json','blueprints/ast1-codec']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',file+'.js'),'utf8'),c,{filename:file+'.js'});
 }
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 return vm.runInContext('state=ast1Decode(fixture);factorySteadyBuildEquations()',c);
}
test('AST1 model explicitly defines independent material FIFOs and exact recipe buffer capacities',()=>{
 const eq=model(),recipes=eq.queueModels.recipeIngredients;
 assert.equal(recipes.length,49);
 for(const machine of recipes){
  assert.equal(machine.perMaterialIndependent,true);
  for(const q of machine.queues){
   assert(q.consumePerCycle>0);
   assert.equal(q.capacity,3*q.consumePerCycle);
   assert.match(q.queueType,/^per-item independent FIFO/);
  }
 }
 const resonance=recipes.find(m=>m.machine==='M24');
 assert(resonance);
 const queues=Object.fromEntries([...resonance.queues].map(q=>[q.item,q.capacity]));
 assert.equal(Object.keys(queues).length,4);
 assert.equal(queues['能量电池'],6);
 assert.equal(queues['合金板'],6);
});
test('AST1 merger stack scans physical ports into shared capacity-three FIFO with no extra item slots',()=>{
 const eq=model(),mergers=eq.queueModels.mergers;
 assert(mergers.length>0);
 for(const m of mergers){
  assert.equal(m.sharedFIFOCapacity,3);
  assert.equal(m.physicalInletCapacityPerPort,0);
  assert.equal(m.sharedQueueReferencesExistingInputItems,false);
  assert(m.backpressure.includes('incoming conveyor belts'));
  assert.equal(m.scanOrder,'physical left-middle-right, skipping empty ports');
 }
 const itemSum=eq.queueModels.mergers.reduce((sum,m)=>sum+m.sharedFIFOCapacity,0);
 assert.equal(itemSum,3*mergers.length);
});
test('AST1 warehouses have three reservations per output and zero physical input queues',()=>{
 const eq=model(),outs=eq.queueModels.warehouseOutputs,ins=eq.queueModels.warehouseInputs;
 assert(outs.length>0&&ins.length>0);
 assert(outs.every(x=>x.capacity===3&&x.sharedInventory));
 assert(ins.every(x=>x.capacity===0));
 assert(eq.warehousePools.some(p=>p.dispatchSemantics.includes('reserved 3-item FIFO')));
});

test('AST1 model defines recipe output FIFO capacities as qty times 20',()=>{
 const eq=model();
 assert.equal(eq.queueModels.productionOutputs.length,eq.queueModels.recipeIngredients.length);
 for(const q of eq.queueModels.productionOutputs){
  assert.equal(q.capacity,q.producedPerCycle*20);
  assert(q.capacity>0);
 }
});
test('a quantum computer contributes one 10-item ANY-material consumption queue',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const c=vm.createContext({console,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const file of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/steady-equations'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',file+'.js'),'utf8'),c);
 vm.runInContext("state={machines:[{id:'quantum',type:'电脑',x:0,y:0,face:'E'}],routes:[]}",c);
 const report=vm.runInContext('factorySteadyBuildEquations()',c);
 assert.equal(report.queueModels.quantumConsumers.length,1);
 assert.equal(report.queueModels.quantumConsumers[0].capacity,10);
 assert.equal(report.queueModels.quantumConsumers[0].serviceIntervalSeconds,1);
 assert.equal(report.queueModels.quantumConsumers[0].queueType,'one ANY-material FIFO');
});
