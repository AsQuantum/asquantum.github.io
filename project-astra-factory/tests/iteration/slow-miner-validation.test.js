'use strict';
// Research diagnostic regression only. No guessed period or hard-coded rates enter production.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
for(const mode of ['actual','unlimited'])test('115-machine changed layout: '+mode+' candidate agrees with independent known counts',()=>{
 const args=['tools/iteration/probe-current-simulator.js','tests/fixtures/ast1-warehouse-slow-miner-v1.txt','216000'];
 if(mode==='unlimited')args.push('--unlimited');
 const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stderr);const x=JSON.parse(r.stdout);
 assert.equal(x.status,'candidate-period',r.stdout);assert.equal(x.certified,false);
 assert.equal(x.mode,mode);assert(x.periodTicks>0);
 const rate=(map,item)=>((map[item]||0)*1200)/x.periodTicks;
 assert.equal(rate(x.inflow,'钛合金锭'),80);assert.equal(rate(x.outflow,'钛合金锭'),60);
 assert.equal(rate(x.inflow,'合金板'),40);
 if(mode==='unlimited'){
  assert(Math.abs(rate(x.inflow,'合金板')-rate(x.outflow,'合金板')+28/3)<1e-9);
  assert(Math.abs(rate(x.inflow,'齿轮组')-rate(x.outflow,'齿轮组')-34/3)<1e-9);
 }
 console.log('CANDIDATE ONLY',JSON.stringify(x));
});
