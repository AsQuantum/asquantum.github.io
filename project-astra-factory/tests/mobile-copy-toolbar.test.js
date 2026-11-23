'use strict';
/* Mobile interaction regression: copy preview is confirmed ONLY by tapping a
   ghost machine. Blank tiles/gaps are inert; Select exits preview; Delete only
   removes selected real objects; undo/redo use the existing history actions. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const handlers={},events={},els={};
for(const id of ['mobileMapState','mobileStampBar','mobileStampName',
 'mobilePlaceButton','mobileFit','mobileUndo','mobileRedo','mobileDelete',
 'beltControls','palette']){
 els[id]={textContent:'',hidden:false,style:{},classList:{toggle(){},remove(){}},
  addEventListener(t,fn){(events[id]??={})[t]=fn}};
}
const selectBtn={dataset:{tool:'select'},classList:{toggle(){}},
 addEventListener(t,fn){(events.select??={})[t]=fn}};
const media={matches:true,addEventListener(){}};
const bounds={left:8,top:12,width:400,height:640};
const map={
 getBoundingClientRect:()=>bounds,
 addEventListener(t,fn,opts){assert(opts?.capture);handlers[t]=fn},
 setPointerCapture(){},releasePointerCapture(){},hasPointerCapture(){return false}
};
const document={
 getElementById:id=>id==='map'?map:els[id],
 querySelectorAll:selector=>selector==='[data-tool]'?[selectBtn]:[],
 querySelector:selector=>selector==='.main'?{dataset:{}}:
  selector==='.top .mobile-sim-tool[data-tool="select"]'?selectBtn:null,
 addEventListener(){}
};
const window={PointerEvent:function(){},matchMedia:()=>media,addEventListener(){}};
const appSource=String.raw`
let tool='stamp',stampType='垃圾',groupTransform=null,marquee=null,drag=null,
 draft=null,state={machines:[],routes:[]},selection=null,multiSelection=null,
 idSeed=100,hoverCell=null,groupClipboard=null,spaceDown=false;
const camera={x:20,y:30,z:8},pix={w:400,h:640},canvas=map;
let saves=0,undoCalls=0,redoCalls=0;
const copy=o=>JSON.parse(JSON.stringify(o));
const dims=m=>[m?.w||3,m?.h||3];
const getStampMachine=(x=0,y=0)=>({type:stampType,x,y,w:3,h:3});
const snapshot=()=>{saves++},draw=()=>{},afterChange=()=>{},notify=()=>{};
const def=()=>({name:'垃圾'}),undo=()=>{undoCalls++},redo=()=>{redoCalls++};
const $=id=>els[id],warehousePanel={open:false},
 inspectorRefresh=()=>{},updateStampControls=()=>{};
const canPlace=m=>!state.machines.some(o=>
 o.x<m.x+3&&o.x+3>m.x&&o.y<m.y+3&&o.y+3>m.y);
const removeMachine=id=>{state.machines=state.machines.filter(m=>m.id!==id);selection=null;snapshot()};
const deleteRoute=id=>{state.routes=state.routes.filter(r=>r.id!==id);selection=null;snapshot()};
const onPointerDown=e=>{
 if(stampType){
  const r=map.getBoundingClientRect();
  const c=screenToCell(e.clientX-r.left,e.clientY-r.top);
  const m=getStampMachine(c.x,c.y);
  if(canPlace(m)){snapshot();state.machines.push({...m,id:'m'+(++idSeed)})}
 }
};
const onPointerUp=()=>{},onPointerMove=()=>{};
`;
const fullSource=appSource+read('scripts/ui/editor-controls.js')+'\n'+
 read('scripts/core/selection-transform.js')+'\n'+String.raw`
createGroupPlan=function(t){
 const machines=t.source.machines.map((m,i)=>({...m,id:'__group_preview_m'+i,
  x:t.x+m.x-t.source.bounds.x,y:t.y+m.y-t.source.bounds.y}));
 const valid=machines.every(m=>canPlace(m));
 return {valid,error:valid?null:'collision',machines,routes:[],
  candidate:{...state,machines:[...state.machines,...machines],routes:[...state.routes]},disconnected:0};
};
`+read('scripts/ui/mobile.js')+'\n'+read('scripts/ui/touch-gestures.js')+String.raw`
return {open:mobileOpenView,getStamp:()=>stampType,getPreview:()=>copy(hoverCell),
 getState:()=>copy(state),getGroup:()=>groupTransform?copy({
  x:groupTransform.x,y:groupTransform.y,plan:groupTransform.plan}):null,
 startGroup:t=>{stampType=null;groupTransform=t;updateGroupPreview()},
 getSaves:()=>saves,getUndo:()=>undoCalls,getRedo:()=>redoCalls,
 getTool:()=>tool,setSelection:v=>selection=v,addRoute:v=>state.routes.push(v)};
`;
const app=new Function('map','document','window','els','media','requestAnimationFrame',
 'setTimeout','clearTimeout',fullSource)(
 map,document,window,els,media,cb=>cb(),()=>1,()=>{}
);
const fire=(type,id,x,y)=>handlers[type]({
 pointerType:'touch',pointerId:id,clientX:x,clientY:y,button:0,
 preventDefault(){},stopImmediatePropagation(){}
});
const at=cell=>({x:bounds.left+20+(cell.x+.5)*8,
 y:bounds.top+30+(cell.y+.5)*8});
function tap(id,cell){const p=at(cell);fire('pointerdown',id,p.x,p.y);fire('pointerup',id,p.x,p.y)}
app.open('machines');app.open('map');
const before=app.getPreview(),start=at({x:20,y:15});
fire('pointerdown',1,start.x,start.y);
fire('pointermove',1,start.x+40,start.y+24);
fire('pointerup',1,start.x+40,start.y+24);
const moved=app.getPreview();
assert(moved.x>before.x&&moved.y>before.y);
assert.equal(app.getState().machines.length,0,'drag release cannot place');
tap(2,{x:1,y:4});
assert.equal(app.getState().machines.length,0,'outside stamp ghost cannot place');
tap(3,moved);
assert.equal(app.getState().machines.length,1,'inside stamp ghost must place');

const source={bounds:{x:1,y:1,w:10,h:3},
 machines:[{id:'a',type:'垃圾',x:1,y:1,w:3,h:3},
  {id:'b',type:'垃圾',x:8,y:1,w:3,h:3}],routes:[]};
app.startGroup({source,mode:'copy',rotation:0,anchor:{x:0,y:0},
 x:12,y:20,plan:null});
tap(4,{x:16,y:20});
assert.equal(app.getState().machines.length,1,'gap between ghost machines cannot confirm');
tap(5,{x:3,y:5});
assert.equal(app.getState().machines.length,1,'tap outside copied group cannot confirm');
tap(6,{x:12,y:20});
assert.equal(app.getState().machines.length,3,'inside copied group confirms once');
assert(app.getGroup(),'mobile copy must remain active for repeating');
const saved=app.getSaves();
tap(7,{x:12,y:20});
assert.equal(app.getSaves(),saved,'invalid occupied ghost cannot save');
const g=at({x:12,y:20});
fire('pointerdown',8,g.x,g.y);
fire('pointermove',8,g.x+128,g.y+32);
fire('pointerup',8,g.x+128,g.y+32);
assert.equal(app.getGroup().x,28);
assert.equal(app.getGroup().y,24);
assert.equal(app.getState().machines.length,3,'group drag release must not confirm');
tap(9,{x:26,y:24});
assert.equal(app.getState().machines.length,3,'outside moved group cannot confirm');
tap(10,{x:28,y:24});
assert.equal(app.getState().machines.length,5);
assert(app.getGroup(),'copy preview must remain active after second placement');

assert(events.mobileUndo?.click&&events.mobileRedo?.click);
events.mobileUndo.click();events.mobileRedo.click();
assert.equal(app.getUndo(),1);assert.equal(app.getRedo(),1);
events.mobileDelete.click();
assert.equal(app.getState().machines.length,5,'Delete is blocked during preview');
assert(events.select?.click,'top-left Select must be clickable');
events.select.click();
assert.equal(app.getGroup(),null,'Select cancels copied preview');
assert.equal(app.getStamp(),null,'Select exits continuous stamping');
assert.equal(app.getTool(),'select','Select returns to normal mode');
assert.equal(app.getState().machines.length,5,'cancel never deletes prior copies');

const firstId=app.getState().machines[0].id;
app.setSelection({machineId:firstId});
events.mobileDelete.click();
assert.equal(app.getState().machines.length,4,'Delete removes selected machine');
app.addRoute({id:'r1'});app.setSelection({routeId:'r1'});
events.mobileDelete.click();
assert.equal(app.getState().routes.length,0,'Delete removes selected route');
events.mobileDelete.click();
assert.equal(app.getState().machines.length,4,'Delete with no selection is harmless');
const html=read('index.html');
assert(html.includes('id="mobileDelete"'));
assert(html.includes('id="mobileUndo"'));
assert(html.includes('id="mobileRedo"'));
assert(!html.includes('id="mobileZoomIn"'));
assert(!html.includes('id="mobileZoomOut"'));
assert(html.includes('点击顶部「选择」可结束连续放置'));
console.log('PASS: ghost-only continuous copying, select exit, guarded selection deletion and mobile undo/redo');
