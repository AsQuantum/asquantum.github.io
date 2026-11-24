'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const create=()=>{
 const context=vm.createContext({
  checkPath:()=>false,console,
  getRecipe:m=>m.recipe||null,
  streamMaterials:r=>new Set(r.materials||[]),
  acceptsMaterial:(m,item)=>!m.filter||m.filter===item
 });
 for(const file of ['steady-generic-network','steady-warehouse-graph'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts/engine',file+'.js'),'utf8'),context);
 return context;
};
const m=(id,type,extra={})=>({id,type,...extra});
const source=(id,item='A')=>m(id,'generator',{recipe:{inputs:{},output:item,qty:1,seconds:1}});
const route=(id,from,to,item='A',out=0,input=0)=>({
 id,from:{id:from,port:out},to:to?{id:to,port:input}:null,
 materials:[item],path:[]
});
function graph(layout){
 const c=create();c.layout=layout;
 return vm.runInContext('factorySteadyGenericTerminalGraph(layout)',c);
}
test('two independent sources depositing via distinct warehouse-in ports remain independent',()=>{
 const g=graph({machines:[source('a'),source('b'),m('wh','仓入')],routes:[
  route('a-in','a','wh','A',0,0),route('b-in','b','wh','A',0,1)]});
 assert.equal(g.terminalCones.length,2);
 assert.equal(g.terminalGroups.length,2);
 assert.equal(g.physicalCycleCount,0);
 assert.deepEqual([...g.warehouseInTerminals],['wh']);
});
test('multiple sources, warehouse-out, two terminals and physical splitter/merger recirculation',()=>{
 const ms=[source('s1'),source('s2'),m('out','仓出',{item:'A'}),
  m('merge','汇流'),m('split1','分流'),m('split2','分流'),
  m('wh1','仓入'),m('wh2','仓入'),m('pc','电脑')];
 const rs=[
  route('source1','s1','merge','A',0,0),
  route('source2','s2','merge','A',0,1),
  route('feed','merge','split1'),
  route('next','split1','split2','A',0,0),
  route('store1','split1','wh1','A',1),
  route('feedback','split2','merge','A',0,2),
  route('store2','split2','wh2','A',1),
  route('withdraw','out','pc')
 ];
 const g=graph({machines:ms,routes:rs});
 assert.equal(g.sourceMachines.length,3);
 assert.equal(g.terminalCones.length,3);
 assert.equal(g.terminalGroups.length,2);
 const coupled=g.terminalGroups.find(x=>x.terminalRoutes.length===2);
 assert(coupled);
 assert.deepEqual([...coupled.sourceRoots].sort(),['s1','s2']);
 assert.deepEqual([...coupled.terminalMachines].sort(),['wh1','wh2']);
 assert.equal(coupled.requiresJointConstraints,true);
 const computer=g.terminalGroups.find(x=>x.terminalRoutes.includes('withdraw'));
 assert.deepEqual([...computer.sourceRoots],['out']);
 assert.equal(g.physicalCycleCount,1);
 assert.deepEqual([...g.physicalCycles[0].machines],['merge','split1','split2']);
 assert(g.physicalCycles[0].physicallyConnectedToSource);
 assert(g.physicalCycles[0].physicallyConnectedToTerminal);
});
test('splitter-only cycle is supported structurally but has no source from empty state',()=>{
 const g=graph({machines:[m('a','分流'),m('b','分流'),m('wh1','仓入'),
  m('wh2','仓入')],
  routes:[route('a-b','a','b'),route('b-a','b','a'),route('a-wh','a','wh1','A',1),
   route('b-wh','b','wh2','A',1)]});
 assert.equal(g.physicalCycleCount,1);
 assert.equal(g.terminalGroups.length,1);
 assert.equal(g.terminalGroups[0].hasPhysicalSource,false);
 assert.equal(g.physicalCycles[0].physicallyConnectedToSource,false);
 assert.equal(g.physicalCycles[0].physicallyConnectedToTerminal,true);
 assert.equal(g.actualLongRunRatesSolved,false);
});
test('open routes and isolated machines are not rejected as illegal production graph',()=>{
 const g=graph({machines:[source('a'),m('stranded','分流'),m('wh','仓入')],
  routes:[route('open','a',null)]});
 assert.deepEqual([...g.openRoutes],['open']);
 assert.equal(g.terminalCones.length,0);
 assert(g.withoutTerminalPath.includes('a'));
 assert(g.withoutPhysicalSourcePath.includes('stranded'));
});
test('existing warehouse-cut graph exposes generic multi-terminal view when installed',()=>{
 const c=create();c.layout={machines:[source('a'),m('wh','仓入'),m('pc','电脑')],
  routes:[route('a-wh','a','wh'),route('a-pc','a','pc','A',1)]};
 const out=vm.runInContext('factorySteadyWarehouseCutGraph(layout)',c);
 assert.equal(out.genericTerminalGraph.terminalCones.length,2);
 assert.equal(out.genericTerminalGraph.terminalGroups.length,1);
});

test('empty splitter loop is provably inactive from empty buffers',()=>{
 const c=create();c.layout={machines:[m('a','分流'),m('b','分流'),m('wh','仓入')],
  routes:[route('a-b','a','b'),route('b-a','b','a'),route('b-wh','b','wh','A',1)]};
 const r=vm.runInContext('factorySteadyGenericStartupReachability(layout)',c);
 assert.equal(r.physicalCycleStatus.length,1);
 assert.equal(r.physicalCycleStatus[0].certifiedInactiveFromThisStart,true);
 assert.deepEqual([...r.cannotEverSendOnRoute].sort(),['a-b','b-a','b-wh']);
});
test('generator-fed merger plus a splitter feedback loop becomes potentially reachable, not proven full speed',()=>{
 const c=create();c.layout={
  machines:[source('s'),m('merge','汇流'),m('split','分流'),m('wh','仓入')],
  routes:[route('s-m','s','merge'),route('m-p','merge','split'),
   route('p-m','split','merge','A',0,1),route('p-wh','split','wh','A',1)]};
 const r=vm.runInContext('factorySteadyGenericStartupReachability(layout)',c);
 assert.deepEqual([...r.potentiallyActiveItemsByRoute['p-m']],['A']);
 assert.deepEqual([...r.potentiallyActiveItemsByRoute['p-wh']],['A']);
 assert.equal(r.physicalCycleStatus[0].certifiedInactiveFromThisStart,false);
 assert.equal(r.actualLongRunRatesSolved,false);
});
test('warehouse-to-recipe-to-warehouse feedback requires external or initial inventory',()=>{
 const ms=[m('stockOut','仓出',{item:'A'}),
  m('make','recipe',{recipe:{inputs:{A:1},output:'A',qty:2,seconds:1}}),m('wh','仓入')];
 const rs=[route('consume','stockOut','make'),route('produce','make','wh')];
 const c=create();c.layout={machines:ms,routes:rs};
 const zero=vm.runInContext('factorySteadyGenericStartupReachability(layout)',c);
 assert(zero.cannotEverProduce.includes('make'));
 assert.equal(zero.potentiallyStockedItems.includes('A'),false);
 const seeded=vm.runInContext("factorySteadyGenericStartupReachability(layout,{initialWarehouseItems:['A']})",c);
 assert(!seeded.cannotEverProduce.includes('make'));
 assert(seeded.potentiallyStockedItems.includes('A'));
});
test('missing a required input is legitimate stoppage and cannot manufacture output',()=>{
 const c=create();c.layout={
  machines:[source('source','A'),
   m('make','recipe',{recipe:{inputs:{A:1,B:1},output:'C',qty:1,seconds:1}}),
   m('wh','仓入')],
  routes:[route('s-m','source','make','A'),route('m-wh','make','wh','C')]};
 const r=vm.runInContext('factorySteadyGenericStartupReachability(layout)',c);
 assert(r.cannotEverProduce.includes('make'));
 assert.deepEqual([...r.potentiallyActiveItemsByRoute['m-wh']],[]);
});
test('warehouse-cut diagnostics include startup reachability without assuming inventory supply',()=>{
 const c=create();c.layout={machines:[source('s'),m('wh','仓入')],
  routes:[route('s-wh','s','wh')]};
 const g=vm.runInContext('factorySteadyWarehouseCutGraph(layout)',c);
 assert(g.emptyStartReachability.potentiallyStockedItems.includes('A'));
 assert.equal(g.actualLongRunRatesSolved,false);
});
