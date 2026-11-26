'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveFrozenFiniteComponents:prove}=require('./frozen_finite_components'),{compileCountProofProblem:compile}=require('./count_proof_compile'),{solveDirectRateProblem:solve}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='钛合金锭',A='合金板',B='硅晶圆',C='星尘粒子';
const f=(id,rates)=>({id,enabled:true,rates});
const layouts=[
 ['competing two ingredients',[f('s',{[K]:'10',[A]:'10'}),f('a',{[K]:'-20',[A]:'-10',[B]:'10'}),f('b',{[K]:'-10',[A]:'-20',[C]:'10'})]],
 ['surplus tracked ingredient',[f('s',{[K]:'20',[A]:'20'}),f('a',{[K]:'-20',[A]:'-10',[B]:'10'}),f('b',{[K]:'-10',[A]:'-20',[C]:'10'})]],
 ['feedback and competing sink',[f('s',{[K]:'10'}),f('a',{[K]:'-20',[A]:'20'}),f('b',{[A]:'-10',[K]:'10'}),f('c',{[A]:'-10',[C]:'10'})]],
 ['nonintegral coupled service',[f('s',{[K]:'20',[A]:'10'}),f('a',{[K]:'-30',[A]:'-20',[B]:'10'}),f('b',{[K]:'-10',[A]:'-10',[C]:'10'})]],
 ['unseeded shared cycle',[f('a',{[K]:'-20',[A]:'20'}),f('b',{[A]:'-20',[K]:'20'}),f('c',{[K]:'-10',[C]:'10'})]]
];
let seed=167031;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
const records=[],random={total:0,certified:0,refused:0,queries:0,maxStates:0};
function verify(name,fs0,isRandom){
 c.layout={name,machines:[],routes:[],frozenFactories:fs0};const g=JSON.parse(run('state=layout;JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));
 const p=prove(g,arith,{maxStates:600000});const expected=fs0.filter(f=>Object.values(f.rates).some(v=>Number(v)<0)).length;
 if(isRandom)random.total++;
 if(p.frozenDuties.length!==expected){if(isRandom){random.refused++;return;}throw Error(name+': '+JSON.stringify(p));}
 const r=solve(compile(g,arith,p),arith,{ms:10000});assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);if(!isRandom){const combined=require('./combine_count_proofs').combine(g).result;assert.equal(combined.status,'sat');assert.deepEqual(combined.unique,r.unique);assert.equal(combined.multiple.length,0);}
 const duration=3600;
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(sim.frozenRuntime).map(([k,v])=>[k,v.activeTime])))'));
 const before=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const after=snap();
 const actual=Object.fromEntries(Object.keys(after).map(id=>[id,(after[id]-before[id])/duration]));
 for(const d of p.frozenDuties){const q=arith.q(d.duty);assert(Math.abs(actual[d.factory]-Number(q.n)/Number(q.d))<.002,JSON.stringify({name,d,actual,fs0,proof:p.certificates}));}
 if(isRandom){random.certified++;random.queries+=Object.keys(r.unique).length;random.maxStates=Math.max(random.maxStates,...p.certificates.map(x=>x.states));}
 else records.push({name,proof:p.certificates,unique:Object.keys(r.unique).length,actual});
 // Relabel items and factories but retain ordered priority; exact result
 // must be equivariant under every arbitrary naming permutation.
 const renamed=structuredClone(g),map=new Map([[K,'k'],[A,'a'],[B,'b'],[C,'c']]);
 renamed.frozen=renamed.frozen.map((f,i)=>({...f,id:'id'+(i+101),rates:Object.fromEntries(Object.entries(f.rates).map(([k,v])=>[map.get(k)||k,v]))}));
 const p2=prove(renamed,arith);assert.deepEqual(p2.frozenDuties.map(x=>x.duty),p.frozenDuties.map(x=>x.duty));
}
for(const [name,fs] of layouts)verify(name,fs,false);
for(let i=0;i<20;i++){
 const fs=[f('p',{[K]:String(10*(1+rnd(3))),[A]:String(10*(1+rnd(3)))})];
 for(let j=0;j<2+rnd(2);j++){
  const r={[K]:String(-10*(1+rnd(3))),[A]:String((rnd(3)===0?1:-1)*10*(1+rnd(3))),[B]:String(10*(1+rnd(2)))};
  fs.push(f('f'+j,r));
 }
 // Vary list priority as part of the input, never assume source first.
 if(i%2)fs.push(fs.shift());
 verify('random '+i,fs,true);
}
// This example builds up K while awaiting the first slow A arrival,
// then drains it. A small cap must not invent a new starvation state.
c.layout={name:'reject unsafe clipping',machines:[],routes:[],frozenFactories:[f('source',{[K]:'20',[A]:'1'}),f('joint',{[K]:'-40',[A]:'-1'})]};
const bg=JSON.parse(run('state=layout;JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));
const capped=prove(bg,arith,{capFactors:[1]});assert.equal(capped.certificates.length,0);assert(capped.refused.some(x=>x.reason.includes('clipped stock')));
const capReport={smallCapRejected:capped.refused};

fs.writeFileSync(path.join(__dirname,'frozen-finite-components-results.json'),JSON.stringify({records,random,capReport},null,2));console.log(JSON.stringify({records,random,capReport}));
