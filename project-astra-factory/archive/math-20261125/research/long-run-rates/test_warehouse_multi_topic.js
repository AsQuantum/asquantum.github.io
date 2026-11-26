'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{provePriorityRecipeTrees:tree}=require('./warehouse_priority_tree_proof'),{proveWarehouseNoOverflow:env}=require('./warehouse_envelope_proof'),{proveWarehouseReturnSurplus:ret}=require('./warehouse_return_proof'),{proveSharedStockService:stock}=require('./shared_stock_proof'),{compileCountProofProblem:compile}=require('./count_proof_compile'),{solveDirectRateProblem:solve}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='钛合金锭',A='合金板',B='复合装甲板',G='齿轮组';
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8'));
function graph(l){
 c.layout=l;run('state=layout');assert(run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))').every(v=>!v));
 const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));assert.equal(g.status,'compiled',JSON.stringify(g.issues));return g;
}
function exact(g,p){const r=solve(compile(g,arith,p),arith,{ms:15000});assert.equal(r.status,'sat');return r;}
function measure(){
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify({sent:Object.fromEntries(Object.entries(sim.byMachine).map(([k,v])=>[k,v.sent])),in:sim.inbound,out:sim.outbound})'));
 const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
 return Object.fromEntries(['in','out'].map(k=>[k,Object.fromEntries(Object.entries(b[k]).map(([i,v])=>[i,(v-(a[k][i]||0))/60]))]).concat([['sent',Object.fromEntries(Object.entries(b.sent).map(([id,vs])=>[id,Object.fromEntries(Object.entries(vs).map(([k,v])=>[k,(v-(a.sent[id][k]||0))/60]))]))]]));
}
const fixture=read('warehouse-smooth-priority-results.json'),report={trees:[],envelopes:[],returns:[]};
// A highest-priority outlet supplies two units per batch, not one.
for(const v of ['2/5','9/10','6/5']){
 const l=structuredClone(fixture.layout);l.frozenFactories=[{id:'s',rates:{[K]:v}}];const g=graph(l),p=tree(g,arith);
 assert.equal(p.trees.length,1,JSON.stringify(p));assert(p.trees[0].exact);const r=exact(g,p);
 const want=arith.cmp(arith.q(v),arith.U)<0?arith.div(arith.q(v),arith.q(2)):arith.q('1/2');assert.equal(r.unique['cycle:M10'],arith.txt(want));
 const a=measure();assert.equal(a.sent.M10[G],60*Number(want.n)/Number(want.d));report.trees.push({v,proof:p.trees[0],unique:Object.keys(r.unique).length,unknown:r.multiple.length,actual:a.sent.M10[G]});
}
const deep=read('recipe-tree-results.json').deep.layout;
const ore='小行星矿石',scrap='废金属',trash='太空垃圾';
Object.assign(deep.machines.find(m=>m.id==='M2'),{type:'仓出',item:ore});
deep.machines.push({id:'M5',type:'仓出',x:2,y:21,face:'E',item:ore},{id:'M6',type:'电脑',x:11,y:22,face:'E'});
deep.routes.push({id:'R4',from:{id:'M5',port:0},to:{id:'M6',port:0},path:[7,8,9,10].map(x=>[x,23])});
for(const [v,want] of [['2/5',24],['4/5',40]]){
 const l=structuredClone(deep);l.frozenFactories=[{id:'s',rates:{[ore]:v}}];const g=graph(l),p=tree(g,arith);
 assert.equal(p.trees.length,1,JSON.stringify(p));assert(p.trees[0].exact,JSON.stringify(p));
 const r=exact(g,p),a=measure();assert.equal(r.unique['net:'+A],arith.txt(arith.div(arith.q(want),arith.q(60))));assert.equal(a.sent.M3[A],want);
 const st=stock(g,arith,r.unique);const combined=exact(g,{...p,stockPools:st.pools});assert.equal(combined.multiple.length,0);
 report.trees.push({v,multilayer:true,proof:p.trees[0],unique:Object.keys(r.unique).length,unknown:r.multiple.length,combinedUnique:Object.keys(combined.unique).length,combinedUnknown:combined.multiple.length,lowerPriority:combined.unique['routeTotal:R4'],actual:a.sent.M3[A],actualLower:a.sent.M5[ore]||0});
}

