'use strict';
// Rational local identities. These return mathematical rates, NOT measured
// discrete packet throughput. The proportional alternative is intentionally
// separate from the simulator's physical-input round robin.
function steadyExactProportionalOffers(offers,capacity=STEADY_ONE){
 const q=offers.map(steadyExactQ),cap=steadyExactQ(capacity);
 if(steadyExactCmp(cap,STEADY_ZERO)<0||q.some(x=>steadyExactCmp(x,STEADY_ZERO)<0))
  throw Error('negative physical capacity or supply');
 const total=steadyExactSum(q);
 if(steadyExactCmp(total,cap)<=0)return q;
 if(steadyExactCmp(total,STEADY_ZERO)===0)return q;
 return q.map(x=>steadyExactDiv(steadyExactMul(x,cap),total));
}
function steadyExactRoundRobinOffers(offers,capacity=STEADY_ONE){
 return steadyExactWaterfill(steadyExactQ(capacity),offers.map(steadyExactQ));
}
function steadyExactRecipeInputBalance(recipe,available,{sharedPorts=[],outputCapacity=null}={}){
 if(!(recipe?.seconds>0&&recipe?.qty>0)||!recipe.inputs)
  throw Error('invalid recipe');
 const input=Object.entries(recipe.inputs);
 if(!input.length)throw Error('no input ingredients; use generator formula');
 const supplies=Object.fromEntries(input.map(([item,qty])=>{
  if(!(qty>0)||available[item]===undefined)throw Error('missing/invalid input: '+item);
  const value=steadyExactQ(available[item]);
  if(steadyExactCmp(value,STEADY_ZERO)<0)throw Error('negative rate: '+item);
  return [item,value];
 }));
 const limits=[steadyExactDiv(STEADY_ONE,steadyExactQ(recipe.seconds))];
 for(const [item,qty] of input)
  limits.push(steadyExactDiv(supplies[item],steadyExactQ(qty)));
 const seen=new Set();
 for(const group of sharedPorts){
  const items=Array.isArray(group)?group:group.items;
  const maximum=Array.isArray(group)?STEADY_ONE:steadyExactQ(group.capacity);
  if(!items?.length)throw Error('empty shared port');
  let required=STEADY_ZERO;
  for(const item of items){
   const qty=recipe.inputs[item];
   if(!(qty>0)||seen.has(item))throw Error('invalid/overlapping shared-port item: '+item);
   seen.add(item);
   required=steadyExactAdd(required,steadyExactQ(qty));
  }
  limits.push(steadyExactDiv(maximum,required));
 }
 if(outputCapacity!==null)
  limits.push(steadyExactDiv(steadyExactQ(outputCapacity),steadyExactQ(recipe.qty)));
 const cycles=limits.reduce(steadyExactMin);
 const actual={},surplus={};
 for(const [item,qty] of input){
  actual[item]=steadyExactMul(cycles,steadyExactQ(qty));
  surplus[item]=steadyExactSub(supplies[item],actual[item]);
 }
 return {cyclesPerSecond:cycles,actualInput:actual,backpressuredSupply:surplus,
  outputPerSecond:steadyExactMul(cycles,steadyExactQ(recipe.qty)),
  theoreticalUpperBound:true};
}
// For an UNFILTERED mixed-input splitter with k always-ready, equally
// serviced outlets, the product-specific output depends on the input FIFO
// order, not merely material totals. This closed-form periodic certificate
// counts one full residue cycle (lcm of FIFO period and outlet period).
function steadyExactPeriodicMixedSplitter(items,outletCount,inputRate=STEADY_ONE){
 if(!Array.isArray(items)||!items.length||!Number.isInteger(outletCount)||
    outletCount<1||outletCount>100)throw Error('invalid periodic FIFO');
 const rate=steadyExactQ(inputRate);
 if(steadyExactCmp(rate,STEADY_ZERO)<0||steadyExactCmp(rate,STEADY_ONE)>0)
  throw Error('invalid mixed input rate');
 const lcm=(a,b)=>{
  let x=a,y=b;while(y){const t=x%y;x=y;y=t;}
  return a/x*b;
 };
 const period=lcm(items.length,outletCount);
 const output=Array.from({length:outletCount},()=>new Map());
 for(let i=0;i<period;i++){
  const port=i%outletCount,item=items[i%items.length];
  if(typeof item!=='string'||!item)throw Error('invalid item');
  output[port].set(item,(output[port].get(item)||0)+1);
 }
 return {period,outlets:output.map(map=>Object.fromEntries([...map].map(([item,n])=>[
  item,steadyExactMul(rate,steadyExactFraction(BigInt(n),BigInt(period)))]))),
  assumptions:'periodic FIFO, all outlets ready, no filters; exact residue counts, not time simulation'};
}

