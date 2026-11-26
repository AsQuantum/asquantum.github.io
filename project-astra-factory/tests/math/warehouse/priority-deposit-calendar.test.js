'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ctx,run}=require('../support/production');
function layout(){
 const g={status:'compiled',completePhysicalRoutes:true,nodes:[],lines:[],pools:[{item:'metal',order:['w1','w2']}],frozen:[],unlimited:false};
 const m=(id,type,recipe=null,item)=>g.nodes.push({id,type,recipe,item,physicalInCount:0,physicalOutCount:0});
 const e=(id,from,to,k,length=1,port=0)=>{g.lines.push({id,from,to,materials:[k],rawMaterials:[k],acceptedMaterials:[k],length,toPort:port,fromPort:0,compatible:true,active:true});g.nodes.find(x=>x.id===from).physicalOutCount++;g.nodes.find(x=>x.id===to).physicalInCount++;};
 m('sink','仓入');
 for(let i=0;i<3;i++){
  m('s'+i,'生产',{inputs:{},output:'raw',qty:3,seconds:3});
  m('r'+i,'生产',{inputs:{raw:3},output:'scrap',qty:2,seconds:2});
  m('p'+i,'生产',{inputs:{scrap:3},output:'metal',qty:1,seconds:2.5});
  e('a'+i,'s'+i,'r'+i,'raw',2+2*i);e('b'+i,'r'+i,'p'+i,'scrap');e('c'+i,'p'+i,'sink','metal',[2,11,17][i],i);
 }
 m('w1','仓出',null,'metal');m('w2','仓出',null,'metal');
 m('slow','生产',{inputs:{},output:'other',qty:1,seconds:3});
 m('make','生产',{inputs:{metal:1,other:1},output:'final',qty:1,seconds:2});m('out','仓入');m('out2','仓入');
 e('stock','w1','make','metal',3);e('other','slow','make','other',4,1);e('finish','make','out','final');e('competing','w2','out2','metal');
 return g;
}
function check(g){ctx.g=g;return JSON.parse(run('JSON.stringify((()=>{const a=factoryDirectArithmetic(),t=proveWarehouseReadyTrees(g,a);return {cal:proveTandemDepositCalendars(g,a),result:provePriorityCalendarTrees(g,a,t.trees)}})())'));}
test('priority calendar certifies slow tree under arbitrary lower-priority consumption',()=>{
 const g=layout(),r=check(g);assert.deepEqual(r.cal.map(x=>[x.period,x.times]),[[180,[300,380]],[180,[410,490]],[180,[490,570]]]);
 assert(r.result.witnesses.some(w=>w.machine==='w1'&&w.rate==='1/3'));
 const swapped=structuredClone(g);swapped.pools[0].order.reverse();assert.equal(check(swapped).result.relations.length,0);
 const sparse=structuredClone(g);for(const n of sparse.nodes.filter(n=>/^s[0-2]$/.test(n.id)))n.recipe.seconds=30;
 assert.equal(check(sparse).result.relations.length,0);
 const incompatible=structuredClone(g);for(const e of incompatible.lines.filter(e=>/^c[0-2]$/.test(e.id)))e.acceptedMaterials=['wrong'];
 assert.equal(check(incompatible).result.relations.length,0);
});

