'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {arith}=require('./run_direct'),{proveSharedStockService:prove}=require('./shared_stock_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
function solve(g,physical={},machineRates=[],duties=[]){
 const p=prove(g,arith,physical,duties);
 const r=solveDirectRateProblem(compileCountProofProblem(g,arith,{machineRates,frozenDuties:duties,frozenBounds:p.frozenBounds,stockPools:p.pools}),arith,{ms:10000});
 assert.equal(r.status,'sat',JSON.stringify(p));return {p,r};
}
const g={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[],frozen:[]};
const cases=[];
for(const input of ['0','1/8','3/4','5/4','2','15/4']){
 const x={...g,frozen:[{id:'s',rates:{x:input}},{id:'a',rates:{x:'-1/4',a:'1'}},{id:'b',rates:{x:'-1',b:'1'}}]};
 const {p,r}=solve(x),rate=arith.q(input),cap=arith.q('5/4'),d=arith.cmp(rate,cap)<0?rate:cap;
 assert.equal(r.unique['outflow:x'],arith.txt(d));assert.equal(r.unique['net:x'],arith.txt(arith.sub(rate,d)));
 if(arith.cmp(rate,cap)>=0){assert.equal(r.unique['duty:a'],'1');assert.equal(r.unique['duty:b'],'1');}
 if(input==='3/4'){assert.equal(p.frozenBounds.find(x=>x.factory==='b').lower,'1/2');assert(!Object.hasOwn(r.unique,'duty:b'));}
 cases.push({input,out:r.unique['outflow:x'],net:r.unique['net:x'],a:r.unique['duty:a']??null,b:r.unique['duty:b']??null});
}
// Shared item x; other ingredient y is independently and permanently
// abundant. No claim about the individual division of x is necessary.
const multi={...g,frozen:[{id:'s',rates:{x:'1',y:'2'}},{id:'a',rates:{x:'-1',y:'-1',a:'1'}},{id:'b',rates:{x:'-1',b:'1'}}]};
const m=solve(multi);assert.equal(m.r.unique['outflow:x'],'1');assert.equal(m.r.unique['net:x'],'0');assert(m.p.inventory.find(x=>x.item==='y').permanentlyAbundant);
const blocked=structuredClone(multi);blocked.frozen[0].rates.y='0';
const b=solve(blocked);assert(!b.p.pools.some(x=>x.item==='x'));assert.equal(b.r.unique['duty:a'],'0');
// Earlier legal physical graph. Use independently proven autonomous source
// rates, not the legacy average-priority solution. Total is determined
// without the burst/phase certificate; individual priority is NOT.
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'warehouse-burst-counterexample.json'),'utf8')),graph=fixture.graph;
const item='钛合金锭',physical=Object.fromEntries(graph.lines.filter(e=>graph.nodes.find(m=>m.id===e.from).recipe?.output===item).map(e=>['flow:'+e.id+'|'+item,'2/15']));
const a=solve(graph,physical,fixture.proof.sourceRates);
assert.equal(a.r.unique['outflow:'+item],'8/15');assert.equal(a.r.unique['net:'+item],'0');assert(!Object.hasOwn(a.r.unique,'routeTotal:R4'));
const single=structuredClone(graph);single.nodes=single.nodes.filter(m=>!['M9','M11'].includes(m.id));single.lines=single.lines.filter(e=>e.id!=='R5');single.pools.find(p=>p.item===item).order=single.pools.find(p=>p.item===item).order.filter(id=>id!=='M9');
const s=solve(single,physical,fixture.proof.sourceRates);assert.equal(s.r.unique['routeTotal:R4'],'8/15');assert.equal(s.r.unique['net:齿轮组'],'4/15');
// Mixed physical and frozen consumers share a material, with no
// additional blocking ingredient. Aggregate is still exact.
const mixed=structuredClone(graph);mixed.frozen=[{id:'f',rates:{[item]:'-1/10',z:'1'}}];
const v=solve(mixed,physical,fixture.proof.sourceRates);assert.equal(v.r.unique['outflow:'+item],'8/15');assert.equal(v.r.unique['net:'+item],'0');
const {proveWarehouseNoOverflow:envelope}=require('./warehouse_envelope_proof');
const eg=structuredClone(graph);eg.nodes=eg.nodes.filter(m=>!['M6','M7'].includes(m.id));eg.lines=eg.lines.filter(e=>e.id!=='R3');
const ep=envelope(eg,arith).certificates[0];assert(ep);assert.equal(ep.envelope.burst,3);assert.deepEqual(ep.outlets.map(x=>x.rate),['2/5','0']);
const er=solveDirectRateProblem(compileCountProofProblem(eg,arith,{machineRates:ep.sourceRates,warehouseBursts:[ep]}),arith,{ms:10000});
assert.equal(er.status,'sat');assert.equal(er.multiple.length,0);assert.equal(er.unique['net:齿轮组'],'1/5');
assert.equal(envelope(graph,arith).certificates.length,0); // Four simultaneous independent sources can overflow.
const async=structuredClone(eg);
for(const [i,id] of ['M0','M2','M4'].entries())async.nodes.find(m=>m.id===id).recipe.seconds=['15/2','11/2','7'][i];
for(const [i,id] of ['R0','R1','R2'].entries())async.lines.find(e=>e.id===id).length=[4,5,11][i];
const ap=envelope(async,arith).certificates[0];assert(ap);
assert.equal(ap.inflow,'529/1155');
assert.deepEqual(ap.outlets.map(x=>x.rate),['529/1155','0']);
const ar=solveDirectRateProblem(compileCountProofProblem(async,arith,{machineRates:ap.sourceRates,warehouseBursts:[ap]}),arith,{ms:10000});
assert.equal(ar.status,'sat');assert.equal(ar.multiple.length,0);
const critical=structuredClone(eg);for(const m of critical.nodes)if(m.type==='采矿')m.recipe.seconds=3;
assert.equal(envelope(critical,arith).certificates.length,0); // B=C and rho=1: strict sufficient test must decline.
const report={envelope:{threeSources:ep.inflow,asynchronous:ap.inflow,asynchronousGear:ar.unique["net:齿轮组"],allUnique:ar.multiple.length===0,rejectedFour:true,rejectedBoundary:true},cases,multi:{outflow:m.r.unique['outflow:x'],unknown:m.r.multiple.length},blocked:{refused:b.p.refused,duty:b.r.unique['duty:a']},physical:{outflow:a.r.unique['outflow:'+item],unknown:a.r.multiple.length},single:{gear:s.r.unique['net:齿轮组'],unknown:s.r.multiple.length},mixed:{outflow:v.r.unique['outflow:'+item],unknown:v.r.multiple.length}};
fs.writeFileSync(path.join(__dirname,'shared-stock-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
