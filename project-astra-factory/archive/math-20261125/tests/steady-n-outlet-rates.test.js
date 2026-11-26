'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,
  document:{getElementById(){return {getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit',
  'engine/steady-flow','engine/steady-warehouse-node'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 return c;
}
test('N outlets: actual numeric machine-ID priority, not insertion or supplied order',()=>{
 const c=env();c.outlets=[
  {id:'M210',downstreamDemand:20},
  {id:'M114',downstreamDemand:11},
  {id:'M48',downstreamDemand:60}
 ];
 const x=vm.runInContext(
  "factorySteadyIdealWarehousePriorityRates(80,outlets,{portCapacity:60,rateUnit:'items/minute'})",c);
 assert.deepEqual(Array.from(x.rates,v=>[v.id,v.rate]),[
  ['M48','60'],['M114','11'],['M210','9']
 ]);
 assert.equal(x.stockGrowth,'0');
 assert.equal(x.certifiedInAssumedFluidRegime,true);
 assert.equal(x.certifiedActualDiscreteSimulator,false);
});
test('when demand is less than supply, residual stock grows without forced zero-drift balance',()=>{
 const c=env();c.x=[
  {id:'M50',downstreamDemand:20},{id:'M49',downstreamDemand:20}
 ];
 const x=vm.runInContext(
  "factorySteadyIdealWarehousePriorityRates(50,x,{portCapacity:60,rateUnit:'items/minute'})",c);
 assert.deepEqual(Array.from(x.rates,v=>[v.id,v.rate]),[['M49','20'],['M50','20']]);
 assert.equal(x.stockGrowth,'10');
});
test('any arbitrary N works, including completely blocked first stock-out',()=>{
 const c=env();c.x=Array.from({length:80},(_,i)=>({
  id:'M'+(80-i),downstreamDemand:i===79?0:1
 }));
 const r=vm.runInContext('factorySteadyIdealWarehousePriorityRates(60,x)',c);
 assert.equal(r.rates.length,80);
 assert.equal(r.rates[0].id,'M1');
 assert.equal(r.rates[0].rate,'0');
 assert.equal(r.rates.at(-1).id,'M80');
 assert.equal(r.rates.at(-1).rate,'0');
 assert.equal(r.rates.filter(x=>x.rate==='1').length,60);
 assert.equal(r.stockGrowth,'0');
});
test('reject unknown downstream demand: never infer flow or silently set demand to 0',()=>{
 const c=env();c.x=[{id:'M1',downstreamDemand:'2/3'},{id:'M2'}];
 assert.throws(()=>vm.runInContext('factorySteadyIdealWarehousePriorityRates(1,x)',c),
  /Unsolved downstream demand for M2/);
});
test('warehouse physical priority diagnostics sort arbitrary re-ordered layouts using simulator comparator',()=>{
 const c=env();
 c.layout={machines:[
  {id:'M114',type:'仓出',item:'A'},
  {id:'M48',type:'仓出',item:'A'},
  {id:'M50',type:'仓出',item:'A'}
 ],routes:[
  {id:'ra',from:{id:'M114',port:0},to:null},
  {id:'rb',from:{id:'M48',port:0},to:null},
  {id:'rc',from:{id:'M50',port:0},to:null}
 ]};
 const o=vm.runInContext('factorySteadyWarehousePriorityModel(layout)',c);
 assert.deepEqual(Array.from(o.groups[0].outlets,x=>x.id),['M48','M50','M114']);
 assert.match(o.method,/numeric machine-ID/);
});
