'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{environment,fixture}=require('./support/environment');
test('autonomous frozen credit calendar preserves every stage from empty start',()=>{
 const e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt',[{id:'s1',rates:{'太空垃圾':'2/7','合金板':'3/2'}},{id:'c',rates:{'太空垃圾':'-1/2','合金板':'-2','硅晶圆':'1/3'}},{id:'s2',rates:{'太空垃圾':'1/2','合金板':'4/3'}},{id:'c2',rates:{'硅晶圆':'-1/5','能量电池':'1/7'}}]);
 for(const u of [false,true]){
  e.c.u=u;const x=e.run('(()=>{const s=factoryCompileSymbolicSpec(state,{unlimitedWarehouse:u}),c=iterationAutonomousSourceCalendar(s,A);if(c.status!=="ready")throw Error(c.status);const a=iterationCreateKernel(s,A),b=iterationCreateKernel(c.spec,A,{boundary:c.boundary});let n=0;for(let i=0;i<2400;i++){a.step();b.step();const x=a.snapshot(),y=b.snapshot();const z=JSON.parse(x.control),v=JSON.parse(y.control);s.frozen.forEach((f,j)=>{if(c.sourceIds.includes(f.id))z[2][j]=[]});const same=(a,b)=>Object.keys({...a,...b}).every(k=>(a[k]??0)===(b[k]??0));if(JSON.stringify(z)!==JSON.stringify(v)||!same(x.stock,y.stock)||!same(x.count,y.count)||!same(x.service,y.service))throw Error("calendar mismatch "+i);n++}return n})()');
  assert.equal(x,2400);
 }
});
test('additive calendar solver agrees with unsplit actual and unlimited exact rates',()=>{
 const e=environment();e.c.f=[{id:'s1',rates:{'合金板':'1/2','能量电池':'3/4'}},{id:'m',rates:{'合金板':'-1','能量电池':'-1','硅晶圆':'1'}},{id:'s2',rates:{'合金板':'1/4'}}];
 for(const u of [false,true]){e.c.u=u;const x=JSON.parse(e.run('state={machines:[],routes:[],frozenFactories:normalizeFrozenFactories(f)};(()=>{const s=factoryCompileSymbolicSpec(state,{unlimitedWarehouse:u}),c=iterationAutonomousSourceCalendar(s,A),a=iterationFindOrbit(iterationCreateKernel(s,A),{maxTicks:10000}),b=iterationFindOrbit(iterationCreateKernel(c.spec,A,{boundary:c.boundary}),{maxTicks:10000,includeCertificate:true,verifyPeriod:true});return JSON.stringify({a,b,verified:iterationVerifyReachableCertificate(c.spec,A,b.certificate,b.values,{boundary:c.boundary})})})()'));
 assert.equal(x.a.status,'exact-model-period');assert.equal(x.b.status,'exact-model-period');assert.deepEqual(x.a.values,x.b.values);assert.equal(x.verified.status,'verified');}
});
test('source calendar rejects huge common phase period before allocation',()=>{
 const e=environment();assert.equal(e.run('iterationAutonomousSourceCalendar({machines:[],routes:[],frozen:[{id:"a",rates:{ore:"1/1000003"}}]},A).status'),'budget');
});
test('reachable certificate checks the whole prefix and distinguishes budget',()=>{
 const e=environment();fixture(e,'ast1-warehouse-feedback-loop-v1.txt',[{id:'s',rates:{'太空垃圾':'1'}}]);
 const x=JSON.parse(e.run('(()=>{const s=factoryCompileSymbolicSpec(),r=iterationFindOrbit(iterationCreateKernel(s,A),{includeCertificate:true});if(!r.certificate)throw Error(r.status);const c=r.certificate;return JSON.stringify({good:iterationVerifyReachableCertificate(s,A,c,r.values),bad:iterationVerifyReachableCertificate(s,A,{...c,start:{...c.start,stock:{...c.start.stock,forged:1}}},r.values),limited:iterationVerifyReachableCertificate(s,A,c,r.values,{maxPrefixTicks:0}),prefix:c.start.tick})})()'));
 assert(x.prefix>0);assert.equal(x.good.status,'verified');assert.equal(x.bad.reason,'unreachable-start');assert.equal(x.limited.status,'budget');
});

