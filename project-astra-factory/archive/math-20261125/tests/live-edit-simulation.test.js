'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,materialColor:()=>"#fff",document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit',
  'engine/math/arithmetic/rational','engine/steady-flow','engine/steady-equations','engine/steady-algebra','engine/math/graph/startup_reachability',
  'engine/steady-machine-graph','engine/steady-rate-region','engine/steady-auto-fluid','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 return c;
}
const run=(c,s)=>vm.runInContext(s,c);
const m=(id,type,mode=0,extra={})=>({id,type,mode,x:0,y:0,face:'E',...extra});
const r=(id,from,to,out=0,input=0)=>({id,from:{id:from,port:out},to:{id:to,port:input},path:[[0,0]]});
function setup(c,ms,rs){
 c.layout={machines:ms,routes:rs};
 run(c,'state=layout;checkPath=()=>null;DEF.__slow={w:3,h:3,ins:0,outs:1,recipes:{run:{output:"合金板",qty:1,seconds:5,inputs:{}}}};DEF.__source={w:3,h:3,ins:0,outs:1,recipes:{run:{output:"合金板",qty:1,seconds:1,inputs:{}}}};DEF.__need={w:3,h:3,ins:1,outs:1,recipes:{run:{output:"硅晶圆",qty:1,seconds:5,inputs:{"合金板":1}}}};DEF.__multi={w:3,h:3,ins:2,outs:1,recipes:{run:{output:"硅晶圆",qty:1,seconds:2,inputs:{"合金板":2,"星尘粒子":1}}}}');
}
function solve(c,ms,rs){
 setup(c,ms,rs);return run(c,'factorySteadyAutomaticFluidBudget()');
}

function live(){
 const c=env();
 Object.assign(c,{document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}},style:{}}}},requestAnimationFrame(){},localStorage:{setItem(){},getItem(){return null}}});
 for(const f of ['ui/warehouse','engine/simulation','core/editor','core/layout-io'])
 vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 run(c,"warehouseRefresh=()=>{};function draw(){};notify=()=>{};function stockChartReset(){}function refresh(){}function saveCurrentScheme(){}function updateGroupControls(){}function clearGroupSelection(){}");
 return c;
}
test('editing an indexed layout preserves surviving queues, clock, history and real outlet buffers',()=>{
 const c=live();
 const x=run(c,"(()=>{state={name:'live',recordIndexed:true,machines:[{id:'M0',type:'垃圾',x:1,y:1,face:'E',mode:0},{id:'M1',type:'仓出',x:20,y:1,face:'E',item:'合金板'},{id:'M2',type:'仓入',x:35,y:1,face:'E'}],routes:[{id:'R0',from:{id:'M1',port:0},to:{id:'M2',port:0},path:[[25,3],[26,3],[27,3]]}]};resetSimulation();simTime=7200;running=true;ware={'合金板':20};sim.byMachine.M1.warehouseQueue=['合金板','合金板'];sim.byMachine.M1.lastWarehouseFill=7199.5;sim.byMachine.M1.sent={'合金板':17};sim.routes.R0=[{item:'合金板',distance:1}];sim.minuteBuckets[119]={inbound:{'合金板':2},outbound:{'合金板':1}};sim.inbound={'合金板':11};theoreticalBudget={old:true};removeMachine('M0');return {time:simTime,running,stock:ware['合金板'],id:state.machines[0].id,queue:sim.byMachine.M0.warehouseQueue,sent:sim.byMachine.M0.sent,packets:sim.routes.R0,lastFill:sim.byMachine.M0.lastWarehouseFill,history:sim.minuteBuckets[119],invalidated:theoreticalBudget===null};})()");
 assert.equal(x.time,7200);assert.equal(x.running,true);assert.equal(x.stock,20);assert.equal(x.id,'M0');assert.equal(x.queue.length,2);assert.equal(x.sent['合金板'],17);assert.equal(x.packets[0].distance,1);assert.equal(x.lastFill,7199.5);assert.equal(x.history.outbound['合金板'],1);assert(x.invalidated);
 const y=run(c,"(()=>{deleteRoute('R0');return [simTime,ware['合金板'],sim.byMachine.M0.warehouseQueue.length,sim.byMachine.M0.lastWarehouseFill]})()");
 assert.deepEqual([...y],[7200,21,2,7199.5]);
 const z=run(c,"(()=>{state={name:'new',machines:[],routes:[]};afterChange('load',{resetRuntime:true});return [simTime,running,Object.keys(ware).length]})()");
 assert.deepEqual([...z],[0,false,0]);
});
test('potential net uses the current demand snapshot and retains all positive net rates',()=>{
 const c=env();c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const a=run(c,'state=ast1Decode(ast);factorySteadyAutomaticFluidBudget()');
 assert.equal(a.status,'conditional-fixed-point');assert.equal(a.fractions.potentialNet['钛合金锭'],'3/20');assert.equal(a.fractions.potentialNet['合金板'],'-8/45');assert.equal(a.fractions.potentialNet['导线线圈'],'-1/10');
 for(const item of Object.keys(a.inflow))if(a.inflow[item]-a.outflow[item]>1e-9)assert(Math.abs(a.potentialNet[item]-(a.inflow[item]-a.outflow[item]))<1e-9,item);
});
test('empty warehouse can have nonzero downstream withdrawal demand',()=>{
 const c=env();setup(c,[m('M0','仓出',0,{item:'合金板'}),m('M1','仓入')],[r('R0','M0','M1')]);
 const a=run(c,'factorySteadyAutomaticFluidBudget()');
 assert.equal(a.status,'conditional-fixed-point');assert.equal(a.fractions.outflow['合金板'],'0');assert.equal(a.fractions.withdrawalDemand['合金板'],'1');assert.equal(a.fractions.potentialNet['合金板'],'-1');
});
test('known and imported unknown item IDs are numerically ordered',()=>{
 const c=env();const x=run(c,"({ids:MATERIALS.map(ast1ItemNumber),unknown:['硅晶圆','物品#12','古代芯片','物品#500'].sort(factoryItemCompare).map(ast1ItemNumber)})");
 assert.deepEqual([...x.ids],[...x.ids].sort((a,b)=>a-b));assert.deepEqual([...x.unknown],[1,12,446,500]);
});

