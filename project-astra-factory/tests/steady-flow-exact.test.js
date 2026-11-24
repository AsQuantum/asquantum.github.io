'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function setup(){
 const ctx=vm.createContext({console,performance,atob,btoa,document:{getElementById(){return{getContext(){return{}}}}},localStorage:{getItem(){return null},setItem(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),ctx);
 for(const f of ['scripts/data/catalog.js','scripts/core/state.js','scripts/core/machines.js','scripts/core/routing.js','scripts/blueprints/machine-ids.js','scripts/blueprints/item-ids.js','scripts/core/audit.js','scripts/engine/steady-flow.js'])
  vm.runInContext(read(f),ctx,{filename:f});
 vm.runInContext("checkPath=()=>null;DEF.__slow={name:'slow',w:3,h:3,ins:0,outs:1,recipes:{one:{output:'太空垃圾',qty:1,seconds:1.5,inputs:{}}}};DEF.__make={name:'make',w:3,h:3,ins:1,outs:1,recipes:{twenty:{output:'合金板',qty:1,seconds:20,inputs:{'太空垃圾':1}},five:{output:'合金板',qty:1,seconds:5,inputs:{'太空垃圾':1}},fast:{output:'合金板',qty:1,seconds:1,inputs:{'太空垃圾':1}}}}",ctx);
 return ctx;
}
const mat='太空垃圾',product='合金板';
const node=(id,type,mode)=>({id,type,mode,x:0,y:0,face:'E',inletItem:''});
const route=(id,from,to,port=0)=>({id,from:{id:from,port:0},to:{id:to,port},path:[[1,1]]});
function solve(ctx,machines,routes){ctx.layout={name:'proof',machines,routes};return vm.runInContext('state=layout;legacyReferenceWarehouseTheory()',ctx);}
test('rational 1A/s split 19/20 warehouse, 1/20 machine and B warehouse',()=>{
 const c=setup(),m=[node('s','垃圾',0),node('sp','分流'),node('a','仓入'),node('b','__make','twenty'),node('c','仓入')];
 const rs=[route('s0','s','sp'),route('direct','sp','a'),{...route('feed','sp','b'),from:{id:'sp',port:1}},route('result','b','c')];
 const a=solve(c,m,rs);assert.equal(a.error,undefined);
 assert.equal(a.diagnostics.exact,true);assert.equal(a.diagnostics.fractions.routes['direct|'+mat],'19/20');
 assert.equal(a.diagnostics.fractions.routes['feed|'+mat],'1/20');
 assert.equal(a.diagnostics.fractions.routes['result|'+product],'1/20');
 assert.equal(a.diagnostics.fractions.machineCycles.b,'1/20');
 assert.equal(a.inflow[mat],.95);assert.equal(a.inflow[product],.05);
});
test('three equal branches have exact thirds',()=>{
 const c=setup(),ms=[node('s','垃圾',0),node('sp','分流'),node('a','仓入'),node('b','仓入'),node('c','仓入')];
 const rs=[route('r0','s','sp'),...['a','b','c'].map((id,i)=>({...route('r'+(i+1),'sp',id),from:{id:'sp',port:i}}))];
 const r=solve(c,ms,rs);assert.equal(r.error,undefined);
 for(let i=1;i<=3;i++)assert.equal(r.diagnostics.fractions.routes['r'+i+'|'+mat],'1/3');assert.equal(r.inflow[mat],1);
});
test('two unlimited branches and one 1/5 machine allocate exactly 2/5,2/5,1/5',()=>{
 const c=setup(),ms=[node('s','垃圾',0),node('sp','分流'),node('a','仓入'),node('b','仓入'),node('make','__make','five'),node('c','仓入')];
 const rs=[route('r0','s','sp'),...['a','b','make'].map((id,i)=>({...route('r'+(i+1),'sp',id),from:{id:'sp',port:i}})),route('r4','make','c')];
 const a=solve(c,ms,rs);assert.equal(a.error,undefined);
 assert.equal(a.diagnostics.fractions.routes['r1|'+mat],'2/5');assert.equal(a.diagnostics.fractions.routes['r2|'+mat],'2/5');assert.equal(a.diagnostics.fractions.routes['r3|'+mat],'1/5');
});
test('a slower base source remains exactly 2/3 item/s',()=>{
 const c=setup(),ms=[node('s','__slow','one'),node('p','__make','fast'),node('store','仓入')],rs=[route('i','s','p'),route('o','p','store')];
 const a=solve(c,ms,rs);assert.equal(a.error,undefined);
 assert.equal(a.diagnostics.fractions.routes['i|'+mat],'2/3');assert.equal(a.diagnostics.fractions.routes['o|'+product],'2/3');
 assert.equal(a.machineDuty.p,2/3);
});
test('nonexistent extra splitter output does not take supply',()=>{
 const c=setup(),ms=[node('s','垃圾',0),node('sp','分流'),node('store','仓入')],rs=[route('i','s','sp'),route('o','sp','store')];
 const a=solve(c,ms,rs);assert.equal(a.error,undefined);assert.equal(a.inflow[mat],1);
});
test('unsupported shared warehouse and multi-ingredient recipes never claim proof',()=>{
 const c=setup(),ms=[node('withdraw','仓出'),node('store','仓入')];ms[0].item=mat;
 const w=solve(c,ms,[route('w','withdraw','store')]);assert.match(w.diagnostics.unresolvedReason,/共享仓库出口/);assert.equal(Object.keys(w.inflow).length,0);assert.equal(w.diagnostics.certified,false);
 vm.runInContext("DEF.__multi={name:'multi',w:3,h:3,ins:2,outs:1,recipes:{m:{output:'合金板',qty:1,seconds:2,inputs:{'太空垃圾':1,'星尘粒子':1}}}}",c);
 const m=solve(c,[node('s','垃圾',0),node('p','__multi','m'),node('end','仓入')],[route('i','s','p'),route('o','p','end')]);
 assert.match(m.diagnostics.unresolvedReason,/多原料配方/);assert.equal(m.diagnostics.certified,false);
});

test('AST1 complete factory and AST_114 conversion: no unproved material balance is emitted',()=>{
 const c=setup();
 vm.runInContext(read('scripts/core/compact-json.js'),c,{filename:'compact-json.js'});
 vm.runInContext(read('scripts/blueprints/ast1-codec.js'),c,{filename:'ast1-codec.js'});
 c.fixture=fs.readFileSync(path.join(__dirname,'fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 vm.runInContext('state=ast1Decode(fixture)',c);
 const count=vm.runInContext('({machines:state.machines.length,routes:state.routes.length})',c);
 assert.equal(count.machines,115);assert.equal(count.routes,84);
 let result=vm.runInContext('legacyReferenceWarehouseTheory()',c);
 assert.equal(result.diagnostics.certified,false);
 assert.equal(Object.keys(result.inflow).length,0);
 assert.equal(Object.keys(result.outflow).length,0);
 vm.runInContext("(()=>{const m=state.machines.find(x=>x.id==='M114');m.type='采矿';m.mode=1;delete m.item;})()",c);
 result=vm.runInContext('legacyReferenceWarehouseTheory()',c);
 assert.equal(result.diagnostics.certified,false);
 for(const [modes,id] of ['M0','M1','M52','M89'].entries()){
  const fresh=vm.runInContext('ast1Decode(fixture)',c);c.clone=fresh;c.id=id;
  result=vm.runInContext("(()=>{state=clone;state.machines=state.machines.filter(m=>m.id!==id);state.routes=state.routes.filter(r=>r.from.id!==id&&r.to?.id!==id);return legacyReferenceWarehouseTheory()})()",c);
  assert.equal(result.diagnostics.certified,false,'removed '+id+' must not invent theory');
 }
});

test('a splitter with a selected incompatible filtered outlet is not solved as a bypassable zero-capacity branch',()=>{
 const c=setup(),split=node('sp','分流');
 split.outFilters={1:'合金板'};
 const ms=[node('source','垃圾',0),split,node('storeA','仓入'),node('storeB','仓入')];
 const rs=[
  route('feed','source','sp'),
  {...route('out0','sp','storeA'),from:{id:'sp',port:0}},
  {...route('filtered','sp','storeB'),from:{id:'sp',port:1}}
 ];
 const result=solve(c,ms,rs);
 assert.equal(result.diagnostics.certified,false);
 assert.match(result.diagnostics.unresolvedReason,/过滤出口/);
 assert.deepEqual(Object.keys(result.inflow),[]);
 assert.deepEqual(Object.keys(result.routeFlows),[]);
});
