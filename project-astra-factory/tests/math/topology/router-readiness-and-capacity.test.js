'use strict';
const assert=require('assert/strict'),fs=require('fs');
const {arith}=require('../support/production'),{proveSaturatedRouterCounts:prove}=require('../support/production'),{compileCountProofProblem}=require('../support/production'),{projectCountInterval}=require('../support/production');
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
 const p=check(g,expected);assert.equal(p.witnesses.filter(w=>w.method==='ready-inlet-free-merger').length,1);
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
 const range=projectCountInterval(problem,arith,'routeTotal:a',{ms:5000});assert.equal(range.lower,'9/20');assert.equal(range.upper,'9/20'); // Shared-root clock proves slow branch 1/10 without an injected equality.
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
 const {proveRecipeTree}=require('../support/production'),stages=[{b:1,T:1,length:4,to:null,a:0}];
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
// A free branch of each splitter may be certified by a bounded
// arrival envelope at a common merger; the other branch is arbitrary.
{
 const {g,m,e}=graph();m('merge','汇流');m('sink','仓入');
 for(let j=0;j<3;j++){
  const k='x'+j;m('p'+j,'生产',src(k,1,j+3));m('sp'+j,'分流');m('blocked'+j,'生产',{inputs:{[k]:1},qty:1,seconds:100,output:'z'+j});
  e('feed'+j,'p'+j,'sp'+j,[k],0,0,4);e('free'+j,'sp'+j,'merge',[k],j,0,1+j);e('other'+j,'sp'+j,'blocked'+j,[k],0,1,2);
 }
 e('out','merge','sink',['x0','x1','x2']);
 const p=prove(g,arith);assert(['feed0','feed1','feed2'].every(x=>p.freeReceiverRoutes.includes(x)));
 assert(p.witnesses.some(x=>x.method==='free-merger-unit-envelope-dispatch'&&x.checks.every(c=>c.split)));
 const overload=structuredClone(g);overload.nodes.filter(m=>m.id.startsWith('p')).forEach(m=>m.recipe.seconds=2);
 assert(!prove(overload,arith).witnesses.some(x=>x.method==='free-merger-unit-envelope-dispatch'));
 reports.push({case:'splitter branch inherits sparse unit producer gap'});
}
// Long physical lag must not expand hundreds of ordinal vertices when
// a basic clock cycle plus a feasible potential already prove the ratio.
{
 const {proveRecipeTree}=require('../support/production');
 const stages=[{b:1,T:1,length:200,to:1,a:2},{b:1,T:2,length:250,to:null,a:0}];
 const r=proveRecipeTree(stages,arith,{clock:'fixed-tick',maxNodes:30});
 assert.equal(r.status,'proved',JSON.stringify(r));assert.equal(r.method,'original-lag-clock-potential');assert.deepEqual(r.stageRates,['1','1/2']);assert(r.expandedVertices<=30);
 reports.push({case:'original weighted lag avoids expansion',vertices:r.vertices,rate:r.stageRates});
}
{
 const {g,m,e}=graph(),{run}=require('../support/production');
 m('w','仓出',null,'ore');m('s','分流');m('make','生产',{inputs:{ore:1},output:'metal',qty:1,seconds:4});m('sink','仓入');m('other','生产',{inputs:{ore:1},output:'waste',qty:1,seconds:100});
 e('root','w','s',['ore']);e('branch','s','make',['ore'],0,0,4);e('other','s','other',['ore'],0,1,3);e('out','make','sink',['metal']);
 g.unlimited=true;
 const certify=x=>JSON.parse(run('JSON.stringify((g=>proveBoundedSharedRootTrees(g,factoryDirectArithmetic(),proveSaturatedRouterCounts(g,factoryDirectArithmetic()).sharedRootCertificates))('+JSON.stringify(x)+'))'));
 const r=certify(g);assert(r.certificates.some(x=>x.machine==='make'&&x.rate==='1/4'));assert.equal(r.witnesses[0].upper,r.witnesses[0].lower);
 const fast=structuredClone(g);fast.nodes.find(x=>x.id==='make').recipe.seconds=1;
 assert(!certify(fast).certificates.some(x=>x.machine==='make'));
 const scarce=structuredClone(g);scarce.unlimited=false;assert.equal(certify(scarce).certificates.length,0);
 const abundant=JSON.parse(run('JSON.stringify((g=>proveBoundedSharedRootTrees(g,factoryDirectArithmetic(),proveSaturatedRouterCounts(g,factoryDirectArithmetic(),{abundantItems:["ore"]}).sharedRootCertificates,{abundantItems:["ore"]}))('+JSON.stringify(scarce)+'))'));
 assert(abundant.certificates.some(x=>x.machine==='make'&&x.rate==='1/4'));
 reports.push({case:'bounded shared splitter root, equal slopes only'});
}
// At its round-robin spacing, a highest-priority shared ingredient
// port cannot backpressure a splitter with a permanently free sibling.
{
 const {g,m,e}=graph();
 m('s','生产',src('ore',3,3));m('other','生产',src('ore',1,1));m('sp','分流');
 m('make','生产',{inputs:{ore:2},output:'metal',qty:1,seconds:1.5});m('sink','仓入');m('w','仓入');
 g.nodes.find(x=>x.id==='make').inputPriority=[2,0];
 e('root','s','sp',['ore'],0,0,4);e('branch','sp','make',['ore'],2,0,4);e('direct','sp','w',['ore'],0,1,1);e('other','other','make',['ore'],0,0,7);e('out','make','sink',['metal']);
 const r=check(g,{'routeTotal:root':'1','routeTotal:branch':'1/2','routeTotal:direct':'1/2'});
 assert(r.witnesses.some(x=>x.method==='priority-recipe-inlet-at-splitter-gap'&&x.delay==='31/20'));
 for(const modify of [x=>x.inputPriority=[0,2],x=>x.recipe.seconds=2,x=>x.recipe.inputs.ore=1,x=>x.recipe.qty=2]){
  const bad=structuredClone(g);modify(bad.nodes.find(x=>x.id==='make'));
  assert(!prove(bad,arith).witnesses.some(x=>x.method==='priority-recipe-inlet-at-splitter-gap'));
 }
 reports.push({case:'priority recipe inlet splitter gap, reject reversed priority or inadequate service'});
}
// Composition: two 2s unit-batch producers fed by private saturated
// sources plus a shared saturated source. The downstream merger's
// service clock survives backpressure. A second 2s clock and that
// 1s clock jointly make the terminal recipe's ingredients ready.
{
 const {g,m,e}=graph();
 for(let i=0;i<3;i++)m('ore'+i,'生产',src('ore',3,3));
 m('sp','分流');m('a','生产',{inputs:{ore:3},output:'metal',qty:1,seconds:2});m('b','生产',{inputs:{ore:3},output:'metal',qty:1,seconds:2});
 m('merge','汇流');m('other','生产',src('metal',1,2));m('consumer','生产',{inputs:{metal:2},output:'product',qty:1,seconds:1.5});m('sink','仓入');
 e('root','ore0','sp',['ore']);e('sa','sp','a',['ore'],0,0,3);e('sb','sp','b',['ore'],0,1,5);e('pa','ore1','a',['ore'],1);e('pb','ore2','b',['ore'],1);
 e('a','a','merge',['metal'],0,0,2);e('b','b','merge',['metal'],1,0,9);e('mix','merge','consumer',['metal'],0);e('p','other','consumer',['metal'],1);e('out','consumer','sink',['product']);
 // Direct slow autonomous sources are not yet part of this new clock
 // contract; supply the second branch via a ready ingredient unit recipe.
 m('raw','生产',src('raw',1,1));g.nodes.find(x=>x.id==='other').recipe={inputs:{raw:2},output:'metal',qty:1,seconds:2};e('raw','raw','other',['raw']);
 const r=check(g,{'cycle:consumer':'2/3','routeTotal:out':'2/3'});
 assert(r.witnesses.some(x=>x.method==='composed-merger-receipt-clock'&&x.machine==='merge'));
 const bad=structuredClone(g);bad.nodes.find(x=>x.id==='consumer').recipe.seconds=1;
 assert(!prove(bad,arith).relations.some(x=>x.method==='composed-ingredient-ready-free-recipe'&&x.coefficients['cycle:consumer']));
 reports.push({case:'composed backpressure-independent service clocks'});
}
console.log(JSON.stringify(reports));
