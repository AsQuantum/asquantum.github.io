'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveWarehouseTreeServiceCaps:caps}=require('./warehouse_priority_tree_proof'),{proveSharedStockService:stock}=require('./shared_stock_proof'),{combine}=require('./combine_count_proofs');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),K='小行星矿石',A='合金板',B='硅晶圆';
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'recipe-tree-results.json'),'utf8')).deep.layout;
Object.assign(base.machines.find(m=>m.id==='M2'),{type:'仓出',item:K});
const records=[];
function graph(l,unlimited=false){c.layout=l;run('state=layout');assert(run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))').every(v=>!v));return JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true,unlimitedWarehouse:'+unlimited+'}))'));}
const f=(id,rates)=>({id,enabled:true,rates});
for(const [v,net] of [['1','1/12'],['11/12','0'],['1/2','0']]){
 const l=structuredClone(base);l.name='blocked warehouse tree and negative frozen '+v;l.frozenFactories=[f('s',{[K]:v}),f('a',{[K]:'-1/4',[B]:'1/4'})];
 const g=graph(l),p=caps(g,arith);assert.equal(p.caps.length,1,JSON.stringify(p));assert.equal(p.caps[0].rate,'2/3');
 const s=stock(g,arith,{},[],{serviceCaps:p.caps});assert.equal(s.pools.find(x=>x.item===K).net,net);
 const r=combine(g,{htmlQueries:true}).result;assert.equal(r.status,'sat');assert.equal(r.unique['net:'+K],net);
 if(v!=='1/2'){assert.equal(r.multiple.length,0,JSON.stringify(r.multiple));assert.equal(r.unique['duty:a'],'1');assert.equal(r.unique['net:'+A],'2/3');}
 else{assert(r.multiple.length>0);assert.equal(r.unique['outflow:'+K],'1/2');}
 run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');
 const snap=()=>JSON.parse(run('JSON.stringify({in:sim.inbound,out:sim.outbound,duty:Object.fromEntries(Object.entries(sim.frozenRuntime).map(([k,v])=>[k,v.activeTime]))})'));
 const x=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const y=snap();
 const actual={net:((y.in[K]||0)-(x.in[K]||0)-(y.out[K]||0)+(x.out[K]||0))/3600,duty:(y.duty.a-x.duty.a)/3600,alloy:((y.in[A]||0)-(x.in[A]||0))/3600};
 const number=v=>{const z=arith.q(v);return Number(z.n)/Number(z.d);};
 assert(Math.abs(actual.net-number(net))<.005,JSON.stringify(actual));
 if(v!=='1/2'){assert(Math.abs(actual.duty-1)<.005);assert(Math.abs(actual.alloy-2/3)<.005);}
 records.push({v,net,unique:Object.keys(r.unique).length,unknown:r.multiple.length,actual,capacity:p.caps[0],stock:s.pools.find(x=>x.item===K),layout:l});
}
// A physical outlet into a slower-than-1/s terminal recipe, with
// independent early and late frozen injections and a negative consumer.
const scrap='废金属',battery='能量电池';
function batteryLayout(v){
 const m=(id,type,x,y,extra={})=>({id,type,x,y,face:'E',...extra}),line=(id,from,to,port,a,b)=>({id,from:{id:from,port:0},to:{id:to,port},path:Array.from({length:b-a+1},(_,i)=>[a+i,11])});
 return {name:'conditional warehouse battery '+v,recordIndexed:true,machines:[m('M0','仓出',2,9,{item:scrap}),m('M1','电池',14,8,{mode:'标准'}),m('M2','仓入',28,9)],routes:[line('R0','M0','M1',0,7,13),line('R1','M1','M2',1,23,27)],frozenFactories:[f('early',{[scrap]:'1/5'}),f('negative',{[scrap]:'-20',[B]:'20'}),f('late',{[scrap]:v})]};
}
const {proveFrozenFiniteComponents:local}=require('./frozen_finite_components');
const low=batteryLayout('1/2'),lg=graph(low),lc=local(lg,arith,{certifyConditionalExits:true});assert.equal(lc.certificates.length,1,JSON.stringify(lc));assert(lc.certificates[0].joint);assert.equal(lc.warehouseBursts[0].outlets[0].rate,'1/2');assert.equal(lc.frozenDuties[0].duty,'1/100');
const lr=combine(lg,{htmlQueries:true}).result;assert.equal(lr.status,'sat');assert.equal(lr.multiple.length,0,JSON.stringify(lr.multiple));assert.equal(lr.unique['net:'+battery],'1/4');
run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');let bi=run('sim.inbound["'+battery+'"]||0'),ad=run('sim.frozenRuntime.negative.activeTime');run('for(let i=0;i<72000;i++)simulate(.05)');assert.equal(run('sim.inbound["'+battery+'"]||0')-bi,900);assert(Math.abs((run('sim.frozenRuntime.negative.activeTime')-ad)/3600-.01)<.001);
records.push({name:'conditionally unblocked warehouse and frozen',unique:Object.keys(lr.unique).length,proof:lc.certificates[0],layout:low});
const high=batteryLayout('1'),hg=graph(high),hc=local(hg,arith,{certifyConditionalExits:true});assert.equal(hc.certificates.length,0,JSON.stringify(hc));assert(hc.refused.some(x=>x.reason.includes('downstream acceptance')));

// Both warehouse roots of a multi-ingredient tree are conditional on
// each other's supply. Never infer a high-stock service contract for one
// when the other may remain starved. Unconditional upper bounds still hold.
const other=structuredClone(base);Object.assign(other.machines.find(m=>m.id==='M0'),{type:'仓出',item:'太空垃圾'});other.frozenFactories=[f('s',{[K]:'1/2','太空垃圾':'1/10'})];
const og=graph(other),op=caps(og,arith),os=stock(og,arith,{},[],{serviceCaps:op.caps});
assert.equal(op.caps.length,2,JSON.stringify(op));assert(!os.pools.some(x=>x.item===K));
fs.writeFileSync(path.join(__dirname,'warehouse-service-capacity-results.json'),JSON.stringify(records,null,2));
console.log(JSON.stringify(records.map(({v,net,unique,unknown,actual,capacity,name,proof})=>({v,net,unique,unknown,actual,capacity,name,proof}))));
