'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveWarehouseBurstPriority}=require('./warehouse_burst_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra'),{compileExactRateProblem}=require('./compile_exact');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c);
const layout={name:'Synchronous independent titanium deposits, finite warehouse reservations',recordIndexed:true,machines:[],routes:[],frozenFactories:[]};
const add=(type,x,y,extra={})=>{const m={id:'M'+layout.machines.length,type,x,y,face:'E',...extra};layout.machines.push(m);return m.id;};
const line=(from,to,y,x0,x1,port=0)=>layout.routes.push({id:'R'+layout.routes.length,from:{id:from,port:0},to:{id:to,port},path:Array.from({length:x1-x0+1},(_,i)=>[x0+i,y])});
for(const y of [1,9,17,25]){
 const a=add('采矿',2,y,{mode:1}),b=add('仓入',11,y);
 line(a,b,y+2,7,10,1);
}
const hi=add('仓出',18,1,{item:'钛合金锭'}),lo=add('仓出',18,10,{item:'钛合金锭'}),gear=add('组装',28,0,{mode:'齿轮组'}),sink=add('电脑',27,11),warehouse=add('仓入',43,1);
line(hi,gear,3,23,27,1);line(lo,sink,12,23,26);line(gear,warehouse,3,39,42,1);
c.layout=layout;run('state=layout');
const legal=run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');assert(legal.every(v=>!v),JSON.stringify(legal));
const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph())'));
assert.equal(g.status,'compiled',JSON.stringify(g.issues));
const p=proveWarehouseBurstPriority(g,arith),proof=p.certificates.find(x=>x.item==='钛合金锭');
assert(proof,JSON.stringify(p));assert.equal(proof.burst,4);
assert.deepEqual(proof.outlets.map(x=>x.rate),['2/5','2/15']);
const prob=compileCountProofProblem(g,arith,{machineRates:proof.sourceRates,warehouseBursts:[proof]});
const actual=solveDirectRateProblem(prob,arith,{ms:10000});assert.equal(actual.status,'sat');assert.equal(actual.unique['net:齿轮组'],'1/5');assert.equal(actual.multiple.length,0,JSON.stringify(actual.multiple));
const old=solveDirectRateProblem(compileExactRateProblem(g,{inletPolicy:'relaxed'}),arith,{ms:10000});assert.equal(old.status,'sat');assert.equal(old.unique['net:齿轮组'],'4/15');
const conflict=solveDirectRateProblem(compileExactRateProblem(g,{inletPolicy:'relaxed',machineRateCertificates:proof.sourceRates}),arith,{ms:10000});
assert.equal(conflict.unique['routeTotal:R4'],'8/15');assert.equal(conflict.unique['routeTotal:R5'],'0');
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const snap=()=>JSON.parse(run('JSON.stringify({inbound:sim.inbound,outbound:sim.outbound,high:sim.byMachine.M8.sent,low:sim.byMachine.M9.sent})'));
const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
const diff=(a,b,k)=>(b[k]||0)-(a[k]||0);
const measured={income:diff(a.inbound,b.inbound,'钛合金锭')/60,high:diff(a.high,b.high,'钛合金锭')/60,low:diff(a.low,b.low,'钛合金锭')/60,gear:diff(a.inbound,b.inbound,'齿轮组')/60};
assert.deepEqual(measured,{income:32,high:24,low:8,gear:12});
const mirrored=run('ast1Encode()');c.ast=mirrored;run('state=ast1Decode(ast)');const mg=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph())'));const mp=proveWarehouseBurstPriority(mg,arith);assert.equal(mp.certificates.length,1);
// Same source rates, capacities, machine types and connections; change
// only belt lengths, so four arrivals are separated in each 7.5s period.
const staggered=JSON.parse(JSON.stringify(layout));
for(let i=0;i<4;i++){
 staggered.machines[2*i+1].x+=3*i;
 const r=staggered.routes[i];r.path=Array.from({length:4+3*i},(_,j)=>[7+j,r.path[0][1]]);
}
staggered.machines[9].x=23;staggered.machines[11].x=31;
staggered.routes[5].path=Array.from({length:3},(_,j)=>[28+j,12]);
c.staggered=staggered;run('state=staggered');
assert(run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))').every(v=>!v));
const sg=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph())'));
const sp=proveWarehouseBurstPriority(sg,arith).certificates[0];assert(sp);
assert.deepEqual(sp.outlets.map(x=>x.rate),['8/15','0']);
const solved=solveDirectRateProblem(compileCountProofProblem(sg,arith,{machineRates:sp.sourceRates,warehouseBursts:[sp]}),arith,{ms:10000});
assert.equal(solved.status,'sat');assert.equal(solved.unique['net:齿轮组'],'4/15');assert.equal(solved.multiple.length,0);
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const sa=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const sb=snap();
const sm={income:diff(sa.inbound,sb.inbound,'钛合金锭')/60,high:diff(sa.high,sb.high,'钛合金锭')/60,low:diff(sa.low,sb.low,'钛合金锭')/60,gear:diff(sa.inbound,sb.inbound,'齿轮组')/60};
assert.deepEqual(sm,{income:32,high:32,low:0,gear:16});
const rejection=JSON.parse(JSON.stringify(sg));rejection.lines[1].length=5;
assert(!proveWarehouseBurstPriority(rejection,arith).certificates.length);
const staggeredResult={layout:staggered,ast1:run('ast1Encode()'),proof:sp,measured:sm,unique:Object.keys(solved.unique).length};
const report={layout,ast1:mirrored,graph:g,proof,actual:{unique:actual.unique,unknown:actual.multiple},old:{unique:old.unique,unknown:old.multiple},measured,staggered:staggeredResult};
fs.writeFileSync(path.join(__dirname,'warehouse-burst-counterexample.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({legal:true,ast1:mirrored,proof,actualGear:actual.unique['net:齿轮组'],oldGear:old.unique['net:齿轮组'],unique:Object.keys(actual.unique).length,measured,mirror:true,staggered:{ast1:staggeredResult.ast1,measured:sm,bursts:sp.bursts,unique:staggeredResult.unique},rejectedCloseArrivals:true}));
