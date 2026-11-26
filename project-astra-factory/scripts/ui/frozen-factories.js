'use strict';
const warehouseCardOpen={frozen:false,theory:false,actual:false};
try{Object.assign(warehouseCardOpen,JSON.parse(localStorage.getItem('factory_lab_ledger_cards_v2')||'{}'));}catch(e){}
const frozenExpanded=new Set();
let frozenImportUI={owner:null,selected:'',metric:'net',pending:false,message:'',error:false};
function frozenImportState(){
 const owner=typeof solverSchemeId==='undefined'?null:solverSchemeId;
 if(frozenImportUI.owner!==owner)frozenImportUI={owner,selected:'',metric:'net',pending:false,message:'',error:false};
 return frozenImportUI;
}
function frozenImportFeedback(ui){
 if(frozenImportState()!==ui)return;
 const select=$('frozenSchemeImport'),metric=$('frozenImportMetric'),btn=$('warehouse').querySelector('[data-frozen-action=import]'),status=$('warehouse').querySelector('[data-frozen-import-status]');
 if(select){select.disabled=ui.pending;if(select.value!==ui.selected)select.value=ui.selected;}
 if(metric){metric.disabled=ui.pending;metric.value=ui.metric;}
 if(btn){btn.disabled=ui.pending||!ui.selected;btn.textContent=ui.pending?'计算中…':'导入';}
 if(status){status.textContent=ui.message;status.classList.toggle('is-error',ui.error);}
}
let frozenRenaming=null;
function warehouseCardToggle(key){
 if(!Object.hasOwn(warehouseCardOpen,key))return;
 warehouseCardOpen[key]=!warehouseCardOpen[key];
 try{localStorage.setItem('factory_lab_ledger_cards_v2',JSON.stringify(warehouseCardOpen));}catch(e){}
 warehouseRefresh();
}
function ledgerCollapseButton(key,label){
 return '<button type="button" class="ledger-collapse" data-ledger-toggle="'+key+'" aria-expanded="'+!!warehouseCardOpen[key]+'" title="展开/收起">'+'<span class="right-disclosure-arrow" aria-hidden="true">'+(warehouseCardOpen[key]?'▾':'▸')+'</span> <strong>'+label+'</strong></button>';
}
function frozenFactoriesList(){return normalizeFrozenFactories(state.frozenFactories);}
function frozenNewId(list){let i=1;while(list.some(f=>f.id==='f'+i))i++;return 'f'+i;}
function frozenCommit(list,message){
 const validated=normalizeFrozenFactories(list);
 if(theoryCanonicalJSON(validated)===theoryCanonicalJSON(frozenFactoriesList())){warehouseRefresh();return false;}
 snapshot();state.frozenFactories=validated;afterChange(message);
}
function frozenAdd(name,rates={}){
 const list=frozenFactoriesList(),id=frozenNewId(list);
 list.push({id,name:name||'冻结工厂 '+(list.length+1),enabled:true,rates});
 frozenExpanded.add(id);warehouseCardOpen.frozen=true;
 frozenCommit(list,'已添加冻结工厂');
}
function frozenMinuteRate(rate){return steadyExactText(steadyExactMul(steadyRegionQ(rate),steadyExactQ(60)));}
// Keep exact fractions in storage; show exact terminating decimals when possible.
function frozenDisplayMinute(rate){
 const q=steadyRegionQ(frozenMinuteRate(rate));
 if(q.d===1n)return String(q.n);
 for(let p=1;p<=12;p++){
  const scale=10n**BigInt(p);
  if(scale%q.d!==0n)continue;
  const n=q.n*(scale/q.d),negative=n<0n,s=String(negative?-n:n).padStart(p+1,'0');
  return (negative?'-':'')+s.slice(0,-p)+'.'+s.slice(-p);
 }
 return steadyExactText(q);
}
function frozenFromMinute(value){return steadyExactText(steadyExactDiv(steadyRegionQ(String(value).trim()),steadyExactQ(60)));}
function frozenSourceStatus(f,budget){
 if(!f.enabled)return '';
 const duty=steadyDisplayRateBudget(budget)?.frozenDuty?.[f.id],r=sim?.frozenRuntime?.[f.id];
 const theory=!f.enabled?'已禁用':!Object.keys(f.rates).length?'空配置':duty==null?(budget?.calculating?'计算中':'—'):(duty*100).toFixed(1)+'%';
 const actual=!f.enabled?'已禁用':!r?'未运行':r.blocked.length?'缺少 '+r.blocked.join('、'):r.running?'运行中':'等待';
 return '理论 '+theory+' · 实际 '+actual;
}
function frozenFactoriesMarkup(v){
 const list=frozenFactoriesList(),schemes=typeof solverSchemes==='undefined'?[]:solverSchemes;
 const ui=frozenImportState();if(!schemes.some(s=>s.id===ui.selected)&&!ui.pending)ui.selected='';
 const itemOptions=(selected,existing=[])=>[...new Set([...MATERIALS,...(selected?[selected]:[])])].filter(k=>k===selected||!existing.includes(k)).sort(factoryItemCompare).map(k=>'<option value="'+esc(k)+'"'+(k===selected?' selected':'')+'>'+esc(k)+'</option>').join('');
 const cards=list.map((f,i)=>{
  const keys=Object.keys(f.rates).sort(factoryItemCompare),id=esc(f.id),open=frozenExpanded.has(f.id);
  const rows=keys.map(item=>'<tr><td title="'+esc(item)+'">'+ledgerMaterialLabel(item)+'</td><td><input type="text" inputmode="decimal" data-frozen-rate="'+esc(item)+'" value="'+esc(frozenDisplayMinute(f.rates[item]))+'" title="精确净值 '+esc(frozenMinuteRate(f.rates[item]))+' 件/分钟" aria-label="'+esc(item)+' 每分钟净值"></td><td><button type="button" data-frozen-remove-item="'+esc(item)+'" title="删除物品">×</button></td></tr>').join('');
  return '<div class="frozen-source" data-frozen-id="'+id+'"><div class="frozen-source-head"><button type="button" data-frozen-action="expand" class="frozen-source-name" title="'+esc(f.name)+'" aria-expanded="'+open+'">'+'<span class="right-disclosure-arrow" aria-hidden="true">'+(open?'▾':'▸')+'</span> '+esc(f.name)+'</button><label class="frozen-enabled"><input type="checkbox" data-frozen-enabled '+(f.enabled?'checked':'')+'>启用</label><button type="button" class="frozen-delete" data-frozen-action="remove" title="删除冻结工厂" aria-label="删除 '+esc(f.name)+'">删除</button></div><div class="tiny frozen-source-status" data-frozen-status="'+id+'">'+esc(frozenSourceStatus(f,v.budget))+'</div>'+
  (open?'<div class="frozen-source-body">'+(frozenRenaming===f.id?'<input data-frozen-name type="text" maxlength="80" value="'+esc(f.name)+'" aria-label="冻结工厂名称">':'')+'<div class="ledger-table-scroll"><table class="ledger-table frozen-rate-table"><thead><tr><th>物品</th><th>净值 / 分钟</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<div class="frozen-add-row"><select data-frozen-new-item aria-label="新增物品">'+itemOptions(null,keys)+'</select><input data-frozen-new-rate type="text" inputmode="decimal" placeholder="±件/分" aria-label="新增净值"><button type="button" data-frozen-action="add-item">＋</button></div>'+
  '<div class="frozen-tools frozen-source-tools"><button type="button" data-frozen-action="rename">重命名</button><span class="frozen-tool-spacer"></span>'+(list.length>1?'<span class="tiny">优先级 '+(i+1)+'</span><button type="button" data-frozen-action="up" '+(i===0?'disabled':'')+' title="提高优先级">↑</button><button type="button" data-frozen-action="down" '+(i===list.length-1?'disabled':'')+' title="降低优先级">↓</button>':'')+'</div></div>':'')+'</div>';
 }).join('');
 return '<div id="warehouseFrozen" class="frozen-panel"><div class="ledger-head">'+ledgerCollapseButton('frozen','冻结工厂')+'<span class="ledger-chip">'+list.filter(f=>f.enabled).length+'/'+list.length+' 启用</span></div>'+
 (warehouseCardOpen.frozen?'<div class="frozen-body">'+cards+
 '<div class="frozen-tools"><button type="button" data-frozen-action="add">＋ 手动添加</button></div>'+
 (schemes.length?'<div class="frozen-import-row"><select id="frozenSchemeImport" aria-label="选择方案" '+(ui.pending?'disabled':'')+'><option value="" '+(!ui.selected?'selected ':'')+'disabled>选择方案</option>'+schemes.map(s=>'<option value="'+esc(s.id)+'"'+(s.id===ui.selected?' selected':'')+'>'+esc(s.name)+(s.id===solverSchemeId?'（当前）':'')+'</option>').join('')+'</select><select id="frozenImportMetric" aria-label="导入净值类型" '+(ui.pending?'disabled':'')+'><option value="net" '+(ui.metric==='net'?'selected':'')+'>净值</option><option value="potential" '+(ui.metric==='potential'?'selected':'')+'>潜在净值</option></select><button type="button" data-frozen-action="import" '+(ui.pending||!ui.selected?'disabled':'')+'>'+(ui.pending?'计算中…':'导入')+'</button></div><div data-frozen-import-status class="frozen-import-status'+(ui.error?' is-error':'')+'" role="status" aria-live="polite">'+esc(ui.message)+'</div>':'')+
 '</div>':'')+'</div>';
}
function frozenRefreshLive(v){
 for(const f of frozenFactoriesList()){
  const el=[...document.querySelectorAll('[data-frozen-status]')].find(e=>e.dataset.frozenStatus===f.id);
  if(el)el.textContent=frozenSourceStatus(f,v.budget);
 }
}
function frozenSnapshot(budget,name,metric='net'){
 const b=steadyDisplayRateBudget(budget);
 if(!b||b.failure||!b.fractions?.localInflow||!b.fractions?.localOutflow)throw Error('当前方案尚未求得有效长期理论收支');
 const rates={};
 if(b.proofMode==='strict-counts'||b.status==='conditional-exact'){
  if(!['net','potential'].includes(metric))throw Error('无效净值类型');
  const field=metric==='potential'?'localPotential':'localNet',label=metric==='potential'?'潜在净值':'净值',xs=b.fractions[field];
  if(!xs||b.calculating||['unsupported','contradiction'].includes(b.diagnostics?.actualStatus))throw Error('来源方案的本地'+label+'尚不能唯一确定');
  const missing=(b.warehouseItems||Object.keys(xs)).filter(k=>xs[k]==null);
  if(missing.length)throw Error('来源方案的本地'+label+'尚不能唯一确定：'+missing.join('、'));
  for(const [k,v] of Object.entries(xs))if(steadyExactCmp(steadyRegionQ(v),STEADY_ZERO))rates[k]=v;
  return {type:'frozen-factory',version:1,name,unit:'items/s',rates};
 }
 if(metric!=='net')throw Error('旧模型不提供已证明的潜在净值');
 for(const k of new Set([...Object.keys(b.fractions.localInflow),...Object.keys(b.fractions.localOutflow)])){
  const q=steadyExactSub(steadyRegionQ(b.fractions.localInflow[k]||'0'),steadyRegionQ(b.fractions.localOutflow[k]||'0'));
  if(steadyExactCmp(q,STEADY_ZERO))rates[k]=steadyExactText(q);
 }
 return {type:'frozen-factory',version:1,name,unit:'items/s',rates};
}
async function frozenComputeScheme(layout){
 const key=theoryCacheKey(layout),cached=theoryCacheGet(key,layout);if(cached)return cached;
 const started=performance.now(),w=await createStrictTheoryWorker();
 return new Promise((resolve,reject)=>{
  const finish=(err,result)=>{clearTimeout(timer);disposeStrictTheoryWorker(w);if(err)reject(err);else{result.diagnostics={...result.diagnostics,wallElapsedMs:Math.max(0,Math.round(performance.now()-started))};theoryCachePut(key,result,layout);resolve(result);}};
  const timer=setTimeout(()=>finish(Error('来源方案计算超时')),THEORY_BACKGROUND_MS);
  w.onmessage=e=>e.data?.result?finish(null,e.data.result):finish(Error(e.data?.error||'来源方案计算失败'));
  w.onerror=e=>{e.preventDefault?.();finish(Error(e.message||'来源方案数学 Worker 执行失败'));};
  w.onmessageerror=()=>finish(Error('来源方案数学 Worker 消息无法读取'));
  try{w.postMessage({layout,budgetMs:THEORY_BACKGROUND_MS-200,uiBudget:true,workerSource:w.factoryWorkerSource,workerLimit:theoryDeviceWorkerLimit()});}catch(err){finish(err);}
 });
}
async function frozenImportScheme(selected,metric='net'){
 const t=solverSchemes.find(s=>s.id===selected);
 if(!t)throw Error('请选择方案');
 const target=state,scheme=solverSchemeId,targetKey=theorySignature(state),raw=t.id===solverSchemeId?null:decodeScheme(t);
 const previousSeed=idSeed;let layout;
 try{layout=t.id===solverSchemeId?copy(state):typeof t.ast==='string'&&t.ast.startsWith('AST1:')?raw:raw?.format===FACTORY_JSON_FORMAT&&raw?.version===FACTORY_JSON_VERSION?expandCompactFactoryLayout(raw):expandLegacyFactoryLayout(raw).layout;}finally{idSeed=previousSeed;}
 const b=await frozenComputeScheme(layout);
 if(target!==state||scheme!==solverSchemeId||targetKey!==theorySignature(state))throw Error('当前方案或布局已变化，导入已取消');
 if(!steadyDisplayRateBudget(b))throw Error(b.calculationTimedOut||b.conditionalBudget?.retryable?'来源方案计算超时或未求解':'来源方案未求得有效长期理论收支');
 const f=frozenSnapshot(b,t.name+(metric==='potential'?'（潜在净值）':''),metric);if(!Object.keys(f.rates).length)throw Error('来源方案没有非零本厂'+(metric==='potential'?'潜在净值':'净值'));
 frozenAdd(f.name,f.rates);return f;
}
function frozenHandleClick(e){
 const toggle=e.target.closest('[data-ledger-toggle]');
 if(toggle){warehouseCardToggle(toggle.dataset.ledgerToggle);return;}
 const btn=e.target.closest('[data-frozen-action],[data-frozen-remove-item]');if(!btn)return;
 const action=btn.dataset.frozenAction,card=btn.closest('[data-frozen-id]');
 try{
  if(action==='add'){frozenAdd();return;}
  if(action==='import'){
   const ui=frozenImportState();if(ui.pending)return;
   ui.selected=$('frozenSchemeImport')?.value||ui.selected;if(!ui.selected)return;
   ui.pending=true;ui.error=false;ui.message='正在计算来源方案'+(ui.metric==='potential'?'潜在净值':'净值')+'…';frozenImportFeedback(ui);
   frozenImportScheme(ui.selected,ui.metric).then(f=>{ui.message='已导入 '+f.name+'（'+Object.keys(f.rates).length+' 种物品）';ui.selected='';}).catch(err=>{ui.error=true;ui.message=err.message;notify(err.message,'warn');}).finally(()=>{ui.pending=false;frozenImportFeedback(ui);});return;
  }
  const list=frozenFactoriesList(),i=list.findIndex(f=>f.id===card?.dataset.frozenId);if(i<0)return;
  const f=list[i];
  if(action==='expand'){frozenExpanded.has(f.id)?frozenExpanded.delete(f.id):frozenExpanded.add(f.id);warehouseRefresh();return;}
  if(action==='rename'){frozenRenaming=f.id;warehouseRefresh();const field=$('warehouse').querySelector('[data-frozen-name]');field?.focus();field?.select();return;}
  if(action==='remove'){list.splice(i,1);frozenExpanded.delete(f.id);if(frozenRenaming===f.id)frozenRenaming=null;}
  else if(action==='up'||action==='down'){const j=i+(action==='up'?-1:1);if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];}
  else if(action==='add-item'){
   const item=card.querySelector('[data-frozen-new-item]').value,rate=card.querySelector('[data-frozen-new-rate]').value;
   if(!item||!rate.trim())throw Error('请选择物品并填写净值');f.rates[item]=frozenFromMinute(rate);
  }else if(btn.dataset.frozenRemoveItem!==undefined)delete f.rates[btn.dataset.frozenRemoveItem];
  else return;
  frozenCommit(list,'已更新冻结工厂');
 }catch(err){notify(err.message,'warn');}
}
function frozenHandleChange(e){
 const el=e.target;if(el.id==='frozenImportMetric'){const ui=frozenImportState();ui.metric=el.value==='potential'?'potential':'net';ui.message='';ui.error=false;frozenImportFeedback(ui);return;}if(el.id==='frozenSchemeImport'){const ui=frozenImportState();ui.selected=el.value;ui.message='';ui.error=false;frozenImportFeedback(ui);return;}
 const card=el.closest('[data-frozen-id]');if(!card)return;
 const list=frozenFactoriesList(),f=list.find(f=>f.id===card.dataset.frozenId);if(!f)return;
 try{
  if(el.hasAttribute('data-frozen-name')){f.name=el.value.trim()||f.name;frozenRenaming=null;}
  else if(el.hasAttribute('data-frozen-enabled'))f.enabled=el.checked;
  else if(el.hasAttribute('data-frozen-rate'))f.rates[el.dataset.frozenRate]=frozenFromMinute(el.value);
  else return;
  frozenCommit(list,'已更新冻结工厂');
 }catch(err){notify(err.message,'warn');warehouseRefresh();}
}
$('warehouse').addEventListener('click',frozenHandleClick);
$('warehouse').addEventListener('change',frozenHandleChange);
$('warehouse').addEventListener('keydown',e=>{
 if(!e.target.hasAttribute('data-frozen-name'))return;
 if(e.key==='Enter'){e.preventDefault();e.target.blur();if(frozenRenaming!==null){frozenRenaming=null;warehouseRefresh();}}
 if(e.key==='Escape'){e.preventDefault();frozenRenaming=null;warehouseRefresh();}
});
