// Workflow Tree 渲染与交互
(function (global) {
  const Tree = {};

  Tree.state = {
    nodes: [],             // 所有节点扁平数组
    nodeMap: new Map(),    // id -> node
    childrenMap: new Map(),// parentId(null) -> [childIds 按顺序]
    stats: new Map(),      // nodeId -> seconds (总耗时，含子孙)
    activeNodeId: null,    // 当前正在计时的节点 id (全局唯一)
    selectedNodeId: null,
    currentWorkflowId: null,
    pendingFocusNodeId: null,  // 下次 render 后需要聚焦的节点
    selectedByWorkflow: new Map()  // workflowId -> nodeId（记忆每个工作流选中项）
  };

  Tree.init = function () {
    // 全局连击状态：1=单击, 2=双击, 3=三连击
    Tree._clickState = { count: 0, timer: null, nodeId: null, lastTime: 0 };
  };

  // 处理节点行点击：1=选中(已在外层), 2=切换完成, 3=进入编辑
  Tree._handleNodeClick = function (nodeId) {
    // 懒初始化（兼容未调用 Tree.init 的场景）
    if (!Tree._clickState) {
      Tree._clickState = { count: 0, timer: null, nodeId: null, lastTime: 0 };
    }
    const now = Date.now();
    const state = Tree._clickState;
    // 不同节点或间隔过长 → 重置
    if (now - state.lastTime > 500 || state.nodeId !== nodeId) {
      state.count = 1;
    } else {
      state.count++;
    }
    state.lastTime = now;
    state.nodeId = nodeId;
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    if (state.count >= 3) {
      // 三连击：立即进入编辑
      state.count = 0; state.nodeId = null;
      Tree.editNodeTitle(nodeId);
      return;
    }
    // 延迟判定单击/双击
    state.timer = setTimeout(() => {
      if (state.count === 2) Tree.toggleNodeCompleted(nodeId);
      state.count = 0; state.nodeId = null; state.timer = null;
    }, 250);
  };

  // 进入节点标题编辑模式（临时将 span 替换为 input）
  Tree.editNodeTitle = function (nodeId) {
    const titleEl = document.querySelector(`.tree-node[data-node-id="${nodeId}"] .node-title`);
    if (!titleEl) return;
    const node = Tree.state.nodeMap.get(nodeId);
    if (!node) return;
    // 防止重入
    if (titleEl.classList.contains('node-title-editing')) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'node-title node-title-editing';
    input.value = node.title;
    input.spellcheck = false;
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    // 阻止冒泡到 row 的 click 处理器（避免再次触发连击判定）
    input.addEventListener('click', (e) => e.stopPropagation());
    // 阻止 mousedown 冒泡（避免触发布局类的全局行为）
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    // 阻止 dblclick 冒泡
    input.addEventListener('dblclick', (e) => e.stopPropagation());

    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (save) {
        const newTitle = (input.value || '').trim() || '未命名';
        if (node.title !== newTitle) {
          node.title = newTitle;
          window.api.updateNode(nodeId, { title: node.title });
        }
      }
      // 重新渲染以恢复所有节点状态
      Tree.render();
      if (global.Detail && global.Detail.refreshIfSelectedNodeIs) global.Detail.refreshIfSelectedNodeIs(nodeId);
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
  };

  Tree.load = async function (workflowId) {
    // 先保存切换前工作流的选中节点
    if (Tree.state.currentWorkflowId && Tree.state.selectedNodeId) {
      Tree.state.selectedByWorkflow.set(Tree.state.currentWorkflowId, Tree.state.selectedNodeId);
    }
    Tree.state.currentWorkflowId = workflowId;
    Tree.state.nodes = await window.api.listNodes(workflowId);
    Tree._rebuildIndexes();
    // 恢复该工作流上次的选中项（如果节点还存在）
    const saved = Tree.state.selectedByWorkflow.get(workflowId);
    if (saved && Tree.state.nodeMap.has(saved)) {
      Tree.state.selectedNodeId = saved;
    } else {
      const roots = Tree.state.childrenMap.get('root') || [];
      Tree.state.selectedNodeId = roots[0] || null;
    }
    await Tree.recalcStats();
    Tree.render();
    // 如有选中节点，自动同步右侧详情
    if (Tree.state.selectedNodeId && global.Detail && global.Detail.show) {
      global.Detail.show(Tree.state.selectedNodeId);
    }
  };

  Tree._rebuildIndexes = function () {
    const m = new Map();
    const c = new Map();
    for (const n of Tree.state.nodes) {
      m.set(n.id, n);
      const key = n.parent_id == null ? 'root' : n.parent_id;
      if (!c.has(key)) c.set(key, []);
      c.get(key).push(n.id);
    }
    // 子节点按 sort_order, id 排序
    for (const [k, ids] of c.entries()) {
      ids.sort((a, b) => {
        const na = m.get(a), nb = m.get(b);
        return na.sort_order - nb.sort_order || na.id - nb.id;
      });
    }
    Tree.state.nodeMap = m;
    Tree.state.childrenMap = c;
  };

  Tree.recalcStats = async function () {
    const stats = new Map();
    const wfStats = Tree.state.currentWorkflowId
      ? await window.api.statsByWorkflow(Tree.state.currentWorkflowId)
      : { totalSeconds: 0, byNode: {} };
    // 如果开启了模板时间对比，合并模板数据
    const tmplData = (global.App && global.App.state && global.App.state.showTemplateTime)
      ? global.App.state.templateTimeData : null;
    const tmplByNode = tmplData ? tmplData.byNode || {} : {};
    function sub(nodeId) {
      let own = (wfStats.byNode[nodeId] || 0) + (tmplByNode[nodeId] || 0);
      const kids = Tree.state.childrenMap.get(nodeId) || [];
      for (const k of kids) own += sub(k);
      stats.set(nodeId, own);
      return own;
    }
    const roots = Tree.state.childrenMap.get('root') || [];
    for (const r of roots) sub(r);
    Tree.state.stats = stats;
    return (wfStats.totalSeconds || 0) + (tmplData ? tmplData.totalSeconds || 0 : 0);
  };

  Tree.getWorkflowTotalSeconds = function () {
    const roots = Tree.state.childrenMap.get('root') || [];
    let t = 0;
    for (const r of roots) t += Tree.state.stats.get(r) || 0;
    return t;
  };

  Tree.getNodeTotalSeconds = function (nodeId) {
    return Tree.state.stats.get(nodeId) || 0;
  };


  Tree.countSubtreeCompleted = function (nodeId) {
    const node = Tree.state.nodeMap.get(nodeId);
    if (!node) return { done: 0, total: 0 };
    const kids = Tree.state.childrenMap.get(nodeId) || [];
    if (kids.length === 0) {
      return { done: node.is_completed ? 1 : 0, total: 1 };
    }
    let done = 0, total = 0;
    for (const k of kids) {
      const s = Tree.countSubtreeCompleted(k);
      done += s.done; total += s.total;
    }
    return { done, total };
  };

  // 切换节点完成状态（向下级联所有子节点 + 向上级联父节点）
  Tree.toggleNodeCompleted = async function (nodeId) {
    const node = Tree.state.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.is_completed = node.is_completed ? 0 : 1;
    await window.api.updateNode(nodeId, { is_completed: node.is_completed });
    // 向下级联：所有子孙节点同步完成状态
    await Tree._cascadeChildrenCompletion(nodeId, node.is_completed);
    // 向上级联：检查祖先节点是否需要更新
    await Tree._cascadeParentCompletion(node.parent_id);
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
    Tree.render();
    if (global.Detail && global.Detail.refreshIfSelectedNodeIs) global.Detail.refreshIfSelectedNodeIs(nodeId);
  };

  // 递归向下同步完成状态
  Tree._cascadeChildrenCompletion = async function (parentId, completed) {
    const children = Tree.state.childrenMap.get(parentId) || [];
    for (const childId of children) {
      const child = Tree.state.nodeMap.get(childId);
      if (!child) continue;
      child.is_completed = completed;
      await window.api.updateNode(childId, { is_completed: completed });
      await Tree._cascadeChildrenCompletion(childId, completed);
    }
  };

  // 级联：检查 parentId 节点的所有子节点完成情况，同步父节点状态
  Tree._cascadeParentCompletion = async function (parentId) {
    if (parentId == null) return;
    const parent = Tree.state.nodeMap.get(parentId);
    if (!parent) return;
    const siblings = Tree.state.childrenMap.get(parentId) || [];
    if (siblings.length === 0) return;
    const allDone = siblings.every(sid => {
      const sib = Tree.state.nodeMap.get(sid);
      return sib && sib.is_completed;
    });
    const newState = allDone ? 1 : 0;
    if (parent.is_completed !== newState) {
      parent.is_completed = newState;
      await window.api.updateNode(parentId, { is_completed: newState });
      // 继续向上级联
      await Tree._cascadeParentCompletion(parent.parent_id);
    }
  };

  Tree.formatDuration = function (seconds) {
    const s = Math.floor(seconds || 0);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h < 24) return h + 'h' + (mm ? mm + 'm' : '');
    const d = Math.floor(h / 24);
    return d + 'd' + (h % 24) + 'h';
  };

  Tree.formatClock = function (seconds) {
    const s = Math.floor(seconds || 0);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  Tree.render = function () {
    const root = document.getElementById('treeRoot');
    root.innerHTML = '';
    const roots = Tree.state.childrenMap.get('root') || [];
    for (const id of roots) {
      root.appendChild(Tree._renderNode(id, 0));
    }
    // 处理 pendingFocus：渲染后进入新节点标题编辑
    if (Tree.state.pendingFocusNodeId) {
      const id = Tree.state.pendingFocusNodeId;
      Tree.state.pendingFocusNodeId = null;
      setTimeout(() => Tree.editNodeTitle(id), 0);
    }
  };

  Tree._focusNodeTitle = function (nodeId) {
    // 保留作为外部 API 的入口：进入编辑模式
    return Tree.editNodeTitle(nodeId);
  };

  Tree._renderNode = function (nodeId, depth) {
    const node = Tree.state.nodeMap.get(nodeId);
    if (!node) return document.createElement('li');
    const kids = Tree.state.childrenMap.get(nodeId) || [];
    const li = document.createElement('li');
    li.dataset.nodeId = nodeId;

    const row = document.createElement('div');
    row.className = 'tree-node';
    if (kids.length > 0) row.classList.add('has-children');
    row.dataset.nodeId = nodeId;
    if (node.is_completed) row.classList.add('completed');
    if (Tree.state.selectedNodeId === nodeId) row.classList.add('selected');
    if (Tree.state.activeNodeId === nodeId) row.classList.add('running');

    // 展开/收起按钮
    const twisty = document.createElement('span');
    if (kids.length > 0) {
      twisty.className = 'twisty';
      twisty.innerHTML = node.collapsed 
        ? `<svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-collapse"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-expand"/></svg>`;
      twisty.addEventListener('click', (e) => {
        e.stopPropagation();
        node.collapsed = node.collapsed ? 0 : 1;
        window.api.updateNode(nodeId, { collapsed: node.collapsed });
        Tree.render();
      });
    } else {
      twisty.className = 'twisty placeholder';
      twisty.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24"><circle fill="currentColor" cx="12" cy="12" r="2"/></svg>`;
    }
    row.appendChild(twisty);

    // 标题（默认 span，三连击进入编辑）
    const title = document.createElement('span');
    title.className = 'node-title';
    title.textContent = node.title;
    title.title = node.title;  // tooltip 显示完整标题
    // 不阻止冒泡，让 row.click 处理连击检测
    row.appendChild(title);

    // 子节点完成进度（进度条 + 百分比，在时间左侧）
    if (kids.length > 0) {
      const prog = Tree.countSubtreeCompleted(nodeId);
      if (prog.total > 0) {
        const pct = Math.round((prog.done / prog.total) * 100);
        const progEl = document.createElement('span');
        progEl.className = 'node-progress' + (pct === 100 ? ' done' : '');
        progEl.title = `子节点 ${prog.done}/${prog.total} 已完成`;
        // DOM API 确保 width 正确应用
        const bar = document.createElement('span');
        bar.className = 'prog-bar';
        const fill = document.createElement('span');
        fill.className = 'prog-fill';
        fill.style.width = pct + '%';
        bar.appendChild(fill);
        const pctLabel = document.createElement('span');
        pctLabel.className = 'prog-pct';
        pctLabel.textContent = pct + '%';
        progEl.appendChild(bar);
        progEl.appendChild(pctLabel);
        row.appendChild(progEl);
      }
    }

    // 耗时（仅显示，计时操作在右侧详情面板）
    const activeTE = global.Detail && global.Detail.state ? global.Detail.state.activeTE : null;
    const isThisActive = Tree.state.activeNodeId === nodeId && activeTE;
    const teStatus = isThisActive ? activeTE.status : null;
    const tm = document.createElement('span');
    tm.className = 'node-time';
    if (teStatus === 'running') tm.classList.add('running');
    else if (teStatus === 'paused') tm.classList.add('paused');
    tm.textContent = Tree.formatDuration(Tree.getNodeTotalSeconds(nodeId));
    tm.title = '节点（含子节点）总耗时';
    row.appendChild(tm);

    // 添加子节点
    const addBtn = document.createElement('button');
    addBtn.className = 'node-add-btn';
    addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-add"/></svg>`;
    addBtn.title = '添加子节点';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Tree.addChildNode(nodeId);
    });
    row.appendChild(addBtn);

    // 删除节点
    const delBtn = document.createElement('button');
    delBtn.className = 'node-delete-btn';
    delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-close"/></svg>`;
    delBtn.title = '删除节点';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await Modal.confirm('删除节点', `确认删除节点"${node.title}"及其子节点？\n此操作不可撤销。\n\n（建议先导出 JSON 备份）`);
      if (ok) {
        window.api.deleteNode(nodeId);
        if (Tree.state.selectedNodeId === nodeId) Tree.state.selectedNodeId = null;
        Tree.load(Tree.state.currentWorkflowId);
        if (global.Detail && global.Detail.clear) global.Detail.clear();
        if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
      }
    });
    row.appendChild(delBtn);

    // 完成框（CSS border 1.5px，16×16；checked 时显示对勾 SVG）
    const cb = document.createElement('div');
    cb.className = 'checkbox' + (node.is_completed ? ' checked' : '');
    cb.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-check"/></svg>`;
    cb.title = '标记完成';
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      Tree.toggleNodeCompleted(nodeId);
    });
    row.appendChild(cb);

    // 选中 / 连击检测：1=选中, 2=切换完成, 3=进入编辑
    row.addEventListener('click', (e) => {
      // 排除按钮、复选框、展开按钮
      if (e.target.closest('.checkbox') ||
          e.target.closest('.twisty') ||
          e.target.closest('.node-add-btn') ||
          e.target.closest('.node-delete-btn')) return;
      Tree.selectNode(nodeId);
      Tree._handleNodeClick(nodeId);
    });

    // 右键菜单
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      Tree.showNodeContextMenu(nodeId, e.clientX, e.clientY);
    });

    // 拖拽
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/nodeid', String(nodeId));
      e.dataTransfer.effectAllowed = 'move';
      row.style.opacity = '0.4';
    });
    row.addEventListener('dragend', () => {
      row.style.opacity = '1';
      document.querySelectorAll('.drag-over,.drag-before,.drag-after')
        .forEach((el) => el.classList.remove('drag-over', 'drag-before', 'drag-after'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      // 鼠标位置决定插入前 / 后 / 内部
      const rect = row.getBoundingClientRect();
      const y = e.clientY - rect.top;
      row.classList.remove('drag-before', 'drag-after', 'drag-over');
      if (y < rect.height * 0.25) row.classList.add('drag-before');
      else if (y > rect.height * 0.75) row.classList.add('drag-after');
      else row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-before', 'drag-after', 'drag-over');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const srcId = parseInt(e.dataTransfer.getData('text/nodeid'), 10);
      const rect = row.getBoundingClientRect();
      const y = e.clientY - rect.top;
      let mode = 'inside';
      if (y < rect.height * 0.25) mode = 'before';
      else if (y > rect.height * 0.75) mode = 'after';
      row.classList.remove('drag-before', 'drag-after', 'drag-over');
      if (srcId && srcId !== nodeId) Tree.moveNode(srcId, nodeId, mode);
    });

    li.appendChild(row);

    if (kids.length > 0 && !node.collapsed) {
      const ul = document.createElement('ul');
      for (const k of kids) ul.appendChild(Tree._renderNode(k, depth + 1));
      li.appendChild(ul);
    }
    return li;
  };

  Tree.showNodeContextMenu = function (nodeId, x, y) {
    const node = Tree.state.nodeMap.get(nodeId);
    if (!node) return;
    Tree.state.selectedNodeId = nodeId;
    Tree.render();
    const menu = document.getElementById('contextMenu');
    menu.innerHTML = '';
    const items = [
      { label: '添加子节点', action: () => Tree.addChildNode(nodeId) },
      { label: '在下方添加兄弟节点', action: () => Tree.addSiblingNode(nodeId) },
      { label: '重命名', action: () => {
        Tree.editNodeTitle(nodeId);
      }},
      { sep: true },
      { label: '开始计时', action: () => { Tree.startTimer(nodeId); } },
      { label: '暂停计时', action: () => { Tree.pauseTimer(nodeId); } },
      { label: '停止计时', action: () => { Tree.stopTimer(nodeId); } },
      { sep: true },
      { label: '删除节点', danger: true, action: async () => {
        const ok = await Modal.confirm('删除节点', `确认删除节点"${node.title}"及其子节点？\n此操作不可撤销。`);
        if (ok) {
          window.api.deleteNode(nodeId);
          if (Tree.state.selectedNodeId === nodeId) Tree.state.selectedNodeId = null;
          Tree.load(Tree.state.currentWorkflowId);
          if (global.Detail && global.Detail.clear) global.Detail.clear();
          if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
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

  Tree.selectNode = function (nodeId) {
    Tree.state.selectedNodeId = nodeId;
    Tree.render();
    if (global.Detail && global.Detail.show) global.Detail.show(nodeId);
  };

  Tree.addRootNode = async function () {
    if (!Tree.state.currentWorkflowId) return;
    const n = await window.api.createNode(Tree.state.currentWorkflowId, null, '新节点');
    Tree.state.nodes.push(n);
    Tree.state.selectedNodeId = n.id;
    Tree.state.pendingFocusNodeId = n.id;
    Tree._rebuildIndexes();
    Tree.render();
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
  };

  Tree.addChildNode = async function (parentId) {
    const n = await window.api.createNode(Tree.state.currentWorkflowId, parentId, '新节点');
    // 父节点自动展开
    const parent = Tree.state.nodeMap.get(parentId);
    if (parent && parent.collapsed) {
      parent.collapsed = 0;
      await window.api.updateNode(parentId, { collapsed: 0 });
    }
    Tree.state.nodes.push(n);
    Tree.state.selectedNodeId = n.id;
    Tree.state.pendingFocusNodeId = n.id;
    Tree._rebuildIndexes();
    Tree.render();
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
  };

  Tree.addSiblingNode = async function (siblingId) {
    const sib = Tree.state.nodeMap.get(siblingId);
    if (!sib) return;
    const n = await window.api.createNode(Tree.state.currentWorkflowId, sib.parent_id, '新节点', sib.sort_order + 0.5);
    Tree.state.nodes.push(n);
    Tree.state.selectedNodeId = n.id;
    Tree.state.pendingFocusNodeId = n.id;
    Tree._rebuildIndexes();
    Tree.render();
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
  };

  Tree.moveNode = async function (srcId, targetId, mode) {
    // 禁止移动到自身后代
    function isDescendantOf(nodeId, ancestorId) {
      let cur = Tree.state.nodeMap.get(nodeId);
      while (cur && cur.parent_id != null) {
        if (cur.parent_id === ancestorId) return true;
        cur = Tree.state.nodeMap.get(cur.parent_id);
      }
      return false;
    }
    if (isDescendantOf(targetId, srcId)) return;

    const target = Tree.state.nodeMap.get(targetId);
    if (!target) return;
    let newParent, newSortOrder;
    if (mode === 'inside') {
      newParent = targetId;
      const kids = Tree.state.childrenMap.get(targetId) || [];
      const last = kids.length ? Tree.state.nodeMap.get(kids[kids.length - 1]) : null;
      newSortOrder = last ? last.sort_order + 1 : 1;
      if (target.collapsed) { target.collapsed = 0; await window.api.updateNode(targetId, { collapsed: 0 }); }
    } else {
      newParent = target.parent_id;
      if (mode === 'before') newSortOrder = target.sort_order - 0.5;
      else newSortOrder = target.sort_order + 0.5;
    }
    await window.api.moveNode(srcId, newParent, newSortOrder);
    await Tree.load(Tree.state.currentWorkflowId);
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
  };

  // 计时相关
  Tree.startTimer = async function (nodeId) {
    // 先停止其他节点计时（简单做法）
    // 由于 db 层会自动 stop 同一节点下的 active，这里直接开启即可
    await window.api.startTimeEntry(nodeId);
    Tree.state.activeNodeId = nodeId;
    // 暂停同一项目其他节点的计时 UI（不强制 stop）
    await Tree.recalcStats();
    Tree.render();
    if (global.Detail && global.Detail.refreshIfSelectedNodeIs) global.Detail.refreshIfSelectedNodeIs(nodeId);
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
  };
  Tree.pauseTimer = async function (nodeId) {
    await window.api.pauseTimeEntry(nodeId);
    await Tree.recalcStats();
    Tree.render();
    if (global.Detail && global.Detail.refreshIfSelectedNodeIs) global.Detail.refreshIfSelectedNodeIs(nodeId);
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
  };
  Tree.resumeTimer = async function (nodeId) {
    await window.api.resumeTimeEntry(nodeId);
    await Tree.recalcStats();
    Tree.render();
    if (global.Detail && global.Detail.refreshIfSelectedNodeIs) global.Detail.refreshIfSelectedNodeIs(nodeId);
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
  };
  Tree.stopTimer = async function (nodeId) {
    await window.api.stopTimeEntry(nodeId);
    if (Tree.state.activeNodeId === nodeId) Tree.state.activeNodeId = null;
    await Tree.recalcStats();
    Tree.render();
    if (global.Detail && global.Detail.refreshIfSelectedNodeIs) global.Detail.refreshIfSelectedNodeIs(nodeId);
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
  };

  // =============== 键盘导航辅助 ===============

  // 返回按当前可见顺序（前序遍历）下的节点 id 列表（用于方向键导航）
  Tree._getVisibleOrder = function () {
    const result = [];
    function walk(parentKey) {
      const kids = Tree.state.childrenMap.get(parentKey) || [];
      for (const id of kids) {
        result.push(id);
        const node = Tree.state.nodeMap.get(id);
        if (node && !node.collapsed) walk(id);
      }
    }
    walk('root');
    return result;
  };

  Tree.selectNextNode = function () {
    const order = Tree._getVisibleOrder();
    if (order.length === 0) return;
    let idx = order.indexOf(Tree.state.selectedNodeId);
    if (idx < 0) idx = 0;
    else idx = Math.min(idx + 1, order.length - 1);
    Tree.selectNode(order[idx]);
    const el = document.querySelector(`.tree-node[data-node-id="${order[idx]}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  };

  Tree.selectPrevNode = function () {
    const order = Tree._getVisibleOrder();
    if (order.length === 0) return;
    let idx = order.indexOf(Tree.state.selectedNodeId);
    if (idx < 0) idx = 0;
    else idx = Math.max(idx - 1, 0);
    Tree.selectNode(order[idx]);
    const el = document.querySelector(`.tree-node[data-node-id="${order[idx]}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  };

  Tree.toggleSelectedCompleted = function () {
    const id = Tree.state.selectedNodeId;
    if (!id) return;
    const node = Tree.state.nodeMap.get(id);
    if (!node) return;
    node.is_completed = node.is_completed ? 0 : 1;
    window.api.updateNode(id, { is_completed: node.is_completed });
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
    Tree.render();
    if (global.Detail && global.Detail.refreshIfSelectedNodeIs) global.Detail.refreshIfSelectedNodeIs(id);
  };

  Tree.editSelectedTitle = function () {
    const id = Tree.state.selectedNodeId;
    if (!id) return;
    Tree.editNodeTitle(id);
  };

  // 折叠/展开当前选中节点
  Tree.toggleCollapseSelected = function () {
    const id = Tree.state.selectedNodeId;
    if (!id) return;
    const node = Tree.state.nodeMap.get(id);
    if (!node) return;
    const kids = Tree.state.childrenMap.get(id) || [];
    if (kids.length === 0) return;
    node.collapsed = node.collapsed ? 0 : 1;
    window.api.updateNode(id, { collapsed: node.collapsed });
    Tree.render();
  };

  // 上移/下移（同级内）
  Tree.moveSelectedUp = function () {
    const id = Tree.state.selectedNodeId;
    if (!id) return;
    const node = Tree.state.nodeMap.get(id);
    if (!node) return;
    const siblings = Tree.state.childrenMap.get(node.parent_id == null ? 'root' : node.parent_id) || [];
    const idx = siblings.indexOf(id);
    if (idx <= 0) return;
    const prev = Tree.state.nodeMap.get(siblings[idx - 1]);
    const newSortOrder = prev.sort_order - 0.5;
    window.api.moveNode(id, node.parent_id, newSortOrder).then(() => Tree.load(Tree.state.currentWorkflowId));
  };

  Tree.moveSelectedDown = function () {
    const id = Tree.state.selectedNodeId;
    if (!id) return;
    const node = Tree.state.nodeMap.get(id);
    if (!node) return;
    const siblings = Tree.state.childrenMap.get(node.parent_id == null ? 'root' : node.parent_id) || [];
    const idx = siblings.indexOf(id);
    if (idx < 0 || idx >= siblings.length - 1) return;
    const next = Tree.state.nodeMap.get(siblings[idx + 1]);
    const newSortOrder = next.sort_order + 0.5;
    window.api.moveNode(id, node.parent_id, newSortOrder).then(() => Tree.load(Tree.state.currentWorkflowId));
  };

  // Tab 缩进（上移一级：变为上一个兄弟的子节点）
  Tree.indentSelected = function () {
    const id = Tree.state.selectedNodeId;
    if (!id) return;
    const node = Tree.state.nodeMap.get(id);
    if (!node) return;
    const parentKey = node.parent_id == null ? 'root' : node.parent_id;
    const siblings = Tree.state.childrenMap.get(parentKey) || [];
    const idx = siblings.indexOf(id);
    if (idx <= 0) return; // 第一个节点不能再缩进（没有前一个兄弟）
    const newParent = siblings[idx - 1];
    const newParentNode = Tree.state.nodeMap.get(newParent);
    // 插入到 newParent 子节点末尾
    const kids = Tree.state.childrenMap.get(newParent) || [];
    const lastKid = kids.length ? Tree.state.nodeMap.get(kids[kids.length - 1]) : null;
    const newSortOrder = lastKid ? lastKid.sort_order + 1 : 1;
    if (newParentNode && newParentNode.collapsed) {
      newParentNode.collapsed = 0;
      window.api.updateNode(newParent, { collapsed: 0 });
    }
    window.api.moveNode(id, newParent, newSortOrder).then(() => Tree.load(Tree.state.currentWorkflowId));
  };

  // Shift+Tab 提升一级（移到父节点同级，在父节点之后）
  Tree.outdentSelected = function () {
    const id = Tree.state.selectedNodeId;
    if (!id) return;
    const node = Tree.state.nodeMap.get(id);
    if (!node || node.parent_id == null) return;
    const parent = Tree.state.nodeMap.get(node.parent_id);
    if (!parent) return;
    const newParent = parent.parent_id; // 可能为 null
    let newSortOrder;
    const newSiblings = Tree.state.childrenMap.get(newParent == null ? 'root' : newParent) || [];
    const parentIdx = newSiblings.indexOf(parent.id);
    if (parentIdx >= 0 && parentIdx < newSiblings.length - 1) {
      const after = Tree.state.nodeMap.get(newSiblings[parentIdx + 1]);
      newSortOrder = (parent.sort_order + after.sort_order) / 2;
    } else {
      newSortOrder = parent.sort_order + 1;
    }
    window.api.moveNode(id, newParent, newSortOrder).then(() => Tree.load(Tree.state.currentWorkflowId));
  };

  Tree.deleteSelectedNode = async function () {
    const id = Tree.state.selectedNodeId;
    if (!id) return;
    const node = Tree.state.nodeMap.get(id);
    if (!node) return;
    const hasChildren = (Tree.state.childrenMap.get(id) || []).length > 0;
    const msg = (hasChildren ? `删除"${node.title}"及其子节点？` : `删除"${node.title}"？`) + '\n\n（建议先导出 JSON 备份）';
    const ok = await global.Modal.confirm('删除节点', msg);
    if (!ok) return;
    const parentId = node.parent_id;
    await window.api.deleteNode(id);
    await Tree.load(Tree.state.currentWorkflowId);
    // 删除后选中父节点或下一个节点
    if (parentId && Tree.state.nodeMap.has(parentId)) {
      Tree.state.selectedNodeId = parentId;
    } else {
      const roots = Tree.state.childrenMap.get('root') || [];
      Tree.state.selectedNodeId = roots[0] || null;
    }
    Tree.render();
    if (global.Detail && global.Detail.show) {
      if (Tree.state.selectedNodeId) global.Detail.show(Tree.state.selectedNodeId);
      else global.Detail.clear();
    }
    if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
  };

  global.Tree = Tree;
})(window);
