'use strict';
const assert=require('assert/strict'),fs=require('fs');
const {arith}=require('./run_direct'),{provePermanentFifoBlockage:prove}=require('./permanent_fifo_blockage'),{compileCountProofProblem}=require('./count_proof_compile'),{projectCountInterval}=require('./count_interval_projection');
const result=[];
const mk=(id,type,{item,recipe,ins=[],outs=[],mergerPriority=[]}={})=>({id,type,item,recipe,inputPriority:ins,outPorts:outs.map(index=>({index,filter:''})),mergerPriority});
const source=(id,k,inputs={})=>mk(id,'生产',{recipe:{output:k,qty:1,seconds:2,inputs},ins:Object.keys(inputs).length?[0]:[],outs:[0]});
const merger=id=>mk(id,'汇流',{ins:[0,1,2],outs:[0],mergerPriority:[0,1,2]});
const sink=id=>mk(id,'仓入',{ins:[0]});
const r=(id,from,to,toPort,accepted,fromPort=0)=>({id,from,to,toPort,fromPort,length:3,accepted});
const material=['A','B'];
function spec(machines,routes){return {machines,routes,priority:[],initial:'empty',unlimitedWarehouse:false,frozen:[]};}
function graph(sp){
 return {status:'compiled',completePhysicalRoutes:true,unlimited:false,physicalSpec:sp,nodes:sp.machines.map(m=>({id:m.id,type:m.type,item:m.item,recipe:m.recipe,physicalOutCount:sp.routes.filter(r=>r.from===m.id&&r.to!==null).length,physicalInCount:sp.routes.filter(r=>r.to===m.id).length})),
 lines:sp.routes.filter(r=>r.to!==null).map(r=>({...r,materials:r.accepted,acceptedMaterials:r.accepted,compatible:false})),pools:[],frozen:[]};
}
function exactZero(g,queries){
 const p=compileCountProofProblem(g,arith);
 for(const k of queries){
  const x=projectCountInterval(p,arith,k,{ms:5000});
  assert.equal(x.status,'interval',JSON.stringify(x));assert.equal(x.lower,'0',k);assert.equal(x.upper,'0',k);
 }
}
{
 const s=spec([source('bad','B'),source('good','A'),merger('m1'),merger('m2'),sink('sink')],
 [r('bad-in','bad','m1',0,material),r('good-in','good','m2',1,material),r('inter','m1','m2',0,material),r('terminal','m2','sink',0,['A'])]);
 const p=prove(s);assert.equal(p.status,'proved');assert.deepEqual(p.witnesses,[{source:'bad',item:'B',chain:['bad-in','inter','terminal'],blockedRoute:'terminal',receiver:'sink'}]);
 exactZero(graph(s),['routeTotal:terminal','routeTotal:inter','routeTotal:bad-in','routeTotal:good-in','cycle:bad','cycle:good','inflow:A']);
 result.push({case:'two mergers, autonomous incompatible source',witnesses:p.witnesses,allLongRunRatesZero:true});
 const q=structuredClone(s);q.routes.find(r=>r.id==='terminal').accepted=['A','B'];assert.equal(prove(q).relations.length,0);
 const t=structuredClone(s);t.machines[0].recipe.inputs={C:1};assert.equal(prove(t).relations.length,0);
 const u=structuredClone(s);u.routes.find(r=>r.id==='terminal').to=null;assert.equal(prove(u).relations.length,0);
 result.push({case:'compatible target, unproved source, or disconnected terminal',noFalseCertificate:true});
}
{
 const split=mk('split','分流',{ins:[0],outs:[0,1]});
 const s=spec([source('bad','B'),split,merger('m'),sink('sink'),sink('other')],
 [r('a','bad','split',0,material),r('b','split','m',0,material),r('c','m','sink',0,['A']),r('d','split','other',0,material,1)]);
 assert.equal(prove(s).relations.length,0);
 result.push({case:'splitter can divert wrong material, no unconditional blockage',noFalseCertificate:true});
}
{
 const s=spec([source('bad','B'),sink('sink')],[r('direct','bad','sink',0,['A'])]);
 assert.equal(prove(s).relations.length,1);
 exactZero(graph(s),['routeTotal:direct','cycle:bad','inflow:A']);
 result.push({case:'direct incompatible output',zero:true});
}
// Compile actual editor graph for open and mixed FIFO lines. The count graph
// may omit open edges, but the full physical spec retains them.
{
 const path=require('path'),vm=require('vm'),root=path.resolve(__dirname,'../..');
 const c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/steady-flow','engine/steady-equations','engine/steady-algebra','engine/steady-generic-network','engine/steady-machine-graph','engine/steady-rate-region','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 for(const f of ['direct_graph','symbolic_physical_spec'])vm.runInContext(fs.readFileSync(path.join(__dirname,f+'.js'),'utf8'),c);
 const g=JSON.parse(vm.runInContext(`(()=>{
  state={name:'open',machines:[{id:'M0',type:'垃圾',x:10,y:10,face:'E',mode:0}],routes:[]};
  const p=outPort(state.machines[0],0);
  state.routes.push({id:'R0',from:{id:'M0',port:0},to:null,path:[[p.ex,p.ey]]});
  const g=factoryCompileDirectGraph(state,null,{countOnly:true});g.physicalSpec=factoryCompileSymbolicSpec(state);return JSON.stringify(g);
 })()`,c));
 assert.equal(g.status,'compiled');assert.equal(g.completePhysicalRoutes,true);assert.equal(g.lines.length,0);assert.equal(g.nodes[0].openOutCount,1);assert.equal(g.physicalSpec.routes.length,1);
 exactZero(g,['cycle:M0']);
 result.push({case:'actual editor open route is retained physically but has no active flow',zero:true});
}
fs.writeFileSync(__dirname+'/permanent-fifo-blockage-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
