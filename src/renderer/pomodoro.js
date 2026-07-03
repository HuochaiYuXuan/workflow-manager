// 番茄钟 — 独立窗口
(function () {
  var Pomo = {};

  Pomo.presets = [
    { label: '专注', mins: 25 },
    { label: '短休', mins: 5 },
    { label: '长休', mins: 15 }
  ];

  Pomo.state = {
    activePreset: 0,
    remaining: 25 * 60,
    total: 25 * 60,
    intervalId: null,
    running: false,
    paused: false
  };

  Pomo._loadPresets = function () {
    try {
      var raw = localStorage.getItem('pomodoro-presets');
      if (raw) { var p = JSON.parse(raw); if (Array.isArray(p) && p.length) Pomo.presets = p; }
    } catch (e) {}
  };
  Pomo._savePresets = function () {
    try { localStorage.setItem('pomodoro-presets', JSON.stringify(Pomo.presets)); } catch (e) {}
  };

  Pomo._renderPresets = function () {
    var el = document.getElementById('pomoPresets');
    el.innerHTML = '';
    Pomo.presets.forEach(function (p, i) {
      var btn = document.createElement('button');
      btn.textContent = p.label + ' ' + p.mins + 'm';
      if (i === Pomo.state.activePreset) btn.classList.add('active');
      btn.addEventListener('click', function () { Pomo.selectPreset(i); });
      btn.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        var newLabel = prompt('预设名称', p.label);
        if (newLabel === null) return;
        var newMins = parseInt(prompt('分钟数', p.mins), 10);
        if (isNaN(newMins) || newMins < 1) return;
        Pomo.presets[i].label = newLabel || p.label;
        Pomo.presets[i].mins = newMins;
        Pomo._savePresets();
        if (i === Pomo.state.activePreset) Pomo.selectPreset(i);
        else Pomo._renderPresets();
      });
      btn.title = '右键编辑预设';
      el.appendChild(btn);
    });
  };

  Pomo.selectPreset = function (i) {
    Pomo.stop();
    Pomo.state.activePreset = i;
    var mins = Pomo.presets[i].mins;
    Pomo.state.remaining = mins * 60;
    Pomo.state.total = mins * 60;
    Pomo._renderPresets();
    Pomo._updateDisplay();
    document.getElementById('pomoLabel').textContent = Pomo.presets[i].label;
    document.getElementById('pomoCustomMin').value = mins;
  };

  Pomo.start = function () {
    if (Pomo.state.running && !Pomo.state.paused) return;
    if (Pomo.state.paused) { Pomo._resume(); return; }
    Pomo.state.running = true;
    Pomo.state.paused = false;
    Pomo._updateButtons();
    Pomo._updateDisplay();
    window.api.pomodoroRunning(true);
    Pomo.state.intervalId = setInterval(function () {
      Pomo.state.remaining--;
      Pomo._updateDisplay();
      if (Pomo.state.remaining <= 0) Pomo._finish();
    }, 1000);
  };

  Pomo._resume = function () {
    Pomo.state.paused = false;
    Pomo.state.intervalId = setInterval(function () {
      Pomo.state.remaining--;
      Pomo._updateDisplay();
      if (Pomo.state.remaining <= 0) Pomo._finish();
    }, 1000);
    Pomo._updateButtons();
    Pomo._updateDisplay();
    window.api.pomodoroRunning(true);
  };

  Pomo.pause = function () {
    if (!Pomo.state.running) return;
    Pomo.state.paused = true;
    if (Pomo.state.intervalId) { clearInterval(Pomo.state.intervalId); Pomo.state.intervalId = null; }
    Pomo._updateButtons();
    Pomo._updateDisplay();
    window.api.pomodoroRunning(false);
  };

  Pomo.stop = function () {
    Pomo.state.running = false;
    Pomo.state.paused = false;
    if (Pomo.state.intervalId) { clearInterval(Pomo.state.intervalId); Pomo.state.intervalId = null; }
    Pomo._updateButtons();
    Pomo._updateDisplay();
    window.api.pomodoroRunning(false);
  };

  Pomo.reset = function () {
    Pomo.stop();
    var mins = Pomo.presets[Pomo.state.activePreset].mins;
    Pomo.state.remaining = mins * 60;
    Pomo.state.total = mins * 60;
    Pomo._updateDisplay();
  };

  Pomo._finish = function () {
    Pomo.stop();
    var label = Pomo.presets[Pomo.state.activePreset].label;
    Pomo.state.remaining = 0;
    Pomo._updateDisplay();
    try {
      new Notification('番茄钟', { body: label + ' 时间到！', silent: false });
    } catch (e) {
      alert(label + ' 时间到！');
    }
  };

  Pomo._updateDisplay = function () {
    var d = document.getElementById('pomoDisplay');
    var s = Pomo.state.remaining;
    var m = Math.floor(s / 60);
    var sec = s % 60;
    d.textContent = String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    d.className = 'pomo-display';
    if (Pomo.state.running && !Pomo.state.paused) d.classList.add('running');
    else if (Pomo.state.paused) d.classList.add('paused');
  };

  Pomo._updateButtons = function () {
    var start = document.getElementById('pomoStart');
    var pause = document.getElementById('pomoPause');
    if (Pomo.state.running && !Pomo.state.paused) {
      start.style.display = 'none';
      pause.style.display = '';
    } else {
      start.style.display = '';
      if (Pomo.state.paused) start.textContent = '▶ 继续';
      else start.textContent = '▶ 开始';
      pause.style.display = 'none';
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    Pomo._loadPresets();

    document.getElementById('pomoClose').addEventListener('click', function () {
      window.api.closePomodoro();
    });

    document.getElementById('pomoStart').addEventListener('click', function () { Pomo.start(); });
    document.getElementById('pomoPause').addEventListener('click', function () { Pomo.pause(); });
    document.getElementById('pomoReset').addEventListener('click', function () { Pomo.reset(); });

    document.getElementById('pomoCustomSet').addEventListener('click', function () {
      var mins = parseInt(document.getElementById('pomoCustomMin').value, 10);
      if (isNaN(mins) || mins < 1) return;
      Pomo.stop();
      Pomo.state.remaining = mins * 60;
      Pomo.state.total = mins * 60;
      Pomo._updateDisplay();
      document.getElementById('pomoLabel').textContent = '自定义';
      var i = Pomo.state.activePreset;
      Pomo.presets[i].mins = mins;
      Pomo._savePresets();
      Pomo._renderPresets();
    });

    Pomo._renderPresets();
    Pomo._updateDisplay();
    document.getElementById('pomoLabel').textContent = Pomo.presets[0].label;
  });
})();
