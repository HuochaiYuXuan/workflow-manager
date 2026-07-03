// Editor.js 集成 — 替代展开浮层的 textarea
// 保留 markdown.js 作为回退方案
(function (global) {
  const Editor = {};
  Editor.instance = null;
  Editor._saveCallback = null;

  // ---- 自定义 VideoCard Tool ----
  class VideoCard {
    static get toolbox() {
      return {
        title: '视频',
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21"/></svg>'
      };
    }

    constructor({ data }) {
      this.data = { src: '', time: 0, label: '', ...data };
    }

    render() {
      this._wrap = document.createElement('div');
      this._wrap.className = 'ej-video-card';
      var self = this;
      this._wrap.innerHTML =
        '<div class="ej-video-row">' +
          '<span class="ej-video-icon">▶</span>' +
          '<input class="ej-video-label" placeholder="视频标签" value="' + self._esc(self.data.label) + '" />' +
          '<input class="ej-video-time" type="number" placeholder="秒" value="' + (self.data.time || '') + '" min="0" title="跳转时间（秒）" />' +
        '</div>' +
        '<input class="ej-video-src" placeholder="视频路径（如 D:/videos/demo.mp4）" value="' + self._esc(self.data.src) + '" />';
      return this._wrap;
    }

    save(blockContent) {
      var wrap = blockContent || this._wrap;
      var label = (wrap.querySelector('.ej-video-label') || {}).value || '';
      var time = parseInt((wrap.querySelector('.ej-video-time') || {}).value) || 0;
      var src = (wrap.querySelector('.ej-video-src') || {}).value || '';
      return { src: src, time: time, label: label };
    }

    _esc(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }

  // ---- 初始化 Editor.js ----
  Editor.init = async function (container, initialData, onSave) {
    // 检查依赖
    if (typeof EditorJS === 'undefined') {
      container.innerHTML = '<p style="color:var(--danger);padding:20px;">EditorJS 未加载。请确认 node_modules 已安装。</p>';
      return null;
    }
    if (typeof Header === 'undefined' || typeof Paragraph === 'undefined') {
      container.innerHTML = '<p style="color:var(--danger);padding:20px;">Editor.js 插件未加载。<br>Header='+(typeof Header)+' Paragraph='+(typeof Paragraph)+'</p>';
      return null;
    }

    Editor._saveCallback = onSave;
    const data = Editor._parseData(initialData);

    // 构建工具集（跳过未加载的插件）
    var tools = {};
    function addTool(name, cls, cfg) {
      if (typeof cls !== 'undefined' && cls !== null) tools[name] = Object.assign({ class: cls }, cfg || {});
    }
    addTool('header',    typeof Header    !== 'undefined' ? Header    : null, { inlineToolbar: true, config: { placeholder: '标题', levels: [1, 2, 3], defaultLevel: 2 } });
    addTool('paragraph', typeof Paragraph !== 'undefined' ? Paragraph : null, { inlineToolbar: true, config: { placeholder: '输入内容...' } });
    addTool('image',     typeof ImageTool !== 'undefined' ? ImageTool : null, { config: { captionPlaceholder: '图片说明（可选）' } });
    addTool('list',      typeof List      !== 'undefined' ? List      : null, { inlineToolbar: true });
    if (typeof Underline !== 'undefined') tools.underline = Underline;
    addTool('videoCard', VideoCard);

    try {
      Editor.instance = new EditorJS({
        holder: container,
        tools: tools,
        data: data,
        placeholder: '开始记录操作步骤、参考图、视频时间戳...',
        autofocus: true,
        onChange: function () {
          if (Editor._saveTimer) clearTimeout(Editor._saveTimer);
          Editor._saveTimer = setTimeout(function () { Editor.save(); }, 600);
        }
      });

      // Editor.js v2 异步初始化
      await Editor.instance.isReady;
    } catch (e) {
      console.error('[EditorModule] init error:', e);
      container.innerHTML = '<p style="color:var(--danger);padding:20px;">Editor.js 初始化失败：<br>' + (e.message || String(e)) + '</p>';
      return null;
    }
    return Editor.instance;
  };

  // 解析数据：兼容旧 Markdown 和 Editor.js JSON
  Editor._parseData = function (raw) {
    if (!raw || !raw.trim()) return { blocks: [] };
    // 检测 Editor.js JSON
    if (raw.trim().startsWith('{') && raw.includes('"blocks"')) {
      try { return JSON.parse(raw); } catch (e) { /* fall through */ }
    }
    // 旧 Markdown → 转为 paragraph blocks
    const lines = raw.split('\n');
    const blocks = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // 标题
      const h = trimmed.match(/^(#{1,3})\s+(.*)/);
      if (h) { blocks.push({ type: 'header', data: { text: h[2], level: h[1].length } }); continue; }
      // 图片
      const img = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (img) { blocks.push({ type: 'image', data: { caption: img[1], file: { url: img[2] } } }); continue; }
      // 链接
      const link = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (link) { blocks.push({ type: 'paragraph', data: { text: `<a href="${link[2]}">${link[1]}</a>` } }); continue; }
      // 普通段落
      blocks.push({ type: 'paragraph', data: { text: trimmed } });
    }
    return { blocks: blocks.length > 0 ? blocks : [{ type: 'paragraph', data: { text: '' } }] };
  };

  // 保存：输出 Editor.js JSON
  Editor.save = async function () {
    if (!Editor.instance) return null;
    try {
      const output = await Editor.instance.save();
      const json = JSON.stringify(output);
      if (Editor._saveCallback) Editor._saveCallback(json);
      return json;
    } catch (e) { return null; }
  };

  // 销毁实例
  Editor.destroy = async function () {
    if (Editor._saveTimer) clearTimeout(Editor._saveTimer);
    if (Editor.instance) {
      try { await Editor.instance.destroy(); } catch (e) {}
      Editor.instance = null;
    }
  };

  // ---- 预览渲染：Editor.js JSON → HTML ----
  Editor.renderPreview = function (raw) {
    if (!raw || !raw.trim()) return '<p style="color:var(--text-muted);">（无说明）</p>';
    // 如果是旧 Markdown，用原有渲染器
    if (!raw.trim().startsWith('{') || !raw.includes('"blocks"')) {
      return global.MD ? global.MD.render(raw) : '<p>' + raw + '</p>';
    }
    // 解析 JSON blocks
    try {
      const data = JSON.parse(raw);
      const html = [];
      for (const block of data.blocks || []) {
        switch (block.type) {
        case 'header':
          const hLevel = Math.min(block.data.level || 2, 3);
          html.push(`<h${hLevel}>${block.data.text || ''}</h${hLevel}>`);
          break;
        case 'paragraph':
          html.push(`<p>${block.data.text || ''}</p>`);
          break;
        case 'image':
          const src = (block.data.file && block.data.file.url) || '';
          const cap = block.data.caption || '';
          const stretch = block.data.stretched ? ' expanded' : '';
          html.push(`<img src="${src}" alt="${cap}" title="${cap}" class="ej-preview-img${stretch}" style="max-width:400px;border-radius:6px;cursor:pointer;" onclick="this.classList.toggle('expanded');this.style.maxWidth=this.classList.contains('expanded')?'100%':'400px'" />`);
          if (cap) html.push(`<p style="font-size:11px;color:var(--text-muted);text-align:center;">${cap}</p>`);
          break;
        case 'list':
          const tag = block.data.style === 'ordered' ? 'ol' : 'ul';
          const items = (block.data.items || []).map(i => `<li>${i}</li>`).join('');
          html.push(`<${tag}>${items}</${tag}>`);
          break;
        case 'videoCard':
          const d = block.data;
          const timeStr = d.time ? ` ${String(Math.floor(d.time/60)).padStart(2,'0')}:${String(d.time%60).padStart(2,'0')}` : '';
          html.push(`<div class="ej-video-card-preview">
            <span>▶</span>
            <strong>${d.label || '视频'}</strong>${timeStr}
            <a href="potplayer://${d.src || ''}" style="font-size:11px;margin-left:8px;">PotPlayer ↗</a>
          </div>`);
          break;
        default:
          if (block.data && block.data.text) html.push(`<p>${block.data.text}</p>`);
        }
      }
      return html.join('\n');
    } catch (e) {
      return '<p style="color:var(--danger);">（数据解析失败）</p>';
    }
  };

  global.EditorModule = Editor;
})(window);
