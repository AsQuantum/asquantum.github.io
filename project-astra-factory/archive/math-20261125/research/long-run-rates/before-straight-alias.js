'use strict';
// Generated from audited research modules; no runtime research-directory dependency.

// --- direct_graph.js source SHA256 300de5fe7ba5fb241dc4bf4b0c08e2d3eb0865dc08cb5873b216676674fc9f2e ---
'use strict';
// Independent browser-compatible graph compiler. Does not load or call the
// legacy numerical fixed-point solver. Uses the existing physical model API.
function factoryCompileDirectGraph(layout=state,model=null,{unlimitedWarehouse=false,countOnly=false}={}){
 if(!model){
  if(layout!==state)throw Error('Pass equations for a non-current layout');
  if(countOnly){
   // The strict compiler requires only physical edges and warehouse
   // identities, not any continuous demand/fairness or old queue model.
   const byId=new Map(layout.machines.map(m=>[m.id,m]));
   const sharedLines=layout.routes.filter(r=>r.to&&byId.has(r.from.id)&&byId.has(r.to.id)&&!checkPath(r.path,r.from,r.to,r.id)).map(r=>({
    route:r.id,from:r.from,to:r.to,materials:[...streamMaterials(r)].filter(k=>acceptsMaterial(byId.get(r.to.id),k,r.to.port)).sort()
   }));
   const warehouseItems=new Set([...layout.machines.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item),...sharedLines.filter(r=>byId.get(r.to.id).type==='仓入').flatMap(r=>r.materials)]);
   model={sharedLines,warehousePools:[...warehouseItems].map(item=>({item,withdrawalMachineOrder:layout.machines.filter(m=>m.type==='仓出'&&m.item===item).sort(warehouseMachinePriorityCompare).map(m=>m.id)}))};
  }else model=factorySteadyBuildEquations();
 }
 const nodes=new Map(layout.machines.map(m=>[m.id,m])),lines=model.sharedLines,issues=[];
 const ins=new Map([...nodes.keys()].map(k=>[k,[]])),outs=new Map([...nodes.keys()].map(k=>[k,[]]));
 for(const r of lines){ins.get(r.to.id).push(r);outs.get(r.from.id).push(r);}
 const sourceRoutes=new Map(layout.routes.map(r=>[r.id,r]));
 const issue=(machine,reason)=>{if(countOnly&&/^(physical FIFO can carry rejected material|mixed FIFO feeding a recipe or splitter|selected incompatible splitter filter|mixed recirculation)/.test(reason))return;issues.push({machine,reason});};
 const frozen=activeFrozenFactories(layout),items=[...new Set([...model.warehousePools.map(p=>p.item),...frozen.flatMap(f=>Object.keys(f.rates))])];
 const startup=factorySteadyGenericStartupReachability(layout,{initialWarehouseItems:unlimitedWarehouse?items:[],frozenFactories:frozen});
 for(const m of nodes.values()){
  const incoming=ins.get(m.id),outgoing=outs.get(m.id),recipe=getRecipe(m);
  if(!incoming.length&&!outgoing.length)continue;
  if(recipe&&outgoing.length>1)issue(m.id,'shared recipe output arbitration unspecified');
  if(m.type==='分流'&&incoming.length>1)issue(m.id,'multiple splitter inputs unspecified');
  if(m.type==='汇流'&&outgoing.length>1)issue(m.id,'multiple merger outputs unspecified');
  if(m.type==='仓出'&&outgoing.length>1)issue(m.id,'multiple warehouse output ports unspecified');
  if(!recipe&&!['分流','汇流','仓出','仓入','电脑'].includes(m.type))issue(m.id,'unrecognized logistics transition');
  for(const r of incoming){
   const physical=sourceRoutes.get(r.route),raw=physical?[...streamMaterials(physical)]:r.materials;
   if(raw.some(item=>!r.materials.includes(item)))issue(m.id,'physical FIFO can carry rejected material on '+r.route);
   if((recipe||m.type==='分流')&&r.materials.length>1)issue(m.id,'mixed FIFO feeding a recipe or splitter needs ordered-item equations');
  }
  if(m.type==='分流'){
   const mats=new Set(incoming.flatMap(r=>r.materials));
   for(const r of layout.routes.filter(r=>r.from.id===m.id&&(!countOnly||r.to))){
    const filter=outPort(m,r.from.port)?.filter||'';
    if(filter&&filter!=='任意'&&[...mats].some(item=>item!==filter))issue(m.id,'selected incompatible splitter filter can hold FIFO head');
   }
  }
 }
 // Positive mixed feedback requires an ordered composition proof. A route
 // from an inactive/empty component can still be correctly forced to zero.
 const active=r=>!!(startup.potentiallyActiveItemsByRoute[r.route]||[]).length;
 for(const r of lines)if(active(r)&&r.materials.length>1){
  const seen=new Set(),todo=[r.to.id];while(todo.length){const id=todo.pop();if(id===r.from.id){issue(id,'mixed recirculation requires ordered material dynamics');break;}if(seen.has(id))continue;seen.add(id);for(const x of outs.get(id)||[])if(active(x)&&nodes.get(id).type==='汇流')todo.push(x.to.id);}
 }
 const portKeys=layout.routes.flatMap(r=>[JSON.stringify([r.from.id,'out',r.from.port]),...(r.to?[JSON.stringify([r.to.id,'in',r.to.port])]:[])]);
 const completePhysicalRoutes=lines.length===(countOnly?layout.routes.filter(r=>r.to).length:layout.routes.length)&&new Set(portKeys).size===portKeys.length&&new Set(layout.routes.map(r=>r.id)).size===layout.routes.length&&new Set(layout.machines.map(m=>m.id)).size===layout.machines.length;
 return {status:issues.length?'unresolved':'compiled',issues,unlimited:unlimitedWarehouse,completePhysicalRoutes,...(countOnly?{emptyStartProof:{method:startup.method,initialWarehouseItems:startup.initialWarehouseItems,routeItems:startup.potentiallyActiveItemsByRoute,cannotProduce:startup.cannotEverProduce,stocked:startup.potentiallyStockedItems}}:{}),nodes:layout.machines.map(m=>({id:m.id,type:m.type,recipe:getRecipe(m),item:m.item,inletItem:m.inletItem,face:m.face,physicalInCount:layout.routes.filter(r=>r.to?.id===m.id).length,physicalOutCount:layout.routes.filter(r=>r.from.id===m.id&&(!countOnly||r.to)).length,openOutCount:layout.routes.filter(r=>r.from.id===m.id&&!r.to).length,inputPriority:machineInputPriority(m).map(p=>p.index)})),lines:lines.map(r=>({id:r.route,from:r.from.id,to:r.to.id,toPort:r.to.port,fromPort:r.from.port,materials:r.materials,active:active(r),length:sourceRoutes.get(r.route)?.path?.length,rawMaterials:[...streamMaterials(sourceRoutes.get(r.route))],outFilter:outPort(nodes.get(r.from.id),r.from.port)?.filter||'',acceptedMaterials:[...new Set([...MATERIALS,...r.materials,...[...streamMaterials(sourceRoutes.get(r.route))]])].filter(k=>acceptsMaterial(nodes.get(r.to.id),k,r.to.port)),compatible:r.materials.length===1&&[...streamMaterials(sourceRoutes.get(r.route))].every(k=>k===r.materials[0])&&acceptsMaterial(nodes.get(r.to.id),r.materials[0],r.to.port)&&(!outPort(nodes.get(r.from.id),r.from.port)?.filter||outPort(nodes.get(r.from.id),r.from.port).filter==='任意'||outPort(nodes.get(r.from.id),r.from.port).filter===r.materials[0])})),pools:model.warehousePools.map(p=>({item:p.item,order:p.withdrawalMachineOrder})),frozen:frozen.map(f=>({...f,reachable:unlimitedWarehouse||Object.entries(f.rates).every(([item,rate])=>steadyRegionQ(rate).n>=0n||startup.potentiallyStockedItems.includes(item))}))};
}
function factoryDirectArithmetic(){return {q:steadyRegionQ,add:steadyExactAdd,sub:steadyExactSub,mul:steadyExactMul,div:steadyExactDiv,cmp:steadyExactCmp,txt:steadyExactText,Z:STEADY_ZERO,U:STEADY_ONE};}


// --- symbolic_physical_spec.js source SHA256 b4550b61d3114ce46e5fc2ef55943fe18402d4fdacfc7cfce9071e02aabf8648 ---
'use strict';
// Compile the physical topology, independently of the conditional S/D graph.
// Ports and actual geometry are exported by the editor, no graph-specific
// recipes, layouts, IDs or measured rates in the compiler.
function factoryCompileSymbolicSpec(layout=state,{unlimitedWarehouse=false}={}){
 const machines=layout.machines.map(m=>({
  id:m.id,type:m.type,item:m.item,recipe:getRecipe(m),
  outPorts:getPorts(m).filter(p=>p.kind==='out').map(p=>({index:p.index,filter:p.filter||''})),
  inputPriority:machineInputPriority(m).map(p=>p.index),
  mergerPriority:m.type==='汇流'?mergerInputOrder(m).map(p=>p.index):[]
 }));
 const all=new Set(MATERIALS);
 for(const m of machines){if(m.item)all.add(m.item);if(m.recipe){all.add(m.recipe.output);for(const k of Object.keys(m.recipe.inputs))all.add(k);}}
 const frozen=normalizeFrozenFactories(layout.frozenFactories||[]).filter(f=>f.enabled&&Object.keys(f.rates).length);
 for(const f of frozen)for(const k of Object.keys(f.rates))all.add(k);
 const routes=layout.routes.map(r=>{const target=r.to&&layout.machines.find(m=>m.id===r.to.id);
  return {id:r.id,from:r.from.id,fromPort:r.from.port,to:r.to?.id??null,toPort:r.to?.port??null,length:r.path.length,
   accepted:target?[...all].filter(k=>acceptsMaterial(target,k,r.to.port)):[...all]};
 });
 const priority=layout.machines.filter(m=>m.type==='仓出').sort(warehouseMachinePriorityCompare).map(m=>m.id);
 return {machines,routes,frozen,priority,unlimitedWarehouse,initial:'empty'};
}


