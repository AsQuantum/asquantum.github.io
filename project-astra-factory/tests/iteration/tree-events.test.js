'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{environment,fixture}=require('./support/environment');
const build=`function buildTree(qs,ts,as,ls){
 const ms=qs.map((qty,i)=>({id:'m'+i,type:'加工',recipe:{qty,seconds:ts[i]/20,output:'k'+i,inputs:Object.fromEntries(as[i].map(([j,a])=>['k'+j,a]))},outPorts:[{index:0}],inputPriority:as[i].map((_,p)=>p)}));
 const sink={id:'sink',type:'仓入',outPorts:[],inputPriority:[0]};
 const routes=[];for(let i=0;i<ms.length;i++){const parent=as.findIndex(xs=>xs.some(([j])=>j===i)),p=parent<0?0:as[parent].findIndex(([j])=>j===i);routes.push({id:'r'+i,from:'m'+i,fromPort:0,to:parent<0?'sink':'m'+parent,toPort:p,length:ls[i],accepted:['k'+i]})}
 return {initial:'empty',machines:[...ms,sink],routes,priority:[],frozen:[]};
}`;
test('ordinal tree events match exact kernel from empty including finite buffers and backpressure',()=>{
 const e=environment();e.run(build);
 const r=e.run(`(()=>{let seed=123456,rand=n=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)%n;let checked=0,graphs=0,larger=0;
 for(let j=0;j<40;j++){
  const n=3+j%3,as=Array.from({length:n},()=>[]);for(let i=0;i<n-1;i++)as[i+1+rand(n-1-i)].push([i,1+rand(4)]);
  const s=buildTree(Array.from({length:n},()=>1+rand(4)),Array.from({length:n},()=>1+rand(240)),as,Array.from({length:n},()=>1+rand(15)));
  const g=iterationTreeEventGraph(s,A);if(!g)throw Error('graph '+j);
  const proof=iterationTreeRates(s,A,{ms:3000});if(!proof)throw Error('proof '+j);if(proof.tree.period!==proof.tree.nominalPeriod)larger++;
  const rounds=iterationTreeEventRounds(g,200),events=new Map();
  for(let k=0;k<rounds.length;k++)for(let v=0;v<g.vertices.length;v++){const t=Number(rounds[k][v]),key=g.vertices[v].key;const ev=events.get(t)??[];ev.push(key);events.set(t,ev)}
  const kernel=iterationCreateKernel(s,A),counts={},limit=Math.min(10000,Number(rounds.at(-1).reduce((a,b)=>a<b?a:b))-1);
  for(let t=1;t<=limit;t++){
   kernel.step();for(const key of events.get(t)??[])counts[key]=(counts[key]??0)+1;
   const snap=kernel.snapshot(),ctrl=JSON.parse(snap.control)[0];
   for(let i=0;i<n;i++){
    const id='m'+i,r='r'+i,route=s.routes[i],k='k'+i;
    const c=snap.count['cycle:'+id]??0,d=snap.count['routeTotal:'+r]??0,a=snap.count['machineMaterial:'+route.to+'|in|'+k]??0;
    if(c!==(counts['c:'+id]??0)||d!==(counts['d:'+r]??0)||a!==(counts['r:'+r]??0))throw Error('event mismatch '+JSON.stringify({j,t,i,c,d,a,ec:counts['c:'+id]??0,ed:counts['d:'+r]??0,ea:counts['r:'+r]??0,s}));
   }checked++;
  }graphs++;
 }return JSON.stringify({checked,graphs,larger})})()`);
 console.log('TREE_EVENT_TRACE',r);assert.equal(JSON.parse(r).graphs,40);
});
test('exact graph period matches full orbit on diverse finite production trees',()=>{
 const e=environment();e.run(build);
 const r=e.run(`(()=>{let checked=0,graphs=0,larger=0;for(const q of [1,2,3])for(const a of [1,2,3])for(const t of [20,51,160]){
 const s=buildTree([q,2,1],[t,37,50],[[],[],[[0,a],[1,2]]],[1,5,7]),g=iterationTreeRates(s,A,{ms:3000}),o=iterationFindOrbit(iterationCreateKernel(s,A),{ms:3000,maxTicks:216000});
 if(!g||!o.values)throw Error('unsolved '+q+'/'+a+'/'+t+' '+o.status);
 for(const k of new Set([...Object.keys(g.values),...Object.keys(o.values)])){if((g.values[k]??'0')!==(o.values[k]??'0'))throw Error('rate mismatch '+q+'/'+a+'/'+t+' '+k+' '+g.values[k]+'/'+o.values[k]);checked++}
 graphs++;if(g.tree.period!==g.tree.nominalPeriod)larger++;
 }return JSON.stringify({checked,graphs,larger})})()`);console.log('TREE_RATE_TRACE',r);assert.equal(JSON.parse(r).graphs,27);
});

