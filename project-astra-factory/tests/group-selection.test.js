'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=__dirname+'/..';
const ctx=vm.createContext({console,document:{getElementById:()=>({style:{},textContent:'',disabled:false}) ,querySelectorAll:()=>[]},window:{},localStorage:{setItem(){}},Math,JSON,Set,Map,Number,Array});
for(const file of ['scripts/data/catalog.js','scripts/core/machines.js','scripts/core/routing.js','scripts/core/selection-transform.js']){
 vm.runInContext(fs.readFileSync(root+'/'+file,'utf8'),ctx,{filename:file});
}
vm.runInContext(`
let state={machines:[],routes:[]},multiSelection=null,groupTransform=null,groupClipboard=null,marquee=null,selection=null;
let hoverCell={x:4,y:5},idSeed=900,stampType=null,draft=null,beltTrim=null,tool='select',drag=null,spaceDown=false;
const copy=v=>JSON.parse(JSON.stringify(v)), $=id=>document.getElementById(id);
const snapshot=()=>{},afterChange=()=>{},notify=()=>{},draw=()=>{},inspectorRefresh=()=>{};
const updateHint=()=>{};
function ast1MirrorFace(f){return {E:'W',W:'E',N:'N',S:'S'}[f];}
function ast1FilterPortFromGame(m,i){return i;}
`,ctx);
const evalJS=s=>vm.runInContext(s,ctx);
evalJS(`state.machines=[{id:'m1',type:'分流',x:3,y:3,face:'E'},{id:'m2',type:'汇流',x:17,y:3,face:'E'},{id:'m3',type:'仓入',x:39,y:3,face:'E'}]`);
assert(evalJS('getPorts(state.machines[0]).length')===4);
const routeCreated=evalJS(`
const a=state.machines[0],b=state.machines[1],p=outPort(a,0),q=inPort(b,0);
const path=pathSearch([p.ex,p.ey],[q.ex,q.ey],new Set(),{startPrev:[p.x,p.y],endNext:[q.x,q.y]});
if(!path)throw Error('No path');
state.routes.push({id:'r1',from:{id:a.id,port:0},to:{id:b.id,port:0},path});
checkPath(path,state.routes[0].from,state.routes[0].to,state.routes[0].id);
`);
assert.strictEqual(routeCreated,null);
evalJS(`multiSelection={machineIds:['m1','m2'],routeIds:['r1']};`);
evalJS(`startGroupTransform('move');`);
assert(evalJS('groupTransform.plan.valid'));
evalJS(`groupTransform.x=3;groupTransform.y=13;updateGroupPreview()`);
assert(evalJS('groupTransform.plan.valid'));
assert(evalJS('groupTransform.plan.routes.length')===1);
evalJS(`rotateGroup(1);`);
assert(evalJS('groupTransform.plan.valid'),evalJS('groupTransform.plan.error'));
assert(evalJS('groupTransform.plan.routes[0].path.length')>1);
evalJS('commitGroupTransform()');
assert(evalJS('state.machines[0].x!==3||state.machines[0].y!==3'));
assert(evalJS('state.routes.length')===1);
evalJS('copyGroupSelection();pasteGroup();groupTransform.x=47;groupTransform.y=8;updateGroupPreview()');
assert(evalJS('groupTransform.plan.valid'),evalJS('groupTransform.plan.error'));
evalJS('commitGroupTransform()');
assert(evalJS('new Set(state.machines.map(x=>x.id)).size===state.machines.length'));
assert(evalJS('new Set(state.routes.map(x=>x.id)).size===state.routes.length'));
assert(evalJS('state.routes.length')===2);
evalJS('multiSelection={machineIds:[state.machines[0].id],routeIds:[]};startGroupTransform("move");groupTransform.x=35;groupTransform.y=35;updateGroupPreview()');
assert(!evalJS('groupTransform.plan.valid'));

