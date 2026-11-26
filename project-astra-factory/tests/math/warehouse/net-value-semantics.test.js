'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ctx,run}=require('../support/production');
function solve(frozen){ctx.frozen=frozen;return JSON.parse(run('state={name:"three net values",machines:[],routes:[],frozenFactories:frozen};JSON.stringify(factoryCertifiedResearchPreview({ms:5000}))'));}
const f=(id,rates)=>({id,name:id,enabled:true,rates});
test('potential retains actual income, relaxes one raw material only; overdraft relaxes every stock',()=>{
 const r=solve([f('source',{'合金板':'1','能量电池':'4'}),f('make',{'合金板':'-2','能量电池':'-2','硅晶圆':'2'})]);
 assert.equal(r.actual.values['duty:make'],'1/2');assert.equal(r.unlimited.values['duty:make'],'1');
 for(const [k,expected] of Object.entries({'合金板':['0','-1','-1'],'能量电池':['3','3','2'],'硅晶圆':['1','1','2']})){
  const x=r.rows[k];assert.deepEqual([x.net,x.potential,x.overdraft],expected,k);
 }
});
test('positive stock slope removes its own gate even when the downstream demand theorem is unavailable',()=>{
 const r=JSON.parse(run(`JSON.stringify(certifiedIndependentPotential({nodes:[{id:'w',type:'仓出',item:'k'},{id:'s',type:'分流'},{id:'m',type:'组装'}],lines:[{id:'r',from:'w',to:'s',materials:['k'],compatible:true,length:2},{id:'b',from:'s',to:'m',materials:['k'],compatible:true,length:2}],frozen:[]},factoryDirectArithmetic(),{'inflow:k':'2','outflow:k':'1/2','net:k':'3/2','localIn:k':'2','localOut:k':'1/2','localNet:k':'3/2'},[]))`));
 assert.equal(r.k.potential,'3/2');assert.equal(r.k.withdrawalDemand,'1/2');assert.equal(r.k.localPotential,'3/2');assert.equal(r.k.method,'positive-stock-gate-inactive');
});
test('zero net does not imply zero potential and negative overdraft can differ from potential',()=>{
 const r=solve([f('source',{'合金板':'1/2','能量电池':'3/4'}),f('make',{'合金板':'-1','能量电池':'-1','硅晶圆':'1'})]);
 assert.deepEqual(['net','potential','overdraft'].map(k=>r.rows['合金板'][k]),['0','-1/4','-1/2']);
 assert.deepEqual(['net','potential','overdraft'].map(k=>r.rows['能量电池'][k]),['1/4','1/4','-1/4']);
});


test('current boundary pressure preserves actual graph and income, with distinct conditional demand counts',()=>{
 const fs=require('node:fs'),path=require('node:path'),{root}=require('../support/production');
 ctx.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const p=JSON.parse(run(`(()=>{state=ast1Decode(ast);const a=factoryDirectArithmetic(),g=factoryCompileDirectGraph(state,null,{countOnly:true}),before=JSON.stringify(state),graph=JSON.stringify(g),p=factoryCertifiedResearchPreview({ms:8000}),actual=JSON.stringify(p.actual.values);
 const d=projectCurrentBoundaryDemand(g,a,p.actual,{}, {ms:3000});return JSON.stringify({unchanged:before===JSON.stringify(state)&&graph===JSON.stringify(g)&&actual===JSON.stringify(p.actual.values),queries:p.actual.researchQueries,overdraft:p.unlimited.researchQueries,rows:p.rows,total:p.total,unknown:p.unknownMetrics,proofs:p.potentialProofs,again:Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v.potential]))})})()`));
 assert(p.unchanged);assert.equal(p.queries.unknown,0);assert.equal(p.overdraft.unknown,0);assert.deepEqual(p.unknown,[]);
 assert.deepEqual(['inflow','outflow','net','withdrawalDemand','potential','overdraft'].map(k=>p.rows['合金板'][k]),['2/3','2/3','0','4/3','-2/3','-2/3']);
 assert.deepEqual(['inflow','outflow','net','withdrawalDemand','potential','overdraft'].map(k=>p.rows['导线线圈'][k]),['2/3','2/3','0','14/15','-4/15','-1/3']);
 assert.equal(p.total.potential,'2/45');
 assert.equal(p.again['合金板'],'-2/3');assert.equal(p.again['导线线圈'],'-4/15');
 assert.deepEqual(p.proofs['合金板'].scarce,{'导线线圈':'2/3'});assert.deepEqual(p.proofs['导线线圈'].scarce,{'合金板':'2/3'});
 const w=p.proofs['合金板'].witnesses.find(w=>w.method==='element-saturated-residual-envelope'&&w.critical);
 assert(w);assert.equal(w.rateUpper,'2/3');assert.equal(w.periodBound,'6');assert(w.unprocessedBound<=w.beltLength+w.cacheSlack);
});

// A user-edited layout can retain machine/route counts yet change its mathematical graph.
// This regression pins independent exact values and necessary bounds, not the number of
// unknowns: additional sound proofs must be allowed to improve the coverage.
test('115-machine slow autonomous source variant is a distinct mathematical graph',()=>{
 const fs=require('node:fs'),path=require('node:path'),{root}=require('../support/production');
 ctx.slowAst=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-slow-miner-v1.txt'),'utf8').trim();
 const r=JSON.parse(run(`(()=>{state=ast1Decode(slowAst);const g=factoryCompileDirectGraph(state),p=factoryCertifiedResearchPreview({ms:12000});return JSON.stringify({machines:g.nodes.length,lines:g.lines.length,source:g.nodes.find(m=>m.id==='M114'),target:g.nodes.find(m=>m.id==='M33'),actual:p.actual.researchQueries,unlimited:p.unlimited.researchQueries,rows:p.rows,cycle:p.values['cycle:M33'],retryable:p.actual.retryable})})()`));
 assert.equal(r.machines,115);assert.equal(r.lines,84);
 assert.equal(r.source.type,'采矿');assert.equal(r.source.recipe.seconds,7.5);
 assert.equal(r.target.recipe.inputs['钛合金锭'],6);
 assert.equal(r.actual.total,628);assert.equal(r.unlimited.total,628);
 assert.deepEqual(['inflow','outflow','net','potential','overdraft'].map(k=>r.rows['钛合金锭'][k]),['4/3','1','1/3','1/3','1/3']);
 assert.equal(r.rows['合金板'].overdraft,'-7/45');
 assert.equal(r.rows['齿轮组'].overdraft,'17/90');
 if(r.cycle!==null){const [n,d='1']=r.cycle.split('/');assert(BigInt(n)*45n<=BigInt(d),'autonomous ingredient throughput upper bound');}
 console.log('SLOW-MINER-COVERAGE',r.actual,r.unlimited);
});
