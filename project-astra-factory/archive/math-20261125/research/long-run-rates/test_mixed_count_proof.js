'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveMixedCountRelations:prove}=require('./mixed_count_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),A='小行星矿石',B='星尘粒子';
const m=(id,type,x,y,face='E',extra={})=>({id,type,x,y,face,...extra});
const line=(id,from,out,to,input,x,y,X,Y)=>({id,from:{id:from,port:out},to:{id:to,port:input},path:Array.from({length:Math.abs(X-x)+Math.abs(Y-y)+1},(_,i)=>[x+i*Math.sign(X-x),y+i*Math.sign(Y-y)])});
const layout={name:'Mixed FIFO: incompatible required proportions',recordIndexed:true,machines:[
 m('M0','采矿',2,9,'E',{mode:0}),m('M1','粒子',14,1,'S',{mode:0}),m('M2','汇流',15,10),m('M3','分流',24,10,'E',{outFilters:[A,A,B]}),
 m('M4','仓入',35,9),m('M5','仓入',23,1,'N'),m('M6','仓入',23,17,'S')
],routes:[
 line('R0','M0',0,'M2',0,7,11,14,11),
 line('R1','M1',0,'M2',1,16,6,16,9),
 line('R2','M2',0,'M3',0,18,11,23,11),
 line('R3','M3',0,'M4',1,27,11,34,11),
 line('R4','M3',1,'M5',1,25,9,25,6),
 line('R5','M3',2,'M6',1,25,13,25,16)
],frozenFactories:[]};
function solve(layout,rrCount=2){
 c.layout=layout;run('state=layout');const legal=run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');assert(legal.every(v=>!v),JSON.stringify(legal));
 const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));assert.equal(g.status,'compiled',JSON.stringify(g.issues));
 const p=prove(g,arith);assert.equal(p.roundRobin.length,rrCount,JSON.stringify(p));
 const result=solveDirectRateProblem(compileCountProofProblem(g,arith,{roundRobin:p.roundRobin,materialRatios:p.materialRatios,materialRatioBounds:p.materialRatioBounds}),arith,{ms:10000});assert.equal(result.status,'sat');return {g,p,result};
}
const blocked=solve(layout);
assert.equal(blocked.result.multiple.length,0,JSON.stringify(blocked.result.multiple));
for(const r of layout.routes)assert.equal(blocked.result.unique['routeTotal:'+r.id],'0');
assert.equal(blocked.result.unique['cycle:M0'],'0');assert.equal(blocked.result.unique['cycle:M1'],'0');
assert.equal(blocked.result.unique['net:'+A],'0');assert.equal(blocked.result.unique['net:'+B],'0');
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const a=run('JSON.stringify(sim.inbound)');run('for(let i=0;i<72000;i++)simulate(.05)');assert.equal(run('JSON.stringify(sim.inbound)'),a);
const pass=structuredClone(layout);pass.machines[3].outFilters=['','',''];
const p=solve(pass);
assert.equal(p.result.unique['routeTotal:R2'],'1');
assert.equal(p.result.unique['routeTotal:R0'],'1/2');assert.equal(p.result.unique['routeTotal:R1'],'1/2');
for(const id of ['R3','R4','R5'])assert.equal(p.result.unique['routeTotal:'+id],'1/3');
assert.equal(p.result.unique['net:'+A],'1/2');assert.equal(p.result.unique['net:'+B],'1/2');
assert.equal(p.result.multiple.length,0);
for(const id of ['R3','R4','R5'])for(const k of [A,B])assert.equal(p.result.unique['flow:'+id+'|'+k],'1/6');
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(["M4","M5","M6"].map(id=>[id,sim.byMachine[id].received])))'));
const before=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const after=snap();
for(const id of ['M4','M5','M6'])for(const k of [A,B])assert.equal(after[id][k]-before[id][k],600);
const noncoprime=structuredClone(pass);noncoprime.machines=noncoprime.machines.filter(m=>m.id!=='M6');noncoprime.routes=noncoprime.routes.filter(r=>r.id!=='R5');
const nc=solve(noncoprime);assert.equal(nc.p.materialRatios.length,0);assert(nc.result.multiple.length>0);

const slow=structuredClone(blocked.g);slow.nodes.find(m=>m.id==='M1').recipe.seconds=2;assert.equal(prove(slow,arith).roundRobin.length,1);
const rejected=structuredClone(blocked.g);rejected.lines.find(e=>e.id==='R4').acceptedMaterials=[];assert.equal(prove(rejected,arith).roundRobin.length,1);
const equal=structuredClone(layout);equal.machines=equal.machines.filter(m=>m.id!=='M6');equal.routes=equal.routes.filter(r=>r.id!=='R5');equal.machines.find(m=>m.id==='M3').outFilters=[A,B,''];
const e=solve(equal);assert.equal(e.result.unique['routeTotal:R2'],undefined,'matching ratios alone cannot prove positive flow');
// A second splitter on an existing free branch. Its output ports
// sample every ninth item of the upstream two-item cyclic stream.
const tree=structuredClone(pass);
Object.assign(tree.machines.find(m=>m.id==='M4'),{type:'分流',x:35,y:10,face:'E',outFilters:['','','']});
tree.routes.find(r=>r.id==='R3').to.port=0;
tree.machines.push(m('M7','仓入',45,9),m('M8','仓入',34,1,'N'),m('M9','仓入',34,17,'S'));
tree.routes.push(line('R6','M4',0,'M7',1,38,11,44,11),line('R7','M4',1,'M8',1,36,9,36,6),line('R8','M4',2,'M9',1,36,13,36,16));
const tr=solve(tree,3);assert.equal(tr.result.multiple.length,0,JSON.stringify(tr.result.multiple));
for(const r of ['R6','R7','R8']){assert.equal(tr.result.unique['routeTotal:'+r],'1/9');for(const k of [A,B])assert.equal(tr.result.unique['flow:'+r+'|'+k],'1/18');}
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const treeSnap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(["M7","M8","M9"].map(id=>[id,sim.byMachine[id].received])))'));
const ta=treeSnap();run('for(let i=0;i<72000;i++)simulate(.05)');const tb=treeSnap(),treeActual={};
for(const id of ['M7','M8','M9']){treeActual[id]={};for(const k of [A,B]){const v=tb[id][k]-ta[id][k];assert.equal(v,200);treeActual[id][k]=v/60;}}

const report={blocked:{proof:blocked.p,unique:Object.keys(blocked.result.unique).length,unknown:blocked.result.multiple.length},pass:{proof:p.p,unique:Object.keys(p.result.unique).length,unknown:p.result.multiple.length},equal:{unknown:e.result.multiple.length},noncoprime:{unknown:nc.result.multiple.length},tree:{unique:Object.keys(tr.result.unique).length,proof:tr.p,actual:treeActual},layout};
fs.writeFileSync(path.join(__dirname,'mixed-count-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