test('real independent production forests preserve all rates and actual warehouse deposits',()=>{
 const e=environment();fixture(e,'ast1-user-84-78-v1.txt');
 const r=e.run('(()=>{const s=factoryCompileSymbolicSpec(),parts=iterationPartitionSpec({...s,unlimitedWarehouse:true});let groups=0,checks=0,events=0,machines=0;for(const p of parts){const f=iterationProductionForest(p);if(!f)continue;const a=iterationForestRates(p,A,{treeMs:1000}),b=iterationFindOrbit(iterationCreateKernel(p,A),{ms:10000});if(!a||!b.values)throw Error("unsolved forest");for(const k of new Set([...Object.keys(a.values),...Object.keys(b.values)])){if((a.values[k]??"0")!==(b.values[k]??"0"))throw Error("forest rate "+k);checks++}const c=iterationForestDepositCalendar(p,A,{ms:3000});if(!c)throw Error("forest calendar");const z=c.window(0,10000),k=iterationCreateKernel(p,A,{captureDeposits:true});for(let i=0;i<10000;i++)k.step();const ref=k.recordedCalendar(),norm=x=>JSON.stringify(Object.entries(x).sort(([a],[b])=>Number(a)-Number(b)).map(([t,v])=>[t,Object.entries(v.physical||{}).sort()]));if(norm(ref)!==norm(z))throw Error("forest deposit sequence");events+=Object.keys(z).length;groups++;machines+=p.machines.length;}return JSON.stringify({groups,checks,events,machines})})()');
 console.log('REAL_TREE_FORESTS',r);const v=JSON.parse(r);assert.equal(v.groups,3);assert.equal(v.machines,24);
});
test('cycle-ratio certificate includes a stronger finite-buffer constraint when nominal bound is insufficient',()=>{
 const e=environment();
 const r=e.run('(()=>{const g={vertices:[{},{}],bound:2n,arcs:[{from:0,to:1,lag:0,w:7n},{from:1,to:0,lag:2,w:4n}]};const p=iterationTreePeriod(g,A);return p&&A.txt(p.lambda)==="11/2"&&p.witness.length===2&&g.arcs.every(x=>p.phase[x.to]>=p.phase[x.from]+x.w*p.lambda.d-BigInt(x.lag)*p.lambda.n)})()');
 assert(r);
});
test('forest rejects non-tree competition, missing ingredients and insufficient graph budget',()=>{
 const e=environment();e.run(build);
 const r=e.run('(()=>{const s=buildTree([2,3,1],[20,40,50],[[],[],[[0,2],[1,3]]],[2,4,6]);if(!iterationForestRates(s,A)||iterationForestRates(s,A,{maxVertices:2}))return false;s.machines[2].recipe.inputs.k0=0;if(iterationForestRates(s,A))return false;s.machines[2].recipe.inputs.k0=2;s.routes[1].toPort=s.routes[0].toPort;return iterationForestRates(s,A)===null})()');
 assert(r);
});

