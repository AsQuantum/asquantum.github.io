'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../..'),worker=path.join(root,'scripts/engine/steady-certified-worker.js');
let posted;
const c=vm.createContext({console,performance,URL,atob,btoa,structuredClone});
c.self=c;c.location={href:'https://example.invalid/scripts/engine/steady-certified-worker.js?v=test'};
c.postMessage=x=>posted=x;
c.importScripts=(...urls)=>{for(const url of urls){const file=path.resolve(path.dirname(worker),url.split('?')[0]);vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});}};
vm.runInContext(fs.readFileSync(worker,'utf8'),c,{filename:worker});
function run(layout){
 posted=null;c.onmessage({data:{layout,budgetMs:12000}});
 assert(posted&&!posted.error,posted?.error);
 return JSON.parse(JSON.stringify(posted.result));
}
const f=(id,rates)=>({id,name:id,enabled:true,rates});
const tests=[];
function record(name,r){tests.push({name,status:r.status,actual:r.actual.status,known:Object.values(r.values).filter(v=>v!==null).length,unknown:r.actual.unknown.length,unknownMetrics:r.unknownMetrics,rows:r.rows,rounds:r.actual.rounds,ms:Math.round(r.elapsedMs)});}
function layout(machines=[],routes=[],frozenFactories=[]){return {name:'certified-preview',machines,routes,frozenFactories};}
function build(s){return JSON.parse(vm.runInContext('JSON.stringify('+s+')',c));}
const direct=build(`(()=>{
 const a={id:'M0',type:'垃圾',mode:1,x:5,y:10,face:'E'},b={id:'M1',type:'仓入',x:25,y:10,face:'E'};
 const p=outPort(a,0);b.y+=p.ey-inPort(b,0).ey;
 const q=inPort(b,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
 return {name:'source',machines:[a,b],routes:[{id:'R0',from:{id:'M0',port:0},to:{id:'M1',port:0},path}]};
})()`);
{
 const r=run(direct);assert.equal(r.rows['遐想物质'].inflow,'2/15');assert.equal(r.machineTimes.M0,'15/2');assert.equal(r.status,'proved-for-contract');record('autonomous source',r);
}
{
 const g=structuredClone(direct);g.routes[0].to=null;
 const r=run(g);assert.equal(r.values['cycle:M0'],'0');assert.equal(r.values['routeTotal:R0'],'0');assert(r.actual.structuralZeros.excludedComponents.some(c=>c.machines.includes('M0')&&c.z===0));assert(r.actual.structuralZeros.constantQueries>0);assert.equal(r.machineTimes.M0,'Infinity');record('open belt',r);
}
{
 const r=run(layout([],[],[f('s',{'合金板':'1'}),f('a',{'合金板':'-2','硅晶圆':'3'}),f('b',{'合金板':'-3','能量电池':'5'})]));
 assert.equal(r.rows['合金板'].inflow,'1');assert.equal(r.rows['合金板'].outflow,'1');assert.equal(r.rows['合金板'].net,'0');
 assert.equal(r.values['duty:a'],'1/2');assert.equal(r.values['duty:b'],'0');
 assert.equal(r.rows['合金板'].overdraft,'-4');assert.equal(r.rows['合金板'].potential,'-4');
 record('sparse shared frozen scarcity; exact priority',r);
 const u=run(layout([],[],[f('s',{'合金板':'1'}),f('a',{'合金板':'-1/2','硅晶圆':'3'}),f('b',{'合金板':'-3','能量电池':'5'})]));
 assert.equal(u.values['duty:a'],null);assert.equal(u.values['duty:b'],null);assert.equal(u.rows['合金板'].outflow,'1');record('unproved slow frozen priority remains unknown',u);
}
{
 const r=run(layout([],[],[f('s',{'合金板':'2'}),f('a',{'合金板':'-1','硅晶圆':'2'}),f('b',{'硅晶圆':'-1','能量电池':'1'})]));
 assert.equal(r.values['duty:a'],'1');assert.equal(r.values['duty:b'],'1');assert.equal(r.rows['合金板'].net,'1');assert.equal(r.rows['硅晶圆'].net,'1');record('strict surplus and linked frozen production',r);
}
{
 const r=run(layout([],[],[f('s',{'合金板':'1'}),f('a',{'合金板':'-2','硅晶圆':'3'})]));
 assert.equal(r.values['duty:a'],'1/2');assert.equal(r.rows['硅晶圆'].inflow,'3/2');assert.equal(r.rows['合金板'].net,'0');assert.equal(r.status,'proved-for-contract');record('single partially loaded frozen factory',r);
}
{
 const g=build(`(()=>{
 const a={id:'M0',type:'垃圾',mode:1,x:5,y:10,face:'E'},b={id:'M1',type:'仓入',x:25,y:10,face:'E'},
 c={id:'M2',type:'仓出',item:'遐想物质',x:5,y:23,face:'E'},d={id:'M3',type:'电脑',x:25,y:23,face:'E'};
 const routes=[];
 for(const [i,u,v] of [[0,a,b],[1,c,d]]){
  const p=outPort(u,0);v.y+=p.ey-inPort(v,0).ey;
  const q=inPort(v,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
  routes.push({id:'R'+i,from:{id:u.id,port:0},to:{id:v.id,port:0},path});
 }
 return {name:'priority',machines:[a,b,c,d],routes,frozenFactories:[{id:'f',name:'f',enabled:true,rates:{'遐想物质':'-1','合金板':'1'}}]};
})()`);
 const r=run(g);assert.equal(r.rows['遐想物质'].outflow,'2/15');assert.equal(r.values['duty:f'],'0');assert.equal(r.machineTimes.M2,'15/2');assert.equal(r.rows['遐想物质'].overdraft,'-28/15');record('physical first, frozen last',r);
}

