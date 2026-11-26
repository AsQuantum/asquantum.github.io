'use strict';
// Exact structural RR consequences. No time steps, simulated event words,
// guessed demand caps or empirical rates. Ideal continuous semantics only.
//
// A free splitter exit is directly connected to an unrestricted warehouse
// deposit, on a compatible homogeneous route. A permanently ready merger
// inlet is certified by the independently established G=P source bound.
// These relations are necessary for actual long-run flows; they are not
// sufficient to certify every water-fill equation or every rate limit.
function factoryDirectRoundRobinCertificates(g,arith,supplyProofs=[]){
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return [];
 const nodes=new Map(g.nodes.map(n=>[n.id,n]));
 const I=new Map(g.nodes.map(n=>[n.id,[]])),O=new Map(g.nodes.map(n=>[n.id,[]]));
 for(const e of g.lines){
  if(!I.has(e.to)||!O.has(e.from))return [];
  I.get(e.to).push(e);O.get(e.from).push(e);
 }
 const supply=supplyProofs instanceof Map?supplyProofs:new Map(supplyProofs.map(p=>[p.route,p]));
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const unique=(es,k)=>new Set(es.map(e=>e[k])).size===es.length;
 const out=[];
 for(const m of g.nodes){
  if(m.type!=='分流'&&m.type!=='汇流')continue;
  const ins=I.get(m.id),outs=O.get(m.id),all=[...ins,...outs];
  if(!ins.length||!outs.length||ins.length!==m.physicalInCount||outs.length!==m.physicalOutCount||!unique(ins,'toPort')||!unique(outs,'fromPort')||all.some(e=>!valid(e)||e.materials[0]!==all[0].materials[0]))continue;
  if(m.type==='分流'&&ins.length===1){
   const free=outs.filter(e=>nodes.get(e.to)?.type==='仓入');
   if(!free.length)continue;
   const feed=supply.get(ins[0].id);
   out.push({machine:m.id,kind:'splitter',item:all[0].materials[0],rule:'empty-start-free-output-rr',ports:outs.map(e=>e.id),unskipped:free.map(e=>e.id),commonRoute:ins[0].id,
    // Known supply upper bound on the gap, not the average flow.
    // With no input backpressure and G=P the physical inlet is exactly 1/P.
    totalRate:feed&&arith.cmp(arith.q(feed.interval),arith.U)===0?'1':null});
  }else if(m.type==='汇流'&&outs.length===1){
   const ready=ins.filter(e=>{const p=supply.get(e.id);return p&&arith.cmp(arith.q(p.interval),arith.U)===0;});
   // At least two such feeds force the three-item queue to fill, and all
   // later arbitrations are eventually at output-release epochs >=P apart.
   const terminal=nodes.get(outs[0].to)?.type==='仓入';
   if(ready.length<2&&!(ready.length&&terminal))continue;
   out.push({machine:m.id,kind:'merger',item:all[0].materials[0],rule:ready.length>=2?'two-ready-inputs-full-output-fifo-rr':'one-ready-input-free-output-throughput',ports:ins.map(e=>e.id),unskipped:ready.length>=2?ready.map(e=>e.id):[],commonRoute:outs[0].id,totalRate:terminal?'1':null});
  }
 }
 return out;
}
// Independent exact linear consequences, expressed as equalities/inequalities
// on real route rates. The symbol lambda is eliminated by choosing one
// certified unskipped port. All relations also hold if averages are replaced
// by limsup differences of cumulative counts divided by time.
function roundRobinRateRelations(cert){
 const f=cert.unskipped[0],equal=[],upper=[];
 for(const r of cert.unskipped.slice(1))equal.push([r,f]);
 if(f!==undefined)for(const r of cert.ports)if(!cert.unskipped.includes(r))upper.push([r,f]);
 return {reference:f,equal,upper,conservation:{total:cert.commonRoute,parts:cert.ports.slice()},totalRate:cert.totalRate};
}
if(typeof module!=='undefined')module.exports={factoryDirectRoundRobinCertificates,roundRobinRateRelations};
