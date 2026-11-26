'use strict';
// Production adapter: exact fractions remain available alongside numeric
// display values. Unknown is null, never a fabricated zero.
function factoryDirectWarehouseTheory(options={}){
 const result={inflow:{},outflow:{},machineCycles:{},routeFlows:{},status:'modelled-unresolved',diagnostics:{certified:false,exact:false,modelled:true,rateSolved:false}};
 try{
  const direct=factoryDirectTheory({ms:options.ms??60000,deadline:options.deadline??Infinity,continuousRefill:true});
  const fieldMap={inflow:'inflow',outflow:'outflow',net:'net',potentialNet:'potential',withdrawalDemand:'withdrawalDemand',localInflow:'localIn',localOutflow:'localOut',localNet:'localNet',frozenInflow:'frozenIn',frozenOutflow:'frozenOut',frozenDuty:'duty',machineCycles:'cycle',routeTotals:'routeTotal'};
  const num=x=>x===null?null:steadyExactNumber(steadyRegionQ(x));
  function budgetOf(x){
   const fractions={},b={status:x.status==='sat'?'conditional-exact':'unresolved',retryable:!!x.retryable,reason:x.issues?.map(i=>i.machine+' '+i.reason).join('；')||null,actualLongRunRatesSolved:false,exactLocalEquations:x.status==='sat',method:direct.method,certificates:x.certificates||[],unknown:x.unknown||[]};
   for(const [field,prefix] of Object.entries(fieldMap)){
    const values=Object.fromEntries(Object.entries(x.values).filter(([k])=>k.startsWith(prefix+':')).map(([k,v])=>[k.slice(prefix.length+1),v]));
    fractions[field]=values;b[field]=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,num(v)]));
   }
   fractions.routes={};b.routeFlows={};b.machineTotals={};b.machineMaterials={};b.totals={};
   for(const [k,v] of Object.entries(x.values)){
    if(k.startsWith('flow:')){const [route,item]=k.slice(5).split('|');(fractions.routes[route]??={})[item]=v;(b.routeFlows[route]??={})[item]=num(v);}
    else if(k.startsWith('machineTotal:')){const [id,kind]=k.slice(13).split('|');(b.machineTotals[id]??={})[kind]=num(v);}
    else if(k.startsWith('machineMaterial:')){const [id,kind,item]=k.slice(16).split('|');((b.machineMaterials[id]??={})[kind]??={})[item]=num(v);}
    else if(k.startsWith('total:'))b.totals[k.slice(6)]=num(v);
   }
   // Disconnected recipe nodes have no physical sustained throughput.
   if(x.status==='sat')for(const m of state.machines)if(getRecipe(m)&&!Object.hasOwn(b.machineCycles,m.id)&&!state.routes.some(r=>r.to?.id===m.id||r.from.id===m.id)){b.machineCycles[m.id]=0;fractions.machineCycles[m.id]='0';}
   b.machineDuty=Object.fromEntries(Object.entries(b.machineCycles).map(([id,v])=>[id,v===null?null:v*(getRecipe(machineById(id))?.seconds||0)]));
   b.fractions=fractions;
   return b;
  }
  result.warehouseItems=Object.keys(direct.rows);
  result.conditionalBudget=budgetOf(direct.constrained);
  result.unlimitedStockBudget=budgetOf(direct.unlimited);
  result.overdraftNet=Object.fromEntries(Object.entries(direct.rows).map(([k,v])=>[k,num(v.overdraft)]));
  result.overdraftTotal=num(direct.total.overdraft);
  result.direct=true;
  if(direct.constrained.status==='sat'){
   result.status='conditional-exact';result.diagnostics.rateSolved=true;result.diagnostics.exact=true;
   result.notice='精确条件解（连续供需模型）；— 表示该指标尚不能唯一确定。真实 FIFO/轮询调度尚未全部证明。';
  }else result.notice='当前布局未求解：'+(result.conditionalBudget.reason|| (result.conditionalBudget.retryable?'符号求解超时':'当前约束无解或不支持'));
 }catch(e){result.notice='数学模型尚未求解：'+e.message;result.conditionalBudget={status:'unresolved',reason:e.message,retryable:false};}
 return result;
}
