'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveSaturatedTransferRegions:prove}=require('./saturated_transfer_regions'),{compileCountProofProblem:compile}=require('./count_proof_compile'),{solveFactoredCounts:solve}=require('./count_factored_projection');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='框架模块',A='共鸣水晶',B='等离子电池',L='引力透镜';
const range=(a,b)=>Array.from({length:Math.abs(b-a)+1},(_,i)=>a+Math.sign(b-a)*i);
const m=(id,type,x,y,face='E',extra={})=>({id,type,x,y,face,...extra});
const line=(id,from,port,to,tp,path)=>({id,from:{id:from,port},to:{id:to,port:tp},path});
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'feed-forward-ordinal-results.json'),'utf8')).records.find(x=>x.y===7).layout;
const l=structuredClone(fixture);l.name='saturated reconverging lens region';
Object.assign(l.machines.find(m=>m.id==='M0'),{type:'仓出',item:K});
Object.assign(l.machines.find(m=>m.id==='M3'),{type:'量装',x:45,y:7,mode:L});
l.machines.push(m('M4','仓出',38,1,'S',{item:A}),m('M5','仓出',38,16,'N',{item:B}),m('M6','仓入',60,9));
l.routes.push(line('R4','M4',0,'M3',0,[...range(6,10).map(y=>[40,y]),...range(41,44).map(x=>[x,10])]),line('R5','M5',0,'M3',2,[...range(15,12).map(y=>[40,y]),...range(41,44).map(x=>[x,12])]),line('R6','M3',0,'M6',1,range(56,59).map(x=>[x,11])));
l.frozenFactories=[{id:'stock',rates:{[K]:'2',[A]:'2',[B]:'2'}}];
c.layout=l;run('state=layout');assert(run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))').every(v=>!v),run('JSON.stringify(state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id)))'));
const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))')),p=prove(g,arith);
assert.equal(p.certificates.length,1,JSON.stringify(p));assert.equal(p.roundRobin.length,1);assert.equal(p.machineRates[0].rate,'1/15');
const r=solve(compile(g,arith,p),arith);assert.equal(r.status,'sat');assert.equal(r.multiple.length,0,JSON.stringify(r.multiple));
assert.equal(r.unique['routeTotal:R1'],'1/30');assert.equal(r.unique['routeTotal:R2'],'1/30');assert.equal(r.unique['net:'+L],'1/15');
run('const routeCounts={};const originalSendItem=sendItem;sendItem=function(m,s,index,item){const ok=originalSendItem(m,s,index,item);if(ok){const id=routeFor(m.id,\'out\',index).id;routeCounts[id]=(routeCounts[id]||0)+1;}return ok;};resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const snap=()=>JSON.parse(run('JSON.stringify({in:sim.inbound,out:sim.outbound,recv:sim.byMachine.M2.received,sent:sim.byMachine.M1.sent,counts:routeCounts})'));
const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();assert.equal(b.in[L]-a.in[L],240);for(const id of ["R1","R2"])assert.equal(b.counts[id]-a.counts[id],120);
const bad=structuredClone(g);bad.nodes.find(m=>m.id==='M3').recipe.seconds=3;assert.equal(prove(bad,arith).certificates.length,0);
const report={actual:{unique:Object.keys(r.unique).length,proof:p.certificates[0],rates:r.unique,measured:(b.in[L]-a.in[L])/3600,layout:l},random:{}};
let seed=768439;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;};
for(let trial=0;trial<60;trial++){
 const nodes=[],lines=[],mk=(type,recipe,item)=>{const id='id'+(nodes.length*13+5);nodes.push({id,type,recipe,item,physicalInCount:0,physicalOutCount:0});return id;};
 const edge=(a,b,ap,bp,k)=>{lines.push({id:'r'+(lines.length*17+9),from:a,to:b,fromPort:ap,toPort:bp,length:1+rnd(20),materials:[k],active:true,compatible:true});nodes.find(n=>n.id===a).physicalOutCount++;nodes.find(n=>n.id===b).physicalInCount++;};
 let prev=mk('仓出',null,'k'),depth=1+rnd(5),maxDepth=0;
 // Arbitrary combinations of serial and nested parallel forks. Vary
 // number of branches, path lengths and whether a branch has relays.
 for(let i=0;i<depth;i++){
  const s=mk('分流'),m=mk('汇流'),n=2+rnd(2);edge(prev,s,0,0,'k');
  for(let j=0;j<n;j++){
   let v=s,port=j;
   for(let t=rnd(3);t>0;t--){const relay=mk(rnd(2)?'分流':'汇流');edge(v,relay,port,0,'k');v=relay;port=0;}
   edge(v,m,port,j,'k');
  }
  prev=m;
 }
 const sink=mk('组装',{output:'out',qty:1,seconds:200,inputs:{k:1}}),deposit=mk('仓入');edge(prev,sink,0,0,'k');edge(sink,deposit,0,0,'out');
 const graph={status:'compiled',completePhysicalRoutes:true,nodes,lines,frozen:[{id:'s',rates:{k:'2'}}],pools:[{item:'k',order:[nodes[0].id]},{item:'out',order:[]}]},p=prove(graph,arith);
 assert.equal(p.certificates.length,1,JSON.stringify(p));const r=solve(compile(graph,arith,p),arith);assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);assert.equal(r.unique['net:out'],'1/200');
 const reversed={...graph,nodes:nodes.slice().reverse(),lines:lines.slice().reverse()},rp=prove(reversed,arith);
 assert.equal(rp.certificates.length,1);const rr=solve(compile(reversed,arith,rp),arith);assert.deepEqual(rr.unique,r.unique);
}
report.random={certified:60,relabel:60};
fs.writeFileSync(path.join(__dirname,'saturated-transfer-regions-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({unique:report.actual.unique,proof:report.actual.proof,actual:report.actual.measured,random:report.random}));