// A single clicked machine can use the same move/copy/rotate preview APIs.
evalJS('cancelGroupTransform();multiSelection=null;selection={machineId:state.routes[0].from.id}');
assert.strictEqual(evalJS('activeMachineSelectionIds().length'),1);
assert.strictEqual(evalJS('selectedGroupData().machines.length'),1);
assert.strictEqual(evalJS('selectedGroupData().routes.length'),0);
evalJS('startGroupTransform("move")');
const oldState=evalJS('JSON.stringify(state)');
evalJS('rotateGroup(1)');
assert.strictEqual(evalJS('groupTransform.rotation'),1);
assert.strictEqual(evalJS('JSON.stringify(state)'),oldState,'rotation preview must not mutate machine or routes');
evalJS('cancelGroupTransform()');
assert.strictEqual(evalJS('JSON.stringify(state)'),oldState,'cancel must restore machine and connections');
evalJS('startGroupTransform("move");commitGroupTransform()');
assert.strictEqual(evalJS('JSON.stringify(state)'),oldState,'a no-op placement must preserve connected belts');
evalJS('startGroupTransform("move");groupTransform.x=52;groupTransform.y=52;updateGroupPreview()');
assert(evalJS('groupTransform.plan.valid'),evalJS('groupTransform.plan.error'));
const originalRoutes=evalJS('state.routes.length');
evalJS('commitGroupTransform()');
assert.strictEqual(evalJS('state.routes.length'),originalRoutes-1,'moving a single machine breaks the external route');
evalJS('multiSelection=null;selection={machineId:state.machines[0].id}');
const originalCount=evalJS('state.machines.length');
evalJS('duplicateGroup()');
assert.strictEqual(evalJS('state.machines.length'),originalCount,'duplicate must not place before confirmation');
evalJS('cancelGroupTransform()');
assert.strictEqual(evalJS('state.machines.length'),originalCount,'cancel duplicate must leave map unchanged');
console.log('group selection and single-machine preview tests passed');

// Pointer gestures: click selects, a 5px threshold starts a live non-destructive preview.
evalJS(`
const canvas={setPointerCapture(){}},camera={x:0,y:0,z:10};
const eventCoords=e=>({x:e.clientX,y:e.clientY});
const screenToCell=(x,y)=>({x:Math.floor(x/10),y:Math.floor(y/10)});
`);
const canvasCode=fs.readFileSync(root+'/scripts/ui/canvas.js','utf8');
vm.runInContext(canvasCode.slice(canvasCode.indexOf('function onPointerDown('),canvasCode.indexOf('function rotateSelected(steps)')),ctx);
const clickMachine=evalJS('state.machines[0]');
const px=(clickMachine.x+1)*10+2,py=(clickMachine.y+1)*10+2;
evalJS('multiSelection=null;selection=null;hoverCell=null');
const stateBeforePointer=evalJS('JSON.stringify(state)');
evalJS(`onPointerDown({button:0,pointerId:11,clientX:${px},clientY:${py}})`);
assert.strictEqual(evalJS('selection'),null,'first press is not yet selected');
assert.strictEqual(evalJS('drag.kind'),'machine-select-press');
evalJS(`onPointerMove({pointerId:11,clientX:${px+3},clientY:${py+1}})`);
assert(!evalJS('groupTransform'),'short gestures must not start a transform');
evalJS(`onPointerUp({pointerId:11})`);
assert.strictEqual(evalJS('selection.machineId'),clickMachine.id,'tap release selects machine');
assert.strictEqual(evalJS('JSON.stringify(state)'),stateBeforePointer,'a normal click does not mutate layout');
evalJS(`onPointerDown({button:0,pointerId:12,clientX:${px},clientY:${py}})`);
evalJS(`onPointerMove({pointerId:12,clientX:${px+32},clientY:${py+10}})`);
assert.strictEqual(evalJS('drag.kind'),'machine-preview');
assert.strictEqual(evalJS('groupTransform.mode'),'move');
assert.strictEqual(evalJS('groupTransform.x'),clickMachine.x+3,'preserve original grab offset');
assert.strictEqual(evalJS('JSON.stringify(state)'),stateBeforePointer,'drag preview is non-destructive');
evalJS(`onPointerUp({pointerId:12})`);
assert(evalJS('groupTransform'),'releasing pointer must leave preview active');
assert.strictEqual(evalJS('JSON.stringify(state)'),stateBeforePointer);
evalJS('cancelGroupTransform()');
assert.strictEqual(evalJS('JSON.stringify(state)'),stateBeforePointer,'Esc-like cancel restores state');
// Dragging any member of a multi-selection preserves the group as a whole.
evalJS(`multiSelection={machineIds:[state.machines[0].id,state.machines[1].id],routeIds:[]};selection=null;hoverCell=null`);
evalJS(`onPointerDown({button:0,pointerId:13,clientX:${px},clientY:${py}})`);
assert.strictEqual(evalJS('multiSelection.machineIds.length'),2);
evalJS(`onPointerMove({pointerId:13,clientX:${px+40},clientY:${py}})`);
assert.strictEqual(evalJS('groupTransform.source.machines.length'),2);
evalJS(`onPointerUp({pointerId:13});cancelGroupTransform()`);
console.log('pointer drag-to-preview regression tests passed');

// Mouse-up is not a commit. A subsequent click places the transform.
evalJS(`state={machines:[{id:'m100',type:'分流',x:3,y:3,face:'E'}],routes:[]};
 selection=null;multiSelection=null;hoverCell=null;groupTransform=null;drag=null;`);
