'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict'),{solve}=require('./run_direct');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','engine/steady-auto-fluid','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
function run(expr){return vm.runInContext(expr,c);}
const layout=run(`(()=>{
 const m=(id,type,x,y,extra={})=>({id,type,x,y,face:'E',...extra});
 const machines=[m('M0','采矿',2,3,{mode:0}),m('M1','分流',13,5),m('M2','采矿',2,14,{mode:0}),m('M3','仓出',35,22,{item:'合金板'}),m('M4','冶炼',30,12,{mode:'钛合金锭'}),m('M5','仓入',22,1),m('M6','组装',45,12,{mode:'复合装甲板'}),m('M7','仓入',62,13)];
 function line(id,from,out,to,input,waypoints){
  const path=[];
  for(const p of waypoints){
   if(!path.length){path.push(p);continue;}
   const [x,y]=path[path.length-1];if(x!==p[0]&&y!==p[1])throw Error('diagonal');
   let a=x,b=y;while(a!==p[0]||b!==p[1]){a+=Math.sign(p[0]-a);b+=Math.sign(p[1]-b);path.push([a,b]);}
  }return {id,from:{id:'M'+from,port:out},to:{id:'M'+to,port:input},path};
 }
 const routes=[
  line('R0',0,0,1,0,[[7,5],[10,5],[10,6],[12,6]]),
  line('R1',1,0,4,0,[[16,6],[27,6],[27,15],[29,15]]),
  line('R2',1,1,5,0,[[14,4],[14,2],[21,2]]),
  line('R3',2,0,4,1,[[7,16],[29,16]]),
  line('R4',3,0,6,2,[[40,24],[43,24],[43,16],[44,16]]),
  line('R5',4,0,6,1,[[39,15],[44,15]]),line('R6',6,0,7,1,[[56,15],[61,15]])
 ];
 return {name:'Shared input branch (real recipes)',recordIndexed:true,machines,routes,frozenFactories:[{id:'supply',name:'独立供给',enabled:true,rates:{'合金板':'1'}}]};
})()`);
c.layout=layout;
const errors=run('state=layout;state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))');
assert(!errors.some(Boolean),JSON.stringify(errors));
const graph=run(`(()=>{
 const model=factorySteadyBuildEquations(),compiled=factorySteadyAutomaticFluidModel(state,model);
 const frozen=activeFrozenFactories(state),startup=factorySteadyGenericStartupReachability(state,{frozenFactories:frozen});
 return {status:compiled.status,issues:compiled.issues||[],unlimited:false,nodes:state.machines.map(m=>({id:m.id,type:m.type,recipe:getRecipe(m),item:m.item,face:m.face,inputPriority:machineInputPriority(m).map(p=>p.index)})),lines:model.sharedLines.map(r=>({id:r.route,from:r.from.id,to:r.to.id,toPort:r.to.port,fromPort:r.from.port,materials:r.materials,active:!!(startup.potentiallyActiveItemsByRoute[r.route]||[]).length})),pools:model.warehousePools.map(p=>({item:p.item,order:p.withdrawalMachineOrder})),frozen:frozen.map(f=>({...f,reachable:true}))};
})()`);
assert.equal(graph.status,'compiled',JSON.stringify(graph.issues));
const r=solve(graph,'relaxed',5000),fair=solve(graph,'fair',5000),strict=solve(graph,'strict',5000);
assert.equal(r.status,'sat');
console.log('relaxed net',Object.fromEntries(Object.entries(r.unique).filter(([k])=>k.startsWith('net:'))),'multiple',r.multiple.filter(k=>k.startsWith('net:')));
console.log('fair net',Object.fromEntries(Object.entries(fair.witness).filter(([k])=>k.startsWith('net:'))));
console.log('strict net',Object.fromEntries(Object.entries(strict.witness).filter(([k])=>k.startsWith('net:'))));
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
const snap=()=>JSON.parse(run('JSON.stringify({inbound:sim.inbound,outbound:sim.outbound,machines:Object.fromEntries(state.machines.map(m=>[m.id,{sent:sim.byMachine[m.id].sent,received:sim.byMachine[m.id].received}]))})'));
const a=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const b=snap();
const diff=(x,y)=>Object.fromEntries([...new Set([...Object.keys(x),...Object.keys(y)])].map(k=>[k,((y[k]||0)-(x[k]||0))/60]));
const measured={inbound:diff(a.inbound,b.inbound),outbound:diff(a.outbound,b.outbound),machines:Object.fromEntries(Object.keys(a.machines).map(k=>[k,{sent:diff(a.machines[k].sent,b.machines[k].sent),received:diff(a.machines[k].received,b.machines[k].received)}]))};
console.log('actual measured per minute',JSON.stringify(measured));
fs.writeFileSync(path.join(__dirname,'legal-net-branch.json'),JSON.stringify({layout,graph,relaxed:r,fair,strict,measured},null,2));
