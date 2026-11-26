'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function generic(){
 const c=vm.createContext({
  console,
  checkPath:()=>false,
  getRecipe:m=>m?.recipe||null,
  streamMaterials:r=>new Set(r.materials||[]),
  acceptsMaterial:(m,item)=>!m.filter||m.filter==='任意'||m.filter===item
 });
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/engine/steady-warehouse-graph.js'),'utf8'),c);
 return c;
}
function machine(id,type,extra={}){return {id,type,...extra};}
function route(id,from,to,material='A',port=0){
 return {id,from:{id:from,port:0},to:{id:to,port},materials:[material],path:[]};
}
function analyse(layout){
 const c=generic();c.layout=layout;
 return vm.runInContext('factorySteadyWarehouseCutGraph(layout)',c);
}
test('two independent warehouse inlet lines stay separate despite sharing the SAME sink device and stock item',()=>{
 const v=analyse({
  machines:[machine('srcA','generator',{recipe:{inputs:{},output:'A',qty:1,seconds:2}}),
   machine('srcB','generator',{recipe:{inputs:{},output:'A',qty:1,seconds:4}}),
   machine('wh','仓入')],
  routes:[route('lineA','srcA','wh','A',0),route('lineB','srcB','wh','A',1)]
 });
 assert.equal(v.warehouseInRoots.length,2);
 assert.equal(v.entryConeGroups.groupCount,2);
 assert.equal(v.entryConeGroups.independentGroups.length,2);
 assert.deepEqual(Array.from(v.entryConeGroups.groups,g=>g.terminalRoutes.length),[1,1]);
 assert.equal(v.warehouseNodeCount,1,'shared inventory must NOT be duplicated per input line');
 assert.deepEqual(Array.from(v.entryConeGroups.groups,g=>g.sharedUpstreamMachines.length),[0,0]);
});
test('two warehouse inlet routes sharing ANY upstream splitter MUST be grouped, even when the actual inlet is unchanged',()=>{
 const v=analyse({machines:[
  machine('src','generator',{recipe:{inputs:{},output:'A',qty:1,seconds:1}}),
  machine('rr','分流'),machine('pass1','relay'),machine('pass2','relay'),machine('wh','仓入')],
  routes:[
   route('s','src','rr'),route('r1','rr','pass1'),
   route('r2','rr','pass2'),route('in1','pass1','wh','A',0),
   route('in2','pass2','wh','A',1)
  ]});
 assert.equal(v.entryConeGroups.groupCount,1);
 const g=v.entryConeGroups.groups[0];
 assert.deepEqual(Array.from(g.terminalRoutes),['in1','in2']);
 assert(g.sharedUpstreamMachines.includes('rr'));
 assert(g.sharedUpstreamMachines.includes('src'));
 assert.equal(g.mustSolveTogether,true);
});
test('adding and removing a connection recomputes generic grouping without any AST1-specific IDs',()=>{
 const layout={
  machines:[machine('a','generator',{recipe:{inputs:{},output:'A',qty:1,seconds:1}}),
   machine('b','generator',{recipe:{inputs:{},output:'B',qty:1,seconds:1}}),
   machine('junction','分流'),machine('wh','仓入')],
  routes:[route('sinkA','a','wh','A',0),route('sinkB','b','wh','B',1)]
 };
 assert.equal(analyse(layout).entryConeGroups.groupCount,2);
 // Rewire the second warehouse inlet from a generator to a shared splitter.
 layout.routes.push(route('feeder','a','junction','A'));
 layout.routes[1].from.id='junction';
 layout.routes[1].materials=['A'];
 const result=analyse(layout);
 assert.equal(result.entryConeGroups.groupCount,1);
 assert(result.entryConeGroups.groups[0].sharedUpstreamMachines.includes('a'));
 assert.deepEqual(Array.from(result.entryConeGroups.groups[0].terminalRoutes).sort(),['sinkA','sinkB']);
 layout.routes.pop();
 layout.routes[1].from.id='b';layout.routes[1].materials=['B'];
 assert.equal(analyse(layout).entryConeGroups.groupCount,2);
});
test('same-material warehouse-outs reuse one inventory node and cycles become SCCs, NOT private input-output pairs',()=>{
 const graph=analyse({
  machines:[machine('src','generator',{recipe:{inputs:{},output:'A',qty:1,seconds:1}}),
   machine('in1','仓入'),machine('out1','仓出',{item:'A'}),
   machine('out2','仓出',{item:'A'}),machine('in2','仓入'),machine('in3','仓入')],
  routes:[route('dep','src','in1','A'),route('withdraw1','out1','in2','A'),
   route('withdraw2','out2','in3','A')]
 });
 assert.equal(graph.warehouseNodeCount,1);
 assert.equal(graph.entryConeGroups.groupCount,3);
 assert.equal(graph.entryConeGroups.independentGroups.length,1);
 assert.equal(graph.entryConeGroups.dependentGroups.length,2);
 assert.equal(graph.dependencyEdges.filter(e=>e.kind==='withdraws'&&e.item==='A').length,2);
 assert(graph.feedbackGroups.some(x=>x.warehouseItems.includes('A')));
});
test('actual AST1 has 14 warehouse terminal lines and 12 upstream resource groups, with 9 stock-independent',()=>{
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state',
  'core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-warehouse-graph','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const g=vm.runInContext('state=ast1Decode(ast);factorySteadyWarehouseCutGraph()',c);
 assert.equal(g.physicalMachineCount,115);assert.equal(g.physicalRouteCount,84);
 assert.equal(g.warehouseInRoots.length,14);
 assert.equal(g.entryConeGroups.groupCount,12);
 assert.equal(g.entryConeGroups.independentGroups.length,9);
 assert.equal(g.entryConeGroups.dependentGroups.length,3);
 const combined=g.entryConeGroups.groups.find(x=>x.terminalRoutes.length>1);
 assert(combined);
 assert.deepEqual(Array.from(combined.terminalRoutes),['R76','R81','R82']);
 assert(combined.sharedUpstreamMachines.includes('M36'));
 assert(combined.sharedUpstreamMachines.includes('M39'));
 assert.equal(g.feedbackGroups.length,1);
 assert.deepEqual(Array.from(g.feedbackGroups[0].warehouseItems),['钛合金锭','齿轮组']);
});

