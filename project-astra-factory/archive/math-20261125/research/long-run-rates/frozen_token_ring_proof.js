'use strict';
// Exact closed unit-token cycle theorem, ideal continuous service only.
// The initial inventory is an EXPLICIT input, not an inferred warehouse seed.
// Each frozen factory consumes one token and outputs one of the next
// material after the same amount of service. No competitors or physical routes.
function proveFrozenTokenRings(g,arith,initialStock={}){
 const {q,cmp,add,mul,div,sub,txt,U,Z}=arith;
 const result={certificates:[],rings:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||g.unlimited)return result;
 const fs=g.frozen||[],ns=new Map(g.nodes.map(m=>[m.id,m])),cons=new Map(),prod=new Map(),valid=new Map();
 if(new Set(fs.map(f=>f.id)).size!==fs.length)return result;
 const put=(map,k,id)=>{if(!map.has(k))map.set(k,[]);map.get(k).push(id);};
 for(const f of fs){
  const neg=[],pos=[];
  for(const [k,v] of Object.entries(f.rates)){
   const a=q(v),c=cmp(a,Z);
   if(c<0){neg.push([k,sub(Z,a)]);put(cons,k,f.id);}
   if(c>0){pos.push([k,a]);put(prod,k,f.id);}
  }
  if(neg.length===1&&pos.length===1&&neg[0][0]!==pos[0][0]&&cmp(neg[0][1],pos[0][1])===0)
   valid.set(f.id,{id:f.id,input:neg[0][0],output:pos[0][0],a:pos[0][1]});
 }
 const visited=new Set();
 for(const id of valid.keys()){
  if(visited.has(id))continue;
  const chain=[],seen=new Set();let at=id,why=null;
  while(!seen.has(at)){
   const f=valid.get(at);
   if(!f){why='nonunit or competing factory';break;}
   if(cons.get(f.input)?.length!==1||prod.get(f.input)?.length!==1||cons.get(f.output)?.length!==1||prod.get(f.output)?.length!==1){why='nonexclusive token material';break;}
   if(g.lines.some(e=>ns.get(e.to)?.type==='仓入'&&e.materials.includes(f.input)||ns.get(e.from)?.type==='仓出'&&ns.get(e.from)?.item===f.input)){why='physical stock competition';break;}
   seen.add(at);chain.push(f);at=cons.get(f.output)[0];
  }
  if(why||at!==id||chain.length<2){result.refused.push({factory:id,reason:why||'not a closed ring'});continue;}
  let K=0n,L=Z,M=Z;
  for(const f of chain){
   const k=initialStock[f.input]??0;
   if(!Number.isSafeInteger(k)||k<0){why='invalid initial inventory';break;}
   K+=BigInt(k);const tau=div(U,f.a);L=add(L,tau);if(cmp(tau,M)>0)M=tau;
  }
  if(why){result.refused.push({factory:id,reason:why});continue;}
  let rate=Z,cycle=null;
  if(K>0n){const circulation=div(L,q(K));cycle=cmp(M,circulation)>=0?M:circulation;rate=div(U,cycle);}
  for(const f of chain){
   visited.add(f.id);
   result.certificates.push({factory:f.id,duty:txt(div(rate,f.a)),proven:true,method:'closed-unit-token-ring',rate:txt(rate)});
  }
  result.rings.push({factories:chain.map(f=>f.id),tokens:String(K),totalService:txt(L),bottleneckService:txt(M),cycle:cycle?txt(cycle):null,rate:txt(rate)});
 }
 return result;
}
if(typeof module!=='undefined')module.exports={proveFrozenTokenRings};
