'use strict';
// Experimental conditional boundary model; no direct solver dependency.
// External actual deposit calendars are held fixed while a target stock gate
// is lifted. Conditional deposits never feed back into the calendar.
// Period reduction is exact: compare every stage/item credit, not averages.
// Unread stocks do not affect control; discard only those calendar entries.
function iterationReduceBoundary(boundary,guarded,free){
 const read=new Set(guarded.filter(k=>!free.includes(k))),P=boundary.period;
 // A nonempty periodic calendar is a cyclic word of (event, gap)
 // tokens. Its smallest repetition can be found without materializing P ticks.
 const events=Object.entries(boundary.frames).map(([t,o])=>[Number(t),Object.entries(o).map(([stage,v])=>[stage,Object.entries(v).filter(([k])=>read.has(k)).sort(([a],[b])=>a.localeCompare(b))]).filter(([,v])=>v.length).sort(([a],[b])=>a.localeCompare(b))]).filter(([,v])=>v.length).sort(([a],[b])=>a-b);
 if(!events.length)return {...boundary,period:1,frames:{},free};
 const n=events.length,gaps=events.map(([t],i)=>(i+1<n?events[i+1][0]:P+events[0][0])-t);
 const word=events.map(([,v],i)=>JSON.stringify([gaps[i],v])),pi=new Int32Array(n);
 for(let i=1,j=0;i<n;i++){while(j&&word[i]!==word[j])j=pi[j-1];if(word[i]===word[j])j++;pi[i]=j}
 const candidate=n-pi[n-1],len=n%candidate===0?candidate:n,period=gaps.slice(0,len).reduce((a,b)=>a+b,0),frames={};
 for(const [t,entries] of events)if(t<period)frames[t]=Object.fromEntries(entries.map(([k,v])=>[k,Object.fromEntries(v)]));
 return {...boundary,period,frames,free};
}
function iterationBoundaryPressureCore(spec,A,options={}){
 const start=performance.now(),ms=options.ms??60000,parts=(options.parts??iterationPartitionSpec(spec)).sort((a,b)=>a.machines.length+a.routes.length+a.frozen.length-b.machines.length-b.routes.length-b.frozen.length),rows={},results=[],actualValues={},solvedMachines=[],solvedRoutes=[],solvedFrozen=[];
 const rate=(v,k)=>v[k]??'0',minus=(a,b)=>A.txt(A.sub(A.q(a),A.q(b))),plus=(a,b)=>A.txt(A.add(A.q(a),A.q(b)));
 const merge=(k,field,v)=>{const row=rows[k]??={};row[field]=row[field]===null||v===null?null:plus(row[field]??'0',v)};
 for(const part of parts){
  const readers=new Set([...part.machines.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item),...part.frozen.flatMap(f=>Object.entries(f.rates).filter(([,v])=>A.q(v).n<0n).map(([k])=>k))]);
  const possible=iterationWarehouseBoundaryItems(part);
  const remaining=()=>Math.max(0,ms-(performance.now()-start));
  const partKey=JSON.stringify([part.machines.map(m=>m.id),part.routes.map(r=>r.id),part.frozen.map(f=>f.id)]);
  let actual=options.preparedActual?.get(partKey);
  if(!actual){
   const attempt=iterationAttemptAnalytic(part,A,options);
   actual=attempt.result??iterationMemoOrbit(part,A,{...options,captureBoundary:readers.size>0},'actual',{},remaining());
   if(attempt.analyticError)actual={...actual,analyticError:attempt.analyticError};
  }
  if(options.preparePressure)options.preparePressure.actual.set(partKey,actual);
  const info={machines:part.machines.map(m=>m.id),actualStatus:actual.status,method:actual.method,reason:actual.reason,analyticError:actual.analyticError,tick:actual.tick,prefixTicks:actual.prefixTicks,reused:!!actual.reused,resumed:!!actual.resumed,periodTicks:actual.periodTicks,peakCheckpoints:actual.peakCheckpoints,quietSkipped:actual.quietSkipped,stepCalls:actual.stepCalls,symbolicAccepts:actual.symbolicAccepts,symbolicJumps:actual.symbolicJumps,symbolicReplayTicks:actual.symbolicReplayTicks,skippedTicks:actual.skippedTicks,pressure:{}};
  results.push(info);
  if(!actual.values){for(const k of possible)for(const field of ['inflow','localInflow','outflow','localOutflow','demand','localDemand'])merge(k,field,null);continue}
  const v=actual.values;
  solvedMachines.push(...part.machines.map(m=>m.id));solvedRoutes.push(...part.routes.map(r=>r.id));solvedFrozen.push(...part.frozen.map(f=>f.id));
  for(const [k,x] of Object.entries(v))actualValues[k]=plus(actualValues[k]??"0",x);
  const items=new Set([...readers,...Object.keys(v).filter(k=>k.startsWith('inflow:')||k.startsWith('outflow:')).map(k=>k.slice(k.indexOf(':')+1))]);
  // Actual positive-drift guards were shown independent across the recorded
  // orbit by the sufficient stock screen. They remain ready in pressure.
  const abundant=[...readers].filter(k=>(actual.stockDrift?.[k]??0)>0);
  // Frozen common-service actors retain the other inputs' real supply.
  // A positive actual slope does not grant an infinite conditional credit.
  const frozenInputs=new Set(part.frozen.flatMap(f=>Object.entries(f.rates).filter(([,v])=>A.q(v).n<0n).map(([k])=>k)));
  const freeOther=abundant.filter(k=>!frozenInputs.has(k));
  for(const k of items){
   for(const [f,p] of [['inflow','inflow'],['localInflow','localIn'],['outflow','outflow'],['localOutflow','localOut']])merge(k,f,rate(v,p+':'+k));
   let d=null,ld=null;
   if(!readers.has(k)){d=ld='0';info.pressure[k]={status:'no-reader'}}
   else if(actual.pressureDemand&&Object.hasOwn(actual.pressureDemand,k)){d=actual.pressureDemand[k];ld='0';info.pressure[k]={status:'exact-model-analytic',method:actual.method}}
  else if(abundant.includes(k)){d=rate(v,'outflow:'+k);ld=rate(v,'localOut:'+k);info.pressure[k]={status:'actual-ready-gate'}}
   else if(actual.boundary){
    const b=iterationReduceBoundary(actual.boundary,[...readers],[...new Set([...freeOther,k])]);
    const initial={initialStock:b.initialStock,initialControl:b.initialControl,boundary:b},id=JSON.stringify([partKey,k]),kind="pressure:"+k;
    let r;
    if(options.preparePressure){
     const saved=options.orbitCache?.get(JSON.stringify([kind,part.machines.map(m=>m.id),part.routes.map(r=>r.id),part.frozen.map(f=>f.id)]));
     if(saved?.result)options.preparePressure.results.set(id,{...saved.result,reused:true});
     else options.preparePressure.tasks.push({id,part,initial,kind});
     r=options.preparePressure.results.get(id)??{status:'budget',reason:'deferred'};
    }else if(options.pressureResults)r=options.pressureResults.get(id)??{status:'budget',reason:'global-time'};
    else r=iterationSolvePressure(part,A,options,kind,initial,remaining());
    info.pressure[k]={status:r.status,reused:!!r.reused,resumed:!!r.resumed,tick:r.tick,prefixTicks:r.prefixTicks,periodTicks:r.periodTicks,calendarTicks:b.period,projectedMachines:r.projectedMachines,projectedComponents:r.projectedComponents,reason:r.reason,analyticError:r.analyticError,peakCheckpoints:r.peakCheckpoints,quietSkipped:r.quietSkipped,stepCalls:r.stepCalls,symbolicAccepts:r.symbolicAccepts,symbolicJumps:r.symbolicJumps,symbolicReplayTicks:r.symbolicReplayTicks,skippedTicks:r.skippedTicks};
    if(r.values){
     const x=rate(r.values,'outflow:'+k),lx=rate(r.values,'localOut:'+k);
     if(A.cmp(A.q(x),A.q(rate(v,'outflow:'+k)))>=0){d=x;ld=lx;}
     else info.pressure[k].status='conditional-demand-below-actual';
    }
   }else info.pressure[k]={status:'budget-or-no-calendar'};
   merge(k,'demand',d);merge(k,'localDemand',ld);
  }
 }
 for(const row of Object.values(rows)){
  row.net=row.inflow===null||row.outflow===null?null:minus(row.inflow,row.outflow);
  row.potential=row.inflow===null||row.demand===null?null:minus(row.inflow,row.demand);
  row.localPotential=row.localInflow===null||row.localDemand===null?null:minus(row.localInflow,row.localDemand);
 }
 return {status:Object.values(rows).every(r=>r.potential!==null&&r.localPotential!==null)?'experimental-boundary-complete':'partial',certified:false,rows,actualValues:results.every(r=>["exact-model-period","exact-model-analytic"].includes(r.actualStatus))?actualValues:null,partialValues:actualValues,solvedMachines,solvedRoutes,solvedFrozen,components:results,elapsedMs:Math.round(performance.now()-start)};
}

