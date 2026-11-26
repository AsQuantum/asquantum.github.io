'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..'),engine=path.join(root,'scripts/engine'),read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
test('offline worker contains identical deployed worker dependencies',()=>{
 const worker=read(path.join(engine,'steady-certified-worker.js')),match=worker.match(/importScripts\(\.\.\.\[([\s\S]*?)\]\.map\(f=>f\+revision\)\);/);assert(match);
 const dependencies=[...match[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 const expected=worker.slice(0,match.index)+dependencies.map(f=>read(path.resolve(engine,f))).join('\n')+worker.slice(match.index+match[0].length);
 const offline=vm.runInNewContext(read(path.join(engine,'steady-certified-offline.js'))+'\nFACTORY_CERTIFIED_OFFLINE_SOURCE');
 assert.equal(offline,expected,'run python tools/build-offline-worker.py after modifying math dependencies');
});
test('HTML and worker files are present, no old solver loaded',()=>{
 const html=read(path.join(root,'index.html'));
 for(const m of html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g))assert(fs.existsSync(path.join(root,m[1])),m[1]);
 assert(!/scripts\/engine\/steady-(?:auto-fluid|direct-budget|direct-service|equations)\.js/.test(html));
});
