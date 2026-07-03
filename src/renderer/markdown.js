// 轻量 markdown 渲染（避免引入外部依赖）
// 支持：标题、粗体、斜体、删除线、列表、代码、引用、换行
(function (global) {
  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderInline(text) {
    let s = escapeHtml(text);
    // image ![alt](url) — must come before link
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%;border-radius:4px;" />');
    // link [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // code `xxx`
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // bold **xxx** 或 __xxx__
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // italic *xxx* 或 _xxx_
    s = s.replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, '$1<em>$2</em>');
    s = s.replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>');
    // ~~strike~~
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s;
  }

  function render(md) {
    if (!md) return '<p style="color:var(--text-muted);">（无说明）</p>';
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let inCode = false;
    let codeBuf = [];
    let inList = null; // 'ul' | 'ol' | null
    let listBuf = [];

    function closeList() {
      if (inList) {
        out.push(`<${inList}>`);
        for (const li of listBuf) out.push(`<li>${renderInline(li)}</li>`);
        out.push(`</${inList}>`);
        inList = null;
        listBuf = [];
      }
    }

    let inQuote = false;
    let quoteBuf = [];
    function closeQuote() {
      if (inQuote) {
        out.push('<blockquote>' + quoteBuf.map(renderInline).join('<br>') + '</blockquote>');
        inQuote = false;
        quoteBuf = [];
      }
    }

    for (let raw of lines) {
      // 代码块 ```
      if (raw.trim().startsWith('```')) {
        if (inCode) {
          out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
          inCode = false;
          codeBuf = [];
        } else {
          closeList(); closeQuote();
          inCode = true;
        }
        continue;
      }
      if (inCode) { codeBuf.push(raw); continue; }

      if (/^\s*$/.test(raw)) { closeList(); closeQuote(); out.push('<br>'); continue; }

      // 标题
      const h = raw.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        closeList(); closeQuote();
        const level = h[1].length;
        out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
        continue;
      }
      // 无序列表
      const ul = raw.match(/^\s*[-*]\s+(.*)$/);
      if (ul) {
        closeQuote();
        if (inList !== 'ul') { closeList(); inList = 'ul'; }
        listBuf.push(ul[1]);
        continue;
      }
      // 有序列表
      const ol = raw.match(/^\s*\d+\.\s+(.*)$/);
      if (ol) {
        closeQuote();
        if (inList !== 'ol') { closeList(); inList = 'ol'; }
        listBuf.push(ol[1]);
        continue;
      }
      // 引用
      const q = raw.match(/^\s*>\s?(.*)$/);
      if (q) {
        closeList();
        inQuote = true;
        quoteBuf.push(q[1]);
        continue;
      }

      closeList(); closeQuote();
      out.push('<p>' + renderInline(raw) + '</p>');
    }
    closeList(); closeQuote();
    if (inCode) out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
    return out.join('\n');
  }

  global.MD = { render, escapeHtml };
})(window);
