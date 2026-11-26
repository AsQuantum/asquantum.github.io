'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {ctx,run,root}=require('../support/production');
function plan(g){ctx.partitionInput=g;return JSON.parse(run('JSON.stringify(buildTerminalSubgraphs(partitionInput))'));}
const m=(id,type='生产')=>({id,type});
const e=(id,from,to,materials=['ore'])=>({id,from,to,materials});
const groups=p=>p.subgraphs.map(x=>x.lines.map(e=>e.id).sort().join(',')).sort();
test('independent warehouse inlet ports are not a physical dependency',()=>{
 const g={nodes:[m('s1'),m('s2'),m('s3'),m('a'),m('b'),m('c'),m('w','仓入')],lines:[e('a0','s1','a'),e('a1','a','w'),e('b0','s2','b'),e('b1','b','w'),e('c0','s3','c'),e('c1','c','w')]};
 const p=plan(g);assert.deepEqual(groups(p),['a0,a1','b0,b1','c0,c1']);
 assert(p.subgraphs.every(s=>s.nodes.find(n=>n.id==='w').physicalInCount===1));
 assert.equal(p.pools[0].deposits.length,3);
 assert.deepEqual(groups(plan({...g,nodes:g.nodes.slice().reverse(),lines:g.lines.slice().reverse()})),groups(p));
});
test('shared warehouse-out branch merges cones but separate outlets couple only through stock',()=>{
 const g={nodes:[{...m('u','仓出'),item:'ore'},m('split','分流'),m('a'),m('b'),m('w','仓入'),{...m('v','仓出'),item:'ore'},m('c'),m('s')],lines:[e('root','u','split'),e('a','split','a'),e('b','split','b'),e('a1','a','w'),e('b1','b','w'),e('v','v','c'),e('c1','c','w'),e('source','s','w')]};
 const p=plan(g);assert.deepEqual(groups(p),['a,a1,b,b1,root','c1,v','source']);
 assert.equal(p.pools[0].withdrawals.length,2);assert.notEqual(p.pools[0].withdrawals[0].subgraph,p.pools[0].withdrawals[1].subgraph);
});
test('computer shared cache, dead-end branch and directed cycle are retained',()=>{
 const g={nodes:[m('s'),m('t'),m('computer','电脑'),m('split','分流'),m('dead'),m('w','仓入'),m('x'),m('y'),m('isolated')],lines:[e('s','s','split'),e('dead','split','dead'),e('deposit','split','w'),e('c1','split','computer'),e('c2','t','computer'),e('xy','x','y'),e('yx','y','x')]};
 const p=plan(g);assert.deepEqual(groups(p),['c1,c2,dead,deposit,s','xy,yx']);assert.deepEqual(p.isolated,['isolated']);
 assert.equal(p.subgraphs.flatMap(s=>s.lines).length,g.lines.length);
});
test('115 machine real AST has twelve independent physical subgraphs',()=>{
 ctx.ast=fs.readFileSync(root+'/tests/fixtures/ast1-warehouse-port-balance-v1.txt','utf8').trim();
 const p=JSON.parse(run('JSON.stringify((()=>{state=ast1Decode(ast);return factoryCertifiedResearchPreview({ms:8000}).actual.terminalSubgraphs;})())'));
 assert.equal(p.length,12);
 assert.equal(p.flatMap(s=>s.routes).length,84);
 assert.equal(new Set(p.flatMap(s=>s.routes)).size,84);
 for(const route of ['R11','R24','R26']){const s=p.find(x=>x.deposits.includes(route));assert.equal(s.machines.length,3);assert.equal(s.routes.length,3);assert.equal(s.knownRoutes,3);}
 const big=p.find(s=>s.deposits.includes('R76'));assert.deepEqual(big.deposits,['R76','R81','R82']);assert.equal(big.machines.length,40);assert.equal(big.routes.length,53);
 assert.equal(p.filter(s=>s.unknownRoutes.length===0).length,12);
 assert.equal(big.knownRoutes,53);assert.deepEqual(big.unknownRoutes,[]);
 const deps=JSON.parse(run('JSON.stringify(factoryCertifiedResearchPreview({ms:8000}).actual.stockDependencyPlan)'));
 assert(deps.feedback.some(c=>c.includes('stock:钛合金锭')&&c.includes('stock:齿轮组')));
 assert.equal(deps.unresolvedRateFeedback.length,0);
 assert.equal(deps.actors.filter(x=>x.dependency==='independent').length,9);
 assert(deps.actors.some(x=>x.dependency==='feedback'&&x.contested.includes('钛合金锭')));
 assert(big.topology.features.includes('mixed-fifo'));assert(!big.topology.features.includes('rejected-material'));

});

