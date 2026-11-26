'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveFrozenSingleItemFinite:prove}=require('./frozen_single_item_finite'),{proveFrozenTickPriority:closed}=require('./frozen_tick_priority_proof'),{combine}=require('./combine_count_proofs');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='钛合金锭',outputs=['合金板','硅晶圆','星尘粒子'];
const s=(id,v)=>({id,enabled:true,rates:{[K]:v}}),f=(id,a,i)=>({id,enabled:true,rates:{[K]:'-'+a,[outputs[i]]:a}});
const cases=[
 {name:'two slow consumers',frozen:[s('s','1'),f('a','2/3',0),f('b','2/3',1)]},
 {name:'multiple sources interleaved',frozen:[s('s1','5'),f('a','5',0),s('s2','4'),f('b','5',1)]},
 {name:'three slow consumers',frozen:[s('s','3'),f('a','2',0),f('b','2',1),f('c','2',2)]},
 {name:'completion-tick collision',frozen:[s('s','1'),f('a','40/41',0),f('b','2',1)]},
 {name:'source later in list',frozen:[f('a','1',0),f('b','1',1),s('s','1')]}
];
const report=[];
for(const x of cases){
 c.layout={name:x.name,machines:[],routes:[],frozenFactories:x.frozen};
 const g=JSON.parse(run('state=layout;JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));
 assert.equal(closed(g,arith).certificates.length,0,'new test must exercise a previously unresolved condition');
 const p=prove(g,arith);assert.equal(p.certificates.length,1,JSON.stringify(p));assert.equal(p.certificates[0].method,'finite-state-recurrent-class');
 const r=combine(g).result;assert.equal(r.status,'sat');assert.equal(r.multiple.length,0,JSON.stringify(r.multiple));for(const d of p.frozenDuties)assert.equal(r.unique['duty:'+d.factory],d.duty);
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(sim.frozenRuntime).map(([k,v])=>[k,v.activeTime])))'));
 const before=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const after=snap();
 const actual=Object.fromEntries(Object.keys(after).map(id=>[id,(after[id]-before[id])/3600]));
 for(const d of p.frozenDuties){const q=arith.q(d.duty);assert(Math.abs(actual[d.factory]-Number(q.n)/Number(q.d))<.002,JSON.stringify({case:x.name,d,actual}));}
 report.push({name:x.name,proof:p.certificates[0],unique:Object.keys(r.unique).length,actual});
 const capped=prove(g,arith,{maxStates:1});assert.equal(capped.frozenDuties.length,0);
}
fs.writeFileSync(path.join(__dirname,'frozen-single-item-finite-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