test('diverse random deep trees: exact event schedules, rates, and explicit graph size rejection',()=>{
 const e=environment();e.run(build);
 const v=JSON.parse(e.run(`(()=>{let seed=0x729a45fe;const rand=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%n};let traces=0,solved=0,unsupported=0,compared=0,orbitBudget=0,checks=0,larger=0,maxDepth=0;
 for(let j=0;j<150;j++){
  const n=1+rand(12),as=Array.from({length:n},()=>[]),depth=Array(n).fill(1);
  for(let i=0;i<n-1;i++){const parent=j%3===0?i+1:j%3===1?n-1:i+1+rand(n-1-i);as[parent].push([i,1+rand(4)]);depth[parent]=Math.max(depth[parent],depth[i]+1)}
  maxDepth=Math.max(maxDepth,depth[n-1]);
  const s=buildTree(Array.from({length:n},()=>1+rand(4)),Array.from({length:n},()=>[1,19,20,21,37,51,100,150,151,241,400,1200][rand(12)]),as,Array.from({length:n},()=>1+rand(65)));
  const g=iterationTreeEventGraph(s,A);if(!g){unsupported++;continue}
  const a=iterationTreeRates(s,A,{ms:2000});if(!a){unsupported++;continue}
  solved++;if(a.tree.period!==a.tree.nominalPeriod)larger++;
  const events=new Map(),rounds=iterationTreeEventRounds(g,24);
  const end=Math.min(2000,Number(rounds.at(-1).reduce((x,y)=>x<y?x:y))-1);
  for(const times of rounds)for(let i=0;i<times.length;i++){const t=Number(times[i]);if(t>end)continue;const ev=events.get(t)??[];ev.push(g.vertices[i].key);events.set(t,ev)}
  const k=iterationCreateKernel(s,A),counts={};
  for(let t=1;t<=end;t++){k.step();for(const key of events.get(t)??[])counts[key]=(counts[key]??0)+1;
   if(t%13!==0&&t!==end)continue;
   const snap=k.snapshot();
   for(let i=0;i<n;i++){const r=s.routes[i],id='m'+i,k='k'+i;for(const [field,event] of [['cycle:'+id,'c:'+id],['routeTotal:'+r.id,'d:'+r.id],['machineMaterial:'+r.to+'|in|'+k,'r:'+r.id]])if((snap.count[field]??0)!==(counts[event]??0))throw Error('random trace mismatch '+j+'/'+t+'/'+field)}
   traces++;
  }
  // Independent full orbit, bounded so a long genuine common period is
  // reported as unverified, never as a passed comparison.
  const o=iterationFindOrbit(iterationCreateKernel(s,A),{ms:120,maxTicks:120000});
  if(!o.values){orbitBudget++;continue}
  for(const key of new Set([...Object.keys(a.values),...Object.keys(o.values)])){if((a.values[key]??'0')!==(o.values[key]??'0'))throw Error('random rate mismatch '+j+'/'+key);checks++}
  compared++;
 }
 return JSON.stringify({solved,unsupported,traces,compared,orbitBudget,checks,larger,maxDepth})})()`));
 console.log('DIVERSE_TREE_TRACE',JSON.stringify(v));assert.equal(v.solved+v.unsupported,150);assert(v.solved>=100&&v.compared>=50&&v.maxDepth>=10);
});
test('multiple warehouse roots, starved branch and independent dead end preserve complete rates',()=>{
 const e=environment();e.run(build);
 const v=e.run(`(()=>{const one=buildTree([2,1],[37,65],[[],[[0,2]]],[3,5]),two=buildTree([3,1],[20,80],[[],[[0,1]]],[2,3]);
  const rename=(s,p)=>({...s,machines:s.machines.map(m=>({...m,id:p+m.id})),routes:s.routes.map(r=>({...r,id:p+r.id,from:p+r.from,to:p+r.to}))});
  const a=rename(one,'a'),b=rename(two,'b'),c=rename(two,'c');c.machines.find(m=>m.id==='cm1').recipe={...c.machines.find(m=>m.id==='cm1').recipe,inputs:{k0:1,missing:1}};
  const dead={id:'dead',type:'加工',recipe:{qty:1,seconds:1,output:'junk',inputs:{}},outPorts:[{index:0}],inputPriority:[]};
  const s={initial:'empty',machines:[...a.machines,...b.machines,...c.machines,dead],routes:[...a.routes,...b.routes,...c.routes],frozen:[],priority:[]};
  // Two independent production trees terminate at separate warehouse
  // machines; a third starved tree shares the first inlet at another port.
  a.machines.find(m=>m.id==='asink').inputPriority=[0,1];s.machines=s.machines.filter(m=>m.id!=='csink');const end=s.routes.find(r=>r.to==='csink');end.to='asink';end.toPort=1;
  const p=iterationSolveComponents(s,A,{ms:10000}),o=iterationSolveComponents(s,A,{ms:10000,analyticTree:false,analyticBatch:false,structuralZero:false});
  if(!p.values||!o.values)throw Error('forest failed');
  for(const key of new Set([...Object.keys(p.values),...Object.keys(o.values)]))if((p.values[key]??'0')!==(o.values[key]??'0'))throw Error('forest mismatch '+key);
  return JSON.stringify({methods:p.components.map(c=>c.method),rates:[p.values['routeTotal:ar1'],p.values['routeTotal:br1'],p.values['routeTotal:cr1']??'0'],dead:p.values['cycle:dead']??'0'});
 })()`);const r=JSON.parse(v);console.log('MULTI_TERMINAL_TREE',v);assert.deepEqual(r.rates,['4/13','1/4','0']);assert.equal(r.dead,'0');assert(r.methods.includes('production-tree-event-graph'));
});
test('reachable competing material inputs and branching junctions are not mistaken for a pure tree or zero proof',()=>{
 const e=environment();e.run(build);
 assert(e.run(`(()=>{const s=buildTree([1,2,1],[20,30,80],[[],[],[[0,1],[1,1]]],[1,2,3]);s.machines[1].recipe.output='k0';s.routes[1].accepted=['k0'];s.machines[2].recipe.inputs={k0:2};
  if(iterationForestRates(s,A))return false;
  const o=iterationSolveComponents(s,A,{ms:5000});if(!o.values||o.components[0].status!=='exact-model-period')return false;
  s.machines[2].type='分流';delete s.machines[2].recipe;return iterationForestRates(s,A)===null
 })()`));
});

