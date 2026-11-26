'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {ctx,run,arith,root,compileCountProofProblem,projectCountInterval,proveSaturatedRouterCounts}=require('../support/production');
function graph(){
 const g={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[],frozen:[],unlimited:false};
 const m=(id,type,recipe)=>g.nodes.push({id,type,recipe,physicalInCount:0,physicalOutCount:0});
 const e=(id,from,to,materials,fp=0,tp=0,length=3)=>{g.lines.push({id,from,to,materials,rawMaterials:materials.slice(),acceptedMaterials:materials.slice(),fromPort:fp,toPort:tp,length,active:true,compatible:materials.length===1});g.nodes.find(x=>x.id===from).physicalOutCount++;g.nodes.find(x=>x.id===to).physicalInCount++;};
 m('a','生产',{inputs:{},output:'A',qty:1,seconds:1});m('b','生产',{inputs:{},output:'B',qty:1,seconds:1});
 m('merge','汇流');m('split','分流');m('w1','仓入');m('w2','仓入');
 e('a','a','merge',['A']);e('b','b','merge',['B'],0,1);e('mid','merge','split',['A','B']);e('left','split','w1',['A','B']);e('right','split','w2',['A','B'],1);
 return g;
}
function proof(g){ctx.g=g;return JSON.parse(run('JSON.stringify(proveFreeSplitterElementLaw(g,factoryDirectArithmetic()))'));}
test('unfiltered mixed splitter has exact total division but not per-material division',()=>{
 const g=graph(),p=proof(g);assert.equal(p.relations.length,2);
 const r=compileCountProofProblem(g,arith,{rateRelations:[...p.relations,{proven:true,ruleVersion:'real-outlet-buffer-20261125',sense:'eq',coefficients:{'routeTotal:mid':1},constant:'1'}]});
 for(const id of ['left','right']){const x=projectCountInterval(r,arith,'routeTotal:'+id);assert.equal(x.lower,'1/2');assert.equal(x.upper,'1/2');}
 const x=projectCountInterval(r,arith,'flow:left|A');assert.notEqual(x.lower,x.upper);
 const bad=structuredClone(g);bad.lines.find(e=>e.id==='right').acceptedMaterials=['B'];assert.equal(proof(bad).relations.length,0);
 const loop=structuredClone(g);loop.nodes.find(m=>m.id==='w2').type='汇流';assert.equal(proof(loop).relations.length,0);
 const filtered=structuredClone(g);filtered.lines.find(e=>e.id==='right').outFilter='B';assert.equal(proof(filtered).relations.length,0);
});
test('ordered word formula uses gcd/lcm, not material mean proportions',()=>{
 const f=(w,n,p)=>JSON.parse(run('JSON.stringify(elementRoundRobinWord('+JSON.stringify(w)+','+n+','+p+'))'));
 assert.deepEqual(f(['A','B'],2,0),{length:2,counts:[{A:1},{B:1}]});
 assert.deepEqual(f(['A','B'],2,1),{length:2,counts:[{B:1},{A:1}]});
 assert.deepEqual(f(['A','B'],3,0),{length:6,counts:[{A:1,B:1},{B:1,A:1},{A:1,B:1}]});
 assert.deepEqual(f(['A','A','B'],2,0),{length:6,counts:[{A:2,B:1},{A:2,B:1}]});
});
function observe(swap,ports=2,calendar=null){
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return{}}}:null}},warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const f of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 c.swap=swap;c.ports=ports;c.calendar=calendar;
 return JSON.parse(vm.runInContext(`(()=>{
  DEF.testA={w:5,h:5,ins:0,outs:1,recipes:{run:{inputs:{},output:'A',qty:1,seconds:calendar?.period||1}}};
  DEF.testB={w:5,h:5,ins:0,outs:1,recipes:{run:{inputs:{},output:'B',qty:1,seconds:calendar?.period||1}}};
  const machines=[{id:'a',type:'testA',mode:'run',x:5,y:5,face:'E'},{id:'b',type:'testB',mode:'run',x:5,y:15,face:'E'},{id:'merge',type:'汇流',x:20,y:10,face:'E'},{id:'split',type:'分流',x:35,y:10,face:'E'}];
  const routes=[];
  function edge(id,from,to,fp,tp,length){routes.push({id,from:{id:from,port:fp},to:{id:to,port:tp},path:Array.from({length},(_,i)=>[i+1,10])});}
  edge('a','a','merge',0,swap?1:0,calendar?.a||3);edge('b','b','merge',0,swap?0:1,calendar?.b||3);edge('mid','merge','split',0,0,5);
  for(let i=0;i<ports;i++){machines.push({id:'w'+i,type:'仓入',x:55,y:5+i*10,face:'E'});edge('out'+i,'split','w'+i,i,0,3);}
  state={machines,routes};resetSimulation();simulateBatchSteps(12000,.05);const before=JSON.parse(JSON.stringify(sim));
  simulateBatchSteps(12000,.05);
  const count=id=>Object.fromEntries(['A','B'].map(k=>[k,(sim.byMachine[id].received[k]||0)-(before.byMachine[id].received[k]||0)]));
  return JSON.stringify({input:count('split'),outputs:Array.from({length:ports},(_,i)=>count('w'+i))});
 })()`,c));
}
test('actual FIFO and RR preserve alternating word; swapping upstream ports changes material allocation',()=>{
 const a=observe(false),b=observe(true),c=observe(false,3);
 console.log('element counterexample',JSON.stringify({a,b,c}));
 for(const r of [a,b,c]){assert(Math.abs(r.input.A-300)<=1);assert(Math.abs(r.input.B-300)<=1);}
 for(const r of [a,b])for(const out of r.outputs){assert(Math.abs(out.A+out.B-300)<=1);assert(Math.min(out.A,out.B)<=1);}
 assert(a.outputs[0].A>=299&&b.outputs[0].B>=299||a.outputs[0].B>=299&&b.outputs[0].A>=299);
 for(const o of c.outputs){assert(Math.abs(o.A-100)<=1);assert(Math.abs(o.B-100)<=1);}
});

