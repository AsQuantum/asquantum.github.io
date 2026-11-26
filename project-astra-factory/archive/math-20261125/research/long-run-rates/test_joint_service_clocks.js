'use strict';
const assert=require('assert/strict'),fs=require('fs');
const {arith}=require('./run_direct'),{makeWords}=require('./symbolic_bdd'),{compileSymbolicPhysical}=require('./symbolic_physical'),{deriveSymbolicRelations}=require('./symbolic_relation_algebra'),{saturateEqualities}=require('./asymptotic_guard_algebra'),{jointClockDensity,jointClockUnionDensity,jointClockClassEquations,mergeCongruences,compileClockClasses}=require('./joint_service_clocks');
const report=[];
const machine=(id,type,recipe=null,ports=[],inputPriority=[])=>({id,type,recipe,outPorts:ports.map(index=>({index,filter:''})),inputPriority,mergerPriority:[]});
function compiler(spec,options={}){
 const m=compileSymbolicPhysical({machines:[],routes:[],priority:[],frozen:[],initial:'empty',unlimitedWarehouse:false,...spec},arith,{collectGuards:true,maxNodes:1000000,ms:15000,...options});
 const w=makeWords(m.b),b=m.b,word=f=>Array.from({length:f.bits},(_,j)=>b.variable(2*(f.offset+j))),field=k=>m.fields.find(f=>f.name===k);
 const base=m.fields.reduce((a,f)=>b.and(a,w.le(word(f),w.c(f.cap))),1);
 const valid=(r,label)=>assert.equal(b.and(base,b.not(r)),0,label);
 const current=k=>word(field(k)),after=k=>m.next.slice(field(k).offset,field(k).offset+field(k).bits);
 return {...m,w,base,valid,current,after};
}
{
 const m=compiler({machines:[machine('craft','组装',{qty:1,seconds:2,inputs:{k:1},output:'x'})]});
 const {b,w,valid,current,after,guards:g,rewards:r}=m;
 const busy=w.nonzero(current('craft.timer')),start=g['batchStart:craft'],T=40;
 valid(w.eq(w.add(after('craft.timer'),[busy]),w.add(current('craft.timer'),w.mul([start],T))),'exact countdown balance');
 const classes=['working:craft','waitInput:craft','waitOutput:craft'].map(k=>g[k]);
 valid(classes.reduce(b.or,0),'exhaustive work/wait classes');
 for(let i=0;i<classes.length;i++)for(let j=i+1;j<classes.length;j++)valid(b.not(b.and(classes[i],classes[j])),'disjoint work/wait classes');
 valid(w.eq([g['working:craft']],[w.nonzero(after('craft.timer'))]),'working measured after batch start');
 report.push({type:'physical recipe guard identity',T,fields:m.fields.length,guards:Object.keys(g),nodes:b.size()});
}
{
 const m=compiler({machines:[machine('src','生产',{qty:1,seconds:1,inputs:{},output:'k'},[0]),machine('sink','仓入',null,[],[0])],routes:[{id:'e',from:'src',fromPort:0,to:'sink',toPort:0,length:1,accepted:['k']}]});
 const {b,w,valid,current,after,rewards:r}=m,P=20,c=current('src.send0'),d=after('src.send0'),sent=r['routeTotal:e'];
 valid(w.eq(w.add(d,[w.nonzero(c)]),w.add(c,w.mul(sent,P))),'exact port cooldown count identity');
 // On a normal step with c,d both nonzero the phase clock always
 // advances, including c=1 -> c'=P after successful dispatch.
 const normal=b.and(w.nonzero(c),w.nonzero(d));
 const expected=w.pick(w.eq(c,w.c(1)),w.c(P),w.satSub(c,w.c(1)));
 valid(b.or(b.not(normal),w.eq(d,expected)),'saturated port phase rotation');
 report.push({type:'physical port saturation and phase rotation',P,bits:m.next.length,nodes:b.size()});
}
{
 const a=[{id:'a',period:20,offset:0},{id:'b',period:30,offset:0}],c=[{id:'a',phase:0},{id:'b',phase:0}];
 assert.equal(jointClockDensity(a,c,arith).density,'1/60');
 const b=[a[0],{...a[1],offset:1}];assert.equal(jointClockDensity(b,c,arith).density,'0');
 assert.equal(jointClockUnionDensity(a,c,arith).density,'1/15');
 assert.equal(jointClockUnionDensity(b,c,arith).density,'1/12');
 const e=jointClockClassEquations([{id:'aligned',clocks:a},{id:'offset',clocks:b}],[{id:'both',conditions:c},{id:'either',conditions:c,union:true}],arith);
 const p=saturateEqualities(e.relations,{...e.bounds,either:['1/15','1/15']},arith);assert.equal(p.values.both,'1/60');assert.equal(p.values['@phaseClass:aligned'],'1');
 const q=saturateEqualities(e.relations,e.bounds,arith);assert(!Object.hasOwn(q.values,'both'));
 // Pairwise-coprime large periods: exact density without expanding the LCM.
 const big=[{id:'x',period:'1000000007',offset:0},{id:'y',period:'1000000009',offset:17},{id:'z',period:'1000000033',offset:23}],k=big.map(x=>({id:x.id,phase:0})),d=jointClockDensity(big,k,arith);
 assert.equal(d.density,'1/'+(1000000007n*1000000009n*1000000033n).toString());
 assert.equal(mergeCongruences([{period:6,residue:0},{period:10,residue:1}]).compatible,false);
 const all=compileClockClasses(a.map(({id,period})=>({id,period})),[{id:'both',conditions:c},{id:'either',conditions:c,union:true}],arith);
 assert.equal(all.allowedClasses,10);assert.equal(all.distinctQueryClasses,2);
 assert.deepEqual(all.classGroups.map(x=>x.classes).sort((a,b)=>a-b),[1,9]);
 const only=compileClockClasses(a,[{id:'both',conditions:c}],arith,{certifiedDifferences:[{a:'a',b:'b',difference:0}]});
 assert.equal(only.allowedClasses,1);assert.equal(saturateEqualities(only.relations,only.bounds,arith).values.both,'1/60');
 const independent=compileClockClasses(big,[{id:'both',conditions:k}],arith);
 assert.equal(independent.phaseClasses,'1');assert.equal(saturateEqualities(independent.relations,independent.bounds,arith).values.both,d.density);
 assert.equal(compileClockClasses(a,[{id:'both',conditions:c}],arith,{maxClasses:9}).status,'unknown');
 report.push({type:'automatic phase class quotient',classes:all.allowedClasses,groups:all.distinctQueryClasses,largeCoprime:independent.phaseClasses,largeLCM:independent.lcm});
 report.push({type:'joint saturated clock relations',aligned:jointClockDensity(a,c,arith),offset:jointClockDensity(b,c,arith),equations:e,largeLCM:d.period});
}
fs.writeFileSync(__dirname+'/joint-service-clock-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
