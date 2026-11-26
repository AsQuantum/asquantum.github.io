'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{environment,fixture}=require('./support/environment');
for(const [name,alloy,wire,total] of [
 ['ast1-warehouse-port-balance-v1.txt','-2/3','-4/15','2/45'],
 ['ast1-warehouse-slow-miner-v1.txt','-1/9','-3/10',null]
]){
 test('standalone complete research preview: '+name,()=>{
  const e=environment();fixture(e,name);
  const x=JSON.parse(e.run('JSON.stringify(iterationResearchPreview(state,A,{ms:90000}))'));
  assert.equal(x.status,'experimental-complete',JSON.stringify(x.unknownMetrics));assert.equal(x.certified,false);
  assert.deepEqual(x.unknownMetrics,[]);
  assert.equal(x.rows['合金板'].potential,alloy);assert.equal(x.rows['导线线圈'].potential,wire);
  if(total!==null)assert.equal(x.total.potential,total);
  assert.equal(Object.keys(x.machineTimes).length,57);
  const ids=JSON.parse(e.run('JSON.stringify({machines:state.machines.map(m=>m.id),routes:state.routes.map(r=>r.id)})'));
  for(const id of ids.machines)for(const side of ['in','out'])assert.notEqual(x.values['machineTotal:'+id+'|'+side],undefined);
  for(const id of ids.routes)assert.notEqual(x.values['routeTotal:'+id],undefined);
  assert.equal(Object.keys(x.rows).length,14);
  assert.equal(Object.values(x.total).filter(v=>v!==null).length,5);
  assert.equal(e.run('simTime'),0);
  console.log('STANDALONE-PREVIEW',JSON.stringify({name,elapsed:x.elapsedMs,total:x.total,alloy:x.rows['合金板'],wire:x.rows['导线线圈'],values:Object.keys(x.values).length,periods:Object.keys(x.machineTimes).length}));
 });
}