function splitGraph(spec){
 const g={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[],frozen:[],unlimited:false};
 const m=(id,type,recipe)=>g.nodes.push({id,type,recipe,physicalInCount:0,physicalOutCount:0});
 const e=(id,from,to,k,fp=0,length=3)=>{g.lines.push({id,from,to,materials:[k],rawMaterials:[k],acceptedMaterials:[k],fromPort:fp,toPort:0,length,active:true,compatible:true});g.nodes.find(x=>x.id===from).physicalOutCount++;g.nodes.find(x=>x.id===to).physicalInCount++;};
 m('source','生产',{inputs:{},output:'ore',qty:spec.b,seconds:spec.h});m('split','分流');
 e('root','source','split','ore',0,spec.length||1);
 spec.branches.forEach((d,i)=>{
  m('w'+i,'仓入');if(!d)e('r'+i,'split','w'+i,'ore',i,spec.length||1);
  else {m('p'+i,'生产',{inputs:{ore:d.a},output:'x'+i,qty:1,seconds:d.T});e('r'+i,'split','p'+i,'ore',i,spec.length||1);e('out'+i,'p'+i,'w'+i,'x'+i,0,spec.length||1);}
 });
 return g;
}
function periodicProof(spec){
 ctx.g=splitGraph(spec);return JSON.parse(run('JSON.stringify(provePeriodicSplitterElementLaw(g,factoryDirectArithmetic()))'));
}
function observeSplit(spec){
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return{}}}:null}},warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const f of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 c.spec=spec;
 return JSON.parse(vm.runInContext(`(()=>{
  DEF.testSource={w:5,h:5,ins:0,outs:1,recipes:{run:{inputs:{},output:'ore',qty:spec.b,seconds:spec.h}}};
  const machines=[{id:'source',type:'testSource',mode:'run',x:5,y:5,face:'E'},{id:'split',type:'分流',x:20,y:10,face:'E'}],routes=[];
  function edge(id,from,to,fp){routes.push({id,from:{id:from,port:fp},to:{id:to,port:0},path:Array.from({length:spec.length||1},(_,i)=>[i+1,10])});}
  edge('root','source','split',0);
  spec.branches.forEach((d,i)=>{
   machines.push({id:'w'+i,type:'仓入',x:55,y:5+i*10,face:'E'});
   if(!d)edge('r'+i,'split','w'+i,i);
   else {const type='test'+i;DEF[type]={w:5,h:5,ins:1,outs:1,recipes:{run:{inputs:{ore:d.a},output:'x'+i,qty:1,seconds:d.T}}};machines.push({id:'p'+i,type,mode:'run',x:35,y:5+i*10,face:'E'});edge('r'+i,'split','p'+i,i);edge('out'+i,'p'+i,'w'+i,0);}
  });
  state={machines,routes};resetSimulation();simulateBatchSteps(24000,.05);
  const before=JSON.parse(JSON.stringify(sim));const seconds=spec.window||600;
  simulateBatchSteps(seconds*20,.05);
  const received=id=>(sim.byMachine[id].received.ore||0)-(before.byMachine[id].received.ore||0);
  return JSON.stringify({seconds,input:received('split'),outputs:spec.branches.map((d,i)=>received((d?'p':'w')+i))});
 })()`,c));
}
test('periodic unit supply water level is exact under explicit slow and fast branch contracts',()=>{
 const cases=[
  [{b:1,h:1,branches:[null,{a:1,T:10}]},['9/10','1/10']],
  [{b:1,h:1,branches:[null,{a:2,T:3}]},['1/2','1/2']],
  [{b:1,h:2,branches:[null,{a:1,T:10},null]},['1/5','1/10','1/5']],
  [{b:1,h:1,branches:[null,{a:1,T:10},{a:2,T:4}]},['9/20','1/10','9/20']],
  [{b:1,h:1,branches:[null,{a:1,T:6},{a:1,T:10}]},['11/15','1/6','1/10']]
 ];
 for(const [spec,expected] of cases)for(const length of [1,13]){
  const x={...spec,length},p=periodicProof(x);
  assert.equal(p.witnesses.length,1,JSON.stringify(x));
  assert.deepEqual(Object.values(p.witnesses[0].rates),expected);
  // Exercise the actual production pipeline, not just the candidate.
  ctx.g=splitGraph(x);
  const compiled=JSON.parse(run('JSON.stringify(solveCertifiedCountGraph(g,factoryDirectArithmetic(),{ms:3000}))'));
  for(let i=0;i<expected.length;i++)assert.equal(compiled.values['routeTotal:r'+i],expected[i],JSON.stringify({x,status:compiled.status}));

  const result=observeSplit(x);
  for(let i=0;i<expected.length;i++){
   const [n,d=1]=expected[i].split('/').map(Number);
   assert(Math.abs(result.outputs[i]-result.seconds*n/d)<=2,JSON.stringify({x,result,expected}));
  }
 }
 // Middle-capacity branch: cannot call it fast at its peak possible
 // gap after the slow port skips. Refuse, rather than fit the result.
 assert.equal(periodicProof({b:1,h:1,branches:[null,{a:1,T:10},{a:1,T:2.5}]}).relations.length,0);
});
test('equal mean supply does not guarantee the water-level law with burst supply',()=>{
 const steady={b:1,h:2,branches:[null,{a:1,T:3}],window:1200};
 const burst={...steady,b:100,h:200};
 const a=observeSplit(steady),b=observeSplit(burst);
 console.log('homogeneous mean counterexample',JSON.stringify({a,b}));
 assert.equal(a.input,600);assert.equal(b.input,600);
 assert(Math.abs(a.outputs[1]-300)<=1);
 assert(b.outputs[1]<a.outputs[1]-30);
 assert.equal(periodicProof(burst).relations.length,0);
});

