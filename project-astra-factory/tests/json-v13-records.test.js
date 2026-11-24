'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function setup(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const file of ['data/catalog','blueprints/machine-ids','blueprints/item-ids',
  'core/state','core/machines','core/routing','core/audit',
  'core/old','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',file+'.js'),'utf8'),c,{filename:file+'.js'});
 return c;
}
test('v13 JSON uses readable object records and array-index endpoints, never machine/route id fields',()=>{
 const c=setup();
 const x=vm.runInContext("(()=>{state={name:'readable',machines:["+
  "{id:'external-a',type:'垃圾',x:2,y:3,face:'E',mode:0,tag:'A'},"+
  "{id:'external-b',type:'仓入',x:20,y:3,face:'E',mode:''}],"+
  "routes:[{id:'old-r8',from:{id:'external-a',port:0},to:{id:'external-b',port:0},"+
  "path:[[5,6],[6,6],[7,6]],label:'incoming'}]};"+
  "const json=compactFactoryLayout(state);const round=expandCompactFactoryLayout(json);"+
  "return {version:json.version,machines:json.machines,routes:json.routes,"+
  "ids:round.machines.map(x=>x.id),routeIds:round.routes.map(x=>x.id),"+
  "source:round.routes[0].from.id,target:round.routes[0].to.id,label:round.routes[0].label};})()",c);
 assert.equal(x.version,13);
 assert.equal(x.machines[0].type,'垃圾');
 assert.equal(x.machines[0].tag,'A');
 assert.equal(Object.hasOwn(x.machines[0],'id'),false);
 assert.equal(Object.hasOwn(x.routes[0],'id'),false);
 assert.deepEqual(Array.from(x.routes[0].from),[0,0]);
 assert.deepEqual(Array.from(x.routes[0].to),[1,0]);
 assert.deepEqual(Array.from(x.routes[0].path, p=>Array.from(p)),[[5,6],[6,6],[7,6]]);
 assert.deepEqual(Array.from(x.ids),['M0','M1']);
 assert.deepEqual(Array.from(x.routeIds),['R0']);
 assert.equal(x.source,'M0');assert.equal(x.target,'M1');assert.equal(x.label,'incoming');
});
test('v13 ignores obsolete id fields inserted in JSON, but rejects invalid machine indices',()=>{
 const c=setup();
 const x=vm.runInContext("(()=>{const j={format:'factory-lab',version:13,name:'ids ignored',"+
  "machines:[{type:'垃圾',x:3,y:4,face:'E',mode:0,id:'m900'}],"+
  "routes:[{from:[0,0],to:null,path:[[7,6]],id:'r900'}]};"+
  "const first=expandCompactFactoryLayout(j);const valid=[first.machines[0].id,first.routes[0].id];"+
  "j.routes[0].from=[999,0];let rejects=false;try{expandCompactFactoryLayout(j)}catch(e){rejects=true}"+
  "return {valid,rejects}})()",c);
 assert.deepEqual(Array.from(x.valid),['M0','R0']);assert.equal(x.rejects,true);
});
test('old.js imports v12 RLE JSON; current version 13 does not parse legacy array records',()=>{
 const c=setup();
 const x=vm.runInContext("(()=>{const old={format:'factory-lab',version:12,name:'v12',"+
  "machines:[[AST1_ID_BY_TYPE['垃圾'],3,4,0,0],[AST1_ID_BY_TYPE['仓入'],20,4,0,0]],"+
  "routes:[[0,0,1,0,[8,6],[[0,3]],{label:'old belt'}]]};"+
  "let modernRejects=false;try{expandCompactFactoryLayout(old)}catch(e){modernRejects=true}"+
  "const decoded=expandLegacyFactoryLayout(old).layout;state=decoded;synchronizeAst1MachineRecords();"+
  "const v13=compactFactoryLayout(state);return {modernRejects,"+
  "machines:state.machines.map(m=>m.id),routes:state.routes.map(r=>r.id),"+
  "from:state.routes[0].from.id,to:state.routes[0].to.id,"+
  "path:state.routes[0].path,v13:v13.version,label:state.routes[0].label}})()",c);
 assert.equal(x.modernRejects,true);
 assert.deepEqual(Array.from(x.machines),['M0','M1']);
 assert.deepEqual(Array.from(x.routes),['R0']);
 assert.equal(x.from,'M0');assert.equal(x.to,'M1');
 assert.deepEqual(Array.from(x.path,p=>Array.from(p)),[[8,6],[9,6],[10,6],[11,6]]);
 assert.equal(x.v13,13);assert.equal(x.label,'old belt');
});
test('AST1 open belt may be in the middle of route array and retain its R index while shortened',()=>{
 const c=setup();
 c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const x=vm.runInContext("(()=>{state=ast1Decode(ast);"+
  "const r=state.routes[20],oldLength=r.path.length,oldNext=state.routes[21].id;"+
  "r.path=r.path.slice(0,Math.max(1,Math.floor(oldLength/2)));r.to=null;"+
  "synchronizeAst1MachineRecords();"+
  "const saved=ast1Encode(),decoded=ast1Decode(saved),j=compactFactoryLayout(state);"+
  "return {id:r.id,routes:state.routes.length,next:state.routes[21].id,oldNext,"+
  "astOpen:decoded.routes[20].to===null,decodedId:decoded.routes[20].id,"+
  "jsonOpen:j.routes[20].to===null,jsonId:expandCompactFactoryLayout(j).routes[20].id}})()",c);
 assert.equal(x.id,'R20');assert.equal(x.routes,84);
 assert.equal(x.next,x.oldNext);assert.equal(x.next,'R21');
 assert.equal(x.astOpen,true);assert.equal(x.decodedId,'R20');
 assert.equal(x.jsonOpen,true);assert.equal(x.jsonId,'R20');
});
test('AST1 v13 JSON preserves 115 machine records, 84 belt records, and AST1 binary bytes',()=>{
 const c=setup();c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 const x=vm.runInContext("(()=>{state=ast1Decode(ast);const j=compactFactoryLayout(state);"+
  "state=expandCompactFactoryLayout(j);return {m:state.machines.length,r:state.routes.length,"+
  "version:j.version,same:ast1Encode()===ast,allIndices:j.routes.every(r=>"+
  "r.from[0]>=0&&r.from[0]<j.machines.length&&(r.to===null||r.to[0]<j.machines.length))}})()",c);
 assert.equal(x.m,115);assert.equal(x.r,84);assert.equal(x.version,13);
 assert.equal(x.same,true);assert.equal(x.allIndices,true);
});
