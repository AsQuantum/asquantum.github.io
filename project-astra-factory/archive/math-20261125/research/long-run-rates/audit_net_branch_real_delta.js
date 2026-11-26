'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'../..');
const c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'legal-net-branch.json'))).layout;
c.base=base;
const results=[];
for(const dt of [0.016,0.047]){
 c.dt=dt;
 const r=vm.runInContext(`(()=>{
 state=JSON.parse(JSON.stringify(base));resetSimulation();
 const m=machineById('M4'),s=sim.byMachine.M4,rec=getRecipe(m),left=state.routes.find(r=>r.id==='R1'),right=state.routes.find(r=>r.id==='R3');
 // Instrument only: original functions are unchanged.
 const orig=acceptItem,accepted={left:0,right:0};
 const bins={},starts=[],records=[];let capture=false,first=0,minLeft=Infinity,minRight=Infinity,minInput=Infinity,minOutput=Infinity;
 acceptItem=function(a,p,item){const ok=orig(a,p,item);if(capture&&ok&&a.id===m.id)accepted[p===left.to.port?'left':'right']++;return ok;};
 const warm=600,window=1200,steps=Math.round((warm+window)/dt);
 let snapshot=null;
 for(let i=0;i<steps;i++){
  if(i===Math.round(warm/dt)){capture=true;snapshot={inbound:{...sim.inbound},outbound:{...sim.outbound}};}
  const before=s.busy;
  simulate(dt);
  if(capture&&s.busy>=rec.seconds-1e-8&&before<rec.seconds-1e-8){
   const gap=starts.length?simTime-starts.at(-1):0;
   if(gap>0){const k=gap.toFixed(5);bins[k]=(bins[k]||0)+1;}
   starts.push(simTime);
   const nl=sim.routes.R1.length,nr=sim.routes.R3.length;
   minLeft=Math.min(minLeft,nl);minRight=Math.min(minRight,nr);
   minInput=Math.min(minInput,s.inputs['小行星矿石']||0);minOutput=Math.min(minOutput,s.queue.length);
   if(records.length<10)records.push({time:simTime-warm,gap,left:nl,right:nr,input:s.inputs['小行星矿石'],out:s.queue.length,headLeft:sim.routes.R1[0]?.distance,headRight:sim.routes.R3[0]?.distance});
  }
 }
 acceptItem=orig;
 const diff=(a,b)=>Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(k=>[k,((b[k]||0)-(a[k]||0))/(window/60)]));
 return {dt,inbound:diff(snapshot.inbound,sim.inbound),outbound:diff(snapshot.outbound,sim.outbound),left:accepted.left/(window/60),right:accepted.right/(window/60),starts:starts.length,gaps:bins,minLeft,minRight,minInput,minOutput,records};
 })()`,c,{timeout:90000});
 results.push(r);console.log(JSON.stringify({...r,records:r.records.slice(0,2)}));
}
fs.writeFileSync(path.join(__dirname,'net-branch-real-delta-audit.json'),JSON.stringify(results,null,2));
