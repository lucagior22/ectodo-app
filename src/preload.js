'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  getHistory: () => ipcRenderer.invoke('history:get'),
  dispatch: (action, payload) => ipcRenderer.invoke('dispatch', action, payload),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onMode: (cb) => ipcRenderer.on('mode', (_e, m) => cb(m)),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  setTheme: (theme) => ipcRenderer.invoke('config:set', { theme }),
  platform: process.platform,
  onNotice: (cb) => ipcRenderer.on('notice', (_e, text) => cb(text)),
  onConfig: (cb) => ipcRenderer.on('config', (_e, c) => cb(c)),
  onLeader: (cb) => ipcRenderer.on('leader', (_e, on) => cb(on)),
  setHeight: (h) => ipcRenderer.invoke('widget:height', h),
  setPassthrough: (on) => ipcRenderer.send('widget:passthrough', !!on),
  exitActive: () => ipcRenderer.send('widget:exit'),
  openDashboard: () => ipcRenderer.send('dashboard:open'),
});