// --- tandem_count_proof.js source SHA256 cd2929d2e798b1c91a7004bafc96e4010ba908cb399d4e27d5ad49375174c097 ---
'use strict';
// Exact finite event graph for an empty-start, single-product tandem.
// No guessed downstream cadence, no time stepping. Continuous causal model.
// All quantities are positive integers; one autonomous root, one free deposit.
function proveTandem(stages,lengths,arith,{maxNodes=600,maxEdges=120000}={}){
 const {q,cmp,add,mul,div,txt,U,Z}=arith;
 const fail=reason=>({status:'not-proved',reason});
 if(!Array.isArray(stages)||!stages.length||stages.length!==lengths.length)return fail('invalid tandem');
 const gcd=(a,b)=>{while(b){const c=a%b;a=b;b=c;}return a;},lcm=(a,b)=>a/gcd(a,b)*b;
 for(let i=0;i<stages.length;i++){
  const m=stages[i];if(!Number.isSafeInteger(m.b)||m.b<1||i&&(!Number.isSafeInteger(m.a)||m.a<1)||cmp(q(m.T),Z)<=0||!Number.isSafeInteger(lengths[i])||lengths[i]<1)return fail('invalid stage');
 }
 // Balanced integer repetition vector: N_i*b_i=N_(i+1)*a_(i+1).
 let ratios=[U];for(let i=1;i<stages.length;i++)ratios.push(div(mul(ratios[i-1],q(stages[i-1].b)),q(stages[i].a)));
 const scale=ratios.reduce((s,v)=>lcm(s,v.d),1n);
 const counts=ratios.map(v=>v.n*(scale/v.d));
 const packets=counts.map((v,i)=>v*BigInt(stages[i].b));
 if(counts.reduce((s,v,i)=>s+v+2n*packets[i],0n)>BigInt(maxNodes))return fail('symbolic phase limit');
 const N=counts.map(Number),J=packets.map(Number),P=U,d=q('1/2'),V=[],offsets=[];
 for(let i=0;i<stages.length;i++){
  offsets.push({});
  for(const [kind,n] of [['a',N[i]],['s',J[i]],['r',J[i]]]){
   offsets[i][kind]=V.length;
   for(let k=0;k<n;k++)V.push({stage:i,kind,index:k});
  }
 }
 const edges=[];
 function edge(i,kind,j,h,to,k,w){
  const n=kind==='a'?N[i]:J[i],block=Math.floor(j/n),phase=((j%n)+n)%n;
  if(block>0)throw Error('noncausal block dependency');
  edges.push({from:offsets[i][kind]+phase,to:offsets[h][to]+k,lag:-block,w:q(w)});
 }
 for(let i=0;i<stages.length;i++){
  const {b,a,T}=stages[i],C=20*b,L=lengths[i],K=L+1,A=q({n:BigInt(L),d:2n});
  for(let j=0;j<N[i];j++){
   edge(i,'a',j-1,i,'a',j,T);
   edge(i,'s',(j+1)*b-C-1,i,'a',j,Z);
   if(i)edge(i-1,'r',(j+1)*a-1,i,'a',j,Z);
  }
  for(let j=0;j<J[i];j++){
   edge(i,'s',j-1,i,'s',j,P);
   edge(i,'r',j-K,i,'s',j,d);
   edge(i,'a',Math.floor(j/b),i,'s',j,T);
   edge(i,'s',j,i,'r',j,A);
   edge(i,'r',j-1,i,'r',j,P);
   if(i+1<stages.length){
    const a2=stages[i+1].a,D=3*a2;
    edge(i+1,'a',Math.floor((j-D)/a2),i,'r',j,Z);
   }
  }
 }
 return solveOrdinalGraph(V,edges,N,J,arith,{maxNodes,maxEdges});
}
function solveOrdinalGraph(V,edges,N,J,arith,{maxNodes=600,maxEdges=120000}={}){
 const {q,cmp,add,mul,div,txt,U,Z}=arith,fail=reason=>({status:"not-proved",reason});
 const gcd=(a,b)=>b?gcd(b,a%b):a,lcm=(a,b)=>a/gcd(a,b)*b;
 // Every original vertex must lie in one strongly connected component.
 const reach=reverse=>{const seen=new Set([0]),todo=[0];for(let i=0;i<todo.length;i++)for(const e of edges)if((reverse?e.to:e.from)===todo[i]){const v=reverse?e.from:e.to;if(!seen.has(v)){seen.add(v);todo.push(v);}}return seen.size;};
 if(reach(false)!==V.length||reach(true)!==V.length)return fail('event graph not strongly connected');
 // Expand positive ordinal lag into unit-lag edges, then eliminate
 // zero-lag edges by a finite DAG longest-path closure. Lag is a count
 // of repetition blocks, not a physical time grid.
 let size=V.length;const zero=[],one=[];
 const denominator=edges.reduce((s,e)=>lcm(s,e.w.d),1n);
 for(const e of edges){
  const w=e.w.n*(denominator/e.w.d);
  if(!e.lag){zero.push({from:e.from,to:e.to,w});continue;}
  let from=e.from;
  for(let j=0;j<e.lag;j++){
   const to=j===e.lag-1?e.to:size++;
   if(size>maxNodes)return fail('expanded ordinal lag resource limit');
   one.push({from,to,w:j===0?w:0n});from=to;
  }
 }
 const adj=Array.from({length:size},()=>[]),degree=Array(size).fill(0);
 for(const e of zero){adj[e.from].push(e);degree[e.to]++;}
 const topo=degree.flatMap((v,i)=>v===0?[i]:[]);
 for(let i=0;i<topo.length;i++)for(const e of adj[topo[i]])if(--degree[e.to]===0)topo.push(e.to);
 if(topo.length!==size)return fail('zero ordinal-lag circuit');
 const cache=new Map(),unit=new Map();
 for(const e of one){
  let closure=cache.get(e.to);
  if(!closure){closure=Array(size).fill(null);closure[e.to]=0n;
   for(const v of topo)if(closure[v]!==null)for(const z of adj[v]){const x=closure[v]+z.w;if(closure[z.to]===null||x>closure[z.to])closure[z.to]=x;}
   cache.set(e.to,closure);
  }
  for(let v=0;v<size;v++)if(closure[v]!==null){
   const k=e.from*size+v,w=e.w+closure[v];if(!unit.has(k)||w>unit.get(k).w)unit.set(k,{from:e.from,to:v,w});
  }
  if(unit.size>maxEdges)return fail('unit graph edge resource limit');
 }
 // Karp maximum cycle mean on integer weighted unit-lag graph.
 // The graph can have transient vertices; a virtual source reaches all.
 const E=[...unit.values()],dp=[Array(size).fill(0n)];
 for(let i=1;i<=size;i++){
  const next=Array(size).fill(null),prev=dp[i-1];
  for(const e of E)if(prev[e.from]!==null){const w=prev[e.from]+e.w;if(next[e.to]===null||w>next[e.to])next[e.to]=w;}
  dp.push(next);
 }
 let best=null;
 for(let v=0;v<size;v++)if(dp[size][v]!==null){
  let lo=null;
  for(let k=0;k<size;k++)if(dp[k][v]!==null){
   const r={n:dp[size][v]-dp[k][v],d:BigInt(size-k)*denominator};
   if(lo===null||cmp(q(r),lo)<0)lo=q(r);
  }
  if(lo!==null&&(best===null||cmp(lo,best)>0))best=lo;
 }
 if(best===null||cmp(best,Z)<=0)return fail('no positive cycle ratio');
 // Independent upper-potential and tight-circuit certificate on ORIGINAL
 // graph, avoiding reliance on Karp implementation alone.
 const w=e=>arith.sub(e.w,mul(best,q(e.lag)));
 let h=Array(V.length).fill(Z);
 for(let i=1;i<V.length;i++){const next=h.slice();for(const e of edges){const x=add(h[e.from],w(e));if(cmp(x,next[e.to])>0)next[e.to]=x;}h=next;}
 if(edges.some(e=>cmp(add(h[e.from],w(e)),h[e.to])>0))throw Error('cycle ratio upper certificate failed');
 const tight=edges.filter(e=>cmp(add(h[e.from],w(e)),h[e.to])===0),ta=Array.from({length:V.length},()=>[]),td=Array(V.length).fill(0);
 for(const e of tight){ta[e.from].push(e.to);td[e.to]++;}
 const order=td.flatMap((x,i)=>x===0?[i]:[]);for(let i=0;i<order.length;i++)for(const v of ta[order[i]])if(--td[v]===0)order.push(v);
 if(order.length===V.length)throw Error('no tight critical circuit');
 return {status:'proved',blockTime:txt(div(best,U)),batchCounts:N,packetCounts:J,stageRates:N.map(n=>txt(div(q(n),best))),routeRates:J.map(n=>txt(div(q(n),best))),vertices:V.length,expandedVertices:size,unitEdges:E.length,criticalCircuit:true};
}
function provePhysicalTandems(g,arith,options={}){
 const result={certificates:[],chains:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 for(const root of g.nodes){
  if(!root.recipe||Object.keys(root.recipe.inputs||{}).length||I.get(root.id).length)continue;
  const stages=[],lengths=[],ids=[],seen=new Set();let m=root,previous=null,reason=null;
  while(true){
   const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),keys=Object.keys(r?.inputs||{});
   if(!r||seen.has(m.id)||ins.length!==m.physicalInCount||outs.length!==m.physicalOutCount||outs.length!==1||!valid(outs[0])||outs[0].materials[0]!==r.output||(!previous?(ins.length||keys.length):(ins.length!==1||keys.length!==1||keys[0]!==previous.materials[0]))){reason='not an isolated compatible tandem';break;}
   seen.add(m.id);ids.push(m.id);stages.push({b:r.qty,a:previous?r.inputs[keys[0]]:0,T:r.seconds});lengths.push(outs[0].length);
   previous=outs[0];m=ns.get(previous.to);
   if(m.type==='仓入')break;
  }
  if(reason){result.refused.push({machine:root.id,reason});continue;}
  const proof=proveTandem(stages,lengths,arith,options);
  if(proof.status!=='proved'){result.refused.push({machine:root.id,reason:proof.reason});continue;}
  result.chains.push({machines:ids,stages,lengths,...proof});
  ids.forEach((id,i)=>result.certificates.push({machine:id,rate:proof.stageRates[i],proven:true,method:'tandem-maximum-ordinal-circuit-ratio'}));
 }
 return result;
}
if(typeof module!=='undefined')module.exports={proveTandem,provePhysicalTandems,solveOrdinalGraph};


