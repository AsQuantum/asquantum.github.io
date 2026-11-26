'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const file of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state',
  'core/machines','core/routing','core/audit','engine/steady-flow','engine/steady-equations',
  'engine/steady-components','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',file+'.js'),'utf8'),c,{filename:file+'.js'});
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 return c;
}
test('AST1 material dependency graph has one 24-machine feedback SCC and 91 singletons',()=>{
 const c=env(),r=vm.runInContext('state=ast1Decode(fixture);factorySteadyDependencyComponents()',c);
 assert.equal(r.machineCount,115);
 assert.equal(r.activeMachineCount,76);
 assert.equal(r.routeCount,84);
 assert.equal(r.sourceCount,19);
 assert.equal(r.componentCount,92);
 assert.equal(r.singletonCount,91);
 assert.equal(r.cyclicComponentCount,1);
 assert.equal(r.cyclicComponents[0].size,24);
 assert.deepEqual([...r.cyclicComponents[0].warehouseItems].sort(),
  ['导线线圈','硅晶圆','钛合金锭','齿轮组'].sort());
 assert.equal(r.condensation.topologicalOrder.length,92);
 assert.equal(r.sinkComputers.length,0);
});
test('AST1 terminal warehouse material set is exact and separated from feedback inputs',()=>{
 const c=env(),r=vm.runInContext('state=ast1Decode(fixture);factorySteadyDependencyComponents()',c);
 assert.deepEqual([...r.terminalWarehouse].map(x=>x.item).sort(),
  ['燃料罐','框架模块','电动机','共鸣水晶','等离子电池','量子处理器','引力透镜','曲速线圈'].sort());
 assert.deepEqual([...r.feedbackWarehouseItems].sort(),
  ['合金板','齿轮组','能量电池','钛合金锭','硅晶圆','导线线圈'].sort());
 assert.equal(new Set(r.terminalWarehouse.map(x=>x.item)).size,8);
 assert.equal(r.terminalWarehouse.find(x=>x.item==='钛合金锭'),undefined,
  'same mixed belt carries both terminal and recirculated items');
});
test('feedback SCC condensation is a DAG, but backpressure coupling is explicitly NOT certified away',()=>{
 const c=env(),r=vm.runInContext('state=ast1Decode(fixture);factorySteadyDependencyComponents()',c);
 const pos=new Map([...r.condensation.topologicalOrder].map((id,i)=>[id,i]));
 for(const node of r.condensation.components)
  for(const to of node.successors)assert(pos.get(node.id)<pos.get(to));
 assert.match(r.caveat,/reverse backpressure/);
 assert.match(r.caveat,/not solved/);
});
test('a loop only through one shared warehouse item creates a single feedback SCC',()=>{
 const c=env();
 c.layout={machines:[{id:'a',type:'仓入'},{id:'b',type:'仓出',item:'A'}],
  routes:[{id:'i',from:{id:'x',port:0},to:{id:'a',port:0}},
   {id:'o',from:{id:'b',port:0},to:{id:'a',port:1}}]};
 // Structural pure test with catalog-less surrogate local function overrides.
 c.layout.machines.push({id:'x',type:'dummy'});
 c.model={rateVariables:[
  {id:'flow:i:A',route:'i',item:'A'},
  {id:'flow:o:A',route:'o',item:'A'}],
  warehousePools:[{item:'A',inflowTerms:['flow:i:A','flow:o:A'],outflowTerms:['flow:o:A']}]};
 const result=vm.runInContext('state=layout;factorySteadyDependencyComponents(layout,model)',c);
 assert.equal(result.componentCount,2);
 assert.equal(result.cyclicComponentCount,1);
 assert.equal(result.cyclicComponents[0].size,2);
 assert.equal(result.sourceCount,0);
});
test('unproven AST1 theory exposes source/core/sink partition in collapsed UI rather than fake flows',()=>{
 const c=env(); c.esc=x=>String(x);
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/ui/warehouse.js'),'utf8'),c);
 const result=vm.runInContext('state=ast1Decode(fixture);legacyReferenceWarehouseTheory()',c);
 assert.equal(result.diagnostics.certified,false);
 const p=result.diagnostics.symbolicModel.networkDecomposition;
 assert.equal(p.sourceCount,19);
 assert.equal(p.terminalWarehouseItems.length,8);
 assert.equal(p.cyclicComponents[0].size,24);
 c.report=result;
 const html=vm.runInContext('warehouseNetworkDecompositionMarkup(report)',c);
 assert(html.includes('19 个生产源'));
 assert(html.includes('8 种最终入库物品'));
 assert(html.includes('24 台设备'));
 assert(html.includes('不代表反压被消除'));
 assert.deepEqual(Object.keys(result.inflow),[]);
});