test('shared upstream cycle without ANY generator/stock-out roots still forces grouping',()=>{
 const v=analyse({machines:[
  machine('loopA','relay'),machine('loopB','relay'),machine('wh','仓入')],
  routes:[route('rAB','loopA','loopB'),route('rBA','loopB','loopA'),
   route('terminal1','loopA','wh','A',0),route('terminal2','loopB','wh','A',1)]});
 assert.equal(v.warehouseInRoots.length,2);
 assert(v.warehouseInRoots.every(root=>root.sourceGeneratorRoots.length===0&&root.warehouseOutRoots.length===0),
  'Comparing ONLY start-root lists would fail to merge these shared resources');
 assert.equal(v.entryConeGroups.groupCount,1);
 assert.deepEqual(Array.from(v.entryConeGroups.groups[0].sharedUpstreamMachines).sort(),['loopA','loopB']);
});
test('warehouse filter mismatch is reported rather than silently assigning flow to stock',()=>{
 const v=analyse({machines:[
  machine('src','generator',{recipe:{inputs:{},output:'B',qty:1,seconds:1}}),
  machine('wh','仓入',{filter:'A'})],
  routes:[route('in','src','wh','B',0)]});
 assert.equal(v.entryConeGroups.groupCount,1);
 assert.equal(v.entryConeGroups.groups[0].inputFilteringMayBlock,true);
 assert.equal(v.entryConeGroups.groups[0].incompatibleTerminalMaterials[0].item,'B');
 assert.deepEqual(Array.from(v.entryConeGroups.groups[0].depositedItems),[]);
});
