'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function ctx(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return {getContext(){return {}}}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-equations','engine/steady-algebra','engine/steady-warehouse-node',
  'core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 return c;
}
test('warehouse supernode retains inflow/outflow ports and NONZERO inventory drift',()=>{
 const c=ctx();
 c.model={
  rateVariables:[
   {id:'flow:rA:steel',route:'rA',item:'steel'},
   {id:'flow:rB:steel',route:'rB',item:'steel'},
   {id:'flow:rOut:steel',route:'rOut',item:'steel'}],
  machineEquations:[],junctionEquations:[],
  warehousePools:[{item:'steel',inflowTerms:['flow:rA:steel','flow:rB:steel'],
   outflowTerms:['flow:rOut:steel']}]
 };
 c.graph={machines:[],routes:[
  {id:'rA',from:{id:'producerA',port:0},to:{id:'inA',port:0}},
  {id:'rB',from:{id:'producerB',port:0},to:{id:'inB',port:1}},
  {id:'rOut',from:{id:'outA',port:0},to:{id:'consumer',port:1}}
 ]};
 const result=vm.runInContext('state=graph;factorySteadyWarehouseSupernodes(model,factorySteadyAnalyzeEqualities(model))',c);
 assert.equal(result.materialCount,1);
 assert.equal(result.totalWarehouseInputPorts,2);
 assert.equal(result.totalWarehouseOutputPorts,1);
 const steel=result.nodes[0];
 assert.equal(steel.mustBalanceToZero,false);
 assert.equal(steel.stockCapacity,'unbounded');
 assert.equal(steel.sustainableNecessaryCondition,'netRate>=0');
 assert.deepEqual([...steel.netAsFreeVariables].map(t=>[t.variable,t.coefficient]).sort(),[
  ['flow:rA:steel','1'],['flow:rB:steel','1'],['flow:rOut:steel','-1']].sort());
});
test('warehouse supernode correctly reduces recipe-linked storage net to a FREE machine-cycle variable',()=>{
 const c=ctx();
 c.model={
  rateVariables:[{id:'flow:rIn:A',route:'rIn',item:'A'}],
  machineEquations:[{machine:'producer',cycleVar:'cycles:p',inputs:[],
   output:{item:'A',amountPerCycle:'2',rateTerms:['flow:rIn:A']}}],
  junctionEquations:[],
  warehousePools:[{item:'A',inflowTerms:['flow:rIn:A'],outflowTerms:[]}]
 };
 c.graph={machines:[],routes:[{id:'rIn',from:{id:'producer',port:0},to:{id:'warehouseIn',port:0}}]};
 const result=vm.runInContext('state=graph;factorySteadyWarehouseSupernodes(model,factorySteadyAnalyzeEqualities(model))',c);
 const stock=result.nodes[0];
 assert.equal(stock.accumulatedOnly,true);
 assert.deepEqual([...stock.netAsFreeVariables].map(v=>[v.variable,v.coefficient]),[
  ['cycles:p','2']]);
});
test('AST1 has fourteen material-wise shared stock supernodes, exact net relations, and no fabricated unique warehouse rates',()=>{
 const c=ctx();
 c.code=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const result=vm.runInContext('state=ast1Decode(code);(()=>{const m=factorySteadyBuildEquations(),a=factorySteadyAnalyzeEqualities(m);return {s:factorySteadyWarehouseSupernodes(m,a),a,m};})()',c);
 assert.equal(result.s.materialCount,14);
 assert.equal(result.a.variables,138);
 assert.equal(result.a.freeDegrees,20);
 assert(result.s.totalWarehouseInputPorts>14);
 assert(result.s.totalWarehouseOutputPorts>0);
 const crys=result.s.nodes.find(x=>x.item==='共鸣水晶');
 assert(crys);
 assert.equal(crys.outputPorts.length,0);
 assert.deepEqual([...crys.netAsFreeVariables].map(x=>[x.variable,x.coefficient]),[
  ['cycles:M101','1'],['cycles:M34','-1']]);
 const alloy=result.s.nodes.find(x=>x.item==='合金板');
 assert.equal(alloy.inputPorts.length,3);
 assert.equal(alloy.outputPorts.length,2);
 assert.equal(alloy.mustBalanceToZero,false);
 assert.equal(alloy.sustainableNecessaryCondition,'netRate>=0');
});

