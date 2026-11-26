'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveSmoothWarehousePriority:prove}=require('./warehouse_smooth_priority_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='钛合金锭',G='齿轮组';
const layout=JSON.parse(fs.readFileSync(path.join(__dirname,'warehouse-burst-counterexample.json'),'utf8')).layout;
layout.name='Single smooth positive frozen supply and three priority outlets';
layout.machines=layout.machines.filter(m=>Number(m.id.slice(1))>=8);
layout.routes=layout.routes.filter(r=>Number(r.id.slice(1))>=4);
layout.machines.push({id:'M13',type:'仓出',x:18,y:19,face:'E',item:K},{id:'M14',type:'电脑',x:27,y:20,face:'E'});
layout.routes.push({id:'R7',from:{id:'M13',port:0},to:{id:'M14',port:0},path:[23,24,25,26].map(x=>[x,21])});
const records=[];
for(const [v,expected] of [['2/5',['2/5','0','0']],['1',['1','0','0']],['6/5',['1','1/5','0']],['3/2',['1','1/2','0']],['19/10',['1','9/10','0']]]){
 const l=structuredClone(layout);l.frozenFactories=[{id:'source',rates:{[K]:v}}];c.layout=l;run('state=layout');
 const legal=run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');assert(legal.every(x=>!x),JSON.stringify(legal));
 const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));assert.equal(g.status,'compiled',JSON.stringify(g.issues));
 const p=prove(g,arith);assert.equal(p.certificates.length,1,JSON.stringify(p));assert.deepEqual(p.certificates[0].outlets.map(o=>o.rate),expected);
 const r=solveDirectRateProblem(compileCountProofProblem(g,arith,{warehouseBursts:p.certificates}),arith,{ms:10000});assert.equal(r.status,'sat');assert.equal(r.multiple.length,0,JSON.stringify(r.multiple));
 for(const [i,id] of ['R4','R5','R7'].entries())assert.equal(r.unique['routeTotal:'+id],expected[i]);
 assert.equal(r.unique['net:'+G],arith.txt(arith.div(arith.q(expected[0]),arith.q(2))));
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(sim.byMachine).map(([k,v])=>[k,v.sent])))'));
 const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
 const actual=['M8','M9','M13'].map(id=>((b[id][K]||0)-(a[id][K]||0))/60);
 const want=expected.map(x=>{const q=arith.q(x);return 60*Number(q.n)/Number(q.d)});
 assert.deepEqual(actual,want);records.push({v,expected,actual,unique:Object.keys(r.unique).length,gear:r.unique['net:'+G]});
 const multiple=structuredClone(g);multiple.frozen.push({id:'other',rates:{[K]:'1/10'}});assert.equal(prove(multiple,arith).certificates.length,0);
 const negative=structuredClone(g);negative.frozen.push({id:'other',rates:{[K]:'-1/10'}});assert.equal(prove(negative,arith).certificates.length,0);
}
// A high rate certifies only the first outlet; don't invent lower shares.
const high=structuredClone(layout);high.frozenFactories=[{id:'source',rates:{[K]:'5/2'}}];c.layout=high;run('state=layout');
const hg=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));
const hp=prove(hg,arith);assert.equal(hp.certificates[0].completeAllocation,false);assert.equal(hp.certificates[0].outlets.length,1);
const hr=solveDirectRateProblem(compileCountProofProblem(hg,arith,{warehouseBursts:hp.certificates}),arith,{ms:10000});assert.equal(hr.unique['routeTotal:R4'],'1');assert(!Object.hasOwn(hr.unique,'routeTotal:R5'));
const A='合金板',B='复合装甲板';
const blocked={name:'Priority warehouse throttled by armor recipe',recordIndexed:true,machines:[
 {id:'M0',type:'仓出',x:2,y:9,face:'E',item:K},
 {id:'M3',type:'组装',x:28,y:8,face:'E',mode:B},
 {id:'M4',type:'仓出',x:20,y:17,face:'N',item:A},
 {id:'M5',type:'仓入',x:44,y:9,face:'E'},
 {id:'M6',type:'仓出',x:2,y:1,face:'E',item:K},
 {id:'M7',type:'电脑',x:11,y:2,face:'E'},
 {id:'M8',type:'仓出',x:2,y:25,face:'E',item:K},
 {id:'M9',type:'电脑',x:11,y:26,face:'E'}
],routes:[
 {id:'R0',from:{id:'M0',port:0},to:{id:'M3',port:1},path:Array.from({length:21},(_,i)=>[7+i,11])},
 {id:'R3',from:{id:'M4',port:0},to:{id:'M3',port:2},path:[[22,16],[22,15],[22,14],[22,13],[22,12],[23,12],[24,12],[25,12],[26,12],[27,12]]},
 {id:'R4',from:{id:'M3',port:0},to:{id:'M5',port:1},path:[39,40,41,42,43].map(x=>[x,11])},
 {id:'R5',from:{id:'M6',port:0},to:{id:'M7',port:0},path:[7,8,9,10].map(x=>[x,3])},
 {id:'R6',from:{id:'M8',port:0},to:{id:'M9',port:0},path:[7,8,9,10].map(x=>[x,27])}
],frozenFactories:[]};
const backpressure=[];
for(const [v,expected] of [['1/5',['1/5','0','0']],['1/4',['1/4','0','0']],['2/5',['1/4','3/20','0']],['9/10',['1/4','13/20','0']],['6/5',['1/4','19/20','0']]]){
 const l=structuredClone(blocked);l.frozenFactories=[{id:'source',rates:{[K]:v,[A]:'2'}}];c.layout=l;run('state=layout');
 const legal=run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');assert(legal.every(x=>!x),JSON.stringify(legal));
 const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));assert.equal(g.status,'compiled',JSON.stringify(g.issues));
 const p=prove(g,arith);const cp=p.certificates.find(x=>x.item===K);assert(cp,JSON.stringify(p));assert.deepEqual(cp.outlets.map(x=>x.rate),expected);assert.equal(cp.firstCapacity,'1/4');
 const r=solveDirectRateProblem(compileCountProofProblem(g,arith,{warehouseBursts:p.certificates}),arith,{ms:10000});assert.equal(r.status,'sat');assert.equal(r.multiple.length,0,JSON.stringify(r.multiple));
 assert.equal(r.unique['cycle:M3'],expected[0]);assert.equal(r.unique['net:'+B],expected[0]);
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(sim.byMachine).map(([k,v])=>[k,v.sent])))'));
 const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
 const actual=['M0','M6','M8'].map(id=>((b[id][K]||0)-(a[id][K]||0))/60);
 const want=expected.map(x=>{const q=arith.q(x);return 60*Number(q.n)/Number(q.d)});
 assert.deepEqual(actual,want);assert.equal(((b.M3[B]||0)-(a.M3[B]||0))/60,want[0]);
 backpressure.push({v,expected,actual,unique:Object.keys(r.unique).length,armor:r.unique['net:'+B]});
 const shortage=structuredClone(g);shortage.frozen[0].rates[A]='1/2';assert(!prove(shortage,arith).certificates.some(x=>x.item===K));
}
const boundary=structuredClone(blocked);boundary.frozenFactories=[{id:'source',rates:{[K]:'5/4',[A]:'2'}}];c.layout=boundary;run('state=layout');
const bg=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));const bc=prove(bg,arith).certificates.find(x=>x.item===K);assert.equal(bc.completeAllocation,false);assert.equal(bc.outlets[0].rate,'1/4');assert.equal(bc.outlets.length,1);

const report={layout,records,blocked,backpressure,high:{proven:hp.certificates[0],unique:Object.keys(hr.unique).length,unknown:hr.multiple.length}};
fs.writeFileSync(path.join(__dirname,'warehouse-smooth-priority-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({records,backpressure}));
