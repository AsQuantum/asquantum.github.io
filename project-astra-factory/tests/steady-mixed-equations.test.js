'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function equations(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(id){return id==='map'?{getContext(){return{}}}:null}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit','core/compact-json',
  'blueprints/ast1-codec','engine/steady-equations']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f+'.js'});
 }
 c.fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 return vm.runInContext('state=ast1Decode(fixture);factorySteadyBuildEquations()',c);
}
test('AST1 mixed belts have per-material rates but only ONE shared 1/s limit each',()=>{
 const e=equations();
 assert.equal(e.sharedLines.length,84);
 for(const [route,items] of [
  ['R76',['框架模块','电动机','共鸣水晶']],
  ['R81',['等离子电池','量子处理器','引力透镜']],
  ['R82',['钛合金锭','曲速线圈']]]){
  const line=e.sharedLines.find(line=>line.route===route);
  assert(line);
  assert.deepEqual([...line.materials].sort(),[...items].sort());
  assert.equal(line.capacityPerSecond,'1');
  assert.equal(line.terms.length,items.length);
  assert.equal(e.sharedLines.filter(x=>x.route===route).length,1);
 }
 assert.equal(e.rateVariables.length,new Set(e.rateVariables.map(x=>x.id)).size);
});
test('a physical merger conserves EACH item through its common mixed output',()=>{
 const e=equations(),merger=e.junctionEquations.find(x=>x.machine==='M42');
 assert(merger);assert.equal(merger.type,'汇流');
 assert.equal(merger.serviceOrder,'physical-input-left-middle-right');
 assert.equal(merger.inputPorts.length,3);
 const cases=[['框架模块','R70'],['电动机','R71'],['共鸣水晶','R72']];
 for(const [item,inRoute] of cases){
  const eq=merger.perMaterial.find(x=>x.item===item);assert(eq);
  assert.deepEqual([...eq.received],['flow:'+inRoute+':'+item]);
  assert.deepEqual([...eq.sent],['flow:R76:'+item]);
 }
});
test('four-input resonance recipe uses true AST1 coefficients, not artificial ratios',()=>{
 const e=equations(),m=e.machineEquations.find(x=>x.machine==='M24');
 assert(m);assert.equal(m.cyclePeriodSeconds,'6');assert.equal(m.maxCyclesPerSecond,'1/6');
 assert.equal(m.output.item,'共鸣水晶');assert.equal(m.output.amountPerCycle,'1');
 const actual=Object.fromEntries(m.inputs.map(i=>[i.item,i.amountPerCycle]));
 assert.deepEqual(actual,{'遐想物质':'1','相位粒子':'1','能量电池':'2','合金板':'2'});
 assert.equal(m.inputs.length,4);
 for(const input of m.inputs)assert.equal(input.rateTerms.length,1);
});
test('shared warehouse materials retain individual inbound/outbound variables without invented flows',()=>{
 const e=equations();
 for(const item of ['框架模块','电动机','共鸣水晶']){
  assert(e.warehouseFlow[item]?.inflow.includes('flow:R76:'+item));
 }
 assert(e.warehouseFlow['钛合金锭'].outflow.includes('flow:R83:钛合金锭'));
 assert.equal('estimated' in e,false);
 assert.equal('rates' in e,false);
});

test('symbolic equations mark per-inlet FIFO and absorbing splitter filter conflicts',()=>{
 const e=equations();
 const splitters=e.junctionEquations.filter(x=>x.type==='分流');
 assert(splitters.length>0);
 for(const sp of splitters){
  assert.equal(sp.perInputFIFO,true);
  assert.equal(sp.filterMismatchRule,'halt-whole-splitter-hold-head-and-cursor');
  assert(Array.isArray(sp.outputFilters));
 }
 const mergers=e.junctionEquations.filter(x=>x.type==='汇流');
 assert(mergers.length>0);
 assert(mergers.every(m=>m.perInputFIFO===false&&m.sharedOutputFIFO===3&&m.filterMismatchRule===null));
});