// Exact proof certificate for a SINGLE immutable periodic FIFO input stream,
// feeding a recipe machine with finite per-material input buffers.
// No packet stepping, time simulation, LP, or inferred material order.
function steadyExactPeriodicFifoDeadlock(recipe,pattern,{buffers=null,initiallyEmpty=true}={}){
 if(!recipe||!recipe.inputs||!Array.isArray(pattern)||!pattern.length)
  throw Error('recipe and nonempty periodic FIFO are required');
 const entries=Object.entries(recipe.inputs);
 if(entries.length<2||entries.some(([k,n])=>!Number.isSafeInteger(n)||n<=0))
  throw Error('requires at least two positive integer recipe inputs');
 const ingredients=Object.fromEntries(entries);
 const caps=Object.fromEntries(entries.map(([item,qty])=>{
  const cap=buffers?buffers[item]:3*qty; // exact simulator inputCap formula
  if(!Number.isSafeInteger(cap)||cap<qty)throw Error('invalid bounded input buffer: '+item);
  return [item,BigInt(cap)];
 }));
 // Even the CORRECT mean ratio can deadlock if an initially empty machine
 // sees more consecutive items of one material than its finite cache can
 // store, before any required complementary material arrives. Once the
 // blocking item reaches the FIFO head, no later complementary item can pass.
 if(initiallyEmpty&&Object.hasOwn(caps,pattern[0])){
  const first=pattern[0];
  let leading=0;
  while(leading<pattern.length&&pattern[leading]===first)leading++;
  if(BigInt(leading)>caps[first])return {
   guaranteedDeadlock:true,stationaryThroughput:'0',
   reason:'initial immutable FIFO prefix exceeds one ingredient buffer before complementary material arrives',
   certificate:{blockingItem:first,leadingCount:leading,capacity:caps[first].toString(),
    proof:'no recipe can run before other required ingredients arrive; the FIFO head is blocked by the '+(caps[first]+1n).toString()+'th item'},
   assumptions:'initially empty machine, one immutable FIFO, no bypass, no alternate input'};
 }
 const counts=Object.fromEntries(entries.map(([item])=>[item,0n]));
 for(const item of pattern){
  if(typeof item!=='string'||!item)throw Error('invalid FIFO item');
  if(!Object.hasOwn(counts,item)){
   return {guaranteedDeadlock:true,stationaryThroughput:'0',
    reason:'item not accepted by recipe; FIFO head blocks the only supply path',
    blockingItem:item,assumptions:'only one immutable FIFO inlet, no bypass, no other sources'};
  }
  counts[item]++;
 }
 for(let a=0;a<entries.length;a++){
  for(let b=a+1;b<entries.length;b++){
   const [i,qi]=entries[a],[j,qj]=entries[b];
   const ai=BigInt(qi),aj=BigInt(qj);
   // I = ai * buffered_j - aj * buffered_i is INVARIANT
   // whenever the machine consumes one recipe cycle.
   // Each complete incoming FIFO period changes I by Δ.
   const delta=ai*counts[j]-aj*counts[i];
   if(delta===0n)continue;
   // The two buffers enforce -aj*cap_i <= I <= ai*cap_j.
   // Therefore infinitely many complete periods cannot enter when Δ != 0.
   const low=-aj*caps[i],high=ai*caps[j];
   return {guaranteedDeadlock:true,stationaryThroughput:'0',
    reason:'immutable periodic FIFO ratio incompatible with recipe stoichiometry and finite buffers',
    certificate:{
     pair:[i,j],recipeRatio:[qi,qj],patternCounts:[Number(counts[i]),Number(counts[j])],
     invariant:'I='+qi+'*buffer['+j+']-'+qj+'*buffer['+i+']',
     driftPerPeriod:delta.toString(),minimumInvariant:low.toString(),
     maximumInvariant:high.toString(),
     proof:'recipe executions preserve I; every FIFO period changes I by nonzero drift; bounded buffers prohibit infinitely many accepted periods'} ,
    assumptions:'one immutable periodic FIFO, finite per-material buffers, no bypass, no alternative material inputs, no changes to the source composition'};
  }
 }
 const prefix=steadyExactPeriodicFifoPrefixCertificate(recipe,pattern,{buffers,initiallyEmpty});
 if(prefix.guaranteedDeadlock===true)return prefix;
 return {guaranteedDeadlock:false,stationaryThroughput:null,
  reason:prefix.prefixFeasibleUnderInstantaneousConsumption===true?
   'all prefix storage constraints pass in the ideal instantaneous-input model; machine time/output blocking not certified':
   'FIFO prefix occupancy not evaluated for unknown initial buffers or resource guard',
  prefixCertificate:prefix,
  assumptions:'one immutable periodic FIFO, finite per-material buffers, no bypass'};
}