evalJS('onPointerDown({button:0,pointerId:14,clientX:42,clientY:42})');
evalJS('onPointerUp({pointerId:14})');
assert.strictEqual(evalJS('selection.machineId'),'m100');
evalJS('onPointerDown({button:0,pointerId:14,clientX:42,clientY:42})');
evalJS('onPointerMove({pointerId:14,clientX:242,clientY:142})');
assert(evalJS('groupTransform?.plan?.valid'));
evalJS('onPointerUp({pointerId:14})');
assert.strictEqual(evalJS('state.machines[0].x'),3);
assert(evalJS('groupTransform'));
evalJS('onPointerDown({button:0,pointerId:15,clientX:242,clientY:142})');
assert(!evalJS('groupTransform'));
assert.strictEqual(evalJS('state.machines[0].x'),23);
assert.strictEqual(evalJS('state.machines[0].y'),13);
console.log('release-then-click placement regression test passed');

// Preview sockets must remain visible for every face/orientation.
const previewScript=fs.readFileSync(root+'/scripts/ui/canvas.js','utf8');
const previewPortPainter=previewScript.slice(previewScript.indexOf('function paintPortSocket('),previewScript.indexOf('function drawStaticScene('));
assert(/paintPreviewPorts\(m\);\s*paintMachineIndicators\(m,w,h\);\s*paintMachineTextAtZoom\(m,w,h,z,true\)/.test(previewScript),
 'group placement preview must draw sockets then indicators then text');
const paintedSockets=[];
ctx.paintedSockets=paintedSockets;
vm.runInContext(`
const ctx={color:null, save(){},restore(){},set strokeStyle(v){this.color=v},get strokeStyle(){return this.color},fillRect(){throw Error('Port socket background must be transparent')},strokeRect(x,y,w,h){paintedSockets.push({color:this.color,x,y,w,h,width:this.lineWidth})}};
`,ctx);
vm.runInContext(previewPortPainter,ctx);
for(const face of ['E','S','W','N']){
 paintedSockets.length=0;
 const target={id:'mport',type:'浇筑',x:2,y:2,face};
 ctx.paintTarget=target;
 evalJS('paintPreviewPorts(paintTarget)');
 const ports=evalJS('getPorts(paintTarget)');
 assert.strictEqual(paintedSockets.length,ports.length);
 for(let i=0;i<ports.length;i++){
  assert.strictEqual(paintedSockets[i].color,ports[i].kind==='in'?'#5baaff':'#ffae61');
  assert.strictEqual(paintedSockets[i].x,ports[i].x+.10);
  assert.strictEqual(paintedSockets[i].y,ports[i].y+.10);
  assert.strictEqual(paintedSockets[i].w,.8);
  assert.strictEqual(paintedSockets[i].h,.8);
  assert.strictEqual(paintedSockets[i].width,.13);
 }
}
console.log('preview socket rendering tests passed');

// Escape and right-click both restore the same empty default editor state.
// These controls must never change the map, remove belts, or clear the clipboard.
const editorControls=fs.readFileSync(root+'/scripts/ui/editor-controls.js','utf8');
vm.runInContext(editorControls.slice(0,editorControls.indexOf('function rotateStamp(')),ctx);
ctx.onKeydown=null;
ctx.document.addEventListener=(type,fn)=>{if(type==='keydown')ctx.onKeydown=fn;};
const startupScript=fs.readFileSync(root+'/scripts/ui/startup.js','utf8');
vm.runInContext(startupScript.slice(0,startupScript.indexOf("document.addEventListener('keyup'")),ctx);
assert(ctx.onKeydown,'keydown handler must register');
const originalLayout=evalJS('JSON.stringify(state)');
for(const mode of ['belt','stamp','marquee','erase','pan','select']){
 for(const gesture of ['escape','rightclick']){
  evalJS(`tool='${mode}';selection={machineId:'m100'};multiSelection={machineIds:['m100'],routeIds:[]};groupTransform={mode:'move',plan:null};marquee={from:{x:1,y:2},to:{x:3,y:4}};drag={kind:'marquee'};draft={from:{id:'m100',port:0}};stampType='分流';spaceDown=true;groupClipboard={machines:[],routes:[]}`);
  if(gesture==='rightclick')evalJS('onPointerDown({button:2})');
  else ctx.onKeydown({key:'Escape',target:{closest(){return true}},preventDefault(){}});
  assert.strictEqual(evalJS('tool'),'select',gesture+' '+mode+' tool');
  for(const field of ['selection','multiSelection','groupTransform','marquee','drag','draft','stampType'])
   assert.strictEqual(evalJS(field),null,gesture+' '+mode+' '+field);
  assert.strictEqual(evalJS('spaceDown'),false);
  assert(evalJS('groupClipboard'),'clipboard must be preserved');
  assert.strictEqual(evalJS('JSON.stringify(state)'),originalLayout,'cancel must preserve machines and belts');
 }
}
console.log('Esc and right-click full editor reset tests passed');