// A one-root recipe tree is not a free warehouse-to-warehouse line.
// Its saturated consumption bound follows from the ordinal graph.
{
 const g=build(`(()=>{
  const a={id:'root',type:'仓出',item:'废金属',x:5,y:10,face:'E'},b={id:'make',type:'电池',mode:'标准',x:25,y:10,face:'E'},c={id:'sink',type:'仓入',x:50,y:10,face:'E'},routes=[];
  for(const [i,u,v] of [[0,a,b],[1,b,c]]){
   const p=outPort(u,0);v.y+=p.ey-inPort(v,0).ey;const q=inPort(v,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
   routes.push({id:'r'+i,from:{id:u.id,port:0},to:{id:v.id,port:0},path});
  }
  return {name:'one-root',machines:[a,b,c],routes};
 })()`);
 for(const [offer,take,rate,net] of [['2/5','2/5','1/5','0'],['4/5','4/5','2/5','0'],['1','4/5','2/5','1/5']]){
  g.frozenFactories=[f('source',{'废金属':offer})];const r=run(g);
  assert.equal(r.rows['废金属'].outflow,take);assert.equal(r.values['cycle:make'],rate);assert.equal(r.rows['废金属'].net,net);
  assert.equal(r.rows['废金属'].withdrawalDemand,'4/5');assert.equal(r.unlimited.values['cycle:make'],'2/5');
  record('independent warehouse-fed tree with offer '+offer,r);
 }
}

