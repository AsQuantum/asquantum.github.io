'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'..');
const c=vm.createContext({console});
vm.runInContext(fs.readFileSync(path.join(dir,'scripts/engine/steady-flow.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(dir,'scripts/engine/steady-local-rates.js'),'utf8'),c);
const run=(expr,data={})=>{c.data=data;return vm.runInContext(expr,c)};
const string=q=>q.n.toString()+'/'+q.d.toString();
test('0.3+0.4+0.5 exceeds ONE shared belt; RR and proportional models differ',()=>{
 const result=run("({rr:steadyExactRoundRobinOffers(data).map(steadyExactText),proportional:steadyExactProportionalOffers(data).map(steadyExactText)})",[.3,.4,.5]);
 assert.deepEqual([...result.rr],['3/10','7/20','7/20']);
 assert.deepEqual([...result.proportional],['1/4','1/3','5/12']);
});
test('0.3:0.6:0.9 input offers: user proportional 1:2:3 vs current per-port RR',()=>{
 const actual=run("({rr:steadyExactRoundRobinOffers(data).map(steadyExactText),proportional:steadyExactProportionalOffers(data).map(steadyExactText),offers:steadyExactSum(data.map(steadyExactQ))})",[.3,.6,.9]);
 assert.deepEqual([...actual.rr],['3/10','7/20','7/20']);
 assert.deepEqual([...actual.proportional],['1/6','1/3','1/2']);
 assert.equal(string(actual.offers),'9/5');
});
test('if merged offers fit within shared line capacity, all rates pass untouched',()=>{
 const actual=run('steadyExactRoundRobinOffers(data).map(steadyExactText)',[.1,.2,.3]);
 assert.deepEqual([...actual],['1/10','1/5','3/10']);
});
test('3A+2B per five seconds: excess A is backpressured, not forced to zero',()=>{
 const recipe={seconds:5,qty:1,inputs:{A:3,B:2}},offers={A:.9,B:.4};
 const r=run('steadyExactRecipeInputBalance(data.recipe,data.offers)',{recipe,offers});
 assert.equal(string(r.cyclesPerSecond),'1/5');
 assert.equal(string(r.actualInput.A),'3/5');
 assert.equal(string(r.actualInput.B),'2/5');
 assert.equal(string(r.backpressuredSupply.A),'3/10');
 assert.equal(string(r.backpressuredSupply.B),'0/1');
});
test('scarce A: B throughput falls from 0.4 offered to 0.2 received, never zero',()=>{
 const result=run('steadyExactRecipeInputBalance(data.recipe,data.offers)',{
  recipe:{seconds:5,qty:1,inputs:{A:3,B:2}},
  offers:{A:.3,B:.4}});
 assert.equal(string(result.cyclesPerSecond),'1/10');
 assert.equal(string(result.actualInput.A),'3/10');
 assert.equal(string(result.actualInput.B),'1/5');
});
test('same mixed belt carrying A and B forces exact 3:2 input shares at capacity one',()=>{
 const result=run("steadyExactRecipeInputBalance(data.recipe,data.offers,{sharedPorts:[['A','B']]})",{
  recipe:{seconds:1,qty:1,inputs:{A:3,B:2}},
  offers:{A:1,B:1}});
 assert.equal(string(result.cyclesPerSecond),'1/5');
 assert.equal(string(result.actualInput.A),'3/5');
 assert.equal(string(result.actualInput.B),'2/5');
});
test('same material averages, different periodic FIFO orders can send different products to each splitter outlet',()=>{
 const one=run('steadyExactPeriodicMixedSplitter(data,2)',['A','B']);
 const two=run('steadyExactPeriodicMixedSplitter(data,2)',['A','A','B','B']);
 const normalize=r=>[...r.outlets].map(o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,string(v)])));
 assert.deepEqual(normalize(one),[{A:'1/2'},{B:'1/2'}]);
 assert.deepEqual(normalize(two),[{A:'1/4',B:'1/4'},{A:'1/4',B:'1/4'}]);
});

