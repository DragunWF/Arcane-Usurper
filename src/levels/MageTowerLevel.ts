import * as THREE from 'three';
import {
  ARENA_CONFIG,
  LOBBY_CONFIG,
  PALETTE,
  SIPHON_GALLERY_CONFIG,
} from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';
import { MarinaRig } from '../rigs/bosses/MarinaRig';
import { MikuRig } from '../rigs/bosses/MikuRig';
import { SerenaRig } from '../rigs/bosses/SerenaRig';

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

interface GalleryBrazierRecord {
  readonly flameMesh: THREE.Mesh;
  readonly light: THREE.PointLight;
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

  // Stolen Trophy Pedestal (Marina Frost Tiara, Serena Coral Tiara & Miku Hair-Cube Tuning Relic)
  private trophyCrownGroup: THREE.Group | null = null;
  private trophyAuraMesh: THREE.Mesh | null = null;
  private trophyLight: THREE.PointLight | null = null;
  private isTrophyVisible = false;
  private serenaTrophyGroup: THREE.Group | null = null;
  private serenaTrophyLight: THREE.PointLight | null = null;
  private isSerenaTrophyVisible = false;
  private mikuTrophyGroup: THREE.Group | null = null;
  private mikuTrophyLight: THREE.PointLight | null = null;
  private isMikuTrophyVisible = false;

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

  // Realm II Active Bioluminescent Teal-and-Gold Vortex & Rising Bubbles
  private realm2VortexMat: THREE.ShaderMaterial | null = null;
  private realm2BubbleMotes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > | null = null;

  // Realm III Active Emerald-and-Magenta Harmonic Vortex & Rising Synth Motes
  private realm3VortexMat: THREE.ShaderMaterial | null = null;
  private realm3SynthMotes: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  > | null = null;

  // Siphon Gallery Annex (Southern Archway, Velvet Bridge, Bound Marina, Bound Serena & Bound Miku)
  private galleryWardGroup: THREE.Group | null = null;
  private galleryWardMat: THREE.MeshBasicMaterial | null = null;
  private galleryWardRippleTimer = 0;
  private galleryUnlocked = false;
  private marinaCaptiveUnlocked = false;
  private serenaCaptiveUnlocked = false;
  private mikuCaptiveUnlocked = false;
  private readonly galleryBraziers: GalleryBrazierRecord[] = [];
  private marinaDaisGroup: THREE.Group | null = null;
  private _captiveMarinaRig: MarinaRig | null = null;
  private leftConduitTip: THREE.Object3D | null = null;
  private rightConduitTip: THREE.Object3D | null = null;
  private leftTetherMesh: THREE.Mesh | null = null;
  private rightTetherMesh: THREE.Mesh | null = null;
  private tetherMat: THREE.MeshBasicMaterial | null = null;
  private cuffMat: THREE.MeshBasicMaterial | null = null;
  private reservoirCoreMesh: THREE.Mesh | null = null;
  private reservoirCoreMat: THREE.MeshToonMaterial | null = null;
  private reservoirLight: THREE.PointLight | null = null;
  private readonly daisRuneSegments: THREE.MeshBasicMaterial[] = [];

  // Siphon Gallery Alcove II (Left Tide-Pool Velvet Dais, Captive Serena & Tidal Reservoir)
  private serenaDaisGroup: THREE.Group | null = null;
  private serenaDormantSeal: THREE.Mesh | null = null;
  private serenaActiveGroup: THREE.Group | null = null;
  private serenaPoolMesh: THREE.Mesh | null = null;
  private serenaPoolMat: THREE.MeshBasicMaterial | null = null;
  private _captiveSerenaRig: SerenaRig | null = null;
  private serenaLeftConduitTip: THREE.Object3D | null = null;
  private serenaRightConduitTip: THREE.Object3D | null = null;
  private serenaLeftTetherMesh: THREE.Mesh | null = null;
  private serenaRightTetherMesh: THREE.Mesh | null = null;
  private serenaReservoirCoreMesh: THREE.Mesh | null = null;
  private serenaReservoirCoreMat: THREE.MeshToonMaterial | null = null;
  private serenaReservoirLight: THREE.PointLight | null = null;
  private readonly serenaDaisRuneSegments: THREE.MeshBasicMaterial[] = [];

  // Siphon Gallery Alcove III (Right Harmonic Stage Velvet Dais, Captive Miku & Harmonic Reservoir)
  private mikuDaisGroup: THREE.Group | null = null;
  private mikuDormantSeal: THREE.Mesh | null = null;
  private mikuActiveGroup: THREE.Group | null = null;
  private mikuStageRingMat: THREE.MeshBasicMaterial | null = null;
  private _captiveMikuRig: MikuRig | null = null;
  private mikuLeftConduitTip: THREE.Object3D | null = null;
  private mikuRightConduitTip: THREE.Object3D | null = null;
  private mikuLeftTetherMesh: THREE.Mesh | null = null;
  private mikuRightTetherMesh: THREE.Mesh | null = null;
  private mikuReservoirCoreMesh: THREE.Mesh | null = null;
  private mikuReservoirCoreMat: THREE.MeshToonMaterial | null = null;
  private mikuReservoirLight: THREE.PointLight | null = null;
  private readonly mikuDaisRuneSegments: THREE.MeshBasicMaterial[] = [];

