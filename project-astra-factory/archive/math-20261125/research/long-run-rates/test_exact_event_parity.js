'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveExactEventOrbit:prove}=require('./exact_event_orbit');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'symbolic_physical_spec.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){};let exactTestCounts={};const exactTestSend=sendItem;sendItem=function(m,s,index,item){const ok=exactTestSend(m,s,index,item);if(ok){const id=routeFor(m.id,"out",index).id;for(const k of ["routeTotal:"+id,"flow:"+id+"|"+item])exactTestCounts[k]=(exactTestCounts[k]||0)+1;}return ok;}',c);
const run=s=>vm.runInContext(s,c),read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8'));
const records=[];
function check(name,load,ticks=8000){
 load();
 const spec=JSON.parse(run('JSON.stringify(factoryCompileSymbolicSpec(state))'));
 const p=prove(spec,arith,{diagnosticTicks:ticks,stockFactor:32,ms:20000}),r=prove(spec,arith,{diagnosticTicks:ticks,stockFactor:32,skipIdle:false,ms:20000});
 assert.equal(p.status,'diagnostic-only',JSON.stringify(p));assert.equal(r.status,'diagnostic-only',JSON.stringify(r));
 assert.deepEqual(p.counts,r.counts,name+' exact skipped versus single-frame counts');assert.equal(p.stateKey,r.stateKey,name+' exact skipped versus single-frame state');
 run('exactTestCounts={};resetSimulation();for(let j=0;j<'+ticks+';j++)simulate(.05)');
 const actual=JSON.parse(run('JSON.stringify((()=>{const d={...exactTestCounts};for(const [k,n] of Object.entries(sim.inbound))d["inflow:"+k]=n;for(const [k,n] of Object.entries(sim.outbound))d["outflow:"+k]=n;for(const m of state.machines){const r=getRecipe(m),s=sim.byMachine[m.id];if(r)d["cycle:"+m.id]=((s.sent[r.output]||0)+s.queue.length)/r.qty;}return d;})())'));
 // Constant frozen factories whose products cannot affect scheduling
 // are intentionally eliminated; their duty is proved 1 algebraically.
 const ignored=new Set(spec.frozen.filter(f=>Object.values(f.rates).every(x=>Number(x)>=0)&&!Object.keys(f.rates).some(k=>spec.machines.some(m=>m.type==="仓出"&&m.item===k)||spec.frozen.some(g=>Number(g.rates[k])<0))).flatMap(f=>Object.keys(f.rates).map(k=>'inflow:'+k)));
 const keys=new Set([...Object.keys(p.counts),...Object.keys(actual)]);
 const mismatches=[];
 for(const k of keys)if(/^(routeTotal:|flow:|cycle:|inflow:|outflow:)/.test(k)&&!ignored.has(k)&&Number(p.counts[k]||0)!==(actual[k]||0))mismatches.push([k,p.counts[k]||'0',actual[k]||0]);
 assert.deepEqual(mismatches,[],name+' exact versus HTML finite-frame counts');
 const rec={name,ticks,eventSteps:p.events,singleSteps:r.events,compared:keys.size};records.push(rec);console.log(JSON.stringify(rec));
}
const file=f=>()=>{c.code=fs.readFileSync(path.join(root,f),'utf8').trim();run('state=ast1Decode(code)');};
const layout=l=>()=>{c.layout=l;run('state=layout');};
const f=read('warehouse-service-capacity-results.json');
check('under-supplied blocked warehouse + frozen',layout(f[2].layout),4000);
check('battery + frozen priority',layout(f[3].layout),4000);
check('saturated reconvergence',layout(read('saturated-transfer-regions-results.json').actual.layout),4000);
check('warp72',file('tests/fixtures/ast1-warp-coil-only.txt'),10000);
check('warp73',file('research/long-run-rates/new-warp.ast1.txt'),10000);
check('balance115',file('tests/fixtures/ast1-warehouse-port-balance-v1.txt'),10000);
fs.writeFileSync(path.join(__dirname,'exact-event-parity-results.json'),JSON.stringify(records,null,2));