test('unresolved AST1 theory exposes 14 exact warehouse stock identities without populating unknown net flows',()=>{
 const c=ctx();
 c.code=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const report=vm.runInContext('state=ast1Decode(code);legacyReferenceWarehouseTheory()',c);
 assert.equal(report.diagnostics.certified,false);
 assert.deepEqual(Object.keys(report.inflow),[]);
 assert.deepEqual(Object.keys(report.outflow),[]);
 const warehouse=report.diagnostics.symbolicModel.warehouseSupernodes;
 assert.equal(warehouse.materialCount,14);
 assert.equal(warehouse.globalRateFreedom,20);
 assert.equal(warehouse.nodes.find(n=>n.item==='共鸣水晶').mustBalanceToZero,false);
});
test('the warehouse theory UI labels symbolic warehouse net as equation rather than claiming a solved positive rate',()=>{
 const c=ctx();
 c.esc=x=>String(x);
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/ui/warehouse.js'),'utf8'),c);
 c.code=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const html=vm.runInContext('state=ast1Decode(code);warehouseSupernodesMarkup(legacyReferenceWarehouseTheory())',c);
 assert.match(html,/14 种物品的守恒方程/);
 assert.match(html,/ΔS\/Δt/);
 assert(html.includes('ν(M101) − ν(M34)'));
 assert(html.includes('不能强行设为零'));
 assert(html.includes('尚待证明'));
});

test('warehouse feedback inequality proves demand-cycle upper bound by exact algebra, not LP',()=>{
 const c=ctx();
 c.pool={nodes:[{item:'A',netAsFreeVariables:[
  {variable:'cycles:generator',coefficient:'1'},
  {variable:'cycles:downstream',coefficient:'-2'}
 ]}]};
 c.bounds={upper:{'cycles:generator':'1/4','cycles:downstream':'1'}};
 const r=vm.runInContext('factorySteadyPropagateWarehouseBounds(pool,bounds)',c);
 assert(r.completed);
 assert.equal(r.tightened['cycles:downstream'].upper,'1/8');
 assert(!r.tightened['cycles:generator']);
});
test('warehouse with NO incoming stock forces outflow-cycle upper to zero algebraically',()=>{
 const c=ctx();
 c.pool={nodes:[{item:'A',netAsFreeVariables:[
  {variable:'cycles:withdraw',coefficient:'-1'}
 ]}]};
 c.bounds={upper:{'cycles:withdraw':'1'}};
 const r=vm.runInContext('factorySteadyPropagateWarehouseBounds(pool,bounds)',c);
 assert(r.completed);
 assert.equal(r.tightened['cycles:withdraw'].upper,'0');
 assert.deepEqual([...r.forcedZero],['cycles:withdraw']);
});
test('AST1 stock feedback propagator handles all 14 exact stock inequalities without selecting a fictitious rate',()=>{
 const c=ctx();
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/engine/steady-bounds.js'),'utf8'),c);
 c.code=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const r=vm.runInContext('state=ast1Decode(code);(()=>{const m=factorySteadyBuildEquations(),al=factorySteadyAnalyzeEqualities(m),stocks=factorySteadyWarehouseSupernodes(m,al),bounds=factorySteadyProveRateBounds(m);return factorySteadyPropagateWarehouseBounds(stocks,bounds);})()',c);
 assert.equal(r.completed,true);
 assert.equal(r.note.includes('NOT reachable FIFO throughput'),true);
 for(const row of Object.values(r.tightened))assert.match(row.upper,/^[0-9]+(?:\/[0-9]+)?$/);
});

