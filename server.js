/**
 * PBR Material Studio — Backend Server
 * Express 5 + Multer + Static Asset Gateway
 * Regroups ONLY:
 *  - [01. Material Library]
 *  - [02. PBR Alchemist]
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3800;

const STANDARD_CATEGORIES = [
  'Brick', 'Ceramic', 'Concrete', 'Fabric', 'Leather',
  'Metal', 'Nature', 'Others', 'Paint', 'Plaster',
  'Plastic', 'Stone', 'Wood'
];

function isWritableDirectory(dirPath) {
  try {
    if (!dirPath || typeof dirPath !== 'string') return false;
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const testFile = path.join(dirPath, `.write_probe_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(testFile, 'probe');
    fs.unlinkSync(testFile);
    return true;
  } catch (err) {
    console.warn(`[Storage] Directory is not writable (${dirPath}):`, err.message);
    return false;
  }
}

function hasMaterials(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return false;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sub = fs.readdirSync(path.join(dir, entry.name));
        if (sub.length > 0) return true;
      }
    }
  } catch (_) {}
  return false;
}

function resolveMaterialsDirectory() {
  if (process.env.PBR_STUDIO_MATERIALS_DIR) {
    const customDir = path.resolve(process.env.PBR_STUDIO_MATERIALS_DIR);
    if (fs.existsSync(customDir) && isWritableDirectory(customDir)) {
      return customDir;
    }
  }

  try {
    const isPackaged = (process.mainModule && process.mainModule.filename && process.mainModule.filename.includes('app.asar')) ||
      (process.execPath && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('electron.exe'));
    if (isPackaged) {
      const exeDir = path.dirname(process.execPath);
      const exeMaterials = path.join(exeDir, 'Workspace_Materials');
      if (fs.existsSync(exeMaterials) && hasMaterials(exeMaterials) && isWritableDirectory(exeMaterials)) {
        return exeMaterials;
      }
      const parentMaterials = path.resolve(exeDir, '..', 'Workspace_Materials');
      if (fs.existsSync(parentMaterials) && hasMaterials(parentMaterials) && isWritableDirectory(parentMaterials)) {
        return parentMaterials;
      }
      const grandParentMaterials = path.resolve(exeDir, '..', '..', 'Workspace_Materials');
      if (fs.existsSync(grandParentMaterials) && hasMaterials(grandParentMaterials) && isWritableDirectory(grandParentMaterials)) {
        return grandParentMaterials;
      }
      if (isWritableDirectory(exeMaterials)) {
        return exeMaterials;
      }
    }
  } catch (_) {}

  if (!__dirname.includes('app.asar')) {
    const localWorkspace = path.join(__dirname, 'Workspace_Materials');
    if (fs.existsSync(localWorkspace) && isWritableDirectory(localWorkspace)) {
      return localWorkspace;
    }
  }

  try {
    const cwdWorkspace = path.join(process.cwd(), 'Workspace_Materials');
    if (fs.existsSync(cwdWorkspace) && isWritableDirectory(cwdWorkspace)) {
      return cwdWorkspace;
    }
  } catch (_) {}

  let electronUserData = null;
  try {
    const electron = require('electron');
    const electronApp = electron.app || (electron.remote && electron.remote.app);
    if (electronApp && typeof electronApp.getPath === 'function') {
      electronUserData = electronApp.getPath('userData');
    }
  } catch (_) {}

  if (!electronUserData && process.env.PBR_STUDIO_USER_DATA) {
    electronUserData = process.env.PBR_STUDIO_USER_DATA;
  }

  if (electronUserData) {
    const userDataMaterials = path.join(electronUserData, 'Workspace_Materials');
    if (isWritableDirectory(userDataMaterials)) {
      return userDataMaterials;
    }
  }

  const fallbackDir = path.join(os.homedir(), '.pbr-material-studio', 'Workspace_Materials');
  isWritableDirectory(fallbackDir);
  return fallbackDir;
}

function initCategories(targetDir) {
  for (const cat of STANDARD_CATEGORIES) {
    const catDir = path.join(targetDir, cat);
    if (!fs.existsSync(catDir)) {
      try { fs.mkdirSync(catDir, { recursive: true }); } catch (_) {}
    }
  }
}

let materialsDir = resolveMaterialsDirectory();
console.log(`[PBR Material Studio] Active Materials Storage: ${materialsDir}`);
initCategories(materialsDir);

const uploadTmpDir = path.join(os.tmpdir(), 'pbr_studio_uploads');
if (!fs.existsSync(uploadTmpDir)) {
  fs.mkdirSync(uploadTmpDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadTmpDir),
  filename: (req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, suffix + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024,
    fieldSize: 50 * 1024 * 1024,
    files: 200
  }
});

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// -----------------------------------------------------------------------------
// STATIC WORKSPACE ASSETS & VENDOR ROUTES (100% OFFLINE)
// -----------------------------------------------------------------------------

function resolveThreePath() {
  const possiblePaths = [
    path.resolve(__dirname, 'node_modules', 'three'),
    path.resolve(__dirname, 'public', 'vendor', 'three'),
    path.resolve(__dirname, 'workspaces', 'material-library', 'vendor', 'three'),
    path.resolve(process.cwd(), 'node_modules', 'three')
  ];

  if (process.resourcesPath) {
    possiblePaths.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'three'),
      path.join(process.resourcesPath, 'node_modules', 'three')
    );
  }

  try {
    const entry = require.resolve('three');
    possiblePaths.unshift(path.resolve(path.dirname(entry), '..'));
  } catch (_) {}

  for (const candidate of possiblePaths) {
    if (candidate && fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'build', 'three.module.js'))) {
      return candidate;
    }
  }

  for (const candidate of possiblePaths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(__dirname, 'node_modules', 'three');
}

const threePath = resolveThreePath();
const staticThreeOptions = {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    }
  }
};

app.use('/vendor/three', express.static(threePath, staticThreeOptions));

app.use('/vendor/three', (req, res, next) => {
  const cleanPath = req.path.replace(/^\//, '');
  const targetFile = path.join(threePath, cleanPath);
  if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
    if (targetFile.endsWith('.js') || targetFile.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    }
    return res.sendFile(targetFile);
  }
  next();
});

app.use('/workspaces/material-library/vendor/three', express.static(threePath, staticThreeOptions));
app.use('/workspaces/alchemist/vendor/three', express.static(threePath, staticThreeOptions));

function resolveJsZipPath() {
  const possiblePaths = [
    path.resolve(__dirname, 'node_modules', 'jszip'),
    path.resolve(process.cwd(), 'node_modules', 'jszip')
  ];
  if (process.resourcesPath) {
    possiblePaths.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'jszip'),
      path.join(process.resourcesPath, 'node_modules', 'jszip')
    );
  }
  return possiblePaths.find(p => p && fs.existsSync(p)) || path.resolve(__dirname, 'node_modules', 'jszip');
}

const jszipPath = resolveJsZipPath();
if (fs.existsSync(jszipPath)) {
  const jszipOpts = {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      }
    }
  };
  app.use('/vendor/jszip', express.static(jszipPath, jszipOpts));
  app.use('/workspaces/alchemist/vendor/jszip', express.static(jszipPath, jszipOpts));
}

// Serve external writable materials directory
app.use('/materials', (req, res, next) => {
  express.static(materialsDir)(req, res, next);
});

// Serve ONLY the 2 workspaces: Material Library & PBR Alchemist
app.use('/workspaces/material-library', express.static(path.join(__dirname, 'workspaces', 'material-library')));
app.use('/workspaces/alchemist', express.static(path.join(__dirname, 'workspaces', 'alchemist')));

// Serve Studio Hub
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------------------------------------------------------
// PBR TEXTURE UTILITIES
// -----------------------------------------------------------------------------

function detectPbrSuffix(filename) {
  const name = path.parse(filename).name.toLowerCase();

  if (/(?:^|[_\-\s])(ao|ambient[_\-\s]?occlusion|occlusion)(?:$|[_\-\s\d])/i.test(name)) {
    return 'ambientOcclusion';
  }
  if (/(?:^|[_\-\s])(normal|norm|nor|nrm)(?:[_\-\s]?(?:gl|dx))?(?:$|[_\-\s\d])/i.test(name)) {
    return 'normal';
  }
  if (/(?:^|[_\-\s])(roughness|rough|rgh)(?:$|[_\-\s\d])/i.test(name)) {
    return 'roughness';
  }
  if (/(?:^|[_\-\s])(metallic|metalness|metal|met)(?:$|[_\-\s\d])/i.test(name)) {
    return 'metallic';
  }
  if (/(?:^|[_\-\s])(height|displacement|disp|bump)(?:$|[_\-\s\d])/i.test(name)) {
    return 'height';
  }
  if (/(?:^|[_\-\s])(base[_\-\s]?color|albedo|diffuse|diff|color|col)(?:$|[_\-\s\d])/i.test(name)) {
    return 'baseColor';
  }

  return null;
}

function sanitizeName(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');
}

const CATEGORY_MAP = {
  'bois': 'Wood',
  'wood': 'Wood',
  'beton': 'Concrete',
  'béton': 'Concrete',
  'concrete': 'Concrete',
  'brique': 'Brick',
  'brick': 'Brick',
  'pierre': 'Stone',
  'stone': 'Stone',
  'metal': 'Metal',
  'métal': 'Metal',
  'carrelage': 'Ceramic',
  'ceramique': 'Ceramic',
  'céramique': 'Ceramic',
  'ceramic': 'Ceramic',
  'tissu': 'Fabric',
  'fabric': 'Fabric',
  'cuir': 'Leather',
  'leather': 'Leather',
  'plastique': 'Plastic',
  'plastic': 'Plastic',
  'peinture': 'Paint',
  'paint': 'Paint',
  'platre': 'Plaster',
  'plâtre': 'Plaster',
  'plaster': 'Plaster',
  'nature': 'Nature',
  'sol': 'Stone',
  'others': 'Others',
  'autre': 'Others',
  'autres': 'Others'
};

function normalizeCategory(cat) {
  if (!cat || typeof cat !== 'string') return 'Others';
  const clean = cat.trim().toLowerCase().replace(/[^a-z0-9à-ÿ]/gi, '');
  if (CATEGORY_MAP[clean]) return CATEGORY_MAP[clean];
  const match = STANDARD_CATEGORIES.find(c => c.toLowerCase() === clean);
  if (match) return match;
  return cat.trim() || 'Others';
}

// -----------------------------------------------------------------------------
// API ENDPOINTS
// -----------------------------------------------------------------------------

app.get('/api/status', (req, res) => {
  res.json({
    app: 'PBR Material Studio',
    version: '1.0.0',
    materialsStorage: materialsDir,
    categoriesCount: STANDARD_CATEGORIES.length,
    uptime: Math.round(process.uptime())
  });
});

app.get('/api/categories', (req, res) => {
  try {
    if (!fs.existsSync(materialsDir)) return res.json(STANDARD_CATEGORIES);
    const categories = fs.readdirSync(materialsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

    const set = new Set([...categories, ...STANDARD_CATEGORIES]);
    res.json(Array.from(set).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/materials', (req, res) => {
  try {
    if (!materialsDir || !fs.existsSync(materialsDir)) {
      return res.json({});
    }

    let categories = [];
    try {
      categories = fs.readdirSync(materialsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    } catch (_) {
      categories = [];
    }

    const catalog = {};

    for (const cat of categories) {
      const catPath = path.join(materialsDir, cat);
      let materialDirs = [];
      try {
        materialDirs = fs.readdirSync(catPath, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)
          .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
      } catch (_) {
        materialDirs = [];
      }

      catalog[cat] = [];

      for (const matFolder of materialDirs) {
        const matPath = path.join(catPath, matFolder);
        let files = [];
        try {
          files = fs.readdirSync(matPath, { withFileTypes: true })
            .filter(d => d.isFile())
            .map(d => d.name);
        } catch (_) {
          files = [];
        }

        const textures = {};
        let thumbnail = null;

        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (!['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp'].includes(ext)) continue;

          const webPath = `/materials/${encodeURIComponent(cat)}/${encodeURIComponent(matFolder)}/${encodeURIComponent(file)}`;
          const pbrType = detectPbrSuffix(file);

          if (pbrType && !textures[pbrType]) {
            textures[pbrType] = webPath;
          }

          const lower = file.toLowerCase();
          if (!thumbnail && (lower.includes('basecolor') || lower.includes('albedo') || lower.includes('diffuse') || lower.includes('col'))) {
            thumbnail = webPath;
          }
        }

        if (!thumbnail && files.length > 0) {
          const firstImg = files.find(f => ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(f).toLowerCase()));
          if (firstImg) {
            thumbnail = `/materials/${encodeURIComponent(cat)}/${encodeURIComponent(matFolder)}/${encodeURIComponent(firstImg)}`;
          }
        }

        if (!textures.baseColor && thumbnail) {
          textures.baseColor = thumbnail;
        }

        catalog[cat].push({
          name: matFolder,
          category: cat,
          thumbnail: thumbnail,
          textures: textures,
          fileCount: files.length
        });
      }
    }

    res.json(catalog);
  } catch (err) {
    console.error('[Materials API Error]:', err);
    res.json({});
  }
});

app.post('/api/upload-material', (req, res) => {
  req.setTimeout(120000);
  res.setTimeout(120000);

  upload.array('files', 200)(req, res, (uploadErr) => {
    const cleanupTemp = () => {
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          try {
            if (file && file.path && fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (_) {}
        }
      }
    };

    if (uploadErr) {
      cleanupTemp();
      return res.status(400).json({
        success: false,
        error: `Erreur téléversement Multer : ${uploadErr.message || uploadErr}`
      });
    }

    try {
      const files = req.files;
      if (!files || files.length === 0) {
        cleanupTemp();
        return res.status(400).json({
          success: false,
          error: 'Aucun fichier reçu'
        });
      }

      if (!isWritableDirectory(materialsDir)) {
        const recheck = resolveMaterialsDirectory();
        if (isWritableDirectory(recheck)) {
          materialsDir = recheck;
          initCategories(materialsDir);
        } else {
          cleanupTemp();
          return res.status(500).json({
            success: false,
            error: `Le répertoire de stockage des matériaux n'est pas accessible en écriture : ${materialsDir}`
          });
        }
      }

      let category = normalizeCategory(req.body.category);

      let materialName = req.body.materialName ? sanitizeName(req.body.materialName) : '';
      if (!materialName) {
        const firstName = path.parse(files[0].originalname).name;
        const stripped = firstName
          .replace(/(?:[_\-\s]?(?:base[_\-\s]?color|albedo|diffuse|diff|color|normal|norm|roughness|rough|metallic|metalness|metal|height|displacement|disp|ambient[_\-\s]?occlusion|ao)(?:[_\-\s]?(?:gl|dx))?)/gi, '')
          .replace(/(?:[_\-\s]?(?:4k|2k|1k|8k|512|1024|2048|4096))/gi, '');
        materialName = sanitizeName(stripped) || sanitizeName(firstName) || ('mat_' + Date.now());
      }

      const targetMatDir = path.join(materialsDir, category, materialName);
      if (!fs.existsSync(targetMatDir)) {
        fs.mkdirSync(targetMatDir, { recursive: true });
      }

      const processedFiles = [];
      const usedNames = new Set();

      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        const pbrType = detectPbrSuffix(file.originalname);

        let finalFileName;
        if (pbrType) {
          finalFileName = `${materialName}_${pbrType}${ext}`;
        } else {
          const rawName = path.parse(file.originalname).name;
          finalFileName = `${materialName}_${sanitizeName(rawName)}${ext}`;
        }

        if (usedNames.has(finalFileName)) {
          const parsed = path.parse(finalFileName);
          let counter = 1;
          while (usedNames.has(`${parsed.name}_${counter}${parsed.ext}`)) {
            counter++;
          }
          finalFileName = `${parsed.name}_${counter}${parsed.ext}`;
        }
        usedNames.add(finalFileName);

        const destinationPath = path.join(targetMatDir, finalFileName);
        fs.copyFileSync(file.path, destinationPath);
        try { fs.unlinkSync(file.path); } catch (_) {}

        processedFiles.push({
          original: file.originalname,
          normalized: finalFileName,
          type: pbrType || 'custom'
        });
      }

      return res.json({
        success: true,
        message: `Dossier '${materialName}' importé avec succès dans '${category}'`,
        category,
        materialName,
        files: processedFiles
      });
    } catch (err) {
      cleanupTemp();
      return res.status(500).json({
        success: false,
        error: 'Échec du traitement du dossier: ' + err.message
      });
    }
  });
});

app.post('/api/import-local-path', (req, res) => {
  try {
    const { sourcePath, category = 'Others', materialName } = req.body || {};
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return res.status(400).json({ success: false, error: 'Chemin de dossier source introuvable' });
    }

    const stat = fs.statSync(sourcePath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: 'Le chemin source doit être un dossier' });
    }

    const cleanCat = normalizeCategory(category);
    const folderBase = path.basename(sourcePath);
    const finalMatName = materialName ? sanitizeName(materialName) : (sanitizeName(folderBase) || ('mat_' + Date.now()));
    const targetMatDir = path.join(materialsDir, cleanCat, finalMatName);

    if (!fs.existsSync(targetMatDir)) {
      fs.mkdirSync(targetMatDir, { recursive: true });
    }

    const files = fs.readdirSync(sourcePath);
    const processedFiles = [];
    const usedNames = new Set();

    for (const file of files) {
      const fullSrc = path.join(sourcePath, file);
      if (!fs.statSync(fullSrc).isFile()) continue;

      const ext = path.extname(file).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp', '.exr'].includes(ext)) continue;

      const pbrType = detectPbrSuffix(file);
      let targetName = pbrType ? `${finalMatName}_${pbrType}${ext}` : `${finalMatName}_${sanitizeName(path.parse(file).name)}${ext}`;

      if (usedNames.has(targetName)) {
        const parsed = path.parse(targetName);
        let counter = 1;
        while (usedNames.has(`${parsed.name}_${counter}${parsed.ext}`)) {
          counter++;
        }
        targetName = `${parsed.name}_${counter}${parsed.ext}`;
      }
      usedNames.add(targetName);

      fs.copyFileSync(fullSrc, path.join(targetMatDir, targetName));
      processedFiles.push({ original: file, normalized: targetName, type: pbrType || 'custom' });
    }

    return res.json({
      success: true,
      message: `Dossier '${finalMatName}' importé avec succès dans '${cleanCat}' (${processedFiles.length} texture${processedFiles.length > 1 ? 's' : ''})`,
      category: cleanCat,
      materialName: finalMatName,
      files: processedFiles
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Échec import dossier: ' + err.message });
  }
});

app.post('/api/import-local-files', (req, res) => {
  try {
    const { filePaths, category = 'Others', materialName } = req.body || {};
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun fichier transmis' });
    }

    const cleanCat = normalizeCategory(category);
    let finalMatName = materialName ? sanitizeName(materialName) : '';

    if (!finalMatName) {
      const firstFile = filePaths[0];
      const firstName = path.parse(firstFile).name;
      const stripped = firstName
        .replace(/(?:[_\-\s]?(?:base[_\-\s]?color|albedo|diffuse|diff|color|normal|norm|roughness|rough|metallic|metalness|metal|height|displacement|disp|ambient[_\-\s]?occlusion|ao)(?:[_\-\s]?(?:gl|dx))?)/gi, '')
        .replace(/(?:[_\-\s]?(?:4k|2k|1k|8k|512|1024|2048|4096))/gi, '');
      finalMatName = sanitizeName(stripped) || sanitizeName(firstName) || ('mat_' + Date.now());
    }

    const targetMatDir = path.join(materialsDir, cleanCat, finalMatName);
    if (!fs.existsSync(targetMatDir)) {
      fs.mkdirSync(targetMatDir, { recursive: true });
    }

    const processedFiles = [];
    const usedNames = new Set();

    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;

      const baseOriginal = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp', '.exr'].includes(ext)) continue;

      const pbrType = detectPbrSuffix(baseOriginal);
      let targetName = pbrType ? `${finalMatName}_${pbrType}${ext}` : `${finalMatName}_${sanitizeName(path.parse(baseOriginal).name)}${ext}`;

      if (usedNames.has(targetName)) {
        const parsed = path.parse(targetName);
        let counter = 1;
        while (usedNames.has(`${parsed.name}_${counter}${parsed.ext}`)) {
          counter++;
        }
        targetName = `${parsed.name}_${counter}${parsed.ext}`;
      }
      usedNames.add(targetName);

      fs.copyFileSync(filePath, path.join(targetMatDir, targetName));
      processedFiles.push({ original: baseOriginal, normalized: targetName, type: pbrType || 'custom' });
    }

    return res.json({
      success: true,
      message: `Textures importées avec succès dans '${cleanCat}/${finalMatName}' (${processedFiles.length} fichier${processedFiles.length > 1 ? 's' : ''})`,
      category: cleanCat,
      materialName: finalMatName,
      files: processedFiles
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Échec import textures: ' + err.message });
  }
});

/**
 * POST /api/save-alchemist-material
 * Direct bridge from [02. PBR Alchemist] to [01. Material Library]
 */
