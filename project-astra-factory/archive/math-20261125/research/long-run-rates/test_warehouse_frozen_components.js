'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveFrozenFiniteComponents:prove}=require('./frozen_finite_components'),{compileCountProofProblem:compile}=require('./count_proof_compile'),{solveFactoredCounts:solve}=require('./count_factored_projection');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='钛合金锭',A='合金板',B='硅晶圆',C='星尘粒子',G='齿轮组';
const f=(id,rates)=>({id,enabled:true,rates});
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'warehouse-burst-counterexample.json'),'utf8')).layout;
function layout(name,ids,frozen){
 const l=structuredClone(fixture);l.name=name;l.machines=l.machines.filter(m=>ids.includes(m.id));l.routes=l.routes.filter(r=>ids.includes(r.from.id)&&ids.includes(r.to.id));l.frozenFactories=frozen;return l;
}
const cases=[
 layout('physical and high-rate fractional frozen',['M9','M11'],[f('s',{[K]:'3/2'}),f('a',{[K]:'-2',[B]:'2'})]),
 layout('two negative consumers and free recipe',['M8','M10','M12'],[f('s',{[K]:'5'}),f('a',{[K]:'-4',[B]:'4'}),f('b',{[K]:'-2',[C]:'2'})]),
 layout('two exits with source later in order',['M8','M9','M10','M11','M12'],[f('a',{[K]:'-10',[B]:'10'}),f('s',{[K]:'10'})]),
 layout('autonomous deposit and frozen injection',['M0','M1','M9','M11'],[f('a',{[K]:'-20',[B]:'20'}),f('s',{[K]:'1'})]),
 layout('two ingredients and physical consumer',['M9','M11'],[f('s',{[K]:'20',[A]:'10'}),f('a',{[K]:'-20',[A]:'-10',[B]:'10'}),f('b',{[K]:'-10',[A]:'-20',[C]:'10'})]),
 layout('slow protected physical competitor',['M9','M11'],[f('s',{[K]:'1'}),f('a',{[K]:'-2/3',[B]:'2/3'})])
];
const reports=[];
function graph(l){c.layout=l;run('state=layout');assert(run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))').every(v=>!v),'illegal '+l.name);const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));assert.equal(g.status,'compiled');return g;}
function measure(){
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify({sent:Object.fromEntries(Object.entries(sim.byMachine).map(([k,v])=>[k,v.sent])),in:sim.inbound,out:sim.outbound,duty:Object.fromEntries(Object.entries(sim.frozenRuntime).map(([k,v])=>[k,v.activeTime]))})'));
 const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap(),diff=(x,y)=>Object.fromEntries(Object.keys(x).map(k=>[k,(x[k]-(y[k]||0))/3600]));
 return {sent:Object.fromEntries(Object.entries(b.sent).map(([id,v])=>[id,diff(v,a.sent[id]||{})])),duty:diff(b.duty,a.duty),in:diff(b.in,a.in),out:diff(b.out,a.out)};
}
const number=s=>{const q=arith.q(s);return Number(q.n)/Number(q.d);};
const close=(actual,expected,label)=>assert(Math.abs((actual||0)-number(expected))<.002,JSON.stringify({label,actual,expected}));
for(const l of cases){
 const g=graph(l),p=prove(g,arith);assert(p.certificates.length,JSON.stringify({name:l.name,proof:p}));const r=solve(compile(g,arith,{...p,htmlQueries:true}),arith);assert.equal(r.status,'sat');assert.equal(r.multiple.length,0,JSON.stringify({name:l.name,multiple:r.multiple}));
 const combined=require('./combine_count_proofs').combine(g,{htmlQueries:true});assert.equal(combined.result.status,'sat',JSON.stringify({name:l.name,passes:combined.passes}));assert.deepEqual(combined.result.unique,r.unique);assert.equal(combined.result.multiple.length,0);
 const actual=measure();
 for(const d of p.frozenDuties)close(actual.duty[d.factory],d.duty,l.name+' duty '+d.factory);
 for(const cert of p.warehouseBursts)for(const e of cert.outlets)close(actual.sent[e.machine][cert.item],e.rate,l.name+' route '+e.route);
 for(const [k,v] of Object.entries(r.unique)){if(k.startsWith('inflow:'))close(actual.in[k.slice(7)],v,l.name+' '+k);else if(k.startsWith('outflow:'))close(actual.out[k.slice(8)],v,l.name+' '+k);}
 const known=prove(g,arith,{knownDuties:p.frozenDuties,knownPhysical:r.unique});assert.equal(known.certificates.length,0);
 // Relabel the component while keeping the explicit priority relation.
 const renamed=structuredClone(g),ids=new Map(renamed.nodes.map((m,i)=>[m.id,'n'+(97-i*7)])),rs=new Map(renamed.lines.map((e,i)=>[e.id,'edge'+(51-i*3)]));
 renamed.nodes=renamed.nodes.map(m=>({...m,id:ids.get(m.id)}));renamed.lines=renamed.lines.map(e=>({...e,id:rs.get(e.id),from:ids.get(e.from),to:ids.get(e.to)}));renamed.pools=renamed.pools.map(p=>({...p,order:p.order.map(id=>ids.get(id))}));
 const rp=prove(renamed,arith);assert.deepEqual(rp.frozenDuties.map(x=>x.duty),p.frozenDuties.map(x=>x.duty));assert.deepEqual(rp.warehouseBursts.map(x=>x.outlets.map(e=>e.rate)),p.warehouseBursts.map(x=>x.outlets.map(e=>e.rate)));
 reports.push({name:l.name,proof:p.certificates,unique:Object.keys(r.unique).length,actual,layout:l});
}
// Positive NET can certify readiness even when the nominal total cap
// exceeds income, and the older independent-root detector cannot.
const {proveSharedStockService:stock}=require('./shared_stock_proof'),{provePriorityRecipeTrees:tree}=require('./warehouse_priority_tree_proof');
const deep=JSON.parse(fs.readFileSync(path.join(__dirname,'recipe-tree-results.json'),'utf8')).deep.layout,ore='小行星矿石';
Object.assign(deep.machines.find(m=>m.id==='M2'),{type:'仓出',item:ore});
deep.machines.push({id:'M5',type:'采矿',x:2,y:20,face:'E',mode:0},{id:'M6',type:'仓入',x:11,y:20,face:'E'});
deep.routes.push({id:'R4',from:{id:'M5',port:0},to:{id:'M6',port:1},path:[7,8,9,10].map(x=>[x,22])});
deep.frozenFactories=[f('s',{[ore]:'1/2'}),f('a',{[ore]:'-1/4',[B]:'1/4'})];
const dg=graph(deep);assert.equal(tree(dg,arith).trees.length,0);
const {combine}=require('./combine_count_proofs'),dr=combine(dg,{htmlQueries:true});
assert.equal(dr.result.status,'sat',JSON.stringify(dr.passes));assert.equal(dr.result.multiple.length,0,JSON.stringify(dr.result.multiple));
assert.equal(dr.result.unique['net:'+A],'2/3');assert.equal(dr.result.unique['net:'+ore],'7/12');assert.equal(dr.result.unique['duty:a'],'1');
const da=measure();close(da.in[A],'2/3','abundant alloy');close(da.duty.a,'1','abundant duty');
assert(dr.sources['proved-stock-tree']>0);const st=stock(dg,arith,{['net:'+ore]:'7/12'});
assert(st.inventory.find(x=>x.item===ore).permanentlyAbundant);assert.equal(st.inventory.find(x=>x.item===ore).abundanceMethod,'proved-positive-net');
reports.push({name:'proved surplus propagates into multi-layer tree',unique:Object.keys(dr.result.unique).length,actual:da,values:dr.result.unique,sources:dr.sources,layout:deep});

// The same component must not silently drop a competing non-free outlet.
const bad=graph(cases[2]);bad.nodes.find(m=>m.id==='M11').physicalInCount=2;
assert.equal(prove(bad,arith).certificates.length,0);
const cap=prove(graph(cases[1]),arith,{maxStates:1});assert.equal(cap.certificates.length,0);
fs.writeFileSync(path.join(__dirname,'warehouse-frozen-component-results.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.map(x=>({name:x.name,unique:x.unique,proof:x.proof,actual:x.actual,sources:x.sources}))));
