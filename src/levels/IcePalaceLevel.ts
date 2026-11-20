import * as THREE from 'three';
import {
  ARENA_CONFIG,
  CHAMBER_CONFIG,
  DESTRUCTIBLE_PROP_TYPES,
  PALETTE,
  type DestructiblePropType,
} from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';

export interface ChamberCollider {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
}

export interface FrostUrnSpawnRecord {
  readonly index: number;
  readonly propType: DestructiblePropType;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly hp: number;
  readonly healValue: number;
  readonly hitRadius: number;
  readonly mesh: THREE.Group;
}

interface SwayingBannerRecord {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshToonMaterial>;
  readonly basePositions: Float32Array;
  readonly phase: number;
  readonly side: -1 | 1;
}

interface BrazierFlameRecord {
  readonly outerFlame: THREE.Mesh;
  readonly innerFlame: THREE.Mesh;
  readonly light: THREE.PointLight | null;
  readonly phase: number;
}

interface ChandelierRecord {
  readonly group: THREE.Group;
  readonly spinDir: -1 | 1;
}

interface FrostMoteVelocity {
  readonly vy: number;
  readonly swaySpeed: number;
  readonly phase: number;
}

const PORTAL_VORTEX_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PORTAL_VORTEX_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uIgnite;
  uniform float uCharge;
  uniform float uArms;
  uniform vec3 uColorViolet;
  uniform vec3 uColorCyan;
  uniform vec3 uColorCore;
  uniform vec3 uColorDeep;
  varying vec2 vUv;

  void main() {
    vec2 centered = (vUv - 0.5) * 2.0;
    float dist = length(centered);
    if (dist > 1.0) discard;

    float angle = atan(centered.y, centered.x);
    float swirl = angle * uArms + dist * 7.5 - uTime * 3.4;
    float spiral = 0.5 + 0.5 * sin(swirl);
    float secondary = 0.5 + 0.5 * cos(angle * (uArms - 2.0) - dist * 9.0 + uTime * 2.3);
    float ripple = 0.5 + 0.5 * sin(dist * 16.0 - uTime * 5.0);

    float energy = mix(spiral, secondary, 0.42) * 0.72 + ripple * 0.28;
    vec3 baseCol = mix(uColorDeep, uColorViolet, clamp(energy * 1.15, 0.0, 1.0));
    baseCol = mix(baseCol, uColorCyan, smoothstep(0.35, 0.92, spiral * (1.0 - dist * 0.35)));
    baseCol = mix(baseCol, uColorCore, smoothstep(0.45, 0.0, dist) * (0.45 + 0.55 * uIgnite));

    float rim = smoothstep(0.76, 0.98, dist) * (1.0 - smoothstep(0.96, 1.0, dist));
    baseCol += uColorCyan * rim * (0.8 + 0.4 * sin(uTime * 6.0));

    float edgeFade = 1.0 - smoothstep(0.88, 1.0, dist);
    float visibility = clamp(uIgnite * 0.92 + uCharge * 0.22, 0.0, 0.95);
    float alpha = edgeFade * visibility * (0.55 + 0.45 * energy);
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(baseCol * (0.85 + 0.65 * uIgnite), alpha);
  }
