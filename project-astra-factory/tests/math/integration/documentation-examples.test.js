'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
const root=path.resolve(__dirname,'../../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const registry=JSON.parse(read('docs/math-example-registry.json')),suites=JSON.parse(read('tests/suites.json'));
test('every current documented example has a registered executable production test',()=>{
 const actual=[...(read(registry.retainedExampleDocument)+'\n'+read('docs/generic-machine-rate-model.md')).matchAll(/^\| (EX-[A-Z]+) \|/gm)].map(m=>m[1]);
 assert.deepEqual(actual,registry.currentExamples.map(x=>x.id));
 assert.equal(new Set(actual).size,actual.length);
 const paths=new Set(Object.values(suites.groups).flat().map(x=>typeof x==='string'?x:x.file));
 for(const c of registry.currentExamples){
  assert(paths.has(c.test),c.id+' test not registered');
  assert(c.test.startsWith('tests/')&&!c.test.includes('archive'),c.id);
  assert(read(c.test).includes(c.marker),c.id+' test case missing');
 }
});
test('every archived named test is traceable and every restored historical layout is covered',()=>{
 const names=[...new Set(read(registry.historicalDocument).match(/\btest_[a-z0-9_]+\.js\b/g))].sort();
 assert.deepEqual(registry.historicalTestReferences.map(x=>x.name).sort(),names);
 const ids=new Set(registry.currentExamples.map(x=>x.id));
 for(const x of registry.historicalTestReferences){assert(fs.existsSync(path.join(root,x.archive)),x.archive);assert(x.currentRelatedCases.every(id=>ids.has(id)),x.name);}
 const cases=JSON.parse(read(registry.historicalLayouts)),coverage=JSON.parse(read(registry.historicalCoverage));
 assert.deepEqual(cases.map(c=>c.id),coverage.map(c=>c.id));assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 const report=read('docs/math-example-coverage.md');
 for(const c of cases)assert(report.includes('| '+c.id+' |'),c.id+' not documented');
});
