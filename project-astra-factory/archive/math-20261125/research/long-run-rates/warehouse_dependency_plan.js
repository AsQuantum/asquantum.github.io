'use strict';
// Mathematical decomposition: physical connected resources first, then
// directed supply and bidirectional shared-stock competition.
// No rate iteration or layout-specific IDs. This is a dependency plan,
// not a certificate that boundary mean rates alone determine allocations.
function planWarehouseDependencies(g,arith,{provedDeposits={},provedDuties={},provedNetLower={}}={}){
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return {status:'unsupported',reason:'incomplete physical graph'};
 const {q,txt,add,sub,cmp,Z,U}=arith,ns=new Map(g.nodes.map(m=>[m.id,m])),adj=new Map(g.nodes.filter(m=>m.type!=='仓入').map(m=>[m.id,new Set()]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return {status:'unsupported',reason:'duplicate graph IDs'};
 for(const e of g.lines){
  if(!ns.has(e.from)||!ns.has(e.to)||!adj.has(e.from))return {status:'unsupported',reason:'invalid physical endpoint'};
  if(adj.has(e.to)){adj.get(e.from).add(e.to);adj.get(e.to).add(e.from);}
 }
 const comps=[],owner=new Map();
 for(const [id] of adj){
  if(owner.has(id))continue;
  const ids=[id],cid='C'+comps.length;owner.set(id,cid);
  for(let i=0;i<ids.length;i++)for(const j of adj.get(ids[i]))if(!owner.has(j)){owner.set(j,cid);ids.push(j);}
  comps.push({id:cid,machines:ids,routes:[],deposits:[],withdrawals:[]});
 }
 const by=new Map(comps.map(c=>[c.id,c])),pools=new Map(),frozen=[],vertices=new Map(),edges=new Map();
 function node(id,type,data){if(!vertices.has(id)){vertices.set(id,{id,type,...data});edges.set(id,new Set());}return id;}
 function edge(a,b){edges.get(a).add(b);}
 function pool(k){if(!pools.has(k)){const id=node('W:'+k,'warehouse',{item:k});pools.set(k,{id,item:k,producers:[],consumers:[],order:[],frozenOrder:[]});}return pools.get(k);}
 for(const c of comps)node(c.id,'physical',{});
 function produce(id,k,info){const p=pool(k);p.producers.push({id,...info});edge(id,p.id);}
 function consume(id,k,info){const p=pool(k);p.consumers.push({id,...info});edge(p.id,id);edge(id,p.id);}
 for(const e of g.lines){
  const c=by.get(owner.get(e.from));c.routes.push(e.id);
  if(ns.get(e.to).type==='仓入')for(const k of new Set(e.materials)){c.deposits.push({route:e.id,item:k});produce(c.id,k,{route:e.id});}
  const m=ns.get(e.from);
  if(m.type==='仓出'&&m.item){c.withdrawals.push({machine:m.id,route:e.id,item:m.item});consume(c.id,m.item,{machine:m.id,route:e.id});}
 }
 const fs=g.frozen||[];
 if(new Set(fs.map(f=>f.id)).size!==fs.length)return {status:'unsupported',reason:'duplicate frozen IDs'};
 for(const [i,f] of fs.entries()){
  const entries=Object.entries(f.rates).filter(([,v])=>q(v).n!==0n);
  if(!entries.length)continue;
  const id=node('F:'+f.id,'frozen',{factory:f.id}),negative=entries.some(([,v])=>q(v).n<0n);
  frozen.push({id,factory:f.id,order:i,constantDuty:negative?null:'1',inputs:entries.filter(([,v])=>q(v).n<0n).map(([item,v])=>({item,rate:txt(q(v))})),outputs:entries.filter(([,v])=>q(v).n>0n).map(([item,v])=>({item,rate:txt(q(v))}))});
  for(const [k,v] of entries){if(q(v).n>0n)produce(id,k,{factory:f.id,rate:txt(q(v))});else{consume(id,k,{factory:f.id,rate:txt(q(v))});pool(k).frozenOrder.push(f.id);}}
 }
 for(const p of pools.values()){
  const ids=p.consumers.filter(x=>x.machine!==undefined).map(x=>x.machine),order=(g.pools||[]).find(x=>x.item===p.item)?.order||[];
  if(ids.some(id=>!order.includes(id))||new Set(ids).size!==ids.length||new Set(order).size!==order.length)return {status:'unsupported',reason:'invalid warehouse priority '+p.item};
  p.order=order.filter(id=>ids.includes(id));
 }
 // Strict surplus is a safe cut of the *eventual* stock constraint:
 // I_lower > all possible withdrawals + negative frozen capacities.
 // W(t) >= (I_lower-D_upper)t-o(t), hence eventually always abundant.
 // This does NOT prove an unlimited-empty-start counterfactual has the
 // same average, since the initial state at release may matter.
 for(const p of pools.values()){
  let lo=Z,hi=Z;
  for(const x of p.producers){
   if(x.factory!==undefined){
    const f=frozen.find(a=>a.factory===x.factory),d=f.constantDuty??provedDuties[f.factory];
    if(d!=null){const v=q(d);if(cmp(v,Z)<0||cmp(v,U)>0)return {status:'unsupported',reason:'invalid certified duty'};lo=add(lo,arith.mul(q(x.rate),v));}
   }else if(provedDeposits[x.route]?.[p.item]!=null){
    const v=q(provedDeposits[x.route][p.item]);if(cmp(v,Z)<0||cmp(v,U)>0)return {status:'unsupported',reason:'invalid certified deposit'};lo=add(lo,v);
   }
  }
  for(const x of p.consumers)hi=add(hi,x.factory!==undefined?sub(Z,q(x.rate)):U);
  p.supplyLower=txt(lo);p.demandUpper=txt(hi);
  const net=Object.hasOwn(provedNetLower,p.item)?q(provedNetLower[p.item]):null;
  p.netLower=net===null?null:txt(net);
  p.permanentAbundance=cmp(lo,hi)>0||net!==null&&cmp(net,Z)>0;
  p.abundanceMethod=net!==null&&cmp(net,Z)>0?'joint-certified-net-lower':p.permanentAbundance?'independent-supply-exceeds-capacity':null;
  if(p.permanentAbundance)for(const x of p.consumers)edges.get(p.id).delete(x.id);
 }
 for(const f of frozen){
  f.nonlimitingInputs=f.inputs.filter(x=>pools.get(x.item).permanentAbundance).map(x=>x.item);
  f.possibleLimitingInputs=f.inputs.filter(x=>!pools.get(x.item).permanentAbundance).map(x=>x.item);
  // The shared protection of next input items is NOT removed merely
  // because a factory has a certified unit duty.
  f.serviceEventuallyUnconstrained=f.possibleLimitingInputs.length===0;
 }
 // SCC decomposition on mathematical dependency edges. Independent
 // producers only point to stock, never receive artificial backpressure.
 let cursor=0;const index=new Map(),low=new Map(),stack=[],on=new Set(),groups=[],groupOf=new Map();
 function visit(v){
  index.set(v,cursor);low.set(v,cursor++);stack.push(v);on.add(v);
  for(const w of edges.get(v)){if(!index.has(w)){visit(w);low.set(v,Math.min(low.get(v),low.get(w)));}else if(on.has(w))low.set(v,Math.min(low.get(v),index.get(w)));}
  if(low.get(v)===index.get(v)){const members=[];let w;do{w=stack.pop();on.delete(w);members.push(w);}while(w!==v);const id=groups.length;groups.push({id,members,predecessors:[],successors:[]});for(const x of members)groupOf.set(x,id);}
 }
 for(const v of vertices.keys())if(!index.has(v))visit(v);
 for(const [a,es] of edges)for(const b of es){const i=groupOf.get(a),j=groupOf.get(b);if(i!==j&&!groups[i].successors.includes(j)){groups[i].successors.push(j);groups[j].predecessors.push(i);}}
 const degree=groups.map(s=>s.predecessors.length),order=groups.filter(s=>!degree[s.id]).map(s=>s.id);
 for(let i=0;i<order.length;i++)for(const j of groups[order[i]].successors)if(--degree[j]===0)order.push(j);
 const stages=order.map(i=>{const z=groups[i],members=new Set(z.members),physical=comps.filter(c=>members.has(c.id)),actors=frozen.filter(f=>members.has(f.id)),stock=[...pools.values()].filter(p=>members.has(p.id));
  const incoming=[...pools.values()].flatMap(p=>p.producers.filter(x=>!members.has(x.id)&&members.has(p.id)).map(x=>({item:p.item,...x})));
  const coupled=stock.some(p=>new Set(p.consumers.map(x=>x.id)).size>1||p.consumers.length>1),feedback=stock.some(p=>p.producers.some(x=>members.has(x.id))&&p.consumers.length);
  return {...z,physical:physical.map(c=>c.id),frozen:actors.map(f=>f.factory),stock:stock.map(p=>p.item),incoming,coupled,feedback,kind:!stock.length&&!actors.length?(physical.some(c=>c.withdrawals.length)?'eventually-unconstrained-physical':'warehouse-independent-physical'):actors.length===1&&actors[0].constantDuty==='1'&&!physical.length&&!stock.length?'constant-frozen-source':!physical.length&&!actors.length?'stock-aggregate':'joint-resource-equations'};
 });
 return {status:'planned',components:comps,pools:[...pools.values()],frozen,stages,scope:'safe structural decomposition; certified surplus cuts are eventual only; boundary timing and initial-state selection may still be needed'};
}
module.exports={planWarehouseDependencies};