test('overdraft equilibrium is independent of constrained rates and current demand snapshot',()=>{
 const c=env();c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const b=run(c,'state=ast1Decode(ast);warehouseTheory()');
 assert.equal(b.conditionalBudget.warehouseSupply,'constrained');
 assert.equal(b.unlimitedStockBudget.warehouseSupply,'unlimited');
 assert.equal(b.conditionalBudget.fractions.potentialNet['合金板'],'-8/45');
 assert.equal(b.unlimitedStockBudget.fractions.inflow['合金板'],'2/3');
 assert.equal(b.unlimitedStockBudget.fractions.outflow['合金板'],'4/3');
 assert(Math.abs(b.overdraftNet['合金板']*60+40)<1e-9);
 assert(Math.abs(b.overdraftNet['钛合金锭']*60+34)<1e-9);
 assert.equal(b.conditionalBudget.fractions.machineCycles.M24,'11/180');
 assert.equal(b.diagnostics.certified,false);
});
test('canvas reads the same constrained fixed point as the ledger, not the overdraft budget',()=>{
 const c=env();c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const x=run(c,"(()=>{state=ast1Decode(ast);theoreticalBudget=warehouseTheory();return {period:timeLabel(machineById('M24')),outlet:warehouseOutletTimeLabel(machineById('M114')),labels:state.machines.filter(m=>getRecipe(m)||m.type==='仓出').map(m=>getRecipe(m)?timeLabel(m):warehouseOutletTimeLabel(m)),theory:machineSteadyPanel(machineById('M24'))}})()");
 assert.equal(x.period,'6s(16.36s)');assert.equal(x.outlet,'1s(5.45s)');
 assert(x.labels.every(x=>!x.includes('待证明')));
 assert(x.theory.includes('条件解'));assert(x.theory.includes('machine-duty-grid'));
});
test('unlimited warehouse can supply an otherwise starved producer without changing constrained result',()=>{
 const c=env();setup(c,[m('out','仓出',0,{item:'合金板'}),m('make','__need','run'),m('wh','仓入')],[r('s','out','make'),r('p','make','wh')]);
 const b=run(c,'warehouseTheory()');
 assert.equal(b.conditionalBudget.fractions.machineCycles.make,'0');
 assert.equal(b.unlimitedStockBudget.fractions.machineCycles.make,'1/5');
 assert(Math.abs(b.overdraftNet['合金板']+1/5)<1e-9);
 assert(Math.abs(b.overdraftNet['硅晶圆']-1/5)<1e-9);
});


