'use strict';
// Pure algebra checks for the phase theorem. This enumerates small
// abstract offset vectors ONLY as independent tests, not as the solver.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const {factoryDirectBatchRefillCertificates,factoryDirectSupplyIntervals}=require('./batch_ready_certificate');
const {arith}=require('./run_direct');
let phaseCases=0,invalidCases=0;
function* vectors(n,p,prefix=[]){if(!n){yield prefix;return;}for(let i=0;i<=p;i++)yield* vectors(n-1,p,[...prefix,i]);}
for(let n=2;n<=5;n++)for(let batch=1;batch<=12;batch++)for(let p=2;p<=5;p++){
 const rounds=Math.ceil(batch/n);
 for(const gap of [rounds*p,rounds*p+1,(rounds+1)*p]){
  if(n*gap<=batch*p)continue;
  for(const offsets of vectors(n,p)){
   const events=offsets.flatMap((d,i)=>Array.from({length:rounds+1},(_,j)=>[d+j*p,i])).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).slice(0,batch);
   const counts=Array(n).fill(0);for(const [t,i] of events)counts[i]++;
   const next=offsets.map((d,i)=>counts[i]?Math.max(0,d+counts[i]*p-gap):0);
   assert(events.at(-1)[0]<=gap);
   // Test rational phase endpoints, including exact simultaneous boundary ties.
   if(offsets.some(d=>d>0)){
    if(batch%n)assert(next.filter(v=>v>0).length<offsets.filter(v=>v>0).length,JSON.stringify({n,batch,p,gap,offsets,counts,next}));
    else{const eps=gap-rounds*p,potential=vs=>vs.reduce((a,b)=>a+Math.ceil(b/eps),0);assert(potential(next)<potential(offsets),JSON.stringify({n,batch,p,gap,offsets,counts,next}));}
   }else{assert.deepEqual(counts,offsets.map((_,i)=>Math.floor(batch/n)+(i<batch%n?1:0)));assert(next.every(v=>v===0));}
   phaseCases++;
  }
 }
}
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
c.ast=fs.readFileSync(path.join(__dirname,'double-inlet.ast1.txt'),'utf8').trim();
const g=JSON.parse(vm.runInContext('state=ast1Decode(ast);JSON.stringify(factoryCompileDirectGraph())',c));
assert.equal(factoryDirectBatchRefillCertificates(g,arith).length,1);
const target=g.nodes.find(m=>m.recipe?.inputs?.['小行星矿石']===3).id;
const source=g.lines.find(e=>e.to===target).from;
for(const [label,change] of [
 ['slow source',x=>x.nodes.find(m=>m.id===source).recipe.seconds=4],
 ['splitter upstream',x=>x.nodes.find(m=>m.id===source).recipe=null],
 ['too short recipe period',x=>x.nodes.find(m=>m.id===target).recipe.seconds=1.5],
 ['no aggregate slack',x=>{const r=x.nodes.find(m=>m.id===target).recipe;r.inputs['小行星矿石']=4;r.seconds=2;}],
 ['unvalidated graph',x=>x.completePhysicalRoutes=false],
 ['other physical output',x=>x.nodes.find(m=>m.id===source).physicalOutCount=2],
 ['extra physical inlet',x=>x.nodes.find(m=>m.id===source).physicalInCount=1],
 ['mixed input',x=>x.lines.find(e=>e.from===source).materials.push('钛合金锭')],
 ['inactive input',x=>x.lines.find(e=>e.from===source).active=false],
 ['unknown belt length',x=>delete x.lines.find(e=>e.from===source).length],
 ['incompatible belt',x=>x.lines.find(e=>e.from===source).compatible=false],
 ['duplicate port',x=>{const es=x.lines.filter(e=>e.to===target);es[0].toPort=es[1].toPort;}],
 ['missing priority',x=>delete x.nodes.find(m=>m.id===target).inputPriority],
]){
 const x=structuredClone(g);change(x);assert.equal(factoryDirectBatchRefillCertificates(x,arith).length,0,label);invalidCases++;
}
const nongrid=structuredClone(g);nongrid.nodes.find(m=>m.id===target).recipe.seconds='2001/1000';assert.equal(factoryDirectBatchRefillCertificates(nongrid,arith).length,1);
nongrid.nodes.find(m=>m.id===source).recipe.seconds='2999/1000';assert.equal(factoryDirectBatchRefillCertificates(nongrid,arith).length,1);
// Test arbitrary graph depth; these are symbolic topology fixtures, not AST layouts.
function serial(g,id,kind){
 const e=g.lines.find(x=>x.id===id),nodeId='relay'+g.nodes.length,oldTo=e.to,oldPort=e.toPort;
 e.to=nodeId;e.toPort=0;
 const ne={...e,id:id+'-next',from:nodeId,fromPort:0,to:oldTo,toPort:oldPort};
 g.nodes.push({id:nodeId,type:kind,recipe:null,physicalInCount:1,physicalOutCount:1,inputPriority:[0]});g.lines.push(ne);return ne.id;
}
const chain=structuredClone(g);let eid=chain.lines.find(e=>e.from===source).id;
for(let i=0;i<24;i++)eid=serial(chain,eid,i%2?'汇流':'分流');
assert.equal(factoryDirectSupplyIntervals(chain,arith).get(eid).interval,'1');
assert.equal(factoryDirectBatchRefillCertificates(chain,arith).length,1);
const merge=structuredClone(g),feed=merge.lines.find(e=>e.from===source),outId=serial(merge,feed.id,'汇流'),mid=feed.to;
merge.nodes.push({id:'slowMiner',type:'采矿',recipe:{output:feed.materials[0],qty:1,seconds:'15/2',inputs:{}},physicalInCount:0,physicalOutCount:1,inputPriority:[]});
merge.lines.push({...feed,id:'slow-feed',from:'slowMiner',to:mid,toPort:1});merge.nodes.find(m=>m.id===mid).physicalInCount=2;
assert.equal(factoryDirectSupplyIntervals(merge,arith).get(outId).interval,'1');assert.equal(factoryDirectBatchRefillCertificates(merge,arith).length,1);
const branch=JSON.parse(fs.readFileSync(path.join(__dirname,'legal-net-branch.json'),'utf8'));
c.layout=branch.layout;
const bg=JSON.parse(vm.runInContext('state=layout;JSON.stringify(factoryCompileDirectGraph())',c));
const bounds=factoryDirectSupplyIntervals(bg,arith);
assert.equal(bounds.get('R1').interval,'3');assert.equal(bounds.get('R3').interval,'1');
assert.equal(factoryDirectBatchRefillCertificates(bg,arith).length,0);
const quiet=structuredClone(bg),r=quiet.nodes.find(m=>m.id==='M4').recipe;r.seconds='9';r.inputs['小行星矿石']=1;
assert.equal(factoryDirectBatchRefillCertificates(quiet,arith).length,1);
console.log(JSON.stringify({phaseCases,invalidCases,nonGridRational:true,relayDepth:24,branchIntervals:[bounds.get('R1').interval,bounds.get('R3').interval],quietBatch:true}));
fs.writeFileSync(path.join(__dirname,'direct-refill-proof-tests.json'),JSON.stringify({phaseCases,invalidCases,nonGridRational:true,relayDepth:24,branchIntervals:['3','1'],quietBatch:true},null,2));
