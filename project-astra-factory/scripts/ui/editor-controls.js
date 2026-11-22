'use strict';
function setTool(t){if(groupTransform)cancelGroupTransform();if(t!=='marquee'&&t!=='select')clearGroupSelection();tool=t;stampType=null;draft=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));document.querySelectorAll('#palette button').forEach(b=>b.classList.remove('active'));updateHint();draw();}
function rotateStamp(steps=1){if(!stampType)return;const faces=['E','S','W','N'];stampFace=faces[(faces.indexOf(stampFace)+steps+4)%4];saveStampPreference();updateHint();draw();}
function cancelDraft(){if(!draft)return;draft=null;updateHint();notify('本次传送带接线已取消');draw();}
function undoDraftBend(){if(!draft)return;if(draft.history?.length){draft.path=draft.history.pop();draft.preview=null;updateDraftPreview();updateHint();draw();}else cancelDraft();}
function draftEndpoint(){if(!draft)return null;const s=outPort(machineById(draft.from.id),draft.from.port);return draft.path.length?draft.path.at(-1):s?[s.ex,s.ey]:null;}
// Commit waypoints as actual orthogonal belt cells. Locked segments are never recalculated afterwards.
function draftSegment(target,targetPort=null){
 if(!draft||!target||!inMap(...target))return null;
 const start=draftEndpoint();if(!start)return null;
 const src=outPort(machineById(draft.from.id),draft.from.port);
 const startPrev=draft.path.length>1?draft.path.at(-2):src?[src.x,src.y]:null;
 const endNext=targetPort?[targetPort.x,targetPort.y]:null;
 const avoid=new Set(draft.path.slice(0,-1).map(p=>p.join(',')));
 const segment=pathSearch(start,target,avoid,{startPrev,endNext,allowOpenCrossingEnd:!endNext});
 if(!segment)return null;
 const combined=draft.path.length?[...draft.path,...segment.slice(1)]:segment;
 if(new Set(combined.map(p=>p.join(','))).size!==combined.length)return null;
 return combined;
}
function draftTarget(cell){if(!cell||!inMap(cell.x,cell.y))return null;let hit=portAt(cell.x,cell.y);if(hit?.p.kind==='in')return [hit.p.ex,hit.p.ey];if(!cellMachine(cell.x,cell.y)&&!reserved(cell.x,cell.y))return [cell.x,cell.y];return null;}
function updateDraftPreview(){if(!draft)return;let target=draftTarget(hoverCell);const port=hoverCell&&portAt(hoverCell.x,hoverCell.y)?.p;draft.preview=target?draftSegment(target,port?.kind==='in'?port:null):null;}

function updateHint(){
 $('stampControls').style.display=stampType?'block':'none';
 $('beltControls').style.display=draft?'grid':'none';
 if(stampType)$('stampFacing').textContent=({E:'右 →',S:'下 ↓',W:'左 ←',N:'上 ↑'})[stampFace];
}
function buildPalette(){let terms=$('search').value.trim().toLowerCase();let grouped={};for(let [k,d] of Object.entries(DEF)){if(!`${d.name} ${k} ${Object.keys(d.recipes||{}).join(' ')}`.toLowerCase().includes(terms))continue;(grouped[d.cat]??=[]).push([k,d]);}let p=$('palette');p.innerHTML=Object.entries(grouped).map(([cat,list])=>`<div class="tiny" style="margin:9px 0 3px;font-weight:bold">${esc(cat)}</div>${list.map(([key,d])=>`<button data-stamp="${esc(key)}"><span style="color:${d.color}">▣ ${esc(d.name)}</span><small>${d.w}×${d.h}</small></button>`).join('')}`).join('');}
function screenToCell(px,py){return {x:Math.floor((px-camera.x)/camera.z),y:Math.floor((py-camera.y)/camera.z)};}
function eventCoords(e){const rect=canvas.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top};}
function autoFit(){camera.z=Math.min((pix.w-40)/72,(pix.h-40)/72);camera.x=(pix.w-72*camera.z)/2;camera.y=(pix.h-72*camera.z)/2;draw();}
function resize(){let rect=canvas.getBoundingClientRect();pix={w:rect.width,h:rect.height,dpr:Math.max(1,window.devicePixelRatio||1)};canvas.width=Math.round(pix.w*pix.dpr);canvas.height=Math.round(pix.h*pix.dpr);autoFit();}