// EXACT combinatorial FIFO-prefix criterion (no time steps, no rate fitting).
//
// Assumptions are deliberately narrow: an immutable periodic item word enters
// ONE recipe inlet, initially empty; the recipe has separate finite buffers,
// there is no bypass and no other ingredient supplier. To find whether the
// word can pass the input buffers, suppose a machine can start complete
// recipes IMMEDIATELY and its output never blocks. This is the most favorable
// possible schedule. If even it overfills a buffer, the real machine must
// eventually block permanently at that FIFO head. If it never overfills,
// only input-buffer ORDER compatibility is proved, not real throughput.
//
// Let N_i(p) be number of incoming items i in a prefix p; let a_i be the
// batch requirement. The maximum possible batches started by prefix p is
// C(p) = min_i floor(N_i(p)/a_i).
// Consequently every possible scheduling has >= N_i(p)-a_i*C(p)
// leftover items i. If this exceeds input cap_i at ANY prefix, the immutable
// FIFO cannot pass that prefix. This test uses integer prefix counts only.
//
// For a periodic word w with stoichiometrically matching total counts, the
// first K copies suffice: K = lcm_i(a_i/gcd(a_i,count_i(w))). After K copies
// all residue counts return to zero. Repeating periods cannot change the
// counterexample/safe prefix result. This is NOT 0.05-second simulation.
function steadyExactPeriodicFifoPrefixCertificate(recipe,pattern,{
 buffers=null,initiallyEmpty=true,maxPrefixChecks=250000
}={}){
 if(!recipe?.inputs||!Array.isArray(pattern)||!pattern.length)
  throw Error('recipe inputs and nonempty material pattern required');
 const entries=Object.entries(recipe.inputs);
 if(entries.length<2||entries.some(([name,qty])=>
   !name||!Number.isSafeInteger(qty)||qty<=0))
  throw Error('at least two positive integer input requirements are required');
 if(!Number.isSafeInteger(maxPrefixChecks)||maxPrefixChecks<1)
  throw Error('maxPrefixChecks must be a positive safe integer');
 const amounts=Object.fromEntries(entries.map(([name,qty])=>[name,BigInt(qty)]));
 const cap=Object.fromEntries(entries.map(([name,qty])=>{
  const v=buffers?buffers[name]:3*qty;
  if(!Number.isSafeInteger(v)||v<qty)throw Error('invalid input buffer capacity for '+name);
  return [name,BigInt(v)];
 }));
 const counts=Object.fromEntries(entries.map(([name])=>[name,0n]));
 for(const item of pattern){
  if(!Object.hasOwn(counts,item))
   return {guaranteedDeadlock:true,stationaryThroughput:'0',
    prefixFeasibleUnderInstantaneousConsumption:false,
    reason:'immutable FIFO contains an item not accepted by the sole recipe inlet',
    certificate:{blockingItem:item},
    assumptions:'single immutable FIFO, initially empty, no bypass or alternate inlet'};
  counts[item]++;
 }
 const first=entries[0][0];
 const ratioCompatible=entries.every(([name])=>
  counts[name]*amounts[first]===counts[first]*amounts[name]);
 const gcd=(a,b)=>{while(b){const t=a%b;a=b;b=t;}return a;};
 const lcm=(a,b)=>a/gcd(a,b)*b;
 const materialGcd=entries.reduce((g,[name])=>gcd(g,counts[name]),0n);
 const reducedRatio=Object.fromEntries(entries.map(([name])=>
  [name,counts[name]/(materialGcd||1n)+'']));
 const recipeGcd=entries.reduce((g,[name])=>gcd(g,amounts[name]),0n);
 const reducedRecipe=Object.fromEntries(entries.map(([name])=>
  [name,amounts[name]/(recipeGcd||1n)+'']));
 const summary={
  ratioCompatible,reducedPatternRatio:reducedRatio,reducedRecipeRatio:reducedRecipe,
  inputBufferCaps:Object.fromEntries(entries.map(([name])=>[name,cap[name]+''])),
  inputWordLength:pattern.length,
  assumptions:'initially empty single immutable FIFO; no bypass/other inputs; ideal instantaneous batch starts and unblocked output; no machine timing claim'
 };
 if(!ratioCompatible)return {...summary,guaranteedDeadlock:null,
  stationaryThroughput:null,prefixFeasibleUnderInstantaneousConsumption:null,
  reason:'pattern ratios mismatch recipe: use the independent bounded-buffer invariant to prove eventual deadlock'};
 if(!initiallyEmpty)return {...summary,guaranteedDeadlock:null,
  stationaryThroughput:null,prefixFeasibleUnderInstantaneousConsumption:null,
  reason:'unknown initial input buffers: cannot certify prefix occupancy from the empty-state formula'};
 const periodCopies=entries.reduce((v,[name])=>
  lcm(v,amounts[name]/gcd(amounts[name],counts[name])),1n);
 const checks=periodCopies*BigInt(pattern.length);
 if(checks>BigInt(maxPrefixChecks))return {...summary,guaranteedDeadlock:null,
  stationaryThroughput:null,prefixFeasibleUnderInstantaneousConsumption:null,
  primitiveBalancedWordCopies:periodCopies+'',requiredPrefixChecks:checks+'',
  reason:'symbolic residue expansion exceeds the explicit certificate resource limit'};
 const arrived=Object.fromEntries(entries.map(([name])=>[name,0n]));
 const peaks=Object.fromEntries(entries.map(([name])=>[name,0n]));
 let firstViolation=null,checkCount=0;
 for(let repetition=0;repetition<Number(periodCopies);repetition++){
  for(let offset=0;offset<pattern.length;offset++){
   const item=pattern[offset];
   arrived[item]++;
   let maxStarts=null;
   for(const [name] of entries){
    const possible=arrived[name]/amounts[name];
    if(maxStarts===null||possible<maxStarts)maxStarts=possible;
   }
   for(const [name] of entries){
    const residual=arrived[name]-maxStarts*amounts[name];
    if(residual>peaks[name])peaks[name]=residual;
    if(!firstViolation&&residual>cap[name]){
     firstViolation={
      material:name,periodIndex:repetition,offsetWithinPeriod:offset,
      prefixItems:(BigInt(repetition)*BigInt(pattern.length)+BigInt(offset+1))+'',
      arrived:Object.fromEntries(entries.map(([k])=>[k,arrived[k]+''])),
      maximumPossibleBatchStarts:maxStarts+'',
      minimumUnconsumed:residual+'',inputCapacity:cap[name]+''
     };
    }
   }
   checkCount++;
  }
 }
 // After this many pattern copies, stoichiometry resets all residuals.
 const q=Object.fromEntries(entries.map(([name])=>
  [name,arrived[name]-(arrived[first]/amounts[first])*amounts[name]]));
 if(Object.values(q).some(v=>v!==0n))throw Error('primitive ratio period does not balance');
 const certificate={...summary,primitiveBalancedWordCopies:periodCopies+'',
  checkedPrefixCount:checkCount,
  exactMinimumBuffersIfInstantaneous:Object.fromEntries(entries.map(([name])=>[name,peaks[name]+''])),
  firstViolation,
  proof:'for each input prefix p, at most C(p)=min_i floor(N_i(p)/a_i) complete batches can start; every input buffer i requires N_i(p)-a_i*C(p)<=cap_i; one balanced primitive word suffices because residual counts reset'};
 if(firstViolation)return {...certificate,guaranteedDeadlock:true,
  stationaryThroughput:'0',prefixFeasibleUnderInstantaneousConsumption:false,
  reason:'a later prefix needs more input storage than physically exists, even with instantaneous processing'};
 return {...certificate,guaranteedDeadlock:false,stationaryThroughput:null,
  prefixFeasibleUnderInstantaneousConsumption:true,
  reason:'all periodic FIFO prefixes fit the input buffers under ideal instantaneous processing; actual rate still depends on processing time and output backpressure'};
}