test('deleting a machine returns each actual input/output stack once, not mirrored counters or consumed batch ingredients',()=>{
 const c=live();
 const x=run(c,`(()=>{
  DEF.__craft={w:3,h:3,ins:2,outs:1,recipes:{run:{output:'齿轮组',qty:2,seconds:5,inputs:{'合金板':1,'硅晶圆':1}}}};
  state={name:'returns',recordIndexed:true,machines:[{id:'M0',type:'__craft',mode:'run',x:10,y:10,face:'E'},{id:'M1',type:'仓入',x:25,y:10,face:'E'}],routes:[{id:'R0',from:{id:'M0',port:0},to:{id:'M1',port:0},path:[[13,11],[14,11]]}]};
  resetSimulation();running=true;simTime=61;
  const m=state.machines[0],s=sim.byMachine.M0;
  acceptItem(m,0,'合金板');acceptItem(m,1,'硅晶圆');simulate(.05);
  // First batch already consumed its ingredients. New input stock and
  // completed outputs are the only contents left to return.
  simTime=62;acceptItem(m,0,'合金板');acceptItem(m,1,'硅晶圆');
  s.queue.push('齿轮组','齿轮组');
  sim.routes.R0.push({item:'齿轮组',distance:0},{item:'齿轮组',distance:1});
  const oldCrafts={...sim.crafts};
  removeMachine('M0');reconcileSimulationLayout();
  const first={...ware};
  undo();const restored=sim.byMachine.M0;redo();reconcileSimulationLayout();
  return {first,last:{...ware},returns:{...sim.editReturns},bucket:sim.minuteBuckets[1].editReturns,ordinaryIn:sim.inbound,ordinaryOut:sim.outbound,restoredInputs:restored.inputs,restoredQueue:restored.queue,oldCrafts,crafts:sim.crafts,running,time:simTime};
 })()`);
 const want={'合金板':1,'硅晶圆':1,'齿轮组':4};
 for(const key of ['first','last','returns','bucket'])assert.deepEqual({...x[key]},want);
 for(const key of ['ordinaryIn','ordinaryOut','restoredInputs','oldCrafts','crafts'])assert.deepEqual({...x[key]},{});
 assert.equal(x.restoredQueue.length,0);assert.equal(x.running,true);assert.equal(x.time,62);
});
test('shortening a belt returns every packet including retained prefix, and preserves other machine stacks',()=>{
 const c=live();
 const x=run(c,`(()=>{
  state={name:'cut',recordIndexed:true,machines:[{id:'M0',type:'仓出',item:'合金板',x:10,y:10,face:'E'},{id:'M1',type:'仓入',x:25,y:10,face:'E'}],routes:[{id:'R0',from:{id:'M0',port:0},to:{id:'M1',port:0},path:[[15,12],[16,12],[17,12],[18,12]]}]};
  resetSimulation();simTime=12;running=true;
  sim.byMachine.M0.warehouseQueue=['合金板'];
  sim.routes.R0=[{item:'合金板',distance:4},{item:'合金板',distance:2},{item:'硅晶圆',distance:0}];
  snapshot();state.routes[0].path=state.routes[0].path.slice(0,2);state.routes[0].to=null;afterChange('cut');
  const afterCut={...ware},empty=sim.routes.R0.length;reconcileSimulationLayout();
  undo();redo();const afterUndoRedo={...ware};
  deleteRoute('R0');removeMachine('M0');
  return {afterCut,afterUndoRedo,empty,final:ware,returns:sim.editReturns,ordinaryIn:sim.inbound,ordinaryOut:sim.outbound};
 })()`);
 assert.equal(x.empty,0);
 for(const key of ['afterCut','afterUndoRedo'])assert.deepEqual({...x[key]},{'合金板':2,'硅晶圆':1});
 for(const key of ['final','returns'])assert.deepEqual({...x[key]},{'合金板':3,'硅晶圆':1});
 assert.deepEqual({...x.ordinaryIn},{});assert.deepEqual({...x.ordinaryOut},{});
});
test('router and computer input aggregates and queue mirrors return exactly once',()=>{
 const c=live();
 const x=run(c,`(()=>{
  state={name:'routers',recordIndexed:true,machines:[{id:'M0',type:'分流',x:5,y:5,face:'E'},{id:'M1',type:'汇流',x:15,y:5,face:'E'},{id:'M2',type:'电脑',x:25,y:5,face:'E'},{id:'M3',type:'仓出',item:'合金板',x:35,y:5,face:'E'}],routes:[]};
  resetSimulation();simTime=2;
  acceptItem(state.machines[0],0,'合金板');
  acceptItem(state.machines[1],0,'合金板');
  acceptItem(state.machines[2],0,'硅晶圆');
  sim.byMachine.M3.warehouseQueue=['硅晶圆','合金板'];
  state.machines=[];afterChange('remove all');reconcileSimulationLayout();
  return {stock:ware,returns:sim.editReturns};
 })()`);
 assert.deepEqual({...x.stock},{'合金板':3,'硅晶圆':2});assert.deepEqual({...x.returns},{...x.stock});
});