// Several independent smooth sources, with arbitrary arrival phases.
for(const vs of [['1/5','1/3'],['1/3','1/4','1/5'],['1/2','1/2']]){
 const l=structuredClone(fixture.layout);l.frozenFactories=vs.map((v,i)=>({id:'s'+i,rates:{[K]:v}}));const g=graph(l),p=env(g,arith);assert.equal(p.certificates.length,1,JSON.stringify(p));
 const r=exact(g,{warehouseBursts:p.certificates});assert.equal(r.multiple.length,0);assert.equal(r.unique['routeTotal:R5'],'0');assert.equal(r.unique['routeTotal:R7'],'0');const a=measure(),want=arith.q(p.certificates[0].inflow);
 assert(Math.abs((a.sent.M8[K]||0)-60*Number(want.n)/Number(want.d))<.05);assert.equal(a.sent.M9[K]||0,0);assert.equal(a.sent.M13[K]||0,0);report.envelopes.push({vs,proof:p.certificates[0],unique:Object.keys(r.unique).length,actual:a.sent.M8[K]});
}
// Reuse actual independent physical source layout, one mining inlet and
// two frozen inputs: mixed envelope with three unit bursts.
const mixed=read('warehouse-burst-counterexample.json').layout;
mixed.machines=mixed.machines.filter(m=>['M0','M1','M8','M9','M10','M11','M12'].includes(m.id));mixed.routes=mixed.routes.filter(r=>['R0','R4','R5','R6'].includes(r.id));mixed.frozenFactories=[{id:'s0',rates:{[K]:'1/5'}},{id:'s1',rates:{[K]:'1/3'}}];
const mg=graph(mixed),mp=env(mg,arith);assert.equal(mp.certificates.length,1);const mr=exact(mg,{warehouseBursts:mp.certificates,machineRates:mp.certificates.flatMap(x=>x.sourceRates)});assert.equal(mr.multiple.length,0);assert.equal(mr.unique['routeTotal:R4'],'2/3');const ma=measure();assert.equal(ma.sent.M8[K],40);assert.equal(ma.sent.M9[K]||0,0);report.envelopes.push({mixed:true,proof:mp.certificates[0],unique:Object.keys(mr.unique).length,actual:ma.sent.M8[K]});
const rlayout={name:'Return and disposal',recordIndexed:true,machines:[{id:'M0',type:'仓出',x:2,y:1,face:'E',item:K},{id:'M1',type:'仓入',x:12,y:1,face:'E'},{id:'M2',type:'仓出',x:2,y:10,face:'E',item:K},{id:'M3',type:'电脑',x:11,y:11,face:'E'}],routes:[{id:'R0',from:{id:'M0',port:0},to:{id:'M1',port:1},path:[7,8,9,10,11].map(x=>[x,3])},{id:'R1',from:{id:'M2',port:0},to:{id:'M3',port:0},path:[7,8,9,10].map(x=>[x,12])}],frozenFactories:[]};
for(const v of ['1/3','1','4/3']){
 const l=structuredClone(rlayout);l.frozenFactories=[{id:'s',rates:{[K]:v}}];const g=graph(l),p=ret(g,arith);assert.equal(p.returnPools.length,1);
 const r=exact(g,{returnPools:p.returnPools,warehouseBursts:p.certificates}),a=measure(),want=arith.cmp(arith.q(v),arith.U)<=0?v:'1';
 assert.equal(r.unique['routeTotal:R1'],want);assert.equal(r.unique['net:'+K],arith.txt(arith.sub(arith.q(v),arith.q(want))));assert.equal(a.sent.M2[K],60*Number(arith.q(want).n)/Number(arith.q(want).d));
 if(v==='4/3')assert.equal(r.unique['routeTotal:R0'],'1');else assert(!Object.hasOwn(r.unique,'routeTotal:R0'));
 report.returns.push({v,proof:p.returnPools[0],unique:Object.keys(r.unique).length,unknown:r.multiple.length,actual:a});
}
// Separate unlimited inventory counterfactual, not constrained rates.
const {combine}=require('./combine_count_proofs'),{projectTrivialPotential}=require('./counterfactual_metrics');
const l=structuredClone(fixture.layout);l.frozenFactories=[{id:'s',rates:{[K]:'2/5'}}];const cg=graph(l),cr=combine(cg).result;
assert.equal(cr.unique['net:'+G],'1/5');const ug=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true,unlimitedWarehouse:true}))'));const ur=combine(ug).result;
assert.equal(ur.status,'sat');assert.equal(ur.multiple.length,0);assert.equal(ur.unique['net:'+G],'1/2');assert.equal(ur.unique['net:'+K],'-13/5');
const potential=projectTrivialPotential(cg,arith,cr.unique);assert.equal(potential[K].potential,'-13/5');assert.equal(potential[G].potential,'1/5');
report.counterfactual={constrained:cr.unique['net:'+G],overdraft:ur.unique['net:'+K],unlimitedGear:ur.unique['net:'+G],potential,unique:Object.keys(ur.unique).length};

fs.writeFileSync(path.join(__dirname,'warehouse-multi-topic-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
