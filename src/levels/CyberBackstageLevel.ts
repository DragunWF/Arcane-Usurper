import * as THREE from 'three';
import {
  ARENA_CONFIG,
  DESTRUCTIBLE_PROP_TYPES,
  HARMONIC_CHAMBER_CONFIG,
  PALETTE,
} from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';
import type { ChamberCollider, FrostUrnSpawnRecord } from './IcePalaceLevel';

interface SubwooferConeRecord {
  readonly mesh: THREE.Mesh;
  readonly ringMesh: THREE.Mesh;
  readonly baseZ: number;
  readonly phase: number;
}

interface SpotlightBeamRecord {
  readonly pivot: THREE.Group;
  readonly coneMat: THREE.MeshBasicMaterial;
  readonly light: THREE.PointLight | null;
  readonly baseAngleZ: number;
  readonly phase: number;
}

interface SynthMoteVelocity {
  readonly vy: number;
  readonly swaySpeed: number;
  readonly phase: number;
}

const HARMONIC_PORTAL_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HARMONIC_PORTAL_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uIgnite;
  uniform float uCharge;
  uniform float uArms;
  uniform vec3 uColorEmerald;
  uniform vec3 uColorMagenta;
  uniform vec3 uColorCyan;
  uniform vec3 uColorDeep;
  varying vec2 vUv;

  void main() {
    vec2 centered = (vUv - 0.5) * 2.0;
    float dist = length(centered);
    if (dist > 1.0) discard;

    float angle = atan(centered.y, centered.x);
    float swirl = angle * uArms + dist * 7.8 - uTime * 3.4;
    float wave = 0.5 + 0.5 * sin(swirl);
    float counter = 0.5 + 0.5 * cos(angle * (uArms - 2.0) - dist * 9.0 + uTime * 2.6);
    float eqPulse = 0.5 + 0.5 * sin(dist * 18.0 - uTime * 5.2);

    float energy = mix(wave, counter, 0.46) * 0.7 + eqPulse * 0.3;
    vec3 col = mix(uColorDeep, uColorEmerald, clamp(energy * 1.18, 0.0, 1.0));
    col = mix(col, uColorMagenta, smoothstep(0.38, 0.92, counter * (1.0 - dist * 0.25)));
    col = mix(col, uColorCyan, smoothstep(0.42, 0.0, dist) * (0.45 + 0.55 * uIgnite));

    float rim = smoothstep(0.76, 0.98, dist) * (1.0 - smoothstep(0.96, 1.0, dist));
    col += uColorMagenta * rim * (0.75 + 0.35 * sin(uTime * 6.0));

    float edgeFade = 1.0 - smoothstep(0.88, 1.0, dist);
    float visibility = clamp(uIgnite * 0.94 + uCharge * 0.25, 0.0, 0.96);
    float alpha = edgeFade * visibility * (0.56 + 0.44 * energy);
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(col * (0.9 + 0.55 * uIgnite), alpha);
  }
