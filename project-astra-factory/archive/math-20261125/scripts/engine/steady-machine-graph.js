'use strict';
// Compile the machine/port/queue/edge abstraction independently of layout IDs.
// Boundary ports are split ONLY if their local storage/service is independent.
function factorySteadyCompileAbstractNetwork(layout=state,model=null){
 if(!layout||!Array.isArray(layout.machines)||!Array.isArray(layout.routes))
  throw Error('Factory layout required');
 if(!model){
  if(layout!==state)throw Error('Pass matching equations for a non-current layout');
  model=factorySteadyBuildEquations();
 }
 const q=model.queueModels||{};
 const index=(xs=[])=>new Map(xs.map(x=>[x.machine,x]));
 const recipeIn=index(q.recipeIngredients),recipeOut=index(q.productionOutputs),
  split=index(q.splitters),merge=index(q.mergers),withdraw=index(q.warehouseOutputs),
  deposit=index(q.warehouseInputs),destroy=index(q.quantumConsumers);
 const lines=model.sharedLines||[];
 const byPort=new Map();
 for(const r of lines){
  byPort.set(JSON.stringify([r.from.id,'out',r.from.port]),r);
  byPort.set(JSON.stringify([r.to.id,'in',r.to.port]),r);
 }
 const nodes=layout.machines.map(m=>{
  const ports=getPorts(m).map(p=>{
   const line=byPort.get(JSON.stringify([m.id,p.kind,p.index]));
   return {index:p.index,direction:p.kind,route:line?.route??null,
    capacityPerSecond:'1',filter:p.filter||null,possibleItems:[...(line?.materials||[])]};
  });
  const inputs=ports.filter(p=>p.direction==='in'),outputs=ports.filter(p=>p.direction==='out');
  const category=inputs.length?(outputs.length?'intermediate':'consumer'):
   (outputs.length?'producer':'decoration');
  const rec=getRecipe(m);
  let inputBuffer={kind:'none'},outputBuffer={kind:'none'},action={kind:'none'};
  if(rec){
   const needs=Object.entries(rec.inputs||{}).map(([item,count])=>({
    item,required:count,capacity:3*count}));
   if(needs.length)inputBuffer={kind:'per-item-fifo',queues:needs,sharedAcrossInputPorts:true,
    details:recipeIn.get(m.id)||null};
   outputBuffer={kind:'single-item-fifo',item:rec.output,capacity:rec.qty*20,
    sharedAcrossOutputPorts:true,details:recipeOut.get(m.id)||null};
   action={kind:'timed-recipe',durationSeconds:String(rec.seconds),
    consumes:rec.inputs||{},produces:{[rec.output]:rec.qty},
    conditions:['all required input counts available','output capacity for entire batch','machine not busy']};
  }else if(m.type==='分流'){
   inputBuffer={kind:'mixed-fifo',capacity:3,details:split.get(m.id)||null};
   action={kind:'split',rule:'round robin connected outputs; incompatible selected filter holds FIFO head and cursor; blocked compatible ports can be skipped'};
  }else if(m.type==='汇流'){
   outputBuffer={kind:'mixed-fifo',capacity:3,details:merge.get(m.id)||null};
   action={kind:'merge',rule:'round robin ready input belt heads into shared output FIFO; dequeue independently'};
  }else if(m.type==='仓出'){
   outputBuffer={kind:'single-item-reservation-fifo',capacity:3,item:m.item||null,details:withdraw.get(m.id)||null};
   action={kind:'withdraw',item:m.item||null,resource:'warehouse',debit:'successful dispatch',priority:'numeric machine ID'};
  }else if(m.type==='仓入'){
   action={kind:'deposit',resource:'warehouse',rule:'immediate credit; independent input ports',details:deposit.get(m.id)||null};
  }else if(m.type==='电脑'){
   inputBuffer={kind:'mixed-fifo',capacity:10,sharedAcrossInputPorts:true,details:destroy.get(m.id)||null};
   action={kind:'destroy',durationSeconds:'1',amount:1};
  }else if(category!=='decoration'){
   action={kind:'unknown',warning:'no transition rule; not a certified rate model'};
  }
  return {id:m.id,type:m.type,category,inputs,outputs,inputBuffer,action,outputBuffer,
   independentInputBoundaryPorts:category==='consumer'&&action.kind==='deposit',
   independentOutputBoundaryPorts:category==='producer'&&outputs.length===1};
 });
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const edges=lines.map(r=>({
  id:r.route,from:r.from,to:r.to,capacityPerSecond:r.capacityPerSecond||'1',
  kind:r.materials.length>1?'mixed':r.materials.length===1?'single':'empty',
  materials:[...r.materials],terms:[...r.terms]
 }));
 // Independent sink ports are virtual boundary vertices; all other incident
 // routes sharing a machine share a local constraint. Group ALL edges, even
 // connected edges leading to a blocked branch or a terminal-less cycle.
 // Open belts are recorded separately: finite belt storage cannot sustain flow.
 const vertex=(endpoint,kind)=>{
  const node=byId.get(endpoint.id);
  if(!node)throw Error('Unmatched edge endpoint '+endpoint.id);
  const independent=kind==='in'?node.independentInputBoundaryPorts:node.independentOutputBoundaryPorts;
  return JSON.stringify(independent?[node.id,kind,endpoint.port]:[node.id]);
 };
 const parent=new Map(edges.map(e=>[e.id,e.id]));
 const owner=new Map();
 function find(id){const p=parent.get(id);if(p!==id)parent.set(id,find(p));return parent.get(id);}
 function join(a,b){const x=find(a),y=find(b);if(x!==y)parent.set(y,x);}
 for(const e of edges)for(const k of [vertex(e.from,'out'),vertex(e.to,'in')]){
  if(owner.has(k))join(e.id,owner.get(k));else owner.set(k,e.id);
 }
 const buckets=new Map();
 for(const e of edges){const p=find(e.id);if(!buckets.has(p))buckets.set(p,[]);buckets.get(p).push(e);}
 const graphs=[...buckets.values()].map((es,id)=>{
  const ms=[...new Set(es.flatMap(e=>[e.from.id,e.to.id]))];
  const producers=es.filter(e=>byId.get(e.from.id).category==='producer').map(e=>({machine:e.from.id,port:e.from.port,edge:e.id}));
  const consumers=es.filter(e=>byId.get(e.to.id).category==='consumer').map(e=>({machine:e.to.id,port:e.to.port,edge:e.id}));
  const distinct=(ps,kind)=>[...new Set(ps.map(p=>vertex({id:p.machine,port:p.port},kind)))].length;
  return {id,edges:es.map(e=>e.id),machines:ms,
   producerPorts:producers,consumerPorts:consumers,
   producerBoundaryCount:distinct(producers,'out'),consumerBoundaryCount:distinct(consumers,'in'),
   intermediateMachines:ms.filter(m=>byId.get(m).category==='intermediate'),
   hasBothBoundaries:producers.length>0&&consumers.length>0,
   status:!producers.length?'no-physical-source':!consumers.length?'no-physical-terminal':'source-to-terminal-component'};
 });
 const termToEdge=new Map(edges.flatMap(e=>e.terms.map(t=>[t,e.id])));
 const edgeToGraph=new Map(graphs.flatMap(g=>g.edges.map(e=>[e,g.id])));
 const warehouseCouplings=(model.warehousePools||[]).map(pool=>({
  item:pool.item,
  depositGraphs:[...new Set(pool.inflowTerms.map(t=>edgeToGraph.get(termToEdge.get(t))).filter(x=>x!==undefined))],
  withdrawalGraphs:[...new Set(pool.outflowTerms.map(t=>edgeToGraph.get(termToEdge.get(t))).filter(x=>x!==undefined))],
  withdrawalMachineOrder:[...pool.withdrawalMachineOrder]
 }));
 return {method:'port-boundary weak components with shared local machine resources',
  nodes,edges,graphs,warehouseCouplings,
  openRoutes:layout.routes.filter(r=>!r.to).map(r=>({id:r.id,from:r.from})),
  excludedConnectedRoutes:layout.routes.filter(r=>r.to&&!lines.some(line=>line.route===r.id)).map(r=>r.id),
  decorations:nodes.filter(n=>n.category==='decoration').map(n=>n.id),
  isolatedMachines:nodes.filter(n=>n.category!=='decoration'&&!n.inputs.concat(n.outputs).some(p=>p.route!==null)).map(n=>n.id),
  physicalCycleCount:typeof factorySteadyGenericTerminalGraph==='function'?
   factorySteadyGenericTerminalGraph(layout).physicalCycleCount:null,
  actualLongRunRatesSolved:false};
}
