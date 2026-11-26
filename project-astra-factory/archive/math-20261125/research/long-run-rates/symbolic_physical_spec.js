'use strict';
// Compile the physical topology, independently of the conditional S/D graph.
// Ports and actual geometry are exported by the editor, no graph-specific
// recipes, layouts, IDs or measured rates in the compiler.
function factoryCompileSymbolicSpec(layout=state,{unlimitedWarehouse=false}={}){
 const machines=layout.machines.map(m=>({
  id:m.id,type:m.type,item:m.item,recipe:getRecipe(m),
  outPorts:getPorts(m).filter(p=>p.kind==='out').map(p=>({index:p.index,filter:p.filter||''})),
  inputPriority:machineInputPriority(m).map(p=>p.index),
  mergerPriority:m.type==='汇流'?mergerInputOrder(m).map(p=>p.index):[]
 }));
 const all=new Set(MATERIALS);
 for(const m of machines){if(m.item)all.add(m.item);if(m.recipe){all.add(m.recipe.output);for(const k of Object.keys(m.recipe.inputs))all.add(k);}}
 const frozen=normalizeFrozenFactories(layout.frozenFactories||[]).filter(f=>f.enabled&&Object.keys(f.rates).length);
 for(const f of frozen)for(const k of Object.keys(f.rates))all.add(k);
 const routes=layout.routes.map(r=>{const target=r.to&&layout.machines.find(m=>m.id===r.to.id);
  return {id:r.id,from:r.from.id,fromPort:r.from.port,to:r.to?.id??null,toPort:r.to?.port??null,length:r.path.length,
   accepted:target?[...all].filter(k=>acceptsMaterial(target,k,r.to.port)):[...all]};
 });
 const priority=layout.machines.filter(m=>m.type==='仓出').sort(warehouseMachinePriorityCompare).map(m=>m.id);
 return {machines,routes,frozen,priority,unlimitedWarehouse,initial:'empty'};
}
// Compile both mathematical views from the SAME current layout. The
// attached physical specification is never a separately supplied candidate.
function factoryCompileHtmlResearchBundle(layout=state){
 const g=factoryCompileDirectGraph(layout,null,{countOnly:true}),ug=factoryCompileDirectGraph(layout,null,{countOnly:true,unlimitedWarehouse:true}),dg=factoryCompileDirectGraph(layout);
 g.physicalSpec=factoryCompileSymbolicSpec(layout);
 ug.physicalSpec=factoryCompileSymbolicSpec(layout,{unlimitedWarehouse:true});
 return {g,ug,dg};
}
if(typeof module!=='undefined')module.exports={factoryCompileSymbolicSpec,factoryCompileHtmlResearchBundle};