test('periodic batch and tandem calendar supports exact conditional split without averaging bursts',()=>{
 const cases=[
  [{b:2,h:3,branches:[null,{a:1,T:10},{a:2,T:5}]},['17/60','1/10','17/60']],
  [{b:3,h:3,branches:[null,{a:1,T:10},null]},['9/20','1/10','9/20']],
  [{b:2,h:5,branches:[null,{a:1,T:2.5}]},['1/5','1/5']]
 ];
 for(const [spec,expected] of cases)for(const length of [1,13]){
  const x={...spec,length,window:1200},p=periodicProof(x);assert.equal(p.witnesses.length,1,JSON.stringify(x));
  assert.deepEqual(Object.values(p.witnesses[0].rates),expected);
  const r=observeSplit(x);
  for(let i=0;i<expected.length;i++){const [n,d=1]=expected[i].split('/').map(Number);assert(Math.abs(r.outputs[i]-r.seconds*n/d)<=2,JSON.stringify({x,r,expected}));}
  ctx.g=splitGraph(x);
  const actual=JSON.parse(run('JSON.stringify(solveCertifiedCountGraph(g,factoryDirectArithmetic(),{ms:3000}))'));
  for(let i=0;i<expected.length;i++)assert.equal(actual.values['routeTotal:r'+i],expected[i]);
 }
 // An intermediate transforming machine creates a nonuniform arrival
 // calendar from an independent root. Final splitter's free port makes
 // that calendar valid without assuming the other branch's flow.
 const g=splitGraph({b:2,h:4,branches:[null,{a:1,T:10}]});
 const source=g.nodes.find(x=>x.id==='source');source.recipe.output='raw';
 g.nodes.push({id:'tandem',type:'生产',recipe:{inputs:{raw:2},output:'ore',qty:2,seconds:2},physicalInCount:1,physicalOutCount:1});
 const root=g.lines.find(x=>x.id==='root');root.from='tandem';
 g.lines.push({id:'feed',from:'source',to:'tandem',fromPort:0,toPort:0,length:3,active:true,compatible:true,materials:['raw'],rawMaterials:['raw'],acceptedMaterials:['raw']});
 ctx.g=g;const r=JSON.parse(run('JSON.stringify(provePeriodicSplitterElementLaw(g,factoryDirectArithmetic()))'));
 assert.deepEqual(Object.values(r.witnesses[0].rates),['2/5','1/10']);
});
test('calendar envelopes count simultaneous packets and all integer window phases exactly',()=>{
 const calendars=[{period:180,times:[300,380]},{period:180,times:[410,490]},{period:180,times:[490,570]}];
 ctx.cals=calendars;
 const c=JSON.parse(run('JSON.stringify(combinePeriodicCalendars(cals))'));
 assert.deepEqual(c.phases,[20,30,50,120,130,130]);assert.equal(c.packets,6);
 ctx.cal=c;
 for(const t of [0,1,10,11,20,30,60,90,179,180,181,360,1234]){
  ctx.t=t;const r=JSON.parse(run('JSON.stringify(periodicCountBounds(cal,t))'));
  const counts=Array.from({length:c.period},(_,s)=>c.phases.reduce((n,p)=>n+Math.floor((s+t-p)/c.period)-Math.floor((s-p)/c.period),0));
  assert.deepEqual(r,{lower:Math.min(...counts),upper:Math.max(...counts)},String(t));
 }
 assert.deepEqual(JSON.parse(run('JSON.stringify(periodicCountBounds(cal,20))')),{lower:0,upper:3});
});