`;

/**
 * Self-contained procedural 3D environment for Realm I: **The Royal Ice Chambers**.
 *
 * Built with cel-shaded MeshToonMaterial + ink-black BackSide outlines:
 * - Vaulted dark slate-blue frost-marble cathedral hall with glowing cyan filigree
 * - Colonnade of faceted hexagonal ice pillars curving into pointed Gothic arches
 * - Midnight-indigo velvet runner & swaying tiara-crest royal banners
 * - Cold-flame obsidian braziers, geometric icicle chandeliers, frosted knight statues
 * - 8 Destructible Frost Urns returned for ECS registration
 * - Raised Astral Portal dais with 12 segmented runic lights, frosted seal barrier,
 *   and swirling violet-and-cyan GLSL vortex shader controlled via `setPortalCharge`.
 */
export class IcePalaceLevel {
  public readonly root = new THREE.Group();
  public readonly portalPosition = new THREE.Vector3(
    0,
    CHAMBER_CONFIG.portalCenterY,
    CHAMBER_CONFIG.portalZ,
  );

  private readonly _pillarColliders: ChamberCollider[] = [];
  private readonly _pillarMeshes: THREE.Object3D[] = [];
  private readonly _urnSpawns: FrostUrnSpawnRecord[] = [];
  private readonly banners: SwayingBannerRecord[] = [];
  private readonly braziers: BrazierFlameRecord[] = [];
  private readonly chandeliers: ChandelierRecord[] = [];
  private readonly portalRuneMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  private portalSealMesh: THREE.Mesh | null = null;
  private portalSealMat: THREE.MeshBasicMaterial | null = null;
  private portalVortexMesh: THREE.Mesh | null = null;
  private portalVortexMat: THREE.ShaderMaterial | null = null;
  private portalInnerRing: THREE.Mesh | null = null;
  private portalPointLight: THREE.PointLight | null = null;

  private frostMotes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > | null = null;
  private readonly frostMoteVelocities: FrostMoteVelocity[] = [];

  private currentPortalCharge = 0;
  private currentPortalIgnited = false;
  private portalIgniteBlend = 0;

  public get pillarColliders(): readonly ChamberCollider[] {
    return this._pillarColliders;
  }

  public get pillarMeshes(): readonly THREE.Object3D[] {
    return this._pillarMeshes;
  }

  public get urnSpawns(): readonly FrostUrnSpawnRecord[] {
    return this._urnSpawns;
  }

  constructor() {
    this.root.name = 'IcePalaceLevel';
    this.buildMarbleFloorAndWalls();
    this.buildColonnadeAndGothicArches();
    this.buildRoyalCarpet();
    this.buildSwayingBanners();
    this.buildColdFlameBraziers();
    this.buildIcicleChandeliers();
    this.buildKnightStatues();
    this.buildDestructibleFrostUrns();
    this.buildAstralPortalDais();
    this.buildFrostMotes();
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
   * Procedural slate-blue frost-marble floor textures with inlaid glowing cyan filigree lines.
   */
  private createMarbleFiligreeTextures(): {
    diffuseMap: THREE.CanvasTexture;
    emissiveMap: THREE.CanvasTexture;
  } {
    const size = CHAMBER_CONFIG.floorTextureSize;
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = size;
    diffCanvas.height = size;
    const dCtx = diffCanvas.getContext('2d');

    const emisCanvas = document.createElement('canvas');
    emisCanvas.width = size;
    emisCanvas.height = size;
    const eCtx = emisCanvas.getContext('2d');

    if (dCtx && eCtx) {
      dCtx.fillStyle = PALETTE.hex.frostMarble;
      dCtx.fillRect(0, 0, size, size);

      // Subtle slate marble tile blocks & mineral veining
      const tiles = 4;
      const tileSize = size / tiles;
      for (let gx = 0; gx < tiles; gx++) {
        for (let gy = 0; gy < tiles; gy++) {
          const checker = (gx + gy) % 2 === 0;
          dCtx.fillStyle = checker
            ? PALETTE.hex.frostMarble
            : PALETTE.hex.marbleWall;
          dCtx.fillRect(gx * tileSize, gy * tileSize, tileSize, tileSize);

          // Diagonal marble veins
          dCtx.strokeStyle = PALETTE.rgba.marbleVeinLight;
          dCtx.lineWidth = 2;
          dCtx.beginPath();
          dCtx.moveTo(gx * tileSize + 18, gy * tileSize + 24);
          dCtx.quadraticCurveTo(
            gx * tileSize + tileSize * 0.55,
            gy * tileSize + tileSize * 0.42,
            gx * tileSize + tileSize - 16,
            gy * tileSize + tileSize - 22,
          );
          dCtx.stroke();

          dCtx.strokeStyle = PALETTE.rgba.marbleVeinDeep;
          dCtx.lineWidth = 3;
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

      const drawFiligree = (
        ctx: CanvasRenderingContext2D,
        isEmissive: boolean,
      ): void => {
        const lineColor = isEmissive
          ? PALETTE.rgba.filigreeEmissive
          : PALETTE.rgba.filigreeDiffuse;
        const glowColor = PALETTE.rgba.filigreeGlow;

        // Twin longitudinal cyan inlay channels flanking the nave
        const xOffsets = [size * 0.16, size * 0.84, size * 0.5];
        for (let i = 0; i < xOffsets.length; i++) {
          const x = xOffsets[i] ?? size * 0.5;
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size);
          ctx.stroke();

          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size);
          ctx.stroke();
        }

        // Cross filigree bands and diamond crystal nodes at tile intersections
        for (let g = 0; g <= tiles; g++) {
          const y = g * tileSize;
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(size, y);
          ctx.stroke();

          for (let gx = 0; gx < tiles; gx++) {
            const cx = (gx + 0.5) * tileSize;
            const cy = (g + 0.5) * tileSize;
            if (cy >= size) continue;
            const r = tileSize * 0.16;
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy - r);
            ctx.lineTo(cx + r, cy);
            ctx.lineTo(cx, cy + r);
            ctx.lineTo(cx - r, cy);
            ctx.closePath();
            ctx.stroke();
          }
        }
      };

      drawFiligree(dCtx, false);
      drawFiligree(eCtx, true);
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
   * Procedural midnight-indigo velvet carpet runner with silver-cyan snowflake & crown trim.
   */
  private createRoyalCarpetTexture(): THREE.CanvasTexture {
    const size = CHAMBER_CONFIG.carpetTextureSize;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = PALETTE.hex.royalIndigo;
      ctx.fillRect(0, 0, size, size);

      // Subtle woven velvet sheen bands
      for (let y = 0; y < size; y += 8) {
        ctx.fillStyle =
          y % 16 === 0 ? PALETTE.rgba.carpetPile : PALETTE.rgba.carpetShadow;
        ctx.fillRect(0, y, size, 4);
      }

      // Twin outer silver-cyan border ribbons
      const margin = 26;
      ctx.fillStyle = PALETTE.rgba.carpetTrimCyan;
      ctx.fillRect(margin, 0, 10, size);
      ctx.fillRect(size - margin - 10, 0, 10, size);

      ctx.fillStyle = PALETTE.rgba.carpetTrimSilver;
      ctx.fillRect(margin + 18, 0, 4, size);
      ctx.fillRect(size - margin - 22, 0, 4, size);

      // Center repeating snowflake-and-crown filigree medallion
      const cx = size * 0.5;
      const cy = size * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = PALETTE.rgba.carpetTrimCyan;
      ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i / 6) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -108);
        ctx.moveTo(-18, -72);
        ctx.lineTo(0, -90);
        ctx.lineTo(18, -72);
        ctx.stroke();
        ctx.restore();
      }

      // Stylized Empress Crown crest above & below the snowflake
      const drawCrown = (offsetY: number, flip: number) => {
        ctx.save();
        ctx.translate(0, offsetY);
        ctx.scale(1, flip);
        ctx.strokeStyle = PALETTE.rgba.carpetTrimSilver;
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(-48, 18);
        ctx.lineTo(-38, -16);
        ctx.lineTo(-16, 4);
        ctx.lineTo(0, -28);
        ctx.lineTo(16, 4);
        ctx.lineTo(38, -16);
        ctx.lineTo(48, 18);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      };
      drawCrown(-170, 1);
      drawCrown(170, -1);
      ctx.restore();
    }

    const tex = this.trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, CHAMBER_CONFIG.carpetTextureRepeat);
    tex.anisotropy = 4;
    return tex;
  }

  /**
   * Procedural royal banner texture bearing Marina's crystalline tiara crest on midnight indigo.
   */
  private createRoyalBannerTexture(): THREE.CanvasTexture {
    const w = CHAMBER_CONFIG.bannerTextureSize * 0.5;
    const h = CHAMBER_CONFIG.bannerTextureSize;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = PALETTE.hex.royalIndigo;
      ctx.fillRect(0, 0, w, h);

      // Subtle vertical fabric fold shadows
      for (let x = 0; x < w; x += 32) {
        ctx.fillStyle = PALETTE.rgba.bannerFold;
        ctx.fillRect(x, 0, 10, h);
      }

      // Glowing cyan border trim
      ctx.strokeStyle = PALETTE.hex.bannerTrim;
      ctx.lineWidth = 8;
      ctx.strokeRect(14, 14, w - 28, h - 28);

      ctx.strokeStyle = PALETTE.rgba.carpetTrimSilver;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(24, 24, w - 48, h - 48);

      // Crystalline Tiara Emblem in upper-middle banner
      ctx.save();
      ctx.translate(w * 0.5, h * 0.36);

      // Halo behind tiara
      ctx.strokeStyle = PALETTE.rgba.bannerCrestGlow;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 58, 0, Math.PI * 2);
      ctx.stroke();

      // Five-spire crystalline tiara silhouette
      ctx.fillStyle = PALETTE.hex.iceHighlights;
      ctx.strokeStyle = PALETTE.hex.bannerTrim;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-46, 22);
      ctx.lineTo(-42, -14);
      ctx.lineTo(-22, 4);
      ctx.lineTo(-16, -34);
      ctx.lineTo(-5, -4);
      ctx.lineTo(0, -52);
      ctx.lineTo(5, -4);
      ctx.lineTo(16, -34);
      ctx.lineTo(22, 4);
      ctx.lineTo(42, -14);
      ctx.lineTo(46, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Sapphire center gem
      ctx.fillStyle = PALETTE.hex.bannerTrim;
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(8, -10);
      ctx.lineTo(0, 4);
      ctx.lineTo(-8, -10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Lower vertical snowflake pendant
      ctx.save();
      ctx.translate(w * 0.5, h * 0.72);
      ctx.strokeStyle = PALETTE.rgba.carpetTrimCyan;
      ctx.lineWidth = 3.5;
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i / 6) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -44);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    const tex = this.trackTex(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /**
   * Builds the inlaid frost-marble floor, vaulted walls, entrance arch, and vaulted ceiling.
   */
  private buildMarbleFloorAndWalls(): void {
    const W = CHAMBER_CONFIG.width;
    const L = CHAMBER_CONFIG.length;
    const H = CHAMBER_CONFIG.wallHeight;
    const T = CHAMBER_CONFIG.wallThickness;

    const { diffuseMap, emissiveMap } = this.createMarbleFiligreeTextures();
    const floorGeo = this.trackGeo(new THREE.BoxGeometry(W, 0.8, L));
    const floorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: diffuseMap,
        emissive: new THREE.Color(PALETTE.frostRunes),
        emissiveMap,
        emissiveIntensity: 0.65,
        roughness: 0.24,
        metalness: 0.3,
      }),
    );
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -0.4, 0);
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    const wallMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.marbleWall, {
        emissive: PALETTE.glacialNavy,
        emissiveIntensity: 0.12,
      }),
    );
    const trimMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.bannerTrim }),
    );
    const ceilingMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.chamberVoid),
    );

    // Side Nave Walls (Left & Right)
    const sideWallGeo = this.trackGeo(new THREE.BoxGeometry(T, H, L + T * 2));
    const sideSides: readonly (-1 | 1)[] = [-1, 1];
    sideSides.forEach((side) => {
      const wall = new THREE.Mesh(sideWallGeo, wallMat);
      wall.position.set(side * (W * 0.5 + T * 0.5), H * 0.5, 0);
      wall.receiveShadow = true;
      this.root.add(wall);
      this._pillarMeshes.push(wall);

      // Glowing horizontal cyan molding trim running the length of each wall
      const trimGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 0.16, L));
      const lowerTrim = new THREE.Mesh(trimGeo, trimMat);
      lowerTrim.position.set(side * (W * 0.5 - 0.05), 1.2, 0);
      this.root.add(lowerTrim);

      const upperTrim = new THREE.Mesh(trimGeo, trimMat);
      upperTrim.position.set(side * (W * 0.5 - 0.05), CHAMBER_CONFIG.pillarHeight, 0);
      this.root.add(upperTrim);
    });

    // Far Apse Wall behind the Astral Portal Dais (-Z) & Entrance Gate Wall (+Z)
    const endWallGeo = this.trackGeo(new THREE.BoxGeometry(W + T * 2, H, T));
    const backWall = new THREE.Mesh(endWallGeo, wallMat);
    backWall.position.set(0, H * 0.5, -(L * 0.5 + T * 0.5));
    backWall.receiveShadow = true;
    this.root.add(backWall);
    this._pillarMeshes.push(backWall);

    const frontWall = new THREE.Mesh(endWallGeo, wallMat);
    frontWall.position.set(0, H * 0.5, L * 0.5 + T * 0.5);
    frontWall.receiveShadow = true;
    this.root.add(frontWall);
    this._pillarMeshes.push(frontWall);

    // High Vaulted Cathedral Ceiling Cap
    const ceilGeo = this.trackGeo(new THREE.PlaneGeometry(W + T * 2, L + T * 2));
    const ceilMesh = new THREE.Mesh(ceilGeo, ceilingMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set(0, CHAMBER_CONFIG.ceilingY, 0);
    this.root.add(ceilMesh);
  }

  /**
   * Builds two colonnades of faceted hexagonal ice pillars curving overhead into
   * pointed Gothic crystal arches spanning the nave.
   */
  private buildColonnadeAndGothicArches(): void {
    const iceBodyMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.iceFloor, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.18,
      }),
    );
    const iceCapMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.iceHighlights, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.28,
      }),
    );
    const plinthMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.frostMarble),
    );
    const runeMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.bannerTrim }),
    );

    const pillarH = CHAMBER_CONFIG.pillarHeight;
    const shaftH = pillarH - 1.65;
    const plinthGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.86, 1.02, 0.72, 6),
    );
    const shaftGeo = this.trackGeo(
      new THREE.CylinderGeometry(
        CHAMBER_CONFIG.pillarRadius * 0.88,
        CHAMBER_CONFIG.pillarRadius,
        shaftH,
        6,
      ),
    );
    const capGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.92, 0.68, 0.75, 6),
    );
    const bandGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.76, 0.76, 0.14, 6),
    );

    const rowX = CHAMBER_CONFIG.pillarRowX;
    const apexY = pillarH + CHAMBER_CONFIG.archApexRise;

    // Shared pointed Gothic arch curve geometry (spanning -rowX -> 0 -> +rowX)
    const leftArchCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-rowX, pillarH - 0.25, 0),
      new THREE.Vector3(-rowX * 0.72, pillarH + CHAMBER_CONFIG.archApexRise * 0.56, 0),
      new THREE.Vector3(-rowX * 0.28, pillarH + CHAMBER_CONFIG.archApexRise * 0.88, 0),
      new THREE.Vector3(0, apexY, 0),
    ]);
    const rightArchCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(rowX, pillarH - 0.25, 0),
      new THREE.Vector3(rowX * 0.72, pillarH + CHAMBER_CONFIG.archApexRise * 0.56, 0),
      new THREE.Vector3(rowX * 0.28, pillarH + CHAMBER_CONFIG.archApexRise * 0.88, 0),
      new THREE.Vector3(0, apexY, 0),
    ]);

    const leftRibGeo = this.trackGeo(
      new THREE.TubeGeometry(
        leftArchCurve,
        CHAMBER_CONFIG.archTubularSegments,
        CHAMBER_CONFIG.archRibRadius,
        6,
        false,
      ),
    );
    const rightRibGeo = this.trackGeo(
      new THREE.TubeGeometry(
        rightArchCurve,
        CHAMBER_CONFIG.archTubularSegments,
        CHAMBER_CONFIG.archRibRadius,
        6,
        false,
      ),
    );
    const keystoneGeo = this.trackGeo(new THREE.OctahedronGeometry(0.45, 0));

    const sides: readonly (-1 | 1)[] = [-1, 1];

    for (let i = 0; i < CHAMBER_CONFIG.pillarCountPerSide; i++) {
      const pz = CHAMBER_CONFIG.pillarStartZ - i * CHAMBER_CONFIG.pillarSpacing;

      for (let s = 0; s < sides.length; s++) {
        const side = sides[s] ?? 1;
        const px = side * rowX;
        const pillarGroup = new THREE.Group();
        pillarGroup.position.set(px, 0, pz);

        const plinth = new THREE.Mesh(plinthGeo, plinthMat);
        plinth.position.y = 0.36;
        plinth.castShadow = true;
        plinth.receiveShadow = true;
        pillarGroup.add(plinth);

        const lowerBand = new THREE.Mesh(bandGeo, runeMat);
        lowerBand.position.y = 0.82;
        pillarGroup.add(lowerBand);

        const { group: shaftObj, mainMesh: shaftMesh } =
          ToonAssets.createOutlinedMesh(
            shaftGeo,
            iceBodyMat,
            { x: 1.06, y: 1.01, z: 1.06 },
            true,
          );
        shaftObj.position.y = 0.82 + shaftH * 0.5;
        pillarGroup.add(shaftObj);

        const upperBand = new THREE.Mesh(bandGeo, runeMat);
        upperBand.position.y = pillarH - 0.72;
        pillarGroup.add(upperBand);

        const { group: capObj } = ToonAssets.createOutlinedMesh(
          capGeo,
          iceCapMat,
          ARENA_CONFIG.defaultOutlineScale,
          true,
        );
        capObj.position.y = pillarH - 0.32;
        pillarGroup.add(capObj);

        this.root.add(pillarGroup);

        this._pillarColliders.push({
          x: px,
          z: pz,
          radius: CHAMBER_CONFIG.pillarCollisionRadius,
          height: pillarH,
        });
        this._pillarMeshes.push(shaftMesh, plinth);
      }

      // Pointed Gothic Crystal Arch spanning the pair of pillars
      const archGroup = new THREE.Group();
      archGroup.position.set(0, 0, pz);

      const { group: leftRib } = ToonAssets.createOutlinedMesh(
        leftRibGeo,
        iceCapMat,
        1.08,
        false,
      );
      const { group: rightRib } = ToonAssets.createOutlinedMesh(
        rightRibGeo,
        iceCapMat,
        1.08,
        false,
      );
      archGroup.add(leftRib, rightRib);

      // Glowing crystalline keystone at the Gothic arch apex
      const keystone = new THREE.Mesh(keystoneGeo, runeMat);
      keystone.position.set(0, apexY, 0);
      archGroup.add(keystone);

      this.root.add(archGroup);
    }
  }

  /**
   * Lays the procedural midnight-indigo velvet runner stretching down the cathedral nave.
   */
  private buildRoyalCarpet(): void {
    const carpetLen = Math.abs(
      CHAMBER_CONFIG.carpetStartZ - CHAMBER_CONFIG.carpetEndZ,
    );
    const centerZ =
      (CHAMBER_CONFIG.carpetStartZ + CHAMBER_CONFIG.carpetEndZ) * 0.5;
    const carpetTex = this.createRoyalCarpetTexture();

    const carpetGeo = this.trackGeo(
      new THREE.PlaneGeometry(CHAMBER_CONFIG.carpetWidth, carpetLen),
    );
    const carpetMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.pureWhite, {
        emissive: PALETTE.royalIndigo,
        emissiveIntensity: 0.22,
      }),
    );
    carpetMat.map = carpetTex;
    carpetMat.needsUpdate = true;

    const carpetMesh = new THREE.Mesh(carpetGeo, carpetMat);
    carpetMesh.rotation.x = -Math.PI / 2;
    carpetMesh.position.set(0, CHAMBER_CONFIG.carpetY, centerZ);
    carpetMesh.receiveShadow = true;
    this.root.add(carpetMesh);
  }

  /**
   * Hangs tall swaying royal banners bearing Marina's crystalline tiara crest between pillars.
   */
  private buildSwayingBanners(): void {
    const bannerTex = this.createRoyalBannerTexture();
    const bannerMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.pureWhite, {
        emissive: PALETTE.royalIndigo,
        emissiveIntensity: 0.25,
        side: THREE.DoubleSide,
      }),
    );
    bannerMat.map = bannerTex;
    bannerMat.needsUpdate = true;

    const rodMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.obsidianTrim),
    );
    const finialMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.bannerTrim }),
    );
    const rodGeo = this.trackGeo(
      new THREE.CylinderGeometry(
        0.045,
        0.045,
        CHAMBER_CONFIG.bannerWidth + 0.36,
        8,
      ),
    );
    rodGeo.rotateZ(Math.PI / 2);
    const finialGeo = this.trackGeo(new THREE.OctahedronGeometry(0.09, 0));

    const wallX = CHAMBER_CONFIG.width * 0.5 - CHAMBER_CONFIG.bannerWallInset;
    const sides: readonly (-1 | 1)[] = [-1, 1];
    let phaseIdx = 0;

    for (let i = 0; i < CHAMBER_CONFIG.pillarCountPerSide - 1; i++) {
      const bz =
        CHAMBER_CONFIG.pillarStartZ - (i + 0.5) * CHAMBER_CONFIG.pillarSpacing;

      for (let s = 0; s < sides.length; s++) {
        const side = sides[s] ?? 1;
        const bx = side * wallX;

        const geo = this.trackGeo(
          new THREE.PlaneGeometry(
            CHAMBER_CONFIG.bannerWidth,
            CHAMBER_CONFIG.bannerHeight,
            2,
            CHAMBER_CONFIG.bannerSegmentsY,
          ),
        );
        // Shift vertices so y=0 is the top mounting rod and banner hangs downward
        geo.translate(0, -CHAMBER_CONFIG.bannerHeight * 0.5, 0);

        const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
        const basePositions = new Float32Array(posAttr.array.length);
        basePositions.set(posAttr.array as Float32Array);

        const bannerMesh = new THREE.Mesh(geo, bannerMat);
        bannerMesh.position.set(bx, CHAMBER_CONFIG.bannerTopY, bz);
        bannerMesh.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
        bannerMesh.castShadow = true;
        this.root.add(bannerMesh);

        // Crossbar rod + glowing crystal finials
        const rodGroup = new THREE.Group();
        rodGroup.position.set(bx, CHAMBER_CONFIG.bannerTopY, bz);
        rodGroup.rotation.y = bannerMesh.rotation.y;
        const rod = new THREE.Mesh(rodGeo, rodMat);
        const fL = new THREE.Mesh(finialGeo, finialMat);
        fL.position.x = -(CHAMBER_CONFIG.bannerWidth * 0.5 + 0.2);
        const fR = new THREE.Mesh(finialGeo, finialMat);
        fR.position.x = CHAMBER_CONFIG.bannerWidth * 0.5 + 0.2;
        rodGroup.add(rod, fL, fR);
        this.root.add(rodGroup);

        this.banners.push({
          mesh: bannerMesh,
          basePositions,
          phase: phaseIdx * CHAMBER_CONFIG.bannerSwayPhaseStep,
          side,
        });
        phaseIdx++;
      }
    }
  }

  /**
   * Places cold-flame obsidian braziers along the colonnade pillars with flickering ice flames.
   */
  private buildColdFlameBraziers(): void {
    const obsidianMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.abyssalCloak),
    );
    const bowlTrimMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.amethystTrim, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.25,
      }),
    );
    const outerFlameMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.coldFlame,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const innerFlameMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.iceHighlights,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    const stemGeo = this.trackGeo(new THREE.CylinderGeometry(0.14, 0.24, 1.35, 6));
    const bowlGeo = this.trackGeo(new THREE.CylinderGeometry(0.42, 0.18, 0.36, 6));
    const ringGeo = this.trackGeo(new THREE.TorusGeometry(0.4, 0.04, 6, 12));
    const outerFlameGeo = this.trackGeo(new THREE.ConeGeometry(0.28, 0.85, 6));
    const innerFlameGeo = this.trackGeo(new THREE.ConeGeometry(0.14, 0.55, 5));

    const bxDist = CHAMBER_CONFIG.pillarRowX - CHAMBER_CONFIG.brazierInset;
    const sides: readonly (-1 | 1)[] = [-1, 1];
    let idx = 0;

    for (let i = 0; i < CHAMBER_CONFIG.pillarCountPerSide; i++) {
      const bz = CHAMBER_CONFIG.pillarStartZ - i * CHAMBER_CONFIG.pillarSpacing;

      for (let s = 0; s < sides.length; s++) {
        const side = sides[s] ?? 1;
        const brazierGroup = new THREE.Group();
        brazierGroup.position.set(side * bxDist, 0, bz);

        const { group: stemObj } = ToonAssets.createOutlinedMesh(
          stemGeo,
          obsidianMat,
          ARENA_CONFIG.defaultOutlineScale,
          true,
        );
        stemObj.position.y = 0.675;
        brazierGroup.add(stemObj);

        const { group: bowlObj } = ToonAssets.createOutlinedMesh(
          bowlGeo,
          obsidianMat,
          ARENA_CONFIG.defaultOutlineScale,
          true,
        );
        bowlObj.position.y = 1.48;
        brazierGroup.add(bowlObj);

        const trimRing = new THREE.Mesh(ringGeo, bowlTrimMat);
        trimRing.rotation.x = Math.PI / 2;
        trimRing.position.y = 1.62;
        brazierGroup.add(trimRing);

        const outerFlame = new THREE.Mesh(outerFlameGeo, outerFlameMat);
        outerFlame.position.y = 2.02;
        brazierGroup.add(outerFlame);

        const innerFlame = new THREE.Mesh(innerFlameGeo, innerFlameMat);
        innerFlame.position.y = 1.92;
        brazierGroup.add(innerFlame);

        // Attach selective cold-flame PointLights to avoid fragment shader light overload
        let light: THREE.PointLight | null = null;
        if (i % CHAMBER_CONFIG.brazierLightStride === 0) {
          light = new THREE.PointLight(
            PALETTE.coldFlame,
            CHAMBER_CONFIG.brazierLightIntensity,
            CHAMBER_CONFIG.brazierLightDistance,
            CHAMBER_CONFIG.brazierLightDecay,
          );
          light.position.y = 2.25;
          brazierGroup.add(light);
        }

        this.root.add(brazierGroup);
        this.braziers.push({
          outerFlame,
          innerFlame,
          light,
          phase: idx * 1.13,
        });
        idx++;
      }
    }
  }

  /**
   * Suspends geometric crystal icicle chandeliers down the nave centerline.
   */
  private buildIcicleChandeliers(): void {
    const frameMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.obsidianTrim),
    );
    const crystalMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.iceHighlights, {
        emissive: PALETTE.coldFlame,
        emissiveIntensity: 0.48,
      }),
    );
    const coreMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.coldFlame }),
    );

    const chainLen = CHAMBER_CONFIG.ceilingY - CHAMBER_CONFIG.chandelierY;
    const chainGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.04, 0.04, chainLen, 6),
    );
    const outerRingGeo = this.trackGeo(new THREE.TorusGeometry(2.15, 0.08, 6, 12));
    const innerRingGeo = this.trackGeo(new THREE.TorusGeometry(1.1, 0.06, 6, 8));
    const icicleGeo = this.trackGeo(new THREE.ConeGeometry(0.14, 1.35, 5));
    const coreCrystalGeo = this.trackGeo(new THREE.OctahedronGeometry(0.45, 0));

    CHAMBER_CONFIG.chandelierZPositions.forEach((cz, idx) => {
      const anchorGroup = new THREE.Group();
      anchorGroup.position.set(0, CHAMBER_CONFIG.chandelierY, cz);

      const chain = new THREE.Mesh(chainGeo, frameMat);
      chain.position.y = chainLen * 0.5;
      anchorGroup.add(chain);

      const spinGroup = new THREE.Group();

      const outerRing = new THREE.Mesh(outerRingGeo, frameMat);
      outerRing.rotation.x = Math.PI / 2;
      spinGroup.add(outerRing);

      const innerRing = new THREE.Mesh(innerRingGeo, frameMat);
      innerRing.rotation.x = Math.PI / 2;
      innerRing.position.y = -0.65;
      spinGroup.add(innerRing);

      const coreCrystal = new THREE.Mesh(coreCrystalGeo, coreMat);
      coreCrystal.position.y = -0.3;
      spinGroup.add(coreCrystal);

      const icicleCount = CHAMBER_CONFIG.chandelierIcicleCount;
      for (let k = 0; k < icicleCount; k++) {
        const ang = (k / icicleCount) * Math.PI * 2;
        const isOuter = k % 2 === 0;
        const r = isOuter ? 2.15 : 1.1;
        const yOff = isOuter ? -0.65 : -1.25;
        const { group: icicleObj } = ToonAssets.createOutlinedMesh(
          icicleGeo,
          crystalMat,
          1.06,
          false,
        );
        icicleObj.rotation.x = Math.PI;
        icicleObj.position.set(Math.cos(ang) * r, yOff, Math.sin(ang) * r);
        icicleObj.scale.setScalar(isOuter ? 1.0 : 0.78);
        spinGroup.add(icicleObj);
      }

      const light = new THREE.PointLight(
        PALETTE.coldFlame,
        CHAMBER_CONFIG.chandelierLightIntensity,
        CHAMBER_CONFIG.chandelierLightDistance,
        CHAMBER_CONFIG.chandelierLightDecay,
      );
      light.position.y = -0.9;
      anchorGroup.add(light);

      anchorGroup.add(spinGroup);
      this.root.add(anchorGroup);
      this.chandeliers.push({
        group: spinGroup,
        spinDir: idx % 2 === 0 ? 1 : -1,
      });
    });
  }

  /**
   * Builds sculpted frosted knight statues flanking the central runway on stepped pedestals.
   */
  private buildKnightStatues(): void {
    const marbleMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.frostMarble),
    );
    const statueMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.knightFrost, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.14,
      }),
    );
    const visorMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.coldFlame }),
    );

    const pedGeo = this.trackGeo(new THREE.BoxGeometry(1.35, 0.8, 1.35));
    const legsGeo = this.trackGeo(new THREE.CylinderGeometry(0.28, 0.34, 0.95, 6));
    const torsoGeo = this.trackGeo(new THREE.CylinderGeometry(0.38, 0.26, 0.85, 6));
    const pauldronGeo = this.trackGeo(new THREE.OctahedronGeometry(0.22, 0));
    const helmGeo = this.trackGeo(new THREE.ConeGeometry(0.22, 0.48, 6));
    const visorGeo = this.trackGeo(new THREE.BoxGeometry(0.24, 0.05, 0.14));
    const swordGeo = this.trackGeo(new THREE.BoxGeometry(0.08, 1.65, 0.04));
    const guardGeo = this.trackGeo(new THREE.BoxGeometry(0.42, 0.07, 0.09));

    const sides: readonly (-1 | 1)[] = [-1, 1];
    const scale = CHAMBER_CONFIG.statueScale;

    CHAMBER_CONFIG.statueZPositions.forEach((sz) => {
      for (let s = 0; s < sides.length; s++) {
        const side = sides[s] ?? 1;
        const sx = side * CHAMBER_CONFIG.statueX;

        const group = new THREE.Group();
        group.position.set(sx, 0, sz);
        group.rotation.y = side === -1 ? Math.PI * 0.5 : -Math.PI * 0.5;

        const { group: pedObj, mainMesh: pedMesh } =
          ToonAssets.createOutlinedMesh(
            pedGeo,
            marbleMat,
            ARENA_CONFIG.defaultOutlineScale,
            true,
          );
        pedObj.position.y = 0.4;
        group.add(pedObj);

        const knight = new THREE.Group();
        knight.position.y = 0.8;
        knight.scale.setScalar(scale);

        const { group: legsObj } = ToonAssets.createOutlinedMesh(
          legsGeo,
          statueMat,
          ARENA_CONFIG.defaultOutlineScale,
          true,
        );
        legsObj.position.y = 0.475;
        knight.add(legsObj);

        const { group: torsoObj } = ToonAssets.createOutlinedMesh(
          torsoGeo,
          statueMat,
          ARENA_CONFIG.defaultOutlineScale,
          true,
        );
        torsoObj.position.y = 1.32;
        knight.add(torsoObj);

        const pL = new THREE.Mesh(pauldronGeo, statueMat);
        pL.position.set(-0.4, 1.62, 0);
        const pR = new THREE.Mesh(pauldronGeo, statueMat);
        pR.position.set(0.4, 1.62, 0);
        knight.add(pL, pR);

        const { group: helmObj } = ToonAssets.createOutlinedMesh(
          helmGeo,
          statueMat,
          ARENA_CONFIG.defaultOutlineScale,
          true,
        );
        helmObj.position.y = 1.98;
        knight.add(helmObj);

        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 1.9, 0.14);
        knight.add(visor);

        // Upright broadsword planted in front of the knight
        const sword = new THREE.Mesh(swordGeo, statueMat);
        sword.position.set(0, 0.82, 0.34);
        const guard = new THREE.Mesh(guardGeo, statueMat);
        guard.position.set(0, 1.32, 0.34);
        knight.add(sword, guard);

        group.add(knight);
        this.root.add(group);

        this._pillarColliders.push({
          x: sx,
          z: sz,
          radius: CHAMBER_CONFIG.statueCollisionRadius,
          height: 3.4,
        });
        this._pillarMeshes.push(pedMesh);
      }
    });
  }

  /**
   * Places 8 Destructible Frost Urns along the colonnade edges and records their
   * world coordinates & mesh groups for ECS DestructibleProp registration.
   */
  private buildDestructibleFrostUrns(): void {
    const urnBodyMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.iceFloorCenter, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.24,
      }),
    );
    const urnTrimMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.coldFlame }),
    );
    const urnLidMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.iceHighlights, {
        emissive: PALETTE.coldFlame,
        emissiveIntensity: 0.35,
      }),
    );

    const points = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.24, 0.02),
      new THREE.Vector2(0.38, 0.36),
      new THREE.Vector2(0.4, 0.68),
      new THREE.Vector2(0.22, 0.92),
      new THREE.Vector2(0.28, 1.06),
      new THREE.Vector2(0.2, 1.08),
    ];
    const bodyGeo = this.trackGeo(new THREE.LatheGeometry(points, 8));
    const bandGeo = this.trackGeo(new THREE.TorusGeometry(0.39, 0.032, 6, 12));
    const finialGeo = this.trackGeo(new THREE.OctahedronGeometry(0.14, 0));

    const sides: readonly (-1 | 1)[] = [-1, 1];
    let index = 0;

    CHAMBER_CONFIG.urnZPositions.forEach((uz) => {
      for (let s = 0; s < sides.length; s++) {
        if (index >= CHAMBER_CONFIG.urnCount) return;
        const side = sides[s] ?? 1;
        const ux = side * CHAMBER_CONFIG.urnRowX;

        const urnGroup = new THREE.Group();
        urnGroup.position.set(ux, 0, uz);

        const { group: bodyObj } = ToonAssets.createOutlinedMesh(
          bodyGeo,
          urnBodyMat,
          ARENA_CONFIG.defaultOutlineScale,
          true,
        );
        urnGroup.add(bodyObj);

        const runeBand = new THREE.Mesh(bandGeo, urnTrimMat);
        runeBand.rotation.x = Math.PI / 2;
        runeBand.position.y = 0.56;
        urnGroup.add(runeBand);

        const { group: finialObj } = ToonAssets.createOutlinedMesh(
          finialGeo,
          urnLidMat,
          1.06,
          true,
        );
        finialObj.position.y = 1.18;
        urnGroup.add(finialObj);

        this.root.add(urnGroup);

        this._urnSpawns.push({
          index,
          propType: DESTRUCTIBLE_PROP_TYPES.FROST_URN,
          x: ux,
          y: 0,
          z: uz,
          hp: CHAMBER_CONFIG.urnHp,
          healValue: CHAMBER_CONFIG.urnHealAmount,
          hitRadius: CHAMBER_CONFIG.urnHitRadius,
          mesh: urnGroup,
        });
        index++;
      }
    });
  }

  /**
   * Builds the raised Astral Portal Dais at the far end of the hall with:
   * - Stepped octagonal marble dais
   * - Ornate obsidian-and-ice archway ring with flanking crystal pylons
   * - 12 segmented runic lights illuminating with charge ratio
   * - Translucent frosted seal barrier (SEALED state)
   * - Swirling violet-and-cyan GLSL vortex shader mesh (IGNITED state)
   */
  private buildAstralPortalDais(): void {
    const daisGroup = new THREE.Group();
    daisGroup.position.set(0, 0, CHAMBER_CONFIG.daisZ);

    const marbleMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.frostMarble, {
        emissive: PALETTE.royalIndigo,
        emissiveIntensity: 0.16,
      }),
    );
    const daisTrimMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.bannerTrim }),
    );

    // Two stepped octagonal marble dais tiers
    let accumY = 0;
    CHAMBER_CONFIG.daisTierHeights.forEach((tierH, idx) => {
      const r =
        CHAMBER_CONFIG.daisRadius - idx * CHAMBER_CONFIG.daisTierRadiusStep;
      const tierGeo = this.trackGeo(new THREE.CylinderGeometry(r, r + 0.25, tierH, 8));
      const { group: tierObj } = ToonAssets.createOutlinedMesh(
        tierGeo,
        marbleMat,
        { x: 1.015, y: 1.0, z: 1.015 },
        false,
      );
      tierObj.position.y = accumY + tierH * 0.5;
      daisGroup.add(tierObj);

      const trimGeo = this.trackGeo(new THREE.TorusGeometry(r, 0.04, 6, 8));
      const trim = new THREE.Mesh(trimGeo, daisTrimMat);
      trim.rotation.x = Math.PI / 2;
      trim.rotation.z = Math.PI / 8;
      trim.position.y = accumY + tierH + 0.01;
      daisGroup.add(trim);

      accumY += tierH;
    });
    this.root.add(daisGroup);

    // Astral Portal Archway Group positioned at portalZ
    const portalGroup = new THREE.Group();
    portalGroup.position.set(
      0,
      CHAMBER_CONFIG.portalCenterY,
      CHAMBER_CONFIG.portalZ,
    );

    const ringR = CHAMBER_CONFIG.portalRingRadius;
    const obsidianMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.abyssalCloak, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.15,
      }),
    );
    const crystalTrimMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.iceHighlights, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.35,
      }),
    );

    // Outer Obsidian Archway Ring
    const outerRingGeo = this.trackGeo(
      new THREE.TorusGeometry(ringR, CHAMBER_CONFIG.portalTubeRadius, 8, 36),
    );
    const { group: outerRingObj } = ToonAssets.createOutlinedMesh(
      outerRingGeo,
      obsidianMat,
      1.04,
      true,
    );
    portalGroup.add(outerRingObj);

    // Inner Crystalline Filigree Ring
    const innerRingGeo = this.trackGeo(
      new THREE.TorusGeometry(ringR - 0.34, 0.08, 6, 36),
    );
    this.portalInnerRing = new THREE.Mesh(innerRingGeo, crystalTrimMat);
    portalGroup.add(this.portalInnerRing);

    // 12 Segmented Runic Lights around the Archway Ring
    const segCount = CHAMBER_CONFIG.portalRuneSegmentCount;
    const runeGeo = this.trackGeo(new THREE.BoxGeometry(0.16, 0.36, 0.18));
    for (let i = 0; i < segCount; i++) {
      const ang = (i / segCount) * Math.PI * 2 - Math.PI * 0.5;
      const runeMat = this.trackMat(
        new THREE.MeshBasicMaterial({ color: PALETTE.mutedSlate }),
      );
      const runeMesh = new THREE.Mesh(runeGeo, runeMat);
      runeMesh.position.set(
        Math.cos(ang) * ringR,
        Math.sin(ang) * ringR,
        CHAMBER_CONFIG.portalTubeRadius * 0.85,
      );
      runeMesh.rotation.z = ang + Math.PI * 0.5;
      portalGroup.add(runeMesh);
      this.portalRuneMaterials.push(runeMat);
    }

    // Flanking Obsidian-and-Crystal Portal Pylons
    const pylonGeo = this.trackGeo(new THREE.CylinderGeometry(0.32, 0.52, 4.6, 6));
    const pylonCapGeo = this.trackGeo(new THREE.ConeGeometry(0.38, 1.35, 6));
    const sides: readonly (-1 | 1)[] = [-1, 1];
    sides.forEach((side) => {
      const px = side * CHAMBER_CONFIG.portalPylonOffsetX;
      const pylonGroup = new THREE.Group();
      pylonGroup.position.set(px, -CHAMBER_CONFIG.portalCenterY, 0);

      const { group: pShaft, mainMesh: pMesh } = ToonAssets.createOutlinedMesh(
        pylonGeo,
        obsidianMat,
        ARENA_CONFIG.defaultOutlineScale,
        true,
      );
      pShaft.position.y = 2.3;
      pylonGroup.add(pShaft);

      const { group: pCap } = ToonAssets.createOutlinedMesh(
        pylonCapGeo,
        crystalTrimMat,
        1.06,
        true,
      );
      pCap.position.y = 5.25;
      pylonGroup.add(pCap);

      portalGroup.add(pylonGroup);
      this._pillarColliders.push({
        x: px,
        z: CHAMBER_CONFIG.portalZ,
        radius: CHAMBER_CONFIG.portalPylonCollisionRadius,
        height: 6.0,
      });
      this._pillarMeshes.push(pMesh);
    });

    // Translucent Frosted Seal Barrier (visible while SEALED)
    const sealGeo = this.trackGeo(new THREE.CircleGeometry(ringR - 0.36, 32));
    this.portalSealMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.coldFlame,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.portalSealMesh = new THREE.Mesh(sealGeo, this.portalSealMat);
    portalGroup.add(this.portalSealMesh);

    // Swirling Violet-and-Cyan GLSL Vortex Mesh (ignites when all waves clear)
    const vortexGeo = this.trackGeo(new THREE.CircleGeometry(ringR - 0.34, 48));
    this.portalVortexMat = this.trackMat(
      new THREE.ShaderMaterial({
        vertexShader: PORTAL_VORTEX_VERTEX_SHADER,
        fragmentShader: PORTAL_VORTEX_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uIgnite: { value: 0 },
          uCharge: { value: 0 },
          uArms: { value: CHAMBER_CONFIG.portalVortexArms },
          uColorViolet: { value: new THREE.Color(PALETTE.glowViolet) },
          uColorCyan: { value: new THREE.Color(PALETTE.frostRunes) },
          uColorCore: { value: new THREE.Color(PALETTE.voidCoreFuchsia) },
          uColorDeep: { value: new THREE.Color(PALETTE.royalIndigo) },
        },
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.portalVortexMesh = new THREE.Mesh(vortexGeo, this.portalVortexMat);
    this.portalVortexMesh.position.z = 0.04;
    portalGroup.add(this.portalVortexMesh);

    // Dynamic Portal PointLight scaling from dim frost seal to radiant amethyst-cyan bloom
    this.portalPointLight = new THREE.PointLight(
      PALETTE.frostRunes,
      CHAMBER_CONFIG.lighting.portalLightSealed,
      CHAMBER_CONFIG.lighting.portalLightDistance,
      CHAMBER_CONFIG.lighting.portalLightDecay,
    );
    this.portalPointLight.position.set(0, 0, 1.4);
    portalGroup.add(this.portalPointLight);

    this.root.add(portalGroup);
  }

  /**
   * Drifting crystalline frost motes floating softly inside the cathedral hall.
   */
  private buildFrostMotes(): void {
    const count = CHAMBER_CONFIG.frostMoteCount;
    const halfW = CHAMBER_CONFIG.width * 0.46;
    const halfL = CHAMBER_CONFIG.length * 0.46;
    const maxH = CHAMBER_CONFIG.ceilingY - 1.2;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() * 2 - 1) * halfW;
      positions[i * 3 + 1] = 0.4 + Math.random() * maxH;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * halfL;
      this.frostMoteVelocities.push({
        vy: CHAMBER_CONFIG.frostMoteRiseSpeed * (0.5 + Math.random()),
        swaySpeed: 0.7 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const geo = this.trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = this.trackMat(
      new THREE.PointsMaterial({
        map: ToonAssets.getSnowTexture(),
        color: PALETTE.coldFlame,
        size: 0.22,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.frostMotes = new THREE.Points(geo, mat);
    this.root.add(this.frostMotes);
  }

  /**
   * Restores all 8 Destructible Frost Urn meshes to visible when resetting the chamber.
   */
  public resetUrns(): void {
    for (let i = 0; i < this._urnSpawns.length; i++) {
      const urn = this._urnSpawns[i];
      if (urn) urn.mesh.visible = true;
    }
  }

  /**
   * Animates the Astral Portal dais segmented runic lights, frosted seal barrier,
   * and swirling violet-and-cyan vortex shader based on wave completion charge.
   */
  public setPortalCharge(ratio: number, ignited: boolean, time: number): void {
    const clampedRatio = THREE.MathUtils.clamp(ratio, 0, 1);
    this.currentPortalCharge = clampedRatio;
    this.currentPortalIgnited = ignited;

    const targetIgnite = ignited ? 1 : 0;
    this.portalIgniteBlend +=
      (targetIgnite - this.portalIgniteBlend) *
      Math.min(1, CHAMBER_CONFIG.portalIgniteLerp * 0.05 + (ignited ? 0.08 : 0.12));
    if (ignited && this.portalIgniteBlend > 0.995) this.portalIgniteBlend = 1;
    if (!ignited && this.portalIgniteBlend < 0.005) this.portalIgniteBlend = 0;

    // Illuminate segmented archway runes sequentially as charge rises
    const litCount = Math.round(
      (ignited ? 1 : clampedRatio) * this.portalRuneMaterials.length,
    );
    for (let i = 0; i < this.portalRuneMaterials.length; i++) {
      const mat = this.portalRuneMaterials[i];
      if (!mat) continue;
      if (ignited) {
        const pulse =
          0.5 + 0.5 * Math.sin(time * 5.0 + i * 0.55);
        mat.color.setHex(
          pulse > 0.5 ? PALETTE.voidCoreFuchsia : PALETTE.frostRunes,
        );
      } else if (i < litCount) {
        mat.color.setHex(PALETTE.bannerTrim);
      } else {
        mat.color.setHex(PALETTE.mutedSlate);
      }
    }

    // Translucent frosted seal barrier fades cleanly out upon ignition
    if (this.portalSealMesh && this.portalSealMat) {
      const sealPulse =
        0.22 + 0.09 * Math.sin(time * CHAMBER_CONFIG.portalSealPulseSpeed);
      this.portalSealMat.opacity = sealPulse * (1 - this.portalIgniteBlend);
      this.portalSealMesh.visible = this.portalIgniteBlend < 0.96;
    }

    // Swirling violet-and-cyan GLSL vortex
    if (this.portalVortexMesh && this.portalVortexMat) {
      this.portalVortexMat.uniforms.uTime!.value =
        time * CHAMBER_CONFIG.portalVortexSwirlSpeed;
      this.portalVortexMat.uniforms.uCharge!.value = clampedRatio;
      this.portalVortexMat.uniforms.uIgnite!.value = this.portalIgniteBlend;
      this.portalVortexMesh.visible =
        clampedRatio > 0.01 || this.portalIgniteBlend > 0.01;
    }

    if (this.portalInnerRing) {
      this.portalInnerRing.rotation.z =
        time * CHAMBER_CONFIG.portalSpinSpeed * (1 + this.portalIgniteBlend * 2.5);
    }

    if (this.portalPointLight) {
      const L = CHAMBER_CONFIG.lighting;
      const baseIntensity = THREE.MathUtils.lerp(
        L.portalLightSealed,
        L.portalLightIgnited,
        Math.max(clampedRatio * 0.35, this.portalIgniteBlend),
      );
      this.portalPointLight.intensity =
        baseIntensity * (0.92 + 0.08 * Math.sin(time * 4.5));
      this.portalPointLight.color.setHex(
        ignited ? PALETTE.glowViolet : PALETTE.frostRunes,
      );
    }
  }

  /**
   * Updates swaying royal banners, flickering cold-flame braziers, spinning chandeliers,
   * drifting frost motes, and portal animation each frame while active.
   */
  public update(dt: number, elapsed: number): void {
    // 1. Sway royal tiara-crest banners gracefully from top mounting rods
    for (let i = 0; i < this.banners.length; i++) {
      const rec = this.banners[i];
      if (!rec) continue;
      const posAttr = rec.mesh.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const base = rec.basePositions;
      const h = CHAMBER_CONFIG.bannerHeight;

      for (let v = 0; v < posAttr.count; v++) {
        const bx = base[v * 3 + 0] ?? 0;
        const by = base[v * 3 + 1] ?? 0;
        const bz = base[v * 3 + 2] ?? 0;
        const t = Math.min(1, Math.max(0, -by / h));
        const sway =
          Math.sin(
            elapsed * CHAMBER_CONFIG.bannerSwaySpeed + rec.phase + t * 2.4,
          ) *
          CHAMBER_CONFIG.bannerSwayAmp *
          t *
          t;
        posAttr.setXYZ(v, bx, by, bz + sway);
      }
      posAttr.needsUpdate = true;
    }

    // 2. Flicker cold-flame obsidian braziers
    for (let i = 0; i < this.braziers.length; i++) {
      const b = this.braziers[i];
      if (!b) continue;
      const wave = Math.sin(
        elapsed * CHAMBER_CONFIG.brazierFlickerSpeed + b.phase,
      );
      const wave2 = Math.cos(
        elapsed * (CHAMBER_CONFIG.brazierFlickerSpeed * 1.37) + b.phase * 1.7,
      );
      const scaleY = 1 + wave * CHAMBER_CONFIG.brazierFlickerAmp;
      const scaleXZ = 1 - wave2 * (CHAMBER_CONFIG.brazierFlickerAmp * 0.45);
      b.outerFlame.scale.set(scaleXZ, scaleY, scaleXZ);
      b.innerFlame.scale.set(scaleXZ * 0.95, scaleY * 1.05, scaleXZ * 0.95);
      if (b.light) {
        b.light.intensity =
          CHAMBER_CONFIG.brazierLightIntensity * (0.9 + 0.14 * wave);
      }
    }

    // 3. Slowly rotate hanging geometric icicle chandeliers
    for (let i = 0; i < this.chandeliers.length; i++) {
      const ch = this.chandeliers[i];
      if (ch) {
        ch.group.rotation.y +=
          dt * CHAMBER_CONFIG.chandelierSpinSpeed * ch.spinDir;
      }
    }

    // 4. Gently drift interior frost motes upward
    if (this.frostMotes) {
      const posAttr = this.frostMotes.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const halfW = CHAMBER_CONFIG.width * 0.46;
      const halfL = CHAMBER_CONFIG.length * 0.46;
      const maxH = CHAMBER_CONFIG.ceilingY - 1.2;

      for (let i = 0; i < this.frostMoteVelocities.length; i++) {
        const vel = this.frostMoteVelocities[i];
        if (!vel) continue;
        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        let z = posAttr.getZ(i);

        y += vel.vy * dt;
        x +=
          Math.sin(elapsed * vel.swaySpeed + vel.phase) *
          CHAMBER_CONFIG.frostMoteSwayAmp *
          dt;
        if (y > maxH) {
          y = 0.4;
          x = (Math.random() * 2 - 1) * halfW;
          z = (Math.random() * 2 - 1) * halfL;
        }
        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
    }

    // 5. Keep Astral Portal shader & lights smoothly animated
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
