'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function probe(fixture,ticks,...args){
 const r=spawnSync(process.execPath,['tools/iteration/probe-current-simulator.js','tests/fixtures/'+fixture,String(ticks),...args],{cwd:root,encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
}
test('probe with no search budget must not claim a proof',()=>{
 const r=probe('ast1-warehouse-slow-miner-v1.txt',0);
 assert.equal(r.status,'no-candidate');
});
test('real simulator diagnostic can find a period but never certifies it',()=>{
 const r=probe('ast1-priority-armour-backpressure-v1.txt',12000);
 assert.equal(r.status,'candidate-period');
 assert.equal(r.certified,false);
 assert(r.periodTicks>0&&Number.isSafeInteger(r.periodTicks));
 assert.equal(r.method,'quantized-current-simulator-diagnostic');
});
