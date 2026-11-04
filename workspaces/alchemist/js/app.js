/**
 * PBR Alchemist Studio - Main Application Controller
 */

import { SeamlessEngine } from './engine/seamless.js';
import { PBRGenerator } from './engine/pbr-generator.js';
import { Viewport3D } from './engine/viewport3d.js';

class PBRAlchemistApp {
  constructor() {
    this.sourceImage = null;
    this.resolution = 2048;
    this.activeMapTab = 'baseColor';

    // Generated Canvases
    this.canvases = {
      cropped: null,
      seamless: null,
      baseColor: null,
      normal: null,
      roughness: null,
      height: null,
      ao: null,
      grid2x2: null,
      split4: null
    };

    // State Parameters
    this.params = {
      seamless: { enabled: true, smoothness: 35 },
      delighter: { amount: 40 },
      baseColor: { brightness: 0, contrast: 0, saturation: 100 },
      normal: { strength: 2.5, blur: 1.0, invertY: false },
      height: { minLevel: 0, maxLevel: 255, gamma: 1.0, blur: 1.5, invert: false },
      roughness: { baseRoughness: 0.60, contrast: 1.0, invert: false, cavityBoost: 0.25 },
      ao: { intensity: 65, radius: 6 },
      viewport3d: {
        mesh: 'sphere',
        uvRepeat: 1.0,
        displacement: 0.04,
        metalness: 0.0,
        turntableLight: false,
        autoRotateMesh: false,
        wireframe: false
      },
      export: {
        materialName: 'Beton_Brut_01',
        category: 'Concrete',
        outputDir: ''
      }
    };

    // 2D Canvas transform (Pan & Zoom)
    this.view2D = {
      scale: 1.0,
      panX: 0,
      panY: 0,
      isPanning: false,
      startX: 0,
      startY: 0,
      showSeamGuide: true
    };

    this.viewport3D = null;
    this.updatePending = false;
    this.lastExportFolder = '';
    window.alchemistApp = this;

    this.init();
  }

  async init() {
    this.initDOM();
    this.init3DViewport();
    this.initEvents();
    await this.initDefaultExportDir();

    // Load initial sample texture
    await this.loadSampleTexture('sample_concrete.jpg', 'Beton_Brut_01', 'Concrete');
  }

  initDOM() {
    this.dom = {
      // Header
      resPillGroup: document.getElementById('resPillGroup'),
      presetSelect: document.getElementById('presetSelect'),
      sampleChips: document.querySelectorAll('.sample-chip'),
      btnImport: document.getElementById('btnImport'),
      fileInput: document.getElementById('fileInput'),

      // 2D Inspector
      inspectorTabs: document.getElementById('inspectorTabs'),
      canvasContainer: document.getElementById('canvasContainer'),
      inspectorCanvas: document.getElementById('inspectorCanvas'),
      seamGuide: document.getElementById('seamGuide'),
      canvasDimBadge: document.getElementById('canvasDimBadge'),
      zoomLevelTag: document.getElementById('zoomLevelTag'),
      btnZoomIn: document.getElementById('btnZoomIn'),
      btnZoomOut: document.getElementById('btnZoomOut'),
      btnZoom100: document.getElementById('btnZoom100'),
      btnZoomFit: document.getElementById('btnZoomFit'),
      btnToggleSeamGuide: document.getElementById('btnToggleSeamGuide'),

      // 3D Viewport Controls
      meshPillGroup: document.getElementById('meshPillGroup'),
      btnTurntableLight: document.getElementById('btnTurntableLight'),
      btnAutoRotateMesh: document.getElementById('btnAutoRotateMesh'),
      btnWireframe: document.getElementById('btnWireframe'),
      btnResetCam: document.getElementById('btnResetCam'),
      sliderUVRepeat: document.getElementById('sliderUVRepeat'),
      valUVRepeat: document.getElementById('valUVRepeat'),
      sliderDisplacement: document.getElementById('sliderDisplacement'),
      valDisplacement: document.getElementById('valDisplacement'),
      sliderMetalness: document.getElementById('sliderMetalness'),
      valMetalness: document.getElementById('valMetalness'),

      // Sliders & Toggles
      chkSeamless: document.getElementById('chkSeamless'),
      sliderSmoothness: document.getElementById('sliderSmoothness'),
      valSmoothness: document.getElementById('valSmoothness'),
      sliderDelighter: document.getElementById('sliderDelighter'),
      valDelighter: document.getElementById('valDelighter'),

      sliderBrightness: document.getElementById('sliderBrightness'),
      sliderContrast: document.getElementById('sliderContrast'),
      valBrightnessContrast: document.getElementById('valBrightnessContrast'),
      sliderSaturation: document.getElementById('sliderSaturation'),
      valSaturation: document.getElementById('valSaturation'),

      sliderNormalStrength: document.getElementById('sliderNormalStrength'),
      valNormalStrength: document.getElementById('valNormalStrength'),
      sliderNormalBlur: document.getElementById('sliderNormalBlur'),
      valNormalBlur: document.getElementById('valNormalBlur'),
      btnNormOpenGL: document.getElementById('btnNormOpenGL'),
      btnNormDirectX: document.getElementById('btnNormDirectX'),

      sliderAOIntensity: document.getElementById('sliderAOIntensity'),
      valAOIntensity: document.getElementById('valAOIntensity'),
      sliderAORadius: document.getElementById('sliderAORadius'),
      valAORadius: document.getElementById('valAORadius'),

      sliderHeightMin: document.getElementById('sliderHeightMin'),
      sliderHeightMax: document.getElementById('sliderHeightMax'),
      valHeightLevels: document.getElementById('valHeightLevels'),
      sliderHeightGamma: document.getElementById('sliderHeightGamma'),
      sliderHeightBlur: document.getElementById('sliderHeightBlur'),
      valHeightGammaBlur: document.getElementById('valHeightGammaBlur'),
      chkHeightInvert: document.getElementById('chkHeightInvert'),

      sliderRoughnessBase: document.getElementById('sliderRoughnessBase'),
      sliderRoughnessContrast: document.getElementById('sliderRoughnessContrast'),
      valRoughnessBase: document.getElementById('valRoughnessBase'),
      chkRoughnessInvert: document.getElementById('chkRoughnessInvert'),

      // Export
      exportMaterialName: document.getElementById('exportMaterialName'),
      exportCategory: document.getElementById('exportCategory'),
      exportDirPath: document.getElementById('exportDirPath'),
      btnBrowseDir: document.getElementById('btnBrowseDir'),
      btnExportPack: document.getElementById('btnExportPack'),
      btnExportZip: document.getElementById('btnExportZip'),
      btnOpenFolder: document.getElementById('btnOpenFolder'),
      lblBaseColorName: document.getElementById('lblBaseColorName'),
      lblNormalName: document.getElementById('lblNormalName'),
      lblRoughnessName: document.getElementById('lblRoughnessName'),
      lblHeightName: document.getElementById('lblHeightName'),
      lblAOName: document.getElementById('lblAOName'),

      // Drag overlay & Toasts
      dropOverlay: document.getElementById('dropOverlay'),
      toastContainer: document.getElementById('toastContainer')
    };
  }

