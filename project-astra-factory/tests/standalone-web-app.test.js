'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
assert.match(html,/<meta name="apple-mobile-web-app-capable" content="yes"\s*\/>/);
assert.match(html,/<meta name="apple-mobile-web-app-title" content="Factory Lab"\s*\/>/);
assert.match(html,/<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon\.png"\s*\/>/);
assert.match(html,/<link rel="manifest" href="manifest\.webmanifest"\s*\/>/);
assert.strictEqual(manifest.display,'standalone');
assert.strictEqual(manifest.start_url,'./');
assert.strictEqual(manifest.scope,'./');
assert.strictEqual(manifest.id,'./');
assert(manifest.icons.some(icon=>icon.src==='apple-touch-icon.png'));
for(const file of ['favicon.svg','apple-touch-icon.png']){
 assert(fs.existsSync(path.join(root,file)),'icon asset exists: '+file);
}
console.log('PASS: iPhone standalone web-app metadata, manifest scope/launch and icon paths');
