'use strict';
// A converging recipe tree, each ingredient supplied by one independent
// compatible route. Exactly one output per recipe, no warehouse withdrawals,
// splitters, mergers, or contested ingredient buffers. Empty startup.
const treeOrdinalSolver=solveOrdinalGraph;
function proveRecipeTree(stages,arith,options={}){
 const {q,cmp,mul,div,U,Z}=arith,fail=reason=>({status:'not-proved',reason});
 const maxNodes=options.maxNodes??600;
 const fixed=options.clock==='fixed-tick',delta=fixed?q(options.dt??'1/20'):Z;
 if(fixed&&(cmp(delta,Z)<=0||div(U,delta).d!==1n||div(q('1/2'),delta).d!==1n))return fail('noncommensurate fixed clock');
 if(!Array.isArray(stages)||!stages.length)return fail('empty tree');
 const n=stages.length,parents=Array.from({length:n},()=>[]),sinks=[];
 const segments=stages.map(m=>m.transit?.lengths||[m.length]),relays=stages.map(m=>m.transit?.routers||[]);
 const sk=j=>j===0?'s':'s'+j,rk=(i,j)=>j===segments[i].length-1?'r':'r'+j;

 for(let i=0;i<n;i++){
  const m=stages[i];
  if(!Number.isSafeInteger(m.b)||m.b<1||cmp(q(m.T),Z)<=0||!Number.isSafeInteger(m.length)||m.length<1)return fail('invalid stage');
  if(segments[i].length!==relays[i].length+1||segments[i].some(L=>!Number.isSafeInteger(L)||L<1)||relays[i].some(k=>k!=='分流'&&k!=='汇流')||relays[i].length&&(!fixed||m.offerGap!=null||m.rootGap!=null))return fail('unsupported straight relay chain');
  if(fixed&&(div(q(m.T),delta).d!==1n||m.offerGap!=null||m.rootGap!=null&&div(q(m.rootGap),delta).d!==1n||m.rootSpaceWait!=null&&div(q(m.rootSpaceWait),delta).d!==1n))return fail('fixed clock requires commensurate ordinary/ready stages');
  if(m.to===null){sinks.push(i);continue;}
  if(!Number.isInteger(m.to)||m.to<0||m.to>=n||m.to===i||!Number.isSafeInteger(m.a)||m.a<1)return fail('invalid successor');
  parents[m.to].push(i);
 }
 if(sinks.length!==1)return fail('not a single terminal tree');
 for(const m of stages)if(m.rootCalendar){
  const c=m.rootCalendar;
  if(!fixed||!m.readyRoot||m.transit||m.rootGap!=null||m.rootSpaceWait!=null||options.upperBlockTime==null||!Array.isArray(c.waits)||!c.waits.length||c.waits.length>256||cmp(q(c.period),Z)<=0||c.waits.some(w=>cmp(q(w),Z)<=0||div(q(w),delta).d!==1n)||cmp(q(c.waits.at(-1)),q(c.period))!==0)return fail('invalid calendar comparison root');
 }

 for(let i=0;i<n;i++)if(stages[i].offerGap!=null&&(parents[i].length||stages[i].b!==1||stages[i].to===null||cmp(q(stages[i].offerGap),U)<0||cmp(q(stages[i].T),q(stages[i].offerGap))!==0))return fail('invalid virtual offer root');
 for(let i=0;i<n;i++)if(stages[i].readyRoot&&(parents[i].length||stages[i].b!==1||stages[i].to===null||stages[i].offerGap!=null))return fail('invalid permanently ready root');
 for(let i=0;i<n;i++)if(stages[i].rootGap!=null&&(!stages[i].readyRoot||cmp(q(stages[i].rootGap),U)<0))return fail('invalid root gap');
 for(let i=0;i<n;i++)if(stages[i].rootSpaceWait!=null&&(!stages[i].readyRoot||cmp(q(stages[i].rootSpaceWait),Z)<0||!fixed))return fail('invalid root space wait');
 const gcd=(a,b)=>b?gcd(b,a%b):a,lcm=(a,b)=>a/gcd(a,b)*b;
 const ratios=Array(n).fill(null),root=sinks[0],todo=[root];ratios[root]=U;
 for(let t=0;t<todo.length;t++)for(const i of parents[todo[t]]){
  if(ratios[i]!==null)return fail('cycle');
  ratios[i]=div(mul(ratios[todo[t]],q(stages[i].a)),q(stages[i].b));todo.push(i);
 }
 if(todo.length!==n)return fail('disconnected or cyclic');
 const scale=ratios.reduce((s,v)=>lcm(s,v.d),1n),counts=ratios.map(v=>v.n*(scale/v.d)),packets=counts.map((v,i)=>v*BigInt(stages[i].b));
 if(counts.reduce((s,v,i)=>s+v+2n*BigInt(segments[i].length)*packets[i],0n)>BigInt(maxNodes))return fail('symbolic phase limit');
 const N=counts.map(Number),J=packets.map(Number),V=[],offsets=[],edges=[],P=U,d=q('1/2');
 for(let i=0;i<n;i++){
  offsets.push({});
  for(const [kind,count] of [...(!stages[i].readyRoot?[['a',N[i]]]:[]),...(stages[i].rootCalendar?[['f',J[i]]]:[]),...segments[i].flatMap((_,j)=>[[sk(j),J[i]],[rk(i,j),J[i]]])]){
   offsets[i][kind]=V.length;for(let k=0;k<count;k++)V.push({stage:i,kind,index:k});
  }
 }
 function edge(i,kind,j,h,to,k,w){
  const count=kind==='a'?N[i]:J[i],block=Math.floor(j/count),phase=((j%count)+count)%count;
  if(block>0)throw Error('future block dependency');
  edges.push({from:offsets[i][kind]+phase,to:offsets[h][to]+k,lag:-block,w:q(w)});
 }
 for(let i=0;i<n;i++){
  const {b,T,to,a}=stages[i],C=20*b;
  for(let j=0;j<(stages[i].readyRoot?0:N[i]);j++){
   edge(i,'a',j-1,i,'a',j,T);edge(i,'s',(j+1)*b-C-1,i,'a',j,parents[i].length?delta:Z);
   for(const p of parents[i])edge(p,'r',(j+1)*stages[p].a-1,i,'a',j,Z);
  }
  for(let l=0;l<segments[i].length;l++){
   const L=segments[i][l],K=L+1,travel=q({n:BigInt(L),d:2n}),send=sk(l),receive=rk(i,l);
   for(let j=0;j<J[i];j++){
    const gap=l===0&&stages[i].rootGap!=null?q(stages[i].rootGap):l===0&&stages[i].offerGap!=null?q(stages[i].offerGap):P;
    edge(i,send,j-1,i,send,j,gap);edge(i,receive,j-K,i,send,j,l===0&&stages[i].offerGap!=null?arith.add(d,gap):l===0&&stages[i].rootSpaceWait!=null?arith.add(d,q(stages[i].rootSpaceWait)):d);
    if(l===0){
     if(!stages[i].readyRoot)edge(i,'a',Math.floor(j/b),i,send,j,T);
     if(stages[i].rootCalendar){
      const c=stages[i].rootCalendar,B=c.waits.length;
      edge(i,'f',j-B,i,'f',j,c.period);
      for(let a=0;a<B;a++)edge(i,'s',j-3-a,i,'f',j,arith.add(delta,q(c.waits[a])));
      edge(i,'f',j,i,send,j,Z);
     }
    }
    else edge(i,rk(i,l-1),j,i,send,j,relays[i][l-1]==='汇流'?delta:Z);
    const wait=to===null&&l===segments[i].length-1&&options.terminalWait!=null?q(options.terminalWait):Z;
    if(cmp(wait,Z)<0)return fail('invalid terminal wait');
    edge(i,send,j,i,receive,j,arith.add(travel,wait));edge(i,receive,j-1,i,receive,j,arith.add(P,wait));
    if(l+1<segments[i].length)edge(i,sk(l+1),j-3,i,receive,j,relays[i][l]==='分流'?delta:Z);
    else if(to!==null)edge(to,'a',Math.floor((j-3*a)/a),i,receive,j,delta);
   }
  }
 }
 const proof=treeOrdinalSolver(V,edges,N,J,arith,options);return {...proof,scope:fixed?'exact-rational-fixed-tick':'ideal-continuous-event'};
}
function buildStraightRecipeProofView(g){
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return g;
 const I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]])),ns=new Map(g.nodes.map(m=>[m.id,m]));
 for(const e of g.lines){if(!I.has(e.to)||!O.has(e.from))return g;I.get(e.to).push(e);O.get(e.from).push(e);}
 const relay=new Set(),valid=e=>e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 for(const m of g.nodes){
  const a=I.get(m.id),b=O.get(m.id);
  if(['分流','汇流'].includes(m.type)&&a.length===1&&b.length===1&&m.physicalInCount===1&&m.physicalOutCount===1&&valid(a[0])&&valid(b[0])&&a[0].materials[0]===b[0].materials[0])relay.add(m.id);
 }
 const consumed=new Set(),removed=new Set(),lines=[];
 for(const first of g.lines){
  if(relay.has(first.from))continue;
  let e=first;const chain=[e],routers=[],ids=[],seen=new Set();
  while(relay.has(e.to)&&!seen.has(e.to)){
   const id=e.to;seen.add(id);ids.push(id);routers.push(ns.get(id).type);e=O.get(id)[0];chain.push(e);
  }
  if(!routers.length){lines.push(first);continue;}
  if(relay.has(e.to))return g; // don't collapse a closed circulation
  for(const x of chain)consumed.add(x.id);for(const id of ids)removed.add(id);
  lines.push({...first,to:e.to,toPort:e.toPort,terminalWait:e.terminalWait,transit:{lengths:chain.map(x=>x.length),routers,routeIds:chain.map(x=>x.id),routerIds:ids}});
 }
 for(const e of g.lines)if(relay.has(e.from)&&!consumed.has(e.id))lines.push(e);
 return {...g,nodes:g.nodes.filter(m=>!removed.has(m.id)),lines,straightProofRelays:removed.size};
}
function provePhysicalRecipeTrees(g,arith,options={}){
 if(options.clock==='fixed-tick')g=buildStraightRecipeProofView(g);
 const result={certificates:[],trees:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 for(const sink of g.nodes){
  if(!sink.recipe||O.get(sink.id).length!==1||!independentFinalReceiver(O.get(sink.id)[0],ns,I,O))continue;
  const ids=[],stages=[],seen=new Set();let reason=null;
  function visit(id,to,a){
   if(reason)return;
   const m=ns.get(id),r=m.recipe,ins=I.get(id),outs=O.get(id),keys=Object.keys(r?.inputs||{});
   if(!r||seen.has(id)||ins.length!==m.physicalInCount||outs.length!==m.physicalOutCount||outs.length!==1||!valid(outs[0])||outs[0].materials[0]!==r.output||ins.length!==keys.length||new Set(ins.map(e=>e.toPort)).size!==ins.length||keys.some(k=>ins.filter(e=>valid(e)&&e.materials[0]===k).length!==1)){reason='not an isolated one-route-per-ingredient recipe tree';return;}
   seen.add(id);const i=ids.length;ids.push(id);stages.push({b:r.qty,T:r.seconds,length:outs[0].length,transit:outs[0].transit,to,a});
   for(const e of ins)visit(e.from,i,r.inputs[e.materials[0]]);
  }
  visit(sink.id,null,0);
  if(reason){result.refused.push({machine:sink.id,reason});continue;}
  const p=proveRecipeTree(stages,arith,options);
  if(p.status!=='proved'){result.refused.push({machine:sink.id,reason:p.reason});continue;}
  const wait=O.get(sink.id)[0].terminalWait;
  if(wait!=null){
   const slow=proveRecipeTree(stages,arith,{...options,terminalWait:wait});
   if(slow.status!=='proved'||slow.stageRates.some((v,i)=>v!==p.stageRates[i])){result.refused.push({machine:sink.id,reason:'bounded receiver slope not invariant'});continue;}
   p.receiverWaitProof={wait,stageRates:slow.stageRates,criticalCircuit:slow.criticalCircuit};
  }
  result.trees.push({machines:ids,stages,...p});ids.forEach((id,i)=>result.certificates.push({machine:id,rate:p.stageRates[i],proven:true,method:p.receiverWaitProof?'recipe-tree-bounded-receiver-equal-slopes':'recipe-tree-ordinal-circuit-ratio',scope:p.scope,receiverWaitProof:p.receiverWaitProof}));
 }
 return result;
}
