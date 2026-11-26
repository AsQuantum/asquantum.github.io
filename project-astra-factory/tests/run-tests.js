'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),manifest=require('./suites.json');
const requested=process.argv.slice(2),tasks=[],seen=new Set();
if(requested.includes('--list')){
 for(const [k,v] of Object.entries(manifest.groups)){console.log(k+' ('+v.length+')');for(const f of v)console.log('  '+(typeof f==='string'?f:f.file+' '+f.args.join(' ')));}
 for(const [k,v] of Object.entries(manifest.aliases))console.log(k+' = '+v.join(' + '));process.exit(0);
}
function add(k){
 if(manifest.aliases[k]){for(const x of manifest.aliases[k])add(x);return;}
 if(!manifest.groups[k])throw Error('unknown suite: '+k+'; use --list');
 for(const x of manifest.groups[k]){
  const item=typeof x==='string'?{file:x,args:[]}:x,key=JSON.stringify(item);
  if(!seen.has(key)){seen.add(key);tasks.push({...item,group:k});}
 }
}
for(const k of requested.length?requested:['iteration-quick'])add(k);
let pass=0,fail=0;const failed=[];
for(const t of tasks){
 console.log('\n['+t.group+'] '+t.file+' '+t.args.join(' '));
 const r=spawnSync(process.execPath,[t.file,...t.args],{cwd:root,stdio:'inherit',timeout:120000,windowsHide:true});
 if(r.status===0)pass++;else{fail++;failed.push(t.file+' '+t.args.join(' '));if(r.error)console.error(r.error.message);}
}
console.log('\n'+JSON.stringify({passed:pass,failed:fail,total:tasks.length,failures:failed}));
process.exitCode=fail?1:0;
