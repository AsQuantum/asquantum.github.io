'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('mixed route into a 1A+2B recipe exposes finite FIFO buffer capacities and blocking invariant',()=>{
 const c=vm.createContext({console,document:{getElementById(){return {getContext(){return {}}}}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state',
  'core/machines','core/routing','core/audit','engine/steady-flow',
  'engine/steady-local-rates','engine/steady-equations']){
  vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c);
 }
 vm.runInContext("checkPath=()=>null;DEF.__a={name:'A',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'太空垃圾',qty:1,seconds:1,inputs:{}}}};DEF.__b={name:'B',w:3,h:3,ins:0,outs:1,recipes:{run:{output:'合金板',qty:1,seconds:1,inputs:{}}}};DEF.__mix={name:'Mix',w:3,h:3,ins:2,outs:1,recipes:{run:{output:'齿轮组',qty:1,seconds:5,inputs:{'太空垃圾':1,'合金板':2}}}}",c);
 c.stateData={
  machines:[
   {id:'a',type:'__a',mode:'run',face:'E',x:0,y:0},
   {id:'b',type:'__b',mode:'run',face:'E',x:0,y:0},
   {id:'m',type:'汇流',face:'E',x:0,y:0},
   {id:'make',type:'__mix',mode:'run',face:'E',x:0,y:0},
   {id:'store',type:'仓入',face:'E',x:0,y:0}
  ],
  routes:[
   {id:'a',from:{id:'a',port:0},to:{id:'m',port:0},path:[[0,0]]},
   {id:'b',from:{id:'b',port:0},to:{id:'m',port:1},path:[[0,0]]},
   {id:'mixed',from:{id:'m',port:0},to:{id:'make',port:0},path:[[0,0]]},
   {id:'out',from:{id:'make',port:0},to:{id:'store',port:0},path:[[0,0]]}
  ]
 };
 const model=vm.runInContext('state=stateData;factorySteadyBuildEquations()',c);
 assert.equal(model.fifoRecipeInlets.length,1);
 const fifo=model.fifoRecipeInlets[0];
 assert.equal(fifo.machine,'make');assert.equal(fifo.route,'mixed');
 assert.deepEqual(Object.fromEntries(Object.entries(fifo.inputBufferCaps)),{
  '太空垃圾':3,'合金板':6});
 assert.deepEqual(Object.fromEntries(Object.entries(fifo.recipeRequirement)),{
  '太空垃圾':1,'合金板':2});
 assert.equal(fifo.immutableFIFOOrderKnown,false);
 const proof=vm.runInContext("steadyExactPeriodicFifoDeadlock(getRecipe(state.machines.find(m=>m.id==='make')),['太空垃圾','合金板','合金板','合金板','合金板','合金板','合金板','合金板'])",c);
 assert.equal(proof.guaranteedDeadlock,true);
 assert.equal(proof.stationaryThroughput,'0');
 assert.equal(proof.certificate.driftPerPeriod,'5');
});
