'use strict';
const assert=require('assert/strict'),fs=require('fs');
const {arith}=require('./run_direct'),{proveRealRefillPriority:prove}=require('./real_refill_priority_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{projectCountInterval}=require('./count_interval_projection'),{compileSymbolicPhysical}=require('./symbolic_physical'),{makeWords}=require('./symbolic_bdd');
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
 const mode=require('./warehouse_mode_facts').deriveWarehouseModeFacts(g,arith,{certificates:{machineRates:[{machine:'S0',rate:'1/2',proven:true}]}});
 assert.equal(mode.status,'proved-structure');assert.equal(mode.modes.find(x=>x.factory==='f').mode,'zero-average-service');
 assert(!mode.normalPlan.frozen.some(x=>x.factory==='f'));
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
 // Verify the exact new one-step rule, not a simulated period.
 const spec={machines:[{id:'M2',type:'仓出',item:k,outPorts:[{index:0}],inputPriority:[]},{id:'M10',type:'仓出',item:k,outPorts:[{index:0}],inputPriority:[]}],routes:[],priority:['M2','M10'],frozen:[{id:'f',rates:{k:'-20',z:'20'}}],initial:'empty'};
 const m=compileSymbolicPhysical(spec,arith,{collectGuards:true,maxNodes:500000}),b=m.b,w=makeWords(b),word=f=>Array.from({length:f.bits},(_,i)=>b.variable(2*(f.offset+i))),field=id=>m.fields.find(f=>f.name===id),cur=id=>word(field(id)),next=id=>m.next.slice(field(id).offset,field(id).offset+field(id).bits),domain=m.fields.reduce((a,f)=>b.and(a,w.le(word(f),w.c(f.cap))),1),ok=(r,label)=>assert.equal(b.and(domain,b.not(r)),0,label);
 for(const id of spec.priority){
  const c=cur(id+'.refill'),d=next(id+'.refill'),q=cur(id+'.outletBuffer'),qq=next(id+'.outletBuffer'),r=m.rewards['refill:'+id];
  ok(w.eq(w.add(d,[w.nonzero(c)]),w.add(c,w.mul(r,20))),'refill clock balance');
  ok(w.eq(qq,w.add(q,r)),'unwired real buffer balance');
  assert.equal(m.initial.slice(field(id+'.refill').offset,field(id+'.refill').offset+field(id+'.refill').bits).reduce((a,v,i)=>a+v*2**i,0),20);
 }
 const high=m.guards['refilled:M2'],low=m.guards['refilled:M10'],blocked=m.guards['refillFull:M2'],cool=m.guards['refillCooling:M2'];
 ok(b.or(b.not(low),b.or(high,b.or(blocked,cool))),'lower refill implies higher refill or unavailable capacity');
 const one=w.eq(cur('stock:k'),w.c(1)),ready=b.and(w.le(cur('M2.refill'),w.c(1)),w.lt(cur('M2.outletBuffer'),w.c(3)));
 ok(b.or(b.not(b.and(one,ready)),b.and(high,b.and(b.not(low),b.not(w.nonzero(m.rewards['service:f']))))),'physical first, all frozen rates stop');
 result.push({name:'symbolic physical priority and real FIFO',bits:m.next.length,nodes:b.size()});
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
fs.writeFileSync(__dirname+'/real-refill-priority-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
