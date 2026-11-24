'use strict';
// Exact cycle time of a MAX-PLUS LINEAR, conflict-free event graph.
// Karp's maximum cycle mean theorem: for an autonomous repetitive network,
// x_i(k+1)=max_j(x_j(k)+delay_{ji}), asymptotic event cycle time is the
// maximum mean delay around its directed circuits.
// Not valid as a blanket formula for FIFO class conflicts, non-unit recipes,
// conditional dispatch, feedback warehouse stocks or an unknown scheduler.
// This is algebra over integer/rational delays, not a time simulation.
function steadyExactMaxPlusCycleTime(nodes,edges){
 if(!Array.isArray(nodes)||!Array.isArray(edges)||!nodes.length)
  throw Error('nonempty event graph required');
 const keys=nodes.map(node=>typeof node==='string'?node:node.id);
 if(new Set(keys).size!==keys.length||keys.some(k=>typeof k!=='string'||!k))
  throw Error('invalid/duplicate event node');
 if(keys.length>250)throw Error('event graph too large for exact certificate');
 const indices=new Map(keys.map((key,i)=>[key,i])),m=keys.length;
 const arcs=edges.map(e=>{
  const from=indices.get(e.from),to=indices.get(e.to);
  if(from===undefined||to===undefined)throw Error('unknown event edge endpoint');
  const delay=steadyExactQ(e.delay);
  if(steadyExactCmp(delay,STEADY_ZERO)<0)throw Error('negative event delay');
  return {from,to,delay};
 });
 const dp=Array.from({length:m+1},()=>Array(m).fill(null));
 for(let v=0;v<m;v++)dp[0][v]=STEADY_ZERO;
 for(let k=1;k<=m;k++){
  for(const edge of arcs){
   const prev=dp[k-1][edge.from];
   if(prev===null)continue;
   const candidate=steadyExactAdd(prev,edge.delay);
   if(dp[k][edge.to]===null||steadyExactCmp(candidate,dp[k][edge.to])>0)
    dp[k][edge.to]=candidate;
  }
 }
 let maximum=null,critical=null;
 for(let v=0;v<m;v++){
  if(dp[m][v]===null)continue;
  let minimum=null;
  for(let k=0;k<m;k++){
   if(dp[k][v]===null)continue;
   const numerator=steadyExactSub(dp[m][v],dp[k][v]);
   const mean=steadyExactDiv(numerator,steadyExactQ(m-k));
   if(minimum===null||steadyExactCmp(mean,minimum)<0)minimum=mean;
  }
  if(minimum!==null&&(maximum===null||steadyExactCmp(minimum,maximum)>0)){
   maximum=minimum;critical=keys[v];
  }
 }
 if(maximum===null)return {hasCycle:false,cycleTime:null,eventsPerSecond:null,
  method:'Karp exact rational maximum cycle mean'};
 return {
  hasCycle:true,cycleTime:maximum,
  eventsPerSecond:steadyExactCmp(maximum,STEADY_ZERO)>0?
   steadyExactDiv(STEADY_ONE,maximum):null,
  criticalEndpoint:critical,
  method:'Karp exact rational maximum cycle mean, max-plus linear event graphs ONLY',
  certifiedFor:'conflict-free unit-event timed event graph'
 };
}
