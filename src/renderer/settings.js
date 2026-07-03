(function () {
  const SETTINGS_KEY = 'workflow-manager-settings';
  
  function loadSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? JSON.parse(saved) : getDefaultSettings();
    } catch {
      return getDefaultSettings();
    }
  }
  
  function getDefaultSettings() {
    return {
      autoStart: false,
      rememberWindowPos: true,
      taskCompleteNotification: true,
      appLanguage: 'zh-CN',
      theme: 'light',
      fontSize: 13,
      iconSize: 16,
      compactMode: false,
      autoBackup: true,
      backupInterval: 24,
      backupCount: 10,
      aiAssistant: false,
      devMode: false,
      logLevel: 'info'
    };
  }
  
  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.api?.saveSettings?.(settings);
  }
  
  function updateUI(settings) {
    document.getElementById('autoStart').checked = settings.autoStart;
    document.getElementById('rememberWindowPos').checked = settings.rememberWindowPos;
    document.getElementById('taskCompleteNotification').checked = settings.taskCompleteNotification;
    document.getElementById('appLanguage').value = settings.appLanguage;
    document.querySelector(`input[name="theme"][value="${settings.theme}"]`)?.setAttribute('checked', 'checked');
    document.getElementById('fontSize').value = settings.fontSize;
    document.getElementById('fontSize').nextElementSibling.textContent = settings.fontSize + 'px';
    document.getElementById('iconSize').value = settings.iconSize;
    document.getElementById('iconSize').nextElementSibling.textContent = settings.iconSize + 'px';
    document.getElementById('compactMode').checked = settings.compactMode;
    document.getElementById('autoBackup').checked = settings.autoBackup;
    document.getElementById('backupInterval').value = settings.backupInterval;
    document.getElementById('backupCount').value = settings.backupCount;
    document.getElementById('aiAssistant').checked = settings.aiAssistant;
    document.getElementById('devMode').checked = settings.devMode;
    document.getElementById('logLevel').value = settings.logLevel;
  }
  
  function setupNav() {
    document.querySelectorAll('.settings-nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const pageId = btn.dataset.page;
        document.querySelectorAll('.settings-page').forEach(page => page.classList.add('hidden'));
        document.getElementById('page-' + pageId)?.classList.remove('hidden');
      });
    });
  }
  
  function setupControls() {
    const settings = loadSettings();
    
    document.getElementById('autoStart').addEventListener('change', function() {
      settings.autoStart = this.checked;
      saveSettings(settings);
    });
    
    document.getElementById('rememberWindowPos').addEventListener('change', function() {
      settings.rememberWindowPos = this.checked;
      saveSettings(settings);
    });
    
    document.getElementById('taskCompleteNotification').addEventListener('change', function() {
      settings.taskCompleteNotification = this.checked;
      saveSettings(settings);
    });
    
    document.getElementById('appLanguage').addEventListener('change', function() {
      settings.appLanguage = this.value;
      saveSettings(settings);
    });
    
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
      radio.addEventListener('change', function() {
        settings.theme = this.value;
        saveSettings(settings);
        applyTheme(this.value);
      });
    });
    
    document.getElementById('fontSize').addEventListener('input', function() {
      settings.fontSize = parseInt(this.value);
      this.nextElementSibling.textContent = settings.fontSize + 'px';
      saveSettings(settings);
      document.body.style.fontSize = settings.fontSize + 'px';
    });
    
    document.getElementById('iconSize').addEventListener('input', function() {
      settings.iconSize = parseInt(this.value);
      this.nextElementSibling.textContent = settings.iconSize + 'px';
      saveSettings(settings);
    });
    
    document.getElementById('compactMode').addEventListener('change', function() {
      settings.compactMode = this.checked;
      saveSettings(settings);
      document.body.classList.toggle('compact', settings.compactMode);
    });
    
    document.getElementById('autoBackup').addEventListener('change', function() {
      settings.autoBackup = this.checked;
      saveSettings(settings);
    });
    
    document.getElementById('backupInterval').addEventListener('change', function() {
      settings.backupInterval = parseInt(this.value);
      saveSettings(settings);
    });
    
    document.getElementById('backupCount').addEventListener('change', function() {
      settings.backupCount = parseInt(this.value);
      saveSettings(settings);
    });
    
    document.getElementById('aiAssistant').addEventListener('change', function() {
      settings.aiAssistant = this.checked;
      saveSettings(settings);
    });
    
    document.getElementById('devMode').addEventListener('change', function() {
      settings.devMode = this.checked;
      saveSettings(settings);
    });
    
    document.getElementById('logLevel').addEventListener('change', function() {
      settings.logLevel = this.value;
      saveSettings(settings);
    });
    
    document.getElementById('exportData').addEventListener('click', function() {
      window.api?.exportData?.().then(() => {
        alert('数据导出成功！');
      }).catch(err => {
        alert('导出失败: ' + err.message);
      });
    });
    
    document.getElementById('clearCache').addEventListener('click', function() {
      if (confirm('确定要清除缓存吗？这不会影响您的任务数据。')) {
        localStorage.clear();
        alert('缓存已清除');
      }
    });
    
    document.getElementById('openShortcuts').addEventListener('click', function() {
      alert('快捷键配置功能开发中...');
    });
    
    document.getElementById('resetSettings').addEventListener('click', function() {
      if (confirm('确定要重置所有设置吗？这将恢复到默认状态。')) {
        const defaults = getDefaultSettings();
        saveSettings(defaults);
        updateUI(defaults);
        applyTheme(defaults.theme);
        document.body.style.fontSize = defaults.fontSize + 'px';
        document.body.classList.toggle('compact', defaults.compactMode);
        alert('设置已重置');
      }
    });
  }
  
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }
  
  function initDbPath() {
    window.api?.getDbPath?.().then(path => {
      document.getElementById('dbPath').textContent = path || '无法获取路径';
    }).catch(() => {
      document.getElementById('dbPath').textContent = '无法获取路径';
    });
  }
  
  document.addEventListener('DOMContentLoaded', function() {
    const settings = loadSettings();
    updateUI(settings);
    setupNav();
    setupControls();
    initDbPath();
  });
})();