function multiGraph(spec){
 const g=splitGraph(spec);
 for(let i=0;i<spec.branches.length;i++){
  const d=spec.branches[i];if(!d?.other)continue;
  const id='aux'+i,k='auxitem'+i,r=g.nodes.find(x=>x.id==='p'+i);
  r.recipe.inputs[k]=d.other.a;r.physicalInCount++;
  g.nodes.push({id,type:d.other.warehouse?'仓出':'生产',item:d.other.warehouse?k:null,recipe:d.other.warehouse?null:{inputs:{},output:k,qty:1,seconds:d.other.h},physicalInCount:0,physicalOutCount:1});
  g.lines.push({id:'auxline'+i,from:id,to:r.id,fromPort:0,toPort:1,length:d.other.length||1,active:true,compatible:true,materials:[k],rawMaterials:[k],acceptedMaterials:[k]});
  if(d.other.warehouse)g.pools.push({item:k,order:[id]});
 }
 return g;
}
function multiProof(spec,abundantItems=[]){
 ctx.g=multiGraph(spec);ctx.abundantItems=abundantItems;
 return JSON.parse(run('JSON.stringify(proveMultiInputSplitterElementLaw(g,factoryDirectArithmetic(),{abundantItems}))'));
}
function observeMulti(spec){
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return{}}}:null}},warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const f of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 c.spec=spec;
 return JSON.parse(vm.runInContext(`(()=>{
  DEF.testSource={w:5,h:5,ins:0,outs:1,recipes:{run:{inputs:{},output:'ore',qty:spec.b,seconds:spec.h}}};
  const machines=[{id:'source',type:'testSource',mode:'run',x:5,y:5,face:'E'},{id:'split',type:'分流',x:20,y:10,face:'E'}],routes=[];
  function edge(id,from,to,fp,tp=0,length=spec.length||1){routes.push({id,from:{id:from,port:fp},to:{id:to,port:tp},path:Array.from({length},(_,i)=>[i+1,10])});}
  edge('root','source','split',0);
  spec.branches.forEach((d,i)=>{
   machines.push({id:'w'+i,type:'仓入',x:55,y:5+i*10,face:'E'});
   if(!d){edge('r'+i,'split','w'+i,i);return;}
   const k='auxitem'+i,inputs={ore:d.a};
   if(d.other)inputs[k]=d.other.a;
   const type='test'+i;DEF[type]={w:5,h:5,ins:d.other?2:1,outs:1,recipes:{run:{inputs,output:'x'+i,qty:1,seconds:d.T}}};
   machines.push({id:'p'+i,type,mode:'run',x:35,y:5+i*10,face:'E'});edge('r'+i,'split','p'+i,i);edge('out'+i,'p'+i,'w'+i,0);
   if(d.other){
    if(d.other.warehouse)machines.push({id:'aux'+i,type:'仓出',item:k,x:5,y:45+i*5,face:'E'});
    else{const aux='auxType'+i;DEF[aux]={w:5,h:5,ins:0,outs:1,recipes:{run:{inputs:{},output:k,qty:1,seconds:d.other.h}}};machines.push({id:'aux'+i,type:aux,mode:'run',x:5,y:45+i*5,face:'E'});}
    edge('auxline'+i,'aux'+i,'p'+i,0,1,d.other.length||1);
   }
  });
  state={machines,routes};resetSimulation();
  // Supply the other material when the premise is abundant. This is
  // independent validation only, not a theoretical rate source.
  spec.branches.forEach((d,i)=>{if(d?.other?.warehouse)ware['auxitem'+i]=100000;});
  simulateBatchSteps(24000,.05);
  const before=JSON.parse(JSON.stringify(sim));simulateBatchSteps(12000,.05);
  const received=id=>(sim.byMachine[id].received.ore||0)-(before.byMachine[id].received.ore||0);
  return JSON.stringify({input:received('split'),outputs:spec.branches.map((d,i)=>received((d?'p':'w')+i))});
 })()`,c));
}
test('multi-ingredient accepting ports follow strict ordinal underload and compose into equal split equations',()=>{
 const cases=[
  {b:1,h:1,branches:[null,{a:2,T:3,other:{a:1,h:2,length:40}}]},
  {b:1,h:1,branches:[null,{a:2,T:3,other:{a:1,h:2,length:40}},{a:1,T:2.5,other:{a:1,h:2,length:13}}]},
  {b:2,h:5,branches:[null,{a:1,T:3,other:{a:1,h:2,length:20}}]},
  {b:1,h:2,branches:[null,{a:1,T:3,other:{a:2,h:1,length:40}}]}
 ];
 for(const x of cases)for(const length of [1,17]){
  const spec={...x,length},p=multiProof(spec);
  assert.equal(p.witnesses.length,1,JSON.stringify(spec));assert.equal(p.witnesses[0].free.length,spec.branches.length);
  const observed=observeMulti(spec),rate=spec.b/spec.h/spec.branches.length;
  for(const n of observed.outputs)assert(Math.abs(n-600*rate)<=2,JSON.stringify({spec,observed,rate}));
  ctx.g=multiGraph(spec);
  const r=JSON.parse(run('JSON.stringify(solveCertifiedCountGraph(g,factoryDirectArithmetic(),{ms:3000}))'));
  const expected=JSON.parse(run('JSON.stringify(factoryDirectArithmetic().txt(factoryDirectArithmetic().div(factoryDirectArithmetic().q(g.nodes[0].recipe.qty),factoryDirectArithmetic().mul(factoryDirectArithmetic().q(g.nodes[0].recipe.seconds),factoryDirectArithmetic().q('+spec.branches.length+')))))'));
  for(let i=0;i<spec.branches.length;i++)assert.equal(r.values['routeTotal:r'+i],expected);
 }
 const shortage={b:1,h:1,branches:[null,{a:2,T:3,other:{a:1,h:10}}]};
 assert.equal(multiProof(shortage).relations.length,0);
 const w={b:1,h:1,branches:[null,{a:2,T:3,other:{a:1,warehouse:true,length:15}}]};
 assert.equal(multiProof(w).relations.length,0);
 assert.equal(multiProof(w,['auxitem1']).witnesses.length,1);
 assert.deepEqual(observeMulti(w).outputs,[300,300]);
 const blocked=multiGraph(cases[0]);blocked.nodes.find(x=>x.id==='w1').type='汇流';ctx.g=blocked;
 assert.equal(JSON.parse(run('JSON.stringify(proveMultiInputSplitterElementLaw(g,factoryDirectArithmetic()))')).relations.length,0);
});

