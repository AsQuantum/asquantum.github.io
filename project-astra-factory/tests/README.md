# Factory Lab 测试分类

在 project-astra-factory 根目录使用 Node.js 24+；浏览器测试使用 Windows Edge。tests/suites.json 为测试清单，tests/run-tests.js 逐文件执行并报告失败列表和退出码。默认 iteration-quick，current 为现行完整回归，不调用旧直接求解器作为生产路径。

| 分类 | 内容 |
|---|---|
| iteration-quick | tests/iteration/ 的周期守卫、精确内核、组件/边界、优化、事件图及生产树 |
| iteration-validation | 慢采矿、完整收支、历史布局/旧已证率对照 |
| iteration-browser | 真实HTTP、file://慢采矿、file://84机、file://共鸣水晶72机；Worker、缓存、优先级、进度、方法标签 |
| iteration | 上述三组 |
| physical | 实际模拟、冻结、端口/队列、物流、快进与编辑库存 |
| codec | AST1/JSON、未知物料及记录身份 |
| ui | 编辑器、移动端、外观与交互 |
| current | iteration + physical + codec + ui |
| math-quick / math / browser-math | 历史直接模型和旧接口对照，不是现行发布入口 |

```sh
node tests/run-tests.js --list
node tests/run-tests.js iteration-quick
node tests/run-tests.js iteration
node tests/run-tests.js physical codec
node tests/run-tests.js current
```

## 正式代码与资源

- scripts/engine/iteration/：新引擎精确状态/周期、组件、三类收支、解析定理。
- scripts/engine/iteration-worker.js、iteration-offline.js、iteration-display.js：同源HTTP/file Worker和显示适配。
- scripts/ui/theory-worker.js：任务、缓存、超时、异常诊断。
- scripts/engine/simulation.js：独立实际模拟参考。
- math/arithmetic/rational.js、math/graph/symbolic_physical_spec.js：共享基础数学/物理编译。
- 旧直接模型仅历史研究对照；禁止在生产回退或用已知AST结果表求解。

修改Worker依赖后运行 python tools/build-iteration-worker.py，再做新版单元、历史和浏览器回归；用户使用网页无需构建。物理或界面修改也运行对应分类。

## 专项测试与性能

| 主题 | 测试 / 工具 |
|---|---|
| 周期守卫、符号快进、证书、资源 | period-candidate.test.js、exact-kernel.test.js、optimization.test.js、p0-p5-research.test.js |
| 仓库竞争、冻结、条件日历、异常隔离 | boundary-pressure.test.js、components.test.js、causal-calendar.test.js |
| 自主源、生产树、断头及解析拒证 | components.test.js、tree-events.test.js |
| 历史布局及合法变体 | historical-optimization.test.js，50布局3933已证率、24变体1440状态 |
| 浏览器缓存、编辑、后台、进度 | iteration-worker-browser.test.js；可加 --file --user84、--compare-parallel、--compare-device、--resonance（独立组件缓存） |
| 冻结、惰性运输及实际快进基准 | tools/iteration/benchmark-frozen-lattice.js、benchmark-lazy-belts.js、benchmark-actual-belts.js、benchmark-simulation.js |
| 84机研究对比 | tools/iteration/probe-user-84.js，--clock-single [--absolute]、--belts、--frozen、--no-project、--output、--feed --tree-calendar |

测试与研究结果统一维护在 docs/iterative-rate-model.md 的相应主题和验收表。不能将有限预算未完成或未经证明的率填为零，不得降低历史覆盖基线掩盖回归。
