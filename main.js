const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');

// 数据目录：放在用户数据目录中（独立于安装目录，重装不丢数据）
const dataDir = path.join(app.getPath('userData'), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'workflow.db');

const db = require('./src/db')(dbPath);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f3f3f3',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  // 调试用：通过环境变量 WFM_DEBUG=1 打开 DevTools
  if (process.env.WFM_DEBUG) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Windows 下隐藏菜单
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 退出前结算所有运行中的计时
app.on('before-quit', () => {
  try { db.stopAllRunning(); } catch (e) {}
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---------------- IPC: 窗口控制 ----------------
ipcMain.handle('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.handle('window-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window-close', () => { if (mainWindow) mainWindow.close(); });
ipcMain.handle('window-is-maximized', () => mainWindow ? mainWindow.isMaximized() : false);
ipcMain.handle('open-settings', () => {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 900, height: 600,
    minWidth: 700, minHeight: 400,
    parent: mainWindow,
    modal: false,
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  settingsWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
});
let pomodoroWindow = null;
ipcMain.handle('toggle-pomodoro', () => {
  if (pomodoroWindow) { pomodoroWindow.close(); return; }
  pomodoroWindow = new BrowserWindow({
    width: 210, height: 290,
    resizable: false, frame: false, alwaysOnTop: true,
    skipTaskbar: true,
    parent: mainWindow,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  pomodoroWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'pomodoro.html'));
  pomodoroWindow.on('closed', function () {
    if (pomodoroWindow) { pomodoroWindow = null; mainWindow.webContents.send('pomodoro-state', false); }
  });
  // 定位到主窗口右上角
  if (mainWindow) {
    var bounds = mainWindow.getBounds();
    pomodoroWindow.setPosition(bounds.x + bounds.width - 230, bounds.y + 44);
  }
});
ipcMain.handle('close-pomodoro', () => { if (pomodoroWindow) { pomodoroWindow.close(); pomodoroWindow = null; } });
ipcMain.handle('pomodoro-running', (e, running) => { if (mainWindow) mainWindow.webContents.send('pomodoro-state', running); });

let settingsWindow = null;

// ---------------- 错误包装：统一捕获 SQLite / 业务异常 ----------------
function handle(name, fn) {
  ipcMain.handle(name, async (...args) => {
    try { return await fn(...args); }
    catch (err) { console.error(`[IPC] ${name}:`, err); throw err; }
  });
}

// ---------------- IPC: Workflows ----------------
handle('workflow-list', () => db.listWorkflows());
handle('workflow-create', (e, { name, type }) => db.createWorkflow(name, type));
handle('workflow-rename', (e, { id, name }) => db.renameWorkflow(id, name));
handle('workflow-delete', (e, { id }) => db.deleteWorkflow(id));
handle('workflow-list-deleted', () => db.listDeletedWorkflows());
handle('workflow-restore', (e, { id }) => db.restoreWorkflow(id));
handle('workflow-permanently-delete', (e, { id }) => db.permanentlyDeleteWorkflow(id));
handle('workflow-toggle-archive', (e, { id }) => db.toggleArchiveWorkflow(id));
handle('workflow-save-as-template', (e, { id, newName }) => db.saveAsTemplate(id, newName));
handle('workflow-create-project-from-template', (e, { templateId, projectName }) =>
  db.createProjectFromTemplate(templateId, projectName));

// ---------------- IPC: Nodes ----------------
handle('node-list', (e, { workflowId }) => db.listNodes(workflowId));
handle('node-create', (e, { workflowId, parentId, title, sortOrder }) =>
  db.createNode(workflowId, parentId, title, sortOrder));
handle('node-update', (e, { id, patch }) => db.updateNode(id, patch));
handle('node-delete', (e, { id }) => db.deleteNode(id));
handle('node-move', (e, { id, parentId, sortOrder }) => db.moveNode(id, parentId, sortOrder));

// ---------------- IPC: Time Entries ----------------
handle('time-entry-start', (e, { nodeId }) => db.startTimeEntry(nodeId));
handle('time-entry-stop', (e, { nodeId }) => db.stopTimeEntry(nodeId));
handle('time-entry-pause', (e, { nodeId }) => db.pauseTimeEntry(nodeId));
handle('time-entry-resume', (e, { nodeId }) => db.resumeTimeEntry(nodeId));
handle('time-entry-list-by-node', (e, { nodeId }) => db.listTimeEntriesByNode(nodeId));
handle('time-entry-active', (e, { nodeId }) => db.getActiveTimeEntry(nodeId));
handle('time-entry-delete', (e, { id }) => db.deleteTimeEntry(id));

// ---------------- IPC: 统计 ----------------
handle('stats-workflow', (e, { workflowId }) => db.statsByWorkflow(workflowId));
handle('stats-node', (e, { nodeId }) => db.totalSecondsByNode(nodeId));
handle('template-time-stats', (e, { workflowId }) => db.getTemplateTimeStats(workflowId));
handle('clear-workflow-timers', (e, { workflowId }) => db.clearWorkflowTimers(workflowId));
handle('clear-all-timers', () => db.clearAllTimers());
handle('collapse-all-nodes', (e, { workflowId }) => db.collapseAllNodes(workflowId));
handle('expand-all-nodes', (e, { workflowId }) => db.expandAllNodes(workflowId));

// ---------------- IPC: 导入导出 ----------------
handle('export-json', () => db.exportAll());
handle('import-json', (e, data) => db.importAll(data));

ipcMain.handle('save-file-dialog', async (e, { defaultName, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const content = fs.readFileSync(result.filePaths[0], 'utf-8');
  return JSON.parse(content);
});