`;

/**
 * Self-contained procedural 3D environment for Realm III: **The Cyber-Arcane Backstage Hall**.
 *
 * Built with cel-shaded MeshToonMaterial + ink-black BackSide outlines:
 * - Dark matte stage flooring inlaid with cyan/magenta hazard stripes, glowing power-conduit
 *   channels, and a central dark-velvet VIP runner
 * - Single-sided FrontSide inward outer walls & interior subwoofer speaker-stack cameraColliders
 * - Brushed-chrome overhead lighting trusses casting angled emerald (#10B981) and magenta (#EC4899)
 *   spotlight cones
 * - Towering line-array subwoofer speaker-stack pillars with pulsing speaker cones
 * - Stacked roadie flight cases, floating holographic mixing desks with animated CanvasTexture
 *   equalizer bars, and holographic wardrobe racks
 * - 8 destructible Acoustic Capacitor Canisters (ACOUSTIC_CAPACITOR) returned for ECS registration
 * - Hydraulic VIP Stage-Lift / Harmonic Astral Portal dais with 12 runic LEDs & GLSL vortex.
 */
export class CyberBackstageLevel {
  public readonly root = new THREE.Group();
  public readonly portalPosition = new THREE.Vector3(
    0,
    HARMONIC_CHAMBER_CONFIG.portalCenterY,
    HARMONIC_CHAMBER_CONFIG.portalZ,
  );

  private readonly _pillarColliders: ChamberCollider[] = [];
  private readonly _pillarMeshes: THREE.Object3D[] = [];
  private readonly _cameraColliders: THREE.Object3D[] = [];
  private readonly _urnSpawns: FrostUrnSpawnRecord[] = [];
  private readonly subwooferCones: SubwooferConeRecord[] = [];
  private readonly spotlights: SpotlightBeamRecord[] = [];
  private readonly portalRuneMaterials: THREE.MeshBasicMaterial[] = [];

  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  private eqCanvas: HTMLCanvasElement | null = null;
  private eqCtx: CanvasRenderingContext2D | null = null;
  private eqTexture: THREE.CanvasTexture | null = null;
  private eqRefreshAccum = 0;

  private portalSealMesh: THREE.Mesh | null = null;
  private portalSealMat: THREE.MeshBasicMaterial | null = null;
  private portalVortexMesh: THREE.Mesh | null = null;
  private portalVortexMat: THREE.ShaderMaterial | null = null;
  private portalInnerRing: THREE.Mesh | null = null;
  private portalPointLight: THREE.PointLight | null = null;

  private synthMotes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > | null = null;
  private readonly synthMoteVelocities: SynthMoteVelocity[] = [];

  private currentPortalCharge = 0;
  private currentPortalIgnited = false;
  private portalIgniteBlend = 0;

  public get pillarColliders(): readonly ChamberCollider[] {
    return this._pillarColliders;
  }

  public get pillarMeshes(): readonly THREE.Object3D[] {
    return this._pillarMeshes;
  }

  public get cameraColliders(): readonly THREE.Object3D[] {
    return this._cameraColliders;
  }

  public get urnSpawns(): readonly FrostUrnSpawnRecord[] {
    return this._urnSpawns;
  }

  constructor() {
    this.root.name = 'CyberBackstageLevel';
    this.initEqualizerCanvasTexture();
    this.buildBackstageFloorAndWalls();
    this.buildSubwooferSpeakerPillars();
    this.buildOverheadChromeTrussesAndSpotlights();
    this.buildBackstageFlightCasesDesksAndWardrobes();
    this.buildAcousticCapacitorCanisters();
    this.buildHydraulicStageLiftPortalDais();
    this.buildNeonSynthMotes();
    this.setPortalCharge(0, false, 0);
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
   * Initializes the shared live animated 256x128 CanvasTexture for holographic mixing desk equalizers.
   */
  private initEqualizerCanvasTexture(): void {
    const w = HARMONIC_CHAMBER_CONFIG.eqTextureWidth;
    const h = HARMONIC_CHAMBER_CONFIG.eqTextureHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    this.eqCanvas = canvas;
    this.eqCtx = canvas.getContext('2d');

    const tex = this.trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    this.eqTexture = tex;
    this.drawEqualizerFrame(0);
  }

  private drawEqualizerFrame(elapsed: number): void {
    const ctx = this.eqCtx;
    const canvas = this.eqCanvas;
    if (!ctx || !canvas || !this.eqTexture) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = PALETTE.hex.cyberObsidian;
    ctx.fillRect(0, 0, w, h);

    // Subtle horizontal decibel grid lines
    ctx.strokeStyle = PALETTE.rgba.cyberGridSoft;
    ctx.lineWidth = 1;
    for (let y = 16; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const barCount = HARMONIC_CHAMBER_CONFIG.eqBarCount;
    const slotW = w / barCount;
    const barW = slotW * 0.68;

    for (let i = 0; i < barCount; i++) {
      const n1 = 0.5 + 0.5 * Math.sin(elapsed * 7.2 + i * 0.65);
      const n2 = 0.5 + 0.5 * Math.cos(elapsed * 11.4 - i * 1.1);
      const level = THREE.MathUtils.clamp(0.18 + (n1 * 0.55 + n2 * 0.45) * 0.78, 0.15, 0.96);
      const barH = level * (h - 14);
      const bx = i * slotW + (slotW - barW) * 0.5;
      const by = h - 6 - barH;

      ctx.fillStyle =
        i % 3 === 0
          ? PALETTE.rgba.eqBarEmerald
          : i % 3 === 1
            ? PALETTE.rgba.eqBarCyan
            : PALETTE.rgba.eqBarMagenta;
      ctx.fillRect(bx, by, barW, barH);

      // Peak hold indicator cap
      ctx.fillStyle = PALETTE.rgba.eqBarPeak;
      ctx.fillRect(bx, Math.max(4, by - 5), barW, 3);
    }

    this.eqTexture.needsUpdate = true;
  }

  private createBackstageFloorTextures(): {
    diffuseMap: THREE.CanvasTexture;
    emissiveMap: THREE.CanvasTexture;
  } {
    const size = HARMONIC_CHAMBER_CONFIG.floorTextureSize;
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dCtx = diffCanvas.getContext('2d');

    const emisCanvas = document.createElement('canvas');
    emisCanvas.width = size;
    emisCanvas.height = size;
    const eCtx = emisCanvas.getContext('2d');

    if (dCtx && eCtx) {
      dCtx.fillStyle = PALETTE.hex.cyberObsidian;
      dCtx.fillRect(0, 0, size, size);

      const tiles = 4;
      const tileSize = size / tiles;
      for (let gx = 0; gx < tiles; gx++) {
        for (let gy = 0; gy < tiles; gy++) {
          dCtx.fillStyle =
            (gx + gy) % 2 === 0
              ? PALETTE.hex.cyberObsidian
              : PALETTE.hex.cyberStageDark;
          dCtx.fillRect(gx * tileSize, gy * tileSize, tileSize, tileSize);

          dCtx.strokeStyle = PALETTE.rgba.cyberTileJoint;
          dCtx.lineWidth = 4;
          dCtx.strokeRect(
            gx * tileSize + 2,
            gy * tileSize + 2,
            tileSize - 4,
            tileSize - 4,
          );
        }
      }

      eCtx.fillStyle = PALETTE.hex.pureBlack;
      eCtx.fillRect(0, 0, size, size);

      const drawInlays = (ctx: CanvasRenderingContext2D): void => {
        // Longitudinal glowing power-conduit channels
        const conduitX = [size * 0.22, size * 0.78];
        conduitX.forEach((x, idx) => {
          ctx.strokeStyle =
            idx === 0
              ? PALETTE.rgba.cyberGridEmerald
              : PALETTE.rgba.cyberGridMagenta;
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size);
          ctx.stroke();

          ctx.strokeStyle = PALETTE.rgba.eqBarCyan;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size);
          ctx.stroke();
        });

        // Diagonal cyan/magenta backstage hazard stripes along equipment edges
        const stripeZones = [
          { x: size * 0.08, w: size * 0.07 },
          { x: size * 0.85, w: size * 0.07 },
        ];
        stripeZones.forEach((z, zIdx) => {
          const step = 32;
          for (let y = -step; y < size + step; y += step) {
            ctx.fillStyle =
              ((y / step) & 1) === 0
                ? zIdx === 0
                  ? PALETTE.rgba.hazardStripeCyan
                  : PALETTE.rgba.hazardStripeMagenta
                : PALETTE.rgba.cyberTileJoint;
            ctx.beginPath();
            ctx.moveTo(z.x, y);
            ctx.lineTo(z.x + z.w, y + step * 0.65);
            ctx.lineTo(z.x + z.w, y + step * 1.15);
            ctx.lineTo(z.x, y + step * 0.5);
            ctx.closePath();
            ctx.fill();
          }
        });
      };

      drawInlays(dCtx);
      drawInlays(eCtx);
    }

    const diffuseMap = this.trackTex(new THREE.CanvasTexture(diffCanvas));
    diffuseMap.colorSpace = THREE.SRGBColorSpace;
    diffuseMap.wrapS = THREE.RepeatWrapping;
    diffuseMap.wrapT = THREE.RepeatWrapping;
    diffuseMap.repeat.set(2, 4);
    diffuseMap.anisotropy = 4;

    const emissiveMap = this.trackTex(new THREE.CanvasTexture(emisCanvas));
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.wrapS = THREE.RepeatWrapping;
    emissiveMap.wrapT = THREE.RepeatWrapping;
    emissiveMap.repeat.set(2, 4);
    emissiveMap.anisotropy = 4;

    return { diffuseMap, emissiveMap };
  }

  private buildBackstageFloorAndWalls(): void {
    const cfg = HARMONIC_CHAMBER_CONFIG;
    const W = cfg.width;
    const L = cfg.length;
    const H = cfg.wallHeight;
    const T = cfg.wallThickness;

    const { diffuseMap, emissiveMap } = this.createBackstageFloorTextures();
    const floorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: diffuseMap,
        emissive: new THREE.Color(PALETTE.mikuCyan),
        emissiveMap,
        emissiveIntensity: 0.62,
        roughness: 0.25,
        metalness: 0.36,
      }),
    );
    const floorMesh = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(W, 0.8, L)),
      floorMat,
    );
    floorMesh.position.set(0, -0.4, 0);
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    // Central Dark-Velvet VIP Runner with Neon Magenta & Emerald Border Strips
    const runnerLen = cfg.carpetStartZ - cfg.carpetEndZ;
    const runnerMidZ = (cfg.carpetStartZ + cfg.carpetEndZ) * 0.5;
    const velvetMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.galleryVelvet, {
        emissive: PALETTE.harmonicMagenta,
        emissiveIntensity: 0.16,
      }),
    );
    const runnerMesh = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(cfg.carpetWidth, runnerLen)),
      velvetMat,
    );
    runnerMesh.rotation.x = -Math.PI / 2;
    runnerMesh.position.set(0, cfg.carpetY, runnerMidZ);
    runnerMesh.receiveShadow = true;
    this.root.add(runnerMesh);

    const emeraldStripMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicEmerald }),
    );
    const magentaStripMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicMagenta }),
    );
    const stripGeo = this.trackGeo(new THREE.PlaneGeometry(0.12, runnerLen));
    ([-1, 1] as const).forEach((side) => {
      const strip = new THREE.Mesh(
        stripGeo,
        side < 0 ? emeraldStripMat : magentaStripMat,
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(
        side * (cfg.carpetWidth * 0.5 + 0.08),
        cfg.carpetY + 0.002,
        runnerMidZ,
      );
      this.root.add(strip);
    });

    // Single-sided FrontSide inward-facing perimeter walls (prevents camera clipping)
    const wallMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.cyberObsidian, {
        emissive: PALETTE.cyberStageDark,
        emissiveIntensity: 0.22,
        side: THREE.FrontSide,
      }),
    );
    const ceilingMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.cyberObsidian, {
        side: THREE.FrontSide,
      }),
    );

    const sideWallGeo = this.trackGeo(new THREE.PlaneGeometry(L, H));
    const trimGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 0.14, L));
    ([-1, 1] as const).forEach((side) => {
      const wall = new THREE.Mesh(sideWallGeo, wallMat);
      wall.position.set(side * (W * 0.5), H * 0.5, 0);
      wall.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
      wall.receiveShadow = true;
      this.root.add(wall);
      this._pillarMeshes.push(wall);

      const lowerTrim = new THREE.Mesh(trimGeo, emeraldStripMat);
      lowerTrim.position.set(side * (W * 0.5 - 0.06), 1.35, 0);
      this.root.add(lowerTrim);

      const upperTrim = new THREE.Mesh(trimGeo, magentaStripMat);
      upperTrim.position.set(side * (W * 0.5 - 0.06), cfg.pillarHeight, 0);
      this.root.add(upperTrim);
    });

    const endWallGeo = this.trackGeo(new THREE.PlaneGeometry(W, H));
    const backWall = new THREE.Mesh(endWallGeo, wallMat);
    backWall.position.set(0, H * 0.5, -(L * 0.5));
    backWall.receiveShadow = true;
    this.root.add(backWall);
    this._pillarMeshes.push(backWall);

    const frontWall = new THREE.Mesh(endWallGeo, wallMat);
    frontWall.position.set(0, H * 0.5, L * 0.5);
    frontWall.rotation.y = Math.PI;
    frontWall.receiveShadow = true;
    this.root.add(frontWall);
    this._pillarMeshes.push(frontWall);

    const ceilMesh = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(W + T * 2, L + T * 2)),
      ceilingMat,
    );
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set(0, cfg.ceilingY, 0);
    this.root.add(ceilMesh);
  }

  /**
   * Towering line-array subwoofer speaker-stack pillars with pulsing speaker cones
   * exposed in both pillarColliders and cameraColliders.
   */
  private buildSubwooferSpeakerPillars(): void {
    const cfg = HARMONIC_CHAMBER_CONFIG;
    const cabinetMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.cyberStageDark, {
        emissive: PALETTE.cyberObsidian,
        emissiveIntensity: 0.2,
      }),
    );
    const chromeMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.trussChrome, {
        emissive: PALETTE.mikuCyan,
        emissiveIntensity: 0.14,
      }),
    );
    const coneMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.speakerConeDark),
    );
    const emeraldLedMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicEmerald }),
    );
    const magentaLedMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicMagenta }),
    );

    const pillarH = cfg.pillarHeight;
    const plinthGeo = this.trackGeo(new THREE.BoxGeometry(1.65, 0.65, 1.55));
    const cabinetGeo = this.trackGeo(
      new THREE.BoxGeometry(1.38, pillarH - 1.3, 1.28),
    );
    const capGeo = this.trackGeo(new THREE.BoxGeometry(1.56, 0.65, 1.46));
    const wooferConeGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.42, 0.16, 0.22, 16),
    );
    wooferConeGeo.rotateX(Math.PI / 2);
    const wooferRingGeo = this.trackGeo(new THREE.TorusGeometry(0.43, 0.035, 8, 20));
    const ledStripGeo = this.trackGeo(
      new THREE.BoxGeometry(0.06, pillarH - 1.6, 0.08),
    );

    const sides: readonly (-1 | 1)[] = [-1, 1];
    for (let i = 0; i < cfg.pillarCountPerSide; i++) {
      const pz = cfg.pillarStartZ - i * cfg.pillarSpacing;

      sides.forEach((side) => {
        const px = side * cfg.pillarRowX;
        const stackGroup = new THREE.Group();
        stackGroup.position.set(px, 0, pz);
        // Orient speaker cones inward toward the central VIP runner
        stackGroup.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;

        const { group: plinthObj, mainMesh: plinthMesh } =
          ToonAssets.createOutlinedMesh(plinthGeo, chromeMat, 1.04, true);
        plinthObj.position.y = 0.325;
        stackGroup.add(plinthObj);

        const { group: cabObj, mainMesh: cabMesh } =
          ToonAssets.createOutlinedMesh(
            cabinetGeo,
            cabinetMat,
            { x: 1.05, y: 1.01, z: 1.05 },
            true,
          );
        cabObj.position.y = 0.65 + (pillarH - 1.3) * 0.5;
        stackGroup.add(cabObj);

        const { group: capObj } = ToonAssets.createOutlinedMesh(
          capGeo,
          chromeMat,
          1.04,
          true,
        );
        capObj.position.y = pillarH - 0.325;
        stackGroup.add(capObj);

        // Twin vertical LED accent bars framing the speaker array
        ([-1, 1] as const).forEach((edge) => {
          const led = new THREE.Mesh(
            ledStripGeo,
            i % 2 === 0 ? emeraldLedMat : magentaLedMat,
          );
          led.position.set(edge * 0.66, pillarH * 0.5, 0.65);
          stackGroup.add(led);
        });

        // 4 Vertically Stacked Pulsing Subwoofer Cones
        for (let c = 0; c < 4; c++) {
          const cy = 1.65 + c * 1.68;
          const coneMesh = new THREE.Mesh(wooferConeGeo, coneMat);
          coneMesh.position.set(0, cy, 0.64);
          stackGroup.add(coneMesh);

          const ringMesh = new THREE.Mesh(
            wooferRingGeo,
            (i + c) % 2 === 0 ? emeraldLedMat : magentaLedMat,
          );
          ringMesh.position.set(0, cy, 0.68);
          stackGroup.add(ringMesh);

          this.subwooferCones.push({
            mesh: coneMesh,
            ringMesh,
            baseZ: 0.64,
            phase: i * 0.9 + c * 0.45,
          });
        }

        this.root.add(stackGroup);

        this._pillarColliders.push({
          x: px,
          z: pz,
          radius: cfg.pillarCollisionRadius,
          height: pillarH,
        });
        this._pillarMeshes.push(cabMesh, plinthMesh);
        this._cameraColliders.push(cabMesh, plinthMesh);
      });
    }
  }

  /**
   * Brushed-chrome overhead stage lighting trusses spanning between the subwoofer towers
   * and casting sweeping emerald & magenta spotlight cones onto the backstage floor.
   */
  private buildOverheadChromeTrussesAndSpotlights(): void {
    const cfg = HARMONIC_CHAMBER_CONFIG;
    const chromeMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.trussChrome, {
        emissive: PALETTE.mikuCyan,
        emissiveIntensity: 0.12,
      }),
    );
    const fixtureMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.cyberObsidian),
    );

    const beamSpanGeo = this.trackGeo(
      new THREE.BoxGeometry(cfg.trussSpanX, 0.42, 0.42),
    );
    const riserGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.14, 0.14, cfg.trussY - cfg.pillarHeight + 0.2, 6),
    );
    const canGeo = this.trackGeo(new THREE.CylinderGeometry(0.22, 0.28, 0.55, 8));
    const coneGeo = this.trackGeo(
      new THREE.ConeGeometry(
        cfg.spotlightConeRadius,
        cfg.spotlightConeLength,
        16,
        1,
        true,
      ),
    );
    coneGeo.translate(0, -cfg.spotlightConeLength * 0.5, 0);

    for (let i = 0; i < cfg.pillarCountPerSide; i++) {
      const tz = cfg.pillarStartZ - i * cfg.pillarSpacing;
      const trussGroup = new THREE.Group();
      trussGroup.position.set(0, cfg.trussY, tz);

      const { group: spanObj } = ToonAssets.createOutlinedMesh(
        beamSpanGeo,
        chromeMat,
        1.04,
        false,
      );
      trussGroup.add(spanObj);

      // Vertical truss risers bolting onto the subwoofer pillar caps
      ([-1, 1] as const).forEach((side) => {
        const riser = new THREE.Mesh(riserGeo, chromeMat);
        riser.position.set(
          side * cfg.pillarRowX,
          -(cfg.trussY - cfg.pillarHeight) * 0.5,
          0,
        );
        trussGroup.add(riser);
      });

      // Twin angled stage spotlight fixtures per truss (emerald & magenta)
      ([-1, 1] as const).forEach((side, sIdx) => {
        const isEmerald = (i + sIdx) % 2 === 0;
        const colorHex = isEmerald
          ? PALETTE.harmonicEmerald
          : PALETTE.harmonicMagenta;

        const pivot = new THREE.Group();
        pivot.position.set(side * 3.8, -0.22, 0);
        const baseAngleZ = -side * 0.26;
        pivot.rotation.z = baseAngleZ;

        const can = new THREE.Mesh(canGeo, fixtureMat);
        pivot.add(can);

        const coneMat = this.trackMat(
          new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.13,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        const coneMesh = new THREE.Mesh(coneGeo, coneMat);
        pivot.add(coneMesh);

        let light: THREE.PointLight | null = null;
        if (i % 2 === 0 && sIdx === (i % 4 === 0 ? 0 : 1)) {
          light = new THREE.PointLight(
            colorHex,
            cfg.lighting.spotlightIntensity,
            cfg.lighting.spotlightDistance,
            cfg.lighting.spotlightDecay,
          );
          light.position.set(0, -4.5, 0);
          pivot.add(light);
        }

        trussGroup.add(pivot);
        this.spotlights.push({
          pivot,
          coneMat,
          light,
          baseAngleZ,
          phase: i * 1.1 + sIdx * 1.7,
        });
      });

      this.root.add(trussGroup);
    }
  }

  /**
   * Stacked roadie flight cases, floating holographic mixing desks with live animated
   * CanvasTexture equalizer bars, and holographic wardrobe racks along the side walls.
   */
  private buildBackstageFlightCasesDesksAndWardrobes(): void {
    const cfg = HARMONIC_CHAMBER_CONFIG;
    const caseMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.flightCaseSlate),
    );
    const chromeMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.trussChrome),
    );
    const emeraldMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicEmerald }),
    );
    const magentaMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicMagenta }),
    );
    const cyanHologramMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.mikuCyan,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const magentaHologramMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.harmonicMagenta,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    const lowerCaseGeo = this.trackGeo(new THREE.BoxGeometry(1.35, 1.05, 1.85));
    const upperCaseGeo = this.trackGeo(new THREE.BoxGeometry(1.15, 0.82, 1.45));
    const trimBandGeo = this.trackGeo(new THREE.BoxGeometry(1.38, 0.08, 1.88));

    // 1. Stacked Roadie Flight Cases
    const sides: readonly (-1 | 1)[] = [-1, 1];
    cfg.flightCaseZPositions.forEach((fz, idx) => {
      sides.forEach((side) => {
        const fx = side * cfg.flightCaseRowX;
        const fg = new THREE.Group();
        fg.position.set(fx, 0, fz);

        const { group: c1 } = ToonAssets.createOutlinedMesh(
          lowerCaseGeo,
          caseMat,
          1.04,
          true,
        );
        c1.position.y = 0.525;
        fg.add(c1);

        const band = new THREE.Mesh(
          trimBandGeo,
          idx % 2 === 0 ? emeraldMat : magentaMat,
        );
        band.position.y = 1.02;
        fg.add(band);

        if ((idx + (side > 0 ? 1 : 0)) % 2 === 0) {
          const { group: c2 } = ToonAssets.createOutlinedMesh(
            upperCaseGeo,
            caseMat,
            1.04,
            true,
          );
          c2.position.set(0, 1.46, 0.05);
          c2.rotation.y = side * 0.14;
          fg.add(c2);
        }

        this.root.add(fg);
        this._pillarColliders.push({
          x: fx,
          z: fz,
          radius: 0.88,
          height: 2.0,
        });
      });
    });

    // 2. Floating Holographic Mixing Desks with Animated CanvasTexture Equalizer Screens
    const deskBaseGeo = this.trackGeo(new THREE.BoxGeometry(1.2, 1.1, 2.2));
    const eqScreenGeo = this.trackGeo(new THREE.PlaneGeometry(2.05, 1.05));
    const eqScreenMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: this.eqTexture,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      }),
    );

    cfg.mixingDeskZPositions.forEach((dz) => {
      sides.forEach((side) => {
        const dx = side * cfg.mixingDeskRowX;
        const dg = new THREE.Group();
        dg.position.set(dx, 0, dz);
        dg.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;

        const { group: baseObj } = ToonAssets.createOutlinedMesh(
          deskBaseGeo,
          chromeMat,
          1.04,
          true,
        );
        baseObj.position.y = 0.55;
        dg.add(baseObj);

        const screen = new THREE.Mesh(eqScreenGeo, eqScreenMat);
        screen.position.set(0, 1.72, -0.2);
        screen.rotation.x = -0.18;
        dg.add(screen);

        this.root.add(dg);
        this._pillarColliders.push({
          x: dx,
          z: dz,
          radius: 0.92,
          height: 2.2,
        });
      });
    });

    // 3. Holographic Wardrobe Racks with Glowing Stage Costume Silhouettes
    const rackPostGeo = this.trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6));
    const rackBarGeo = this.trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 6));
    rackBarGeo.rotateX(Math.PI / 2);
    const outfitConeGeo = this.trackGeo(new THREE.ConeGeometry(0.28, 1.15, 6, 1, true));

    cfg.wardrobeRackZPositions.forEach((wz) => {
      sides.forEach((side) => {
        const wx = side * cfg.wardrobeRackRowX;
        const wg = new THREE.Group();
        wg.position.set(wx, 0, wz);

        ([-0.9, 0.9] as const).forEach((zOff) => {
          const post = new THREE.Mesh(rackPostGeo, chromeMat);
          post.position.set(0, 1.1, zOff);
          wg.add(post);
        });
        const topBar = new THREE.Mesh(rackBarGeo, chromeMat);
        topBar.position.set(0, 2.15, 0);
        wg.add(topBar);

        for (let h = -1; h <= 1; h++) {
          const gown = new THREE.Mesh(
            outfitConeGeo,
            h === 0 ? magentaHologramMat : cyanHologramMat,
          );
          gown.position.set(0, 1.42, h * 0.52);
          wg.add(gown);
        }

        this.root.add(wg);
      });
    });
  }

  /**
   * Builds 8 destructible Acoustic Capacitor Canisters along the colonnade edges.
   */
  private buildAcousticCapacitorCanisters(): void {
    const cfg = HARMONIC_CHAMBER_CONFIG;
    const chromeMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.trussChrome),
    );
    const coreMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.mikuCyan, {
        emissive: PALETTE.harmonicEmerald,
        emissiveIntensity: 0.65,
      }),
    );
    const ringMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicMagenta }),
    );

    const capBaseGeo = this.trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 0.22, 10));
    const coreCylGeo = this.trackGeo(new THREE.CylinderGeometry(0.25, 0.25, 0.72, 10));
    const capTopGeo = this.trackGeo(new THREE.CylinderGeometry(0.28, 0.32, 0.2, 10));
    const coilRingGeo = this.trackGeo(new THREE.TorusGeometry(0.28, 0.028, 6, 16));

    const sides: readonly (-1 | 1)[] = [-1, 1];
    cfg.urnZPositions.forEach((uz) => {
      sides.forEach((side) => {
        const ux = side * cfg.urnRowX;
        const canGroup = new THREE.Group();
        canGroup.position.set(ux, 0, uz);

        const { group: baseObj } = ToonAssets.createOutlinedMesh(
          capBaseGeo,
          chromeMat,
          1.06,
          true,
        );
        baseObj.position.y = 0.11;
        canGroup.add(baseObj);

        const { group: coreObj } = ToonAssets.createOutlinedMesh(
          coreCylGeo,
          coreMat,
          1.06,
          true,
        );
        coreObj.position.y = 0.58;
        canGroup.add(coreObj);

        const { group: topObj } = ToonAssets.createOutlinedMesh(
          capTopGeo,
          chromeMat,
          1.06,
          true,
        );
        topObj.position.y = 1.04;
        canGroup.add(topObj);

        const coil = new THREE.Mesh(coilRingGeo, ringMat);
        coil.rotation.x = Math.PI / 2;
        coil.position.y = 0.58;
        canGroup.add(coil);

        this.root.add(canGroup);
        this._urnSpawns.push({
          index: this._urnSpawns.length,
          x: ux,
          y: 0,
          z: uz,
          hitRadius: cfg.urnHitRadius,
          hp: cfg.urnHp,
          healValue: cfg.urnHealAmount,
          propType: DESTRUCTIBLE_PROP_TYPES.ACOUSTIC_CAPACITOR,
          mesh: canGroup,
        });
      });
    });
  }

  /**
   * Builds the northern Hydraulic VIP Stage-Lift / Harmonic Astral Portal dais.
   */
  private buildHydraulicStageLiftPortalDais(): void {
    const cfg = HARMONIC_CHAMBER_CONFIG;
    const obsidianMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.cyberObsidian, {
        emissive: PALETTE.cyberStageDark,
        emissiveIntensity: 0.2,
      }),
    );
    const chromeMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.trussChrome, {
        emissive: PALETTE.mikuCyan,
        emissiveIntensity: 0.22,
      }),
    );
    const emeraldMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.harmonicEmerald, {
        emissive: PALETTE.harmonicEmerald,
        emissiveIntensity: 0.45,
      }),
    );

    const daisGroup = new THREE.Group();
    daisGroup.position.set(0, 0, cfg.daisZ);

    let accumY = 0;
    cfg.daisTierHeights.forEach((th, idx) => {
      const rad = cfg.daisRadius - idx * cfg.daisTierRadiusStep;
      const tierGeo = this.trackGeo(
        new THREE.CylinderGeometry(rad, rad + 0.18, th, 24),
      );
      const { group: tierObj } = ToonAssets.createOutlinedMesh(
        tierGeo,
        idx === 0 ? obsidianMat : chromeMat,
        1.02,
        true,
      );
      tierObj.position.y = accumY + th * 0.5;
      accumY += th;
      daisGroup.add(tierObj);
    });
    this.root.add(daisGroup);

    const portalGroup = new THREE.Group();
    portalGroup.position.copy(this.portalPosition);

    const ringR = cfg.portalRingRadius;
    const tubeR = cfg.portalTubeRadius;

    const { group: outerArch } = ToonAssets.createOutlinedMesh(
      this.trackGeo(new THREE.TorusGeometry(ringR, tubeR, 10, 36)),
      chromeMat,
      1.05,
      true,
    );
    portalGroup.add(outerArch);

    // 12 Runic Harmonic Charge Segments around the Portal Arch
    const segCount = cfg.portalRuneSegmentCount;
    const runeGeo = this.trackGeo(new THREE.BoxGeometry(0.18, 0.36, 0.22));
    for (let i = 0; i < segCount; i++) {
      const ang = (i / segCount) * Math.PI * 2 - Math.PI * 0.5;
      const runeMat = this.trackMat(
        new THREE.MeshBasicMaterial({ color: PALETTE.mutedSlate }),
      );
      const runeMesh = new THREE.Mesh(runeGeo, runeMat);
      runeMesh.position.set(
        Math.cos(ang) * (ringR + 0.08),
        Math.sin(ang) * (ringR + 0.08),
        0.18,
      );
      runeMesh.rotation.z = ang + Math.PI * 0.5;
      portalGroup.add(runeMesh);
      this.portalRuneMaterials.push(runeMat);
    }

    // Inner spinning tuning-fork ring
    this.portalInnerRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(ringR - 0.52, ringR - 0.38, 6)),
      this.trackMat(
        new THREE.MeshBasicMaterial({
          color: PALETTE.harmonicMagenta,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.portalInnerRing.position.z = 0.06;
    portalGroup.add(this.portalInnerRing);

    // Twin Flanking Hydraulic Stage-Lift Pylons
    const pylonGeo = this.trackGeo(new THREE.BoxGeometry(1.1, 4.8, 1.1));
    const pylonCapGeo = this.trackGeo(new THREE.OctahedronGeometry(0.55, 0));
    ([-1, 1] as const).forEach((side) => {
      const px = side * cfg.portalPylonOffsetX;
      const pGroup = new THREE.Group();
      pGroup.position.set(px, -cfg.portalCenterY, 0);

      const { group: shaft, mainMesh } = ToonAssets.createOutlinedMesh(
        pylonGeo,
        obsidianMat,
        ARENA_CONFIG.defaultOutlineScale,
        true,
      );
      shaft.position.y = 2.4;
      pGroup.add(shaft);

      const { group: cap } = ToonAssets.createOutlinedMesh(
        pylonCapGeo,
        emeraldMat,
        1.06,
        true,
      );
      cap.position.y = 5.35;
      pGroup.add(cap);

      portalGroup.add(pGroup);
      this._pillarColliders.push({
        x: px,
        z: cfg.portalZ,
        radius: cfg.portalPylonCollisionRadius,
        height: 6.0,
      });
      this._pillarMeshes.push(mainMesh);
      this._cameraColliders.push(mainMesh);
    });

    // Translucent Acoustic Seal Barrier (visible while SEALED)
    this.portalSealMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.harmonicEmerald,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.portalSealMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CircleGeometry(ringR - 0.36, 32)),
      this.portalSealMat,
    );
    portalGroup.add(this.portalSealMesh);

    // Swirling Emerald-and-Magenta GLSL Harmonic Vortex
    this.portalVortexMat = this.trackMat(
      new THREE.ShaderMaterial({
        vertexShader: HARMONIC_PORTAL_VERTEX_SHADER,
        fragmentShader: HARMONIC_PORTAL_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uIgnite: { value: 0 },
          uCharge: { value: 0 },
          uArms: { value: cfg.portalVortexArms },
          uColorEmerald: { value: new THREE.Color(PALETTE.harmonicEmerald) },
          uColorMagenta: { value: new THREE.Color(PALETTE.harmonicMagenta) },
          uColorCyan: { value: new THREE.Color(PALETTE.mikuCyan) },
          uColorDeep: { value: new THREE.Color(PALETTE.cyberObsidian) },
        },
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.portalVortexMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CircleGeometry(ringR - 0.34, 48)),
      this.portalVortexMat,
    );
    this.portalVortexMesh.position.z = 0.04;
    portalGroup.add(this.portalVortexMesh);

    this.portalPointLight = new THREE.PointLight(
      PALETTE.harmonicEmerald,
      cfg.lighting.portalLightSealed,
      cfg.lighting.portalLightDistance,
      cfg.lighting.portalLightDecay,
    );
    this.portalPointLight.position.set(0, 0, 1.4);
    portalGroup.add(this.portalPointLight);

    this.root.add(portalGroup);
  }

  private buildNeonSynthMotes(): void {
    const cfg = HARMONIC_CHAMBER_CONFIG;
    const count = cfg.synthMoteCount;
    const halfW = cfg.width * 0.46;
    const halfL = cfg.length * 0.46;
    const maxH = cfg.ceilingY - 1.2;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() * 2 - 1) * halfW;
      positions[i * 3 + 1] = 0.3 + Math.random() * maxH;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * halfL;
      this.synthMoteVelocities.push({
        vy: cfg.synthMoteRiseSpeed * (0.55 + Math.random()),
        swaySpeed: 0.9 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const geo = this.trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = this.trackMat(
      new THREE.PointsMaterial({
        map: ToonAssets.getSparkTexture(),
        color: PALETTE.mikuCyan,
        size: 0.24,
        transparent: true,
        opacity: 0.76,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.synthMotes = new THREE.Points(geo, mat);
    this.root.add(this.synthMotes);
  }

  public resetUrns(): void {
    for (let i = 0; i < this._urnSpawns.length; i++) {
      const urn = this._urnSpawns[i];
      if (urn) urn.mesh.visible = true;
    }
  }

  public setPortalCharge(ratio: number, ignited: boolean, time: number): void {
    const cfg = HARMONIC_CHAMBER_CONFIG;
    const clampedRatio = THREE.MathUtils.clamp(ratio, 0, 1);
    this.currentPortalCharge = clampedRatio;
    this.currentPortalIgnited = ignited;

    const targetIgnite = ignited ? 1 : 0;
    this.portalIgniteBlend +=
      (targetIgnite - this.portalIgniteBlend) *
      Math.min(1, cfg.portalIgniteLerp * 0.05 + (ignited ? 0.08 : 0.12));
    if (ignited && this.portalIgniteBlend > 0.995) this.portalIgniteBlend = 1;
    if (!ignited && this.portalIgniteBlend < 0.005) this.portalIgniteBlend = 0;

    const litCount = Math.round(
      (ignited ? 1 : clampedRatio) * this.portalRuneMaterials.length,
    );
    for (let i = 0; i < this.portalRuneMaterials.length; i++) {
      const mat = this.portalRuneMaterials[i];
      if (!mat) continue;
      if (ignited) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 5.6 + i * 0.55);
        mat.color.setHex(
          pulse > 0.5 ? PALETTE.harmonicMagenta : PALETTE.harmonicEmerald,
        );
      } else if (i < litCount) {
        mat.color.setHex(PALETTE.harmonicEmerald);
      } else {
        mat.color.setHex(PALETTE.mutedSlate);
      }
    }

    if (this.portalSealMesh && this.portalSealMat) {
      const sealPulse =
        0.22 + 0.09 * Math.sin(time * cfg.portalSealPulseSpeed);
      this.portalSealMat.opacity = sealPulse * (1 - this.portalIgniteBlend);
      this.portalSealMesh.visible = this.portalIgniteBlend < 0.96;
    }

    if (this.portalVortexMesh && this.portalVortexMat) {
      this.portalVortexMat.uniforms.uTime!.value =
        time * cfg.portalVortexSwirlSpeed;
      this.portalVortexMat.uniforms.uCharge!.value = clampedRatio;
      this.portalVortexMat.uniforms.uIgnite!.value = this.portalIgniteBlend;
      this.portalVortexMesh.visible =
        clampedRatio > 0.01 || this.portalIgniteBlend > 0.01;
    }

    if (this.portalInnerRing) {
      this.portalInnerRing.rotation.z =
        time * cfg.portalSpinSpeed * (1 + this.portalIgniteBlend * 2.5);
    }

    if (this.portalPointLight) {
      const L = cfg.lighting;
      const baseIntensity = THREE.MathUtils.lerp(
        L.portalLightSealed,
        L.portalLightIgnited,
        Math.max(clampedRatio * 0.35, this.portalIgniteBlend),
      );
      this.portalPointLight.intensity =
        baseIntensity * (0.92 + 0.08 * Math.sin(time * 4.8));
      this.portalPointLight.color.setHex(
        ignited ? PALETTE.harmonicMagenta : PALETTE.harmonicEmerald,
      );
    }
  }

  public update(dt: number, elapsed: number): void {
    const cfg = HARMONIC_CHAMBER_CONFIG;

    // 1. Refresh holographic mixing desk equalizer CanvasTexture (~24 Hz)
    this.eqRefreshAccum += dt;
    if (this.eqRefreshAccum >= 0.042) {
      this.eqRefreshAccum = 0;
      this.drawEqualizerFrame(elapsed);
    }

    // 2. Pulse subwoofer speaker cones to the synth-bass tempo
    const beatPulse = Math.pow(0.5 + 0.5 * Math.sin(elapsed * 12.1), 2.2);
    for (let i = 0; i < this.subwooferCones.length; i++) {
      const sc = this.subwooferCones[i];
      if (!sc) continue;
      const thump =
        beatPulse * (0.7 + 0.3 * Math.sin(elapsed * 6.0 + sc.phase));
      sc.mesh.position.z = sc.baseZ + thump * 0.09;
      sc.ringMesh.scale.setScalar(1.0 + thump * 0.08);
    }

    // 3. Sweep overhead stage spotlight cones gently across the backstage floor
    for (let i = 0; i < this.spotlights.length; i++) {
      const sp = this.spotlights[i];
      if (!sp) continue;
      sp.pivot.rotation.z =
        sp.baseAngleZ + Math.sin(elapsed * 1.15 + sp.phase) * 0.14;
      sp.pivot.rotation.x = Math.cos(elapsed * 0.85 + sp.phase) * 0.1;
      sp.coneMat.opacity = 0.11 + 0.04 * Math.sin(elapsed * 3.2 + sp.phase);
    }

    // 4. Rise neon synth-note dust motes
    if (this.synthMotes) {
      const posAttr = this.synthMotes.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const halfW = cfg.width * 0.46;
      const halfL = cfg.length * 0.46;
      const maxH = cfg.ceilingY - 1.2;

      for (let i = 0; i < this.synthMoteVelocities.length; i++) {
        const vel = this.synthMoteVelocities[i];
        if (!vel) continue;
        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        let z = posAttr.getZ(i);

        y += vel.vy * dt;
        x +=
          Math.sin(elapsed * vel.swaySpeed + vel.phase) *
          cfg.synthMoteSwayAmp *
          dt;
        if (y > maxH) {
          y = 0.3;
          x = (Math.random() * 2 - 1) * halfW;
          z = (Math.random() * 2 - 1) * halfL;
        }
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
    }

    // 5. Keep Harmonic Astral Portal shader & LEDs smoothly animated
    this.setPortalCharge(
      this.currentPortalCharge,
      this.currentPortalIgnited,
      elapsed,
    );
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
