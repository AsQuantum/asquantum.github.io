// Independent actual 0.05 s discrete simulation. Never enters mathematical solver.
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}},style:{}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/steady-flow','ui/warehouse','engine/simulation','core/compact-json','blueprints/ast1-codec'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);

const model=vm.runInContext(`(()=>{
 const a={id:'M0',type:'采矿',x:2,y:5,face:'E',mode:0},b={id:'M1',type:'采矿',x:2,y:12,face:'E',mode:0},r={id:'M2',type:'冶炼',x:18,y:7,face:'E',mode:'钛合金锭'},w={id:'M3',type:'仓入',x:32,y:9,face:'E',mode:''};
 function line(id,from,to,port){
  const p=outPort(from,0),q=inPort(to,port),path=[];
  for(let x=p.ex;x<=q.ex;x++)path.push([x,p.ey]);
  for(let y=p.ey+Math.sign(q.ey-p.ey);p.ey!==q.ey&&y!==q.ey+Math.sign(q.ey-p.ey);y+=Math.sign(q.ey-p.ey))path.push([q.ex,y]);
  return {id,from:{id:from.id,port:0},to:{id:to.id,port},path};
 }
 state={name:'double inlet',recordIndexed:true,machines:[a,b,r,w],routes:[line('R0',a,r,0),line('R1',b,r,1),line('R2',r,w,0)]};
 return {errors:state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id)),code:ast1Encode(),lengths:state.routes.map(r=>r.path.length)};
})()`,c);
console.log(JSON.stringify(model));
if(model.errors.some(Boolean))throw Error('Invalid physical layout');
fs.writeFileSync(path.join(__dirname,'double-inlet.ast1.txt'),model.code);
function snapshot(){return vm.runInContext('({a:sim.byMachine.M0.sent["小行星矿石"]||0,b:sim.byMachine.M1.sent["小行星矿石"]||0,w:ware["钛合金锭"]||0})',c);}
const results=[];
for(const reverse of [false,true]){
 vm.runInContext(reverse?'state.routes.reverse();resetSimulation()':'resetSimulation()',c);
 vm.runInContext('for(let i=0;i<12000;i++)simulate(.05)',c);
 const a=snapshot();
 vm.runInContext('for(let i=0;i<72000;i++)simulate(.05)',c);
 const b=snapshot();
 results.push({reverse,perMinute:Object.fromEntries(Object.keys(a).map(k=>[k,(b[k]-a[k])/60])),start:a,end:b});
}
console.log('SIMULATION',JSON.stringify(results));
fs.writeFileSync(path.join(__dirname,'double-inlet.simulation.json'),JSON.stringify(results,null,2));
