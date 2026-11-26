'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),test=require('node:test');
const c=vm.createContext({TextEncoder,TextDecoder,btoa,atob});
vm.runInContext(fs.readFileSync('scripts/ui/orchestra/score.js','utf8'),c);
const evalIn=s=>vm.runInContext(s,c);
test('music code preserves unicode, rest notes, tuning and rejects damaged codes',()=>{
 const data={harmony:{key:3,mode:'minor'},tracks:{'仓入':{instrument:'chime',volume:.7,ports:{in:[60,null,63]}}}};
 c.data=data;const code=evalIn('orchestraEncodeCode(data)');assert(code.startsWith('ORCH1:'));c.code=code;
 assert.equal(evalIn('JSON.stringify(orchestraDecodeCode(code))'),JSON.stringify(data));
 for(const bad of ['AST1:abc','ORCH1:!!!','ORCH1:'+ 'a'.repeat(200000)]){c.bad=bad;assert.throws(()=>evalIn('orchestraDecodeCode(bad)'))}
});
test('legacy shared score becomes the first preset; snapshots do not share mutable references',()=>{
 c.settings={harmony:{key:0,mode:'minor'},bpm:120,modulate:true,scores:{'shared-machine-events-v1':{'仓入':{instrument:'chime',volume:.7,ports:{in:[60]}}}}};
 evalIn('orchestraStoreMusicPreset(settings)');assert.equal(c.settings.activeMusicPreset,'music1');
 const first=c.settings.musicPresets[0].code;
 evalIn("const next=orchestraNextMusicPreset(settings);next.code=orchestraMusicSnapshot(settings);settings.musicPresets.push(next);settings.activeMusicPreset=next.id;settings.scores['shared-machine-events-v1']['仓入'].ports.in[0]=72;orchestraStoreMusicPreset(settings)");
 assert.equal(c.settings.musicPresets.length,2);assert.equal(c.settings.musicPresets[0].code,first);assert.notEqual(c.settings.musicPresets[1].code,first);
 assert.equal(evalIn("orchestraDecodeCode(settings.musicPresets[0].code).tracks['仓入'].ports.in[0]"),60);
});
test('registry removes malformed and duplicate entries and restores valid active ID',()=>{
 c.badSettings={activeMusicPreset:'missing',musicPresets:[{id:'music2',name:'A',code:'ORCH1:AAAA'},{id:'music2',name:'duplicate',code:'ORCH1:BBBB'},{id:'bad',name:'bad',code:'ORCH1:CCCC'}]};
 evalIn('orchestraMusicRegistry(badSettings)');assert.equal(c.badSettings.musicPresets.length,1);assert.equal(c.badSettings.activeMusicPreset,'music2');
});