// --- recipe_tree_proof.js source SHA256 b81a02ec98bfecd47cfe82ec84765449a8eddde4c9b37be8b38f004788c3e930 ---
'use strict';
// A converging recipe tree, each ingredient supplied by one independent
// compatible route. Exactly one output per recipe, no warehouse withdrawals,
// splitters, mergers, or contested ingredient buffers. Empty startup.
const treeOrdinalSolver=typeof module!=='undefined'?require('./tandem_count_proof').solveOrdinalGraph:solveOrdinalGraph;
function proveRecipeTree(stages,arith,options={}){
 const {q,cmp,mul,div,U,Z}=arith,fail=reason=>({status:'not-proved',reason});
 const maxNodes=options.maxNodes??600;
 const fixed=options.clock==='fixed-tick',delta=fixed?q(options.dt??'1/20'):Z;
 if(fixed&&(cmp(delta,Z)<=0||div(U,delta).d!==1n||div(q('1/2'),delta).d!==1n))return fail('noncommensurate fixed clock');
 if(!Array.isArray(stages)||!stages.length)return fail('empty tree');
 const n=stages.length,parents=Array.from({length:n},()=>[]),sinks=[];
 for(let i=0;i<n;i++){
  const m=stages[i];
  if(!Number.isSafeInteger(m.b)||m.b<1||cmp(q(m.T),Z)<=0||!Number.isSafeInteger(m.length)||m.length<1)return fail('invalid stage');
  if(fixed&&(div(q(m.T),delta).d!==1n||m.offerGap!=null||m.rootGap!=null))return fail('fixed clock requires commensurate ordinary/ready stages');
  if(m.to===null){sinks.push(i);continue;}
  if(!Number.isInteger(m.to)||m.to<0||m.to>=n||m.to===i||!Number.isSafeInteger(m.a)||m.a<1)return fail('invalid successor');
  parents[m.to].push(i);
 }
 if(sinks.length!==1)return fail('not a single terminal tree');
 for(let i=0;i<n;i++)if(stages[i].offerGap!=null&&(parents[i].length||stages[i].b!==1||stages[i].to===null||cmp(q(stages[i].offerGap),U)<0||cmp(q(stages[i].T),q(stages[i].offerGap))!==0))return fail('invalid virtual offer root');
 for(let i=0;i<n;i++)if(stages[i].readyRoot&&(parents[i].length||stages[i].b!==1||stages[i].to===null||stages[i].offerGap!=null))return fail('invalid permanently ready root');
 for(let i=0;i<n;i++)if(stages[i].rootGap!=null&&(!stages[i].readyRoot||cmp(q(stages[i].rootGap),U)<0))return fail('invalid root gap');
 const gcd=(a,b)=>b?gcd(b,a%b):a,lcm=(a,b)=>a/gcd(a,b)*b;
 const ratios=Array(n).fill(null),root=sinks[0],todo=[root];ratios[root]=U;
 for(let t=0;t<todo.length;t++)for(const i of parents[todo[t]]){
  if(ratios[i]!==null)return fail('cycle');
  ratios[i]=div(mul(ratios[todo[t]],q(stages[i].a)),q(stages[i].b));todo.push(i);
 }
 if(todo.length!==n)return fail('disconnected or cyclic');
 const scale=ratios.reduce((s,v)=>lcm(s,v.d),1n),counts=ratios.map(v=>v.n*(scale/v.d)),packets=counts.map((v,i)=>v*BigInt(stages[i].b));
 if(counts.reduce((s,v,i)=>s+v+2n*packets[i],0n)>BigInt(maxNodes))return fail('symbolic phase limit');
 const N=counts.map(Number),J=packets.map(Number),V=[],offsets=[],edges=[],P=U,d=q('1/2');
 for(let i=0;i<n;i++){
  offsets.push({});
  for(const [kind,count] of [...(!stages[i].readyRoot?[['a',N[i]]]:[]),['s',J[i]],['r',J[i]]]){
   offsets[i][kind]=V.length;for(let k=0;k<count;k++)V.push({stage:i,kind,index:k});
  }
 }
 function edge(i,kind,j,h,to,k,w){
  const count=kind==='a'?N[i]:J[i],block=Math.floor(j/count),phase=((j%count)+count)%count;
  if(block>0)throw Error('future block dependency');
  edges.push({from:offsets[i][kind]+phase,to:offsets[h][to]+k,lag:-block,w:q(w)});
 }
 for(let i=0;i<n;i++){
  const {b,T,length:L,to,a}=stages[i],C=20*b,K=L+1,travel=q({n:BigInt(L),d:2n});
  for(let j=0;j<(stages[i].readyRoot?0:N[i]);j++){
   edge(i,'a',j-1,i,'a',j,T);edge(i,'s',(j+1)*b-C-1,i,'a',j,parents[i].length?delta:Z);
   for(const p of parents[i])edge(p,'r',(j+1)*stages[p].a-1,i,'a',j,Z);
  }
  for(let j=0;j<J[i];j++){
   const gap=stages[i].rootGap!=null?q(stages[i].rootGap):stages[i].offerGap==null?P:q(stages[i].offerGap);
   edge(i,'s',j-1,i,'s',j,gap);edge(i,'r',j-K,i,'s',j,stages[i].offerGap==null?d:arith.add(d,gap));
   if(!stages[i].readyRoot)edge(i,'a',Math.floor(j/b),i,'s',j,T);edge(i,'s',j,i,'r',j,travel);edge(i,'r',j-1,i,'r',j,P);
   if(to!==null)edge(to,'a',Math.floor((j-3*a)/a),i,'r',j,delta);
  }
 }
 const proof=treeOrdinalSolver(V,edges,N,J,arith,options);return {...proof,scope:fixed?'exact-rational-fixed-tick':'ideal-continuous-event'};
}
function provePhysicalRecipeTrees(g,arith,options={}){
 const result={certificates:[],trees:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 for(const sink of g.nodes){
  if(!sink.recipe||O.get(sink.id).length!==1||ns.get(O.get(sink.id)[0].to).type!=='仓入')continue;
  const ids=[],stages=[],seen=new Set();let reason=null;
  function visit(id,to,a){
   if(reason)return;
   const m=ns.get(id),r=m.recipe,ins=I.get(id),outs=O.get(id),keys=Object.keys(r?.inputs||{});
   if(!r||seen.has(id)||ins.length!==m.physicalInCount||outs.length!==m.physicalOutCount||outs.length!==1||!valid(outs[0])||outs[0].materials[0]!==r.output||ins.length!==keys.length||new Set(ins.map(e=>e.toPort)).size!==ins.length||keys.some(k=>ins.filter(e=>valid(e)&&e.materials[0]===k).length!==1)){reason='not an isolated one-route-per-ingredient recipe tree';return;}
   seen.add(id);const i=ids.length;ids.push(id);stages.push({b:r.qty,T:r.seconds,length:outs[0].length,to,a});
   for(const e of ins)visit(e.from,i,r.inputs[e.materials[0]]);
  }
  visit(sink.id,null,0);
  if(reason){result.refused.push({machine:sink.id,reason});continue;}
  const p=proveRecipeTree(stages,arith,options);
  if(p.status!=='proved'){result.refused.push({machine:sink.id,reason:p.reason});continue;}
  result.trees.push({machines:ids,stages,...p});ids.forEach((id,i)=>result.certificates.push({machine:id,rate:p.stageRates[i],proven:true,method:'recipe-tree-ordinal-circuit-ratio',scope:p.scope}));
 }
 return result;
}
if(typeof module!=='undefined')module.exports={proveRecipeTree,provePhysicalRecipeTrees};


// --- permanent_fifo_blockage.js source SHA256 c2474a2242a9af5ea3f93ab9db17f4037adbfebb6ec5769480ab05372b6b52f1 ---
'use strict';
// Direct finite-prefix obstruction certificate for fixed physical layouts.
// Does not enumerate states, calculate arrival times or run an orbit.
// An infinite-throughput FIFO merger cannot indefinitely starve a persistent
// eligible inlet head; its scanner is round-robin and the port cooldown is finite.
function provePermanentFifoBlockage(spec){
 const result={ruleVersion:'real-outlet-buffer-20261125',relations:[],witnesses:[],status:'unsupported'};
 if(!spec||spec.initial!=='empty'||!Array.isArray(spec.machines)||!Array.isArray(spec.routes))return result;
 const ns=new Map(spec.machines.map(m=>[m.id,m])),rs=new Map(spec.routes.map(r=>[r.id,r]));
 if(ns.size!==spec.machines.length||rs.size!==spec.routes.length)return result;
 const I=new Map(spec.machines.map(m=>[m.id,[]])),O=new Map(spec.machines.map(m=>[m.id,[]]));
 for(const r of spec.routes){
  const a=ns.get(r.from),d=ns.get(r.to);
  if(!a||!Number.isSafeInteger(r.length)||r.length<1||!Array.isArray(r.accepted)||!a.outPorts?.some(p=>p.index===r.fromPort)||O.get(a.id).some(e=>e.fromPort===r.fromPort))return result;
  if(r.to!==null&&(!d||!d.inputPriority?.includes(r.toPort)||I.get(d.id).some(e=>e.toPort===r.toPort)))return result;
  O.get(a.id).push(r);if(d)I.get(d.id).push(r);
 }
 const possibleItems=new Set(spec.machines.flatMap(m=>[m.item,m.recipe?.output].filter(Boolean)));
 const filter=r=>ns.get(r.from).outPorts.find(p=>p.index===r.fromPort)?.filter;
 const unrestricted=r=>!filter(r)||filter(r)==='任意';
 const canSend=(r,k)=>unrestricted(r)||filter(r)===k;
 // An autonomous source has an eventual first batch even if all belts are
 // blocked, because its true output buffer is initially empty.
 // Follow only exclusive output ports and FIFO mergers; never assume that
 // a splitter will select the branch carrying the incompatible item.
 const found=new Set();
 for(const m of ns.values()){
  const recipe=m.recipe;
  if(!recipe||Object.keys(recipe.inputs||{}).length||!recipe.output||!(Number(recipe.seconds)>0)||!Number.isFinite(Number(recipe.seconds))||!Number.isSafeInteger(recipe.qty)||recipe.qty<1||m.outPorts.length!==1||m.outPorts[0].index!==0)continue;
  const k=recipe.output,seen=new Set(),chain=[];
  let node=m;
  while(node&&!seen.has(node.id)){
   seen.add(node.id);
   const outs=O.get(node.id);
   if(outs.length!==1||outs[0].to===null||outs[0].fromPort!==0)break;
   const r=outs[0],target=ns.get(r.to);
   if(!canSend(r,k))break;
   chain.push(r.id);
   if(!r.accepted.includes(k)){
    if(!found.has(r.id)){
     found.add(r.id);
     result.relations.push({proven:true,ruleVersion:result.ruleVersion,method:'unavoidable-fifo-incompatible-head',sense:'eq',coefficients:{['routeTotal:'+r.id]:1},constant:'0'});
     result.witnesses.push({source:m.id,item:k,chain:[...chain],blockedRoute:r.id,receiver:r.to});
    }
    break;
   }
   if(target.type!=='汇流'||target.outPorts?.length!==1||target.outPorts[0].index!==0)break;
   // An outlet filter on a merger could stop a DIFFERENT earlier item.
   // Such a stop can only decrease output, but we avoid claiming upstream
   // liveness across nonstandard filter semantics.
   if(O.get(target.id).some(e=>!unrestricted(e)))break;
   // Ordinary mergers accept every material. Require this contract also
   // on externally constructed specs, to exclude an earlier rejected head.
   if(I.get(target.id).some(e=>[...possibleItems].some(k=>!e.accepted.includes(k))))break;
   const ports=target.mergerPriority;
   if(!Array.isArray(ports)||!ports.includes(r.toPort)||new Set(ports).size!==ports.length||I.get(target.id).some(e=>!ports.includes(e.toPort)))break;
   node=target;
  }
 }
 result.status='proved';return result;
}
if(typeof module!=='undefined')module.exports={provePermanentFifoBlockage};


// --- real_refill_priority_proof.js source SHA256 9f497db408726c9b8607f5ef46ae627d0231e430fed0ada32d874651ed80f83a ---
'use strict';
// Certified rate inequalities for the REAL outlet-buffer rule.
// Derived from equal cooldown windows and fixed within-frame priority.
// This never computes the actual sequence of dispatches.
function compareId(a,b){
 const x=String(a),y=String(b),p=x.match(/^(.*?)(\d+)$/),q=y.match(/^(.*?)(\d+)$/);
 if(p&&q&&p[1]===q[1]){const u=BigInt(p[2]),v=BigInt(q[2]);if(u!==v)return u<v?-1:1;}
 return x<y?-1:x>y?1:0;
}
function proveRealRefillPriority(g,{maxRelations=3000,freeCertificates=[]}={}){
 const result={ruleVersion:'real-outlet-buffer-20261125',relations:[],items:[],skipped:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const compatible=(e,k)=>e.active!==false&&e.compatible===true&&Number.isSafeInteger(e.length)&&e.length>=1&&e.materials.includes(k)&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===k)&&(!Array.isArray(e.acceptedMaterials)||e.acceptedMaterials.includes(k));
 const key=(e,k)=>'flow:'+e.id+'|'+k;
 const supplied=new Set(freeCertificates.filter(x=>x.proven===true&&x.ruleVersion===result.ruleVersion&&x.method==='refill-buffer-always-has-space-eventually').map(x=>x.machine));
 // A compatible line to unrestricted warehouse inlet has no downstream
 // backpressure. A line into an exclusive computer has arrival gaps >=1s,
 // service period 1s, capacity 10. Both guarantee immediate outlet send
 // after each refill from an empty initial state. Other graphs require a
 // separate clearance proof; a mean capacity alone is insufficient.
 function free(m,e){
  if(!compatible(e,m.item))return false;
  const d=ns.get(e.to);
  return supplied.has(m.id)||d.type==='仓入'||d.type==='电脑'&&I.get(d.id).length===1&&d.physicalInCount===1;
 }
 function add(lhs,rhs,method,detail){
  if(result.relations.length>=maxRelations)return false;
  const coefficients={};
  for(const k of lhs)coefficients[k]=(coefficients[k]||0)-1;
  for(const k of rhs)coefficients[k]=(coefficients[k]||0)+1;
  for(const k of Object.keys(coefficients))if(!coefficients[k])delete coefficients[k];
  if(!Object.keys(coefficients).length)return true;
  result.relations.push({proven:true,ruleVersion:result.ruleVersion,method,sense:'le',coefficients,constant:'0',...detail});return true;
 }
 const items=new Set(g.nodes.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item));
 for(const item of items){
  const all=g.nodes.filter(m=>m.type==='仓出'&&m.item===item).sort((a,b)=>compareId(a.id,b.id));
  // An unwired outlet can refill only finitely many times. It can alter
  // startup but has no density-one actions; ignore only those known to
  // have no actual outgoing line, never an unknown or invalid connection.
  if(all.some(m=>O.get(m.id).length>1||m.physicalOutCount!==undefined&&m.physicalOutCount!==O.get(m.id).length)){result.skipped.push({item,reason:'incomplete outlet topology'});continue;}
  const linked=all.filter(m=>O.get(m.id).length).map(m=>({m,e:O.get(m.id)[0]}));
  const expected=(g.pools||[]).find(p=>p.item===item)?.order;
  if(expected&&JSON.stringify(expected.filter(id=>linked.some(x=>x.m.id===id)))!==JSON.stringify(linked.map(x=>x.m.id))){result.skipped.push({item,reason:'priority mismatch'});continue;}
  if(linked.some(x=>!x.e.materials.includes(item))){result.skipped.push({item,reason:'unrepresented outlet material'});continue;}
  const arrivals=g.lines.filter(e=>ns.get(e.to).type==='仓入'&&compatible(e,item));
  const certified=linked.map(({m,e})=>free(m,e)),prefix=certified.findIndex(x=>!x),n=prefix<0?linked.length:prefix;
  result.items.push({item,freePrefix:n,arrivals:arrivals.map(e=>e.id),outlets:linked.map((x,i)=>({id:x.m.id,free:certified[i]}))});
  // Pairwise dominance: each lower refill charges a distinct higher
  // refill in the preceding P-frame window, unless higher buffer full.
  for(let i=0;i<linked.length;i++)if(certified[i])for(let j=i+1;j<linked.length;j++)
   if(!add([key(linked[i].e,item)],[key(linked[j].e,item)],'priority-cooldown-injection',{item,higher:linked[i].m.id,lower:linked[j].m.id}))return result;
  // Any k physical receipt routes have <=k arrivals in each P-frame
  // window. A free highest-priority k-prefix cumulatively dominates
  // their aggregate, even with arbitrary other stock inflows/outflows.
  for(let k=1;k<=n&&arrivals.length;k++){
   const take=Math.min(k,arrivals.length),lhs=linked.slice(0,k).map(x=>key(x.e,item));
   let exhausted=false;
   function choose(start,chosen){
    if(exhausted)return;
    if(chosen.length===take){if(!add(lhs,chosen.map(e=>key(e,item)),'physical-arrival-window-prefix',{item,prefix:linked.slice(0,k).map(x=>x.m.id),arrivals:chosen.map(e=>e.id)}))exhausted=true;return;}
    for(let i=start;i<=arrivals.length-(take-chosen.length)&&!exhausted;i++)choose(i+1,[...chosen,arrivals[i]]);
   }
   choose(0,[]);if(exhausted)return result;
  }
 }
 return result;
}
if(typeof module!=='undefined')module.exports={proveRealRefillPriority};


