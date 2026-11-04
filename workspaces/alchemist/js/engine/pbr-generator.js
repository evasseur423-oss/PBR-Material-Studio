/**
 * PBR Alchemist Studio - PBR Channels Math Engine
 * Generates BaseColor, Normal (Sobel 3x3), Height (Threshold Levels), Roughness, and Ambient Occlusion.
 */

export class PBRGenerator {
  /**
   * Generates BaseColor (Albedo) with brightness, contrast, and saturation
   * @param {HTMLCanvasElement} inputCanvas 
   * @param {Object} params 
   * @param {number} params.brightness - -100 to 100 (%)
   * @param {number} params.contrast - -100 to 100 (%)
   * @param {number} params.saturation - 0 to 200 (%)
   * @returns {HTMLCanvasElement}
   */
  static generateBaseColor(inputCanvas, params = {}) {
    const brightness = (params.brightness || 0) / 100.0; // -1 to 1
    const contrast = (params.contrast || 0) / 100.0;     // -1 to 1
    const saturation = (params.saturation !== undefined ? params.saturation : 100) / 100.0; // 0 to 2

    const w = inputCanvas.width;
    const h = inputCanvas.height;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

    const inCtx = inputCanvas.getContext('2d', { willReadFrequently: true });
    const inData = inCtx.getImageData(0, 0, w, h);
    const outData = outCtx.createImageData(w, h);

    const inPx = inData.data;
    const outPx = outData.data;
    const len = inPx.length;

    // Contrast factor formula
    const cFactor = contrast >= 0 ? (1.0 + contrast * 2.0) : (1.0 + contrast);
    const bOffset = brightness * 255;

    for (let i = 0; i < len; i += 4) {
      let r = inPx[i];
      let g = inPx[i + 1];
      let b = inPx[i + 2];

      // 1. Brightness
      r += bOffset;
      g += bOffset;
      b += bOffset;

      // 2. Contrast around mid-gray 128
      r = (r - 128) * cFactor + 128;
      g = (g - 128) * cFactor + 128;
      b = (b - 128) * cFactor + 128;

      // 3. Saturation
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * saturation;
      g = lum + (g - lum) * saturation;
      b = lum + (b - lum) * saturation;

      outPx[i] = Math.min(255, Math.max(0, Math.round(r)));
      outPx[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
      outPx[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
      outPx[i + 3] = inPx[i + 3];
    }

    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }

  /**
   * Generates Normal Map using Sobel 3x3 convolution with toroidal wrapping
   * @param {HTMLCanvasElement} inputCanvas 
   * @param {Object} params 
   * @param {number} params.strength - Relief intensity (0.1 to 10.0, default 2.5)
   * @param {number} params.blur - Pre-filter smoothing radius (0 to 10px)
   * @param {boolean} params.invertY - Invert Y axis (OpenGL +Y vs DirectX -Y)
   * @returns {HTMLCanvasElement}
   */
  static generateNormalMap(inputCanvas, params = {}) {
    const strength = params.strength !== undefined ? params.strength : 2.5;
    const blur = params.blur || 0;
    const invertY = params.invertY || false;

    const w = inputCanvas.width;
    const h = inputCanvas.height;

    // Optional blur to reduce camera sensor noise
    let srcCanvas = inputCanvas;
    if (blur > 0) {
      srcCanvas = document.createElement('canvas');
      srcCanvas.width = w;
      srcCanvas.height = h;
      const blurCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
      blurCtx.filter = `blur(${blur}px)`;
      blurCtx.drawImage(inputCanvas, 0, 0);
    }

    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    const srcData = srcCtx.getImageData(0, 0, w, h);
    const srcPx = srcData.data;

    // Extract luminance array with toroidal boundary wrapping
    const lum = new Float32Array(w * h);
    for (let i = 0, j = 0; i < srcPx.length; i += 4, j++) {
      lum[j] = (0.299 * srcPx[i] + 0.587 * srcPx[i + 1] + 0.114 * srcPx[i + 2]) / 255.0;
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
    const outData = outCtx.createImageData(w, h);
    const outPx = outData.data;

    const getLum = (x, y) => {
      // Toroidal wrap-around for seamless borders
      const wx = (x + w) % w;
      const wy = (y + h) % h;
      return lum[wy * w + wx];
    };

    const yMult = invertY ? 1.0 : -1.0; // OpenGL (+Y / green pointing up) is standard

    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        // Sample 3x3 neighborhood
        const tl = getLum(x - 1, y - 1);
        const tc = getLum(x, y - 1);
        const tr = getLum(x + 1, y - 1);

        const ml = getLum(x - 1, y);
        const mr = getLum(x + 1, y);

        const bl = getLum(x - 1, y + 1);
        const bc = getLum(x, y + 1);
        const br = getLum(x + 1, y + 1);

        // Sobel X kernel:
        // [-1, 0, 1]
        // [-2, 0, 2]
        // [-1, 0, 1]
        const dX = ((tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl)) * 0.125;

        // Sobel Y kernel:
        // [-1, -2, -1]
        // [ 0,  0,  0]
        // [ 1,  2,  1]
        const dY = ((bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr)) * 0.125;

        // Normal vector (Nx, Ny, Nz)
        let nx = -dX * strength;
        let ny = dY * strength * yMult;
        let nz = 1.0;

        // Vector normalization
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
        nx /= len;
        ny /= len;
        nz /= len;

        // Map from [-1, 1] to [0, 255]
        const idx = (rowOffset + x) * 4;
        outPx[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        outPx[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        outPx[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        outPx[idx + 3] = 255;
      }
    }

    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }

  /**
   * Generates Height / Displacement Map with threshold levels and smoothing blur
   * @param {HTMLCanvasElement} inputCanvas 
   * @param {Object} params 
   * @param {number} params.minLevel - Black point (0 to 255)
   * @param {number} params.maxLevel - White point (0 to 255)
   * @param {number} params.gamma - Contrast curve (0.2 to 3.0)
   * @param {number} params.blur - Smoothing blur radius (0 to 12px)
   * @param {boolean} params.invert - Invert height
   * @returns {HTMLCanvasElement}
   */
  static generateHeightMap(inputCanvas, params = {}) {
    const minLevel = params.minLevel !== undefined ? params.minLevel : 0;
    const maxLevel = params.maxLevel !== undefined ? Math.max(minLevel + 1, params.maxLevel) : 255;
    const gamma = params.gamma !== undefined ? params.gamma : 1.0;
    const blur = params.blur || 1.5;
    const invert = params.invert || false;

    const w = inputCanvas.width;
    const h = inputCanvas.height;

    const inCtx = inputCanvas.getContext('2d', { willReadFrequently: true });
    const inData = inCtx.getImageData(0, 0, w, h);
    const inPx = inData.data;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    const tempData = tempCtx.createImageData(w, h);
    const tempPx = tempData.data;

    const range = Math.max(1, maxLevel - minLevel);
    const invGamma = 1.0 / Math.max(0.01, gamma);

    for (let i = 0; i < inPx.length; i += 4) {
      let lum = 0.299 * inPx[i] + 0.587 * inPx[i + 1] + 0.114 * inPx[i + 2];

      // Levels normalization
      let norm = (lum - minLevel) / range;
      norm = Math.max(0.0, Math.min(1.0, norm));

      // Gamma correction
      if (gamma !== 1.0) {
        norm = Math.pow(norm, invGamma);
      }

      if (invert) {
        norm = 1.0 - norm;
      }

      const val = Math.round(norm * 255);
      tempPx[i] = val;
      tempPx[i + 1] = val;
      tempPx[i + 2] = val;
      tempPx[i + 3] = 255;
    }

    tempCtx.putImageData(tempData, 0, 0);

    // Apply smoothing blur to eliminate jagged displacement spikes
    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

    if (blur > 0) {
      outCtx.filter = `blur(${blur}px)`;
    }
    outCtx.drawImage(tempCanvas, 0, 0);

    return outCanvas;
  }

  /**
   * Generates Roughness Map with base value, contrast, invert, and cavity boost
   * @param {HTMLCanvasElement} inputCanvas 
   * @param {HTMLCanvasElement} aoCanvas - optional AO canvas to boost crevice roughness
   * @param {Object} params 
   * @param {number} params.baseRoughness - 0.0 to 1.0 (default 0.55)
   * @param {number} params.contrast - 0.0 to 2.0 (default 1.0)
   * @param {boolean} params.invert - invert dark/light meaning
   * @param {number} params.cavityBoost - 0.0 to 1.0
   * @returns {HTMLCanvasElement}
   */
  static generateRoughnessMap(inputCanvas, aoCanvas = null, params = {}) {
    const baseRoughness = params.baseRoughness !== undefined ? params.baseRoughness : 0.55;
    const contrast = params.contrast !== undefined ? params.contrast : 1.0;
    const invert = params.invert || false;
    const cavityBoost = params.cavityBoost !== undefined ? params.cavityBoost : 0.25;

    const w = inputCanvas.width;
    const h = inputCanvas.height;

    const inCtx = inputCanvas.getContext('2d', { willReadFrequently: true });
    const inData = inCtx.getImageData(0, 0, w, h);
    const inPx = inData.data;

    let aoPx = null;
    if (aoCanvas) {
      const aoCtx = aoCanvas.getContext('2d', { willReadFrequently: true });
      aoPx = aoCtx.getImageData(0, 0, w, h).data;
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
    const outData = outCtx.createImageData(w, h);
    const outPx = outData.data;

    for (let i = 0; i < inPx.length; i += 4) {
      let lum = (0.299 * inPx[i] + 0.587 * inPx[i + 1] + 0.114 * inPx[i + 2]) / 255.0;

      if (invert) {
        lum = 1.0 - lum;
      }

      // Variation around base roughness modulated by contrast
      let r = baseRoughness + (lum - 0.5) * contrast;

      // Add cavity boost from AO if available (crevices are dustier/rougher)
      if (aoPx && cavityBoost > 0) {
        const aoVal = aoPx[i] / 255.0;
        r += (1.0 - aoVal) * cavityBoost;
      }

      r = Math.max(0.0, Math.min(1.0, r));
      const val = Math.round(r * 255);

      outPx[i] = val;
      outPx[i + 1] = val;
      outPx[i + 2] = val;
      outPx[i + 3] = 255;
    }

    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }

  /**
   * Generates Ambient Occlusion (AO) map using cavity and steepness shading
   * @param {HTMLCanvasElement} inputCanvas 
   * @param {Object} params 
   * @param {number} params.intensity - AO shadow strength (0 to 100%)
   * @param {number} params.radius - Cavity shadow radius (1 to 20px)
   * @returns {HTMLCanvasElement}
   */
  static generateAmbientOcclusion(inputCanvas, params = {}) {
    const intensity = (params.intensity !== undefined ? params.intensity : 60) / 100.0;
    const radius = params.radius !== undefined ? params.radius : 6;

    const w = inputCanvas.width;
    const h = inputCanvas.height;

    // 1. Create blurred luminance representation for local neighborhood comparison
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = w;
    blurCanvas.height = h;
    const blurCtx = blurCanvas.getContext('2d', { willReadFrequently: true });
    blurCtx.filter = `blur(${Math.max(2, radius)}px)`;
    blurCtx.drawImage(inputCanvas, 0, 0);

    const inCtx = inputCanvas.getContext('2d', { willReadFrequently: true });
    const inData = inCtx.getImageData(0, 0, w, h);
    const blurData = blurCtx.getImageData(0, 0, w, h);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
    const outData = outCtx.createImageData(w, h);

    const inPx = inData.data;
    const blurPx = blurData.data;
    const outPx = outData.data;
    const len = inPx.length;

    for (let i = 0; i < len; i += 4) {
      const localLum = (0.299 * inPx[i] + 0.587 * inPx[i + 1] + 0.114 * inPx[i + 2]) / 255.0;
      const avgLum = (0.299 * blurPx[i] + 0.587 * blurPx[i + 1] + 0.114 * blurPx[i + 2]) / 255.0;

      // When local pixel is darker than local neighborhood, it's a cavity / crevice
      const cavity = Math.max(0.0, avgLum - localLum);

      // Occlusion factor: 1.0 is full white, lower is dark shadow
      const occlusion = 1.0 - cavity * intensity * 3.5;
      const clamped = Math.max(0.0, Math.min(1.0, occlusion));

      const val = Math.round(clamped * 255);
      outPx[i] = val;
      outPx[i + 1] = val;
      outPx[i + 2] = val;
      outPx[i + 3] = 255;
    }

    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }
}