test('connected multi-terminal split with a dead end uses iteration, preserving both live sinks',()=>{
 const e=environment();
 const r=e.run('(()=>{const m=(id,type,extra)=>({id,type,outPorts:[],inputPriority:[0],...extra}),s={initial:"empty",machines:[m("source","生产",{recipe:{qty:1,seconds:1,output:"ore",inputs:{}},outPorts:[{index:0}]}),m("split","分流",{outPorts:[0,1,2].map(index=>({index,filter:"任意"}))}),m("a","仓入",{}),m("b","仓入",{}),m("dead","加工",{recipe:{qty:1,seconds:1,output:"plate",inputs:{ore:1}},outPorts:[{index:0}]})],routes:[{id:"in",from:"source",fromPort:0,to:"split",toPort:0,length:4,accepted:["ore"]},...["a","b","dead"].map((to,i)=>({id:"r"+i,from:"split",fromPort:i,to,toPort:0,length:3+i,accepted:["ore"]}))],priority:[],frozen:[]};if(iterationForestRates(s,A)!==null)throw Error("unsupported split accepted");const p=iterationSolveComponents(s,A,{ms:5000,maxTicks:216000});if(!p.values||p.components[0].status!=="exact-model-period")throw Error("split not solved");return JSON.stringify([p.values["inflow:ore"],p.values["routeTotal:r0"],p.values["routeTotal:r1"],p.values["routeTotal:r2"]??"0",p.values["cycle:dead"]??"0"])})()');
 assert.deepEqual(JSON.parse(r),['1','1/2','1/2','0','0']);
});

test('rejected analytic trees retry the current exact iterator in actual and unlimited models; budget preserves independent known results',()=>{
 const e=environment();e.run(build);
 const r=e.run(`(()=>{const tree=buildTree([2,3,1],[37,51,80],[[],[],[[0,2],[1,3]]],[2,5,7]);const m={id:'ind',type:'生产',recipe:{qty:1,seconds:1,output:'independent',inputs:{}},outPorts:[{index:0}],inputPriority:[]},sink={id:'indSink',type:'仓入',outPorts:[],inputPriority:[0]};
 const s={...tree,machines:[...tree.machines,m,sink],routes:[...tree.routes,{id:'indRoute',from:m.id,fromPort:0,to:sink.id,toPort:0,length:2,accepted:['independent']}]};
 const reference=iterationSolveComponents(s,A,{ms:10000,analyticTree:false,analyticBatch:false,structuralZero:false});
 if(!reference.values||!iterationForestRates(tree,A))throw Error('reference or analytic control missing');
 let cases=0,fields=0;
 for(const reject of [{maxVertices:2},{treeMs:0},{maxPasses:0},{analyticTree:false}]){
  const a=iterationBoundaryPressure(s,A,{...reject,ms:10000,maxTicks:216000}),b=iterationSolveComponents({...s,unlimitedWarehouse:true},A,{...reject,ms:10000,maxTicks:216000});
  if(!a.actualValues||!b.values||a.components.find(c=>c.machines.includes('m0'))?.actualStatus!=='exact-model-period'||b.components.find(c=>c.machines.includes('m0'))?.status!=='exact-model-period')throw Error('reject did not reach iterator '+JSON.stringify(reject));
  for(const v of [a.actualValues,b.values])for(const key of new Set([...Object.keys(reference.values),...Object.keys(v)])){if((reference.values[key]??'0')!==(v[key]??'0'))throw Error('fallback mismatch '+key);fields++}
  if(a.rows.independent.inflow!=='1'||a.rows.independent.potential!=='1')throw Error('lost independent contribution');
  cases++;
 }
 const a=iterationBoundaryPressure(s,A,{maxVertices:2,ms:1000,maxTicks:0}),b=iterationSolveComponents({...s,unlimitedWarehouse:true},A,{maxVertices:2,ms:1000,maxTicks:0});
 if(a.actualValues!==null||b.values||a.rows.independent.inflow!=='1'||b.partialValues['inflow:independent']!=='1'||a.rows.k2.inflow!==null||!a.solvedMachines.includes('ind')||a.solvedMachines.includes('m0'))throw Error('unknown became zero or independent result lost');
 return JSON.stringify({cases,fields,partial:true})})()`);
 const v=JSON.parse(r);console.log('ANALYTIC_REJECTION_FALLBACK',r);assert.equal(v.cases,4);assert(v.fields>0&&v.partial);
});
