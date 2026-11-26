'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {run,arith,proveSaturatedRouterCounts:prove,compileCountProofProblem,projectCountInterval}=require('../support/production');
const plan=g=>JSON.parse(run('JSON.stringify((p=>({layers:p.layers.map(l=>l.map(m=>m.id)),components:p.components,maxDepth:p.maxDepth}))(buildProofDepthPlan('+JSON.stringify(g)+')))'));
test('depth follows the longest dependency, not shortest source distance or record order',()=>{
 const nodes=['end','join','middle','a','b'].map(id=>({id}));
 const lines=[{from:'a',to:'middle'},{from:'middle',to:'join'},{from:'b',to:'join'},{from:'join',to:'end'}];
 const p=plan({nodes,lines});assert.equal(p.maxDepth,3);
 assert.deepEqual(p.layers.map(l=>l.sort()),[['a','b'],['middle'],['join'],['end']]);
 const reverse=plan({nodes:nodes.slice().reverse(),lines:lines.slice().reverse()});
 assert.deepEqual(reverse.layers.map(l=>l.sort()),p.layers.map(l=>l.sort()));
});
test('feedback remains a strongly connected block, never fakes a source',()=>{
 const nodes=['a','b','c','d','e'].map(id=>({id}));
 const lines=[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'b'},{from:'c',to:'d'},{from:'e',to:'e'}];
 const p=plan({nodes,lines});assert.equal(p.maxDepth,2);
 assert.deepEqual(p.layers.map(l=>l.sort()),[['a','e'],['b','c'],['d']]);
 assert.deepEqual(p.components.filter(c=>c.cyclic).map(c=>c.members.sort().join(',')).sort(),['b,c','e']);
});
function factory(){
 const g={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[],frozen:[],unlimited:false};
 const m=(id,type,recipe)=>g.nodes.push({id,type,recipe,physicalInCount:0,physicalOutCount:0});
 const e=(id,from,to,k,port=0)=>{g.lines.push({id,from,to,materials:[k],rawMaterials:[k],acceptedMaterials:[k],length:3,toPort:0,fromPort:port,compatible:true,active:true});g.nodes.find(x=>x.id===from).physicalOutCount++;g.nodes.find(x=>x.id===to).physicalInCount++;};
 m('source','生产',{inputs:{},output:'ore',qty:1,seconds:1});m('sp','分流');m('a','生产',{inputs:{ore:2},output:'metal',qty:1,seconds:2});m('b','生产',{inputs:{metal:1},output:'product',qty:1,seconds:1});m('sink','仓入');m('side','仓入');
 e('root','source','sp','ore');e('branch','sp','a','ore');e('side','sp','side','ore',1);e('ab','a','b','metal');e('out','b','sink','product');return g;
}
test('reverse acceptance certificates traverse transforming recipes and constrain upstream RR',()=>{
 const g=factory(),r=prove(g,arith);
 assert.deepEqual(r.schedule.layers.map(l=>l.sort()),[['source'],['sp'],['a','side'],['b'],['sink']]);
 const facts=r.witnesses.filter(w=>w.method==='backward-free-unit-recipe-inlet');
 assert(facts.some(x=>x.machine==='a')&&facts.some(x=>x.machine==='b'));
 const p=compileCountProofProblem(g,arith,{rateRelations:r.relations});
 for(const [key,rate] of [['routeTotal:branch','1/2'],['routeTotal:side','1/2'],['routeTotal:out','1/4']]){
  const v=projectCountInterval(p,arith,key,{ms:5000});assert.equal(v.lower,rate);assert.equal(v.upper,rate);
 }
 const reverse=structuredClone(g);reverse.nodes.reverse();reverse.lines.reverse();
 const rr=prove(reverse,arith),rp=compileCountProofProblem(reverse,arith,{rateRelations:rr.relations});
 assert.equal(projectCountInterval(rp,arith,'routeTotal:out',{ms:5000}).lower,'1/4');
 const slow=structuredClone(g);slow.nodes.find(x=>x.id==='b').recipe.seconds=2;
 assert(!prove(slow,arith).witnesses.some(x=>x.method==='backward-free-unit-recipe-inlet'&&x.machine==='a'));
});

