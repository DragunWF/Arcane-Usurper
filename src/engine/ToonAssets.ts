import * as THREE from 'three';
import { ARENA_CONFIG, PALETTE } from '../config/gameConfig';

export interface ToonMaterialOptions {
  emissive?: number;
  emissiveIntensity?: number;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
}

export type OutlineScale = number | { readonly x: number; readonly y: number; readonly z: number };

export interface OutlinedMeshResult {
  group: THREE.Group;
  mainMesh: THREE.Mesh;
}

export interface GlacialFloorTextures {
  diffuseMap: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
}

let sharedGradientMap: THREE.DataTexture | null = null;
let sharedThreeStepGradientMap: THREE.DataTexture | null = null;
let sharedOutlineMaterial: THREE.MeshBasicMaterial | null = null;
let sharedSnowTexture: THREE.CanvasTexture | null = null;
let sharedSparkTexture: THREE.CanvasTexture | null = null;

/**
 * Builds a crisp 3-step cel-shading gradient map for clean stylized hair & anime rigs.
 */
export function getThreeStepToonGradientMap(): THREE.DataTexture {
  if (sharedThreeStepGradientMap) return sharedThreeStepGradientMap;

  const bands = [96, 184, 255] as const;
  const data = new Uint8Array(bands.length * 4);
  for (let i = 0; i < bands.length; i++) {
    const v = bands[i] ?? 255;
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, bands.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  sharedThreeStepGradientMap = tex;
  return sharedThreeStepGradientMap;
}

/**
 * Builds a crisp 4-band cel-shading gradient map for THREE.MeshToonMaterial.
 */
export function getToonGradientMap(): THREE.DataTexture {
  if (sharedGradientMap) return sharedGradientMap;

  const bands = ARENA_CONFIG.toonGradientBands;
  const data = new Uint8Array(bands.length * 4);
  for (let i = 0; i < bands.length; i++) {
    const v = bands[i] ?? 255;
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, bands.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  sharedGradientMap = tex;
  return sharedGradientMap;
}

/**
 * Shared ink-black BackSide material for crisp anime silhouette outlines.
 */
export function getOutlineMaterial(): THREE.MeshBasicMaterial {
  if (sharedOutlineMaterial) return sharedOutlineMaterial;
  sharedOutlineMaterial = new THREE.MeshBasicMaterial({
    color: PALETTE.inkOutline,
    side: THREE.BackSide,
  });
  return sharedOutlineMaterial;
}

export function createThreeStepToonMaterial(
  color: number,
  options: ToonMaterialOptions = {},
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getThreeStepToonGradientMap(),
    emissive: options.emissive !== undefined ? options.emissive : PALETTE.pureBlack,
    emissiveIntensity:
      options.emissiveIntensity !== undefined ? options.emissiveIntensity : 0.0,
    side: options.side !== undefined ? options.side : THREE.FrontSide,
    transparent: Boolean(options.transparent),
    opacity: options.opacity !== undefined ? options.opacity : 1.0,
  });
}

/**
 * Creates a THREE.MeshToonMaterial configured with the shared cel gradient map.
 */
export function createToonMaterial(
  color: number,
  options: ToonMaterialOptions = {},
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getToonGradientMap(),
    emissive: options.emissive !== undefined ? options.emissive : PALETTE.pureBlack,
    emissiveIntensity:
      options.emissiveIntensity !== undefined ? options.emissiveIntensity : 0.0,
    side: options.side !== undefined ? options.side : THREE.FrontSide,
    transparent: Boolean(options.transparent),
    opacity: options.opacity !== undefined ? options.opacity : 1.0,
  });
}

/**
 * Adds a cel-shaded mesh paired with a slightly inflated BackSide ink outline mesh.
 */
export function createOutlinedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  outlineScale: OutlineScale = ARENA_CONFIG.defaultOutlineScale,
  castShadow = true,
): OutlinedMeshResult {
  const group = new THREE.Group();

  const mainMesh = new THREE.Mesh(geometry, material);
  mainMesh.castShadow = castShadow;
  mainMesh.receiveShadow = true;
  mainMesh.userData.isMainPart = true;
  group.add(mainMesh);

  const hasOutline =
    typeof outlineScale === 'number'
      ? outlineScale > 1.0
      : outlineScale.x > 1.0 || outlineScale.y > 1.0 || outlineScale.z > 1.0;

  if (hasOutline) {
    const outlineMesh = new THREE.Mesh(geometry, getOutlineMaterial());
    if (typeof outlineScale === 'number') {
      outlineMesh.scale.setScalar(outlineScale);
    } else {
      outlineMesh.scale.set(outlineScale.x, outlineScale.y, outlineScale.z);
    }
    outlineMesh.castShadow = false;
    outlineMesh.receiveShadow = false;
    outlineMesh.userData.isOutline = true;
    group.add(outlineMesh);
  }

  return { group, mainMesh };
}

