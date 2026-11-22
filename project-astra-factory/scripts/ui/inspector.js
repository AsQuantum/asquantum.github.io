'use strict';
function warehouseInFilterHTML(m){
 const options=MATERIALS.map(q=>'<option value="'+esc(q)+'" '+(m.inletItem===q?'selected':'')+'>'+esc(q)+'</option>').join('');
 const unknown=m.inletItem&&!MATERIALS.includes(m.inletItem)?'<option value="'+esc(m.inletItem)+'" selected>'+esc(m.inletItem)+'</option>':'';
 return '<div style="margin:12px 0">入仓物品过滤（全部输入口）<select id="warehouseInFilterSelect" class="full"><option value="">任意</option>'+unknown+options+'</select></div>';
}
function machineLiveInventory(m){
 const s=sim?.byMachine?.[m.id];if(!s)return '';
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
 return `<div class="item" id="inspectorLive"><strong>实时机器物料 · 输入 / 输出</strong><div class="tiny">模拟时间 ${simTime.toFixed(1)}秒 · 数字为当前缓存件数 / 模拟缓存上限；与传送带上的物品分开计数。</div>
 <div class="divider"></div><b>输入库存（当前 / 上限）</b>${inputRows}
 ${portRows?`<div style="margin-top:5px">${portRows}</div>`:''}
 <div class="divider"></div><b>输出库存（当前 / 上限）</b>${outputRows}
 ${warehouseExtra}
 <div class="kv"><span>加工状态</span><b>${rec?(s.busy>0?'加工中 '+s.busy.toFixed(1)+'秒':'待机'):'—'}</b></div>
 <details><summary class="tiny">本次模拟累计接收 / 发出</summary>${totalRows}</details></div>`;
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
function inspectorRefresh(){const root=$('inspector');if(selection?.routeId){
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
 let m=machineById(selection?.machineId);if(!m){root.dataset.inspectorKey='none';root.innerHTML=`<div class="boxnotice">点击机器查看属性，点击绿色传送带查看该线路的物品清单。按 Q / E 旋转机器，Backspace 删除；连线仍须使用橙色输出口到蓝色输入口。</div>`;return;}
 root.dataset.inspectorKey='machine:'+m.id;
 let d=def(m),[w,h]=dims(m),rec=getRecipe(m),ports=getPorts(m),modes=d.recipes?recipeModes(m.type):null;
 root.innerHTML=`<div class="item"><strong style="color:${d.color}">${esc(d.name)}</strong><div style="margin-top:4px">${rec?`${Object.entries(rec.inputs).map(([k,v])=>`<span style="color:#60b5ff">${esc(k)} ×${v}</span>`).join('　')}<div style="color:#ffb16b">${esc(rec.output)} ×${rec.qty}</div><small>${esc(timeLabel(m))}</small>`:m.type==='仓出'?'取出：'+esc(m.item):''}</div><div class="tiny">${esc(m.tag||'')} · ${w}×${h} · (${m.x}, ${m.y})</div><div class="kv"><span>朝向（输出方向）</span><b>${({E:'右',W:'左',N:'上',S:'下'})[m.face]}</b></div></div>
 <div class="item"><div class="kv"><span>机器码 / 布局ID</span><b>${esc(m.id)}</b></div>${m.ast1Meta?.record?'<div class="kv"><span>AST1 类型ID / 配方ID</span><b>#'+Number(m.ast1Meta.record[0])+' / #'+Number(m.ast1Meta.record[5])+'</b></div>':''}</div>
 <div class="actions"><button data-rotate="-1">↶ 逆时针90°</button><button data-rotate="1">↷ 顺时针90°</button></div>
 ${modes?.length>1?`<div style="margin:12px 0">产物 / 配方 <select class="full" id="modeSelect">${modes.map(q=>`<option value="${esc(q)}" ${String(m.mode)===String(q)?'selected':''}>${esc(recipeOptionLabel(m.type,q))}</option>`).join('')}</select></div>`:''}
 ${m.type==='仓出'?`<div style="margin:12px 0">仓库指定取出物品<select id="itemSelect" class="full">${MATERIALS.map(q=>`<option ${m.item===q?'selected':''}>${esc(q)}</option>`).join('')}</select></div>`:''}
 ${m.type==='仓入'?warehouseInFilterHTML(m):''}
 ${rec?`<div class="item"><strong>配方（${rec.seconds}秒）</strong><div class="tiny">${Object.entries(rec.inputs).map(([a,b])=>`${esc(a)} ×${b}`).join(' + ')||'无输入'}<br/>→ ${esc(rec.output)} ×${rec.qty}</div><div class="tiny">标称最大：${(rec.qty/rec.seconds*60).toFixed(2)} 件/分钟（实际还受输入与带速限制）</div></div>`:''}
 <div class="divider"></div><b>接口设置</b><div class="tiny">每个输入口最多接1条传送带，允许混合配方原料，但该口总吞吐仍为每秒1件。空白＝允许全部配方所需材料；手动过滤将限制成单一材料。</div>
 ${ports.map(p=>`<div class="portspec"><span style="color:${p.kind==='in'?'#65b3fc':'#ffb477'}">${p.kind==='in'?'入':'出'}${p.index+1} ${p.side}${p.kind==='out'&&m.type==='\u5206\u6d41'?'\uFF08'+esc(ast1FilterPortLabel(m,p.index))+'\u51fa\u53e3\uFF09':''} ${p.x},${p.y}${p.kind==='in'&&getRecipe(m)?' · '+esc([...inletMaterials(m,p.index)].join('、')||'未连接'):''} · ${portSteadyRate(m,p).toFixed(2)}/min</span>${p.kind==='in'&&m.type!=='汇流'&&m.type!=='仓入'&&m.type!=='分流'?`<select data-filter="${p.index}"><option value="">按配方自动</option>${MATERIALS.map(q=>`<option value="${esc(q)}" ${p.filter===q?'selected':''}>${esc(q)}</option>`).join('')}</select>`:p.kind==='out'&&m.type==='分流'?`<select data-out-filter="${p.index}"><option value="">任意</option>${MATERIALS.map(q=>`<option value="${esc(q)}" ${p.filter===q?'selected':''}>${esc(q)}</option>`).join('')}</select>`:`<span class="tiny">${esc(p.filter||'任意')}</span>`}</div>`).join('')}
 ${m.type==='分流'?`<p class="tiny">每个出口可过滤指定材料，或设为任意。每次轮流尝试可接收且不堵塞的出口，均堵则等待；输入最多1件/s。
如果「任意」和指定物品的出口同时通畅，同种物品仍会轮流分流，过滤器不是流量比例调节器。</p>`:''}
 <div class="divider"></div><div class="actions"><button id="duplicate">复制并放置 (Ctrl+D)</button><button id="deleteM" style="border-color:#944751">删除机器</button></div>
 ${machineSteadyPanel(m)}
 ${machineLiveInventory(m)}`;

}
function refresh(){ $('topStats').textContent=`${state.machines.length}台设备 · ${state.routes.length}条线路 · ${getBeltCount()}格传送带`; warehouseRefresh();inspectorRefresh();auditRefresh();draw();}
