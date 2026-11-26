'use strict';
const assert=require('assert/strict'),fs=require('fs');
const {arith,proveRealRefillPriority:prove,compileCountProofProblem,projectCountInterval}=require('../support/production');
const result=[];
const k='k';
function graph(rates,freeCount,{blockedFirst=false,frozenSupply=false,unwiredFirst=false}={}){
 const nodes=[],lines=[],frozen=[{id:'f',rates:{k:'-1',z:'1'}}];
 if(frozenSupply)frozen.unshift({id:'fs',rates:{k:'1/4'}});
 const m=(id,type,extra={})=>nodes.push({id,type,physicalInCount:0,physicalOutCount:0,...extra});
 const e=(id,from,to)=>{lines.push({id,from,to,materials:[k],compatible:true,active:true,length:1});nodes.find(x=>x.id===from).physicalOutCount++;nodes.find(x=>x.id===to).physicalInCount++;};
 rates.forEach((s,i)=>{m('S'+i,'生产',{recipe:{inputs:{},output:k,qty:1,seconds:s}});m('W'+i,'仓入');e('a'+i,'S'+i,'W'+i);});
 if(unwiredFirst)m('M0','仓出',{item:k});
 for(let i=1;i<=freeCount;i++){m('M'+i,'仓出',{item:k});m('C'+i,blockedFirst&&i===1?'组装':'电脑',blockedFirst&&i===1?{recipe:{inputs:{k:1},output:'other',qty:1,seconds:1}}:{});e('r'+i,'M'+i,'C'+i);}
 return {status:'compiled',completePhysicalRoutes:true,unlimited:false,nodes,lines,frozen,pools:[{item:k,order:Array.from({length:freeCount},(_,i)=>'M'+(i+1))}]};
}
function check(g){
 const p=prove(g),problem=compileCountProofProblem(g,arith,{rateRelations:p.relations,machineRates:g.nodes.filter(m=>m.id.startsWith('S')).map(m=>({machine:m.id,rate:arith.txt(arith.div(arith.U,arith.q(m.recipe.seconds))),proven:true}))});
 const interval=q=>{const x=projectCountInterval(problem,arith,q,{ms:10000});assert.equal(x.status,'interval',JSON.stringify(x));return [x.lower,x.upper];};
 return {p,interval};
}
{
 const g=graph([2],3,{unwiredFirst:true}),{p,interval}=check(g);
 assert.equal(p.items[0].freePrefix,3);
 assert.deepEqual(interval('flow:r1|k'),['1/2','1/2']);
 for(const q of ['flow:r2|k','flow:r3|k','duty:f','net:k'])assert.deepEqual(interval(q),['0','0'],q);
 result.push({name:'one physical input, arbitrary lower-priority consumers',relations:p.relations.length,first:interval('flow:r1|k'),frozen:interval('duty:f')});
}
{
 const {p,interval}=check(graph([2,3],3));
 assert.deepEqual(interval('flow:r3|k'),['0','0']);assert.deepEqual(interval('duty:f'),['0','0']);
 assert.deepEqual(interval('flow:r1|k'),['1/2','5/6']);assert.deepEqual(interval('flow:r2|k'),['0','1/3']);
 result.push({name:'two physical inputs, priority-prefix bounds',first:interval('flow:r1|k'),second:interval('flow:r2|k'),third:interval('flow:r3|k'),frozen:interval('duty:f')});
}
{
 const {p,interval}=check(graph([2],2,{frozenSupply:true}));
 assert.deepEqual(interval('flow:r1|k'),['1/2','3/4']);assert.deepEqual(interval('duty:f'),['0','1/4']);
 result.push({name:'late frozen production is not a physical input',first:interval('flow:r1|k'),frozen:interval('duty:f')});
}
{
 const {p,interval}=check(graph([2],2,{blockedFirst:true}));assert.equal(p.items[0].freePrefix,0);
 assert.deepEqual(interval('flow:r2|k'),['0','1/2']);
 result.push({name:'blocked high-priority outlet does not falsely monopolize',second:interval('flow:r2|k')});
}
{
 const g=graph([2],2);
 // A mixed accepted material is still rate-limited by the same inlet.
 g.lines[0].materials=[k,'other'];g.lines[0].compatible=false;g.lines[0].acceptedMaterials=[k,'other'];
 const {p,interval}=check(g);
 assert(p.relations.some(r=>r.method==='physical-arrival-window-prefix'&&r.arrivals.includes('a0')));
 assert.deepEqual(interval('flow:r1|k'),['1/2','1/2']);assert.deepEqual(interval('flow:r2|k'),['0','0']);
 result.push({name:'mixed physical arrival envelope',first:interval('flow:r1|k')});
}
console.log(JSON.stringify(result));
