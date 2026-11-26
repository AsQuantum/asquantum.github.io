'use strict';
const assert=require('assert/strict'),fs=require('fs');
const {arith}=require('./run_direct'),{proveSaturatedRouterCounts:prove}=require('./saturated_router_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{projectCountInterval}=require('./count_interval_projection');
function graph(){const g={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[],frozen:[],unlimited:false};
 const m=(id,type,recipe,item)=>{g.nodes.push({id,type,recipe,item,physicalInCount:0,physicalOutCount:0});return id};
 const e=(id,from,to,materials,toPort=0,fromPort=0,length=1)=>{g.lines.push({id,from,to,materials,rawMaterials:materials.slice(),acceptedMaterials:materials.slice(),length,toPort,fromPort,compatible:materials.length===1,active:true});g.nodes.find(x=>x.id===from).physicalOutCount++;g.nodes.find(x=>x.id===to).physicalInCount++;return id};
 return {g,m,e};
}
const src=(output,qty,seconds)=>({inputs:{},output,qty,seconds});
function check(g,known={},relations=[]){
 const p=prove(g,arith),c=compileCountProofProblem(g,arith,{rateRelations:[...p.relations,...relations]});
 for(const [k,v] of Object.entries(known)){const r=projectCountInterval(c,arith,k,{ms:5000});assert.equal(r.status,'interval',JSON.stringify(r));assert.equal(r.lower,v,k);assert.equal(r.upper,v,k);}
 return p;
}
const reports=[];
for(const n of [1,2,3]){
 const {g,m,e}=graph();m('merge','汇流');m('sink','仓入');const mats=[];
 for(let j=0;j<n;j++){const k='k'+j;m('s'+j,'生产',src(k,j+1,j+1));e('in'+j,'s'+j,'merge',[k],j,0,1+j*7);mats.push(k);}
 e('out','merge','sink',mats);
 const expected={'routeTotal:out':'1'};
 for(let j=0;j<n;j++)expected['routeTotal:in'+j]=n===1?'1':'1/'+n;
 const p=check(g,expected);assert.equal(p.witnesses.length,1);
 reports.push({case:n+' saturated autonomous inputs',rates:expected});
 const bad=structuredClone(g);bad.lines.at(-1).acceptedMaterials=[];assert.equal(prove(bad,arith).relations.length,0);
}
{
 const {g,m,e}=graph();m('a','生产',src('k',3,3));m('b','生产',src('k',1,1));m('c','生产',src('k',1,10));m('merge','汇流');m('sink','仓入');
 e('a','a','merge',['k'],0);e('b','b','merge',['k'],1);e('c','c','merge',['k'],2);e('out','merge','sink',['k']);
 const p=check(g,{'routeTotal:out':'1','routeTotal:a':'9/20','routeTotal:b':'9/20'},[{proven:true,ruleVersion:'real-outlet-buffer-20261125',sense:'eq',coefficients:{'routeTotal:c':1},constant:'1/10'}]);
 assert(p.relations.some(x=>x.method==='saturated-merger-unskipped-round-robin'));
 const q=compileCountProofProblem(g,arith,{rateRelations:p.relations});
 const a=projectCountInterval(q,arith,'routeTotal:a',{ms:5000});
 assert.equal(a.lower,'9/20');assert.equal(a.upper,'1/2');reports.push({case:'two saturated, one unresolved slower source',saturatedRange:[a.lower,a.upper]});
}
{
 const {g,m,e}=graph();m('s','生产',src('k',2,3));m('sp','分流');m('sp2','分流');m('w1','仓入');m('w2','仓入');m('w3','仓入');m('w4','仓入');
 e('root','s','sp',['k']);e('first','sp','w1',['k'],0,0);e('branch','sp','sp2',['k'],0,2);
 for(let j=0;j<3;j++)e('leaf'+j,'sp2','w'+(j+2),['k'],0,j);
 const expected={'routeTotal:root':'2/3','routeTotal:first':'1/3','routeTotal:branch':'1/3','routeTotal:leaf0':'1/9','routeTotal:leaf1':'1/9','routeTotal:leaf2':'1/9'};
 check(g,expected);reports.push({case:'two-level unblocked splitter tree',rates:expected});
 const bad=structuredClone(g);bad.lines.find(x=>x.id==='leaf0').outFilter='wrong';assert(!prove(bad,arith).witnesses.some(x=>x.method==='unblocked-homogeneous-splitter-tree'));
}
{
 const {g,m,e}=graph();m('a','仓出',null,'k');m('b','生产',src('k',1,1));m('merge','汇流');m('sink','仓入');
 e('a','a','merge',['k'],0);e('b','b','merge',['k'],1);e('out','merge','sink',['k']);
 assert.equal(prove(g,arith).witnesses[0].ready.length,1);
 assert.equal(prove(g,arith,{abundantItems:['k']}).witnesses[0].ready.length,2);
 g.unlimited=true;check(g,{'routeTotal:a':'1/2','routeTotal:b':'1/2'});
 reports.push({case:'warehouse readiness conditional on stock'});
}
// A slow or permanently blocked branch does not stop a free homogeneous
// branch. Its actual rate is not assumed; derive residual sharing.
{
 const {g,m,e}=graph();m('s','生产',src('k',1,1));m('sp','分流');m('w1','仓入');m('w2','仓入');m('slow','生产',{inputs:{k:1},output:'x',qty:1,seconds:10});
 e('input','s','sp',['k']);e('a','sp','w1',['k'],0,0);e('b','sp','w2',['k'],0,1);e('c','sp','slow',['k'],0,2);
 // No terminal for the slow recipe: bounded output -> zero flow.
 const p=check(g,{'routeTotal:input':'1','routeTotal:a':'1/2','routeTotal:b':'1/2','routeTotal:c':'0'});
 assert(p.witnesses.some(x=>x.method==='partial-splitter-free-path'));
 m('w3','仓入');e('slow-out','slow','w3',['x']);
 const r=check(g,{'routeTotal:input':'1','routeTotal:a':'9/20','routeTotal:b':'9/20','routeTotal:c':'1/10'},[{proven:true,ruleVersion:'real-outlet-buffer-20261125',sense:'eq',coefficients:{'routeTotal:c':1},constant:'1/10'}]);
 const problem=compileCountProofProblem(g,arith,{rateRelations:r.relations});
 const range=projectCountInterval(problem,arith,'routeTotal:a',{ms:5000});assert.equal(range.lower,'9/20');assert.equal(range.upper,'1/2');
 const bad=structuredClone(g);bad.lines.find(x=>x.id==='c').outFilter='wrong';
 assert(!prove(bad,arith).witnesses.some(x=>x.method==='partial-splitter-free-path'));
 reports.push({case:'two free outputs and one blocked or slow branch',range:[range.lower,range.upper]});
}
// Cascading saturated mergers: the first output is blocked by the
// second merger. Equal input shares do not require a free output.
{
 const {g,m,e}=graph();for(const id of ['a','b','c'])m(id,'生产',src('k',1,1));
 m('m1','汇流');m('m2','汇流');m('sink','仓入');
 e('a','a','m1',['k'],0,0,17);e('b','b','m1',['k'],1);e('mid','m1','m2',['k'],0,0,4);e('c','c','m2',['k'],1,0,9);e('out','m2','sink',['k']);
 const expected={'routeTotal:a':'1/4','routeTotal:b':'1/4','routeTotal:mid':'1/2','routeTotal:c':'1/2','routeTotal:out':'1'};
 const p=check(g,expected);assert(p.witnesses.some(x=>x.machine==='m1'&&x.method==='ready-inlet-backpressured-merger'));
 reports.push({case:'cascaded saturated mergers',rates:expected});
}
{
 const {g,m,e}=graph();m('a','生产',src('k',1,1));m('b','生产',src('k',1,1));m('m','汇流');m('slow','生产',{inputs:{k:1},output:'x',qty:1,seconds:10});m('sink','仓入');
 e('a','a','m',['k'],0);e('b','b','m',['k'],1);e('mid','m','slow',['k']);e('out','slow','sink',['x']);
 const p=check(g,{'routeTotal:a':'1/20','routeTotal:b':'1/20'},[{proven:true,ruleVersion:'real-outlet-buffer-20261125',sense:'eq',coefficients:{'routeTotal:mid':1},constant:'1/10'}]);
 assert(!p.relations.some(x=>x.method==='ready-inlet-free-merger-saturation'));
 reports.push({case:'backpressured merger equal shares, known downstream rate'});
}
// A recipe with enough dedicated saturated inputs replenishes its entire
// next batch before finishing. It too can certify a ready output.
{
 const {g,m,e}=graph();m('a','生产',src('a',1,1));m('b','生产',src('b',1,1));m('make','生产',{inputs:{a:1,b:2},output:'k',qty:2,seconds:2});
 m('other','生产',src('k',1,1));m('merge','汇流');m('sink','仓入');
 e('a','a','make',['a'],0);e('b','b','make',['b'],1);e('made','make','merge',['k'],0);e('other','other','merge',['k'],1);e('out','merge','sink',['k']);
 const p=check(g,{'routeTotal:made':'1/2','routeTotal:other':'1/2','routeTotal:a':'1/4','routeTotal:b':'1/2'});
 assert(p.witnesses.some(x=>x.method==='recipe-output-ready-from-ready-ingredients'));
 assert.equal(p.boundedReceiverRoutes.length,2);
 const bad=structuredClone(g);bad.nodes.find(x=>x.id==='make').recipe.inputs.b=3;
 assert(!prove(bad,arith).witnesses.some(x=>x.method==='recipe-output-ready-from-ready-ingredients'));
 reports.push({case:'independently replenished recipe readiness'});
}
// A pessimistic delay bound alone must never become an actual rate.
{
 const {proveRecipeTree}=require('./recipe_tree_proof'),stages=[{b:1,T:1,length:4,to:null,a:0}];
 const fast=proveRecipeTree(stages,arith,{clock:'fixed-tick'}),slow=proveRecipeTree(stages,arith,{clock:'fixed-tick',terminalWait:'2'});
 assert.equal(fast.status,'proved');assert.equal(slow.status,'proved');assert.equal(fast.stageRates[0],'1');assert.equal(slow.stageRates[0],'1/3');
 reports.push({case:'different bounding slopes cannot certify actual rate'});
}
// Unit-output recipes with arbitrary independent release phases. A
// critical shared merger does not block the producer dispatch if each
// incoming belt absorbs the aggregate backlog or is independently sparse.
{
 const {g,m,e}=graph();
 m('a','生产',src('a',1,2.5));m('b','生产',src('b',1,2.5));m('p','生产',src('raw',1,1));m('c','生产',{inputs:{raw:5},output:'c',qty:1,seconds:3});m('merge','汇流');m('sink','仓入');
 e('a','a','merge',['a'],0,0,20);e('b','b','merge',['b'],1,0,12);e('p','p','c',['raw']);e('c','c','merge',['c'],2,0,1);e('out','merge','sink',['a','b','c']);
 const r=prove(g,arith);assert.deepEqual(r.freeReceiverRoutes.sort(),['a','b','c']);
 const w=r.witnesses.find(x=>x.method==='free-merger-unit-envelope-dispatch');assert.equal(w.capacity,'1');assert(w.checks.find(x=>x.route==='c').sparse);
 const bad=structuredClone(g);bad.nodes.find(x=>x.id==='c').recipe.inputs.raw=4;
 assert(!prove(bad,arith).witnesses.some(x=>x.method==='free-merger-unit-envelope-dispatch'));
 const short=structuredClone(g);short.lines.find(x=>x.id==='a').length=1;
 assert(prove(short,arith).witnesses.some(x=>x.method==='free-merger-unit-envelope-dispatch'&&x.receiveDelay==='1/10'));
 const incompatible=structuredClone(g);incompatible.lines.at(-1).acceptedMaterials=['a','b'];
 assert(!prove(incompatible,arith).witnesses.some(x=>x.method==='free-merger-unit-envelope-dispatch'));
 reports.push({case:'unit envelope critical merger, overload and compatibility rejection',certificate:w});
}
// Shared ore, two private saturated feeds, two smelters at the exact
// aggregate demand limit. Their free merged output may be short.
{
 const {g,m,e}=graph();
 for(const id of ['p','q','s'])m(id,'生产',src('ore',3,3));
 m('sp','分流');m('a','生产',{inputs:{ore:3},output:'metal',qty:1,seconds:2});m('b','生产',{inputs:{ore:3},output:'metal',qty:1,seconds:2});m('merge','汇流');m('sink','仓入');
 e('root','s','sp',['ore']);e('sa','sp','a',['ore'],0,0,5);e('sb','sp','b',['ore'],0,1,3);e('pa','p','a',['ore'],1,0,6);e('pb','q','b',['ore'],1,0,2);
 e('a','a','merge',['metal'],0,0,1);e('b','b','merge',['metal'],1,0,8);e('out','merge','sink',['metal']);
 const r=check(g,{'cycle:a':'1/2','cycle:b':'1/2','routeTotal:out':'1','routeTotal:root':'1','routeTotal:sa':'1/2','routeTotal:sb':'1/2'});
 assert.equal(r.witnesses.filter(x=>x.method==='parallel-private-and-shared-splitter-refill').length,2);
 const bad=structuredClone(g);bad.lines.find(x=>x.id==='sa').length=20;
 assert(!prove(bad,arith).witnesses.some(x=>x.method==='parallel-private-and-shared-splitter-refill'&&x.machine==='a'));
 reports.push({case:'parallel private and shared ore at exact capacity',rates:'both 1/2'});
}
fs.writeFileSync(__dirname+'/saturated-router-results.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
