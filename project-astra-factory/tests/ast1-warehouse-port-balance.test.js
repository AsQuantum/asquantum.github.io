'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=x=>fs.readFileSync(path.join(root,'scripts',x+'.js'),'utf8');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
function load(){
 const ctx=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}},localStorage:{getItem(){},setItem(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),ctx);
 for(const x of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/steady-flow','engine/steady-equations','engine/steady-algebra','engine/steady-bounds','engine/steady-components','engine/steady-warehouse-node','engine/steady-feedforward-islands','engine/steady-structural-scheduling','core/compact-json','blueprints/ast1-codec'])vm.runInContext(read(x),ctx);
 ctx.code=fixture;vm.runInContext('state=ast1Decode(code)',ctx);return ctx;
}
for(const mode of ['original','collector']){
 test('AST1 '+mode+' uses valid physical connections without fabricated all-material theory',()=>{
  const c=load();
  if(mode==='collector')vm.runInContext("(()=>{const m=state.machines.find(m=>m.id==='M114');m.type='采矿';m.mode=1;delete m.item})()",c);
  const data=vm.runInContext("(()=>{const m=state.machines.find(m=>m.id==='M114');return {count:state.machines.length,routes:state.routes.length,invalid:state.routes.filter(r=>checkPath(r.path,r.from,r.to,r.id)).length,x:m.x,y:m.y,type:m.type}})()",c);
  assert.equal(data.count,115);assert.equal(data.routes,84);assert.equal(data.invalid,0);
  assert.equal(data.x,0);assert.equal(data.y,8);
  assert.equal(data.type,mode==='collector'?'采矿':'仓出');
  const t=vm.runInContext('legacyReferenceWarehouseTheory()',c);
  assert.equal(t.diagnostics.certified,false);
  assert.deepEqual(Object.keys(t.inflow),[]);
  assert.deepEqual(Object.keys(t.outflow),[]);
  assert.equal(t.error,undefined);
  assert.equal(t.status,'modelled-unresolved');
  assert.equal(t.diagnostics.modelled,true);
  assert.equal(t.diagnostics.rateSolved,false);
  assert.equal(t.diagnostics.symbolicModel.fullModelStructure.modelledAllConnectedLines,84);
  if(mode==='original'){
   assert.equal(t.diagnostics.symbolicModel.algebraicStatus.variables,138);
   assert.equal(t.diagnostics.symbolicModel.algebraicStatus.rank,118);
   assert.equal(t.diagnostics.symbolicModel.algebraicStatus.freeDegrees,20);
  }else{
   const eq=t.diagnostics.symbolicModel.algebraicStatus;
   assert.equal(eq.variables-eq.rank,eq.freeDegrees);
  }
 });
}
