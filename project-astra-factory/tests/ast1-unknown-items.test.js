'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const scripts=['data/catalog','blueprints/machine-ids','blueprints/item-ids',
 'core/state','core/machines','core/routing','core/audit','core/selection-transform',
 'core/editor','engine/math/arithmetic/rational','engine/steady-flow','core/compact-json','blueprints/ast1-codec'];
const bundle=scripts.map(f=>fs.readFileSync(path.join(root,'scripts',f+'.js'),'utf8')).join('\n;\n');
function run(fn){
 const document={getElementById(id){return id==='map'?{getContext(){return{}}}:{style:{},textContent:'',classList:{add(){},remove(){}}};},querySelectorAll(){return[];}};
 return new Function('document','assert','atob','btoa',bundle+'\n('+fn.toString()+')()')(document,assert,atob,btoa);
}
test('unknown ItemID 666 can be read and written; invalid 16-bit IDs are rejected',()=>run(function(){
 assert.equal(ast1ItemLabel(666),'物品#666');
 assert.equal(ast1ItemNumber('物品#666'),666);
 assert.equal(ast1ItemNumber('未识别游戏物品 #666'),666);
 assert.equal(ast1ItemNumber('未知游戏物品 #666'),666);
 assert.equal(ast1ItemNumber('物品666'),666);
 assert.equal(ast1ItemNumber('物品 #65535'),65535);
 assert.equal(ast1ItemNumber('物品65536'),undefined);
 assert.equal(ast1ItemNumber('物品-1'),undefined);
 assert.equal(ast1ItemNumber('物品xyz'),undefined);
 assert.equal(expandItem(666),'物品#666');
 assert.equal(compactItem('物品666'),666);
 assert.equal(compactItem('物品#666'),666);
 assert.equal(compactItem(''),'', 'do not rewrite an empty filter');
 assert.equal(compactItem('任意'),'任意','do not rewrite an unrestricted filter');
 assert.throws(()=>expandItem(-1));
 assert.throws(()=>expandItem(65536));
 assert.throws(()=>expandItem(7.2));
}));
test('unknown IDs embedded in warehouse and splitter raw AST1 survive all roundtrips and changes',()=>run(function(){
 const warehouseOut={id:'out',type:'仓出',x:8,y:8,face:'E',item:'太空垃圾'};
 const warehouseIn={id:'in',type:'仓入',x:24,y:8,face:'E',inletItem:'太空垃圾'};
 const splitter={id:'split',type:'分流',x:40,y:8,face:'E',outFilters:{}};
 const port=getPorts(splitter).find(p=>p.kind==='out');
 splitter.outFilters[port.index]='太空垃圾';
 state={name:'unknown material codec',machines:[warehouseOut,warehouseIn,splitter],routes:[]};
 let raw=Uint8Array.from(atob(ast1Encode().slice(5)),c=>c.charCodeAt(0));
 let pos=3,swapped={};
 for(let i=0;i<3;i++){
  const type=raw[pos],extra=raw[pos+6];
  const id=type===11?666:type===10?667:type===8?668:null;
  assert(id!==null,'expected known types');
  assert.equal(extra,type===8?3:1);
  raw[pos+7]=id&255;raw[pos+8]=id>>8;
  swapped[type]=id;pos+=7+2*extra;
 }
 assert.deepEqual(swapped,{8:668,10:667,11:666});
 const injected='AST1:'+btoa(String.fromCharCode(...raw));
 state=ast1Decode(injected);
 assert.equal(state.machines[0].item,'物品#666');
 assert.equal(state.machines[1].inletItem,'物品#667');
 const filters=state.machines[2].outFilters;
 assert(Object.values(filters).includes('物品#668'));
 assert.equal(ast1Encode(),injected,'unchanged AST1 with unknown item IDs must be byte-for-byte exact');
 const compact=compactFactoryLayout(state);
 assert.equal(compact.machines[0].item,'物品#666');
 assert.equal(compact.machines[1].inletItem,'物品#667');
 assert(Object.values(compact.machines[2].outFilters).includes('物品#668'));
 state=expandCompactFactoryLayout(compact);
 assert.equal(ast1Encode(),injected,'compact JSON cannot lose unknown material IDs');
 state.machines[0].item='物品670';
 state.machines[1].inletItem='物品671';
 const splitFilterPort=Object.keys(state.machines[2].outFilters).find(i=>state.machines[2].outFilters[i].includes('#668'));
 assert(splitFilterPort!==undefined);
 state.machines[2].outFilters[splitFilterPort]='物品672';
 const changed=ast1Encode();
 state=ast1Decode(changed);
 assert.equal(state.machines[0].item,'物品#670');
 assert.equal(state.machines[1].inletItem,'物品#671');
 assert(Object.values(state.machines[2].outFilters).includes('物品#672'));
 assert.equal(ast1Encode(),changed,'edited unknown item IDs must also be lossless');
}));