test('stock chart includes edit returns exactly once without modifying regular warehouse income',()=>{
 const c=live();
 const chart=fs.readFileSync(path.join(root,'scripts/ui/stock-chart.js'),'utf8');
 run(c,chart.slice(chart.indexOf('function stockChartHistory(){'),chart.indexOf('function stockChartOpen(open){')));
 const x=run(c,`(()=>{
  state={name:'stock history',machines:[{id:'M0',type:'仓出',item:'合金板',x:10,y:10,face:'E'}],routes:[]};
  resetSimulation();simTime=60;
  ware['合金板']=5;sim.inbound['合金板']=5;recordWarehouseMovement('inbound','合金板',5);
  simTime=61;warehouseFillOutputQueue(state.machines[0],sim.byMachine.M0);
  removeMachine('M0');reconcileSimulationLayout();
  const h=stockChartHistory();
  return {history:h.points,stock:ware['合金板'],income:sim.inbound['合金板'],expense:sim.outbound['合金板'],returned:sim.editReturns['合金板']};
 })()`);
 assert.equal(x.stock,5);assert.equal(x.income,5);assert.equal(x.expense,1);assert.equal(x.returned,1);
 assert.equal(x.history.at(-1).stocks['合金板'],x.stock);
});


test('manual machine stacks respect capacity, preserve FIFO provenance and conserve stock',()=>{
 const c=live();
 const x=run(c,`(()=>{
  state={name:'stack test',machines:[{id:'p',type:'电池',mode:'标准',x:5,y:5,face:'E'},{id:'c',type:'电脑',x:20,y:5,face:'E'},{id:'w',type:'仓出',item:'硅晶圆',x:35,y:5,face:'E'}],routes:[]};
  resetSimulation();simTime=1;ware['废金属']=12;ware['合金板']=20;
  const p=state.machines[0],s=sim.byMachine.p;
  acceptItem(p,0,'废金属');
  const put=transferMachineStack('p','废金属','in'),again=transferMachineStack('p','废金属','in'),wrong=transferMachineStack('p','合金板','in');
  const fifo=s.ingredientQueues['废金属'].slice(),physical=s.portItems[0]['废金属'],manual=s.portItems.manual['废金属'];
  simulate(.05);
  const remaining=s.inputs['废金属'],next=s.ingredientQueues['废金属'].slice();
  s.queue.push('能量电池','能量电池');const take=transferMachineStack('p','能量电池','out'),repeat=transferMachineStack('p','能量电池','out');
  const computer=transferMachineStack('c','合金板','in'),blocked=transferMachineStack('c','废金属','in'),warehouse=transferMachineStack('w','废金属','in');
  simAdvanceBusy=true;const during=transferMachineStack('p','废金属','in');simAdvanceBusy=false;
  return {put,again,wrong,fifo,physical,manual,remaining,next,take,repeat,computer,blocked,warehouse,during,ware,queue:s.queue,consumer:sim.byMachine.c.consumerQueue,adjustment:sim.minuteBuckets[0].manualStock,inbound:sim.inbound,outbound:sim.outbound,received:s.received,sent:s.sent,busy:s.busy};
 })()`);
 assert.equal(x.put,5);assert.equal(x.again,0);assert.equal(x.wrong,0);assert.deepEqual([...x.fifo],['0','manual','manual','manual','manual','manual']);assert.equal(x.physical,1);assert.equal(x.manual,5);assert.equal(x.remaining,4);assert.deepEqual([...x.next],Array(4).fill('manual'));
 assert.equal(x.take,2);assert.equal(x.repeat,0);assert.equal(x.computer,10);assert.equal(x.blocked,0);assert.equal(x.warehouse,0);assert.equal(x.during,0);
 assert.deepEqual({...x.ware},{'废金属':7,'合金板':10,'能量电池':2});assert.deepEqual({...x.adjustment},{'废金属':-5,'能量电池':2,'合金板':-10});
 assert.deepEqual({...x.inbound},{});assert.deepEqual({...x.outbound},{});assert.deepEqual({...x.received},{'废金属':1});assert.deepEqual({...x.sent},{});assert.equal(x.queue.length,0);assert.equal(x.consumer.length,10);assert(x.busy>0);
});


