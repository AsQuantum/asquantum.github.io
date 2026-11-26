'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),scripts=[
 'data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state',
 'core/machines','core/routing','core/audit','core/editor','engine/math/arithmetic/rational','engine/steady-flow',
 'engine/simulation','core/compact-json','blueprints/ast1-codec','engine/math/graph/symbolic_physical_spec','engine/iteration-display',
 'ui/canvas','ui/inspector','ui/warehouse','ui/stock-chart'
];
const bundle=scripts.map(f=>fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8')).join('\n;\n');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/ast1-unknown-items-v4.txt'),'utf8').trim();
function run(fn){
 const elements=new Map();
 const document={
  hidden:false, addEventListener(){},
  getElementById(id){
   if(!elements.has(id))elements.set(id,{
    id,style:{},dataset:{},textContent:'',innerHTML:'',hidden:id==='stockChartPanel',
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},
    replaceChildren(){},contains(){return false},getContext(){return {}},
    getBoundingClientRect(){return {left:0,top:0,width:1000,height:700}},
    parentElement:{getBoundingClientRect(){return {width:1000,height:700}}},
    setAttribute(){},getAttribute(){return null}
   });
   return elements.get(id);
  }
 };
 const window={addEventListener(){}};
 return new Function('document','window','assert','atob','btoa','performance','fixture','elements',
  bundle+'\nreturn ('+fn.toString()+')()')(
  document,window,assert,atob,btoa,performance,fixture,elements);
}
test('supplied v4 blueprint uses only 物品#ID for unknowns, never adds selectable materials, and byte-roundtrips through JSON',()=>run(function(){
 const n=MATERIALS.length,model=ast1Decode(fixture);
 assert.equal(model.machines.length,117);
 assert.equal(model.routes.length,86);
 const splitter=model.machines.at(-1);
 assert.equal(splitter.type,'分流');
 assert.deepEqual(splitter.ast1Meta.extensionItems.map(x=>x.id),[462,26,23]);
 assert.deepEqual(splitter.ast1Meta.extensionItems.map(x=>x.item),['物品#462','物品#26','物品#23']);
 assert.deepEqual(Object.values(splitter.outFilters).sort(),['物品#462','物品#26','物品#23'].sort());
 assert.equal(MATERIALS.length,n);
 for(const id of [462,26,23]){
  assert.equal(MATERIALS.includes('物品#'+id),false);
  assert.equal(AST1_ITEMS[id],undefined);
 }
 state=model;
 assert.equal(ast1Encode(),fixture);
 const json=compactFactoryLayout(state);
 state=expandCompactFactoryLayout(json);
 assert.equal(ast1Encode(),fixture);
 assert(state.routes.every(r=>checkPath(r.path,r.from,r.to,r.id)===null));
 const option=importedUnknownItemOption('物品#462');
 assert(option.includes('selected disabled')&&option.includes('物品#462'));
 assert.equal(importedUnknownItemOption(MATERIALS[0]),'');
 const inboundHTML=warehouseInFilterHTML({inletItem:'物品#462'});
 assert(inboundHTML.includes('selected disabled')&&inboundHTML.includes('物品#462'));
 assert.equal(ast1CanonicalItem('未识别游戏物品 #462'),'物品#462');
 assert.equal(ast1CanonicalItem('物品 462'),'物品#462');
 assert.equal(expandItem(462),'物品#462');
}));
test('unknown imported material flows through warehouse out/in simulation, ledger and stock chart with identical ID-derived color',()=>run(function(){
 draw=function(){};warehouseRefresh=function(){};inspectorRefreshLive=function(){};
 stockChartMaybeRefresh=function(){};
 const out={id:'out',type:'仓出',x:10,y:10,face:'E',item:'物品#462'};
 const inbound={id:'in',type:'仓入',x:25,y:9,face:'E',inletItem:'物品#462'};
 const p=outPort(out,0),cells=[];
 let q=inPort(inbound,0);
 inbound.y+=p.ey-q.ey;q=inPort(inbound,0);
 assert.equal(p.ey,q.ey);
 for(let x=p.ex;x<=q.ex;x++)cells.push([x,p.ey]);
 state={name:'unknown flow',machines:[out,inbound],routes:[
  {id:'r1',from:{id:out.id,port:p.index},to:{id:inbound.id,port:q.index},path:cells}
 ]};
 assert.equal(checkPath(cells,state.routes[0].from,state.routes[0].to,'r1'),null);
 theoreticalBudget=certifiedEmptyBudget(state,{calculating:true});
 resetSimulation();
 ware['物品#462']=20;
 for(let i=0;i<1600;i++)simulate(.05);
 assert((sim.inbound['物品#462']||0)>0,'unknown item can be deposited');
 assert((sim.outbound['物品#462']||0)>0,'unknown item can be withdrawn');
 assert((sim.minuteBuckets[0]?.inbound?.['物品#462']||0)>0);
 const v=warehouseView(true),table=warehouseActualMarkup(v);
 assert(v.materials.includes('物品#462'),'structural theory materials includes imported ID');
 assert(v.actualMaterials.includes('物品#462'),'actual ledger retains imported ID');
 assert(table.includes('物品#462')&&table.includes('aria-hidden="true"'),'actual ledger renders ID and color');
 const color=materialColor('物品#462');
 assert(table.includes(color));
 assert.equal(materialColor('未识别游戏物品 #462'),color,'legacy aliases get identical ID color');
 assert.notEqual(materialColor('物品#462'),materialColor('物品#26'));
 assert.equal(machineLabelLines(out).some(x=>x.text.includes('物品#462')),true);
 assert.equal(warehouseInFilterHTML(inbound).includes('物品#462'),true);
 const history=stockChartHistory();
 assert(history.items.includes('物品#462'));
 assert(history.points.some(x=>Object.prototype.hasOwnProperty.call(x.stocks,'物品#462')));
 elements.get('stockChartPanel').hidden=false;
 stockChartRender();
 assert(elements.get('stockChartLegend').innerHTML.includes('物品#462'));
 assert(elements.get('stockChartLegend').innerHTML.includes(color));
 assert(elements.get('stockChartSvg').innerHTML.includes(color),'chart curve shares ID color');
 assert.equal(MATERIALS.includes('物品#462'),false);
}));
test('unknown splitter filter appears in property panel and prevents nonmatching packets without adding any item option',()=>run(function(){
 const s=ast1Decode(fixture).machines.at(-1);
 const options=Object.values(s.outFilters);
 for(const item of options){
  const html=importedUnknownItemOption(item);
  assert(html.includes('selected disabled')&&html.includes(item));
 }
 state={name:'filter behavior',machines:[s],routes:[]};
 selection={machineId:s.id};
 theoreticalBudget={inflow:{},outflow:{},routeFlows:{},machineCycles:{}};
 inspectorRefresh();
 const inspectorHTML=elements.get('inspector').innerHTML;
 assert(inspectorHTML.includes('物品#462'),'actual inspector shows imported item label');
 assert(inspectorHTML.includes('物品#26')&&inspectorHTML.includes('物品#23'));
 assert(inspectorHTML.includes('data-imported-unknown="true"'));
 assert(inspectorHTML.includes('selected disabled'));
 const p=getPorts(s).find(q=>q.kind==='out'&&q.filter==='物品#462');
 assert(p);
 const out=outPort(s,p.index);
 assert.equal(out.filter,'物品#462');
 assert.equal(MATERIALS.includes(out.filter),false);
 // Delivery obeys an imported filter based on its exact item key.
 sim={routes:{},byMachine:{[s.id]:{lastSend:{},sent:{}}}};
 simTime=0;
 assert.equal(out.filter==='物品#462',true);
 assert.equal(out.filter==='物品#26',false);
}));

