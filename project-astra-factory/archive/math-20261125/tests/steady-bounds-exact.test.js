'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return {getContext(){return {}}}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state',
  'core/machines','core/routing','core/audit','engine/steady-flow','engine/steady-equations',
  'engine/steady-algebra','engine/steady-bounds','core/compact-json','blueprints/ast1-codec']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 }
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 return c;
}
test('recipe with limited A source proves exact throughput upper bound via recipe coefficients',()=>{
 const c=env();
 c.m={
  rateVariables:[{id:'A'},{id:'B'},{id:'C'}],
  machineEquations:[
   {machine:'sourceA',cycleVar:'srcA',cyclePeriodSeconds:'5',
    inputs:[],output:{item:'A',amountPerCycle:'1',rateTerms:['A']}},
   {machine:'work',cycleVar:'nu',cyclePeriodSeconds:'1',
    inputs:[{item:'A',amountPerCycle:'2',rateTerms:['A']},
     {item:'B',amountPerCycle:'1',rateTerms:['B']}],
    output:{item:'C',amountPerCycle:'1',rateTerms:['C']}}
  ],
  junctionEquations:[],sharedLines:[{terms:['A'],capacityPerSecond:'1'}],
  warehouseFlow:{}
 };
 const r=vm.runInContext('factorySteadyProveRateBounds(m)',c);
 assert(r.completed);
 assert.equal(r.upper.srcA,'1/5');
 assert.equal(r.upper.A,'1/5');
 assert.equal(r.upper.nu,'1/10');
 assert.equal(r.upper.B,'1/10');
 assert.equal(r.upper.C,'1/10');
 assert.equal(r.forcedZero.length,0);
});
test('bounded warehouse stock implies withdrawal <= combined certified inbound rates',()=>{
 const c=env();
 c.m={rateVariables:[{id:'inputA'},{id:'inputB'},{id:'output'}],
  machineEquations:[],junctionEquations:[],
  sharedLines:[{terms:['inputA'],capacityPerSecond:{n:1n,d:3n}},
   {terms:['inputB'],capacityPerSecond:{n:1n,d:4n}}],
  warehouseFlow:{A:{inflow:['inputA','inputB'],outflow:['output']}}
 };
 const r=vm.runInContext('factorySteadyProveRateBounds(m)',c);
 assert.equal(r.upper.output,'7/12');
 assert.match(r.upperReason.output,/nondepleting warehouse/);
});
test('missing recipe ingredient forces machine and output certified upper to exactly zero',()=>{
 const c=env();
 c.m={rateVariables:[{id:'output'}],
  machineEquations:[{machine:'work',cycleVar:'nu',cyclePeriodSeconds:'5',
   inputs:[{item:'A',amountPerCycle:'2',rateTerms:[]}],
   output:{item:'B',amountPerCycle:'1',rateTerms:['output']}}],
  junctionEquations:[],warehouseFlow:{},sharedLines:[]};
 const r=vm.runInContext('factorySteadyProveRateBounds(m)',c);
 assert.equal(r.upper.nu,'0');
 assert.equal(r.upper.output,'0');
 assert.deepEqual([...r.forcedZero].sort(),['nu','output']);
});
test('full AST1 resonance has provable rational upper bound but not absolute exact rate',()=>{
 const c=env();
 const x=vm.runInContext("(()=>{state=ast1Decode(fixture);const eq=factorySteadyBuildEquations();const bounds=factorySteadyProveRateBounds(eq);const linear=factorySteadyAnalyzeEqualities(eq);const relation=linear.pivotRelations.find(x=>x.variable==='cycles:M24');return {eq,bounds,linear,relation};})()",c);
 assert.equal(x.bounds.variables,138);
 assert.equal(x.bounds.completed,true);
 assert.equal(x.bounds.upper['cycles:M101'],'2/15');
 assert.equal(x.bounds.upper['cycles:M24'],'2/15');
 assert.equal(x.bounds.upper['flow:R76:共鸣水晶']!==undefined,true);
 assert.equal(x.linear.freeDegrees,20);
 assert.deepEqual([...x.relation.terms].map(x=>[x.variable,x.coefficient]),[['cycles:M101','1']]);
});

test('AST1 r76 r81 and r82 all have proven sum-of-material rate upper bounds below 1/s',()=>{
 const c=env();
 const r=vm.runInContext("(()=>{state=ast1Decode(fixture);return factorySteadyProveRateBounds(factorySteadyBuildEquations());})()",c);
 const byId=Object.fromEntries([...r.sharedLineUpper].map(line=>[line.route,line]));
 for(const [id,exact] of [['R76','1/2'],['R81','1/4'],['R82','32/45']]){
  assert.equal(byId[id].upperSum,exact);
  assert.equal(byId[id].capacity,'1');
  assert.equal(byId[id].strictlyBelowCapacity,true);
 }
 assert.equal(r.completed,true);
});

test('AST1 rejected global steady solution still publishes proven bounds as separate diagnostics only',()=>{
 const c=env();
 const budget=vm.runInContext('state=ast1Decode(fixture);legacyReferenceWarehouseTheory()',c);
 assert.equal(budget.diagnostics.certified,false);
 assert.equal(budget.inflow['共鸣水晶'],undefined);
 const proof=budget.diagnostics.symbolicModel.provenUpperBounds;
 assert(proof.completed);
 assert.equal(proof.machine.id,'M24');
 assert.equal(proof.machine.cycleUpper,'2/15');
 const byRoute=Object.fromEntries([...proof.mixedLines].map(x=>[x.route,x.upperSum]));
 assert.equal(byRoute.R76,'1/2');
 assert.equal(byRoute.R81,'1/4');
 assert.equal(byRoute.R82,'32/45');
});
