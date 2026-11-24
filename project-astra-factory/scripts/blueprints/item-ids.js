'use strict';
// Canonical numeric game item IDs; never renumber existing IDs.
const AST1_ITEMS = {
    1: '古代芯片',
    2: '能量电池',
    7: '共鸣水晶',
    8: '废金属',
    9: '燃料罐',
    10: '合金板',
    11: '复合装甲板',
    16: '太空垃圾',
    17: '星尘粒子',
    19: '遐想物质',
    20: '相位粒子',
    444: '小行星矿石',
    445: '钛合金锭',
    446: '硅晶圆',
    447: '齿轮组',
    448: '导线线圈',
    449: '隔热泡沫',
    450: '电动机',
    451: '框架模块',
    452: '等离子电池',
    453: '量子处理器',
    454: '引力透镜',
    455: '曲速线圈'
};
const AST1_ITEM_IDS = Object.fromEntries(Object.entries(AST1_ITEMS).map(([i, v]) => [v, +i]));

// An unknown imported AST1 material stays a valid numeric ID, not a new
// selectable recipe item. The only visible placeholder format is 物品#ID.
function ast1ItemLabel(id){
 if(!Number.isInteger(id)||id<0||id>65535)throw Error('AST1 物品编号必须是 0–65535 的整数');
 return id===0?'任意':(AST1_ITEMS[id]||'物品#'+id);
}
function ast1ItemNumber(item){
 if(Number.isInteger(item)&&item>=0&&item<=65535)return item;
 if(typeof item!=='string')return undefined;
 const name=item.trim();
 if(name===''||name==='任意')return 0;
 if(AST1_ITEM_IDS[name]!==undefined)return AST1_ITEM_IDS[name];
 // Accept historical JSON imports, but always DISPLAY the short new name.
 const found=/^(?:物品\s*#?\s*|(?:未识别|未知)游戏物品\s*#\s*)(\d+)$/u.exec(name);
 if(!found)return undefined;
 const id=Number(found[1]);
 return Number.isInteger(id)&&id>=0&&id<=65535?id:undefined;
}
function ast1CanonicalItem(item){
 if(typeof item!=='string')return item;
 const id=ast1ItemNumber(item);
 if(id===undefined||item===''||item==='任意')return item;
 return ast1ItemLabel(id);
}
