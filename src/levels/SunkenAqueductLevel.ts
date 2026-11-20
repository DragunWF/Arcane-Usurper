import * as THREE from 'three';
import {
  ARENA_CONFIG,
  DESTRUCTIBLE_PROP_TYPES,
  PALETTE,
  SUNKEN_CHAMBER_CONFIG,
} from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';
import type { ChamberCollider, FrostUrnSpawnRecord } from './IcePalaceLevel';

interface SwayingKelpRecord {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  readonly basePositions: Float32Array;
  readonly phase: number;
  readonly height: number;
}

interface BubbleMoteVelocity {
  readonly vy: number;
  readonly swaySpeed: number;
  readonly phase: number;
}

interface AqueductBrazierRecord {
  readonly flame: THREE.Mesh;
  readonly light: THREE.PointLight | null;
  readonly phase: number;
}

const TIDAL_PORTAL_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TIDAL_PORTAL_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uIgnite;
  uniform float uCharge;
  uniform float uArms;
  uniform vec3 uColorTeal;
  uniform vec3 uColorGold;
  uniform vec3 uColorPearl;
  uniform vec3 uColorDeep;
  varying vec2 vUv;

  void main() {
    vec2 centered = (vUv - 0.5) * 2.0;
    float dist = length(centered);
    if (dist > 1.0) discard;

    float angle = atan(centered.y, centered.x);
    float swirl = angle * uArms + dist * 7.2 - uTime * 3.1;
    float wave = 0.5 + 0.5 * sin(swirl);
    float counter = 0.5 + 0.5 * cos(angle * (uArms - 2.0) - dist * 8.4 + uTime * 2.2);
    float ripple = 0.5 + 0.5 * sin(dist * 15.0 - uTime * 4.6);

    float energy = mix(wave, counter, 0.45) * 0.72 + ripple * 0.28;
    vec3 col = mix(uColorDeep, uColorTeal, clamp(energy * 1.15, 0.0, 1.0));
    col = mix(col, uColorGold, smoothstep(0.42, 0.94, counter * (1.0 - dist * 0.28)));
    col = mix(col, uColorPearl, smoothstep(0.42, 0.0, dist) * (0.42 + 0.58 * uIgnite));

    float rim = smoothstep(0.76, 0.98, dist) * (1.0 - smoothstep(0.96, 1.0, dist));
    col += uColorGold * rim * (0.7 + 0.4 * sin(uTime * 5.2));

    float edgeFade = 1.0 - smoothstep(0.88, 1.0, dist);
    float visibility = clamp(uIgnite * 0.94 + uCharge * 0.24, 0.0, 0.96);
    float alpha = edgeFade * visibility * (0.55 + 0.45 * energy);
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(col * (0.88 + 0.55 * uIgnite), alpha);
  }
