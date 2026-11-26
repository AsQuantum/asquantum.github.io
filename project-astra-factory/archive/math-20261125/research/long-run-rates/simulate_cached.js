// Independent actual 0.05 s discrete simulation. Never enters mathematical solver.
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}},style:{}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/steady-flow','ui/warehouse','engine/simulation','core/compact-json','blueprints/ast1-codec'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
c.ast=fs.readFileSync(process.argv[2],'utf8').trim();
vm.runInContext('state=ast1Decode(ast);resetSimulation()',c);
vm.runInContext(`{
 const ms=new Map(state.machines.map(m=>[m.id,m])),rs=new Map();
 for(const r of state.routes){rs.set(r.from.id+'|out|'+r.from.port,r);if(r.to)rs.set(r.to.id+'|in|'+r.to.port,r);}
 const oldRecipe=getRecipe,oldPorts=getPorts,oldAccept=acceptsMaterial,rc=new Map(),pc=new Map(),ac=new Map();
 for(const m of state.machines){rc.set(m,oldRecipe(m));pc.set(m,oldPorts(m));}
 machineById=id=>ms.get(id);
 routeFor=(id,kind,index)=>rs.get(id+'|'+kind+'|'+index);
 getRecipe=m=>rc.has(m)?rc.get(m):oldRecipe(m);
 getPorts=m=>pc.has(m)?pc.get(m):oldPorts(m);
 acceptsMaterial=(m,item,idx)=>{if(!m)return false;const key=m.id+'|'+item+'|'+idx;if(!ac.has(key))ac.set(key,oldAccept(m,item,idx));return ac.get(key);};
}`,c);

const frames=[];const minutes=Number(process.argv[3]||180),t0=performance.now();
function capture(minute){
 const s=JSON.parse(vm.runInContext('JSON.stringify({inbound:sim.inbound,outbound:sim.outbound,crafts:sim.crafts,machines:Object.fromEntries(state.machines.map(m=>[m.id,{sent:sim.byMachine[m.id].sent,received:sim.byMachine[m.id].received}]))})',c));
 frames.push({minute,...s});
 fs.writeFileSync(path.join(__dirname,'new-warp.cached-simulation.json'),JSON.stringify({elapsed_s:(performance.now()-t0)/1000,frames},null,2));
 console.log('simulation',minute,'minutes, warehouse',JSON.stringify(s.inbound),'wall s',((performance.now()-t0)/1000).toFixed(2));
}
capture(0);
for(let m=1;m<=minutes;m++){vm.runInContext('for(let i=0;i<1200;i++)simulate(.05)',c);if(m%30===0||m===minutes)capture(m);}
