'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function build(){
 const c=vm.createContext({console,atob,btoa,performance,
  document:{hidden:false,getElementById(id){
   if(id==='simSpeed')return {value:'1'};
   return {getContext(){return{}},classList:{add(){},remove(){}},style:{},
    disabled:false,textContent:'',title:''};
  }},requestAnimationFrame(){}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit',
  'engine/steady-flow','engine/simulation','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 vm.runInContext('function warehouseRefresh(){} function warehouseRefreshLive(){} '+
  'function inspectorRefreshLive(){} function stockChartReset(){} '+
  'function stockChartMaybeRefresh(){} function recordWarehouseMovement(){} '+
  'function draw(){} function notify(){}',c);
 c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 return c;
}
test('actual +1-minute button = exactly 1200 physical simulate(.05) calls for AST1',async()=>{
 const c=build();
 vm.runInContext('state=ast1Decode(ast);resetSimulation()',c);
 await vm.runInContext('advanceSimulationMinute()',c);
 const actual=vm.runInContext('JSON.stringify({simTime,ware,sim})',c);
 vm.runInContext('resetSimulation();for(let k=0;k<1200;k++)simulate(.05)',c);
 const direct=vm.runInContext('JSON.stringify({simTime,ware,sim})',c);
 assert.equal(direct,actual);
});

test('variable browser frame lengths and fast-forward yield identical physical state',async()=>{
 const c=build();
 vm.runInContext('state=ast1Decode(ast);resetSimulation()',c);
 await vm.runInContext('advanceSimulationMinute()',c);
 const expected=vm.runInContext('JSON.stringify({simTime,ware,sim})',c);
 vm.runInContext('resetSimulation();let elapsedMs=0,i=0;while(elapsedMs<60000){const ms=Math.min([16,47,11,29,37,83][i++%6],60000-elapsedMs);advanceRealtimeSimulation(ms/1000);elapsedMs+=ms}',c);
 assert.equal(vm.runInContext('JSON.stringify({simTime,ware,sim})',c),expected);
 assert(vm.runInContext('simClockRemainder<1e-8',c));
 vm.runInContext('advanceRealtimeSimulation(.031);resetSimulation();advanceRealtimeSimulation(.019)',c);
 assert.equal(vm.runInContext('simTime',c),0);
 assert(Math.abs(vm.runInContext('simClockRemainder',c)-.019)<1e-8);
});