`;

/**
 * Self-contained procedural 3D environment for Realm II: **The Sunken Aqueduct**.
 *
 * Built with cel-shaded MeshToonMaterial + ink-black BackSide outlines:
 * - Flooded dark sea-stone floor overlaid by an animated cyan water-caustic CanvasTexture
 * - Single-sided FrontSide inward perimeter walls & interior column cameraColliders
 * - Fluted Atlantean columns overgrown with cel-shaded branching coral & aqueduct arches
 * - Swaying ribbon-kelp fronds along both walls & rising bioluminescent plankton/bubble motes
 * - 8 Destructible Luminous Pearl Urns (PEARL_URN) returned for ECS registration
 * - Coral-encrusted Tidal Astral Portal dais with 12 runic lights & teal-and-gold GLSL vortex.
 */
export class SunkenAqueductLevel {
  public readonly root = new THREE.Group();
  public readonly portalPosition = new THREE.Vector3(
    0,
    SUNKEN_CHAMBER_CONFIG.portalCenterY,
    SUNKEN_CHAMBER_CONFIG.portalZ,
  );

  private readonly _pillarColliders: ChamberCollider[] = [];
  private readonly _pillarMeshes: THREE.Object3D[] = [];
  private readonly _cameraColliders: THREE.Object3D[] = [];
  private readonly _urnSpawns: FrostUrnSpawnRecord[] = [];
  private readonly kelpFronds: SwayingKelpRecord[] = [];
  private readonly braziers: AqueductBrazierRecord[] = [];
  private readonly portalRuneMaterials: THREE.MeshBasicMaterial[] = [];

  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  private causticTexture: THREE.CanvasTexture | null = null;
  private causticMat: THREE.MeshBasicMaterial | null = null;

  private portalSealMesh: THREE.Mesh | null = null;
  private portalSealMat: THREE.MeshBasicMaterial | null = null;
  private portalVortexMesh: THREE.Mesh | null = null;
  private portalVortexMat: THREE.ShaderMaterial | null = null;
  private portalInnerRing: THREE.Mesh | null = null;
  private portalPointLight: THREE.PointLight | null = null;

  private bubbleMotes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > | null = null;
  private readonly bubbleVelocities: BubbleMoteVelocity[] = [];

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
    this.root.name = 'SunkenAqueductLevel';
    this.buildFloodedFloorAndWalls();
    this.buildFlutedCoralColonnade();
    this.buildSwayingKelpFronds();
    this.buildTridentWallBraziers();
    this.buildDestructiblePearlUrns();
    this.buildTidalPortalDais();
    this.buildBioluminescentBubbles();
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

  private createSeaStoneFloorTextures(): {
    diffuseMap: THREE.CanvasTexture;
    emissiveMap: THREE.CanvasTexture;
  } {
    const size = SUNKEN_CHAMBER_CONFIG.floorTextureSize;
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dCtx = diffCanvas.getContext('2d');

    const emisCanvas = document.createElement('canvas');
    emisCanvas.width = size;
    emisCanvas.height = size;
    const eCtx = emisCanvas.getContext('2d');

    if (dCtx && eCtx) {
      dCtx.fillStyle = PALETTE.hex.seaStoneDark;
      dCtx.fillRect(0, 0, size, size);

      const tiles = 4;
      const tileSize = size / tiles;
      for (let gx = 0; gx < tiles; gx++) {
        for (let gy = 0; gy < tiles; gy++) {
          dCtx.fillStyle =
            (gx + gy) % 2 === 0
              ? PALETTE.hex.seaStoneDark
              : PALETTE.hex.seaStoneMid;
          dCtx.fillRect(gx * tileSize, gy * tileSize, tileSize, tileSize);

          dCtx.strokeStyle = PALETTE.rgba.seaTileJoint;
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

      const drawInlays = (
        ctx: CanvasRenderingContext2D,
        isEmissive: boolean,
      ): void => {
        const goldColor = isEmissive
          ? PALETTE.rgba.atlanteanGoldBright
          : PALETTE.rgba.atlanteanGoldSoft;
        const cyanColor = PALETTE.rgba.causticCyanGlow;

        // Longitudinal Atlantean gold waterway guide rails
        const xOffsets = [size * 0.2, size * 0.8];
        xOffsets.forEach((x) => {
          ctx.strokeStyle = cyanColor;
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size);
          ctx.stroke();

          ctx.strokeStyle = goldColor;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size);
          ctx.stroke();
        });

        // Repeating wave-scroll center medallions
        for (let gy = 0; gy < tiles; gy++) {
          const cy = (gy + 0.5) * tileSize;
          ctx.strokeStyle = goldColor;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(size * 0.5, cy, tileSize * 0.28, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = cyanColor;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(size * 0.5, cy, tileSize * 0.16, 0, Math.PI * 2);
          ctx.stroke();
        }
      };

      drawInlays(dCtx, false);
      drawInlays(eCtx, true);
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

  /**
   * Procedural tiling cyan water-caustic lattice CanvasTexture scrolled continuously over the flooded floor.
   */
  private createWaterCausticTexture(): THREE.CanvasTexture {
    const size = SUNKEN_CHAMBER_CONFIG.causticTextureSize;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.clearRect(0, 0, size, size);

      // Layered glowing cellular wave arcs for crisp underwater caustic ribbons
      const cellCount = 16;
      for (let i = 0; i < cellCount; i++) {
        const cx = ((i * 137) % size);
        const cy = ((i * 211) % size);
        const rad = 48 + (i % 4) * 26;

        // Draw wrapped copies so the caustic texture tiles seamlessly
        for (let ox = -size; ox <= size; ox += size) {
          for (let oy = -size; oy <= size; oy += size) {
            ctx.strokeStyle = PALETTE.rgba.causticCyanGlow;
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.arc(cx + ox, cy + oy, rad, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = PALETTE.rgba.causticCyanBright;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(cx + ox, cy + oy, rad, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    }

    const tex = this.trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 6);
    tex.anisotropy = 4;
    return tex;
  }

  private buildFloodedFloorAndWalls(): void {
    const cfg = SUNKEN_CHAMBER_CONFIG;
    const W = cfg.width;
    const L = cfg.length;
    const H = cfg.wallHeight;
    const T = cfg.wallThickness;

    const { diffuseMap, emissiveMap } = this.createSeaStoneFloorTextures();
    const floorGeo = this.trackGeo(new THREE.BoxGeometry(W, 0.8, L));
    const floorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: diffuseMap,
        emissive: new THREE.Color(PALETTE.atlanteanGold),
        emissiveMap,
        emissiveIntensity: 0.55,
        roughness: 0.22,
        metalness: 0.34,
      }),
    );
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -0.4, 0);
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    // Animated Translucent Cyan Water-Caustic Floor Overlay
    this.causticTexture = this.createWaterCausticTexture();
    this.causticMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: this.causticTexture,
        color: PALETTE.biolumCyan,
        transparent: true,
        opacity: cfg.causticOpacityBase,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const causticPlane = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(W - 0.2, L - 0.2)),
      this.causticMat,
    );
    causticPlane.rotation.x = -Math.PI / 2;
    causticPlane.position.y = cfg.causticY;
    this.root.add(causticPlane);

    // Single-sided FrontSide inward-facing perimeter walls (zero exterior BackSide outline shells)
    const wallMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.seaStoneDark, {
        emissive: PALETTE.abyssalTeal,
        emissiveIntensity: 0.2,
        side: THREE.FrontSide,
      }),
    );
    const goldTrimMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.atlanteanGold }),
    );
    const cyanTrimMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.biolumCyan }),
    );
    const ceilingMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.abyssalTeal, {
        side: THREE.FrontSide,
      }),
    );

    const sideWallGeo = this.trackGeo(new THREE.PlaneGeometry(L, H));
    const trimGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 0.16, L));
    const sides: readonly (-1 | 1)[] = [-1, 1];
    sides.forEach((side) => {
      const wall = new THREE.Mesh(sideWallGeo, wallMat);
      wall.position.set(side * (W * 0.5), H * 0.5, 0);
      wall.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
      wall.receiveShadow = true;
      this.root.add(wall);
      this._pillarMeshes.push(wall);

      const lowerTrim = new THREE.Mesh(trimGeo, cyanTrimMat);
      lowerTrim.position.set(side * (W * 0.5 - 0.06), 1.3, 0);
      this.root.add(lowerTrim);

      const upperTrim = new THREE.Mesh(trimGeo, goldTrimMat);
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
   * Fluted Atlantean aqueduct columns overgrown with cel-shaded branching coral & overhead arches.
   */
  private buildFlutedCoralColonnade(): void {
    const cfg = SUNKEN_CHAMBER_CONFIG;
    const stoneMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.seaStoneMid, {
        emissive: PALETTE.abyssalTeal,
        emissiveIntensity: 0.16,
      }),
    );
    const goldMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.atlanteanGold, {
        emissive: PALETTE.atlanteanGold,
        emissiveIntensity: 0.25,
      }),
    );
    const coralRoseMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.coralRose, {
        emissive: PALETTE.coralRose,
        emissiveIntensity: 0.34,
      }),
    );
    const coralCyanMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.biolumCyan, {
        emissive: PALETTE.biolumCyan,
        emissiveIntensity: 0.42,
      }),
    );

    const pillarH = cfg.pillarHeight;
    const shaftH = pillarH - 1.5;
    const plinthGeo = this.trackGeo(new THREE.CylinderGeometry(0.92, 1.08, 0.72, 12));
    const shaftGeo = this.trackGeo(
      new THREE.CylinderGeometry(cfg.pillarRadius * 0.9, cfg.pillarRadius, shaftH, 12),
    );
    const capGeo = this.trackGeo(new THREE.CylinderGeometry(1.02, 0.72, 0.75, 12));
    const coralBranchGeo = this.trackGeo(new THREE.CylinderGeometry(0.06, 0.14, 0.85, 6));
    const coralTipGeo = this.trackGeo(new THREE.SphereGeometry(0.11, 8, 8));

    const rowX = cfg.pillarRowX;
    const apexY = pillarH + cfg.archApexRise;
    const archCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-rowX, pillarH - 0.1, 0),
      new THREE.Vector3(-rowX * 0.62, pillarH + cfg.archApexRise * 0.78, 0),
      new THREE.Vector3(0, apexY, 0),
      new THREE.Vector3(rowX * 0.62, pillarH + cfg.archApexRise * 0.78, 0),
      new THREE.Vector3(rowX, pillarH - 0.1, 0),
    ]);
    const archGeo = this.trackGeo(
      new THREE.TubeGeometry(archCurve, cfg.archTubularSegments, cfg.archRibRadius, 8, false),
    );
    const keystoneGeo = this.trackGeo(new THREE.OctahedronGeometry(0.42, 0));

    const sides: readonly (-1 | 1)[] = [-1, 1];
    for (let i = 0; i < cfg.pillarCountPerSide; i++) {
      const pz = cfg.pillarStartZ - i * cfg.pillarSpacing;

      sides.forEach((side) => {
        const px = side * rowX;
        const colGroup = new THREE.Group();
        colGroup.position.set(px, 0, pz);

        const { group: plinthObj, mainMesh: plinthMesh } =
          ToonAssets.createOutlinedMesh(plinthGeo, stoneMat, 1.04, true);
        plinthObj.position.y = 0.36;
        colGroup.add(plinthObj);

        const { group: shaftObj, mainMesh: shaftMesh } =
          ToonAssets.createOutlinedMesh(
            shaftGeo,
            stoneMat,
            { x: 1.06, y: 1.01, z: 1.06 },
            true,
          );
        shaftObj.position.y = 0.72 + shaftH * 0.5;
        colGroup.add(shaftObj);

        const { group: capObj } = ToonAssets.createOutlinedMesh(
          capGeo,
          goldMat,
          ARENA_CONFIG.defaultOutlineScale,
          true,
        );
        capObj.position.y = pillarH - 0.35;
        colGroup.add(capObj);

        // Cel-shaded branching coral overgrowth clinging to each fluted column
        for (let b = 0; b < 4; b++) {
          const coralMat = (i + b) % 2 === 0 ? coralRoseMat : coralCyanMat;
          const ang = b * 1.45 + i * 0.6;
          const cy = 1.15 + b * 1.35;
          const { group: branch } = ToonAssets.createOutlinedMesh(
            coralBranchGeo,
            coralMat,
            1.08,
            false,
          );
          branch.position.set(
            Math.cos(ang) * (cfg.pillarRadius + 0.12),
            cy,
            Math.sin(ang) * (cfg.pillarRadius + 0.12),
          );
          branch.rotation.z = -Math.cos(ang) * 0.65;
          branch.rotation.x = Math.sin(ang) * 0.55;
          colGroup.add(branch);

          const tip = new THREE.Mesh(coralTipGeo, coralMat);
          tip.position.set(
            Math.cos(ang) * (cfg.pillarRadius + 0.42),
            cy + 0.34,
            Math.sin(ang) * (cfg.pillarRadius + 0.42),
          );
          colGroup.add(tip);
        }

        this.root.add(colGroup);

        this._pillarColliders.push({
          x: px,
          z: pz,
          radius: cfg.pillarCollisionRadius,
          height: pillarH,
        });
        this._pillarMeshes.push(shaftMesh, plinthMesh);
        this._cameraColliders.push(shaftMesh, plinthMesh);
      });

      // Overhead semicircular Atlantean aqueduct arch
      const archGroup = new THREE.Group();
      archGroup.position.set(0, 0, pz);
      const { group: archObj } = ToonAssets.createOutlinedMesh(
        archGeo,
        stoneMat,
        1.07,
        false,
      );
      archGroup.add(archObj);

      const keystone = new THREE.Mesh(keystoneGeo, goldMat);
      keystone.position.set(0, apexY, 0);
      archGroup.add(keystone);
      this.root.add(archGroup);
    }
  }

  /**
   * Builds swaying underwater ribbon-kelp fronds along the hall edges.
   */
  private buildSwayingKelpFronds(): void {
    const cfg = SUNKEN_CHAMBER_CONFIG;
    const kelpMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.kelpEmerald, {
        emissive: PALETTE.biolumCyan,
        emissiveIntensity: 0.22,
        side: THREE.DoubleSide,
      }),
    );

    const sides: readonly (-1 | 1)[] = [-1, 1];
    for (let i = 0; i < cfg.kelpCountPerSide; i++) {
      const kz = cfg.kelpStartZ - i * cfg.kelpSpacing;
      sides.forEach((side, sIdx) => {
        const h = cfg.kelpHeight * (0.75 + ((i + sIdx) % 3) * 0.16);
        const geo = this.trackGeo(
          new THREE.PlaneGeometry(cfg.kelpWidth, h, 1, cfg.kelpSegmentsY),
        );
        // Anchor frond root at y = 0 so it sways upward from the sea floor
        geo.translate(0, h * 0.5, 0);
        const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
        const basePositions = new Float32Array(posAttr.array.length);
        basePositions.set(posAttr.array as Float32Array);

        const mesh = new THREE.Mesh(geo, kelpMat);
        mesh.position.set(
          side * (cfg.kelpRowX + (i % 2) * 0.45),
          0,
          kz,
        );
        mesh.rotation.y = side * (Math.PI * 0.32 + (i % 3) * 0.25);
        this.root.add(mesh);

        this.kelpFronds.push({
          mesh,
          basePositions,
          phase: i * 0.9 + sIdx * 1.7,
          height: h,
        });
      });
    }
  }

  /**
   * Bronze trident sconces lighting the flooded aqueduct with warm gold & cyan pools.
   */
  private buildTridentWallBraziers(): void {
    const cfg = SUNKEN_CHAMBER_CONFIG;
    const bronzeMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.bronzeTrident, {
        emissive: PALETTE.atlanteanGold,
        emissiveIntensity: 0.18,
      }),
    );
    const flameMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.biolumCyan,
        transparent: true,
        opacity: 0.9,
      }),
    );

    const standGeo = this.trackGeo(new THREE.CylinderGeometry(0.14, 0.28, 1.35, 6));
    const bowlGeo = this.trackGeo(new THREE.CylinderGeometry(0.38, 0.18, 0.28, 8));
    const flameGeo = this.trackGeo(new THREE.OctahedronGeometry(0.24, 0));

    const zPositions = [15.0, 0.0, -14.5];
    const sides: readonly (-1 | 1)[] = [-1, 1];
    zPositions.forEach((bz, zIdx) => {
      sides.forEach((side, sIdx) => {
        const g = new THREE.Group();
        g.position.set(side * (cfg.pillarRowX - 1.25), 0, bz);

        const { group: stand } = ToonAssets.createOutlinedMesh(
          standGeo,
          bronzeMat,
          1.05,
          true,
        );
        stand.position.y = 0.675;
        g.add(stand);

        const { group: bowl } = ToonAssets.createOutlinedMesh(
          bowlGeo,
          bronzeMat,
          1.05,
          true,
        );
        bowl.position.y = 1.44;
        g.add(bowl);

        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.scale.set(0.85, 1.55, 0.85);
        flame.position.y = 1.85;
        g.add(flame);

        const light =
          (zIdx + sIdx) % 2 === 0
            ? new THREE.PointLight(
                PALETTE.biolumCyan,
                cfg.lighting.brazierLightIntensity,
                cfg.lighting.brazierLightDistance,
                cfg.lighting.brazierLightDecay,
              )
            : null;
        if (light) {
          light.position.y = 2.15;
          g.add(light);
        }

        this.root.add(g);
        this.braziers.push({
          flame,
          light,
          phase: zIdx * 1.4 + sIdx * 2.1,
        });
      });
    });
  }

  /**
   * Builds 8 Destructible Luminous Pearl Urns along the colonnade edges.
   */
  private buildDestructiblePearlUrns(): void {
    const cfg = SUNKEN_CHAMBER_CONFIG;
    const amphoraMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.seaStoneMid, {
        emissive: PALETTE.atlanteanGold,
        emissiveIntensity: 0.14,
      }),
    );
    const pearlMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.pearlWhite, {
        emissive: PALETTE.biolumCyan,
        emissiveIntensity: 0.72,
      }),
    );
    const coralRingMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.coralRose, {
        emissive: PALETTE.coralRose,
        emissiveIntensity: 0.32,
      }),
    );

    const bodyGeo = this.trackGeo(new THREE.CylinderGeometry(0.28, 0.22, 0.78, 10));
    const lipGeo = this.trackGeo(new THREE.TorusGeometry(0.28, 0.055, 6, 12));
    const pearlGeo = this.trackGeo(new THREE.SphereGeometry(0.22, 12, 12));

    let index = 0;
    const sides: readonly (-1 | 1)[] = [-1, 1];
    for (let i = 0; i < cfg.urnZPositions.length; i++) {
      const uz = cfg.urnZPositions[i] ?? 0;
      for (let s = 0; s < sides.length; s++) {
        const side = sides[s] ?? 1;
        const ux = side * cfg.urnRowX;

        const urnGroup = new THREE.Group();
        urnGroup.position.set(ux, 0, uz);

        const { group: body } = ToonAssets.createOutlinedMesh(
          bodyGeo,
          amphoraMat,
          1.06,
          true,
        );
        body.position.y = 0.4;
        urnGroup.add(body);

        const lip = new THREE.Mesh(lipGeo, coralRingMat);
        lip.rotation.x = Math.PI / 2;
        lip.position.y = 0.8;
        urnGroup.add(lip);

        const { group: pearl } = ToonAssets.createOutlinedMesh(
          pearlGeo,
          pearlMat,
          1.06,
          false,
        );
        pearl.position.y = 0.96;
        urnGroup.add(pearl);

        this.root.add(urnGroup);
        this._urnSpawns.push({
          index,
          propType: DESTRUCTIBLE_PROP_TYPES.PEARL_URN,
          x: ux,
          y: 0,
          z: uz,
          hp: cfg.urnHp,
          healValue: cfg.urnHealAmount,
          hitRadius: cfg.urnHitRadius,
          mesh: urnGroup,
        });
        index++;
      }
    }
  }

  /**
   * Builds the coral-encrusted Tidal Astral Portal dais at the north end of the Sunken Aqueduct.
   */
  private buildTidalPortalDais(): void {
    const cfg = SUNKEN_CHAMBER_CONFIG;
    const stoneMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.seaStoneDark, {
        emissive: PALETTE.abyssalTeal,
        emissiveIntensity: 0.16,
      }),
    );
    const goldMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.atlanteanGold, {
        emissive: PALETTE.atlanteanGold,
        emissiveIntensity: 0.35,
      }),
    );
    const coralMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.coralRose, {
        emissive: PALETTE.coralRose,
        emissiveIntensity: 0.38,
      }),
    );

    // Two-tier stepped stone dais
    let accumY = 0;
    cfg.daisTierHeights.forEach((h, idx) => {
      const r = cfg.daisRadius - idx * cfg.daisTierRadiusStep;
      const tierGeo = this.trackGeo(new THREE.CylinderGeometry(r, r + 0.25, h, 24));
      const { group: tierObj } = ToonAssets.createOutlinedMesh(
        tierGeo,
        idx === 0 ? stoneMat : goldMat,
        1.02,
        true,
      );
      tierObj.position.set(0, accumY + h * 0.5, cfg.daisZ);
      this.root.add(tierObj);
      accumY += h;
    });

    const portalGroup = new THREE.Group();
    portalGroup.position.set(0, cfg.portalCenterY, cfg.portalZ);

    const ringR = cfg.portalRingRadius;
    const outerRingGeo = this.trackGeo(
      new THREE.TorusGeometry(ringR, cfg.portalTubeRadius, 10, 36),
    );
    const { group: outerRing } = ToonAssets.createOutlinedMesh(
      outerRingGeo,
      stoneMat,
      1.05,
      true,
    );
    portalGroup.add(outerRing);

    this.portalInnerRing = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(ringR - 0.34, 0.08, 6, 36)),
      goldMat,
    );
    portalGroup.add(this.portalInnerRing);

    // Coral spikes crowning the Tidal Portal ring
    const coralSpireGeo = this.trackGeo(new THREE.ConeGeometry(0.18, 0.78, 5));
    for (let i = -3; i <= 3; i++) {
      const ang = i * 0.38;
      const spike = new THREE.Mesh(coralSpireGeo, coralMat);
      spike.position.set(
        Math.sin(ang) * (ringR + 0.28),
        Math.cos(ang) * (ringR + 0.28),
        0,
      );
      spike.rotation.z = -ang;
      portalGroup.add(spike);
    }

    // 12 Segmented Runic Lights around the Portal Ring
    const segCount = cfg.portalRuneSegmentCount;
    const runeGeo = this.trackGeo(new THREE.BoxGeometry(0.16, 0.36, 0.18));
    for (let i = 0; i < segCount; i++) {
      const ang = (i / segCount) * Math.PI * 2 - Math.PI * 0.5;
      const runeMat = this.trackMat(
        new THREE.MeshBasicMaterial({ color: PALETTE.mutedSlate }),
      );
      const rune = new THREE.Mesh(runeGeo, runeMat);
      rune.position.set(
        Math.cos(ang) * ringR,
        Math.sin(ang) * ringR,
        cfg.portalTubeRadius * 0.85,
      );
      rune.rotation.z = ang + Math.PI * 0.5;
      portalGroup.add(rune);
      this.portalRuneMaterials.push(runeMat);
    }

    // Flanking Bronze-Trident Portal Pylons
    const pylonGeo = this.trackGeo(new THREE.CylinderGeometry(0.32, 0.52, 4.6, 8));
    const pylonCapGeo = this.trackGeo(new THREE.ConeGeometry(0.38, 1.35, 6));
    const sides: readonly (-1 | 1)[] = [-1, 1];
    sides.forEach((side) => {
      const px = side * cfg.portalPylonOffsetX;
      const pGroup = new THREE.Group();
      pGroup.position.set(px, -cfg.portalCenterY, 0);

      const { group: shaft, mainMesh } = ToonAssets.createOutlinedMesh(
        pylonGeo,
        stoneMat,
        ARENA_CONFIG.defaultOutlineScale,
        true,
      );
      shaft.position.y = 2.3;
      pGroup.add(shaft);

      const { group: cap } = ToonAssets.createOutlinedMesh(
        pylonCapGeo,
        goldMat,
        1.06,
        true,
      );
      cap.position.y = 5.25;
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

    // Translucent Sea-Glass Seal Barrier (visible while SEALED)
    this.portalSealMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.biolumCyan,
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

    // Swirling Teal-and-Gold GLSL Vortex Mesh
    this.portalVortexMat = this.trackMat(
      new THREE.ShaderMaterial({
        vertexShader: TIDAL_PORTAL_VERTEX_SHADER,
        fragmentShader: TIDAL_PORTAL_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uIgnite: { value: 0 },
          uCharge: { value: 0 },
          uArms: { value: cfg.portalVortexArms },
          uColorTeal: { value: new THREE.Color(PALETTE.biolumCyan) },
          uColorGold: { value: new THREE.Color(PALETTE.atlanteanGold) },
          uColorPearl: { value: new THREE.Color(PALETTE.pearlWhite) },
          uColorDeep: { value: new THREE.Color(PALETTE.abyssalTeal) },
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
      PALETTE.biolumCyan,
      cfg.lighting.portalLightSealed,
      cfg.lighting.portalLightDistance,
      cfg.lighting.portalLightDecay,
    );
    this.portalPointLight.position.set(0, 0, 1.4);
    portalGroup.add(this.portalPointLight);

    this.root.add(portalGroup);
  }

  /**
   * Rising bioluminescent plankton & underwater bubble motes drifting upward through the hall.
   */
  private buildBioluminescentBubbles(): void {
    const cfg = SUNKEN_CHAMBER_CONFIG;
    const count = cfg.bubbleMoteCount;
    const halfW = cfg.width * 0.46;
    const halfL = cfg.length * 0.46;
    const maxH = cfg.ceilingY - 1.2;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() * 2 - 1) * halfW;
      positions[i * 3 + 1] = 0.3 + Math.random() * maxH;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * halfL;
      this.bubbleVelocities.push({
        vy: cfg.bubbleRiseSpeed * (0.55 + Math.random()),
        swaySpeed: 0.8 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const geo = this.trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = this.trackMat(
      new THREE.PointsMaterial({
        map: ToonAssets.getSnowTexture(),
        color: PALETTE.biolumCyan,
        size: 0.24,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.bubbleMotes = new THREE.Points(geo, mat);
    this.root.add(this.bubbleMotes);
  }

  public resetUrns(): void {
    for (let i = 0; i < this._urnSpawns.length; i++) {
      const urn = this._urnSpawns[i];
      if (urn) urn.mesh.visible = true;
    }
  }

  public setPortalCharge(ratio: number, ignited: boolean, time: number): void {
    const cfg = SUNKEN_CHAMBER_CONFIG;
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
        const pulse = 0.5 + 0.5 * Math.sin(time * 5.0 + i * 0.55);
        mat.color.setHex(
          pulse > 0.5 ? PALETTE.atlanteanGold : PALETTE.biolumCyan,
        );
      } else if (i < litCount) {
        mat.color.setHex(PALETTE.biolumCyan);
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
        time * cfg.portalSpinSpeed * (1 + this.portalIgniteBlend * 2.4);
    }

    if (this.portalPointLight) {
      const L = cfg.lighting;
      const baseIntensity = THREE.MathUtils.lerp(
        L.portalLightSealed,
        L.portalLightIgnited,
        Math.max(clampedRatio * 0.35, this.portalIgniteBlend),
      );
      this.portalPointLight.intensity =
        baseIntensity * (0.92 + 0.08 * Math.sin(time * 4.5));
      this.portalPointLight.color.setHex(
        ignited ? PALETTE.atlanteanGold : PALETTE.biolumCyan,
      );
    }
  }

  public update(dt: number, elapsed: number): void {
    const cfg = SUNKEN_CHAMBER_CONFIG;

    // 1. Scroll animated cyan water-caustic floor layer
    if (this.causticTexture && this.causticMat) {
      this.causticTexture.offset.x =
        (elapsed * cfg.causticScrollSpeedX) % 1;
      this.causticTexture.offset.y =
        (elapsed * cfg.causticScrollSpeedY) % 1;
      this.causticMat.opacity =
        cfg.causticOpacityBase + Math.sin(elapsed * 2.1) * cfg.causticPulseAmp;
    }

    // 2. Sway ribbon-kelp fronds smoothly with underwater current
    for (let i = 0; i < this.kelpFronds.length; i++) {
      const rec = this.kelpFronds[i];
      if (!rec) continue;
      const posAttr = rec.mesh.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const base = rec.basePositions;

      for (let v = 0; v < posAttr.count; v++) {
        const bx = base[v * 3 + 0] ?? 0;
        const by = base[v * 3 + 1] ?? 0;
        const bz = base[v * 3 + 2] ?? 0;
        const t = THREE.MathUtils.clamp(by / Math.max(0.1, rec.height), 0, 1);
        const sway =
          Math.sin(elapsed * cfg.kelpSwaySpeed + rec.phase + t * 3.2) *
          cfg.kelpSwayAmp *
          t *
          t;
        posAttr.setXYZ(v, bx + sway * 0.45, by, bz + sway);
      }
      posAttr.needsUpdate = true;
    }

    // 3. Flicker underwater trident brazier flames
    for (let i = 0; i < this.braziers.length; i++) {
      const b = this.braziers[i];
      if (!b) continue;
      const pulse = 1 + Math.sin(elapsed * 6.5 + b.phase) * 0.16;
      b.flame.scale.set(0.85, 1.55 * pulse, 0.85);
      b.flame.rotation.y = elapsed * 1.4 + b.phase;
      if (b.light) {
        b.light.intensity =
          cfg.lighting.brazierLightIntensity * (0.9 + 0.12 * pulse);
      }
    }

    // 4. Rise bioluminescent plankton & bubble motes
    if (this.bubbleMotes) {
      const posAttr = this.bubbleMotes.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const halfW = cfg.width * 0.46;
      const halfL = cfg.length * 0.46;
      const maxH = cfg.ceilingY - 1.2;

      for (let i = 0; i < this.bubbleVelocities.length; i++) {
        const vel = this.bubbleVelocities[i];
        if (!vel) continue;
        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        let z = posAttr.getZ(i);

        y += vel.vy * dt;
        x += Math.sin(elapsed * vel.swaySpeed + vel.phase) * cfg.bubbleSwayAmp * dt;
        if (y > maxH) {
          y = 0.3;
          x = (Math.random() * 2 - 1) * halfW;
          z = (Math.random() * 2 - 1) * halfL;
        }
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
    }

    // 5. Keep Tidal Astral Portal shader & lights smoothly animated
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