// --- counterfactual_metrics.js source SHA256 edc520291c4b5d0c3d5ad8f091b7ec8de18371a044657c2bb34d68decf1ea738 ---
'use strict';
// Reuse the independent service theorems in the separately compiled
// unlimited-stock graph. Potential demand remains the HTML's own
// conditional D semantics, not a substitution of actual rates.
function proveUnlimitedFreeExits(g,arith){
 if(g.status!=='compiled'||!g.completePhysicalRoutes||!g.unlimited)return [];
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return [];I.get(e.to).push(e);O.get(e.from).push(e);}
 const out=[];
 for(const e of g.lines){
  const m=ns.get(e.from),d=ns.get(e.to);
  if(m.type!=='仓出'||m.physicalOutCount!==1||O.get(m.id).length!==1||I.get(m.id).length||e.active===false||e.compatible!==true||e.materials.length!==1||e.materials[0]!==m.item||!Number.isSafeInteger(e.length)||e.length<1)continue;
  if(d.type==='仓入'||d.type==='电脑'&&d.physicalInCount===1&&I.get(d.id).length===1&&!O.get(d.id).length)out.push({proven:true,item:m.item,method:'unlimited-independent-free-terminal',outlets:[{machine:m.id,route:e.id,rate:'1'}]});
 }
 return out;
}
// Only structural cases where current HTML conditional D is independent
// of every unknown competing offer. The income must be an exact actual
// proof. These are deliberately not assertions about general latent D.
function projectTrivialPotential(g,arith,actual){
 const {q,add,sub,div,cmp,mul,txt,Z,U}=arith,ns=new Map(g.nodes.map(m=>[m.id,m])),out={};
 const I=id=>g.lines.filter(e=>e.to===id),O=id=>g.lines.filter(e=>e.from===id);
 for(const [key,income] of Object.entries(actual||{})){
  if(!key.startsWith('inflow:')||income==null)continue;
  const k=key.slice(7),withdrawals=g.lines.filter(e=>ns.get(e.from)?.type==='仓出'&&ns.get(e.from).item===k),consumers=(g.frozen||[]).filter(f=>Object.hasOwn(f.rates,k)&&cmp(q(f.rates[k]),Z)<0);
  let demand=Z,ok=true;
  for(const e of withdrawals){
   const m=ns.get(e.to);
   if(e.compatible!==true||e.materials.length!==1){ok=false;break;}
   if(m.type==='仓入'||m.type==='电脑'&&I(m.id).length===1){demand=add(demand,U);continue;}
   const r=m.recipe,keys=Object.keys(r?.inputs||{}),os=O(m.id);
   if(!r||keys.length!==1||keys[0]!==k||I(m.id).length!==1||os.length!==1||os[0].compatible!==true||ns.get(os[0].to)?.type!=='仓入'){ok=false;break;}
   const a=q(r.inputs[k]),b=q(r.qty),T=q(r.seconds);
   const options=[U,div(a,T),div(a,b)],v=options.reduce((x,y)=>cmp(x,y)<=0?x:y);
   demand=add(demand,v);
  }
  if(!ok)continue;
  for(const f of consumers){
   if(Object.values(f.rates).filter(v=>cmp(q(v),Z)<0).length!==1){ok=false;break;}
   demand=add(demand,sub(Z,q(f.rates[k])));
  }
  if(ok)out[k]={potential:txt(sub(q(income),demand)),withdrawalDemand:txt(demand),method:'structurally-independent-demand'};
 }
 return out;
}
if(typeof module!=='undefined')module.exports={proveUnlimitedFreeExits,projectTrivialPotential};


// --- count_proof_compile.js source SHA256 cf77677303fa9fc720dc532c9dec450d24309bc7b24bb14b5410a90bf38c3fd1 ---
'use strict';
// Necessary relations for accumulation points of actual cumulative counts.
// Deliberately no S/D offer-demand equations, min-flow assumption, RR
// water-filling, optimization objective, or invented potential rate.
// Only finite resource balances, physical caps, and proven certificates.
function compileCountProofProblem(g,arith,{machineRates=[],routeRates=[],routeRateBounds=[],refills=[],roundRobin=[],warehouseBursts=[],frozenDuties=[],frozenBounds=[],stockPools=[],materialRatios=[],machineBounds=[],returnPools=[],materialRatioBounds=[],rateRelations=[],htmlQueries=false,structuralZeros=null}={}){
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return {status:'unsupported',reason:'incomplete physical graph'};
 const {q,txt,cmp,div,U,Z}=arith;
 const nodes=new Map(g.nodes.map(m=>[m.id,m])),routes=new Map(g.lines.map(e=>[e.id,e]));
 if(nodes.size!==g.nodes.length||routes.size!==g.lines.length||g.lines.some(e=>!nodes.has(e.from)||!nodes.has(e.to)))return {status:'unsupported',reason:'invalid physical graph'};
 const lines=['(set-logic QF_LRA)'];let n=0;
 const sym=()=>{const v='v_'+(++n);lines.push('(declare-const '+v+' Real)');return v;};
 const op=(o,...xs)=>{
  if(structuralZeros&&(o==='*'&&xs.includes('0')||o==='-'&&xs.length===2&&xs[0]===xs[1]))return '0';
  return '('+o+' '+xs.join(' ')+')';
 };
 const rat=x=>{const v=q(x),a=v.n<0n?-v.n:v.n,b=v.d,s=b===1n?String(a):op('/',String(a),String(b));return v.n<0n?op('-',s):s;};
 const sum=xs=>{if(structuralZeros)xs=xs.filter(x=>x!=='0');return xs.length===0?'0':xs.length===1?xs[0]:op('+',...xs);};
 const eq=(a,b)=>{if(!structuralZeros||a!==b)lines.push(op('assert',op('=',a,b)));};
 const le=(a,b)=>{if(!structuralZeros||a!==b)lines.push(op('assert',op('<=',a,b)));};
 const bounded=(v,hi)=>{le('0',v);le(v,hi);};
 const obs=Object.create(null),structuralConstants=Object.create(null),groups={actual:[]};
 function query(k,x){
  // These are already fixed by topology/finite storage, not unknowns.
  // Keep output keys for the UI, but declare no algebraic column.
  if(structuralZeros&&x==='0'){structuralConstants[k]='0';return;}
  const v=sym();eq(v,x);obs[k]=v;groups.actual.push(k);
 }
 const F=new Map(),X=new Map(),N=new Map(),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){
  const f=new Map([...new Set(e.materials)].map(k=>[k,structuralZeros?.zero.get(e.id)?.has(k)?'0':sym()]));F.set(e.id,f);
  const x=structuralZeros&&e.materials.every(k=>structuralZeros.zero.get(e.id)?.has(k))?'0':sym();X.set(e.id,x);bounded(x,'1');eq(x,sum([...f.values()]));for(const v of f.values())le('0',v);
  for(const [k,v] of f){if(e.outFilter&&e.outFilter!=='任意'&&e.outFilter!==k||Array.isArray(e.acceptedMaterials)&&!e.acceptedMaterials.includes(k))eq(v,'0');query('flow:'+e.id+'|'+k,v);}
  query('routeTotal:'+e.id,x);
  I.get(e.to).push(e);O.get(e.from).push(e);
 }
 const material=(es,k)=>sum(es.map(e=>F.get(e.id).get(k)||'0'));
 for(const m of g.nodes){
  const r=m.recipe,ins=I.get(m.id),outs=O.get(m.id),kin=new Set(ins.flatMap(e=>e.materials)),kout=new Set(outs.flatMap(e=>e.materials));
  if(r){for(const k of Object.keys(r.inputs||{}))kin.add(k);kout.add(r.output);}
  else if(m.type==='仓出'&&m.item)kout.add(m.item);
  else if(m.type==='仓入'&&m.inletItem)kin.add(m.inletItem);
  if(r){
   const nu=structuralZeros?.cycles.has(m.id)?'0':sym();N.set(m.id,nu);bounded(nu,rat(div(U,q(r.seconds))));
   for(const k of new Set([...kin,...Object.keys(r.inputs||{})]))eq(material(ins,k),op('*',rat(r.inputs?.[k]||0),nu));
   for(const k of new Set([...kout,r.output]))eq(material(outs,k),op('*',rat(k===r.output?r.qty:0),nu));
   query('cycle:'+m.id,nu);query((htmlQueries?'machineDuty:':'duty:')+m.id,op('*',rat(r.seconds),nu));
  }else if(m.type==='分流'||m.type==='汇流'){
   for(const k of new Set([...kin,...kout]))eq(material(ins,k),material(outs,k));
  }else if(m.type==='电脑')le(sum(ins.map(e=>X.get(e.id))),'1');
  else if(!['仓出','仓入'].includes(m.type)&&ins.length+outs.length)return {status:'unsupported',reason:'unknown connected device'};
  for(const [kind,es,ks] of [['in',ins,kin],['out',outs,kout]]){
   query('machineTotal:'+m.id+'|'+kind,sum(es.map(e=>X.get(e.id))));
   for(const k of ks)query('machineMaterial:'+m.id+'|'+kind+'|'+k,material(es,k));
  }
 }
 for(const p of routeRateBounds){
  if(p.proven!==true||!F.get(p.route)?.has(p.item))throw Error('Unproved route rate bound');
  const v=F.get(p.route).get(p.item);
  if(p.lower!=null)le(rat(p.lower),v);
  if(p.upper!=null)le(v,rat(p.upper));
 }
 for(const p of routeRates){
  if(p.proven!==true||!F.get(p.route)?.has(p.item)||cmp(q(p.rate),Z)<0||cmp(q(p.rate),U)>0)throw Error('Unproved route rate');
  eq(F.get(p.route).get(p.item),rat(p.rate));
 }
 for(const p of machineRates){
  if(p.proven!==true||!N.has(p.machine))throw Error('Unproved machine rate');
  eq(N.get(p.machine),rat(p.rate));
 }
 for(const p of machineBounds){
  if(p.proven!==true||!N.has(p.machine))throw Error('Unproved machine bound');
  if(p.lower!=null)le(rat(p.lower),N.get(p.machine));
  if(p.upper!=null)le(N.get(p.machine),rat(p.upper));
 }
 for(const p of refills){
  const m=nodes.get(p.machine);
  if(p.provenReady!==true||!m?.recipe||!N.has(m.id)||!p.ports?.length||p.ports.reduce((s,x)=>s+x.perBatch,0)!==m.recipe.inputs[p.item])throw Error('Invalid refill proof');
  const candidates=I.get(m.id).filter(e=>e.materials.includes(p.item));
  if(candidates.length!==p.ports.length||new Set(p.ports.map(x=>x.route)).size!==p.ports.length||p.ports.some(x=>!Number.isSafeInteger(x.perBatch)||x.perBatch<0||!candidates.some(e=>e.id===x.route&&e.materials.length===1)))throw Error('Invalid refill routes');
  for(const x of p.ports)eq(F.get(x.route).get(p.item),op('*',rat(x.perBatch),N.get(m.id)));
 }
 for(const p of roundRobin){
  const m=nodes.get(p.machine),parts=m?.type==='分流'?O.get(m.id):m?.type==='汇流'?I.get(m.id):null,common=m?.type==='分流'?I.get(m.id):O.get(m.id);
  if(!parts||common.length!==1||common[0].id!==p.commonRoute||parts.length!==p.ports.length||new Set(p.ports).size!==parts.length||p.ports.some(id=>!parts.some(e=>e.id===id))||p.unskipped.some(id=>!p.ports.includes(id)))throw Error('Invalid RR proof');
  if(p.totalRate!=null)eq(X.get(p.commonRoute),rat(p.totalRate));
  if(p.unskipped.length){
   const ref=X.get(p.unskipped[0]);
   for(const id of p.unskipped.slice(1))eq(X.get(id),ref);
   for(const id of p.ports)if(!p.unskipped.includes(id))le(X.get(id),ref);
  }
 }
 for(const p of materialRatios){
  if(p.proven!==true||!F.get(p.route)?.has(p.item)||!Number.isSafeInteger(p.numerator)||!Number.isSafeInteger(p.denominator)||p.numerator<0||p.denominator<=0||p.numerator>p.denominator)throw Error('Invalid material ratio proof');
  eq(op('*',rat(p.denominator),F.get(p.route).get(p.item)),op('*',rat(p.numerator),X.get(p.route)));
 }
 for(const p of materialRatioBounds){
  const {lowerNumerator:l,upperNumerator:u,denominator:d}=p;
  if(p.proven!==true||!F.get(p.route)?.has(p.item)||![l,u,d].every(Number.isSafeInteger)||d<1||l<0||u<l||u>d)throw Error('Invalid material ratio bounds');
  const f=op('*',rat(d),F.get(p.route).get(p.item));
  le(op('*',rat(l),X.get(p.route)),f);le(f,op('*',rat(u),X.get(p.route)));
 }
 for(const p of warehouseBursts){
  if(p.proven!==true||!Array.isArray(p.outlets)||p.outlets.some(a=>!routes.has(a.route)||nodes.get(routes.get(a.route).from)?.type!=='仓出'||nodes.get(routes.get(a.route).from)?.item!==p.item))throw Error('Invalid warehouse burst proof');
  for(const a of p.outlets)eq(X.get(a.route),rat(a.rate));
 }
 // Empty-start structural reachability is an overapproximation, so
 // absent reachable actions never happen. A reachable action is NOT
 // certified positive. Only use the fresh physical compiler's proof.
 const startup=g.emptyStartProof;
 if(startup){
  if(!startup.routeItems||g.lines.some(e=>!Object.hasOwn(startup.routeItems,e.id))||!Array.isArray(startup.cannotProduce)||!Array.isArray(startup.stocked))throw Error('Incomplete startup proof');
  for(const e of g.lines)for(const [k,v] of F.get(e.id))if(!startup.routeItems[e.id].includes(k))eq(v,'0');
  for(const id of startup.cannotProduce)if(N.has(id))eq(N.get(id),'0');
 }
 const frozen=g.frozen||[],duty=frozen.map(f=>{
  const a=sym();bounded(a,'1');
  if(g.unlimited||Object.values(f.rates).every(v=>cmp(q(v),Z)>=0))eq(a,'1');
  if(startup&&!g.unlimited&&Object.entries(f.rates).some(([k,v])=>cmp(q(v),Z)<0&&!startup.stocked.includes(k)))eq(a,'0');
  for(const p of frozenDuties.filter(x=>x.factory===f.id)){if(p.proven!==true)throw Error('Unproved frozen duty');eq(a,rat(p.duty));}
 for(const bound of frozenBounds.filter(x=>x.factory===f.id)){if(bound.proven!==true)throw Error('Unproved frozen bound');le(rat(bound.lower),a);le(a,rat(bound.upper));}
 query('duty:'+f.id,a);return a;
 });
 const items=new Set([...g.lines.filter(e=>nodes.get(e.to).type==='仓入'||nodes.get(e.from).type==='仓出').flatMap(e=>e.materials),...(g.pools||[]).map(p=>p.item),...g.nodes.filter(m=>m.type==='仓出'&&m.item||m.type==='仓入'&&m.inletItem).map(m=>m.type==='仓出'?m.item:m.inletItem),...frozen.flatMap(f=>Object.keys(f.rates))]);
 const totals={inflow:[],outflow:[],net:[],localIn:[],localOut:[],localNet:[],...(htmlQueries?{frozenIn:[],frozenOut:[]}: {})};
 for(const k of items){
  const a=material(g.lines.filter(e=>nodes.get(e.to).type==='仓入'),k),b=material(g.lines.filter(e=>nodes.get(e.from).type==='仓出'),k);
  const pos=[],neg=[];
  frozen.forEach((f,j)=>{if(!Object.hasOwn(f.rates,k))return;const v=q(f.rates[k]);if(cmp(v,Z)>0)pos.push(op('*',rat(v),duty[j]));if(cmp(v,Z)<0)neg.push(op('*',rat({n:-v.n,d:v.d}),duty[j]));});
  const incoming=sum([a,...pos]),outgoing=sum([b,...neg]),net=op('-',incoming,outgoing);
  if(!g.unlimited)le('0',net);
  const returnPool=returnPools.find(x=>x.item===k);
  if(returnPool){
   const withdrawals=g.lines.filter(e=>nodes.get(e.from).type==='仓出'&&nodes.get(e.from).item===k);
   const ids=[...returnPool.returns,...returnPool.sinks];
   if(returnPool.proven!==true||new Set(ids).size!==ids.length||ids.length!==withdrawals.length||withdrawals.some(e=>!ids.includes(e.id))||returnPool.returns.some(id=>nodes.get(routes.get(id)?.to)?.type!=='仓入')||returnPool.sinks.some(id=>nodes.get(routes.get(id)?.to)?.type!=='电脑'))throw Error('Invalid return pool proof');
   eq(sum(returnPool.sinks.map(id=>F.get(id).get(k)||'0')),rat(returnPool.nonreturnOutflow));eq(net,rat(returnPool.net));
  }
  for(const stock of stockPools.filter(x=>x.item===k)){if(stock.proven!==true)throw Error('Unproved stock pool');eq(incoming,rat(stock.income));eq(outgoing,rat(stock.outflow));}
  for(const [name,v] of Object.entries({inflow:incoming,outflow:outgoing,net,localIn:a,localOut:b,localNet:op('-',a,b),...(htmlQueries?{frozenIn:sum(pos),frozenOut:sum(neg)}:{})})){
   query(name+':'+k,v);totals[name].push(v);
  }
 }
 for(const [name,vs] of Object.entries(totals))query('total:'+name,sum(vs));
 // A permanently rejected FIFO head can kill the entire mixed route.
 // Only use a physical spec matching this complete count graph.
 if(g.physicalSpec&&typeof module!=='undefined'&&typeof require==='function'){
  const sp=g.physicalSpec,connected=sp.routes?.filter(r=>r.to!==null)||[];
  if(sp.initial==='empty'&&sp.machines?.length===g.nodes.length&&sp.machines.every(m=>nodes.has(m.id)&&nodes.get(m.id).type===m.type)&&connected.length===g.lines.length&&connected.every(r=>{
   const e=routes.get(r.id);return e&&e.from===r.from&&e.to===r.to&&e.fromPort===r.fromPort&&e.toPort===r.toPort;
  })){
   const p=require('./permanent_fifo_blockage').provePermanentFifoBlockage(sp);
   rateRelations=[...rateRelations,...p.relations];
  }
 }
 // Additional independently proved affine count relations; the same
 // exact elimination can consume inequalities and equalities.
 for(const r of rateRelations){
  if(r.proven!==true||r.ruleVersion!=='real-outlet-buffer-20261125'||!['le','eq'].includes(r.sense)||Object.keys(r.coefficients).some(k=>!Object.hasOwn(obs,k)&&!Object.hasOwn(structuralConstants,k)))throw Error('Invalid real-refill count certificate');
  const x=sum(Object.entries(r.coefficients).map(([k,v])=>op('*',rat(v),obs[k]??structuralConstants[k])));
  (r.sense==='eq'?eq:le)(x,rat(r.constant));
 }
 return {status:'compiled',smt:lines.join('\n'),observables:obs,structuralConstants,groups,variables:n,scope:'count-limit-necessary-relations-only'};
}
if(typeof module!=='undefined')module.exports={compileCountProofProblem};


