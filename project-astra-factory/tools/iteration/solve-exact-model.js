'use strict';
// Research CLI. Not a production proof worker; accepts AST1 plus frozen JSON.
const fs=require('node:fs'),path=require('node:path');
const {environment,root}=require('./model-environment');
const args=process.argv.slice(2);
if(!args.length||args.includes('--help')){
 console.log('node tools/iteration/solve-exact-model.js <ast1.txt> [--frozen <json>] [--mode actual|unlimited|both] [--max-ticks N] [--ms N] [--monolithic]');process.exit(0);
}
const file=args.shift(),opts={mode:'both',maxTicks:216000,ms:30000,frozen:[],mono:false};
while(args.length){
 const k=args.shift();
 if(k==='--monolithic'){opts.mono=true;continue;}
 const v=args.shift();
 if(k==='--frozen'){const j=JSON.parse(fs.readFileSync(path.resolve(root,v),'utf8'));opts.frozen=Array.isArray(j)?j:j.frozenFactories;}
 else if(k==='--mode')opts.mode=v;
 else if(k==='--max-ticks')opts.maxTicks=Number(v);
 else if(k==='--ms')opts.ms=Number(v);
 else throw Error('unknown argument '+k);
}
if(!['actual','unlimited','both'].includes(opts.mode)||!Number.isSafeInteger(opts.maxTicks)||opts.maxTicks<0||!Number.isFinite(opts.ms)||opts.ms<=0)throw Error('invalid options');
const e=environment();e.c.ast=fs.readFileSync(path.resolve(root,file),'utf8').trim();e.c.frozen=opts.frozen;e.c.opts=opts;
const result=e.run(`(()=>{state=ast1Decode(ast);state.frozenFactories=normalizeFrozenFactories(frozen);const results={};
 for(const mode of opts.mode==='both'?['actual','unlimited']:[opts.mode]){
  const spec=factoryCompileSymbolicSpec(state,{unlimitedWarehouse:mode==='unlimited'}),budget={maxTicks:opts.maxTicks,ms:opts.ms};
  results[mode]=opts.mono?iterationFindOrbit(iterationCreateKernel(spec,A),budget):iterationSolveComponents(spec,A,budget);
 }return {certified:false,scope:'independent-iteration-research',machines:state.machines.length,routes:state.routes.length,results};})()`);
console.log(JSON.stringify(result,null,2));
if(Object.values(result.results).some(x=>!x.values))process.exitCode=2;
