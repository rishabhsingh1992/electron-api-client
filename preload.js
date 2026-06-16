// preload.js
// This script runs in a special context that can access both
// the Electron main process (via ipcRenderer) and the renderer (browser window).
//
// contextBridge.exposeInMainWorld safely exposes a limited API to the renderer
// so it can trigger Node.js operations without having full Node access.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // The renderer calls window.api.sendRequest(config) to make an HTTP request.
  // Under the hood it sends a message to main.js via IPC (inter-process communication).
  sendRequest: (requestConfig) => ipcRenderer.invoke('send-request', requestConfig)
})
