'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const file of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-equations','engine/steady-bounds','engine/steady-algebra',
  'engine/steady-warehouse-node','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',file+'.js'),'utf8'),c);
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 return c;
}
test('AST1 priority is a serialized record order, not a per-item RR or equitable flow split',()=>{
 const c=env();
 const m=vm.runInContext('state=ast1Decode(fixture);factorySteadyWarehousePriorityModel()',c);
 const ti=m.groups.find(g=>g.item==='钛合金锭');
 const alloy=m.groups.find(g=>g.item==='合金板');
 assert.deepEqual(Array.from(ti.outlets,x=>x.id),['M48','M114']);
 assert.deepEqual(Array.from(alloy.outlets,x=>x.id),['M49','M50']);
 assert.equal(ti.competing,true);
 assert.equal(ti.outlets[0].capacity,3);
 assert.match(m.caveat,/No per-outlet mean throughput/);
});
test('with 1 available stock, earlier outlet reserves all, later gets zero',()=>{
 const c=env();
 c.queue=[{id:'M48',reserved:0,capacity:3},{id:'M114',reserved:0,capacity:3}];
 const x=vm.runInContext('factorySteadyWarehousePriorityAllocate(1,queue)',c);
 assert.deepEqual(Array.from(x.allocations,a=>a.granted),['1','0']);
 assert.equal(x.remainingFreeStock,'0');
});
test('when first outlet already has 3 queued items, next outlet gets the stock',()=>{
 const c=env();
 c.queue=[{id:'M48',reserved:3,capacity:3},{id:'M114',reserved:0,capacity:3}];
 const x=vm.runInContext('factorySteadyWarehousePriorityAllocate(2,queue)',c);
 assert.deepEqual(Array.from(x.allocations,a=>a.granted),['0','2']);
 assert.equal(x.allocations[1].newReserved,2);
});
test('unconnected earlier outlet does not reserve items',()=>{
 const c=env();
 c.queue=[{id:'M48',reserved:0,capacity:3,eligibleToReserve:false},
  {id:'M114',reserved:0,capacity:3,eligibleToReserve:true}];
 const x=vm.runInContext('factorySteadyWarehousePriorityAllocate(3,queue)',c);
 assert.deepEqual(Array.from(x.allocations,a=>a.granted),['0','3']);
});
test('negative inventory or physically impossible FIFO is refused, not silently divided',()=>{
 const c=env();
 assert.throws(()=>vm.runInContext('factorySteadyWarehousePriorityAllocate(-1,[])',c),/Negative/);
 c.queue=[{id:'M0',reserved:4,capacity:3}];
 assert.throws(()=>vm.runInContext('factorySteadyWarehousePriorityAllocate(1,queue)',c),/Invalid/);
});
