# Workflow Manager — 工序管理工具

一个 Electron 桌面应用，用于管理 Live2D 角色建模等复杂项目的工序流程和工时追踪。

> ⚡ **本项目完全由 AI（Claude/DeepSeek）vibe coding 完成，未手写一行代码。**

## 功能

- **树形工序管理** — 无限层级节点树，展开/折叠，勾选完成态级联
- **计时追踪** — 每个节点独立计时，支持暂停/恢复，自动累计工时
- **番茄钟** — 独立悬浮窗，倒计时提醒
- **模板系统** — 工序保存为模板，一键创建新项目并关联模板对比工时
- **富文本笔记** — 基于 Editor.js，支持标题/列表/图片/下划线
- **导入/导出** — JSON 格式完整备份，含回收站软删除
- **无边框窗口** — 自定义标题栏，Windows/macOS 适配

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 28 |
| 数据库 | better-sqlite3（同步 API，WAL 模式） |
| 前端 | 纯 HTML/CSS/JS，无框架 |
| 编辑器 | Editor.js |
| 图标 | Fluent UI System Icons（内联 SVG） |

## 快速开始

```bash
# 安装依赖
npm install

# 启动应用
npm start

# 构建便携版
npm run build
```

数据库位置：`%APPDATA%\workflow-manager\data\workflow.db`

## 项目结构

```
├── main.js              # Electron 主进程
├── preload.js           # contextBridge 安全暴露 API
├── src/
│   ├── db.js            # SQLite 数据层（workflows/nodes/time_entries）
│   └── renderer/        # 前端页面
│       ├── index.html   # 主界面
│       ├── app.js       # 侧边栏 & 工作流管理
│       ├── tree.js      # 节点树渲染 & 交互
│       ├── detail.js    # 详情面板 & 计时器
│       ├── editor.js    # Editor.js 封装
│       ├── modal.js     # 弹窗组件
│       ├── style.css    # 全局样式
│       ├── pomodoro.*   # 番茄钟
│       └── settings.*   # 设置页
├── scripts/             # 模板创建脚本
│   ├── create_sop_template.js    # Live2D SOP 模板（12阶段）
│   ├── create_live2d_template.js # Live2D 完整流程模板
│   └── verify_sop.js             # 模板校验
├── agent.md             # AI Agent 开发指南
└── TEMPLATE_AGENT_SPEC.md
```

## 数据库设计

三张核心表：`workflows` → `nodes`（树形，parent_id 自引用）→ `time_entries`

- 模板即 Workflow（`is_template = 1`），创建项目时记录 `source_template_id` 用于工时对比
- 软删除 + 回收站，`ON DELETE CASCADE` 外键级联
- 退出时自动结算所有运行中的计时

## License

MIT
