'use strict';
// Reuse the independent service theorems in the separately compiled
// unlimited-stock graph. Potential demand remains the HTML's own
// conditional D semantics, not a substitution of actual rates.
function proveUnlimitedFreeExits(g,arith,freeCertificates=[]){
 if(g.status!=='compiled'||!g.completePhysicalRoutes||!g.unlimited)return [];
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return [];I.get(e.to).push(e);O.get(e.from).push(e);}
 const out=[],certifiedFree=new Set(freeCertificates.filter(c=>c.proven===true&&c.method==='refill-buffer-always-has-space-eventually').map(c=>c.machine));
 for(const e of g.lines){
  const m=ns.get(e.from),d=ns.get(e.to);
  if(m.type!=='仓出'||m.physicalOutCount!==1||O.get(m.id).length!==1||I.get(m.id).length||e.active===false||e.compatible!==true||e.materials.length!==1||e.materials[0]!==m.item||!Number.isSafeInteger(e.length)||e.length<1)continue;
  if(certifiedFree.has(m.id)||d.type==='仓入'||d.type==='电脑'&&d.physicalInCount===1&&I.get(d.id).length===1&&!O.get(d.id).length)out.push({proven:true,item:m.item,method:'unlimited-independent-free-terminal',outlets:[{machine:m.id,route:e.id,rate:'1'}]});
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
