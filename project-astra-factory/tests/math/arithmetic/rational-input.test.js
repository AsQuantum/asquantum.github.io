'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {run,arith}=require('../support/production');
const {q,txt,add,sub,mul,div,cmp}=arith;
test('literal decimal, scientific notation and fractions are reduced exactly',()=>{
 for(const [input,expected] of [['0.1','1/10'],['-12.345','-2469/200'],['.5','1/2'],['+2.','2'],['1e-3','1/1000'],['6/8','3/4'],['-2/-4','1/2'],['0.30000000000000004','7500000000000001/25000000000000000'],['9007199254740993','9007199254740993']])assert.equal(txt(q(input)),expected,input);
 assert.equal(txt(add(q('0.1'),q('0.2'))),'3/10');
 assert.equal(txt(sub(q('0.3'),add(q('0.1'),q('0.2')))),'0');
 assert.equal(txt(mul(q('3/7'),q('14/9'))),'2/3');
 assert.equal(txt(div(q('0.1'),q('60'))),'1/600');
 assert.equal(cmp(q('1e-100'),q('0')),1);
 assert.equal(txt(q({n:4n,d:2n})),'2');
 for(const input of ['NaN','Infinity','1/0','1e9999','1.2.3',9007199254740992])assert.throws(()=>q(input));
});
test('normalization never uses rounded numeric magnitude or zero checks',()=>{
 const normalize=rates=>JSON.parse(run('JSON.stringify(normalizeFrozenFactories([{id:"f",rates:'+JSON.stringify(rates)+'}])[0].rates)'));
 assert.deepEqual(normalize({'合金板':'0.10','废金属':'-2/4','硅晶圆':'-0','能量电池':'1e-100'}),{'合金板':'1/10','废金属':'-1/2','能量电池':'1/'+'1'+'0'.repeat(100)});
 assert.equal(normalize({'合金板':'1000000000'})['合金板'],'1000000000');
 assert.throws(()=>normalize({'合金板':'1000000000.0000000001'}),/流速无效/);
 assert.throws(()=>normalize({'合金板':'1/0'}),/流速无效/);
 assert.deepEqual(normalize(normalize({'合金板':'0.00125'})),{'合金板':'1/800'});
});
test('all strict ledger and machine quantities keep rational storage alongside display',()=>{
 const b=JSON.parse(run(`JSON.stringify(certifiedDisplayBudget({actual:{status:'proved'},completeHtmlQueries:true,values:{'inflow:合金板':'1/3','outflow:合金板':'1/7','net:合金板':'4/21','machineTotal:M0|out':'1/3','machineMaterial:M0|out|合金板':'1/3','routeTotal:R0':'1/3','flow:R0|合金板':'1/3'},rows:{'合金板':{inflow:'1/3',outflow:'1/7',net:'4/21',potential:'-2/7',overdraft:'-1/5',withdrawalDemand:'13/21'}},total:{net:'4/21',potential:'-2/7',overdraft:'-1/5'},machineTimes:{M0:'3'}},{machines:[],routes:[]}))`));
 assert.equal(b.fractions.net['合金板'],'4/21');assert.equal(b.fractions.potentialNet['合金板'],'-2/7');assert.equal(b.fractions.overdraftNet['合金板'],'-1/5');assert.equal(b.fractions.totals.net,'4/21');assert.equal(b.fractions.machineTotals.M0.out,'1/3');assert.equal(b.fractions.machineMaterials.M0.out['合金板'],'1/3');assert.equal(b.fractions.machineTimes.M0,'3');
});
