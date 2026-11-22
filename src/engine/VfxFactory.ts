import * as THREE from 'three';
import {
  BOSS_CONFIG,
  BOSS_PHASES,
  DIORAMA_CONFIG,
  DRAIN_THROTTLE_MODES,
  NG_PLUS_CONFIG,
  PALETTE,
  PLAYER_CONFIG,
  SOUL_WISP_KINDS,
  type BossPhase,
  type DrainThrottleMode,
  type SoulWispKind,
} from '../config/gameConfig';
import type { DarkMageRig } from '../rigs/DarkMageRig';
import { ToonAssets } from './ToonAssets';

export interface PulseMeshHandles {
  ringMat: THREE.MeshBasicMaterial;
  torusMat: THREE.MeshBasicMaterial;
  flashLight: THREE.PointLight;
}

export interface FrostRingMeshHandles {
  ringMat: THREE.MeshBasicMaterial;
  wallMat: THREE.MeshBasicMaterial;
}

export interface PhaseWaveMeshHandles {
  ringMat: THREE.MeshBasicMaterial;
  domeMat: THREE.MeshBasicMaterial;
  flashLight: THREE.PointLight;
}

export interface LaserMeshHandles {
  telegraphMesh: THREE.Mesh;
  telegraphMat: THREE.MeshBasicMaterial;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  outerMesh: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  muzzleMesh: THREE.Mesh;
  muzzleMat: THREE.MeshBasicMaterial;
}

export interface IcePillarMeshHandles {
  runeRing: THREE.Mesh;
  runeMat: THREE.MeshBasicMaterial;
  fillDisc: THREE.Mesh;
  fillMat: THREE.MeshBasicMaterial;
  spireGroup: THREE.Group;
  spireMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshBasicMaterial;
}

export interface AbyssalWhirlpoolMeshHandles {
  outerRing: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  midRing: THREE.Mesh;
  midMat: THREE.MeshBasicMaterial;
  innerRing: THREE.Mesh;
  innerMat: THREE.MeshBasicMaterial;
  vortexLight: THREE.PointLight;
}

export interface LaserWallMeshHandles {
  curtainMat: THREE.MeshBasicMaterial;
  beamMat: THREE.MeshBasicMaterial;
  pylonMat: THREE.MeshBasicMaterial;
}

export interface HarmonicAmpNodeHandles {
  ringOuter: THREE.Mesh;
  ringInner: THREE.Mesh;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
}

export interface YrdenTrapMeshHandles {
  outerRing: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  sigilRing: THREE.Mesh;
  sigilMat: THREE.MeshBasicMaterial;
  tetherLine: THREE.Line;
  tetherMat: THREE.LineBasicMaterial;
  tetherPositions: Float32Array;
  trapLight: THREE.PointLight;
}

export interface ChaosLightningMeshHandles {
  runeRing: THREE.Mesh;
  runeMat: THREE.MeshBasicMaterial;
  fillDisc: THREE.Mesh;
  fillMat: THREE.MeshBasicMaterial;
  boltGroup: THREE.Group;
  boltCoreMat: THREE.MeshBasicMaterial;
  boltForkMat: THREE.MeshBasicMaterial;
  strikeLight: THREE.PointLight;
}

export interface SpatialRiftMeshHandles {
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  rimMesh: THREE.Mesh;
  rimMat: THREE.MeshBasicMaterial;
  riftLight: THREE.PointLight;
}

/**
 * Narrow VFX & mesh creation interface injected into ECS systems (ISP & DIP).
 */
export interface IVfxSpawner {
  createVoidBoltGroup(origin: THREE.Vector3, direction: THREE.Vector3): THREE.Group;
  createUsurpedFrostBeamGroup(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): THREE.Group;
  createIceLanceGroup(): THREE.Group;
  createServantBoltGroup(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): THREE.Group;
  createSoulWispGroup(origin: THREE.Vector3, kind: SoulWispKind): THREE.Group;
  createCrescentBladeGroup(
    origin: THREE.Vector3,
    yaw: number,
    aquatic?: boolean,
    customColors?: { readonly blade: number; readonly edge: number },
  ): THREE.Group;
  createSpiralOrbGroup(
    origin: THREE.Vector3,
    aquatic?: boolean,
    harmonic?: boolean,
    customColors?: { readonly core: number; readonly halo: number },
  ): THREE.Group;
  createYrdenTrapGroup(origin: THREE.Vector3, radius: number): THREE.Group;
  createChaosLightningGroup(origin: THREE.Vector3, radius: number): THREE.Group;
  createSpatialRiftGroup(origin: THREE.Vector3): THREE.Group;
  createUmbralPulseGroup(origin: THREE.Vector3): THREE.Group;
  createFrostRingNovaGroup(origin: THREE.Vector3): THREE.Group;
  createPhaseShockwaveGroup(origin: THREE.Vector3, phase: BossPhase): THREE.Group;
  createLaserBeamGroup(
    origin: THREE.Vector3,
    side: -1 | 1,
    startAngle: number,
    beamLength: number,
    harmonic?: boolean,
  ): THREE.Group;
  createLaserWallGroup(
    startPos: THREE.Vector3,
    angle: number,
    length: number,
    height: number,
  ): THREE.Group;
  createHarmonicAmpNodeGroup(origin: THREE.Vector3): THREE.Group;
  createIcePillarGroup(
    origin: THREE.Vector3,
    radius: number,
    aquatic?: boolean,
  ): THREE.Group;
  createAbyssalWhirlpoolGroup(origin: THREE.Vector3, radius: number): THREE.Group;
  spawnTrailSpark(position: THREE.Vector3): void;
  spawnImpactBurst(origin: THREE.Vector3, count?: number): void;
  spawnFrostShatterBurst(origin: THREE.Vector3, count?: number, maxSpeed?: number): void;
  spawnTelegraphRing(origin: THREE.Vector3): void;
  spawnAfterimage(mageRig: DarkMageRig): void;
  spawnVaporWisp(origin: THREE.Vector3): void;
  spawnFinisherParticle(origin: THREE.Vector3, throttle: DrainThrottleMode): void;
  spawnTiaraFlickSparks(
    origin: THREE.Vector3,
    colorA?: number,
    colorB?: number,
  ): void;
  attachToScene(obj: THREE.Object3D): void;
  detachAndDispose(obj: THREE.Object3D): void;
  updateTransientVfx(dt: number): void;
  clearTransientVfx(): void;
}

