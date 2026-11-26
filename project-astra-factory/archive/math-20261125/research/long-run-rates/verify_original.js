// Independent verification using the original exact BigInt local equations.
// The extra hook exists only in the VM copy of the source, not on disk.
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow','engine/steady-equations','engine/steady-generic-network','engine/steady-auto-fluid']){
 let src=fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8');
 if(f==='engine/steady-auto-fluid'){
  const a="return {status:'compiled',solve,actualLongRunRatesSolved:false,";
  assert(src.includes(a));
  src=src.replace(a,`return {status:'compiled',solve,verifyPoint(s,d,a){
   const sq=s.map(steadyRegionQ),dq=d.map(steadyRegionQ),aq=a.map(steadyRegionQ);
   const v=evaluate(sq,dq,aq,Q);
   const ok=sq.every((x,i)=>!steadyExactCmp(x,v.s[i])&&!steadyExactCmp(dq[i],v.d[i]))&&aq.every((x,i)=>!steadyExactCmp(x,v.a[i]));
   const material=materialRates(sq.map((x,i)=>steadyExactMin(x,dq[i])),Q,true);
   return {ok,flows:Object.fromEntries(lines.map((r,i)=>[r.route,Object.fromEntries(r.materials.map(k=>[k,steadyExactText(material[i].get(k)||STEADY_ZERO)]))]))};
  },actualLongRunRatesSolved:false,`);
 }
 vm.runInContext(src,c,{filename:f});
}
for(const f of process.argv.slice(2)){
 c.code=fs.readFileSync(f,'utf8').trim();c.result=JSON.parse(fs.readFileSync(path.join(__dirname,path.parse(f).name+'.result.json'),'utf8'));
 const v=vm.runInContext(`state=ast1Decode(code);var model=factorySteadyBuildEquations(),compiled=factorySteadyAutomaticFluidModel(state,model);
 compiled.verifyPoint(model.sharedLines.map(r=>result.offers[r.route]),model.sharedLines.map(r=>result.demands[r.route]),activeFrozenFactories(state).map(f=>result.duties[f.id]))`,c);
 assert.equal(v.ok,true);
 for(const [r,items] of Object.entries(v.flows))for(const [k,q] of Object.entries(items))assert.equal(q,c.result.flows[r][k],r+' '+k);
 console.log('EXACT ORIGINAL-EQUATION VERIFICATION PASS',f,Object.keys(v.flows).length);
}
