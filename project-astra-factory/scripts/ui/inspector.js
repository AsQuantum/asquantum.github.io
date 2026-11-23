'use strict';
function importedUnknownItemOption(item){
 // Visible only for already imported values; never adds a new selectable ID.
 if(!item||MATERIALS.includes(item)||item==='任意')return '';
 return '<option value="'+esc(item)+'" selected disabled data-imported-unknown="true">'+esc(item)+'</option>';
}
function warehouseInFilterHTML(m){
 const options=MATERIALS.map(q=>'<option value="'+esc(q)+'" '+(m.inletItem===q?'selected':'')+'>'+esc(q)+'</option>').join('');
 const unknown=importedUnknownItemOption(m.inletItem);
 return '<label class="machine-field"><span>入仓物品过滤（全部输入口）</span><select id="warehouseInFilterSelect" class="full"><option value="">任意</option>'+unknown+options+'</select></label>';
}
// A disclosure is a view preference, not a machine attribute. Preserve its
// open state when switching machines or rebuilding the inspector after edits.
const inspectorDisclosureSelectors=['.machine-port-details','.machine-live-detail','.machine-live-history'];
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
function machineLiveInventory(m){
 const s=sim?.byMachine?.[m.id];if(!s)return '';
 if(m.type==='电脑'){
  const entries=Object.entries(s.consumed||{}).filter(([,n])=>n>0);
  const total=entries.reduce((sum,[,n])=>sum+n,0);
  const rows=entries.length?entries.map(([item,n])=>`<div class="kv"><span><span style="color:${materialColor(item)}">●</span> ${esc(item)}</span><b>消耗 ${n} 件</b></div>`).join(''):'<div class="tiny">尚未收到物品</div>';
  return `<div class="item machine-live" id="inspectorLive">
   <div class="machine-live-head"><strong>Consumer · 实时消耗</strong><small>模拟时间 ${simTime.toFixed(1)} 秒</small></div>
   <div class="machine-live-summary">
    <div><span>累计销毁</span><b>${total}<small> 件</small></b></div>
    <div><span>消耗上限</span><b>1<small> 件/秒</small></b></div>
   </div>
   <details class="machine-live-detail"><summary>查看物品消耗明细</summary><div class="machine-live-detail-body">${rows}</div></details>
  </div>`;
 }
 const rec=getRecipe(m),inPorts=getPorts(m).filter(p=>p.kind==='in');
 const outCap=rec?rec.qty*20:0;
 const entries=rec?Object.keys(rec.inputs):[...new Set([...Object.keys(s.inputs||{}),...Object.keys(s.received||{})])];
 const itemRow=(item,current,capacity)=>`<div class="kv"><span><span style="color:${materialColor(item)}">●</span> ${esc(item)}</span><b>${current} / ${capacity}</b></div>`;
 let inputRows=entries.map(item=>{
  const current=s.inputs[item]||0;
  const cap=rec?inputCap(m,item,0):inPorts.length*3;
  return itemRow(item,current,cap);
 }).join('');
 if(!inputRows)inputRows='<div class="tiny">没有待缓存的输入材料</div>';
 const portRows=inPorts.map(p=>{
  const items=s.portItems?.[p.index]||{};
  const total=Object.values(items).reduce((a,b)=>a+b,0);
  const cap=m.type==='分流'||m.type==='汇流'?` / 3`:' 件';
  const summary=Object.entries(items).filter(([,v])=>v>0).map(([item,n])=>`<span style="color:${materialColor(item)}">●</span> ${esc(item)}×${n}`).join('、');
  return `<div class="tiny" style="padding:3px 0;border-bottom:1px solid #304153">入${p.index+1} (${p.side})：<b>${total}${cap}</b>${summary?` · ${summary}`:' · 空'}</div>`;
 }).join('');
 const outputCounts={};for(const item of s.queue||[])outputCounts[item]=(outputCounts[item]||0)+1;
 const outputItems=rec?[rec.output]:Object.keys(outputCounts);
 const outputRows=outputItems.length?outputItems.map(item=>itemRow(item,outputCounts[item]||0,outCap)).join(''):'<div class="tiny">直通设备：物品直接从输入缓存发往出口，无独立输出队列</div>';
 const recent=[...new Set([...Object.keys(s.received||{}),...Object.keys(s.sent||{})])];
 const totalRows=recent.length?recent.map(item=>`<div class="kv"><span><span style="color:${materialColor(item)}">●</span> ${esc(item)}</span><b>入 ${s.received[item]||0} / 出 ${s.sent[item]||0}</b></div>`).join(''):'<div class="tiny">尚无物品传输记录</div>';
 let warehouseExtra='';
 if(m.type==='仓出')warehouseExtra=`<div class="kv"><span>全局仓库 ${esc(m.item||'未设置')} 库存</span><b>${ware[m.item]||0} 件</b></div>`;
 if(m.type==='仓入')warehouseExtra='<div class="tiny">入仓物品立即计入全局仓库，没有独立输入缓存；各物品数量见上方仓库收支。</div>';
 const inputTotal=Object.values(s.inputs||{}).reduce((sum,n)=>sum+n,0);
 const queueTotal=(s.queue||[]).length;
 return `<div class="item machine-live" id="inspectorLive">
  <div class="machine-live-head"><strong>实时机器物料</strong><small>模拟时间 ${simTime.toFixed(1)} 秒</small></div>
  <div class="machine-live-summary">
   <div><span>输入缓存</span><b>${inputTotal}<small> 件</small></b></div>
   <div><span>输出队列</span><b>${queueTotal}<small> 件</small></b></div>
  </div>
  <details class="machine-live-detail">
   <summary>查看缓存与接口明细</summary>
   <div class="machine-live-detail-body">
    <div class="machine-live-subhead">输入库存（当前 / 上限）</div>${inputRows}
    ${portRows?`<div class="machine-live-ports">${portRows}</div>`:''}
    <div class="machine-live-subhead">输出库存（当前 / 上限）</div>${outputRows}
    ${warehouseExtra}
    <div class="kv"><span>加工状态</span><b>${rec?(s.busy>0?'加工中 '+s.busy.toFixed(1)+' 秒':'待机'):'—'}</b></div>
    <details class="machine-live-history"><summary>本次模拟累计接收 / 发出</summary>${totalRows}</details>
   </div>
  </details>
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
   if(a.getAttribute(attr.name)!==attr.value)a.setAttribute(attr.name,attr.value);
  }
  for(let i=0;i<b.childNodes.length;i++){
   const old=a.childNodes[i],next=b.childNodes[i];
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
 syncLiveMarkup(root.querySelector('#inspectorLive'),machineLiveInventory(m));
}
function inspectorRefresh(){const root=$('inspector');captureInspectorDisclosures(root);if(selection?.routeId){
 let r=state.routes.find(r=>r.id===selection.routeId);if(!r){selection=null;return inspectorRefresh()}
 root.dataset.inspectorKey='route:'+r.id;
 const packets=sim?.routes?.[r.id]||[],length=routeLength(r);
 const rtFlows=theoreticalBudget?.routeFlows?.[r.id]||{};
 const rtFlowRows=Object.entries(rtFlows).filter(([,v])=>v>1e-7).map(([mat,v])=>`<div class="kv"><span>${esc(mat)}</span><b>${(v*60).toFixed(2)} /分钟</b></div>`).join('');
 const crossHere=selection?.crossAt?cellRoutes(...selection.crossAt).filter(q=>q.id!==r.id):[];
 const items=routePacketsHTML(r,packets,length);
 root.innerHTML=`<div class="item"><strong>传送带 #${esc(r.id)}</strong><div class="tiny">${esc(routeTitle(r))}</div>
 <div class="kv"><span>长度</span><b>${length}米</b></div>
 <div class="kv"><span>模拟时间</span><b data-live-route-time>${simTime.toFixed(1)}秒</b></div>
 <div class="kv"><span>线上物品</span><b data-live-route-count>${packets.length}件</b></div>
 <div class="divider"></div><strong>理论稳态线路流量</strong>${rtFlowRows||'<div class="tiny">0 件/分钟（未得到可行供给或下游不能生产）</div>'}
 ${r.label?`<div class="tiny">参考线路：${esc(r.label)}</div>`:''}</div>
 <div class="item"><strong>当前运输物品（靠近终点优先）</strong>
 <div class="tiny" style="margin:3px 0 8px">实时读取该条线路中的逐件运输队列，含堵塞停留物品；快进后也会更新。</div>
 <div class="route-packet-list" id="inspectorRoutePackets">${items||'<div class="tiny" style="padding:8px 0">当前线路没有物品。运行模拟后即可查看。</div>'}</div></div>
 ${crossHere.length?`<div class="tiny">这里是十字交叉；另有一条独立传送带：</div>${crossHere.map(q=>`<button class="full smallbtn" data-select-route="${esc(q.id)}" style="margin:4px 0">切换查看 #${esc(q.id)} · ${esc(routeTitle(q))}</button>`).join('')}`:''}
 <button class="full" data-delete-route="${esc(r.id)}">删除这条线路</button>`;
 return;}
 let m=machineById(selection?.machineId);if(!m){root.dataset.inspectorKey='none';root.replaceChildren();return;}
 root.dataset.inspectorKey='machine:'+m.id;
 let d=def(m),[w,h]=dims(m),rec=getRecipe(m),ports=getPorts(m),modes=d.recipes?recipeModes(m.type):null;
 const faceName=({E:'右',W:'左',N:'上',S:'下'})[m.face]||m.face;
 const maxRate=rec?(rec.qty/rec.seconds*60).toFixed(2):null;
 const inputRecipe=rec?Object.entries(rec.inputs).map(([name,count])=>`<span class="machine-flow-input">${esc(name)} ×${count}</span>`).join(''):'';
 const machineProps=[];
 if(supportsMachinePanel(m))machineProps.push(`<label class="machine-field"><span>面板方向</span>
  <select id="panelSelect" class="full" aria-label="面板方向">
   ${MACHINE_PANEL_LABELS.map((name,i)=>`<option value="${i}" ${machinePanelPosition(m)===i?'selected':''}>${esc(name)}</option>`).join('')}
  </select></label>`);

 if(modes?.length>1)machineProps.push(`<label class="machine-field"><span>产物 / 配方</span>
  <select id="modeSelect" class="full">${modes.map(q=>`<option value="${esc(q)}" ${String(m.mode)===String(q)?'selected':''}>${esc(recipeOptionLabel(m.type,q))}</option>`).join('')}</select>
 </label>`);
 if(m.type==='仓出')machineProps.push(`<label class="machine-field"><span>仓库取出物品</span>
  <select id="itemSelect" class="full">${importedUnknownItemOption(m.item)}${MATERIALS.map(q=>`<option value="${esc(q)}" ${m.item===q?'selected':''}>${esc(q)}</option>`).join('')}</select>
 </label>`);
 if(m.type==='仓入')machineProps.push(warehouseInFilterHTML(m));
 if(m.type==='分流')machineProps.push(`<div class="machine-filter-options">
  <div class="machine-field-caption">分流出口物品过滤</div>
  ${ports.filter(p=>p.kind==='out').map(p=>`<label class="machine-field"><span>${esc(ast1FilterPortLabel(m,p.index))} · ${esc(p.side)}</span>
    <select data-out-filter="${p.index}" aria-label="${esc(ast1FilterPortLabel(m,p.index))} 输出物品">
     <option value="">任意</option>${importedUnknownItemOption(p.filter)}${MATERIALS.map(q=>`<option value="${esc(q)}" ${p.filter===q?'selected':''}>${esc(q)}</option>`).join('')}
    </select></label>`).join('')}
  </div>`);
 root.innerHTML=`<div class="inspector-machine">
  <section class="machine-summary" style="--machine-accent:${d.color}">
   <div class="machine-summary-eyebrow"><span>机器详情</span><code title="机器布局 ID">${esc(m.id)}</code></div>
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
  <section class="machine-analysis-panel">
   <div class="machine-analysis-heading">生产与物流分析</div>
   ${machineSteadyPanel(m)}
   ${machineLiveInventory(m)}
  </section>
 </div>`;
 restoreInspectorDisclosures(root);

}
function refresh(){ $('topStats').textContent=`${state.machines.length}台设备 · ${state.routes.length}条线路 · ${getBeltCount()}格传送带`; warehouseRefresh();inspectorRefresh();auditRefresh();draw();}
