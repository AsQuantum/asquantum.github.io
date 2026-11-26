'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveFeedForwardOrdinals:prove}=require('./feed_forward_ordinal_proof'),{compileCountProofProblem:compile}=require('./count_proof_compile'),{solveFactoredCounts:solve}=require('./count_factored_projection');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='小行星矿石';
const range=(a,b)=>Array.from({length:Math.abs(b-a)+1},(_,i)=>a+Math.sign(b-a)*i);
const m=(id,type,x,y,face='E',extra={})=>({id,type,x,y,face,...extra});
const line=(id,from,port,to,tp,path)=>({id,from:{id:from,port},to:{id:to,port:tp},path});
function diamond(y,mode=0){
 return {name:'diamond '+y,recordIndexed:true,machines:[m('M0','采矿',2,9,'E',{mode}),m('M1','分流',15,10),m('M2','汇流',32,10),m('M3','仓入',45,9)],routes:[
 line('R0','M0',0,'M1',0,range(7,14).map(x=>[x,11])),
 line('R1','M1',0,'M2',0,range(18,31).map(x=>[x,11])),
 line('R2','M1',1,'M2',1,[...range(9,y).map(y=>[16,y]),...range(17,33).map(x=>[x,y]),...range(y+1,9).map(y=>[33,y])]),
 line('R3','M2',0,'M3',1,range(35,44).map(x=>[x,11]))
 ],frozenFactories:[]};
}
function graph(l){c.layout=l;run('state=layout');const err=run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');assert(err.every(x=>!x),JSON.stringify(err));return JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))'));}
const records=[];
for(const y of [5,7,6,4]){
 const l=diamond(y),g=graph(l),p=prove(g,arith);
 assert.equal(p.certificates.length,1,JSON.stringify(p));const r=solve(compile(g,arith,p),arith);assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);assert.equal(r.unique['routeTotal:R1'],'1/2');assert.equal(r.unique['routeTotal:R2'],'1/2');assert.equal(r.unique['net:'+K],'1');
 const combined=require('./combine_count_proofs').combine(g).result;assert.equal(combined.status,'sat');assert.deepEqual(combined.unique,r.unique);
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');const snap=()=>JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(sim.byMachine).map(([id,s])=>[id,s.sent])))'));const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
 for(const x of p.routeRates){const e=g.lines.find(e=>e.id===x.route);if(e.from==='M1')continue;const n=(b[e.from][K]||0)-(a[e.from][K]||0);assert.equal(n,3600);}
 const dest=JSON.parse(run('JSON.stringify(sim.inbound)'));assert(dest[K]>4700);
 records.push({y,unique:Object.keys(r.unique).length,proof:p.certificates[0],actual:b,layout:l});
}
for(const l of [JSON.parse(fs.readFileSync(path.join(__dirname,'recipe-tree-results.json'),'utf8')).layout,JSON.parse(fs.readFileSync(path.join(__dirname,'recipe-tree-results.json'),'utf8')).deep.layout]){
 const p=prove(graph(l),arith);records.push({name:l.name,certified:p.certificates.length,refused:p.refused});
}
// A genuinely processed reconverging network, not just logistics.
const gear=diamond(7,1);gear.name='slow split rejoin gear';gear.machines[3]=m('M3','组装',45,8,'E',{mode:'齿轮组'});gear.machines.push(m('M4','仓入',60,9));gear.routes[3].to.port=1;gear.routes.push(line('R4','M3',0,'M4',1,range(56,59).map(x=>[x,11])));
const gg=graph(gear),gp=prove(gg,arith);assert.equal(gp.certificates.length,1,JSON.stringify(gp));const gr=solve(compile(gg,arith,gp),arith);assert.equal(gr.status,'sat');assert.equal(gr.multiple.length,0);assert.equal(gr.unique['net:齿轮组'],'1/15');
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');let ga=run('sim.inbound["齿轮组"]||0');run('for(let i=0;i<72000;i++)simulate(.05)');assert.equal(run('sim.inbound["齿轮组"]||0')-ga,240);
records.push({name:gear.name,unique:Object.keys(gr.unique).length,proof:gp.certificates[0],layout:gear});
// Two independent deposits from a splitter, coupled through shared
// warehouse inventory with negative frozen and physical withdrawal.
const joint={name:'certified physical feed and frozen competition',recordIndexed:true,machines:[
 m('M0','采矿',2,9,'E',{mode:0}),m('M1','分流',10,10),m('M2','仓入',17,9),m('M3','仓入',9,1,'N'),
 m('M4','仓出',2,20,'E',{item:K}),m('M5','电脑',11,21)
],routes:[
 line('R0','M0',0,'M1',0,range(7,9).map(x=>[x,11])),
 line('R1','M1',0,'M2',1,range(13,16).map(x=>[x,11])),
 line('R2','M1',1,'M3',1,range(9,6).map(y=>[11,y])),
 line('R3','M4',0,'M5',0,range(7,10).map(x=>[x,22]))
],frozenFactories:[{id:'a',rates:{[K]:'-20','硅晶圆':'20'}},{id:'s',rates:{[K]:'1'}}]};
const jg=graph(joint),jp=prove(jg,arith);assert.equal(jp.depositWords.length,2,JSON.stringify(jp));const {proveFrozenFiniteComponents}=require('./frozen_finite_components');
const jq=proveFrozenFiniteComponents(jg,arith,{depositWords:jp.depositWords});assert.equal(jq.certificates.length,1,JSON.stringify(jq));assert.equal(jq.certificates[0].certifiedPhysicalWords,2);
const jr=require('./combine_count_proofs').combine(jg,{htmlQueries:true});assert.equal(jr.result.status,'sat',JSON.stringify(jr.passes));assert.equal(jr.result.multiple.length,0,JSON.stringify(jr.result.multiple));assert.equal(jr.result.unique['routeTotal:R3'],'1');assert.equal(jr.result.unique['duty:a'],'1/20');
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');const ja=run('sim.byMachine.M4.sent["'+K+'"]||0');const da=run('sim.frozenRuntime.a.activeTime');run('for(let i=0;i<72000;i++)simulate(.05)');assert.equal(run('sim.byMachine.M4.sent["'+K+'"]||0')-ja,3600);assert(Math.abs((run('sim.frozenRuntime.a.activeTime')-da)/3600-.05)<.001);
records.push({name:joint.name,unique:Object.keys(jr.result.unique).length,proof:jq.certificates[0],sources:jr.sources,layout:joint});

