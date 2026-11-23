'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=['data/catalog','blueprints/machine-ids','blueprints/item-ids',
 'core/state','core/machines','core/routing','core/audit','core/selection-transform',
 'core/editor','ui/editor-controls','ui/canvas','engine/steady-flow',
 'engine/simulation','core/compact-json','blueprints/ast1-codec'];
const bundle=files.map(f=>fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8')).join('\n;\n');
function run(fn){
 const canvas={getContext(){return{};},getBoundingClientRect(){return{left:0,top:0};},setPointerCapture(){}};
 const document={getElementById(id){return id==='map'?canvas:{style:{},textContent:'',classList:{add(){},remove(){}}};},querySelectorAll(){return[];}};
 return new Function('document','assert','atob','btoa','performance',bundle+'\nfunction inspectorRefresh(){}\n('+fn.toString()+')()')(document,assert,atob,btoa,performance);
}
test('0xffff open AST1 and JSON -1 roundtrips',()=>run(function(){
 const m={id:'m1',type:'垃圾',x:10,y:10,face:'E',mode:0},p=outPort(m,0);
 const cells=[[p.ex,p.ey],[p.ex+1,p.ey],[p.ex+1,p.ey+1],[p.ex+2,p.ey+1]];
 state={name:'open',machines:[m],routes:[{id:'r1',from:{id:m.id,port:0},to:null,path:cells}]};
 assert.equal(checkPath(cells,state.routes[0].from,null,'r1'),null);
 const code=ast1Encode(),raw=atob(code.slice(5));
 assert.equal(raw.charCodeAt(15),255);assert.equal(raw.charCodeAt(16),255);
 state=ast1Decode(code);
 assert.equal(state.routes[0].to,null);
 assert.equal(ast1Encode(),code);
 state.routes[0].openEndSide='N';
 const compact=compactFactoryLayout(state);
 assert.equal(compact.routes[0][2],-1);
 const restored=expandCompactFactoryLayout(compact);
 assert.equal(restored.routes[0].to,null);
 assert.equal(restored.routes[0].openEndSide,'N');
}));
test('open belt stops at adjacent inlet and eventually backpressures',()=>run(function(){
 const src={id:'m1',type:'垃圾',x:10,y:10,face:'E',mode:0};
 const dst={id:'m2',type:'废料',x:18,y:9,face:'E',mode:'标准'};
 const p=outPort(src,0),q=inPort(dst,0),cells=[[p.ex,p.ey],[p.ex+1,p.ey],[p.ex+2,p.ey]];
 assert.deepEqual(cells.at(-1),[q.ex,q.ey]);
 state={name:'open',machines:[src,dst],routes:[{id:'r1',from:{id:'m1',port:0},to:null,path:cells}]};
 assert.equal(checkPath(cells,state.routes[0].from,null,'r1'),null);
 assert.deepEqual(warehouseTheory().routeFlows||{},{});
 sim={byMachine:{},routes:{r1:[]},inbound:{},outbound:{},crafts:{},consumed:{}};
 for(const m of state.machines)sim.byMachine[m.id]={inputs:{},portInputs:{},portItems:{},received:{},sent:{},consumed:{},queue:[],busy:0,tick:0,lastSend:{},lastReceive:{},roundRobin:0};
 simTime=0;ware={};for(let i=0;i<1200;i++)simulate(.05);
 assert.equal(sim.routes.r1.length,4);
 assert.equal(Object.keys(sim.inbound).length,0);
 assert.equal(state.routes[0].to,null);
}));
test('marquee keeps only output-connected line prefix',()=>run(function(){
 const a={id:'m1',type:'垃圾',x:10,y:10,face:'E',mode:0},b={id:'m2',type:'废料',x:25,y:9,face:'E',mode:'标准'};
 const p=outPort(a,0),q=inPort(b,0),cells=[];
 for(let x=p.ex;x<=q.ex;x++)cells.push([x,p.ey]);
 const r={id:'r1',from:{id:a.id,port:0},to:{id:b.id,port:0},path:cells};
 state={name:'copy',machines:[a,b],routes:[r]};
 multiSelection={machineIds:[a.id],routeIds:['r1'],bounds:{x:10,y:9,w:8,h:9}};
 const data=selectedGroupData();
 assert.equal(data.routes[0].to,null);assert.deepEqual(data.routes[0].path,cells.slice(0,3));
 const plan=createGroupPlan({source:data,rotation:0,mode:'copy',x:40,y:9});
 assert.equal(plan.valid,true,plan.error);
 multiSelection={machineIds:[b.id],routeIds:['r1'],bounds:{x:24,y:9,w:10,h:9}};
 assert.equal(selectedGroupData().routes.length,0);
}));
test('hover red tail, move outside to extend, clipping retains corner orientation',()=>run(function(){
 draw=function(){};afterChange=function(){};notify=function(){};updateHint=function(){};updateGroupControls=function(){};
 function inspectorRefresh(){}
 camera={x:0,y:0,z:10};
 const a={id:'m1',type:'垃圾',x:10,y:10,face:'E',mode:0},b={id:'m2',type:'废料',x:25,y:9,face:'E',mode:'标准'};
 const p=outPort(a,0);
 state={name:'editor',machines:[a,b],routes:[]};
 const click=(x,y)=>onPointerDown({button:0,pointerId:1,clientX:(x+.5)*10,clientY:(y+.5)*10});
 const move=(x,y)=>onPointerMove({pointerId:1,clientX:(x+.5)*10,clientY:(y+.5)*10});
 tool='belt';click(p.x,p.y);click(p.ex+2,p.ey);
 assert.equal(state.routes.length,1);resetEditorMode();
 assert.equal(state.routes[0].path.length,3);
 tool='belt';click(p.ex+1,p.ey);
 assert.equal(beltTrim.index,1);
 assert.equal(draft.routeId,state.routes[0].id);
 move(p.ex+2,p.ey);assert.equal(beltTrim.index,1,'hover may not move the cut anchor');
 move(p.ex+6,p.ey+3);assert.equal(beltTrim.index,1);
 assert(draft.preview&&draft.preview.length>draft.path.length);
 click(p.ex+2,p.ey);
 assert.equal(state.routes[0].path.length,3,'different red cell cancels, not deletes');
 assert.equal(beltTrim,null);
 click(p.ex+1,p.ey);click(p.ex+1,p.ey);
 assert.equal(state.routes[0].path.length,1,'only exact same cell confirms deletion');
 const r=state.routes[0];
 r.path=[[p.ex,p.ey],[p.ex+1,p.ey],[p.ex+2,p.ey],[p.ex+2,p.ey+1],[p.ex+2,p.ey+2]];
 draft=null;beltTrim=null;
 click(p.ex+2,p.ey+1);
 assert.equal(beltTrim.index,3);
 move(p.ex+1,p.ey);
 assert.equal(beltTrim.index,3,'red suffix remains anchored when cursor moves');
 click(p.ex+2,p.ey+1);
 assert.equal(r.path.length,3);
 assert.equal(r.openEndSide,'S');
 assert.equal(routeTile(r,2).type,'turn');
 assert.equal(checkPath(r.path,r.from,r.to,r.id),null);
 assert.equal(expandCompactFactoryLayout(compactFactoryLayout(state)).routes[0].openEndSide,'S');
 move(p.ex+2,p.ey+3);
 assert(draft.preview&&draft.preview.length>r.path.length);
 click(p.ex+2,p.ey+3);
 assert.equal(r.to,null);
 assert.equal(r.openEndSide,undefined);
}));

test('two open AST1 belts retain independent 0xffff records',()=>run(function(){
 const a={id:'ma',type:'垃圾',x:10,y:10,face:'E',mode:0};
 const b={id:'mb',type:'粒子',x:30,y:10,face:'E',mode:0};
 const ap=outPort(a,0),bp=outPort(b,0);
 const one=[[ap.ex,ap.ey]];
 const two=[[bp.ex,bp.ey],[bp.ex+1,bp.ey],[bp.ex+2,bp.ey],[bp.ex+2,bp.ey+1],[bp.ex+2,bp.ey+2]];
 state={name:'two open ends',machines:[a,b],routes:[
  {id:'r1',from:{id:a.id,port:0},to:null,path:one},
  {id:'r2',from:{id:b.id,port:0},to:null,path:two}
 ]};
 const code=ast1Encode();
 const decoded=ast1Decode(code);
 assert.equal(decoded.routes.length,2);
 assert(decoded.routes.every(r=>r.to===null));
 assert.deepEqual(decoded.routes.map(r=>r.path.length),[1,5]);
 state=decoded;
 assert.equal(ast1Encode(),code,'exact binary roundtrip');
}));

test('one route can cross its previous straight tile at right angles, AST1 roundtrip stays valid',()=>run(function(){
 const machine={id:'m1',type:'垃圾',x:10,y:10,face:'E',mode:0};
 const port=outPort(machine,0),x=port.ex,y=port.ey;
 const prefix=[[x,y],[x+1,y],[x+2,y],[x+3,y],[x+3,y+1],
  [x+3,y+2],[x+2,y+2],[x+1,y+2],[x+1,y+1]];
 const source={id:machine.id,port:0};
 const route={id:'r1',from:source,to:null,path:prefix};
 state={name:'self-cross',machines:[machine],routes:[route]};
 assert.equal(checkPath(prefix,source,null,route.id),null);
 draft={from:source,routeId:route.id,path:copy(prefix),history:[],preview:null};
 const completed=draftSegment([x+1,y-2]);
 assert(completed,'A* must find a legal perpendicular self-crossing');
 const locations=completed.map((p,i)=>p[0]===x+1&&p[1]===y?i:-1).filter(i=>i>=0);
 assert.deepEqual(locations,[1,9],'one horizontal and one vertical visit to the same tile');
 route.path=completed;
 assert.equal(checkPath(route.path,route.from,route.to,route.id),null);
 assert.equal(routeTile(route,1).axis,'H');
 assert.equal(routeTile(route,9).axis,'V');
 camera={x:0,y:0,z:10};
 const horizontal=beltCellHit({x:x+1,y},{x:(x+1+.85)*10,y:(y+.5)*10});
 const vertical=beltCellHit({x:x+1,y},{x:(x+1+.5)*10,y:(y+.85)*10});
 assert.equal(horizontal.index,1,'horizontal strand selected by horizontal side');
 assert.equal(vertical.index,9,'vertical strand selected by vertical side');
 const encoded=ast1Encode();
 state=ast1Decode(encoded);
 assert.equal(state.routes[0].to,null);
 assert.equal(checkPath(state.routes[0].path,state.routes[0].from,null,state.routes[0].id),null);
 assert.equal(ast1Encode(),encoded);
}));
test('clicking open belt final cell enables continuation, invalid reverse click cancels',()=>run(function(){
 draw=function(){};afterChange=function(){};notify=function(){};updateHint=function(){};updateGroupControls=function(){};
 camera={x:0,y:0,z:10};
 const machine={id:'m1',type:'垃圾',x:10,y:10,face:'E',mode:0};
 const p=outPort(machine,0);
 const route={id:'r1',from:{id:machine.id,port:0},to:null,
  path:[[p.ex,p.ey],[p.ex+1,p.ey],[p.ex+2,p.ey]]};
 state={name:'open',machines:[machine],routes:[route]};
 const click=(x,y)=>onPointerDown({button:0,pointerId:1,clientX:(x+.5)*10,clientY:(y+.5)*10});
 const move=(x,y)=>onPointerMove({pointerId:1,clientX:(x+.5)*10,clientY:(y+.5)*10});
 tool='belt';
 click(p.ex+2,p.ey);
 assert.equal(beltTrim.index,2);
 assert.deepEqual(beltTrim.cell,[p.ex+2,p.ey]);
 assert.equal(draft.routeId,'r1');
 move(p.ex+4,p.ey+2);
 assert.equal(beltTrim.index,2,'anchor remains last tile');
 assert.equal(beltTrim.hoverOutside,true);
 assert(draft.preview&&draft.preview.length>route.path.length);
 click(p.ex+4,p.ey+2);
 assert.equal(route.to,null);
 assert(route.path.length>3,'valid off-belt click extends');
 const savedLength=route.path.length;
 resetEditorMode();tool='belt';
 const last=route.path.at(-1);
 click(...last);
 assert.equal(beltTrim.index,savedLength-1);
 const behind=route.path.at(-2);
 click(...behind);
 assert.equal(route.path.length,savedLength,'backwards click never deletes or reverses');
 assert.equal(beltTrim,null);
 assert.equal(draft,null);
}));
test('connected belt deletion requires the identical tile, including its last inlet-adjacent tile',()=>run(function(){
 draw=function(){};afterChange=function(){};notify=function(){};updateHint=function(){};updateGroupControls=function(){};
 camera={x:0,y:0,z:10};
 const a={id:'m1',type:'垃圾',x:10,y:10,face:'E',mode:0};
 const b={id:'m2',type:'废料',x:25,y:9,face:'E',mode:'标准'};
 const p=outPort(a,0),q=inPort(b,0),cells=[];
 for(let x=p.ex;x<=q.ex;x++)cells.push([x,p.ey]);
 const route={id:'r1',from:{id:a.id,port:0},to:{id:b.id,port:0},path:cells};
 state={name:'connected',machines:[a,b],routes:[route]};
 assert.equal(checkPath(route.path,route.from,route.to,route.id),null);
 tool='belt';
 const click=(x,y)=>onPointerDown({button:0,pointerId:1,clientX:(x+.5)*10,clientY:(y+.5)*10});
 const middle=cells[2],later=cells[4],last=cells.at(-1);
 click(...middle);
 assert.equal(beltTrim.index,2);
 click(...later);
 assert.equal(route.path.length,cells.length,'different red suffix tile cancels selection');
 assert.equal(route.to.id,b.id);
 assert.equal(beltTrim,null);
 click(...last);
 assert.equal(beltTrim.index,cells.length-1);
 assert.equal(route.to.id,b.id);
 click(...last);
 assert.equal(route.path.length,cells.length-1);
 assert.equal(route.to,null,'click exact last belt tile disconnects inlet');
}));