function getSoftParticleTexture(
  innerColor: string,
  outerColor: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0.0, innerColor);
    grad.addColorStop(0.38, outerColor);
    grad.addColorStop(1.0, PALETTE.rgba.transparentBlack);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function getSnowTexture(): THREE.CanvasTexture {
  if (!sharedSnowTexture) {
    sharedSnowTexture = getSoftParticleTexture(
      PALETTE.rgba.snowInner,
      PALETTE.rgba.snowOuter,
    );
  }
  return sharedSnowTexture;
}

export function getSparkTexture(): THREE.CanvasTexture {
  if (!sharedSparkTexture) {
    sharedSparkTexture = getSoftParticleTexture(
      PALETTE.rgba.sparkInner,
      PALETTE.rgba.sparkOuter,
    );
  }
  return sharedSparkTexture;
}

/**
 * Procedural 1024x1024 glacial floor texture with inlaid cyan-blue
 * concentric arcane snowflake geometry, frost veins, and runic rings.
 */
export function createGlacialFloorTextures(): GlacialFloorTextures {
  const size = ARENA_CONFIG.floorTextureSize;
  const c = size * 0.5;

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = size;
  diffCanvas.height = size;
  const dCtx = diffCanvas.getContext('2d');

  const emisCanvas = document.createElement('canvas');
  emisCanvas.width = size;
  emisCanvas.height = size;
  const eCtx = emisCanvas.getContext('2d');

  if (dCtx && eCtx) {
    const bgGrad = dCtx.createRadialGradient(c, c, 20, c, c, c);
    bgGrad.addColorStop(0.0, PALETTE.hex.iceFloorCenter);
    bgGrad.addColorStop(0.45, PALETTE.hex.iceFloor);
    bgGrad.addColorStop(0.82, PALETTE.hex.iceFloorOuter);
    bgGrad.addColorStop(1.0, PALETTE.hex.glacialNavy);
    dCtx.fillStyle = bgGrad;
    dCtx.fillRect(0, 0, size, size);

    dCtx.save();
    dCtx.translate(c, c);
    for (let i = 0; i < 42; i++) {
      const ang = (i / 42) * Math.PI * 2 + (i % 3) * 0.12;
      const r1 = 60 + ((i * 29) % 240);
      const r2 = r1 + 95 + ((i * 17) % 140);
      dCtx.strokeStyle =
        i % 2 === 0 ? PALETTE.rgba.floorFacetLight : PALETTE.rgba.floorFacetCyan;
      dCtx.lineWidth = i % 3 === 0 ? 2.0 : 1.0;
      dCtx.beginPath();
      dCtx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
      dCtx.lineTo(
        Math.cos(ang + 0.08) * ((r1 + r2) * 0.5),
        Math.sin(ang + 0.08) * ((r1 + r2) * 0.5),
      );
      dCtx.lineTo(Math.cos(ang - 0.04) * r2, Math.sin(ang - 0.04) * r2);
      dCtx.stroke();
    }
    dCtx.restore();

    eCtx.fillStyle = PALETTE.hex.pureBlack;
    eCtx.fillRect(0, 0, size, size);

    const drawArcaneLayer = (
      ctx: CanvasRenderingContext2D,
      isEmissive: boolean,
    ): void => {
      ctx.save();
      ctx.translate(c, c);

      const primaryStroke = isEmissive
        ? PALETTE.rgba.floorPrimaryEmissive
        : PALETTE.rgba.floorPrimaryDiffuse;
      const highlightStroke = isEmissive
        ? PALETTE.rgba.floorHighlightEmissive
        : PALETTE.rgba.floorHighlightDiffuse;
      const softGlow = isEmissive
        ? PALETTE.rgba.floorGlowEmissive
        : PALETTE.rgba.floorGlowDiffuse;

      const rings = [
        { r: 82, w: 3.5, col: highlightStroke },
        { r: 102, w: 1.5, col: primaryStroke },
        { r: 196, w: 3.0, col: primaryStroke },
        { r: 214, w: 1.4, col: highlightStroke },
        { r: 325, w: 4.0, col: primaryStroke },
        { r: 356, w: 2.0, col: highlightStroke },
        { r: 446, w: 5.0, col: primaryStroke },
        { r: 468, w: 2.2, col: highlightStroke },
      ];

      rings.forEach((ring) => {
        ctx.beginPath();
        ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = softGlow;
        ctx.lineWidth = ring.w * 3.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
        ctx.strokeStyle = ring.col;
        ctx.lineWidth = ring.w;
        ctx.stroke();
      });

      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const isMajor = i % 2 === 0;
        ctx.save();
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(42, 0);
        ctx.lineTo(isMajor ? 446 : 325, 0);
        ctx.strokeStyle = isMajor ? highlightStroke : primaryStroke;
        ctx.lineWidth = isMajor ? 2.6 : 1.6;
        ctx.stroke();

        if (isMajor) {
          const chevronPositions = [138, 255, 390];
          chevronPositions.forEach((pos, idx) => {
            const len = 28 + idx * 9;
            ctx.beginPath();
            ctx.moveTo(pos - len * 0.45, -len * 0.65);
            ctx.lineTo(pos + len * 0.35, 0);
            ctx.lineTo(pos - len * 0.45, len * 0.65);
            ctx.strokeStyle = primaryStroke;
            ctx.lineWidth = 2.2;
            ctx.stroke();
          });
        }

        const nodeR = 457;
        ctx.beginPath();
        ctx.moveTo(nodeR - 14, 0);
        ctx.lineTo(nodeR, -9);
        ctx.lineTo(nodeR + 14, 0);
        ctx.lineTo(nodeR, 9);
        ctx.closePath();
        ctx.fillStyle = highlightStroke;
        ctx.fill();

        ctx.restore();
      }

      for (let k = 0; k < 2; k++) {
        ctx.save();
        ctx.rotate((k * Math.PI) / 6);
        ctx.beginPath();
        for (let v = 0; v <= 6; v++) {
          const a = (v / 6) * Math.PI * 2;
          const px = Math.cos(a) * 196;
          const py = Math.sin(a) * 196;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = primaryStroke;
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
      }

      const glyphCount = 48;
      for (let g = 0; g < glyphCount; g++) {
        const a = (g / glyphCount) * Math.PI * 2;
        ctx.save();
        ctx.rotate(a);
        ctx.translate(340, 0);
        ctx.strokeStyle = highlightStroke;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        const pattern = g % 4;
        if (pattern === 0) {
          ctx.moveTo(-7, -5);
          ctx.lineTo(7, 0);
          ctx.lineTo(-7, 5);
          ctx.moveTo(0, -6);
          ctx.lineTo(0, 6);
        } else if (pattern === 1) {
          ctx.moveTo(-6, -5);
          ctx.lineTo(6, -5);
          ctx.lineTo(-6, 5);
          ctx.lineTo(6, 5);
        } else if (pattern === 2) {
          ctx.moveTo(-7, 0);
          ctx.lineTo(7, 0);
          ctx.moveTo(2, -6);
          ctx.lineTo(7, 0);
          ctx.lineTo(2, 6);
        } else {
          ctx.moveTo(-6, -6);
          ctx.lineTo(6, 6);
          ctx.moveTo(6, -6);
          ctx.lineTo(-6, 6);
        }
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.strokeStyle = highlightStroke;
      ctx.lineWidth = 3.2;
      ctx.stroke();

      ctx.restore();
    };

    drawArcaneLayer(dCtx, false);
    drawArcaneLayer(eCtx, true);
  }

  const diffuseMap = new THREE.CanvasTexture(diffCanvas);
  diffuseMap.colorSpace = THREE.SRGBColorSpace;
  diffuseMap.anisotropy = 4;
  diffuseMap.needsUpdate = true;

  const emissiveMap = new THREE.CanvasTexture(emisCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.anisotropy = 4;
  emissiveMap.needsUpdate = true;

  return { diffuseMap, emissiveMap };
}

/**
 * Procedural translucent aurora borealis ribbon texture.
 */
export function createAuroraTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const vGrad = ctx.createLinearGradient(0, 0, 0, 128);
    vGrad.addColorStop(0.0, PALETTE.rgba.auroraStop0);
    vGrad.addColorStop(0.28, PALETTE.rgba.auroraStop1);
    vGrad.addColorStop(0.58, PALETTE.rgba.auroraStop2);
    vGrad.addColorStop(0.84, PALETTE.rgba.auroraStop3);
    vGrad.addColorStop(1.0, PALETTE.rgba.auroraStop4);

    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, 512, 128);

    for (let x = 0; x < 512; x += 6) {
      const strength =
        0.25 + 0.55 * Math.pow(Math.sin(x * 0.055) * 0.5 + 0.5, 2);
      ctx.fillStyle = `rgba(${PALETTE.rgba.auroraStreakRgb}, ${strength * 0.28})`;
      ctx.fillRect(x, 12, 3, 100);
    }

    ctx.globalCompositeOperation = 'destination-in';
    const hGrad = ctx.createLinearGradient(0, 0, 512, 0);
    hGrad.addColorStop(0.0, PALETTE.rgba.auroraFadeZero);
    hGrad.addColorStop(0.15, PALETTE.rgba.auroraFadeFull);
    hGrad.addColorStop(0.85, PALETTE.rgba.auroraFadeFull);
    hGrad.addColorStop(1.0, PALETTE.rgba.auroraFadeZero);
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, 512, 128);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const ToonAssets = Object.freeze({
  getToonGradientMap,
  getThreeStepToonGradientMap,
  getOutlineMaterial,
  createToonMaterial,
  createThreeStepToonMaterial,
  createOutlinedMesh,
  getSnowTexture,
  getSparkTexture,
  createGlacialFloorTextures,
  createAuroraTexture,
});
