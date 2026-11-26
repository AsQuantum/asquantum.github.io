'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const {arith}=require('./run_direct'),{proveRecipeTree,provePhysicalRecipeTrees}=require('./recipe_tree_proof'),{compileCountProofProblem:compile}=require('./count_proof_compile'),{solveDirectRateProblem:solve}=require('./direct_algebra');
let seed=927341;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;};
function shuffle(xs){for(let i=xs.length-1;i>0;i--){let j=rnd(i+1);[xs[i],xs[j]]=[xs[j],xs[i]];}return xs;}
const report={random:{total:0,proved:0,resourceRefused:0,clockDifference:0,relabel:0,invalidRejected:0},legal:[]};
for(let trial=0;trial<100;trial++){
 const n=2+rnd(6),stages=Array.from({length:n},(_,i)=>({b:1+rnd(2),T:String((5+rnd(46))/20),length:1+rnd(9),to:i===n-1?null:i+1+rnd(n-i-1),a:1+rnd(2)}));
 const p=proveRecipeTree(stages,arith,{clock:'fixed-tick'}),ideal=proveRecipeTree(stages,arith);report.random.total++;
 if(p.status!=='proved'||ideal.status!=='proved'){report.random.resourceRefused++;continue;}
 report.random.proved++;
 const rates=p.stageRates.map(arith.q);
 for(let i=0;i<n;i++){let s=stages[i];if(s.to!==null)assert.equal(arith.cmp(arith.mul(rates[i],arith.q(s.b)),arith.mul(rates[s.to],arith.q(s.a))),0);assert(arith.cmp(rates[i],arith.div(arith.U,arith.q(s.T)))<=0);}
 assert(arith.cmp(arith.q(p.blockTime),arith.q(ideal.blockTime))>=0);
 if(p.blockTime!==ideal.blockTime)report.random.clockDifference++;
 const perm=shuffle(Array.from({length:n},(_,i)=>i)),index=new Map(perm.map((i,j)=>[i,j])),s2=perm.map(i=>({...stages[i],to:stages[i].to===null?null:index.get(stages[i].to)}));
 const r=proveRecipeTree(s2,arith,{clock:'fixed-tick'});assert.equal(r.status,'proved');assert.deepEqual(r.stageRates,perm.map(i=>p.stageRates[i]));report.random.relabel++;
 const graph={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[{item:'out'+(n-1),order:[]}],frozen:[]};
 for(let i=0;i<n;i++){
  const inputs=Object.fromEntries(stages.flatMap((s,j)=>s.to===i?[['out'+j,s.a]]:[]));
  graph.nodes.push({id:'machine-'+(i*17+13),type:'组装',recipe:{output:'out'+i,qty:stages[i].b,seconds:stages[i].T,inputs},physicalInCount:Object.keys(inputs).length,physicalOutCount:1});
 }
 graph.nodes.push({id:'deposit',type:'仓入',physicalInCount:1,physicalOutCount:0});
 for(let i=0;i<n;i++){
  const s=stages[i],to=s.to===null?'deposit':graph.nodes[s.to].id;
  graph.lines.push({id:'belt-'+(i*13+7),from:graph.nodes[i].id,to,fromPort:0,toPort:i,materials:['out'+i],length:s.length,active:true,compatible:true});
 }
 const gp=provePhysicalRecipeTrees(graph,arith,{clock:'fixed-tick'});assert.equal(gp.trees.length,1);for(let i=0;i<n;i++)assert.equal(gp.certificates.find(x=>x.machine===graph.nodes[i].id).rate,p.stageRates[i]);
 const invalid=structuredClone(graph);invalid.lines[rnd(n)].compatible=false;assert.equal(provePhysicalRecipeTrees(invalid,arith,{clock:'fixed-tick'}).trees.length,0);report.random.invalidRejected++;
}
// Real catalog & geometry, different output-belt lengths, independently run HTML.
const root=path.resolve(__dirname,'../..'),c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return{getContext(){return{}},classList:{add(){},remove(){}}}}},requestAnimationFrame(){}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','ui/warehouse','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
vm.runInContext(fs.readFileSync(path.join(__dirname,'direct_graph.js'),'utf8'),c);
vm.runInContext('function warehouseRefresh(){}function draw(){}function stockChartReset(){}function inspectorRefreshLive(){}function warehouseRefreshLive(){}function stockChartRender(){}function stockChartMaybeRefresh(){}function notify(){}',c);
const run=s=>vm.runInContext(s,c),fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'recipe-tree-results.json'),'utf8'));
for(const [base,id,terminal,item] of [[fixtures.layout,'M3','M2','硅晶圆'],[fixtures.deep.layout,'M4','M3','合金板']]){
 for(const dx of [0,1,4,7]){
  const l=structuredClone(base),m=l.machines.find(x=>x.id===id),route=l.routes.find(x=>x.to.id===id);m.x+=dx;
  const [x,y]=route.path.at(-1);for(let i=1;i<=dx;i++)route.path.push([x+i,y]);
  c.layout=l;run('state=layout');assert(run('state.routes.map(r=>checkPath(r.path,r.from,r.to,r.id))').every(v=>!v));
  const g=JSON.parse(run('JSON.stringify(factoryCompileDirectGraph(state,null,{countOnly:true}))')),p=provePhysicalRecipeTrees(g,arith,{clock:'fixed-tick'});assert.equal(p.trees.length,1,JSON.stringify(p));
  const r=solve(compile(g,arith,{machineRates:p.certificates}),arith);assert.equal(r.status,'sat');assert.equal(r.multiple.length,0);
  run('resetSimulation();for(let i=0;i<24000;i++)simulate(.05)');const snap=()=>run('sim.inbound['+JSON.stringify(item)+']||0'),before=snap();run('for(let i=0;i<72000;i++)simulate(.05)');const actual=(snap()-before)/3600,w=arith.q(r.unique['net:'+item]);assert(Math.abs(actual-Number(w.n)/Number(w.d))<.001);
  report.legal.push({machines:g.nodes.length,extraBeltLength:dx,rate:r.unique['net:'+item],actual,scope:p.trees[0].scope});
 }
}
fs.writeFileSync(path.join(__dirname,'proof-generality-audit-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
