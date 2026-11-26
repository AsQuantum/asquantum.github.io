'use strict';
// Validate a supplied AST1 blueprint using the production mathematical solver.
// No simulated time and no blueprint-specific assumptions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),input=process.argv[2]||path.join(__dirname,'fixtures/ast1-warehouse-port-balance-v1.txt');
const c=vm.createContext({console,performance,atob,btoa,document:{getElementById(){return{getContext(){return{}}}}}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','engine/steady-bounds','engine/steady-auto-fluid','core/compact-json','blueprints/ast1-codec'])
 vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
c.code=fs.readFileSync(path.resolve(input),'utf8').trim();
const report=vm.runInContext('state=ast1Decode(code);warehouseTheory()',c);
const solution=report.conditionalBudget;
if(solution?.status!=='conditional-fixed-point'){
 assert.equal(report.diagnostics.certified,false);
 assert.deepEqual(Object.keys(report.routeFlows),[]);
 console.log('UNRESOLVED: '+(report.notice||'No fixed point'));
}else{
 assert(solution.exactLocalEquations);
 const snapshot=vm.runInContext('({machines:state.machines,routes:state.routes})',c);
 const getRecipe=vm.runInContext('getRecipe',c);
 const flow=(route,item)=>(solution.routeFlows[route.id]||{})[item]||0;
 for(const route of snapshot.routes){
  const rates=Object.values(solution.routeFlows[route.id]||{});
  assert(rates.every(v=>v>=0&&Number.isFinite(v)));
  assert(rates.reduce((a,b)=>a+b,0)<=1+1e-10);
 }
 for(const m of snapshot.machines){
  const rec=getRecipe(m);if(!rec)continue;
  const cycles=solution.machineCycles[m.id]||0;
  const incoming=snapshot.routes.filter(r=>r.to?.id===m.id),out=snapshot.routes.filter(r=>r.from.id===m.id);
  assert(Math.abs(out.reduce((sum,r)=>sum+flow(r,rec.output),0)-cycles*rec.qty)<1e-10);
  for(const [item,qty] of Object.entries(rec.inputs||{}))
   assert(Math.abs(incoming.reduce((sum,r)=>sum+flow(r,item),0)-cycles*qty)<1e-10);
 }
 console.log('CONDITIONAL exact mean-rate equations verified: '+snapshot.machines.length+' machines, '+snapshot.routes.length+' belts.');
 console.log(JSON.stringify({inflow:solution.fractions.inflow,outflow:solution.fractions.outflow,potentialNet:solution.fractions.potentialNet,overdraftNet:report.overdraftNet}));
}
