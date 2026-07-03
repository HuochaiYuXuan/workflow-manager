// 右侧详情面板 - 节点信息、计时器、Markdown 说明、时间记录
(function (global) {
  const Detail = {};
  Detail.state = {
    nodeId: null,
    node: null,
    activeTE: null,
    tickHandle: null,
    historyCollapsed: true,
    historyCache: null
  };

  // 根据 time entry 记录实时计算当前秒数（与 db.js calcSeconds 同逻辑）
  Detail._calcActiveSeconds = function () {
    const te = Detail.state.activeTE;
    if (!te) return 0;
    const now = Date.now();
    const end = te.end_at || now;
    let sec = Math.max(0, Math.floor((end - te.start_at) / 1000));
    sec = Math.max(0, sec - (te.paused_seconds || 0));
    if (te.status === 'paused' && te.paused_at) {
      sec = Math.max(0, sec - Math.floor((now - te.paused_at) / 1000));
    }
    return sec;
  };

  Detail.show = async function (nodeId) {
    Detail.state.nodeId = nodeId;
    Detail.state.node = global.Tree.state.nodeMap.get(nodeId);
    if (!Detail.state.node) { Detail.clear(); return; }
    try {
      Detail.state.activeTE = await window.api.getActiveTimeEntry(nodeId);
    } catch (e) { Detail.state.activeTE = null; }
    Detail._startTick();
    try { Detail._render(); } catch (e) { console.error('[Detail] render error:', e); }
  };

  Detail.clear = function () {
    Detail.state.nodeId = null;
    Detail.state.node = null;
    Detail.state.activeTE = null;
    Detail.state.historyCollapsed = true;
    Detail.state.historyCache = null;
    Detail._stopTick();
    const inner = document.getElementById('detailInner');
    if (inner) {
      inner.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">未选择节点</div>
          <div class="empty-sub">在中间流程树中点击节点查看详情</div>
        </div>`;
    }
  };

  Detail.refreshIfSelectedNodeIs = async function (nodeId) {
    if (Detail.state.nodeId === nodeId) {
      await Detail.show(nodeId);
    }
  };

  Detail._startTick = function () {
    Detail._stopTick();
    Detail.state.tickHandle = setInterval(() => {
      if (!Detail.state.activeTE) return;
      Detail._updateTimerDisplay();
    }, 1000);
  };

  Detail._stopTick = function () {
    if (Detail.state.tickHandle) { clearInterval(Detail.state.tickHandle); Detail.state.tickHandle = null; }
  };

  Detail._updateTimerDisplay = function () {
    const d = document.getElementById('timerDisplay');
    if (!d) return;
    const activeSeconds = Detail._calcActiveSeconds();
    d.textContent = global.Tree.formatClock(activeSeconds);
    // 刷新左侧树节点时间显示
    const row = document.querySelector(`.tree-node[data-node-id="${Detail.state.nodeId}"] .node-time`);
    if (row) {
      const nodeTotal = global.Tree.getNodeTotalSeconds(Detail.state.nodeId);
      row.textContent = global.Tree.formatDuration(nodeTotal);
    }
    // 工作区总时间刷新
    if (global.App && global.App.refreshMeta) global.App.refreshMeta();
  };

  Detail._render = async function () {
    const inner = document.getElementById('detailInner');
    const node = Detail.state.node;
    if (!node || !inner) return;

    const total = global.Tree.getNodeTotalSeconds(node.id);
    const history = await window.api.listTimeEntriesByNode(node.id);
    const activeSeconds = Detail._calcActiveSeconds();

    const container = document.createElement('div');
    container.className = 'detail-container';

    // 标题 + 完成状态（放右侧）
    const titleRow = document.createElement('div');
    titleRow.className = 'detail-title-row';
    const h2 = document.createElement('h2');
    h2.textContent = node.title;
    if (node.is_completed) h2.classList.add('completed');
    titleRow.appendChild(h2);

    const completeBtn = document.createElement('button');
    completeBtn.className = 'detail-complete-btn' + (node.is_completed ? ' checked' : '');
    completeBtn.title = node.is_completed ? '取消完成' : '标记完成';
    completeBtn.innerHTML = node.is_completed
      ? `<svg width="20" height="20" viewBox="0 0 24 24"><use href="#icon-check"/></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24"><use href="#icon-check-box"/></svg>`;
    completeBtn.addEventListener('click', () => {
      global.Tree.toggleNodeCompleted(node.id);
    });
    titleRow.appendChild(completeBtn);
    container.appendChild(titleRow);

    const sub = document.createElement('div');
    sub.className = 'detail-subtitle';
    const subInfo = global.Tree.countSubtreeCompleted(node.id);
    let subText = `子节点 ${subInfo.total} · 已完成 ${subInfo.done} · 累计 ${global.Tree.formatDuration(total)}`;
    // 模板时间对比
    const tmplData = (global.App && global.App.state && global.App.state.showTemplateTime)
      ? global.App.state.templateTimeData : null;
    if (tmplData && tmplData.byNode && tmplData.byNode[node.id]) {
      subText += ` · 模板参考 ${global.Tree.formatDuration(tmplData.byNode[node.id])}`;
    }
    sub.textContent = subText;
    container.appendChild(sub);

    // 计时器（紧凑版：数字 + 按钮水平排列）
    const timerSec = document.createElement('section');
    timerSec.className = 'detail-section';
    const timerHeader = document.createElement('div');
    timerHeader.className = 'detail-section-header-row';
    const timerTitle = document.createElement('h3');
    timerTitle.textContent = '计时';
    timerHeader.appendChild(timerTitle);

    // 记录按钮（鼠标悬停弹出时间记录浮层）
    const recordWrap = document.createElement('div');
    recordWrap.className = 'record-wrapper';
    const recordBtn = document.createElement('span');
    recordBtn.className = 'record-btn';
    recordBtn.textContent = '记录(' + history.length + ')';
    recordWrap.appendChild(recordBtn);
    timerHeader.appendChild(recordWrap);
    timerSec.appendChild(timerHeader);
    const timer = document.createElement('div');
    timer.className = 'timer timer-compact';
    const display = document.createElement('span');
    display.id = 'timerDisplay';
    display.className = 'timer-display timer-display-sm';
    if (Detail.state.activeTE && Detail.state.activeTE.status === 'running') display.classList.add('running');
    else if (Detail.state.activeTE && Detail.state.activeTE.status === 'paused') display.classList.add('paused');
    display.textContent = global.Tree.formatClock(activeSeconds);
    timer.appendChild(display);

    const actions = document.createElement('span');
    actions.className = 'timer-actions timer-actions-inline';
    if (!Detail.state.activeTE) {
      const start = document.createElement('button');
      start.className = 'btn-start';
      start.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-play"/></svg><span>开始</span>';
      start.addEventListener('click', function () { global.Tree.startTimer(node.id); });
      actions.appendChild(start);
    } else if (Detail.state.activeTE.status === 'running') {
      const pause = document.createElement('button');
      pause.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-pause"/></svg><span>暂停</span>';
      pause.addEventListener('click', function () { global.Tree.pauseTimer(node.id); });
      actions.appendChild(pause);
      const stop = document.createElement('button');
      stop.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-stop"/></svg><span>停止</span>';
      stop.addEventListener('click', function () { global.Tree.stopTimer(node.id); });
      actions.appendChild(stop);
    } else {
      const resume = document.createElement('button');
      resume.className = 'btn-start';
      resume.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-play"/></svg><span>继续</span>';
      resume.addEventListener('click', function () { global.Tree.resumeTimer(node.id); });
      actions.appendChild(resume);
      const stop = document.createElement('button');
      stop.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-stop"/></svg><span>停止</span>';
      stop.addEventListener('click', function () { global.Tree.stopTimer(node.id); });
      actions.appendChild(stop);
    }
    timer.appendChild(actions);
    timerSec.appendChild(timer);
    container.appendChild(timerSec);

    // 说明（铺到底，无限高，移除展开按钮）
    var mdSec = document.createElement('section');
    mdSec.className = 'detail-section md-section-flex';
    var mdHeader = document.createElement('h3');
    mdHeader.textContent = '说明';
    mdSec.appendChild(mdHeader);

    var descContent = node.description || '';
    if (descContent.trim()) {
      var preview = document.createElement('div');
      preview.className = 'md-preview md-preview-full';
      preview.innerHTML = global.EditorModule.renderPreview(descContent);
      mdSec.appendChild(preview);
    } else {
      var mdHint = document.createElement('div');
      mdHint.className = 'md-hint';
      mdHint.textContent = '暂无说明';
      mdSec.appendChild(mdHint);
    }
    container.appendChild(mdSec);

    // 浮层：时间记录（鼠标悬停显示，inline 在 recordWrap 内）
    var popover = document.createElement('div');
    popover.className = 'record-popover';
    if (history.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'padding:12px;color:var(--text-muted);text-align:center;font-size:12px;';
      empty.textContent = '暂无记录';
      popover.appendChild(empty);
    } else {
      var histList = document.createElement('div');
      histList.className = 'time-entry-list';
      history.forEach(function (te) {
        var row = document.createElement('div');
        row.className = 'time-entry-row';
        var startD = new Date(te.start_at);
        var endD = te.end_at ? new Date(te.end_at) : null;
        var timeLabel = String(startD.getHours()).padStart(2, '0') + ':' + String(startD.getMinutes()).padStart(2, '0') + ' - ' + (endD ? String(endD.getHours()).padStart(2, '0') + ':' + String(endD.getMinutes()).padStart(2, '0') : '...');
        var leftSpan = document.createElement('span');
        leftSpan.className = 'te-time';
        leftSpan.textContent = timeLabel;
        var rightSpan = document.createElement('span');
        rightSpan.className = 'te-dur';
        rightSpan.textContent = global.Tree.formatDuration(te.seconds || 0);
        var delBtn = document.createElement('button');
        delBtn.className = 'te-del';
        delBtn.textContent = '✕';
        delBtn.title = '删除此记录';
        delBtn.addEventListener('click', async function (ev) {
          ev.stopPropagation();
          var ok = await Modal.confirm('删除时间记录', '确认删除此时间记录？');
          if (ok) {
            await window.api.deleteTimeEntry(te.id);
            Detail.state.historyCache = null;
            await global.Tree.recalcStats();
            global.Tree.render();
            Detail._render();
            if (global.App && global.App.onNodeChanged) global.App.onNodeChanged();
          }
        });
        row.appendChild(leftSpan);
        row.appendChild(rightSpan);
        row.appendChild(delBtn);
        histList.appendChild(row);
      });
      popover.appendChild(histList);
    }
    recordWrap.appendChild(popover);

    // 浮层 hover 控制
    var hideTimer = null;
    function showPopover() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      popover.classList.add('show');
    }
    function hidePopover() {
      hideTimer = setTimeout(function () {
        popover.classList.remove('show');
      }, 150);
    }
    recordWrap.addEventListener('mouseenter', showPopover);
    recordWrap.addEventListener('mouseleave', hidePopover);
    popover.addEventListener('mouseenter', function () { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } });
    popover.addEventListener('mouseleave', hidePopover);

    // 右下角浮动编辑按钮
    var fab = document.createElement('button');
    fab.className = 'md-edit-fab';
    fab.title = '展开编辑（覆盖中+右栏）';
    fab.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><use href="#icon-edit"/></svg>';
    fab.addEventListener('click', function () { Detail.expand(); });
    container.appendChild(fab);

    inner.innerHTML = '';
    inner.appendChild(container);
  };

  // ================ 展开浮层 ================
  Detail.expand = async function () {
    const overlay = document.getElementById('expandOverlay');
    const node = Detail.state.node;
    if (!node || !overlay) return;
    document.getElementById('expandNodeTitle').textContent = node.title + ' · 说明';
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    await Detail._renderExpanded();
  };

  Detail.collapse = async function () {
    const overlay = document.getElementById('expandOverlay');
    // 先销毁 Editor.js 实例
    await global.EditorModule.destroy();
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    if (Detail.state.node && Detail.state.node.id) {
      Detail.show(Detail.state.node.id);
    }
  };

  Detail._renderExpanded = async function () {
    const node = Detail.state.node;
    if (!node) return;
    const body = document.getElementById('expandBody');

    await global.EditorModule.destroy();
    body.innerHTML = '';
    const holder = document.createElement('div');
    holder.id = 'editorjs-holder';
    body.appendChild(holder);

    await global.EditorModule.init(holder, node.description || '', function (json) {
      node.description = json;
      window.api.updateNode(node.id, { description: json });
    });
  };

  // 返回按钮
  document.getElementById('expandBack').addEventListener('click', (e) => {
    e.stopPropagation();
    Detail.collapse();
  });

  // Esc 关闭
  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('expandOverlay');
    if (e.key === 'Escape' && overlay && overlay.style.display === 'flex') {
      // 检查没有模态框打开
      if (document.querySelector('.modal-mask')) return;
      Detail.collapse();
      e.preventDefault();
    }
  });

  global.Detail = Detail;
})(window);
