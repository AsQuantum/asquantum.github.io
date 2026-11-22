'use strict';
const AST1_TYPE_BY_ID = ['垃圾', '粒子', '发电', '废料', '浇筑', '燃料', '电池', '共鸣', '分流', '汇流', '仓入', '仓出', '采矿', '冶炼', '组装', '量装', '空间锚点', '电脑'];
const AST1_ID_BY_TYPE = Object.fromEntries(AST1_TYPE_BY_ID.map((v, i) => [v, i]));
const AST1_ROTATION = {regular: ['E', 'N', 'W', 'S'], router: ['S', 'E', 'N', 'W'], warehouseIn: ['N', 'W', 'S', 'E']};
const AST1_MODE = {
    垃圾: [0, 1], 粒子: [0, 1], 采矿: [0, 1],
    冶炼: ['钛合金锭', '合金板', '硅晶圆'],
    组装: ['齿轮组', '导线线圈', '隔热泡沫', '电动机', '框架模块', '复合装甲板', '古代芯片'],
    量装: ['等离子电池', '量子处理器', '引力透镜', '曲速线圈']
};
