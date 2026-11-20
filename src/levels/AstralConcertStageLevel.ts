import * as THREE from 'three';
import {
  MIKU_CONFIG,
  PALETTE,
} from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';
import type { ChamberCollider } from './IcePalaceLevel';

interface TuningCrystalRecord {
  readonly group: THREE.Group;
  readonly baseY: number;
  readonly phase: number;
}

interface StageSpotlightRecord {
  readonly beamPivot: THREE.Group;
  readonly coneMat: THREE.MeshBasicMaterial;
  readonly light: THREE.PointLight;
  readonly phase: number;
}

interface SynthCurtainVelocity {
  readonly vy: number;
  readonly swaySpeed: number;
  readonly phase: number;
}

/**
 * Self-contained procedural 3D boss arena for Realm III: **The Astral Concert Stage**.
 *
 * Built with cel-shaded MeshToonMaterial + ink-black BackSide outlines:
 * - Wide circular obsidian concert stage (radius 18m matching Summit arena scale) paved
 *   with a concentric neon emerald/cyan/magenta frequency grid floor
 * - Framed by 12 towering monolith equalizer pillars with live animated CanvasTexture
 *   spectrum analyzer bars
 * - 8 floating geometric tuning crystals & 6 overhead stage spotlight rigs casting
 *   sweeping emerald and magenta light beams
 * - Rising cyber-synth particle curtain & counter-rotating frequency halo rings.
 */
export class AstralConcertStageLevel {
  public readonly root = new THREE.Group();

