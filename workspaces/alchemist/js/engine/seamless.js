/**
 * PBR Alchemist Studio - Seamless & Delighting Engine
 * Handles centered square cropping, quadrant offset, progressive mask blending, and illumination flattening.
 */

export class SeamlessEngine {
  /**
   * Resizes and crops source image to a square power-of-two canvas
   * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} sourceImg 
   * @param {number} targetResolution (1024, 2048, 4096)
   * @returns {HTMLCanvasElement}
   */
  static cropAndResize(sourceImg, targetResolution = 2048) {
    const canvas = document.createElement('canvas');
    canvas.width = targetResolution;
    canvas.height = targetResolution;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const sw = sourceImg.naturalWidth || sourceImg.width;
    const sh = sourceImg.naturalHeight || sourceImg.height;

    // Centered square crop
    const minDim = Math.min(sw, sh);
    const sx = Math.floor((sw - minDim) / 2);
    const sy = Math.floor((sh - minDim) / 2);

    ctx.drawImage(sourceImg, sx, sy, minDim, minDim, 0, 0, targetResolution, targetResolution);
    return canvas;
  }

  /**
   * Performs seamless tiling using quadrant offset + progressive cross-dissolve mask
   * @param {HTMLCanvasElement} inputCanvas 
   * @param {Object} options 
   * @param {boolean} options.enabled - whether seamless is active
   * @param {number} options.smoothness - 0 to 100 (edge blend radius percentage)
   * @returns {HTMLCanvasElement}
   */
  static makeSeamless(inputCanvas, options = {}) {
    const enabled = options.enabled !== undefined ? options.enabled : true;
    const smoothness = options.smoothness !== undefined ? options.smoothness : 35; // 0 to 100%

    const w = inputCanvas.width;
    const h = inputCanvas.height;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

    if (!enabled || smoothness <= 0) {
      // Just copy or pure shifted
      if (!enabled) {
        outCtx.drawImage(inputCanvas, 0, 0);
        return outCanvas;
      }
    }

    // 1. Create shifted canvas (50% X and 50% Y quadrant offset)
    const shiftedCanvas = document.createElement('canvas');
    shiftedCanvas.width = w;
    shiftedCanvas.height = h;
    const shiftedCtx = shiftedCanvas.getContext('2d', { willReadFrequently: true });

    const hw = Math.floor(w / 2);
    const hh = Math.floor(h / 2);

    // [A | B] -> [D | C]
    // [C | D]    [B | A]
    // Top-left -> Bottom-right
    shiftedCtx.drawImage(inputCanvas, 0, 0, hw, hh, hw, hh, hw, hh);
    // Top-right -> Bottom-left
    shiftedCtx.drawImage(inputCanvas, hw, 0, w - hw, hh, 0, hh, w - hw, hh);
    // Bottom-left -> Top-right
    shiftedCtx.drawImage(inputCanvas, 0, hh, hw, h - hh, hw, 0, hw, h - hh);
    // Bottom-right -> Top-left
    shiftedCtx.drawImage(inputCanvas, hw, hh, w - hw, h - hh, 0, 0, w - hw, h - hh);

    // If smoothness is 0, pure offset with raw edges
    if (smoothness <= 0) {
      outCtx.drawImage(shiftedCanvas, 0, 0);
      return outCanvas;
    }

    // 2. Progressive blending mask over central cross seam
    // Seam line is at x = hw and y = hh
    const inCtx = inputCanvas.getContext('2d', { willReadFrequently: true });
    const origData = inCtx.getImageData(0, 0, w, h);
    const shiftData = shiftedCtx.getImageData(0, 0, w, h);
    const resultData = outCtx.createImageData(w, h);

    const origPixels = origData.data;
    const shiftPixels = shiftData.data;
    const outPixels = resultData.data;

    // Blend radius in pixels
    const radius = Math.max(2, Math.floor((hw * smoothness) / 100));
    const invRadius = 1.0 / radius;

    for (let y = 0; y < h; y++) {
      const dy = Math.abs(y - hh);
      const ny = dy >= radius ? 1.0 : dy * invRadius;
      // Hermite smoothstep for Y
      const wy = ny >= 1.0 ? 1.0 : ny * ny * (3.0 - 2.0 * ny);

      const rowOffset = y * w;

      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x - hw);
        const nx = dx >= radius ? 1.0 : dx * invRadius;
        // Hermite smoothstep for X
        const wx = nx >= 1.0 ? 1.0 : nx * nx * (3.0 - 2.0 * nx);

        // Combined shifted weight (0 at center seams, 1 away from center seams)
        const shiftedWeight = wx * wy;
        const origWeight = 1.0 - shiftedWeight;

        const idx = (rowOffset + x) * 4;

        outPixels[idx] = Math.round(shiftPixels[idx] * shiftedWeight + origPixels[idx] * origWeight);
        outPixels[idx + 1] = Math.round(shiftPixels[idx + 1] * shiftedWeight + origPixels[idx + 1] * origWeight);
        outPixels[idx + 2] = Math.round(shiftPixels[idx + 2] * shiftedWeight + origPixels[idx + 2] * origWeight);
        outPixels[idx + 3] = 255;
      }
    }

    outCtx.putImageData(resultData, 0, 0);
    return outCanvas;
  }

  /**
   * Applies delighter (homomorphic / subtractive high-pass illumination flattening)
   * @param {HTMLCanvasElement} inputCanvas 
   * @param {number} amount - 0 to 100 (%)
   * @returns {HTMLCanvasElement}
   */
  static applyDelighter(inputCanvas, amount = 0) {
    const w = inputCanvas.width;
    const h = inputCanvas.height;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });

    if (amount <= 0) {
      outCtx.drawImage(inputCanvas, 0, 0);
      return outCanvas;
    }

    // Fast low-frequency illumination extraction:
    // 1. Downscale to 64x64
    const downDim = 64;
    const downCanvas = document.createElement('canvas');
    downCanvas.width = downDim;
    downCanvas.height = downDim;
    const downCtx = downCanvas.getContext('2d', { willReadFrequently: true });
    downCtx.imageSmoothingEnabled = true;
    downCtx.imageSmoothingQuality = 'medium';
    downCtx.drawImage(inputCanvas, 0, 0, downDim, downDim);

    // 2. Blur downscaled representation
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = downDim;
    blurCanvas.height = downDim;
    const blurCtx = blurCanvas.getContext('2d', { willReadFrequently: true });
    blurCtx.filter = 'blur(6px)';
    blurCtx.drawImage(downCanvas, 0, 0);

    // 3. Upsample smooth blurred illumination back to full resolution
    const upCanvas = document.createElement('canvas');
    upCanvas.width = w;
    upCanvas.height = h;
    const upCtx = upCanvas.getContext('2d', { willReadFrequently: true });
    upCtx.imageSmoothingEnabled = true;
    upCtx.imageSmoothingQuality = 'high';
    upCtx.drawImage(blurCanvas, 0, 0, w, h);

    // 4. Compute global average luminance
    const downData = downCtx.getImageData(0, 0, downDim, downDim).data;
    let sumLum = 0;
    const totalDownPixels = downDim * downDim;
    for (let i = 0; i < downData.length; i += 4) {
      sumLum += 0.299 * downData[i] + 0.587 * downData[i + 1] + 0.114 * downData[i + 2];
    }
    const avgLum = sumLum / totalDownPixels;

    // 5. Apply homomorphic lighting equalization
    const inData = inputCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
    const lowData = upCtx.getImageData(0, 0, w, h);
    const outData = outCtx.createImageData(w, h);

    const inPx = inData.data;
    const lowPx = lowData.data;
    const outPx = outData.data;

    const strength = amount / 100.0;
    const len = inPx.length;

    for (let i = 0; i < len; i += 4) {
      const r = inPx[i];
      const g = inPx[i + 1];
      const b = inPx[i + 2];

      const lowR = lowPx[i];
      const lowG = lowPx[i + 1];
      const lowB = lowPx[i + 2];
      const lowL = 0.299 * lowR + 0.587 * lowG + 0.114 * lowB;

      // Illumination ratio
      const safeLowL = Math.max(12, lowL);
      const ratio = avgLum / safeLowL;

      // Soft clamp ratio between 0.35 and 2.5 to avoid over-amplifying dark noise
      const clampedRatio = Math.max(0.35, Math.min(2.5, ratio));

      // Interpolate with original based on delight strength
      const factor = 1.0 + strength * (clampedRatio - 1.0);

      outPx[i] = Math.min(255, Math.max(0, Math.round(r * factor)));
      outPx[i + 1] = Math.min(255, Math.max(0, Math.round(g * factor)));
      outPx[i + 2] = Math.min(255, Math.max(0, Math.round(b * factor)));
      outPx[i + 3] = inPx[i + 3];
    }

    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }
}
