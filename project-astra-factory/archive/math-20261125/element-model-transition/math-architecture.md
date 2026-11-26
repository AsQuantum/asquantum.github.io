# 正式数学工程结构

## 唯一生产源码

```
scripts/engine/math/
  arithmetic/rational.js                 精确有理数
  graph/                                物理建图、SCC/深度、可达性、结构零
  algebra/                               守恒约束编译、精确消元及区间投影
  proofs/
    ordinal/                             序号图、加工树、共享根斜率证书
    logistics/                           FIFO阻塞、分汇流、端口服务与反压
    warehouse/                           仓出补料优先、库存服务、需求与联合界
    frozen/                              冻结共同服务、独占链、反馈与稀疏优先
  metrics/                               条件需求与反事实辅助证明
  pipeline/certified_counts.js           唯一严格求解编排入口
scripts/engine/
  steady-certified-proofs.js              自动生成的证明bundle
  steady-certified-worker.js              HTTP运行入口
  steady-certified-offline.js             自动生成的file://资源
  steady-certified-display.js             输出分式适配
  steady-flow.js                          视图查询，不包含旧数学求解器
  simulation.js                          独立物理模拟，不参与理论推导
scripts/ui/theory-worker.js                网页异步任务、缓存及错误状态
```

依赖方向：算术/物理输入 → 图与代数基础 → 各类独立证明 → 编排 → 展示。证明输出带前提的等式/不等式/边界合同；不能直接写 UI，也不读样本或模拟输出。编排有限地传播新事实；不做数值速率逼近。现有 classic-script bundle 按登记表次序构建，保留浏览器静态部署方式；模块源文件按责任划分，不在研究目录复制第二套正式公式。

## 新增定理流程

1. 在对应目录新增或修改模块，登记 `docs/math-proof-registry.json`；注明前提、数学范围、拒证条件、所需边界合同。
2. 在 `tests/math/` 对应分类增加一般图正例与反例、实际AST验证；不能只对固定机器编号拟合。实际布局与冻结配置均保存在 `tests/fixtures/`，不可从生产求解器读入。
3. 更新 `docs/generic-machine-rate-model.md` 和 `docs/math-example-registry.json` 中具名算例ID。如果替代历史证明，更新迁移清单。
4. 运行 `python tools/build-math.py` 和 `node tests/run-tests.js math`。该构建统一更新正式 proof bundle 与离线资源；用户直接打开HTML仍无需 Python 或 npm。源码缺失、未登记、bundle哈希过期、离线资源不一致或文档引用无测试时正式测试失败。

## 归档

`archive/math-20261125/` 保存迁移前研究、全文、旧引擎、旧测试和历史结果。旧 LP、连续供需/迭代、轨迹周期等算法不参与生产。归档不是运行依赖，不算当前证明完成；历史脚本需恢复旧版本环境才可复现。原先被 Git 忽略的研究源码中属于现行证明的25个文件已迁到正式路径（22个bundle模块及3个独立基础文件）；归档大型第三方工具只本地保留。历史实验代码不可覆盖新数学模块。

`docs/math-example-coverage.md` 记录未全部迁移的案例，不能通过删除测试、降低基线或忽略未知来制造完成度。
