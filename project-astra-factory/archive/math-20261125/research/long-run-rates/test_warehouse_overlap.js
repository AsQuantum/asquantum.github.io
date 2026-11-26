'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{composeReservationCycle:compose,proveWarehouseOverlapping:prove}=require('./warehouse_overlap_proof'),{compileCountProofProblem}=require('./count_proof_compile'),{solveDirectRateProblem}=require('./direct_algebra');
let tested=0,proved=0,rejected=0,seed=12453;
function random(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;}
for(let i=0;i<3000;i++){
 const groups=Array.from({length:1+random(8)},()=>({count:1+random(6),gap:1+random(5)})),C=Array.from({length:1+random(4)},()=>1+random(5));
 const p=compose(groups,C);tested++;
 if(p.status!=='proved'){rejected++;continue;}
 proved++;
 // Independent finite state checker from empty startup; ONLY verification.
 // Candidate rates must agree with the actual repeated period state.
 let q=C.map(()=>0),last=[],seen=new Map(),cycles=0,totals=[];
 while(true){
  const key=q.join(',');if(seen.has(key)){const start=seen.get(key),n=cycles-start;for(let j=0;j<C.length;j++)assert.equal(totals.slice(start).reduce((s,v)=>s+v[j],0),n*p.outlets[j].count);break;}
  seen.set(key,cycles++);assert(cycles<=1000);
  last=C.map(()=>0);
  for(const g of groups){let a=g.count;
   for(let j=0;j<C.length;j++){const c=Math.min(C[j]-q[j],a);q[j]+=c;last[j]+=c;a-=c;}
   assert.equal(a,0);
   q=q.map(x=>Math.max(0,x-g.gap));
  }
  totals.push(last);
 }
}
const example=compose([{count:3,gap:1},{count:3,gap:5}],[3,3]);
assert.equal(example.status,'proved');assert.deepEqual(example.outlets.map(x=>x.count),[4,2]);
assert.equal(compose([{count:5,gap:1}],[3,3]).status,'not-proved');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c);
const layout={name:'Overlapping phase particle deposits',recordIndexed:true,machines:[],routes:[],frozenFactories:[]};
const add=(type,x,y,extra={})=>{const m={id:'M'+layout.machines.length,type,x,y,face:'E',...extra};layout.machines.push(m);return m.id;};
const line=(from,to,y,x0,x1,port=0)=>layout.routes.push({id:'R'+layout.routes.length,from:{id:from,port:0},to:{id:to,port},path:Array.from({length:x1-x0+1},(_,i)=>[x0+i,y])});
for(let i=0;i<6;i++){
 const y=1+8*i,L=i<3?4:6,a=add('粒子',2,y,{mode:1}),b=add('仓入',7+L,y);
 line(a,b,y+2,7,6+L,1);
}
const hi=add('仓出',20,1,{item:'相位粒子'}),lo=add('仓出',20,10,{item:'相位粒子'}),sink1=add('电脑',30,2),sink2=add('电脑',30,11);
line(hi,sink1,3,25,29);line(lo,sink2,12,25,29);
c.layout=layout;run('state=layout');
const legal=run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');assert(legal.every(v=>!v),JSON.stringify(legal));
const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph())'));
const proof=prove(g,arith).certificates[0];assert(proof);assert.deepEqual(proof.outlets.map(x=>x.rate),['2/3','1/3']);
const result=solveDirectRateProblem(compileCountProofProblem(g,arith,{machineRates:proof.sourceRates,warehouseBursts:[proof]}),arith,{ms:10000});
assert.equal(result.status,'sat');assert.equal(result.multiple.length,0);
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const snap=()=>JSON.parse(run('JSON.stringify({inbound:sim.inbound,outbound:sim.outbound,hi:sim.byMachine.M12.sent,lo:sim.byMachine.M13.sent})'));
const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
const diff=(k)=>(b[k]['相位粒子']||0)-(a[k]['相位粒子']||0);
const measured={income:diff('inbound')/60,high:diff('hi')/60,low:diff('lo')/60};assert.deepEqual(measured,{income:60,high:40,low:20});
const overloaded=structuredClone(g);for(const n of overloaded.nodes)if(n.type==='粒子')n.recipe.seconds=2;
const op=prove(overloaded,arith).certificates[0];assert.equal(op.method,'free-outlet-aggregate-saturation');assert.deepEqual(op.outlets.map(x=>x.rate),['1','1']);
const critical=structuredClone(g);for(const n of critical.nodes)if(n.type==='粒子')n.recipe.seconds=3;
const cp=prove(critical,arith).certificates[0];assert.equal(cp.method,'free-outlet-aggregate-saturation');assert.deepEqual(cp.outlets.map(x=>x.rate),['1','1']);
const report={tested,proved,rejected,layout,ast1:run('ast1Encode()'),proof,measured,unique:Object.keys(result.unique).length,overloaded:op,critical:cp};
fs.writeFileSync(path.join(__dirname,'warehouse-overlap-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({tested,proved,rejected,ast1:report.ast1,groups:proof.groups,outlets:proof.outlets,measured,unique:report.unique,overloaded:op.inflow,critical:cp.inflow}));