  init3DViewport() {
    const container = document.getElementById('threeViewport');
    this.viewport3D = new Viewport3D(container);
  }

  async initDefaultExportDir() {
    if (window.alchemistAPI && window.alchemistAPI.getDefaultExportDir) {
      try {
        const defaultDir = await window.alchemistAPI.getDefaultExportDir();
        this.params.export.outputDir = defaultDir;
        this.dom.exportDirPath.value = defaultDir;
      } catch (e) {
        console.warn('Could not get default export dir from electron:', e);
      }
    }
  }

  // ==================== EVENT LISTENERS ====================
  initEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    // Resolution buttons
    this.dom.resPillGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-btn');
      if (!btn) return;
      this.dom.resPillGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.resolution = parseInt(btn.dataset.res, 10);
      this.dom.canvasDimBadge.textContent = `${this.resolution} × ${this.resolution}`;
      this.processFullPipeline();
    });

    // Sample chips
    this.dom.sampleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const sampleFile = chip.dataset.sample;
        console.log(`Bouton cliqué : [PBR Alchemist] Échantillon de démonstration : ${sampleFile}`);
        this.dom.sampleChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        let matName = 'Beton_Brut_01';
        let cat = 'Beton';
        if (sampleFile.includes('wood')) {
          matName = 'Planches_Chene_01';
          cat = 'Bois';
          this.applyPreset('wood');
        } else if (sampleFile.includes('stone')) {
          matName = 'Paves_Granit_01';
          cat = 'Pierre';
          this.applyPreset('stone');
        } else {
          this.applyPreset('concrete');
        }
        this.loadSampleTexture(sampleFile, matName, cat);
      });
    });

    // Preset selector
    this.dom.presetSelect.addEventListener('change', (e) => {
      console.log(`Bouton cliqué : [PBR Alchemist] Préréglage matériau : ${e.target.value}`);
      this.applyPreset(e.target.value);
    });

    // Import Photo button (unique idempotent binding)
    if (this.dom.btnImport && !this.dom.btnImport.dataset.alchBound) {
      this.dom.btnImport.dataset.alchBound = 'true';
      this.dom.btnImport.addEventListener('click', async (e) => {
        e.stopPropagation();
        console.log('Bouton cliqué : [PBR Alchemist] Importer photo source');
        if (window.alchemistAPI && window.alchemistAPI.openImageFile) {
          try {
            const res = await window.alchemistAPI.openImageFile();
            if (res && res.dataUrl) {
              this.loadCustomImage(res.dataUrl, res.name);
            }
          } catch (err) {
            console.error(err);
          }
        } else if (this.dom.fileInput) {
          this.dom.fileInput.click();
        }
      });
    }

    if (this.dom.fileInput && !this.dom.fileInput.dataset.alchBound) {
      this.dom.fileInput.dataset.alchBound = 'true';
      this.dom.fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        reader.onload = (evt) => {
          this.loadCustomImage(evt.target.result, baseName);
        };
        reader.readAsDataURL(file);
        this.dom.fileInput.value = '';
      });
    }

    // Drag and Drop
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dom.dropOverlay.classList.add('active');
    });

    this.dom.dropOverlay.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null) {
        this.dom.dropOverlay.classList.remove('active');
      }
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dom.dropOverlay.classList.remove('active');
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          reader.onload = (evt) => {
            this.loadCustomImage(evt.target.result, baseName);
          };
          reader.readAsDataURL(file);
        }
      }
    });

    // 2D Inspector Tabs
    this.dom.inspectorTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      this.dom.inspectorTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.activeMapTab = btn.dataset.map;
      this.render2DInspector();
    });

    // 2D Pan and Zoom
    this.setup2DPanZoom();

    // 3D Mesh Selector
    this.dom.meshPillGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-btn');
      if (!btn) return;
      this.dom.meshPillGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.params.viewport3d.mesh = btn.dataset.mesh;
      this.viewport3D.setMeshType(btn.dataset.mesh);
    });

    // 3D Viewport Controls
    this.dom.btnTurntableLight.addEventListener('click', () => {
      console.log('Bouton cliqué : [PBR Alchemist] Rotation lumière');
      this.params.viewport3d.turntableLight = !this.params.viewport3d.turntableLight;
      this.dom.btnTurntableLight.classList.toggle('active', this.params.viewport3d.turntableLight);
      this.viewport3D.setLightRotationSpeed(this.params.viewport3d.turntableLight ? 0.6 : 0);
    });

    this.dom.btnAutoRotateMesh.addEventListener('click', () => {
      console.log('Bouton cliqué : [PBR Alchemist] Rotation maillage 3D');
      this.params.viewport3d.autoRotateMesh = !this.params.viewport3d.autoRotateMesh;
      this.dom.btnAutoRotateMesh.classList.toggle('active', this.params.viewport3d.autoRotateMesh);
      this.viewport3D.setAutoRotateMesh(this.params.viewport3d.autoRotateMesh);
    });

    this.dom.btnWireframe.addEventListener('click', () => {
      console.log('Bouton cliqué : [PBR Alchemist] Mode filaire');
      this.params.viewport3d.wireframe = !this.params.viewport3d.wireframe;
      this.dom.btnWireframe.classList.toggle('active', this.params.viewport3d.wireframe);
      this.viewport3D.setWireframe(this.params.viewport3d.wireframe);
    });

    this.dom.btnResetCam.addEventListener('click', () => {
      console.log('Bouton cliqué : [PBR Alchemist] Réinitialiser caméra 3D');
      this.viewport3D.resetCamera();
    });

    // 3D Sliders
    this.dom.sliderUVRepeat.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.dom.valUVRepeat.textContent = `${v.toFixed(1)}x`;
      this.viewport3D.setUVRepeat(v);
      if (this.activeMapTab === 'grid2x2') this.render2DInspector();
    });

    this.dom.sliderDisplacement.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.dom.valDisplacement.textContent = v.toFixed(2);
      this.viewport3D.setDisplacementScale(v);
    });

    this.dom.sliderMetalness.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.dom.valMetalness.textContent = v.toFixed(2);
      this.viewport3D.setMetalness(v);
    });

    // PBR Sliders & Toggles Bindings
    this.bindPBRSliders();

    // Export Inputs & Buttons
    this.dom.exportMaterialName.addEventListener('input', () => this.updateExportNamingPreview());
    this.dom.btnBrowseDir.addEventListener('click', () => {
      console.log('Bouton cliqué : [PBR Alchemist] Parcourir dossier export');
      this.browseExportDir();
    });
    this.dom.btnExportPack.addEventListener('click', () => {
      console.log('Bouton cliqué : [PBR Alchemist] Exporter textures PBR (Disque)');
      this.executeDiskExport();
    });
    this.dom.btnExportZip.addEventListener('click', () => {
      console.log('Bouton cliqué : [PBR Alchemist] Exporter archive ZIP');
      this.executeZipExport();
    });
    this.dom.btnOpenFolder.addEventListener('click', () => {
      console.log('Bouton cliqué : [PBR Alchemist] Ouvrir dossier export');
      if (this.lastExportFolder && window.alchemistAPI && window.alchemistAPI.openFolder) {
        window.alchemistAPI.openFolder(this.lastExportFolder);
      }
    });

    this.updateExportNamingPreview();
  }

  bindPBRSliders() {
    const onParamChange = () => {
      this.scheduleProcessing();
    };

    // Seamless & Delighter
    this.dom.chkSeamless.addEventListener('change', (e) => {
      this.params.seamless.enabled = e.target.checked;
      onParamChange();
    });

    this.dom.sliderSmoothness.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.params.seamless.smoothness = v;
      this.dom.valSmoothness.textContent = `${v} %`;
      onParamChange();
    });

    this.dom.sliderDelighter.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.params.delighter.amount = v;
      this.dom.valDelighter.textContent = `${v} %`;
      onParamChange();
    });

    // BaseColor
    this.dom.sliderBrightness.addEventListener('input', (e) => {
      this.params.baseColor.brightness = parseInt(e.target.value, 10);
      this.updateBCDisplay();
      onParamChange();
    });

    this.dom.sliderContrast.addEventListener('input', (e) => {
      this.params.baseColor.contrast = parseInt(e.target.value, 10);
      this.updateBCDisplay();
      onParamChange();
    });

    this.dom.sliderSaturation.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.params.baseColor.saturation = v;
      this.dom.valSaturation.textContent = `${v} %`;
      onParamChange();
    });

    // Normal Map
    this.dom.sliderNormalStrength.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.params.normal.strength = v;
      this.dom.valNormalStrength.textContent = `${v.toFixed(1)}×`;
      onParamChange();
    });

    this.dom.sliderNormalBlur.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.params.normal.blur = v;
      this.dom.valNormalBlur.textContent = `${v.toFixed(1)} px`;
      onParamChange();
    });

    this.dom.btnNormOpenGL.addEventListener('click', () => {
      this.params.normal.invertY = false;
      this.dom.btnNormOpenGL.classList.add('active');
      this.dom.btnNormDirectX.classList.remove('active');
      onParamChange();
    });

    this.dom.btnNormDirectX.addEventListener('click', () => {
      this.params.normal.invertY = true;
      this.dom.btnNormDirectX.classList.add('active');
      this.dom.btnNormOpenGL.classList.remove('active');
      onParamChange();
    });

    // AO
    this.dom.sliderAOIntensity.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.params.ao.intensity = v;
      this.dom.valAOIntensity.textContent = `${v} %`;
      onParamChange();
    });

    this.dom.sliderAORadius.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      this.params.ao.radius = v;
      this.dom.valAORadius.textContent = `${v} px`;
      onParamChange();
    });

    // Height
    this.dom.sliderHeightMin.addEventListener('input', (e) => {
      this.params.height.minLevel = parseInt(e.target.value, 10);
      this.updateHeightLevelsDisplay();
      onParamChange();
    });

    this.dom.sliderHeightMax.addEventListener('input', (e) => {
      this.params.height.maxLevel = parseInt(e.target.value, 10);
      this.updateHeightLevelsDisplay();
      onParamChange();
    });

    this.dom.sliderHeightGamma.addEventListener('input', (e) => {
      this.params.height.gamma = parseFloat(e.target.value);
      this.updateHeightGammaBlurDisplay();
      onParamChange();
    });

    this.dom.sliderHeightBlur.addEventListener('input', (e) => {
      this.params.height.blur = parseFloat(e.target.value);
      this.updateHeightGammaBlurDisplay();
      onParamChange();
    });

    this.dom.chkHeightInvert.addEventListener('change', (e) => {
      this.params.height.invert = e.target.checked;
      onParamChange();
    });

    // Roughness
    this.dom.sliderRoughnessBase.addEventListener('input', (e) => {
      this.params.roughness.baseRoughness = parseFloat(e.target.value);
      this.updateRoughnessDisplay();
      onParamChange();
    });

    this.dom.sliderRoughnessContrast.addEventListener('input', (e) => {
      this.params.roughness.contrast = parseFloat(e.target.value);
      this.updateRoughnessDisplay();
      onParamChange();
    });

    this.dom.chkRoughnessInvert.addEventListener('change', (e) => {
      this.params.roughness.invert = e.target.checked;
      onParamChange();
    });
  }

  updateBCDisplay() {
    this.dom.valBrightnessContrast.textContent = `${this.params.baseColor.brightness} / ${this.params.baseColor.contrast}`;
  }

  updateHeightLevelsDisplay() {
    this.dom.valHeightLevels.textContent = `${this.params.height.minLevel} / ${this.params.height.maxLevel}`;
  }

  updateHeightGammaBlurDisplay() {
    this.dom.valHeightGammaBlur.textContent = `${this.params.height.gamma.toFixed(1)} / ${this.params.height.blur.toFixed(1)}px`;
  }

  updateRoughnessDisplay() {
    this.dom.valRoughnessBase.textContent = `${this.params.roughness.baseRoughness.toFixed(2)} / ${this.params.roughness.contrast.toFixed(1)}`;
  }

  setup2DPanZoom() {
    const container = this.dom.canvasContainer;
    const canvas = this.dom.inspectorCanvas;

    const applyTransform = () => {
      canvas.style.transform = `translate(${this.view2D.panX}px, ${this.view2D.panY}px) scale(${this.view2D.scale})`;
      this.dom.zoomLevelTag.textContent = `${Math.round(this.view2D.scale * 100)}%`;
      this.updateSeamGuide();
    };

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      this.view2D.scale = Math.max(0.2, Math.min(6.0, this.view2D.scale * zoomFactor));
      applyTransform();
    }, { passive: false });

    container.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 1) { // Left or Middle click
        this.view2D.isPanning = true;
        this.view2D.startX = e.clientX - this.view2D.panX;
        this.view2D.startY = e.clientY - this.view2D.panY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.view2D.isPanning) return;
      this.view2D.panX = e.clientX - this.view2D.startX;
      this.view2D.panY = e.clientY - this.view2D.startY;
      applyTransform();
    });

    window.addEventListener('mouseup', () => {
      this.view2D.isPanning = false;
    });

    // Toolbar buttons
    this.dom.btnZoomIn.addEventListener('click', () => {
      this.view2D.scale = Math.min(6.0, this.view2D.scale * 1.25);
      applyTransform();
    });

    this.dom.btnZoomOut.addEventListener('click', () => {
      this.view2D.scale = Math.max(0.2, this.view2D.scale * 0.8);
      applyTransform();
    });

    this.dom.btnZoom100.addEventListener('click', () => {
      this.view2D.scale = 1.0;
      this.view2D.panX = 0;
      this.view2D.panY = 0;
      applyTransform();
    });

    this.dom.btnZoomFit.addEventListener('click', () => {
      this.view2D.panX = 0;
      this.view2D.panY = 0;
      this.view2D.scale = 0.85;
      applyTransform();
    });

    this.dom.btnToggleSeamGuide.addEventListener('click', () => {
      this.view2D.showSeamGuide = !this.view2D.showSeamGuide;
      this.dom.btnToggleSeamGuide.classList.toggle('active', this.view2D.showSeamGuide);
      this.updateSeamGuide();
    });
  }

  updateSeamGuide() {
    const guide = this.dom.seamGuide;
    const canvas = this.dom.inspectorCanvas;
    if (!this.view2D.showSeamGuide || this.activeMapTab !== 'grid2x2') {
      guide.classList.remove('visible');
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const contRect = this.dom.canvasContainer.getBoundingClientRect();

    guide.classList.add('visible');
    guide.style.width = `${rect.width}px`;
    guide.style.height = `${rect.height}px`;
    guide.style.left = `${rect.left - contRect.left + rect.width / 2}px`;
    guide.style.top = `${rect.top - contRect.top + rect.height / 2}px`;
  }

  // ==================== IMAGE LOADING ====================
  async loadSampleTexture(sampleFileName, defaultName = 'Beton_Brut_01', category = 'Concrete') {
    console.log('[App] Loading sample texture:', sampleFileName);
    let dataUrl = `samples/${sampleFileName}`;
    if (window.alchemistAPI && window.alchemistAPI.loadSampleImage) {
      try {
        const res = await window.alchemistAPI.loadSampleImage(sampleFileName);
        if (res && res.dataUrl) {
          dataUrl = res.dataUrl;
          console.log('[App] Sample loaded via IPC, dataUrl length:', dataUrl.length);
        }
      } catch (err) {
        console.warn('Fallback to relative path for sample:', err);
      }
    }

    const img = new Image();
    img.onload = () => {
      console.log('[App] Image onload fired successfully. Dimensions:', img.naturalWidth, img.naturalHeight);
      this.sourceImage = img;
      this.params.export.materialName = defaultName;
      this.params.export.category = category;
      this.dom.exportMaterialName.value = defaultName;
      this.dom.exportCategory.value = category;
      this.updateExportNamingPreview();
      this.processFullPipeline();
    };
    img.onerror = (e) => {
      console.error('[App] Failed to load sample image:', sampleFileName, e);
    };
    img.src = dataUrl;
  }

  loadCustomImage(dataUrl, name) {
    const img = new Image();
    img.onload = () => {
      this.sourceImage = img;
      // Sanitize name for material
      const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      this.params.export.materialName = cleanName;
      this.dom.exportMaterialName.value = cleanName;
      this.updateExportNamingPreview();
      this.processFullPipeline();
      this.showToast(`Image "${cleanName}" importée avec succès !`, 'success');
    };
    img.src = dataUrl;
  }

  // ==================== PRESETS ====================
  applyPreset(presetKey) {
    switch (presetKey) {
      case 'concrete':
        this.params.delighter.amount = 40;
        this.params.seamless.smoothness = 35;
        this.params.normal.strength = 2.8;
        this.params.normal.blur = 0.5;
        this.params.height.minLevel = 0;
        this.params.height.maxLevel = 255;
        this.params.height.blur = 1.2;
        this.params.roughness.baseRoughness = 0.70;
        this.params.roughness.contrast = 1.1;
        this.params.roughness.invert = false;
        this.params.ao.intensity = 65;
        this.params.ao.radius = 6;
        this.dom.sliderMetalness.value = 0.0;
        this.viewport3D.setMetalness(0.0);
        break;

      case 'wood':
        this.params.delighter.amount = 30;
        this.params.seamless.smoothness = 40;
        this.params.normal.strength = 2.0;
        this.params.normal.blur = 1.0;
        this.params.height.minLevel = 15;
        this.params.height.maxLevel = 240;
        this.params.height.blur = 1.5;
        this.params.roughness.baseRoughness = 0.45;
        this.params.roughness.contrast = 0.9;
        this.params.roughness.invert = true;
        this.params.ao.intensity = 55;
        this.params.ao.radius = 5;
        this.dom.sliderMetalness.value = 0.0;
        this.viewport3D.setMetalness(0.0);
        break;

      case 'stone':
        this.params.delighter.amount = 45;
        this.params.seamless.smoothness = 35;
        this.params.normal.strength = 4.0;
        this.params.normal.blur = 1.0;
        this.params.height.minLevel = 0;
        this.params.height.maxLevel = 255;
        this.params.height.blur = 2.0;
        this.params.roughness.baseRoughness = 0.80;
        this.params.roughness.contrast = 1.3;
        this.params.roughness.invert = false;
        this.params.ao.intensity = 80;
        this.params.ao.radius = 10;
        this.dom.sliderMetalness.value = 0.0;
        this.viewport3D.setMetalness(0.0);
        break;

      case 'metal':
        this.params.delighter.amount = 50;
        this.params.seamless.smoothness = 30;
        this.params.normal.strength = 1.6;
        this.params.normal.blur = 0.5;
        this.params.height.minLevel = 0;
        this.params.height.maxLevel = 255;
        this.params.height.blur = 0.8;
        this.params.roughness.baseRoughness = 0.28;
        this.params.roughness.contrast = 1.4;
        this.params.roughness.invert = false;
        this.params.ao.intensity = 45;
        this.params.ao.radius = 4;
        this.dom.sliderMetalness.value = 0.85;
        this.viewport3D.setMetalness(0.85);
        break;

      case 'ceramic':
        this.params.delighter.amount = 35;
        this.params.seamless.smoothness = 30;
        this.params.normal.strength = 1.8;
        this.params.normal.blur = 0.5;
        this.params.height.minLevel = 10;
        this.params.height.maxLevel = 250;
        this.params.height.blur = 1.0;
        this.params.roughness.baseRoughness = 0.18;
        this.params.roughness.contrast = 0.8;
        this.params.roughness.invert = false;
        this.params.ao.intensity = 70;
        this.params.ao.radius = 6;
        this.dom.sliderMetalness.value = 0.05;
        this.viewport3D.setMetalness(0.05);
        break;
    }

    // Reflect to DOM inputs
    this.dom.sliderDelighter.value = this.params.delighter.amount;
    this.dom.valDelighter.textContent = `${this.params.delighter.amount} %`;
    this.dom.sliderSmoothness.value = this.params.seamless.smoothness;
    this.dom.valSmoothness.textContent = `${this.params.seamless.smoothness} %`;
    this.dom.sliderNormalStrength.value = this.params.normal.strength;
    this.dom.valNormalStrength.textContent = `${this.params.normal.strength.toFixed(1)}×`;
    this.dom.sliderNormalBlur.value = this.params.normal.blur;
    this.dom.valNormalBlur.textContent = `${this.params.normal.blur.toFixed(1)} px`;
    this.dom.sliderAOIntensity.value = this.params.ao.intensity;
    this.dom.valAOIntensity.textContent = `${this.params.ao.intensity} %`;
    this.dom.sliderAORadius.value = this.params.ao.radius;
    this.dom.valAORadius.textContent = `${this.params.ao.radius} px`;
    this.dom.sliderHeightMin.value = this.params.height.minLevel;
    this.dom.sliderHeightMax.value = this.params.height.maxLevel;
    this.updateHeightLevelsDisplay();
    this.dom.sliderHeightBlur.value = this.params.height.blur;
    this.updateHeightGammaBlurDisplay();
    this.dom.sliderRoughnessBase.value = this.params.roughness.baseRoughness;
    this.dom.sliderRoughnessContrast.value = this.params.roughness.contrast;
    this.dom.chkRoughnessInvert.checked = this.params.roughness.invert;
    this.updateRoughnessDisplay();

    this.processFullPipeline();
  }

  // ==================== PIPELINE EXECUTION ====================
  scheduleProcessing() {
    if (this.updatePending) return;
    this.updatePending = true;
    requestAnimationFrame(() => {
      this.processFullPipeline();
      this.updatePending = false;
    });
  }

  processFullPipeline() {
    if (!this.sourceImage) return;

    const res = this.resolution;

    // 1. Crop to square & resize
    this.canvases.cropped = SeamlessEngine.cropAndResize(this.sourceImage, res);

    // 2. Make Seamless (Quadrant offset + progressive cross-dissolve)
    this.canvases.seamless = SeamlessEngine.makeSeamless(this.canvases.cropped, {
      enabled: this.params.seamless.enabled,
      smoothness: this.params.seamless.smoothness
    });

    // 3. Delighter (illumination equalization)
    const delightedCanvas = SeamlessEngine.applyDelighter(this.canvases.seamless, this.params.delighter.amount);

    // 4. BaseColor (Albedo) with Brightness, Contrast, Saturation
    this.canvases.baseColor = PBRGenerator.generateBaseColor(delightedCanvas, this.params.baseColor);

    // 5. Normal Map (Sobel 3x3)
    this.canvases.normal = PBRGenerator.generateNormalMap(this.canvases.seamless, this.params.normal);

    // 6. Height / Displacement Map
    this.canvases.height = PBRGenerator.generateHeightMap(this.canvases.seamless, this.params.height);

    // 7. Ambient Occlusion (AO)
    this.canvases.ao = PBRGenerator.generateAmbientOcclusion(this.canvases.seamless, this.params.ao);

    // 8. Roughness Map (with cavity boost from AO)
    this.canvases.roughness = PBRGenerator.generateRoughnessMap(this.canvases.seamless, this.canvases.ao, this.params.roughness);

    // Update 2D Inspector View
    this.render2DInspector();

    // Update 3D Three.js Viewport
    this.viewport3D.updateTextures({
      baseColor: this.canvases.baseColor,
      normal: this.canvases.normal,
      roughness: this.canvases.roughness,
      height: this.canvases.height,
      ao: this.canvases.ao
    });
  }

  render2DInspector() {
    const canvas = this.dom.inspectorCanvas;
    const ctx = canvas.getContext('2d');
    const res = this.resolution;

    let sourceToDraw = null;

    if (this.activeMapTab === 'grid2x2') {
      // 2x2 Tiling test mode!
      if (!this.canvases.grid2x2 || this.canvases.grid2x2.width !== res) {
        this.canvases.grid2x2 = document.createElement('canvas');
        this.canvases.grid2x2.width = res;
        this.canvases.grid2x2.height = res;
      }
      const gCtx = this.canvases.grid2x2.getContext('2d');
      const tile = this.canvases.baseColor;
      const half = res / 2;

      // Draw 4 tiles
      gCtx.drawImage(tile, 0, 0, half, half);
      gCtx.drawImage(tile, half, 0, half, half);
      gCtx.drawImage(tile, 0, half, half, half);
      gCtx.drawImage(tile, half, half, half, half);

      sourceToDraw = this.canvases.grid2x2;
    } else if (this.activeMapTab === 'split4') {
      // Split 4 Channels View
      if (!this.canvases.split4 || this.canvases.split4.width !== res) {
        this.canvases.split4 = document.createElement('canvas');
        this.canvases.split4.width = res;
        this.canvases.split4.height = res;
      }
      const sCtx = this.canvases.split4.getContext('2d');
      const half = res / 2;

      sCtx.drawImage(this.canvases.baseColor, 0, 0, half, half);
      sCtx.drawImage(this.canvases.normal, half, 0, half, half);
      sCtx.drawImage(this.canvases.roughness, 0, half, half, half);
      sCtx.drawImage(this.canvases.height, half, half, half, half);

      // Channel labels
      sCtx.fillStyle = 'rgba(0,0,0,0.6)';
      sCtx.fillRect(10, 10, 100, 24);
      sCtx.fillRect(half + 10, 10, 90, 24);
      sCtx.fillRect(10, half + 10, 105, 24);
      sCtx.fillRect(half + 10, half + 10, 80, 24);

      sCtx.fillStyle = '#ffffff';
      sCtx.font = 'bold 12px Inter, sans-serif';
      sCtx.fillText('BaseColor', 20, 26);
      sCtx.fillText('Normal', half + 20, 26);
      sCtx.fillText('Roughness', 20, half + 26);
      sCtx.fillText('Height', half + 20, half + 26);

      sourceToDraw = this.canvases.split4;
    } else {
      sourceToDraw = this.canvases[this.activeMapTab] || this.canvases.baseColor;
    }

    if (!sourceToDraw) return;

    canvas.width = sourceToDraw.width;
    canvas.height = sourceToDraw.height;
    ctx.drawImage(sourceToDraw, 0, 0);

    this.updateSeamGuide();
  }

  // ==================== EXPORT SYSTEM ====================
  updateExportNamingPreview() {
    let name = this.dom.exportMaterialName.value.trim() || 'Mon_Materiau';
    // Clean name for files
    name = name.replace(/[^a-zA-Z0-9_-]/g, '_');

    this.dom.lblBaseColorName.textContent = `${name}_baseColor.png`;
    this.dom.lblNormalName.textContent = `${name}_normal.png`;
    this.dom.lblRoughnessName.textContent = `${name}_roughness.png`;
    this.dom.lblHeightName.textContent = `${name}_height.png`;
    this.dom.lblAOName.textContent = `${name}_ambientOcclusion.png`;
  }

  async browseExportDir() {
    if (window.alchemistAPI && window.alchemistAPI.selectDirectory) {
      try {
        const selected = await window.alchemistAPI.selectDirectory(this.params.export.outputDir);
        if (selected) {
          this.params.export.outputDir = selected;
          this.dom.exportDirPath.value = selected;
          this.showToast(`Dossier défini : ${selected}`, 'success');
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  async executeDiskExport() {
    const materialName = (this.dom.exportMaterialName.value.trim() || 'Materiau_PBR').replace(/[^a-zA-Z0-9_-]/g, '_');
    const category = this.dom.exportCategory.value.trim() || 'General';
    const outputDir = this.dom.exportDirPath.value.trim() || this.params.export.outputDir;

    if (!outputDir) {
      this.showToast("Veuillez d'abord sélectionner un dossier de destination.", 'error');
      return;
    }

    this.dom.btnExportPack.disabled = true;
    this.dom.btnExportPack.textContent = 'Génération en cours...';

    try {
      // Collect high quality PNGs
      const maps = {
        baseColor: this.canvases.baseColor.toDataURL('image/png'),
        normal: this.canvases.normal.toDataURL('image/png'),
        roughness: this.canvases.roughness.toDataURL('image/png'),
        height: this.canvases.height.toDataURL('image/png'),
        ambientOcclusion: this.canvases.ao.toDataURL('image/png')
      };

      const payload = {
        outputDir,
        materialName,
        category,
        subfolder: true,
        maps,
        meta: {
          resolution: this.resolution,
          settings: this.params
        }
      };

      if (window.alchemistAPI && window.alchemistAPI.exportPack) {
        const result = await window.alchemistAPI.exportPack(payload);
        if (result.success) {
          this.lastExportFolder = result.targetDir;
          this.dom.btnOpenFolder.style.display = 'inline-block';
          this.showToast(`✅ Pack PBR exporté avec succès (${result.count} fichiers) dans : ${result.targetDir}`, 'success', true);
        } else {
          this.showToast(`Erreur lors de l'export : ${result.error}`, 'error');
        }
      } else {
        // In browser fallback, download ZIP
        await this.executeZipExport();
      }
    } catch (err) {
      console.error(err);
      this.showToast(`Échec de l'export : ${err.message}`, 'error');
    } finally {
      this.dom.btnExportPack.disabled = false;
      this.dom.btnExportPack.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Générer et Exporter le Pack PBR
      `;
    }
  }

  async executeZipExport() {
    const materialName = (this.dom.exportMaterialName.value.trim() || 'Materiau_PBR').replace(/[^a-zA-Z0-9_-]/g, '_');
    this.dom.btnExportZip.disabled = true;
    this.dom.btnExportZip.textContent = 'Création ZIP...';

    try {
      const zip = new window.JSZip();
      const folder = zip.folder(materialName);

      const addCanvasToZip = (canvas, suffix) => {
        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            folder.file(`${materialName}_${suffix}.png`, blob);
            resolve();
          }, 'image/png');
        });
      };

      await Promise.all([
        addCanvasToZip(this.canvases.baseColor, 'baseColor'),
        addCanvasToZip(this.canvases.normal, 'normal'),
        addCanvasToZip(this.canvases.roughness, 'roughness'),
        addCanvasToZip(this.canvases.height, 'height'),
        addCanvasToZip(this.canvases.ao, 'ambientOcclusion')
      ]);

      // Add metadata JSON
      folder.file(`${materialName}_material.json`, JSON.stringify({
        name: materialName,
        category: this.dom.exportCategory.value || 'General',
        resolution: this.resolution,
        exportedAt: new Date().toISOString(),
        maps: {
          baseColor: `${materialName}_baseColor.png`,
          normal: `${materialName}_normal.png`,
          roughness: `${materialName}_roughness.png`,
          height: `${materialName}_height.png`,
          ambientOcclusion: `${materialName}_ambientOcclusion.png`
        },
        settings: this.params
      }, null, 2));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${materialName}_PBR_Pack.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showToast(`Archive ${materialName}_PBR_Pack.zip téléchargée !`, 'success');
    } catch (e) {
      console.error(e);
      this.showToast(`Erreur ZIP : ${e.message}`, 'error');
    } finally {
      this.dom.btnExportZip.disabled = false;
      this.dom.btnExportZip.textContent = '📦 Télécharger ZIP';
    }
  }

  showToast(message, type = 'info', showFolderBtn = false) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;

    if (showFolderBtn && this.lastExportFolder) {
      const btn = document.createElement('button');
      btn.className = 'toast-btn';
      btn.textContent = 'Ouvrir Dossier';
      btn.onclick = () => {
        if (window.alchemistAPI && window.alchemistAPI.openFolder) {
          window.alchemistAPI.openFolder(this.lastExportFolder);
        }
      };
      toast.appendChild(btn);
    }

    this.dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 6000);
  }
}

// Initialisation de l'application dès que le DOM est complètement chargé
function startAlchemistApp() {
  if (!window.alchemistApp) {
    window.alchemistApp = new PBRAlchemistApp();
  }
  initModuleListeners();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startAlchemistApp);
} else {
  startAlchemistApp();
}


// -----------------------------------------------------------------------------
// ARCHFORGE STUDIO HUB INTEGRATION & BRIDGE TO MATERIAL LIBRARY
// -----------------------------------------------------------------------------

window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'ARCHFORGE_SET_ACTIVE') {
    if (window.pbrViewport) {
      window.pbrViewport.isStudioActive = !!e.data.active;
      if (window.pbrViewport.isStudioActive && !window.pbrViewport.animId) {
        window.pbrViewport.animate();
      }
    }
  }
});

// Notify parent Hub that frame is mounted
if (window.parent && window.parent !== window) {
  window.parent.postMessage({ type: 'ARCHFORGE_FRAME_READY' }, '*');
}

// Transfer to Material Library
async function sendToLibrary() {
  console.log('Bouton cliqué : [PBR Alchemist] Enregistrer vers la Bibliothèque de matériaux');
  const btn = document.getElementById('btnSendToLibrary');
  const catInput = document.getElementById('exportCategory');
  const nameInput = document.getElementById('exportMaterialName');

  const category = (catInput ? catInput.value : 'Concrete').trim() || 'Concrete';
  const materialName = (nameInput ? nameInput.value : 'pbr_material').trim() || 'pbr_material';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Enregistrement dans la Bibliothèque...';
  }

  try {
    const maps = {};
    const appCanvases = window.alchemistApp && window.alchemistApp.canvases;
    if (appCanvases && appCanvases.baseColor) {
      maps.baseColor = appCanvases.baseColor.toDataURL('image/png');
      if (appCanvases.normal) maps.normal = appCanvases.normal.toDataURL('image/png');
      if (appCanvases.roughness) maps.roughness = appCanvases.roughness.toDataURL('image/png');
      if (appCanvases.height) maps.height = appCanvases.height.toDataURL('image/png');
      if (appCanvases.ao) maps.ambientOcclusion = appCanvases.ao.toDataURL('image/png');
    } else {
      const canvasBC = document.getElementById('canvasBaseColor') || document.getElementById('inspectorCanvas');
      const canvasNormal = document.getElementById('canvasNormal');
      const canvasRough = document.getElementById('canvasRoughness');
      const canvasHeight = document.getElementById('canvasHeight');
      const canvasAO = document.getElementById('canvasAO');

      if (canvasBC) maps.baseColor = canvasBC.toDataURL('image/png');
      if (canvasNormal) maps.normal = canvasNormal.toDataURL('image/png');
      if (canvasRough) maps.roughness = canvasRough.toDataURL('image/png');
      if (canvasHeight) maps.height = canvasHeight.toDataURL('image/png');
      if (canvasAO) maps.ambientOcclusion = canvasAO.toDataURL('image/png');
    }

    const res = await fetch('/api/save-alchemist-material', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, materialName, maps })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur enregistrement');

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'ARCHFORGE_ALCHEMIST_SAVED',
        category: data.category,
        materialName: data.materialName
      }, '*');
    }

    if (window.alchemistApp && typeof window.alchemistApp.showToast === 'function') {
      window.alchemistApp.showToast('Matériau enregistré dans la Bibliothèque avec succès !', 'success');
    } else if (typeof showToast === 'function') {
      showToast('Matériau enregistré dans la Bibliothèque avec succès !', 'success');
    }
  } catch (err) {
    console.error('[Send to Library Error]:', err);
    if (window.alchemistApp && typeof window.alchemistApp.showToast === 'function') {
      window.alchemistApp.showToast('Erreur : ' + err.message, 'error');
    } else if (typeof showToast === 'function') {
      showToast('Erreur : ' + err.message, 'error');
    } else {
      alert('Erreur : ' + err.message);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Send to Material Library';
    }
  }
}

// Centralisation de l'initialisation des écouteurs du module
function initModuleListeners() {
  const btnLib = document.getElementById('btnSendToLibrary');
  if (btnLib && !btnLib.dataset.alchBound) {
    btnLib.dataset.alchBound = 'true';
    btnLib.addEventListener('click', (e) => {
      e.stopPropagation();
      sendToLibrary();
    });
  }

  // Ensure app events are initialized if app exists
  if (window.alchemistApp && typeof window.alchemistApp.initEvents === 'function' && !window.alchemistApp._eventsBound) {
    window.alchemistApp._eventsBound = true;
    window.alchemistApp.initEvents();
  }
}

// Délégation d'événements globale sur le document (uniquement pour information/log sans doublon d'action)
document.addEventListener('click', (e) => {
  const chip = e.target.closest('.sample-chip');
  if (chip && chip.dataset.sample) {
    console.log(`Bouton cliqué : [PBR Alchemist] Échantillon : ${chip.dataset.sample}`);
  }
});

// Réception des événements du Hub
window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'ARCHFORGE_REINIT_LISTENERS' || e.data.type === 'ARCHFORGE_SET_ACTIVE') {
    initModuleListeners();
  }
});



// Export global functions
window.sendToLibrary = sendToLibrary;
window.initModuleListeners = initModuleListeners;

