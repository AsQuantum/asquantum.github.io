'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{refillInvariant}=require('./refill_invariant'),{proveCadenceBackpressure}=require('./cadence_backpressure');
const {compileExactRateProblem}=require('./compile_exact'),{solveDirectRateProblem}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
const layout=JSON.parse(fs.readFileSync(path.join(__dirname,'legal-net-branch.json'),'utf8')).layout;c.layout=layout;
const g=JSON.parse(vm.runInContext('state=layout;JSON.stringify(factoryCompileDirectGraph())',c));
function verify(g){
 const p=proveCadenceBackpressure(g,arith,refillInvariant);
 const problem=compileExactRateProblem(g,{batchRefillCertificates:p.certificates});
 const r=solveDirectRateProblem(problem,arith,{ms:5000});
 assert.equal(r.status,'sat',JSON.stringify(r));
 return {proof:p,unknown:r.multiple,values:r.unique};
}
const a=verify(g);
assert.equal(a.proof.certificates.length,1);
assert.equal(a.proof.cadences.find(x=>x.machine==='M4').period,'4');
assert.equal(a.values['net:小行星矿石'],'3/4');
assert.equal(a.values['flow:R1|小行星矿石'],'1/4');
assert.equal(a.values['flow:R3|小行星矿石'],'1/2');
assert.equal(a.values['cycle:M4'],'1/4');
assert.equal(a.values['cycle:M6'],'1/4');
assert.equal(a.values['net:复合装甲板'],'1/4');
assert.equal(a.values['total:net'],'1');
c.ast=vm.runInContext('ast1Encode()',c);
const mirror=JSON.parse(vm.runInContext('state=ast1Decode(ast);state.frozenFactories=layout.frozenFactories;JSON.stringify(factoryCompileDirectGraph())',c));
const b=verify(mirror);
assert.equal(b.values['net:小行星矿石'],'3/4');
const unlimited=JSON.parse(vm.runInContext('JSON.stringify(factoryCompileDirectGraph(state,null,{unlimitedWarehouse:true}))',c));
const u=verify(unlimited);assert.equal(u.values['net:小行星矿石'],'3/4');
const rejected=[];
for(const [label,change] of [
 ['no independent warehouse supply',x=>x.frozen=[]],
 ['slow alloy source',x=>x.frozen[0].rates['合金板']='1/2'],
 ['no strict backpressure surplus',x=>{x.nodes.find(m=>m.id==='M6').recipe.seconds=3;x.nodes.find(m=>m.id==='M6').recipe.inputs['合金板']=3;}],
 ['unknown preferred inlet',x=>x.nodes.find(m=>m.id==='M4').inputPriority=[]],
 ['mixed belt',x=>x.lines.find(e=>e.id==='R1').materials.push('硅晶圆')],
 ['shared warehouse competition',x=>x.nodes.push({...x.nodes.find(m=>m.id==='M3'),id:'other-warehouse'})],
 ['second downstream outlet',x=>x.nodes.find(m=>m.id==='M4').physicalOutCount=2],
 ['non-unit upstream batch',x=>x.nodes.find(m=>m.id==='M4').recipe.qty=2],
 ['unverified graph',x=>x.completePhysicalRoutes=false],
]){
 const x=structuredClone(g);change(x);assert.equal(proveCadenceBackpressure(x,arith,refillInvariant).certificates.length,0,label);rejected.push(label);
}
// Symbolic graph mutation: rename all machines/items/routes and insert arbitrary
// chains of unit conversions with B<H. No fixture-ID or recipe-name rule.
function extend(depth){
 const x=structuredClone(g),e=x.lines.find(e=>e.id==='R5'),target=e.to,port=e.toPort,consumer=x.nodes.find(m=>m.id===target);
 let product=e.materials[0],prior=e;
 for(let i=0;i<depth;i++){
  const id='unit-'+i,next='new-material-'+i;
  prior.to=id;prior.toPort=0;
  x.nodes.push({id,type:'加工',recipe:{inputs:{[product]:1},output:next,qty:1,seconds:'3/2'},physicalInCount:1,physicalOutCount:1,inputPriority:[0]});
  const line={...prior,id:'unit-route-'+i,from:id,to:target,toPort:port,materials:[next]};
  x.lines.push(line);prior=line;product=next;
 }
 delete consumer.recipe.inputs[e.materials[0]];consumer.recipe.inputs[product]=1;
 return x;
}
function rename(x){
 const m=new Map(x.nodes.map((v,i)=>[v.id,'device_'+(i*17+2)])),e=new Map(x.lines.map((v,i)=>[v.id,'edge_'+(i*31+7)])),k=new Map([...new Set(x.lines.flatMap(v=>v.materials))].map((v,i)=>[v,'material_'+(i*13+1)]));
 for(const n of x.nodes){n.id=m.get(n.id);if(n.item)n.item=k.get(n.item);if(n.recipe){n.recipe.output=k.get(n.recipe.output);n.recipe.inputs=Object.fromEntries(Object.entries(n.recipe.inputs).map(([v,a])=>[k.get(v),a]));}}
 for(const l of x.lines){l.id=e.get(l.id);l.from=m.get(l.from);l.to=m.get(l.to);l.materials=l.materials.map(v=>k.get(v));}
 for(const p of x.pools){p.item=k.get(p.item);p.order=p.order.map(v=>m.get(v));}
 for(const f of x.frozen)f.rates=Object.fromEntries(Object.entries(f.rates).map(([v,a])=>[k.get(v),a]));
 return x;
}
const renamed=verify(rename(structuredClone(g)));assert.equal(renamed.proof.certificates.length,1);assert.equal(renamed.values['total:net'],'1');assert.equal(renamed.unknown.length,0);
const depths=[];
for(const depth of [1,4,12,24]){
 const x=rename(extend(depth)),p=proveCadenceBackpressure(x,arith,refillInvariant);
 assert.equal(p.certificates.length,1);
 assert.equal(p.cadences.length,depth+2);
 assert(p.cadences.every(v=>v.period==='4'));
 depths.push({depth,cadences:p.cadences.length});
}
const report={constrained:a,mirrored:b,unlimited:u,rejected,depths};
fs.writeFileSync(path.join(__dirname,'cadence-backpressure-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({supply:a.proof.supply,cadences:a.proof.cadences,certificates:a.proof.certificates,warehouse:Object.fromEntries(Object.entries(a.values).filter(([k])=>/^(net|inflow|outflow|potential|total):/.test(k))),unknown:a.unknown.length,unlimited:u.values['net:小行星矿石'],mirror:b.values['net:小行星矿石'],rejected,depths}));