test('disjoint periodic merger composes the exact material word and splitter startup phase',()=>{
 for(const [length,expected] of [[5,[{A:150,B:0},{A:0,B:150}]],[13,[{A:0,B:150},{A:150,B:0}]]]){
  const g=graph();for(const m of g.nodes.filter(n=>n.recipe))m.recipe.seconds=4;
  g.lines.find(e=>e.id==='a').length=1;g.lines.find(e=>e.id==='b').length=length;
  ctx.g=g;const p=JSON.parse(run('JSON.stringify(proveCalendarMergerElementLaw(g,factoryDirectArithmetic()))'));
  assert.equal(p.witnesses.length,1);assert.equal(p.witnesses[0].rate,'1/2');
  assert.equal(p.witnesses[0].prefix,length===5?1:2);
  const result=JSON.parse(run('JSON.stringify(solveCertifiedCountGraph(g,factoryDirectArithmetic(),{ms:3000}))'));
  for(const [i,id] of ['left','right'].entries())for(const k of ['A','B'])assert.equal(result.values['flow:'+id+'|'+k],expected[i][k]?'1/4':'0',JSON.stringify(result.researchQueries));
  assert.deepEqual(observe(false,2,{period:4,a:1,b:length}).outputs,expected);
  // Same mean rates, different phase -> different exact allocations.
  const collision=structuredClone(g);collision.lines.find(e=>e.id==='b').length=1;ctx.g=collision;
  assert.equal(JSON.parse(run('JSON.stringify(proveCalendarMergerElementLaw(g,factoryDirectArithmetic()))')).relations.length,0);
 }
});

function pacedGraph(length){
 const g=splitGraph({b:1,h:1,length,branches:[{a:2,T:7.5},{a:4,T:10},{a:3,T:5}]});
 const q=g.nodes.find(x=>x.id==='p1');
 q.recipe.inputs.x0=1;q.physicalInCount++;
 g.nodes=g.nodes.filter(x=>x.id!=='w0');
 Object.assign(g.lines.find(x=>x.id==='out0'),{to:'p1',toPort:1});
 return g;
}
function observePaced(g,warmup=1200,seconds=600){
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return{}}}:null}},warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const f of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 c.g=g;c.warmup=warmup;c.seconds=seconds;
 return JSON.parse(vm.runInContext(`(()=>{
  const machines=g.nodes.map((n,i)=>{
   const type=n.recipe?'testPaced'+i:n.type;
   if(n.recipe)DEF[type]={w:5,h:5,ins:n.physicalInCount,outs:n.physicalOutCount,recipes:{run:n.recipe}};
   return {id:n.id,type,item:n.item,mode:'run',x:5+i*6,y:5,face:'E'};
  });
  const routes=g.lines.map(e=>({id:e.id,from:{id:e.from,port:e.fromPort},to:{id:e.to,port:e.toPort},path:Array.from({length:e.length},(_,i)=>[i+1,10])}));
  state={machines,routes};resetSimulation();simulateBatchSteps(warmup*20,.05);
  const before=JSON.parse(JSON.stringify(sim));simulateBatchSteps(seconds*20,.05);
  return JSON.stringify(['source','p0','p1','p2'].map(id=>Object.values(sim.byMachine[id].sent).reduce((s,n)=>s+n,0)-Object.values(before.byMachine[id].sent).reduce((s,n)=>s+n,0)));
 })()`,c));
}
test('saturated three-port service with a downstream-paced private feeder is exact',()=>{
 for(const length of [1,17,28]){
  const g=pacedGraph(length);ctx.g=g;
  const result=JSON.parse(run('JSON.stringify(solveCertifiedCountGraph(g,factoryDirectArithmetic(),{ms:3000}))'));
  assert.equal(result.values['cycle:p0'],'1/10');
  assert.equal(result.values['cycle:p1'],'1/10');
  assert.equal(result.values['cycle:p2'],'2/15');
  assert(result.proofs.some(w=>w.method==='element-saturated-paced-splitter-service'));
  const observed=observePaced(g);
  for(const [i,n] of [600,60,60,80].entries())assert(Math.abs(observed[i]-n)<=2,JSON.stringify({length,observed}));
 }
 for(const alter of [g=>g.nodes.find(n=>n.id==='source').recipe.seconds=2,g=>g.nodes.find(n=>n.id==='p0').recipe.seconds=10,g=>g.nodes.find(n=>n.id==='w1').type='汇流']){
  const g=pacedGraph(5);alter(g);ctx.g=g;
  assert.equal(JSON.parse(run('JSON.stringify(proveSaturatedPacedSplitterLaw(g,factoryDirectArithmetic()))')).relations.length,0);
 }
});

