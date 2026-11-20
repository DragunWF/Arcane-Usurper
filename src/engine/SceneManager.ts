import * as THREE from 'three';
import {
  ARENA_BOUNDS_KINDS,
  ARENA_CONFIG,
  BOSS_PHASES,
  CHAMBER_CONFIG,
  ENVIRONMENT_IDS,
  LOBBY_CONFIG,
  PALETTE,
  type BossPhase,
  type EnvironmentId,
} from '../config/gameConfig';
import { IcePalaceLevel } from '../levels/IcePalaceLevel';
import { MageTowerLevel } from '../levels/MageTowerLevel';
import { ToonAssets } from './ToonAssets';

export { ToonAssets };

export interface PillarCollider {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
}

export interface CircularArenaBounds {
  readonly kind: typeof ARENA_BOUNDS_KINDS.CIRCULAR;
  readonly radius: number;
  readonly clampRadius: number;
}

export interface RectangularArenaBounds {
  readonly kind: typeof ARENA_BOUNDS_KINDS.RECTANGULAR;
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export type ArenaBounds = CircularArenaBounds | RectangularArenaBounds;

/**
 * Narrow geometry contract exposed to MovementSystem, CombatSystem, and CameraRig (ISP).
 */
export interface IArenaGeometry {
  readonly activeEnvironment: EnvironmentId;
  readonly bounds: ArenaBounds;
  readonly pillarColliders: readonly PillarCollider[];
  readonly pillarMeshes: readonly THREE.Object3D[];
  getArenaBounds(): ArenaBounds;
  getCameraColliders(): readonly THREE.Object3D[];
}

const EMPTY_CAMERA_COLLIDERS: readonly THREE.Object3D[] = Object.freeze([]);

export type ArenaAtmospherePhase = BossPhase | 'STAGGER';

interface SnowVelocity {
  vy: number;
  swaySpeed: number;
  swayAmp: number;
  phase: number;
}

interface AuroraRibbonRecord {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  basePositions: Float32Array;
  speed: number;
  phase: number;
  baseOpacity: number;
}

interface FloatingRuneRingRecord {
  mesh: THREE.Mesh;
  rotSpeed: number;
}

/**
 * Owns the imperative THREE.WebGLRenderer, THREE.Scene, lighting, fog, resize lifecycle,
 * and toggles cleanly between Realm I environments:
 * - `'SUMMIT'`: Glacial Spire summit terrace, perimeter pillars, aurora ribbons, and snow
 * - `'CHAMBER'`: Royal Ice Chambers vaulted cathedral hall & Astral Portal dais
 */
export class SceneManager implements IArenaGeometry {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly arenaGroup: THREE.Group;
  public readonly icePalaceLevel: IcePalaceLevel;
  public readonly mageTowerLevel: MageTowerLevel;

  private readonly _summitBounds: CircularArenaBounds = Object.freeze({
    kind: ARENA_BOUNDS_KINDS.CIRCULAR,
    radius: ARENA_CONFIG.radius,
    clampRadius: ARENA_CONFIG.playerClampRadius,
  });

  private readonly _lobbyBounds: CircularArenaBounds = Object.freeze({
    kind: ARENA_BOUNDS_KINDS.CIRCULAR,
    radius: LOBBY_CONFIG.rotundaRadius,
    clampRadius: LOBBY_CONFIG.rotundaRadius,
  });

  private readonly _chamberBounds: RectangularArenaBounds = Object.freeze({
    kind: ARENA_BOUNDS_KINDS.RECTANGULAR,
    halfWidth: CHAMBER_CONFIG.width * 0.5,
    halfLength: CHAMBER_CONFIG.length * 0.5,
    minX: -(CHAMBER_CONFIG.width * 0.5 - CHAMBER_CONFIG.movementWallPadding),
    maxX: CHAMBER_CONFIG.width * 0.5 - CHAMBER_CONFIG.movementWallPadding,
    minZ: CHAMBER_CONFIG.portalZ + 1.0,
    maxZ: CHAMBER_CONFIG.length * 0.5 - CHAMBER_CONFIG.movementWallPadding,
  });

