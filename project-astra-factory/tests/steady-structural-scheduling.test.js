'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function context(){
 const c=vm.createContext({console,atob,btoa,performance,
  document:{getElementById(){return{getContext(){return{}}}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-equations','engine/steady-structural-scheduling',
  'core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 return c;
}
test('real AST1 has NO mixed recipe inlet or splitter: all mixed materials terminate at warehouse inlet',()=>{
 const c=context();
 const x=vm.runInContext('state=ast1Decode(fixture);factorySteadySchedulingStructure()',c);
 assert.equal(x.connectedRouteCount,84);
 assert.equal(x.splitterCount,11);
 assert.equal(x.homogeneousSplitterIDs.length,11);
 assert.equal(x.mixedRecipeInlets.length,0);
 assert.equal(x.incompatibleRecipeInlets.length,0);
 assert.equal(x.mixedSplitterInputs.length,0);
 assert.equal(x.splitterFilterMismatchRisks.length,0);
 assert.equal(x.mixedRouteCount,3);
 assert.deepEqual(Array.from(x.mixedTerminalWarehouseRoutes,r=>r.route),
  ['R76','R81','R82']);
 assert(x.mixedTerminalWarehouseRoutes.every(r=>r.warehouse==='M46'));
 assert.equal(x.otherMixedRoutes.length,0);
 assert.equal(x.claims.recipeFIFOColorOrderingAbsent,true);
 assert.equal(x.claims.splitterFIFOColorOrderingAbsent,true);
 assert.equal(x.claims.terminalMixedRoutesMaterialAcceptanceUnconditional,true);
 assert.equal(x.claims.wholeFactoryExactRateSolved,false);
});
test('AST1 remaining exact schedule couplings are specific priority outlet pairs and stock feedback',()=>{
 const c=context();
 const x=vm.runInContext('state=ast1Decode(fixture);factorySteadySchedulingStructure()',c);
 assert.deepEqual(Array.from(x.sharedWarehouseOutletCompetition,g=>g.item),
  ['合金板','钛合金锭']);
 assert.deepEqual(Array.from(x.sharedWarehouseOutletCompetition,g=>Array.from(g.machineOrder)),
  [['M49','M50'],['M48','M114']]);
 assert.equal(x.recirculatedWarehouseItems.length,6);
 assert(x.caveats.some(text=>text.includes('NOT port RR phase')));
});
test('if warehouse inlet becomes material-filtered, the same mixed routes cannot be classified unconditionally accepted',()=>{
 const c=context();
 const x=vm.runInContext("state=ast1Decode(fixture);state.machines.find(m=>m.id==='M46').inletItem='共鸣水晶';factorySteadySchedulingStructure()",c);
 assert.equal(x.mixedRouteCount,3);
 assert.equal(x.mixedTerminalWarehouseRoutes.length,0);
 assert.equal(x.otherMixedRoutes.length,3);
 assert.equal(x.claims.terminalMixedRoutesMaterialAcceptanceUnconditional,false);
 assert.equal(x.claims.wholeFactoryExactRateSolved,false);
});

test('AST1 theory diagnostics expose the structural reduction, without a fabricated global rate',()=>{
 const c=context();
 c.esc=x=>String(x);
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/ui/warehouse.js'),'utf8'),c);
 const out=vm.runInContext('state=ast1Decode(fixture);legacyReferenceWarehouseTheory()',c);
 assert.equal(out.diagnostics.certified,false);
 const topo=out.diagnostics.symbolicModel.scheduleTopology;
 assert.equal(topo.homogeneousSplitterIDs.length,11);
 assert.equal(topo.mixedRecipeInlets.length,0);
 assert.equal(topo.mixedTerminalWarehouseRoutes.length,3);
 c.report=out;
 const html=vm.runInContext('warehouseScheduleTopologyMarkup(report)',c);
 assert(html.includes('11/11'));
 assert(html.includes('R76'));
 assert(html.includes('M48'));
 assert(html.includes('未求出')||html.includes('仍需联立'));
});

test('a homogeneous splitter with an incompatible connected output filter is NOT marked color-safe',()=>{
 const c=context();
 const x=vm.runInContext("state=ast1Decode(fixture);state.machines.find(m=>m.id==='M36').outFilters[0]='齿轮组';factorySteadySchedulingStructure()",c);
 assert(x.splitterFilterMismatchRisks.some(r=>r.splitter==='M36'&&r.port===0));
 assert.equal(x.claims.splitterFIFOColorOrderingAbsent,false);
});
