// Independent actual 0.05 s discrete simulation. Never enters mathematical solver.
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}},style:{}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation','core/compact-json','blueprints/ast1-codec'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
for(const f of ['compile_exact','direct_algebra','batch_ready_certificate','direct_graph'])vm.runInContext(fs.readFileSync(path.join(__dirname,f+'.js'),'utf8'),c,{filename:f});
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);


const results=[];
for(const dx of [0,1,2,3,4,5,6]){
 c.dx=dx;
 const model=vm.runInContext(`(()=>{
 const a={id:'M0',type:'采矿',x:2,y:5,face:'E',mode:0},b={id:'M1',type:'采矿',x:2+dx,y:12,face:'E',mode:0},r={id:'M2',type:'冶炼',x:18,y:7,face:'E',mode:'钛合金锭'},w={id:'M3',type:'仓入',x:32,y:9,face:'E',mode:''};
 function line(id,from,to,port){
  const p=outPort(from,0),q=inPort(to,port),path=[];
  for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
  for(let y=p.ey+Math.sign(q.ey-p.ey);p.ey!==q.ey&&y!==q.ey+Math.sign(q.ey-p.ey);y+=Math.sign(q.ey-p.ey))path.push([q.ex,y]);
  return {id,from:{id:from.id,port:0},to:{id:to.id,port},path};
 }
 state={name:'double inlet',recordIndexed:true,machines:[a,b,r,w],routes:[line('R0',a,r,0),line('R1',b,r,1),line('R2',r,w,0)]};
 return {errors:state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id)),lengths:state.routes.map(r=>r.path.length)};
})()`,c);
 if(model.errors.some(Boolean))throw Error(JSON.stringify(model));
 const snapshot=()=>vm.runInContext('({a:sim.byMachine.M0.sent["小行星矿石"]||0,b:sim.byMachine.M1.sent["小行星矿石"]||0,w:ware["钛合金锭"]||0})',c);
 for(const reverse of [false,true]){
  vm.runInContext(reverse?'state.routes.reverse();resetSimulation()':'resetSimulation()',c);
  const math=vm.runInContext('factoryDirectTheory({continuousRefill:true})',c);
  if(math.constrained.certificates.length!==1)throw Error('No certificate');
  vm.runInContext('for(let i=0;i<12000;i++)simulate(.05)',c);
  const a=snapshot();
  vm.runInContext('for(let i=0;i<24000;i++)simulate(.05)',c);
  const b=snapshot();
  const row={dx,reverse,lengths:model.lengths,perMinute:Object.fromEntries(Object.keys(a).map(k=>[k,(b[k]-a[k])/20]))};
  row.math={status:math.status,certificates:math.constrained.certificates,left:math.constrained.values['flow:R0|小行星矿石'],right:math.constrained.values['flow:R1|小行星矿石'],cycle:math.constrained.values['cycle:M2']};
  if(row.math.left!=='1/2'||row.math.right!=='1'||row.math.cycle!=='1/2'||row.perMinute.a!==30||row.perMinute.b!==60||row.perMinute.w!==30)throw Error(JSON.stringify(row));
  results.push(row);console.log(JSON.stringify(row));
 }
}
fs.writeFileSync(path.join(__dirname,'direct-refill-phases.json'),JSON.stringify(results,null,2));
