'use strict';
function setTool(t){if(groupTransform)cancelGroupTransform();if(t!=='marquee'&&t!=='select')clearGroupSelection();tool=t;stampType=null;draft=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));document.querySelectorAll('#palette button').forEach(b=>b.classList.remove('active'));updateHint();draw();}
// Escape/right-click always return to an idle, unselected editor.
// Never touch persistent layout, undo history, or the copied clipboard.
function resetEditorMode(){
 selection=null;
 multiSelection=null;
 groupTransform=null;
 marquee=null;
 drag=null;
 draft=null;
 spaceDown=false;
 setTool('select');
 updateGroupControls();
 inspectorRefresh();
}
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
 updateStampControls();
 $('beltControls').style.display=draft?'grid':'none';
}
function buildPalette(){
 const terms=$('search').value.trim().toLowerCase(),grouped={};
 for(const [key,d] of Object.entries(DEF)){
  const recipeWords=Object.values(d.recipes||{}).flatMap(rec=>[rec.output,...Object.keys(rec.inputs||{})]);
  if(![d.name,key,...recipeWords].join(' ').toLowerCase().includes(terms))continue;
  (grouped[d.cat]??=[]).push([key,d]);
 }
 $('palette').innerHTML=Object.entries(grouped).map(([category,list])=>
  `<div class="machine-palette-group"><div class="machine-palette-heading"><span>${esc(category)}</span><small>${list.length} 种</small></div>
    ${list.map(([key,d])=>`<button type="button" data-stamp="${esc(key)}" style="--palette-machine-color:${d.color}" title="选择 ${esc(d.name)} 放置"><span class="machine-palette-label"><i class="machine-palette-mark" style="background:${d.color}"></i><span>${esc(d.name)}</span></span><small>${d.w}×${d.h}</small></button>`).join('')}
   </div>`).join('')||'<div class="tiny" style="padding:12px 3px">没有匹配的机器或配方</div>';
}
function screenToCell(px,py){return {x:Math.floor((px-camera.x)/camera.z),y:Math.floor((py-camera.y)/camera.z)};}
function eventCoords(e){const rect=canvas.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top};}
function autoFit(){camera.z=Math.min((pix.w-40)/72,(pix.h-40)/72);camera.x=(pix.w-72*camera.z)/2;camera.y=(pix.h-72*camera.z)/2;draw();}
function resize(){let rect=canvas.getBoundingClientRect();pix={w:rect.width,h:rect.height,dpr:Math.max(1,window.devicePixelRatio||1)};canvas.width=Math.round(pix.w*pix.dpr);canvas.height=Math.round(pix.h*pix.dpr);autoFit();}
