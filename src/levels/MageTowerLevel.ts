import * as THREE from 'three';
import {
  ARENA_CONFIG,
  LOBBY_CONFIG,
  PALETTE,
} from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';

export interface SanctumCollider {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
}

interface FloatingBookRecord {
  readonly group: THREE.Group;
  readonly baseY: number;
  readonly phase: number;
  readonly moteMesh: THREE.Mesh;
}

interface FloatingCandleRecord {
  readonly flameMesh: THREE.Mesh;
  readonly light: THREE.PointLight | null;
  readonly baseY: number;
  readonly group: THREE.Group;
  readonly phase: number;
}

const REALM1_VORTEX_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const REALM1_VORTEX_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorCyan;
  uniform vec3 uColorViolet;
  uniform vec3 uColorCore;
  uniform vec3 uColorDeep;
  varying vec2 vUv;

  void main() {
    vec2 centered = (vUv - 0.5) * 2.0;
    float dist = length(centered);
    if (dist > 1.0) discard;

    float angle = atan(centered.y, centered.x);
    float swirl = angle * 5.0 + dist * 7.0 - uTime * 2.8;
    float wave = 0.5 + 0.5 * sin(swirl);
    float counter = 0.5 + 0.5 * cos(angle * 3.0 - dist * 8.5 + uTime * 1.9);

    float energy = mix(wave, counter, 0.4);
    vec3 col = mix(uColorDeep, uColorViolet, clamp(energy * 1.15, 0.0, 1.0));
    col = mix(col, uColorCyan, smoothstep(0.32, 0.9, wave * (1.0 - dist * 0.3)));
    col = mix(col, uColorCore, smoothstep(0.45, 0.0, dist) * 0.85);

    float alpha = (1.0 - smoothstep(0.85, 1.0, dist)) * (0.68 + 0.32 * energy);
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * Self-contained procedural 3D environment for the **Obsidian Spire Sanctum** (Playable 3D Hub Lobby).
 *
 * Built with cel-shaded MeshToonMaterial + ink-black BackSide outlines:
 * - Circular Astral Observatory rotunda with Gothic arched windows, starry nebula sky dome,
 *   and 3 concentric rotating brass-and-violet astrolabe rings overhead
 * - Dark slate floor inlaid with a glowing royal-violet summoning circle and 3 velvet runners
 * - Lived-in wizard study props (curved bookshelves, 3 hovering spellbooks, oak-and-iron
 *   enchanter's desk with potion flasks/scrolls/crystal orb, floating wax candles)
 * - Stolen Trophy Pedestal (`setTrophyVisible`) & Abyssal Target Crystal (`triggerHitReaction`)
 * - Three Northern Arc Realm Portals (Realm I Glacial Spire active vortex; Realm II Sunken
 *   Sanctuary coral/teal ward; Realm III Harmonic Citadel monolith/emerald-magenta ward).
 */
export class MageTowerLevel {
  public readonly root = new THREE.Group();

  private readonly _pillarColliders: SanctumCollider[] = [];
  private readonly _pillarMeshes: THREE.Object3D[] = [];
  private readonly _cameraColliders: THREE.Object3D[] = [];

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];

  // Overhead Astrolabe Rings
  private astrolabeOuterRing: THREE.Group | null = null;
  private astrolabeMidRing: THREE.Group | null = null;
  private astrolabeInnerRing: THREE.Group | null = null;

  // Floating Study Props
  private readonly floatingBooks: FloatingBookRecord[] = [];
  private readonly floatingCandles: FloatingCandleRecord[] = [];

  // Stolen Trophy Pedestal (Frost Tiara & Ice Crystal)
  private trophyCrownGroup: THREE.Group | null = null;
  private trophyAuraMesh: THREE.Mesh | null = null;
  private trophyLight: THREE.PointLight | null = null;
  private isTrophyVisible = false;

  // Abyssal Target Crystal (Training Dummy)
  private dummyCrystalPivot: THREE.Group | null = null;
  private dummyCoreMat: THREE.MeshToonMaterial | null = null;
  private dummyWobbleTimer = 0;

  // Realm I Active Vortex & Falling Snow Motes
  private realm1VortexMat: THREE.ShaderMaterial | null = null;
  private realm1SnowMotes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > | null = null;

  // Realm II & III Ward Barriers
  private realm2WardGroup: THREE.Group | null = null;
  private realm2WardMat: THREE.MeshBasicMaterial | null = null;
  private realm2RippleTimer = 0;

  private realm3WardGroup: THREE.Group | null = null;
  private realm3WardMat: THREE.MeshBasicMaterial | null = null;
  private realm3RippleTimer = 0;

  public get pillarColliders(): readonly SanctumCollider[] {
    return this._pillarColliders;
  }

  public get pillarMeshes(): readonly THREE.Object3D[] {
    return this._pillarMeshes;
  }

  public get cameraColliders(): readonly THREE.Object3D[] {
    return this._cameraColliders;
  }

  constructor() {
    this.root.name = 'MageTowerLevel';
    this.buildStarrySkyDome();
    this.buildInlaidFloorAndRunners();
    this.buildRotundaWallsAndGothicWindows();
    this.buildOverheadAstrolabe();
    this.buildWizardStudyProps();
    this.buildStolenTrophyPedestal();
    this.buildAbyssalTargetCrystal();
    this.buildThreeRealmPortals();
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
   * Procedural starry night sky dome with violet and indigo nebula wisps visible through the Gothic windows.
   */
  private buildStarrySkyDome(): void {
    const size = LOBBY_CONFIG.skyTextureSize;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = PALETTE.hex.midnightSky;
      ctx.fillRect(0, 0, size, size);

      // Soft swirling violet & indigo nebula clouds
      for (let i = 0; i < 9; i++) {
        const nx = ((i * 173) % (size - 200)) + 100;
        const ny = ((i * 251) % (size - 200)) + 100;
        const nr = 140 + (i % 3) * 65;
        const grad = ctx.createRadialGradient(nx, ny, 10, nx, ny, nr);
        grad.addColorStop(
          0,
          i % 2 === 0
            ? PALETTE.rgba.sanctumNebulaViolet
            : PALETTE.rgba.sanctumNebulaIndigo,
        );
        grad.addColorStop(1, PALETTE.rgba.transparentBlack);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
      }

      // Pinpoint stars & diamond constellations
      for (let s = 0; s < 380; s++) {
        const sx = (s * 7919) % size;
        const sy = (s * 6271) % size;
        const r = s % 11 === 0 ? 2.2 : s % 4 === 0 ? 1.5 : 1.0;
        ctx.fillStyle =
          s % 7 === 0 ? PALETTE.hex.pulseLavender : PALETTE.rgba.sanctumStarCore;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const skyTex = this.trackTex(new THREE.CanvasTexture(canvas));
    skyTex.colorSpace = THREE.SRGBColorSpace;

    const skyGeo = this.trackGeo(
      new THREE.SphereGeometry(LOBBY_CONFIG.skyDomeRadius, 28, 20),
    );
    const skyMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: skyTex,
        side: THREE.BackSide,
        fog: false,
      }),
    );
    this.root.add(new THREE.Mesh(skyGeo, skyMat));
  }

  /**
   * Dark slate floor engraved with a glowing royal-violet (#8B5CF6) summoning circle
   * and three velvet runners branching toward the three northern portal alcoves.
   */
  private buildInlaidFloorAndRunners(): void {
    const size = LOBBY_CONFIG.floorTextureSize;
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
      dCtx.fillStyle = PALETTE.hex.sanctumStone;
      dCtx.fillRect(0, 0, size, size);

      // Concentric slate masonry rings & radial joints
      dCtx.save();
      dCtx.translate(c, c);
      dCtx.strokeStyle = PALETTE.rgba.sanctumTileJoint;
      dCtx.lineWidth = 2.5;
      for (let r = 64; r < c; r += 64) {
        dCtx.beginPath();
        dCtx.arc(0, 0, r, 0, Math.PI * 2);
        dCtx.stroke();
      }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        dCtx.beginPath();
        dCtx.moveTo(Math.cos(a) * 64, Math.sin(a) * 64);
        dCtx.lineTo(Math.cos(a) * c, Math.sin(a) * c);
        dCtx.stroke();
      }
      dCtx.restore();

      eCtx.fillStyle = PALETTE.hex.pureBlack;
      eCtx.fillRect(0, 0, size, size);

      const drawSummoningCircle = (
        ctx: CanvasRenderingContext2D,
        isEmissive: boolean,
      ) => {
        ctx.save();
        ctx.translate(c, c);
        const stroke = isEmissive
          ? PALETTE.rgba.sanctumRuneEmissive
          : PALETTE.rgba.sanctumRuneDiffuse;

        const radii = [92, 110, 215, 232, 395];
        radii.forEach((r, idx) => {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.strokeStyle = PALETTE.rgba.sanctumRuneSoftGlow;
          ctx.lineWidth = idx % 2 === 0 ? 10 : 6;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = idx % 2 === 0 ? 3.2 : 1.8;
          ctx.stroke();
        });

        // Inscribed arcane octagram star
        for (let k = 0; k < 2; k++) {
          ctx.save();
          ctx.rotate((k * Math.PI) / 4);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 2.6;
          ctx.strokeRect(-152, -152, 304, 304);
          ctx.restore();
        }
        ctx.restore();
      };

      drawSummoningCircle(dCtx, false);
      drawSummoningCircle(eCtx, true);
    }

    const diffuseMap = this.trackTex(new THREE.CanvasTexture(diffCanvas));
    diffuseMap.colorSpace = THREE.SRGBColorSpace;
    diffuseMap.anisotropy = 4;

    const emissiveMap = this.trackTex(new THREE.CanvasTexture(emisCanvas));
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.anisotropy = 4;

    const R = LOBBY_CONFIG.outerWallRadius;
    const floorGeo = this.trackGeo(new THREE.CylinderGeometry(R, R + 0.25, 0.8, 48));
    const floorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: diffuseMap,
        emissive: new THREE.Color(PALETTE.amethystTrim),
        emissiveMap,
        emissiveIntensity: 0.78,
        roughness: 0.28,
        metalness: 0.24,
      }),
    );
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.4;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    // Three velvet runners branching from the central circle toward the 3 northern portals
    const runnerTargets = [
      { pos: LOBBY_CONFIG.realm1PortalPos, color: PALETTE.royalIndigo, trim: PALETTE.frostRunes },
      { pos: LOBBY_CONFIG.realm2PortalPos, color: PALETTE.glacialNavy, trim: PALETTE.sunkenTeal },
      { pos: LOBBY_CONFIG.realm3PortalPos, color: PALETTE.sanctumStone, trim: PALETTE.harmonicEmerald },
    ];

    runnerTargets.forEach((rt, idx) => {
      const len = Math.hypot(rt.pos.x, rt.pos.z) - 1.4;
      const angle = Math.atan2(rt.pos.x, rt.pos.z);
      const runnerGroup = new THREE.Group();
      runnerGroup.rotation.y = angle;
      runnerGroup.position.y = 0.014 + idx * 0.002;

      const carpetGeo = this.trackGeo(new THREE.PlaneGeometry(1.75, len));
      const carpetMat = this.trackMat(
        ToonAssets.createToonMaterial(rt.color, {
          emissive: rt.trim,
          emissiveIntensity: 0.14,
        }),
      );
      const carpet = new THREE.Mesh(carpetGeo, carpetMat);
      carpet.rotation.x = -Math.PI / 2;
      carpet.position.z = len * 0.5 + 0.9;
      carpet.receiveShadow = true;
      runnerGroup.add(carpet);

      const borderGeo = this.trackGeo(new THREE.PlaneGeometry(1.92, len));
      const borderMat = this.trackMat(
        new THREE.MeshBasicMaterial({ color: rt.trim }),
      );
      const border = new THREE.Mesh(borderGeo, borderMat);
      border.rotation.x = -Math.PI / 2;
      border.position.set(0, -0.002, len * 0.5 + 0.9);
      runnerGroup.add(border);

      this.root.add(runnerGroup);
    });
  }

  /**
   * Circular obsidian-stone rotunda with 12 tall Gothic arched windows & stone piers.
   */
  private buildRotundaWallsAndGothicWindows(): void {
    const count = LOBBY_CONFIG.archCount;
    const R = LOBBY_CONFIG.outerWallRadius;
    const H = LOBBY_CONFIG.wallHeight;

    const stoneMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.sanctumStone, {
        emissive: PALETTE.royalIndigo,
        emissiveIntensity: 0.1,
      }),
    );
    const pierMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.shadowSlate),
    );
    const runeTrimMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.amethystTrim }),
    );

    const pierGeo = this.trackGeo(new THREE.CylinderGeometry(0.46, 0.56, H, 6));
    const plinthGeo = this.trackGeo(new THREE.CylinderGeometry(0.68, 0.78, 0.75, 6));
    const lowerWallW = ((2 * Math.PI * R) / count) * 0.68;
    const lowerWallGeo = this.trackGeo(new THREE.BoxGeometry(lowerWallW, 2.2, 0.48));
    const lintelGeo = this.trackGeo(new THREE.BoxGeometry(lowerWallW * 1.48, 1.8, 0.55));

    // Shared Gothic window pointed arch rib
    const archSpan = ((2 * Math.PI * R) / count) * 0.45;
    const leftWindowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-archSpan, 6.8, 0),
      new THREE.Vector3(-archSpan * 0.55, 8.6, 0),
      new THREE.Vector3(0, 9.8, 0),
    ]);
    const rightWindowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(archSpan, 6.8, 0),
      new THREE.Vector3(archSpan * 0.55, 8.6, 0),
      new THREE.Vector3(0, 9.8, 0),
    ]);
    const leftArchGeo = this.trackGeo(
      new THREE.TubeGeometry(leftWindowCurve, 14, 0.18, 6, false),
    );
    const rightArchGeo = this.trackGeo(
      new THREE.TubeGeometry(rightWindowCurve, 14, 0.18, 6, false),
    );

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const px = Math.sin(angle) * R;
      const pz = Math.cos(angle) * R;

      // Stone Pier Column between Gothic Windows
      const pierGroup = new THREE.Group();
      pierGroup.position.set(px, 0, pz);
      pierGroup.lookAt(0, 0, 0);

      const { group: plinthObj, mainMesh: plinthMesh } =
        ToonAssets.createOutlinedMesh(
          plinthGeo,
          pierMat,
          ARENA_CONFIG.defaultOutlineScale,
          true,
        );
      plinthObj.position.y = 0.375;
      pierGroup.add(plinthObj);

      const { group: pierObj, mainMesh: pierMesh } =
        ToonAssets.createOutlinedMesh(
          pierGeo,
          stoneMat,
          { x: 1.06, y: 1.01, z: 1.06 },
          true,
        );
      pierObj.position.y = H * 0.5;
      pierGroup.add(pierObj);

      this.root.add(pierGroup);

      this._pillarColliders.push({
        x: px,
        z: pz,
        radius: LOBBY_CONFIG.archPierCollisionRadius,
        height: H,
      });
      this._pillarMeshes.push(pierMesh, plinthMesh);
      this._cameraColliders.push(pierMesh, plinthMesh);

      // Gothic Window Bay between Pier i and Pier i+1
      const midAngle = ((i + 0.5) / count) * Math.PI * 2;
      const wx = Math.sin(midAngle) * R;
      const wz = Math.cos(midAngle) * R;

      const bayGroup = new THREE.Group();
      bayGroup.position.set(wx, 0, wz);
      bayGroup.lookAt(0, 0, 0);

      const wainscotting = new THREE.Mesh(lowerWallGeo, stoneMat);
      wainscotting.position.y = 1.1;
      wainscotting.receiveShadow = true;
      bayGroup.add(wainscotting);
      this._cameraColliders.push(wainscotting);
      this._pillarMeshes.push(wainscotting);

      const lintel = new THREE.Mesh(lintelGeo, stoneMat);
      lintel.position.y = H - 0.9;
      bayGroup.add(lintel);

      const leftRib = new THREE.Mesh(leftArchGeo, pierMat);
      const rightRib = new THREE.Mesh(rightArchGeo, pierMat);
      bayGroup.add(leftRib, rightRib);

      this.root.add(bayGroup);
    }

    // Upper Observatory Dome Crown Ring (open oculus in center looking out to starry sky)
    const domeRingGeo = this.trackGeo(
      new THREE.TorusGeometry(R - 0.2, 0.45, 8, 48),
    );
    const domeRing = new THREE.Mesh(domeRingGeo, stoneMat);
    domeRing.rotation.x = Math.PI / 2;
    domeRing.position.y = H;
    this.root.add(domeRing);

    const runeRingGeo = this.trackGeo(
      new THREE.TorusGeometry(R - 0.5, 0.07, 6, 48),
    );
    const runeRing = new THREE.Mesh(runeRingGeo, runeTrimMat);
    runeRing.rotation.x = Math.PI / 2;
    runeRing.position.y = H - 0.35;
    this.root.add(runeRing);
  }

  /**
   * Builds 3 concentric brass-and-violet astrolabe rings suspended high overhead.
   */
  private buildOverheadAstrolabe(): void {
    const astrolabeRoot = new THREE.Group();
    astrolabeRoot.position.set(0, LOBBY_CONFIG.astrolabeY, 0);

    const brassMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.astrolabeBrass, {
        emissive: PALETTE.candleWarm,
        emissiveIntensity: 0.22,
      }),
    );
    const violetMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.glowViolet }),
    );

    const buildRingGroup = (radius: number, tube: number): THREE.Group => {
      const g = new THREE.Group();
      const ringGeo = this.trackGeo(new THREE.TorusGeometry(radius, tube, 8, 40));
      const { group: ringObj } = ToonAssets.createOutlinedMesh(
        ringGeo,
        brassMat,
        1.05,
        false,
      );
      g.add(ringObj);

      const inlayGeo = this.trackGeo(
        new THREE.TorusGeometry(radius - tube * 1.1, tube * 0.35, 6, 40),
      );
      g.add(new THREE.Mesh(inlayGeo, violetMat));
      return g;
    };

    this.astrolabeOuterRing = buildRingGroup(
      LOBBY_CONFIG.astrolabeOuterRadius,
      0.11,
    );
    this.astrolabeOuterRing.rotation.x = Math.PI * 0.35;

    this.astrolabeMidRing = buildRingGroup(
      LOBBY_CONFIG.astrolabeMidRadius,
      0.09,
    );
    this.astrolabeMidRing.rotation.y = Math.PI * 0.25;

    this.astrolabeInnerRing = buildRingGroup(
      LOBBY_CONFIG.astrolabeInnerRadius,
      0.075,
    );
    this.astrolabeInnerRing.rotation.z = Math.PI * 0.4;

    // Central suspended astral core sun-crystal
    const coreGeo = this.trackGeo(new THREE.OctahedronGeometry(0.48, 0));
    const coreMesh = new THREE.Mesh(coreGeo, violetMat);
    this.astrolabeInnerRing.add(coreMesh);

    astrolabeRoot.add(
      this.astrolabeOuterRing,
      this.astrolabeMidRing,
      this.astrolabeInnerRing,
    );
    this.root.add(astrolabeRoot);
  }

  /**
   * Builds curved bookshelves with colorful book spines, 3 hovering open spellbooks,
   * an oak-and-iron enchanter's desk with glowing potion flasks/scrolls/crystal orb,
   * and clusters of floating wax candles.
   */
  private buildWizardStudyProps(): void {
    const woodMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.oakWood),
    );
    const ironMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.obsidianTrim),
    );
    const pageMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.parchmentCream),
    );
    const spineMats = [
      this.trackMat(ToonAssets.createToonMaterial(PALETTE.amethystTrim)),
      this.trackMat(ToonAssets.createToonMaterial(PALETTE.crimsonPotion)),
      this.trackMat(ToonAssets.createToonMaterial(PALETTE.sunkenTeal)),
      this.trackMat(ToonAssets.createToonMaterial(PALETTE.astrolabeBrass)),
      this.trackMat(ToonAssets.createToonMaterial(PALETTE.harmonicEmerald)),
    ];

    // 1. Curved Bookshelves in southern wall bays
    const shelfAngles = [Math.PI * 0.72, -Math.PI * 0.72, Math.PI * 0.88, -Math.PI * 0.88];
    const frameGeo = this.trackGeo(new THREE.BoxGeometry(2.3, 3.4, 0.55));
    const bookGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 0.42, 0.34));

    shelfAngles.forEach((ang, sIdx) => {
      const r = LOBBY_CONFIG.outerWallRadius - 0.85;
      const shelfGroup = new THREE.Group();
      shelfGroup.position.set(Math.sin(ang) * r, 0, Math.cos(ang) * r);
      shelfGroup.lookAt(0, 0, 0);

      const { group: frameObj } = ToonAssets.createOutlinedMesh(
        frameGeo,
        woodMat,
        ARENA_CONFIG.defaultOutlineScale,
        true,
      );
      frameObj.position.y = 1.7;
      shelfGroup.add(frameObj);

      // Rows of colorful cel-shaded book spines
      for (let row = 0; row < 3; row++) {
        for (let b = 0; b < 9; b++) {
          const mat =
            spineMats[(row * 3 + b + sIdx) % spineMats.length] ?? spineMats[0]!;
          const book = new THREE.Mesh(bookGeo, mat);
          book.position.set(-0.82 + b * 0.2, 0.78 + row * 0.92, 0.14);
          book.rotation.z = (b % 3 === 0 ? 0.06 : -0.03);
          shelfGroup.add(book);
        }
      }
      this.root.add(shelfGroup);
    });

    // 2. Three Hovering Open Spellbooks bobbing gently with drifting rune motes
    const bookCoords = [
      { x: -4.8, y: 1.95, z: 4.8 },
      { x: 4.6, y: 2.15, z: 5.2 },
      { x: -5.6, y: 2.25, z: -1.4 },
    ];
    const coverGeo = this.trackGeo(new THREE.BoxGeometry(0.46, 0.04, 0.34));
    const openPageGeo = this.trackGeo(new THREE.BoxGeometry(0.42, 0.05, 0.3));
    const moteGeo = this.trackGeo(new THREE.OctahedronGeometry(0.055, 0));
    const moteMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.glowViolet }),
    );

    bookCoords.forEach((bc, idx) => {
      const g = new THREE.Group();
      g.position.set(bc.x, bc.y, bc.z);
      g.rotation.y = idx * 1.4;

      const coverMat = spineMats[idx % spineMats.length] ?? spineMats[0]!;
      const cover = new THREE.Mesh(coverGeo, coverMat);
      const pages = new THREE.Mesh(openPageGeo, pageMat);
      pages.position.y = 0.035;
      const mote = new THREE.Mesh(moteGeo, moteMat);
      mote.position.y = 0.28;

      g.add(cover, pages, mote);
      this.root.add(g);
      this.floatingBooks.push({
        group: g,
        baseY: bc.y,
        phase: idx * 2.1,
        moteMesh: mote,
      });
    });

    // 3. Oak-and-Iron Enchanter's Desk with Potion Flasks, Parchment Scrolls & Crystal Orb
    const deskGroup = new THREE.Group();
    deskGroup.position.set(LOBBY_CONFIG.deskPos.x, 0, LOBBY_CONFIG.deskPos.z);
    deskGroup.rotation.y = 0.65;

    const topGeo = this.trackGeo(new THREE.BoxGeometry(2.4, 0.14, 1.25));
    const { group: deskTop } = ToonAssets.createOutlinedMesh(
      topGeo,
      woodMat,
      ARENA_CONFIG.defaultOutlineScale,
      true,
    );
    deskTop.position.y = 1.02;
    deskGroup.add(deskTop);

    const legGeo = this.trackGeo(new THREE.BoxGeometry(0.18, 1.0, 1.1));
    const legL = new THREE.Mesh(legGeo, ironMat);
    legL.position.set(-0.98, 0.5, 0);
    const legR = new THREE.Mesh(legGeo, ironMat);
    legR.position.set(0.98, 0.5, 0);
    deskGroup.add(legL, legR);

    // Glowing Emerald, Cyan & Crimson Potion Flasks
    const flaskSpecs = [
      { x: -0.68, z: -0.22, color: PALETTE.harmonicEmerald },
      { x: -0.44, z: -0.32, color: PALETTE.sunkenTeal },
      { x: -0.22, z: -0.18, color: PALETTE.crimsonPotion },
    ];
    const flaskGeo = this.trackGeo(new THREE.SphereGeometry(0.11, 10, 10));
    const neckGeo = this.trackGeo(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 8));
    flaskSpecs.forEach((fl) => {
      const fMat = this.trackMat(
        ToonAssets.createToonMaterial(fl.color, {
          emissive: fl.color,
          emissiveIntensity: 0.55,
        }),
      );
      const body = new THREE.Mesh(flaskGeo, fMat);
      body.position.set(fl.x, 1.19, fl.z);
      const neck = new THREE.Mesh(neckGeo, fMat);
      neck.position.set(fl.x, 1.31, fl.z);
      deskGroup.add(body, neck);
    });

    // Rolled Parchment Scrolls
    const scrollGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8),
    );
    scrollGeo.rotateZ(Math.PI / 2);
    const s1 = new THREE.Mesh(scrollGeo, pageMat);
    s1.position.set(0.25, 1.13, 0.15);
    s1.rotation.y = 0.25;
    const s2 = new THREE.Mesh(scrollGeo, pageMat);
    s2.position.set(0.28, 1.13, 0.26);
    s2.rotation.y = -0.15;
    deskGroup.add(s1, s2);

    // Crystal Orb on Claw Stand
    const standGeo = this.trackGeo(new THREE.CylinderGeometry(0.08, 0.14, 0.16, 6));
    const stand = new THREE.Mesh(standGeo, ironMat);
    stand.position.set(0.74, 1.16, -0.12);
    const orbGeo = this.trackGeo(new THREE.SphereGeometry(0.17, 14, 14));
    const orbMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.glowViolet, {
        emissive: PALETTE.voidCoreFuchsia,
        emissiveIntensity: 0.65,
      }),
    );
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(0.74, 1.36, -0.12);
    deskGroup.add(stand, orb);

    this.root.add(deskGroup);
    this._pillarColliders.push({
      x: LOBBY_CONFIG.deskPos.x,
      z: LOBBY_CONFIG.deskPos.z,
      radius: LOBBY_CONFIG.deskCollisionRadius,
      height: 1.5,
    });

    // 4. Clusters of Floating Wax Candles casting warm amber pools
    const candleMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.candleWax),
    );
    const flameMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.candleWarm }),
    );
    const waxGeo = this.trackGeo(new THREE.CylinderGeometry(0.042, 0.046, 0.34, 8));
    const flameGeo = this.trackGeo(new THREE.ConeGeometry(0.036, 0.12, 6));

    const candleLocations = [
      { x: -6.5, y: 2.4, z: 2.8, withLight: true },
      { x: -7.4, y: 2.65, z: 3.9, withLight: false },
      { x: -3.0, y: 2.5, z: 1.2, withLight: false },
      { x: 3.4, y: 2.6, z: 1.8, withLight: true },
      { x: -3.8, y: 2.8, z: -5.2, withLight: false },
      { x: 3.8, y: 2.75, z: -5.2, withLight: false },
    ];

    candleLocations.forEach((cl, idx) => {
      const cg = new THREE.Group();
      cg.position.set(cl.x, cl.y, cl.z);

      const wax = new THREE.Mesh(waxGeo, candleMat);
      cg.add(wax);

      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.y = 0.23;
      cg.add(flame);

      let light: THREE.PointLight | null = null;
      if (cl.withLight) {
        light = new THREE.PointLight(
          PALETTE.candleWarm,
          LOBBY_CONFIG.lighting.candleLightIntensity,
          LOBBY_CONFIG.lighting.candleLightDistance,
          1.8,
        );
        light.position.y = 0.28;
        cg.add(light);
      }

      this.root.add(cg);
      this.floatingCandles.push({
        group: cg,
        flameMesh: flame,
        light,
        baseY: cl.y,
        phase: idx * 1.3,
      });
    });
  }

  /**
   * Builds the Stolen Trophy Pedestal holding Marina's miniature floating Frost Tiara & Ice Crystal.
   */
  private buildStolenTrophyPedestal(): void {
    const pos = LOBBY_CONFIG.trophyPedestalPos;
    const pedGroup = new THREE.Group();
    pedGroup.position.set(pos.x, 0, pos.z);

    const obsidianMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.abyssalCloak, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.14,
      }),
    );
    const frostMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.iceHighlights, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.55,
      }),
    );
    const auraMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.frostRunes,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    const plinthGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.46, 0.58, 1.18, 8),
    );
    const { group: plinthObj } = ToonAssets.createOutlinedMesh(
      plinthGeo,
      obsidianMat,
      ARENA_CONFIG.defaultOutlineScale,
      true,
    );
    plinthObj.position.y = 0.59;
    pedGroup.add(plinthObj);

    // Floating Frost Tiara & Ice Crystal Trophy
    this.trophyCrownGroup = new THREE.Group();
    this.trophyCrownGroup.position.y = 1.56;

    const bandGeo = this.trackGeo(
      new THREE.TorusGeometry(0.24, 0.032, 6, 12, Math.PI * 1.3),
    );
    const band = new THREE.Mesh(bandGeo, frostMat);
    band.rotation.x = Math.PI / 2;
    this.trophyCrownGroup.add(band);

    const spireGeo = this.trackGeo(new THREE.ConeGeometry(0.045, 0.28, 4));
    for (let i = -2; i <= 2; i++) {
      const ang = i * 0.42;
      const hScale = 1 - Math.abs(i) * 0.22;
      const spire = new THREE.Mesh(spireGeo, frostMat);
      spire.position.set(Math.sin(ang) * 0.24, 0.12 * hScale, Math.cos(ang) * 0.24);
      spire.scale.setScalar(hScale);
      this.trophyCrownGroup.add(spire);
    }

    const centerCrystal = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.14, 0)),
      frostMat,
    );
    centerCrystal.position.y = 0.08;
    this.trophyCrownGroup.add(centerCrystal);

    this.trophyAuraMesh = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.42, 12, 12)),
      auraMat,
    );
    this.trophyCrownGroup.add(this.trophyAuraMesh);

    this.trophyLight = new THREE.PointLight(
      PALETTE.frostRunes,
      LOBBY_CONFIG.lighting.trophyLightIntensity,
      LOBBY_CONFIG.lighting.trophyLightDistance,
      1.8,
    );
    this.trophyLight.position.y = 1.65;
    pedGroup.add(this.trophyLight);

    pedGroup.add(this.trophyCrownGroup);
    this.root.add(pedGroup);

    this._pillarColliders.push({
      x: pos.x,
      z: pos.z,
      radius: LOBBY_CONFIG.trophyCollisionRadius,
      height: 1.8,
    });

    this.setTrophyVisible(false, 0);
  }

  /**
   * Toggles the Stolen Frost Tiara & Ice Crystal trophy and scales its icy aura with encoreTier.
   */
  public setTrophyVisible(visible: boolean, encoreTier = 0): void {
    this.isTrophyVisible = visible;
    if (this.trophyCrownGroup) {
      this.trophyCrownGroup.visible = visible;
      const scale = 1 + Math.min(3, Math.max(0, encoreTier)) * 0.08;
      this.trophyCrownGroup.scale.setScalar(scale);
    }
    if (this.trophyLight) {
      this.trophyLight.visible = visible;
      this.trophyLight.intensity = visible
        ? LOBBY_CONFIG.lighting.trophyLightIntensity *
          (1 + Math.min(3, Math.max(0, encoreTier)) * 0.15)
        : 0;
    }
  }

  /**
   * Builds the floating faceted Abyssal Target Crystal construct in the eastern alcove.
   */
  private buildAbyssalTargetCrystal(): void {
    const pos = LOBBY_CONFIG.dummyPos;
    const dummyGroup = new THREE.Group();
    dummyGroup.position.set(pos.x, 0, pos.z);

    const baseMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.shadowSlate),
    );
    const runeMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.glowViolet }),
    );
    this.dummyCoreMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.amethystTrim, {
        emissive: PALETTE.glowViolet,
        emissiveIntensity: 0.42,
      }),
    );

    const baseGeo = this.trackGeo(new THREE.CylinderGeometry(0.65, 0.78, 0.36, 8));
    const { group: baseObj } = ToonAssets.createOutlinedMesh(
      baseGeo,
      baseMat,
      ARENA_CONFIG.defaultOutlineScale,
      true,
    );
    baseObj.position.y = 0.18;
    dummyGroup.add(baseObj);

    const runeRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.55, 0.64, 16)),
      runeMat,
    );
    runeRing.rotation.x = -Math.PI / 2;
    runeRing.position.y = 0.37;
    dummyGroup.add(runeRing);

    this.dummyCrystalPivot = new THREE.Group();
    this.dummyCrystalPivot.position.y = LOBBY_CONFIG.dummyCenterY;

    const crystalGeo = this.trackGeo(new THREE.OctahedronGeometry(0.52, 0));
    const { group: crystalObj } = ToonAssets.createOutlinedMesh(
      crystalGeo,
      this.dummyCoreMat,
      1.06,
      true,
    );
    crystalObj.scale.set(0.82, 1.45, 0.82);
    this.dummyCrystalPivot.add(crystalObj);

    const orbitRing = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.7, 0.032, 6, 24)),
      runeMat,
    );
    orbitRing.rotation.x = Math.PI * 0.32;
    this.dummyCrystalPivot.add(orbitRing);

    dummyGroup.add(this.dummyCrystalPivot);
    this.root.add(dummyGroup);
  }

  /**
   * Triggers an emissive flash and damped spring wobble on the Abyssal Target Crystal.
   */
  public triggerHitReaction(): void {
    this.dummyWobbleTimer = 0.55;
    if (this.dummyCoreMat) {
      this.dummyCoreMat.emissive.setHex(PALETTE.voidCoreFuchsia);
      this.dummyCoreMat.emissiveIntensity = 1.25;
    }
  }

  /**
   * Alias for LobbySystem / CombatSystem clarity when the Abyssal Target Crystal is struck.
   */
  public triggerDummyHit(): void {
    this.triggerHitReaction();
  }

  /**
   * Builds the Three Realm Portals along the northern arc of the Sanctum:
   * - Center (Realm I — The Glacial Spire, Active)
   * - Left (Realm II — The Sunken Sanctuary, Sealed Coral/Teal Ward)
   * - Right (Realm III — The Harmonic Citadel, Sealed Monolith/Emerald-Magenta Ward)
   */
  private buildThreeRealmPortals(): void {
    const ringR = LOBBY_CONFIG.portalRingRadius;
    const tubeR = LOBBY_CONFIG.portalTubeRadius;
    const centerY = LOBBY_CONFIG.portalCenterY;

    // -----------------------------------------------------------------------
    // 1. Center — Realm I: The Glacial Spire (Active Vortex & Falling Snow)
    // -----------------------------------------------------------------------
    const r1Group = new THREE.Group();
    r1Group.position.set(
      LOBBY_CONFIG.realm1PortalPos.x,
      0,
      LOBBY_CONFIG.realm1PortalPos.z,
    );
    r1Group.lookAt(0, 0, 0);

    const frostArchMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.iceHighlights, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.35,
      }),
    );
    const r1ArchGeo = this.trackGeo(new THREE.TorusGeometry(ringR, tubeR, 8, 28));
    const { group: r1Arch } = ToonAssets.createOutlinedMesh(
      r1ArchGeo,
      frostArchMat,
      1.05,
      true,
    );
    r1Arch.position.y = centerY;
    r1Group.add(r1Arch);

    // Jagged ice spikes crowning the Realm I arch
    const spikeGeo = this.trackGeo(new THREE.ConeGeometry(0.18, 0.72, 5));
    for (let i = -3; i <= 3; i++) {
      const ang = i * 0.36;
      const sp = new THREE.Mesh(spikeGeo, frostArchMat);
      sp.position.set(
        Math.sin(ang) * (ringR + 0.25),
        centerY + Math.cos(ang) * (ringR + 0.25),
        0,
      );
      sp.rotation.z = -ang;
      r1Group.add(sp);
    }

    // Active swirling cyan-and-violet GLSL portal vortex
    const vortexGeo = this.trackGeo(new THREE.CircleGeometry(ringR - 0.14, 36));
    this.realm1VortexMat = this.trackMat(
      new THREE.ShaderMaterial({
        vertexShader: REALM1_VORTEX_VERTEX_SHADER,
        fragmentShader: REALM1_VORTEX_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uColorCyan: { value: new THREE.Color(PALETTE.frostRunes) },
          uColorViolet: { value: new THREE.Color(PALETTE.glowViolet) },
          uColorCore: { value: new THREE.Color(PALETTE.iceHighlights) },
          uColorDeep: { value: new THREE.Color(PALETTE.royalIndigo) },
        },
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const vortexMesh = new THREE.Mesh(vortexGeo, this.realm1VortexMat);
    vortexMesh.position.set(0, centerY, 0.04);
    r1Group.add(vortexMesh);

    const r1Light = new THREE.PointLight(
      PALETTE.frostRunes,
      LOBBY_CONFIG.lighting.portalLightIntensity,
      LOBBY_CONFIG.lighting.portalLightDistance,
      1.7,
    );
    r1Light.position.set(0, centerY, 1.1);
    r1Group.add(r1Light);

    // Falling snow motes around Realm I alcove
    const snowCount = LOBBY_CONFIG.realm1SnowMoteCount;
    const snowPos = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount; i++) {
      snowPos[i * 3 + 0] = (Math.random() - 0.5) * 3.4;
      snowPos[i * 3 + 1] = 0.2 + Math.random() * 4.4;
      snowPos[i * 3 + 2] = 0.2 + Math.random() * 1.4;
    }
    const snowGeo = this.trackGeo(new THREE.BufferGeometry());
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    const snowMat = this.trackMat(
      new THREE.PointsMaterial({
        map: ToonAssets.getSnowTexture(),
        color: PALETTE.iceHighlights,
        size: 0.2,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.realm1SnowMotes = new THREE.Points(snowGeo, snowMat);
    r1Group.add(this.realm1SnowMotes);
    this.root.add(r1Group);

    // -----------------------------------------------------------------------
    // 2. Left — Realm II: The Sunken Sanctuary (Coral Arch & Teal Ward Chains)
    // -----------------------------------------------------------------------
    const r2Group = new THREE.Group();
    r2Group.position.set(
      LOBBY_CONFIG.realm2PortalPos.x,
      0,
      LOBBY_CONFIG.realm2PortalPos.z,
    );
    r2Group.lookAt(0, 0, 0);

    const seaStoneMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.glacialNavy, {
        emissive: PALETTE.sunkenTeal,
        emissiveIntensity: 0.16,
      }),
    );
    const tealRuneMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.sunkenTeal }),
    );
    const { group: r2Arch } = ToonAssets.createOutlinedMesh(
      this.trackGeo(new THREE.TorusGeometry(ringR, tubeR, 8, 24)),
      seaStoneMat,
      1.05,
      true,
    );
    r2Arch.position.y = centerY;
    r2Group.add(r2Arch);

    // Sculpted Coral Branches & Bioluminescent Nodes
    const coralBranchGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.06, 0.14, 0.78, 6),
    );
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const ang = i * 0.55;
      const coral = new THREE.Mesh(coralBranchGeo, seaStoneMat);
      coral.position.set(
        Math.sin(ang) * (ringR + 0.22),
        centerY + Math.cos(ang) * (ringR + 0.22),
        0,
      );
      coral.rotation.z = -ang * 1.1;
      r2Group.add(coral);
    }

    this.realm2WardGroup = new THREE.Group();
    this.realm2WardGroup.position.set(0, centerY, 0.04);
    this.realm2WardMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.sunkenTeal,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const r2Seal = new THREE.Mesh(
      this.trackGeo(new THREE.CircleGeometry(ringR - 0.16, 24)),
      this.realm2WardMat,
    );
    this.realm2WardGroup.add(r2Seal);

    // Crossed Ward Chains across Sunken Sanctuary Gate
    const chainGeo = this.trackGeo(new THREE.BoxGeometry(ringR * 1.85, 0.08, 0.06));
    const chain1 = new THREE.Mesh(chainGeo, tealRuneMat);
    chain1.rotation.z = 0.52;
    const chain2 = new THREE.Mesh(chainGeo, tealRuneMat);
    chain2.rotation.z = -0.52;
    this.realm2WardGroup.add(chain1, chain2);

    r2Group.add(this.realm2WardGroup);
    this.root.add(r2Group);

    // -----------------------------------------------------------------------
    // 3. Right — Realm III: The Harmonic Citadel (Monoliths & Tuning Crystals)
    // -----------------------------------------------------------------------
    const r3Group = new THREE.Group();
    r3Group.position.set(
      LOBBY_CONFIG.realm3PortalPos.x,
      0,
      LOBBY_CONFIG.realm3PortalPos.z,
    );
    r3Group.lookAt(0, 0, 0);

    const monolithMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.abyssalCloak, {
        emissive: PALETTE.harmonicEmerald,
        emissiveIntensity: 0.14,
      }),
    );
    const emeraldMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicEmerald }),
    );
    const magentaMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.harmonicMagenta }),
    );

    const pillarGeo = this.trackGeo(new THREE.BoxGeometry(0.45, 4.4, 0.45));
    const topBeamGeo = this.trackGeo(new THREE.BoxGeometry(4.2, 0.42, 0.52));
    const { group: mLeft } = ToonAssets.createOutlinedMesh(pillarGeo, monolithMat, 1.05, true);
    mLeft.position.set(-ringR, 2.2, 0);
    const { group: mRight } = ToonAssets.createOutlinedMesh(pillarGeo, monolithMat, 1.05, true);
    mRight.position.set(ringR, 2.2, 0);
    const { group: mTop } = ToonAssets.createOutlinedMesh(topBeamGeo, monolithMat, 1.05, true);
    mTop.position.set(0, 4.4, 0);
    r3Group.add(mLeft, mRight, mTop);

    // Dormant Emerald & Magenta Tuning Crystals flanking the Monoliths
    const tuningGeo = this.trackGeo(new THREE.OctahedronGeometry(0.24, 0));
    const tL = new THREE.Mesh(tuningGeo, emeraldMat);
    tL.position.set(-ringR, 4.85, 0);
    const tR = new THREE.Mesh(tuningGeo, magentaMat);
    tR.position.set(ringR, 4.85, 0);
    r3Group.add(tL, tR);

    this.realm3WardGroup = new THREE.Group();
    this.realm3WardGroup.position.set(0, centerY, 0.04);
    this.realm3WardMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.harmonicEmerald,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const r3Barrier = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(ringR * 1.75, 3.8)),
      this.realm3WardMat,
    );
    const r3Ring = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.75, 0.85, 6)),
      magentaMat,
    );
    r3Ring.position.z = 0.02;
    this.realm3WardGroup.add(r3Barrier, r3Ring);
    r3Group.add(this.realm3WardGroup);
    this.root.add(r3Group);
  }

  /**
   * Triggers a glowing ward ripple on sealed Realm II (Sunken Sanctuary) or Realm III (Harmonic Citadel).
   */
  public triggerWardRipple(realmIndex: 2 | 3 = 2): void {
    if (realmIndex === 2) {
      this.realm2RippleTimer = 0.65;
    } else {
      this.realm3RippleTimer = 0.65;
    }
  }

  /**
   * Animates astrolabe rings, floating spellbooks, candles, active Realm I vortex & snow,
   * trophy rotation, and ward/dummy hit reactions.
   */
  public update(time: number, dt: number): void {
    // 1. Rotate concentric brass-and-violet astrolabe rings overhead
    if (this.astrolabeOuterRing) {
      this.astrolabeOuterRing.rotation.z = time * LOBBY_CONFIG.astrolabeSpeed1;
    }
    if (this.astrolabeMidRing) {
      this.astrolabeMidRing.rotation.x = time * LOBBY_CONFIG.astrolabeSpeed2;
    }
    if (this.astrolabeInnerRing) {
      this.astrolabeInnerRing.rotation.y = time * LOBBY_CONFIG.astrolabeSpeed3;
    }

    // 2. Bob hovering open spellbooks & orbit their rune motes
    for (let i = 0; i < this.floatingBooks.length; i++) {
      const fb = this.floatingBooks[i];
      if (!fb) continue;
      fb.group.position.y =
        fb.baseY + Math.sin(time * 2.1 + fb.phase) * 0.11;
      fb.group.rotation.z = Math.sin(time * 1.5 + fb.phase) * 0.07;
      fb.moteMesh.rotation.y = time * 3.2;
      fb.moteMesh.position.y = 0.26 + Math.sin(time * 4.2 + fb.phase) * 0.06;
    }

    // 3. Gently bob & flicker floating wax candles
    for (let i = 0; i < this.floatingCandles.length; i++) {
      const fc = this.floatingCandles[i];
      if (!fc) continue;
      fc.group.position.y = fc.baseY + Math.sin(time * 1.8 + fc.phase) * 0.06;
      const flicker = 1 + Math.sin(time * 11.0 + fc.phase) * 0.16;
      fc.flameMesh.scale.set(1, flicker, 1);
      if (fc.light) {
        fc.light.intensity =
          LOBBY_CONFIG.lighting.candleLightIntensity * (0.92 + 0.1 * flicker);
      }
    }

    // 4. Rotate Stolen Frost Tiara Trophy when unlocked
    if (this.trophyCrownGroup && this.isTrophyVisible) {
      this.trophyCrownGroup.rotation.y = time * 0.85;
      this.trophyCrownGroup.position.y = 1.56 + Math.sin(time * 2.4) * 0.06;
    }

    // 5. Animate Abyssal Target Crystal idle hover & damped hit reaction wobble
    if (this.dummyCrystalPivot) {
      let wobbleX = 0;
      let wobbleZ = 0;
      if (this.dummyWobbleTimer > 0) {
        this.dummyWobbleTimer = Math.max(0, this.dummyWobbleTimer - dt);
        const ratio = this.dummyWobbleTimer / 0.55;
        wobbleX = Math.sin(time * 38) * 0.28 * ratio;
        wobbleZ = Math.cos(time * 34) * 0.24 * ratio;
        if (this.dummyCoreMat) {
          this.dummyCoreMat.emissiveIntensity = THREE.MathUtils.lerp(
            0.42,
            1.25,
            ratio,
          );
          if (ratio <= 0.02) {
            this.dummyCoreMat.emissive.setHex(PALETTE.glowViolet);
          }
        }
      }
      this.dummyCrystalPivot.position.y =
        LOBBY_CONFIG.dummyCenterY + Math.sin(time * 2.3) * 0.08;
      this.dummyCrystalPivot.rotation.set(wobbleX, time * 0.9, wobbleZ);
    }

    // 6. Update Realm I active portal vortex shader & falling snow motes
    if (this.realm1VortexMat) {
      this.realm1VortexMat.uniforms.uTime!.value = time;
    }
    if (this.realm1SnowMotes) {
      const posAttr = this.realm1SnowMotes.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) - dt * 0.65;
        if (y < 0.15) y = 4.4;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // 7. Decay Realm II & III sealed ward ripple reactions
    if (this.realm2WardMat && this.realm2WardGroup) {
      if (this.realm2RippleTimer > 0) {
        this.realm2RippleTimer = Math.max(0, this.realm2RippleTimer - dt);
        const r = this.realm2RippleTimer / 0.65;
        this.realm2WardMat.opacity = 0.34 + r * 0.52;
        const s = 1 + Math.sin(time * 28) * 0.04 * r;
        this.realm2WardGroup.scale.set(s, s, 1);
      } else {
        this.realm2WardMat.opacity = 0.28 + 0.08 * Math.sin(time * 2.2);
        this.realm2WardGroup.scale.set(1, 1, 1);
      }
    }

    if (this.realm3WardMat && this.realm3WardGroup) {
      if (this.realm3RippleTimer > 0) {
        this.realm3RippleTimer = Math.max(0, this.realm3RippleTimer - dt);
        const r = this.realm3RippleTimer / 0.65;
        this.realm3WardMat.opacity = 0.32 + r * 0.55;
        const s = 1 + Math.sin(time * 32) * 0.04 * r;
        this.realm3WardGroup.scale.set(s, s, 1);
      } else {
        this.realm3WardMat.opacity = 0.26 + 0.08 * Math.sin(time * 2.6 + 1.2);
        this.realm3WardGroup.scale.set(1, 1, 1);
      }
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