// --- count_factored_projection.js source SHA256 7b0a6d4165e96ac9010f14653611d58ea32a82e69d020e79851cbd80a8e886bf ---
'use strict';
// Exact affine factorization after equality elimination. The residual
// inequality hypergraph defines independent Cartesian factors; a query
// can be constant across all factors even when individual flows vary.
const countRateAlgebra=typeof module!=='undefined'?require('./direct_algebra').makeRateAlgebra:makeRateAlgebra;
function solveFactoredCounts(problem,arith,{ms=10000,maxRows=12000,partialFactors=false}={}){
 if(problem.status!=='compiled')return {status:'unsupported',unique:{},multiple:[]};
 const A=countRateAlgebra(arith),{vars,val,variable,constant,plus,scale,neg,normal,key,txt,cmp,add,mul,Z,U,C}=A,m=A.parse(problem),solved=new Map(),deadline=performance.now()+ms;
 const result={status:'unknown',unique:{},multiple:[],unresolved:[],stats:{factors:[],directions:0}};
 if(m.choices.length)return {...result,reason:'non-affine branch structure'};
 for(const row of m.eqs.slice().sort((a,b)=>vars(a).length-vars(b).length))if(!A.pivot(row,solved))return {...result,status:'unsat'};
 const parent=new Map();
 function find(i){if(!parent.has(i))parent.set(i,i);const j=parent.get(i);if(j!==i)parent.set(i,find(j));return parent.get(i);}
 function union(xs){if(!xs.length)return;let p=find(xs[0]);for(const i of xs.slice(1)){const v=find(i);if(v!==p)parent.set(v,p);}}
 const rows=m.les.map(r=>A.substitute(r,solved));
 for(const r of rows){if(!vars(r).length){if(cmp(val(r),Z)>0)return {...result,status:'unsat'};}else union(vars(r));}
 const exprs=Object.fromEntries(Object.entries(m.observables).map(([k,i])=>[k,A.substitute(variable(i),solved)]));
 // Free columns which have no inequalities are independent unbounded factors.
 for(const i of m.names.values())if(!solved.has(i))find(i);
 const groups=new Map();
 for(const i of parent.keys()){const p=find(i);if(!groups.has(p))groups.set(p,{columns:[],rows:[],cache:new Map()});groups.get(p).columns.push(i);}
 for(const r of rows)if(vars(r).length)groups.get(find(vars(r)[0])).rows.push(r);
 const witness=new Map();let incomplete=false;
 for(const g of [...groups.values()].sort((a,b)=>a.rows.length-b.rows.length||a.columns.length-b.columns.length)){
  const f=A.feasible(g.rows,{deadline,maxRows});g.status=f.status;result.stats.factors.push({columns:g.columns.length,rows:g.rows.length,status:f.status});
  if(f.status==='infeasible')return {...result,status:'unsat',unique:{},multiple:[]};
  if(f.status!=='feasible'){incomplete=true;continue;}
  for(const i of g.columns)witness.set(i,f.values.get(i)||Z);
  // Independent exact check of the factor witness.
  const evalRow=r=>vars(r).reduce((v,i)=>add(v,mul(r.get(i),witness.get(i))),val(r));
  if(g.rows.some(r=>cmp(evalRow(r),Z)>0))throw Error('factored witness violates row');
 }
 result.stats.initialFree=m.names.size-solved.size;
 if(incomplete&&!partialFactors)return {...result,reason:'at least one factor feasibility unresolved'};
 result.globallyFeasible=!incomplete;
 const evalExpr=r=>vars(r).reduce((v,i)=>add(v,mul(r.get(i),witness.get(i))),val(r));
 if(!incomplete){
  const full=new Map([...m.names.values()].map(i=>[i,evalExpr(A.substitute(variable(i),solved))]));
  const original=r=>vars(r).reduce((v,i)=>add(v,mul(r.get(i),full.get(i))),val(r));
  if(m.eqs.some(r=>cmp(original(r),Z)!==0)||m.les.some(r=>cmp(original(r),Z)>0))throw Error('factored witness violates original system');
 }
 for(const [k,r] of Object.entries(exprs)){
  // Exact constants from elimination and independent feasible factors
  // do not require a witness from an unrelated over-budget factor.
  // These are necessary-constraint invariants, not a global witness.
  if(vars(r).some(i=>groups.get(find(i)).status!=='feasible')){result.unresolved.push(k);continue;}
  let value=val(r),status='unique';
  const parts=new Map();
  for(const i of vars(r)){const p=find(i);if(!parts.has(p))parts.set(p,new Map());parts.get(p).set(i,r.get(i));value=add(value,mul(r.get(i),witness.get(i)));}
  for(const [p,d] of parts){
   const g=groups.get(p),n=normal(d),opp=normal(scale(n,neg(U))),cacheKey=[key(n),key(opp)].sort().join(';');
   let s=g.cache.get(cacheKey);
   if(!s){
    // Only constraints active at the verified point restrict infinitesimal
    // displacement. Reuse the tangent-cone theorem, not global full rows.
    if(!g.active)g.active=g.rows.filter(row=>cmp(vars(row).reduce((v,i)=>add(v,mul(row.get(i),witness.get(i))),val(row)),Z)===0).map(row=>{const a=new Map(row);a.delete(C);return a;});
    const lo=A.feasible(g.active,{strict:n,deadline,maxRows});
    const hi=lo.status==='feasible'?lo:A.feasible(g.active,{strict:opp,deadline,maxRows});
    s=lo.status==='feasible'||hi.status==='feasible'?'multiple':lo.status==='infeasible'&&hi.status==='infeasible'?'unique':'unknown';
    g.cache.set(cacheKey,s);result.stats.directions++;
   }
   if(s==='multiple'){status=s;break;}if(s==='unknown')status='unknown';
  }
  if(status==='unique')result.unique[k]=txt(value);else if(status==='multiple')result.multiple.push(k);else result.unresolved.push(k);
 }
 result.status=incomplete||result.unresolved.length?'partial':'sat';
 result.witness=incomplete?null:Object.fromEntries(Object.entries(exprs).map(([k,r])=>[k,txt(evalExpr(r))]));
 return result;
}
if(typeof module!=='undefined')module.exports={solveFactoredCounts};


