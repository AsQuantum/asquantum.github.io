'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit',
  'engine/steady-flow','engine/steady-equations','engine/steady-algebra','engine/steady-generic-network',
  'engine/steady-machine-graph','engine/steady-rate-region','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 return c;
}
const run=(c,s)=>vm.runInContext(s,c);
const model=(names,lines,junctions=[],machines=[],warehouseFlow={})=>({
 rateVariables:names.map(id=>({id})),machineEquations:machines,junctionEquations:junctions,
 sharedLines:lines.map(([route,terms,cap=1])=>({route,terms,capacityPerSecond:cap})),warehouseFlow
});
const junction=(received,sent)=>({machine:'j',perMaterial:[{item:'A',received,sent}]});
const recipe=(machine,cycleVar,period,inputs,outputs)=>({machine,cycleVar,cyclePeriodSeconds:period,
 inputs:inputs.map(([item,amountPerCycle,rateTerms])=>({item,amountPerCycle,rateTerms})),
 output:{item:'product',amountPerCycle:outputs[0],rateTerms:outputs[1]}});
test('mixed belt enforces sum of flows, not separate 1/s capacities',()=>{
 const c=env();c.m=model(['a','b'],[['mixed',['a','b']]]);
 const r=run(c,"factorySteadyRateRegionMaximum(factorySteadyBuildRateRegion(m),[['a',1],['b',1]])");
 assert.equal(r.upper,'1');assert.equal(r.actualLongRunRatesSolved,false);
 assert(r.dualCertificate.some(x=>x.constraint==='belt-or-port:mixed'));
});
test('coupled multi-ingredient recipe shares a belt: exact 1/5 not independent bound 1/3',()=>{
 const c=env();c.m=model(['a','b','out'],[['mix',['a','b']],['output',['out']]],
 [],[recipe('p','nu',1,[['A',2,['a']],['B',3,['b']]],[1,['out']])]);
 const r=run(c,"factorySteadyRateRegionMaximum(factorySteadyBuildRateRegion(m),[['nu',1]])");
 assert.equal(r.upper,'1/5');assert.equal(r.mathematicalWitness.a,'2/5');assert.equal(r.mathematicalWitness.b,'3/5');
});
test('physical feedback loop conservation fixes net input=output, but not circulation',()=>{
 const c=env();c.m=model(['i','r','b','o'],[['input',['i']],['return',['r']],['trunk',['b']],['sink',['o']]],
 [junction(['i','r'],['b']),junction(['b'],['o','r'])]);
 const a=run(c,"(()=>{const p=factorySteadyBuildRateRegion(m);return [factorySteadyRateRegionMaximum(p,[['o',1]]),factorySteadyRateRegionMaximum(p,[['r',1]])]})()");
 assert.equal(a[0].upper,'1');assert.equal(a[1].upper,'1');
 assert.equal(a[0].mathematicalWitness.i,a[0].mathematicalWitness.o);
 assert.equal(a[0].actualLongRunRatesSolved,false);
});
test('conditional splitter with two backlogged compatible outlets and a full trunk has exact half flows',()=>{
 const c=env();c.m=model(['i','r','b','o'],[['input',['i']],['return',['r']],['trunk',['b']],['sink',['o']]],
 [junction(['i','r'],['b']),junction(['b'],['o','r'])]);
 const x=run(c,"(()=>{const p=factorySteadyBuildRateRegion(m);return factorySteadySolveRateRegimes(p,[factorySteadyMinimumRegime('trunk','b',[1]),factorySteadyWaterfillRegime('split',[{rate:'r',cap:1},{rate:'o',cap:1}])],[{name:'i',terms:[['i',1]]},{name:'r',terms:[['r',1]]},{name:'o',terms:[['o',1]]}])})()");
 assert.equal(x.completed,true);assert.equal(x.feasibleRegimeCount,1);assert(x.pruned>0);
 for(const range of x.ranges){assert.equal(range.minimum,'1/2');assert.equal(range.maximum,'1/2');assert(range.uniqueWithinConditionalModel);}
 assert.equal(x.actualLongRunRatesSolved,false);
});
test('conditional min and RR allocates 1/5 and 4/5 by demand, without tick stepping',()=>{
 const c=env();c.m=model(['s','a','b'],[['source',['s']],['a',['a']],['b',['b']]],[junction(['s'],['a','b'])]);
 const x=run(c,"(()=>{const p=factorySteadyBuildRateRegion(m);return factorySteadySolveRateRegimes(p,[factorySteadyMinimumRegime('source','s',[1]),factorySteadyWaterfillRegime('split',[{rate:'a',cap:'1/5'},{rate:'b',cap:1}])],[{name:'a',terms:[['a',1]]},{name:'b',terms:[['b',1]]}])})()");
 assert.equal(x.completed,true);assert.equal(x.ranges[0].minimum,'1/5');assert.equal(x.ranges[0].maximum,'1/5');
 assert.equal(x.ranges[1].minimum,'4/5');assert.equal(x.ranges[1].maximum,'4/5');
});
test('conditional warehouse priorities reserve first share then residual',()=>{
 const c=env();c.m=model(['s','a','b'],[['s',['s']],['a',['a']],['b',['b']]],[],[],{A:{inflow:['s'],outflow:['a','b']}});
 const x=run(c,"(()=>{const p=factorySteadyBuildRateRegion(m);return factorySteadySolveRateRegimes(p,[factorySteadyMinimumRegime('source','s',['3/5']),...factorySteadyPriorityRegimes('warehouse','s',[{rate:'a',cap:'2/5'},{rate:'b',cap:1}])],[{name:'a',terms:[['a',1]]},{name:'b',terms:[['b',1]]}])})()");
 assert(x.completed);assert.equal(x.ranges[0].minimum,'2/5');assert.equal(x.ranges[0].maximum,'2/5');
 assert.equal(x.ranges[1].minimum,'1/5');assert.equal(x.ranges[1].maximum,'1/5');
});
test('invalid affine regime with x>=2 and capacity 1 is mathematically infeasible',()=>{
 const c=env();c.m=model(['x'],[['x',['x']]]);
 const x=run(c,"factorySteadyRateRegionRegimeMaximum(factorySteadyBuildRateRegion(m),[{label:'impossible',terms:[['x',-1]],rhs:-2}],[])");
 assert.equal(x.status,'infeasible');assert.equal(x.maxScale,'0');
});
test('actual AST1 compiles to 12 physical graphs but only two algebraic coupled components',()=>{
 const c=env();c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const x=run(c,"(()=>{state=ast1Decode(ast);const model=factorySteadyBuildEquations(),g=factorySteadyCompileAbstractNetwork(state,model),p=factorySteadyBuildRateRegion(model);return {g,free:p.freeVariables.length,groups:p.components.map(x=>x.variables.length),max:factorySteadyRateRegionMaximum(p,[['cycles:M24',1]])}})()");
 assert.equal(x.g.nodes.length,115);assert.equal(x.g.edges.length,84);assert.equal(x.g.graphs.length,12);
 assert.equal(x.free,20);assert.deepEqual([...x.groups].sort((a,b)=>a-b),[1,19]);assert.equal(x.max.upper,'2/15');
 assert.equal(x.g.nodes.filter(n=>n.category==='decoration').length,15);
});