test('all primitive topology roles, physical loop and stock feedback are separate',()=>{
 const g={nodes:[
 {...m('s'),recipe:{inputs:{},output:'ore',qty:1,seconds:1}},
 {...m('w','仓出'),item:'metal'},m('split','分流'),
 {...m('a'),recipe:{inputs:{ore:1,metal:1},output:'product',qty:1,seconds:1}},
 m('merge','汇流'),m('in','仓入'),m('destroy','电脑')],
 lines:[e('s','s','a'),e('w','w','split',['metal']),e('a','split','a',['metal']),e('m','split','merge',['metal']),e('p','a','merge',['product']),e('d','merge','in',['metal','product']),e('x','split','destroy',['metal'])],
 pools:[{item:'metal',order:['w']}],frozen:[{id:'convert',rates:{product:'-1',metal:'1'}}]};
 ctx.partitionInput=g;
 const r=JSON.parse(run('JSON.stringify((()=>{const a=factoryDirectArithmetic(),p=buildTerminalSubgraphs(partitionInput),d=buildStockDependencyPlan(partitionInput,p,a);return {classes:p.subgraphs.map(classifyTerminalSubgraph),stock:d,residual:resolveStockDependencyPlan(d,{"flow:d|metal":"1/4","flow:d|product":"1/5","duty:convert":"1/5"},a)};})())'));
 assert.equal(r.classes.length,1);const c=r.classes[0];
 assert.deepEqual([c.initial.length,c.middle.length,c.final.length],[2,3,2]);
 for(const f of ['split','merge','multi-material-recipe','mixed-fifo','multi-source','multi-final','stock-input','destroy','reconvergence'])assert(c.features.includes(f),f);
 assert(!c.features.includes('physical-loop'));
 assert(r.stock.feedback.some(x=>x.includes('stock:metal')&&x.includes('frozen:convert')));
 assert.equal(r.residual.unresolvedRateFeedback.length,0);
});
test('direct chain to the single-input destruction terminal has the same exact count rate as deposit',()=>{
 const {arith,provePhysicalRecipeTrees}=require('../support/production');
 const g={status:'compiled',completePhysicalRoutes:true,nodes:[
 {...m('source'),recipe:{inputs:{},output:'ore',qty:3,seconds:3},physicalInCount:0,physicalOutCount:1},
 {...m('process'),recipe:{inputs:{ore:3},output:'metal',qty:2,seconds:2},physicalInCount:1,physicalOutCount:1},
 {...m('sink','电脑'),physicalInCount:1,physicalOutCount:0}],
 lines:[{...e('first','source','process'),rawMaterials:['ore'],acceptedMaterials:['ore'],length:4,compatible:true,active:true,fromPort:0,toPort:0},{...e('last','process','sink',['metal']),rawMaterials:['metal'],acceptedMaterials:['metal'],length:3,compatible:true,active:true,fromPort:0,toPort:0}]};
 const r=provePhysicalRecipeTrees(g,arith,{clock:'fixed-tick',maxNodes:600});
 assert.equal(r.certificates.find(x=>x.machine==='process').rate,'1/3');
 const deposit=structuredClone(g);deposit.nodes[2].type='仓入';
 assert.deepEqual(r.certificates,provePhysicalRecipeTrees(deposit,arith,{clock:'fixed-tick',maxNodes:600}).certificates);
 const shared=structuredClone(g);shared.nodes[2].physicalInCount=2;
 assert.equal(provePhysicalRecipeTrees(shared,arith,{clock:'fixed-tick',maxNodes:600}).certificates.length,0);
});
test('physical feedback is classified independently of stock or final reachability',()=>{
 const g={nodes:[{...m('s'),recipe:{inputs:{},output:'ore'}},m('j','汇流'),m('f','分流'),m('w','仓入')],lines:[e('a','s','j'),e('b','j','f'),e('c','f','j'),e('d','f','w')]};
 ctx.partitionInput=g;const r=JSON.parse(run('JSON.stringify(buildTerminalSubgraphs(partitionInput).subgraphs.map(classifyTerminalSubgraph))'));
 assert.equal(r.length,1);assert.deepEqual(r[0].loops.map(x=>x.sort()),[['f','j']]);assert(r[0].features.includes('physical-loop'));
});
