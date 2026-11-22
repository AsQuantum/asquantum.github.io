'use strict';
// Real canvas editor handlers + real mobile capture-phase gesture handlers.
// In phone Select mode a swipe beginning on a machine must box-select, NOT
// trigger "machine-press" / implicit Move. A separately activated Move preview
// must travel the full distance of the *first* swipe, without a one-tile freeze.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const canvas=fs.readFileSync(path.join(root,'scripts/ui/canvas.js'),'utf8');
const touch=fs.readFileSync(path.join(root,'scripts/ui/touch-gestures.js'),'utf8');
const from=canvas.indexOf('function onPointerDown(e)');
const to=canvas.indexOf('function rotateSelected(steps)',from);
assert(from>=0&&to>from,'actual canvas pointer handlers are present');
const handlers={},marqueeResults=[],moveResults=[],stats={machinePress:0,draws:0};
const map={
 addEventListener(type,fn,opts){assert.equal(opts.capture,true);handlers[type]=fn},
 getBoundingClientRect(){return{left:0,top:0,width:400,height:640}},
 setPointerCapture(){},hasPointerCapture(){return false},releasePointerCapture(){}
};
const mobile={matches:true,addEventListener(){}};
const scope={
 window:{PointerEvent:function(){},matchMedia:()=>mobile,addEventListener(){}},
 document:{getElementById:id=>id==='map'?map:null},
 Map,Math,console,
 requestAnimationFrame:cb=>cb(),
 canvas:map,camera:{x:0,y:0,z:10},
 tool:'select',stampType:null,draft:null,groupTransform:null,
 marquee:null,drag:null,selection:null,multiSelection:null,
 spaceDown:false,hoverCell:null,
 $:()=>({textContent:''}),
 eventCoords:e=>({x:e.clientX,y:e.clientY}),
 screenToCell:(x,y)=>({x:Math.floor(x/10),y:Math.floor(y/10)}),
 cellMachine:(x,y)=>x>=5&&x<8&&y>=5&&y<8?{id:'m1'}:null,
 portAt:()=>null,cellRoutes:()=>[],routeTile:()=>null,
 inMap:(x,y)=>x>=0&&y>=0&&x<72&&y<72,
 clearGroupSelection(){},inspectorRefresh(){},updateDraftPreview(){},
 resetEditorMode(){},draw(){stats.draws++},
 beginMachineDragPress(id,pt,c,pid){
  stats.machinePress++;
  scope.selection={machineId:id};
  scope.drag={kind:'machine-press',pointerId:pid};
 },
 updateMachineDragPress(){throw Error('select swipe should never update machine drag')},
 selectGroupRectangle(a,b){marqueeResults.push({from:{...a},to:{...b}})},
 moveGroupPreviewTo(cell){
  const t=scope.groupTransform;
  t.x=cell.x-t.anchor.x;
  t.y=cell.y-t.anchor.y;
  moveResults.push({x:t.x,y:t.y});
 },
 updateGroupControls(){},getStampMachine:()=>({x:0,y:0}),
 dims:()=>[3,3],commitGroupTransform(){throw Error('drag cannot commit')},
 onPointerSelected:()=>{}
};
vm.createContext(scope);
vm.runInContext(canvas.slice(from,to),scope,{filename:'canvas.js:pointer-handlers'});
vm.runInContext(touch,scope,{filename:'touch-gestures.js'});
const fire=(type,id,x,y)=>handlers[type]({
 pointerType:'touch',pointerId:id,clientX:x,clientY:y,button:0,
 preventDefault(){},stopImmediatePropagation(){}
});
const plain=obj=>JSON.parse(JSON.stringify(obj));

// 1. Swipe begins on a MACHINE. Mobile defaults to selection rectangle.
// First move crosses 9px touch threshold, later moves must keep expanding box.
fire('pointerdown',1,55,55);
fire('pointermove',1,68,67);
fire('pointermove',1,95,105);
fire('pointermove',1,137,145);
fire('pointerup',1,137,145);
assert.equal(stats.machinePress,0,'drag must not enter machine edit/move mode');
assert.equal(scope.groupTransform,null,'no preview may be started by marquee');
assert.equal(marqueeResults.length,1);
assert.deepEqual(plain(marqueeResults[0]),{from:{x:5,y:5},to:{x:13,y:14}});
assert.equal(scope.drag,null);
assert.equal(scope.marquee,null);

// 2. Stationary tap DOES select a machine through the real canvas handler.
fire('pointerdown',2,55,55);fire('pointerup',2,55,55);
assert.equal(stats.machinePress,1,'tap machine to select is preserved');
assert.deepEqual(plain(scope.selection),{machineId:'m1'});

// 3. Explicit Move button already started a preview before touch-down.
// It must keep following the first continuous finger drag, not stop at 1 tile.
scope.drag=null;scope.groupTransform={
 mode:'move',x:17,y:21,anchor:{x:2,y:1},plan:{machines:[{id:'m1',x:17,y:21,w:3,h:3}]}
};
fire('pointerdown',3,185,225);
fire('pointermove',3,197,238);
assert.deepEqual(plain({x:scope.groupTransform.x,y:scope.groupTransform.y}),{x:18,y:22},
 'first move of the gesture should move the preview one tile');
fire('pointermove',3,246,285);
assert.deepEqual(plain({x:scope.groupTransform.x,y:scope.groupTransform.y}),{x:23,y:27},
 'later moves within THE SAME gesture must keep moving the preview');
fire('pointermove',3,306,335);
assert.deepEqual(plain({x:scope.groupTransform.x,y:scope.groupTransform.y}),{x:29,y:32},
 'long first swipe must use its entire displacement');
fire('pointerup',3,306,335);
assert.equal(moveResults.length,3);
assert.deepEqual(plain({x:scope.groupTransform.x,y:scope.groupTransform.y}),{x:29,y:32},
 'lifting finger leaves pending preview; no placement');

// 4. Two fingers must not begin a selection or a machine move.
scope.groupTransform=null;const previous=marqueeResults.length,press=stats.machinePress;
fire('pointerdown',4,55,55);
fire('pointerdown',5,155,55);
fire('pointermove',5,195,55);
fire('pointerup',5,195,55);
fire('pointerup',4,55,55);
assert.equal(marqueeResults.length,previous);
assert.equal(stats.machinePress,press);
assert.equal(scope.groupTransform,null);
assert(scope.camera.z>10,'pinch remains enabled');
console.log('PASS mobile selection swipe over machine = marquee; tap selects; explicit move follows all first-swipe frames; pinch stays safe');