test('AST1 warehouse feedback reduces exact ν88 and ν106 upper bounds and passes them to UI, not actual rates',()=>{
 const c=ctx();
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/engine/steady-bounds.js'),'utf8'),c);
 c.esc=x=>String(x);
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/ui/warehouse.js'),'utf8'),c);
 c.code=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const budget=vm.runInContext('state=ast1Decode(code);legacyReferenceWarehouseTheory()',c);
 const proof=budget.diagnostics.symbolicModel.provenUpperBounds;
 assert.equal(proof.machineCycleUpper.M88,'1/14');
 assert.equal(proof.machineCycleUpper.M106,'1/28');
 assert.equal(proof.warehouseFeedbackUpper['cycles:M88'].upper,'1/14');
 assert.equal(proof.warehouseFeedbackUpper['cycles:M106'].upper,'1/28');
 assert.equal(budget.diagnostics.certified,false);
 assert.deepEqual(Object.keys(budget.inflow),[]);
 c.budget=budget;
 const html=vm.runInContext('warehouseProvenBoundsMarkup(budget)',c);
 assert(html.includes('仓库反压'));
 assert(html.includes('1/14'));
 assert(html.includes('1/28'));
 assert(html.includes('不是实际稳态产率'));
});

test('starved warehouse: initial stock depleted then exact output matches replenishment rate',()=>{
 const c=ctx();
 c.input='1/5';c.demand='4/5';c.stock=3;
 const result=vm.runInContext('factorySteadyIdealWarehouseBoundary(input,demand,stock)',c);
 assert.equal(result.boundaryCase,'starved');
 assert.equal(result.longRunOutflow,'1/5');
 assert.equal(result.longRunNetInventoryGrowth,'0');
 assert.equal(result.stockExhaustionSeconds,'5');
 assert.match(result.caveat,/Not a solved global steady state/);
});
test('accumulating warehouse: output demand is lower than inflow so net production stays positive',()=>{
 const c=ctx();
 const result=vm.runInContext("factorySteadyIdealWarehouseBoundary('9/10','2/5',0)",c);
 assert.equal(result.boundaryCase,'accumulating');
 assert.equal(result.longRunOutflow,'2/5');
 assert.equal(result.longRunNetInventoryGrowth,'1/2');
 assert.equal(result.stockExhaustionSeconds,null);
});
test('balanced warehouse: exact input equals output, including zero-input starvation',()=>{
 const c=ctx();
 const r=vm.runInContext("factorySteadyIdealWarehouseBoundary('0.3','0.3',0)",c);
 assert.equal(r.longRunOutflow,'3/10');
 assert.equal(r.longRunNetInventoryGrowth,'0');
 const zero=vm.runInContext("factorySteadyIdealWarehouseBoundary(0,'0.7',0)",c);
 assert.equal(zero.boundaryCase,'starved');
 assert.equal(zero.longRunOutflow,'0');
 assert.equal(zero.stockExhaustionSeconds,'0');
});
test('warehouse with depleted A forces downstream 1A:2B recipe to limit B intake even when B is abundant',()=>{
 const c=ctx();
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/engine/steady-local-rates.js'),'utf8'),c);
 const boundary=vm.runInContext("factorySteadyIdealWarehouseBoundary('1/5','1',0)",c);
 c.boundary=boundary;
 c.recipe={seconds:1,qty:1,inputs:{A:1,B:2}};
 c.available={A:'0.2',B:1};
 const result=vm.runInContext('steadyExactRecipeInputBalance(recipe,available)',c);
 assert.equal(boundary.longRunOutflow,'1/5');
 assert.equal(steadyString(result.cyclesPerSecond),'1/5');
 assert.equal(steadyString(result.actualInput.B),'2/5');
 assert.equal(steadyString(result.backpressuredSupply.B),'3/5');
 function steadyString(q){return q.d===1n?q.n.toString():q.n.toString()+'/'+q.d.toString();}
});
test('warehouse boundary rejects negative stock, input and requested demand',()=>{
 const c=ctx();
 for(const call of ['factorySteadyIdealWarehouseBoundary(-1,1)','factorySteadyIdealWarehouseBoundary(0,-1)',
  'factorySteadyIdealWarehouseBoundary(0,1,-1)']){
  assert.throws(()=>vm.runInContext(call,c),/nonnegative/);
 }
});
