'use strict';
// A sufficient algebraic invariant for a shared batch input. Equal physical
// port cooldown P. Arbitrary proven supply intervals G_i>=P.
// Preconditions: all heads are ready at a batch release, the input cache is
// full just before that release, and every subsequent release gap >= H.
// Does NOT establish these conditions from average throughput or simulation.
function refillInvariant(batch,ports,P,H,arith){
 const {q,cmp,mul,txt,Z}=arith;P=q(P);H=q(H);
 if(!Number.isSafeInteger(batch)||batch<1||!ports.length||cmp(P,Z)<=0)throw Error('Invalid batch / port interval');
 const n=ports.length,c=ports.map((_,i)=>Math.floor(batch/n)+(i<batch%n?1:0)),G=ports.map(p=>q(p.interval));
 if(G.some(g=>cmp(g,P)<0))throw Error('Supply bound smaller than cooldown');
 let minGap=Z;
 for(let i=0;i<n;i++)if(c[i]){
  const ready=mul(q(c[i]),G[i]);if(cmp(ready,minGap)>0)minGap=ready;
  const last=mul(q(c[i]-1),G[i]);
  for(let j=0;j<n;j++)if(i!==j){
   const next=mul(q(c[j]),P),d=cmp(last,next);
   if(d>0||d===0&&i>j)return {status:'not-proved',reason:'arrival-order-overlap',i,j};
  }
 }
 const counts=Object.fromEntries(ports.map((p,i)=>[p.id,c[i]]));
 return cmp(H,minGap)<0?{status:'not-proved',reason:'insufficient-minimum-batch-gap',required:txt(minGap),counts}:
  {status:'conditional-invariant',required:txt(minGap),counts};
}
if(typeof module!=='undefined')module.exports={refillInvariant};
