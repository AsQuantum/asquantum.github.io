# Factory Lab — GitHub Pages 目录版 (V35)

从 V35 单文件 HTML 拆分而来，**不改变模拟器配方和 AST1 蓝图格式**。纯静态文件，无后端、npm、构建命令或第三方 CDN。

## 部署

将本目录中 `index.html`、`styles/`、`scripts/`、`.nojekyll` 上传到 GitHub 仓库根目录。
打开仓库 **Settings → Pages → Build and deployment → Deploy from a branch**，选择相应分支的 **/(root)**。
也可将本目录整体放入 `docs/`，在 Pages 设置中选择 `/docs`。

## 本地测试

在本目录执行 `python -m http.server 8000`，浏览器访问 `http://localhost:8000/`。
建议不要直接通过 `file://` 打开，以便与 GitHub Pages 环境一致。

## 模块目录

- `styles/main.css` — 原页面样式
- `scripts/data/catalog.js` — 23 种物品、机器规格、配方、基础坐标常量
- `scripts/data/warp-preset.js` — 内置示例工厂，已移出 HTML
- `scripts/core/state.js` — 编辑器状态、画布上下文
- `scripts/core/machines.js` — 机器方向、端口、材料过滤
- `scripts/core/routing.js` — 路径有效性与寻路
- `scripts/core/editor.js` — 拖放、撤销、状态变更
- `scripts/core/audit.js` — 线路和接口审计
- `scripts/core/layout-io.js` — JSON 导入导出
- `scripts/engine/steady-flow.js` — 不推进时间的稳态理论流量计算
- `scripts/engine/simulation.js` — 逐件物流模拟
- `scripts/engine/acceptance.js` — 模拟验收
- `scripts/blueprints/machine-ids.js` — AST1 机器类型 ID / 配方模式
- `scripts/blueprints/item-ids.js` — **AST1 游戏物品 ID，后续只修改此文件**
- `scripts/blueprints/ast1-codec.js` — AST1 二进制导入、导出
- `scripts/blueprints/ast1-ui.js` — 蓝图面板
- `scripts/ui/` — 属性栏、仓库收支、画布、事件、初始化等

使用按顺序加载的常规 JavaScript 脚本来保留 V35 原有顶层变量和函数，不需添加新的模块打包器。

## 下一个待确认的 ID

按 `MATERIALS` 的原始排列顺序，`太空垃圾` 是下一个未确认游戏物品 ID。
让一个分流器的前出口过滤为 `太空垃圾`，其他两口保留任意，导出 AST1 后即可确定。不要把编号猜写进映射。
