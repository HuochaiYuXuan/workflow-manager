// 模态对话框 + Toast 通知
// Electron renderer 中默认 prompt/alert/confirm 静默失败，
// 必须用自定义的 DOM 模态框替代。
(function (global) {
  const Modal = {};

  let modalLayer = null;
  function ensureLayer() {
    if (modalLayer) return modalLayer;
    modalLayer = document.createElement('div');
    modalLayer.id = 'modalLayer';
    document.body.appendChild(modalLayer);
    return modalLayer;
  }

  // promise-based prompt。返回 string 或 null
  Modal.prompt = function (title, defaultValue, message) {
    return new Promise((resolve) => {
      const layer = ensureLayer();
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-title"></div>
          ${message ? `<div class="modal-message"></div>` : ''}
          <input type="text" class="modal-input" />
          <div class="modal-actions">
            <button class="cancel">取消</button>
            <button class="primary ok">确定</button>
          </div>
        </div>
      `;
      const modal = mask.querySelector('.modal');
      const titleEl = mask.querySelector('.modal-title');
      const msgEl = mask.querySelector('.modal-message');
      const input = mask.querySelector('.modal-input');
      const cancelBtn = mask.querySelector('.cancel');
      const okBtn = mask.querySelector('.ok');

      titleEl.textContent = title || '';
      if (msgEl) msgEl.textContent = message || '';
      input.value = defaultValue == null ? '' : String(defaultValue);

      function close(result) {
        document.removeEventListener('keydown', onKey);
        mask.remove();
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(null);
        else if (e.key === 'Enter') close(input.value);
      }

      cancelBtn.addEventListener('click', () => close(null));
      okBtn.addEventListener('click', () => close(input.value));
      mask.addEventListener('click', (e) => { if (e.target === mask) close(null); });
      document.addEventListener('keydown', onKey);

      layer.appendChild(mask);
      setTimeout(() => { input.focus(); input.select(); }, 30);
    });
  };

  // promise-based confirm
  Modal.confirm = function (title, message) {
    return new Promise((resolve) => {
      const layer = ensureLayer();
      const mask = document.createElement('div');
      mask.className = 'modal-mask';
      mask.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-title"></div>
          <div class="modal-message"></div>
          <div class="modal-actions">
            <button class="cancel">取消</button>
            <button class="danger ok">确定</button>
          </div>
        </div>
      `;
      mask.querySelector('.modal-title').textContent = title || '';
      mask.querySelector('.modal-message').textContent = message || '';
      function close(result) {
        document.removeEventListener('keydown', onKey);
        mask.remove();
        resolve(result);
      }
      function onKey(e) { if (e.key === 'Escape') close(false); else if (e.key === 'Enter') close(true); }
      mask.querySelector('.cancel').addEventListener('click', () => close(false));
      mask.querySelector('.ok').addEventListener('click', () => close(true));
      mask.addEventListener('click', (e) => { if (e.target === mask) close(false); });
      document.addEventListener('keydown', onKey);
      layer.appendChild(mask);
      setTimeout(() => mask.querySelector('.ok').focus(), 30);
    });
  };

  // 简单的 toast 通知
  let toastContainer = null;
  Modal.toast = function (message, type) {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = message;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 0.2s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 220);
    }, 2200);
  };

  global.Modal = Modal;
})(window);
