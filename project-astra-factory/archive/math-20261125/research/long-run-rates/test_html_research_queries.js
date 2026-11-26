'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {solveHtmlResearchQueries:solve}=require('./html_research_queries');
const {arith}=require('./run_direct'),{compileExactRateProblem:compile}=require('./compile_exact'),{solveDirectRateProblem:algebra}=require('./direct_algebra');
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(root,'scripts/engine/simulation.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'symbolic_physical_spec.js'),'utf8'),c);
const run=s=>vm.runInContext(s,c),read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8')),records=[];
function check(l){
 c.layout=l;run('state=layout');
 const {g,ug,dg}=JSON.parse(run('JSON.stringify(factoryCompileHtmlResearchBundle(state))'));
 const r=solve(g,{unlimitedGraph:ug,demandGraph:dg,ms:10000});
 assert.equal(r.actual,'sat',JSON.stringify({name:l.name,result:r}));
 assert.equal(r.unlimited,'sat');assert.equal(r.demand,'sat');
 // Independent full original conditional model. A value proved constant
 // on the relaxation must agree with every full-model solution if found.
 const f=algebra(compile(dg),arith,{ms:2000});
 if(f.status==='sat')for(const [k,row] of Object.entries(r.rows))if(row.withdrawalDemand!==null)assert.equal(f.unique['withdrawalDemand:'+k],row.withdrawalDemand);
 records.push({name:l.name,status:r.status,actualUnknown:r.unknown.length,metricUnknown:r.unknownMetrics,rows:r.rows,total:r.total,machineTimes:r.machineTimes,proofSources:r.proofSources,orbit:r.orbit,unlimitedOrbit:r.unlimitedOrbit,demandScope:r.demandScope});return {r,g,ug,dg};
}
const K='小行星矿石',A='合金板',B='硅晶圆';
const f=read('warehouse-service-capacity-results.json');
const first=check(f[0].layout).r;assert.equal(first.status,'proved-for-contract');assert.equal(first.rows[K].net,'1/12');assert.equal(first.rows[K].potential,'1/12');assert.equal(first.rows[K].overdraft,'1/12');assert.equal(first.machineTimes.M3,'3');
const critical=check(f[1].layout).r;assert.equal(critical.status,'proved-for-contract');assert.equal(critical.rows[K].net,'0');
const low=check(f[2].layout).r;assert.equal(low.rows[K].net,'0');assert.equal(low.rows[K].potential,'-5/12');assert.equal(low.rows[K].overdraft,'-5/12');assert.equal(low.status,'proved-for-contract');
const bat=check(f[3].layout);assert.equal(bat.r.status,'proved-for-contract');assert.equal(bat.r.rows['废金属'].potential,'-201/10');assert.equal(bat.r.rows['废金属'].overdraft,'-201/10');assert.equal(bat.r.machineTimes.M1,'4');assert.equal(bat.r.machineTimes.M0,'2');
const lens=check(read('saturated-transfer-regions-results.json').actual.layout).r;assert.equal(lens.unknown.length,0);assert.equal(lens.values['routeTotal:R1'],'1/30');assert.equal(lens.machineTimes.M3,'15');assert.equal(lens.status,'proved-for-contract');assert.equal(lens.demandScope,'actual-boundary-conditional-demand');
const multi=check({name:'multi-resource frozen potential envelope',machines:[],routes:[],frozenFactories:[{id:'s',rates:{[K]:'1',[A]:'4'}},{id:'a',rates:{[K]:'-2',[A]:'-2',[B]:'1'}}]}).r;
assert.equal(multi.status,'proved-for-contract');assert.equal(multi.rows[K].withdrawalDemand,'2');assert.equal(multi.rows[A].withdrawalDemand,'1');assert.equal(multi.rows[A].potential,'3');assert.equal(multi.rows[A].overdraft,'2');
const wrong=structuredClone(bat.ug);wrong.lines[0].length++;
const rejected=solve(bat.g,{unlimitedGraph:wrong,demandGraph:bat.dg});assert.equal(rejected.unlimited,'unsupported');assert.equal(rejected.rows['废金属'].overdraft,null);
fs.writeFileSync(path.join(__dirname,'html-research-query-results.json'),JSON.stringify(records,null,2));console.log(JSON.stringify(records.map(({name,status,actualUnknown,metricUnknown,total,machineTimes})=>({name,status,actualUnknown,metricUnknown,total,machineTimes}))));
