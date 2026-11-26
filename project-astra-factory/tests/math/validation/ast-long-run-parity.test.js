'use strict';
// Diagnostics/validation only. The production proof engine does not read
// these fixtures or the simulator's output.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict'),root=path.resolve(__dirname,'../../..');
const el={getContext(){return{}},classList:{add(){},remove(){}}};
const c=vm.createContext({console,performance,atob,btoa,document:{getElementById(){return el}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/math/arithmetic/rational','engine/steady-flow','engine/math/graph/startup_reachability','engine/math/algebra/direct_algebra','engine/steady-certified-proofs','engine/simulation'])
 vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
vm.runInContext('function stockChartReset(){} function warehouseRefresh(){} function draw(){} function recordWarehouseMovement(){}',c);
const results=[];
for(const fixture of ['tests/fixtures/ast1-warehouse-port-balance-v1.txt','tests/fixtures/ast1-shared-ore-and-battery-v1.txt','tests/fixtures/ast1-priority-armour-backpressure-v1.txt','tests/fixtures/ast1-warehouse-feedback-loop-v1.txt']){
 c.ast=fs.readFileSync(path.join(root,fixture),'utf8').trim();
 const result=JSON.parse(vm.runInContext(`(()=>{
  state=ast1Decode(ast);if(state.machines.length===6)state.frozenFactories=[{id:'frozen-alloy',name:'Frozen alloy',enabled:true,rates:{'合金板':'1'}}];const p=factoryCertifiedResearchPreview({ms:5000});
  resetSimulation();
  const isComplex=state.machines.length===115,window=isComplex?3600:600;
  const calendars=isComplex?[...new Map([...proveTandemDepositCalendars(factoryCompileDirectGraph(state),factoryDirectArithmetic()),...p.actual.proofs.filter(w=>w.method==='priority-paced-recipe-calendar').map(w=>w.outputCalendar)].map(x=>[x.route,x])).values()]:[];
  const arrivals={},watch=new Map(calendars.map(x=>{const r=state.routes.find(e=>e.id===x.route);return [r.to.id+'|'+r.to.port,x.route];})),accept=acceptItem;
  if(calendars.length)acceptItem=(m,port,item)=>{const ok=accept(m,port,item),id=watch.get(m.id+'|'+port);if(ok&&id)(arrivals[id]??=[]).push(Math.round(simTime*20));return ok;};
  const paced=isComplex?p.actual.proofs.find(w=>w.method==='priority-paced-recipe-calendar'&&w.root==='M49'):null;
  const residual=isComplex?p.actual.proofs.filter(w=>w.method==='element-priority-residual-free-equality'&&w.root==='M50').at(-1):null;
  const send=sendItem,fill=warehouseFillOutputQueue,highSends=[],highRefills=[],lowSends=[];
  if(paced){
   sendItem=(m,st,i,k)=>{const ok=send(m,st,i,k);if(ok&&m.id==='M49')highSends.push(Math.round(simTime*20));if(ok&&m.id==='M50')lowSends.push(Math.round(simTime*20));return ok;};
   warehouseFillOutputQueue=(m,st)=>{const ok=fill(m,st);if(ok&&m.id==='M49')highRefills.push(Math.round(simTime*20));return ok;};
  }
  try{simulateBatchSteps(12000,.05);}finally{acceptItem=accept;sendItem=send;warehouseFillOutputQueue=fill;}
  const pacedCheck=paced&&residual?(()=>{
   const at=(arr,j)=>arr[(j-1)%arr.length]+Math.floor((j-1)/arr.length)*paced.sourceSlots.period;
   const high=highSends.slice(paced.eventualOrdinal-1).every((t,i)=>t===paced.sendFirst+i*paced.sendPeriod);
   const refill=highRefills.every((t,i)=>i+1<paced.refillEventualOrdinal||t>=at(paced.steadyRefillLower,i+1)&&t<=at(paced.steadyRefillUpper,i+1));
   const tail=lowSends.filter(t=>t>=6000),phases=[...new Set(tail.map(t=>t%residual.word.period))].sort((a,b)=>a-b);
   const low=JSON.stringify(phases)===JSON.stringify(residual.word.phases)&&tail.every((t,i)=>i<phases.length||t===tail[i-phases.length]+residual.word.period);
   return {high,refill,low};
  })():null;
  function measureRoutes(seconds){
   const counts={},map=new Map(state.routes.map(r=>[r.from.id+'|'+r.from.port,r.id])),original=sendItem;
   sendItem=(m,st,i,k)=>{const ok=original(m,st,i,k),id=map.get(m.id+'|'+i);if(ok&&id){counts['routeTotal:'+id]=(counts['routeTotal:'+id]||0)+1;counts['flow:'+id+'|'+k]=(counts['flow:'+id+'|'+k]||0)+1;}return ok;};
   try{simulateBatchSteps(seconds*20,.05);}finally{sendItem=original;}
   return counts;
  }
  const calendarChecks=calendars.map(x=>{
   const expected=x.times.flatMap(t=>Array.from({length:Math.max(0,Math.floor((12000-t)/x.period)+1)},(_,i)=>t+i*x.period)).sort((a,b)=>a-b);
   const observed=arrivals[x.route]||[];
   return {route:x.route,count:observed.length,match:JSON.stringify(expected)===JSON.stringify(observed)};
  });
  if(isComplex)simulateBatchSteps((window-600)*20,.05);
  const before=JSON.parse(JSON.stringify(sim)),routeCounts=isComplex?measureRoutes(window):(simulateBatchSteps(12000,.05),null);
  const checks=[];
  if(routeCounts)for(const [key,rate] of Object.entries(p.values)){
   if(rate==null||!key.startsWith('routeTotal:')&&!key.startsWith('flow:'))continue;
   const [n,d=1]=rate.split('/').map(Number);checks.push({query:key,predicted:window*n/d,observed:routeCounts[key]||0});
  }
  for(const [k,v] of Object.entries(p.rows))for(const [field,counter] of [['inflow','inbound'],['outflow','outbound']]){
   if(v[field]==null)continue;
   const [n,d=1]=v[field].split('/').map(Number),predicted=window*n/d;
   const observed=(sim[counter][k]||0)-(before[counter][k]||0);
   checks.push({item:k,field,predicted,observed});
  }
  for(const [key,rate] of Object.entries(p.values)){
   if(!key.startsWith('machineTotal:')||!key.endsWith('|out')||rate==null)continue;
   const id=key.slice(13,-4),m=machineById(id);if(!getRecipe(m)&&m.type!=='仓出')continue;
   const [n,d=1]=rate.split('/').map(Number),predicted=window*n/d;
   const s=sim.byMachine[id],b=before.byMachine[id],sum=x=>Object.values(x).reduce((a,b)=>a+b,0);
   const observed=sum(s.sent)-sum(b.sent);checks.push({machine:id,predicted,observed});
  }
  const relativeChecks=[];
  if(state.machines.length===115){
   const sum=x=>Object.values(x||{}).reduce((a,b)=>a+b,0);
   for(const w of p.actual.proofs.filter(x=>x.method==='relative-splitter-service-last-low')){
    const r=state.routes.find(r=>r.id===w.input),m=machineById(w.machine),[n,d=1]=w.ratio.split('/').map(Number);
    const supplied=sum(sim.byMachine[r.to.id].received)-sum(before.byMachine[r.to.id].received);
    const observed=(sum(sim.byMachine[m.id].sent)-sum(before.byMachine[m.id].sent))/getRecipe(m).qty;
    relativeChecks.push({machine:w.machine,route:w.input,minimum:supplied*n/d,observed});
   }
  }
  const pressureChecks=[];
  if(isComplex){
   // Test-only independent event observer of the *fixed boundary*
   // contract. Warehouse refills read an independent request service
   // instead of ware[]: ready gates always offer; scarce gates use
   // the original proven arrival calendar. No item is added to the
   // actual stock, and no observed count enters the mathematical solve.
   for(const [item,cert] of Object.entries(p.potentialProofs||{})){
    resetSimulation();
    const ready=new Set(cert.ready),spent={},rootFill=warehouseFillOutputQueue;
    const word=new Map(Object.keys(cert.scarce).map(k=>[k,calendars.filter(x=>x.item===k)]));
    warehouseFillOutputQueue=(m,s)=>{
     const k=m.item,q=s.warehouseQueue??[];
     if(!k||q.length>=3||simTime-(s.lastWarehouseFill??0)<PORT_INTERVAL-1e-6)return false;
     if(!ready.has(k)){
      const tick=Math.round(simTime*20),due=(word.get(k)||[]).reduce((n,c)=>n+c.times.reduce((v,t)=>v+Math.max(0,Math.floor((tick-t)/c.period)+1),0),0);
      if((spent[k]||0)>=due)return false;
      spent[k]=(spent[k]||0)+1;
     }
     q.push(k);s.lastWarehouseFill=simTime;sim.outbound[k]=(sim.outbound[k]||0)+1;
     return true;
    };
    try{
     simulateBatchSteps(48000,.05);const before=sim.outbound[item]||0;simulateBatchSteps(24000,.05);
     const [n,d=1]=p.rows[item].withdrawalDemand.split('/').map(Number);
     pressureChecks.push({item,predicted:1200*n/d,observed:(sim.outbound[item]||0)-before});
    }finally{warehouseFillOutputQueue=rootFill;}
   }
  }
  const unlimitedChecks=[];
  const lowerChecks=[];
  if(state.machines.length===115){
   resetSimulation();
   for(const m of state.machines)if(m.type==='仓出'&&m.item)ware[m.item]=100000;
   simulateBatchSteps(window*20,.05);const start=JSON.parse(JSON.stringify(sim)),routes=measureRoutes(window);
   const sum=x=>Object.values(x).reduce((a,b)=>a+b,0);
   for(const [key,rate] of Object.entries(p.unlimited.values)){
    if(rate==null)continue;
    const [n,d=1]=rate.split('/').map(Number),predicted=window*n/d;
    if(key.startsWith('routeTotal:')||key.startsWith('flow:'))unlimitedChecks.push({query:key,predicted,observed:routes[key]||0});
    if(key.startsWith('machineTotal:')&&key.endsWith('|out')){const id=key.slice(13,-4);unlimitedChecks.push({machine:id,predicted,observed:sum(sim.byMachine[id].sent)-sum(start.byMachine[id].sent)});}
   }
   for(const w of p.unlimited.proofs.filter(x=>x.method==='dedicated-ingredient-service-lower')){
    const id=w.machine,m=machineById(id),rec=getRecipe(m),[n,d=1]=w.rate.split('/').map(Number);
    lowerChecks.push({machine:id,minimum:window*n/d*rec.qty,observed:sum(sim.byMachine[id].sent)-sum(start.byMachine[id].sent)});
   }
   for(const w of p.unlimited.proofs.filter(x=>x.method==='bounded-shared-root-tree-equal-slopes')){
    for(let i=0;i<w.stages.length;i++){
     const id=w.stages[i];if(id==null)continue;
     const m=machineById(id),rec=getRecipe(m),[n,d=1]=w.stageRates[i].split('/').map(Number);
     unlimitedChecks.push({machine:id,predicted:window*n/d*rec.qty,observed:sum(sim.byMachine[id].sent)-sum(start.byMachine[id].sent)});
    }
   }
  }
  if(state.machines.length===8||state.machines.length===6){
   resetSimulation();
   for(const m of state.machines)if(m.type==='仓出'&&m.item)ware[m.item]=100000;
   simulateBatchSteps(24000,.05);const start=JSON.parse(JSON.stringify(sim));simulateBatchSteps(12000,.05);
   for(const [k,v] of Object.entries(p.rows))for(const [field,counter] of [['inflow','inbound'],['outflow','outbound']]){
    const rate=p.unlimited.values[field+':'+k];if(rate==null)throw Error('missing '+field+':'+k);
    const [n,d=1]=rate.split('/').map(Number);
    unlimitedChecks.push({item:k,field,predicted:600*n/d,observed:(sim[counter][k]||0)-(start[counter][k]||0)});
   }
   const sum=x=>Object.values(x).reduce((a,b)=>a+b,0);
   for(const m of state.machines){
    const rate=p.unlimited.values['machineTotal:'+m.id+'|out'];if(rate==null)continue;
    const [n,d=1]=rate.split('/').map(Number);
    unlimitedChecks.push({machine:m.id,predicted:600*n/d,observed:sum(sim.byMachine[m.id].sent)-sum(start.byMachine[m.id].sent)});
   }
  }
  return JSON.stringify({pressureChecks,pacedCheck,calendarChecks,cycles:Object.fromEntries(["M24","M33","M34","M35","M87","M88","M106"].map(id=>[id,p.values["cycle:"+id]])),depositContracts:p.actual.depositContracts,rows:p.rows,netLower:p.actual.netLower,gearWithdrawal:p.values['machineTotal:M48|out'],gearCycle:p.values['cycle:M31'],unlimitedQueries:p.unlimited.researchQueries,unlimitedChecks,lowerChecks,relativeChecks,machines:state.machines.length,queries:p.actual.researchQueries,unknownMetrics:p.unknownMetrics.length,alloy:p.rows['合金板'],battery:p.rows['能量电池'],titanium:p.rows['钛合金锭'],gear:p.rows['齿轮组'],elapsedMs:p.elapsedMs,factors:p.actual.rounds.map(x=>x.factors),checks});
 })()`,c));
 if(result.machines===71){assert.equal(result.alloy.net,'19/10');assert.equal(result.alloy.potential,'19/10');assert.equal(result.battery.potential,'3/10');assert(result.queries.known>=368);assert.equal(result.unknownMetrics,0);assert.equal(result.gear.net,'2/3');assert.equal(result.titanium.net,'19/30');assert.equal(result.titanium.potential,'19/30');assert.equal(result.titanium.overdraft,'19/30');}
 if(result.machines===115){assert.equal(result.queries.known,626);assert.equal(result.queries.unknown,0);assert.equal(result.cycles.M106,"11/1440");assert.equal(result.cycles.M24,"11/180");assert.equal(result.cycles.M33,"11/360");assert.equal(result.cycles.M34,"11/720");assert.equal(result.cycles.M35,"1/15");assert.equal(result.cycles.M87,"4/45");assert.equal(result.cycles.M88,"1/15");assert.equal(result.rows["硅晶圆"].net,"1/30");assert.equal(result.rows["钛合金锭"].net,"3/20");assert.equal(result.rows["齿轮组"].net,"47/180");assert.equal(result.rows["能量电池"].net,"7/90");assert.equal(result.rows["导线线圈"].net,"0");assert(result.pacedCheck&&Object.values(result.pacedCheck).every(Boolean),JSON.stringify(result.pacedCheck));assert.equal(result.alloy.outflow,"2/3");assert.equal(result.alloy.net,"0");assert.equal(result.gearWithdrawal,"1");assert.equal(result.gearCycle,"1/2");assert.equal(result.gear.inflow,"1/2");const fraction=x=>{const [n,d=1]=String(x).split("/").map(Number);return n/d;};assert(fraction(result.netLower["钛合金锭"])>=1/120);assert(fraction(result.netLower["齿轮组"])>=7/90);assert(fraction(result.netLower["能量电池"])>=1/189);assert.equal(result.calendarChecks.length,8);assert(result.calendarChecks.every(x=>x.match),JSON.stringify(result.calendarChecks));const alloyCalendar=result.depositContracts.find(x=>x.item==="合金板");assert.deepEqual(alloyCalendar.phases,[20,30,50,120,130,130]);assert.equal(alloyCalendar.rate,"2/3");assert(result.relativeChecks.length>=3);for(const x of result.relativeChecks)assert(x.observed+3>=x.minimum,JSON.stringify(x));assert.equal(result.rows["导线线圈"].inflow,"2/3");assert.equal(result.unknownMetrics,0);assert.equal(result.pressureChecks.length,2);for(const x of result.pressureChecks)assert(Math.abs(x.predicted-x.observed)<=3,JSON.stringify(x));assert.equal(result.alloy.potential,"-2/3");assert.equal(result.rows["导线线圈"].potential,"-4/15");assert.equal(result.unlimitedQueries.known,626);assert.equal(result.unlimitedQueries.unknown,0);assert(result.unlimitedChecks.length>=3);assert(result.lowerChecks.length>=3);for(const x of result.lowerChecks)assert(x.observed+3>=x.minimum,JSON.stringify(x));for(const x of result.unlimitedChecks)assert(Math.abs(x.predicted-x.observed)<=3,JSON.stringify(x));}
 if(result.machines===8||result.machines===6){
  assert.equal(result.queries.unknown,0);assert.equal(result.unlimitedQueries.unknown,0);assert.equal(result.unknownMetrics,0);
  if(result.machines===8){assert.equal(result.rows['合金板'].potential,'-1');assert.equal(result.rows['小行星矿石'].overdraft,'3/4');assert.equal(result.rows['复合装甲板'].overdraft,'1/4');}
  if(result.machines===6){assert.equal(result.rows['太空垃圾'].inflow,'3/2');assert.equal(result.rows['太空垃圾'].outflow,'1/2');assert.equal(result.rows['合金板'].net,'1');}
  for(const x of result.unlimitedChecks)assert(Math.abs(x.predicted-x.observed)<=3,JSON.stringify(x));
 }
 for(const x of result.checks)assert(Math.abs(x.predicted-x.observed)<=3,JSON.stringify(x));
 results.push(result);
}

console.log(JSON.stringify(results.map(r=>({...r,checks:r.checks.length,maxError:Math.max(0,...r.checks.map(x=>Math.abs(x.predicted-x.observed)))}))));