test('real port model treats distinct warehouse-in ports as independent graph terminals',()=>{
 const c=env();
 const x=run(c,"(()=>{checkPath=()=>null;state={machines:[{id:'s1',type:'垃圾',mode:0,x:0,y:0,face:'E'},{id:'s2',type:'粒子',mode:0,x:0,y:0,face:'E'},{id:'wh',type:'仓入',x:0,y:0,face:'E'}],routes:[{id:'a',from:{id:'s1',port:0},to:{id:'wh',port:0},path:[[0,0]]},{id:'b',from:{id:'s2',port:0},to:{id:'wh',port:1},path:[[0,0]]}]};return factorySteadyCompileAbstractNetwork()})()");
 assert.equal(x.graphs.length,2);assert(x.graphs.every(g=>g.producerBoundaryCount===1&&g.consumerBoundaryCount===1));
 const warehouse=x.nodes.find(n=>n.id==='wh');
 assert.equal(warehouse.inputBuffer.kind,'none');
 assert.equal(warehouse.independentInputBoundaryPorts,true);
 assert.equal(warehouse.category,'consumer');
});
test('generic service compiler emits a timed recipe bottleneck and does not silently invent missing offer/demand',()=>{
 const c=env();c.m=model(['a','b','out'],[['mix',['a','b']],['output',['out']]],
  [],[recipe('p','nu',1,[['A',2,['a']],['B',3,['b']]],[1,['out']])]);
 const x=run(c,"(()=>{const region=factorySteadyBuildRateRegion(m);const missing=factorySteadyCompileConditionalRegimes(m,{});const spec=factorySteadyCompileConditionalRegimes(m,{recipes:{p:{inputOffer:{A:'2/5',B:'3/5'},outputDemand:1}}});return {missing,spec,solution:factorySteadySolveRateRegimes(region,spec.rules,[{name:'nu',terms:[['nu',1]]}])}})()");
 assert.equal(x.missing.completeServiceAssumptions,false);
 assert.equal(x.missing.rules.length,0);
 assert.equal(x.spec.completeServiceAssumptions,true);
 assert.equal(x.solution.ranges[0].minimum,'1/5');
 assert.equal(x.solution.ranges[0].maximum,'1/5');
});
test('partial branch enumeration cannot claim unique rate',()=>{
 const c=env();c.m=model(['s'],[['s',['s']]]);
 const x=run(c,"factorySteadySolveRateRegimes(factorySteadyBuildRateRegion(m),[factorySteadyMinimumRegime('s','s',[1,'1/2'])],[{name:'s',terms:[['s',1]]}],{maxBranches:1})");
 assert.equal(x.completed,false);assert.equal(x.ranges[0].uniqueWithinConditionalModel,false);
});
