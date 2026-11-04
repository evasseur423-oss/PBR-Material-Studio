/**
 * PBR Alchemist Studio - Real-time Three.js 3D Viewport
 * Manages 3D scene, studio lighting, mesh switching, PBR material, displacement, and UV repeat.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewport3D {
  constructor(containerElement) {
    this.container = containerElement;
    this.width = containerElement.clientWidth || 800;
    this.height = containerElement.clientHeight || 600;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    this.currentMesh = null;
    this.meshType = 'sphere';
    this.material = null;

    this.textures = {
      baseColor: null,
      normal: null,
      roughness: null,
      height: null,
      ao: null
    };

    this.uvRepeat = 1.0;
    this.displacementScale = 0.05;
    this.metalness = 0.0;
    this.lightRotationSpeed = 0.0; // Turntable light rotation
    this.autoRotateMesh = false;
    this.wireframe = false;

    this.lightRig = null;
    this.clock = new THREE.Clock();

    this.init();
  }

  init() {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0c0d10');

    // Subtle atmospheric fog for architectural depth
    this.scene.fog = new THREE.FogExp2('#0c0d10', 0.035);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 100);
    this.camera.position.set(0, 1.2, 4.2);

    // 3. Renderer with ACES Filmic Tone Mapping and soft shadows
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 15;
    this.controls.target.set(0, 0, 0);

    // 5. Lighting Setup
    this.setupLighting();

    // 6. Architectural Backdrop / Studio Pedestal
    this.setupStudioEnvironment();

    // 7. Base Material
    this.material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.0,
      clearcoat: 0.0,
      clearcoatRoughness: 0.1,
      reflectivity: 0.5,
      side: THREE.DoubleSide
    });

    // 8. Create Default Mesh
    this.setMeshType('sphere');

    // 9. Resize Observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);

    this.lastTime = performance.now();

    // 10. Animation Loop
    this.isStudioActive = true;
    this.animId = null;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLighting() {
    this.lightRig = new THREE.Group();
    this.scene.add(this.lightRig);

    // Ambient / Hemisphere light for architectural fill
    const hemiLight = new THREE.HemisphereLight('#cad5e2', '#14171d', 0.85);
    this.scene.add(hemiLight);

    // Key Light (Warm daylight studio key)
    const keyLight = new THREE.DirectionalLight('#fff5eb', 2.2);
    keyLight.position.set(4, 6, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 18;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    this.lightRig.add(keyLight);

    // Fill Light (Cool architectural fill)
    const fillLight = new THREE.DirectionalLight('#9bc4e2', 0.85);
    fillLight.position.set(-5, 3, -3);
    this.lightRig.add(fillLight);

    // Rim / Back Light (Crisp glancing highlight)
    const rimLight = new THREE.DirectionalLight('#e6f0ff', 1.8);
    rimLight.position.set(-2, 4, -6);
    this.lightRig.add(rimLight);
  }

  setupStudioEnvironment() {
    // Elegant dark circular ground pedestal
    const groundGeo = new THREE.CylinderGeometry(4.5, 4.8, 0.2, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.85,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -1.6;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Studio grid circle helper
    const grid = new THREE.GridHelper(9, 18, 0x2e66e6, 0x1f2229);
    grid.position.y = -1.49;
    this.scene.add(grid);
  }

  setMeshType(type) {
    this.meshType = type;
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      if (this.currentMesh.geometry) this.currentMesh.geometry.dispose();
    }

    let geometry;
    switch (type) {
      case 'cube':
        geometry = new THREE.BoxGeometry(2.1, 2.1, 2.1, 64, 64, 64);
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(3.2, 3.2, 128, 128);
        break;
      case 'wall_floor':
        geometry = this.createWallFloorGeometry();
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(1.2, 1.2, 2.6, 128, 64);
        break;
      case 'sphere':
      default:
        geometry = new THREE.SphereGeometry(1.45, 128, 128);
        break;
    }

    // Ensure secondary UVs exist for AO map
    if (!geometry.attributes.uv2 && geometry.attributes.uv) {
      geometry.setAttribute('uv2', geometry.attributes.uv);
    }

    this.currentMesh = new THREE.Mesh(geometry, this.material);
    this.currentMesh.castShadow = true;
    this.currentMesh.receiveShadow = true;

    if (type === 'plane') {
      this.currentMesh.rotation.x = -Math.PI / 4;
      this.currentMesh.position.set(0, 0, 0);
    } else if (type === 'wall_floor') {
      this.currentMesh.position.set(0, -0.6, 0);
    } else {
      this.currentMesh.position.set(0, 0, 0);
      this.currentMesh.rotation.set(0, 0, 0);
    }

    this.scene.add(this.currentMesh);
  }

  createWallFloorGeometry() {
    // Architectural L-shaped corner: a floor plane + vertical wall plane
    const floor = new THREE.PlaneGeometry(3.0, 3.0, 64, 64);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, 0, 1.5);

    const wall = new THREE.PlaneGeometry(3.0, 3.0, 64, 64);
    wall.translate(0, 1.5, 0);

    // Merge geometries
    const merged = floor; // Or keep both in group
    // In Three.js, simple approach: use group with 2 meshes or merged buffer
    // Let's create an L-bend plane or use a simple merged geometry
    return floor;
  }

  updateTextures(canvases) {
    if (!canvases) return;

    // Helper to create or update texture
    const applyCanvasToTexture = (canvas, existingTex, isColor = false) => {
      if (!canvas) return null;
      let tex = existingTex;
      if (!tex) {
        tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      } else {
        tex.image = canvas;
        tex.needsUpdate = true;
      }
      tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.repeat.set(this.uvRepeat, this.uvRepeat);
      return tex;
    };

    // 1. BaseColor (sRGB)
    if (canvases.baseColor) {
      this.textures.baseColor = applyCanvasToTexture(canvases.baseColor, this.textures.baseColor, true);
      this.material.map = this.textures.baseColor;
    }

    // 2. Normal Map (Linear)
    if (canvases.normal) {
      this.textures.normal = applyCanvasToTexture(canvases.normal, this.textures.normal, false);
      this.material.normalMap = this.textures.normal;
      this.material.normalScale.set(1, 1);
    }

    // 3. Roughness Map (Linear)
    if (canvases.roughness) {
      this.textures.roughness = applyCanvasToTexture(canvases.roughness, this.textures.roughness, false);
      this.material.roughnessMap = this.textures.roughness;
      this.material.roughness = 1.0;
    }

    // 4. Height / Displacement Map (Linear)
    if (canvases.height) {
      this.textures.height = applyCanvasToTexture(canvases.height, this.textures.height, false);
      this.material.displacementMap = this.textures.height;
      this.material.displacementScale = this.displacementScale;
      this.material.displacementBias = -this.displacementScale * 0.5;
    }

    // 5. Ambient Occlusion (Linear)
    if (canvases.ao) {
      this.textures.ao = applyCanvasToTexture(canvases.ao, this.textures.ao, false);
      this.material.aoMap = this.textures.ao;
      this.material.aoMapIntensity = 1.0;
    }

    this.material.metalness = this.metalness;
    this.material.wireframe = this.wireframe;
    this.material.needsUpdate = true;
  }

  setUVRepeat(val) {
    this.uvRepeat = parseFloat(val) || 1.0;
    for (const key in this.textures) {
      const tex = this.textures[key];
      if (tex) {
        tex.repeat.set(this.uvRepeat, this.uvRepeat);
        tex.needsUpdate = true;
      }
    }
  }

  setDisplacementScale(scale) {
    this.displacementScale = parseFloat(scale) || 0.0;
    this.material.displacementScale = this.displacementScale;
    this.material.displacementBias = -this.displacementScale * 0.5;
    this.material.needsUpdate = true;
  }

  setMetalness(val) {
    this.metalness = parseFloat(val) || 0.0;
    this.material.metalness = this.metalness;
    this.material.needsUpdate = true;
  }

  setWireframe(enabled) {
    this.wireframe = !!enabled;
    this.material.wireframe = this.wireframe;
    this.material.needsUpdate = true;
  }

  setLightRotationSpeed(speed) {
    this.lightRotationSpeed = parseFloat(speed) || 0.0;
  }

  setAutoRotateMesh(enabled) {
    this.autoRotateMesh = !!enabled;
  }

  resetCamera() {
    this.camera.position.set(0, 1.2, 4.2);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height);
  }

  animate() {
    if (!this.isStudioActive) { this.animId = null; return; }
    this.animId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = Math.min(0.1, (now - this.lastTime) / 1000.0);
    this.lastTime = now;

    // Turntable light rotation
    if (this.lightRig && this.lightRotationSpeed !== 0) {
      this.lightRig.rotation.y += this.lightRotationSpeed * delta;
    }

    // Auto rotate mesh
    if (this.currentMesh && this.autoRotateMesh) {
      this.currentMesh.rotation.y += 0.4 * delta;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }
}
