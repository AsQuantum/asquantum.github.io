'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function env(){
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit',
  'engine/steady-flow','engine/steady-equations','engine/steady-algebra','engine/steady-generic-network',
  'engine/steady-machine-graph','engine/steady-rate-region','engine/steady-auto-fluid','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 return c;
}
const run=(c,s)=>vm.runInContext(s,c);
const m=(id,type,mode=0,extra={})=>({id,type,mode,x:0,y:0,face:'E',...extra});
const r=(id,from,to,out=0,input=0)=>({id,from:{id:from,port:out},to:{id:to,port:input},path:[[0,0]]});
function setup(c,ms,rs){
 c.layout={machines:ms,routes:rs};
 run(c,'state=layout;checkPath=()=>null;DEF.__slow={w:3,h:3,ins:0,outs:1,recipes:{run:{output:"合金板",qty:1,seconds:5,inputs:{}}}};DEF.__source={w:3,h:3,ins:0,outs:1,recipes:{run:{output:"合金板",qty:1,seconds:1,inputs:{}}}};DEF.__need={w:3,h:3,ins:1,outs:1,recipes:{run:{output:"硅晶圆",qty:1,seconds:5,inputs:{"合金板":1}}}};DEF.__multi={w:3,h:3,ins:2,outs:1,recipes:{run:{output:"硅晶圆",qty:1,seconds:2,inputs:{"合金板":2,"星尘粒子":1}}}}');
}
function solve(c,ms,rs){
 setup(c,ms,rs);return run(c,'factorySteadyAutomaticFluidBudget()');
}