app.post('/api/save-alchemist-material', (req, res) => {
  try {
    const { category = 'Concrete', materialName, maps } = req.body || {};
    if (!materialName) {
      return res.status(400).json({ success: false, error: 'Nom du matériau requis' });
    }
    if (!maps || typeof maps !== 'object') {
      return res.status(400).json({ success: false, error: 'Données de cartes PBR invalides' });
    }

    if (!isWritableDirectory(materialsDir)) {
      return res.status(500).json({
        success: false,
        error: `Le répertoire de stockage des matériaux n'est pas accessible en écriture : ${materialsDir}`
      });
    }

    const cleanCat = normalizeCategory(category);
    const cleanName = sanitizeName(materialName);
    const targetDir = path.join(materialsDir, cleanCat, cleanName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const savedFiles = [];
    const mapKeys = [
      { key: 'baseColor', suffix: '_baseColor.png' },
      { key: 'normal', suffix: '_normal.png' },
      { key: 'roughness', suffix: '_roughness.png' },
      { key: 'height', suffix: '_height.png' },
      { key: 'ambientOcclusion', suffix: '_ambientOcclusion.png' },
      { key: 'metallic', suffix: '_metallic.png' }
    ];

    for (const item of mapKeys) {
      const dataUrl = maps[item.key];
      if (dataUrl && typeof dataUrl === 'string') {
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `${cleanName}${item.suffix}`;
        fs.writeFileSync(path.join(targetDir, filename), buffer);
        savedFiles.push(filename);
      }
    }

    return res.json({
      success: true,
      message: `Matériau '${cleanName}' sauvegardé avec succès dans '${cleanCat}'`,
      category: cleanCat,
      materialName: cleanName,
      files: savedFiles
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Échec enregistrement Alchemist: ' + err.message });
  }
});

app.post('/api/rename-material', (req, res) => {
  try {
    const { category, oldName, newName } = req.body;
    if (!category || !oldName || !newName) {
      return res.status(400).json({ error: 'Champs category, oldName et newName requis' });
    }

    const cleanNewName = sanitizeName(newName);
    if (!cleanNewName) return res.status(400).json({ error: 'Nouveau nom invalide' });

    const catDir = path.join(materialsDir, category);
    const oldMatDir = path.join(catDir, oldName);
    const newMatDir = path.join(catDir, cleanNewName);

    if (!fs.existsSync(oldMatDir)) {
      return res.status(404).json({ error: `Le matériau '${oldName}' n'existe pas` });
    }
    if (oldName !== cleanNewName && fs.existsSync(newMatDir)) {
      return res.status(400).json({ error: `Un matériau nommé '${cleanNewName}' existe déjà dans '${category}'` });
    }

    const files = fs.readdirSync(oldMatDir);
    const renamedFiles = [];

    for (const file of files) {
      const oldFilePath = path.join(oldMatDir, file);
      if (!fs.statSync(oldFilePath).isFile()) continue;

      const ext = path.extname(file);
      let targetFileName = file;
      const lowerFile = file.toLowerCase();
      const lowerOld = oldName.toLowerCase();

      if (lowerFile.startsWith(lowerOld + '_') || lowerFile.startsWith(lowerOld)) {
        targetFileName = cleanNewName + file.slice(oldName.length);
      } else {
        const pbrType = detectPbrSuffix(file);
        targetFileName = pbrType ? `${cleanNewName}_${pbrType}${ext}` : `${cleanNewName}_${file}`;
      }

      const newFilePath = path.join(oldMatDir, targetFileName);
      if (oldFilePath !== newFilePath) {
        fs.renameSync(oldFilePath, newFilePath);
      }
      renamedFiles.push({ old: file, new: targetFileName });
    }

    if (oldMatDir !== newMatDir) {
      fs.renameSync(oldMatDir, newMatDir);
    }

    res.json({
      success: true,
      message: `Matériau renommé de '${oldName}' vers '${cleanNewName}'`,
      category,
      oldName,
      newName: cleanNewName,
      renamedFiles
    });
  } catch (err) {
    res.status(500).json({ error: 'Échec du renommage: ' + err.message });
  }
});

app.get('/api/open-folder', (req, res) => {
  try {
    const { category, folder } = req.query;
    let targetDir = materialsDir;

    if (category && folder) {
      targetDir = path.resolve(materialsDir, category, folder);
    } else if (category) {
      targetDir = path.resolve(materialsDir, category);
    }

    if (!fs.existsSync(targetDir)) {
      targetDir = materialsDir;
    }

    const windowsPath = targetDir.replace(/\//g, '\\');
    if (process.platform === 'win32') {
      exec(`explorer.exe "${windowsPath}"`, (err) => {
        if (err) console.error('Erreur explorer.exe:', err);
      });
    } else {
      const cmd = process.platform === 'darwin' ? `open "${targetDir}"` : `xdg-open "${targetDir}"`;
      exec(cmd);
    }

    res.json({ success: true, path: targetDir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error('[PBR Material Studio Error]:', err);
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Erreur interne du serveur'
  });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  PBR MATERIAL STUDIO — Backend Server Ready`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Materials: ${materialsDir}`);
  console.log(`=======================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[PBR Material Studio] Port ${PORT} already active, continuing...`);
  } else {
    console.error('[PBR Material Studio Server Error]:', err);
  }
});

module.exports = {
  app,
  server,
  materialsDir,
  getMaterialsDir: () => materialsDir
};