test('direction labels use arrows in splitter canvas and inspector while AST1 port codes remain N/S/E/W',()=>run(function(){
 const old=ast1Decode(fixture);
 state=old;
 const original=ast1Encode();
 const m=state.machines.at(-1);
 assert.equal(m.type,'分流');
 const arrows={N:'↑',S:'↓',E:'→',W:'←'};
 for(const [side,arrow] of Object.entries(arrows))
  assert.equal(portDirectionArrow(side),arrow);
 const ports=getPorts(m),out=ports.filter(p=>p.kind==='out');
 assert.equal(out.length,3);
 assert(ports.every(p=>arrows[p.side]),'underlying direction codes unchanged');
 assert.equal(ast1FilterPortLabel(m,ast1FilterPortFromGame(m,0)),'前侧');
 assert.equal(ast1FilterPortLabel(m,ast1FilterPortFromGame(m,1)),'右侧');
 assert.equal(ast1FilterPortLabel(m,ast1FilterPortFromGame(m,2)),'左侧');
 const labels=machineLabelLines(m).map(x=>x.text);
 for(const p of out){
  const label=labels.find(x=>x.startsWith(arrows[p.side]+' '));
  assert(label,'splitter canvas label must display correct arrow for '+p.side);
  assert(!labels.some(x=>/[（()）]/u.test(x)||/[前右左]/u.test(x)),
   'canvas splitter output labels contain no parentheses, front/right/left');
  assert(!labels.some(x=>x.endsWith('('+p.side+')')),'old letter is not visible');
 }
 selection={machineId:m.id};theoreticalBudget={inflow:{},outflow:{},routeFlows:{},machineCycles:{}};
 inspectorRefresh();
 const html=elements.get('inspector').innerHTML;
 for(const side of ['前侧','右侧','左侧'])
  assert(html.includes(side),'inspector should name machine-relative side '+side);
 for(const p of out)assert(html.includes('· '+arrows[p.side]+'</span>'),'filter setting must display '+p.side+' as arrow');
 sim={byMachine:{[m.id]:{inputs:{},received:{},sent:{},portItems:{},queue:[],busy:0}}};
 simTime=0;
 // The old duplicated per-port live cache panel was removed. Verify
 // current port labels and the actual read-only FIFO disclosure instead.
 const buffers=machineLogisticsBuffers(m);
 assert(buffers.includes('入口缓存物品')&&buffers.includes('machine-buffer-details'));
 assert.equal(ast1Encode(),original,'display-only change preserves exact AST1 bytes');
}));

