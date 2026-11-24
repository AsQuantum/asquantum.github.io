'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,
  document:{getElementById(){return{getContext(){return{}}}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit',
  'engine/steady-flow','engine/steady-equations','engine/steady-feedforward-islands',
  'core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 return c;
}
test('AST1 contains seven structurally independent source→warehouse chains with exact rational UPPER bounds',()=>{
 const c=env(),x=vm.runInContext('state=ast1Decode(ast);factorySteadyIsolatedDepositChains()',c);
 assert.equal(x.qualifyingCount,7);
 const entries=Array.from(x.chains,k=>({path:Array.from(k.machineSequence).join('->'),
  item:k.item,rate:k.outputRateUpper,upper:k.certifiedUpper,actual:k.certifiedActualRate}));
 assert.deepEqual(entries.map(x=>x.path).sort(),[
  'M0->M13->M21','M1->M15->M16','M25->M28',
  'M26->M29','M4->M20','M52->M53->M17','M89->M90->M18'
 ].sort());
 const byPath=Object.fromEntries(entries.map(x=>[x.path,x]));
 for(const name of ['M1->M15->M16','M52->M53->M17','M89->M90->M18']){
  assert.equal(byPath[name].rate,'2/9');
  assert.equal(byPath[name].item,'合金板');
 }
 for(const name of ['M25->M28','M26->M29']){
  assert.equal(byPath[name].rate,'1/3');
  assert.equal(byPath[name].item,'钛合金锭');
 }
 assert.equal(byPath['M0->M13->M21'].rate,'1/3');
 assert.equal(byPath['M0->M13->M21'].item,'能量电池');
 assert.equal(byPath['M4->M20'].rate,'1/5');
 assert.equal(byPath['M4->M20'].item,'燃料罐');
 assert(entries.every(x=>x.upper===true&&x.actual===false),
  'Never misrepresent serial upper bound as actual established throughput');
});
test('adding another branch from a serial machine rejects it from the independent-chain certificate',()=>{
 const c=env();
 const x=vm.runInContext("(()=>{state=ast1Decode(ast);"+
  "const r=state.routes.find(x=>x.from.id==='M1');"+
  "state.routes.push({...r,id:'R999'});return factorySteadyIsolatedDepositChains()})()",c);
 assert(!x.chains.some(k=>Array.from(k.machineSequence).includes('M1')));
});
test('the isolated chain upper bound changes exactly with a supplied recipe time (no time simulation)',()=>{
 const c=env();
 const before=vm.runInContext("(()=>{state=ast1Decode(ast);return factorySteadyIsolatedDepositChains().chains.find(k=>k.source==='M25').outputRateUpper})()",c);
 assert.equal(before,'1/3');
 const after=vm.runInContext("(()=>{const m=state.machines.find(m=>m.id==='M28');"+
  "DEF[m.type].recipes[m.mode||'标准'].seconds=12;"+
  "return factorySteadyIsolatedDepositChains().chains.find(k=>k.source==='M25').outputRateUpper})()",c);
 assert.equal(after,'1/12');
});

test('HTML warehouse mathematical diagnostics render seven rational upper bounds, never actual rates',()=>{
 const c=env();
 c.esc=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;');
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/ui/warehouse.js'),'utf8'),c);
 c.budget=vm.runInContext('state=ast1Decode(ast);legacyReferenceWarehouseTheory()',c);
 assert.equal(c.budget.diagnostics.certified,false);
 const html=vm.runInContext('warehouseSerialIslandMarkup(budget)',c);
 assert(html.includes('独立生产链'));
 assert(html.includes('不是实际速率'));
 assert(html.includes('2/9'));
 assert(html.includes('1/3'));
 assert(html.includes('1/5'));
 assert.equal((html.match(/<tr>/g)||[]).length,10);
 assert(html.includes('1/4'));
 assert(html.includes('M27 + M5'));
});

test('rate-only DAG solver includes two genuine AST1 multi-ingredient silica producers without new machine states',()=>{
 const c=env(),r=vm.runInContext('state=ast1Decode(ast);factorySteadyIsolatedDepositTrees()',c);
 assert.equal(r.networkCount,9);
 const multi=r.networks.filter(x=>x.hasMultipleIngredients);
 assert.equal(multi.length,2);
 assert.deepEqual(Array.from(multi,x=>x.label).sort(),[
  '(M27 + M5) → M30','(M97 + M98) → M96'
 ].sort());
 assert(multi.every(x=>x.item==='硅晶圆'&&x.fluidModelRate==='1/4'));
 assert(multi.every(x=>x.certifiedFluidModelRate&&x.certifiedUpper&&!x.certifiedActualRate));
 assert.equal(r.globalPhysicalRatesCertified,false);
});