// --- count_interval_projection.js source SHA256 3ec989b20f44ba6938b8bda739573ecbeaca6f1f74e9cce885f7e8386544f6d2 ---
'use strict';
// Exact affine interval projection of ONE query, with a strict resource cap.
// No objectives or numerical iteration; eliminate every other column.
const intervalRateAlgebra=typeof module!=='undefined'?require('./direct_algebra').makeRateAlgebra:makeRateAlgebra;
function projectCountInterval(problem,arith,query,{ms=3000,maxRows=12000}={}){
 if(problem.status!=='compiled')return {status:'unsupported'};
 const A=intervalRateAlgebra(arith),{vars,val,variable,plus,neg,scale,normal,key,txt,q,Z,U,C,cmp,div,add}=A,m=A.parse(problem),basis=new Map();
 if(m.choices.length||!Object.hasOwn(m.observables,query))return {status:'unsupported'};
 const deadline=performance.now()+ms;
 for(const r of m.eqs.slice().sort((a,b)=>vars(a).length-vars(b).length))if(!A.pivot(r,basis))return {status:'contradiction'};
 const expr=A.substitute(variable(m.observables[query]),basis),z=m.names.size;
 // Preserve the query z during projection even when it is a constant.
 const eq=plus(variable(z),expr,neg(U)),solved=new Map();
 if(vars(expr).length)A.pivot(eq,solved,vars(expr)[0]);
 let rows=m.les.map(r=>A.substitute(A.substitute(r,basis),solved));
 if(!vars(expr).length){rows.push(eq,scale(eq,neg(U)));}
 function simplify(rs){
  const dirs=new Map();
  for(const rr of rs){
   const r=normal(rr);
   if(!vars(r).length){if(val(r).n>0n)return null;continue;}
   const d=new Map(r);d.delete(C);const k=key(d),old=dirs.get(k);
   if(!old||cmp(val(r),val(old))>0)dirs.set(k,r);
  }
  return [...dirs.values()];
 }
 let maxSeen=0,steps=0;
 for(;;){
  if(performance.now()>deadline||rows.length>maxRows)return {status:'unknown',steps,maxSeen};
  rows=simplify(rows);if(!rows)return {status:'contradiction'};maxSeen=Math.max(maxSeen,rows.length);
  const counts=new Map();
  for(const r of rows)for(const k of vars(r))if(k!==z){const c=counts.get(k)||[0,0];c[r.get(k).n>0n?0:1]++;counts.set(k,c);}
  if(!counts.size)break;
  let p,best=Infinity;for(const [k,[a,b]] of counts){const cost=a*b-a-b;if(cost<best){best=cost;p=k;}}
  const pos=[],negative=[],rest=[];
  for(const r of rows){const c=r.get(p);if(!c)rest.push(r);else(c.n>0n?pos:negative).push(r);}
  if(pos.length*negative.length+rest.length>maxRows)return {status:'unknown',steps,maxSeen};
  for(const a of pos)for(const b of negative){const r=plus(scale(a,neg(b.get(p))),b,a.get(p));r.delete(p);rest.push(r);}
  rows=rest;steps++;
 }
 let lower=null,upper=null;
 for(const r of rows){
  const c=r.get(z);if(!c)continue;
  const b=div(neg(val(r)),c);
  if(c.n<0n){if(lower===null||cmp(b,lower)>0)lower=b;}
  else if(upper===null||cmp(b,upper)<0)upper=b;
 }
 if(lower!==null&&upper!==null&&cmp(lower,upper)>0)return {status:'contradiction'};
 return {status:'interval',lower:lower===null?null:txt(lower),upper:upper===null?null:txt(upper),unique:lower!==null&&upper!==null&&cmp(lower,upper)===0,steps,maxSeen,free:m.names.size-basis.size};
}
if(typeof module!=='undefined')module.exports={projectCountInterval};


// --- stock_work_conservation.js source SHA256 0f9d20d2b47b50c421bd2f4c397a446f0a471c6be318a27940b6177efee5432e ---
'use strict';
// High-stock interval theorem: aggregate demand is work-conserving even
// with arbitrary correlated arrivals and multiple partially served actors.
// Only independent exact facts and strict positive net lower bounds enter.
function proveStockWorkConservation(g,arith,values={},netLower={},readyCaps=[]){
 const {q,add,sub,mul,cmp,txt,Z,U}=arith;
 const out={relations:[],witnesses:[],abundant:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const fs=g.frozen||[],outlets=g.nodes.filter(m=>m.type==='仓出'&&m.item),items=new Set([...outlets.map(m=>m.item),...fs.flatMap(f=>Object.keys(f.rates))]);
 const read=k=>values[k]==null?null:q(values[k]);
 const positive=k=>[values['net:'+k],netLower[k]].some(v=>v!=null&&cmp(q(v),Z)>0);
 const abundant=new Set([...items].filter(positive));out.abundant=[...abundant];
 const negs=f=>Object.entries(f.rates).filter(([,v])=>cmp(q(v),Z)<0);
 function free(m){
  const a=O.get(m.id);
  if(I.get(m.id).length||a.length!==1||m.physicalOutCount!==1)return false;
  const e=a[0],d=ns.get(e.to);
  return e.compatible===true&&e.materials.length===1&&e.materials[0]===m.item&&Number.isSafeInteger(e.length)&&e.length>=1&&
   (d.type==='仓入'||d.type==='电脑'&&I.get(d.id).length===1&&d.physicalInCount===1&&O.get(d.id).length===0);
 }
 function emit(query,v,method,detail){
  if(values[query]!=null&&cmp(q(values[query]),v)===0)return;
  out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method,sense:'eq',coefficients:{[query]:1},constant:txt(v)});
  out.witnesses.push({query,value:txt(v),method,...detail});
 }
 const capOf=m=>{const c=readyCaps.find(x=>x.proven===true&&x.machine===m.id&&x.item===m.item&&(x.requiredItems||[m.item]).every(k=>k===m.item||abundant.has(k)));return c?q(c.rate):free(m)?U:null;};
 for(const m of outlets)if(abundant.has(m.item)&&capOf(m)!==null)emit('machineTotal:'+m.id+'|out',capOf(m),'abundant-stock-independent-refill',{machine:m.id,item:m.item});
 for(const f of fs){const inputs=negs(f);if(inputs.length&&inputs.every(([k])=>abundant.has(k)))emit('duty:'+f.id,U,'all-inputs-eventually-abundant',{factory:f.id});}
 for(const item of items){
  const income=read('inflow:'+item);if(income===null)continue;
  let fixed=Z,capacity=Z,valid=true;const remaining=[],fixedActors=[];
  for(const m of outlets.filter(m=>m.item===item)){
   const rate=read('machineTotal:'+m.id+'|out');
   if(rate!==null){fixed=add(fixed,rate);fixedActors.push(m.id);continue;}
   const cap=capOf(m);if(cap===null){valid=false;break;}
   capacity=add(capacity,cap);remaining.push({id:m.id,kind:'outlet',cap:txt(cap)});
  }
  if(!valid)continue;
  for(const f of fs){
   const inputs=negs(f),entry=inputs.find(([k])=>k===item);if(!entry)continue;
   const cap=sub(Z,q(entry[1])),duty=read('duty:'+f.id);
   if(duty!==null){fixed=add(fixed,mul(cap,duty));fixedActors.push(f.id);continue;}
   if(inputs.some(([k])=>k!==item&&!abundant.has(k))){valid=false;break;}
   capacity=add(capacity,cap);remaining.push({id:f.id,kind:'frozen',cap:txt(cap)});
  }
  if(!valid||!remaining.length)continue;
  const residual=sub(income,fixed);if(cmp(residual,Z)<0)continue;
  const service=cmp(residual,capacity)<=0?residual:capacity;
  emit('outflow:'+item,add(fixed,service),'high-stock-interval-work-conservation',{item,income:txt(income),fixed:txt(fixed),capacity:txt(capacity),remaining,fixedActors});
 }
 return out;
}
if(typeof module!=='undefined')module.exports={proveStockWorkConservation};


// --- warehouse_ready_tree_proof.js source SHA256 05bbeb5f4ed929e80209bb0a99bab1fdb3923e7cbda5487f52133b5a65e5ec8a ---
'use strict';
// Real warehouse refill: after inventory stays high, the 3-slot physical
// buffer is always ready at an eligible dispatch (possibly after <=1s).
// Certify one or more warehouse roots per otherwise independent ordinary
// recipe tree, with an unrestricted compatible warehouse terminal.
function proveWarehouseReadyTrees(g,arith,{maxNodes=600,maxEdges=30000}={}){
 const result={caps:[],trees:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 for(const sink of g.nodes){
  if(!sink.recipe||O.get(sink.id).length!==1||ns.get(O.get(sink.id)[0].to).type!=='仓入')continue;
  const ids=[],stages=[],seen=new Set(),roots=[];let bad=false;
  function visit(id,to,a){
   if(bad)return;
   const m=ns.get(id),r=m.recipe,ins=I.get(id),outs=O.get(id);
   if(seen.has(id)||ins.length!==m.physicalInCount||outs.length!==m.physicalOutCount||outs.length!==1||!valid(outs[0])){bad=true;return;}
   seen.add(id);const i=ids.length;ids.push(id);
   if(m.type==='仓出'){
    if(to===null||ins.length||!m.item||outs[0].materials[0]!==m.item){bad=true;return;}
    roots.push({id,item:m.item,route:outs[0].id,index:i});stages.push({b:1,T:'1',length:outs[0].length,to,a,readyRoot:true});return;
   }
   const keys=Object.keys(r?.inputs||{});
   if(!r||outs[0].materials[0]!==r.output||ins.length!==keys.length||new Set(ins.map(e=>e.toPort)).size!==ins.length||keys.some(k=>ins.filter(e=>valid(e)&&e.materials[0]===k).length!==1)){bad=true;return;}
   stages.push({b:r.qty,T:r.seconds,length:outs[0].length,to,a});
   for(const e of ins)visit(e.from,i,r.inputs[e.materials[0]]);
  }
  visit(sink.id,null,0);
  if(bad||!roots.length)continue;
  const proof=proveRecipeTree(stages,arith,{clock:'fixed-tick',maxNodes,maxEdges});
  if(proof.status!=='proved'){result.refused.push({machine:sink.id,reason:proof.reason});continue;}
  const items=[...new Set(roots.map(w=>w.item))],caps=roots.map(w=>({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'warehouse-ready-fixed-frame-ordinal-tree',machine:w.id,item:w.item,route:w.route,rate:proof.routeRates[w.index],machines:ids,stageRates:proof.stageRates,criticalCircuit:proof.criticalCircuit,tree:sink.id,requiredItems:items}));
  result.caps.push(...caps);result.trees.push({id:sink.id,caps,machines:ids,stageRates:proof.stageRates});
 }
 return result;
}
// For any synchronous window a consumer's cumulative consumption is <=
// its static bound * duration + O(1). For direct recipe inputs this follows
// from the bounded belt + input/active/output queues and nominal batch clock.
function proveWarehouseCapacityBounds(g,arith,readyCaps=[]){
 const {q,cmp,div,mul,txt,U,Z}=arith,ns=new Map(g.nodes.map(m=>[m.id,m])),out={};
 for(const m of g.nodes.filter(m=>m.type==='仓出'&&m.item)){
  let upper=U;
  const es=g.lines.filter(e=>e.from===m.id);
  if(!es.length)upper=Z;
  else if(es.length===1){
   const e=es[0],d=ns.get(e.to),r=d?.recipe;
   if(!e.materials.includes(m.item))upper=Z;
   else if(r&&Object.hasOwn(r.inputs,m.item)){
    const a=q(r.inputs[m.item]),b=q(r.qty),T=q(r.seconds),outs=g.lines.filter(x=>x.from===d.id&&x.materials.includes(r.output)).length;
    for(const v of [div(a,T),div(mul(a,q(outs)),b)])if(cmp(v,upper)<0)upper=v;
   }
  }
  const cap=readyCaps.find(x=>x.machine===m.id);
  if(cap&&cmp(q(cap.rate),upper)<0)upper=q(cap.rate);
  out[m.id]=txt(upper);
 }
 return out;
}
// At or above the sum of ALL consumers' cumulative upper capacities,
// every independently high-stock work-conserving subnetwork attains its
// own cap. No need for the other consumers to be free or known individually.
function proveBalancedStockSaturation(g,arith,values,readyCaps,uppers,netLower={}){
 const {q,cmp,add,sub,txt,Z,U}=arith,out={relations:[],witnesses:[]};
 if(g.unlimited)return out;
 for(const cap of readyCaps){
  const item=cap.item,income=values['inflow:'+item];if(income==null)continue;
  if((cap.requiredItems||[item]).some(k=>k!==item&&![values['net:'+k],netLower[k]].some(v=>v!=null&&cmp(q(v),Z)>0)))continue;
  let total=Z;
  for(const m of g.nodes.filter(m=>m.type==='仓出'&&m.item===item))total=add(total,q(uppers[m.id]??'1'));
  for(const f of g.frozen||[]){const v=q(f.rates[item]??'0');if(cmp(v,Z)<0)total=sub(total,v);}
  if(cmp(q(income),total)<0)continue;
  const query='machineTotal:'+cap.machine+'|out';
  if(values[query]===cap.rate)continue;
  out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'balanced-stock-ready-tree-saturation',sense:'eq',coefficients:{[query]:1},constant:cap.rate});
  out.witnesses.push({query,rate:cap.rate,income,totalUpper:txt(total),cap});
 }
 return out;
}
// Joint low-stock boundary proof for an independent converging tree.
// All its withdrawals are proportional to one terminal batch counter,
// up to bounded buffers. Outside consumers may be arbitrary, provided
// their actual cumulative average is independently fixed.
function proveJointWarehouseTreeBottleneck(g,arith,values,trees){
 const {q,cmp,add,sub,mul,div,txt,Z,U}=arith,out={relations:[],witnesses:[]};
 if(g.unlimited)return out;
 for(const tree of trees){
  const roots=new Set(tree.caps.map(c=>c.machine)),need=new Map();
  for(const c of tree.caps)need.set(c.item,add(need.get(c.item)||Z,q(c.rate)));
  let scale=U,ok=true;const evidence=[];
  for(const [item,cap] of need){
   const income=values['inflow:'+item];if(income==null||cmp(cap,Z)<=0){ok=false;break;}
   let other=Z;
   for(const m of g.nodes.filter(m=>m.type==='仓出'&&m.item===item&&!roots.has(m.id))){
    const r=values['machineTotal:'+m.id+'|out'];if(r==null){ok=false;break;}other=add(other,q(r));
   }
   if(!ok)break;
   for(const f of g.frozen||[]){
    const r=q(f.rates[item]??'0');if(cmp(r,Z)>=0)continue;
    const duty=values['duty:'+f.id];if(duty==null){ok=false;break;}other=sub(other,mul(r,q(duty)));
   }
   if(!ok)break;
   const available=sub(q(income),other);if(cmp(available,Z)<0){ok=false;break;}
   const ratio=div(available,cap);if(cmp(ratio,scale)<0)scale=ratio;
   evidence.push({item,income,other:txt(other),fullDemand:txt(cap),ratio:txt(ratio)});
  }
  if(!ok)continue;
  for(const c of tree.caps){
   const query='machineTotal:'+c.machine+'|out',rate=txt(mul(q(c.rate),scale));
   if(values[query]===rate)continue;
   out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'joint-warehouse-tree-bottleneck',sense:'eq',coefficients:{[query]:1},constant:rate});
  }
  out.witnesses.push({method:'joint-warehouse-tree-bottleneck',tree:tree.id,scale:txt(scale),evidence});
 }
 return out;
}
if(typeof module!=='undefined')module.exports={proveWarehouseReadyTrees,proveWarehouseCapacityBounds,proveBalancedStockSaturation,proveJointWarehouseTreeBottleneck};