test('single immutable mixed FIFO A:B=1:7 provably deadlocks 1A+2B recipe with bounded input caches',()=>{
 const proof=run("steadyExactPeriodicFifoDeadlock(data.recipe,data.pattern)",{
  recipe:{seconds:5,qty:1,inputs:{A:1,B:2}},
  pattern:['A','B','B','B','B','B','B','B']});
 assert.equal(proof.guaranteedDeadlock,true);
 assert.equal(proof.stationaryThroughput,'0');
 assert.deepEqual([...proof.certificate.pair],['A','B']);
 assert.equal(proof.certificate.invariant,'I=1*buffer[B]-2*buffer[A]');
 assert.equal(proof.certificate.driftPerPeriod,'5');
 assert.equal(proof.certificate.minimumInvariant,'-6');
 assert.equal(proof.certificate.maximumInvariant,'6');
 assert.deepEqual([...proof.certificate.patternCounts],[1,7]);
});
test('independent A/B belts do not satisfy FIFO-deadlock assumptions and retain nonzero backpressure solution',()=>{
 const machine={seconds:5,qty:1,inputs:{A:1,B:2}};
 const r=run("steadyExactRecipeInputBalance(data.recipe,data.offers)",{
  recipe:machine,offers:{A:1/8,B:7/8}});
 assert.equal(string(r.cyclesPerSecond),'1/8');
 assert.equal(string(r.actualInput.A),'1/8');
 assert.equal(string(r.actualInput.B),'1/4');
 assert.equal(string(r.backpressuredSupply.B),'5/8');
});
test('periodic FIFO matching recipe proportion is NOT automatically certified as live',()=>{
 const proof=run("steadyExactPeriodicFifoDeadlock(data.recipe,data.pattern)",{
  recipe:{seconds:5,qty:1,inputs:{A:1,B:2}},pattern:['A','B','B']});
 assert.equal(proof.guaranteedDeadlock,false);
 assert.equal(proof.stationaryThroughput,null);
});
test('even 3:2 machine/offer imbalance causes provable FIFO deadlock on single immutable mixed inlet',()=>{
 const proof=run("steadyExactPeriodicFifoDeadlock(data.recipe,data.pattern)",{
  recipe:{seconds:5,qty:1,inputs:{A:3,B:2}},
  pattern:['A','B','B','B','B','B','B','B']});
 assert.equal(proof.guaranteedDeadlock,true);
 assert.equal(proof.certificate.driftPerPeriod,'19');
 assert.equal(proof.certificate.maximumInvariant,'18');
 assert.equal(proof.certificate.minimumInvariant,'-18');
});
test('a third unaccepted material on one immutable FIFO inlet is an absorbing head-of-line obstruction',()=>{
 const proof=run("steadyExactPeriodicFifoDeadlock(data.recipe,data.pattern)",{
  recipe:{seconds:5,qty:1,inputs:{A:1,B:2}},pattern:['A','B','C','B']});
 assert.equal(proof.guaranteedDeadlock,true);
 assert.equal(proof.blockingItem,'C');
});

test('even 1A:2B average ratio can deadlock if first 4 A arrive before any B (capacity 3A)',()=>{
 const proof=run("steadyExactPeriodicFifoDeadlock(data.recipe,data.pattern)",{
  recipe:{seconds:5,qty:1,inputs:{A:1,B:2}},
  pattern:['A','A','A','A','B','B','B','B','B','B','B','B']});
 assert.equal(proof.guaranteedDeadlock,true);
 assert.equal(proof.stationaryThroughput,'0');
 assert.equal(proof.certificate.blockingItem,'A');
 assert.equal(proof.certificate.leadingCount,4);
 assert.equal(proof.certificate.capacity,'3');
});
test('prefix deadlock proof assumes initially empty machine; a preloaded buffer is not silently inferred',()=>{
 const proof=run("steadyExactPeriodicFifoDeadlock(data.recipe,data.pattern,{initiallyEmpty:false})",{
  recipe:{seconds:5,qty:1,inputs:{A:1,B:2}},
  pattern:['A','A','A','A','B','B','B','B','B','B','B','B']});
 assert.equal(proof.guaranteedDeadlock,false);
 assert.equal(proof.stationaryThroughput,null);
});