test('nonmaterialized source clock preserves exact stage events, including giant denominators',()=>{
 const e=environment();
 const x=e.run('(()=>{const spec={machines:[],routes:[],frozen:[{id:"a",rates:{ore:"2/7",fuel:"41"}},{id:"b",rates:{ore:"1/11"}},{id:"reader",rates:{ore:"-1",fuel:"1"}}]},c=iterationAutonomousSourceClock(spec,A),d=iterationAutonomousSourceCalendar(spec,A,{maxPeriod:10000}).boundary;for(let t=0;t<3000;t++){const a=c.between(t,t+1),b=d.frames[t%d.period]||{};for(const stage of Object.keys(b))for(const k of Object.keys(b[stage]))if(a[stage]?.[k]!==String(b[stage][k]))return false;if(JSON.stringify(Object.keys(a))!==JSON.stringify(Object.keys(b)))return false;let next=t+1;while(!Object.keys(d.frames[(next-1)%d.period]||{}).length)next++;if(c.next(t)!==String(next))return false}const h=iterationAutonomousSourceClock({frozen:[{id:"huge",rates:{ore:"1/100000000000000000003"}}]},A);return h.next(0)==="2000000000000000000060"&&h.between("0","2000000000000000000060")["frozen:huge"].ore==="1"&&h.phase("2000000000000000000060")[0]==="0"})()');
 assert.equal(x,true);
});
test('symbolic source clock jumps over sparse gaps and handles simultaneous stages',()=>{
 const e=environment();
 assert.equal(e.run('(()=>{const c=iterationAutonomousSourceClock({frozen:[{id:"a",rates:{ore:"2/7"}},{id:"b",rates:{fuel:"4/7"}}]},A);return JSON.stringify([c.next(0),c.next(35),c.between(35,70),c.phase(70)])})()'),JSON.stringify(["35","70",{"frozen:a":{"ore":"1"},"frozen:b":{"fuel":"1"}},["0","0"]]));
});

test('autonomous physical feed-forward prefix and cycle preserve downstream state from empty start',()=>{
 const e=environment();fixture(e,'ast1-user-84-78-v1.txt');
 const x=e.run('(()=>{const s=iterationPartitionSpec(factoryCompileSymbolicSpec()).sort((a,b)=>b.machines.length-a.machines.length)[0],p=iterationPhysicalSourcePlan(s,A);if(p.status!=="ready")throw Error(p.status);const T=5000,a=iterationCreateKernel(s,A),b=iterationCreateKernel(p.residual,A,{boundary:{period:T,frames:p.window(0,T),free:[],additive:true}}),mi=new Map(s.machines.map((m,i)=>[m.id,i])),ri=new Map(s.routes.map((r,i)=>[r.id,i]));for(let i=0;i<T;i++){a.step();b.step();if(i%10!==0)continue;const x=a.snapshot(),y=b.snapshot(),[ns,es,fs]=JSON.parse(x.control);if(JSON.stringify([p.residual.machines.map(m=>ns[mi.get(m.id)]),p.residual.routes.map(r=>es[ri.get(r.id)]),fs])!==y.control)throw Error("state mismatch "+i);for(const k of new Set([...Object.keys(x.stock),...Object.keys(y.stock)]))if((x.stock[k]||0)!==(y.stock[k]||0))throw Error("stock mismatch "+i)}return JSON.stringify({source:p.sources.reduce((n,s)=>n+s.group.machines.length,0),residual:p.residual.machines.length,prefix:p.prefix,period:p.period})})()');
 const r=JSON.parse(x);assert.deepEqual([r.source,r.residual],[24,52]);console.log('PHYSICAL_FEED_FORWARD',x);
});