function pacedLayout(){
 const g=layout();g.lines.find(e=>e.id==='other').length=44;
 g.nodes.find(n=>n.id==='make').recipe.qty=2;
 g.lines.find(e=>e.id==='finish').length=9;
 return g;
}
function paced(g){
 ctx.g=g;return JSON.parse(run('JSON.stringify(provePriorityPacedRecipeCalendars(g,factoryDirectArithmetic()))'));
}
test('priority-paced recipe has an exact startup calendar and eventual dispatch phase',()=>{
 const g=pacedLayout(),p=paced(g),w=p.witnesses[0];
 assert(w);assert.equal(w.batchFirst,500);assert.equal(w.batchPeriod,60);
 assert.deepEqual(w.outputCalendar.times,[630,650]);
 assert.equal(w.sendPeriod,60);assert.equal(w.sendFirst%60,31);
 assert.deepEqual(w.sourceSlots.phases,[20,50,120,140]);
 for(const alter of [g=>g.pools[0].order.reverse(),g=>g.lines.find(e=>e.id==='other').length=4,g=>g.frozen.push({rates:{metal:'-1'}}),g=>g.nodes.find(n=>n.id==='make').recipe.seconds=4]){
  const v=pacedLayout();alter(v);assert.equal(paced(v).witnesses.length,0);
 }
});
function residualLayout(){
 const g=pacedLayout(),line=g.lines.find(e=>e.id==='competing');
 g.nodes=g.nodes.filter(n=>n.id!=='out2');line.to='split';
 g.nodes.push({id:'split',type:'分流',physicalInCount:1,physicalOutCount:3});
 function branch(i,a,T,aux,h){
  const k='extra'+i,id='branch'+i,output='product'+i;
  g.nodes.push({id:'aux'+i,type:'生产',recipe:{inputs:{},output:k,qty:1,seconds:h},physicalInCount:0,physicalOutCount:1},{id,type:'生产',recipe:{inputs:{metal:a,[k]:aux},output,qty:1,seconds:T},physicalInCount:2,physicalOutCount:1},{id:'end'+i,type:'仓入',physicalInCount:1,physicalOutCount:0});
  const e=(name,from,to,item,fp,tp)=>g.lines.push({id:name,from,to,materials:[item],rawMaterials:[item],acceptedMaterials:[item],length:3,fromPort:fp,toPort:tp,active:true,compatible:true});
  e('branchline'+i,'split',id,'metal',i,0);e('auxline'+i,'aux'+i,id,k,0,1);e('endline'+i,id,'end'+i,output,0,0);
 }
 branch(0,4,6,6,1);branch(1,2,6,1,7.5);branch(2,1,20,1,1);
 return g;
}
test('priority residual word proves free sibling equality without choosing a mean allocation',()=>{
 const g=residualLayout();ctx.g=g;
 const p=JSON.parse(run('JSON.stringify((()=>{const a=factoryDirectArithmetic();return proveResidualPrioritySplitterElementLaw(g,a,provePriorityPacedRecipeCalendars(g,a))})())'));
 const w=p.witnesses[0];assert(w);assert.equal(w.rate,'1/3');
 assert.deepEqual(w.free,['branchline0','branchline1']);
 assert.deepEqual(w.word.phases,[30,130,150]);
 assert(p.relations.some(r=>r.coefficients['routeTotal:branchline0']===-1&&r.coefficients['routeTotal:branchline1']===1));
 const v=residualLayout();v.nodes.find(n=>n.id==='aux0').recipe.seconds=10;ctx.g=v;
 assert.equal(JSON.parse(run('JSON.stringify((()=>{const a=factoryDirectArithmetic();return proveResidualPrioritySplitterElementLaw(g,a,provePriorityPacedRecipeCalendars(g,a))})())')).relations.length,0);
});

test('sole free warehouse outlet cools a complete burst calendar by exact ordinal max',()=>{
 const g=layout();g.nodes=g.nodes.filter(n=>!['w1','slow','make','out'].includes(n.id));g.lines=g.lines.filter(e=>!['stock','other','finish'].includes(e.id));g.pools[0].order=['w2'];g.nodes.find(n=>n.id==='out2').type='电脑';
 ctx.g=g;const p=JSON.parse(run('JSON.stringify(proveSingleOutletCalendarElementLaw(g,factoryDirectArithmetic()))'));
 assert.equal(p.witnesses.length,1);assert.equal(p.witnesses[0].rate,'2/3');
 assert.deepEqual(p.witnesses[0].sendPhases,[20,40,60,120,140,160]);
 assert.deepEqual(p.calendars[0].times,[30,50,70,130,150,170]);
 const extra=structuredClone(g);extra.frozen.push({rates:{metal:'-1'}});ctx.g=extra;
 assert.equal(JSON.parse(run('JSON.stringify(proveSingleOutletCalendarElementLaw(g,factoryDirectArithmetic()))')).relations.length,0);
 const blocked=structuredClone(g);blocked.nodes.find(n=>n.id==='out2').type='汇流';ctx.g=blocked;
 assert.equal(JSON.parse(run('JSON.stringify(proveSingleOutletCalendarElementLaw(g,factoryDirectArithmetic()))')).relations.length,0);
 const sparse=structuredClone(g);sparse.lines.find(e=>e.id==='c2').acceptedMaterials=['wrong'];ctx.g=sparse;
 assert.equal(JSON.parse(run('JSON.stringify(proveSingleOutletCalendarElementLaw(g,factoryDirectArithmetic()))')).relations.length,0);
});

test('complete deposit calendars never count certified destruction as stock income',()=>{
 const g=pacedLayout();g.nodes.find(n=>n.id==='out').type='电脑';ctx.g=g;
 const r=JSON.parse(run('JSON.stringify((()=>{const a=factoryDirectArithmetic(),p=provePriorityPacedRecipeCalendars(g,a);return {p,contracts:completeDepositContracts(g,a,p.calendars)}})())'));
 assert.equal(r.p.calendars.length,1);
 assert(!r.contracts.some(c=>c.item==='final'));
});


