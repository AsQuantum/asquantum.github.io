'use strict';
function importedUnknownItemOption(item){
 // Visible only for already imported values; never adds a new selectable ID.
 if(!item||MATERIALS.includes(item)||item==='任意')return '';
 return '<option value="'+esc(item)+'" selected disabled data-imported-unknown="true">'+esc(item)+'</option>';
}
function factoryItemSelectOptions(selected){
 const items=[...MATERIALS];
 if(selected&&selected!=='任意'&&!items.includes(selected))items.push(selected);
 return items.sort(factoryItemCompare).map(q=>MATERIALS.includes(q)?'<option value="'+esc(q)+'" '+(selected===q?'selected':'')+'>'+esc(q)+'</option>':importedUnknownItemOption(q)).join('');
}
function warehouseInFilterHTML(m){
 const options=factoryItemSelectOptions(m.inletItem);
 return '<label class="machine-field"><span>入仓物品过滤（全部输入口）</span><select id="warehouseInFilterSelect" class="full"><option value="">任意</option>'+options+'</select></label>';
}
// A disclosure is a view preference, not a machine attribute. Preserve its
// open state when switching machines or rebuilding the inspector after edits.
const inspectorDisclosureSelectors=['.machine-port-details','.machine-live-history','.machine-buffer-details','.route-packet-details'];
const inspectorDisclosureOpen=Object.create(null);
function captureInspectorDisclosures(root){
 for(const selector of inspectorDisclosureSelectors){
  const node=root.querySelector(selector);
  if(node)inspectorDisclosureOpen[selector]=node.open;
 }
}
function restoreInspectorDisclosures(root){
 for(const selector of inspectorDisclosureSelectors){
  const node=root.querySelector(selector);
  if(node&&Object.prototype.hasOwnProperty.call(inspectorDisclosureOpen,selector))
   node.open=inspectorDisclosureOpen[selector];
 }
}
// Details toggle does not bubble, so observe the capture phase. Ignore
// delayed toggle events from panels that have already been replaced.
$('inspector').addEventListener('toggle',e=>{
 if(!$('inspector').contains(e.target))return;
 for(const selector of inspectorDisclosureSelectors)
  if(e.target.matches?.(selector))inspectorDisclosureOpen[selector]=e.target.open;
},true);
function machineStackControls(m){
 const rec=getRecipe(m),s=sim?.byMachine?.[m.id];if(!s||(!rec&&m.type!=='电脑'))return '';
 const computer=m.type==='电脑',inItems=computer?[...new Set([...Object.keys(s.inputs||{}).filter(k=>s.inputs[k]>0),...Object.keys(ware||{}).filter(k=>ware[k]>0&&getPorts(m).some(p=>p.kind==='in'&&acceptsMaterial(m,k,p.index)))])]:Object.keys(rec.inputs||{});
 const row=(item,n,cap,dir,available)=>`<div class="machine-stack-row" data-live-key="${esc(JSON.stringify([m.id,dir,item]))}"><span class="machine-stack-name"><span style="color:${materialColor(item)}">●</span> ${esc(item)} <span class="machine-stack-count">(${n}/${cap})</span></span><button type="button" class="smallbtn machine-stack-button" data-stack-machine="${esc(m.id)}" data-stack-item="${esc(item)}" data-stack-direction="${dir}" ${available<=0||simAdvanceBusy?'disabled':''} title="${dir==='in'?'仓库存入至缓存上限':'取出全部现有成品至仓库'}">${dir==='in'?'存入':'取出'}</button></div>`;
 const inputs=inItems.sort(factoryItemCompare).map(item=>{
  const n=s.inputs[item]||0,cap=computer?10:rec.inputs[item]*3,free=computer?10-s.consumerQueue.length:cap-n;
  return row(item,n,cap,'in',Math.min(ware[item]||0,free));
 }).join('');
 const n=rec?s.queue.filter(k=>k===rec.output).length:0;
 return `<div class="item machine-stack-controls" id="inspectorStacks">
  <div class="machine-live-subhead">入口栈物品${computer?' · 共享容量 '+s.consumerQueue.length+'/10':''}</div>
  ${inputs||'<div class="tiny">'+(computer?'暂无可存入物品':'无输入原料')+'</div>'}
  <div class="machine-live-subhead machine-stack-out-heading">出口栈物品</div>
  ${rec?row(rec.output,n,rec.qty*20,'out',n):'<div class="tiny">无成品出口</div>'}
 </div>`;
}
function machineProgressState(m){
 const s=sim?.byMachine?.[m.id],rec=getRecipe(m),computer=m.type==='电脑';
 if(!s||(!rec&&!computer))return null;
 const source=!!rec&&!Object.keys(rec.inputs||{}).length,T=computer?1:rec.seconds;
 const active=computer?s.consumerQueue.length>0:source?s.queue.length+rec.qty<=rec.qty*20:s.busy>1e-7;
 const raw=computer?s.consumerElapsed:source?s.tick:s.busy>1e-7?T-s.busy:0;
 // Sub-tick interpolation is visual only. Never advance a stopped batch
 // or change the authoritative recipe clock, inventory or completed count.
 const sub=active&&!simAdvanceBusy?Math.max(0,Math.min(SIMULATION_STEP_SECONDS,simClockRemainder)):0;
 const elapsed=Math.max(0,Math.min(T,raw+sub)),fraction=elapsed/T,percent=Math.floor(fraction*100+1e-8);
 const action=computer?'销毁中':source?'生产中':'加工中';
 const status=active?(running||simAdvanceBusy?action:'已暂停'):rec&&(source||s.queue.length+rec.qty>rec.qty*20)?'成品栈已满':computer?'等待物品':'等待原料';
 return {status,action,T,elapsed,fraction,percent};
}
function machineProductionProgress(m){
 const v=machineProgressState(m);if(!v)return '';
 return `<div class="item machine-production-progress" id="inspectorProgress">
  <div class="machine-live-head"><strong data-progress-status>${v.status}</strong><small data-progress-time>${v.percent}% · ${v.elapsed.toFixed(1)} / ${v.T} 秒</small></div>
  <div class="machine-progress-track" role="progressbar" aria-label="${v.action}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v.percent}"><div class="machine-progress-fill" style="transform:scaleX(${v.fraction})"></div></div>
 </div>`;
}
function inspectorRefreshProgress(){
 if(!selection?.machineId)return;
 const root=$('inspector');if(root.dataset.inspectorKey!=='machine:'+selection.machineId)return;
 const node=root.querySelector('#inspectorProgress');if(!node)return;
 const m=machineById(selection.machineId),v=m&&machineProgressState(m);if(!v)return;
 const fill=node.querySelector('.machine-progress-fill'),track=node.querySelector('[role=progressbar]');
 const transform='scaleX('+v.fraction+')';if(fill.style.transform!==transform)fill.style.transform=transform;
 const percent=String(v.percent);if(track.getAttribute('aria-valuenow')!==percent)track.setAttribute('aria-valuenow',percent);
 setLiveText(node.querySelector('[data-progress-status]'),v.status);
 setLiveText(node.querySelector('[data-progress-time]'),v.percent+'% · '+v.elapsed.toFixed(1)+' / '+v.T+' 秒');
}
// Logistics buffers are read-only. Shared mixed-material FIFOs list
// actual items in service order, not separate fictitious per-item stacks.
function machineLogisticsBuffers(m){
 const s=sim?.byMachine?.[m.id];if(!s)return '';
 let title,items;
 if(m.type==='仓出'){title='出口缓存物品';items=s.warehouseQueue||[];}
 else if(m.type==='分流'){title='入口缓存物品';items=s.portQueues?.[0]||[];}
 else if(m.type==='汇流'){title='出口缓存物品';items=(s.mergerQueue||[]).map(p=>p.item);}
 else return '';
 const row=(k,label)=>`<div class="machine-stack-row"><span class="machine-stack-name"><span style="color:${materialColor(k)}">●</span> ${esc(k)}${label?' <span class="machine-stack-count">'+esc(label)+'</span>':''}</span></div>`;
 const list=items.map(k=>row(k,'')).join('');
 return `<div class="item machine-stack-controls" id="inspectorLogisticsBuffers">
 <details class="machine-buffer-details">
  <summary class="machine-live-subhead">${title} · ${items.length}/3</summary>
  <div class="machine-buffer-list">${list||'<div class="tiny">当前缓存为空</div>'}</div>
 </details>
 </div>`;
}
function machineLiveInventory(m){
 const s=sim?.byMachine?.[m.id];if(!s)return '';
 const rec=getRecipe(m),computer=m.type==='电脑',rows=[];
 // Recipe and computer stacks are already shown in Production. Keep only
 // the distinct live data for warehouse and routing devices here.
 if(m.type==='仓出'){
  rows.push(['共享仓库库存',(ware[m.item]||0)+' 件']);
 }else if(m.type==='仓入')rows.push(['入仓方式','直接入库']);

 if(computer)rows.push(['累计销毁',Object.values(s.consumed||{}).reduce((a,b)=>a+b,0)+' 件']);
 const totals=[...new Set([...Object.keys(s.received||{}),...Object.keys(s.sent||{}),...Object.keys(s.consumed||{})])].sort(factoryItemCompare);
 const history=totals.map(item=>`<div class="kv"><span><span style="color:${materialColor(item)}">●</span> ${esc(item)}</span><b>入 ${s.received[item]||0} / ${computer?'销毁 '+(s.consumed[item]||0):'出 '+(s.sent[item]||0)}</b></div>`).join('');

 return `<div class="item machine-live" id="inspectorLive">
  <div class="machine-live-head"><strong>实时物流</strong><small>模拟时间 ${simTime.toFixed(1)} 秒</small></div>
  ${rows.map(([k,v])=>`<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}
  <details class="machine-live-history"><summary>累计接收 / ${computer?'销毁':'发出'}</summary>${history||'<div class="tiny">尚无物品传输记录</div>'}</details>
 </div>`;
}
// Patch dynamic nodes only; preserve selection in static theory and controls.
function hasSelectionInside(node){
 const sel=window.getSelection?.();
 if(!sel||sel.isCollapsed||!sel.rangeCount||!node)return false;
 try{return sel.getRangeAt(0).intersectsNode(node);}catch(e){return false;}
}
function syncLiveMarkup(node,html){
 if(!node||hasSelectionInside(node))return;
 const template=document.createElement('template');
 template.innerHTML=html.trim();
 const fresh=template.content.firstElementChild;
 if(!fresh)return;
 const identity=el=>el?.nodeType===1?(el.hasAttribute('data-live-key')?'key:'+el.getAttribute('data-live-key'):el.hasAttribute('data-orch-item')?'item:'+el.getAttribute('data-orch-item'):el.classList.contains('ledger-total')?'ledger-total':null):null;
 function patch(a,b){
  if(a.nodeType!==b.nodeType||(a.nodeType===1&&a.tagName!==b.tagName)){
   a.replaceWith(b.cloneNode(true));return;
  }
  if(a.nodeType===3||a.nodeType===8){
   if(a.nodeValue!==b.nodeValue)a.nodeValue=b.nodeValue;
   return;
  }
  if(a.nodeType!==1)return;
  for(const attr of [...a.attributes]){
   // Keep nested history disclosure expanded even as counters update.
   if(a.tagName==='DETAILS'&&attr.name==='open')continue;
   if(!b.hasAttribute(attr.name))a.removeAttribute(attr.name);
  }
  for(const attr of b.attributes){
   if(a.tagName==='DETAILS'&&attr.name==='open')continue;
   if(a.getAttribute(attr.name)!==attr.value)a.setAttribute(attr.name,attr.value);
  }
  // Reconcile by material/stack identity before patching attributes. An
  // animated node may never be reassigned to a different material.
  const keyed=new Map();
  for(const child of a.childNodes){const k=identity(child);if(k!==null)keyed.set(k,child)}
  for(let i=0;i<b.childNodes.length;i++){
   let old=a.childNodes[i];const next=b.childNodes[i],k=identity(next);
   if(k!==null){
    const found=keyed.get(k);
    if(found&&found.parentNode===a){
     if(found!==old)a.insertBefore(found,old||null);
     old=found;
    }else{a.insertBefore(next.cloneNode(true),old||null);continue}
   }else if(identity(old)!==null){a.insertBefore(next.cloneNode(true),old||null);continue}
   if(!old)a.appendChild(next.cloneNode(true));
   else patch(old,next);
  }
  while(a.childNodes.length>b.childNodes.length)a.lastChild.remove();
 }
 patch(node,fresh);
}
function setLiveText(node,text){
 if(node&&!hasSelectionInside(node)&&node.textContent!==text)node.textContent=text;
}
function routePacketsHTML(r,packets,length){
 return packets.map((p,i)=>{
   const xy=packetCoords(r,p),cell=xy?`格 (${Math.max(0,Math.min(71,Math.floor(xy[0])))}, ${Math.max(0,Math.min(71,Math.floor(xy[1])))})`:'位置未知';
   const remaining=Math.max(0,length-p.distance);
   return `<div class="route-packet"><span style="color:${materialColor(p.item)}">●</span><span>${i+1}. ${esc(p.item)}</span><span class="route-packet-pos">${remaining.toFixed(1)}m 剩余</span><div class="tiny route-packet-coord">${cell} · 距起点 ${p.distance.toFixed(1)}m</div></div>`;
 }).join('');
}
// Crossings belong to the entire selected route, not just its clicked cell.
function inspectorRouteCrossings(r){
 const cells=new Set(r.path.map(([x,y])=>x+','+y)),found=[];
 for(const q of state.routes){
  if(q.id===r.id)continue;
  const crossings=q.path.filter(([x,y])=>cells.has(x+','+y));
  if(crossings.length)found.push({route:q,count:new Set(crossings.map(p=>p.join(','))).size});
 }
 return found;
}
function inspectorRefreshLive(){
 if(!selection?.machineId&&!selection?.routeId)return;
 const root=$('inspector');
 if(selection?.routeId){
  const r=state.routes.find(r=>r.id===selection.routeId);
  if(!r||root.dataset.inspectorKey!=='route:'+r.id)return inspectorRefresh();
  const packets=sim?.routes?.[r.id]||[],length=routeLength(r);
  setLiveText(root.querySelector('[data-live-route-time]'),simTime.toFixed(1)+'秒');
  setLiveText(root.querySelector('[data-live-route-count]'),packets.length+'件');
  const items=routePacketsHTML(r,packets,length);
  syncLiveMarkup(root.querySelector('#inspectorRoutePackets'),
   `<div class="route-packet-list" id="inspectorRoutePackets">${items||'<div class="tiny" style="padding:8px 0">当前线路没有物品。运行模拟后即可查看。</div>'}</div>`);
  return;
 }
 const m=machineById(selection?.machineId);
 if(!m)return;
 if(root.dataset.inspectorKey!=='machine:'+m.id)return inspectorRefresh();
 inspectorRefreshProgress();
 syncLiveMarkup(root.querySelector('#inspectorStacks'),machineStackControls(m));
 syncLiveMarkup(root.querySelector('#inspectorLogisticsBuffers'),machineLogisticsBuffers(m));
 syncLiveMarkup(root.querySelector('#inspectorLive'),machineLiveInventory(m));
}
function routeSteadyPanel(r){
 const rateBudget=typeof steadyDisplayRateBudget==='function'?steadyDisplayRateBudget(theoreticalBudget):theoreticalBudget;
 const rtFlows=rateBudget?.routeFlows?.[r.id]||{},total=rateBudget?.routeTotals?.[r.id];
 const rtFlowRows=Object.entries(rtFlows).filter(([,v])=>v===null||v>1e-7).map(([mat,v])=>`<div class="kv"><span>${esc(mat)}</span><b>${v===null?"—":(v*60).toFixed(2)} /分钟</b></div>`).join('');
 return `<div class="item machine-theory">
   <div class="machine-analysis-title"><strong>稳态理论</strong><span class="analysis-unit">件/分钟</span></div>
   <div class="machine-flow-summary"><div class="machine-flow-tile out"><span class="tile-label">运输总量</span><b class="tile-value">${total==null?'—':(total*60).toFixed(2)}<small> 件/分</small></b></div></div>
   ${rtFlowRows||(r.to&&total!==0?'<div class="tiny">—（尚未证明）</div>':'<div class="tiny">长期流量为零</div>')}
  </div>`;
}
// Worker results refresh only mathematical nodes, not the user's selected
// text, input controls, or live route and machine panels.
let inspectorTheoryDeferred=false;
function inspectorRefreshTheory(){
 const root=$('inspector'),r=state.routes.find(r=>r.id===selection?.routeId),m=machineById(selection?.machineId);
 if(r&&root.dataset.inspectorKey==='route:'+r.id){
  const panel=root.querySelector('.machine-theory');
  if(hasSelectionInside(panel)){inspectorTheoryDeferred=true;return}
  syncLiveMarkup(panel,routeSteadyPanel(r));
 }else if(m&&root.dataset.inspectorKey==='machine:'+m.id){
  const panel=root.querySelector('#inspectorTheory'),duty=root.querySelector('.machine-duty-section');
  if(hasSelectionInside(panel)||hasSelectionInside(duty)){inspectorTheoryDeferred=true;return}
  captureInspectorDisclosures(root);
  syncLiveMarkup(panel,machineSteadyPanel(m,false));
  if(duty)syncLiveMarkup(duty,machineProductionDuty(m));
  restoreInspectorDisclosures(root);
 }
 inspectorTheoryDeferred=false;
}
document.addEventListener?.('selectionchange',()=>{if(inspectorTheoryDeferred)inspectorRefreshTheory()});
function inspectorRefresh(){const root=$('inspector');captureInspectorDisclosures(root);if(selection?.routeId){
 let r=state.routes.find(r=>r.id===selection.routeId);if(!r){selection=null;return inspectorRefresh()}
 root.dataset.inspectorKey='route:'+r.id;
 const packets=sim?.routes?.[r.id]||[],length=routeLength(r);
 const crossHere=inspectorRouteCrossings(r);
 const items=routePacketsHTML(r,packets,length);
 const connected=beltConnected(r),status=connected?'已连接':'末端悬空';
 root.innerHTML=`<div class="inspector-machine inspector-route">
 <section class="machine-summary" style="--machine-accent:${connected?'#4ee09b':'#e7be58'}">
  <div class="machine-summary-eyebrow"><span>传送带详情</span><code title="线路记录编号">${esc(routeRecordDisplayId(r))}</code></div>
  <div class="machine-summary-name">物流线路</div>
  <div class="machine-summary-location">${esc(routeTitle(r))}</div>
  <div class="machine-summary-metrics">
   <div><span>线路状态</span><strong>${status}</strong></div>
   <div><span>长度</span><strong>${length} 米</strong></div>
   <div><span>传输速度</span><strong>${BELT_SPEED} 米/秒</strong></div>
   <div><span>标称上限</span><strong>60 <small>件/分</small></strong></div>
  </div>${r.label?`<div class="machine-ast1-meta">参考线路：${esc(r.label)}</div>`:''}
 </section>
 <section class="machine-analysis-panel">
  <div class="machine-analysis-heading">运输与物流分析</div>
  ${routeSteadyPanel(r)}
  <div class="item machine-live">
   <div class="machine-live-head"><strong>实时运输物品</strong><small data-live-route-time>${simTime.toFixed(1)}秒</small></div>
   <div class="machine-live-summary"><div><span>线上物品</span><b data-live-route-count>${packets.length}件</b></div></div>
   <details class="route-packet-details" open>
    <summary>靠近终点优先 · 包含堵塞停留物品</summary>
    <div class="route-packet-list" id="inspectorRoutePackets">${items||'<div class="tiny" style="padding:8px 0">当前线路没有物品。运行模拟后即可查看。</div>'}</div>
   </details>
  </div>
  ${crossHere.length?`<div class="item route-crossings"><div class="machine-live-head"><strong>交叉的独立传送带</strong><small>${crossHere.length} 条</small></div><div class="route-crossing-buttons">${crossHere.map(({route:q,count})=>`<button type="button" class="full smallbtn route-crossing-button" data-select-route="${esc(q.id)}"><span class="route-crossing-label"><b>${esc(routeRecordDisplayId(q))}</b> · ${esc(routeTitle(q))}</span><small>${count} 处</small></button>`).join('')}</div></div>`:''}
 </section>
 </div>`;
 restoreInspectorDisclosures(root);
 return;}
 let m=machineById(selection?.machineId);if(!m){root.dataset.inspectorKey='none';root.replaceChildren();return;}
 root.dataset.inspectorKey='machine:'+m.id;
 let d=def(m),[w,h]=dims(m),rec=getRecipe(m),ports=getPorts(m),modes=d.recipes?recipeModes(m.type):null;
 const faceName=({E:'右',W:'左',N:'上',S:'下'})[m.face]||m.face;
 const maxRate=rec?(rec.qty/rec.seconds*60).toFixed(2):null;
 const inputRecipe=rec?Object.entries(rec.inputs).sort(([a],[b])=>factoryItemCompare(a,b)).map(([name,count])=>`<span class="machine-flow-input">${esc(name)} ×${count}</span>`).join(''):'';
 const machineProps=[];
 if(supportsMachinePanel(m))machineProps.push(`<label class="machine-field"><span>面板方向</span>
  <select id="panelSelect" class="full" aria-label="面板方向">
   ${MACHINE_PANEL_LABELS.map((name,i)=>`<option value="${i}" ${machinePanelPosition(m)===i?'selected':''}>${esc(machinePanelOptionLabel(m,i))}</option>`).join('')}
  </select></label>`);

 if(modes?.length>1)machineProps.push(`<label class="machine-field"><span>产物 / 配方</span>
  <select id="modeSelect" class="full">${modes.map(q=>`<option value="${esc(q)}" ${String(m.mode)===String(q)?'selected':''}>${esc(recipeOptionLabel(m.type,q))}</option>`).join('')}</select>
 </label>`);
 if(m.type==='仓出')machineProps.push(`<label class="machine-field"><span>仓库取出物品</span>
  <select id="itemSelect" class="full">${factoryItemSelectOptions(m.item)}</select>
 </label>`);
 if(m.type==='仓入')machineProps.push(warehouseInFilterHTML(m));
 if(m.type==='分流')machineProps.push(`<div class="machine-filter-options">
  <div class="machine-field-caption">分流出口物品过滤</div>
  ${ports.filter(p=>p.kind==='out').map(p=>`<label class="machine-field"><span>${esc(ast1FilterPortLabel(m,p.index))} · ${esc(portDirectionArrow(p.side))}</span>
    <select data-out-filter="${p.index}" aria-label="${esc(ast1FilterPortLabel(m,p.index))} 输出物品">
     <option value="">任意</option>${factoryItemSelectOptions(p.filter)}
    </select></label>`).join('')}
  </div>`);
 root.innerHTML=`<div class="inspector-machine">
  <section class="machine-summary" style="--machine-accent:${d.color}">
   <div class="machine-summary-eyebrow"><span>机器详情</span><code title="机器记录编号">${esc(machineRecordDisplayId(m))}</code></div>
   <div class="machine-summary-name">${esc(d.name)}</div>
   <div class="machine-summary-location">${m.tag?`<span class="machine-tag">${esc(m.tag)}</span>`:''}<span>${w} × ${h} 格</span><span>坐标 (${m.x}, ${m.y})</span></div>
   <div class="machine-summary-metrics">
    <div><span>输出朝向</span><strong>${esc(faceName)}</strong></div>
    ${supportsMachinePanel(m)?`<div><span>面板方向</span><strong>${esc(machinePanelDescription(m))}</strong></div>`:''}
    <div><span>${m.type==='电脑'?'消耗周期':'生产周期'}</span><strong>${m.type==='电脑'?'1 秒/件':rec?rec.seconds+' 秒':'—'}</strong></div>
    <div><span>${m.type==='电脑'?'消耗上限':'标称上限'}</span><strong>${m.type==='电脑'?'1 件/秒':(maxRate??'—')}${m.type!=='电脑'&&maxRate!==null?`<small> 件/分</small>`:''}</strong></div>
   </div>
  ${rec?`<section class="machine-recipe machine-recipe-in-summary">
    <div class="machine-recipe-heading"><span>当前配方</span><small>${rec.seconds} 秒/次</small></div>
    <div class="machine-recipe-flow">${inputRecipe||'<span class="machine-flow-none">无输入</span>'}<span class="machine-flow-arrow">→</span>
     <strong class="machine-flow-output">${esc(rec.output)} ×${rec.qty}</strong>
    </div>
   </section>`:''}
      ${m.ast1Meta?.record?`<div class="machine-ast1-meta">AST1 类型 #${Number(m.ast1Meta.record[0])} · 配方 #${Number(m.ast1Meta.record[5])}</div>`:''}
  </section>

  ${machineProps.length?`<section class="machine-properties"><div class="machine-edit-heading">编辑设置</div>${machineProps.join('')}</section>`:''}
  ${rec||m.type==='电脑'?`<section class="machine-analysis-panel machine-production-panel">
   <div class="machine-analysis-heading">生产</div>
   ${machineProductionProgress(m)}
   ${machineStackControls(m)}
  </section>`:''}
  <section class="machine-analysis-panel machine-logistics-panel">
   <div class="machine-analysis-heading">分析</div>
   ${machineLogisticsBuffers(m)}
   ${machineProductionDuty(m)}
   ${machineSteadyPanel(m,false)}
   ${machineLiveInventory(m)}
  </section>
 </div>`;
 restoreInspectorDisclosures(root);

}
function refresh(){ $('topStats').textContent=`${state.machines.length}台设备 · ${state.routes.length}条线路 · ${getBeltCount()}格传送带`; warehouseRefresh();inspectorRefresh();auditRefresh();draw();}
