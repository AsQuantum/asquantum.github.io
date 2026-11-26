'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('fs'),vm=require('vm'),path=require('path');
test('AST1 coupled splitters solve with rational rate-only active-set equations',()=>{
 const c=vm.createContext({console,atob,btoa,performance,document:{getElementById(){return{getContext(){return{}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','engine/steady-flow','engine/steady-feedforward-islands','core/compact-json','blueprints/ast1-codec'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts',f+'.js'),'utf8'),c,{filename:f});
 c.code=fs.readFileSync(path.join(__dirname,'fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
 vm.runInContext('state=ast1Decode(code)',c);
 const machines=new Map(vm.runInContext('state.machines',c).map(m=>[m.id,m]));
 const routes=vm.runInContext('state.routes',c);
 const rec=vm.runInContext('getRecipe',c);
 const Q=vm.runInContext('steadyExactQ',c),
  sum=vm.runInContext('steadyExactAdd',c),
  sub=vm.runInContext('steadyExactSub',c),
  mul=vm.runInContext('steadyExactMul',c),
  div=vm.runInContext('steadyExactDiv',c),
  min=vm.runInContext('steadyExactMin',c),
  cmp=vm.runInContext('steadyExactCmp',c),
  text=vm.runInContext('steadyExactText',c),
  frac=vm.runInContext('steadyExactFraction',c);
 const read=s=>{const [a,b='1']=s.split('/');return frac(BigInt(a),BigInt(b));};
 const r=id=>rec(machines.get(id));
 for(const [a,b] of [['M103','M105'],['M105','M22'],['M22','M32'],['M49','M32'],['M50','M36'],['M85','M39'],
  ['M36','M33'],['M36','M24'],['M36','M87'],['M39','M35'],['M39','M87'],['M39','M88'],['M88','M35'],['M114','M33']])
  assert(routes.some(x=>x.from.id===a&&x.to?.id===b),'missing topology '+a+'→'+b);
 let sourceRate=null;
 for(const id of ['M103','M105','M22']){
  const x=r(id),input=Object.entries(x.inputs||{});
  let cycle=min(div(Q(1),Q(x.seconds)),div(Q(1),Q(x.qty)));
  if(input.length)cycle=min(cycle,div(sourceRate,Q(input[0][1])));
  sourceRate=mul(cycle,Q(x.qty));
 }
 const battery=mul(sourceRate,Q(60));
 const trees=vm.runInContext('factorySteadyIsolatedDepositTrees()',c);
 const alloy=mul(trees.networks.filter(x=>x.item==='合金板')
  .reduce((acc,x)=>sum(acc,read(x.fluidModelRate)),Q(0)),Q(60));
 const first=min(alloy,battery),A=sub(alloy,first),C=mul(first,Q(r('M32').qty));
 const coilM=Q(r('M87').inputs['导线线圈']),coilP=Q(r('M35').inputs['导线线圈']),
  coilChip=Q(r('M88').inputs['导线线圈']);
 const chipToProcessor=div(Q(r('M35').inputs['古代芯片']),Q(r('M88').qty));
 const p=div(C,sum(mul(Q(2),coilP),mul(coilChip,chipToProcessor)));
 const motor=div(mul(coilP,p),coilM);
 const alloyF=Q(r('M33').inputs['合金板']),alloyR=Q(r('M24').inputs['合金板']),
  alloyM=Q(r('M87').inputs['合金板']);
 const remaining=sub(A,mul(alloyM,motor));
 const frame=div(remaining,mul(Q(2),alloyF)),
  resonance=div(remaining,mul(Q(2),alloyR));
 const tiOut=mul(frame,Q(r('M33').inputs['钛合金锭']));
 assert.deepEqual({alloy:text(alloy),battery:text(battery),first:text(first),A:text(A),C:text(C),
  chip:text(p),motor:text(motor),frame:text(frame),resonance:text(resonance),titaniumOut:text(tiOut)},
  {alloy:'40',battery:'20',first:'20',A:'20',C:'40',
   chip:'4',motor:'16/3',frame:'11/6',resonance:'11/3',titaniumOut:'11'});
 assert(cmp(mul(alloyM,motor),mul(alloyF,frame))<0,'M36 motor branch must be capped');
 assert(cmp(mul(coilChip,mul(chipToProcessor,p)),mul(coilP,p))<0,'M39 chip branch must be capped');
 assert.equal(text(sum(mul(alloyF,frame),sum(mul(alloyR,resonance),mul(alloyM,motor)))),'20');
 assert.equal(text(sum(mul(coilM,motor),sum(mul(coilP,p),mul(coilChip,mul(chipToProcessor,p))))),'40');
});