test('conditional eligibility word gives exact success and skip counts by finite composition',()=>{
 function f(m,n,p=null){ctx.mask=m;ctx.n=n;ctx.phase=p;return JSON.parse(run('JSON.stringify(elementEligibilityWord(mask,n,phase))'));}
 const equal=f([7,3,3,7,3],3);
 assert.equal(equal.phaseIndependent,true);
 assert.deepEqual(equal.counts.success,[12,12,6]);assert.deepEqual(equal.counts.skips,[0,0,6]);
 // Exhaust all short words; a fixed number of pointer-only scans is
 // the independent arithmetic oracle, not a production simulation.
 for(let n=1;n<=3;n++)for(let len=1;len<=3;len++){
  const m=(1<<n)-1,words=m**len;
  for(let k=0;k<words;k++){
   const masks=Array.from({length:len},(_,i)=>Math.floor(k/m**i)%m+1);
   const x=f(masks,n);
   for(const c of x.cases){
    let p=c.initial;const counts=Array(n).fill(0),skips=Array(n).fill(0);
    for(let i=0;i<(x.transientBlocks+x.repeatBlocks)*len;i++){
     const counting=i>=x.transientBlocks*len,mask=masks[i%len];
     for(let j=0;j<n;j++){const q=(p+j)%n;if(mask&(1<<q)){if(counting)counts[q]++;p=(q+1)%n;break;}if(counting)skips[q]++;}
    }
    assert.deepEqual(c.success,counts);assert.deepEqual(c.skips,skips);assert.equal(c.next,p);
   }
  }
 }
 // Same independent availability ratios do not fix allocation.
 const a=f([3,2,1],2,0),b=f([2,3,1],2,0);
 assert.deepEqual(a.counts.success,[2,4]);assert.deepEqual(b.counts.success,[4,2]);
 assert.throws(()=>f([0,3],2));
});


function stockRecordGraph(length){
 const g=pacedGraph(length),source=g.nodes.find(n=>n.id==='source'),p2=g.nodes.find(n=>n.id==='p2');
 source.recipe.qty=2;source.recipe.seconds=3;
 const r=g.lines.find(e=>e.id==='root');r.to='deposit';r.toPort=0;
 g.nodes.push({id:'deposit',type:'仓入',physicalInCount:1,physicalOutCount:0},{id:'stock',type:'仓出',item:'ore',physicalInCount:0,physicalOutCount:1},{id:'aux',type:'生产',recipe:{inputs:{},output:'aux',qty:1,seconds:9},physicalInCount:0,physicalOutCount:1});
 const line=(id,from,to,material,toPort)=>({id,from,to,materials:[material],rawMaterials:[material],acceptedMaterials:[material],length:1,fromPort:0,toPort,compatible:true,active:true});
 g.lines.push(line('stockroot','stock','split','ore',0),line('auxline','aux','p2','aux',1));
 p2.recipe.inputs.aux=1;p2.physicalInCount++;
 g.pools=[{item:'ore',order:['stock']}];
 return g;
}
test('periodic sole-stock three-way splitter closes paired long-run deficits without a free sibling',()=>{
 for(const length of [19,28,35]){
  const g=stockRecordGraph(length);ctx.g=g;
  const result=JSON.parse(run('JSON.stringify(solveCertifiedCountGraph(g,factoryDirectArithmetic(),{ms:3000}))'));
  assert(result.proofs.some(w=>w.method==='element-periodic-stock-record-deficit'));
  assert.equal(result.values['cycle:p0'],'1/15');
  assert.equal(result.values['cycle:p1'],'1/15');
  assert.equal(result.values['cycle:p2'],'4/45');
  const observed=observePaced(g,3600,1800);
  for(const [i,n] of [1200,120,120,160].entries())assert(Math.abs(observed[i]-n)<=2,JSON.stringify({length,observed}));
 }
 const g=stockRecordGraph(1);ctx.g=g;
 const proof=JSON.parse(run('JSON.stringify(provePeriodicStockSplitterRecordLaw(g,factoryDirectArithmetic(),[]))'));
 assert.equal(proof.relations.length,0);
});


