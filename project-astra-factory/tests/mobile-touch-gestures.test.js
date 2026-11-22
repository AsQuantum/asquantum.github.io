'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const handlers={},placed=[],bounds={left:10,top:20,width:390,height:600};
const media={matches:true,addEventListener(){}};
const map={
 addEventListener(type,fn,opts){assert(opts?.capture);handlers[type]=fn},
 getBoundingClientRect(){return bounds},
 setPointerCapture(){},hasPointerCapture(){return false},releasePointerCapture(){}
};
const cls={toggle(){},remove(){}};
const status={textContent:'',classList:cls};
const el={
 mobileMapState:status,mobileStampBar:{hidden:true},
 mobileStampName:{textContent:''},
 mobilePlaceButton:{addEventListener(){}},mobileFit:{addEventListener(){}},
 mobileZoomIn:{addEventListener(){}},mobileZoomOut:{addEventListener(){}}
};
const ctx={
 console,Map,Math,setTimeout:()=>1,clearTimeout(){},
 window:{PointerEvent:function(){},matchMedia:()=>media,addEventListener(){}},
 document:{
  getElementById:id=>id==='map'?map:el[id],
  querySelectorAll:()=>[],
  querySelector:sel=>sel==='.main'?{dataset:{}}:null,
  addEventListener(){}
 },
 canvas:map,requestAnimationFrame:cb=>cb(),
 pix:{w:390,h:600},camera:{x:30,y:10,z:6},
 tool:'stamp',stampType:'垃圾',hoverCell:null,groupTransform:null,
 drag:null,marquee:null,warehousePanel:{open:false},
 $:id=>el[id],dims:()=>[3,3],getStampMachine:(x,y)=>({x,y,type:'垃圾'}),
 def:()=>({name:'垃圾'}),draw(){},resize(){},updateGroupControls(){},
 onPointerMove(){},onPointerUp(){},
 screenToCell(x,y){return {x:Math.floor((x-this.camera.x)/this.camera.z),y:Math.floor((y-this.camera.y)/this.camera.z)}},
 onPointerDown(e){
  placed.push({
   x:Math.floor((e.clientX-bounds.left-ctx.camera.x)/ctx.camera.z),
   y:Math.floor((e.clientY-bounds.top-ctx.camera.y)/ctx.camera.z)
  });
 }
};
// screenToCell is called as a function, not a method.
ctx.screenToCell=(x,y)=>({x:Math.floor((x-ctx.camera.x)/ctx.camera.z),y:Math.floor((y-ctx.camera.y)/ctx.camera.z)});
vm.createContext(ctx);
vm.runInContext(read('scripts/ui/mobile.js'),ctx);
vm.runInContext(read('scripts/ui/touch-gestures.js'),ctx);
const evalApp=code=>vm.runInContext(code,ctx);
const fire=(type,id,x,y)=>handlers[type]({
 pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0,
 preventDefault(){},stopImmediatePropagation(){}
});
const same=(actual,expected)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);
evalApp("mobileOpenView('machines');mobileOpenView('map')");
const centered={...ctx.hoverCell};
same(centered,{x:26,y:46});
fire('pointerdown',1,170,200);fire('pointermove',1,210,224);
const moved={...ctx.hoverCell};
assert(moved.x>centered.x&&moved.y>centered.y);
fire('pointerup',1,210,224);
assert.equal(placed.length,0,'drag release must not place anything');
same(ctx.hoverCell,moved);
fire('pointerdown',2,70,300);fire('pointerup',2,70,300);
assert.equal(placed.length,1);
same(placed[0],moved);
assert.equal(ctx.stampType,'垃圾','stamp mode remains active for continuous placement');
fire('pointerdown',3,170,200);fire('pointermove',3,230,260);fire('pointerup',3,230,260);
assert.equal(placed.length,1,'next drag is not an implicit placement');
const second={...ctx.hoverCell};
fire('pointerdown',4,90,320);fire('pointerup',4,90,320);
assert.equal(placed.length,2);same(placed[1],second);
const prior=ctx.camera.z;
fire('pointerdown',5,120,200);fire('pointerdown',6,240,200);
fire('pointermove',6,290,200);fire('pointerup',6,290,200);
fire('pointerup',5,120,200);
assert.equal(placed.length,2,'pinch never stamps a machine');
assert(ctx.camera.z>prior,'pinch still zooms');
const html=read('index.html'),styles=read('styles/mobile.css');
assert(html.includes('class="editor-help-content mobile-help-content"'));
assert(html.includes('class="editor-help-content desktop-help-content"'));
assert(html.includes('松手后仅停留在当前位置'));
assert(html.includes('再次点按'));
assert(styles.includes('.desktop-help-content{display:none!important}'));
console.log('PASS: mobile ghost centers on map, drag previews without committing, next tap confirms, continuous placement, pinch protection and mobile help');
