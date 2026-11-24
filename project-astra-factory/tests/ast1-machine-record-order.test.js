'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=['data/catalog','blueprints/machine-ids','blueprints/item-ids',
 'core/state','core/machines','core/routing','core/audit',
 'core/selection-transform','core/editor','engine/steady-flow',
 'core/compact-json','blueprints/ast1-codec'];
const bundle=files.map(f=>fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8')).join('\n;\n');
const fixture=fs.readFileSync(path.join(root,'tests/fixtures/ast1-warehouse-port-balance-v1.txt'),'utf8').trim();
function run(fn){
 const map={getContext(){return{};},getBoundingClientRect(){return{left:0,top:0};}};
 const document={getElementById(id){return id==='map'?map:
  {style:{},textContent:'',className:'',classList:{add(){},remove(){},toggle(){}}}},
  querySelectorAll(){return[]}};
 return new Function('document','assert','fixture','atob','btoa',
  bundle+'\nfunction afterChange(){synchronizeAst1MachineRecords();}\n('+fn.toString()+')()')(
  document,assert,fixture,atob,btoa);
}
test('AST1 export uses numeric original machine record IDs even if JS array is externally shuffled',()=>run(function(){
 state=ast1Decode(fixture);
 assert.equal(ast1Encode(),fixture,'original AST1 is byte-for-byte reproducible');
 state.machines.reverse();
 assert.equal(ast1Encode(),fixture,'M10 must follow M9, never lexical order and never accidental array order');
 assert.equal(state.machines[0].id,'M114','export does not mutate runtime machine array');
}));
test('delete AST1 record renumbers ALL following machines and preserves attached belts',()=>run(function(){
 state=ast1Decode(fixture);
 const before=state.machines.map(m=>({id:m.id,type:m.type,x:m.x,y:m.y}));
 const oldRoutes=state.routes.map(r=>({id:r.id,from:r.from.id,to:r.to?.id||null}));
 const removed=10;
 const expectedRoute=oldRoutes.find(r=>+r.from.slice(1)>removed&&r.to&&+r.to.slice(1)>removed);
 assert(expectedRoute,'need a downstream route to verify index shifting');
 removeMachine('M'+removed);
 assert.equal(state.machines.length,114);
 assert.deepEqual(state.machines.map(m=>m.id),Array.from({length:114},(_,i)=>'M'+i));
 for(let i=0;i<state.machines.length;i++){
  const original=before[i<removed?i:i+1];
  assert.equal(state.machines[i].type,original.type,'machine type preserved at shifted record '+i);
  assert.equal(state.machines[i].x,original.x);
  assert.equal(state.machines[i].y,original.y);
 }
 const route=state.routes.find(r=>r.id===expectedRoute.id);
 assert(route);
 assert.equal(route.from.id,'M'+(+expectedRoute.from.slice(1)-1));
 assert.equal(route.to.id,'M'+(+expectedRoute.to.slice(1)-1));
 assert(state.routes.every(r=>state.machines.some(m=>m.id===r.from.id)));
 assert(state.routes.every(r=>!r.to||state.machines.some(m=>m.id===r.to.id)));
 assert.doesNotThrow(()=>ast1Encode(),'shifted physical source/target IDs must still export');
}));
test('new AST1 machine after deletion takes next tail ID and selected editor references follow',()=>run(function(){
 state=ast1Decode(fixture);
 removeMachine('M12');
 const total=state.machines.length;
 const inserted={...copy(state.machines[5]),id:'m1005',x:10,y:12};
 state.machines.push(inserted);
 selection={machineId:'m1005'};
 multiSelection={machineIds:['m1005','M14'],routeIds:[]};
 draft={from:{id:'m1005',port:0}};
 synchronizeAst1MachineRecords();
 assert.equal(state.machines.length,115);
 assert.equal(state.machines.at(-1).id,'M114');
 assert.equal(selection.machineId,'M114');
 assert.equal(multiSelection.machineIds[0],'M114');
 assert.equal(draft.from.id,'M114');
 assert.deepEqual(state.machines.map(m=>m.id),Array.from({length:115},(_,i)=>'M'+i));
 assert.equal(total,114);
}));
test('AST1 group MOVE changes coordinates without silently moving machine record to tail',()=>run(function(){
 state=ast1Decode(fixture);
 const before=state.machines.map(m=>m.id);
 selection={machineId:'M29'};
 multiSelection=null;
 const source=selectedGroupData();
 const plan=createGroupPlan({source,mode:'move',rotation:0,
  x:source.bounds.x+2,y:source.bounds.y+2});
 assert.deepEqual(plan.candidate.machines.map(m=>m.id),before);
 assert.equal(plan.candidate.machines[29].id,'M29');
 assert.equal(plan.candidate.machines[29].x,state.machines[29].x+2);
 assert.equal(plan.candidate.machines[29].y,state.machines[29].y+2);
}));
test('generic JSON machine identities remain stable; game export still assigns sequential record indices',()=>run(function(){
 const a={id:'external-alpha',type:'垃圾',x:5,y:5,face:'E',mode:0};
 const b={id:'external-beta',type:'垃圾',x:15,y:5,face:'E',mode:0};
 state={name:'custom',machines:[a,b],routes:[]};
 assert.equal(synchronizeAst1MachineRecords(),false);
 assert.deepEqual(state.machines.map(m=>m.id),['external-alpha','external-beta']);
 const game=ast1Decode(ast1Encode());
 assert.deepEqual(game.machines.map(m=>m.id),['M0','M1']);
}));
test('AST1 renumbering does not edit blueprint metadata or output filters',()=>run(function(){
 state=ast1Decode(fixture);
 const unchanged=state.machines[37].ast1Meta.record.slice();
 const filters=JSON.stringify(state.machines[37].outFilters);
 removeMachine('M10');
 assert.deepEqual(state.machines[36].ast1Meta.record,unchanged);
 assert.equal(JSON.stringify(state.machines[36].outFilters),filters);
}));

test('AST1 batch-delete compacts record numbers and leaves every surviving route endpoint valid',()=>run(function(){
 state=ast1Decode(fixture);
 multiSelection={machineIds:['M4','M9','M12'],routeIds:[]};
 selection=null;
 deleteGroupSelection();
 assert.equal(state.machines.length,112);
 assert.deepEqual(state.machines.map(m=>m.id),Array.from({length:112},(_,i)=>'M'+i));
 assert(state.routes.every(r=>state.machines.some(m=>m.id===r.from.id)));
 assert(state.routes.every(r=>!r.to||state.machines.some(m=>m.id===r.to.id)));
}));
test('undo/redo restores the AST1 record sequence with matching route machine references',()=>run(function(){
 state=ast1Decode(fixture);
 const before=ast1Encode();
 removeMachine('M24');
 assert.equal(state.machines.length,114);
 undo();
 assert.equal(state.machines.length,115);
 assert.deepEqual(state.machines.map(m=>m.id),Array.from({length:115},(_,i)=>'M'+i));
 assert.equal(ast1Encode(),before,'undo must exactly restore original game bytes');
 redo();
 assert.equal(state.machines.length,114);
 assert.deepEqual(state.machines.map(m=>m.id),Array.from({length:114},(_,i)=>'M'+i));
 assert(state.routes.every(r=>state.machines.some(m=>m.id===r.from.id)));
}));

test('deleting a middle AST1 belt compacts R IDs while preserving every remaining path and machine endpoint',()=>run(function(){
 state=ast1Decode(fixture);
 const before=state.routes.map(r=>({id:r.id,path:JSON.stringify(r.path),from:r.from.id,to:r.to?.id||null}));
 const removed=10,old=before[11],id=state.routes[10].id;
 deleteRoute(id);
 assert.equal(state.routes.length,83);
 assert.deepEqual(state.routes.map(r=>r.id),Array.from({length:83},(_,i)=>'R'+i));
 const shifted=state.routes[10];
 assert.equal(shifted.id,'R10');
 assert.equal(JSON.stringify(shifted.path),old.path);
 assert.equal(shifted.from.id,old.from);
 assert.equal(shifted.to?.id||null,old.to);
 assert.equal(ast1Decode(ast1Encode()).routes.length,83);
}));
test('route selection, belt trim and active draft are remapped after a preceding belt is removed',()=>run(function(){
 state=ast1Decode(fixture);
 const route=state.routes[21],beforePath=JSON.stringify(route.path);
 selection={routeId:route.id};
 beltTrim={routeId:route.id,index:3,cell:[...route.path[3]],hoverAnchor:true};
 draft={from:copy(route.from),routeId:route.id,path:copy(route.path),phase:'editing'};
 state.routes.splice(4,1);
 synchronizeAst1MachineRecords();
 assert.equal(selection.routeId,'R20');
 assert.equal(beltTrim.routeId,'R20');
 assert.equal(draft.routeId,'R20');
 assert.equal(JSON.stringify(state.routes[20].path),beforePath);
}));
