'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'..','scripts/ui/warehouse.js'),'utf8');
function env(minutes){
 const c=vm.createContext({
  console,theoreticalBudget:{inflow:{},outflow:{},error:'unproved'},
  state:{machines:[]},ware:{A:3,B:2},simTime:0,
  sim:{inbound:{},outbound:{},minuteBuckets:minutes},
  MATERIALS:['A','B'],REQUIRED_STOCK:[],factoryItemCompare:(a,b)=>a.localeCompare(b),
  materialColor(){return '#abc'},esc(x){return String(x)},
  $(id){return id==='warehouse'?{innerHTML:''}:null}
 });
 vm.runInContext(code,c);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'support/legacy-rate-reference.js'),'utf8'),c);
 return c;
}
function view(c,time){
 c.t=time;
 return vm.runInContext('simTime=t;warehouseView(false)',c);
}
test('actual 10-minute net remains missing (not zero) until first full 600 seconds',()=>{
 const data=Array.from({length:10},()=>({inbound:{A:3},outbound:{A:1}}));
 const c=env(data),v=view(c,599.9);
 assert.equal(v.elapsedMinutes,9);
 assert.equal(v.tenMinuteReady,false);
 c.v=v;
 const markup=vm.runInContext('warehouseActualMarkup(v)',c);
 assert.equal((markup.match(/<td title="尚未累计完整的10分钟窗口">—<\/td>/g)||[]).length,2);
 assert(markup.includes('>净值</th>'));
 assert(markup.split('<details>')[0].includes('>—</td>')||markup.split('<details>')[0].includes('>—</td>'));
 // History remains a minute-by-minute record; only the top net column is gated.
});
test('t=600 uses precisely ten completed minute buckets, reports +2 per minute',()=>{
 const data=Array.from({length:10},()=>({inbound:{A:3},outbound:{A:1}}));
 const c=env(data),v=view(c,600);
 assert.equal(v.elapsedMinutes,10);
 assert.equal(v.tenMinuteReady,true);
 assert.equal(v.tenMinuteTotals.A.inbound,30);
 assert.equal(v.tenMinuteTotals.A.outbound,10);
 c.v=v;
 const markup=vm.runInContext('warehouseActualMarkup(v)',c);
 assert(markup.includes('>+2.00</td>'));
 assert(markup.includes('>0.00</td>'),'idle B has zero after the window exists');
});
test('at t=660 drops minute zero, includes the next COMPLETE idle minute, ignores any partial activity',()=>{
 const data=Array.from({length:11},(_,i)=>i===10?undefined:{inbound:{A:3},outbound:{A:1}});
 data[11]={inbound:{A:100},outbound:{}}; // future and/or incomplete must not enter window
 const c=env(data),v=view(c,660);
 assert.equal(v.elapsedMinutes,11);
 assert.equal(v.tenMinuteTotals.A.inbound,27);
 assert.equal(v.tenMinuteTotals.A.outbound,9);
 assert.equal(v.tenMinuteTotals.A.inbound-v.tenMinuteTotals.A.outbound,18);
});

test('unproved AST1 upper bounds are displayed separately and never replace an unknown theoretical rate',()=>{
 const c=env([]);
 c.proof={error:'未证明',diagnostics:{symbolicModel:{provenUpperBounds:{completed:true,
  machine:{id:'M24',label:'共鸣谐振器（M24）',cycleUpper:'2/15'},
  mixedLines:[{route:'R76',upperSum:'1/2',capacity:'1',strictlyBelowCapacity:true},
   {route:'R81',upperSum:'1/4',capacity:'1',strictlyBelowCapacity:true}]}}}};
 const html=vm.runInContext('warehouseProvenBoundsMarkup(proof)',c);
 assert(html.includes('已证明的数学上界'));
 assert(html.includes('≤ 2/15 轮/秒'));
 assert(html.includes('≤ 1/2 件/秒'));
 assert(!html.includes('>+2.00</td>'),'upper bounds must not masquerade as actual net');
});
