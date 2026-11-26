'use strict';
// A frozen factory owns a single service clock. When it is the exclusive
// consumer of each of its inputs, count conservation and last shortage
// prove its actual duty. No service event sequence or numerical iteration.
function proveExclusiveFrozenDuties(g,arith,knownPhysical={}){
 const {q,cmp,add,div,txt,U,Z}=arith,result={certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const f=g.frozen||[],nodes=new Map(g.nodes.map(m=>[m.id,m]));
 if(new Set(f.map(x=>x.id)).size!==f.length)return result;
 const known=new Map(),byId=new Map(f.map(x=>[x.id,x])),consumers=new Map(),producers=new Map();
 const neg=v=>cmp(q(v),Z)<0,pos=v=>cmp(q(v),Z)>0;
 const append=(m,k,x)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(x);};
 for(const x of f)for(const [k,v] of Object.entries(x.rates)){
  if(neg(v))append(consumers,k,x.id);else if(pos(v))append(producers,k,x.id);
 }
 const deps=new Map(),children=new Map(),eligible=new Set(),todo=[];
 function mark(id,duty,method,inputs){
  known.set(id,q(duty));
  result.certificates.push({factory:id,duty:txt(q(duty)),proven:true,method,inputs});
 }
 for(const x of f){
  const inputs=Object.entries(x.rates).filter(([,v])=>neg(v));
  if(g.unlimited||!inputs.length){mark(x.id,U,g.unlimited?'unlimited-stock':'no-input',[]);continue;}
  let reason=null;const parents=new Set(),incoming=new Map();
  for(const [k,v] of inputs){
   if(consumers.get(k)?.length!==1||g.nodes.some(m=>m.type==='仓出'&&m.item===k)){reason='input not exclusive';break;}
   let a=Z;
   for(const e of g.lines.filter(e=>nodes.get(e.to)?.type==='仓入'&&e.materials.includes(k))){
    const key='flow:'+e.id+'|'+k;
    if(!Object.hasOwn(knownPhysical,key)||knownPhysical[key]===null||cmp(q(knownPhysical[key]),Z)<0){reason='physical deposit not proved';break;}
    a=add(a,q(knownPhysical[key]));
   }
   if(reason)break;
   incoming.set(k,a);
   for(const id of producers.get(k)||[])parents.add(id);
  }
  if(reason){result.refused.push({factory:x.id,reason});continue;}
  eligible.add(x.id);deps.set(x.id,{parents,incoming,inputs});
 }
 const remaining=new Map();
 for(const id of eligible){
  const need=[...deps.get(id).parents].filter(p=>!known.has(p));
  remaining.set(id,need.length);
  if(!need.length)todo.push(id);
  for(const p of need)append(children,p,id);
 }
 for(let i=0;i<todo.length;i++){
  const id=todo[i],{incoming,inputs}=deps.get(id);let duty=U;const proof=[];
  for(const [k,v] of inputs){
   let a=incoming.get(k);
   for(const p of producers.get(k)||[])a=add(a,arith.mul(q(byId.get(p).rates[k]),known.get(p)));
   const rate=q(v),demand={n:-rate.n,d:rate.d},bound=div(a,demand);
   if(cmp(bound,duty)<0)duty=bound;
   proof.push({item:k,inflow:txt(a),demand:txt(demand)});
  }
  mark(id,duty,'exclusive-input-count-service',proof);
  for(const child of children.get(id)||[]){remaining.set(child,remaining.get(child)-1);if(!remaining.get(child))todo.push(child);}
 }
 for(const id of eligible)if(!known.has(id))result.refused.push({factory:id,reason:'unproved producer dependency or cycle'});
 return result;
}
