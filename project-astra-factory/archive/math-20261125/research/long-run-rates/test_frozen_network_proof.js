'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{solveDirectRateProblem:solve}=require('./direct_algebra'),{compileCountProofProblem}=require('./count_proof_compile');
const {proveFedFrozenRings:ring}=require('./frozen_fed_ring_proof'),{proveExclusiveFrozenNetwork:network}=require('./frozen_exclusive_network_proof');
const base={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[]};
const A='合金板',B='硅晶圆',C='星尘粒子',D='能量电池';
function g(frozen){return {...base,frozen};}
function f(id,rates){return {id,rates};}
const cases=[
 {name:'lossy-fed',g:g([f('a',{[A]:'-2',[B]:'1'}),f('b',{[B]:'-1',[A]:'1'}),f('s',{[A]:'1/5'})]),duties:{a:'1/5',b:'1/5',s:'1'},ring:true},
 {name:'lossy-unfed',g:g([f('a',{[A]:'-2',[B]:'1'}),f('b',{[B]:'-1',[A]:'1'})]),duties:{a:'0',b:'0'},ring:true},
 {name:'equal-fed',g:g([f('a',{[A]:'-2',[B]:'2'}),f('b',{[B]:'-1',[A]:'1'}),f('s',{[A]:'1/4'})]),duties:{a:'5/8',b:'1',s:'1'},ring:true},
 {name:'gain-fed',g:g([f('a',{[A]:'-2',[B]:'3'}),f('b',{[B]:'-1',[A]:'1'}),f('s',{[A]:'1/10'})]),duties:{a:'11/20',b:'1',s:'1'},ring:true},
 {name:'multi-input-feedback',g:g([f('a',{[A]:'-1',[D]:'-2',[B]:'2',[C]:'1'}),f('b',{[B]:'-3',[C]:'-1',[A]:'1/2',[D]:'3'}),f('s',{[A]:'1/5',[D]:'1/4'})]),duties:{a:'3/10',b:'1/5',s:'1'},ring:false},
 {name:'multiple-producers',g:g([f('a',{[A]:'-1',[B]:'1/2',[C]:'1'}),f('b',{[B]:'-1',[A]:'1/4'}),f('c',{[C]:'-2',[A]:'1/2'}),f('s',{[A]:'1/4'})]),duties:{a:'2/5',b:'1/5',c:'1/5',s:'1'},ring:false}
];
// The last case: a=min(1,1/4+b/4+c/2), b=a/2,c=a/2,
// hence a=(1/4)/(1-3/8)=2/5.
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const name of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',name+'.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),report=[];
for(const x of cases){
 const p=network(x.g,arith,solve);assert.equal(p.status,'sat',x.name);
 assert.deepEqual(Object.fromEntries(p.certificates.map(f=>[f.factory,f.duty])),x.duties,x.name);
 if(x.ring){const rp=ring(x.g,arith);assert.equal(rp.rings.length,1,x.name);for(const f of rp.certificates)assert.equal(f.duty,x.duties[f.factory]);}
 const r=solve(compileCountProofProblem(x.g,arith,{frozenDuties:p.certificates}),arith,{ms:10000});
 assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);
 // Source-independent rate proofs use bounded shortage and accounting.
 // Check the existing HTML loop, but do not use its values to prove rates.
 c.layout={name:x.name,machines:[],routes:[],frozenFactories:x.g.frozen};
 run('state=layout;resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(sim.frozenRuntime).map(([k,v])=>[k,v.activeTime])))'));
 const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
 const actual=Object.fromEntries(Object.keys(x.duties).map(id=>[id,(b[id]-a[id])/3600]));
 for(const [id,v] of Object.entries(x.duties)){const z=arith.q(v);assert(Math.abs(actual[id]-Number(z.n)/Number(z.d))<.003,JSON.stringify({name:x.name,id,v,actual}));}
 report.push({name:x.name,duties:x.duties,actual,queries:Object.keys(r.unique).length});
}
const closed=g([f('a',{[A]:'-1',[B]:'1'}),f('b',{[B]:'-1',[A]:'1'}),f('s',{[D]:'1'})]);
const nonunique=network(closed,arith,solve);assert.deepEqual(nonunique.certificates.map(x=>x.factory),['s']);assert.equal(ring(closed,arith).certificates.length,0);
const gainClosed=g([f('a',{[A]:'-1',[B]:'2'}),f('b',{[B]:'-1',[A]:'2'})]);assert.equal(network(gainClosed,arith,solve).certificates.length,0);assert.equal(ring(gainClosed,arith).certificates.length,0);
const shared=structuredClone(cases[0].g);shared.frozen.push(f('rival',{[A]:'-1'}));const sp=network(shared,arith,solve);assert(!sp.certificates.some(x=>x.factory==='a'||x.factory==='b'));assert.equal(ring(shared,arith).certificates.length,0);
const result={cases:report,nonunique:nonunique.refused,shared:sp.refused,scope:'exclusive input network, actual count limits only for unique fixed coordinates'};
fs.writeFileSync(path.join(__dirname,'frozen-network-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
