'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {iterationCheckStockCandidate:check}=require('../../scripts/engine/iteration/period-candidate');
const a={tick:20,stock:{ore:5,plate:0}};
const b=(ore,plate=0,tick=40)=>({tick,stock:{ore,plate}});
const keys=['ore','plate'];
test('unchanged inventories can cross stock guards within a period',()=>{
 assert.deepEqual(check(a,b(5),{ore:35,plate:36},keys),{accepted:true,periodTicks:20,drift:{ore:0,plate:0}});
});
test('positive drift requires every guarded withdrawal to remain independent of stock',()=>{
 assert.equal(check(a,b(9),{ore:20},keys).accepted,true);
 assert.equal(check(a,b(9),{ore:21},keys).reason,'positive-drift-crosses-guard');
});
test('negative real stock drift is not an infinite-period candidate',()=>{
 assert.equal(check(a,b(4),{},keys).reason,'negative-stock-or-drift');
 assert.equal(check(a,b(9,-1),{},keys).reason,'negative-stock-or-drift');
});
test('unlimited stock can drift in either direction; no guard is asserted',()=>{
 assert.deepEqual(check(a,b(4,-3),{plate:39},keys,{unlimited:true}),{accepted:true,periodTicks:20,drift:{ore:-1,plate:-3}});
});
test('invalid tick or inexact stock is rejected',()=>{
 assert.equal(check(a,b(5,0,20),{},keys).reason,'invalid-period');
 assert.equal(check(a,b(5.5),{},keys).reason,'invalid-stock');
});

test('finite loop acceleration stops before the first possible shortage',()=>{
 const {iterationPlanStockJump:jump}=require('../../scripts/engine/iteration/period-candidate');
 const prev={stock:{ore:100,plate:5}},now={stock:{ore:97,plate:6}},g={ore:4,plate:2};
 assert.equal(jump(prev,now,{ore:96,plate:5},g,keys),30);
 assert.equal(jump(prev,now,{ore:96,plate:1},g,keys),0);
 assert.equal(jump(prev,{stock:{ore:101,plate:6}},{ore:96,plate:5},g,keys),0);
});
