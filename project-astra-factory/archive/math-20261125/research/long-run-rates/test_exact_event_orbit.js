'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveExactEventOrbit:prove}=require('./exact_event_orbit'),{compileCountProofProblem:compile}=require('./count_proof_compile'),{solveFactoredCounts:solve}=require('./count_factored_projection');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
for(const f of ['direct_graph.js','symbolic_physical_spec.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,f),'utf8'),c);
const run=s=>vm.runInContext(s,c);
function check(name,load,unlimited=false,ms=20000){
 load();
 const spec=JSON.parse(run('JSON.stringify(factoryCompileSymbolicSpec(state,{unlimitedWarehouse:'+unlimited+'}))'));
 const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true,unlimitedWarehouse:'+unlimited+'}))'));
 const p=prove(spec,arith,{ms});let a=null;
 if(p.status==='proved'){
  const routes=new Map(g.lines.map(e=>[e.id,e]));
  const routeRates=p.routeRates.filter(r=>routes.get(r.route)?.materials.includes(r.item));
  a=solve(compile(g,arith,{htmlQueries:true,machineRates:p.machineRates,routeRates,frozenDuties:p.frozenDuties}),arith,{ms:10000});
  assert.equal(a.status,'sat',JSON.stringify(a));
 }
 const record={name,unlimited,proof:p,unique:a?.unique??null,unknown:a?.multiple??null};
 console.log(JSON.stringify({name,unlimited,status:p.status,reason:p.reason,prefixTicks:p.prefixTicks,periodSeconds:p.periodSeconds,events:p.events,clock:p.clock,elapsedMs:p.elapsedMs,unique:a&&Object.keys(a.unique).length,unknown:a?.multiple?.length,net:a&&Object.fromEntries(Object.entries(a.unique).filter(([k])=>k.startsWith('net:')))}));
 return record;
}
const loadFile=f=>()=>{c.code=fs.readFileSync(path.join(root,f),'utf8').trim();run('state=ast1Decode(code)');};
const lens=()=>{c.layout=JSON.parse(fs.readFileSync(path.join(__dirname,'saturated-transfer-regions-results.json'),'utf8')).actual.layout;run('state=layout');};
const cases=[['lens',lens,true],['warp72',loadFile('tests/fixtures/ast1-warp-coil-only.txt')],['warp73',loadFile('research/long-run-rates/new-warp.ast1.txt')],['balance115',loadFile('tests/fixtures/ast1-warehouse-port-balance-v1.txt'),false,30000],['balance115-over',loadFile('tests/fixtures/ast1-warehouse-port-balance-v1.txt'),true]];
const selected=process.argv.slice(2);
const results=cases.filter(x=>!selected.length||selected.includes(x[0])).map(x=>check(...x));
fs.writeFileSync(path.join(__dirname,'exact-event-orbit-results'+(selected.length?'-'+selected.join('-'):'')+'.json'),JSON.stringify(results,null,2));
