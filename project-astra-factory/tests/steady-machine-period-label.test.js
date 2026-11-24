'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function setup(){
 const c=vm.createContext({console,performance,atob,btoa,
  document:{getElementById(){return {getContext(){return {}}}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state',
  'core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-local-rates','engine/steady-recipe-exact','engine/steady-merge-exact',
  'engine/steady-equations','engine/steady-bounds','engine/steady-algebra',
  'core/compact-json','blueprints/ast1-codec']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 }
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 vm.runInContext('state=ast1Decode(fixture)',c);
 return c;
}
test('AST1 connected resonance is not called unplugged when global exact steady proof is incomplete',()=>{
 const c=setup();
 const x=vm.runInContext("(()=>{theoreticalBudget=legacyReferenceWarehouseTheory();let m=state.machines.find(m=>m.id==='M24');return {label:timeLabel(m),wire:machineWiredForTheory(m),budget:theoreticalBudget};})()",c);
 assert.equal(x.wire,true);
 assert.equal(x.budget.status,'modelled-unresolved');
 assert.equal(x.label,'6s(≥7.5s)');
 assert.equal(x.budget.diagnostics.symbolicModel.provenUpperBounds.machineCycleUpper.M24,'2/15');
 assert.equal(x.budget.diagnostics.certified,false);
});
test('connected recipes with only nominal capacity bound say 待证明 rather than 待接线',()=>{
 const c=setup();
 const states=vm.runInContext("(()=>{theoreticalBudget=legacyReferenceWarehouseTheory();return state.machines.filter(m=>getRecipe(m)).map(m=>({id:m.id,label:timeLabel(m),connected:machineWiredForTheory(m)}));})()",c);
 const connected=states.filter(x=>x.connected);
 assert(connected.length>=20);
 assert(connected.every(x=>!x.label.includes('待接线')&&!x.label.includes('未计算')));
 assert(connected.some(x=>x.label.includes('待证明')),'some valid models still lack unique cycle proof');
 assert(connected.some(x=>x.label.includes('≥')),'known exact upper bounds should become lower period bounds');
});
test('warehouse output connected to a belt never says 未计算 or 待接线 solely because global proof is uncompleted',()=>{
 const c=setup();
 const info=vm.runInContext("(()=>{theoreticalBudget=legacyReferenceWarehouseTheory();const m=state.machines.find(m=>m.id==='M114');return {id:m.id,connected:machineWiredForTheory(m),label:warehouseOutletTimeLabel(m)};})()",c);
 assert.equal(info.connected,true);
 assert.match(info.label,/^1s\((?:待证明|≥.+s|∞)\)$/);
 assert.doesNotMatch(info.label,/待接线|未计算/);
});
test('genuinely disconnected or preview machines are correctly marked 待接线',()=>{
 const c=setup();
 const info=vm.runInContext("(()=>{theoreticalBudget=legacyReferenceWarehouseTheory();let m=state.machines.find(m=>m.id==='M24');let p={...m,id:'unplaced-preview'};let savedRoutes=state.routes;state.routes=savedRoutes.filter(r=>r.from.id!==m.id);let unplugged=timeLabel(m);state.routes=savedRoutes;return {preview:timeLabel(p),unplugged};})()",c);
 assert.match(info.preview,/待接线/);
 assert.match(info.unplugged,/待接线/);
});
test('decimal recipe periods use exact BigInt rational parsing 1.5=3/2 2.5=5/2 7.5=15/2 22.5=45/2',()=>{
 const c=setup();
 const values=vm.runInContext("['1.5','2.5','7.5','22.5','0.1'].map(s=>steadyExactText(steadyExactQ(s)))",c);
 assert.deepEqual([...values],['3/2','5/2','15/2','45/2','1/10']);
 const res=vm.runInContext("theoryPeriodLowerText('3/7','1.5')",c);
 assert.equal(res,'≥2.33s');
});
test('an exact network certifying only some machines must not falsely mark other machines as infinity production period',()=>{
 const c=setup();
 const info=vm.runInContext("(()=>{theoreticalBudget={machineCycles:{'M24':0.1},error:null};return {known:timeLabel(state.machines.find(m=>m.id==='M24')),unknown:timeLabel(state.machines.find(m=>m.id==='M101'))};})()",c);
 assert.equal(info.known,'6s(10s)');
 assert.match(info.unknown,/\(待证明\)/);
});