  private _activeEnvironment: EnvironmentId = ENVIRONMENT_IDS.SUMMIT;
  private readonly _pillarColliders: PillarCollider[] = [];
  private readonly _pillarMeshes: THREE.Object3D[] = [];
  private readonly auroraRibbons: AuroraRibbonRecord[] = [];
  private readonly floatingRuneRings: FloatingRuneRingRecord[] = [];
  private readonly snowVelocities: SnowVelocity[] = [];

  private snowSystem: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null =
    null;
  private floorMesh: THREE.Mesh | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private moonLight: THREE.DirectionalLight | null = null;
  private amethystRim: THREE.DirectionalLight | null = null;
  private frostRim: THREE.DirectionalLight | null = null;

  private auroraIntensityScale: number = ARENA_CONFIG.lighting.auroraScaleP1;
  private targetAuroraScale: number = ARENA_CONFIG.lighting.auroraScaleP1;
  private auroraSpeedScale: number = ARENA_CONFIG.lighting.auroraSpeedP1;

  public get activeEnvironment(): EnvironmentId {
    return this._activeEnvironment;
  }

  public get bounds(): ArenaBounds {
    if (this._activeEnvironment === ENVIRONMENT_IDS.CHAMBER) {
      return this._chamberBounds;
    }
    if (this._activeEnvironment === ENVIRONMENT_IDS.LOBBY) {
      return this._lobbyBounds;
    }
    return this._summitBounds;
  }

  public getArenaBounds(): ArenaBounds {
    return this.bounds;
  }

  public getCameraColliders(): readonly THREE.Object3D[] {
    if (this._activeEnvironment === ENVIRONMENT_IDS.CHAMBER) {
      return this.icePalaceLevel.cameraColliders;
    }
    if (this._activeEnvironment === ENVIRONMENT_IDS.LOBBY) {
      return this.mageTowerLevel.cameraColliders;
    }
    return EMPTY_CAMERA_COLLIDERS;
  }

  public get pillarColliders(): readonly PillarCollider[] {
    if (this._activeEnvironment === ENVIRONMENT_IDS.CHAMBER) {
      return this.icePalaceLevel.pillarColliders;
    }
    if (this._activeEnvironment === ENVIRONMENT_IDS.LOBBY) {
      return this.mageTowerLevel.pillarColliders;
    }
    return this._pillarColliders;
  }

  public get pillarMeshes(): readonly THREE.Object3D[] {
    if (this._activeEnvironment === ENVIRONMENT_IDS.CHAMBER) {
      return this.icePalaceLevel.pillarMeshes;
    }
    if (this._activeEnvironment === ENVIRONMENT_IDS.LOBBY) {
      return this.mageTowerLevel.pillarMeshes;
    }
    return this._pillarMeshes;
  }

  public get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, ARENA_CONFIG.rendererMaxPixelRatio),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = ARENA_CONFIG.rendererToneMappingExposure;

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.arenaGroup = new THREE.Group();
    this.scene.add(this.arenaGroup);

    this.setupAtmosphereAndLights();
    this.buildIceTerrace();
    this.buildPerimeterPillars();
    this.buildDistantSpires();
    this.buildAuroraBorealis();
    this.buildStarfield();
    this.buildSnowParticles();

    // Build Royal Ice Chambers environment group (toggled via setEnvironment without recreating renderer)
    this.icePalaceLevel = new IcePalaceLevel();
    this.icePalaceLevel.root.visible = false;
    this.scene.add(this.icePalaceLevel.root);

