// Workflow Manager 主 UI 逻辑
(function () {
  const App = {};

  App.state = {
    workflows: [],
    currentWorkflowId: null,
    // 侧边栏分节折叠状态
    sectionCollapsed: { template: false, project: false, archived: false, trash: true },
    // 模板时间对比
    showTemplateTime: false,
    templateTimeData: null
  };

  App.init = async function () {
    // 窗口按钮
    document.getElementById('btnMin').addEventListener('click', () => window.api.minimize());
    document.getElementById('btnMax').addEventListener('click', () => window.api.maximize());
    document.getElementById('btnClose').addEventListener('click', () => window.api.close());

    document.getElementById('btnNewTemplate').addEventListener('click', () => App.createWorkflow('template'));
    document.getElementById('btnNewProject').addEventListener('click', () => App.createWorkflow('project'));

    document.getElementById('btnAddNode').addEventListener('click', () => {
      if (!App.state.currentWorkflowId) {
        Modal.toast('请先选择或创建一个工作流', 'error');
        return;
      }
      const sel = window.Tree.state.selectedNodeId;
      if (sel) window.Tree.addChildNode(sel);
      else window.Tree.addRootNode();
    });
    document.getElementById('btnSaveTemplate').addEventListener('click', () => App.saveAsTemplate());
    document.getElementById('btnArchive').addEventListener('click', () => App.toggleArchive());
    document.getElementById('btnDelete').addEventListener('click', () => App.deleteCurrent());

    // 番茄钟按钮
    document.getElementById('btnPomodoro').addEventListener('click', () => {
      window.api.togglePomodoro();
    });
    // 监听番茄钟状态变化
    window.api.onPomodoroState((running) => {
      var btn = document.getElementById('btnPomodoro');
      if (running) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    // 顶部菜单栏（导入/导出已移入文件菜单）
    App._initTopMenubar();

    // 齿轮菜单
    App._initGearMenu();

    // 关于弹窗
    document.querySelector('#aboutModal .ok').addEventListener('click', () => {
      document.getElementById('aboutModal').style.display = 'none';
    });
    document.getElementById('aboutModal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('aboutModal')) {
        document.getElementById('aboutModal').style.display = 'none';
      }
    });

    // 模板时间对比开关
    document.getElementById('chkTemplateTime').addEventListener('change', async (e) => {
      App.state.showTemplateTime = e.target.checked;
      if (e.target.checked && !App.state.templateTimeData) {
        App.state.templateTimeData = await window.api.getTemplateTimeStats(App.state.currentWorkflowId);
      }
      window.Tree.recalcStats();
      window.Tree.render();
      App.refreshMeta();
      if (window.Detail.state.nodeId) window.Detail.show(window.Detail.state.nodeId);
    });

    // 工作流标题编辑：失焦保存
    const wfTitle = document.getElementById('wfTitle');
    let saveTimer = null;
    wfTitle.addEventListener('input', () => {
      if (!App.state.currentWorkflowId) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        window.api.renameWorkflow(App.state.currentWorkflowId, wfTitle.value.trim() || '未命名');
        App.refreshSidebar();
      }, 500);
    });

    // 搜索过滤
    document.getElementById('searchInput').addEventListener('input', (e) => {
      const q = (e.target.value || '').trim();
      App.filterSidebar(q);
      App.filterTree(q);
    });

    // 侧边栏分段折叠
    document.querySelectorAll('.section-header').forEach(hdr => {
      const section = hdr.closest('.sidebar-section');
      const name = hdr.dataset.section;
      if (App.state.sectionCollapsed[name]) section.classList.add('collapsed');
      hdr.addEventListener('click', (e) => {
        // 排除按钮点击（如新建按钮）
        if (e.target.closest('.icon-btn') || e.target.closest('button:not(.section-toggle)')) return;
        App.state.sectionCollapsed[name] = !App.state.sectionCollapsed[name];
        section.classList.toggle('collapsed', App.state.sectionCollapsed[name]);
      });
    });

    // 可拖拽面板分隔条
    App._initDividers();

    // 点击空白关闭右键菜单
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('contextMenu');
      if (e.target.closest('.context-menu') || e.target.closest('.tree-node') || e.target.closest('.wf-list li') || e.target.closest('#trashList li')) return;
      menu.style.display = 'none';
    });
    document.addEventListener('contextmenu', (e) => {
      // 侧栏工作流右键：由 _renderList 中的 handler 处理
      if (e.target.closest('.wf-list li') || e.target.closest('#trashList li')) return;
      if (!e.target.closest('.tree-node')) {
        document.getElementById('contextMenu').style.display = 'none';
      }
    });

    // 拖放到工作区空白：作为根节点末尾（可选）
    const treeRoot = document.getElementById('treeRoot');
    treeRoot.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('text/nodeid')) e.preventDefault();
    });
    treeRoot.addEventListener('drop', (e) => {
      const srcId = parseInt(e.dataTransfer.getData('text/nodeid'), 10);
      if (!srcId || !App.state.currentWorkflowId) return;
      e.preventDefault();
      window.api.moveNode(srcId, null, 99999);
      window.Tree.load(App.state.currentWorkflowId);
    });

    // ========== 全局键盘快捷键 ==========
    document.addEventListener('keydown', (e) => {
      // 输入框中不拦截
      const tag = (e.target && e.target.tagName);
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);

      // Esc 关闭上下文菜单和模态
      if (e.key === 'Escape') {
        const cm = document.getElementById('contextMenu');
        if (cm && cm.style.display === 'block') { cm.style.display = 'none'; e.preventDefault(); return; }
      }

      // 输入框中：只处理 Esc 取消编辑，其他键让用户正常输入
      if (inInput) return;

      if (e.key === 'ArrowDown') { e.preventDefault(); window.Tree.selectNextNode(); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); window.Tree.selectPrevNode(); return; }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        // 若当前节点有子节点且折叠，展开；否则下一个
        const id = window.Tree.state.selectedNodeId;
        if (!id) return;
        const node = window.Tree.state.nodeMap.get(id);
        if (node && node.collapsed) {
          node.collapsed = 0;
          window.api.updateNode(id, { collapsed: 0 });
          window.Tree.render();
        } else {
          window.Tree.selectNextNode();
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const id = window.Tree.state.selectedNodeId;
        if (!id) return;
        const node = window.Tree.state.nodeMap.get(id);
        if (node) {
          const kids = window.Tree.state.childrenMap.get(id) || [];
          if (!node.collapsed && kids.length > 0) {
            node.collapsed = 1;
            window.api.updateNode(id, { collapsed: 1 });
            window.Tree.render();
          } else if (node.parent_id) {
            // 折叠到父节点
            window.Tree.selectNode(node.parent_id);
          }
        }
        return;
      }

      // Ctrl/Cmd 组合键（必须在普通键之前检查）
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === ' ') {
        e.preventDefault();
        const id = window.Tree.state.selectedNodeId;
        if (!id) return;
        const activeTE = window.Detail.state.activeTE;
        if (activeTE && activeTE.status === 'running') {
          window.Tree.stopTimer(id);
        } else {
          window.Tree.startTimer(id);
        }
        return;
      }

      if (e.key === ' ') { e.preventDefault(); window.Tree.toggleSelectedCompleted(); return; }
      if (e.key === 'Enter') { e.preventDefault(); window.Tree.editSelectedTitle(); return; }

      if (ctrl && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const sel = window.Tree.state.selectedNodeId;
        if (sel) window.Tree.addChildNode(sel);
        else window.Tree.addRootNode();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const sel = window.Tree.state.selectedNodeId;
        if (sel) window.Tree.addSiblingNode(sel);
        else window.Tree.addRootNode();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); window.Tree.deleteSelectedNode(); return; }
      if (ctrl && e.key === 'ArrowUp') { e.preventDefault(); window.Tree.moveSelectedUp(); return; }
      if (ctrl && e.key === 'ArrowDown') { e.preventDefault(); window.Tree.moveSelectedDown(); return; }
      if (ctrl && e.key === '/') { e.preventDefault(); window.Tree.toggleCollapseSelected(); return; }

      // Tab / Shift+Tab 层级调整
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) window.Tree.outdentSelected();
        else window.Tree.indentSelected();
        return;
      }

      // Delete / Backspace 删除（带确认）
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        window.Tree.deleteSelectedNode();
        return;
      }

      // 快捷键速查
      if (e.key === '?' && !e.shiftKey) {
        e.preventDefault();
        App.showShortcuts();
        return;
      }
    });

    // 点击空白处关闭上下文菜单
    document.addEventListener('mousedown', (e) => {
      const cm = document.getElementById('contextMenu');
      if (cm && cm.style.display === 'block' &&
          !e.target.closest('#contextMenu') &&
          !e.target.closest('.wf-list li') &&
          !e.target.closest('#trashList li')) {
        cm.style.display = 'none';
      }
    });

    await App.loadSidebar();
  };

  App.loadSidebar = async function () {
    App.state.workflows = await window.api.listWorkflows();
    App.refreshSidebar();
    // 自动选择第一个项目或模板
    if (App.state.workflows.length > 0) {
      const firstActive = App.state.workflows.find(w => !w.is_archived) || App.state.workflows[0];
      App.selectWorkflow(firstActive.id);
    } else {
      // 没有工作流，显示空状态
      document.getElementById('emptyWorkspace').style.display = 'block';
      document.getElementById('treeRoot').innerHTML = '';
      if (window.Detail) window.Detail.clear();
      App.refreshMeta();
    }
  };

  App.refreshSidebar = async function () {
    App.state.workflows = await window.api.listWorkflows();
    // 并行获取所有 workflow 的节点列表，计算进度
    const allNodes = await Promise.all(
      App.state.workflows.map(w => window.api.listNodes(w.id).catch(() => []))
    );
    const badgeMap = new Map(); // wfId -> 'done/total'
    allNodes.forEach((nodes, i) => {
      const wfId = App.state.workflows[i].id;
      if (nodes.length === 0) { badgeMap.set(wfId, '0'); return; }
      // 构建 parent→children 关系
      const kids = new Map();
      for (const n of nodes) {
        const key = n.parent_id == null ? 'root' : n.parent_id;
        if (!kids.has(key)) kids.set(key, []);
        kids.get(key).push(n.id);
      }
      // 递归统计叶子节点
      function countLeaves(nid) {
        const ch = kids.get(nid) || [];
        if (ch.length === 0) {
          const node = nodes.find(n => n.id === nid);
          return { done: node && node.is_completed ? 1 : 0, total: 1 };
        }
        let done = 0, total = 0;
        for (const c of ch) {
          const s = countLeaves(c);
          done += s.done; total += s.total;
        }
        return { done, total };
      }
      const roots = kids.get('root') || [];
      let done = 0, total = 0;
      for (const r of roots) { const s = countLeaves(r); done += s.done; total += s.total; }
      badgeMap.set(wfId, total > 0 ? `${done}/${total}` : String(nodes.length));
    });

    // 收集有活跃计时的工作流 ID
    const activeWfId = (window.Tree.state.currentWorkflowId && window.Tree.state.activeNodeId)
      ? window.Tree.state.currentWorkflowId : null;

    var trash = await window.api.listDeletedWorkflows() || [];
    var trashBadge = new Map();
    trash.forEach(function (w) { trashBadge.set(w.id, '—'); });

    var tmpl = App.state.workflows.filter(function (w) { return w.is_template && !w.is_archived; });
    var proj = App.state.workflows.filter(function (w) { return !w.is_template && !w.is_archived; });
    var archived = App.state.workflows.filter(function (w) { return w.is_archived; });
    App._renderList('templateList', tmpl, badgeMap, activeWfId);
    App._renderList('projectList', proj, badgeMap, activeWfId);
    App._renderList('archivedList', archived, badgeMap, activeWfId);
    App._renderTrashList('trashList', trash);
  };

  App._renderList = function (elId, list, badgeMap, activeWfId) {
    const el = document.getElementById(elId);
    el.innerHTML = '';
    if (list.length === 0) {
      const li = document.createElement('li');
      li.style.color = 'var(--text-muted)';
      li.style.fontSize = '12px';
      li.style.fontStyle = 'italic';
      li.textContent = '（无）';
      li.style.pointerEvents = 'none';
      el.appendChild(li);
      return;
    }
    for (const wf of list) {
      const li = document.createElement('li');
      if (wf.id === App.state.currentWorkflowId) li.classList.add('active');
      // 活跃计时指示
      if (wf.id === activeWfId) {
        const dot = document.createElement('span');
        dot.className = 'wf-timer-dot';
        dot.title = '此工作流有节点正在计时';
        li.appendChild(dot);
      }
      const name = document.createElement('span');
      name.className = 'wf-name';
      name.textContent = wf.name || '未命名';
      name.title = wf.name || '未命名';
      li.appendChild(name);
      // 显示进度 badge
      const badgeText = badgeMap ? badgeMap.get(wf.id) || '0' : '0';
      const cnt = document.createElement('span');
      cnt.className = 'wf-count';
      cnt.textContent = badgeText;
      li.appendChild(cnt);

      // 双击重命名
      li.addEventListener('click', () => App.selectWorkflow(wf.id));
      li.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        const newName = await Modal.prompt('重命名工作流', wf.name, '请输入新的名称：');
        if (newName != null && newName.trim() !== '') {
          await window.api.renameWorkflow(wf.id, newName.trim());
          if (wf.id === App.state.currentWorkflowId) {
            document.getElementById('wfTitle').value = newName.trim();
          }
          App.refreshSidebar();
        }
      });
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        App.showWorkflowMenu(wf.id, e.clientX, e.clientY);
      });
      el.appendChild(li);
    }
  };

  App.filterSidebar = function (query) {
    // 简化：只做显示过滤
    const q = query.toLowerCase();
    for (const id of ['templateList', 'projectList', 'archivedList']) {
      const el = document.getElementById(id);
      for (const li of el.children) {
        if (!q) { li.style.display = ''; continue; }
        const text = (li.textContent || '').toLowerCase();
        li.style.display = text.includes(q) ? '' : 'none';
      }
    }
    App.filterTree(query);
  };

  App.filterTree = function (query) {
    const q = (query || '').trim().toLowerCase();
    const root = document.getElementById('treeRoot');
    if (!q) {
      root.querySelectorAll('.tree-node').forEach(el => { el.style.display = ''; });
      root.querySelectorAll('ul').forEach(el => { el.style.display = ''; });
      root.querySelectorAll('li').forEach(el => { el.style.display = ''; });
      document.getElementById('searchInput').style.background = '';
      return;
    }
    let matchCount = 0;
    let totalCount = 0;
    root.querySelectorAll('.tree-node').forEach(el => {
      totalCount++;
      const titleEl = el.querySelector('.node-title');
      if (!titleEl) return;
      const txt = (titleEl.value || titleEl.textContent || '').toLowerCase();
      const matched = txt.includes(q);
      if (matched) matchCount++;
      el.style.display = matched ? '' : 'none';
      // 隐藏空列表的 ul/li
      const li = el.closest('li');
      if (li) li.style.display = matched ? '' : 'none';
    });
    // 展开包含匹配子节点的父节点
    Tree._expandMatchingAncestors(q);
    document.getElementById('searchInput').style.background = totalCount > 0
      ? (matchCount > 0 ? '' : '#fff0f0')
      : '';
    if (totalCount > 0 && matchCount === 0) {
      // 无匹配时短暂闪烁提示
      document.getElementById('searchInput').style.transition = 'background 0.15s';
      setTimeout(() => { document.getElementById('searchInput').style.background = ''; }, 800);
    }
  };

  // 展开包含匹配文本的所有祖先节点
  Tree._expandMatchingAncestors = function (query) {
    if (!query) return;
    const q = query.toLowerCase();
    // 遍历所有需要展开的祖先
    const toExpand = new Set();
    for (const node of Tree.state.nodes) {
      const title = (node.title || '').toLowerCase();
      if (title.includes(q)) {
        // 向上找到所有祖先，标记为需要展开
        let cur = Tree.state.nodeMap.get(node.parent_id);
        while (cur) {
          if (cur.collapsed) toExpand.add(cur.id);
          cur = Tree.state.nodeMap.get(cur.parent_id);
        }
      }
    }
    if (toExpand.size > 0) {
      for (const id of toExpand) {
        const n = Tree.state.nodeMap.get(id);
        if (n) n.collapsed = 0;
      }
      // 不逐个调用 API，延迟批量保存（下次 render 前）
      Tree.render();
    }
  };

  App._renderTrashList = function (elId, list) {
    var el = document.getElementById(elId);
    el.innerHTML = '';
    if (!list || list.length === 0) {
      var li = document.createElement('li');
      li.style.cssText = 'color:var(--text-muted);font-size:12px;font-style:italic;pointer-events:none;';
      li.textContent = '（空）';
      el.appendChild(li);
      return;
    }
    list.forEach(function (wf) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.className = 'wf-name';
      name.textContent = wf.name || '未命名';
      name.title = wf.name || '未命名';
      li.appendChild(name);
      var cnt = document.createElement('span');
      cnt.className = 'wf-count';
      cnt.textContent = '—';
      li.appendChild(cnt);
      li.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        App.showTrashMenu(wf.id, e.clientX, e.clientY);
      });
      el.appendChild(li);
    });
  };

  App.showTrashMenu = function (wfId, x, y) {
    var menu = document.getElementById('contextMenu');
    menu.innerHTML = '';
    var items = [
      { label: '恢复', action: async function () {
        await window.api.restoreWorkflow(wfId);
        App.loadSidebar();
        Modal.toast('已恢复', 'success');
      }},
      { sep: true },
      { label: '永久删除', danger: true, action: async function () {
        var ok = await Modal.confirm('永久删除', '确认永久删除此工作流及其所有数据？\n此操作不可撤销。');
        if (!ok) return;
        await window.api.permanentlyDeleteWorkflow(wfId);
        App.loadSidebar();
        Modal.toast('已永久删除', 'success');
      }}
    ];
    items.forEach(function (it) {
      if (it.sep) { var s = document.createElement('div'); s.className = 'cm-sep'; menu.appendChild(s); return; }
      var b = document.createElement('button');
      b.textContent = it.label;
      if (it.danger) b.classList.add('danger');
      b.addEventListener('click', function () { menu.style.display = 'none'; it.action(); });
      menu.appendChild(b);
    });
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  };

  App.showWorkflowMenu = function (wfId, x, y) {
    var wf = App.state.workflows.find(function (w) { return w.id === wfId; });
    if (!wf) return;
    var menu = document.getElementById('contextMenu');
    menu.innerHTML = '';
    var items = [
      { label: wf.is_template ? '从此模板创建项目' : '保存为模板', action: async function () {
        if (wf.is_template) {
          const name = await Modal.prompt('创建项目', wf.name + ' 项目', '请输入项目名称：');
          if (!name || !name.trim()) return;
          await window.api.createProjectFromTemplate(wfId, name.trim());
        } else {
          const name = await Modal.prompt('保存为模板', wf.name + ' 模板', '请输入模板名称：');
          if (!name || !name.trim()) return;
          await window.api.saveAsTemplate(wfId, name.trim());
        }
        App.loadSidebar();
      }},
      { label: '重命名', action: async () => {
        const newName = await Modal.prompt('重命名工作流', wf.name, '请输入新的名称：');
        if (newName && newName.trim()) {
          await window.api.renameWorkflow(wfId, newName.trim());
          if (wfId === App.state.currentWorkflowId) {
            document.getElementById('wfTitle').value = newName.trim();
          }
          App.refreshSidebar();
        }
      }},
      { label: wf.is_archived ? '取消归档' : '归档', action: async () => {
        await window.api.toggleArchive(wfId);
        App.refreshSidebar();
        if (wfId === App.state.currentWorkflowId) App.refreshHeader();
      }},
      { sep: true },
      { label: '清空此工作流计时', action: async () => {
        const ok = await Modal.confirm('清空计时', `确认删除"${wf.name}"的所有时间记录？`);
        if (!ok) return;
        await window.api.clearWorkflowTimers(wfId);
        if (wfId === App.state.currentWorkflowId) {
          window.Tree.recalcStats();
          window.Tree.render();
          App.refreshMeta();
          if (window.Detail && window.Detail.state.nodeId) window.Detail.show(window.Detail.state.nodeId);
        }
        Modal.toast('已清空', 'success');
      }},
      { sep: true },
      { label: '删除工作流', danger: true, action: async () => {
        const ok = await Modal.confirm('删除工作流', `确认删除工作流"${wf.name}"及其所有节点和时间记录？\n此操作不可撤销。\n\n（建议先导出 JSON 备份）`);
        if (ok) {
          await window.api.deleteWorkflow(wfId);
          App.state.currentWorkflowId = null;
          App.loadSidebar();
        }
      }}
    ];
    for (const it of items) {
      if (it.sep) {
        const s = document.createElement('div');
        s.className = 'cm-sep';
        menu.appendChild(s);
      } else {
        const b = document.createElement('button');
        b.textContent = it.label;
        if (it.danger) b.classList.add('danger');
        b.addEventListener('click', () => { menu.style.display = 'none'; it.action(); });
        menu.appendChild(b);
      }
    }
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  };

  App.selectWorkflow = async function (wfId) {
    App.state.currentWorkflowId = wfId;
    const wf = App.state.workflows.find(w => w.id === wfId);
    if (!wf) return;
    // 重置模板时间状态
    App.state.showTemplateTime = false;
    App.state.templateTimeData = null;
    document.getElementById('chkTemplateTime').checked = false;
    // 检查是否有源模板
    if (wf.source_template_id) {
      document.getElementById('templateTimeToggle').style.display = '';
    } else {
      document.getElementById('templateTimeToggle').style.display = 'none';
    }
    document.getElementById('emptyWorkspace').style.display = 'none';
    await window.Tree.load(wfId);
    App.refreshHeader();
    App.refreshSidebar();
  };

  App.refreshHeader = function () {
    const wf = App.state.workflows.find(w => w.id === App.state.currentWorkflowId);
    const title = document.getElementById('wfTitle');
    const badge = document.getElementById('wfBadge');
    if (!wf) { title.value = ''; badge.textContent = ''; return; }
    title.value = wf.name;
    badge.textContent = wf.is_template ? '模板' : '项目';
    App.refreshMeta();
  };

  App.refreshMeta = function () {
    // 统计：节点完成 / 总节点数
    const nodes = window.Tree.state.nodes;
    if (!nodes || nodes.length === 0) {
      document.getElementById('progressText').textContent = '0 节点';
    } else {
      // 以叶子计数（或只统计非分类节点）：这里按所有节点数
      let done = 0, total = nodes.length;
      for (const n of nodes) if (n.is_completed) done++;
      // 用根节点聚合的 "总任务"（叶子）更合理，这里使用 Tree.countSubtreeCompleted 累加
      const roots = window.Tree.state.childrenMap.get('root') || [];
      let total2 = 0, done2 = 0;
      for (const r of roots) {
        const s = window.Tree.countSubtreeCompleted(r);
        total2 += s.total; done2 += s.done;
      }
      document.getElementById('progressText').textContent = `${done2} / ${total2} 完成`;
    }
    const totalSec = window.Tree.getWorkflowTotalSeconds();
    const tmplData = App.state.showTemplateTime ? App.state.templateTimeData : null;
    if (tmplData && tmplData.totalSeconds > 0) {
      document.getElementById('timeTotal').textContent =
        '总耗时 ' + window.Tree.formatDuration(totalSec) +
        '  ·  模板参考 ' + window.Tree.formatDuration(tmplData.totalSeconds);
    } else {
      document.getElementById('timeTotal').textContent = '总耗时 ' + window.Tree.formatDuration(totalSec);
    }
  };

  App.onNodeChanged = function () { App.refreshMeta(); };

  App.createWorkflow = async function (type) {
    const defaultName = type === 'template' ? '新模板' : '新项目';
    const name = await Modal.prompt('创建' + (type === 'template' ? '模板' : '项目'), defaultName, '请输入名称：');
    if (!name || !name.trim()) return;
    const wf = await window.api.createWorkflow(name.trim(), type);
    await App.loadSidebar();
    if (wf && wf.id) App.selectWorkflow(wf.id);
  };

  App.saveAsTemplate = async function () {
    if (!App.state.currentWorkflowId) {
      Modal.toast('请先选择工作流', 'error');
      return;
    }
    const wf = App.state.workflows.find(w => w.id === App.state.currentWorkflowId);
    const name = await Modal.prompt('保存为模板', (wf ? wf.name : '') + ' 模板', '请输入模板名称：');
    if (!name || !name.trim()) return;
    await window.api.saveAsTemplate(App.state.currentWorkflowId, name.trim());
    App.loadSidebar();
    Modal.toast('已保存为模板', 'success');
  };

  App.toggleArchive = async function () {
    if (!App.state.currentWorkflowId) {
      Modal.toast('请先选择工作流', 'error');
      return;
    }
    await window.api.toggleArchive(App.state.currentWorkflowId);
    App.loadSidebar();
  };

  App.deleteCurrent = async function () {
    if (!App.state.currentWorkflowId) {
      Modal.toast('请先选择工作流', 'error');
      return;
    }
    const wf = App.state.workflows.find(w => w.id === App.state.currentWorkflowId);
    if (!wf) return;
    const ok = await Modal.confirm('删除工作流', `确认删除工作流"${wf.name}"及其所有节点和时间记录？\n此操作不可撤销。\n\n（建议先导出 JSON 备份）`);
    if (ok) {
      await window.api.deleteWorkflow(wf.id);
      App.state.currentWorkflowId = null;
      App.loadSidebar();
      Modal.toast('已删除', 'success');
    }
  };

  App.exportJSON = async function () {
    try {
      const data = await window.api.exportJSON();
      const ts = new Date();
      const name = `workflow-backup-${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}.json`;
      const ok = await window.api.saveFileDialog(name, JSON.stringify(data, null, 2));
      if (ok) Modal.toast('导出成功', 'success');
    } catch (e) {
      Modal.toast('导出失败：' + e.message, 'error');
    }
  };

  App.importJSON = async function () {
    const ok = await Modal.confirm('导入数据', '导入会完全替换当前数据，确认继续？\n（如需保留，请先导出备份）');
    if (!ok) return;
    try {
      const data = await window.api.openFileDialog();
      if (!data) return;
      await window.api.importJSON(data);
      App.state.currentWorkflowId = null;
      App.loadSidebar();
      Modal.toast('导入成功', 'success');
    } catch (e) {
      Modal.toast('导入失败：' + e.message, 'error');
    }
  };

  App.showShortcuts = function () {
    const html = `<div style="max-height:70vh;overflow-y:auto;padding-right:4px;">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="text-align:left;border-bottom:2px solid var(--border);">
          <th style="padding:8px 12px;color:var(--text-soft);font-weight:600;">操作</th>
          <th style="padding:8px 12px;color:var(--text-soft);font-weight:600;">快捷键</th>
        </tr></thead>
        <tbody>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">选中下一节点</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>↓</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">选中上一节点</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>↑</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">展开当前节点</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>→</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">折叠当前节点</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>←</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">切换完成状态</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Space</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">编辑标题</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Enter</kbd> / 三击</td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">添加子节点</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Ctrl</kbd>+<kbd>N</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">添加兄弟节点</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Ctrl</kbd>+<kbd>T</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">删除节点</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Delete</kbd> / <kbd>Backspace</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">缩进（降为子节点）</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Tab</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">提升层级</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Shift</kbd>+<kbd>Tab</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">上移节点</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Ctrl</kbd>+<kbd>↑</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">下移节点</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Ctrl</kbd>+<kbd>↓</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">折叠/展开节点</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Ctrl</kbd>+<kbd>/</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">启动/停止计时</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Ctrl</kbd>+<kbd>Space</kbd></td></tr>
        <tr><td style="padding:6px 12px;border-bottom:1px solid var(--border);">关闭弹窗/菜单</td><td style="padding:6px 12px;border-bottom:1px solid var(--border);"><kbd>Esc</kbd></td></tr>
        <tr><td style="padding:6px 12px;">搜索</td><td style="padding:6px 12px;">顶部搜索框</td></tr>
        </tbody>
      </table></div>`;
    const layer = document.createElement('div');
    layer.className = 'modal-mask';
    layer.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:520px;">
      <div class="modal-title">键盘快捷键</div>
      <div class="modal-message"></div>
      <div class="modal-actions">
        <button class="primary ok">关闭</button>
      </div>
    </div>`;
    layer.querySelector('.modal-message').innerHTML = html;
    function close() { document.removeEventListener('keydown', onKey); layer.remove(); }
    function onKey(e) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); close(); } }
    layer.querySelector('.ok').addEventListener('click', close);
    layer.addEventListener('click', (e) => { if (e.target === layer) close(); });
    document.addEventListener('keydown', onKey);
    document.getElementById('modalLayer') ? document.getElementById('modalLayer').appendChild(layer)
      : document.body.appendChild(layer);
    layer.querySelector('.ok').focus();
  };

  // ================ 面板分隔条拖拽 ================
  App._initDividers = function () {
    const layout = document.querySelector('.layout');
    const dividers = document.querySelectorAll('.panel-divider');
    const root = document.documentElement;
    let dragging = null;
    let startX, startLeftWidth, startRightWidth;

    dividers.forEach(div => {
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dragging = div;
        div.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        startX = e.clientX;

        // 获取分隔条左右列的当前宽度
        const style = getComputedStyle(layout);
        const cols = style.gridTemplateColumns.split(/\s+/);
        if (div.id === 'dividerLeft') {
          startLeftWidth = parseFloat(cols[0]);
          startRightWidth = parseFloat(cols[2]);
        } else {
          startLeftWidth = parseFloat(cols[2]);
          startRightWidth = parseFloat(cols[4]);
        }
      });
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const minW = 150;
      let newLeft, newRight;
      if (dragging.id === 'dividerLeft') {
        newLeft = Math.max(minW, startLeftWidth + dx);
        newRight = Math.max(minW, startRightWidth - dx);
        root.style.setProperty('--col-left', newLeft + 'px');
        root.style.setProperty('--col-main', '1fr');
      } else {
        newLeft = Math.max(minW, startLeftWidth + dx);
        newRight = Math.max(minW, startRightWidth - dx);
        root.style.setProperty('--col-main', newLeft + 'px');
        root.style.setProperty('--col-right', newRight + 'px');
      }
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging.classList.remove('active');
      dragging = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  };

  // ================ 顶部菜单栏 ================
  App._openMenubar = null;

  App._initTopMenubar = function () {
    // 构建菜单内容
    App._buildMenuContent();

    document.querySelectorAll('.titlebar-menubar .menu-item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        var item = btn.closest('.menu-item');
        var name = item.dataset.menu;
        if (App._openMenubar === name) {
          App._closeMenubar();
          return;
        }
        App._closeMenubar();
        item.classList.add('open');
        App._openMenubar = name;
      });
    });

    // 菜单项点击关闭
    document.querySelectorAll('.titlebar-menubar .menu-dropdown').forEach(dd => {
      dd.addEventListener('click', (e) => {
        var btn = e.target.closest('button');
        if (btn && !btn.closest('.menu-sub')) {
          App._closeMenubar();
        }
      });
    });

    // 点击菜单外关闭
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.titlebar-menubar')) App._closeMenubar();
    });
  };

  App._closeMenubar = function () {
    document.querySelectorAll('.titlebar-menubar .menu-item.open').forEach(i => i.classList.remove('open'));
    App._openMenubar = null;
  };

  App._sep = function (dd) {
    var s = document.createElement('div'); s.className = 'menu-sep'; dd.appendChild(s);
  };
  App._item = function (dd, label, action, opts) {
    opts = opts || {};
    var btn = document.createElement('button');
    btn.textContent = label;
    if (opts.disabled) btn.disabled = true;
    if (opts.kbd) { var k = document.createElement('kbd'); k.textContent = opts.kbd; btn.appendChild(k); }
    if (action) btn.addEventListener('click', action);
    dd.appendChild(btn);
    return btn;
  };

  App._buildMenuContent = function () {
    // 文件
    var mf = document.getElementById('menu-file');
    App._item(mf, '新建项目', () => App.createWorkflow('project'));
    App._item(mf, '新建模板', () => App.createWorkflow('template'));
    App._sep(mf);
    App._item(mf, '导入...', () => App.importJSON());
    App._item(mf, '导出...', () => App.exportJSON());
    App._sep(mf);
    App._item(mf, '退出', () => window.api.close());

    // 编辑
    var me = document.getElementById('menu-edit');
    App._item(me, '撤销', null, { disabled: true, kbd: 'Ctrl+Z' });
    App._item(me, '重做', null, { disabled: true, kbd: 'Ctrl+Y' });

    // 视图 - 子菜单
    var mv = document.getElementById('menu-view');
    var themeBtn = document.createElement('button');
    themeBtn.textContent = '主题  ▸';
    themeBtn.style.position = 'relative';
    var themeSub = document.createElement('div');
    themeSub.className = 'menu-dropdown';
    themeSub.style.position = 'absolute'; themeSub.style.left = '100%'; themeSub.style.top = '-4px'; themeSub.style.minWidth = '140px';
    ['浅色主题', '深色主题', '跟随系统'].forEach(function (t) {
      var b = document.createElement('button'); b.textContent = t; b.disabled = true;
      themeSub.appendChild(b);
    });
    themeBtn.addEventListener('mouseenter', function () { themeSub.style.display = 'block'; });
    themeBtn.addEventListener('mouseleave', function () { themeSub.style.display = 'none'; });
    themeSub.addEventListener('mouseenter', function () { themeSub.style.display = 'block'; });
    themeSub.addEventListener('mouseleave', function () { themeSub.style.display = 'none'; });
    var wrap = document.createElement('div'); wrap.style.position = 'relative';
    wrap.appendChild(themeBtn); wrap.appendChild(themeSub);
    mv.appendChild(wrap);

    // 帮助
    var mh = document.getElementById('menu-help');
    App._item(mh, '关于 Workflow Manager', () => {
      document.getElementById('aboutModal').style.display = 'flex';
    });
  };

  // ================ 齿轮菜单 ================
  App._initGearMenu = function () {
    var gearBtn = document.getElementById('gearBtn');
    var gearMenu = document.getElementById('gearMenu');

    gearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (gearMenu.style.display === 'block') { gearMenu.style.display = 'none'; return; }
      // 计算位置
      var rect = gearBtn.getBoundingClientRect();
      gearMenu.innerHTML = '';
      var items = [
        { label: '主题  ▸', disabled: true },
        { label: '语言  ▸', disabled: true },
        { sep: true },
        { label: '设置...', action: () => App.openSettings() },
        { sep: true },
        { label: '关于', action: () => { document.getElementById('aboutModal').style.display = 'flex'; } }
      ];
      items.forEach(function (it) {
        if (it.sep) { var s = document.createElement('div'); s.className = 'menu-sep'; gearMenu.appendChild(s); return; }
        var b = document.createElement('button');
        b.textContent = it.label;
        if (it.disabled) b.disabled = true;
        if (it.action) b.addEventListener('click', function () { gearMenu.style.display = 'none'; it.action(); });
        gearMenu.appendChild(b);
      });
      gearMenu.style.display = 'block';
      gearMenu.style.left = Math.min(rect.left, window.innerWidth - 180) + 'px';
      gearMenu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('#gearBtn') && !e.target.closest('#gearMenu')) {
        gearMenu.style.display = 'none';
      }
    });
  };

  App.openSettings = function () {
    window.api.openSettings();
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
})();
