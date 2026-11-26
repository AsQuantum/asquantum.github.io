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
test('actual 10-minute income, expense and net remain missing (not zero) until first full 600 seconds',()=>{
 const data=Array.from({length:10},()=>({inbound:{A:3},outbound:{A:1}}));
 const c=env(data),v=view(c,599.9);
 assert.equal(v.elapsedMinutes,9);
 assert.equal(v.tenMinuteReady,false);
 c.v=v;
 const markup=vm.runInContext('warehouseActualMarkup(v)',c);
 assert.equal((markup.match(/<td title="尚未累计完整的10分钟窗口">—<\/td>/g)||[]).length,7);
 assert(markup.includes('>净值</th>'));
 assert(markup.split('<details>')[0].includes('>—</td>')||markup.split('<details>')[0].includes('>—</td>'));
 // History remains a minute-by-minute record; all three top rate columns are gated.
 assert(markup.includes('>总计</td><td>—</td><td>—</td>'));
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

test('all three rates follow the selected complete window; switching never displays invented zeros',()=>{
 const data=Array.from({length:10},(_,i)=>({inbound:{A:i===9?20:10},outbound:{A:i===9?8:2}}));
 data[10]={inbound:{A:999},outbound:{A:999}};
 const c=env(data);
 vm.runInContext('warehouseRefreshLive=()=>{}',c);
 function row(time,window){
  c.t=time;c.window=window;
  const html=vm.runInContext('simTime=t;warehouseSetNetWindow(window);warehouseActualMarkup(warehouseView(false))',c);
  const cells=mat=>[...html.match(new RegExp('<tr data-orch-item="'+mat+'">([\\s\\S]*?)</tr>'))[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m=>m[1]).slice(1);
  const total=[...html.match(/<tr class="ledger-total">([\s\S]*?)<\/tr>/)[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m=>m[1]).slice(1);
  return {a:cells('A'),b:cells('B'),total,html};
 }
 for(const window of [1,10,30,60]){
  const r=row(59.95,window);assert.deepEqual(r.a,['—','—','—','3']);assert.deepEqual(r.b,['—','—','—','2']);assert.deepEqual(r.total,['—','—','—','5']);
 }
 let r=row(600,10);assert.deepEqual(r.a,['11.00','2.60','+8.40','3']);assert.deepEqual(r.b,['0.00','0.00','0.00','2']);assert.deepEqual(r.total,['11.00','2.60','+8.40','5']);
 r=row(600,30);assert.deepEqual(r.a,['—','—','—','3']);assert.deepEqual(r.total,['—','—','—','5']);assert(r.html.includes('第10分钟</td><td>20</td><td>8</td>'));
 r=row(600,1);assert.deepEqual(r.a,['20.00','8.00','+12.00','3']);
 for(const window of [30,60]){
  r=row(window*60-.05,window);assert.deepEqual(r.a,['—','—','—','3']);
  r=row(window*60,window);assert.notEqual(r.a[0],'—');assert.deepEqual(r.b,['0.00','0.00','0.00','2']);
 }
});
test('theory solution chips retain units on timed, cached and partial results',()=>{
 const c=env([]);
 for(const [kind,status,label] of [['mixed','iteration-complete','迭代+精确解'],['iteration','iteration-partial','部分迭代解']]){
  c.b={status,diagnostics:{solutionMethod:{kind},wallElapsedMs:1257,elapsedMs:1,cacheHit:true}};
  assert.equal(vm.runInContext('theorySolutionChip(b)',c),label+' · 用时1.257s · 件/分钟');
 }
 c.b={diagnostics:{solutionMethod:{kind:'analytic'}}};
 assert.equal(vm.runInContext('theorySolutionChip(b)',c),'精确解 · 件/分钟');
});