// Small abstract graphs use the exact same production proof code as AST.
// This independent count observer does not feed results into any proof.
function observeElementRoutes(g,warmup=600,seconds=600){
 const c=vm.createContext({console,performance,atob,btoa,requestAnimationFrame(){},document:{hidden:false,getElementById(id){return id==='map'?{getContext(){return{}}}:null}},warehouseRefresh(){},draw(){},stockChartReset(){},recordWarehouseMovement(){}});
 for(const f of ['data/catalog','core/state','core/machines','core/routing','engine/simulation'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 c.g=g;c.warmup=warmup;c.seconds=seconds;
 return JSON.parse(vm.runInContext(`(()=>{
  const machines=g.nodes.map((n,i)=>{
   const type=n.recipe?'testElement'+i:n.type;
   if(n.recipe)DEF[type]={w:5,h:5,ins:n.physicalInCount,outs:n.physicalOutCount,recipes:{run:n.recipe}};
   const outFilters=[];for(const e of g.lines.filter(e=>e.from===n.id))outFilters[e.fromPort]=e.outFilter||'';
   return {id:n.id,type,item:n.item,outFilters,mode:'run',x:5+i*6,y:5,face:'E'};
  });
  const routes=g.lines.map(e=>({id:e.id,from:{id:e.from,port:e.fromPort},to:{id:e.to,port:e.toPort},path:Array.from({length:e.length},(_,i)=>[i+1,10])}));
  state={machines,routes};resetSimulation();if(g.unlimited)for(const n of machines)if(n.type==='仓出')ware[n.item]=1000000;
  simulateBatchSteps(warmup*20,.05);
  const map=new Map(routes.map(r=>[r.from.id+'|'+r.from.port,r.id])),counts={},send=sendItem;
  sendItem=(m,s,p,k)=>{const ok=send(m,s,p,k),id=map.get(m.id+'|'+p);if(ok&&id)counts[id]=(counts[id]||0)+1;return ok;};
  try{simulateBatchSteps(seconds*20,.05);}finally{sendItem=send;}
  return JSON.stringify(counts);
 })()`,c));
}
function elementGraph(){
 const g={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[],frozen:[],unlimited:false};
 const node=(id,type,recipe=null,item=null)=>g.nodes.push({id,type,recipe,item,physicalInCount:0,physicalOutCount:0});
 const edge=(id,from,to,k,length=1,fp=0,tp=0)=>{g.lines.push({id,from,to,materials:[k],rawMaterials:[k],acceptedMaterials:[k],length,fromPort:fp,toPort:tp,active:true,compatible:true});g.nodes.find(n=>n.id===from).physicalOutCount++;g.nodes.find(n=>n.id===to).physicalInCount++;};
 return {g,node,edge};
}
function sharedCalendarGraph(periods,lengths,a=2,T=1.5){
 const {g,node,edge}=elementGraph();
 node('make','生产',{inputs:{ore:a},output:'product',qty:1,seconds:T});node('end','仓入');edge('finish','make','end','product');
 periods.forEach((p,i)=>{node('source'+i,'生产',{inputs:{},output:'ore',qty:p[0],seconds:p[1]});edge('input'+i,'source'+i,'make','ore',lengths[i],0,i);});
 return g;
}
test('shared ingredient cache calendar has exact multi-port throughput and rejects overload',()=>{
 for(const [periods,lengths,a,T] of [
  [[[1,7.5],[1,7.5]],[21,10],2,1.5],
  [[[1,7.5],[1,7.5],[1,7.5]],[21,10,10],2,1.5],
  [[[2,4],[1,4]],[1,1],3,4],
  [[[1,2],[1,2],[1,2]],[3,3,3],3,2]
 ]){
  const g=sharedCalendarGraph(periods,lengths,a,T);ctx.g=g;
  const proof=JSON.parse(run('JSON.stringify(proveSharedIngredientCalendarLaw(g,factoryDirectArithmetic()))'));
  assert.equal(proof.witnesses.length,1);assert(proof.witnesses[0].occupancyUpper<=3*a);
  const observed=observeElementRoutes(g);
  periods.forEach(([b,t],i)=>assert(Math.abs(observed['input'+i]-600*b/t)<=2,JSON.stringify({periods,lengths,observed})));
  assert(Math.abs(observed.finish-600*periods.reduce((s,[b,t])=>s+b/t,0)/a)<=2);
 }
 for(const g of [sharedCalendarGraph([[1,1],[1,1]],[1,1],1,3),sharedCalendarGraph([[1,2],[1,2]],[1,1],2,2)]){
  if(g.nodes.find(n=>n.id==='make').recipe.inputs.ore===2)g.nodes.find(n=>n.id==='end').type='汇流';
  ctx.g=g;assert.equal(JSON.parse(run('JSON.stringify(proveSharedIngredientCalendarLaw(g,factoryDirectArithmetic()))')).relations.length,0);
 }
});
function diamondGraph(lengths,b=3,T=3){
 const {g,node,edge}=elementGraph();node('source','生产',{inputs:{},output:'ore',qty:b,seconds:T});node('split','分流');node('merge','汇流');node('end','仓入');
 edge('root','source','split','ore',5);
 lengths.forEach((l,i)=>edge('path'+i,'split','merge','ore',l,i,i));
 edge('out','merge','end','ore',3);
 return g;
}
test('uniform split rejoin is exact for unequal lengths and coincident merger heads',()=>{
 for(const [ls,b,T] of [[[14,26],3,3],[[3,1],3,3],[[5,3,1],3,3],[[1,17,35],1,2],[[1,1,1],1,1]]){
  const g=diamondGraph(ls,b,T);ctx.g=g;
  const proof=JSON.parse(run('JSON.stringify(proveUniformSplitRejoinLaw(g,factoryDirectArithmetic()))'));
  assert.equal(proof.witnesses.length,1);
  const observed=observeElementRoutes(g);
  for(let i=0;i<ls.length;i++)assert(Math.abs(observed['path'+i]-600*b/T/ls.length)<=2,JSON.stringify({ls,b,T,observed}));
  assert(Math.abs(observed.out-600*b/T)<=2);
 }
 for(const alter of [g=>g.nodes.find(n=>n.id==='source').recipe.seconds=5,g=>g.nodes.find(n=>n.id==='end').type='汇流',g=>g.lines.find(e=>e.id==='path1').outFilter='other']){
  const g=diamondGraph([3,1]);alter(g);ctx.g=g;
  assert.equal(JSON.parse(run('JSON.stringify(proveUniformSplitRejoinLaw(g,factoryDirectArithmetic()))')).relations.length,0);
 }
});


test('saturated residual envelope proves a long enough branch absorbs spare throughput',()=>{
 const spec={b:1,h:1,length:16,branches:[{a:4,T:5},{a:1,T:4},{a:1,T:5}]};
 for(const length of [16,24,32]){
  const g=splitGraph({...spec,length});ctx.g=g;
  const proof=JSON.parse(run('JSON.stringify(proveSaturatedResidualEnvelopeLaw(g,factoryDirectArithmetic(),{}))'));
  const w=proof.witnesses.find(w=>w.target==='r0');assert(w,JSON.stringify(proof));
  assert(w.unprocessedBound<=w.beltLength+w.cacheSlack);
  const observed=observeElementRoutes(g);
  for(const [id,expected] of [['root',600],['r0',330],['r1',150],['r2',120]])assert(Math.abs(observed[id]-expected)<=2,JSON.stringify({length,observed,id,expected}));
 }
 const g=splitGraph({...spec,length:1});ctx.g=g;
 const short=JSON.parse(run('JSON.stringify(proveSaturatedResidualEnvelopeLaw(g,factoryDirectArithmetic(),{}))'));
 assert(!short.witnesses.some(w=>w.target==='r0'));
 const overloaded=splitGraph({...spec,branches:[{a:4,T:20},{a:1,T:4},{a:1,T:5}]});ctx.g=overloaded;
 assert(!JSON.parse(run('JSON.stringify(proveSaturatedResidualEnvelopeLaw(g,factoryDirectArithmetic(),{}))')).witnesses.some(w=>w.target==='r0'));
});


function filteredGraph(filters,period=1){
 const {g,node,edge}=elementGraph();
 node('sourceA','生产',{inputs:{},output:'A',qty:1,seconds:period});node('sourceB','生产',{inputs:{},output:'B',qty:1,seconds:period});node('merge','汇流');node('split','分流');
 edge('a','sourceA','merge','A',1,0,0);edge('b','sourceB','merge','B',5,0,1);
 edge('mid','merge','split','A',3);Object.assign(g.lines.at(-1),{materials:['A','B'],rawMaterials:['A','B'],acceptedMaterials:['A','B'],compatible:false});
 filters.forEach((k,i)=>{node('end'+i,'仓入');edge('path'+i,'split','end'+i,k,3,i);g.lines.at(-1).outFilter=k;});
 return g;
}
test('filtered free terminal cycle detects impossible material ratios but does not assert all mixed streams stop',()=>{
 const g=filteredGraph(['A','A','B']);ctx.g=g;
 const r=JSON.parse(run('JSON.stringify(solveCertifiedCountGraph(g,factoryDirectArithmetic(),{ms:3000}))'));
 assert(r.proofs.some(w=>w.method==='element-filtered-terminal-cycle'));
 for(const e of g.lines)assert.equal(r.values['routeTotal:'+e.id],'0');
 const observed=observeElementRoutes(g);assert(g.lines.every(e=>!observed[e.id]),JSON.stringify(observed));
 const compatible=filteredGraph(['A','B'],4);ctx.g=compatible;
 const proof=JSON.parse(run('JSON.stringify(proveFilteredTerminalCycleLaw(g,factoryDirectArithmetic()))'));
 assert.equal(proof.relations.length,1);assert.equal(proof.relations[0].constant,'0');
 assert.equal(proof.relations[0].coefficients['routeTotal:path0'],-1);assert.equal(proof.relations[0].coefficients['routeTotal:path1'],1);
 const running=observeElementRoutes(compatible);assert(Math.abs(running.path0-150)<=1&&Math.abs(running.path1-150)<=1,JSON.stringify(running));
 compatible.nodes.find(n=>n.id==='end1').type='汇流';ctx.g=compatible;
 assert.equal(JSON.parse(run('JSON.stringify(proveFilteredTerminalCycleLaw(g,factoryDirectArithmetic()))')).relations.length,0);
});
