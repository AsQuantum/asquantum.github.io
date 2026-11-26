'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function context(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return {}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-equations','engine/steady-algebra','core/compact-json','blueprints/ast1-codec']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 }
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 return c;
}
test('exact rational elimination exposes rate freedom, not a fictitious unique flow',()=>{
 const c=context();
 c.model={rateVariables:[{id:'x'},{id:'y'},{id:'z'}],
 machineEquations:[
  {machine:'a',cycleVar:'cy',inputs:[{item:'A',amountPerCycle:'1',rateTerms:['x']}],
   output:{item:'B',amountPerCycle:'2',rateTerms:['y']}}
 ],
 junctionEquations:[
  {machine:'j',perMaterial:[{item:'X',received:['y'],sent:['z']}]}]};
 const answer=vm.runInContext('factorySteadyAnalyzeEqualities(model)',c);
 assert.equal(answer.variables,4);
 assert.equal(answer.rank,3);
 assert.equal(answer.freeDegrees,1);
 assert.deepEqual([...answer.algebraicallyForcedZero],[]);
 const eq=Object.fromEntries([...answer.pivotRelations].map(x=>[x.variable,x.terms]));
 assert.equal(Object.values(eq).length,3);
});
test('missing necessary ingredient forces machine cycles and output flow to zero without LP',()=>{
 const c=context();
 c.model={rateVariables:[{id:'Ain'},{id:'Bout'}],
 machineEquations:[{machine:'m',cycleVar:'c',inputs:[
  {item:'A',amountPerCycle:'1',rateTerms:['Ain']},
  {item:'B',amountPerCycle:'2',rateTerms:[]}
 ],output:{item:'C',amountPerCycle:'1',rateTerms:['Bout']}}],
 junctionEquations:[]};
 const report=vm.runInContext('factorySteadyAnalyzeEqualities(model)',c);
 assert.equal(report.rank,3);
 assert.equal(report.freeDegrees,0);
 assert.deepEqual([...report.algebraicallyForcedZero].sort(),['Ain','Bout','c']);
});
test('AST1 global 89 per-material route variables and recipe cycles analyze without simulation',()=>{
 const c=context();
 const report=vm.runInContext('state=ast1Decode(fixture);factorySteadyAnalyzeEqualities(factorySteadyBuildEquations())',c);
 assert.equal(report.variables,89+49);
 assert(report.rank>0&&report.rank<=138);
 assert.equal(report.freeDegrees,report.variables-report.rank);
 assert(report.pivotRelations.length===report.rank);
 assert(report.warnings.some(x=>x.includes('FIFO')));
});
