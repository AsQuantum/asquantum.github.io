'use strict';
// Physical graph scheduling only. Condense directed cycles before computing
// depth. Warehouse inventory feedback remains in the global count equations.
// A layer is NOT an isolated factory with missing edges removed.
function buildProofDepthPlan(g){
 const ids=g.nodes.map(m=>m.id),byId=new Map(g.nodes.map(m=>[m.id,m])),rank=new Map(ids.map((id,i)=>[id,i]));
 const next=new Map(ids.map(id=>[id,[]])),prev=new Map(ids.map(id=>[id,[]]));
 for(const e of g.lines)if(e.active!==false&&next.has(e.from)&&prev.has(e.to)){next.get(e.from).push(e.to);prev.get(e.to).push(e.from);}
 // Iterative Kosaraju: large imported graphs need no recursive stack.
 const seen=new Set(),finish=[];
 for(const id of ids){
  if(seen.has(id))continue;
  seen.add(id);const stack=[[id,0]];
  while(stack.length){
   const top=stack.at(-1),adj=next.get(top[0]);
   if(top[1]<adj.length){const v=adj[top[1]++];if(!seen.has(v)){seen.add(v);stack.push([v,0]);}}
   else{finish.push(top[0]);stack.pop();}
  }
 }
 const componentOf=new Map(),components=[];
 for(let i=finish.length-1;i>=0;i--){
  const id=finish[i];if(componentOf.has(id))continue;
  const c=components.length,stack=[id],members=[];componentOf.set(id,c);
  while(stack.length){const v=stack.pop();members.push(v);for(const u of prev.get(v))if(!componentOf.has(u)){componentOf.set(u,c);stack.push(u);}}
  members.sort((a,b)=>rank.get(a)-rank.get(b));
  components.push({id:c,members,cyclic:members.length>1||next.get(id).includes(id),incoming:new Set(),outgoing:new Set(),depth:0});
 }
 for(const [u,adj] of next)for(const v of adj){
  const a=componentOf.get(u),b=componentOf.get(v);if(a===b)continue;
  components[a].outgoing.add(b);components[b].incoming.add(a);
 }
 const remaining=components.map(c=>c.incoming.size),queue=components.filter(c=>!c.incoming.size).map(c=>c.id),ordered=[];
 for(let i=0;i<queue.length;i++){
  const c=components[queue[i]];ordered.push(c);
  for(const id of c.outgoing){const d=components[id];d.depth=Math.max(d.depth,c.depth+1);if(--remaining[id]===0)queue.push(id);}
 }
 const layers=[];
 for(const c of ordered){(layers[c.depth]??=[]).push(...c.members.map(id=>byId.get(id)));}
 const forward=layers.flat(),reverse=forward.slice().reverse();
 return {layers,forward,reverse,componentOf,components:ordered.map(c=>({id:c.id,members:c.members,cyclic:c.cyclic,depth:c.depth})),maxDepth:Math.max(0,layers.length-1)};
}
