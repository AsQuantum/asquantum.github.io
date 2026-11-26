'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process'),assert=require('assert/strict');
const {compileExactRateProblem}=require('./compile_exact'),{solveDirectRateProblem,makeRateAlgebra}=require('./direct_algebra');
const c=vm.createContext({console,performance});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../scripts/engine/steady-flow.js'),'utf8'),c);
const arith=vm.runInContext('({q:steadyRegionQ,add:steadyExactAdd,sub:steadyExactSub,mul:steadyExactMul,div:steadyExactDiv,cmp:steadyExactCmp,txt:steadyExactText,Z:STEADY_ZERO,U:STEADY_ONE})',c);
function solve(g,policy='fair',ms=10000){const p=compileExactRateProblem(g,{inletPolicy:policy}),t=performance.now(),r=solveDirectRateProblem(p,arith,{ms});return {...r,ms:Math.round(performance.now()-t)};}
if(require.main===module){
 const input=process.argv[2];
 if(input==='historical'){
  const seen=new Set(),results=[];
  for(const [i,line] of fs.readFileSync(path.join(__dirname,'captured-historical.jsonl'),'utf8').trim().split(/\r?\n/).entries()){
   const {g,expected}=JSON.parse(line),key=JSON.stringify(g);if(seen.has(key))continue;seen.add(key);
   if(g.nodes.length>20)continue;
   const r=solve(g,'fair',3000);results.push({i,nodes:g.nodes.length,expected:expected.status,result:r});
   console.log(i,g.nodes.length,expected.status,r.status,r.ms,r.stats,JSON.stringify(r.unique||{}).slice(0,180));
  }
  fs.writeFileSync(path.join(__dirname,'direct-historical-small.json'),JSON.stringify(results,null,2));
 }else{
  const g=JSON.parse(cp.execFileSync(process.execPath,[path.join(__dirname,'export-graph.js'),input],{encoding:'utf8'}));
  const r=solve(g,process.argv[3]||'relaxed',Number(process.argv[4]||10000));
  fs.writeFileSync(path.join(__dirname,path.basename(input,'.txt')+'.direct.result.json'),JSON.stringify(r,null,2));
  console.log(JSON.stringify({status:r.status,ms:r.ms,stats:r.stats,unique:r.unique,multiple:r.multiple,witness:r.witness&&Object.fromEntries(Object.entries(r.witness).filter(([k])=>k.startsWith('net:')))},null,2));
 }
}
module.exports={arith,solve};
