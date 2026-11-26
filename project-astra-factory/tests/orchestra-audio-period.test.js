'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const c=vm.createContext({});
for(const name of ['audio','period'])vm.runInContext(fs.readFileSync('scripts/ui/orchestra/'+name+'.js','utf8'),c);
const group=vm.runInContext('orchestraGroupNotes',c),p=vm.runInContext('orchestraPeriod',c);
test('dense same-tick unisons coalesce without losing events or collapsing different ticks',()=>{
 const events=Array.from({length:2000},(_,i)=>({id:'M'+i,time:12+(i>=1000?.05:0),instrument:'piano',n:60,volume:.7}));
 events.push({time:12,instrument:'bass',n:60,volume:.5},{time:12,instrument:'piano',n:64,volume:.5},{time:12,instrument:'piano',n:null,volume:1});
 const a=group(events);assert.equal(a.length,4);
 assert.equal(a.reduce((s,g)=>s+g.events.length,0),2002);
 assert.equal(a[0].events.length,1000);assert.equal(a[0].volume,1);
 assert.equal(a[3].time,12.05);assert(a.every(g=>g.volume<=1));
});
test('reference period is derived from witnessed orbit and exact rates; never guesses from rates alone',()=>{
 const layout={machines:[{id:'A',type:'a'},{id:'B',type:'b'}]},b={diagnostics:{components:[{machines:['A'],actualStatus:'exact-model-period',periodTicks:120,prefixTicks:200},{machines:['B'],actualStatus:'exact-model-period',periodTicks:100,prefixTicks:50}]},fractions:{machineTotals:{A:{out:'1'},B:{out:'1'}}}};
 const length=(_,d)=>d==='out'?16:0;
 const r=p.estimate(layout,b,length,320);assert.equal(r.status,'period');assert.equal(r.ticks,4800n);assert.equal(r.prefix,200);
 assert.equal(p.duration(57600n,120),'24分0秒');
 b.diagnostics.components[1].actualStatus='exact-model-analytic';assert.equal(p.estimate(layout,b,length).status,'unknown');
 b.fractions.machineTotals.B.out='0';assert.equal(p.estimate(layout,b,length).ticks,960n);
 b.fractions.machineTotals.B.out=null;assert.equal(p.estimate(layout,b,length).status,'unknown');
});
