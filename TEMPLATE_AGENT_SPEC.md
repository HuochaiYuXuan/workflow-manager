# Workflow Manager - LLM Agent 模板创建规范

> 本文档供外部 LLM Agent 参考，用于通过数据库操作或 API 调用创建项目模板、节点及节点说明。

---

## 1. 核心概念

### 1.1 Workflow（工作流/模板）
- 应用中的顶层容器，包含所有节点
- 有两种类型：
  - **项目** (`is_template = 0`)：实际执行的项目
  - **模板** (`is_template = 1`)：可复用的模板，用于快速创建项目

### 1.2 Node（节点）
- 工作流中的任务单元
- 支持树形结构（父子关系）
- 每个节点有：标题、描述、完成状态、展开/折叠状态、排序权重

### 1.3 节点层级约定
- **根节点**：`parent_id = NULL`，通常是大的阶段或模块
- **子节点**：`parent_id = 父节点 id`，表示具体任务
- **叶节点**：没有子节点的节点，是真正要执行的任务

---

## 2. 数据库结构

### 2.1 workflows 表

| 字段 | 类型 | 说明 | 必填 | 默认值 |
|------|------|------|------|--------|
| id | INTEGER | 主键，自增 | 是 | AUTOINCREMENT |
| name | TEXT | 工作流名称 | 是 | `''` |
| is_template | INTEGER | 是否为模板（0/1） | 是 | 0 |
| is_archived | INTEGER | 是否已归档 | 是 | 0 |
| source_template_id | INTEGER | 来源模板 ID（项目用） | 否 | NULL |
| is_deleted | INTEGER | 软删除标记 | 是 | 0 |
| deleted_at | INTEGER | 删除时间戳（ms） | 否 | NULL |
| created_at | INTEGER | 创建时间戳（ms） | 是 | - |
| updated_at | INTEGER | 更新时间戳（ms） | 是 | - |

### 2.2 nodes 表

| 字段 | 类型 | 说明 | 必填 | 默认值 |
|------|------|------|------|--------|
| id | INTEGER | 主键，自增 | 是 | AUTOINCREMENT |
| workflow_id | INTEGER | 所属工作流 ID | 是 | - |
| parent_id | INTEGER | 父节点 ID，根节点为 NULL | 否 | NULL |
| title | TEXT | 节点标题 | 是 | `''` |
| description | TEXT | 节点描述（支持 Markdown） | 是 | `''` |
| is_completed | INTEGER | 是否已完成（0/1） | 是 | 0 |
| collapsed | INTEGER | 是否折叠（0/1） | 是 | 0 |
| sort_order | REAL | 排序权重（同层级内） | 是 | 0 |
| created_at | INTEGER | 创建时间戳（ms） | 是 | - |
| updated_at | INTEGER | 更新时间戳（ms） | 是 | - |

---

## 3. 数据库路径

**重要：必须使用正确的数据库路径！**

```
%APPDATA%\workflow-manager\data\workflow.db
```

在 Electron 主进程中获取：
```javascript
const dataDir = path.join(app.getPath('userData'), 'data');
const dbPath = path.join(dataDir, 'workflow.db');
```

⚠️ **陷阱提醒**：
- 独立脚本中运行 Electron 时，`app.name` 是 `"Electron"`，不是 `"workflow-manager"`
- 会导致 `app.getPath('userData')` 返回 `%APPDATA%\Electron`
- 解决方案：硬编码正确路径 `path.join(app.getPath('appData'), 'workflow-manager', 'data')`

---

## 4. API 调用方式

### 4.1 渲染进程 API（通过 preload.js 暴露）

```javascript
// 创建模板
await window.api.createWorkflow('模板名称', 'template');

// 创建项目
await window.api.createWorkflow('项目名称', 'project');

// 创建节点
await window.api.createNode(workflowId, parentId, '节点标题', sortOrder);

// 更新节点（设置描述）
await window.api.updateNode(nodeId, { description: '节点描述内容' });
```

### 4.2 直接操作数据库（Node.js 脚本）

```javascript
const path = require('path');
const { app } = require('electron');
const createDb = require('./src/db');

// 获取正确的数据库路径
const dataDir = path.join(app.getPath('appData'), 'workflow-manager', 'data');
const dbPath = path.join(dataDir, 'workflow.db');
const db = createDb(dbPath);
```

---

## 5. 模板创建流程

### 5.1 标准步骤

```
1. 创建 workflow（is_template = 1）
   ↓
2. 按顺序创建根节点（一级节点）
   ↓
3. 对每个根节点，创建其子节点
   ↓
4. 对每个子节点，如有需要继续创建下一级
   ↓
5. 为每个节点设置 description（节点说明）
```

