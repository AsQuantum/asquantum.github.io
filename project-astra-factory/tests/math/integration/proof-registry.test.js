'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),registry=require(path.join(root,'docs/math-proof-registry.json'));
test('production proof registry agrees with actual generated bundle and source hashes',()=>{
 const bundle=fs.readFileSync(path.join(root,'scripts/engine/steady-certified-proofs.js'),'utf8');
 const modules=[...bundle.matchAll(/^\/\/ --- (.+)\.js source SHA256 ([a-f0-9]{64}) ---$/gm)];
 assert.deepEqual(modules.map(m=>m[1]),registry.activeBundleModules);
 for(const [_,name,hash] of modules){
  assert(!Object.hasOwn(registry.historicalModules,name),name);
  const src=path.join(root,registry.sourcePaths[name]);
  assert(fs.existsSync(src),name+' missing canonical source');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(src,'utf8').replace(/\r\n/g,'\n')).digest('hex'),hash,name+' stale bundle');
 }
 for(const [name,r] of Object.entries(registry.historicalModules)){assert(r.note&&r.status,name);assert(!modules.some(m=>m[1]===name),name);}
});

test('all canonical source files are classified and archived code is never loaded',()=>{
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);
 const actual=walk(path.join(root,'scripts/engine/math')).filter(p=>p.endsWith('.js')).map(p=>path.relative(root,p).replaceAll('\\','/')).sort();
 const declared=[...Object.values(registry.sourcePaths),...registry.standaloneSources].sort();
 assert.deepEqual(actual,declared);
 for(const f of declared){
  const s=fs.readFileSync(path.join(root,f),'utf8');
  assert(!/require\(['"](?:.*archive|.*research)\//.test(s),f);
 }
 const worker=fs.readFileSync(path.join(root,'scripts/engine/steady-certified-worker.js'),'utf8');
 assert(!/archive\/|research\/|steady-auto-fluid|steady-equations/.test(worker));
});
