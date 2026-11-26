'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const file=path.resolve(__dirname,'../index.html').replace(/\\/g,'/');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'factory-button-'));
const child=spawn(edge,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+dir,'file:///'+file],{stdio:'ignore',windowsHide:true});
async function poll(f){for(let i=0;i<120;i++){try{const v=await f();if(v)return v;}catch(e){}await new Promise(r=>setTimeout(r,200));}throw new Error('Edge CDP timeout');}
(async()=>{
 try{
  const active=await poll(()=>fs.existsSync(path.join(dir,'DevToolsActivePort'))?fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8'):null);
  const port=active.trim().split(/\r?\n/)[0];
  const targets=await poll(async()=>{const a=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();return a.find(x=>x.type==='page'&&x.url.includes('project-astra-factory'))?a:null;});
  const target=targets.find(x=>x.type==='page'&&x.url.includes('project-astra-factory'));
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let next=0;const pending=new Map();const exceptions=[];
  ws.onmessage=ev=>{
   const msg=JSON.parse(ev.data);
   if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.text+' '+(msg.params.exceptionDetails.exception?.description||''));
   if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);p(msg);}}
  };
  const send=(method,params={})=>new Promise(resolve=>{const id=++next;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expr=>{const ret=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return ret.result?.result?.value??ret.result?.exceptionDetails?.text??ret.error??ret;};
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.reload',{ignoreCache:true});
  await poll(async()=>await evaluate('document.readyState==="complete"'));
  await new Promise(r=>setTimeout(r,350));
  await send('Emulation.setDeviceMetricsOverride',{width:1470,height:1000,deviceScaleFactor:1,mobile:false});
  const baseline=await evaluate(`(()=>{
   const left=document.querySelector('.side.left');
   const library=document.querySelector('.machine-library');
   const scroller=document.querySelector('.machine-library-scroll');
   const buttons=[...document.querySelectorAll('#palette [data-stamp]')];
   const first=buttons[0],firstBox=first?.getBoundingClientRect(),bottom=left.getBoundingClientRect().bottom;
   const m=state.machines.find(m=>m.type==='分流');
   selection={machineId:m.id};inspectorRefresh();
   const root=$('inspector');
   const outFilters=root.querySelectorAll('[data-out-filter]');
   const details=root.querySelector('.machine-port-details');
   const live=root.querySelector('.machine-buffer-details');
   const audit=document.getElementById('auditPanel'),logs=document.getElementById('logsPanel');
   const style=getComputedStyle(first);
   const info={btnCount:buttons.length,firstVisible:!!firstBox&&firstBox.top<bottom&&firstBox.bottom>left.getBoundingClientRect().top,
    paletteBg:style.backgroundColor,paletteBorder:style.borderLeftWidth,
    libraryCanScroll:scroller.scrollHeight>scroller.clientHeight,
    asideFixedScroll:getComputedStyle(left).overflowY==='hidden',
    searchFixed:library.querySelector('.machine-search').getBoundingClientRect().top<scroller.getBoundingClientRect().top,
    rightFilters:outFilters.length,portDetailsClosed:!details.open,liveDetailsClosed:!live.open,
    auditFolded:!audit.open,logsFolded:!logs.open,
    theoryTotals:root.querySelectorAll('.machine-flow-tile').length,
    liveTotals:root.querySelectorAll('.machine-live-history').length};
   // Expand port and live details without losing editable filters.
   details.open=true;live.open=true;
   const portOutputRows=details.querySelectorAll('.machine-port-detail-row.is-out').length;
   inspectorRefreshLive();
   info.detailsRemainOpen=details.open&&live.open;info.portOutputRows=portOutputRows;
   // The machine listing scrolls independently of the tool buttons/search field.
   const beforeTools=document.querySelector('.editor-tool-grid').getBoundingClientRect().top;
   scroller.scrollTop=120;
   info.toolPositionStable=beforeTools===document.querySelector('.editor-tool-grid').getBoundingClientRect().top;
   info.scrollerMoves=scroller.scrollTop>0&&scroller.getBoundingClientRect().top===library.querySelector('.machine-search').getBoundingClientRect().bottom+3;
   return info;
  })()`);
  console.log('SIDEBAR FULL SCREEN',JSON.stringify(baseline));
  assert(baseline.btnCount>10&&baseline.firstVisible&&baseline.libraryCanScroll&&baseline.asideFixedScroll&&
   baseline.searchFixed&&baseline.rightFilters===3&&baseline.portDetailsClosed&&baseline.liveDetailsClosed&&
   baseline.auditFolded&&baseline.logsFolded&&baseline.theoryTotals===2&&baseline.liveTotals===1&&
   baseline.portOutputRows===3&&baseline.detailsRemainOpen&&baseline.toolPositionStable,
   'sidebar must keep machine buttons visible, preserve filters and show compact expandable analysis');
  console.log('PASS: machine buttons visible on first screen with independent scroll, right details folded and filters retained');

  const restoredVisuals=await evaluate(`(()=>{
   const types=['垃圾','废料','组装','分流','仓入'];
   const colors=types.map(type=>{
    const button=document.querySelector('#palette button[data-stamp="'+type+'"]');
    const label=button?.querySelector('.machine-palette-label span');
    const expected=DEF[type].color;
    const n=parseInt(expected.slice(1),16);
    const rgb='rgb('+[n>>16&255,n>>8&255,n&255].join(', ')+')';
    return {type,expected,rgb,label:getComputedStyle(label).color,
     border:getComputedStyle(button).borderLeftColor,
     size:parseFloat(getComputedStyle(label).fontSize)};
   });
   const root=$('inspector');
   const theory=root.querySelector('#inspectorTheory');
   return {colors,
    namesUnique:new Set(colors.map(x=>x.label)).size===colors.length,
    coloredCorrectly:colors.every(x=>x.label===x.rgb&&x.border===x.rgb),
    readableLeft:colors.every(x=>x.size>=12),
    rightFont:parseFloat(getComputedStyle(root.querySelector('.machine-analysis-heading')).fontSize),
    filterFont:parseFloat(getComputedStyle(root.querySelector('[data-out-filter]')).fontSize),
    editFont:parseFloat(getComputedStyle(document.querySelector('#groupMove')).fontSize),
    noDuplicateRight:!root.querySelector('#duplicate,#deleteM,.machine-actions'),
    hasLeftButtons:!!document.querySelector('#groupMove,#groupDuplicate,#groupDelete'),
    noTheoryHelp:!theory.querySelector('.machine-steady-notes')&&!theory.textContent.includes('这里显示基于有效线路的理论稳态流量'),
    originalMachineColor:makeColor({type:'垃圾'})===DEF['垃圾'].color
   };
  })()`);
  console.log('RESTORED PALETTE/FONTS',JSON.stringify(restoredVisuals));
  assert(restoredVisuals.namesUnique&&restoredVisuals.coloredCorrectly&&restoredVisuals.readableLeft&&
    restoredVisuals.rightFont>=12&&restoredVisuals.filterFont>=12&&restoredVisuals.editFont>=11&&
    restoredVisuals.noDuplicateRight&&restoredVisuals.hasLeftButtons&&restoredVisuals.noTheoryHelp&&
    restoredVisuals.originalMachineColor,
   'restore original per-machine colors, bigger sidebar fonts, original machine border colors and no redundant controls/help');
  const headings=await evaluate(`(()=>{
   const left=document.querySelector('.side.left');
   const right=document.querySelector('.side.right');
   const rules=left.querySelector(':scope > .library-reference');
   const labels=[
    left.querySelector(':scope > h3:first-child'),
    [...left.querySelectorAll(':scope > h3')].find(x=>x.textContent.trim()==='机器库'),
    rules.querySelector(':scope > summary'),
    right.querySelector(':scope > .warehouse-panel > summary'),
    right.querySelector(':scope > #inspectorPanel > summary'),
    right.querySelector(':scope > #auditPanel > summary'),
    right.querySelector(':scope > #logsPanel > summary')
   ];
   const styles=labels.map(el=>{
    const st=getComputedStyle(el),rect=el.getBoundingClientRect();
    return {label:el.textContent.trim(),fontSize:parseFloat(st.fontSize),
     weight:Number(st.fontWeight),color:st.color,visible:rect.height>0,
     borderTop:getComputedStyle(el.parentElement.classList.contains('library-reference')?el.parentElement:el).borderTopWidth};
   });
   const libraryScroll=document.querySelector('.machine-library-scroll');
   libraryScroll.scrollTop=libraryScroll.scrollHeight;
   const rulesRect=rules.getBoundingClientRect(),leftRect=left.getBoundingClientRect();
   return {styles,defaultDisclosure:[...right.querySelectorAll(":scope > details")].map(d=>[d.id,d.open]),propertyDivider:getComputedStyle(right.querySelector(':scope > #inspectorPanel')).borderTopStyle==='solid'&&
    getComputedStyle(right.querySelector(':scope > #inspectorPanel')).borderTopWidth==='1px',
    machineDivider:getComputedStyle(labels[1]).borderTopWidth==='1px',
    rulesDivider:getComputedStyle(rules).borderTopWidth==='1px',
    rulesVisible:rulesRect.top>=leftRect.top&&rulesRect.bottom<=leftRect.bottom,
    rulesOutsideScroll:!libraryScroll.contains(rules),
    rulesStillVisibleAfterListScroll:rulesRect.top>=leftRect.top&&rulesRect.bottom<=leftRect.bottom};
  })()`);
  console.log('UNIFIED MAIN HEADINGS',JSON.stringify(headings));
  assert(headings.styles.length===7&&headings.styles.every(h=>h.visible&&h.fontSize===15&&
   h.weight===700&&h.color==='rgb(213, 229, 241)'),'main left/right sidebar headings must share the same typography');
  assert.deepEqual(headings.defaultDisclosure,[['warehousePanel',false],['inspectorPanel',true],['auditPanel',false],['logsPanel',false]]);
  assert(headings.propertyDivider&&headings.machineDivider&&headings.rulesDivider,
   'Property Editing and left sections need a consistent top separator');
  assert(headings.rulesVisible&&headings.rulesOutsideScroll&&headings.rulesStillVisibleAfterListScroll,
   'map rules must remain a visible first-level section, not be buried below the scrolling machine list');
  console.log('PASS: seven unified left/right first-level headings and consistent section dividers');
  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:800,deviceScaleFactor:1,mobile:false});
  const narrow=await evaluate(`(()=>{
   const left=document.querySelector('.side.left'),right=document.querySelector('.side.right');
   document.querySelector('.machine-library-scroll').scrollTop=0;
   const m=state.machines.find(m=>m.type==='采矿');
   selection={machineId:m.id};inspectorRefresh();
   const btns=[...document.querySelectorAll('#palette button[data-stamp]')];
   const visible=btns.some(b=>b.getBoundingClientRect().top>=left.getBoundingClientRect().top&&
     b.getBoundingClientRect().bottom<=left.getBoundingClientRect().bottom);
   return {sidebars:[left.getBoundingClientRect().width,right.getBoundingClientRect().width],
    visible,libraryFit:document.querySelector('.machine-library').scrollWidth<=document.querySelector('.machine-library').clientWidth+1,
    rightFit:$('inspector').scrollWidth<=$('inspector').clientWidth+1,
    toolsFit:document.querySelector('.editor-tools').scrollWidth<=document.querySelector('.editor-tools').clientWidth+1,
    paletteButtons:btns.length};
  })()`);
  console.log('SIDEBAR NARROW',JSON.stringify(narrow));
  assert(narrow.visible&&narrow.libraryFit&&narrow.rightFit&&narrow.toolsFit&&narrow.paletteButtons>10,
   'sidebar toolbar and machine buttons must fit 1000px viewport');
  await send('Emulation.clearDeviceMetricsOverride');
  assert.equal(exceptions.length,0,'uncaught Edge exceptions: '+exceptions.join(' | '));
  console.log('PASS: responsive sidebar layout, 1000px view, no horizontal clipping');
  ws.close();
 }catch(e){console.error(e);process.exitCode=1;}
 finally{child.kill();try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:3});}catch(e){}}
})();
