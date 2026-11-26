'use strict';
// Saturation of arbitrary homogeneous acyclic transfer regions feeding
// one terminal recipe. Proof uses minimum-depth vacancy propagation,
// not assumed rate splitting, state enumeration, or a particular layout.
function proveSaturatedTransferRegions(g,arith,{dt='1/20',abundantItems=new Set()}={}){
 const {q,cmp,add,sub,mul,div,txt,Z,U}=arith,D=q(dt),out={machineRates:[],roundRobin:[],certificates:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes||cmp(D,Z)<=0||div(U,D).d!==1n||div(q('1/2'),D).d!==1n)return out;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return out;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return out;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>e.active!==false&&e.compatible===true&&e.materials.length===1&&Number.isSafeInteger(e.length)&&e.length>=1;
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 const max=(a,b)=>cmp(a,b)>=0?a:b;
 function rootGap(m,k){
  if(!complete(m)||I.get(m.id).length||O.get(m.id).length!==1)return null;
  const r=m.recipe;
  if(r&&r.output===k&&!Object.keys(r.inputs||{}).length&&Number.isSafeInteger(r.qty)&&r.qty>0&&cmp(q(r.seconds),Z)>0&&div(q(r.seconds),D).d===1n)return max(U,q(r.seconds));
  if(m.type!=='仓出'||m.item!==k)return null;
  if(g.unlimited||abundantItems.has(k))return U;
  let income=Z,cap=q(g.nodes.filter(m=>m.type==='仓出'&&m.item===k&&O.get(m.id).length).length);
  for(const f of g.frozen||[]){
   if(!Object.hasOwn(f.rates,k))continue;const v=q(f.rates[k]);
   if(cmp(v,Z)<0)cap=add(cap,sub(Z,v));
   else if(f.reachable!==false&&Object.values(f.rates).every(v=>cmp(q(v),Z)>=0))income=add(income,v);
  }
  return cmp(income,cap)>0?U:null;
 }
 for(const terminal of g.nodes){
  const r=terminal.recipe,ins=I.get(terminal.id),os=O.get(terminal.id),keys=Object.keys(r?.inputs||{});
  if(!r||!keys.length||!complete(terminal)||ins.length!==keys.length||os.length!==1||!valid(os[0])||os[0].materials[0]!==r.output||ns.get(os[0].to).type!=='仓入'||!Number.isSafeInteger(r.qty)||r.qty<1||cmp(q(r.seconds),q(r.qty))<0||div(q(r.seconds),D).d!==1n)continue;
  if(keys.some(k=>!Number.isSafeInteger(r.inputs[k])||r.inputs[k]<1||ins.filter(e=>valid(e)&&e.materials[0]===k).length!==1))continue;
  const H=q(r.seconds),used=new Set(),regions=[];let reason=null;
  for(const k of keys){
   const last=ins.find(e=>e.materials[0]===k),a=r.inputs[k],edges=new Map(),devices=new Set(),roots=new Set(),visiting=new Set();
   function walk(e){
    if(reason||edges.has(e.id))return;
    if(!valid(e)||e.materials[0]!==k){reason='incompatible homogeneous region';return;}
    edges.set(e.id,e);const m=ns.get(e.from);
    if(visiting.has(m.id)){reason='physical feedback in region';return;}
    if(['分流','汇流'].includes(m.type)){
     if(!complete(m)||!I.get(m.id).length||!O.get(m.id).length||m.type==='分流'&&I.get(m.id).length!==1||m.type==='汇流'&&O.get(m.id).length!==1){reason='incomplete transfer device';return;}
     devices.add(m.id);visiting.add(m.id);for(const x of I.get(m.id))walk(x);visiting.delete(m.id);
    }else roots.add(m.id);
   }
   walk(last);
   if(reason)break;
   if(roots.size!==1||[...devices].some(id=>O.get(id).some(e=>!edges.has(e.id)))||[...devices,...roots].some(id=>used.has(id))){reason='region has external branch, shared root or multiple roots';break;}
   const source=[...roots][0],gap=rootGap(ns.get(source),k);
   if(gap===null){reason='source readiness not proved';break;}
   // Storage graph: belt FIFOs and transfer queues, plus terminal
   // ingredient cache. Every physical action moves one token downstream.
   const ids=[...edges.keys()].map(id=>'e:'+id).concat([...devices].map(id=>'m:'+id),'sink'),adj=new Map(ids.map(id=>[id,[]])),degree=new Map(ids.map(id=>[id,0]));
   const link=(a,b)=>{adj.get(a).push(b);degree.set(b,degree.get(b)+1);};
   for(const e of edges.values()){
    const v='e:'+e.id;
    if(devices.has(e.from))link('m:'+e.from,v);
    if(e.to===terminal.id)link(v,'sink');else if(devices.has(e.to))link(v,'m:'+e.to);else{reason='external receiver';break;}
   }
   if(reason)break;
   const topo=ids.filter(id=>!degree.get(id)),depth=new Map(topo.map(id=>[id,1]));
   if(topo.length!==1||topo[0]!=='e:'+O.get(source)[0].id){reason='multiple storage entry points';break;}
   for(let j=0;j<topo.length;j++)for(const v of adj.get(topo[j])){
    depth.set(v,Math.max(depth.get(v)||0,depth.get(topo[j])+1));degree.set(v,degree.get(v)-1);if(!degree.get(v))topo.push(v);
   }
   if(topo.length!==ids.length){reason='cyclic storage graph';break;}
   const G=add(max(U,gap),D),B=mul(q(depth.get('sink')),G),refill=mul(q(a),B);
   if(cmp(refill,H)>=0){reason='terminal period does not strictly dominate vacancy refill bound';break;}
   for(const id of [...devices,...roots])used.add(id);
   regions.push({item:k,demand:a,source,devices:[...devices],routes:[...edges.keys()],storageDepth:depth.get('sink'),entryGap:txt(B),refillBound:txt(refill),allMergerInputsReady:a===1&&cmp(add(refill,U),H)<0});
  }
  if(reason){out.refused.push({machine:terminal.id,reason});continue;}
  if(!regions.some(r=>r.devices.length))continue; // existing recipe-tree theorem
  const rate=txt(div(U,H));
  out.machineRates.push({machine:terminal.id,rate,proven:true,method:'fixed-tick-acyclic-vacancy-saturation',scope:'exact-rational-fixed-tick'});
  for(const reg of regions)if(reg.allMergerInputsReady)for(const id of reg.devices)if(ns.get(id).type==='汇流'){
   const es=I.get(id);
   out.roundRobin.push({machine:id,kind:'merger',ports:es.map(e=>e.id),unskipped:es.map(e=>e.id),commonRoute:O.get(id)[0].id,totalRate:null,rule:'fixed-tick-single-vacancy-merger'});
  }
  out.certificates.push({machine:terminal.id,rate,period:txt(H),regions,scope:'exact-rational-fixed-tick'});
 }
 return out;
}
module.exports={proveSaturatedTransferRegions};
