'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),c=vm.createContext({console});
for(const file of ['steady-flow','steady-maxplus'])
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/engine',file+'.js'),'utf8'),c);
const solve=(nodes,edges)=>{
 c.graph={nodes,edges};
 return vm.runInContext('steadyExactMaxPlusCycleTime(graph.nodes,graph.edges)',c);
};
const q=x=>x===null?null:x.n.toString()+'/'+x.d.toString();
test('single event repeating every 5/2 seconds has exact rate 2/5',()=>{
 const r=solve(['machine'],[{from:'machine',to:'machine',delay:'2.5'}]);
 assert(r.hasCycle);
 assert.equal(q(r.cycleTime),'5/2');
 assert.equal(q(r.eventsPerSecond),'2/5');
});
test('two-stage feedback loop 3+1 seconds has exact critical period (3+1)/2',()=>{
 const r=solve(['a','b'],[{from:'a',to:'b',delay:'3'},{from:'b',to:'a',delay:'1'}]);
 assert.equal(q(r.cycleTime),'2/1');
 assert.equal(q(r.eventsPerSecond),'1/2');
});
test('slowest loop dominates two independently recurring loops',()=>{
 const r=solve(['a','b','c'],[
  {from:'a',to:'a',delay:5},
  {from:'b',to:'c',delay:1},
  {from:'c',to:'b',delay:3}
 ]);
 assert.equal(q(r.cycleTime),'5/1');
 assert.equal(q(r.eventsPerSecond),'1/5');
});
test('acyclic finite event graph has no asymptotic autonomous periodic throughput',()=>{
 const r=solve(['a','b','c'],[
  {from:'a',to:'b',delay:1},{from:'b',to:'c',delay:2}]);
 assert.equal(r.hasCycle,false);
 assert.equal(r.cycleTime,null);
});
test('fractional dependency cycle calculates an exact rational bottleneck period',()=>{
 const r=solve(['a','b','c'],[
  {from:'a',to:'b',delay:'0.2'},
  {from:'b',to:'c',delay:'0.3'},
  {from:'c',to:'a',delay:'0.7'}
 ]);
 assert.equal(q(r.cycleTime),'2/5');
 assert.equal(q(r.eventsPerSecond),'5/2');
});
test('negative delays and invalid endpoints are rejected',()=>{
 assert.throws(()=>solve(['a'],[{from:'a',to:'a',delay:-1}]),/negative/);
 assert.throws(()=>solve(['a'],[{from:'z',to:'a',delay:1}]),/unknown/);
});
