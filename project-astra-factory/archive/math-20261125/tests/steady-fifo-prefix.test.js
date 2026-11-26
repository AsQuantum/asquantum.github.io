'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const c=vm.createContext({console});
for(const f of ['steady-flow','steady-local-rates'])
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/engine',f+'.js'),'utf8'),c);
function check(pattern,inputs={A:1,B:1},options={}){
 c.pattern=pattern;c.recipe={seconds:1,qty:1,inputs};c.options=options;
 return vm.runInContext('steadyExactPeriodicFifoPrefixCertificate(recipe,pattern,options)',c);
}
test('1:1 reduced ratio does NOT force ABAB; both ABAB and AABB have feasible FIFO prefixes',()=>{
 const alt=check(['A','B','A','B']),paired=check(['A','A','B','B']);
 assert.equal(alt.ratioCompatible,true);
 assert.equal(alt.prefixFeasibleUnderInstantaneousConsumption,true);
 assert.equal(paired.prefixFeasibleUnderInstantaneousConsumption,true);
 assert.equal(alt.stationaryThroughput,null,'prefix safety is never advertised as a real throughput proof');
 assert.equal(paired.stationaryThroughput,null);
 assert.deepEqual({...alt.reducedPatternRatio},{A:'1',B:'1'});
 assert.deepEqual({...paired.reducedPatternRatio},{A:'1',B:'1'});
 assert.deepEqual({...alt.exactMinimumBuffersIfInstantaneous},{A:'1',B:'0'});
 assert.deepEqual({...paired.exactMinimumBuffersIfInstantaneous},{A:'2',B:'0'});
});
test('AA AABBBB and AB AAAAABBBBB are 1:1 but force deadlock at different FIFO prefixes',()=>{
 const first=check(['A','A','A','A','B','B','B','B']);
 assert.equal(first.guaranteedDeadlock,true);
 assert.equal(first.firstViolation.minimumUnconsumed,'4');
 assert.equal(first.firstViolation.inputCapacity,'3');
 const later=check(['A','B','A','A','A','A','A','B','B','B','B','B']);
 assert.equal(later.ratioCompatible,true);
 assert.deepEqual({...later.reducedPatternRatio},{A:'1',B:'1'});
 assert.equal(later.guaranteedDeadlock,true);
 assert.equal(later.firstViolation.material,'A');
 assert(later.firstViolation.offsetWithinPeriod>=2,'must detect a non-leading overfull prefix');
 assert.equal(later.stationaryThroughput,'0');
});
test('existing deadlock prover is strengthened to detect an INTERNAL prefix obstruction',()=>{
 c.recipe={seconds:3,qty:1,inputs:{A:1,B:1}};
 c.pattern=['A','B','A','A','A','A','A','B','B','B','B','B'];
 const p=vm.runInContext('steadyExactPeriodicFifoDeadlock(recipe,pattern)',c);
 assert.equal(p.guaranteedDeadlock,true);
 assert.equal(p.firstViolation.material,'A');
 assert.match(p.reason,/later prefix/);
});
test('ratio 2A:2B with repeating AB is checked over two minimal primitive periods',()=>{
 const p=check(['A','B'],{A:2,B:2});
 assert.equal(p.ratioCompatible,true);
 assert.equal(p.primitiveBalancedWordCopies,'2');
 assert.equal(p.checkedPrefixCount,4);
 assert.equal(p.prefixFeasibleUnderInstantaneousConsumption,true);
 assert.deepEqual({...p.exactMinimumBuffersIfInstantaneous},{A:'2',B:'1'});
});
test('a three-input recipe uses all ingredients for necessary FIFO occupancy certificate',()=>{
 const good=check(['A','B','C'],{A:1,B:1,C:1});
 assert.equal(good.prefixFeasibleUnderInstantaneousConsumption,true);
 const bad=check(['A','A','A','A','B','B','B','B','C','C','C','C'],
  {A:1,B:1,C:1});
 assert.equal(bad.ratioCompatible,true);
 assert.equal(bad.guaranteedDeadlock,true);
 assert.equal(bad.firstViolation.material,'A');
});
test('unknown initial buffers and large primitive residue are correctly inconclusive',()=>{
 const p=check(['A','B','A','A','A','A','A','B','B','B','B','B'],{A:1,B:1},
  {initiallyEmpty:false});
 assert.equal(p.guaranteedDeadlock,null);
 assert.equal(p.prefixFeasibleUnderInstantaneousConsumption,null);
 const limit=check(['A','B'],{A:2,B:2},{maxPrefixChecks:3});
 assert.equal(limit.guaranteedDeadlock,null);
 assert.equal(limit.requiredPrefixChecks,'4');
});
test('exhaustive matching 1:1 words up to length 10 agree with independent zero-time greedy FIFO occupancy',()=>{
 for(const len of [2,4,6,8,10]){
  for(let mask=0;mask<(1<<len);mask++){
   if(mask.toString(2).replace(/0/g,'').length!==len/2)continue;
   const word=Array.from({length:len},(_,i)=>(mask&(1<<i))?'A':'B');
   const actual=check(word);
   const counts={A:0,B:0},peaks={A:0,B:0};
   for(const item of word){
    counts[item]++;
    const batches=Math.min(counts.A,counts.B);
    for(const k of ['A','B'])peaks[k]=Math.max(peaks[k],counts[k]-batches);
   }
   const safe=Math.max(peaks.A,peaks.B)<=3;
   assert.equal(actual.guaranteedDeadlock,!safe,word.join(''));
   assert.equal(Number(actual.exactMinimumBuffersIfInstantaneous.A),peaks.A);
   assert.equal(Number(actual.exactMinimumBuffersIfInstantaneous.B),peaks.B);
  }
 }
});