// Cache complete actual+conditional component results, never an average
// supply in place of a real calendar. Cached components already proved
// every queried gate; the actual/pressure calculation is independent.
function iterationBoundaryPressure(spec,A,options={}){
 if(!options.componentMemo)return iterationBoundaryPressureCore(spec,A,options);
 const start=performance.now(),ms=options.ms??60000,parts=iterationPartitionSpec(spec).sort((a,b)=>a.machines.length+a.routes.length+a.frozen.length-b.machines.length-b.routes.length-b.frozen.length),rows={},values={},components=[],solvedMachines=[],solvedRoutes=[],solvedFrozen=[];
 const plus=(a,b)=>A.txt(A.add(A.q(a),A.q(b))),fields=['inflow','localInflow','outflow','localOutflow','demand','localDemand'];
 let complete=true;
 for(const part of parts){
  const key=iterationComponentKey(part,'actual-pressure'),cached=options.componentMemo.get(key);
  const r=cached?{...cached,components:cached.components.map(iterationReuseStats)}:iterationBoundaryPressureCore(part,A,{...options,parts:[part],ms:Math.max(0,ms-(performance.now()-start))});
  if(cached)iterationTouchComponent(options.componentMemo,key);
  else if(r.actualValues!==null&&r.status==='experimental-boundary-complete'&&Object.values(r.rows).every(row=>fields.every(f=>row[f]!=null)))iterationRememberComponent(options.componentMemo,key,r);
  if(r.actualValues===null)complete=false;
  for(const [k,v] of Object.entries(r.partialValues))values[k]=plus(values[k]??'0',v);
  for(const [k,row] of Object.entries(r.rows)){
   const x=rows[k]??={};
   for(const f of fields)x[f]=x[f]===null||row[f]==null?null:plus(x[f]??'0',row[f]);
  }
  components.push(...r.components);solvedMachines.push(...r.solvedMachines);solvedRoutes.push(...r.solvedRoutes);solvedFrozen.push(...r.solvedFrozen);
 }
 const minus=(a,b)=>a==null||b==null?null:A.txt(A.sub(A.q(a),A.q(b)));
 for(const r of Object.values(rows)){r.net=minus(r.inflow,r.outflow);r.potential=minus(r.inflow,r.demand);r.localPotential=minus(r.localInflow,r.localDemand)}
 return {status:Object.values(rows).every(r=>r.potential!==null&&r.localPotential!==null)?'experimental-boundary-complete':'partial',certified:false,rows,actualValues:complete?values:null,partialValues:values,solvedMachines,solvedRoutes,solvedFrozen,components,elapsedMs:Math.round(performance.now()-start)};
}

