'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {solveHtmlResearchQueries:solve}=require('./html_research_queries');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
for(const f of ['direct_graph.js','symbolic_physical_spec.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,f),'utf8'),c);
const run=s=>vm.runInContext(s,c),results=[];
for(const [name,file] of [['warp72','tests/fixtures/ast1-warp-coil-only.txt'],['warp73','research/long-run-rates/new-warp.ast1.txt'],['balance115','tests/fixtures/ast1-warehouse-port-balance-v1.txt']]){
 c.code=fs.readFileSync(path.join(root,file),'utf8').trim();run('state=ast1Decode(code)');
 const {g,ug,dg}=JSON.parse(run('JSON.stringify(factoryCompileHtmlResearchBundle(state))'));
 const start=performance.now(),r=solve(g,{unlimitedGraph:ug,demandGraph:dg,ms:20000});
 const row={name,machines:g.nodes.length,lines:g.lines.length,elapsedMs:Math.round(performance.now()-start),...r};
 results.push(row);console.log(JSON.stringify({name,status:r.status,elapsedMs:row.elapsedMs,actualQueries:Object.keys(r.values).length,actualUnknown:r.unknown.length,unknownMetrics:r.unknownMetrics,demandScope:r.demandScope,orbit:r.orbit,unlimitedOrbit:r.unlimitedOrbit,rows:r.rows,total:r.total}));
}
fs.writeFileSync(path.join(__dirname,'html-large-exact-results.json'),JSON.stringify(results,null,2));
