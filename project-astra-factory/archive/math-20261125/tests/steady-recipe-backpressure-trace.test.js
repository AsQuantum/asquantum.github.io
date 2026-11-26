'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function make(){
 const c=vm.createContext({console,atob,btoa,performance,
  document:{getElementById(){return{getContext(){return{}}}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 for(const file of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
 'core/state','core/machines','core/routing','core/audit','engine/steady-flow',
 'engine/steady-equations','core/compact-json','blueprints/ast1-codec']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',file+'.js'),'utf8'),c);
 }
 c.encoded=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 vm.runInContext('state=ast1Decode(encoded)',c);
 return c;
}
test('AST1 resonance 1:1:2:2 is propagated to exactly four real input routes',()=>{
 const c=make(),trace=vm.runInContext("factorySteadyRecipeDemandTrace('M24')",c);
 assert.equal(trace.cycleVar,'cycles:M24');
 assert.equal(trace.secondsPerCycle,'6');
 assert.deepEqual([...trace.inputRequirements].map(i=>i.neededPerCycle),['1','1','2','2']);
 assert.deepEqual([...trace.inputRequirements].map(i=>i.routes.map(r=>r.route).join(',')),
  ['R34','R35','R39','R36']);
 assert.equal(trace.outputRequirement,'sum(output flows)=1*cycles:M24');
});
test('resonance upstream splitter conservation explicitly includes competing branches, not simple selected input',()=>{
 const c=make(),trace=vm.runInContext("factorySteadyRecipeDemandTrace('M24')",c);
 const byMaterial=Object.fromEntries(trace.inputRequirements.map(i=>[i.item,i]));
 const alloy=byMaterial['合金板'].routes[0].upstreamJunction;
 const battery=byMaterial['能量电池'].routes[0].upstreamJunction;
 assert.equal(alloy.machine,'M36');
 assert.deepEqual([...alloy.incomingRoutes],['R51']);
 assert.deepEqual([...alloy.competingOutgoingRoutes].sort(),['R32','R41']);
 assert.equal(alloy.arbitrationResolved,false);
 assert.equal(battery.machine,'M38');
 assert.deepEqual([...battery.incomingRoutes],['R49']);
 assert.deepEqual([...battery.competingOutgoingRoutes],['R44']);
 assert.equal(battery.arbitrationResolved,false);
});
test('a recipe with non-unique ingredient routes retains sum-of-input identity instead of falsely selecting one supply',()=>{
 const c=make();
 vm.runInContext("DEF.__multi={name:'Dual',ins:2,outs:1,w:3,h:3,recipes:{run:{seconds:2,inputs:{'合金板':2},output:'齿轮组',qty:1}}}",c);
 c.layout={machines:[{id:'x',type:'__multi',mode:'run',x:0,y:0,face:'E'},{id:'a',type:'垃圾',mode:'0',x:0,y:0,face:'E'}],routes:[]};
 const trace=vm.runInContext('state=layout;factorySteadyRecipeDemandTrace("x")',c);
 assert.equal(trace.inputRequirements[0].exactDemand,'sum(item inflows)=2*cycles:x');
 assert.equal(trace.inputRequirements[0].routes.length,0);
});

test('Inspector exposes exact recipe ratio and upstream splitter competition instead of claiming solved rates',()=>{
 const c=make();
 vm.runInContext('theoreticalBudget=legacyReferenceWarehouseTheory()',c);
 const html=vm.runInContext("machineSteadyPanel(state.machines.find(m=>m.id==='M24'))",c);
 assert(html.includes('配方反压等式'));
 assert(html.includes('R34 = 1ν'));
 assert(html.includes('R35 = 1ν'));
 assert(html.includes('R36 = 2ν'));
 assert(html.includes('R39 = 2ν'));
 assert(html.includes('R51 = R36 + R32 + R41'));
 assert(html.includes('R49 = R39 + R44'));
 assert(html.includes('轮询分配待证明'));
});