    // Build Obsidian Spire Sanctum 3D Hub Lobby group
    this.mageTowerLevel = new MageTowerLevel();
    this.mageTowerLevel.root.visible = false;
    this.scene.add(this.mageTowerLevel.root);
  }

  /**
   * Configures midnight fog, physically-calibrated moonlight shadows, hemisphere fill,
   * and dramatic amethyst/frost rim lights matching the legacy visual brightness.
   */
  private setupAtmosphereAndLights(): void {
    const L = ARENA_CONFIG.lighting;

    this.scene.background = new THREE.Color(PALETTE.midnightSky);
    this.scene.fog = new THREE.FogExp2(
      PALETTE.midnightSky,
      ARENA_CONFIG.fogDensity,
    );

    // Hemisphere Fill Light (Glacial sky over abyssal navy)
    this.hemiLight = new THREE.HemisphereLight(
      PALETTE.frostRunes,
      PALETTE.glacialNavy,
      L.hemiIntensity,
    );
    this.hemiLight.position.set(0, 28, 0);
    this.scene.add(this.hemiLight);

    // Cool Overhead Moonlight with crisp shadow frustum
    this.moonLight = new THREE.DirectionalLight(
      PALETTE.iceHighlights,
      L.moonIntensityP1,
    );
    this.moonLight.position.set(14, 30, 12);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.width = L.shadowMapSize;
    this.moonLight.shadow.mapSize.height = L.shadowMapSize;
    this.moonLight.shadow.camera.near = L.shadowCameraNear;
    this.moonLight.shadow.camera.far = L.shadowCameraFar;
    const d = L.shadowCameraExtent;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.moonLight.shadow.bias = L.shadowBias;
    this.scene.add(this.moonLight);

    // Subtle Amethyst Rim Light (Left-Back) for dramatic anime character silhouette
    this.amethystRim = new THREE.DirectionalLight(
      PALETTE.amethystTrim,
      L.amethystRimP1,
    );
    this.amethystRim.position.set(-18, 12, -16);
    this.scene.add(this.amethystRim);

    // Subtle Ice-Blue Rim Light (Right-Front)
    this.frostRim = new THREE.DirectionalLight(PALETTE.frostRunes, L.frostRimP1);
    this.frostRim.position.set(18, 9, -14);
    this.scene.add(this.frostRim);

    // Subtle glowing crescent moon high in the midnight sky
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 24, 24),
      new THREE.MeshBasicMaterial({
        color: PALETTE.iceHighlights,
        fog: false,
      }),
    );
    moonMesh.position.set(52, 82, -110);
    this.arenaGroup.add(moonMesh);

    const moonHalo = new THREE.Mesh(
      new THREE.RingGeometry(5.6, 12.5, 32),
      new THREE.MeshBasicMaterial({
        color: PALETTE.frostRunes,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    moonHalo.position.copy(moonMesh.position);
    moonHalo.lookAt(0, 0, 0);
    this.arenaGroup.add(moonHalo);
  }

  /**
   * Builds the 18m circular reflective ice floor inlaid with glowing arcane snowflake rings
   * and the sculpted glacial spire summit pedestal descending into the abyss.
   */
  private buildIceTerrace(): void {
    const R = ARENA_CONFIG.radius;
    const { diffuseMap, emissiveMap } = ToonAssets.createGlacialFloorTextures();

    const floorGeo = new THREE.CylinderGeometry(R, R + 0.35, 0.9, 64, 1);
    const floorMat = new THREE.MeshStandardMaterial({
      map: diffuseMap,
      emissive: new THREE.Color(PALETTE.frostRunes),
      emissiveMap,
      emissiveIntensity: 0.85,
      roughness: 0.22,
      metalness: 0.32,
    });

    const floorSideMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glacialNavy,
      roughness: 0.55,
      metalness: 0.25,
    });

    // CylinderGeometry material groups: [0: side, 1: top, 2: bottom]
    this.floorMesh = new THREE.Mesh(floorGeo, [
      floorSideMat,
      floorMat,
      floorSideMat,
    ]);
    this.floorMesh.position.y = -0.45;
    this.floorMesh.receiveShadow = true;
    this.arenaGroup.add(this.floorMesh);

    // Raised Carved Glacial Outer Rim Ring
    const rimGeo = new THREE.TorusGeometry(R + 0.05, 0.26, 10, 64);
    const rimMat = ToonAssets.createToonMaterial(PALETTE.iceFloor, {
      emissive: PALETTE.frostRunes,
      emissiveIntensity: 0.14,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = 0.04;
    rimMesh.receiveShadow = true;
    this.arenaGroup.add(rimMesh);

    // Subtle Floating Additive Arcane Rings hovering just above the ice surface
    const ringConfigs = [
      { inner: 6.75, outer: 6.92, opacity: 0.42, speed: 0.09 },
      { inner: 13.75, outer: 13.95, opacity: 0.34, speed: -0.05 },
    ];

    ringConfigs.forEach((cfg) => {
      const ringGeo = new THREE.RingGeometry(cfg.inner, cfg.outer, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: PALETTE.frostRunes,
        transparent: true,
        opacity: cfg.opacity,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, ringMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      this.floatingRuneRings.push({ mesh, rotSpeed: cfg.speed });
      this.arenaGroup.add(mesh);
    });

    // Spire Summit Underside Pedestal & Hanging Glacial Icicles
    const undersideGeo = new THREE.ConeGeometry(R + 0.3, 26, 24, 1, false);
    const undersideMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glacialNavy,
      roughness: 0.6,
      metalness: 0.2,
      flatShading: true,
    });
    const underside = new THREE.Mesh(undersideGeo, undersideMat);
    underside.rotation.x = Math.PI;
    underside.position.y = -13.9;
    this.arenaGroup.add(underside);

    const icicleMat = ToonAssets.createToonMaterial(PALETTE.iceFloor, {
      emissive: PALETTE.frostRunes,
      emissiveIntensity: 0.12,
    });
    const icicleCount = ARENA_CONFIG.cliffIcicleCount;
    for (let i = 0; i < icicleCount; i++) {
      const ang = (i / icicleCount) * Math.PI * 2;
      const len = 3.2 + (i % 4) * 1.45;
      const rad = 0.45 + (i % 3) * 0.2;
      const icicle = new THREE.Mesh(
        new THREE.ConeGeometry(rad, len, 6),
        icicleMat,
      );
      icicle.rotation.x = Math.PI;
      icicle.position.set(
        Math.cos(ang) * (R - 0.3),
        -0.85 - len * 0.5,
        Math.sin(ang) * (R - 0.3),
      );
      this.arenaGroup.add(icicle);
    }
  }

  /**
   * Builds 12 carved crystalline ice pillars around radius 16.5m, keeping the
   * central 14m combat zone unobstructed.
   */
  private buildPerimeterPillars(): void {
    const count = ARENA_CONFIG.pillarCount;
    const ringR = ARENA_CONFIG.pillarRingRadius;

    const iceBodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.iceFloor,
      emissive: new THREE.Color(PALETTE.frostRunes),
      emissiveIntensity: 0.16,
      roughness: 0.24,
      metalness: 0.35,
      flatShading: true,
    });

    const iceCapMat = new THREE.MeshStandardMaterial({
      color: PALETTE.iceHighlights,
      emissive: new THREE.Color(PALETTE.frostRunes),
      emissiveIntensity: 0.32,
      roughness: 0.15,
      metalness: 0.4,
      flatShading: true,
    });

    const plinthMat = ToonAssets.createToonMaterial(PALETTE.glacialNavy);
    const runeBandMat = new THREE.MeshBasicMaterial({
      color: PALETTE.frostRunes,
    });

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const px = Math.cos(angle) * ringR;
      const pz = Math.sin(angle) * ringR;

      const pillarGroup = new THREE.Group();
      pillarGroup.position.set(px, 0, pz);
      pillarGroup.lookAt(0, 0, 0);

      const heightVar =
        ARENA_CONFIG.pillarHeight +
        (i % 3 === 0 ? 1.15 : i % 2 === 0 ? -0.45 : 0.35);

      // Stepped Octagonal Carved Base Plinth
      const base1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.12, 0.55, 8),
        plinthMat,
      );
      base1.position.y = 0.275;
      base1.castShadow = true;
      base1.receiveShadow = true;
      pillarGroup.add(base1);

      const base2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.76, 0.9, 0.5, 8),
        plinthMat,
      );
      base2.position.y = 0.78;
      base2.castShadow = true;
      base2.receiveShadow = true;
      pillarGroup.add(base2);

      // Glowing Cyan Arcane Collar Band
      const lowerRuneBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.79, 0.79, 0.14, 8),
        runeBandMat,
      );
      lowerRuneBand.position.y = 1.08;
      pillarGroup.add(lowerRuneBand);

      // Faceted Crystalline Ice Shaft + Ink Outline
      const shaftH = heightVar - 2.3;
      const shaftGeo = new THREE.CylinderGeometry(0.54, 0.72, shaftH, 6);
      const { group: shaftObj, mainMesh: shaftMesh } =
        ToonAssets.createOutlinedMesh(
          shaftGeo,
          iceBodyMat,
          { x: 1.055, y: 1.01, z: 1.055 },
          true,
        );
      shaftObj.position.y = 1.08 + shaftH * 0.5;
      pillarGroup.add(shaftObj);

      // Upper Glowing Frost Band
      const upperRuneBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.58, 0.16, 6),
        runeBandMat,
      );
      upperRuneBand.position.y = 1.08 + shaftH - 0.35;
      pillarGroup.add(upperRuneBand);

      // Jagged Crystal Spire Crown
      const crownH = 1.65;
      const crownGeo = new THREE.ConeGeometry(0.58, crownH, 6);
      const { group: crownObj } = ToonAssets.createOutlinedMesh(
        crownGeo,
        iceCapMat,
        1.05,
        true,
      );
      crownObj.position.y = 1.08 + shaftH + crownH * 0.5;
      pillarGroup.add(crownObj);

      // Secondary Side Crystal Shards jutting out dramatically
      const shardGeo = new THREE.ConeGeometry(0.24, 1.65, 5);
      const shardLeft = new THREE.Mesh(shardGeo, iceCapMat);
      shardLeft.position.set(-0.56, 2.35, 0.15);
      shardLeft.rotation.z = 0.34;
      shardLeft.castShadow = true;
      pillarGroup.add(shardLeft);

      const shardRight = new THREE.Mesh(shardGeo, iceCapMat);
      shardRight.position.set(0.54, 3.1, -0.1);
      shardRight.rotation.z = -0.28;
      shardRight.scale.setScalar(0.85);
      shardRight.castShadow = true;
      pillarGroup.add(shardRight);

      this.arenaGroup.add(pillarGroup);

      this._pillarColliders.push({
        x: px,
        z: pz,
        radius: ARENA_CONFIG.pillarCollisionRadius,
        height: heightVar + 0.6,
      });
      this._pillarMeshes.push(shaftMesh, base1);
    }
  }

  /**
   * Builds distant silhouetted glacial mountain spires beyond the abyss for epic scale.
   */
  private buildDistantSpires(): void {
    const spireMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glacialNavy,
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true,
    });

    const count = ARENA_CONFIG.distantSpireCount;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + 0.18;
      const dist = 56 + (i % 4) * 18;
      const h = 38 + (i % 5) * 15;
      const rad = 6.5 + (i % 3) * 3.2;

      const peak = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 5), spireMat);
      peak.position.set(
        Math.cos(ang) * dist,
        -22 + h * 0.42,
        Math.sin(ang) * dist,
      );
      peak.rotation.y = i * 0.7;
      this.arenaGroup.add(peak);
    }
  }

  /**
   * Creates glowing undulating aurora borealis ribbons sweeping high across the midnight sky.
   */
  private buildAuroraBorealis(): void {
    const auroraTex = ToonAssets.createAuroraTexture();

    const ribbonSpecs = [
      {
        radius: 95,
        height: 34,
        y: 42,
        arc: Math.PI * 0.85,
        rotY: -0.6,
        color: PALETTE.frostRunes,
        opacity: 0.46,
        speed: 0.35,
        phase: 0,
      },
      {
        radius: 112,
        height: 42,
        y: 50,
        arc: Math.PI * 0.95,
        rotY: 1.4,
        color: PALETTE.amethystTrim,
        opacity: 0.36,
        speed: 0.28,
        phase: 2.1,
      },
      {
        radius: 86,
        height: 28,
        y: 36,
        arc: Math.PI * 0.7,
        rotY: 2.8,
        color: PALETTE.iceHighlights,
        opacity: 0.28,
        speed: 0.42,
        phase: 4.2,
      },
    ];

    ribbonSpecs.forEach((spec) => {
      const segX = 48;
      const segY = 4;
      const geo = new THREE.PlaneGeometry(
        spec.arc * spec.radius,
        spec.height,
        segX,
        segY,
      );
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const basePositions = new Float32Array(posAttr.array.length);

      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const theta = x / spec.radius;
        const wave = Math.sin(theta * 3.5 + spec.phase) * 7.5;
        const r = spec.radius + wave;

        const nx = Math.sin(theta) * r;
        const nz = -Math.cos(theta) * r;
        const ny = y + Math.cos(theta * 2.2) * 3.2;

        posAttr.setXYZ(i, nx, ny, nz);
        basePositions[i * 3 + 0] = nx;
        basePositions[i * 3 + 1] = ny;
        basePositions[i * 3 + 2] = nz;
      }
      geo.computeVertexNormals();

      const mat = new THREE.MeshBasicMaterial({
        map: auroraTex,
        color: spec.color,
        transparent: true,
        opacity: spec.opacity,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = spec.y;
      mesh.rotation.y = spec.rotY;

      this.auroraRibbons.push({
        mesh,
        basePositions,
        speed: spec.speed,
        phase: spec.phase,
        baseOpacity: spec.opacity,
      });
      this.arenaGroup.add(mesh);
    });
  }

  /**
   * Adds a crisp midnight starfield overhead.
   */
  private buildStarfield(): void {
    const count = ARENA_CONFIG.starCount;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.15 + Math.random() * 0.85);
      const r = 145 + Math.random() * 45;
      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: PALETTE.iceHighlights,
      size: 1.15,
      transparent: true,
      opacity: 0.72,
      fog: false,
    });
    this.arenaGroup.add(new THREE.Points(geo, mat));
  }

  /**
   * Spawns 350 gently drifting 3D snow particles across the summit.
   */
  private buildSnowParticles(): void {
    const count = ARENA_CONFIG.snowCount;
    const maxR = ARENA_CONFIG.snowAreaRadius;
    const maxH = ARENA_CONFIG.snowMaxHeight;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(Math.random()) * maxR;
      const ang = Math.random() * Math.PI * 2;
      positions[i * 3 + 0] = Math.cos(ang) * r;
      positions[i * 3 + 1] = Math.random() * maxH;
      positions[i * 3 + 2] = Math.sin(ang) * r;

      this.snowVelocities.push({
        vy: -(0.75 + Math.random() * 0.95),
        swaySpeed: 0.6 + Math.random() * 1.2,
        swayAmp: 0.35 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      map: ToonAssets.getSnowTexture(),
      color: PALETTE.iceHighlights,
      size: 0.28,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.snowSystem = new THREE.Points(geo, mat);
    this.arenaGroup.add(this.snowSystem);
  }

  /**
   * Switches active environment visibility, fog, lighting calibration, and active
   * ArenaBounds between the Obsidian Spire Sanctum ('LOBBY'), Royal Ice Chambers ('CHAMBER'),
   * and Glacial Spire Summit ('SUMMIT') without recreating the WebGLRenderer.
   */
  public setEnvironment(env: EnvironmentId): void {
    this._activeEnvironment = env;
    const isChamber = env === ENVIRONMENT_IDS.CHAMBER;
    const isLobby = env === ENVIRONMENT_IDS.LOBBY;
    const isSummit = env === ENVIRONMENT_IDS.SUMMIT;

    this.arenaGroup.visible = isSummit;
    this.icePalaceLevel.root.visible = isChamber;
    this.mageTowerLevel.root.visible = isLobby;

    if (isLobby) {
      const LL = LOBBY_CONFIG.lighting;
      this.scene.background = new THREE.Color(PALETTE.midnightSky);
      this.scene.fog = new THREE.FogExp2(PALETTE.midnightSky, LL.fogDensity);

      if (this.hemiLight) {
        this.hemiLight.color.setHex(PALETTE.pulseLavender);
        this.hemiLight.groundColor.setHex(PALETTE.sanctumStone);
        this.hemiLight.intensity = LL.hemiIntensity;
      }
      if (this.moonLight) {
        this.moonLight.color.setHex(PALETTE.iceHighlights);
        this.moonLight.intensity = LL.keyIntensity;
        this.moonLight.position.set(10, 24, 8);
        const d = LL.shadowExtent;
        this.moonLight.shadow.camera.left = -d;
        this.moonLight.shadow.camera.right = d;
        this.moonLight.shadow.camera.top = d;
        this.moonLight.shadow.camera.bottom = -d;
        this.moonLight.shadow.camera.updateProjectionMatrix();
      }
      if (this.amethystRim) {
        this.amethystRim.color.setHex(PALETTE.amethystTrim);
        this.amethystRim.intensity = LL.rimIntensity;
      }
      if (this.frostRim) {
        this.frostRim.color.setHex(PALETTE.frostRunes);
        this.frostRim.intensity = LL.rimIntensity;
      }
    } else if (isChamber) {
      const CL = CHAMBER_CONFIG.lighting;
      this.scene.background = new THREE.Color(PALETTE.chamberVoid);
      this.scene.fog = new THREE.FogExp2(PALETTE.chamberVoid, CL.fogDensity);

      if (this.hemiLight) {
        this.hemiLight.color.setHex(PALETTE.coldFlame);
        this.hemiLight.groundColor.setHex(PALETTE.royalIndigo);
        this.hemiLight.intensity = CL.hemiIntensity;
      }
      if (this.moonLight) {
        this.moonLight.color.setHex(PALETTE.iceHighlights);
        this.moonLight.intensity = CL.keyIntensity;
        this.moonLight.position.set(8, 22, 10);
        const d = CL.shadowExtent;
        this.moonLight.shadow.camera.left = -d;
        this.moonLight.shadow.camera.right = d;
        this.moonLight.shadow.camera.top = d;
        this.moonLight.shadow.camera.bottom = -d;
        this.moonLight.shadow.camera.updateProjectionMatrix();
      }
      if (this.amethystRim) {
        this.amethystRim.color.setHex(PALETTE.amethystTrim);
        this.amethystRim.intensity = CL.rimIntensity;
      }
      if (this.frostRim) {
        this.frostRim.color.setHex(PALETTE.coldFlame);
        this.frostRim.intensity = CL.rimIntensity;
      }
    } else {
      const L = ARENA_CONFIG.lighting;
      this.scene.background = new THREE.Color(PALETTE.midnightSky);
      this.scene.fog = new THREE.FogExp2(
        PALETTE.midnightSky,
        ARENA_CONFIG.fogDensity,
      );

      if (this.hemiLight) {
        this.hemiLight.color.setHex(PALETTE.frostRunes);
        this.hemiLight.groundColor.setHex(PALETTE.glacialNavy);
        this.hemiLight.intensity = L.hemiIntensity;
      }
      if (this.moonLight) {
        this.moonLight.color.setHex(PALETTE.iceHighlights);
        this.moonLight.position.set(14, 30, 12);
        const d = L.shadowCameraExtent;
        this.moonLight.shadow.camera.left = -d;
        this.moonLight.shadow.camera.right = d;
        this.moonLight.shadow.camera.top = d;
        this.moonLight.shadow.camera.bottom = -d;
        this.moonLight.shadow.camera.updateProjectionMatrix();
      }
      this.setPhaseAtmosphere(BOSS_PHASES.PHASE_1);
    }
  }

  /**
   * Escalates aurora brightness and calibrated rim/moon lighting across Boss Phases 1–3 & Stagger.
   */
  public setPhaseAtmosphere(phase: ArenaAtmospherePhase): void {
    const L = ARENA_CONFIG.lighting;

    if (phase === BOSS_PHASES.PHASE_2) {
      this.targetAuroraScale = L.auroraScaleP2;
      this.auroraSpeedScale = L.auroraSpeedP2;
      if (this.frostRim) {
        this.frostRim.color.setHex(PALETTE.auroraSapphire);
        this.frostRim.intensity = L.frostRimP2;
      }
      if (this.amethystRim) {
        this.amethystRim.color.setHex(PALETTE.sovereignIndigo);
        this.amethystRim.intensity = L.amethystRimP2;
      }
      if (this.moonLight) this.moonLight.intensity = L.moonIntensityP2;
    } else if (phase === BOSS_PHASES.PHASE_3) {
      this.targetAuroraScale = L.auroraScaleP3;
      this.auroraSpeedScale = L.auroraSpeedP3;
      if (this.frostRim) {
        this.frostRim.color.setHex(PALETTE.blindingFrost);
        this.frostRim.intensity = L.frostRimP3;
      }
      if (this.amethystRim) {
        this.amethystRim.color.setHex(PALETTE.sovereignIndigo);
        this.amethystRim.intensity = L.amethystRimP3;
      }
      if (this.moonLight) this.moonLight.intensity = L.moonIntensityP3;
    } else if (phase === 'STAGGER') {
      this.targetAuroraScale = L.auroraScaleStagger;
      this.auroraSpeedScale = L.auroraSpeedStagger;
      if (this.frostRim) {
        this.frostRim.color.setHex(PALETTE.frostRunes);
        this.frostRim.intensity = L.frostRimStagger;
      }
      if (this.amethystRim) {
        this.amethystRim.color.setHex(PALETTE.amethystTrim);
        this.amethystRim.intensity = L.amethystRimStagger;
      }
      if (this.moonLight) this.moonLight.intensity = L.moonIntensityStagger;
    } else {
      this.targetAuroraScale = L.auroraScaleP1;
      this.auroraSpeedScale = L.auroraSpeedP1;
      if (this.frostRim) {
        this.frostRim.color.setHex(PALETTE.frostRunes);
        this.frostRim.intensity = L.frostRimP1;
      }
      if (this.amethystRim) {
        this.amethystRim.color.setHex(PALETTE.amethystTrim);
        this.amethystRim.intensity = L.amethystRimP1;
      }
      if (this.moonLight) this.moonLight.intensity = L.moonIntensityP1;
    }
  }

  /**
   * Updates active environment animations (chamber banners/braziers/portal or summit snow/aurora/rings).
   */
  public update(dt: number, elapsed: number): void {
    if (this._activeEnvironment === ENVIRONMENT_IDS.LOBBY) {
      this.mageTowerLevel.update(elapsed, dt);
      return;
    }
    if (this._activeEnvironment === ENVIRONMENT_IDS.CHAMBER) {
      this.icePalaceLevel.update(dt, elapsed);
      return;
    }

    this.auroraIntensityScale +=
      (this.targetAuroraScale - this.auroraIntensityScale) *
      Math.min(1, dt * 3.0);

    for (let i = 0; i < this.floatingRuneRings.length; i++) {
      const ring = this.floatingRuneRings[i];
      if (ring) {
        ring.mesh.rotation.z += ring.rotSpeed * this.auroraSpeedScale * dt;
      }
    }

    for (let i = 0; i < this.auroraRibbons.length; i++) {
      const ribbon = this.auroraRibbons[i];
      if (!ribbon) continue;

      const posAttr = ribbon.mesh.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const base = ribbon.basePositions;
      const speed = ribbon.speed * this.auroraSpeedScale;
      const phase = ribbon.phase;

      for (let v = 0; v < posAttr.count; v++) {
        const bx = base[v * 3 + 0] ?? 0;
        const by = base[v * 3 + 1] ?? 0;
        const bz = base[v * 3 + 2] ?? 0;
        const ripple = Math.sin(elapsed * speed + v * 0.14 + phase) * 1.45;
        posAttr.setXYZ(v, bx + ripple * 0.6, by + ripple, bz + ripple * 0.4);
      }
      posAttr.needsUpdate = true;
      ribbon.mesh.material.opacity = Math.min(
        0.92,
        ribbon.baseOpacity *
          this.auroraIntensityScale *
          (0.85 + 0.15 * Math.sin(elapsed * 0.7 + phase)),
      );
    }

    if (this.snowSystem) {
      const posAttr = this.snowSystem.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      const maxR = ARENA_CONFIG.snowAreaRadius;
      const maxH = ARENA_CONFIG.snowMaxHeight;

      for (let i = 0; i < ARENA_CONFIG.snowCount; i++) {
        const vel = this.snowVelocities[i];
        if (!vel) continue;

        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        let z = posAttr.getZ(i);

        y += vel.vy * dt;
        x +=
          (Math.sin(elapsed * vel.swaySpeed + vel.phase) * vel.swayAmp + 0.35) *
          dt;
        z +=
          Math.cos(elapsed * vel.swaySpeed * 0.8 + vel.phase) *
          vel.swayAmp *
          dt;

        if (y < 0.05) {
          const r = Math.sqrt(Math.random()) * maxR;
          const ang = Math.random() * Math.PI * 2;
          x = Math.cos(ang) * r;
          y = maxH;
          z = Math.sin(ang) * r;
        }

        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
    }
  }

  public resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height);
  }

  public render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }

  public dispose(): void {
    this.mageTowerLevel.dispose();
    this.icePalaceLevel.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(
        this.renderer.domElement,
      );
    }
  }
}
