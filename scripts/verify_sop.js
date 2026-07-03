const os = require('os');
const path = require('path');
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'workflow-manager', 'data', 'workflow.db');
const db = require('../src/db')(dbPath);

const wfs = db.listWorkflows('template');
console.log('=== 模板列表 ===');
wfs.forEach(w => console.log(`  ID:${w.id}  ${w.name}`));

const nodes = db.listNodes(9);
console.log(`\n=== SOP模板节点数: ${nodes.length} ===`);

// 按层级统计
const level1 = nodes.filter(n => !n.parent_id);
console.log(`一级节点（阶段）: ${level1.length}`);
level1.forEach(n => {
  const children = nodes.filter(c => c.parent_id === n.id);
  const grandchildren = children.reduce((sum, c) => sum + nodes.filter(g => g.parent_id === c.id).length, 0);
  console.log(`  ${n.title} - ${children.length} 章节, ${grandchildren} 任务`);
});

// 检查孤儿节点
const validIds = new Set(nodes.map(n => n.id));
const orphans = nodes.filter(n => n.parent_id && !validIds.has(n.parent_id));
console.log(`\n孤儿节点数: ${orphans.length}`);
