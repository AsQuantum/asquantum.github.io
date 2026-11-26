'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{ctx,run}=require('../support/production');
function graph(){
 const g={status:'compiled',completePhysicalRoutes:true,unlimited:false,nodes:[],lines:[],pools:[],frozen:[]};
 const m=(id,type,recipe=null,item=null)=>g.nodes.push({id,type,recipe,item,physicalInCount:0,physicalOutCount:0});
 const e=(id,from,to,k,fp=0,tp=0,length=3)=>{g.lines.push({id,from,to,fromPort:fp,toPort:tp,length,compatible:true,active:true,materials:[k],rawMaterials:[k],acceptedMaterials:[k]});g.nodes.find(x=>x.id===from).physicalOutCount++;g.nodes.find(x=>x.id===to).physicalInCount++;};
 m('initial','仓出',null,'x');m('fork','分流');m('other','仓出',null,'y');
 m('process','组装',{inputs:{x:2,y:1},output:'p',qty:1,seconds:4});
 m('w0','仓入');m('w1','仓入');m('w2','仓入');
 e('root','initial','fork','x');e('branch','fork','process','x',0,0,7);
 e('side1','fork','w0','x',1);e('side2','fork','w1','x',2);
 e('other','other','process','y',0,1);e('output','process','w2','p');
 return g;
}
function solve(g,amount){
 ctx.g=g;ctx.amount=amount;
 return JSON.parse(run(`JSON.stringify((()=>{
  const a=factoryDirectArithmetic(),p={status:'compiled',smt:[
  '(set-logic QF_LRA)','(declare-const x Real)','(declare-const r Real)','(declare-const net Real)',
  '(assert (<= 0 x))','(assert (<= x 1))','(assert (<= 0 r))','(assert (<= r (/ 1 4)))',
  '(assert (= net (- (/ 1 '+amount+') r)))','(assert (<= 0 net))'
  ].join('\\n'),observables:{'routeTotal:root':'x','cycle:process':'r','net:y':'net'},structuralConstants:{}};
  return {candidates:relativeServiceCandidates(g,a,[]),proof:proveRelativeSplitterService(g,a,p,[],{})};
 })())`));
}
test('relative splitter clock plus last-low stock implication proves a general affine bound',()=>{
 const r=solve(graph(),6);
 assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].period,'6');
 assert.deepEqual(r.proof.relations[0].coefficients,{'cycle:process':-1,'routeTotal:root':'1/6'});
 assert.equal(r.proof.witnesses[0].lowStockEvidence[0].lower,'0');
 assert.equal(solve(graph(),12).proof.relations.length,0);
 const u=graph();u.unlimited=true;assert.equal(solve(u,12).proof.relations.length,1);
 const bad=graph();bad.lines.find(e=>e.id==='side1').outFilter='wrong';assert.equal(solve(bad,6).candidates.length,0);
 const blocked=graph();blocked.nodes.find(n=>n.id==='w2').type='汇流';assert.equal(solve(blocked,6).candidates.length,0);
});
test('last low stock prefix residual can prove saturation without a calendar or exact competing rate',()=>{
 const r=JSON.parse(run(`JSON.stringify(proveFreeOutletPrefixResidual(
 {nodes:[{id:'a',type:'仓出',item:'k'},{id:'b',type:'仓出',item:'k'}],frozen:[]},factoryDirectArithmetic(),
 {'inflow:k':'4/3'},{'machineTotal:b|out':'1/3'},[{proven:true,method:'refill-buffer-always-has-space-eventually',machine:'a'}]))`));
 assert.equal(r.relations[0].sense,'eq');assert.equal(r.relations[0].constant,'1');
});

test('high stock service covers income: zero net without guessing withdrawal allocation',()=>{
 const g=graph();g.nodes.push({id:'fixed',type:'仓出',item:'x',physicalInCount:0,physicalOutCount:1},{id:'fixedSink',type:'仓入',physicalInCount:1,physicalOutCount:0});g.lines.push({id:'fixedline',from:'fixed',to:'fixedSink',fromPort:0,toPort:0,length:3,compatible:true,active:true,materials:['x'],rawMaterials:['x'],acceptedMaterials:['x']});
 function proof(values,netLower,gg=g){
  ctx.g=gg;ctx.values=values;ctx.lower=netLower;
  return JSON.parse(run('JSON.stringify(proveHighStockDemandExhaustion(g,factoryDirectArithmetic(),values,lower,[]))'));
 }
 const v={'inflow:x':'2/3','machineTotal:fixed|out':'1/3'};
 const r=proof(v,{y:'1/10'});
 assert.deepEqual(r.relations[0].coefficients,{'net:x':1});assert.equal(r.relations[0].constant,'0');
 assert.equal(r.witnesses[0].demandLower,'2/3');
 assert.equal(proof(v,{}).relations.length,0);
 assert.equal(proof({...v,'inflow:x':'3/4'},{y:'1/10'}).relations.length,0);
 assert.equal(proof({...v,'machineTotal:initial|out':'1/10'},{y:'1/10'}).relations.length,0);
 const bad=structuredClone(g);bad.lines.find(e=>e.id==='side1').outFilter='wrong';
 assert.equal(proof(v,{y:'1/10'},bad).relations.length,0);
});
