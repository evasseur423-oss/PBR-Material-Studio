/**
 * PBR Material Studio — Preload Script
 * Secure IPC bridge for Material Library & PBR Alchemist
 */

const { contextBridge, ipcRenderer } = require('electron');

// Desktop Bridge for Studio Hub & Material Library
contextBridge.exposeInMainWorld('archforgeDesktop', {
  isElectron: true,
  platform: process.platform,
  openMaterialsFolder: (subPath) => ipcRenderer.invoke('app:open-materials-folder', subPath),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  revealFile: (filePath) => ipcRenderer.invoke('app:reveal-file', filePath),
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-directory'),
  pickTextureFiles: () => ipcRenderer.invoke('dialog:pick-texture-files'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onOpenFile: (callback) => ipcRenderer.on('app:open-file', (_e, data) => callback(data))
});

// Native Bridge for PBR Alchemist workspace
contextBridge.exposeInMainWorld('alchemistAPI', {
  getDefaultExportDir: () => ipcRenderer.invoke('app:get-default-export-dir'),
  selectDirectory: (defaultPath) => ipcRenderer.invoke('dialog:select-directory', defaultPath),
  openImageFile: () => ipcRenderer.invoke('dialog:open-image-file'),
  loadSampleImage: (sampleName) => ipcRenderer.invoke('app:load-sample-image', sampleName),
  exportPack: (payload) => ipcRenderer.invoke('export:save-pack', payload),
  openFolder: (folderPath) => ipcRenderer.invoke('shell:open-folder', folderPath)
});

