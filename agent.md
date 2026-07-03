# Workflow Manager - AI Agent 开发指南

## 应用概述

Electron 桌面应用，用于管理 Live2D 等复杂项目的工序流程。
- **主数据库路径**：`%APPDATA%\workflow-manager\data\workflow.db`
- **启动命令**：`npm start` 或 `.\node_modules\.bin\electron.cmd .`

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 28 + contextBridge/preload.js |
| 数据库 | better-sqlite3（同步 API） |
| 渲染 | 纯 HTML/CSS/JS，无框架 |
| 图标 | Fluent UI System Icons（内联 SVG symbol） |

## 数据库路径陷阱（已踩坑）

**关键规则**：所有涉及数据库的脚本，必须使用与 `main.js` 完全相同的路径逻辑。

```javascript
// ✅ 正确：使用 app.getPath('userData')，但注意开发模式下 app.name 是 "Electron"
const dataDir = path.join(app.getPath('userData'), 'data');
const dbPath = path.join(dataDir, 'workflow.db');

// ✅ 正确：直接硬编码应用真实路径（workflow-manager）
const correctDir = path.join(app.getPath('appData'), 'workflow-manager', 'data');
const correctDbPath = path.join(correctDir, 'workflow.db');
```

**踩坑记录**：
- `app.name` 在 `package.json` 中定义为 `workflow-manager`，所以 `app.getPath('userData')` 返回 `%APPDATA%\workflow-manager`
- 但在独立脚本中运行 electron 时，`app.name` 会被 Electron 框架设为 `"Electron"`，导致路径变成 `%APPDATA%\Electron`
- 错误路径下创建的数据库与应用实际读取的数据库是**两个不同文件**

**验证方法**：在 main.js 启动时打印 `app.name` 和 `dbPath` 确认

## 创建模板的正确方式

通过应用内 UI 创建，或写脚本时**必须**：

```javascript
// 1. 获取应用实际的数据库路径
const correctDir = path.join(app.getPath('appData'), 'workflow-manager', 'data');
const correctDbPath = path.join(correctDir, 'workflow.db');
const db = require('./src/db')(correctDbPath);

// 2. 查找或创建模板
const wfs = await db.listWorkflows();
let template = wfs.find(w => w.name === '目标模板名');

// 3. 创建节点时，先建父节点获得真实 ID，再建子节点用该 ID
const parent = db.createNode(template.id, null, '父节点标题', 0);
const child = db.createNode(template.id, parent.id, '子节点标题', 0);
```

**parent_id 外键约束**：子节点的 `parent_id` 必须在同一 workflow 内存在。创建顺序错误（先建子节点再找父节点）会导致 `FOREIGN KEY constraint failed`。

## 调试技巧

### 启动时打印数据库内容
在 `main.js` 中 `app.whenReady()` 之前插入：
```javascript
(async function debugStartup() {
  const wfs = await db.listWorkflows();
  console.log('[DEBUG] dbPath =', dbPath);
  wfs.forEach(wf => console.log(`  ${wf.name}: ${db.listNodes(wf.id).length} nodes`));
})();
```

### 检查前端状态
在 DevTools Console 中：
```javascript
App.state.workflows          // 所有工作流
Tree.state.nodes            // 当前工作流所有节点
Tree.state.childrenMap      // parent_id → [child_ids]
Tree.state.nodeMap          // id → node 对象
```

### 诊断数据库
```javascript
// 检查节点是否有孤儿（parent_id 指向不存在的节点）
Tree.state.nodes.filter(n => n.parent_id != null && !Tree.state.nodeMap.has(n.parent_id))
```

## 文件结构

```
j:\ai\工序管理3\
├── main.js              # 主进程：窗口创建、IPC 注册、数据库初始化
├── preload.js           # contextBridge 暴露 window.api
├── package.json         # name: "workflow-manager"
└── src/
    ├── db.js            # better-sqlite3 封装
    └── renderer/
        ├── index.html   # HTML + 内联 SVG 图标
        ├── app.js       # 侧边栏、选择工作流、右键菜单
        ├── tree.js      # 节点树渲染、CRUD、打勾逻辑
        ├── detail.js    # 右侧详情面板、计时器
        ├── style.css    # 样式
        └── modal.js     # 提示框、确认框
```

## 图标系统

使用 Fluent UI System Icons，viewBox 统一 `0 0 24 24`，描边风格：
```html
<svg width="16" height="16" viewBox="0 0 24 24">
  <use href="#icon-name"/>
</svg>
```
图标定义在 `index.html` 顶部 `<svg style="display:none">` 中。

## 节点交互逻辑

| 操作 | 行为 |
|------|------|
| 单击节点 | 选中节点 |
| 双击节点 | 切换完成状态 |
| 三连击标题 | 进入编辑模式 |
| 单击复选框 | 切换完成状态 |
| 单击父节点 twisty | 展开/折叠子节点 |

### 完成状态级联
子节点全部完成 → 父节点自动勾选；取消任一子节点 → 父节点自动取消。

### 子节点完成百分比
有子节点的父节点会显示 `XX%` 进度（绿色背景表示 100%）。
