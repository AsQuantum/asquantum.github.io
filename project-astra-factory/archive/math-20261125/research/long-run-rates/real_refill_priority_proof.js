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
  // Each physical inlet has its own one-second receive clock. This
  // arrival envelope holds per material even on a mixed FIFO belt.
  const arrivals=g.lines.filter(e=>ns.get(e.to).type==='仓入'&&e.active!==false&&Number.isSafeInteger(e.length)&&e.length>=1&&e.materials.includes(item)&&(!Array.isArray(e.acceptedMaterials)||e.acceptedMaterials.includes(item)));
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
