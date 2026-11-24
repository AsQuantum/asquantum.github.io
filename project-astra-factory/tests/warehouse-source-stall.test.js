'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','scripts/ui/warehouse.js'),'utf8');
test('old potential-net inference is absent from warehouse code',()=>{
 assert(!src.includes('warehousePotentialNet('));
 assert(src.includes('潜在净值'));assert(src.includes('透支净值'));
});
test('unproved theory displays em dashes rather than fabricated zero balances',()=>{
 const warehouse={innerHTML:''},c=vm.createContext({console,theoreticalBudget:{inflow:{},outflow:{},error:'未证明'},
 state:{machines:[{id:'o',type:'仓出',item:'硅晶圆'}]},ware:{},simTime:0,
 sim:{inbound:{},outbound:{},minuteBuckets:[]},MATERIALS:['硅晶圆'],REQUIRED_STOCK:[],
 factoryItemCompare:(a,b)=>a.localeCompare(b),materialColor(){return '#fff'},esc(x){return x},$(id){return id==='warehouse'?warehouse:null}});
 vm.runInContext(src,c);
 const view=vm.runInContext('warehouseView(true)',c);
 assert(view.budget.error);assert.equal(view.materials.length,1);
 assert.equal((view.tRows.match(/—/g)||[]).length,5);
 vm.runInContext('warehouseRefresh()',c);
 assert(warehouse.innerHTML.includes('—'));
 assert(warehouse.innerHTML.includes('潜在净值'));assert(warehouse.innerHTML.includes('透支净值'));
});