test('live warehouse item and filter edits preserve old FIFO contents, belt packets and cooldowns',()=>{
 const c=live();
 const x=run(c,`(()=>{
  state={name:'live filters',machines:[{id:'w',type:'仓出',item:'废金属',x:4,y:4,face:'E'},{id:'sp',type:'分流',x:15,y:4,face:'E'},{id:'in',type:'仓入',x:30,y:4,face:'E'}],routes:[{id:'r',from:{id:'w',port:0},to:{id:'sp',port:0},path:[[8,5],[9,5],[10,5]]}]};
  resetSimulation();const [w,sp,wi]=state.machines,ws=sim.byMachine.w,ss=sim.byMachine.sp;
  simTime=10;ware={'废金属':5,'合金板':5};ws.warehouseQueue=['废金属','废金属'];ws.lastWarehouseFill=9.5;ws.lastSend[0]=9.2;
  acceptItem(sp,0,'废金属');ss.roundRobin=2;sim.routes.r=[{item:'废金属',distance:2}];
  w.item='合金板';sp.outFilters={0:'合金板'};wi.inletItem='合金板';afterChange('filters');reconcileSimulationLayout();
  const preserved=ws===sim.byMachine.w&&ss===sim.byMachine.sp;
  const old=ws.warehouseQueue.slice(),port=ss.portQueues[0].slice(),cursor=ss.roundRobin,last=ws.lastWarehouseFill,send=ws.lastSend[0],belt=sim.routes.r.map(p=>p.item);
  const premature=warehouseFillOutputQueue(w,ws);
  simTime=10.5;const refill=warehouseFillOutputQueue(w,ws),mixed=ws.warehouseQueue.slice();
  const dispatched=warehouseDequeueOne(w,ws),after=ws.warehouseQueue.slice(),packets=sim.routes.r.map(p=>p.item);
  return {preserved,old,port,cursor,last,send,belt,premature,refill,mixed,dispatched,after,packets,ware,outbound:sim.outbound,returns:sim.editReturns};
 })()`);
 assert(x.preserved);assert.deepEqual([...x.old],['废金属','废金属']);assert.deepEqual([...x.port],['废金属']);assert.equal(x.cursor,2);assert.equal(x.last,9.5);assert.equal(x.send,9.2);
 assert.deepEqual([...x.belt],['废金属']);assert.equal(x.premature,false);assert.equal(x.refill,true);assert.deepEqual([...x.mixed],['废金属','废金属','合金板']);
 assert.equal(x.dispatched,true);assert.deepEqual([...x.after],['废金属','合金板']);assert.deepEqual([...x.packets],['废金属','废金属']);assert.deepEqual({...x.ware},{'废金属':5,'合金板':4});assert.deepEqual({...x.outbound},{'合金板':1});assert.deepEqual({...x.returns},{});
});


test('sparse unit arrivals protected by fastest first frozen consumer, independent simulation check',()=>{
 const c=live();
 const results=run(c,`(()=>{
  const out=[];
  for(const [offer,demand] of [['1','1'],['3/5','3/2'],['1','2'],['1','30']]){
   state={name:'priority validation',machines:[],routes:[],frozenFactories:[
    {id:'s',name:'s',enabled:true,rates:{'合金板':offer}},
    {id:'a',name:'a',enabled:true,rates:{'合金板':'-'+demand,'齿轮组':'1'}},
    {id:'b',name:'b',enabled:true,rates:{'合金板':'-100','硅晶圆':'1'}}]};
   resetSimulation();simulateBatchSteps(12000,.05);
   out.push({offer,demand,a:sim.frozenRuntime.a.activeTime,b:sim.frozenRuntime.b.activeTime,stock:ware['合金板']||0,income:sim.inbound['合金板'],expense:sim.outbound['合金板']});
  }
  return out;
 })()`);
 for(const r of results){assert.equal(r.b,0,JSON.stringify(r));assert(r.stock<=1);assert.equal(r.income-r.expense,r.stock);}
});
