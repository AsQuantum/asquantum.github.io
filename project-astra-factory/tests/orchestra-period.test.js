'use strict';
const {countPeriod,componentMusicPeriod,scorePeriod}=require('../tools/iteration/orchestra-period');
const assert=require('node:assert/strict'),test=require('node:test');
test('event cursors advance by counts, not by elapsed beats',()=>{
 assert.equal(countPeriod(6,16),8n);assert.equal(countPeriod(0,16),1n);
 assert.equal(componentMusicPeriod(120,[{count:6,length:16},{count:5,length:16}]),1920n);
 assert.equal(scorePeriod([{periodTicks:120,counts:[{count:6,length:16}]},{periodTicks:100,counts:[{count:5,length:16}]}],320),4800n);
});
