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

## 游戏物品 ID

已核对 23/23 种物品的 AST1 ID。查阅或更新 `scripts/blueprints/item-ids.js`。

## 稳态流量与验证

理论求解器是线性规划近似模型。分流器的真正行为是三出口轮询尝试，堵塞则跳过；出口均畅通时均分。对可证明不会持续堵塞的入库旁路添加公平分流必要约束，但不等于完整的三口动态水位分配模型。严格的逐件通过规则请以实际模拟为准。

在项目根目录执行 `node tests/steady-flow-fairness.test.js`。测试包含三出口各 1/3，单一出口上限 0.2 时的 0.4 / 0.4 / 0.2，以及两口各 0.5。

## 多选和整体编辑

在空白地图按住左键拖动（或按 B 切换到框选工具），可框选机器及完整落在框内的传送带路线。Shift+拖动也可在选择工具下框选。

- **G**：移动当前选中的机器和内部路线，鼠标跟随预览，左键 / Enter 放置。
- **Ctrl+C / Ctrl+V**：复制选区 / 粘贴选区；**Ctrl+D**：直接复制并进入放置。
- **Q / E**：在组放置预览中逆时针 / 顺时针旋转 90°。
- **Esc**：取消预览、不更改原布局；**Delete**：删除选区。

位置、禁建区域、外部机器和路线冲突时，预览变红且不允许提交。仅连接两台选中机器、且整条路径在框内的路线会随组变换；移动时其他与选中机器相连的路线断开，复制时不建立新的外部连接。整个操作只占用一条撤销记录。

单击机器和框选机器统一使用同一组操作；机器左键拖动不再直接改变位置。选中单台机器后按 G 移动、Ctrl+D 复制并跟随鼠标、Q/E 进入旋转放置预览（包括属性栏旋转按钮）。只有单击确认后才断开旧外部线路；Esc 取消会保留原机器和原连接。

也可以直接按住机器拖动：鼠标移动超过 5 像素后进入与 G 完全相同的实时放置预览。松开拖动键只结束拖拽（仍可 Q/E 旋转或继续移动鼠标），再次左键 / Enter 才确认放置；Esc 取消，原连接不会受影响。拖动多选中的任意一台机器会整体移动已选区域。