// Random serial chains of split/rejoin stages, variable branch delays
// aligned with the port cycle. Graph topology and IDs are not fixed.
let seed=102927;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;};
let certified=0,rejected=0,reasons={};
for(let t=0;t<100;t++){
 const nodes=[],lines=[],mk=(type,recipe)=>{const id='n'+(nodes.length*13+7);nodes.push({id,type,recipe,physicalInCount:0,physicalOutCount:0});return id;};
 const edge=(from,to,fromPort,toPort,length)=>{lines.push({id:'e'+(lines.length*17+3),from,to,fromPort,toPort,length,materials:['k'],active:true,compatible:true});nodes.find(n=>n.id===from).physicalOutCount++;nodes.find(n=>n.id===to).physicalInCount++;};
 let prev=mk('采矿',{output:'k',qty:1,seconds:1,inputs:{}}),depth=1+rnd(5);
 for(let i=0;i<depth;i++){
  const s=mk('分流'),m=mk('汇流'),n=2+rnd(2);edge(prev,s,0,0,1+rnd(12));
  const base=1+rnd(8);for(let j=0;j<n;j++)edge(s,m,j,j,base+2*n*rnd(4));prev=m;
 }
 edge(prev,mk('仓入'),0,0,1+rnd(10));
 const g={status:'compiled',completePhysicalRoutes:true,nodes,lines,frozen:[],pools:[]},p=prove(g,arith);
 if(!p.certificates.length){rejected++;for(const x of p.refused)reasons[x.reason]=(reasons[x.reason]||0)+1;continue;}certified++;
 assert.equal(p.routeRates.at(-1).rate,'1');const r=solve(compile(g,arith,p),arith);assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);
 const reverse={...g,nodes:g.nodes.slice().reverse(),lines:g.lines.slice().reverse()},rp=prove(reverse,arith);assert.equal(rp.certificates.length,1);assert.deepEqual(Object.fromEntries(rp.routeRates.map(e=>[e.route,e.rate])),Object.fromEntries(p.routeRates.map(e=>[e.route,e.rate])));
}
assert(certified>44);const report={records,random:{certified,rejected,reasons}};fs.writeFileSync(path.join(__dirname,'feed-forward-ordinal-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({records:records.map(r=>({y:r.y,name:r.name,unique:r.unique,rejected:r.rejected,certified:r.certified,refused:r.refused})),random:report.random}));
