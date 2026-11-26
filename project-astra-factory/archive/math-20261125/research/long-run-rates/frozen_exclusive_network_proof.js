'use strict';
// Algebraic existence certificate for exclusive-input frozen networks.
// The fixed-point equations are NOT asserted as actual steady behavior
// until the lower/upper mean proof has shown each reported duty unique.
// No numerical fixed-point iteration: use exact finite min branches.
function proveExclusiveFrozenNetwork(g,arith,solve,knownPhysical={},options={}){
 const {q,cmp,add,sub,div,txt,U,Z}=arith;
 const result={certificates:[],refused:[],status:'not-proved'};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return result;
 const fs=g.frozen||[],nodes=new Map(g.nodes.map(m=>[m.id,m])),byId=new Map(fs.map(f=>[f.id,f]));
 if(byId.size!==fs.length)return result;
 const neg=v=>cmp(q(v),Z)<0,pos=v=>cmp(q(v),Z)>0;
 const cons=new Map(),prod=new Map(),data=new Map(),eligible=new Set();
 const put=(map,k,id)=>{if(!map.has(k))map.set(k,[]);map.get(k).push(id);};
 for(const f of fs)for(const [k,v] of Object.entries(f.rates)){
  if(neg(v))put(cons,k,f.id);if(pos(v))put(prod,k,f.id);
 }
 for(const f of fs){
  const inputs=[];let why=null;
  for(const [k,v] of Object.entries(f.rates).filter(([,v])=>neg(v))){
   if(cons.get(k)?.length!==1||g.nodes.some(m=>m.type==='仓出'&&m.item===k)){why='shared input';break;}
   let income=Z;
   for(const e of g.lines.filter(e=>nodes.get(e.to)?.type==='仓入'&&e.materials.includes(k))){
    const key='flow:'+e.id+'|'+k;
    if(!Object.hasOwn(knownPhysical,key)||knownPhysical[key]==null){why='physical income not independently proved';break;}
    const x=q(knownPhysical[key]);if(cmp(x,Z)<0||cmp(x,U)>0)throw Error('Invalid independent physical income');
    income=add(income,x);
   }
   if(why)break;
   inputs.push({item:k,demand:sub(Z,q(v)),income,producers:prod.get(k)||[]});
  }
  if(why)result.refused.push({factory:f.id,reason:why});
  else{eligible.add(f.id);data.set(f.id,inputs);}
 }
 // Finite removal of unsupported dependency nodes, not a rate iteration.
 let changed=true;
 while(changed){
  changed=false;
  for(const id of [...eligible])if(data.get(id).some(p=>p.producers.some(x=>!eligible.has(x)))){
   eligible.delete(id);result.refused.push({factory:id,reason:'depends on unproved producer'});changed=true;
  }
 }
 if(!eligible.size)return result;
 const op=(o,...xs)=>'('+o+' '+xs.join(' ')+')',lines=['(set-logic QF_LRA)'],obs=Object.create(null);
 const syms=new Map([...eligible].map((id,i)=>[id,'v_'+(i+1)]));
 const rat=x=>{const r=q(x);if(r.n<0n)throw Error('negative coefficient');return r.d===1n?String(r.n):op('/',String(r.n),String(r.d));};
 const sum=xs=>xs.length===1?xs[0]:op('+',...xs);
 const as=x=>lines.push(op('assert',x));
 for(const [id,s] of syms){lines.push('(declare-const '+s+' Real)');obs['duty:'+id]=s;}
 for(const [id,s] of syms){
  const caps=['1'];
  for(const p of data.get(id)){
   caps.push(sum([rat(div(p.income,p.demand)),...p.producers.map(pid=>op('*',rat(div(q(byId.get(pid).rates[p.item]),p.demand)),syms.get(pid)))]));
  }
  as(op('<=','0',s));for(const cap of caps)as(op('<=',s,cap));
  const es=caps.map(cap=>op('=',s,cap));as(es.length===1?es[0]:op('or',...es));
 }
 const algebra=solve({status:'compiled',smt:lines.join('\n'),observables:obs,groups:{duty:Object.keys(obs)},variables:syms.size},arith,options);
 result.status=algebra.status;result.algebra=algebra;
 if(algebra.status!=='sat')return result;
 for(const id of eligible){
  const key='duty:'+id;
  if(Object.hasOwn(algebra.unique,key))result.certificates.push({factory:id,duty:algebra.unique[key],proven:true,method:'exclusive-network-unique-monotone-envelope'});
  else result.refused.push({factory:id,reason:'multiple fixed values; count limit not certified'});
 }
 return result;
}
if(typeof module!=='undefined')module.exports={proveExclusiveFrozenNetwork};
