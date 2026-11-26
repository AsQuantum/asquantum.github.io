'use strict';
// Exact cumulative count theorem for exclusive, single-input conversion rings.
// At each node consumption x_i <= a_i; production is g_i*x_i.
// An independent external income e_i may be zero. No physical withdrawals,
// no competing frozen consumers, no outside dependent producers admitted.
// This theorem is phase independent; it needs only the last-shortage contract.
function proveFedFrozenRings(g,arith,knownPhysical={}){
 const {q,cmp,add,sub,mul,div,txt,U,Z}=arith;
 const min=(a,b)=>cmp(a,b)<=0?a:b;
 const result={certificates:[],rings:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return result;
 const fs=g.frozen||[],ns=new Map(g.nodes.map(m=>[m.id,m])),prod=new Map(),cons=new Map(),single=new Map();
 if(new Set(fs.map(f=>f.id)).size!==fs.length)return result;
 const byId=new Map(fs.map(f=>[f.id,f]));
 const put=(map,k,id)=>{if(!map.has(k))map.set(k,[]);map.get(k).push(id);};
 for(const f of fs){
  const neg=[],pos=[];
  for(const [k,v] of Object.entries(f.rates)){
   const r=q(v),c=cmp(r,Z);
   if(c<0){neg.push([k,sub(Z,r)]);put(cons,k,f.id);}
   if(c>0){pos.push([k,r]);put(prod,k,f.id);}
  }
  if(neg.length===1&&pos.length===1&&neg[0][0]!==pos[0][0])single.set(f.id,{id:f.id,input:neg[0][0],output:pos[0][0],a:neg[0][1],b:pos[0][1],gain:div(pos[0][1],neg[0][1])});
 }
 const visited=new Set();
 for(const id of single.keys()){
  if(visited.has(id))continue;
  const chain=[],seen=new Set();let at=id,why=null;
  while(!seen.has(at)){
   const f=single.get(at);
   if(!f||cons.get(f.input)?.length!==1||cons.get(f.output)?.length!==1){why='not an exclusive single-input ring';break;}
   if(g.nodes.some(m=>m.type==='仓出'&&m.item===f.input)){why='physical consumer';break;}
   seen.add(at);chain.push(f);at=cons.get(f.output)[0];
  }
  if(why||at!==id||chain.length<2){result.refused.push({factory:id,reason:why||'not closed'});continue;}
  for(const f of chain)visited.add(f.id);
  const external=[];
  for(let i=0;i<chain.length;i++){
   const f=chain[i],pred=chain[(i+chain.length-1)%chain.length];
   let income=Z;
   for(const pid of prod.get(f.input)||[]){
    if(pid===pred.id)continue;
    const p=byId.get(pid);
    if(Object.values(p.rates).some(v=>cmp(q(v),Z)<0)){why='external frozen producer not independent';break;}
    income=add(income,q(p.rates[f.input]));
   }
   if(why)break;
   for(const e of g.lines.filter(e=>ns.get(e.to)?.type==='仓入'&&e.materials.includes(f.input))){
    const key='flow:'+e.id+'|'+f.input;
    if(!Object.hasOwn(knownPhysical,key)||knownPhysical[key]==null){why='physical income not independently proved';break;}
    const r=q(knownPhysical[key]);if(cmp(r,Z)<0||cmp(r,U)>0)throw Error('Invalid independent physical income');
    income=add(income,r);
   }
   if(why)break;
   external.push(income);
  }
  if(why){result.refused.push({factory:id,reason:why});continue;}
  // Compose x_i = min(a_i, e_i+g_(i-1)*x_(i-1)) once around
  // the ring, starting and ending at node 0. A clipped affine map
  // F(x)=min(A,B+G*x) results. No iteration, LP, or rate guessing.
  let A=null,B=Z,G=U;
  for(let s=1;s<=chain.length;s++){
   const i=s%chain.length,p=(i+chain.length-1)%chain.length,gain=chain[p].gain,e=external[i];
   A=A===null?chain[i].a:min(chain[i].a,add(e,mul(gain,A)));
   B=add(e,mul(gain,B));G=mul(gain,G);
  }
  let x;
  if(cmp(G,U)<0)x=min(A,div(B,sub(U,G)));
  else if(cmp(B,Z)>0)x=A;
  else {result.refused.push({factory:id,reason:'nonunique closed-ring rate; seed/timing proof required',gain:txt(G)});continue;}
  const rates=[x];
  for(let i=1;i<chain.length;i++)rates.push(min(chain[i].a,add(external[i],mul(chain[i-1].gain,rates[i-1]))));
  if(cmp(rates[0],min(chain[0].a,add(external[0],mul(chain.at(-1).gain,rates.at(-1)))))!==0)throw Error('Invalid composition fixed value');
  for(let i=0;i<chain.length;i++)result.certificates.push({factory:chain[i].id,duty:txt(div(rates[i],chain[i].a)),consumption:txt(rates[i]),production:txt(mul(chain[i].gain,rates[i])),proven:true,method:'exclusive-fed-conversion-ring'});
  result.rings.push({factories:chain.map(f=>f.id),external:external.map(txt),gain:txt(G),composition:{cap:txt(A),offset:txt(B),gain:txt(G)},rates:rates.map(txt)});
 }
 return result;
}