### 5.2 关键约束

1. **父节点必须先创建**：子节点的 `parent_id` 必须指向已存在的节点 ID
2. **按层级从上到下创建**：先一级节点，再二级，再三级...
3. **同层级内注意 sort_order**：决定节点显示顺序
4. **模板节点都设为未完成**：`is_completed = 0`

---

## 6. 节点标题规范

### 6.1 命名原则

| 层级 | 命名风格 | 示例 |
|------|----------|------|
| 一级（模块/阶段） | 名词 + 模块名 | `建模准备`, `基础模型制作` |
| 二级（子任务） | 动词 + 任务内容 | `收集参考图`, `调整模型拓扑` |
| 三级（具体步骤） | 更细的动作描述 | `导出 UV 快照`, `绘制脸部贴图` |

### 6.2 标题要求

- ✅ 简洁明了，一眼知道要做什么
- ✅ 字数控制在 2-20 字之间
- ✅ 同一层级命名风格保持一致
- ❌ 不要用一句话长句子
- ❌ 不要含混模糊（"做一下那个东西"）
- ❌ 不要重复上级节点名称

---

## 7. 节点描述（说明）规范

### 7.1 描述内容结构

每个节点的 `description` 字段建议包含以下内容（根据节点层级调整）：

```markdown
## 任务目标
简要说明这个任务要达成什么结果

## 输入/前置条件
- 需要什么资源
- 依赖哪些前置任务

## 输出/交付物
- 产出什么文件
- 完成的标志是什么

## 操作步骤
1. 第一步...
2. 第二步...

## 注意事项
- 容易出错的地方
- 质量标准
```

### 7.2 各层级描述重点

| 层级 | 描述重点 | 详细程度 |
|------|----------|----------|
| 一级模块 | 整体目标、范围、包含的子任务概述 | 简略 |
| 二级任务 | 具体要做什么、验收标准、关键步骤 | 中等 |
| 三级步骤 | 详细操作步骤、参数设置、常见问题 | 详细 |

### 7.3 描述编写原则

- ✅ 使用 Markdown 格式
- ✅ 分点清晰，结构化
- ✅ 可执行：看到描述就知道怎么做
- ✅ 包含验收标准：怎么算做完了
- ❌ 不要太空泛（"认真做"）
- ❌ 不要重复标题
- ❌ 不要写与任务无关的内容

---

## 8. 完整示例脚本

### 8.1 创建模板的 Node.js 脚本

```javascript
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

// 正确的数据库路径
const dataDir = path.join(app.getPath('appData'), 'workflow-manager', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'workflow.db');
const db = require('./src/db')(dbPath);

function createTemplate(templateName, nodesData) {
  const now = Date.now();

  // 1. 创建模板
  const template = db.createWorkflow(templateName, 'template');
  const templateId = template.id;

  // 2. 按层级创建节点
  // idMap: 节点在 nodesData 中的标识 → 数据库中的真实 id
  const idMap = new Map();

  // 先创建一级节点
  for (const node of nodesData) {
    const created = db.createNode(templateId, null, node.title, node.sortOrder);
    idMap.set(node.id, created.id);

    // 设置描述
    if (node.description) {
      db.updateNode(created.id, { description: node.description });
    }

    // 创建子节点
    if (node.children && node.children.length > 0) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const childCreated = db.createNode(
          templateId,
          created.id,
          child.title,
          child.sortOrder || i + 1
        );
        idMap.set(child.id, childCreated.id);

        if (child.description) {
          db.updateNode(childCreated.id, { description: child.description });
        }

        // 三级节点（如需要继续嵌套）
        if (child.children && child.children.length > 0) {
          for (let j = 0; j < child.children.length; j++) {
            const grandChild = child.children[j];
            const gcCreated = db.createNode(
              templateId,
              childCreated.id,
              grandChild.title,
              grandChild.sortOrder || j + 1
            );
            if (grandChild.description) {
              db.updateNode(gcCreated.id, { description: grandChild.description });
            }
          }
        }
      }
    }
  }

  return db.getWorkflow(templateId);
}

// 使用示例
const templateData = [
  {
    id: 'module1',
    title: '建模准备',
    sortOrder: 1,
    description: '## 任务目标\n完成建模前的所有准备工作\n\n## 交付物\n- 参考图文件夹\n- 项目文件结构',
    children: [
      {
        id: 'task1-1',
        title: '收集参考图',
        sortOrder: 1,
        description: '## 任务目标\n收集足够的多角度参考图\n\n## 步骤\n1. 正面、侧面、背面各3张以上\n2. 细节特写（眼睛、嘴巴、手部）\n3. 整理到 reference/ 文件夹'
      }
    ]
  }
];

createTemplate('我的项目模板', templateData);
```

