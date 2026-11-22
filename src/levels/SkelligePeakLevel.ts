import * as THREE from 'three';
import { PALETTE, SKELLIGE_PEAK_CONFIG } from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';
import type { ChamberCollider } from './IcePalaceLevel';

interface WindSnowVelocity {
  readonly vy: number;
  readonly windFactor: number;
  readonly swaySpeed: number;
  readonly phase: number;
}

/**
 * Self-contained procedural 3D Special Scenario boss arena: **Skellige Obsidian Peak** (`skellige_peak`).
 *
 * - Storm-lit circular snow-dusted obsidian mountain terrace (`radius: 18m` matching standard boss arenas)
 * - Ringed by 10 rune-carved volcanic cliff monoliths with glowing violet runic carvings
 * - Encircled by 16 distant jagged snow-capped peaks beneath a twilight violet-indigo storm sky dome
 * - Pooled wind-swept snow particle system with zero per-frame allocations.
 */
export class SkelligePeakLevel {
  public readonly root = new THREE.Group();

  private readonly _pillarColliders: ChamberCollider[] = [];
  private readonly _pillarMeshes: THREE.Object3D[] = [];
  private readonly _cameraColliders: THREE.Object3D[] = [];

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];

  private readonly snowVelocities: WindSnowVelocity[] = [];
  private readonly runeMaterials: THREE.MeshBasicMaterial[] = [];
  private snowSystem: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > | null = null;
  private stormHaloRing: THREE.Mesh | null = null;

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
    this.root.name = 'SkelligePeakLevel';
    this.buildTwilightSkyDome();
    this.buildObsidianSnowTerrace();
    this.buildRuneCarvedCliffMonoliths();
    this.buildDistantJaggedPeaks();
    this.buildWindSweptSnowPool();
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
   * Twilight violet-indigo storm sky dome with subtle cloud streaks and high storm-moon.
   */
  private buildTwilightSkyDome(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0.0, PALETTE.hex.midnightSky);
      grad.addColorStop(0.42, PALETTE.hex.skelligeTwilightSky);
      grad.addColorStop(0.74, PALETTE.hex.skelligeHorizonViolet);
      grad.addColorStop(1.0, PALETTE.hex.abyssalCloak);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      // Windswept twilight storm cloud ribbons
      for (let i = 0; i < 16; i++) {
        const cy = 120 + ((i * 29) % 240);
        const cx = (i * 97) % 512;
        const w = 130 + (i % 4) * 55;
        const h = 14 + (i % 3) * 10;
        const cloudGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, w);
        cloudGrad.addColorStop(0, 'rgba(139, 92, 246, 0.22)');
        cloudGrad.addColorStop(0.6, 'rgba(30, 27, 75, 0.16)');
        cloudGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = cloudGrad;
        ctx.fillRect(cx - w, cy - h * 2, w * 2, h * 4);
      }

      // Cold stars piercing the upper zenith
      ctx.fillStyle = PALETTE.hex.skelligeSnowDust;
      for (let s = 0; s < 160; s++) {
        const sx = (s * 7919) % 512;
        const sy = (s * 4211) % 210;
        const r = s % 9 === 0 ? 1.8 : 1.0;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const skyTex = this.trackTex(new THREE.CanvasTexture(canvas));
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyMesh = new THREE.Mesh(
      this.trackGeo(
        new THREE.SphereGeometry(SKELLIGE_PEAK_CONFIG.skyDomeRadius, 28, 20),
      ),
      this.trackMat(
        new THREE.MeshBasicMaterial({
          map: skyTex,
          side: THREE.BackSide,
          fog: false,
        }),
      ),
    );
    this.root.add(skyMesh);

    // Pale storm-lit moon framed behind the distant peaks
    const moon = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(5.2, 20, 16)),
      this.trackMat(
        new THREE.MeshBasicMaterial({
          color: PALETTE.skelligeSnowDust,
          fog: false,
        }),
      ),
    );
    moon.position.set(-46, 54, -92);
    this.root.add(moon);
  }

  /**
   * Circular snow-dusted obsidian mountain terrace (`radius = 18m`) with procedural cracked basalt
   * slabs, wind-blown snow drifts, and glowing violet-silver runic ward circle.
   */
  private buildObsidianSnowTerrace(): void {
    const R = SKELLIGE_PEAK_CONFIG.arenaRadius;
    const size = SKELLIGE_PEAK_CONFIG.floorTextureSize;
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
      // Dark volcanic obsidian base
      const rockGrad = dCtx.createRadialGradient(c, c, 36, c, c, c);
      rockGrad.addColorStop(0, PALETTE.hex.shadowSlate);
      rockGrad.addColorStop(0.68, PALETTE.hex.skelligeObsidianRock);
      rockGrad.addColorStop(1, PALETTE.hex.abyssalCloak);
      dCtx.fillStyle = rockGrad;
      dCtx.fillRect(0, 0, size, size);

      // Cracked basalt fractures & radial masonry joints
      dCtx.save();
      dCtx.translate(c, c);
      dCtx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
      dCtx.lineWidth = 3;
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2;
        dCtx.beginPath();
        dCtx.moveTo(Math.cos(ang) * 48, Math.sin(ang) * 48);
        dCtx.lineTo(Math.cos(ang + 0.08) * 260, Math.sin(ang + 0.08) * 260);
        dCtx.lineTo(Math.cos(ang - 0.04) * c, Math.sin(ang - 0.04) * c);
        dCtx.stroke();
      }
      dCtx.restore();

      // Windswept snow dusting patches across the obsidian stone (heavier near perimeter)
      for (let i = 0; i < 42; i++) {
        const ang = (i * 2.39996) % (Math.PI * 2);
        const rad = 110 + ((i * 73) % 360);
        const sx = c + Math.cos(ang) * rad;
        const sy = c + Math.sin(ang) * rad;
        const sr = 36 + (i % 5) * 24;
        const snowGrad = dCtx.createRadialGradient(sx, sy, 4, sx, sy, sr);
        snowGrad.addColorStop(0, 'rgba(219, 234, 254, 0.56)');
        snowGrad.addColorStop(0.6, 'rgba(203, 213, 225, 0.24)');
        snowGrad.addColorStop(1, 'rgba(219, 234, 254, 0)');
        dCtx.fillStyle = snowGrad;
        dCtx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      }

      eCtx.fillStyle = PALETTE.hex.pureBlack;
      eCtx.fillRect(0, 0, size, size);

      // Ancient Skellige-violet carved rune circles
      const drawRunes = (ctx: CanvasRenderingContext2D, emissive: boolean) => {
        ctx.save();
        ctx.translate(c, c);
        const violet = emissive
          ? 'rgba(168, 85, 247, 0.85)'
          : 'rgba(139, 92, 246, 0.52)';
        const amber = emissive
          ? 'rgba(245, 158, 11, 0.72)'
          : 'rgba(245, 158, 11, 0.42)';

        const ringRadii = [116, 248, 396, 444];
        ringRadii.forEach((r, idx) => {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.strokeStyle = idx === 1 ? amber : violet;
          ctx.lineWidth = idx % 2 === 0 ? 5 : 3;
          ctx.stroke();
        });

        // 10-pointed rune compass markers aligned to perimeter cliff monoliths
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          ctx.save();
          ctx.rotate(a);
          ctx.strokeStyle = i % 2 === 0 ? violet : amber;
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(0, 248);
          ctx.lineTo(0, 444);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      };
      drawRunes(dCtx, false);
      drawRunes(eCtx, true);
    }

    const diffuseMap = this.trackTex(new THREE.CanvasTexture(diffCanvas));
    diffuseMap.colorSpace = THREE.SRGBColorSpace;
    diffuseMap.anisotropy = 4;

    const emissiveMap = this.trackTex(new THREE.CanvasTexture(emisCanvas));
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.anisotropy = 4;

    const floorGeo = this.trackGeo(
      new THREE.CylinderGeometry(R, R + 0.85, 1.1, 48),
    );
    const topMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: diffuseMap,
        emissive: new THREE.Color(PALETTE.amethystTrim),
        emissiveMap,
        emissiveIntensity: 0.72,
        roughness: 0.48,
        metalness: 0.22,
      }),
    );
    const cliffSideMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.skelligeObsidianRock),
    );
    const floorMesh = new THREE.Mesh(floorGeo, [
      cliffSideMat,
      topMat,
      cliffSideMat,
    ]);
    floorMesh.position.y = -0.55;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    // Jagged obsidian peak underside plunging into the storm clouds
    const peakBase = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(R + 1.2, 32, 14)),
      cliffSideMat,
    );
    peakBase.rotation.x = Math.PI;
    peakBase.position.y = -17.0;
    this.root.add(peakBase);

    // Subtle swirling ground storm-rune halo
    const haloMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.amethystTrim,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.stormHaloRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(8.8, 9.08, 48)),
      haloMat,
    );
    this.stormHaloRing.rotation.x = -Math.PI / 2;
    this.stormHaloRing.position.y = 0.03;
    this.root.add(this.stormHaloRing);
  }

  /**
   * Ring of 10 rune-carved volcanic obsidian cliff monoliths around the terrace edge.
   */
  private buildRuneCarvedCliffMonoliths(): void {
    const count = SKELLIGE_PEAK_CONFIG.monolithCount;
    const ringR = SKELLIGE_PEAK_CONFIG.monolithRingRadius;
    const baseH = SKELLIGE_PEAK_CONFIG.monolithHeight;

    const rockMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.skelligeObsidianRock, {
        emissive: PALETTE.skelligeTwilightSky,
        emissiveIntensity: 0.16,
      }),
    );
    const snowCapMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.skelligeSnowDust),
    );

    const shardGeo = this.trackGeo(new THREE.CylinderGeometry(0.42, 0.92, 1.0, 5));
    const capGeo = this.trackGeo(new THREE.ConeGeometry(0.55, 0.75, 5));
    const runeGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 2.8, 0.08));

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const mx = Math.cos(ang) * ringR;
      const mz = Math.sin(ang) * ringR;
      const h = baseH * (0.82 + (i % 3) * 0.18);

      const mGroup = new THREE.Group();
      mGroup.position.set(mx, 0, mz);
      mGroup.lookAt(0, 0, 0);

      const monolithMesh = new THREE.Mesh(shardGeo, rockMat);
      monolithMesh.scale.set(1.0, h, 0.85);
      monolithMesh.position.y = h * 0.45;
      monolithMesh.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.08;
      monolithMesh.castShadow = true;
      monolithMesh.receiveShadow = true;
      mGroup.add(monolithMesh);

      // Snow-dusted jagged monolith cap
      const snowCap = new THREE.Mesh(capGeo, snowCapMat);
      snowCap.position.set(0, h * 0.92, 0);
      snowCap.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.08;
      mGroup.add(snowCap);

      // Vertical carved glowing rune band facing the arena center
      const runeMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? PALETTE.amethystTrim : PALETTE.riftAmber,
          transparent: true,
          opacity: 0.85,
        }),
      );
      this.runeMaterials.push(runeMat);
      const runeStrip = new THREE.Mesh(runeGeo, runeMat);
      runeStrip.position.set(0, h * 0.44, 0.56);
      mGroup.add(runeStrip);

      this.root.add(mGroup);
      this._pillarColliders.push({
        x: mx,
        z: mz,
        radius: SKELLIGE_PEAK_CONFIG.monolithCollisionRadius,
        height: h,
      });
      this._pillarMeshes.push(monolithMesh);
      this._cameraColliders.push(monolithMesh);
    }
  }

  /**
   * Ring of 16 distant jagged obsidian & snow-capped Skellige mountain peaks.
   */
  private buildDistantJaggedPeaks(): void {
    const count = SKELLIGE_PEAK_CONFIG.distantPeakCount;
    const minR = SKELLIGE_PEAK_CONFIG.distantPeakMinRadius;
    const maxR = SKELLIGE_PEAK_CONFIG.distantPeakMaxRadius;

    const peakRockMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.skelligeObsidianRock, {
        emissive: PALETTE.skelligeHorizonViolet,
        emissiveIntensity: 0.14,
      }),
    );
    const peakSnowMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.skelligeSnowDust, {
        emissive: PALETTE.pulseLavender,
        emissiveIntensity: 0.1,
      }),
    );

    const coneGeo = this.trackGeo(new THREE.ConeGeometry(1.0, 1.0, 5));
    const snowGeo = this.trackGeo(new THREE.ConeGeometry(0.46, 0.42, 5));

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (i % 2) * 0.14;
      const dist = minR + ((i * 19) % (maxR - minR));
      const h = 24 + (i % 4) * 11;
      const r = 8 + (i % 3) * 4.5;

      const peakGroup = new THREE.Group();
      peakGroup.position.set(Math.cos(ang) * dist, -12, Math.sin(ang) * dist);
      peakGroup.rotation.y = i * 1.1;

      const body = new THREE.Mesh(coneGeo, peakRockMat);
      body.scale.set(r, h, r * 0.85);
      body.position.y = h * 0.5;
      peakGroup.add(body);

      const cap = new THREE.Mesh(snowGeo, peakSnowMat);
      cap.scale.set(r, h * 0.85, r * 0.85);
      cap.position.y = h * 0.84;
      peakGroup.add(cap);

      this.root.add(peakGroup);
    }
  }

  /**
   * Pooled wind-swept snow particle system blowing diagonally across Skellige Peak.
   */
  private buildWindSweptSnowPool(): void {
    const count = SKELLIGE_PEAK_CONFIG.snowCount;
    const maxR = SKELLIGE_PEAK_CONFIG.snowAreaRadius;
    const maxH = SKELLIGE_PEAK_CONFIG.snowMaxHeight;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * maxR * 2;
      positions[i * 3 + 1] = Math.random() * maxH;
      positions[i * 3 + 2] = (Math.random() - 0.5) * maxR * 2;

      this.snowVelocities.push({
        vy: -(1.45 + Math.random() * 1.35),
        windFactor: 0.72 + Math.random() * 0.65,
        swaySpeed: 1.2 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const geo = this.trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = this.trackMat(
      new THREE.PointsMaterial({
        map: ToonAssets.getSnowTexture(),
        color: PALETTE.skelligeSnowDust,
        size: 0.3,
        transparent: true,
        opacity: 0.84,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.snowSystem = new THREE.Points(geo, mat);
    this.root.add(this.snowSystem);
  }

  public update(dt: number, elapsed: number): void {
    if (this.stormHaloRing) {
      this.stormHaloRing.rotation.z = elapsed * 0.14;
    }

    for (let i = 0; i < this.runeMaterials.length; i++) {
      const m = this.runeMaterials[i];
      if (!m) continue;
      m.opacity = 0.65 + 0.3 * Math.sin(elapsed * 2.4 + i * 0.8);
    }

    if (this.snowSystem) {
      const posAttr = this.snowSystem.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const maxR = SKELLIGE_PEAK_CONFIG.snowAreaRadius;
      const maxH = SKELLIGE_PEAK_CONFIG.snowMaxHeight;
      const gust = 1.0 + Math.sin(elapsed * 0.85) * 0.35;

      for (let i = 0; i < this.snowVelocities.length; i++) {
        const vel = this.snowVelocities[i];
        if (!vel) continue;

        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        let z = posAttr.getZ(i);

        y += vel.vy * dt;
        x += SKELLIGE_PEAK_CONFIG.snowWindX * vel.windFactor * gust * dt;
        z +=
          (SKELLIGE_PEAK_CONFIG.snowWindZ * vel.windFactor +
            Math.sin(elapsed * vel.swaySpeed + vel.phase) * 0.65) *
          dt;

        if (y < 0.05) y = maxH;
        if (x > maxR) x = -maxR;
        if (z > maxR) z = -maxR;
        if (z < -maxR) z = maxR;

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
  }
}
