'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../..'),ast=fs.readFileSync(path.join(__dirname,'user-new-layout.ast1.txt'),'utf8');
function make(old){
 const drawStats={strokes:0,lines:0};
 const ctx={stroke(){drawStats.strokes++},beginPath(){},moveTo(){drawStats.lines++},lineTo(){},save(){},restore(){},arc(){},fill(){},setTransform(){},translate(){},scale(){}};
 const element={getContext(){return ctx},classList:{add(){},remove(){}}};
 const c=vm.createContext({console,atob,btoa,performance,document:{hidden:false,getElementById(){return element}},requestAnimationFrame(){},localStorage:{getItem(){return null}}});
 for(const f of ['data/catalog','blueprints/machine-ids','blueprints/item-ids','core/state','core/machines','core/routing','core/audit','blueprints/ast1-codec','engine/steady-flow'])vm.runInContext(fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8'),c,{filename:f});
 vm.runInContext('function recordWarehouseMovement(direction,item,count=1){const b=sim.minuteBuckets[Math.max(0,Math.floor((simTime-1e-7)/60))]??={inbound:{},outbound:{}};b[direction][item]=(b[direction][item]||0)+count;}function stockChartReset(){}function warehouseRefresh(){}',c);
 vm.runInContext(fs.readFileSync(old?path.join(__dirname,'simulation-before-perf.js'):path.join(root,'scripts/engine/simulation.js'),'utf8'),c);
 vm.runInContext(fs.readFileSync(old?path.join(__dirname,'canvas-before-perf.js'):path.join(root,'scripts/ui/canvas.js'),'utf8'),c);
 vm.runInContext('draw=()=>{}',c);c.ast=ast;
 vm.runInContext('state=ast1Decode(ast);camera={x:0,y:0,z:10};pix={w:720,h:720,dpr:1};resetSimulation()',c);
 return {c,drawStats};
}
const report={};
let reference;
for(const old of [true,false]){
 const {c,drawStats}=make(old),run=s=>vm.runInContext(s,c);
 run(old?'for(let i=0;i<240;i++)simulate(.05)':'simulateBatchSteps(240,.05)');
 const t=performance.now();
 run(old?'for(let i=0;i<12000;i++)simulate(.05)':'for(let i=0;i<10;i++)simulateBatchSteps(1200,.05)');
 const simMs=performance.now()-t, snapshot=run('JSON.stringify({simTime,ware,sim})');
 if(old)reference=snapshot;else assert.equal(snapshot,reference,'batch optimization changed physical simulation state');
 run(old?'':'beltVisualCache=buildBeltVisualCache()');
 drawStats.strokes=0;drawStats.lines=0;
 const a=performance.now();
 run('for(let i=0;i<240;i++){advanceBeltMotion(i*1000/24);paintBeltMotion()}');
 report[old?'before':'after']={simMs:Math.round(simMs),treadCpuMs:Math.round(performance.now()-a),strokes:drawStats.strokes/240,marks:drawStats.lines/240};
}
report.identicalSimulationState=true;
fs.writeFileSync(path.join(__dirname,'performance-comparison.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