// Joint scarce stocks, independently supplied, no other consumers.
// This uses actual port geometry and the same worker as HTML.
{
 const g=build(`(()=>{
  const a={id:'a',type:'仓出',item:'合金板',x:4,y:6,face:'E'},b={id:'b',type:'仓出',item:'能量电池',x:4,y:15,face:'E'},m={id:'m',type:'组装',mode:'导线线圈',x:20,y:10,face:'E'},w={id:'w',type:'仓入',x:50,y:10,face:'E'};
  const ins=getPorts(m).filter(p=>p.kind==='in').sort((a,b)=>a.ey-b.ey),routes=[];
  for(const [i,u,v,port] of [[0,a,m,ins[0].index],[1,b,m,ins.at(-1).index],[2,m,w,0]]){
   const p=outPort(u,0);if(i<2)u.y+=inPort(v,port).ey-p.ey;else v.y+=p.ey-inPort(v,port).ey;
   const pp=outPort(u,0),q=inPort(v,port),path=[];for(let x=pp.ex;x<=q.ex;x++)path.push([x,pp.ey]);
   routes.push({id:'r'+i,from:{id:u.id,port:0},to:{id:v.id,port},path});
  }
  return {name:'joint roots',machines:[a,b,m,w],routes};
 })()`);
 for(const [a,b,rate] of [['1/4','1/3','1/4'],['1/3','1/4','1/4'],['1/4','1/4','1/4'],['1','1','1/2'],['0','1','0']]){
  g.frozenFactories=[f('src',{'合金板':a,'能量电池':b})];
  const r=run(g);
  assert.equal(r.values['cycle:m'],rate,JSON.stringify({a,b,actual:r.actual}));
  assert.equal(r.values['machineTotal:a|out'],rate);assert.equal(r.values['machineTotal:b|out'],rate);
  assert.equal(r.unlimited.values['cycle:m'],'1/2');
  const expected={
   '1/4 1/3':['-1/12','1/12'],
   '1/3 1/4':['1/12','-1/12'],
   '1/4 1/4':['0','0'],
   '1 1':['1/2','1/2'],
   '0 1':['-1/2','1']
  }[a+' '+b];
  assert.equal(r.rows['合金板'].potential,expected[0]);assert.equal(r.rows['能量电池'].potential,expected[1]);
  record('joint warehouse tree '+a+' '+b,r);
 }
}

// A connected 1:1 splitter/merger chain does not create a new mean-flow
// degree of freedom. Its real buffer/event timing still enters the tree proof.
{
 const g=build(`(()=>{
  const a={id:'a',type:'仓出',item:'废金属',x:3,y:12,face:'E'},sp={id:'sp',type:'分流',x:14,y:12,face:'E'},m={id:'m',type:'电池',mode:'标准',x:25,y:12,face:'E'},merge={id:'merge',type:'汇流',x:42,y:12,face:'E'},w={id:'w',type:'仓入',x:55,y:12,face:'E'};
  const nodes=[a,sp,m,merge,w],routes=[];
  for(let i=0;i<nodes.length-1;i++){
   const u=nodes[i],v=nodes[i+1],p=outPort(u,0);v.y+=p.ey-inPort(v,0).ey;
   const q=inPort(v,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
   routes.push({id:'r'+i,from:{id:u.id,port:0},to:{id:v.id,port:0},path});
  }
  return {name:'straight relay tree',machines:nodes,routes};
 })()`);
 for(const [offer,rate] of [['2/5','1/5'],['1','2/5']]){
  g.frozenFactories=[f('s',{'废金属':offer})];const r=run(g);
  assert.equal(r.values['cycle:m'],rate,JSON.stringify(r.actual));
  assert.equal(r.values['routeTotal:r0'],r.values['routeTotal:r1']);assert.equal(r.values['routeTotal:r2'],r.values['routeTotal:r3']);
  assert.equal(r.unlimited.values['cycle:m'],'2/5');assert.equal(r.actual.algebraSize.straightRouters,2);
  record('relay chain '+offer,r);
 }
}