function frozenEnv(){
 const c=env();
 const elements=new Map();
 Object.assign(c,{window:{addEventListener(){}},document:{addEventListener(){},hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,{getContext(){return{}},classList:{add(){},remove(){}},style:{},addEventListener(){}});return elements.get(id);}},requestAnimationFrame(){},localStorage:{setItem(){},getItem(){return null}}});
 for(const f of ['ui/warehouse','engine/simulation','core/editor','core/layout-io','core/old','ui/presets','ui/frozen-factories'])
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 run(c,"warehouseRefresh=()=>{};function draw(){};notify=()=>{};function stockChartReset(){}function refresh(){}function updateGroupControls(){}function clearGroupSelection(){}");
 return c;
}
function config(id,rates,enabled=true){return {id,name:id,enabled,rates};}
function freeze(c,sources){c.sources=sources;run(c,'state.frozenFactories=normalizeFrozenFactories(sources)');}
function budget(c){const b=run(c,'warehouseTheory()');assert.equal(b.status,'conditional-fixed-point',JSON.stringify(b.conditionalBudget));return b;}
test('external sources feed physical warehouse outlets and local net snapshot excludes their contributions',()=>{
 const c=frozenEnv();setup(c,[m('out','仓出',0,{item:'合金板'}),m('recipe','__need','run'),m('wh','仓入')],[r('a','out','recipe'),r('b','recipe','wh')]);
 freeze(c,[config('a',{'合金板':'1/10'})]);
 const b=budget(c),x=b.conditionalBudget;
 assert.equal(x.fractions.machineCycles.recipe,'1/10');
 assert.equal(x.fractions.frozenDuty.a,'1');
 assert.equal(x.fractions.inflow['合金板'],'1/10');assert.equal(x.fractions.outflow['合金板'],'1/10');
 assert.equal(x.fractions.inflow['硅晶圆'],'1/10');
 const f=run(c,"frozenSnapshot(warehouseTheory(),'local')");
 assert.equal(f.rates['合金板'],'-1/10');assert.equal(f.rates['硅晶圆'],'1/10');
 assert.equal(b.unlimitedStockBudget.fractions.machineCycles.recipe,'1/5');
});
test('independent duty factors, multi-input bottleneck, priority and potential demand',()=>{
 const c=frozenEnv();setup(c,[],[]);
 freeze(c,[config('producer',{'合金板':'1','能量电池':'1/2'}),config('first',{'合金板':'-2','能量电池':'-1/2','硅晶圆':'4'}),config('second',{'能量电池':'-1/2','曲速线圈':'1'})]);
 const b=budget(c),x=b.conditionalBudget;
 assert.equal(x.fractions.frozenDuty.first,'1/2');assert.equal(x.fractions.frozenDuty.second,'1/2');
 assert.equal(x.fractions.inflow['硅晶圆'],'2');assert.equal(x.fractions.inflow['曲速线圈'],'1/2');
 assert.equal(x.fractions.potentialNet['合金板'],'-1');assert.equal(x.fractions.potentialNet['能量电池'],'-1/4');
 assert.equal(b.unlimitedStockBudget.fractions.frozenDuty.first,'1');assert.equal(b.unlimitedStockBudget.fractions.frozenDuty.second,'1');
 assert.equal(b.overdraftNet['合金板'],-1);
});
test('an empty unseeded external production cycle cannot start; disabled factory has no contribution',()=>{
 const c=frozenEnv();setup(c,[],[]);
 freeze(c,[config('a',{'合金板':'-1','硅晶圆':'2'}),config('b',{'硅晶圆':'-1','合金板':'2'}),config('c',{'合金板':'100'},false)]);
 const x=budget(c).conditionalBudget;
 assert.equal(x.fractions.frozenDuty.a,'0');assert.equal(x.fractions.frozenDuty.b,'0');assert(!Object.hasOwn(x.frozenDuty,'c'));
 assert.equal(x.fractions.inflow['合金板'],'0');
});
test('whole-source simulation stops every rate on shortage and resumes with no backlog',()=>{
 const c=frozenEnv();setup(c,[],[]);freeze(c,[config('a',{'合金板':'-1','能量电池':'-1','硅晶圆':'2'})]);
 const x=run(c,"(()=>{resetSimulation();ware={'合金板':10};for(let i=0;i<200;i++)simulate(.05);const blocked={stock:{...ware},r:{...sim.frozenRuntime.a},in:{...sim.inbound}};ware['能量电池']=2;for(let i=0;i<200;i++)simulate(.05);return {blocked,ware,received:sim.inbound,sent:sim.outbound,active:sim.frozenRuntime.a.activeTime,history:sim.minuteBuckets[0]};})()");
 assert.equal(x.blocked.stock['合金板'],10);assert.deepEqual([...x.blocked.r.blocked],['能量电池']);assert.equal(x.blocked.in['硅晶圆'],undefined);
 assert.equal(x.ware['合金板'],8);assert.equal(x.ware['能量电池'],0);assert.equal(x.ware['硅晶圆'],4);
 assert.equal(x.received['硅晶圆'],4);assert.equal(x.sent['合金板'],2);assert.equal(x.history.outbound['能量电池'],2);assert(Math.abs(x.active-2)<1e-8);
});
test('long-run frozen duty and integer warehouse counts match the constrained rate model',()=>{
 const c=frozenEnv();setup(c,[],[]);freeze(c,[config('supply',{'合金板':'1'}),config('consume',{'合金板':'-2','硅晶圆':'4'})]);
 const b=budget(c).conditionalBudget;
 assert.equal(b.fractions.frozenDuty.consume,'1/2');assert.equal(b.fractions.inflow['硅晶圆'],'2');
 const x=run(c,"(()=>{resetSimulation();for(let i=0;i<2400;i++)simulate(.05);const a={...sim.inbound},o={...sim.outbound};for(let i=0;i<72000;i++)simulate(.05);return {output:sim.inbound['硅晶圆']-a['硅晶圆'],input:sim.outbound['合金板']-o['合金板'],ware};})()");
 assert.equal(x.output,7200);assert.equal(x.input,3600);assert(x.ware['合金板']>=0);
});
test('current physical outlet refills precede frozen demand; no input stops the whole frozen configuration',()=>{
 const c=frozenEnv();setup(c,[m('M10','仓出',0,{item:'合金板'}),m('M2','仓出',0,{item:'合金板'})],[]);
 freeze(c,[config('a',{'合金板':'-20','能量电池':'-20','硅晶圆':'20'})]);
 const x=run(c,"(()=>{resetSimulation();simTime=.95;ware={'合金板':1,'能量电池':5};simulate(.05);return {stock:{...ware},first:sim.byMachine.M2.warehouseQueue.length,second:sim.byMachine.M10.warehouseQueue.length,active:sim.frozenRuntime.a.activeTime,blocked:sim.frozenRuntime.a.blocked,out:{...sim.outbound},in:{...sim.inbound}};})()");
 assert.equal(x.first,1);assert.equal(x.second,0);assert.equal(x.stock['合金板'],0);assert.equal(x.stock['能量电池'],5);
 assert.equal(x.active,0);assert.deepEqual([...x.blocked],['合金板']);assert.equal(x.out['合金板'],1);assert.equal(x.in['硅晶圆'],undefined);
 const y=run(c,"(()=>{ware['合金板']=1;simulate(.05);return {stock:{...ware},first:sim.byMachine.M2.warehouseQueue.length,second:sim.byMachine.M10.warehouseQueue.length,active:sim.frozenRuntime.a.activeTime};})()");
 // M10 has not refilled yet, so it takes the next available item first.
 assert.equal(y.first,1);assert.equal(y.second,1);assert.equal(y.active,0);
 const z=run(c,"(()=>{ware['合金板']=1;simulate(.05);return {stock:{...ware},active:sim.frozenRuntime.a.activeTime};})()");
 assert.equal(z.stock['能量电池'],4);assert.equal(z.stock['硅晶圆'],1);assert.equal(z.active,.05);
});
test('scheme JSON preserves exact signed fractions, AST1 intentionally ignores metadata',()=>{
 const c=frozenEnv();c.ast=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warp-coil-only.txt'),'utf8').trim();
 run(c,'state=ast1Decode(ast)');freeze(c,[config('a',{'合金板':'1/7','曲速线圈':'-1/128'}),config('b',{'硅晶圆':'1/9'},false)]);
 const x=run(c,"(()=>{const encoded=encodeScheme(),json=compactFactoryJSON(),restored=expandCompactFactoryLayout(JSON.parse(json)),astOut=ast1Encode();return {encoded:!!encoded.json,restored:restored.frozenFactories,astEqual:astOut===ast,astConfig:ast1Decode(astOut).frozenFactories}})()");
 assert(x.encoded);assert(x.astEqual);assert.equal(x.astConfig,undefined);assert.equal(x.restored[0].rates['合金板'],'1/7');assert.equal(x.restored[0].rates['曲速线圈'],'-1/128');assert.equal(x.restored[1].enabled,false);
});
test('invalid configurations fail without modifying the scheme, rates keep exact precision',()=>{
 const c=frozenEnv();setup(c,[],[]);
 assert.throws(()=>run(c,"normalizeFrozenFactories([{name:'invalid',rates:{'合金板':'NaN'}}])"),/流速无效/);
 assert.equal(run(c,"frozenFromMinute('1/3')"),'1/180');
 assert.equal(run(c,"frozenMinuteRate('-1/128')"),'-15/32');
 assert.equal(run(c,"frozenDisplayMinute('-1/128')"),'-0.46875');
 assert.equal(run(c,"frozenDisplayMinute('1/7')"),'60/7');
});

test('reset invalidates frozen configuration cache even when the array identity is unchanged',()=>{
 const c=frozenEnv();setup(c,[],[]);freeze(c,[config('a',{'合金板':'1'})]);
 run(c,'resetSimulation();for(let i=0;i<40;i++)simulate(.05)');
 assert.equal(run(c,"ware['合金板']"),2);
 run(c,"state.frozenFactories[0].rates['合金板']='2';state.frozenFactories.push({id:'b',rates:{'硅晶圆':'1'}});resetSimulation();for(let i=0;i<40;i++)simulate(.05)");
 assert.equal(run(c,"ware['合金板']"),4);assert.equal(run(c,"ware['硅晶圆']"),2);
});