---

## 9. 常见问题与注意事项

### 9.1 FOREIGN KEY constraint failed

**原因**：创建子节点时，`parent_id` 指向的父节点还不存在。

**解决**：严格按照层级顺序创建，先父后子。创建完父节点后，获取其真实 `id` 再创建子节点。

### 9.2 模板创建后应用里看不到

**原因**：
1. 数据库路径错了（写到了 Electron 目录而不是 workflow-manager 目录）
2. `is_template` 字段没设为 1
3. 节点 `workflow_id` 不匹配

**排查**：
```javascript
// 打印所有工作流确认
const wfs = db.listWorkflows();
console.log(wfs.map(w => `${w.name} (template: ${w.is_template}, id: ${w.id})`));

// 打印某模板的节点数
const nodes = db.listNodes(templateId);
console.log(`节点数量: ${nodes.length}`);
```

### 9.3 节点顺序不对

**原因**：`sort_order` 设置不正确。

**解决**：同层级内，`sort_order` 越小越靠前。建议用连续整数 1, 2, 3...

### 9.4 节点描述过长

**建议**：
- 一级节点描述控制在 200 字以内
- 二级节点 500 字以内
- 三级节点可以详细一些，但控制在 1000 字以内
- 更详细的内容可考虑放外部链接或附件

---

## 10. 质量检查清单

创建完模板后，检查以下各项：

- [ ] 模板名称清晰，能看出用途
- [ ] 所有节点标题简洁明确
- [ ] 父子层级关系正确，没有孤儿节点
- [ ] 同层级内排序合理
- [ ] 关键节点都有 description
- [ ] 描述内容结构清晰、可执行
- [ ] 没有空节点（无标题无描述）
- [ ] 没有重复节点
- [ ] 整体逻辑连贯，从开始到结束流程完整
- [ ] 在应用中打开确认显示正常

---

## 11. 验证脚本

```javascript
// 验证模板完整性
function validateTemplate(templateId) {
  const nodes = db.listNodes(templateId);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const issues = [];

  // 检查孤儿节点
  for (const n of nodes) {
    if (n.parent_id !== null && !nodeMap.has(n.parent_id)) {
      issues.push(`孤儿节点: ${n.title} (id=${n.id}, parent_id=${n.parent_id})`);
    }
  }

  // 检查空标题
  for (const n of nodes) {
    if (!n.title || n.title.trim() === '') {
      issues.push(`空标题节点: id=${n.id}`);
    }
  }

  // 统计
  const rootNodes = nodes.filter(n => n.parent_id === null);
  const leafNodes = nodes.filter(n =>
    !nodes.some(c => c.parent_id === n.id)
  );

  console.log(`总节点数: ${nodes.length}`);
  console.log(`根节点数: ${rootNodes.length}`);
  console.log(`叶节点数: ${leafNodes.length}`);
  console.log(`问题数: ${issues.length}`);
  if (issues.length > 0) {
    console.log('问题列表:');
    issues.forEach(i => console.log(`  - ${i}`));
  }

  return issues.length === 0;
}
```

---

## 附录：API 速查表

### Workflow 相关

| API | 说明 | 参数 |
|-----|------|------|
| `listWorkflows()` | 获取所有工作流 | - |
| `createWorkflow(name, type)` | 创建工作流 | name: 名称<br>type: 'template' / 'project' |
| `getWorkflow(id)` | 获取单个工作流 | id |
| `renameWorkflow(id, name)` | 重命名 | id, name |
| `deleteWorkflow(id)` | 软删除 | id |
| `saveAsTemplate(id, newName)` | 另存为模板 | id, newName |
| `createProjectFromTemplate(templateId, projectName)` | 从模板创建项目 | templateId, projectName |

### Node 相关

| API | 说明 | 参数 |
|-----|------|------|
| `listNodes(workflowId)` | 获取工作流所有节点 | workflowId |
| `createNode(workflowId, parentId, title, sortOrder)` | 创建节点 | workflowId, parentId, title, sortOrder |
| `updateNode(id, patch)` | 更新节点 | id, { title, description, is_completed, collapsed, sort_order, parent_id } |
| `deleteNode(id)` | 删除节点（级联删除子节点） | id |
| `moveNode(id, parentId, sortOrder)` | 移动节点 | id, parentId, sortOrder |