// --- structural_zero_proof.js source SHA256 d17679bef362b95feba7629fc078fd39bbf18d858e58e701b9cf429abdd9bcb0 ---
'use strict';
// Eliminate only variables proved zero by nonnegative bounded-buffer
// conservation or empty-start material reachability. Do NOT delete machines
// from the physical layout: finite initial production/refills still matter.
function proveStructuralZeroFlows(g){
 const zero=new Map(g.lines.map(e=>[e.id,new Set()])),cycles=new Set(g.emptyStartProof?.cannotProduce||[]),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){I.get(e.to).push(e);O.get(e.from).push(e);}
 let changed=false,passes=0;
 const set=(e,k)=>{const z=zero.get(e.id);if(!z.has(k)){z.add(k);changed=true;}};
 const setAll=es=>{for(const e of es)for(const k of e.materials)set(e,k);};
 const live=(es,k)=>es.some(e=>e.materials.includes(k)&&!zero.get(e.id).has(k));
 // Split physical weak components without coupling distinct warehouse-in
 // ports. A computer has one shared finite FIFO and remains a single node.
 const ns=new Map(g.nodes.map(m=>[m.id,m])),seen=new Set(),excludedComponents=[];
 for(const m of g.nodes){
  if(m.type==='仓入'||seen.has(m.id))continue;
  const ids=[m.id];seen.add(m.id);
  for(let j=0;j<ids.length;j++)for(const e of [...I.get(ids[j]),...O.get(ids[j])]){
   const other=e.from===ids[j]?e.to:e.from;
   if(ns.get(other).type==='仓入'||seen.has(other))continue;
   seen.add(other);ids.push(other);
  }
  const members=new Set(ids),es=ids.flatMap(id=>O.get(id)),sources=ids.filter(id=>{
   const a=ns.get(id);return a.type==='仓出'&&!!a.item||!!a.recipe&&!Object.keys(a.recipe.inputs||{}).length;
  }),terminals=[...ids.filter(id=>ns.get(id).type==='电脑'),...es.filter(e=>ns.get(e.to).type==='仓入').map(e=>'warehouse-in:'+e.id)];
  // For terminal-less DAGs, reverse topological bounded-flow conservation
  // proves zero independently of any initial finite contents. Preserve
  // possible closed circulating components rather than deleting by fiat.
  let cyclic=false;
  if(!terminals.length){
   const indeg=new Map(ids.map(id=>[id,I.get(id).filter(e=>members.has(e.from)).length])),queue=ids.filter(id=>indeg.get(id)===0);
   for(let j=0;j<queue.length;j++)for(const e of O.get(queue[j]))if(members.has(e.to)){indeg.set(e.to,indeg.get(e.to)-1);if(indeg.get(e.to)===0)queue.push(e.to);}
   cyclic=queue.length!==ids.length;
  }
  const reason=!sources.length?'no-source-empty-start':!terminals.length&&!cyclic?'no-terminal-acyclic':null;
  if(!reason)continue;
  for(const id of ids)if(ns.get(id).recipe)cycles.add(id);
  setAll(es);
  excludedComponents.push({machines:ids,routes:es.map(e=>e.id),x:sources.length,y:ids.length-sources.length-ids.filter(id=>ns.get(id).type==='电脑').length,z:terminals.length,reason});
 }
 for(const e of g.lines)for(const k of e.materials)if(e.outFilter&&e.outFilter!=='任意'&&e.outFilter!==k||Array.isArray(e.acceptedMaterials)&&!e.acceptedMaterials.includes(k)||g.emptyStartProof?.routeItems&&Object.hasOwn(g.emptyStartProof.routeItems,e.id)&&!g.emptyStartProof.routeItems[e.id].includes(k))set(e,k);
 do{
  changed=false;passes++;
  for(const m of g.nodes){
   const ins=I.get(m.id),outs=O.get(m.id),r=m.recipe;
   if(r){
    if(!cycles.has(m.id)&&(!live(outs,r.output)||Object.keys(r.inputs||{}).some(k=>!live(ins,k)))){cycles.add(m.id);changed=true;}
    if(cycles.has(m.id)){setAll(ins);setAll(outs);}
    else{
     for(const e of ins)for(const k of e.materials)if(!Object.hasOwn(r.inputs||{},k))set(e,k);
     for(const e of outs)for(const k of e.materials)if(k!==r.output)set(e,k);
    }
   }else if(m.type==='分流'||m.type==='汇流'){
    const keys=new Set([...ins,...outs].flatMap(e=>e.materials));
    for(const k of keys)if(!live(ins,k)||!live(outs,k))for(const e of [...ins,...outs])if(e.materials.includes(k))set(e,k);
   }
  }
 }while(changed);
 const routes=g.lines.filter(e=>e.materials.every(k=>zero.get(e.id).has(k))).map(e=>e.id);
 return {cycles,zero,routes,passes,summary:{cycles:[...cycles],routes,passes,excludedComponents,materialZeros:[...zero.values()].reduce((n,s)=>n+s.size,0)}};
}
if(typeof module!=='undefined')module.exports={proveStructuralZeroFlows};


// --- saturated_router_proof.js source SHA256 d8369517d58af5cfe9b66e1f7ff7a441b9b4963624cbdc727dddea11c709c18d ---
'use strict';
// Fixed-frame saturated port contracts. Only use compatible physical
// lines; no nominal rate is treated as a proof of readiness elsewhere.
function proveSaturatedRouterCounts(g,arith,{abundantItems=[]}={}){
 const out={relations:[],witnesses:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return out;
 const {q,mul,div,cmp,txt,Z,U}=arith,delta=q('1/20'),ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const valid=e=>Number.isSafeInteger(e.length)&&e.length>=1&&e.materials.length>0&&Array.isArray(e.rawMaterials)&&e.rawMaterials.length>0&&e.rawMaterials.every(k=>e.materials.includes(k)&&e.acceptedMaterials?.includes(k)&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===k));
 const source=(m,e)=>{
  if(!complete(m)||I.get(m.id).length||O.get(m.id).length!==1||!valid(e)||e.fromPort!==0||e.materials.length!==1)return null;
  if(m.type==='仓出')return (g.unlimited||abundantItems.includes(m.item))&&m.item===e.materials[0]?U:null;
  const r=m.recipe;
  if(!r||Object.keys(r.inputs||{}).length||r.output!==e.materials[0]||!Number.isSafeInteger(r.qty)||r.qty<1||cmp(q(r.seconds),Z)<=0||div(q(r.seconds),delta).d!==1n)return null;
  const rate=div(q(r.qty),q(r.seconds));return cmp(rate,U)>=0?U:rate;
 };
 const emit=(coefficients,constant,method,sense='eq')=>out.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method,sense,coefficients,constant:txt(constant)});
 const rt=e=>'routeTotal:'+e.id;
 // Output to warehouse is unblocked. One permanently-ready inlet suffices
 // for full aggregate service. With >=2 ready inlets the shared FIFO fills
 // and the scan takes place exactly once per output period, so those
 // inlets can never be skipped. Other compatible inlets may still be sparse.
 for(const m of g.nodes){
  if(m.type!=='汇流'||!complete(m))continue;
  const ins=I.get(m.id),outs=O.get(m.id);
  if(ins.length<1||ins.length>3||outs.length!==1||outs[0].fromPort!==0||ns.get(outs[0].to).type!=='仓入'||!valid(outs[0])||ins.some(e=>!valid(e)||e.materials.some(k=>!outs[0].materials.includes(k))))continue;
  const ready=ins.filter(e=>{const r=source(ns.get(e.from),e);return r!==null&&cmp(r,U)===0;});
  if(!ready.length)continue;
  const e=outs[0];
  emit({[rt(e)]:1},U,'ready-inlet-free-merger-saturation');
  if(ready.length>=2){
   for(const r of ready.slice(1))emit({[rt(r)]:1,[rt(ready[0])]:-1},Z,'saturated-merger-unskipped-round-robin');
   for(const r of ins.filter(x=>!ready.includes(x)))emit({[rt(r)]:1,[rt(ready[0])]:-1},Z,'saturated-merger-skipped-port-upper','le');
  }
  out.witnesses.push({method:'ready-inlet-free-merger',machine:m.id,output:e.id,ready:ready.map(e=>e.id),allInputs:ins.map(e=>e.id)});
 }
 // Entire fan-out tree must have no backpressure: every active output
 // leads through compatible homogeneous splitters to a warehouse inlet.
 // Same packet gap >= P propagates to each branch without buffering.
 for(const m of g.nodes){
  const es=O.get(m.id);if(es.length!==1)continue;
  const root=es[0],rate=source(m,root);if(rate===null||ns.get(root.to).type!=='分流')continue;
  const k=root.materials[0],seen=new Set(),assign=[],splitters=[];
  function walk(e,x){
   if(!valid(e)||e.materials.length!==1||e.materials[0]!==k||seen.has(e.id))return false;
   seen.add(e.id);assign.push([e,x]);
   const d=ns.get(e.to);
   if(d.type==='仓入')return true;
   const outs=O.get(d.id);
   if(d.type!=='分流'||!complete(d)||I.get(d.id).length!==1||I.get(d.id)[0]!==e||e.toPort!==0||outs.length<1||outs.length>3)return false;
   splitters.push(d.id);
   return outs.every(o=>walk(o,div(x,q(outs.length))));
  }
  if(!walk(root,rate))continue;
  for(const [e,x] of assign)emit({[rt(e)]:1},x,'unblocked-homogeneous-splitter-tree');
  out.witnesses.push({method:'unblocked-homogeneous-splitter-tree',root:m.id,splitters,rates:Object.fromEntries(assign.map(([e,x])=>[e.id,txt(x)]))});
 }
 return out;
}
if(typeof module!=='undefined')module.exports={proveSaturatedRouterCounts};