interface TransientParticle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  velocity: THREE.Vector3;
  gravity: number;
  spinX: number;
  spinY: number;
  life: number;
  maxLife: number;
  baseScale: number;
}

interface TransientAfterimage {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface TransientTelegraphRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

/**
 * Owns shared projectile/hazard geometries, transient particle pools, afterimages,
 * and scene-graph disposal for ECS entities (SRP — zero combat logic or React imports).
 */
export class VfxFactory implements IVfxSpawner {
  private readonly scene: THREE.Scene;

  // Shared Geometries & Materials (never disposed per-instance)
  private readonly boltCoreGeo: THREE.SphereGeometry;
  private readonly boltHaloGeo: THREE.SphereGeometry;
  private readonly boltTailGeo: THREE.ConeGeometry;
  private readonly boltCoreMat: THREE.MeshBasicMaterial;
  private readonly boltHaloMat: THREE.MeshBasicMaterial;
  private readonly boltTailMat: THREE.MeshBasicMaterial;
  private readonly boltSpriteMat: THREE.SpriteMaterial;
  private readonly sparkGeo: THREE.OctahedronGeometry;

  private readonly lanceGeo: THREE.ConeGeometry;
  private readonly lanceMat: THREE.MeshBasicMaterial;
  private readonly lanceCoreMat: THREE.MeshBasicMaterial;
  private readonly shardGeo: THREE.OctahedronGeometry;
  private readonly orbCoreGeo: THREE.SphereGeometry;
  private readonly orbHaloGeo: THREE.SphereGeometry;
  private readonly orbCoreMat: THREE.MeshBasicMaterial;
  private readonly orbHaloMat: THREE.MeshBasicMaterial;

  // Transient Non-Colliding VFX Pools
  private readonly particles: TransientParticle[] = [];
  private readonly afterimages: TransientAfterimage[] = [];
  private readonly telegraphRings: TransientTelegraphRing[] = [];
  private readonly scratchLookTarget = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const r = PLAYER_CONFIG.boltRadius;
    this.boltCoreGeo = new THREE.SphereGeometry(r * 0.62, 10, 10);
    this.boltHaloGeo = new THREE.SphereGeometry(r * 1.28, 10, 10);
    this.boltTailGeo = new THREE.ConeGeometry(r * 0.82, 0.95, 8);
    this.boltTailGeo.rotateX(-Math.PI / 2);