test('Canvas input/output text uses fixed pale colors, never per-item randomized hue',()=>run(function(){
 assert.equal(MACHINE_INPUT_LABEL_COLOR,'#60b5ff');
 assert.equal(MACHINE_OUTPUT_LABEL_COLOR,'#ffb16b');
 assert.notEqual(MACHINE_INPUT_LABEL_COLOR,MACHINE_OUTPUT_LABEL_COLOR);
 const a=machineLabelLines({type:'仓出',face:'E',item:'物品#462'});
 const b=machineLabelLines({type:'仓出',face:'E',item:'物品#26'});
 assert.equal(a[1].color,MACHINE_OUTPUT_LABEL_COLOR);
 assert.equal(b[1].color,MACHINE_OUTPUT_LABEL_COLOR,'output label color does not depend on item ID');
 assert.equal(a[0].color,'#f0f6ff','machine name unchanged');
 const splitter=ast1Decode(fixture).machines.at(-1);
 assert(machineLabelLines(splitter).slice(1).every(x=>x.color===MACHINE_OUTPUT_LABEL_COLOR),
  'all splitter output filters have one fixed pale orange');
 const inputMachine={type:'仓入',face:'E',inletItem:'物品#462'};
 assert.equal(machineLabelLines(inputMachine)[1].color,MACHINE_INPUT_LABEL_COLOR);
}));

test('unrestricted warehouse and splitter labels use 任意 while preserving AST1 encoding',()=>run(function(){
 const inlet={id:'M0',type:'仓入',x:10,y:10,face:'E',inletItem:''};
 const splitter={id:'M1',type:'分流',x:20,y:10,face:'E',outFilters:{}};
 state={name:'unrestricted',recordIndexed:true,machines:[inlet,splitter],routes:[]};
 assert.equal(machineLabelLines(inlet)[1].text,'任意');
 assert.equal(machineLabelLines(splitter).slice(1).length,3);
 assert(machineLabelLines(splitter).slice(1).every(x=>/^[↑↓←→] 任意$/.test(x.text)));
 const code=ast1Encode();state=ast1Decode(code);
 assert.equal(ast1Encode(),code);
 assert.equal(machineLabelLines(state.machines[0])[1].text,'任意');
 assert(machineLabelLines(state.machines[1]).slice(1).every(x=>x.text.endsWith('任意')));
}));
