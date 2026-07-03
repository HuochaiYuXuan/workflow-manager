// SQLite 数据层 - 使用 better-sqlite3
// 三张核心表：workflows / nodes / time_entries
// 设计遵循 PRD：模板只是 Workflow 的一种状态 (is_template = 1)

const Database = require('better-sqlite3');

module.exports = function (dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ---------------- Schema ----------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      is_template INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      source_template_id INTEGER,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      parent_id INTEGER,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      is_completed INTEGER NOT NULL DEFAULT 0,
      collapsed INTEGER NOT NULL DEFAULT 0,
      sort_order REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      start_at INTEGER NOT NULL,
      end_at INTEGER,
      paused_at INTEGER,
      paused_seconds INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_workflow ON nodes(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
    CREATE INDEX IF NOT EXISTS idx_time_node ON time_entries(node_id);
  `);

  // 迁移：为旧数据库补充列
  try { db.exec('ALTER TABLE workflows ADD COLUMN source_template_id INTEGER'); } catch (e) {}
  try { db.exec('ALTER TABLE workflows ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE workflows ADD COLUMN deleted_at INTEGER'); } catch (e) {}
  try { db.exec('ALTER TABLE nodes ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE nodes ADD COLUMN deleted_at INTEGER'); } catch (e) {}

  const now = () => Date.now();

  // ---------------- Helpers ----------------
  // 递归获取节点的所有子孙 id
  function getDescendantIds(nodeId) {
    const ids = [];
    const stack = [nodeId];
    while (stack.length) {
      const cur = stack.pop();
      const children = db.prepare('SELECT id FROM nodes WHERE parent_id = ?').all(cur);
      for (const c of children) {
        ids.push(c.id);
        stack.push(c.id);
      }
    }
    return ids;
  }

  // 计算一条 time_entry 的当前秒数（包含运行中时基于当前时间）
  function calcSeconds(te, asOfNow) {
    if (!te) return 0;
    const end = te.end_at || asOfNow;
    let sec = Math.max(0, Math.floor((end - te.start_at) / 1000));
    // 减去暂停累计
    sec = Math.max(0, sec - (te.paused_seconds || 0));
    // 如果当前处于暂停状态，额外减去 (暂停开始 ~ now)
    if (te.status === 'paused' && te.paused_at) {
      sec = Math.max(0, sec - Math.floor((asOfNow - te.paused_at) / 1000));
    }
    return sec;
  }

  // ---------------- Workflows ----------------
  function listWorkflows() {
    return db
      .prepare('SELECT * FROM workflows WHERE is_deleted = 0 ORDER BY is_archived ASC, updated_at DESC')
      .all();
  }

  function listDeletedWorkflows() {
    return db
      .prepare('SELECT * FROM workflows WHERE is_deleted = 1 ORDER BY deleted_at DESC')
      .all();
  }

  function createWorkflow(name, type) {
    const isTemplate = type === 'template' ? 1 : 0;
    const t = now();
    const info = db
      .prepare(
        'INSERT INTO workflows (name, is_template, is_archived, created_at, updated_at) VALUES (?, ?, 0, ?, ?)'
      )
      .run(name || '未命名', isTemplate, t, t);
    return getWorkflow(info.lastInsertRowid);
  }

  function getWorkflow(id) {
    return db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  }

  function renameWorkflow(id, name) {
    db.prepare('UPDATE workflows SET name = ?, updated_at = ? WHERE id = ?').run(name || '', now(), id);
    return getWorkflow(id);
  }

  function deleteWorkflow(id) {
    // 软删除
    var t = now();
    db.prepare('UPDATE workflows SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?').run(t, t, id);
    db.prepare('UPDATE nodes SET is_deleted = 1, deleted_at = ? WHERE workflow_id = ?').run(t, id);
    return true;
  }

  function restoreWorkflow(id) {
    db.prepare('UPDATE workflows SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?').run(now(), id);
    db.prepare('UPDATE nodes SET is_deleted = 0, deleted_at = NULL WHERE workflow_id = ?').run(id);
    return true;
  }

  function permanentlyDeleteWorkflow(id) {
    db.prepare('DELETE FROM time_entries WHERE node_id IN (SELECT id FROM nodes WHERE workflow_id = ?)').run(id);
    db.prepare('DELETE FROM nodes WHERE workflow_id = ?').run(id);
    db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    return true;
  }

  function toggleArchiveWorkflow(id) {
    const wf = getWorkflow(id);
    if (!wf) return null;
    db.prepare('UPDATE workflows SET is_archived = ?, updated_at = ? WHERE id = ?')
      .run(wf.is_archived ? 0 : 1, now(), id);
    return getWorkflow(id);
  }

  function saveAsTemplate(id, newName) {
    const src = getWorkflow(id);
    if (!src) return null;
    const srcNodes = db.prepare('SELECT * FROM nodes WHERE workflow_id = ?').all(id);
    const t = now();
    const wfInfo = db.prepare(
      'INSERT INTO workflows (name, is_template, is_archived, created_at, updated_at) VALUES (?, 1, 0, ?, ?)'
    ).run(newName || (src.name + ' 模板'), t, t);
    const newWfId = wfInfo.lastInsertRowid;
    // 复制节点，保留 parent_id 映射
    const idMap = new Map();
    // 先按原 id 排序插入（确保 parent 先插入）
    srcNodes.sort((a, b) => (a.id - b.id));
    const insertNode = db.prepare(
      'INSERT INTO nodes (workflow_id, parent_id, title, description, is_completed, collapsed, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)'
    );
    for (const n of srcNodes) {
      const newParent = n.parent_id ? idMap.get(n.parent_id) : null;
      const info = insertNode.run(newWfId, newParent, n.title, n.description, n.collapsed, n.sort_order, t, t);
      idMap.set(n.id, info.lastInsertRowid);
    }
    return getWorkflow(newWfId);
  }

  function createProjectFromTemplate(templateId, projectName) {
    const src = getWorkflow(templateId);
    if (!src) return null;
    const srcNodes = db.prepare('SELECT * FROM nodes WHERE workflow_id = ?').all(templateId);
    const t = now();
    const wfInfo = db.prepare(
      'INSERT INTO workflows (name, is_template, is_archived, source_template_id, created_at, updated_at) VALUES (?, 0, 0, ?, ?, ?)'
    ).run(projectName || src.name, templateId, t, t);
    const newWfId = wfInfo.lastInsertRowid;
    const idMap = new Map();
    srcNodes.sort((a, b) => (a.id - b.id));
    const insertNode = db.prepare(
      'INSERT INTO nodes (workflow_id, parent_id, title, description, is_completed, collapsed, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)'
    );
    for (const n of srcNodes) {
      const newParent = n.parent_id ? idMap.get(n.parent_id) : null;
      const info = insertNode.run(newWfId, newParent, n.title, n.description, n.collapsed, n.sort_order, t, t);
      idMap.set(n.id, info.lastInsertRowid);
    }
    return getWorkflow(newWfId);
  }

  // ---------------- Nodes ----------------
  function listNodes(workflowId) {
    return db
      .prepare('SELECT * FROM nodes WHERE workflow_id = ? AND is_deleted = 0 ORDER BY sort_order ASC, id ASC')
      .all(workflowId);
  }

  function createNode(workflowId, parentId, title, sortOrder) {
    const t = now();
    // 默认 sortOrder：取同 parent 下最大 sort_order + 1
    let so = sortOrder;
    if (so == null) {
      const row = db.prepare(
        'SELECT COALESCE(MAX(sort_order), 0) AS m FROM nodes WHERE workflow_id = ? AND (parent_id IS ? OR parent_id = ?)'
      ).get(workflowId, parentId, parentId);
      so = (row && row.m != null ? row.m : 0) + 1;
    }
    const info = db.prepare(
      'INSERT INTO nodes (workflow_id, parent_id, title, description, is_completed, collapsed, sort_order, created_at, updated_at) VALUES (?, ?, ?, \'\', 0, 0, ?, ?, ?)'
    ).run(workflowId, parentId || null, title || '新节点', so, t, t);
    return db.prepare('SELECT * FROM nodes WHERE id = ?').get(info.lastInsertRowid);
  }

  function updateNode(id, patch) {
    const current = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
    if (!current) return null;
    const allowed = ['title', 'description', 'is_completed', 'collapsed', 'sort_order', 'parent_id'];
    const fields = [];
    const values = [];
    for (const key of allowed) {
      if (patch && Object.prototype.hasOwnProperty.call(patch, key)) {
        fields.push(key + ' = ?');
        values.push(patch[key]);
      }
    }
    if (fields.length === 0) return current;
    fields.push('updated_at = ?');
    values.push(now());
    values.push(id);
    db.prepare('UPDATE nodes SET ' + fields.join(', ') + ' WHERE id = ?').run(...values);
    return db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
  }

  function deleteNode(id) {
    // 级联删除由 SQLite 处理（ON DELETE CASCADE）
    db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
    return true;
  }

  function moveNode(id, parentId, sortOrder) {
    const t = now();
    db.prepare('UPDATE nodes SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?')
      .run(parentId || null, sortOrder, t, id);
    return db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
  }

  // ---------------- Time Entries ----------------
  // 确保同一节点同一时刻只有一个 running / paused entry
  function _stopOthers(nodeId) {
    const t = now();
    const others = db.prepare(
      "SELECT * FROM time_entries WHERE node_id = ? AND status IN ('running','paused')"
    ).all(nodeId);
    for (const o of others) {
      const sec = calcSeconds(o, t);
      db.prepare(
        "UPDATE time_entries SET end_at = ?, status = 'finished', paused_seconds = ? WHERE id = ?"
      ).run(t, o.paused_seconds + (o.status === 'paused' && o.paused_at ? Math.floor((t - o.paused_at) / 1000) : 0), o.id);
    }
  }

  function startTimeEntry(nodeId) {
    _stopOthers(nodeId);
    const t = now();
    const info = db.prepare(
      "INSERT INTO time_entries (node_id, start_at, end_at, paused_at, paused_seconds, status, created_at) VALUES (?, ?, NULL, NULL, 0, 'running', ?)"
    ).run(nodeId, t, t);
    return db.prepare('SELECT * FROM time_entries WHERE id = ?').get(info.lastInsertRowid);
  }

  function pauseTimeEntry(nodeId) {
    const te = db.prepare(
      "SELECT * FROM time_entries WHERE node_id = ? AND status = 'running' ORDER BY id DESC LIMIT 1"
    ).get(nodeId);
    if (!te) return null;
    const t = now();
    db.prepare("UPDATE time_entries SET status = 'paused', paused_at = ? WHERE id = ?").run(t, te.id);
    return db.prepare('SELECT * FROM time_entries WHERE id = ?').get(te.id);
  }

  function resumeTimeEntry(nodeId) {
    const te = db.prepare(
      "SELECT * FROM time_entries WHERE node_id = ? AND status = 'paused' ORDER BY id DESC LIMIT 1"
    ).get(nodeId);
    if (!te) return null;
    const t = now();
    const addPaused = te.paused_at ? Math.floor((t - te.paused_at) / 1000) : 0;
    db.prepare(
      "UPDATE time_entries SET status = 'running', paused_at = NULL, paused_seconds = ? WHERE id = ?"
    ).run((te.paused_seconds || 0) + addPaused, te.id);
    return db.prepare('SELECT * FROM time_entries WHERE id = ?').get(te.id);
  }

  function stopTimeEntry(nodeId) {
    _stopOthers(nodeId);
    return true;
  }

  function listTimeEntriesByNode(nodeId) {
    return db
      .prepare('SELECT * FROM time_entries WHERE node_id = ? ORDER BY start_at DESC')
      .all(nodeId)
      .map((te) => ({ ...te, seconds: calcSeconds(te, now()) }));
  }

  function getActiveTimeEntry(nodeId) {
    const te = db.prepare(
      "SELECT * FROM time_entries WHERE node_id = ? AND status IN ('running','paused') ORDER BY id DESC LIMIT 1"
    ).get(nodeId);
    if (!te) return null;
    return { ...te, seconds: calcSeconds(te, now()) };
  }

  function deleteTimeEntry(id) {
    db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
    return true;
  }

  // ---------------- 统计 ----------------
  function totalSecondsByNode(nodeId) {
    // 包含所有 finished 的时间 + 当前 active
    const finished = db.prepare(
      "SELECT id, start_at, end_at, paused_at, paused_seconds, status FROM time_entries WHERE node_id = ? AND status = 'finished'"
    ).all(nodeId);
    let total = 0;
    const t = now();
    for (const te of finished) total += calcSeconds(te, t);
    const active = db.prepare(
      "SELECT * FROM time_entries WHERE node_id = ? AND status IN ('running','paused') ORDER BY id DESC LIMIT 1"
    ).get(nodeId);
    if (active) total += calcSeconds(active, t);
    return total;
  }

  // 获取模板的时间统计（按标题匹配）
  function getTemplateTimeStats(projectId) {
    const project = db.prepare('SELECT source_template_id FROM workflows WHERE id = ?').get(projectId);
    if (!project || !project.source_template_id) return null;
    const templateId = project.source_template_id;
    const t = now();
    // 模板节点
    const tmplNodes = db.prepare('SELECT id, title FROM nodes WHERE workflow_id = ?').all(templateId);
    // 项目节点
    const projNodes = db.prepare('SELECT id, title FROM nodes WHERE workflow_id = ?').all(projectId);
    // 按标题匹配：模板 title → 列表
    const byTitle = new Map();
    for (const tn of tmplNodes) {
      if (!byTitle.has(tn.title)) byTitle.set(tn.title, []);
      byTitle.get(tn.title).push(tn.id);
    }
    // 计算模板节点耗时
    const templateEntries = db.prepare(
      'SELECT te.* FROM time_entries te JOIN nodes n ON te.node_id = n.id WHERE n.workflow_id = ?'
    ).all(templateId);
    const tmplSeconds = new Map(); // template node id → seconds
    for (const te of templateEntries) {
      const cur = tmplSeconds.get(te.node_id) || 0;
      tmplSeconds.set(te.node_id, cur + calcSeconds(te, t));
    }
    // 按标题映射到项目节点
    const result = {}; // project node id → template seconds
    for (const pn of projNodes) {
      const matches = byTitle.get(pn.title) || [];
      let total = 0;
      for (const tid of matches) total += tmplSeconds.get(tid) || 0;
      result[pn.id] = total;
    }
    const totalSeconds = Object.values(result).reduce((a, b) => a + b, 0);
    return { templateId, byNode: result, totalSeconds };
  }

  function stopAllRunning() {
    var t = now();
    var entries = db.prepare("SELECT * FROM time_entries WHERE status IN ('running','paused')").all();
    for (var te of entries) {
      var sec = calcSeconds(te, t);
      var addPaused = (te.status === 'paused' && te.paused_at) ? Math.floor((t - te.paused_at) / 1000) : 0;
      db.prepare("UPDATE time_entries SET end_at = ?, status = 'finished', paused_seconds = ?, updated_at = ? WHERE id = ?")
        .run(t, (te.paused_seconds || 0) + addPaused, t, te.id);
    }
    return entries.length;
  }

  function clearWorkflowTimers(workflowId) {
    db.prepare('DELETE FROM time_entries WHERE node_id IN (SELECT id FROM nodes WHERE workflow_id = ?)').run(workflowId);
    return true;
  }

  function clearAllTimers() {
    db.prepare('DELETE FROM time_entries').run();
    return true;
  }

  function collapseAllNodes(workflowId) {
    db.prepare('UPDATE nodes SET collapsed = 1 WHERE workflow_id = ?').run(workflowId);
    return true;
  }

  function expandAllNodes(workflowId) {
    db.prepare('UPDATE nodes SET collapsed = 0 WHERE workflow_id = ?').run(workflowId);
    return true;
  }

  function statsByWorkflow(workflowId) {
    const nodeIds = db.prepare('SELECT id FROM nodes WHERE workflow_id = ?').all(workflowId).map(n => n.id);
    const perNode = new Map();
    for (const nid of nodeIds) perNode.set(nid, 0);
    const t = now();
    const entries = db.prepare(
      'SELECT te.* FROM time_entries te JOIN nodes n ON te.node_id = n.id WHERE n.workflow_id = ?'
    ).all(workflowId);
    for (const te of entries) {
      const cur = perNode.get(te.node_id) || 0;
      perNode.set(te.node_id, cur + calcSeconds(te, t));
    }
    // 聚合到阶段/总计
    const total = Array.from(perNode.values()).reduce((a, b) => a + b, 0);
    const byNode = {};
    perNode.forEach((sec, nid) => { byNode[nid] = sec; });
    return { totalSeconds: total, byNode };
  }

  // ---------------- 导入导出 ----------------
  function exportAll() {
    const workflows = db.prepare('SELECT * FROM workflows').all();
    const nodes = db.prepare('SELECT * FROM nodes').all();
    const entries = db.prepare('SELECT * FROM time_entries').all();
    return { version: 1, exportedAt: now(), workflows, nodes, timeEntries: entries };
  }

  function importAll(data) {
    if (!data || !data.workflows) return false;
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM time_entries').run();
      db.prepare('DELETE FROM nodes').run();
      db.prepare('DELETE FROM workflows').run();
      const wfInsert = db.prepare(
        'INSERT INTO workflows (id, name, is_template, is_archived, source_template_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const w of data.workflows || []) {
        wfInsert.run(w.id, w.name, w.is_template ? 1 : 0, w.is_archived ? 1 : 0, w.source_template_id || null, w.created_at || now(), w.updated_at || now());
      }
      const nInsert = db.prepare(
        'INSERT INTO nodes (id, workflow_id, parent_id, title, description, is_completed, collapsed, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const n of data.nodes || []) {
        nInsert.run(n.id, n.workflow_id, n.parent_id, n.title, n.description || '', n.is_completed ? 1 : 0, n.collapsed ? 1 : 0, n.sort_order || 0, n.created_at || now(), n.updated_at || now());
      }
      const teInsert = db.prepare(
        'INSERT INTO time_entries (id, node_id, start_at, end_at, paused_at, paused_seconds, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const te of data.timeEntries || []) {
        teInsert.run(te.id, te.node_id, te.start_at, te.end_at || null, te.paused_at || null, te.paused_seconds || 0, te.status || 'finished', te.created_at || now());
      }
    });
    tx();
    return true;
  }

  return {
    listWorkflows, listDeletedWorkflows, createWorkflow, getWorkflow, renameWorkflow,
    deleteWorkflow, restoreWorkflow, permanentlyDeleteWorkflow,
    toggleArchiveWorkflow, saveAsTemplate, createProjectFromTemplate,
    listNodes, createNode, updateNode, deleteNode, moveNode,
    startTimeEntry, pauseTimeEntry, resumeTimeEntry, stopTimeEntry,
    listTimeEntriesByNode, getActiveTimeEntry, deleteTimeEntry,
    statsByWorkflow, totalSecondsByNode,
    stopAllRunning, clearWorkflowTimers, clearAllTimers, collapseAllNodes, expandAllNodes,
    getTemplateTimeStats,
    exportAll, importAll
  };
};