// A blocked sibling branch must not invalidate the independently proved
// accepting splitter input or upstream ordinary recipe tree.
{
 const g=build(`(()=>{
  const a={id:'a',type:'仓出',item:'废金属',x:3,y:15,face:'E'},m={id:'m',type:'电池',mode:'标准',x:12,y:15,face:'E'},sp={id:'sp',type:'分流',x:25,y:15,face:'E'},w1={id:'w1',type:'仓入',x:48,y:15,face:'E'},w2={id:'w2',type:'仓入',x:25,y:3,face:'N'},dead={id:'dead',type:'组装',mode:'导线线圈',x:25,y:25,face:'S'};
  const nodes=[a,m,sp,w1,w2,dead],routes=[];
  function connect(u,v,out=0,input=0){
   const p=outPort(u,out),q0=inPort(v,input),[dx,dy]=V[p.side];
   if(dx)v.y+=p.ey-q0.ey;else v.x+=p.ex-q0.ex;
   const q=inPort(v,input),path=[];
   const n=(q.ex-p.ex)*dx+(q.ey-p.ey)*dy;
   for(let j=0;j<=n;j++)path.push([p.ex+dx*j,p.ey+dy*j]);
   routes.push({id:'r'+routes.length,from:{id:u.id,port:out},to:{id:v.id,port:input},path});
  }
  connect(a,m);connect(m,sp);connect(sp,w1,0);connect(sp,w2,1);connect(sp,dead,2);
  return {name:'partially blocked splitter recipe',machines:nodes,routes};
 })()`);
 for(const [supply,rate] of [['2/5','1/5'],['1','2/5']]){
  g.frozenFactories=[f('s',{'废金属':supply})];const r=run(g);if(r.actual.status==='unsupported'){c.testLayout=g;console.log(JSON.stringify(vm.runInContext('(()=>{state=testLayout;return {g:factoryCompileDirectGraph(state,null,{countOnly:true}).issues,paths:state.routes.map(r=>[r.id,checkPath(r.path,r.from,r.to,r.id)])}})()',c)));}
  assert.equal(r.values['cycle:m'],rate,JSON.stringify(r.actual));
  assert.equal(r.values['cycle:dead'],'0');assert.equal(r.values['routeTotal:r4'],'0');
  assert.equal(r.values['routeTotal:r2'],r.values['routeTotal:r3']);
  assert.equal(r.unlimited.values['cycle:m'],'2/5');
  record('recipe tree with blocked splitter sibling '+supply,r);
 }
}
// Slow independent processing tree feeding a contested free merger.
// Its free and worst-wait ordinal slopes are identical. The competing
// saturated autonomous source therefore gets the exact residual capacity.
{
 const g=build(`(()=>{
  const a={id:'a',type:'仓出',item:'星尘粒子',x:3,y:15,face:'E'},m={id:'m',type:'燃料',mode:'标准',x:12,y:15,face:'E'},merge={id:'merge',type:'汇流',x:25,y:15,face:'E'},s={id:'s',type:'采矿',mode:0,x:25,y:3,face:'S'},w={id:'w',type:'仓入',x:48,y:15,face:'E'};
  const routes=[];
  function connect(u,v,input=0,alignSource=false){
   let p=outPort(u,0),q=inPort(v,input);const [dx,dy]=V[p.side];
   if(alignSource){if(dx)u.y+=q.ey-p.ey;else u.x+=q.ex-p.ex;}else{if(dx)v.y+=p.ey-q.ey;else v.x+=p.ex-q.ex;}
   p=outPort(u,0);q=inPort(v,input);const path=[],n=(q.ex-p.ex)*dx+(q.ey-p.ey)*dy;
   for(let j=0;j<=n;j++)path.push([p.ex+dx*j,p.ey+dy*j]);
   routes.push({id:'r'+routes.length,from:{id:u.id,port:0},to:{id:v.id,port:input},path});
  }
  connect(a,m);connect(m,merge);connect(s,merge,1,true);connect(merge,w);
  return {name:'bounded merger receiver',machines:[a,m,merge,s,w],routes};
 })()`);
 for(const [offer,rate] of [['1/2','1/10'],['1','1/5']]){
  g.frozenFactories=[f('supply',{'星尘粒子':offer})];const r=run(g);
  assert.equal(r.values['cycle:m'],rate,JSON.stringify(r.actual));
  assert.equal(r.values['routeTotal:r1'],rate);
  assert.equal(r.values['routeTotal:r3'],'1');
  assert.equal(r.values['routeTotal:r2'],rate==='1/10'?'9/10':'4/5');
  assert(r.actual.proofs.some(x=>x.receiverWaitProof));
  record('bounded merger receiver '+offer,r);
 }
}
// No stock needs a strictly positive net to prove joint full service.
{
 const g=layout([],[],[f('s',{'合金板':'2','硅晶圆':'1','能量电池':'1'}),f('a',{'合金板':'-1','硅晶圆':'-1','齿轮组':'1'}),f('b',{'合金板':'-1','能量电池':'-1','导线线圈':'1'})]);
 const r=run(g);assert.equal(r.values['duty:a'],'1');assert.equal(r.values['duty:b'],'1');
 for(const k of ['合金板','硅晶圆','能量电池'])assert.equal(r.rows[k].net,'0');
 assert(r.actual.proofs.some(x=>x.method==='joint-stock-residual-capacity-bounds'));
 record('joint capacity balance with competing frozen factories',r);
}
// Exact residual supply bounds, without inventing individual shares.
{
 const {proveJointStockResidualBounds}=require('../support/production'),{arith}=require('../support/production');
 const g={nodes:[],frozen:[{id:'a',rates:{A:'-1',B:'-1'}},{id:'b',rates:{A:'-1',C:'-1'}}]};
 const r=proveJointStockResidualBounds(g,arith,{'inflow:A':'3/2','inflow:B':'1','inflow:C':'1'},[],{});
 for(const id of ['a','b'])assert(r.relations.some(x=>x.coefficients['duty:'+id]===-1&&x.constant==='-1/2'));
 assert(!r.relations.some(x=>x.sense==='eq'));
 const missing=proveJointStockResidualBounds(g,arith,{'inflow:A':'3/2'},[],{});
 assert(!missing.relations.some(x=>Object.values(x.coefficients).includes(-1)));
}
// Tree sharing both inputs with another consumer: all consumers can be
// saturated at exact stock balance, not only when some stock grows.
{
 const g=build(`(()=>{
  const a={id:'a',type:'仓出',item:'合金板',x:4,y:6,face:'E'},b={id:'b',type:'仓出',item:'能量电池',x:4,y:15,face:'E'},m={id:'m',type:'组装',mode:'导线线圈',x:20,y:10,face:'E'},w={id:'w',type:'仓入',x:50,y:10,face:'E'};
  const ins=getPorts(m).filter(p=>p.kind==='in').sort((a,b)=>a.ey-b.ey),routes=[];
  for(const [i,u,v,port] of [[0,a,m,ins[0].index],[1,b,m,ins.at(-1).index],[2,m,w,0]]){
   const p=outPort(u,0);if(i<2)u.y+=inPort(v,port).ey-p.ey;else v.y+=p.ey-inPort(v,port).ey;
   const pp=outPort(u,0),q=inPort(v,port),path=[];for(let x=pp.ex;x<=q.ex;x++)path.push([x,pp.ey]);
   routes.push({id:'r'+i,from:{id:u.id,port:0},to:{id:v.id,port},path});
  }
  return {name:'shared balanced tree',machines:[a,b,m,w],routes};
 })()`);
 g.frozenFactories=[f('src',{'合金板':'3/2','能量电池':'3/2'}),f('other',{'合金板':'-1','能量电池':'-1','齿轮组':'1'})];
 const r=run(g);assert.equal(r.values['cycle:m'],'1/2');assert.equal(r.values['duty:other'],'1');assert.equal(r.rows['合金板'].net,'0');assert.equal(r.rows['能量电池'].net,'0');record('joint tree and frozen capacity balance',r);
}
// Warehouse priority through a no-wait relay path, not only direct
// warehouse-to-terminal belts. One sparse physical supply; the first
// outlet consumes it all regardless of delivery phase.
{
 const g=build(`(()=>{
  const a={id:'M0',type:'垃圾',mode:1,x:3,y:5,face:'E'},w={id:'M1',type:'仓入',x:25,y:5,face:'E'},b={id:'M2',type:'仓出',item:'遐想物质',x:3,y:15,face:'E'},m={id:'M3',type:'汇流',x:15,y:15,face:'E'},c={id:'M4',type:'电脑',x:25,y:15,face:'E'},d={id:'M5',type:'仓出',item:'遐想物质',x:3,y:24,face:'E'},e={id:'M6',type:'电脑',x:25,y:24,face:'E'};
  const routes=[];
  for(const [u,v] of [[a,w],[b,m],[m,c],[d,e]]){
   const p=outPort(u,0);v.y+=p.ey-inPort(v,0).ey;const q=inPort(v,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
   routes.push({id:'r'+routes.length,from:{id:u.id,port:0},to:{id:v.id,port:0},path});
  }
  return {name:'warehouse priority through relay',machines:[a,w,b,m,c,d,e],routes};
 })()`);
 const r=run(g);assert.equal(r.values['machineTotal:M2|out'],'2/15',JSON.stringify(r.actual));assert.equal(r.values['machineTotal:M5|out'],'0');
 assert.equal(r.values['routeTotal:r2'],'2/15');assert.equal(r.rows['遐想物质'].outflow,'2/15');assert.equal(r.rows['遐想物质'].withdrawalDemand,'2');
 assert.equal(r.unlimited.values['machineTotal:M2|out'],'1');assert.equal(r.unlimited.values['machineTotal:M5|out'],'1');
 assert(r.actual.proofs.some(x=>x.method==='refill-buffer-always-has-space-eventually'&&x.machine==='M2'));
 record('warehouse priority through no-wait merger',r);
}
// A single sparse source permits exact frozen priority even when neither
// consumer is known a priori. The lower-priority actor may have many inputs.
{
 const g=layout([],[],[f('s',{'合金板':'3/5','硅晶圆':'1'}),f('a',{'合金板':'3/2','齿轮组':'1'}),f('b',{'合金板':'-1','硅晶圆':'-1','导线线圈':'1'})]);
 g.frozenFactories[1].rates['合金板']='-3/2';
 const r=run(g);
 assert.equal(r.values['duty:a'],'2/5');assert.equal(r.values['duty:b'],'0');assert.equal(r.rows['合金板'].net,'0');
 assert(r.actual.proofs.some(x=>x.method==='sparse-unit-frozen-priority'));
 record('sparse frozen source with priority',r);
}
{
 const g=build(`(()=>{
  const a={id:'M0',type:'垃圾',mode:1,x:3,y:5,face:'E'},w={id:'M1',type:'仓入',x:25,y:5,face:'E'};
  const p=outPort(a,0);w.y+=p.ey-inPort(w,0).ey;const q=inPort(w,0),path=[];for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
  return {name:'sparse physical source',machines:[a,w],routes:[{id:'r',from:{id:a.id,port:0},to:{id:w.id,port:0},path}]};
 })()`);
 g.frozenFactories=[f('a',{'遐想物质':'-1','合金板':'1'}),f('b',{'遐想物质':'-5','硅晶圆':'1'})];
 const r=run(g);assert.equal(r.values['duty:a'],'2/15');assert.equal(r.values['duty:b'],'0');
 record('sparse physical deposits with frozen priority',r);
}
{
 const {arith}=require('../support/production'),{proveSparseFrozenPriority:prove}=require('../support/production');
 const g={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],frozen:[{id:'s',rates:{k:'1'}},{id:'a',rates:{k:'-1'}},{id:'b',rates:{k:'-2'}}]};
 assert.equal(prove(g,arith).relations.length,2);
 const bad=structuredClone(g);bad.frozen[1].rates.k='-1/2';assert.equal(prove(bad,arith).relations.length,0);
 bad.frozen[1].rates.k='-1';bad.frozen[0].rates.k='2';assert.equal(prove(bad,arith).relations.length,0);
 bad.frozen[0].rates.k='1';bad.nodes.push({type:'仓出',item:'k'});assert.equal(prove(bad,arith).relations.length,0);
 bad.nodes=[];bad.frozen[1].rates.x='-1';assert.equal(prove(bad,arith).relations.length,0);
}
{
 const g=layout([],[],[f('source',{'合金板':'1/4','能量电池':'3/4'}),f('a',{'合金板':'-1','能量电池':'-1','硅晶圆':'1'}),f('b',{'合金板':'-1','能量电池':'-1','齿轮组':'1'})]);
 const r=run(g);assert.equal(r.rows['合金板'].potential,null);record('contested joint other stock refuses unsupported potential',r);
}
// Restored phase-independent exclusive frozen network theorems.
for(const [name,fs,duties] of [
 ['exclusive loss ring',[f('a',{'合金板':'-2','硅晶圆':'1'}),f('b',{'硅晶圆':'-1','合金板':'1'}),f('s',{'合金板':'1/5'})],{a:'1/5',b:'1/5',s:'1'}],
 ['exclusive equal ring',[f('a',{'合金板':'-2','硅晶圆':'2'}),f('b',{'硅晶圆':'-1','合金板':'1'}),f('s',{'合金板':'1/4'})],{a:'5/8',b:'1',s:'1'}],
 ['exclusive multi-input feedback',[f('a',{'合金板':'-1','能量电池':'-2','硅晶圆':'2','星尘粒子':'1'}),f('b',{'硅晶圆':'-3','星尘粒子':'-1','合金板':'1/2','能量电池':'3'}),f('s',{'合金板':'1/5','能量电池':'1/4'})],{a:'3/10',b:'1/5',s:'1'}],
 ['unseeded ring',[f('a',{'合金板':'-1','硅晶圆':'1'}),f('b',{'硅晶圆':'-1','合金板':'1'})],{a:'0',b:'0'}]
]){
 const r=run(layout([],[],fs));for(const [id,duty] of Object.entries(duties))assert.equal(r.values['duty:'+id],duty,JSON.stringify(r.actual));record(name,r);
}
// Documented historical exclusive DAG and feedback examples, run through
// the deployed Worker, not through archived research modules.
{
 const r=run(layout([],[],[f('consumer',{'合金板':'-2','钛合金锭':'-1','复合装甲板':'3'}),f('later',{'复合装甲板':'-3','齿轮组':'2'}),f('sourceA',{'合金板':'3/4'}),f('sourceB',{'钛合金锭':'1/2'})]));
 assert.equal(r.values['duty:consumer'],'3/8');assert.equal(r.values['duty:later'],'3/8');assert.equal(r.rows['齿轮组'].net,'3/4');record('documented exclusive two-stage chain',r);
 const deep=[f('source',{'k0':'1/7'}),...Array.from({length:40},(_,i)=>f('f'+i,{['k'+i]:'-1',['k'+(i+1)]:'1'}))].reverse();
 const d=run(layout([],[],deep));assert.equal(d.values['duty:f39'],'1/7');record('documented exclusive forty-stage chain',d);
}
for(const [name,fs,duties] of [
 ['documented unfed loss ring',[f('a',{'合金板':'-2','硅晶圆':'1'}),f('b',{'硅晶圆':'-1','合金板':'1'})],{a:'0',b:'0'}],
 ['documented fed gain ring',[f('a',{'合金板':'-2','硅晶圆':'3'}),f('b',{'硅晶圆':'-1','合金板':'1'}),f('s',{'合金板':'1/10'})],{a:'11/20',b:'1',s:'1'}],
 ['documented multiple frozen producers',[f('a',{'合金板':'-1','硅晶圆':'1/2','星尘粒子':'1'}),f('b',{'硅晶圆':'-1','合金板':'1/4'}),f('c',{'星尘粒子':'-2','合金板':'1/2'}),f('s',{'合金板':'1/4'})],{a:'2/5',b:'1/5',c:'1/5',s:'1'}]
]){
 const r=run(layout([],[],fs));for(const [id,duty] of Object.entries(duties))assert.equal(r.values['duty:'+id],duty,JSON.stringify(r.actual));record(name,r);
}
console.log(JSON.stringify(tests.map(({name,status,known,unknown,unknownMetrics,ms})=>({name,status,known,unknown,unknownMetrics,ms}))));