    this.boltCoreMat = new THREE.MeshBasicMaterial({
      color: PALETTE.voidCoreFuchsia,
    });
    this.boltHaloMat = new THREE.MeshBasicMaterial({
      color: PALETTE.glowViolet,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.boltTailMat = new THREE.MeshBasicMaterial({
      color: PALETTE.amethystTrim,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.boltSpriteMat = new THREE.SpriteMaterial({
      map: ToonAssets.getSparkTexture(),
      color: PALETTE.glowViolet,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkGeo = new THREE.OctahedronGeometry(0.085, 0);

    this.lanceGeo = new THREE.ConeGeometry(0.14, 1.55, 6);
    this.lanceGeo.rotateX(Math.PI / 2);
    this.lanceMat = new THREE.MeshBasicMaterial({
      color: PALETTE.iceHighlights,
      transparent: true,
      opacity: 0.88,
    });
    this.lanceCoreMat = new THREE.MeshBasicMaterial({
      color: PALETTE.frostRunes,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    this.shardGeo = new THREE.OctahedronGeometry(0.11, 0);

    this.orbCoreGeo = new THREE.SphereGeometry(0.2, 10, 10);
    this.orbHaloGeo = new THREE.SphereGeometry(0.32, 10, 10);
    this.orbCoreMat = new THREE.MeshBasicMaterial({
      color: PALETTE.blindingFrost,
    });
    this.orbHaloMat = new THREE.MeshBasicMaterial({
      color: PALETTE.warningRune,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
    });
  }

  public createVoidBoltGroup(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(origin);
    this.scratchLookTarget.copy(origin).add(direction);
    group.lookAt(this.scratchLookTarget);

    group.add(new THREE.Mesh(this.boltCoreGeo, this.boltCoreMat));
    group.add(new THREE.Mesh(this.boltHaloGeo, this.boltHaloMat));

    const tail = new THREE.Mesh(this.boltTailGeo, this.boltTailMat);
    tail.position.z = -0.45;
    group.add(tail);

    const glowSprite = new THREE.Sprite(this.boltSpriteMat);
    glowSprite.scale.set(0.95, 0.95, 1);
    group.add(glowSprite);

    this.scene.add(group);
    return group;
  }

  /**
   * Encore NG+ piercing Usurped Glacial Spear-Beam combining stolen frost cyan & void amethyst.
   */
  public createUsurpedFrostBeamGroup(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(origin);
    this.scratchLookTarget.copy(origin).add(direction);
    group.lookAt(this.scratchLookTarget);

    const len = NG_PLUS_CONFIG.frostBeamLength;
    const coreGeo = new THREE.CylinderGeometry(0.05, 0.08, len, 6);
    coreGeo.rotateX(Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: PALETTE.blindingFrost,
    });
    group.add(new THREE.Mesh(coreGeo, coreMat));

    const auraGeo = new THREE.ConeGeometry(0.22, len * 1.15, 6);
    auraGeo.rotateX(Math.PI / 2);
    const auraMat = new THREE.MeshBasicMaterial({
      color: PALETTE.frostRunes,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(auraGeo, auraMat));

    const voidRingGeo = new THREE.TorusGeometry(0.18, 0.025, 6, 16);
    const voidRingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.glowViolet,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(voidRingGeo, voidRingMat);
    ring.position.z = -len * 0.25;
    group.add(ring);

    group.userData.ownedMaterials = [coreMat, auraMat, voidRingMat];
    group.userData.ownedGeometries = [coreGeo, auraGeo, voidRingGeo];
    this.scene.add(group);
    return group;
  }

  public createIceLanceGroup(): THREE.Group {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.lanceGeo, this.lanceMat));

    const glow = new THREE.Mesh(this.lanceGeo, this.lanceCoreMat);
    glow.scale.set(1.38, 1.38, 1.08);
    group.add(glow);

    this.scene.add(group);
    return group;
  }

  /**
   * Sleek crystalline frost needle fired in fans by Cryo Acolytes.
   */
  public createServantBoltGroup(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(origin);
    this.scratchLookTarget.copy(origin).add(direction);
    group.lookAt(this.scratchLookTarget);

    const core = new THREE.Mesh(this.lanceGeo, this.lanceMat);
    core.scale.set(0.75, 0.75, 0.72);
    group.add(core);

    const aura = new THREE.Mesh(this.lanceGeo, this.lanceCoreMat);
    aura.scale.set(1.18, 1.18, 0.82);
    group.add(aura);

    this.scene.add(group);
    return group;
  }

  /**
   * Homing Soul Wisp orb (cyan for Astral Portal charge; emerald-cyan for Frost Urn healing).
   */
  public createSoulWispGroup(
    origin: THREE.Vector3,
    kind: SoulWispKind,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(origin);

    const isHeal = kind === SOUL_WISP_KINDS.HEAL_PLAYER;
    const coreColor = isHeal ? PALETTE.emeraldReady : PALETTE.iceHighlights;
    const haloColor = isHeal ? PALETTE.emeraldReady : PALETTE.frostRunes;

    const coreGeo = new THREE.OctahedronGeometry(0.16, 0);
    const coreMat = new THREE.MeshBasicMaterial({ color: coreColor });
    group.add(new THREE.Mesh(coreGeo, coreMat));

    const haloGeo = new THREE.SphereGeometry(0.32, 10, 10);
    const haloMat = new THREE.MeshBasicMaterial({
      color: haloColor,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(haloGeo, haloMat));

    group.userData.ownedGeometries = [coreGeo, haloGeo];
    group.userData.ownedMaterials = [coreMat, haloMat];
    this.scene.add(group);
    return group;
  }

  public createCrescentBladeGroup(
    origin: THREE.Vector3,
    yaw: number,
    aquatic = false,
    customColors?: { readonly blade: number; readonly edge: number },
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(origin);
    group.rotation.y = yaw;

    const mat = new THREE.MeshBasicMaterial({
      color: customColors
        ? customColors.blade
        : aquatic
          ? PALETTE.biolumCyan
          : PALETTE.frostRunes,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const bladeGeo = new THREE.RingGeometry(
      0.95,
      1.48,
      22,
      1,
      -Math.PI * 0.36,
      Math.PI * 0.72,
    );
    const blade = new THREE.Mesh(bladeGeo, mat);
    blade.rotation.x = -Math.PI / 2;
    blade.rotation.z = Math.PI / 2;
    group.add(blade);

    const edgeMat = new THREE.MeshBasicMaterial({
      color: customColors
        ? customColors.edge
        : aquatic
          ? PALETTE.serenaHairTips
          : PALETTE.iceHighlights,
    });
    const coreEdge = new THREE.Mesh(
      new THREE.TorusGeometry(1.38, 0.055, 6, 18, Math.PI * 0.72),
      edgeMat,
    );
    coreEdge.rotation.x = Math.PI / 2;
    coreEdge.rotation.z = -Math.PI * 0.36;
    group.add(coreEdge);

    group.userData.ownedMaterials = [mat, edgeMat];
    group.userData.ownedGeometries = [bladeGeo, coreEdge.geometry];
    this.scene.add(group);
    return group;
  }

  public createSpiralOrbGroup(
    origin: THREE.Vector3,
    aquatic = false,
    harmonic = false,
    customColors?: { readonly core: number; readonly halo: number },
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(origin);
    if (customColors) {
      const coreMat = new THREE.MeshBasicMaterial({
        color: customColors.core,
      });
      const haloMat = new THREE.MeshBasicMaterial({
        color: customColors.halo,
        transparent: true,
        opacity: 0.66,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(this.orbCoreGeo, coreMat));
      group.add(new THREE.Mesh(this.orbHaloGeo, haloMat));
      group.userData.ownedMaterials = [coreMat, haloMat];
    } else if (harmonic) {
      const coreMat = new THREE.MeshBasicMaterial({
        color: PALETTE.mikuCyan,
      });
      const haloMat = new THREE.MeshBasicMaterial({
        color: PALETTE.harmonicMagenta,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(this.orbCoreGeo, coreMat));
      group.add(new THREE.Mesh(this.orbHaloGeo, haloMat));
      group.userData.ownedMaterials = [coreMat, haloMat];
    } else if (aquatic) {
      const coreMat = new THREE.MeshBasicMaterial({
        color: PALETTE.serenaPearl,
      });
      const haloMat = new THREE.MeshBasicMaterial({
        color: PALETTE.serenaBubbleGlow,
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(this.orbCoreGeo, coreMat));
      group.add(new THREE.Mesh(this.orbHaloGeo, haloMat));
      group.userData.ownedMaterials = [coreMat, haloMat];
    } else {
      group.add(new THREE.Mesh(this.orbCoreGeo, this.orbCoreMat));
      group.add(new THREE.Mesh(this.orbHaloGeo, this.orbHaloMat));
    }
    this.scene.add(group);
    return group;
  }

  public createUmbralPulseGroup(origin: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.set(origin.x, 0.14, origin.z);

    const ringGeo = new THREE.RingGeometry(0.74, 1.0, 56);
    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.glowViolet,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    group.add(ringMesh);

    const torusGeo = new THREE.TorusGeometry(0.96, 0.075, 8, 48);
    const torusMat = new THREE.MeshBasicMaterial({
      color: PALETTE.pulseLavender,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const torusMesh = new THREE.Mesh(torusGeo, torusMat);
    torusMesh.rotation.x = Math.PI / 2;
    torusMesh.position.y = 0.22;
    group.add(torusMesh);

    const flashLight = new THREE.PointLight(
      PALETTE.glowViolet,
      12.0,
      PLAYER_CONFIG.pulseFlashLightDistance,
      1.6,
    );
    flashLight.position.y = 0.9;
    group.add(flashLight);

    const handles: PulseMeshHandles = { ringMat, torusMat, flashLight };
    group.userData.pulseHandles = handles;
    group.userData.ownedMaterials = [ringMat, torusMat];
    group.userData.ownedGeometries = [ringGeo, torusGeo];

    this.scene.add(group);
    this.spawnImpactBurst(
      new THREE.Vector3(origin.x, 0.5, origin.z),
      PLAYER_CONFIG.pulseImpactSparkCount,
    );
    return group;
  }

  public createFrostRingNovaGroup(origin: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.set(origin.x, 0.12, origin.z);

    const ringGeo = new THREE.RingGeometry(0.76, 1.0, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.frostRunes,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    group.add(ringMesh);

    const wallGeo = new THREE.TorusGeometry(0.92, 0.095, 8, 42);
    const wallMat = new THREE.MeshBasicMaterial({
      color: PALETTE.iceHighlights,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.rotation.x = Math.PI / 2;
    wallMesh.position.y = 0.24;
    group.add(wallMesh);

    const handles: FrostRingMeshHandles = { ringMat, wallMat };
    group.userData.frostRingHandles = handles;
    group.userData.ownedMaterials = [ringMat, wallMat];
    group.userData.ownedGeometries = [ringGeo, wallGeo];

    this.scene.add(group);
    this.spawnFrostShatterBurst(
      new THREE.Vector3(origin.x, 0.45, origin.z),
      16,
      7.5,
    );
    return group;
  }

  public createPhaseShockwaveGroup(
    origin: THREE.Vector3,
    phase: BossPhase,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(origin.x, 0.2, origin.z);

    const ringColor =
      phase === BOSS_PHASES.PHASE_3
        ? PALETTE.blindingFrost
        : PALETTE.warningRune;
    const domeColor =
      phase === BOSS_PHASES.PHASE_3
        ? PALETTE.sovereignIndigo
        : PALETTE.auroraSapphire;

    const ringGeo = new THREE.RingGeometry(0.6, 1.0, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    group.add(ringMesh);

    const domeGeo = new THREE.SphereGeometry(
      0.9,
      20,
      14,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.55,
    );
    const domeMat = new THREE.MeshBasicMaterial({
      color: domeColor,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(domeGeo, domeMat));

    const flashLight = new THREE.PointLight(ringColor, 15.0, 22, 1.5);
    flashLight.position.y = 1.6;
    group.add(flashLight);

    const handles: PhaseWaveMeshHandles = { ringMat, domeMat, flashLight };
    group.userData.phaseWaveHandles = handles;
    group.userData.ownedMaterials = [ringMat, domeMat];
    group.userData.ownedGeometries = [ringGeo, domeGeo];

    this.scene.add(group);
    return group;
  }

  public createLaserBeamGroup(
    origin: THREE.Vector3,
    side: -1 | 1,
    startAngle: number,
    beamLength: number,
    harmonic = false,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(origin);
    group.rotation.y = startAngle;

    const beamPrimary = harmonic
      ? side < 0
        ? PALETTE.harmonicEmerald
        : PALETTE.harmonicMagenta
      : side < 0
        ? PALETTE.warningRune
        : PALETTE.sovereignIndigo;
    const beamCore = harmonic
      ? side < 0
        ? PALETTE.mikuHairHighlight
        : PALETTE.voidCoreFuchsia
      : PALETTE.blindingFrost;

    const telegraphGeo = new THREE.CylinderGeometry(0.04, 0.04, beamLength, 6);
    telegraphGeo.rotateX(Math.PI / 2);
    telegraphGeo.translate(0, 0, beamLength * 0.5);
    const telegraphMat = new THREE.MeshBasicMaterial({
      color: beamPrimary,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const telegraphMesh = new THREE.Mesh(telegraphGeo, telegraphMat);
    group.add(telegraphMesh);

    const coreGeo = new THREE.CylinderGeometry(0.18, 0.22, beamLength, 10);
    coreGeo.rotateX(Math.PI / 2);
    coreGeo.translate(0, 0, beamLength * 0.5);
    const coreMat = new THREE.MeshBasicMaterial({
      color: beamCore,
      transparent: true,
      opacity: 0.96,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.visible = false;
    group.add(coreMesh);

    const outerGeo = new THREE.CylinderGeometry(0.46, 0.56, beamLength, 12);
    outerGeo.rotateX(Math.PI / 2);
    outerGeo.translate(0, 0, beamLength * 0.5);
    const outerMat = new THREE.MeshBasicMaterial({
      color: beamPrimary,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.visible = false;
    group.add(outerMesh);

    const muzzleGeo = new THREE.SphereGeometry(0.38, 12, 12);
    const muzzleMat = new THREE.MeshBasicMaterial({
      color: beamCore,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const muzzleMesh = new THREE.Mesh(muzzleGeo, muzzleMat);
    muzzleMesh.visible = false;
    group.add(muzzleMesh);

    const handles: LaserMeshHandles = {
      telegraphMesh,
      telegraphMat,
      coreMesh,
      coreMat,
      outerMesh,
      outerMat,
      muzzleMesh,
      muzzleMat,
    };
    group.userData.laserHandles = handles;
    group.userData.ownedMaterials = [telegraphMat, coreMat, outerMat, muzzleMat];
    group.userData.ownedGeometries = [telegraphGeo, coreGeo, outerGeo, muzzleGeo];

    this.scene.add(group);
    return group;
  }

  /**
   * Builds a persistent glowing magenta hard-light laser fence left behind Miku's stage dashes.
   */
  public createLaserWallGroup(
    startPos: THREE.Vector3,
    angle: number,
    length: number,
    height: number,
  ): THREE.Group {
    const safeLen = Math.max(0.8, length);
    const group = new THREE.Group();
    group.position.set(startPos.x, 0.04, startPos.z);
    group.rotation.y = angle;

    const curtainGeo = new THREE.PlaneGeometry(safeLen, height);
    curtainGeo.rotateY(Math.PI / 2);
    curtainGeo.translate(0, height * 0.5, safeLen * 0.5);
    const curtainMat = new THREE.MeshBasicMaterial({
      color: PALETTE.harmonicMagenta,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(curtainGeo, curtainMat));

    const railGeo = new THREE.CylinderGeometry(0.055, 0.055, safeLen, 6);
    railGeo.rotateX(Math.PI / 2);
    railGeo.translate(0, 0, safeLen * 0.5);
    const beamMat = new THREE.MeshBasicMaterial({
      color: PALETTE.voidCoreFuchsia,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const railHeights = [0.22, height * 0.52, height * 0.92];
    for (let i = 0; i < railHeights.length; i++) {
      const rail = new THREE.Mesh(railGeo, beamMat);
      rail.position.y = railHeights[i] ?? 0.5;
      group.add(rail);
    }

    const pylonGeo = new THREE.CylinderGeometry(0.11, 0.16, height * 1.05, 6);
    const pylonMat = new THREE.MeshBasicMaterial({
      color: PALETTE.harmonicEmerald,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (const zOff of [0, safeLen] as const) {
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(0, height * 0.525, zOff);
      group.add(pylon);
    }

    const handles: LaserWallMeshHandles = { curtainMat, beamMat, pylonMat };
    group.userData.laserWallHandles = handles;
    group.userData.ownedMaterials = [curtainMat, beamMat, pylonMat];
    group.userData.ownedGeometries = [curtainGeo, railGeo, pylonGeo];

    this.scene.add(group);
    return group;
  }

  /**
   * Builds a destructible floating Harmonic Amp Node summoned by Miku in Phase II+.
   */
  public createHarmonicAmpNodeGroup(origin: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(origin);

    const shellGeo = new THREE.OctahedronGeometry(0.46, 0);
    const shellMat = ToonAssets.createToonMaterial(PALETTE.cyberObsidian, {
      emissive: PALETTE.cyberStageMid,
      emissiveIntensity: 0.25,
    });
    const { group: shellObj } = ToonAssets.createOutlinedMesh(
      shellGeo,
      shellMat,
      1.07,
      true,
    );
    group.add(shellObj);

    const coreGeo = new THREE.OctahedronGeometry(0.28, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: PALETTE.harmonicMagenta,
      transparent: true,
      opacity: 0.94,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    group.add(coreMesh);

    const outerRingGeo = new THREE.TorusGeometry(0.76, 0.036, 8, 24);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.harmonicEmerald,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringOuter = new THREE.Mesh(outerRingGeo, outerRingMat);
    group.add(ringOuter);

    const innerRingGeo = new THREE.TorusGeometry(0.58, 0.028, 8, 20);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.harmonicMagenta,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringInner = new THREE.Mesh(innerRingGeo, innerRingMat);
    ringInner.rotation.x = Math.PI / 2;
    group.add(ringInner);

    const handles: HarmonicAmpNodeHandles = {
      ringOuter,
      ringInner,
      coreMesh,
      coreMat,
    };
    group.userData.ampNodeHandles = handles;
    group.userData.ownedMaterials = [
      shellMat,
      coreMat,
      outerRingMat,
      innerRingMat,
    ];
    group.userData.ownedGeometries = [
      shellGeo,
      coreGeo,
      outerRingGeo,
      innerRingGeo,
    ];

    this.scene.add(group);
    return group;
  }

  public createIcePillarGroup(
    origin: THREE.Vector3,
    radius: number,
    aquatic = false,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(origin.x, 0.05, origin.z);

    const runeGeo = new THREE.RingGeometry(radius - 0.16, radius, 36);
    const runeMat = new THREE.MeshBasicMaterial({
      color: aquatic ? PALETTE.biolumCyan : PALETTE.warningRune,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const runeRing = new THREE.Mesh(runeGeo, runeMat);
    runeRing.rotation.x = -Math.PI / 2;
    group.add(runeRing);

    const fillGeo = new THREE.CircleGeometry(radius - 0.12, 32);
    const fillMat = new THREE.MeshBasicMaterial({
      color: aquatic ? PALETTE.serenaTailViolet : PALETTE.sovereignIndigo,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fillDisc = new THREE.Mesh(fillGeo, fillMat);
    fillDisc.rotation.x = -Math.PI / 2;
    fillDisc.scale.setScalar(0.05);
    group.add(fillDisc);

    const spireGroup = new THREE.Group();
    spireGroup.visible = false;
    spireGroup.scale.set(1, 0.01, 1);

    const mainGeo = aquatic
      ? new THREE.CylinderGeometry(radius * 0.42, radius * 0.72, 6.8, 12)
      : new THREE.ConeGeometry(1.48, 6.4, 6);
    const spireMat = new THREE.MeshStandardMaterial({
      color: aquatic ? PALETTE.biolumCyan : PALETTE.warningRune,
      emissive: new THREE.Color(
        aquatic ? PALETTE.serenaWhirlpoolCore : PALETTE.auroraSapphire,
      ),
      emissiveIntensity: aquatic ? 0.72 : 0.55,
      transparent: true,
      opacity: 0.78,
      roughness: 0.18,
      metalness: 0.3,
      flatShading: true,
    });
    const mainSpire = new THREE.Mesh(mainGeo, spireMat);
    mainSpire.position.y = aquatic ? 3.4 : 3.2;
    spireGroup.add(mainSpire);

    const innerGeo = aquatic
      ? new THREE.CylinderGeometry(radius * 0.24, radius * 0.4, 6.0, 10)
      : new THREE.ConeGeometry(0.85, 5.2, 5);
    const coreMat = new THREE.MeshBasicMaterial({
      color: aquatic ? PALETTE.serenaPearl : PALETTE.blindingFrost,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
    });
    const innerSpire = new THREE.Mesh(innerGeo, coreMat);
    innerSpire.position.y = aquatic ? 3.0 : 2.6;
    spireGroup.add(innerSpire);

    group.add(spireGroup);

    const handles: IcePillarMeshHandles = {
      runeRing,
      runeMat,
      fillDisc,
      fillMat,
      spireGroup,
      spireMat,
      coreMat,
    };
    group.userData.pillarHandles = handles;
    group.userData.ownedMaterials = [runeMat, fillMat, spireMat, coreMat];
    group.userData.ownedGeometries = [runeGeo, fillGeo, mainGeo, innerGeo];

    this.scene.add(group);
    return group;
  }

  /**
   * Swirling floor whirlpool vortex ring spawned during Serena's Phase III Abyssal Undertow.
   */
  public createAbyssalWhirlpoolGroup(
    origin: THREE.Vector3,
    radius: number,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(origin.x, 0.08, origin.z);

    const outerGeo = new THREE.RingGeometry(radius * 0.72, radius, 64);
    const outerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.biolumCyan,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);
    outerRing.rotation.x = -Math.PI / 2;
    group.add(outerRing);

    const midGeo = new THREE.RingGeometry(radius * 0.36, radius * 0.62, 56);
    const midMat = new THREE.MeshBasicMaterial({
      color: PALETTE.serenaTailViolet,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const midRing = new THREE.Mesh(midGeo, midMat);
    midRing.rotation.x = -Math.PI / 2;
    midRing.position.y = 0.02;
    group.add(midRing);

    const innerGeo = new THREE.TorusGeometry(radius * 0.24, 0.14, 8, 42);
    const innerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.serenaHairTips,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerRing = new THREE.Mesh(innerGeo, innerMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.06;
    group.add(innerRing);

    const vortexLight = new THREE.PointLight(
      PALETTE.biolumCyan,
      10.5,
      radius * 1.4,
      1.6,
    );
    vortexLight.position.y = 1.4;
    group.add(vortexLight);

    const handles: AbyssalWhirlpoolMeshHandles = {
      outerRing,
      outerMat,
      midRing,
      midMat,
      innerRing,
      innerMat,
      vortexLight,
    };
    group.userData.whirlpoolHandles = handles;
    group.userData.ownedMaterials = [outerMat, midMat, innerMat];
    group.userData.ownedGeometries = [outerGeo, midGeo, innerGeo];

    this.scene.add(group);
    return group;
  }

  /**
   * Geralt's glowing violet Yrden floor rune trap with a pre-allocated 2-vertex
   * violet tether line connecting the trap center to the Dark Mage while slowed.
   */
  public createYrdenTrapGroup(
    origin: THREE.Vector3,
    radius: number,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(origin.x, 0.06, origin.z);

    const outerGeo = new THREE.RingGeometry(radius - 0.18, radius, 42);
    const outerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.geraltYrdenViolet,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);
    outerRing.rotation.x = -Math.PI / 2;
    group.add(outerRing);

    const sigilGeo = new THREE.RingGeometry(radius * 0.45, radius * 0.62, 6);
    const sigilMat = new THREE.MeshBasicMaterial({
      color: PALETTE.yenneferLilac,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sigilRing = new THREE.Mesh(sigilGeo, sigilMat);
    sigilRing.rotation.x = -Math.PI / 2;
    sigilRing.position.y = 0.02;
    group.add(sigilRing);

    const tetherPositions = new Float32Array([0, 0.14, 0, 0, 1.05, 0]);
    const tetherGeo = new THREE.BufferGeometry();
    tetherGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(tetherPositions, 3),
    );
    const tetherMat = new THREE.LineBasicMaterial({
      color: PALETTE.yenneferLilac,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const tetherLine = new THREE.Line(tetherGeo, tetherMat);
    tetherLine.visible = false;
    tetherLine.frustumCulled = false;
    group.add(tetherLine);

    const trapLight = new THREE.PointLight(
      PALETTE.geraltYrdenViolet,
      5.2,
      radius * 2.1,
      1.7,
    );
    trapLight.position.y = 0.85;
    group.add(trapLight);

    const handles: YrdenTrapMeshHandles = {
      outerRing,
      outerMat,
      sigilRing,
      sigilMat,
      tetherLine,
      tetherMat,
      tetherPositions,
      trapLight,
    };
    group.userData.yrdenHandles = handles;
    group.userData.ownedMaterials = [outerMat, sigilMat, tetherMat];
    group.userData.ownedGeometries = [outerGeo, sigilGeo, tetherGeo];

    this.scene.add(group);
    return group;
  }

  /**
   * Yennefer's Chaos Lightning telegraph ring + jagged forked royal-violet lightning strike.
   */
  public createChaosLightningGroup(
    origin: THREE.Vector3,
    radius: number,
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(origin.x, 0.06, origin.z);

    const runeGeo = new THREE.RingGeometry(radius - 0.14, radius, 32);
    const runeMat = new THREE.MeshBasicMaterial({
      color: PALETTE.amethystTrim,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const runeRing = new THREE.Mesh(runeGeo, runeMat);
    runeRing.rotation.x = -Math.PI / 2;
    group.add(runeRing);

    const fillGeo = new THREE.CircleGeometry(radius - 0.12, 28);
    const fillMat = new THREE.MeshBasicMaterial({
      color: PALETTE.yenneferHairHighlight,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fillDisc = new THREE.Mesh(fillGeo, fillMat);
    fillDisc.rotation.x = -Math.PI / 2;
    fillDisc.scale.setScalar(0.08);
    group.add(fillDisc);

    // Pre-built jagged forked royal-violet lightning bolt group
    const boltGroup = new THREE.Group();
    boltGroup.visible = false;
    const boltCoreMat = new THREE.MeshBasicMaterial({
      color: PALETTE.pureWhite,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const boltForkMat = new THREE.MeshBasicMaterial({
      color: PALETTE.yenneferVioletEye,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const mainCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 12.0, 0),
      new THREE.Vector3(0.42, 9.2, -0.22),
      new THREE.Vector3(-0.36, 6.4, 0.28),
      new THREE.Vector3(0.28, 3.6, -0.18),
      new THREE.Vector3(-0.14, 1.5, 0.12),
      new THREE.Vector3(0, 0.05, 0),
    ]);
    const mainBoltGeo = new THREE.TubeGeometry(mainCurve, 14, 0.11, 6, false);
    const haloBoltGeo = new THREE.TubeGeometry(mainCurve, 14, 0.24, 6, false);
    boltGroup.add(
      new THREE.Mesh(mainBoltGeo, boltCoreMat),
      new THREE.Mesh(haloBoltGeo, boltForkMat),
    );

    const fork1Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.36, 6.4, 0.28),
      new THREE.Vector3(-0.98, 4.5, 0.62),
      new THREE.Vector3(-1.32, 2.2, 0.84),
    ]);
    const fork2Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.28, 3.6, -0.18),
      new THREE.Vector3(0.92, 2.1, -0.58),
      new THREE.Vector3(1.18, 0.45, -0.78),
    ]);
    const fork1Geo = new THREE.TubeGeometry(fork1Curve, 6, 0.065, 5, false);
    const fork2Geo = new THREE.TubeGeometry(fork2Curve, 6, 0.06, 5, false);
    boltGroup.add(
      new THREE.Mesh(fork1Geo, boltForkMat),
      new THREE.Mesh(fork2Geo, boltForkMat),
    );
    group.add(boltGroup);

    const strikeLight = new THREE.PointLight(
      PALETTE.yenneferVioletEye,
      0,
      11.0,
      1.6,
    );
    strikeLight.position.y = 1.6;
    group.add(strikeLight);

    const handles: ChaosLightningMeshHandles = {
      runeRing,
      runeMat,
      fillDisc,
      fillMat,
      boltGroup,
      boltCoreMat,
      boltForkMat,
      strikeLight,
    };
    group.userData.chaosLightningHandles = handles;
    group.userData.ownedMaterials = [
      runeMat,
      fillMat,
      boltCoreMat,
      boltForkMat,
    ];
    group.userData.ownedGeometries = [
      runeGeo,
      fillGeo,
      mainBoltGeo,
      haloBoltGeo,
      fork1Geo,
      fork2Geo,
    ];

    this.scene.add(group);
    return group;
  }

  /**
   * Yennefer's vertical royal-violet Spatial Rift portal oval spawned at departure & arrival.
   */
  public createSpatialRiftGroup(origin: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.position.set(origin.x, 1.25, origin.z);

    const coreGeo = new THREE.CircleGeometry(0.92, 24);
    const coreMat = new THREE.MeshBasicMaterial({
      color: PALETTE.yenneferHairHighlight,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.scale.set(0.68, 1.38, 1.0);
    group.add(coreMesh);

    const rimGeo = new THREE.TorusGeometry(0.95, 0.075, 8, 28);
    const rimMat = new THREE.MeshBasicMaterial({
      color: PALETTE.yenneferLilac,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.scale.set(0.68, 1.38, 1.0);
    group.add(rimMesh);

    const riftLight = new THREE.PointLight(
      PALETTE.yenneferVioletEye,
      8.5,
      8.0,
      1.6,
    );
    group.add(riftLight);

    const handles: SpatialRiftMeshHandles = {
      coreMesh,
      coreMat,
      rimMesh,
      rimMat,
      riftLight,
    };
    group.userData.spatialRiftHandles = handles;
    group.userData.ownedMaterials = [coreMat, rimMat];
    group.userData.ownedGeometries = [coreGeo, rimGeo];

    this.scene.add(group);
    return group;
  }

  public spawnTrailSpark(position: THREE.Vector3): void {
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.35 ? PALETTE.glowViolet : PALETTE.voidCoreFuchsia,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.sparkGeo, mat);
    mesh.position.set(
      position.x + (Math.random() - 0.5) * 0.14,
      position.y + (Math.random() - 0.5) * 0.14,
      position.z + (Math.random() - 0.5) * 0.14,
    );

    const baseScale = 0.55 + Math.random() * 0.55;
    mesh.scale.setScalar(baseScale);
    this.scene.add(mesh);

    this.particles.push({
      mesh,
      mat,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.3) * 1.2,
        (Math.random() - 0.5) * 1.4,
      ),
      gravity: 0,
      spinX: 8,
      spinY: 10,
      life: 0.22,
      maxLife: 0.22,
      baseScale,
    });
  }

  public spawnImpactBurst(
    origin: THREE.Vector3,
    count: number = PLAYER_CONFIG.boltImpactSparkCount,
  ): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color:
          i % 3 === 0
            ? PALETTE.voidCoreFuchsia
            : i % 2 === 0
              ? PALETTE.glowViolet
              : PALETTE.amethystTrim,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.copy(origin);

      const baseScale = 0.65 + Math.random() * 0.9;
      mesh.scale.setScalar(baseScale);
      this.scene.add(mesh);

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        0.15 + Math.random() * 1.15,
        (Math.random() - 0.5) * 2,
      ).normalize();

      this.particles.push({
        mesh,
        mat,
        velocity: dir.multiplyScalar(3.5 + Math.random() * 5.5),
        gravity: 8.5,
        spinX: 8,
        spinY: 10,
        life: 0.34 + Math.random() * 0.2,
        maxLife: 0.54,
        baseScale,
      });
    }
  }

  public spawnFrostShatterBurst(
    origin: THREE.Vector3,
    count = 14,
    maxSpeed = 7.2,
  ): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? PALETTE.iceHighlights : PALETTE.frostRunes,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.shardGeo, mat);
      mesh.position.copy(origin);
      const scale = 0.65 + Math.random() * 1.15;
      mesh.scale.set(scale * 0.6, scale * 1.5, scale * 0.6);
      this.scene.add(mesh);

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        0.25 + Math.random() * 1.25,
        (Math.random() - 0.5) * 2,
      ).normalize();

      this.particles.push({
        mesh,
        mat,
        velocity: dir.multiplyScalar(maxSpeed * (0.35 + Math.random() * 0.65)),
        gravity: 9.5,
        spinX: 7,
        spinY: 9,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        baseScale: scale,
      });
    }
  }

  public spawnTelegraphRing(origin: THREE.Vector3): void {
    const teleMat = new THREE.MeshBasicMaterial({
      color: PALETTE.iceHighlights,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const teleMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 2.2, 36),
      teleMat,
    );
    teleMesh.rotation.x = -Math.PI / 2;
    teleMesh.position.set(origin.x, 0.08, origin.z);
    this.scene.add(teleMesh);

    const dur = BOSS_CONFIG.phase1.novaTelegraph;
    this.telegraphRings.push({
      mesh: teleMesh,
      mat: teleMat,
      life: dur,
      maxLife: dur,
    });
  }

  public spawnAfterimage(mageRig: DarkMageRig): void {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.amethystTrim,
      transparent: true,
      opacity: PLAYER_CONFIG.afterimageOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ghost = mageRig.createAfterimageMesh(mat);
    this.scene.add(ghost);

    this.afterimages.push({
      group: ghost,
      mat,
      life: PLAYER_CONFIG.afterimageLife,
      maxLife: PLAYER_CONFIG.afterimageLife,
    });
  }

  /**
   * Spawns a gentle rising pale-silver/frost exhaustion vapor wisp above collapsed Marina.
   */
  public spawnVaporWisp(origin: THREE.Vector3): void {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.iceHighlights,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.orbCoreGeo, mat);
    mesh.position.set(
      origin.x + (Math.random() - 0.5) * 0.26,
      origin.y + 0.08,
      origin.z + (Math.random() - 0.5) * 0.26,
    );
    const baseScale = 0.35 + Math.random() * 0.25;
    mesh.scale.setScalar(baseScale);
    this.scene.add(mesh);

    this.particles.push({
      mesh,
      mat,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * DIORAMA_CONFIG.vaporDriftSpeed,
        DIORAMA_CONFIG.vaporRiseSpeed + Math.random() * 0.25,
        (Math.random() - 0.5) * DIORAMA_CONFIG.vaporDriftSpeed,
      ),
      gravity: 0,
      spinX: 1.5,
      spinY: 2.0,
      life: DIORAMA_CONFIG.vaporLife,
      maxLife: DIORAMA_CONFIG.vaporLife,
      baseScale,
    });
  }

  /**
   * Spawns floating Siphon Kiss / Endless Savor particles (pink/frost hearts & surge sparks).
   */
  public spawnFinisherParticle(
    origin: THREE.Vector3,
    throttle: DrainThrottleMode,
  ): void {
    const isSurge = throttle === DRAIN_THROTTLE_MODES.SURGE;
    const isSavor = throttle === DRAIN_THROTTLE_MODES.SAVOR;
    const color = isSurge
      ? Math.random() > 0.4
        ? PALETTE.voidRibbon
        : PALETTE.frostRibbon
      : isSavor
        ? Math.random() > 0.45
          ? PALETTE.roseHeart
          : PALETTE.iceHighlights
        : Math.random() > 0.5
          ? PALETTE.roseHeart
          : PALETTE.frostRibbon;

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.sparkGeo, mat);
    mesh.position.set(
      origin.x + (Math.random() - 0.5) * 0.55,
      origin.y + (Math.random() - 0.5) * 0.35,
      origin.z + (Math.random() - 0.5) * 0.55,
    );
    const baseScale = (isSurge ? 1.15 : 0.72) + Math.random() * 0.45;
    mesh.scale.setScalar(baseScale);
    this.scene.add(mesh);

    const speedMult = isSurge ? 2.4 : isSavor ? 0.55 : 1.0;
    this.particles.push({
      mesh,
      mat,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.8 * speedMult,
        (0.65 + Math.random() * 0.6) * speedMult,
        (Math.random() - 0.5) * 0.8 * speedMult,
      ),
      gravity: 0,
      spinX: 4,
      spinY: 6,
      life: isSavor ? 1.1 : 0.68,
      maxLife: isSavor ? 1.1 : 0.68,
      baseScale,
    });
  }

  /**
   * Spawns crisp star sparks when flicking the boss's head accessory ([F] taunt).
   */
  public spawnTiaraFlickSparks(
    origin: THREE.Vector3,
    colorA: number = PALETTE.iceHighlights,
    colorB: number = PALETTE.frostRunes,
  ): void {
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? colorA : colorB,
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.shardGeo, mat);
      mesh.position.copy(origin);
      const scale = 0.65 + Math.random() * 1.1;
      mesh.scale.set(scale * 0.6, scale * 1.45, scale * 0.6);
      this.scene.add(mesh);

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        0.25 + Math.random() * 1.25,
        (Math.random() - 0.5) * 2,
      ).normalize();

      this.particles.push({
        mesh,
        mat,
        velocity: dir.multiplyScalar(4.4 * (0.35 + Math.random() * 0.65)),
        gravity: 9.2,
        spinX: 7,
        spinY: 9,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        baseScale: scale,
      });
    }
  }

  public attachToScene(obj: THREE.Object3D): void {
    if (obj.parent !== this.scene) {
      this.scene.add(obj);
    }
  }

  public detachAndDispose(obj: THREE.Object3D): void {
    this.scene.remove(obj);

    const ownedMaterials = obj.userData.ownedMaterials as
      | THREE.Material[]
      | undefined;
    if (ownedMaterials) {
      for (let i = 0; i < ownedMaterials.length; i++) {
        ownedMaterials[i]?.dispose();
      }
    }

    const ownedGeometries = obj.userData.ownedGeometries as
      | THREE.BufferGeometry[]
      | undefined;
    if (ownedGeometries) {
      for (let i = 0; i < ownedGeometries.length; i++) {
        ownedGeometries[i]?.dispose();
      }
    }

    const cloneMat = obj.userData.cloneMat as THREE.Material | undefined;
    cloneMat?.dispose();
    const baseRingMat = obj.userData.baseRingMat as THREE.Material | undefined;
    baseRingMat?.dispose();
  }

  public updateTransientVfx(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      if (!pt) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        pt.mat.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      const ratio = pt.life / pt.maxLife;
      pt.mesh.position.addScaledVector(pt.velocity, dt);
      if (pt.gravity > 0) {
        pt.velocity.y -= pt.gravity * dt;
      }
      pt.mesh.rotation.x += dt * pt.spinX;
      pt.mesh.rotation.y += dt * pt.spinY;
      pt.mesh.scale.setScalar(pt.baseScale * ratio);
      pt.mat.opacity = ratio * 0.9;
    }

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const ghost = this.afterimages[i];
      if (!ghost) continue;
      ghost.life -= dt;
      if (ghost.life <= 0) {
        this.scene.remove(ghost.group);
        ghost.mat.dispose();
        this.afterimages.splice(i, 1);
        continue;
      }
      ghost.mat.opacity =
        (ghost.life / ghost.maxLife) * PLAYER_CONFIG.afterimageOpacity;
    }

    for (let i = this.telegraphRings.length - 1; i >= 0; i--) {
      const tr = this.telegraphRings[i];
      if (!tr) continue;
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        tr.mat.dispose();
        this.telegraphRings.splice(i, 1);
        continue;
      }
      const p = 1 - tr.life / tr.maxLife;
      tr.mesh.scale.setScalar(0.65 + p * 0.95);
      tr.mat.opacity = (1 - p) * 0.65;
    }
  }

  public clearTransientVfx(): void {
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      if (!pt) continue;
      this.scene.remove(pt.mesh);
      pt.mat.dispose();
    }
    this.particles.length = 0;

    for (let i = 0; i < this.afterimages.length; i++) {
      const ghost = this.afterimages[i];
      if (!ghost) continue;
      this.scene.remove(ghost.group);
      ghost.mat.dispose();
    }
    this.afterimages.length = 0;

    for (let i = 0; i < this.telegraphRings.length; i++) {
      const tr = this.telegraphRings[i];
      if (!tr) continue;
      this.scene.remove(tr.mesh);
      tr.mesh.geometry.dispose();
      tr.mat.dispose();
    }
    this.telegraphRings.length = 0;
  }
}
