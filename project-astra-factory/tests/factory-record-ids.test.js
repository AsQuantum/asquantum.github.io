'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function setup(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit','core/compact-json',
  'blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 return c;
}
test('new blank factory produces M0, M1 and R0, and the record indices compact after deletions',()=>{
 const c=setup(),result=vm.runInContext("(()=>{"+
  "state={name:'blank',recordIndexed:true,machines:[],routes:[]};"+
  "state.machines.push({id:nextFactoryMachineId(),type:'垃圾',x:3,y:5,face:'E',mode:0});"+
  "synchronizeAst1MachineRecords();"+
  "state.machines.push({id:nextFactoryMachineId(),type:'废料',x:20,y:4,face:'E',mode:'标准'});"+
  "synchronizeAst1MachineRecords();"+
  "state.routes.push({id:nextFactoryRouteId(),from:{id:'M0',port:0},to:{id:'M1',port:0},path:[[8,7]]});"+
  "synchronizeAst1MachineRecords();"+
  "const first={m:state.machines.map(m=>m.id),r:state.routes.map(r=>r.id)};"+
  "state.routes.splice(0,1);synchronizeAst1MachineRecords();"+
  "const next=nextFactoryRouteId();"+
  "state.machines.splice(0,1);synchronizeAst1MachineRecords();"+
  "return {first,next,tail:nextFactoryMachineId(),lastMachine:state.machines[0].id};"+
  "})()",c);
 assert.deepEqual(Array.from(result.first.m),['M0','M1']);
 assert.deepEqual(Array.from(result.first.r),['R0']);
 assert.equal(result.next,'R0');
 assert.equal(result.tail,'M1');
 assert.equal(result.lastMachine,'M0');
});
test('v13 JSON save/load uses implicit record indices without stored M/R IDs',()=>{
 const c=setup();
 c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const result=vm.runInContext("(()=>{state=ast1Decode(ast);"+
  "const compact=compactFactoryLayout(state),decoded=expandCompactFactoryLayout(compact);"+
  "const before={version:compact.version,first:decoded.machines[0].id,route:decoded.routes[0].id,hasId:Object.prototype.hasOwnProperty.call(compact.machines[0],'id')||Object.prototype.hasOwnProperty.call(compact.routes[0],'id')};"+
  "state=decoded;synchronizeAst1MachineRecords();"+
  "return {before,m:state.machines[0].id,r:state.routes[0].id,"+
  "last:state.machines.at(-1).id,lastRoute:state.routes.at(-1).id,roundtrip:ast1Encode()===ast};})()",c);
 assert.equal(result.before.version,13);
 assert.equal(result.before.hasId,false);
 assert.equal(result.before.first,'M0');
 assert.equal(result.before.route,'R0');
 assert.equal(result.m,'M0');
 assert.equal(result.r,'R0');
 assert.equal(result.last,'M114');
 assert.equal(result.lastRoute,'R83');
 assert.equal(result.roundtrip,true);
});
test('arbitrary JSON IDs stay stable internally while shown as M/R record positions',()=>{
 const c=setup();
 const result=vm.runInContext("(()=>{state={machines:["+
  "{id:'external-a',type:'垃圾',mode:0,x:1,y:2,face:'E'},"+
  "{id:'external-b',type:'废料',mode:'标准',x:15,y:2,face:'E'}],"+
  "routes:[{id:'external-route',from:{id:'external-a',port:0},"+
  "to:{id:'external-b',port:0},path:[[6,4]]}]};"+
  "const changed=synchronizeAst1MachineRecords();return {changed,"+
  "m:state.machines.map(machineRecordDisplayId),r:state.routes.map(routeRecordDisplayId),"+
  "original:state.machines.map(x=>x.id),from:state.routes[0].from.id};})()",c);
 assert.equal(result.changed,false);
 assert.deepEqual(Array.from(result.m),['M0','M1']);
 assert.deepEqual(Array.from(result.r),['R0']);
 assert.deepEqual(Array.from(result.original),['external-a','external-b']);
 assert.equal(result.from,'external-a');
});
