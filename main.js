/**
 * PBR Material Studio — Master Electron Process
 * Regroups: [01. Material Library] & [02. PBR Alchemist]
 */

const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure Electron userData path is available to server.js before requiring it
try {
  process.env.PBR_STUDIO_USER_DATA = app.getPath('userData');
  if (app.isPackaged) {
    const exeDir = path.dirname(process.execPath);
    const candidates = [
      path.join(exeDir, 'Workspace_Materials'),
      path.resolve(exeDir, '..', 'Workspace_Materials'),
      path.resolve(exeDir, '..', '..', 'Workspace_Materials')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          const files = fs.readdirSync(c);
          if (files.length > 0) {
            process.env.PBR_STUDIO_MATERIALS_DIR = c;
            break;
          }
        } catch (_) {}
      }
    }
  }
} catch (_) {}

// Launch Express backend
const { server, materialsDir, getMaterialsDir } = require('./server.js');

let mainWindow = null;
const SERVER_PORT = process.env.PORT || 3800;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1000,
    minWidth: 1280,
    minHeight: 760,
    title: "PBR Material Studio — Material Library & PBR Alchemist",
    backgroundColor: '#0e0f11',
    frame: false,
    fullscreen: true,
    icon: path.join(__dirname, 'public', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: false
    }
  });

  mainWindow.removeMenu();

  let retries = 0;
  function connectToServer() {
    mainWindow.loadURL(SERVER_URL).then(() => {
      console.log('[Electron] Connected to PBR Material Studio.');
    }).catch(() => {
      retries++;
      if (retries < 25) {
        setTimeout(connectToServer, 250);
      }
    });
  }

  setTimeout(connectToServer, 350);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(SERVER_URL)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// -----------------------------------------------------------------------------
// IPC HANDLERS (Material Library & PBR Alchemist)
// -----------------------------------------------------------------------------

ipcMain.handle('app:open-materials-folder', async (_event, subPath = '') => {
  const currentDir = (typeof getMaterialsDir === 'function') ? getMaterialsDir() : materialsDir;
  const target = subPath ? path.join(currentDir, subPath) : currentDir;
  if (fs.existsSync(target)) {
    await shell.openPath(target);
    return { success: true, path: target };
  } else {
    await shell.openPath(currentDir);
    return { success: true, path: currentDir };
  }
});

ipcMain.handle('app:reveal-file', async (_event, filePath) => {
  if (fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return { success: true };
  }
  return { success: false, error: 'Fichier introuvable' };
});

ipcMain.handle('app:get-info', async () => {
  const currentDir = (typeof getMaterialsDir === 'function') ? getMaterialsDir() : materialsDir;
  return {
    version: app.getVersion(),
    materialsPath: currentDir,
    userDataPath: app.getPath('userData'),
    isPackaged: app.isPackaged
  };
});

ipcMain.handle('dialog:pick-directory', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Importer un dossier de matériau PBR',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    return result.filePaths[0];
  } catch (err) {
    console.error('[Dialog Error - pick-directory]', err);
    return null;
  }
});

ipcMain.handle('dialog:pick-texture-files', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Importer des textures PBR',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Textures PBR', extensions: ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'exr'] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    return result.filePaths;
  } catch (err) {
    console.error('[Dialog Error - pick-texture-files]', err);
    return null;
  }
});

// PBR Alchemist IPC handlers
ipcMain.handle('app:get-default-export-dir', async () => {
  const currentDir = (typeof getMaterialsDir === 'function') ? getMaterialsDir() : materialsDir;
  return currentDir;
});

ipcMain.handle('dialog:select-directory', async (_event, defaultPath) => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Sélectionner le dossier de destination pour le pack PBR',
      defaultPath: defaultPath || ((typeof getMaterialsDir === 'function') ? getMaterialsDir() : materialsDir),
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  } catch (err) {
    console.error('[Dialog Error - select-directory]', err);
    return null;
  }
});

ipcMain.handle('dialog:open-image-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Importer une photographie de texture brute',
      properties: ['openFile'],
      filters: [
        { name: 'Images de texture', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'png';
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png');
    const base64 = `data:${mime};base64,${buffer.toString('base64')}`;
    return {
      path: filePath,
      name: path.basename(filePath, path.extname(filePath)),
      dataUrl: base64
    };
  } catch (err) {
    console.error('[Dialog Error - open-image-file]', err);
    return null;
  }
});

ipcMain.handle('app:load-sample-image', async (_event, sampleFileName) => {
  const filePath = path.join(__dirname, 'workspaces', 'alchemist', 'samples', sampleFileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sample file not found: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  return {
    path: filePath,
    name: path.basename(filePath, path.extname(filePath)),
    dataUrl: base64
  };
});

ipcMain.handle('export:save-pack', async (_event, payload) => {
  try {
    const { outputDir, materialName, category, subfolder, maps, meta } = payload;
    const baseDir = outputDir || ((typeof getMaterialsDir === 'function') ? getMaterialsDir() : materialsDir);
    if (!materialName) throw new Error("Le nom du matériau n'est pas spécifié.");

    let targetDir = baseDir;
    if (category && category.trim()) {
      targetDir = path.join(baseDir, category.trim());
    }
    if (subfolder) {
      targetDir = path.join(targetDir, materialName);
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const savedFiles = [];
    const saveMap = (mapDataUrl, suffix) => {
      if (!mapDataUrl) return;
      const cleanBase64 = mapDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const fileName = `${materialName}_${suffix}.png`;
      const fullPath = path.join(targetDir, fileName);
      fs.writeFileSync(fullPath, buffer);
      savedFiles.push({ name: fileName, path: fullPath, size: buffer.length });
    };

    saveMap(maps.baseColor, 'baseColor');
    saveMap(maps.normal, 'normal');
    saveMap(maps.roughness, 'roughness');
    saveMap(maps.height, 'height');
    saveMap(maps.ambientOcclusion, 'ambientOcclusion');

    const metaFile = `${materialName}_material.json`;
    const metaPath = path.join(targetDir, metaFile);
    const metaContent = {
      name: materialName,
      category: category || 'General',
      resolution: (meta && meta.resolution) || 2048,
      exportedAt: new Date().toISOString(),
      maps: {
        baseColor: `${materialName}_baseColor.png`,
        normal: `${materialName}_normal.png`,
        roughness: `${materialName}_roughness.png`,
        height: `${materialName}_height.png`,
        ambientOcclusion: `${materialName}_ambientOcclusion.png`
      },
      settings: (meta && meta.settings) || {}
    };
    fs.writeFileSync(metaPath, JSON.stringify(metaContent, null, 2), 'utf8');
    savedFiles.push({ name: metaFile, path: metaPath, size: Buffer.byteLength(JSON.stringify(metaContent)) });

    return {
      success: true,
      targetDir,
      files: savedFiles,
      count: savedFiles.length
    };
  } catch (err) {
    console.error('Error during export:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('shell:open-folder', async (_event, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) {
    await shell.openPath(folderPath);
    return true;
  }
  return false;
});

// Window controls
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) {
    mainWindow.close();
  } else {
    app.quit();
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

