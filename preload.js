const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  togglePomodoro: () => ipcRenderer.invoke('toggle-pomodoro'),
  closePomodoro: () => ipcRenderer.invoke('close-pomodoro'),
  pomodoroRunning: (running) => ipcRenderer.invoke('pomodoro-running', running),
  onPomodoroState: (cb) => ipcRenderer.on('pomodoro-state', (e, running) => cb(running)),

  listWorkflows: () => ipcRenderer.invoke('workflow-list'),
  createWorkflow: (name, type) => ipcRenderer.invoke('workflow-create', { name, type }),
  renameWorkflow: (id, name) => ipcRenderer.invoke('workflow-rename', { id, name }),
  deleteWorkflow: (id) => ipcRenderer.invoke('workflow-delete', { id }),
  toggleArchive: (id) => ipcRenderer.invoke('workflow-toggle-archive', { id }),
  listDeletedWorkflows: () => ipcRenderer.invoke('workflow-list-deleted'),
  restoreWorkflow: (id) => ipcRenderer.invoke('workflow-restore', { id }),
  permanentlyDeleteWorkflow: (id) => ipcRenderer.invoke('workflow-permanently-delete', { id }),
  saveAsTemplate: (id, newName) => ipcRenderer.invoke('workflow-save-as-template', { id, newName }),
  createProjectFromTemplate: (templateId, projectName) =>
    ipcRenderer.invoke('workflow-create-project-from-template', { templateId, projectName }),

  listNodes: (workflowId) => ipcRenderer.invoke('node-list', { workflowId }),
  createNode: (workflowId, parentId, title, sortOrder) =>
    ipcRenderer.invoke('node-create', { workflowId, parentId, title, sortOrder }),
  updateNode: (id, patch) => ipcRenderer.invoke('node-update', { id, patch }),
  deleteNode: (id) => ipcRenderer.invoke('node-delete', { id }),
  moveNode: (id, parentId, sortOrder) => ipcRenderer.invoke('node-move', { id, parentId, sortOrder }),

  startTimeEntry: (nodeId) => ipcRenderer.invoke('time-entry-start', { nodeId }),
  stopTimeEntry: (nodeId) => ipcRenderer.invoke('time-entry-stop', { nodeId }),
  pauseTimeEntry: (nodeId) => ipcRenderer.invoke('time-entry-pause', { nodeId }),
  resumeTimeEntry: (nodeId) => ipcRenderer.invoke('time-entry-resume', { nodeId }),
  listTimeEntriesByNode: (nodeId) => ipcRenderer.invoke('time-entry-list-by-node', { nodeId }),
  getActiveTimeEntry: (nodeId) => ipcRenderer.invoke('time-entry-active', { nodeId }),
  deleteTimeEntry: (id) => ipcRenderer.invoke('time-entry-delete', { id }),

  statsByWorkflow: (workflowId) => ipcRenderer.invoke('stats-workflow', { workflowId }),
  totalSecondsByNode: (nodeId) => ipcRenderer.invoke('stats-node', { nodeId }),
  getTemplateTimeStats: (workflowId) => ipcRenderer.invoke('template-time-stats', { workflowId }),
  clearWorkflowTimers: (workflowId) => ipcRenderer.invoke('clear-workflow-timers', { workflowId }),
  clearAllTimers: () => ipcRenderer.invoke('clear-all-timers'),
  collapseAllNodes: (workflowId) => ipcRenderer.invoke('collapse-all-nodes', { workflowId }),
  expandAllNodes: (workflowId) => ipcRenderer.invoke('expand-all-nodes', { workflowId }),

  exportJSON: () => ipcRenderer.invoke('export-json'),
  importJSON: (data) => ipcRenderer.invoke('import-json', data),
  saveFileDialog: (defaultName, content) =>
    ipcRenderer.invoke('save-file-dialog', { defaultName, content }),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog')
});
