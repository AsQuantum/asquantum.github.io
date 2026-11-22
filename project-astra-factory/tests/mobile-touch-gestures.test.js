'use strict';
// No browser or connected PC required: exercise real mobile pointer handlers in
// a VM, including the multi-touch sequence and edit-click suppression.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const filename=path.resolve(__dirname,'../scripts/ui/touch-gestures.js');
const source=fs.readFileSync(filename,'utf8');
const handlers={};
let frameCalls=0,downCalls=0,upCalls=0,moveCalls=0,saveCalls=0;
const mobile={matches:true,addEventListener(){}};
const map={
 addEventListener(type,handler,options){assert.equal(options.capture,true);handlers[type]=handler;},
 getBoundingClientRect(){return {left:10,top:20,width:390,height:680};},
 setPointerCapture(){},hasPointerCapture(){return false},releasePointerCapture(){}
};
const scope={
 document:{getElementById(id){return id==='map'?map:null}},
 window:{PointerEvent:function(){},matchMedia(){return mobile},addEventListener(){}},
 requestAnimationFrame(callback){frameCalls++;callback()},
 camera:{x:15,y:30,z:6},
 tool:'stamp',stampType:'垃圾',draft:null,groupTransform:null,drag:null,marquee:null,
 draw(){},updateGroupControls(){},
 onPointerDown(){downCalls++;saveCalls++},onPointerMove(){moveCalls++},onPointerUp(){upCalls++},
 console,Map,Math
};
vm.createContext(scope);vm.runInContext(source,scope,{filename});
function fire(type,id,x,y){
 let prevented=0,stopped=0;
 const e={pointerType:'touch',pointerId:id,clientX:x,clientY:y,button:0,
  preventDefault(){prevented++},stopImmediatePropagation(){stopped++}};
 handlers[type](e);
 return {prevented,stopped};
}
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,'expected '+a+' ~= '+b);
// No first-finger changes until the app knows whether a pinch will begin.
assert.equal(fire('pointerdown',11,110,220).prevented,1);
assert.equal(downCalls,0);
fire('pointerdown',22,210,220);
assert.equal(downCalls,0);
const baseline={...scope.camera};
fire('pointermove',22,290,220);
near(scope.camera.z,baseline.z*1.8);
near(scope.camera.x,190-((150-baseline.x)/baseline.z)*scope.camera.z);
near(scope.camera.y,200-((200-baseline.y)/baseline.z)*scope.camera.z);
const beforePan={...scope.camera};
fire('pointermove',11,155,260);
fire('pointermove',22,335,260);
near(scope.camera.z,beforePan.z);
near(scope.camera.x,beforePan.x+45);
near(scope.camera.y,beforePan.y+40);
fire('pointerup',22,335,260);fire('pointerup',11,155,260);
assert.equal(downCalls,0,'pinch must never call stamp/connect/delete code');
assert.equal(saveCalls,0);
// A genuine single finger tap still invokes the unchanged editor exactly once.
fire('pointerdown',33,150,280);
fire('pointerup',33,150,280);
assert.equal(downCalls,1);assert.equal(upCalls,1);
// Pan tool: one finger should pan; no editor pointer event is synthesized.
scope.tool='pan';scope.stampType=null;
const old={...scope.camera};
fire('pointerdown',44,150,280);
fire('pointermove',44,190,320);
near(scope.camera.x,old.x+40);near(scope.camera.y,old.y+40);
fire('pointerup',44,190,320);
assert.equal(downCalls,1);
// One-finger selection drag remains available, but is cancelled if a second
// contact arrives; no release can be mistaken for an extra placement.
scope.tool='select';
fire('pointerdown',55,100,160);
fire('pointermove',55,120,180);
assert.equal(downCalls,2);assert.equal(moveCalls,1);
fire('pointerdown',66,210,170);
fire('pointerup',66,210,170);
fire('pointerup',55,120,180);
assert.equal(downCalls,2);assert.equal(upCalls,1);
// On a desktop-width window capture-phase handlers should let events through.
mobile.matches=false;
assert.equal(fire('pointerdown',77,120,170).prevented,0);
assert.equal(downCalls,2);
console.log('PASS: double-finger pinch zoom/pan, world-point anchor, no accidental edit, single tap/select/pan preserved, desktop unaffected');
