'use strict';
// The machine name, direction triangle and control-panel bar must not vanish
// at fixed zoom cutoffs. Verify placed machines and both preview render paths.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../scripts/ui/canvas.js'),'utf8');
const events=[];
const ctx=new Proxy({
 save(){},restore(){},beginPath(){},closePath(){},moveTo(){},lineTo(){},
 clearRect(){},fillRect(x,y,w,h){if(this.fillStyle==='#9dddff')events.push({kind:'panel',w,h});},
 strokeRect(){},stroke(){if(this.strokeStyle==='#9da9be')events.push({kind:'direction',lineWidth:this.lineWidth});},
 translate(){},scale(){},setTransform(){},setLineDash(){},
 fillText(value){events.push({kind:'text',value:String(value)})},
 measureText(value){const size=Number((this.font||'8px').match(/([\d.]+)px/)?.[1])||8;return{width:[...String(value)].length*size*.9}}
},{get(target,key){return key in target?target[key]:()=>{}},set(target,key,value){target[key]=value;return true}});
const setup=String.raw`
const DEF={测试:{name:'测试机',color:'#9da9be'}};
const state={machines:[{id:'m1',type:'测试',x:10,y:10,w:3,h:3,face:'E'}],routes:[]};
const pix={dpr:1,w:600,h:600},CENTER={x:29,y:29,w:14,h:14},
 V={E:[1,0],N:[0,-1],W:[-1,0],S:[0,1]};
let stampType='测试',hoverCell={x:20,y:10},draft=null,marquee=null,
 groupTransform={plan:{valid:true,routes:[],machines:[{id:'preview',type:'测试',x:25,y:10,w:3,h:3,face:'E'}]}},
 selection=null,multiSelection=null;
const getBeltCount=()=>0,getPorts=()=>[],getRecipe=()=>null,outPort=()=>null,
 missingMaterials=()=>[],dims=m=>[m.w,m.h],supportsMachinePanel=()=>true,
 machinePanelFacing=()=>'N',def=m=>DEF[m.type],
 getStampMachine=(x,y)=>({type:'测试',x,y,w:3,h:3,face:'E'}),
 canPlace=()=>true,placementPortWarningCount=()=>0,
 machineLabelLines=()=>[{text:'测试机',color:'#f0f6ff',bold:true}],
 paintMachineText=()=>ctx.fillText('完整文字'),
 $=()=>({textContent:''});
`;
const camera={x:10,y:10,z:3};
const make=new Function('ctx','camera','events',setup+'\n'+script+'\nreturn drawStaticScene;');
const draw=make(ctx,camera,events);
const rows=[];
for(const zoom of [3,4,4.79,4.8,5,6.49,6.5,9]){
 camera.z=zoom;events.length=0;draw();
 const text=events.filter(e=>e.kind==='text');
 const panels=events.filter(e=>e.kind==='panel');
 const direction=events.filter(e=>e.kind==='direction');
 assert(text.length>=3,'all placed/stamp/group preview labels at zoom '+zoom);
 assert(panels.length>=3,'all control-panel rectangles at zoom '+zoom);
 assert(direction.length>=3,'all direction triangles at zoom '+zoom);
 assert(direction.every(e=>e.lineWidth*zoom>=1-1e-6),'direction outline visible at zoom '+zoom);
 assert(panels.every(e=>Math.min(e.w,e.h)*zoom>=1-1e-6),'panel thickness visible at zoom '+zoom);
 assert(text.every(e=>e.value==='完整文字'),'full names and recipes must be drawn at every zoom '+zoom);
 rows.push({zoom,labels:text.length,panels:panels.length,directions:direction.length});
}
console.log('PASS: full machine text, direction and panel drawn at all zoom levels without 6.5/4.8 cutoffs',JSON.stringify(rows));
