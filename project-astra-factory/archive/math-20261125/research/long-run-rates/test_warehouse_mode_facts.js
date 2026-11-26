'use strict';
const fs=require('fs'),assert=require('assert/strict'),{arith}=require('./run_direct'),{deriveWarehouseModeFacts:derive}=require('./warehouse_mode_facts');
const f=(id,rates)=>({id,rates}),graph=frozen=>({status:'compiled',completePhysicalRoutes:true,unlimited:false,nodes:[],lines:[],pools:[],frozen});
const test=(name,g,fn,certificates={})=>{const r=derive(g,arith,{certificates});assert.equal(r.status,'proved-structure',JSON.stringify(r));fn(r);return {name,netLower:r.netLower,dutyBounds:r.dutyBounds,modes:r.modes,rounds:r.rounds,groupsBefore:r.base.stages.map(x=>x.members),groupsAfter:r.plan.stages.map(x=>x.members),densityOneGroups:r.normalPlan.stages.map(x=>x.members)};};
const report=[];
report.push(test('joint scarcity reduces actual demand',graph([f('s',{a:'1',b:'1/10'}),f('x',{a:'-5',b:'-1',c:'1'}),f('y',{a:'-5',b:'-1',d:'1'})]),r=>{
 assert.equal(r.netLower.a,'1/2');assert.equal(r.dutyBounds.x.upper,'1/10');assert.equal(r.dutyBounds.y.upper,'1/10');
 assert(!r.base.pools.find(p=>p.item==='a').permanentAbundance);assert(r.plan.pools.find(p=>p.item==='a').permanentAbundance);
 assert.deepEqual(r.modes.find(x=>x.factory==='x').possibleLimitingInputs,['b']);
 assert(!r.netLower.b);assert(r.plan.stages.some(x=>x.members.includes('F:x')&&x.members.includes('F:y')));
}));
report.push(test('zero duty deletes direct service effects, not reachability graph',graph([f('s',{a:'1'}),f('x',{a:'-1',b:'-1',c:'1'}),f('y',{a:'-1',d:'1'})]),r=>{
 assert.equal(r.modes.find(x=>x.factory==='x').mode,'zero-average-service');
 assert(r.plan.frozen.some(x=>x.factory==='x'));assert(!r.normalPlan.frozen.some(x=>x.factory==='x'));
 assert(!r.netLower.a);assert(!r.netLower.b);
}));
report.push(test('full duty does not remove joint protection',graph([f('s',{a:'1',b:'1'}),f('x',{a:'-1',b:'-1',c:'1'}),f('y',{a:'-1',d:'1'})]),r=>{
 assert.equal(r.modes.find(x=>x.factory==='x').mode,'full-average-service');
 assert(r.modes.find(x=>x.factory==='x').preserveProtectionCoupling);
 assert.deepEqual(r.modes.find(x=>x.factory==='x').possibleLimitingInputs,['a','b']);
 assert.equal(r.modes.find(x=>x.factory==='y').mode,'zero-average-service');
 assert(!r.netLower.a&&!r.netLower.b);
},{frozenDuties:[{factory:'x',duty:'1',proven:true}]}));
report.push(test('certified surplus propagates through dependent production',graph([f('s',{a:'2'}),f('x',{a:'-1',b:'2'}),f('y',{b:'-1',c:'2'}),f('z',{c:'-1',d:'1'})]),r=>{
 assert.deepEqual(r.rounds.flatMap(x=>x.fullDutyAdded),['x','y','z']);
 assert.equal(r.netLower.a,'1');assert.equal(r.netLower.b,'1');assert.equal(r.netLower.c,'1');
 for(const id of ['x','y','z'])assert.deepEqual(r.dutyBounds[id],{lower:'1',upper:'1'});
 assert(r.modes.every(m=>m.mode==='full-average-service'));
}));
fs.writeFileSync(__dirname+'/warehouse-mode-facts-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
