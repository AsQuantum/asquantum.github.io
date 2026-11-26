'use strict';
// Mixed-material necessary count relations for the ideal continuous model.
// Only independently saturated pure autonomous inputs, and splitters whose
// every connected output is a compatible free warehouse deposit.
function proveMixedCountRelations(g,arith){
 const {q,cmp,mul,U}=arith,result={roundRobin:[],materialRatios:[],materialRatioBounds:[],refused:[]};
 if(g.status!=='compiled'||!g.completePhysicalRoutes)return result;
 const ns=new Map(g.nodes.map(m=>[m.id,m])),I=new Map(g.nodes.map(m=>[m.id,[]])),O=new Map(g.nodes.map(m=>[m.id,[]]));
 if(ns.size!==g.nodes.length||new Set(g.lines.map(e=>e.id)).size!==g.lines.length)return result;
 for(const e of g.lines){if(!ns.has(e.from)||!ns.has(e.to))return result;I.get(e.to).push(e);O.get(e.from).push(e);}
 const valid=e=>Number.isSafeInteger(e.length)&&e.length>=1&&Array.isArray(e.rawMaterials)&&Array.isArray(e.materials);
 const complete=m=>I.get(m.id).length===m.physicalInCount&&O.get(m.id).length===m.physicalOutCount&&new Set(I.get(m.id).map(e=>e.toPort)).size===I.get(m.id).length&&new Set(O.get(m.id).map(e=>e.fromPort)).size===O.get(m.id).length;
 function freeSplitter(m){
  const ins=I.get(m.id),outs=O.get(m.id);
  if(m.type!=='分流'||!complete(m)||ins.length!==1||!outs.length||[...ins,...outs].some(e=>!valid(e)))return false;
  const mats=ins[0].materials;
  return outs.every(e=>ns.get(e.to).type==='仓入'&&mats.every(k=>e.outFilter&&e.outFilter!=='任意'&&e.outFilter!==k||e.acceptedMaterials.includes(k)));
 }
 // Recursively certify a finite, single-inlet splitter tree whose
 // leaves all deposit freely. Check all upstream possible materials
 // on every branch; a filter mismatch is NOT a free service contract.
 function freeTree(m,mats,seen=new Set()){
  if(!m||seen.has(m.id))return false;
  if(m.type==='仓入')return true;
  if(m.type!=='分流'||!complete(m)||I.get(m.id).length!==1||!O.get(m.id).length)return false;
  seen.add(m.id);
  return O.get(m.id).every(e=>valid(e)&&mats.every(k=>e.materials.includes(k)&&e.acceptedMaterials.includes(k)&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===k))&&freeTree(ns.get(e.to),mats,seen));
 }
 const gcd=(a,b)=>b?gcd(b,a%b):a;
 function propagate(m,mats,word,strideMod){
  if(m.type==='仓入')return;
  const n=word.length,outs=O.get(m.id),stride=(strideMod*outs.length)%n,d=gcd(n,stride),den=n/d;
  for(const branch of outs){
   for(const k of mats){
    // If physical cyclic order is known, enumerate just its residue
    // classes, never the time trace. Otherwise use order-independent
    // pigeonhole bounds. The phase itself need not be known.
    let lo=Math.max(0,word.filter(v=>v===k).length-(n-den)),hi=Math.min(den,word.filter(v=>v===k).length);
    if(word.ordered){
     const counts=Array.from({length:d},(_,j)=>word.filter((v,i)=>i%d===j&&v===k).length);
     lo=Math.min(...counts);hi=Math.max(...counts);
    }
    if(lo===hi)result.materialRatios.push({proven:true,route:branch.id,item:k,numerator:lo,denominator:den,method:'periodic-fifo-splitter-tree'});
    else if(lo>0||hi<den)result.materialRatioBounds.push({proven:true,route:branch.id,item:k,lowerNumerator:lo,upperNumerator:hi,denominator:den,method:'periodic-fifo-residue-bounds'});
   }
   propagate(ns.get(branch.to),mats,word,stride);
  }
 }
 function saturatedSource(e){
  const m=ns.get(e.from),r=m.recipe;
  return valid(e)&&complete(m)&&I.get(m.id).length===0&&O.get(m.id).length===1&&r&&Object.keys(r.inputs||{}).length===0&&Number.isSafeInteger(r.qty)&&r.qty>0&&cmp(q(r.seconds),arith.Z)>0&&cmp(q(r.seconds),q(r.qty))<=0&&e.rawMaterials.length===1&&e.materials.length===1&&e.materials[0]===r.output&&e.compatible===true;
 }
 for(const m of g.nodes){
  const ins=I.get(m.id),outs=O.get(m.id);
  if(m.type==='分流'&&freeSplitter(m)&&!result.roundRobin.some(x=>x.machine===m.id)){
   // Either a mismatch permanently halts all future successful sends, or
   // every successful send advances exactly one connected port. Both give
   // bounded differences in total cumulative sends for all output pairs.
   result.roundRobin.push({machine:m.id,kind:'splitter',rule:'mixed-free-outputs-or-permanent-head-stop',ports:outs.map(e=>e.id),unskipped:outs.map(e=>e.id),commonRoute:ins[0].id,totalRate:null});
  }else if(m.type==='汇流'&&complete(m)&&ins.length>=2&&outs.length===1&&valid(outs[0])&&ins.every(saturatedSource)){
   const e=outs[0],dest=ns.get(e.to),mats=[...new Set(ins.flatMap(x=>x.materials))];
   if(!mats.every(k=>e.materials.includes(k)&&e.acceptedMaterials.includes(k)&&(!e.outFilter||e.outFilter==='任意'||e.outFilter===k)))continue;
   const free=freeTree(dest,mats);
   // When service is infinite, two G=P inputs fill the FIFO and each
   // successful service thereafter finds every G=P input ready. If
   // service is finite, all input counts are bounded anyway.
   result.roundRobin.push({machine:m.id,kind:'merger',rule:'mixed-saturated-input-count',ports:ins.map(x=>x.id),unskipped:ins.map(x=>x.id),commonRoute:e.id,totalRate:free?'1':null});
   // Once the saturated input scan settles, the FIFO stream is a cyclic
   // word of n pure inputs. A free splitter samples every m-th item.
   // Coprime n and m visit every input position independently of phase.
   if(dest.type==='分流'&&free){
    const order=m.mergerPriority,known=Array.isArray(order)&&ins.every(e=>order.includes(e.toPort))&&new Set(order).size===order.length;
    const word=(known?ins.slice().sort((a,b)=>order.indexOf(a.toPort)-order.indexOf(b.toPort)):ins).map(e=>e.materials[0]);word.ordered=known;
    // The free tree has no input backpressure after empty startup.
    // Each splitter advances every successful send, so all its output
    // total rates are equal, irrespective of the periodic word's phase.
    function certifyTree(t){
     if(t.type==='仓入')return;
     const es=O.get(t.id),common=I.get(t.id)[0];
     if(!result.roundRobin.some(x=>x.machine===t.id))result.roundRobin.push({machine:t.id,kind:'splitter',rule:'compatible-free-splitter-tree',ports:es.map(e=>e.id),unskipped:es.map(e=>e.id),commonRoute:common.id,totalRate:null});
     for(const e of es)certifyTree(ns.get(e.to));
    }
    certifyTree(dest);propagate(dest,mats,word,1%word.length);
   }

  }
 }
 return result;
}
if(typeof module!=='undefined')module.exports={proveMixedCountRelations};