function spanLayout(){
 const g=residualLayout();
 const add=(id,type,recipe=null)=>g.nodes.push({id,type,recipe,physicalInCount:0,physicalOutCount:0});
 const link=(id,from,to,k,fp=0,tp=0)=>{g.lines.push({id,from,to,materials:[k],rawMaterials:[k],acceptedMaterials:[k],length:3,fromPort:fp,toPort:tp,active:true,compatible:true});g.nodes.find(n=>n.id===from).physicalOutCount++;g.nodes.find(n=>n.id===to).physicalInCount++;};
 add('lens','生产',{inputs:{product0:1,product1:1,plasma:2},output:'lens',qty:1,seconds:15});add('lensend','仓入');
 for(let i=0;i<2;i++){
  add('split'+i,'分流');const e=g.lines.find(e=>e.id==='endline'+i);e.to='split'+i;g.nodes.find(n=>n.id==='split'+i).physicalInCount++;
  g.nodes.find(n=>n.id==='end'+i).physicalInCount--;
  link('productfree'+i,'split'+i,'end'+i,'product'+i,0);link('productlens'+i,'split'+i,'lens','product'+i,1,i);
 }
 add('rawsource','生产',{inputs:{},output:'raw2',qty:3,seconds:3});
 add('transform','生产',{inputs:{raw2:3},output:'mid',qty:2,seconds:2});
 add('fuel','生产',{inputs:{mid:2},output:'fuel',qty:1,seconds:3});
 add('plasma','生产',{inputs:{fuel:2},output:'plasma',qty:1,seconds:5});
 add('plasmasplit','分流');add('plasmaend','仓入');
 link('raw2','rawsource','transform','raw2');link('mid','transform','fuel','mid');link('fuel','fuel','plasma','fuel');link('plasma','plasma','plasmasplit','plasma');link('plasmafree','plasmasplit','plasmaend','plasma',0);link('plasmalens','plasmasplit','lens','plasma',1,2);link('lensout','lens','lensend','lens');
 return g;
}
test('ordinal span composition proves downstream equal split using an independent batch head tree',()=>{
 const g=spanLayout();ctx.g=g;
 const compute='JSON.stringify((()=>{const a=factoryDirectArithmetic(),r=proveSaturatedRouterCounts(g,a),p=proveResidualPrioritySplitterElementLaw(g,a,provePriorityPacedRecipeCalendars(g,a),{freeRoutes:r.freeReceiverRoutes});return proveUnderloadSpanComposition(g,a,p,{freeRoutes:r.freeReceiverRoutes})})())';
 const proof=JSON.parse(run(compute)),w=proof.witnesses.find(w=>w.machine==='lens');
 assert(w,JSON.stringify(proof));assert(w.minimumTicks>w.periodBound);
 assert(proof.relations.some(r=>r.coefficients['routeTotal:productlens0']===1&&r.coefficients['routeTotal:productfree0']===-1));
 g.nodes.find(n=>n.id==='rawsource').recipe.seconds=100;ctx.g=g;
 const slowProof=JSON.parse(run(compute));
 assert(!slowProof.witnesses.some(w=>w.target==='productlens0'));
 assert(slowProof.witnesses.some(w=>w.target==='plasmalens'));
});

test('parallel free outlets: periodic priority-prefix ordinal algebra, including overlapping bursts',()=>{
 const cases=[
  {period:150,phases:[40,40,40,40],m:2,expected:['4/15','4/15']},
  {period:150,phases:[40,70,100,130],m:2,expected:['8/15','0']},
  {period:60,phases:[0,10,25,35,50],m:2,expected:['5/6','5/6']},
  {period:20,phases:[0,0,0],m:2,expected:['1','1']},
  {period:20,phases:[0,0],m:2,expected:['1','1']},
  {period:47,phases:[0,0,7,16,23,31],m:3},
  {period:31,phases:[0,0,5,14],m:3},
 ];
 // Independent finite tick observer, only in tests. The production proof
 // instead uses a finite ordinal graph and exact cycle ratio.
 const asNumber=s=>{const [a,b='1']=s.split('/');return Number(a)/Number(b);};
 for(const c of cases){
  ctx.c=c;const r=JSON.parse(run('JSON.stringify(freeParallelWarehouseOrdinalWord(c,c.m,factoryDirectArithmetic()))'));
  assert(r,JSON.stringify(c));if(c.expected)assert.deepEqual(r.rates,c.expected);
  const counts=Array(c.m).fill(0),next=Array(c.m).fill(0),freq=Array(c.period).fill(0);
  for(const p of c.phases)freq[p]++;
  let stock=0;const warm=c.period*100,span=c.period*1200;
  for(let t=0;t<warm+span;t++){stock+=freq[t%c.period];for(let i=0;i<c.m;i++)if(stock&&t>=next[i]){stock--;next[i]=t+20;if(t>=warm)counts[i]++;}}
  for(let i=0;i<c.m;i++)assert(Math.abs(counts[i]-asNumber(r.rates[i])*span/20)<=2*c.phases.length+2*c.m,JSON.stringify({c,r,counts}));
 }
});

test('unconditional frozen sources provide exact next-tick deposit calendars',()=>{
 ctx.f={id:'source',rates:{metal:'6/5',other:'1/3'}};
 const check=()=>JSON.parse(run("JSON.stringify(independentFrozenDepositCalendar(f,'metal',factoryDirectArithmetic()))"));
 assert.deepEqual(check(),{period:50,times:[18,35,51],actor:'source',item:'metal'});
 ctx.f={id:'source',rates:{metal:'25'}};
 assert.deepEqual(check(),{period:4,times:[2,3,4,5,5],actor:'source',item:'metal'});
 ctx.f={id:'conditional',rates:{metal:'6/5',other:'-1/3'}};
 assert.equal(check(),null);
});