// --- certified_counts.js source SHA256 6e5ea9f20338fc0a2d21b1040641aea7dffd4509f102924743ff53a27832c763 ---
'use strict';
// Strict preview path. No conditional S/D solve, old reservation proofs,
// simulated event orbit, numerical fixed point or optimization objective.
// Each value is a rational constant on a necessary count envelope.
function solveCertifiedCountGraph(g,arith,{ms=8000,maxRows=12000,maxRounds=8,maxNodes=180}={}){
 const start=performance.now(),deadline=start+ms,remaining=()=>Math.max(0,deadline-performance.now());
 const empty={status:'unsupported',values:{},unknown:[],proofs:[],netLower:{},retryable:false};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return {...empty,reason:'incomplete or unsupported physical graph'};
 const {q,cmp,txt,Z,U}=arith,structuralZeros=proveStructuralZeroFlows(g);
 // Only pure, exclusively connected fixed-frame recipe trees. No virtual
 // warehouse roots or old event-order claims are imported.
 const trees=provePhysicalRecipeTrees(g,arith,{clock:'fixed-tick',maxNodes,maxEdges:12000});
 const fifo=g.physicalSpec?provePermanentFifoBlockage(g.physicalSpec):{relations:[],witnesses:[]};
 const priority=proveRealRefillPriority(g,{maxRelations:1500});
 const bursts=proveUnlimitedFreeExits(g,arith);
 const ready=proveWarehouseReadyTrees(g,arith,{maxNodes:600,maxEdges:20000}),uppers=proveWarehouseCapacityBounds(g,arith,ready.caps);
 const warehouseBounds=Object.entries(uppers).map(([id,v])=>({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:'warehouse-uniform-capacity-bound',sense:'le',coefficients:{['machineTotal:'+id+'|out']:1},constant:v}));
 const unlimitedReady=g.unlimited?ready.caps.map(c=>({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:c.method,sense:'eq',coefficients:{['machineTotal:'+c.machine+'|out']:1},constant:c.rate})):[];

 const routers=proveSaturatedRouterCounts(g,arith);
 const relations=[...fifo.relations,...priority.relations,...warehouseBounds,...unlimitedReady,...routers.relations],seen=new Set(relations.map(x=>JSON.stringify([x.sense,x.coefficients,x.constant])));
 const proofs=[...trees.certificates,...fifo.witnesses,...priority.relations,...bursts,...ready.caps,...routers.witnesses];
 const netLower=Object.create(null),values=Object.create(null);
 const targets=[...new Set([...g.nodes.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item),...(g.frozen||[]).flatMap(f=>Object.entries(f.rates).filter(([,v])=>cmp(q(v),Z)<0).map(([k])=>k))])];
 const build=()=>compileCountProofProblem(g,arith,{htmlQueries:true,machineRates:trees.certificates,warehouseBursts:bursts,rateRelations:relations,structuralZeros});
 let problem=build(),stats=[],retryable=false,round=0,globallyFeasible=false;
 if(problem.status!=='compiled')return {...empty,reason:problem.reason};
 Object.assign(values,problem.structuralConstants);
 for(;round<maxRounds;round++){
  if(remaining()<=0){retryable=true;break;}
  const r=solveFactoredCounts(problem,arith,{ms:remaining(),maxRows,partialFactors:true});
  stats.push({status:r.status,unique:Object.keys(r.unique||{}).length,unresolved:r.unresolved?.length||0,globallyFeasible:r.globallyFeasible??null,factors:r.stats?.factors||[]});
  if(r.status==='unsat')return {...empty,status:'contradiction',reason:'necessary certificates inconsistent',proofs,stats};
  if(!['sat','partial'].includes(r.status)){retryable=true;break;}
  for(const [k,v] of Object.entries(r.unique||{})){
   if(Object.hasOwn(values,k)&&values[k]!==v)return {...empty,status:'contradiction',reason:'certificates disagree at '+k,proofs,stats};
   values[k]=v;
  }
  globallyFeasible=r.globallyFeasible===true;
  if(r.status==='partial')retryable=true;
  if(g.unlimited||!targets.length||remaining()<=0||Object.keys(problem.observables).every(k=>Object.hasOwn(values,k)))break;
  // Exact projection of an interval, never minimization to pick a rate.
  for(const k of targets){
   if(values['net:'+k]!=null){
    if(cmp(q(values['net:'+k]),Z)>0)netLower[k]=values['net:'+k];
    continue;
   }
   if(netLower[k]!=null||remaining()<25||!Object.hasOwn(problem.observables,'net:'+k))continue;
   const p=projectCountInterval(problem,arith,'net:'+k,{ms:Math.min(150,remaining()),maxRows});
   if(p.status==='contradiction')return {...empty,status:'contradiction',reason:'net projection inconsistent',proofs,stats};
   if(p.status==='interval'&&p.lower!=null&&cmp(q(p.lower),Z)>0)netLower[k]=p.lower;
   if(p.status==='interval'&&p.unique)values['net:'+k]=p.lower;
  }
  const work=proveStockWorkConservation(g,arith,values,netLower,ready.caps);
  const balanced=proveBalancedStockSaturation(g,arith,values,ready.caps,uppers,netLower);
  const jointTrees=proveJointWarehouseTreeBottleneck(g,arith,values,ready.trees);
  // Independently abundant inventory also makes the real refill root ready.
  for(const c of ready.caps)if((c.requiredItems||[c.item]).every(k=>netLower[k]!=null&&cmp(q(netLower[k]),Z)>0))balanced.relations.push({proven:true,ruleVersion:'real-outlet-buffer-20261125',method:c.method,sense:'eq',coefficients:{['machineTotal:'+c.machine+'|out']:1},constant:c.rate});

  const abundantRouters=proveSaturatedRouterCounts(g,arith,{abundantItems:Object.keys(netLower).filter(k=>cmp(q(netLower[k]),Z)>0)});
  let fresh=0;
  for(const x of [...work.relations,...balanced.relations,...jointTrees.relations,...abundantRouters.relations]){
   const key=JSON.stringify([x.sense,x.coefficients,x.constant]);
   if(seen.has(key))continue;
   seen.add(key);relations.push(x);fresh++;
  }
  if(!fresh)break;
  proofs.push(...work.witnesses,...balanced.witnesses,...jointTrees.witnesses,...abundantRouters.witnesses);problem=build();
 }
 const all=Object.keys(problem.observables),unknown=all.filter(k=>!Object.hasOwn(values,k));
 const known={...problem.structuralConstants,...Object.fromEntries(all.map(k=>[k,values[k]??null]))};
 return {status:unknown.length||!globallyFeasible?'partial':'proved',values:known,unknown,proofs,netLower,retryable:retryable||remaining()<=0&&unknown.length>0,rounds:stats,structuralZeros:{...structuralZeros.summary,constantQueries:Object.keys(problem.structuralConstants||{}).length},researchQueries:{total:all.length,known:all.length-unknown.length,unknown:unknown.length},elapsedMs:performance.now()-start,scope:'exact-rational-fixed-frame-empty-start'};
}
// Potential is a different, conditional demand query. Only the structurally
// independent cases are used; no actual flow is substituted for unknown D.
function certifiedIndependentPotential(g,arith,values,readyCaps=[]){
 const {q,cmp,sub,add,txt,Z,U}=arith,ns=new Map(g.nodes.map(m=>[m.id,m])),out={};
 for(const key of Object.keys(values).filter(k=>k.startsWith('inflow:'))){
  const k=key.slice(7),income=values[key];let demand=Z,ok=true;
  for(const m of g.nodes.filter(m=>m.type==='仓出'&&m.item===k)){
   const es=g.lines.filter(e=>e.from===m.id);
   if(!es.length)continue;
   const e=es[0],d=ns.get(e.to);
   const cap=readyCaps.find(x=>x.method==='warehouse-ready-fixed-frame-ordinal-tree'&&x.machine===m.id&&x.item===k&&(x.requiredItems||[k]).every(i=>i===k));if(cap){demand=add(demand,q(cap.rate));continue;}
   if(es.length!==1||e.compatible!==true||e.materials.length!==1||e.materials[0]!==k||!d||!(d.type==='仓入'||d.type==='电脑'&&g.lines.filter(x=>x.to===d.id).length===1)){ok=false;break;}
   demand=add(demand,U);
  }
  if(ok)for(const f of g.frozen||[]){
   const needs=Object.entries(f.rates).filter(([,v])=>cmp(q(v),Z)<0),r=needs.find(([i])=>i===k);
   if(!r)continue;
   if(needs.length!==1){ok=false;break;}
   demand=sub(demand,q(r[1]));
  }
  out[k]={withdrawalDemand:ok?txt(demand):null,potential:ok&&income!=null?txt(sub(q(income),demand)):null};
 }
 return out;
}
function factoryCertifiedResearchPreview({ms=8000,maxRows=12000,maxRounds=8,maxNodes=180}={}){
 const t=performance.now(),arith=factoryDirectArithmetic(),g=factoryCompileDirectGraph(state,null,{countOnly:true}),ug=factoryCompileDirectGraph(state,null,{countOnly:true,unlimitedWarehouse:true});
 g.physicalSpec=factoryCompileSymbolicSpec(state);ug.physicalSpec=factoryCompileSymbolicSpec(state,{unlimitedWarehouse:true});
 const bundle={g,ug};
 const opts={ms:Math.max(1,ms*.55),maxRows,maxRounds,maxNodes},actual=solveCertifiedCountGraph(bundle.g,arith,opts);
 const hasConsumers=bundle.g.nodes.some(m=>m.type==='仓出'&&bundle.g.lines.some(e=>e.from===m.id))||(bundle.g.frozen||[]).some(f=>Object.values(f.rates).some(v=>arith.cmp(arith.q(v),arith.Z)<0));
 const unlimited=hasConsumers?solveCertifiedCountGraph(bundle.ug,arith,{...opts,ms:Math.max(0,ms-(performance.now()-t))}):actual;
 // Long-run open-route rates are zero by the new physical rule, and
 // permanently rejected materials have zero mean by bounded FIFO balance.
 // Keep these explicit in the query contract instead of silently omitting.
 function addPhysicalZeros(result,g){
  if(g.status!=='compiled'||!g.completePhysicalRoutes||!['proved','partial'].includes(result.status))return;
  for(const r of state.routes){
   if(!r.to){
    result.values['routeTotal:'+r.id]='0';
    for(const k of streamMaterials(r))result.values['flow:'+r.id+'|'+k]='0';
   }
  }
  for(const e of g.lines)for(const k of e.rawMaterials||[])if(!e.materials.includes(k))result.values['flow:'+e.id+'|'+k]='0';
 }
 addPhysicalZeros(actual,bundle.g);addPhysicalZeros(unlimited,bundle.ug);
 const v=actual.values,u=unlimited.values,potential=certifiedIndependentPotential(bundle.g,arith,v,actual.proofs||[]),items=[...new Set([...Object.keys(v).filter(k=>k.startsWith('net:')).map(k=>k.slice(4)),...Object.keys(u).filter(k=>k.startsWith('net:')).map(k=>k.slice(4)),...bundle.g.nodes.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item),...(bundle.g.frozen||[]).flatMap(f=>Object.keys(f.rates))])];
 const read=(o,k)=>o[k]??null,rows=Object.fromEntries(items.map(k=>[k,{inflow:read(v,'inflow:'+k),outflow:read(v,'outflow:'+k),net:read(v,'net:'+k),potential:potential[k]?.potential??null,overdraft:read(u,'net:'+k),withdrawalDemand:potential[k]?.withdrawalDemand??null,localNet:read(v,'localNet:'+k)}]));
 const demandKnown=items.every(k=>potential[k]?.withdrawalDemand!=null),sumDemand=demandKnown?items.reduce((a,k)=>arith.add(a,arith.q(potential[k].withdrawalDemand)),arith.Z):null;
 const inc=read(v,'total:inflow'),total={inflow:inc,outflow:read(v,'total:outflow'),net:read(v,'total:net'),potential:sumDemand!==null&&inc!==null?arith.txt(arith.sub(arith.q(inc),sumDemand)):null,overdraft:read(u,'total:net')};
 const machineTimes={};
 for(const m of bundle.g.nodes){
  if(!m.recipe&&m.type!=='仓出')continue;
  const r=read(v,m.recipe?'cycle:'+m.id:'machineTotal:'+m.id+'|out');
  machineTimes[m.id]=r===null?null:arith.cmp(arith.q(r),arith.Z)===0?'Infinity':arith.txt(arith.div(arith.U,arith.q(r)));
 }
 const unknownMetrics=items.flatMap(k=>['inflow','outflow','net','potential','overdraft'].filter(f=>rows[k][f]===null).map(f=>f+':'+k)).concat(Object.keys(total).filter(k=>total[k]===null).map(k=>'total:'+k));
 const complete=actual.status==='proved'&&unlimited.status==='proved'&&!unknownMetrics.length;
 return {status:complete?'proved-for-contract':'partial',scope:'exact-rational-fixed-frame-empty-start',actual,unlimited,rows,total,machineTimes,values:v,unknownMetrics,completeHtmlQueries:complete,elapsedMs:performance.now()-t};
}