test('shared saturated root and slow autonomous source give a rigorous lower bound without guessing a share',()=>{
 const g=factory();
 const source=g.nodes.find(x=>x.id==='source');source.type='仓出';source.item='ore';source.recipe=null;
 g.unlimited=true;
 const a=g.nodes.find(x=>x.id==='a');a.recipe={inputs:{ore:2,slow:1},output:'metal',qty:1,seconds:2};a.physicalInCount=2;
 g.nodes.push({id:'slow',type:'生产',recipe:{inputs:{},output:'slow',qty:1,seconds:5},physicalInCount:0,physicalOutCount:1});
 g.lines.push({id:'slowfeed',from:'slow',to:'a',materials:['slow'],rawMaterials:['slow'],acceptedMaterials:['slow'],length:4,toPort:1,fromPort:0,compatible:true,active:true});
 const r=prove(g,arith),w=r.witnesses.find(w=>w.method==='dedicated-ingredient-service-lower'&&w.machine==='a');
 assert(w);assert.equal(w.gap,'5');assert.equal(w.rate,'1/5');
 assert(r.witnesses.some(w=>w.method==='shared-splitter-branch-service-clock'&&w.route==='branch'&&w.gap==='2'));
 assert(r.witnesses.some(w=>w.method==='grounded-slow-unit-service-clock'&&w.route==='slowfeed'&&w.gap==='5'));
 const p=compileCountProofProblem(g,arith,{rateRelations:r.relations});
 const v=projectCountInterval(p,arith,'cycle:a',{ms:5000});
 assert.deepEqual([v.lower,v.upper],['1/5','1/5']);
 const scarce=structuredClone(g);scarce.unlimited=false;
 assert(!prove(scarce,arith).witnesses.some(w=>w.method==='dedicated-ingredient-service-lower'&&w.machine==='a'));
 const blocked=structuredClone(g);blocked.lines.find(e=>e.id==='ab').acceptedMaterials=['wrong'];
 assert(!prove(blocked,arith).witnesses.some(w=>w.method==='dedicated-ingredient-service-lower'&&w.machine==='a'));
});

function abstractFactory(unlimited=true){
 const g={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[],frozen:[],unlimited};
 const m=(id,type,recipe=null,item)=>{const n={id,type,recipe,item,physicalInCount:0,physicalOutCount:0,inputPriority:[]};g.nodes.push(n);return n;};
 const e=(id,from,to,k,toPort=0,fromPort=0,length=3)=>{
  g.lines.push({id,from,to,materials:[k],rawMaterials:[k],acceptedMaterials:[k],length,toPort,fromPort,compatible:true,active:true});
  g.nodes.find(x=>x.id===from).physicalOutCount++;const d=g.nodes.find(x=>x.id===to);d.physicalInCount++;d.inputPriority.push(toPort);
 };
 return {g,m,e};
}
test('backward cadence and fixed-frame shared-cache refill are generic, not fixture matches',()=>{
 const {g,m,e}=abstractFactory();
 m('source-X','生产',{inputs:{},output:'x',qty:3,seconds:3});m('source-Y','生产',{inputs:{},output:'x',qty:3,seconds:3});
 m('split','分流');m('stage','生产',{inputs:{x:3},output:'y',qty:1,seconds:2});m('w','仓出',null,'z');
 m('end','生产',{inputs:{y:1,z:4},output:'p',qty:1,seconds:4});m('sink-x','仓入');m('sink-p','仓入');
 e('feed','source-X','split','x');e('branch','split','stage','x',0,0,19);e('surplus','split','sink-x','x',0,1,5);e('high','source-Y','stage','x',1,0,17);e('middle','stage','end','y',0,0,9);e('stock','w','end','z',1);e('finished','end','sink-p','p');
 g.nodes.find(n=>n.id==='stage').inputPriority=[1,0];
 const r=prove(g,arith);assert(r.witnesses.some(w=>w.method==='backward-dedicated-unit-cadence'&&w.machine==='stage'&&w.period==='4'));
 assert(r.witnesses.some(w=>w.method==='fixed-preferred-inlet-cadence-refill'&&w.machine==='stage'));
 const p=compileCountProofProblem(g,arith,{rateRelations:r.relations});
 for(const [key,rate] of [['routeTotal:surplus','3/4'],['routeTotal:high','1/2'],['routeTotal:branch','1/4'],['cycle:stage','1/4'],['cycle:end','1/4']]){
  const v=projectCountInterval(p,arith,key,{ms:5000});assert.deepEqual([v.lower,v.upper],[rate,rate],key);
 }
 const fast=structuredClone(g);fast.nodes.find(n=>n.id==='end').recipe.seconds=3;fast.nodes.find(n=>n.id==='end').recipe.inputs.z=3;
 assert(!prove(fast,arith).witnesses.some(w=>w.method==='fixed-preferred-inlet-cadence-refill'&&w.machine==='stage'));
});
test('two-port splitter and merger feedback closes by finite belt space and RR count',()=>{
 const {g,m,e}=abstractFactory();
 m('input','仓出',null,'k');m('join','汇流');m('fork','分流');m('deposit','仓入');
 e('external','input','join','k',0);e('return','fork','join','k',1,0,7);e('trunk','join','fork','k');e('exit','fork','deposit','k',0,1);
 for(const L of [1,3,7,40]){
  g.lines.find(x=>x.id==='return').length=L;
  const r=prove(g,arith);assert(r.witnesses.some(w=>w.method==='two-port-merger-splitter-gap-no-skip'));
  const p=compileCountProofProblem(g,arith,{rateRelations:r.relations});
  for(const [key,rate] of [['routeTotal:external','1/2'],['routeTotal:return','1/2'],['routeTotal:trunk','1'],['routeTotal:exit','1/2']]){
   const v=projectCountInterval(p,arith,key,{ms:5000});assert.deepEqual([v.lower,v.upper],[rate,rate],key);
  }
 }
 const blocked=structuredClone(g);blocked.lines.find(e=>e.id==='exit').outFilter='bad';
 assert(!prove(blocked,arith).witnesses.some(w=>w.method==='two-port-merger-splitter-gap-no-skip'));
});