// A fixed, non-additive calendar replaces all endogenous deposits. Physical
// groups can then communicate only by reading the same non-free stock.
// Keep a zero-rate placeholder for each removed frozen stage so all external
// credits are injected in their original order. Only target debits are read.
function iterationPressureProjection(part,initial,k){
 const b=initial.boundary;
 if(!b||b.additive)return null;
 const groups=iterationPartitionSpec(part,{fixedDeposits:true,free:b.free});
 if(groups.length<2)return null;
 const reads=(g,k)=>g.machines.some(m=>m.type==='仓出'&&m.item===k)||g.frozen.some(f=>f.rates[k]!==undefined&&steadyRegionQ(f.rates[k]).n<0n);
 const selected=groups.filter(g=>reads(g,k));
 if(!selected.length)return null;
 const [ns,es,fs]=JSON.parse(initial.initialControl),mi=new Map(part.machines.map((m,i)=>[m.id,i])),ri=new Map(part.routes.map((r,i)=>[r.id,i]));
 return selected.map(g=>{
  const readers=[...new Set([...g.machines.filter(m=>m.type==='仓出'&&m.item).map(m=>m.item),...g.frozen.flatMap(f=>Object.entries(f.rates).filter(([,v])=>steadyRegionQ(v).n<0n).map(([k])=>k))])];
  const actors=new Set(g.frozen.map(f=>f.id)),groupId=JSON.stringify([g.machines.map(m=>m.id),[...actors]]);
  const frozen=part.frozen.map(f=>actors.has(f.id)?f:{...f,rates:{}});
  const control=JSON.stringify([g.machines.map(m=>ns[mi.get(m.id)]),g.routes.map(r=>es[ri.get(r.id)]),part.frozen.map((f,i)=>actors.has(f.id)?fs[i]:[])]);
  const stock=Object.fromEntries(Object.entries(initial.initialStock).filter(([k])=>readers.includes(k)));
  const boundary=iterationReduceBoundary(b,readers,b.free.filter(k=>readers.includes(k)));
  return {part:{...g,frozen},groupId,initial:{initialStock:stock,initialControl:control,boundary}};
 });
}
function iterationSolvePressure(part,A,options,kind,initial,ms){
 const start=performance.now(),k=kind.slice('pressure:'.length);
 let pieces;
 try{pieces=options.pressureProjection===false?null:iterationPressureProjection(part,initial,k)}catch(error){
  const r=iterationMemoOrbit(part,A,options,kind,initial,Math.max(0,ms-(performance.now()-start)));
  return {...r,analyticError:String(error?.message??error)};
 }
 if(!pieces)return iterationMemoOrbit(part,A,options,kind,initial,ms);
 const results=[],values={};
 for(const x of pieces){
  const r=iterationMemoOrbit(x.part,A,options,kind+':projected:'+x.groupId,x.initial,Math.max(0,ms-(performance.now()-start)));
  results.push(r);
  if(!r.values)continue;
  for(const p of ['outflow:','localOut:'])values[p+k]=A.txt(A.add(A.q(values[p+k]??'0'),A.q(r.values[p+k]??'0')));
 }
 const failure=results.find(r=>r.status==='error');
 if(failure){
  const r=iterationMemoOrbit(part,A,options,kind,initial,Math.max(0,ms-(performance.now()-start)));
  return {...r,analyticError:failure.reason};
 }
 const complete=results.every(r=>r.values);
 const sum=k=>results.reduce((n,r)=>n+(r[k]||0),0);
 return {status:complete?'exact-model-period':'budget',reason:complete?undefined:'projected-component',...(complete?{values}:{}),projected:true,periodTicks:results.length===1?results[0].periodTicks:undefined,prefixTicks:results.length===1?results[0].prefixTicks:undefined,projectedComponents:pieces.length,projectedMachines:pieces.reduce((n,x)=>n+x.part.machines.length,0),peakCheckpoints:Math.max(0,...results.map(r=>r.peakCheckpoints||0)),quietSkipped:sum('quietSkipped'),stepCalls:sum('stepCalls'),skippedTicks:sum('skippedTicks'),symbolicAccepts:sum('symbolicAccepts'),symbolicJumps:sum('symbolicJumps'),symbolicReplayTicks:sum('symbolicReplayTicks'),resumed:results.some(r=>r.resumed),reused:results.every(r=>r.reused)};
}
