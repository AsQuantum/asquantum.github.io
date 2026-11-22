'use strict';
// Actual AST1, packet simulation and LP solver regression for Quantum Computer Consumer.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({
 console,atob,btoa,performance,Math,Map,Set,JSON,
 localStorage:{getItem(){return null},setItem(){}},
 document:{hidden:false,getElementById(){return {getContext(){return {}},classList:{add(){},remove(){}},style:{},textContent:''}}},
 requestAnimationFrame(){},
});
const load=p=>vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),ctx,{filename:p});
for(const p of [
 'scripts/data/catalog.js','scripts/core/state.js',
 'scripts/blueprints/machine-ids.js','scripts/blueprints/item-ids.js',
 'scripts/core/machines.js','scripts/core/routing.js','scripts/blueprints/ast1-codec.js','scripts/core/audit.js',
 'scripts/engine/simulation.js','scripts/engine/steady-flow.js'
])load(p);
const run=s=>vm.runInContext(s,ctx);
run('function stockChartReset(){} function warehouseRefresh(){} function draw(){} function recordWarehouseMovement(){} function warehouseRefreshLive(){} function inspectorRefreshLive(){} function stockChartMaybeRefresh(){}');
run("state={name:'Consumer test',machines:[{id:'pc',type:'电脑',x:9,y:3,face:'E'}],routes:[]};resetSimulation();");
assert.equal(run("getPorts(state.machines[0]).filter(p=>p.kind==='in').length"),1);
assert.equal(run("getPorts(state.machines[0]).filter(p=>p.kind==='out').length"),0);
const accepted=run("let successes=0; for(let i=0;i<100;i++){simTime=i*.05;if(acceptItem(state.machines[0],0,i%40?'太空垃圾':'量子处理器'))successes++;} successes;");
assert.equal(accepted,5,'one item per second in a 5-second window');
assert.equal(run("Object.values(sim.consumed).reduce((s,n)=>s+n,0)"),5);
assert.equal(run("Object.values(sim.byMachine.pc.consumed).reduce((s,n)=>s+n,0)"),5);
assert.equal(run("Object.values(sim.byMachine.pc.inputs).reduce((s,n)=>s+n,0)"),0);
assert.equal(run("Object.values(ware).reduce((s,n)=>s+n,0)"),0);
console.log('PASS: accepts mixed items, destroys exactly 1/s, never buffers or credits warehouse');

run("state={name:'AST1 Consumer',machines:[{id:'pc',type:'电脑',x:9,y:3,face:'E'}],routes:[]};");
const ast=run('ast1Encode()');
ctx.encodedAST=ast;
const data=Uint8Array.from(atob(ast.slice(5)),c=>c.charCodeAt(0));
assert.equal(data[3],17,'AST1 computer type');
assert.equal(data[3+6],1,'B6 contains one extra u16');
assert.equal(data[3+7],0,'E1 low byte unrestricted');
assert.equal(data[3+8],0,'E1 high byte unrestricted');
const decoded=run("ast1Decode(encodedAST)");
assert.equal(decoded.machines[0].inletItem,'');
assert.equal(decoded.machines[0].ast1Meta.extensionItems[0].item,'任意');
ctx.importedLayout=decoded;
run('state=importedLayout');
assert.equal(run('ast1Encode()'),ast,'AST1 byte-exact import/export after X mirroring');
console.log('PASS: computer AST1 B6=1,E1=0 parses as unrestricted and round-trips exactly');

run("state={name:'Consumer route',machines:[{id:'source',type:'仓出',x:0,y:0,face:'E',item:'太空垃圾'},{id:'pc',type:'电脑',x:8,y:1,face:'E'}],routes:[{id:'r1',from:{id:'source',port:0},to:{id:'pc',port:0},path:[[5,2],[6,2],[7,2]]}]};resetSimulation();ware['太空垃圾']=60;");
assert.equal(run('checkPath(state.routes[0].path,state.routes[0].from,state.routes[0].to,state.routes[0].id)'),null);
run('for(let i=0;i<240;i++)simulate(.05)');
const spent=run("sim.consumed['太空垃圾']||0");
assert(spent>=8&&spent<=12,'12 seconds of supply should destroy about 10 items, got '+spent);
assert.equal(run("sim.byMachine.pc.inputs['太空垃圾']||0"),0);
assert.equal(run("sim.inbound['太空垃圾']||0"),0);
assert.equal(run("sim.routes.r1.length>=0"),true);
// LP maximizes actual production, not dumping from an existing warehouse.
// Use a 1 item/s producer so the sink is the necessary terminal output.
run("state={name:'Producer to Consumer',machines:[{id:'source',type:'垃圾',mode:0,x:0,y:0,face:'E'},{id:'pc',type:'电脑',x:8,y:1,face:'E'}],routes:[{id:'r1',from:{id:'source',port:0},to:{id:'pc',port:0},path:[[5,2],[6,2],[7,2]]}]};");
const lp=run('warehouseTheory()');
assert(!lp.error,'steady flow LP: '+lp.error);
assert.equal(Math.round((lp.routeFlows.r1?.['太空垃圾']||0)*1000),1000,'computer can receive 1 item/s in LP');
console.log('PASS: real conveyor delivers '+spent+' items into Consumer, LP recognizes sustainable 1/s sink');
