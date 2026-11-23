'use strict';
// Regression: AST1 export must not force iOS Safari zoom and copy must write
// to the real clipboard when the browser permits it. Mobile hints are transient.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const astCode=fs.readFileSync(path.join(__dirname,'../scripts/blueprints/ast1-ui.js'),'utf8');
const mobileCode=fs.readFileSync(path.join(__dirname,'../scripts/ui/mobile.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const mobileStyle=fs.readFileSync(path.join(__dirname,'../styles/mobile.css'),'utf8');
const dialogStyle=fs.readFileSync(path.join(__dirname,'../styles/ast1-dialog.css'),'utf8');

async function verify(){
 const events=[];
 const ids=['ast1Panel','ast1Text','ast1PanelTitle','ast1Apply',
  'ast1PanelHint','ast1PanelStatus','ast1Close','ast1Copy','file'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{style:{},dataset:{},textContent:'',
  value:'',readOnly:false,disabled:false,focus(){events.push('focus')},
  select(){events.push('select')},setSelectionRange(){},blur(){}}]));
 const copy=n=>nodes[n];
 let legacy=false,modern='ok';
 const navigator={clipboard:{async writeText(text){
  events.push('clipboard:'+text);
  if(modern==='reject')throw Error('clipboard permission denied');
 }}};
 const document={execCommand(op){events.push('legacy:'+op);return legacy}};
 const make=new Function('$','navigator','document','window','ast1Encode',
  'importFeedback','warnings','importOverwriteScheme','importNewScheme','notify','state',
  astCode+';return {ast1ShowPanel,ast1Copy:$( "ast1Copy" )};');
 const ast=make(copy,navigator,document,{matchMedia:()=>({matches:true})},
  ()=>'',()=>{},()=>{},()=>{},()=>{},()=>{},{});
 ast.ast1ShowPanel('export','AST1:testcode');
 assert(nodes.ast1Text.readOnly);
 assert(!events.includes('focus')&&!events.includes('select'));
 await ast.ast1Copy.onclick();
 assert(events.includes('clipboard:AST1:testcode'));
 assert.match(nodes.ast1PanelStatus.textContent,/系统剪贴板/);
 modern='reject';legacy=true;events.length=0;
 await ast.ast1Copy.onclick();
 assert(events.includes('legacy:copy'));
 assert.match(nodes.ast1PanelStatus.textContent,/系统剪贴板/);
 legacy=false;
 await ast.ast1Copy.onclick();
 assert.match(nodes.ast1PanelStatus.textContent,/手动复制/);

 const classes=new Set();
 const toast={textContent:'',classList:{
  toggle(name,yes){if(yes)classes.add(name);else classes.delete(name)},
  remove(name){classes.delete(name)}
 }};
 let count=0,scheduled=new Map();
 const mobile=new Function('$','window','document','setTimeout','clearTimeout',
  mobileCode+';return mobileSetMapStatus')(
   id=>id==='mobileMapState'?toast:null,
   {matchMedia(){return{matches:false,addEventListener(){}}}},
   {querySelector(){return null},querySelectorAll(){return[]},addEventListener(){}},
   (fn,delay)=>{assert.equal(delay,3000);scheduled.set(++count,fn);return count},
   id=>scheduled.delete(id)
 );
 mobile('双指缩放、平移地图');
 assert(classes.has('is-visible'));assert.equal(count,1);
 mobile('双指缩放、平移地图');
 assert.equal(count,1);
 for(const fn of scheduled.values())fn();
 scheduled.clear();
 assert(!classes.has('is-visible'));
 mobile('双指缩放、平移地图');
 assert(!classes.has('is-visible'));
 mobile('接线：点橙色输出口 → 蓝色输入口');
 assert(classes.has('is-visible'));assert.equal(count,2);
 assert(mobileStyle.includes('.mobile-map-state.is-visible:not(:empty)'));
 assert(dialogStyle.includes('font-size:16px'));
 assert(index.includes('styles/ast1-dialog.css'));
 assert(index.includes('aria-label="关闭蓝图窗口"'));
 console.log('PASS: AST1 export no auto-zoom focus, system clipboard and fallback, 3-second only-on-change mobile hint');
}
verify().catch(error=>{console.error(error);process.exitCode=1});
