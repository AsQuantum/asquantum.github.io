// Offline portable compiler: QF_LRA SMT-LIB using only strings and BigInt.
// No solver or iterative rate calculation is called here.
'use strict';
function compileExactRateProblem(g,{inletPolicy='relaxed',batchRefillCertificates=[]}={}){
 if(g.status!=='compiled')return {status:'unsupported',issues:g.issues||[]};
 if(!['relaxed','fair','strict'].includes(inletPolicy))throw Error('Unknown inlet policy');
 const commands=['(set-logic QF_LRA)'];let n=0;
 const sym=p=>{const v=p+'_'+(++n);commands.push('(declare-const '+v+' Real)');return v;};
 const op=(o,...xs)=>'('+o+' '+xs.join(' ')+')';
 const rat=x=>{
  const s=String(x);
  let a,b;
  if(/^-?\d+\/\d+$/.test(s)){[a,b]=s.split('/').map(BigInt);}
  else if(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s)){const m=s.match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i),exp=Number(m[4]||0)-(m[3]||'').length;if(Math.abs(exp)>50)throw Error('unsupported decimal exponent');a=BigInt(m[2]+(m[3]||''))*(m[1]?-1n:1n);b=1n;if(exp>=0)a*=10n**BigInt(exp);else b=10n**BigInt(-exp);}
  else throw Error('Invalid exact coefficient: '+s);
  if(b<=0n)throw Error('Invalid denominator');
  const t=b===1n?String(a<0n?-a:a):op('/',String(a<0n?-a:a),String(b));
  return a<0n?op('-',t):t;
 };
 const Z='0',U='1';
 const gcd=(a,b)=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b){const t=a%b;a=b;b=t;}return a||1n;};
 const frac=(n,d=1n)=>{if(!d)throw Error('zero denominator');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return [n/g,d/g];};
 const compare=(a,b)=>a[0]*b[1]-b[0]*a[1];
 const qa=(a,b)=>frac(a[0]*b[1]+b[0]*a[1],a[1]*b[1]);
 const qm=(a,b)=>frac(a[0]*b[0],a[1]*b[1]);
 const qn=a=>[-a[0],a[1]],qd=(a,b)=>frac(a[0]*b[1],a[1]*b[0]);
 const constants=new Map(),ranges=new Map(),extrema=new Map();
 const ctext=v=>{const t=rat(v[0]+'/'+v[1]);constants.set(t,v);return t;};
 function cv(x){
  if(constants.has(x))return constants.get(x);
  // rat() emits only nonnegative numerals/divisions, optionally unary minus.
  const m=x.match(/^(?:(\d+)|\(\/ (\d+) (\d+)\)|\(- (\d+)\)|\(- \(\/ (\d+) (\d+)\)\))$/);
  if(!m)return null;
  const v=m[1]?frac(BigInt(m[1])):m[2]?frac(BigInt(m[2]),BigInt(m[3])):m[4]?frac(-BigInt(m[4])):frac(-BigInt(m[5]),BigInt(m[6]));constants.set(x,v);return v;
 }
 const zero=frac(0n),one=frac(1n);
 function range(x){const v=cv(x);return v?[v,v]:ranges.get(x)||[null,null];}
 function sum(xs){let c=zero;const ts=[];for(const x of xs){const v=cv(x);if(v)c=qa(c,v);else ts.push(x);}if(c[0])ts.push(ctext(c));if(!ts.length)return Z;if(ts.length===1)return ts[0];const e=op('+',...ts.sort());let lo=zero,hi=zero;for(const t of ts){const [a,b]=range(t);lo=lo&&a?qa(lo,a):null;hi=hi&&b?qa(hi,b):null;}ranges.set(e,[lo,hi]);return e;}
 function sub(a,b){if(a===b)return Z;const x=cv(a),y=cv(b);if(x&&y)return ctext(qa(x,qn(y)));if(b===Z)return a;const e=op('-',a,b),[l,h]=range(a),[l2,h2]=range(b);ranges.set(e,[l&&h2?qa(l,qn(h2)):null,h&&l2?qa(h,qn(l2)):null]);return e;}
 function mul(a,b){let x=cv(a),y=cv(b);if(x&&y)return ctext(qm(x,y));if(!x&&y){[a,b]=[b,a];x=y;}if(x&&!x[0])return Z;if(x&&compare(x,one)===0n)return b;const e=op('*',a,b);if(x){let [lo,hi]=range(b);if(x[0]<0n)[lo,hi]=[hi,lo];ranges.set(e,[lo?qm(x,lo):null,hi?qm(x,hi):null]);}return e;}
 function div(a,b){const y=cv(b);if(!y)throw Error('nonconstant division');return mul(ctext(qd(one,y)),a);}
 const eq=(a,b)=>op('=',a,b),le=(a,b)=>op('<=',a,b),add=(...xs)=>xs.forEach(x=>commands.push(op('assert',x)));
 const extremum=(cmp,xs)=>{
  if(!xs.length)throw Error('Empty extremum');
  const isMin=cmp==='<=';
  xs=[...new Set(xs)].sort();
  // If one argument's entire interval lies beyond another's, that
  // argument cannot be needed as the extremum. Equal ties are retained once.
  const reduced=[];
  for(const x of xs){
   const [lo,hi]=range(x);
   if(reduced.some(y=>{const [l,h]=range(y);return isMin?lo&&h&&compare(lo,h)>=0n:hi&&l&&compare(hi,l)<=0n;}))continue;
   for(let i=reduced.length-1;i>=0;i--){const [l,h]=range(reduced[i]);if(isMin?hi&&l&&compare(hi,l)<=0n:lo&&h&&compare(lo,h)>=0n)reduced.splice(i,1);}
   reduced.push(x);
  }
  xs=reduced.sort();
  if(xs.length===1)return xs[0];
  const key=cmp+'|'+xs.join('|');if(extrema.has(key))return extrema.get(key);
  const v=sym(isMin?'min':'max');
  add(...xs.map(x=>op(cmp,v,x)),op('or',...xs.map(x=>eq(v,x))));
  const rs=xs.map(range),lo=rs.map(r=>r[0]),hi=rs.map(r=>r[1]);
  const pick=(vs,min)=>vs.filter(Boolean).reduce((a,b)=>a===null?b:(min?compare(a,b)<=0n:compare(a,b)>=0n)?a:b,null);
  ranges.set(v,[isMin?(lo.every(Boolean)?pick(lo,true):null):pick(lo,false),isMin?pick(hi,true):(hi.every(Boolean)?pick(hi,false):null)]);
  extrema.set(key,v);return v;
 };
 const min=(...xs)=>extremum('<=',xs),max=(...xs)=>extremum('>=',xs),bound=x=>min(U,max(Z,x));
 const cf=(t,caps,k)=>{
  let subsets=[{sum:Z,n:0}];
  for(let j=0;j<caps.length;j++)if(j!==k){const prev=subsets.slice();subsets.push(...prev.map(s=>({sum:sum([s.sum,caps[j]]),n:s.n+1})));}
  return min(U,max(...subsets.map(s=>div(sub(t,s.sum),rat(caps.length-s.n)))));
 };
 const lines=g.lines,ns=new Map(g.nodes.map(m=>[m.id,m]));
 const I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 for(let i=0;i<lines.length;i++){I.get(lines[i].to).push(i);O.get(lines[i].from).push(i);}
 for(const [m,ids] of I){const p=ns.get(m).inputPriority||[];if(p.length)ids.sort((a,b)=>p.indexOf(lines[a].toPort)-p.indexOf(lines[b].toPort));}
 const S=lines.map(()=>sym('s')),D=lines.map(()=>sym('d')),X=lines.map(()=>sym('x'));
 for(const v of [...S,...D,...X])ranges.set(v,[zero,one]);
 const F=lines.map(l=>Object.fromEntries(l.materials.map(k=>[k,sym('f')])));
 for(const f of F)for(const v of Object.values(f))ranges.set(v,[zero,one]);
 const material=lines.map(l=>!!l.materials.length),active=lines.map((l,i)=>material[i]&&l.active!==false);
 const own=(o,k)=>Object.hasOwn(o,k),get=(o,k)=>own(o,k)?o[k]:Z;
 const offers=ids=>ids.map(i=>active[i]?S[i]:Z),demands=ids=>ids.map(i=>material[i]?D[i]:Z);
 const os=new Map(),id=new Map(),cycles=Object.create(null);
 const setS=(i,v)=>os.set(i,active[i]?min(U,v):Z),setD=(i,v)=>id.set(i,material[i]?min(U,v):Z);
 for(let i=0;i<lines.length;i++){
  add(le(Z,S[i]),le(S[i],U),le(Z,D[i]),le(D[i],U),eq(X[i],active[i]?min(S[i],D[i]):Z),eq(X[i],sum(Object.values(F[i]))),...Object.values(F[i]).map(v=>le(Z,v)));
  if(!active[i])add(eq(S[i],Z));if(!material[i])add(eq(D[i],Z));
 }
 for(const [m,node] of ns){
  const inc=I.get(m),out=O.get(m),r=node.recipe,typ=node.type;
  if(!inc.length&&!out.length)continue;
  if(r){
   const groups=Object.entries(r.inputs||{}).map(([k,q])=>({k,q:rat(q),ids:inc.filter(i=>own(F[i],k))}));
   const period=div(U,rat(r.seconds)),qty=rat(r.qty);
   const supp=groups.map(g=>div(sum(offers(g.ids)),g.q));
   if(out.length)setS(out[0],mul(qty,min(period,...supp)));
   const downstream=out.length&&material[out[0]]?div(D[out[0]],qty):Z;
   for(let j=0;j<groups.length;j++){
    const {q,ids}=groups[j],need=mul(q,min(period,downstream,...supp.filter((_,k)=>j!==k)));
    if(inletPolicy==='relaxed'&&ids.length>1){
     add(eq(sum(ids.map(i=>X[i])),min(need,sum(offers(ids)))));
     for(const i of ids){id.set(i,D[i]);add(le(D[i],bound(need)),le(bound(sub(need,sum(offers(ids.filter(k=>k!==i))))),D[i]));}
    }else for(let k=0;k<ids.length;k++)setD(ids[k],inletPolicy==='strict'?bound(sub(need,sum(offers(ids.slice(0,k))))):cf(need,offers(ids),k));
   }
   const nu=cycles[m]=sym('cycle');add(le(Z,nu),le(nu,period));
   for(const {k,q,ids} of groups){
    add(eq(sum(ids.map(i=>F[i][k])),mul(q,nu)));
    // This is a conditional local theorem, not an assumed arbitration policy.
    // A caller must independently certify the full-cache / continuously-ready
    // refill premises. No observation, fixture ID or average rate can assert it.
    const certificate=batchRefillCertificates.find(c=>c.machine===m&&c.item===k);
    if(certificate){
     if(inletPolicy!=='relaxed'||certificate.provenReady!==true||!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<=0||!ids.length||ids.some(i=>!active[i]))throw Error('Invalid batch refill certificate');
     if(ids.some(i=>lines[i].materials.length!==1)||!node.inputPriority?.length||ids.some(i=>!node.inputPriority.includes(lines[i].toPort)))throw Error('Batch refill requires distinct homogeneous ordered ports');
     if(new Set(ids.map(i=>lines[i].toPort)).size!==ids.length)throw Error('Duplicate inlet');
     const batch=r.inputs[k],n=ids.length,rounds=Math.ceil(batch/n),cooldown=certificate.cooldown??1;
     if(compare(cv(rat(cooldown)),zero)<=0n||compare(cv(rat(r.seconds)),qm(frac(BigInt(rounds)),cv(rat(cooldown))))<0n)throw Error('Batch refill exceeds guaranteed minimum cycle interval');
     for(let j=0;j<n;j++){const count=Math.floor(batch/n)+(j<batch%n?1:0);add(eq(F[ids[j]][k],mul(rat(count),nu)));}
    }
   }
   add(eq(sum(out.map(i=>get(F[i],r.output))),mul(qty,nu)));
  }else if(typ==='分流'){
   if(inc.length)setD(inc[0],sum(demands(out)));
   const supply=inc.length&&active[inc[0]]?S[inc[0]]:Z;
   for(let k=0;k<out.length;k++)setS(out[k],cf(supply,demands(out),k));
  }else if(typ==='汇流'){
   if(out.length)setS(out[0],sum(offers(inc)));
   const demand=out.length&&material[out[0]]?D[out[0]]:Z;
   for(let k=0;k<inc.length;k++)setD(inc[k],cf(demand,offers(inc),k));
  }else if(typ==='仓入'){for(const i of inc)setD(i,U);}
  else if(typ==='电脑'){for(let k=0;k<inc.length;k++)setD(inc[k],cf(U,offers(inc),k));}
  else if(typ!=='仓出')return {status:'unsupported',issues:[typ]};
  if(typ==='分流'||typ==='汇流')for(const k of new Set([...inc,...out].flatMap(i=>Object.keys(F[i]))))
   add(eq(sum(inc.map(i=>get(F[i],k))),sum(out.map(i=>get(F[i],k)))));
 }
 const pools=new Map((g.pools||[]).map(p=>[p.item,p.order])),frozen=g.frozen||[];
 for(const f of frozen)for(const k of Object.keys(f.rates))if(!pools.has(k))pools.set(k,[]);
 const A=frozen.map(()=>sym('duty')),sign=v=>String(v).startsWith('-')?-1:/^0(?:\.0+)?(?:\/\d+)?$/.test(String(v))?0:1;
 for(const v of A)ranges.set(v,[zero,one]);
 const fin=new Map(),fout=new Map(),localIn=new Map(),localOut=new Map(),avail=new Map(),latent=new Map();
 for(const [k] of pools){
  localIn.set(k,sum(lines.map((l,i)=>ns.get(l.to).type==='仓入'?get(F[i],k):Z)));
  localOut.set(k,sum(lines.map((l,i)=>ns.get(l.from).type==='仓出'?get(F[i],k):Z)));
  fin.set(k,sum(frozen.flatMap((f,j)=>own(f.rates,k)&&sign(f.rates[k])>0?[mul(rat(f.rates[k]),A[j])]:[])));
  fout.set(k,sum(frozen.flatMap((f,j)=>own(f.rates,k)&&sign(f.rates[k])<0?[mul(rat(String(f.rates[k]).slice(1)),A[j])]:[])));
  avail.set(k,sum([localIn.get(k),fin.get(k)]));latent.set(k,Z);
 }
 for(let j=0;j<frozen.length;j++){
  const f=frozen[j],needs=Object.entries(f.rates).filter(([,v])=>sign(v)<0);
  add(le(Z,A[j]),le(A[j],U));
  const capacity=(k,v)=>bound(div(avail.get(k),rat(String(v).slice(1))));
  for(const [k,v] of needs)latent.set(k,sum([latent.get(k),mul(rat(String(v).slice(1)),min(U,...needs.filter(([h])=>h!==k).map(([h,w])=>capacity(h,w))))]));
  add(eq(A[j],min(f.reachable===false?Z:U,...(g.unlimited?[]:needs.map(([k,v])=>capacity(k,v))))));
  for(const [k,v] of needs)avail.set(k,sum([avail.get(k),mul(rat(v),A[j])]));
 }
 const ledger=Object.create(null);
 for(const [k,order] of pools){
  let rem=avail.get(k),outs=order.flatMap(m=>O.get(m)||[]);
  for(const i of outs){setS(i,g.unlimited?U:bound(rem));rem=sub(rem,X[i]);}
  if(!g.unlimited)add(le(Z,rem));
  const incoming=sum([localIn.get(k),fin.get(k)]),outgoing=sum([localOut.get(k),fout.get(k)]);
  const withdrawalDemand=sum([...outs.map(i=>D[i]),latent.get(k)]);ledger[k]={inflow:incoming,outflow:outgoing,net:sub(incoming,outgoing),potential:sub(incoming,withdrawalDemand),withdrawalDemand,localIn:localIn.get(k),localOut:localOut.get(k),localNet:sub(localIn.get(k),localOut.get(k)),frozenIn:fin.get(k),frozenOut:fout.get(k)};
 }
 for(let i=0;i<lines.length;i++)add(eq(S[i],os.get(i)||Z),eq(D[i],id.get(i)||Z));
 const observables=Object.create(null),groups={ledger:[],local:[],cycles:[],flows:[],duties:[],ports:[],totals:[],machines:[]};
 function query(group,key,expression){const v=sym('observe');add(eq(v,expression));observables[key]=v;groups[group].push(key);}
 for(const [k,row] of Object.entries(ledger))for(const [name,v] of Object.entries(row))query(['inflow','outflow','net','potential','withdrawalDemand'].includes(name)?'ledger':'local',name+':'+k,v);
 // Aggregate projections are independent observables: a sum can be unique
 // even if one or every constituent flow is not. Never sum unknown as zero.
 for(const name of ['inflow','outflow','net','potential','withdrawalDemand','localIn','localOut','localNet','frozenIn','frozenOut'])
  query('totals','total:'+name,sum(Object.values(ledger).map(row=>row[name])));
 for(const [m,node] of ns){
  const inc=I.get(m),out=O.get(m);
  for(const [kind,ids] of [['in',inc],['out',out]]){
   query('machines','machineTotal:'+m+'|'+kind,sum(ids.map(i=>X[i])));
   const items=new Set(ids.flatMap(i=>Object.keys(F[i])));
   for(const k of items)query('machines','machineMaterial:'+m+'|'+kind+'|'+k,sum(ids.map(i=>get(F[i],k))));
  }
 }
 for(const [m,v] of Object.entries(cycles))query('cycles','cycle:'+m,v);

 for(let i=0;i<lines.length;i++){
  for(const [k,v] of Object.entries(F[i]))query('flows','flow:'+lines[i].id+'|'+k,v);
  query('flows','routeTotal:'+lines[i].id,X[i]);
  query('ports','offer:'+lines[i].id,S[i]);query('ports','demand:'+lines[i].id,D[i]);
 }
 for(let j=0;j<frozen.length;j++)query('duties','duty:'+frozen[j].id,A[j]);
 return {status:'compiled',policy:inletPolicy,unlimited:!!g.unlimited,smt:commands.join('\n'),observables,groups,variables:n};
}
if(typeof module!=='undefined')module.exports={compileExactRateProblem};