  private readonly _pillarColliders: ChamberCollider[] = [];
  private readonly _pillarMeshes: THREE.Object3D[] = [];
  private readonly _cameraColliders: THREE.Object3D[] = [];
  private readonly tuningCrystals: TuningCrystalRecord[] = [];
  private readonly spotlights: StageSpotlightRecord[] = [];
  private readonly floatingHaloRings: { mesh: THREE.Mesh; speed: number }[] = [];
  private readonly synthMoteVelocities: SynthCurtainVelocity[] = [];

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];

  private eqCanvas: HTMLCanvasElement | null = null;
  private eqCtx: CanvasRenderingContext2D | null = null;
  private eqTexture: THREE.CanvasTexture | null = null;
  private eqRefreshAccum = 0;

  private synthMoteCurtain: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > | null = null;

  public get pillarColliders(): readonly ChamberCollider[] {
    return this._pillarColliders;
  }

  public get pillarMeshes(): readonly THREE.Object3D[] {
    return this._pillarMeshes;
  }

  public get cameraColliders(): readonly THREE.Object3D[] {
    return this._cameraColliders;
  }

  constructor() {
    this.root.name = 'AstralConcertStageLevel';
    this.initMonolithSpectrumTexture();
    this.buildConcertStageFloor();
    this.buildMonolithEqualizerPillars();
    this.buildFloatingTuningCrystals();
    this.buildStageSpotlightRigs();
    this.buildSynthMoteCurtain();
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.ownedGeometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.ownedMaterials.push(mat);
    return mat;
  }

  private trackTex<T extends THREE.Texture>(tex: T): T {
    this.ownedTextures.push(tex);
    return tex;
  }

  /**
   * Initializes the live animated 128x512 CanvasTexture displayed on the 12 monolith equalizer pillars.
   */
  private initMonolithSpectrumTexture(): void {
    const w = MIKU_CONFIG.eqTextureWidth;
    const h = MIKU_CONFIG.eqTextureHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    this.eqCanvas = canvas;
    this.eqCtx = canvas.getContext('2d');

    const tex = this.trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    this.eqTexture = tex;
    this.drawMonolithSpectrumFrame(0);
  }

  private drawMonolithSpectrumFrame(elapsed: number): void {
    const ctx = this.eqCtx;
    const canvas = this.eqCanvas;
    if (!ctx || !canvas || !this.eqTexture) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = PALETTE.hex.cyberObsidian;
    ctx.fillRect(0, 0, w, h);

    const rows = MIKU_CONFIG.eqBarCount;
    const rowH = h / rows;
    const padX = 12;
    const barMaxW = w - padX * 2;

    // Animated vertical dual-channel LED equalizer stack
    const pulseA = 0.5 + 0.5 * Math.sin(elapsed * 8.4);
    const pulseB = 0.5 + 0.5 * Math.cos(elapsed * 13.2 + 0.9);
    const activeRows = Math.max(
      4,
      Math.min(rows - 1, Math.round((0.25 + pulseA * 0.45 + pulseB * 0.3) * rows)),
    );

    for (let r = 0; r < rows; r++) {
      const y = h - (r + 1) * rowH + 3;
      const bh = rowH - 6;
      const ratio = r / rows;

      if (r < activeRows) {
        ctx.fillStyle =
          ratio > 0.76
            ? PALETTE.rgba.eqBarMagenta
            : ratio > 0.42
              ? PALETTE.rgba.eqBarCyan
              : PALETTE.rgba.eqBarEmerald;
        ctx.fillRect(padX, y, barMaxW, bh);
      } else if (r === activeRows) {
        ctx.fillStyle = PALETTE.rgba.eqBarPeak;
        ctx.fillRect(padX, y, barMaxW, bh);
      } else {
        ctx.fillStyle = PALETTE.rgba.cyberTileJoint;
        ctx.fillRect(padX, y, barMaxW, bh);
      }
    }

    this.eqTexture.needsUpdate = true;
  }

  /**
   * Procedural 1024x1024 concentric neon frequency grid floor textures.
   */
  private createNeonFrequencyGridTextures(): {
    diffuseMap: THREE.CanvasTexture;
    emissiveMap: THREE.CanvasTexture;
  } {
    const size = MIKU_CONFIG.stageTextureSize;
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
      const bgGrad = dCtx.createRadialGradient(c, c, 28, c, c, c);
      bgGrad.addColorStop(0, PALETTE.hex.cyberStageMid);
      bgGrad.addColorStop(0.62, PALETTE.hex.cyberStageDark);
      bgGrad.addColorStop(1, PALETTE.hex.cyberObsidian);
      dCtx.fillStyle = bgGrad;
      dCtx.fillRect(0, 0, size, size);

      eCtx.fillStyle = PALETTE.hex.pureBlack;
      eCtx.fillRect(0, 0, size, size);

      const drawGrid = (ctx: CanvasRenderingContext2D): void => {
        ctx.save();
        ctx.translate(c, c);

        const ringRadii = [78, 148, 228, 316, 408, 468];
        ringRadii.forEach((r, idx) => {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.strokeStyle =
            idx % 3 === 0
              ? PALETTE.rgba.cyberGridEmerald
              : idx % 3 === 1
                ? PALETTE.rgba.eqBarCyan
                : PALETTE.rgba.cyberGridMagenta;
          ctx.lineWidth = idx % 2 === 0 ? 5.5 : 7.5;
          ctx.stroke();
        });

        // 24 Radial Equalizer Spokes & Harmonic Star Waveform
        for (let i = 0; i < 24; i++) {
          const ang = (i / 24) * Math.PI * 2;
          ctx.save();
          ctx.rotate(ang);
          ctx.strokeStyle =
            i % 2 === 0
              ? PALETTE.rgba.cyberGridSoft
              : PALETTE.rgba.cyberGridMagenta;
          ctx.lineWidth = i % 3 === 0 ? 3.5 : 2;
          ctx.beginPath();
          ctx.moveTo(0, 78);
          ctx.lineTo(0, 468);
          ctx.stroke();
          ctx.restore();
        }

        // Central glowing harmonic octagon
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const x = Math.cos(a) * 56;
          const y = Math.sin(a) * 56;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = PALETTE.rgba.eqBarPeak;
        ctx.lineWidth = 5;
        ctx.stroke();

        ctx.restore();
      };

      drawGrid(dCtx);
      drawGrid(eCtx);
    }

    const diffuseMap = this.trackTex(new THREE.CanvasTexture(diffCanvas));
    diffuseMap.colorSpace = THREE.SRGBColorSpace;
    diffuseMap.anisotropy = 4;

    const emissiveMap = this.trackTex(new THREE.CanvasTexture(emisCanvas));
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.anisotropy = 4;

    return { diffuseMap, emissiveMap };
  }

  private buildConcertStageFloor(): void {
    const R = MIKU_CONFIG.arenaRadius;
    const { diffuseMap, emissiveMap } = this.createNeonFrequencyGridTextures();

    const floorGeo = this.trackGeo(
      new THREE.CylinderGeometry(R, R + 0.45, 0.9, 64),
    );
    const floorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: diffuseMap,
        emissive: new THREE.Color(PALETTE.mikuCyan),
        emissiveMap,
        emissiveIntensity: 0.78,
        roughness: 0.2,
        metalness: 0.4,
      }),
    );
    const sideMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.cyberObsidian,
        roughness: 0.5,
        metalness: 0.3,
      }),
    );

    const floorMesh = new THREE.Mesh(floorGeo, [sideMat, floorMat, sideMat]);
    floorMesh.position.y = -0.45;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    // Brushed-chrome stage rim molding
    const rimMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.trussChrome, {
        emissive: PALETTE.harmonicEmerald,
        emissiveIntensity: 0.24,
      }),
    );
    const rimMesh = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(R + 0.06, 0.26, 10, 64)),
      rimMat,
    );
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = 0.05;
    this.root.add(rimMesh);

    // Counter-rotating additive neon frequency rings hovering above the stage
    const ringSpecs = [
      { inner: 6.4, outer: 6.62, color: PALETTE.harmonicEmerald, speed: 0.11 },
      { inner: 13.2, outer: 13.44, color: PALETTE.harmonicMagenta, speed: -0.07 },
    ];
    ringSpecs.forEach((spec) => {
      const mesh = new THREE.Mesh(
        this.trackGeo(new THREE.RingGeometry(spec.inner, spec.outer, 64)),
        this.trackMat(
          new THREE.MeshBasicMaterial({
            color: spec.color,
            transparent: true,
            opacity: 0.42,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.025;
      this.floatingHaloRings.push({ mesh, speed: spec.speed });
      this.root.add(mesh);
    });

    const underside = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(R + 0.4, 24, 24)),
      sideMat,
    );
    underside.rotation.x = Math.PI;
    underside.position.y = -12.9;
    this.root.add(underside);
  }

  /**
   * 12 Towering Monolith Equalizer Pillars ringing the concert stage with live animated
   * CanvasTexture spectrum analyzer displays.
   */
  private buildMonolithEqualizerPillars(): void {
    const count = MIKU_CONFIG.monolithCount;
    const ringR = MIKU_CONFIG.monolithRingRadius;
    const baseH = MIKU_CONFIG.monolithHeight;
    const w = MIKU_CONFIG.monolithWidth;
    const d = MIKU_CONFIG.monolithDepth;

    const monolithMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.cyberObsidian, {
        emissive: PALETTE.cyberStageDark,
        emissiveIntensity: 0.22,
      }),
    );
    const chromeMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.trussChrome, {
        emissive: PALETTE.mikuCyan,
        emissiveIntensity: 0.2,
      }),
    );
    const eqScreenMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: this.eqTexture,
      }),
    );
    const emeraldTrimMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicEmerald }),
    );
    const magentaTrimMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicMagenta }),
    );

    const plinthGeo = this.trackGeo(new THREE.BoxGeometry(w + 0.36, 0.65, d + 0.36));
    const shaftGeo = this.trackGeo(new THREE.BoxGeometry(w, baseH - 1.3, d));
    const capGeo = this.trackGeo(new THREE.BoxGeometry(w + 0.28, 0.65, d + 0.28));
    const eqPanelGeo = this.trackGeo(
      new THREE.PlaneGeometry(w * 0.78, baseH - 1.85),
    );
    const finialGeo = this.trackGeo(new THREE.OctahedronGeometry(0.38, 0));

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const px = Math.cos(ang) * ringR;
      const pz = Math.sin(ang) * ringR;

      const pGroup = new THREE.Group();
      pGroup.position.set(px, 0, pz);
      pGroup.lookAt(0, 0, 0);

      const { group: plinthObj, mainMesh: plinthMesh } =
        ToonAssets.createOutlinedMesh(plinthGeo, chromeMat, 1.04, true);
      plinthObj.position.y = 0.325;
      pGroup.add(plinthObj);

      const { group: shaftObj, mainMesh: shaftMesh } =
        ToonAssets.createOutlinedMesh(
          shaftGeo,
          monolithMat,
          { x: 1.05, y: 1.01, z: 1.05 },
          true,
        );
      shaftObj.position.y = 0.65 + (baseH - 1.3) * 0.5;
      pGroup.add(shaftObj);

      // Inward-facing live animated CanvasTexture spectrum analyzer display
      const eqPanel = new THREE.Mesh(eqPanelGeo, eqScreenMat);
      eqPanel.position.set(0, 0.65 + (baseH - 1.3) * 0.5, d * 0.5 + 0.02);
      pGroup.add(eqPanel);

      const { group: capObj } = ToonAssets.createOutlinedMesh(
        capGeo,
        chromeMat,
        1.04,
        true,
      );
      capObj.position.y = baseH - 0.325;
      pGroup.add(capObj);

      const finial = new THREE.Mesh(
        finialGeo,
        i % 2 === 0 ? emeraldTrimMat : magentaTrimMat,
      );
      finial.position.y = baseH + 0.42;
      pGroup.add(finial);

      this.root.add(pGroup);

      this._pillarColliders.push({
        x: px,
        z: pz,
        radius: MIKU_CONFIG.monolithCollisionRadius,
        height: baseH + 0.6,
      });
      this._pillarMeshes.push(shaftMesh, plinthMesh);
      this._cameraColliders.push(shaftMesh, plinthMesh);
    }
  }

  /**
   * 8 Floating Geometric Tuning Crystals hovering and rotating around the stage perimeter.
   */
  private buildFloatingTuningCrystals(): void {
    const count = MIKU_CONFIG.tuningCrystalCount;
    const ringR = MIKU_CONFIG.tuningCrystalRingRadius;

    const emeraldMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.harmonicEmerald, {
        emissive: PALETTE.harmonicEmerald,
        emissiveIntensity: 0.48,
      }),
    );
    const magentaMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.harmonicMagenta, {
        emissive: PALETTE.harmonicMagenta,
        emissiveIntensity: 0.48,
      }),
    );
    const ringMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.mikuCyan }),
    );

    const crystalGeo = this.trackGeo(new THREE.OctahedronGeometry(0.55, 0));
    const haloRingGeo = this.trackGeo(new THREE.TorusGeometry(0.76, 0.032, 6, 24));

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.PI / count;
      const cx = Math.cos(ang) * ringR;
      const cz = Math.sin(ang) * ringR;
      const baseY = 2.4 + (i % 2) * 0.55;

      const group = new THREE.Group();
      group.position.set(cx, baseY, cz);

      const { group: crystalObj } = ToonAssets.createOutlinedMesh(
        crystalGeo,
        i % 2 === 0 ? emeraldMat : magentaMat,
        1.06,
        true,
      );
      crystalObj.scale.set(0.8, 1.55, 0.8);
      group.add(crystalObj);

      const halo = new THREE.Mesh(haloRingGeo, ringMat);
      halo.rotation.x = Math.PI * 0.35;
      group.add(halo);

      if (i % 2 === 0) {
        const light = new THREE.PointLight(
          i % 4 === 0 ? PALETTE.harmonicEmerald : PALETTE.harmonicMagenta,
          MIKU_CONFIG.lighting.crystalLightIntensity,
          MIKU_CONFIG.lighting.crystalLightDistance,
          1.8,
        );
        group.add(light);
      }

      this.root.add(group);
      this.tuningCrystals.push({ group, baseY, phase: i * 0.95 });
    }
  }

  /**
   * 6 Stage Spotlight Towers & Overhead Sweeping Spotlight Beams around the stage perimeter.
   */
  private buildStageSpotlightRigs(): void {
    const count = MIKU_CONFIG.spotlightCount;
    const ringR = MIKU_CONFIG.spotlightRingRadius;

    const chromeMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.trussChrome),
    );
    const standGeo = this.trackGeo(new THREE.CylinderGeometry(0.16, 0.28, 3.8, 6));
    const headGeo = this.trackGeo(new THREE.CylinderGeometry(0.24, 0.3, 0.58, 8));
    const coneGeo = this.trackGeo(
      new THREE.ConeGeometry(2.2, 8.8, 16, 1, true),
    );
    coneGeo.translate(0, -4.4, 0);

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + 0.26;
      const sx = Math.cos(ang) * ringR;
      const sz = Math.sin(ang) * ringR;
      const isEmerald = i % 2 === 0;
      const colorHex = isEmerald
        ? PALETTE.harmonicEmerald
        : PALETTE.harmonicMagenta;

      const rigGroup = new THREE.Group();
      rigGroup.position.set(sx, 0, sz);
      rigGroup.lookAt(0, 0, 0);

      const { group: standObj } = ToonAssets.createOutlinedMesh(
        standGeo,
        chromeMat,
        1.05,
        true,
      );
      standObj.position.y = 1.9;
      rigGroup.add(standObj);

      const beamPivot = new THREE.Group();
      beamPivot.position.set(0, 3.85, 0);
      beamPivot.rotation.x = 0.52;

      const head = new THREE.Mesh(headGeo, chromeMat);
      beamPivot.add(head);

      const coneMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const cone = new THREE.Mesh(coneGeo, coneMat);
      beamPivot.add(cone);

      const light = new THREE.PointLight(
        colorHex,
        MIKU_CONFIG.lighting.spotlightLightIntensity,
        MIKU_CONFIG.lighting.spotlightLightDistance,
        MIKU_CONFIG.lighting.spotlightLightDecay,
      );
      light.position.set(0, -1.8, 1.5);
      beamPivot.add(light);

      rigGroup.add(beamPivot);
      this.root.add(rigGroup);
      this.spotlights.push({
        beamPivot,
        coneMat,
        light,
        phase: i * 1.05,
      });
    }
  }

  private buildSynthMoteCurtain(): void {
    const count = MIKU_CONFIG.synthMoteCount;
    const maxR = MIKU_CONFIG.synthMoteRadius;
    const maxH = MIKU_CONFIG.synthMoteMaxHeight;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 13.5 + Math.random() * (maxR - 13.5);
      const ang = Math.random() * Math.PI * 2;
      positions[i * 3 + 0] = Math.cos(ang) * r;
      positions[i * 3 + 1] = Math.random() * maxH;
      positions[i * 3 + 2] = Math.sin(ang) * r;

      this.synthMoteVelocities.push({
        vy: 0.72 + Math.random() * 1.15,
        swaySpeed: 0.8 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const geo = this.trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = this.trackMat(
      new THREE.PointsMaterial({
        map: ToonAssets.getSparkTexture(),
        color: PALETTE.mikuCyan,
        size: 0.3,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.synthMoteCurtain = new THREE.Points(geo, mat);
    this.root.add(this.synthMoteCurtain);
  }

  public update(dt: number, elapsed: number): void {
    // 1. Refresh monolith spectrum analyzer CanvasTexture (~24 Hz)
    this.eqRefreshAccum += dt;
    if (this.eqRefreshAccum >= 0.042) {
      this.eqRefreshAccum = 0;
      this.drawMonolithSpectrumFrame(elapsed);
    }

    // 2. Rotate stage neon frequency halo rings
    for (let i = 0; i < this.floatingHaloRings.length; i++) {
      const ring = this.floatingHaloRings[i];
      if (ring) {
        ring.mesh.rotation.z += ring.speed * dt;
      }
    }

    // 3. Hover and spin floating geometric tuning crystals
    for (let i = 0; i < this.tuningCrystals.length; i++) {
      const tc = this.tuningCrystals[i];
      if (!tc) continue;
      tc.group.position.y =
        tc.baseY + Math.sin(elapsed * 2.3 + tc.phase) * 0.22;
      tc.group.rotation.y = elapsed * 1.25 + tc.phase;
    }

    // 4. Sweep stage spotlight beams across the concert arena
    for (let i = 0; i < this.spotlights.length; i++) {
      const sp = this.spotlights[i];
      if (!sp) continue;
      sp.beamPivot.rotation.y = Math.sin(elapsed * 1.1 + sp.phase) * 0.32;
      sp.beamPivot.rotation.x = 0.5 + Math.cos(elapsed * 0.9 + sp.phase) * 0.12;
      const pulse = 0.88 + 0.14 * Math.sin(elapsed * 4.2 + sp.phase);
      sp.coneMat.opacity = 0.13 * pulse;
      sp.light.intensity =
        MIKU_CONFIG.lighting.spotlightLightIntensity * pulse;
    }

    // 5. Rise outer synth-mote curtain
    if (this.synthMoteCurtain) {
      const posAttr = this.synthMoteCurtain.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const maxH = MIKU_CONFIG.synthMoteMaxHeight;

      for (let i = 0; i < this.synthMoteVelocities.length; i++) {
        const vel = this.synthMoteVelocities[i];
        if (!vel) continue;
        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        let z = posAttr.getZ(i);

        y += vel.vy * dt;
        x += Math.sin(elapsed * vel.swaySpeed + vel.phase) * 0.28 * dt;
        z += Math.cos(elapsed * vel.swaySpeed + vel.phase) * 0.28 * dt;

        if (y > maxH) {
          y = 0.1;
        }
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    for (let i = 0; i < this.ownedGeometries.length; i++) {
      this.ownedGeometries[i]?.dispose();
    }
    for (let i = 0; i < this.ownedMaterials.length; i++) {
      this.ownedMaterials[i]?.dispose();
    }
    for (let i = 0; i < this.ownedTextures.length; i++) {
      this.ownedTextures[i]?.dispose();
    }
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.ownedTextures.length = 0;
  }
}