  // Reusable scratch vectors for zero-GC tether updates
  private readonly scratchWristL = new THREE.Vector3();
  private readonly scratchWristR = new THREE.Vector3();
  private readonly scratchTipL = new THREE.Vector3();
  private readonly scratchTipR = new THREE.Vector3();
  private readonly scratchMid = new THREE.Vector3();
  private readonly scratchDir = new THREE.Vector3();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);
  private readonly scratchColorA = new THREE.Color(PALETTE.drainedAshSilver);
  private readonly scratchColorB = new THREE.Color(PALETTE.frostRunes);
  private readonly scratchColorTeal = new THREE.Color(PALETTE.biolumCyan);
  private readonly scratchColorEmerald = new THREE.Color(PALETTE.harmonicEmerald);

  public get captiveMarinaRig(): MarinaRig | null {
    return this._captiveMarinaRig;
  }

  public get captiveSerenaRig(): SerenaRig | null {
    return this._captiveSerenaRig;
  }

  public get captiveMikuRig(): MikuRig | null {
    return this._captiveMikuRig;
  }

  public get isGalleryUnlocked(): boolean {
    return this.galleryUnlocked;
  }

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
    this.buildSiphonGalleryAnnex();
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

        // Central violet summoning circle (outer perimeter strictly within ~3.6m so runners never overlap it)
        const radii = LOBBY_CONFIG.summoningCircleRingRadiiPx;
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

        // Subtle outer rotunda perimeter rune ring near the stone piers
        ctx.beginPath();
        ctx.arc(0, 0, LOBBY_CONFIG.outerFloorRuneRingPx, 0, Math.PI * 2);
        ctx.strokeStyle = PALETTE.rgba.sanctumRuneSoftGlow;
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, LOBBY_CONFIG.outerFloorRuneRingPx, 0, Math.PI * 2);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2.4;
        ctx.stroke();

        // Inscribed arcane octagram star inside the central summoning circle
        for (let k = 0; k < 2; k++) {
          ctx.save();
          ctx.rotate((k * Math.PI) / 4);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 2.4;
          ctx.strokeRect(-90, -90, 180, 180);
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

    // Three non-overlapping velvet runners: each begins cleanly outside the central violet
    // summoning circle (runnerStartRadius) and terminates flush at its portal plinth front step
    const runnerTargets = [
      { pos: LOBBY_CONFIG.realm1PortalPos, color: PALETTE.royalIndigo, trim: PALETTE.frostRunes },
      { pos: LOBBY_CONFIG.realm2PortalPos, color: PALETTE.glacialNavy, trim: PALETTE.sunkenTeal },
      { pos: LOBBY_CONFIG.realm3PortalPos, color: PALETTE.sanctumStone, trim: PALETTE.harmonicEmerald },
    ];

    const startR = LOBBY_CONFIG.runnerStartRadius;
    const plinthFrontHalfDepth = LOBBY_CONFIG.portalPlinthTier1Depth * 0.5;

    runnerTargets.forEach((rt) => {
      const portalDist = Math.hypot(rt.pos.x, rt.pos.z);
      const endR = Math.max(startR + 0.5, portalDist - plinthFrontHalfDepth);
      const len = endR - startR;
      const midR = (startR + endR) * 0.5;
      const angle = Math.atan2(rt.pos.x, rt.pos.z);

      const runnerGroup = new THREE.Group();
      runnerGroup.rotation.y = angle;
      runnerGroup.position.y = 0.015;

      const carpetGeo = this.trackGeo(
        new THREE.PlaneGeometry(LOBBY_CONFIG.runnerWidth, len),
      );
      const carpetMat = this.trackMat(
        ToonAssets.createToonMaterial(rt.color, {
          emissive: rt.trim,
          emissiveIntensity: 0.14,
        }),
      );
      const carpet = new THREE.Mesh(carpetGeo, carpetMat);
      carpet.rotation.x = -Math.PI / 2;
      carpet.position.z = midR;
      carpet.receiveShadow = true;
      runnerGroup.add(carpet);

      const borderGeo = this.trackGeo(
        new THREE.PlaneGeometry(LOBBY_CONFIG.runnerBorderWidth, len),
      );
      const borderMat = this.trackMat(
        new THREE.MeshBasicMaterial({ color: rt.trim }),
      );
      const border = new THREE.Mesh(borderGeo, borderMat);
      border.rotation.x = -Math.PI / 2;
      border.position.set(0, -0.003, midR);
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

      // Skip the dead-center southern pier (i === 0, z = +R) to open the Siphon Gallery doorway
      if (i !== 0) {
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
      }

      // Gothic Window Bay between Pier i and Pier i+1
      const midAngle = ((i + 0.5) / count) * Math.PI * 2;
      const wx = Math.sin(midAngle) * R;
      const wz = Math.cos(midAngle) * R;

      const bayGroup = new THREE.Group();
      bayGroup.position.set(wx, 0, wz);
      bayGroup.lookAt(0, 0, 0);

      // Keep the two flanking southern bays (i === 0 and i === count - 1) open for the bridge archway
      const isSouthernArchwayBay = i === 0 || i === count - 1;
      if (!isSouthernArchwayBay) {
        const wainscotting = new THREE.Mesh(lowerWallGeo, stoneMat);
        wainscotting.position.y = 1.1;
        wainscotting.receiveShadow = true;
        bayGroup.add(wainscotting);
        this._cameraColliders.push(wainscotting);
        this._pillarMeshes.push(wainscotting);
      }

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

    // 1. Curved Bookshelves placed cleanly along southern, eastern, and western rotunda bays (z > -3.0)
    // leaving the northern Gothic arch wall arc behind the three realm portals completely unobstructed
    const shelfAngles = LOBBY_CONFIG.bookshelfBayAngles;
    const frameGeo = this.trackGeo(new THREE.BoxGeometry(2.3, 3.4, 0.55));
    const bookGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 0.42, 0.34));

    shelfAngles.forEach((ang, sIdx) => {
      const r = LOBBY_CONFIG.outerWallRadius - LOBBY_CONFIG.bookshelfRadiusOffset;
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

    // Floating Coral Tiara & Glowing Pearl Trophy (Serena — Realm II)
    const coralMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.serenaCoralTiara, {
        emissive: PALETTE.coralRose,
        emissiveIntensity: 0.52,
      }),
    );
    const pearlMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.serenaPearl, {
        emissive: PALETTE.biolumCyan,
        emissiveIntensity: 0.48,
      }),
    );
    const goldMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.atlanteanGold, {
        emissive: PALETTE.atlanteanGold,
        emissiveIntensity: 0.35,
      }),
    );
    const serenaAuraMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.biolumCyan,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.serenaTrophyGroup = new THREE.Group();
    this.serenaTrophyGroup.position.y = 1.62;

    const sBand = new THREE.Mesh(bandGeo, goldMat);
    sBand.rotation.x = Math.PI / 2;
    this.serenaTrophyGroup.add(sBand);

    const coralBranchGeo = this.trackGeo(new THREE.ConeGeometry(0.036, 0.26, 5));
    for (let i = -2; i <= 2; i++) {
      const ang = i * 0.44;
      const hScale = 1 - Math.abs(i) * 0.2;
      const branch = new THREE.Mesh(coralBranchGeo, coralMat);
      branch.position.set(
        Math.sin(ang) * 0.23,
        0.13 * hScale,
        Math.cos(ang) * 0.23,
      );
      branch.rotation.z = -ang * 0.35;
      branch.scale.setScalar(hScale);
      this.serenaTrophyGroup.add(branch);
    }

    const glowingPearl = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.115, 16, 14)),
      pearlMat,
    );
    glowingPearl.position.y = 0.09;
    this.serenaTrophyGroup.add(glowingPearl);

    const serenaAura = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.38, 12, 12)),
      serenaAuraMat,
    );
    this.serenaTrophyGroup.add(serenaAura);

    this.serenaTrophyLight = new THREE.PointLight(
      PALETTE.biolumCyan,
      LOBBY_CONFIG.lighting.trophyLightIntensity,
      LOBBY_CONFIG.lighting.trophyLightDistance,
      1.8,
    );
    this.serenaTrophyLight.position.y = 1.7;
    pedGroup.add(this.serenaTrophyLight);
    pedGroup.add(this.serenaTrophyGroup);

    // Floating Geometric Hair-Cube & Glowing Tuning Relic (Miku — Realm III)
    const mikuCubeMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.abyssalCloak, {
        emissive: PALETTE.harmonicMagenta,
        emissiveIntensity: 0.48,
      }),
    );
    const mikuMagentaEdgeMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.harmonicMagenta,
      }),
    );
    const mikuTuningMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.harmonicEmerald, {
        emissive: PALETTE.harmonicEmerald,
        emissiveIntensity: 0.72,
      }),
    );
    const mikuAuraMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.harmonicEmerald,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.mikuTrophyGroup = new THREE.Group();
    this.mikuTrophyGroup.position.y = 1.6;

    // Twin iconic square hair-tie cube frames flanking the central tuning relic
    const cubeFrameGeo = this.trackGeo(new THREE.BoxGeometry(0.14, 0.14, 0.06));
    const cubeTrimGeo = this.trackGeo(new THREE.BoxGeometry(0.165, 0.165, 0.032));
    for (const side of [-1, 1]) {
      const cubeHolder = new THREE.Group();
      cubeHolder.position.set(side * 0.18, 0.06, 0);
      cubeHolder.rotation.z = side * 0.24;

      const cubeCore = new THREE.Mesh(cubeFrameGeo, mikuCubeMat);
      const cubeTrim = new THREE.Mesh(cubeTrimGeo, mikuMagentaEdgeMat);
      cubeHolder.add(cubeTrim, cubeCore);
      this.mikuTrophyGroup.add(cubeHolder);
    }

    // Central Glowing Harmonic Tuning Fork Relic
    const forkStem = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.022, 0.028, 0.22, 6)),
      mikuTuningMat,
    );
    forkStem.position.y = -0.05;
    this.mikuTrophyGroup.add(forkStem);

    const forkCrossbar = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.15, 0.032, 0.032)),
      mikuTuningMat,
    );
    forkCrossbar.position.y = 0.05;
    this.mikuTrophyGroup.add(forkCrossbar);

    const prongGeo = this.trackGeo(new THREE.BoxGeometry(0.026, 0.22, 0.026));
    for (const side of [-1, 1]) {
      const prong = new THREE.Mesh(prongGeo, mikuTuningMat);
      prong.position.set(side * 0.062, 0.16, 0);
      this.mikuTrophyGroup.add(prong);
    }

    const tuningGem = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.062, 0)),
      mikuMagentaEdgeMat,
    );
    tuningGem.position.y = 0.17;
    this.mikuTrophyGroup.add(tuningGem);

    const mikuAura = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.38, 12, 12)),
      mikuAuraMat,
    );
    this.mikuTrophyGroup.add(mikuAura);

    this.mikuTrophyLight = new THREE.PointLight(
      PALETTE.harmonicEmerald,
      LOBBY_CONFIG.lighting.trophyLightIntensity,
      LOBBY_CONFIG.lighting.trophyLightDistance,
      1.8,
    );
    this.mikuTrophyLight.position.y = 1.68;
    pedGroup.add(this.mikuTrophyLight);
    pedGroup.add(this.mikuTrophyGroup);

    this.root.add(pedGroup);

    this._pillarColliders.push({
      x: pos.x,
      z: pos.z,
      radius: LOBBY_CONFIG.trophyCollisionRadius,
      height: 1.8,
    });

    this.setTrophyVisible(false, 0, false, false);
  }

  /**
   * Toggles the Stolen Frost Tiara (Marina), Coral Tiara & Glowing Pearl (Serena),
   * and Geometric Hair-Cube Tuning Relic (Miku) on the Sanctum pedestal and arranges
   * whichever subset is unlocked symmetrically across the plinth.
   */
  public setTrophyVisible(
    marinaVisible: boolean,
    encoreTier = 0,
    serenaVisible = this.isSerenaTrophyVisible,
    mikuVisible = this.isMikuTrophyVisible,
  ): void {
    this.isTrophyVisible = marinaVisible;
    this.isSerenaTrophyVisible = serenaVisible;
    this.isMikuTrophyVisible = mikuVisible;

    const visibleEntries: Array<{ group: THREE.Group | null }> = [];
    if (marinaVisible) visibleEntries.push({ group: this.trophyCrownGroup });
    if (serenaVisible) visibleEntries.push({ group: this.serenaTrophyGroup });
    if (mikuVisible) visibleEntries.push({ group: this.mikuTrophyGroup });

    const count = visibleEntries.length;
    const baseScale = 1 + Math.min(3, Math.max(0, encoreTier)) * 0.08;
    const trophyScale =
      count >= 3 ? baseScale * 0.78 : count === 2 ? baseScale * 0.88 : baseScale;
    const intensity =
      LOBBY_CONFIG.lighting.trophyLightIntensity *
      (1 + Math.min(3, Math.max(0, encoreTier)) * 0.15);

    if (this.trophyCrownGroup) {
      this.trophyCrownGroup.visible = marinaVisible;
      this.trophyCrownGroup.scale.setScalar(trophyScale);
    }
    if (this.trophyLight) {
      this.trophyLight.visible = marinaVisible;
      this.trophyLight.intensity = marinaVisible ? intensity : 0;
    }
    if (this.serenaTrophyGroup) {
      this.serenaTrophyGroup.visible = serenaVisible;
      this.serenaTrophyGroup.scale.setScalar(trophyScale);
    }
    if (this.serenaTrophyLight) {
      this.serenaTrophyLight.visible = serenaVisible;
      this.serenaTrophyLight.intensity = serenaVisible ? intensity : 0;
    }
    if (this.mikuTrophyGroup) {
      this.mikuTrophyGroup.visible = mikuVisible;
      this.mikuTrophyGroup.scale.setScalar(trophyScale);
    }
    if (this.mikuTrophyLight) {
      this.mikuTrophyLight.visible = mikuVisible;
      this.mikuTrophyLight.intensity = mikuVisible ? intensity : 0;
    }

    if (count === 1) {
      const g = visibleEntries[0]?.group;
      if (g) {
        g.position.x = 0;
        g.position.z = 0;
      }
    } else if (count === 2) {
      const g0 = visibleEntries[0]?.group;
      const g1 = visibleEntries[1]?.group;
      if (g0) {
        g0.position.x = -0.34;
        g0.position.z = 0;
      }
      if (g1) {
        g1.position.x = 0.34;
        g1.position.z = 0;
      }
    } else if (count >= 3) {
      const ringRadius = 0.34;
      for (let i = 0; i < visibleEntries.length; i++) {
        const g = visibleEntries[i]?.group;
        if (!g) continue;
        const ang = (i / visibleEntries.length) * Math.PI * 2 - Math.PI / 2;
        g.position.x = Math.cos(ang) * ringRadius;
        g.position.z = Math.sin(ang) * ringRadius;
      }
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
   * Builds a grounded two-tier stepped obsidian-stone dais flush with y = 0 plus twin
   * vertical stone-and-crystal archway support pillars connecting the portal ring into the plinth.
   */
  private attachGroundedPortalPlinthAndPillars(
    portalGroup: THREE.Group,
    accentHex: number,
    crystalMat: THREE.Material,
    includeSidePillars: boolean,
  ): void {
    const plinthStoneMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.sanctumStone, {
        emissive: PALETTE.obsidianTrim,
        emissiveIntensity: 0.12,
      }),
    );
    const pillarStoneMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.abyssalCloak, {
        emissive: accentHex,
        emissiveIntensity: 0.14,
      }),
    );
    const accentTrimMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: accentHex }),
    );

    const t1W = LOBBY_CONFIG.portalPlinthTier1Width;
    const t1H = LOBBY_CONFIG.portalPlinthTier1Height;
    const t1D = LOBBY_CONFIG.portalPlinthTier1Depth;
    const t2W = LOBBY_CONFIG.portalPlinthTier2Width;
    const t2H = LOBBY_CONFIG.portalPlinthTier2Height;
    const t2D = LOBBY_CONFIG.portalPlinthTier2Depth;
    const plinthTopY = t1H + t2H;

    // Tier 1 (lower broad step flush at y = 0)
    const tier1Geo = this.trackGeo(new THREE.BoxGeometry(t1W, t1H, t1D));
    const { group: tier1Obj } = ToonAssets.createOutlinedMesh(
      tier1Geo,
      plinthStoneMat,
      { x: 1.015, y: 1.01, z: 1.02 },
      true,
    );
    tier1Obj.position.y = t1H * 0.5;
    portalGroup.add(tier1Obj);

    // Glowing front step rune strip where the carpet runner terminates flush
    const stepTrimGeo = this.trackGeo(new THREE.BoxGeometry(t1W - 0.16, 0.045, 0.05));
    const stepTrim = new THREE.Mesh(stepTrimGeo, accentTrimMat);
    stepTrim.position.set(0, t1H - 0.02, t1D * 0.5 + 0.01);
    portalGroup.add(stepTrim);

    // Tier 2 (upper dais platform)
    const tier2Geo = this.trackGeo(new THREE.BoxGeometry(t2W, t2H, t2D));
    const { group: tier2Obj } = ToonAssets.createOutlinedMesh(
      tier2Geo,
      pillarStoneMat,
      { x: 1.015, y: 1.01, z: 1.02 },
      true,
    );
    tier2Obj.position.y = t1H + t2H * 0.5;
    portalGroup.add(tier2Obj);

    // Carved stone cradle socket physically seating the bottom of the portal ring into the plinth
    const cradleGeo = this.trackGeo(new THREE.BoxGeometry(1.75, 0.34, 0.85));
    const { group: cradleObj } = ToonAssets.createOutlinedMesh(
      cradleGeo,
      pillarStoneMat,
      1.04,
      true,
    );
    cradleObj.position.set(0, plinthTopY + 0.14, 0);
    portalGroup.add(cradleObj);

    if (!includeSidePillars) return;

    // Twin vertical stone-and-crystal archway support pillars physically bracing the ring down to the plinth
    const pOffsetX = LOBBY_CONFIG.portalSupportPillarOffsetX;
    const pHeight = LOBBY_CONFIG.portalSupportPillarHeight;
    const pRadius = LOBBY_CONFIG.portalSupportPillarRadius;
    const pillarGeo = this.trackGeo(
      new THREE.CylinderGeometry(pRadius * 0.86, pRadius * 1.08, pHeight, 6),
    );
    const capGeo = this.trackGeo(new THREE.ConeGeometry(pRadius * 0.95, 0.72, 6));
    const braceGeo = this.trackGeo(new THREE.BoxGeometry(0.68, 0.28, 0.44));

    const sides: readonly (-1 | 1)[] = [-1, 1];
    sides.forEach((side) => {
      const px = side * pOffsetX;

      const { group: shaftObj } = ToonAssets.createOutlinedMesh(
        pillarGeo,
        pillarStoneMat,
        { x: 1.06, y: 1.01, z: 1.06 },
        true,
      );
      shaftObj.position.set(px, plinthTopY + pHeight * 0.5, 0);
      portalGroup.add(shaftObj);

      // Horizontal stone bracket locking the pillar directly into the portal ring equator
      const { group: braceObj } = ToonAssets.createOutlinedMesh(
        braceGeo,
        pillarStoneMat,
        1.05,
        true,
      );
      braceObj.position.set(
        side * (pOffsetX - 0.24),
        LOBBY_CONFIG.portalCenterY,
        0,
      );
      portalGroup.add(braceObj);

      // Glowing accent band & crystal spire crowning each support pillar
      const bandGeo = this.trackGeo(
        new THREE.CylinderGeometry(pRadius * 0.98, pRadius * 0.98, 0.12, 6),
      );
      const band = new THREE.Mesh(bandGeo, accentTrimMat);
      band.position.set(px, plinthTopY + pHeight - 0.22, 0);
      portalGroup.add(band);

      const { group: finialObj } = ToonAssets.createOutlinedMesh(
        capGeo,
        crystalMat,
        1.06,
        true,
      );
      finialObj.position.set(px, plinthTopY + pHeight + 0.36, 0);
      portalGroup.add(finialObj);
    });
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
    const plinthTopY =
      LOBBY_CONFIG.portalPlinthTier1Height +
      LOBBY_CONFIG.portalPlinthTier2Height;

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
    this.attachGroundedPortalPlinthAndPillars(
      r1Group,
      PALETTE.frostRunes,
      frostArchMat,
      true,
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
    // 2. Left — Realm II: The Sunken Sanctuary (Active Bioluminescent Teal-and-Gold Vortex)
    // -----------------------------------------------------------------------
    const r2Group = new THREE.Group();
    r2Group.position.set(
      LOBBY_CONFIG.realm2PortalPos.x,
      0,
      LOBBY_CONFIG.realm2PortalPos.z,
    );
    r2Group.lookAt(0, 0, 0);

    const seaStoneMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.seaStoneMid, {
        emissive: PALETTE.biolumCyan,
        emissiveIntensity: 0.22,
      }),
    );
    const tealCrystalMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.biolumCyan, {
        emissive: PALETTE.atlanteanGold,
        emissiveIntensity: 0.42,
      }),
    );
    const coralBranchMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.coralRose, {
        emissive: PALETTE.coralRose,
        emissiveIntensity: 0.3,
      }),
    );
    this.attachGroundedPortalPlinthAndPillars(
      r2Group,
      PALETTE.biolumCyan,
      tealCrystalMat,
      true,
    );

    const { group: r2Arch } = ToonAssets.createOutlinedMesh(
      this.trackGeo(new THREE.TorusGeometry(ringR, tubeR, 8, 28)),
      seaStoneMat,
      1.05,
      true,
    );
    r2Arch.position.y = centerY;
    r2Group.add(r2Arch);

    // Sculpted Coral Branches crowning the unsealed Sunken Sanctuary arch
    const coralBranchGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.06, 0.14, 0.78, 6),
    );
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const ang = i * 0.55;
      const coral = new THREE.Mesh(
        coralBranchGeo,
        Math.abs(i) === 1 ? coralBranchMat : seaStoneMat,
      );
      coral.position.set(
        Math.sin(ang) * (ringR + 0.22),
        centerY + Math.cos(ang) * (ringR + 0.22),
        0,
      );
      coral.rotation.z = -ang * 1.1;
      r2Group.add(coral);
    }

    // Active swirling bioluminescent teal-and-gold GLSL vortex
    this.realm2VortexMat = this.trackMat(
      new THREE.ShaderMaterial({
        vertexShader: REALM1_VORTEX_VERTEX_SHADER,
        fragmentShader: REALM1_VORTEX_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uColorCyan: { value: new THREE.Color(PALETTE.biolumCyan) },
          uColorViolet: { value: new THREE.Color(PALETTE.atlanteanGold) },
          uColorCore: { value: new THREE.Color(PALETTE.pearlWhite) },
          uColorDeep: { value: new THREE.Color(PALETTE.abyssalTeal) },
        },
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const r2VortexMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CircleGeometry(ringR - 0.14, 36)),
      this.realm2VortexMat,
    );
    r2VortexMesh.position.set(0, centerY, 0.04);
    r2Group.add(r2VortexMesh);

    const r2Light = new THREE.PointLight(
      PALETTE.biolumCyan,
      LOBBY_CONFIG.lighting.portalLightIntensity,
      LOBBY_CONFIG.lighting.portalLightDistance,
      1.7,
    );
    r2Light.position.set(0, centerY, 1.1);
    r2Group.add(r2Light);

    // Rising bioluminescent bubble motes framing the unsealed Realm II alcove
    const bubbleCount = LOBBY_CONFIG.realm1SnowMoteCount;
    const bubblePos = new Float32Array(bubbleCount * 3);
    for (let i = 0; i < bubbleCount; i++) {
      bubblePos[i * 3 + 0] = (Math.random() - 0.5) * 3.4;
      bubblePos[i * 3 + 1] = 0.2 + Math.random() * 4.4;
      bubblePos[i * 3 + 2] = 0.2 + Math.random() * 1.4;
    }
    const bubbleGeo = this.trackGeo(new THREE.BufferGeometry());
    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
    const bubbleMat = this.trackMat(
      new THREE.PointsMaterial({
        map: ToonAssets.getSnowTexture(),
        color: PALETTE.biolumCyan,
        size: 0.2,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.realm2BubbleMotes = new THREE.Points(bubbleGeo, bubbleMat);
    r2Group.add(this.realm2BubbleMotes);
    this.root.add(r2Group);

    // -----------------------------------------------------------------------
    // 3. Right — Realm III: The Harmonic Citadel (Grounded Monoliths & Tuning Crystals)
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
    this.attachGroundedPortalPlinthAndPillars(
      r3Group,
      PALETTE.harmonicEmerald,
      emeraldMat,
      false,
    );

    // Twin Grounded Geometric Monolith Pillars resting directly on the upper dais tier
    const monolithH = 4.15;
    const pillarGeo = this.trackGeo(new THREE.BoxGeometry(0.52, monolithH, 0.52));
    const topBeamGeo = this.trackGeo(new THREE.BoxGeometry(4.65, 0.44, 0.56));
    const { group: mLeft } = ToonAssets.createOutlinedMesh(pillarGeo, monolithMat, 1.05, true);
    mLeft.position.set(-ringR - 0.12, plinthTopY + monolithH * 0.5, 0);
    const { group: mRight } = ToonAssets.createOutlinedMesh(pillarGeo, monolithMat, 1.05, true);
    mRight.position.set(ringR + 0.12, plinthTopY + monolithH * 0.5, 0);
    const { group: mTop } = ToonAssets.createOutlinedMesh(topBeamGeo, monolithMat, 1.05, true);
    mTop.position.set(0, plinthTopY + monolithH + 0.14, 0);
    r3Group.add(mLeft, mRight, mTop);

    // Grounded Portal Ring nested between the Monolith Pillars
    const { group: r3Arch } = ToonAssets.createOutlinedMesh(
      this.trackGeo(new THREE.TorusGeometry(ringR, tubeR * 0.85, 6, 24)),
      monolithMat,
      1.04,
      true,
    );
    r3Arch.position.y = centerY;
    r3Group.add(r3Arch);

    // Active Emerald & Magenta Tuning Crystals crowning the Monolith Pillars
    const tuningGeo = this.trackGeo(new THREE.OctahedronGeometry(0.26, 0));
    const tL = new THREE.Mesh(tuningGeo, emeraldMat);
    tL.position.set(-ringR - 0.12, plinthTopY + monolithH + 0.68, 0);
    const tR = new THREE.Mesh(tuningGeo, magentaMat);
    tR.position.set(ringR + 0.12, plinthTopY + monolithH + 0.68, 0);
    r3Group.add(tL, tR);

    // Active swirling emerald-and-magenta GLSL harmonic vortex
    this.realm3VortexMat = this.trackMat(
      new THREE.ShaderMaterial({
        vertexShader: REALM1_VORTEX_VERTEX_SHADER,
        fragmentShader: REALM1_VORTEX_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uColorCyan: { value: new THREE.Color(PALETTE.harmonicEmerald) },
          uColorViolet: { value: new THREE.Color(PALETTE.harmonicMagenta) },
          uColorCore: { value: new THREE.Color(PALETTE.mikuCyan) },
          uColorDeep: { value: new THREE.Color(PALETTE.cyberObsidian) },
        },
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const r3VortexMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CircleGeometry(ringR - 0.14, 36)),
      this.realm3VortexMat,
    );
    r3VortexMesh.position.set(0, centerY, 0.04);
    r3Group.add(r3VortexMesh);

    const r3Light = new THREE.PointLight(
      PALETTE.harmonicEmerald,
      LOBBY_CONFIG.lighting.portalLightIntensity,
      LOBBY_CONFIG.lighting.portalLightDistance,
      1.7,
    );
    r3Light.position.set(0, centerY, 1.1);
    r3Group.add(r3Light);

    // Rising neon synth-spark motes framing the unsealed Realm III alcove
    const synthCount = LOBBY_CONFIG.realm1SnowMoteCount;
    const synthPos = new Float32Array(synthCount * 3);
    for (let i = 0; i < synthCount; i++) {
      synthPos[i * 3 + 0] = (Math.random() - 0.5) * 3.4;
      synthPos[i * 3 + 1] = 0.2 + Math.random() * 4.4;
      synthPos[i * 3 + 2] = 0.2 + Math.random() * 1.4;
    }
    const synthGeo = this.trackGeo(new THREE.BufferGeometry());
    synthGeo.setAttribute('position', new THREE.BufferAttribute(synthPos, 3));
    const synthMat = this.trackMat(
      new THREE.PointsMaterial({
        map: ToonAssets.getSparkTexture(),
        color: PALETTE.mikuCyan,
        size: 0.2,
        transparent: true,
        opacity: 0.84,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.realm3SynthMotes = new THREE.Points(synthGeo, synthMat);
    r3Group.add(this.realm3SynthMotes);
    this.root.add(r3Group);
  }

  /**
   * Builds the southern **Siphon Gallery Annex** extending from the main rotunda:
   * - Southern Gothic archway & progressive royal-violet ward seal
   * - Velvet-carpeted obsidian stone bridge (z = 11.5..18.5) with crystal ribs & camera colliders
   * - Circular Siphon Gallery (radius 7.2, centered at z = 24.5) with vaulted Gothic arches,
   *   cold-flame braziers, and 3 raised velvet dais alcoves (Marina active + 2 dormant)
   * - Dedicated kneeling captive MarinaRig with glowing wrist rune-cuffs, pulsing energy tethers
   *   to twin flanking crystal conduits, 12-segment floor rune gauge, and Cryo Core Reservoir Crystal.
   */
  private buildSiphonGalleryAnnex(): void {
    const cfg = SIPHON_GALLERY_CONFIG;

    const stoneMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.sanctumStone, {
        emissive: PALETTE.royalIndigo,
        emissiveIntensity: 0.12,
      }),
    );
    const darkObsidianMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.abyssalCloak, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.14,
      }),
    );
    const pierMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.shadowSlate),
    );
    const velvetMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.galleryVelvet, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.16,
      }),
    );
    const violetTrimMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.amethystTrim }),
    );
    const crystalGlassMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.iceHighlights, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
      }),
    );
    const inwardWallMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.sanctumStone, {
        emissive: PALETTE.royalIndigo,
        emissiveIntensity: 0.1,
        side: THREE.FrontSide,
      }),
    );

    // -----------------------------------------------------------------------
    // 1. Southern Gothic Archway Opening & Shimmering Violet Ward Seal
    // -----------------------------------------------------------------------
    const archGroup = new THREE.Group();
    archGroup.position.set(0, 0, cfg.southArchwayZ);

    const jambGeo = this.trackGeo(
      new THREE.BoxGeometry(0.95, cfg.southArchwayHeight, 1.15),
    );
    const archLintelGeo = this.trackGeo(
      new THREE.BoxGeometry(cfg.southArchwayHalfWidth * 2 + 1.4, 0.95, 1.25),
    );
    const flankWallGeo = this.trackGeo(new THREE.BoxGeometry(4.1, 2.35, 0.55));

    const sides: readonly (-1 | 1)[] = [-1, 1];
    sides.forEach((side) => {
      const jambX = side * (cfg.southArchwayHalfWidth + 0.42);
      const { group: jambObj, mainMesh: jambMesh } =
        ToonAssets.createOutlinedMesh(
          jambGeo,
          darkObsidianMat,
          { x: 1.05, y: 1.01, z: 1.05 },
          true,
        );
      jambObj.position.set(jambX, cfg.southArchwayHeight * 0.5, 0);
      archGroup.add(jambObj);
      this._cameraColliders.push(jambMesh);
      this._pillarMeshes.push(jambMesh);
      this._pillarColliders.push({
        x: jambX,
        z: cfg.southArchwayZ,
        radius: 0.62,
        height: cfg.southArchwayHeight,
      });

      // Glowing crystal finial atop each archway jamb
      const finial = new THREE.Mesh(
        this.trackGeo(new THREE.ConeGeometry(0.26, 0.9, 6)),
        violetTrimMat,
      );
      finial.position.set(jambX, cfg.southArchwayHeight + 0.5, 0);
      archGroup.add(finial);

      // Angled stone flank wall sealing the rotunda gap between doorway jamb and pier i=1 / i=11
      const flank = new THREE.Mesh(flankWallGeo, stoneMat);
      flank.position.set(side * 4.55, 1.18, -0.45);
      flank.rotation.y = side * -0.24;
      flank.receiveShadow = true;
      archGroup.add(flank);
      this._cameraColliders.push(flank);
      this._pillarMeshes.push(flank);
    });

    const { group: lintelObj, mainMesh: lintelMesh } =
      ToonAssets.createOutlinedMesh(archLintelGeo, stoneMat, 1.03, true);
    lintelObj.position.set(0, cfg.southArchwayHeight + 0.32, 0);
    archGroup.add(lintelObj);
    this._cameraColliders.push(lintelMesh);

    // Pointed Gothic crystal crown framing the southern doorway
    const crownCurveL = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-cfg.southArchwayHalfWidth, cfg.southArchwayHeight - 1.1, 0),
      new THREE.Vector3(-cfg.southArchwayHalfWidth * 0.52, cfg.southArchwayHeight + 0.1, 0),
      new THREE.Vector3(0, cfg.southArchwayHeight + 0.82, 0),
    ]);
    const crownCurveR = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cfg.southArchwayHalfWidth, cfg.southArchwayHeight - 1.1, 0),
      new THREE.Vector3(cfg.southArchwayHalfWidth * 0.52, cfg.southArchwayHeight + 0.1, 0),
      new THREE.Vector3(0, cfg.southArchwayHeight + 0.82, 0),
    ]);
    archGroup.add(
      new THREE.Mesh(
        this.trackGeo(new THREE.TubeGeometry(crownCurveL, 12, 0.16, 6, false)),
        pierMat,
      ),
      new THREE.Mesh(
        this.trackGeo(new THREE.TubeGeometry(crownCurveR, 12, 0.16, 6, false)),
        pierMat,
      ),
    );

    // Progressive Shimmering Violet Ward Seal across the southern archway
    this.galleryWardGroup = new THREE.Group();
    this.galleryWardGroup.position.set(0, cfg.southArchwayHeight * 0.48, 0.05);

    this.galleryWardMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.glowViolet,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const wardPlane = new THREE.Mesh(
      this.trackGeo(
        new THREE.PlaneGeometry(
          cfg.southArchwayHalfWidth * 2,
          cfg.southArchwayHeight - 0.25,
        ),
      ),
      this.galleryWardMat,
    );
    this.galleryWardGroup.add(wardPlane);

    const wardSigilOuter = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(1.15, 1.28, 28)),
      violetTrimMat,
    );
    const wardSigilInner = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.62, 0.72, 6)),
      violetTrimMat,
    );
    const wardBarGeo = this.trackGeo(
      new THREE.BoxGeometry(cfg.southArchwayHalfWidth * 1.9, 0.08, 0.06),
    );
    const wardBar1 = new THREE.Mesh(wardBarGeo, violetTrimMat);
    wardBar1.rotation.z = 0.46;
    const wardBar2 = new THREE.Mesh(wardBarGeo, violetTrimMat);
    wardBar2.rotation.z = -0.46;
    this.galleryWardGroup.add(wardSigilOuter, wardSigilInner, wardBar1, wardBar2);

    archGroup.add(this.galleryWardGroup);
    this.root.add(archGroup);

    // -----------------------------------------------------------------------
    // 2. Velvet-Carpeted Obsidian Stone Bridge (z = 11.5..18.5)
    // -----------------------------------------------------------------------
    const bridgeCenterZ = (cfg.bridgeVisualStartZ + cfg.bridgeVisualEndZ) * 0.5;
    const bridgeLength = cfg.bridgeVisualEndZ - cfg.bridgeVisualStartZ + 1.4;
    const bridgeSlabGeo = this.trackGeo(
      new THREE.BoxGeometry(cfg.bridgeWallHalfSpan * 2 + 0.5, 0.8, bridgeLength),
    );
    const bridgeSlab = new THREE.Mesh(bridgeSlabGeo, stoneMat);
    bridgeSlab.position.set(0, -0.4, bridgeCenterZ);
    bridgeSlab.receiveShadow = true;
    this.root.add(bridgeSlab);

    // Continuous royal-plum velvet runner from main rotunda south rim -> bridge -> Marina's dais
    const southRunnerStartZ = LOBBY_CONFIG.runnerStartRadius;
    const southRunnerEndZ = cfg.marinaDaisPos.z - cfg.daisRadius - 0.15;
    const southRunnerLen = southRunnerEndZ - southRunnerStartZ;
    const southRunnerMidZ = (southRunnerStartZ + southRunnerEndZ) * 0.5;

    const southCarpet = new THREE.Mesh(
      this.trackGeo(
        new THREE.PlaneGeometry(LOBBY_CONFIG.runnerWidth, southRunnerLen),
      ),
      velvetMat,
    );
    southCarpet.rotation.x = -Math.PI / 2;
    southCarpet.position.set(0, 0.016, southRunnerMidZ);
    southCarpet.receiveShadow = true;
    this.root.add(southCarpet);

    const southBorder = new THREE.Mesh(
      this.trackGeo(
        new THREE.PlaneGeometry(LOBBY_CONFIG.runnerBorderWidth, southRunnerLen),
      ),
      violetTrimMat,
    );
    southBorder.rotation.x = -Math.PI / 2;
    southBorder.position.set(0, 0.012, southRunnerMidZ);
    this.root.add(southBorder);

    // Bridge side balustrades, inward-facing camera collider walls & 3 Gothic crystal ribs
    const balustradeGeo = this.trackGeo(
      new THREE.BoxGeometry(0.45, 1.35, bridgeLength),
    );
    const bridgeCamWallGeo = this.trackGeo(
      new THREE.PlaneGeometry(bridgeLength, cfg.bridgeWallHeight),
    );
    const bridgeCamWallMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.sanctumStone,
        transparent: true,
        opacity: 0.0,
        side: THREE.FrontSide,
        depthWrite: false,
      }),
    );

    sides.forEach((side) => {
      const wallX = side * cfg.bridgeWallHalfSpan;
      const { group: balObj, mainMesh: balMesh } =
        ToonAssets.createOutlinedMesh(balustradeGeo, darkObsidianMat, 1.03, true);
      balObj.position.set(wallX, 0.675, bridgeCenterZ);
      this.root.add(balObj);
      this._cameraColliders.push(balMesh);
      this._pillarMeshes.push(balMesh);

      const trimStrip = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.08, 0.06, bridgeLength - 0.2)),
        violetTrimMat,
      );
      trimStrip.position.set(wallX - side * 0.22, 1.38, bridgeCenterZ);
      this.root.add(trimStrip);

      // Inward-facing full-height bridge wall collider plane so spring-arm camera stays inside bridge
      const camWall = new THREE.Mesh(bridgeCamWallGeo, bridgeCamWallMat);
      camWall.position.set(wallX - side * 0.12, cfg.bridgeWallHeight * 0.5, bridgeCenterZ);
      camWall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.root.add(camWall);
      this._cameraColliders.push(camWall);
    });

    const bridgeRibCurveL = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-cfg.bridgeWallHalfSpan, 1.3, 0),
      new THREE.Vector3(-cfg.bridgeWallHalfSpan * 0.72, 4.15, 0),
      new THREE.Vector3(0, cfg.bridgeWallHeight, 0),
    ]);
    const bridgeRibCurveR = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cfg.bridgeWallHalfSpan, 1.3, 0),
      new THREE.Vector3(cfg.bridgeWallHalfSpan * 0.72, 4.15, 0),
      new THREE.Vector3(0, cfg.bridgeWallHeight, 0),
    ]);
    const bridgeRibGeoL = this.trackGeo(
      new THREE.TubeGeometry(bridgeRibCurveL, 12, 0.14, 6, false),
    );
    const bridgeRibGeoR = this.trackGeo(
      new THREE.TubeGeometry(bridgeRibCurveR, 12, 0.14, 6, false),
    );
    const ribCrystalGeo = this.trackGeo(new THREE.OctahedronGeometry(0.18, 0));

    for (let i = 0; i < cfg.bridgeArchCount; i++) {
      const t = (i + 0.5) / cfg.bridgeArchCount;
      const rz = THREE.MathUtils.lerp(
        cfg.bridgeVisualStartZ + 0.6,
        cfg.bridgeVisualEndZ - 0.6,
        t,
      );
      const ribGroup = new THREE.Group();
      ribGroup.position.set(0, 0, rz);
      ribGroup.add(
        new THREE.Mesh(bridgeRibGeoL, pierMat),
        new THREE.Mesh(bridgeRibGeoR, pierMat),
      );
      const keyStone = new THREE.Mesh(ribCrystalGeo, violetTrimMat);
      keyStone.position.y = cfg.bridgeWallHeight;
      ribGroup.add(keyStone);
      this.root.add(ribGroup);
    }

    // -----------------------------------------------------------------------
    // 3. Circular Siphon Gallery (radius 7.2, centered at z = 24.5)
    // -----------------------------------------------------------------------
    const galleryGroup = new THREE.Group();
    galleryGroup.position.set(0, 0, cfg.galleryCenterZ);

    const galFloorR = cfg.galleryOuterWallRadius;
    const galFloorGeo = this.trackGeo(
      new THREE.CylinderGeometry(galFloorR, galFloorR + 0.25, 0.8, 40),
    );
    const galFloorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: PALETTE.sanctumStone,
        emissive: new THREE.Color(PALETTE.royalIndigo),
        emissiveIntensity: 0.22,
        roughness: 0.26,
        metalness: 0.28,
      }),
    );
    const galFloor = new THREE.Mesh(galFloorGeo, galFloorMat);
    galFloor.position.y = -0.4;
    galFloor.receiveShadow = true;
    galleryGroup.add(galFloor);

    // Decorative floor rune circle framing the gallery center
    const galOuterRune = new THREE.Mesh(
      this.trackGeo(
        new THREE.RingGeometry(
          cfg.galleryRadius - 0.45,
          cfg.galleryRadius - 0.32,
          48,
        ),
      ),
      violetTrimMat,
    );
    galOuterRune.rotation.x = -Math.PI / 2;
    galOuterRune.position.y = 0.015;
    galleryGroup.add(galOuterRune);

    // 8 Vaulted Gothic Stone-and-Crystal Arches around the Gallery perimeter
    const galArchCount = cfg.galleryArchCount;
    const galWallH = cfg.galleryWallHeight;
    const galPierGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.36, 0.46, galWallH, 6),
    );
    const galBayArcLen = ((2 * Math.PI * galFloorR) / galArchCount) * 0.95;
    const galWallPanelGeo = this.trackGeo(
      new THREE.BoxGeometry(galBayArcLen, 2.6, 0.42),
    );
    const galUpperColliderGeo = this.trackGeo(
      new THREE.PlaneGeometry(galBayArcLen * 1.05, galWallH),
    );
    const galRibCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 4.4, galFloorR - 0.25),
      new THREE.Vector3(0, galWallH - 0.6, galFloorR * 0.56),
      new THREE.Vector3(0, galWallH + 0.4, 1.9),
    ]);
    const galRibGeo = this.trackGeo(
      new THREE.TubeGeometry(galRibCurve, 12, 0.14, 6, false),
    );

    for (let i = 0; i < galArchCount; i++) {
      const ang = (i / galArchCount) * Math.PI * 2;
      const gx = Math.sin(ang) * galFloorR;
      const gz = Math.cos(ang) * galFloorR;

      // Skip the dead-north pier (i === galArchCount / 2, angle = PI) where the bridge connects
      if (i !== galArchCount / 2) {
        const pGroup = new THREE.Group();
        pGroup.position.set(gx, 0, gz);
        pGroup.lookAt(0, 0, 0);

        const { group: pierObj, mainMesh: pierMesh } =
          ToonAssets.createOutlinedMesh(
            galPierGeo,
            stoneMat,
            { x: 1.06, y: 1.01, z: 1.06 },
            true,
          );
        pierObj.position.y = galWallH * 0.5;
        pGroup.add(pierObj);

        const crystalRib = new THREE.Mesh(galRibGeo, crystalGlassMat);
        crystalRib.rotation.y = ang;
        galleryGroup.add(crystalRib);

        galleryGroup.add(pGroup);
        this._cameraColliders.push(pierMesh);
        this._pillarMeshes.push(pierMesh);
        this._pillarColliders.push({
          x: gx,
          z: cfg.galleryCenterZ + gz,
          radius: cfg.galleryPierCollisionRadius,
          height: galWallH,
        });
      }

      // Wall bays (skip the 2 northern bays directly flanking the bridge opening)
      const midAng = ((i + 0.5) / galArchCount) * Math.PI * 2;
      const isNorthEntranceBay =
        i === galArchCount / 2 - 1 || i === galArchCount / 2;
      if (!isNorthEntranceBay) {
        const bx = Math.sin(midAng) * galFloorR;
        const bz = Math.cos(midAng) * galFloorR;
        const bGroup = new THREE.Group();
        bGroup.position.set(bx, 0, bz);
        bGroup.lookAt(0, 0, 0);

        const panel = new THREE.Mesh(galWallPanelGeo, inwardWallMat);
        panel.position.y = 1.3;
        panel.receiveShadow = true;
        bGroup.add(panel);
        this._cameraColliders.push(panel);
        this._pillarMeshes.push(panel);

        // Full-height inward-facing collider plane preventing camera clip through arched openings
        const camPane = new THREE.Mesh(galUpperColliderGeo, bridgeCamWallMat);
        camPane.position.set(0, galWallH * 0.5, 0.25);
        bGroup.add(camPane);
        this._cameraColliders.push(camPane);

        galleryGroup.add(bGroup);
      }
    }

    // Overhead Gallery Vaulted Crown & Oculus Ring
    const galCrownRing = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(galFloorR - 0.15, 0.34, 8, 36)),
      stoneMat,
    );
    galCrownRing.rotation.x = Math.PI / 2;
    galCrownRing.position.y = galWallH;
    galleryGroup.add(galCrownRing);

    const galOculusRing = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(1.9, 0.14, 8, 28)),
      violetTrimMat,
    );
    galOculusRing.rotation.x = Math.PI / 2;
    galOculusRing.position.y = galWallH + 0.4;
    galleryGroup.add(galOculusRing);

    // 4 Cold-Flame Braziers illuminating the Siphon Gallery when unlocked
    const brazierPositions = [
      { x: -2.4, z: -5.4 },
      { x: 2.4, z: -5.4 },
      { x: -4.1, z: 3.4 },
      { x: 4.1, z: 3.4 },
    ];
    const brazierStandGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.18, 0.34, 1.25, 6),
    );
    const brazierBowlGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.42, 0.2, 0.32, 8),
    );
    const coldFlameGeo = this.trackGeo(new THREE.ConeGeometry(0.24, 0.68, 6));
    const coldFlameMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.coldFlame,
        transparent: true,
        opacity: 0.9,
      }),
    );

    brazierPositions.forEach((bp, idx) => {
      const bg = new THREE.Group();
      bg.position.set(bp.x, 0, bp.z);

      const { group: standObj } = ToonAssets.createOutlinedMesh(
        brazierStandGeo,
        darkObsidianMat,
        1.05,
        true,
      );
      standObj.position.y = 0.625;
      bg.add(standObj);

      const { group: bowlObj } = ToonAssets.createOutlinedMesh(
        brazierBowlGeo,
        pierMat,
        1.05,
        true,
      );
      bowlObj.position.y = 1.36;
      bg.add(bowlObj);

      const flame = new THREE.Mesh(coldFlameGeo, coldFlameMat);
      flame.position.y = 1.78;
      bg.add(flame);

      const light = new THREE.PointLight(
        PALETTE.coldFlame,
        cfg.brazierLightIntensity,
        cfg.brazierLightDistance,
        1.7,
      );
      light.position.y = 2.05;
      bg.add(light);

      galleryGroup.add(bg);
      this.galleryBraziers.push({
        flameMesh: flame,
        light,
        phase: idx * 1.45,
      });
    });

    this.root.add(galleryGroup);

    // -----------------------------------------------------------------------
    // 4. Shared Arcane Rune-Cuff Builder & Right Alcove III (Captive Miku)
    // -----------------------------------------------------------------------
    const dormantSealGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.92, 0.92, 2.35, 16, 1, true),
    );

    // Shared Arcane Rune-Cuff material & geometry across all 3 captive alcoves
    this.cuffMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.glowViolet,
      }),
    );
    const cuffGeo = this.trackGeo(
      new THREE.TorusGeometry(cfg.wristCuffRadius, cfg.wristCuffTube, 8, 16),
    );
    const cuffPipGeo = this.trackGeo(new THREE.OctahedronGeometry(0.022, 0));

    const attachWristCuff = (anchor: THREE.Object3D): void => {
      const cuffGroup = new THREE.Group();
      const ring = new THREE.Mesh(cuffGeo, this.cuffMat!);
      ring.rotation.x = Math.PI / 2;
      cuffGroup.add(ring);

      for (let p = 0; p < 4; p++) {
        const pa = (p / 4) * Math.PI * 2;
        const pip = new THREE.Mesh(cuffPipGeo, this.cuffMat!);
        pip.position.set(
          Math.cos(pa) * (cfg.wristCuffRadius + 0.015),
          0,
          Math.sin(pa) * (cfg.wristCuffRadius + 0.015),
        );
        cuffGroup.add(pip);
      }
      anchor.add(cuffGroup);
    };

    // -----------------------------------------------------------------------
    // 4A. Right Alcove III — Harmonic Stage Velvet Dais, Captive Miku & Harmonic Reservoir
    // -----------------------------------------------------------------------
    this.mikuDaisGroup = new THREE.Group();
    this.mikuDaisGroup.position.set(
      cfg.mikuDaisPos.x,
      cfg.mikuDaisPos.y,
      cfg.mikuDaisPos.z,
    );

    const mDaisTier1Geo = this.trackGeo(
      new THREE.CylinderGeometry(
        cfg.mikuDaisRadius,
        cfg.mikuDaisRadius + 0.18,
        cfg.daisHeight * 0.55,
        24,
      ),
    );
    const { group: mikuDais1 } = ToonAssets.createOutlinedMesh(
      mDaisTier1Geo,
      darkObsidianMat,
      1.025,
      true,
    );
    mikuDais1.position.y = cfg.daisHeight * 0.275;
    this.mikuDaisGroup.add(mikuDais1);

    const mDaisTier2Geo = this.trackGeo(
      new THREE.CylinderGeometry(
        cfg.mikuDaisRadius - 0.16,
        cfg.mikuDaisRadius - 0.08,
        cfg.daisHeight * 0.45,
        24,
      ),
    );
    const { group: mikuDais2 } = ToonAssets.createOutlinedMesh(
      mDaisTier2Geo,
      velvetMat,
      1.025,
      true,
    );
    mikuDais2.position.y = cfg.daisHeight * 0.775;
    this.mikuDaisGroup.add(mikuDais2);

    // Dormant emerald ward seal shown while Miku has not yet been defeated
    const rightSealMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.harmonicEmerald,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.mikuDormantSeal = new THREE.Mesh(dormantSealGeo, rightSealMat);
    this.mikuDormantSeal.position.y = cfg.daisHeight + 1.18;
    this.mikuDaisGroup.add(this.mikuDormantSeal);

    // Active Harmonic Stage Trim & Captive Miku Alcove Group (shown when mikuDefeated === true)
    this.mikuActiveGroup = new THREE.Group();
    this.mikuDaisGroup.add(this.mikuActiveGroup);

    // Obsidian-and-neon stage deck inlays (emerald outer ring + magenta inner equalizer accent)
    this.mikuStageRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.harmonicEmerald,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      }),
    );
    const mikuStageRim = new THREE.Mesh(
      this.trackGeo(
        new THREE.TorusGeometry(cfg.mikuDaisRadius - 0.22, 0.045, 8, 28),
      ),
      this.mikuStageRingMat,
    );
    mikuStageRim.rotation.x = Math.PI / 2;
    mikuStageRim.position.y = cfg.daisHeight + 0.025;
    this.mikuActiveGroup.add(mikuStageRim);

    const mikuMagentaAccentMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.harmonicMagenta,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      }),
    );
    const mikuStageInnerRing = new THREE.Mesh(
      this.trackGeo(
        new THREE.RingGeometry(
          cfg.mikuDaisRadius - 0.56,
          cfg.mikuDaisRadius - 0.48,
          28,
        ),
      ),
      mikuMagentaAccentMat,
    );
    mikuStageInnerRing.rotation.x = -Math.PI / 2;
    mikuStageInnerRing.position.y = cfg.daisHeight + 0.015;
    this.mikuActiveGroup.add(mikuStageInnerRing);

    // 12-Segment Diegetic Harmonic Core Floor Rune Ring around Miku's Dais
    const mikuSegCount = cfg.runeSegmentCount;
    const mikuSegArc = ((Math.PI * 2) / mikuSegCount) * 0.78;
    for (let i = 0; i < mikuSegCount; i++) {
      const startAngle = (i / mikuSegCount) * Math.PI * 2 - Math.PI * 0.5;
      const segGeo = this.trackGeo(
        new THREE.RingGeometry(
          cfg.mikuRuneRingInnerRadius,
          cfg.mikuRuneRingOuterRadius,
          6,
          1,
          startAngle,
          mikuSegArc,
        ),
      );
      const segMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: PALETTE.harmonicEmerald,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
        }),
      );
      const segMesh = new THREE.Mesh(segGeo, segMat);
      segMesh.rotation.x = -Math.PI / 2;
      segMesh.position.y = 0.022;
      this.mikuDaisGroup.add(segMesh);
      this.mikuDaisRuneSegments.push(segMat);
    }

    // Dedicated Captive MikuRig mounted on the harmonic stage dais facing into the Siphon Gallery
    this._captiveMikuRig = new MikuRig(this.mikuDaisGroup);
    this._captiveMikuRig.root.position.set(0, cfg.daisHeight, 0);
    this._captiveMikuRig.root.rotation.set(0, cfg.mikuFacingYaw, 0);
    attachWristCuff(this._captiveMikuRig.leftWristAnchor);
    attachWristCuff(this._captiveMikuRig.rightWristAnchor);

    // Oriented peripheral frame matching Miku's facing direction for twin tuning conduits & Harmonic Reservoir
    const mikuPeripherals = new THREE.Group();
    mikuPeripherals.rotation.y = cfg.mikuFacingYaw - Math.PI;
    this.mikuActiveGroup.add(mikuPeripherals);

    const tuningShaftMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.abyssalCloak, {
        emissive: PALETTE.harmonicEmerald,
        emissiveIntensity: 0.22,
      }),
    );
    const tuningEmeraldMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.harmonicEmerald, {
        emissive: PALETTE.harmonicEmerald,
        emissiveIntensity: 0.72,
      }),
    );
    const tuningMagentaMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.harmonicMagenta, {
        emissive: PALETTE.harmonicMagenta,
        emissiveIntensity: 0.72,
      }),
    );
    const tuningConduitGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.11, 0.2, cfg.conduitHeight * 0.72, 6),
    );
    const tuningProngGeo = this.trackGeo(new THREE.BoxGeometry(0.055, 0.34, 0.055));

    sides.forEach((side) => {
      const cg = new THREE.Group();
      cg.position.set(
        side * cfg.mikuConduitOffsetX,
        cfg.daisHeight,
        cfg.mikuConduitOffsetZ,
      );

      const { group: shaft } = ToonAssets.createOutlinedMesh(
        tuningConduitGeo,
        tuningShaftMat,
        1.06,
        true,
      );
      shaft.position.y = cfg.conduitHeight * 0.36;
      cg.add(shaft);

      // Twin emerald/magenta tuning prongs crowning each conduit pylon
      const tipMat = side > 0 ? tuningEmeraldMat : tuningMagentaMat;
      for (const prongSide of [-1, 1]) {
        const prong = new THREE.Mesh(tuningProngGeo, tipMat);
        prong.position.set(
          prongSide * 0.085,
          cfg.conduitTipY - cfg.daisHeight + 0.04,
          0,
        );
        cg.add(prong);
      }

      const tipNode = new THREE.Mesh(
        this.trackGeo(new THREE.OctahedronGeometry(0.11, 0)),
        side > 0 ? tuningMagentaMat : tuningEmeraldMat,
      );
      tipNode.position.y = cfg.conduitTipY - cfg.daisHeight;
      cg.add(tipNode);

      const tipAnchor = new THREE.Object3D();
      tipAnchor.position.y = cfg.conduitTipY - cfg.daisHeight;
      cg.add(tipAnchor);

      if (side > 0) {
        this.mikuLeftConduitTip = tipAnchor;
      } else {
        this.mikuRightConduitTip = tipAnchor;
      }
      mikuPeripherals.add(cg);
    });

    // Vertical Harmonic Core Reservoir Crystal beside Miku's stage dais
    const mResGroup = new THREE.Group();
    mResGroup.position.set(
      cfg.mikuReservoirOffsetX,
      0,
      cfg.mikuReservoirOffsetZ,
    );

    const mResPedestalGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.4, 0.54, 0.42, 6),
    );
    const { group: mResBase } = ToonAssets.createOutlinedMesh(
      mResPedestalGeo,
      tuningShaftMat,
      1.05,
      true,
    );
    mResBase.position.y = 0.21;
    mResGroup.add(mResBase);

    const mResHousingGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.32, 0.34, cfg.reservoirHeight, 6, 1, true),
    );
    const mResHousing = new THREE.Mesh(mResHousingGeo, crystalGlassMat);
    mResHousing.position.y = 0.42 + cfg.reservoirHeight * 0.5;
    mResGroup.add(mResHousing);

    const mStrutGeo = this.trackGeo(
      new THREE.BoxGeometry(0.06, cfg.reservoirHeight + 0.12, 0.06),
    );
    for (let s = 0; s < 3; s++) {
      const sa = (s / 3) * Math.PI * 2;
      const strut = new THREE.Mesh(mStrutGeo, pierMat);
      strut.position.set(
        Math.cos(sa) * 0.35,
        0.42 + cfg.reservoirHeight * 0.5,
        Math.sin(sa) * 0.35,
      );
      mResGroup.add(strut);
    }

    const mResCoreGeo = this.trackGeo(
      new THREE.CylinderGeometry(
        cfg.reservoirCoreRadius,
        cfg.reservoirCoreRadius,
        cfg.reservoirHeight - 0.14,
        8,
      ),
    );
    mResCoreGeo.translate(0, (cfg.reservoirHeight - 0.14) * 0.5, 0);

    this.mikuReservoirCoreMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.harmonicEmerald, {
        emissive: PALETTE.harmonicEmerald,
        emissiveIntensity: 0.9,
      }),
    );
    this.mikuReservoirCoreMesh = new THREE.Mesh(
      mResCoreGeo,
      this.mikuReservoirCoreMat,
    );
    this.mikuReservoirCoreMesh.position.y = 0.46;
    mResGroup.add(this.mikuReservoirCoreMesh);

    const mResCapGeo = this.trackGeo(new THREE.ConeGeometry(0.36, 0.62, 6));
    const { group: mResCap } = ToonAssets.createOutlinedMesh(
      mResCapGeo,
      tuningShaftMat,
      1.05,
      true,
    );
    mResCap.position.y = 0.42 + cfg.reservoirHeight + 0.31;
    mResGroup.add(mResCap);

    this.mikuReservoirLight = new THREE.PointLight(
      PALETTE.harmonicEmerald,
      cfg.reservoirLightIntensity,
      cfg.reservoirLightDistance,
      1.7,
    );
    this.mikuReservoirLight.position.set(
      0,
      0.42 + cfg.reservoirHeight * 0.55,
      0,
    );
    mResGroup.add(this.mikuReservoirLight);
    mikuPeripherals.add(mResGroup);

    this.root.add(this.mikuDaisGroup);
    this._pillarColliders.push({
      x: cfg.mikuDaisPos.x,
      z: cfg.mikuDaisPos.z,
      radius: cfg.daisCollisionRadius,
      height: 2.2,
    });

    // -----------------------------------------------------------------------
    // 4B. Left Alcove II — Enchanted Tide-Pool Velvet Dais, Captive Serena & Tidal Reservoir
    // -----------------------------------------------------------------------
    this.serenaDaisGroup = new THREE.Group();
    this.serenaDaisGroup.position.set(
      cfg.serenaDaisPos.x,
      cfg.serenaDaisPos.y,
      cfg.serenaDaisPos.z,
    );

    const sDaisTier1Geo = this.trackGeo(
      new THREE.CylinderGeometry(
        cfg.serenaDaisRadius,
        cfg.serenaDaisRadius + 0.18,
        cfg.daisHeight * 0.55,
        24,
      ),
    );
    const { group: sDais1 } = ToonAssets.createOutlinedMesh(
      sDaisTier1Geo,
      darkObsidianMat,
      1.025,
      true,
    );
    sDais1.position.y = cfg.daisHeight * 0.275;
    this.serenaDaisGroup.add(sDais1);

    const sDaisTier2Geo = this.trackGeo(
      new THREE.CylinderGeometry(
        cfg.serenaDaisRadius - 0.16,
        cfg.serenaDaisRadius - 0.08,
        cfg.daisHeight * 0.45,
        24,
      ),
    );
    const { group: sDais2 } = ToonAssets.createOutlinedMesh(
      sDaisTier2Geo,
      velvetMat,
      1.025,
      true,
    );
    sDais2.position.y = cfg.daisHeight * 0.775;
    this.serenaDaisGroup.add(sDais2);

    // Dormant teal ward seal shown while Serena has not yet been defeated
    const leftSealMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.sunkenTeal,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.serenaDormantSeal = new THREE.Mesh(dormantSealGeo, leftSealMat);
    this.serenaDormantSeal.position.y = cfg.daisHeight + 1.18;
    this.serenaDaisGroup.add(this.serenaDormantSeal);

    // Active Tide-Pool & Captive Serena Alcove Group (shown when serenaDefeated === true)
    this.serenaActiveGroup = new THREE.Group();
    this.serenaDaisGroup.add(this.serenaActiveGroup);

    // Enchanted shallow bioluminescent tide-pool basin atop the velvet dais
    const tidePoolRimMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.seaStoneMid, {
        emissive: PALETTE.biolumCyan,
        emissiveIntensity: 0.24,
      }),
    );
    const tidePoolRim = new THREE.Mesh(
      this.trackGeo(
        new THREE.TorusGeometry(cfg.serenaDaisRadius - 0.24, 0.065, 8, 28),
      ),
      tidePoolRimMat,
    );
    tidePoolRim.rotation.x = Math.PI / 2;
    tidePoolRim.position.y = cfg.daisHeight + 0.02;
    this.serenaActiveGroup.add(tidePoolRim);

    this.serenaPoolMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.biolumCyan,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.serenaPoolMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CircleGeometry(cfg.serenaDaisRadius - 0.25, 28)),
      this.serenaPoolMat,
    );
    this.serenaPoolMesh.rotation.x = -Math.PI / 2;
    this.serenaPoolMesh.position.y = cfg.serenaPoolSurfaceY;
    this.serenaActiveGroup.add(this.serenaPoolMesh);

    // 12-Segment Diegetic Tidal Core Floor Rune Ring around Serena's Dais
    const serenaSegCount = cfg.runeSegmentCount;
    const serenaSegArc = ((Math.PI * 2) / serenaSegCount) * 0.78;
    for (let i = 0; i < serenaSegCount; i++) {
      const startAngle = (i / serenaSegCount) * Math.PI * 2 - Math.PI * 0.5;
      const segGeo = this.trackGeo(
        new THREE.RingGeometry(
          cfg.serenaRuneRingInnerRadius,
          cfg.serenaRuneRingOuterRadius,
          6,
          1,
          startAngle,
          serenaSegArc,
        ),
      );
      const segMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: PALETTE.biolumCyan,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
        }),
      );
      const segMesh = new THREE.Mesh(segGeo, segMat);
      segMesh.rotation.x = -Math.PI / 2;
      segMesh.position.y = 0.022;
      this.serenaDaisGroup.add(segMesh);
      this.serenaDaisRuneSegments.push(segMat);
    }

    // Dedicated Captive SerenaRig mounted on the tide-pool dais facing into the Siphon Gallery
    this._captiveSerenaRig = new SerenaRig(this.serenaDaisGroup);
    this._captiveSerenaRig.root.position.set(0, cfg.daisHeight, 0);
    this._captiveSerenaRig.root.rotation.set(0, cfg.serenaFacingYaw, 0);
    attachWristCuff(this._captiveSerenaRig.leftWristAnchor);
    attachWristCuff(this._captiveSerenaRig.rightWristAnchor);

    // Oriented peripheral frame matching Serena's facing direction for twin pearl conduits & Tidal Reservoir
    const serenaPeripherals = new THREE.Group();
    serenaPeripherals.rotation.y = cfg.serenaFacingYaw - Math.PI;
    this.serenaActiveGroup.add(serenaPeripherals);

    const pearlOrbMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.serenaPearl, {
        emissive: PALETTE.biolumCyan,
        emissiveIntensity: 0.65,
      }),
    );
    const pearlConduitShaftMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.seaStoneDark, {
        emissive: PALETTE.biolumCyan,
        emissiveIntensity: 0.16,
      }),
    );
    const pearlConduitGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.13, 0.22, cfg.conduitHeight * 0.72, 8),
    );
    const pearlTipGeo = this.trackGeo(new THREE.SphereGeometry(0.16, 14, 12));

    sides.forEach((side) => {
      const cg = new THREE.Group();
      cg.position.set(
        side * cfg.serenaConduitOffsetX,
        cfg.daisHeight,
        cfg.serenaConduitOffsetZ,
      );

      const { group: shaft } = ToonAssets.createOutlinedMesh(
        pearlConduitGeo,
        pearlConduitShaftMat,
        1.06,
        true,
      );
      shaft.position.y = cfg.conduitHeight * 0.36;
      cg.add(shaft);

      const pearlOrb = new THREE.Mesh(pearlTipGeo, pearlOrbMat);
      pearlOrb.position.y = cfg.conduitTipY - cfg.daisHeight;
      cg.add(pearlOrb);

      const tipAnchor = new THREE.Object3D();
      tipAnchor.position.y = cfg.conduitTipY - cfg.daisHeight;
      cg.add(tipAnchor);

      if (side > 0) {
        this.serenaLeftConduitTip = tipAnchor;
      } else {
        this.serenaRightConduitTip = tipAnchor;
      }
      serenaPeripherals.add(cg);
    });

    // Vertical Tidal Core Reservoir Crystal beside Serena's tide-pool dais
    const sResGroup = new THREE.Group();
    sResGroup.position.set(
      cfg.serenaReservoirOffsetX,
      0,
      cfg.serenaReservoirOffsetZ,
    );

    const sResPedestalGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.4, 0.54, 0.42, 6),
    );
    const { group: sResBase } = ToonAssets.createOutlinedMesh(
      sResPedestalGeo,
      pearlConduitShaftMat,
      1.05,
      true,
    );
    sResBase.position.y = 0.21;
    sResGroup.add(sResBase);

    const sResHousingGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.32, 0.34, cfg.reservoirHeight, 6, 1, true),
    );
    const sResHousing = new THREE.Mesh(sResHousingGeo, crystalGlassMat);
    sResHousing.position.y = 0.42 + cfg.reservoirHeight * 0.5;
    sResGroup.add(sResHousing);

    const sStrutGeo = this.trackGeo(
      new THREE.BoxGeometry(0.06, cfg.reservoirHeight + 0.12, 0.06),
    );
    for (let s = 0; s < 3; s++) {
      const sa = (s / 3) * Math.PI * 2;
      const strut = new THREE.Mesh(sStrutGeo, pierMat);
      strut.position.set(
        Math.cos(sa) * 0.35,
        0.42 + cfg.reservoirHeight * 0.5,
        Math.sin(sa) * 0.35,
      );
      sResGroup.add(strut);
    }

    const sResCoreGeo = this.trackGeo(
      new THREE.CylinderGeometry(
        cfg.reservoirCoreRadius,
        cfg.reservoirCoreRadius,
        cfg.reservoirHeight - 0.14,
        8,
      ),
    );
    sResCoreGeo.translate(0, (cfg.reservoirHeight - 0.14) * 0.5, 0);

    this.serenaReservoirCoreMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.biolumCyan, {
        emissive: PALETTE.biolumCyan,
        emissiveIntensity: 0.9,
      }),
    );
    this.serenaReservoirCoreMesh = new THREE.Mesh(
      sResCoreGeo,
      this.serenaReservoirCoreMat,
    );
    this.serenaReservoirCoreMesh.position.y = 0.46;
    sResGroup.add(this.serenaReservoirCoreMesh);

    const sResCapGeo = this.trackGeo(new THREE.ConeGeometry(0.36, 0.62, 6));
    const { group: sResCap } = ToonAssets.createOutlinedMesh(
      sResCapGeo,
      pearlConduitShaftMat,
      1.05,
      true,
    );
    sResCap.position.y = 0.42 + cfg.reservoirHeight + 0.31;
    sResGroup.add(sResCap);

    this.serenaReservoirLight = new THREE.PointLight(
      PALETTE.biolumCyan,
      cfg.reservoirLightIntensity,
      cfg.reservoirLightDistance,
      1.7,
    );
    this.serenaReservoirLight.position.set(
      0,
      0.42 + cfg.reservoirHeight * 0.55,
      0,
    );
    sResGroup.add(this.serenaReservoirLight);
    serenaPeripherals.add(sResGroup);

    this.root.add(this.serenaDaisGroup);
    this._pillarColliders.push({
      x: cfg.serenaDaisPos.x,
      z: cfg.serenaDaisPos.z,
      radius: cfg.daisCollisionRadius,
      height: 2.2,
    });

    // -----------------------------------------------------------------------
    // 5. Center-South Marina Velvet Dais, Captive MarinaRig & Cryo Reservoir
    // -----------------------------------------------------------------------
    this.marinaDaisGroup = new THREE.Group();
    this.marinaDaisGroup.position.set(
      cfg.marinaDaisPos.x,
      cfg.marinaDaisPos.y,
      cfg.marinaDaisPos.z,
    );

    const daisTier1Geo = this.trackGeo(
      new THREE.CylinderGeometry(
        cfg.daisRadius,
        cfg.daisRadius + 0.2,
        cfg.daisHeight * 0.55,
        24,
      ),
    );
    const { group: mDais1 } = ToonAssets.createOutlinedMesh(
      daisTier1Geo,
      darkObsidianMat,
      1.025,
      true,
    );
    mDais1.position.y = cfg.daisHeight * 0.275;
    this.marinaDaisGroup.add(mDais1);

    const daisTier2Geo = this.trackGeo(
      new THREE.CylinderGeometry(
        cfg.daisRadius - 0.18,
        cfg.daisRadius - 0.1,
        cfg.daisHeight * 0.45,
        24,
      ),
    );
    const { group: mDais2 } = ToonAssets.createOutlinedMesh(
      daisTier2Geo,
      velvetMat,
      1.025,
      true,
    );
    mDais2.position.y = cfg.daisHeight * 0.775;
    this.marinaDaisGroup.add(mDais2);

    // Front approach step facing north toward the bridge
    const stepGeo = this.trackGeo(
      new THREE.BoxGeometry(1.75, cfg.daisHeight * 0.52, 0.55),
    );
    const { group: stepObj } = ToonAssets.createOutlinedMesh(
      stepGeo,
      darkObsidianMat,
      1.03,
      true,
    );
    stepObj.position.set(0, cfg.daisHeight * 0.26, -(cfg.daisRadius + 0.12));
    this.marinaDaisGroup.add(stepObj);

    // 12-Segment Diegetic Floor Rune Ring around Marina's Dais
    const segCount = cfg.runeSegmentCount;
    const segArc = ((Math.PI * 2) / segCount) * 0.78;
    for (let i = 0; i < segCount; i++) {
      const startAngle = (i / segCount) * Math.PI * 2 - Math.PI * 0.5;
      const segGeo = this.trackGeo(
        new THREE.RingGeometry(
          cfg.runeRingInnerRadius,
          cfg.runeRingOuterRadius,
          6,
          1,
          startAngle,
          segArc,
        ),
      );
      const segMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: PALETTE.frostRunes,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
        }),
      );
      const segMesh = new THREE.Mesh(segGeo, segMat);
      segMesh.rotation.x = -Math.PI / 2;
      segMesh.position.y = 0.022;
      this.marinaDaisGroup.add(segMesh);
      this.daisRuneSegments.push(segMat);
    }

    // Dedicated Captive MarinaRig mounted on the center-south velvet dais facing north
    this._captiveMarinaRig = new MarinaRig(this.marinaDaisGroup);
    this._captiveMarinaRig.root.position.set(0, cfg.daisHeight, 0);
    this._captiveMarinaRig.root.rotation.set(0, cfg.marinaFacingYaw, 0);

    attachWristCuff(this._captiveMarinaRig.leftWristAnchor);
    attachWristCuff(this._captiveMarinaRig.rightWristAnchor);

    // Twin Flanking Crystal Conduit Pylons tethering Marina's arcane rune-cuffs
    const conduitBaseGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.14, 0.24, cfg.conduitHeight * 0.72, 6),
    );
    const conduitCrystalGeo = this.trackGeo(
      new THREE.OctahedronGeometry(0.17, 0),
    );
    const conduitCrystalMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.glowViolet, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.7,
      }),
    );

    sides.forEach((side) => {
      const cg = new THREE.Group();
      cg.position.set(side * cfg.conduitOffsetX, cfg.daisHeight, cfg.conduitOffsetZ);

      const { group: shaft } = ToonAssets.createOutlinedMesh(
        conduitBaseGeo,
        darkObsidianMat,
        1.06,
        true,
      );
      shaft.position.y = cfg.conduitHeight * 0.36;
      cg.add(shaft);

      const tipCrystal = new THREE.Mesh(conduitCrystalGeo, conduitCrystalMat);
      tipCrystal.scale.set(0.8, 1.55, 0.8);
      tipCrystal.position.y = cfg.conduitTipY - cfg.daisHeight;
      cg.add(tipCrystal);

      const tipAnchor = new THREE.Object3D();
      tipAnchor.position.y = cfg.conduitTipY - cfg.daisHeight;
      cg.add(tipAnchor);

      // Note: Marina faces North (rotation.y = PI), so her local Left wrist is toward +X in world space
      if (side > 0) {
        this.leftConduitTip = tipAnchor;
      } else {
        this.rightConduitTip = tipAnchor;
      }

      this.marinaDaisGroup!.add(cg);
    });

    // Pulsing Royal-Violet Energy Tether Strands connecting each wrist cuff to its crystal conduit
    this.tetherMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.glowViolet,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const tetherGeo = this.trackGeo(
      new THREE.CylinderGeometry(cfg.tetherRadius, cfg.tetherRadius, 1.0, 6, 1, true),
    );
    this.leftTetherMesh = new THREE.Mesh(tetherGeo, this.tetherMat);
    this.rightTetherMesh = new THREE.Mesh(tetherGeo, this.tetherMat);
    this.serenaLeftTetherMesh = new THREE.Mesh(tetherGeo, this.tetherMat);
    this.serenaRightTetherMesh = new THREE.Mesh(tetherGeo, this.tetherMat);
    this.mikuLeftTetherMesh = new THREE.Mesh(tetherGeo, this.tetherMat);
    this.mikuRightTetherMesh = new THREE.Mesh(tetherGeo, this.tetherMat);
    this.root.add(
      this.leftTetherMesh,
      this.rightTetherMesh,
      this.serenaLeftTetherMesh,
      this.serenaRightTetherMesh,
      this.mikuLeftTetherMesh,
      this.mikuRightTetherMesh,
    );

    // Tall Vertical Cryo Core Reservoir Crystal mounted beside Marina's dais
    const resGroup = new THREE.Group();
    resGroup.position.set(cfg.reservoirOffsetX, 0, cfg.reservoirOffsetZ);

    const resPedestalGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.42, 0.56, 0.42, 6),
    );
    const { group: resBase } = ToonAssets.createOutlinedMesh(
      resPedestalGeo,
      darkObsidianMat,
      1.05,
      true,
    );
    resBase.position.y = 0.21;
    resGroup.add(resBase);

    // Outer translucent crystal containment housing
    const resHousingGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.32, 0.34, cfg.reservoirHeight, 6, 1, true),
    );
    const resHousing = new THREE.Mesh(resHousingGeo, crystalGlassMat);
    resHousing.position.y = 0.42 + cfg.reservoirHeight * 0.5;
    resGroup.add(resHousing);

    // Vertical obsidian corner struts framing the reservoir crystal
    const strutGeo = this.trackGeo(
      new THREE.BoxGeometry(0.06, cfg.reservoirHeight + 0.12, 0.06),
    );
    for (let s = 0; s < 3; s++) {
      const sa = (s / 3) * Math.PI * 2;
      const strut = new THREE.Mesh(strutGeo, pierMat);
      strut.position.set(
        Math.cos(sa) * 0.35,
        0.42 + cfg.reservoirHeight * 0.5,
        Math.sin(sa) * 0.35,
      );
      resGroup.add(strut);
    }

    // Inner glowing cyan Cryo Core fill column (bottom-anchored so scale.y fills upward!)
    const resCoreGeo = this.trackGeo(
      new THREE.CylinderGeometry(
        cfg.reservoirCoreRadius,
        cfg.reservoirCoreRadius,
        cfg.reservoirHeight - 0.14,
        8,
      ),
    );
    resCoreGeo.translate(0, (cfg.reservoirHeight - 0.14) * 0.5, 0);

    this.reservoirCoreMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.frostRunes, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.9,
      }),
    );
    this.reservoirCoreMesh = new THREE.Mesh(resCoreGeo, this.reservoirCoreMat);
    this.reservoirCoreMesh.position.y = 0.46;
    resGroup.add(this.reservoirCoreMesh);

    const resCapGeo = this.trackGeo(new THREE.ConeGeometry(0.36, 0.62, 6));
    const { group: resCap } = ToonAssets.createOutlinedMesh(
      resCapGeo,
      darkObsidianMat,
      1.05,
      true,
    );
    resCap.position.y = 0.42 + cfg.reservoirHeight + 0.31;
    resGroup.add(resCap);

    this.reservoirLight = new THREE.PointLight(
      PALETTE.frostRunes,
      cfg.reservoirLightIntensity,
      cfg.reservoirLightDistance,
      1.7,
    );
    this.reservoirLight.position.set(0, 0.42 + cfg.reservoirHeight * 0.55, 0);
    resGroup.add(this.reservoirLight);

    this.marinaDaisGroup.add(resGroup);
    this.root.add(this.marinaDaisGroup);

    this._pillarColliders.push({
      x: cfg.marinaDaisPos.x,
      z: cfg.marinaDaisPos.z,
      radius: cfg.daisCollisionRadius,
      height: 2.2,
    });
    this._pillarColliders.push({
      x: cfg.marinaDaisPos.x + cfg.reservoirOffsetX,
      z: cfg.marinaDaisPos.z + cfg.reservoirOffsetZ,
      radius: 0.58,
      height: cfg.reservoirHeight + 1.0,
    });

    // Initialize sealed state until synced from persisted store state
    this.setGalleryCaptives(false, false, false);
    this.updateMarinaCaptiveState(cfg.defaultCoreCharge, 0, 0.016);
    this.updateSerenaCaptiveState(cfg.defaultCoreCharge, 0, 0.016);
    this.updateMikuCaptiveState(cfg.defaultCoreCharge, 0, 0.016);
  }

  /**
   * Unlocks the Siphon Gallery southern doorway when Marina, Serena, or Miku is defeated,
   * and toggles each captive sovereign's alcove rig, tethers, and reservoir independently.
   */
  public setGalleryCaptives(
    marinaUnlocked: boolean,
    serenaUnlocked: boolean,
    mikuUnlocked = false,
  ): void {
    const anyUnlocked = marinaUnlocked || serenaUnlocked || mikuUnlocked;
    this.galleryUnlocked = anyUnlocked;
    this.marinaCaptiveUnlocked = marinaUnlocked;
    this.serenaCaptiveUnlocked = serenaUnlocked;
    this.mikuCaptiveUnlocked = mikuUnlocked;

    if (this.galleryWardGroup) {
      this.galleryWardGroup.visible = !anyUnlocked;
    }
    if (this._captiveMarinaRig) {
      this._captiveMarinaRig.root.visible = marinaUnlocked;
    }
    if (this.leftTetherMesh) {
      this.leftTetherMesh.visible = marinaUnlocked;
    }
    if (this.rightTetherMesh) {
      this.rightTetherMesh.visible = marinaUnlocked;
    }
    if (this.reservoirLight && !marinaUnlocked) {
      this.reservoirLight.intensity = 0;
    }

    if (this.serenaDormantSeal) {
      this.serenaDormantSeal.visible = !serenaUnlocked;
    }
    if (this.serenaActiveGroup) {
      this.serenaActiveGroup.visible = serenaUnlocked;
    }
    if (this._captiveSerenaRig) {
      this._captiveSerenaRig.root.visible = serenaUnlocked;
    }
    if (this.serenaLeftTetherMesh) {
      this.serenaLeftTetherMesh.visible = serenaUnlocked;
    }
    if (this.serenaRightTetherMesh) {
      this.serenaRightTetherMesh.visible = serenaUnlocked;
    }
    if (this.serenaReservoirLight && !serenaUnlocked) {
      this.serenaReservoirLight.intensity = 0;
    }

    if (this.mikuDormantSeal) {
      this.mikuDormantSeal.visible = !mikuUnlocked;
    }
    if (this.mikuActiveGroup) {
      this.mikuActiveGroup.visible = mikuUnlocked;
    }
    if (this._captiveMikuRig) {
      this._captiveMikuRig.root.visible = mikuUnlocked;
    }
    if (this.mikuLeftTetherMesh) {
      this.mikuLeftTetherMesh.visible = mikuUnlocked;
    }
    if (this.mikuRightTetherMesh) {
      this.mikuRightTetherMesh.visible = mikuUnlocked;
    }
    if (this.mikuReservoirLight && !mikuUnlocked) {
      this.mikuReservoirLight.intensity = 0;
    }

    for (let i = 0; i < this.galleryBraziers.length; i++) {
      const br = this.galleryBraziers[i];
      if (!br) continue;
      br.flameMesh.visible = anyUnlocked;
      br.light.intensity = anyUnlocked
        ? SIPHON_GALLERY_CONFIG.brazierLightIntensity
        : 0;
    }
  }

  /**
   * Backward-compatible toggle invoked by SceneManager when gallery walkability unlocks.
   */
  public setGalleryUnlocked(unlocked: boolean): void {
    this.galleryUnlocked = unlocked;
    if (this.galleryWardGroup) {
      this.galleryWardGroup.visible = !unlocked;
    }
    for (let i = 0; i < this.galleryBraziers.length; i++) {
      const br = this.galleryBraziers[i];
      if (!br) continue;
      br.flameMesh.visible = unlocked;
      br.light.intensity = unlocked
        ? SIPHON_GALLERY_CONFIG.brazierLightIntensity
        : 0;
    }
  }

  /**
   * Triggers a glowing violet ripple across the locked Siphon Gallery ward seal.
   */
  public triggerGalleryWardRipple(): void {
    this.galleryWardRippleTimer = SIPHON_GALLERY_CONFIG.wardRippleDuration;
  }

  /**
   * Updates the bound Marina rig, pulsing wrist tether strands, 12-segment dais rune ring,
   * and vertical Cryo Core Reservoir Crystal smoothly from `charge` (0.0 -> 1.0).
   */
  public updateMarinaCaptiveState(
    charge: number,
    time: number,
    dt: number,
  ): void {
    const clamped = THREE.MathUtils.clamp(charge, 0, 1);

    // 1. Update Captive Marina kneeling posture, breathing & bleach/restoration
    if (this._captiveMarinaRig && this.marinaCaptiveUnlocked) {
      this._captiveMarinaRig.applyCaptiveDaisPose(clamped, time, dt);
    }

    // 2. Update wrist energy tethers, Cryo Core Reservoir Crystal & 12-segment floor rune ring
    this.updateLobbySiphonBackdrop(clamped, time);
  }

  /**
   * Updates the bound Serena rig in Left Alcove II, pulsing wrist tether strands to the
   * twin pearl conduits, enchanted shallow tide-pool shimmer, 12-segment dais rune ring,
   * and vertical Tidal Core Reservoir Crystal smoothly from `charge` (0.0 -> 1.0).
   */
  public updateSerenaCaptiveState(
    charge: number,
    time: number,
    dt: number,
  ): void {
    const clamped = THREE.MathUtils.clamp(charge, 0, 1);

    if (this._captiveSerenaRig && this.serenaCaptiveUnlocked) {
      this._captiveSerenaRig.applyCaptiveDaisPose(clamped, time, dt);
    }

    this.updateSerenaLobbySiphonBackdrop(clamped, time);
  }

  /**
   * Updates the bound Miku rig in Right Alcove III, pulsing wrist tether strands to the
   * twin emerald/magenta tuning conduits, neon stage deck ring, 12-segment dais rune ring,
   * and vertical Harmonic Core Reservoir Crystal smoothly from `charge` (0.0 -> 1.0).
   */
  public updateMikuCaptiveState(
    charge: number,
    time: number,
    dt: number,
  ): void {
    const clamped = THREE.MathUtils.clamp(charge, 0, 1);

    if (this._captiveMikuRig && this.mikuCaptiveUnlocked) {
      this._captiveMikuRig.applyCaptiveDaisPose(clamped, time, dt);
    }

    this.updateMikuLobbySiphonBackdrop(clamped, time);
  }

  /**
   * Updates Miku's Alcove III diegetic peripherals (wrist tether strands, stage neon trim,
   * Harmonic Core Reservoir fill height/emissive, and 12-segment floor rune ring) without
   * overriding captive Miku's active FinisherSystem kiss pose during `LOBBY_SIPHON`.
   */
  public updateMikuLobbySiphonBackdrop(charge: number, time: number): void {
    const cfg = SIPHON_GALLERY_CONFIG;
    const clamped = THREE.MathUtils.clamp(charge, 0, 1);

    if (
      this._captiveMikuRig &&
      this.mikuCaptiveUnlocked &&
      this.mikuLeftConduitTip &&
      this.mikuRightConduitTip &&
      this.mikuLeftTetherMesh &&
      this.mikuRightTetherMesh
    ) {
      this.root.updateMatrixWorld(true);
      this._captiveMikuRig.getLeftWristWorldPosition(this.scratchWristL);
      this._captiveMikuRig.getRightWristWorldPosition(this.scratchWristR);
      this.mikuLeftConduitTip.getWorldPosition(this.scratchTipL);
      this.mikuRightConduitTip.getWorldPosition(this.scratchTipR);

      this.alignTetherCylinder(
        this.mikuLeftTetherMesh,
        this.scratchWristL,
        this.scratchTipL,
      );
      this.alignTetherCylinder(
        this.mikuRightTetherMesh,
        this.scratchWristR,
        this.scratchTipR,
      );
    }

    const pulse = 0.62 + 0.28 * Math.sin(time * 3.8);
    if (this.tetherMat) {
      this.tetherMat.opacity = pulse;
    }

    if (this.mikuStageRingMat) {
      this.mikuStageRingMat.color
        .copy(this.scratchColorA)
        .lerp(this.scratchColorEmerald, 0.25 + clamped * 0.75);
      this.mikuStageRingMat.opacity =
        0.34 + clamped * 0.56 + Math.sin(time * 3.0) * 0.06;
    }

    if (this.mikuReservoirCoreMesh && this.mikuReservoirCoreMat) {
      const fillScale = Math.max(cfg.reservoirMinFillScale, clamped);
      this.mikuReservoirCoreMesh.scale.set(1, fillScale, 1);
      this.mikuReservoirCoreMat.color
        .copy(this.scratchColorA)
        .lerp(this.scratchColorEmerald, clamped);
      this.mikuReservoirCoreMat.emissive
        .copy(this.scratchColorA)
        .lerp(this.scratchColorEmerald, clamped);
      this.mikuReservoirCoreMat.emissiveIntensity =
        0.15 + clamped * (0.85 + 0.14 * Math.sin(time * 3.4));
    }
    if (this.mikuReservoirLight) {
      this.mikuReservoirLight.intensity = this.mikuCaptiveUnlocked
        ? cfg.reservoirLightIntensity * (0.12 + clamped * 0.88)
        : 0;
    }

    const segCount = this.mikuDaisRuneSegments.length;
    for (let i = 0; i < segCount; i++) {
      const segMat = this.mikuDaisRuneSegments[i];
      if (!segMat) continue;
      const segThreshold = (i + 1) / segCount;
      const prevThreshold = i / segCount;
      const segFill = THREE.MathUtils.clamp(
        (clamped - prevThreshold) / Math.max(0.001, segThreshold - prevThreshold),
        0,
        1,
      );
      segMat.color
        .copy(this.scratchColorA)
        .lerp(this.scratchColorEmerald, segFill);
      segMat.opacity = this.mikuCaptiveUnlocked
        ? 0.22 + segFill * 0.74
        : 0.14;
    }
  }

  /**
   * Updates Serena's Alcove II diegetic peripherals (wrist tether strands, shallow tide-pool,
   * Tidal Core Reservoir fill height/emissive, and 12-segment floor rune ring) without
   * overriding captive Serena's active FinisherSystem kiss pose during `LOBBY_SIPHON`.
   */
  public updateSerenaLobbySiphonBackdrop(charge: number, time: number): void {
    const cfg = SIPHON_GALLERY_CONFIG;
    const clamped = THREE.MathUtils.clamp(charge, 0, 1);

    if (
      this._captiveSerenaRig &&
      this.serenaCaptiveUnlocked &&
      this.serenaLeftConduitTip &&
      this.serenaRightConduitTip &&
      this.serenaLeftTetherMesh &&
      this.serenaRightTetherMesh
    ) {
      this.root.updateMatrixWorld(true);
      this._captiveSerenaRig.getLeftWristWorldPosition(this.scratchWristL);
      this._captiveSerenaRig.getRightWristWorldPosition(this.scratchWristR);
      this.serenaLeftConduitTip.getWorldPosition(this.scratchTipL);
      this.serenaRightConduitTip.getWorldPosition(this.scratchTipR);

      this.alignTetherCylinder(
        this.serenaLeftTetherMesh,
        this.scratchWristL,
        this.scratchTipL,
      );
      this.alignTetherCylinder(
        this.serenaRightTetherMesh,
        this.scratchWristR,
        this.scratchTipR,
      );
    }

    const pulse = 0.62 + 0.28 * Math.sin(time * 3.8);
    if (this.tetherMat) {
      this.tetherMat.opacity = pulse;
    }

    if (this.serenaPoolMat && this.serenaPoolMesh) {
      this.serenaPoolMat.color
        .copy(this.scratchColorA)
        .lerp(this.scratchColorTeal, 0.25 + clamped * 0.75);
      this.serenaPoolMat.opacity =
        0.28 + clamped * 0.34 + Math.sin(time * 2.4) * 0.05;
    }

    if (this.serenaReservoirCoreMesh && this.serenaReservoirCoreMat) {
      const fillScale = Math.max(cfg.reservoirMinFillScale, clamped);
      this.serenaReservoirCoreMesh.scale.set(1, fillScale, 1);
      this.serenaReservoirCoreMat.color
        .copy(this.scratchColorA)
        .lerp(this.scratchColorTeal, clamped);
      this.serenaReservoirCoreMat.emissive
        .copy(this.scratchColorA)
        .lerp(this.scratchColorTeal, clamped);
      this.serenaReservoirCoreMat.emissiveIntensity =
        0.15 + clamped * (0.85 + 0.14 * Math.sin(time * 3.2));
    }
    if (this.serenaReservoirLight) {
      this.serenaReservoirLight.intensity = this.serenaCaptiveUnlocked
        ? cfg.reservoirLightIntensity * (0.12 + clamped * 0.88)
        : 0;
    }

    const segCount = this.serenaDaisRuneSegments.length;
    for (let i = 0; i < segCount; i++) {
      const segMat = this.serenaDaisRuneSegments[i];
      if (!segMat) continue;
      const segThreshold = (i + 1) / segCount;
      const prevThreshold = i / segCount;
      const segFill = THREE.MathUtils.clamp(
        (clamped - prevThreshold) / Math.max(0.001, segThreshold - prevThreshold),
        0,
        1,
      );
      segMat.color.copy(this.scratchColorA).lerp(this.scratchColorTeal, segFill);
      segMat.opacity = this.serenaCaptiveUnlocked
        ? 0.22 + segFill * 0.74
        : 0.14;
    }
  }

  /**
   * Updates only the diegetic gallery peripherals (pulsing wrist tether strands, Cryo Core
   * Reservoir fill height/emissive, and 12-segment dais floor rune ring) without overriding
   * captive Marina's active FinisherSystem kiss pose during `LOBBY_SIPHON`.
   */
  public updateLobbySiphonBackdrop(charge: number, time: number): void {
    const cfg = SIPHON_GALLERY_CONFIG;
    const clamped = THREE.MathUtils.clamp(charge, 0, 1);

    if (
      this._captiveMarinaRig &&
      this.marinaCaptiveUnlocked &&
      this.leftConduitTip &&
      this.rightConduitTip &&
      this.leftTetherMesh &&
      this.rightTetherMesh
    ) {
      this.root.updateMatrixWorld(true);
      this._captiveMarinaRig.getLeftWristWorldPosition(this.scratchWristL);
      this._captiveMarinaRig.getRightWristWorldPosition(this.scratchWristR);
      this.leftConduitTip.getWorldPosition(this.scratchTipL);
      this.rightConduitTip.getWorldPosition(this.scratchTipR);

      this.alignTetherCylinder(
        this.leftTetherMesh,
        this.scratchWristL,
        this.scratchTipL,
      );
      this.alignTetherCylinder(
        this.rightTetherMesh,
        this.scratchWristR,
        this.scratchTipR,
      );
    }

    // Pulse the arcane rune-cuffs & tether energy opacity
    const pulse = 0.62 + 0.28 * Math.sin(time * 3.8);
    if (this.tetherMat) {
      this.tetherMat.opacity = pulse;
    }

    // Update Cryo Core Reservoir Crystal fill height, color & point light
    if (this.reservoirCoreMesh && this.reservoirCoreMat) {
      const fillScale = Math.max(cfg.reservoirMinFillScale, clamped);
      this.reservoirCoreMesh.scale.set(1, fillScale, 1);
      this.reservoirCoreMat.color
        .copy(this.scratchColorA)
        .lerp(this.scratchColorB, clamped);
      this.reservoirCoreMat.emissive
        .copy(this.scratchColorA)
        .lerp(this.scratchColorB, clamped);
      this.reservoirCoreMat.emissiveIntensity =
        0.15 + clamped * (0.85 + 0.14 * Math.sin(time * 3.2));
    }
    if (this.reservoirLight) {
      this.reservoirLight.intensity = this.marinaCaptiveUnlocked
        ? cfg.reservoirLightIntensity * (0.12 + clamped * 0.88)
        : 0;
    }

    // Update 12-segment diegetic floor rune ring around Marina's dais
    const segCount = this.daisRuneSegments.length;
    for (let i = 0; i < segCount; i++) {
      const segMat = this.daisRuneSegments[i];
      if (!segMat) continue;
      const segThreshold = (i + 1) / segCount;
      const prevThreshold = i / segCount;
      const segFill = THREE.MathUtils.clamp(
        (clamped - prevThreshold) / Math.max(0.001, segThreshold - prevThreshold),
        0,
        1,
      );
      segMat.color.copy(this.scratchColorA).lerp(this.scratchColorB, segFill);
      segMat.opacity = this.marinaCaptiveUnlocked ? 0.22 + segFill * 0.74 : 0.12;
    }
  }

  private alignTetherCylinder(
    mesh: THREE.Mesh,
    startWorld: THREE.Vector3,
    endWorld: THREE.Vector3,
  ): void {
    this.scratchMid.addVectors(startWorld, endWorld).multiplyScalar(0.5);
    this.scratchDir.subVectors(endWorld, startWorld);
    const dist = Math.max(0.02, this.scratchDir.length());
    this.scratchDir.divideScalar(dist);

    this.scratchQuat.setFromUnitVectors(this.upAxis, this.scratchDir);
    mesh.position.copy(this.scratchMid);
    mesh.quaternion.copy(this.scratchQuat);
    mesh.scale.set(1, dist, 1);
  }

  /**
   * Triggers a glowing ward ripple on sealed Realm III (Harmonic Citadel).
   */
  public triggerWardRipple(_realmIndex: 2 | 3 = 3): void {
    // All three Northern Realm Portals are now unsealed and active
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

    // 4. Rotate Stolen Sovereign Trophies (Frost Tiara, Coral Tiara & Miku Tuning Relic) when unlocked
    if (this.trophyCrownGroup && this.isTrophyVisible) {
      this.trophyCrownGroup.rotation.y = time * 0.85;
      this.trophyCrownGroup.position.y = 1.56 + Math.sin(time * 2.4) * 0.06;
    }
    if (this.serenaTrophyGroup && this.isSerenaTrophyVisible) {
      this.serenaTrophyGroup.rotation.y = -time * 0.78;
      this.serenaTrophyGroup.position.y =
        1.62 + Math.sin(time * 2.4 + 1.4) * 0.06;
    }
    if (this.mikuTrophyGroup && this.isMikuTrophyVisible) {
      this.mikuTrophyGroup.rotation.y = time * 0.92;
      this.mikuTrophyGroup.position.y =
        1.6 + Math.sin(time * 2.6 + 2.8) * 0.06;
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

    // 7. Update Realm II active teal-gold vortex & rising bubbles + Realm III sealed ward ripple
    if (this.realm2VortexMat) {
      this.realm2VortexMat.uniforms.uTime!.value = time * 1.05;
    }
    if (this.realm2BubbleMotes) {
      const posAttr = this.realm2BubbleMotes.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) + dt * 0.72;
        if (y > 4.5) y = 0.2;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    if (this.realm3VortexMat) {
      this.realm3VortexMat.uniforms.uTime!.value = time * 1.12;
    }
    if (this.realm3SynthMotes) {
      const posAttr = this.realm3SynthMotes.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) + dt * 0.78;
        if (y > 4.5) y = 0.2;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // 8. Animate Siphon Gallery southern ward seal & cold-flame braziers
    if (this.galleryWardMat && this.galleryWardGroup && !this.galleryUnlocked) {
      if (this.galleryWardRippleTimer > 0) {
        this.galleryWardRippleTimer = Math.max(
          0,
          this.galleryWardRippleTimer - dt,
        );
        const r =
          this.galleryWardRippleTimer /
          SIPHON_GALLERY_CONFIG.wardRippleDuration;
        this.galleryWardMat.opacity = 0.36 + r * 0.5;
        const s = 1 + Math.sin(time * 30) * 0.03 * r;
        this.galleryWardGroup.scale.set(s, s, 1);
      } else {
        this.galleryWardMat.opacity = 0.28 + 0.08 * Math.sin(time * 2.1);
        this.galleryWardGroup.scale.set(1, 1, 1);
      }
    }

    if (this.galleryUnlocked) {
      for (let i = 0; i < this.galleryBraziers.length; i++) {
        const br = this.galleryBraziers[i];
        if (!br) continue;
        const flicker = 1 + Math.sin(time * 9.5 + br.phase) * 0.14;
        br.flameMesh.scale.set(1, flicker, 1);
        br.light.intensity =
          SIPHON_GALLERY_CONFIG.brazierLightIntensity *
          (0.9 + 0.12 * flicker);
      }
    }
  }

  public dispose(): void {
    if (this._captiveMarinaRig) {
      this._captiveMarinaRig.dispose();
      this._captiveMarinaRig = null;
    }
    if (this._captiveSerenaRig) {
      this._captiveSerenaRig.dispose();
      this._captiveSerenaRig = null;
    }
    if (this._captiveMikuRig) {
      this._captiveMikuRig.dispose();
      this._captiveMikuRig = null;
    }
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
