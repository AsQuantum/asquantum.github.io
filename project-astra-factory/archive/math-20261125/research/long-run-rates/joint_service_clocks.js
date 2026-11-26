'use strict';
// Static joint service-clock arithmetic. Generalized CRT and counting,
// not period expansion, event traces, or inference of unknown phase offsets.
const mod=(a,m)=>(a%m+m)%m;
function gcd(a,b){a=a<0n?-a:a;b=b<0n?-b:b;while(b){const r=a%b;a=b;b=r;}return a;}
function egcd(a,b){let x=1n,y=0n,u=0n,v=1n;while(b){const k=a/b;[a,b]=[b,a-k*b];[x,u]=[u,x-k*u];[y,v]=[v,y-k*v];}return [a,x,y];}
function mergeCongruences(equations){
 let r=0n,m=1n;
 for(const x of equations){
  const p=BigInt(x.period);if(p<1n)throw Error('invalid period');
  const a=mod(BigInt(x.residue),p),g=gcd(m,p),d=a-r;
  if(d%g)return {compatible:false};
  const M=p/g,inv=egcd(m/g,M)[1],k=mod(d/g*inv,M);
  r=mod(r+m*k,m*M);m*=M;
 }
 return {compatible:true,residue:r.toString(),period:m.toString()};
}
// For a certified class, phase_i = t + offset_i mod period_i on normal
// segments. Offsets are representatives of a *joint phase class*, not
// guessed initial times. Each intersection has density 0 or 1/lcm.
function jointClockDensity(clocks,conditions,arith){
 const {q,div,txt,U}=arith,by=new Map(clocks.map(c=>[c.id,c]));
 if(by.size!==clocks.length)throw Error('duplicate clock');
 const eqs=conditions.map(x=>{const c=by.get(x.id);if(!c||c.offset==null)throw Error('unproved joint phase');const p=BigInt(c.period);if(p<1n)throw Error('invalid period');return {period:p,residue:BigInt(x.phase)-BigInt(c.offset)};});
 const r=mergeCongruences(eqs);return {...r,density:r.compatible?txt(div(U,q(r.period))):'0'};
}
function jointClockUnionDensity(clocks,conditions,arith,{maxEvents=16}={}){
 if(!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>20||conditions.length>maxEvents)return {status:'unknown',reason:'intersection budget'};
 const {q,add,sub,txt,Z}=arith;let total=Z;
 // Inclusion-exclusion is a finite algebraic sum of CRT intersections.
 for(let mask=1;mask<(1<<conditions.length);mask++){
  const set=conditions.filter((_,i)=>mask&(1<<i)),v=q(jointClockDensity(clocks,set,arith).density);
  total=set.length%2?add(total,v):sub(total,v);
 }
 return {status:'proved-conditional',density:txt(total)};
}
// Exact mixture equations. A common phase class need not have a limiting
// weight; every accumulation point nevertheless satisfies these equations.
// Caller certifies that the supplied phase classes cover density-one
// normal steps. No arbitrary selection of a class or mixture weight.
function jointClockClassEquations(classes,queries,arith){
 if(!classes.length||new Set(classes.map(c=>c.id)).size!==classes.length)throw Error('invalid class set');
 const weights=classes.map(c=>'@phaseClass:'+c.id),relations=[{coefficients:Object.fromEntries(weights.map(k=>[k,'1'])),constant:'1'}],bounds=Object.fromEntries(weights.map(k=>[k,['0','1']]));
 const {q,sub,Z,txt}=arith;
 for(const query of queries){
  const coefficients={[query.id]:'1'};
  for(let j=0;j<classes.length;j++){
   const c=classes[j],v=query.union?jointClockUnionDensity(c.clocks,query.conditions,arith):jointClockDensity(c.clocks,query.conditions,arith);
   if(v.status==='unknown')return v;
   const d=q(v.density);if(d.n)coefficients[weights[j]]=txt(sub(Z,d));
  }
  relations.push({coefficients,constant:'0'});bounds[query.id]=['0','1'];
 }
 return {status:'proved-conditional',relations,bounds,weights};
}
// Canonical representatives of all joint phase classes. After clocks
// 1..i-1 are fixed, shifting time by their LCM leaves them unchanged.
// The new phase modulo gcd(LCM,p_i) identifies its distinct classes.
// This enumerates quotient classes, never the common time period.
function compileClockClasses(clocks,queries,arith,{maxClasses=4096,certifiedDifferences=[]}={}){
 if(!clocks.length||new Set(clocks.map(c=>c.id)).size!==clocks.length||!Number.isSafeInteger(maxClasses)||maxClasses<1)return {status:'unknown',reason:'invalid clocks or budget'};
 const ids=new Set(clocks.map(c=>c.id));
 if(certifiedDifferences.some(x=>!ids.has(x.a)||!ids.has(x.b)))throw Error('unknown phase difference clock');
 let L=1n,count=1n,classes=[[]];
 for(const c of clocks){
  const p=BigInt(c.period);if(p<1n)throw Error('invalid period');
  const d=gcd(L,p);count*=d;L=L/d*p;
  if(count>BigInt(maxClasses))return {status:'unknown',reason:'phase class budget',classes:String(count),lcm:String(L)};
  classes=classes.flatMap(xs=>Array.from({length:Number(d)},(_,i)=>[...xs,{id:c.id,period:String(p),offset:String(i)}]));
 }
 const allowed=classes.filter(cs=>{
  const by=new Map(cs.map(c=>[c.id,c]));
  return certifiedDifferences.every(x=>{
   const a=by.get(x.a),b=by.get(x.b),d=gcd(BigInt(a.period),BigInt(b.period));
   return mod(BigInt(a.offset)-BigInt(b.offset)-BigInt(x.difference),d)===0n;
  });
 });
 if(!allowed.length)return {status:'contradiction',reason:'no compatible certified phase class'};
 // Merge classes indistinguishable by requested joint guard averages.
 // The variable is their TOTAL occupation weight, not equal weighting.
 const bins=new Map();
 for(const cs of allowed){
  const ds=queries.map(q=>q.union?jointClockUnionDensity(cs,q.conditions,arith):jointClockDensity(cs,q.conditions,arith));
  if(ds.some(x=>x.status==='unknown'))return {status:'unknown',reason:'joint guard budget'};
  const key=ds.map(x=>x.density).join('|');
  if(!bins.has(key))bins.set(key,{id:'c'+bins.size,clocks:cs,classes:0});
  bins.get(key).classes++;
 }
 const result=jointClockClassEquations([...bins.values()],queries,arith);
 return {...result,phaseClasses:String(count),allowedClasses:allowed.length,distinctQueryClasses:bins.size,lcm:String(L),classGroups:[...bins.values()]};
}
module.exports={mergeCongruences,jointClockDensity,jointClockUnionDensity,jointClockClassEquations,compileClockClasses};
