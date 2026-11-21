import * as THREE from 'three';
import {
  ARENA_CONFIG,
  BOSS_CONFIG,
  BOSS_EXPRESSIONS,
  BOSS_PHASES,
  DIORAMA_CONFIG,
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_POSE_IDS,
  GAME_STATES,
  MIKU_CONFIG,
  PALETTE,
  SIPHON_GALLERY_CONFIG,
  type BossExpression,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';
import { ToonAssets } from '../../engine/ToonAssets';
import {
  applyMaterialBleach,
  computeFinisherHeadChoreography,
  restoreDrainableMaterials,
  type BossRigAdapter,
  type FinisherHeadChoreography,
  type MaterialBleachMetadata,
} from './BossBase';

interface TwinTailChain {
  readonly side: -1 | 1;
  readonly rootMount: THREE.Group;
  readonly seg1: THREE.Group;
  readonly seg2: THREE.Group;
  readonly seg3: THREE.Group;
  readonly seg4: THREE.Group;
}

interface PleatPanel {
  readonly pivot: THREE.Group;
  readonly angle: number;
}

interface PhaseRingHandles {
  readonly outerRing: THREE.Mesh;
  readonly innerRing: THREE.Mesh;
  readonly outerMat: THREE.MeshBasicMaterial;
  readonly innerMat: THREE.MeshBasicMaterial;
}

interface MikuFinisherPoseCache {
  initialized: boolean;
  bodyY: number;
  torsoX: number;
  torsoZ: number;
  headX: number;
  headZ: number;
  leftHipX: number;
  rightHipX: number;
  leftKneeX: number;
  rightKneeX: number;
  leftShoulderX: number;
  leftShoulderZ: number;
  rightShoulderX: number;
  rightShoulderZ: number;
  leftElbowX: number;
  rightElbowX: number;
  skirtBasePitch: number;
}

/**
 * Sovereign Cyber-Idol Boss Rig: Miku, the Harmonic Sovereign (Realm III — Astral Concert Stage).
 * Implements BossRigAdapter (LSP) with an unmistakable cel-shaded silhouette:
 * - High-mounted articulated 4-segment flared emerald-cyan twin-tails with velocity-reactive sway
 * - Iconic black-and-magenta square/cubic hair-ties + straight-cut emerald-cyan bangs
 * - Dark sleeveless stage vest, glowing cyan necktie, bare shoulders + detached flared cyber arm-warmers,
 *   short pleated skirt with cyan hem trim, thigh-high cyber boots, and floating headset mic
 * - 512x512 CanvasTexture emerald anime face, zero-gap lip alignment across [1-4], and Victory/Defeat dioramas
 */
export class MikuRig implements BossRigAdapter {
  public readonly id = MIKU_CONFIG.id;
  public readonly displayName = MIKU_CONFIG.displayName;
  public readonly title = MIKU_CONFIG.title;
  public readonly waistWrapRadius = FINISHER_CONFIG.mikuWaistWrapRadius;

  public readonly root = new THREE.Group();
  public readonly headAnchor = new THREE.Object3D();
  public readonly headAccessory = new THREE.Group();
  public readonly leftWristAnchor = new THREE.Object3D();
  public readonly rightWristAnchor = new THREE.Object3D();
  public readonly drainableMaterials: THREE.MeshToonMaterial[] = [];
  public readonly originalColors: THREE.Color[] = [];

  private readonly bleachMetadata: MaterialBleachMetadata[] = [];
  private readonly parent: THREE.Object3D;

  // Materials
  private readonly matSkin: THREE.MeshToonMaterial;
  private readonly matHairEmerald: THREE.MeshToonMaterial;
  private readonly matHairCyan: THREE.MeshToonMaterial;
  private readonly matHairHighlight: THREE.MeshToonMaterial;
  private readonly matVestDark: THREE.MeshToonMaterial;
  private readonly matSkirtDark: THREE.MeshToonMaterial;
  private readonly matBootDark: THREE.MeshToonMaterial;
  private readonly matTieCyan: THREE.MeshToonMaterial;
  private readonly matMagentaAccent: THREE.MeshToonMaterial;
  private readonly matCubeBlack: THREE.MeshToonMaterial;
  private readonly matChrome: THREE.MeshToonMaterial;
  private readonly matFaceOverlay: THREE.MeshBasicMaterial;

  private readonly faceCanvas: HTMLCanvasElement;
  private readonly faceCtx: CanvasRenderingContext2D;
  private readonly faceTexture: THREE.CanvasTexture;

  // Skeleton Hierarchy
  private readonly bodyPivot = new THREE.Group();
  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftLegPivot = new THREE.Group();
  private readonly leftKneePivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();
  private readonly rightKneePivot = new THREE.Group();
  private readonly leftShoulderPivot = new THREE.Group();
  private readonly leftElbowPivot = new THREE.Group();
  private readonly rightShoulderPivot = new THREE.Group();
  private readonly rightElbowPivot = new THREE.Group();
  private readonly leftHandAnchor = new THREE.Object3D();
  private readonly rightHandAnchor = new THREE.Object3D();
  private readonly necktiePivot = new THREE.Group();

  // Articulated Twin-Tails & Short Pleated Skirt
  private readonly twinTails: TwinTailChain[] = [];
  private readonly skirtPanels: PleatPanel[] = [];

  // Stage Halo & Phase Equalizer Rings
  private readonly harmonicHalo = new THREE.Group();
  private readonly phaseAuraRings = new THREE.Group();
  private phaseAuraHandles!: PhaseRingHandles;
  private stageLight!: THREE.PointLight;

  // Runtime Animation & Velocity Sway State
  private currentExpression: BossExpression = BOSS_EXPRESSIONS.COMBAT;
  private currentDrainProgress = 0;
  private phaseLevel: BossPhase = BOSS_PHASES.PHASE_1;
  private targetAscendY = 0;
  private currentAscendY = 0;
  private staggerBlend = 0;
  private hitFlashTimer = 0;
  private castAnimTimer = 0;
  private accessoryFlickTimer = 0;
  private captiveFaceRedrawTimer = 0;
  private hasPrevPos = false;
  private readonly prevWorldPos = new THREE.Vector3();
  private smoothedSpeed = 0;
  private smoothedLateralVel = 0;

  private readonly finisherPoseState: MikuFinisherPoseCache = {
    initialized: false,
    bodyY: 0.48,
    torsoX: 0.14,
    torsoZ: 0,
    headX: -0.38,
    headZ: 0,
    leftHipX: -0.18,
    rightHipX: -0.18,
    leftKneeX: 1.72,
    rightKneeX: 1.72,
    leftShoulderX: -0.34,
    leftShoulderZ: 0.24,
    rightShoulderX: -0.34,
    rightShoulderZ: -0.24,
    leftElbowX: -0.68,
    rightElbowX: -0.68,
    skirtBasePitch: -0.32,
  };

  constructor(parent: THREE.Object3D) {
    this.parent = parent;
    this.root.name = 'MikuTheHarmonicSovereign';

    this.matSkin = ToonAssets.createToonMaterial(PALETTE.mikuSkin, {
      emissive: PALETTE.mikuSkin,
      emissiveIntensity: 0.05,
    });
    this.matHairEmerald = ToonAssets.createToonMaterial(
      PALETTE.mikuHairEmerald,
      {
        emissive: PALETTE.harmonicEmerald,
        emissiveIntensity: 0.24,
      },
    );
    this.matHairCyan = ToonAssets.createToonMaterial(PALETTE.mikuHairCyan, {
      emissive: PALETTE.mikuCyan,
      emissiveIntensity: 0.28,
    });
    this.matHairHighlight = ToonAssets.createToonMaterial(
      PALETTE.mikuHairHighlight,
      {
        emissive: PALETTE.mikuCyan,
        emissiveIntensity: 0.36,
      },
    );
    this.matVestDark = ToonAssets.createToonMaterial(PALETTE.mikuVestDark, {
      emissive: PALETTE.cyberStageMid,
      emissiveIntensity: 0.12,
    });
    this.matSkirtDark = ToonAssets.createToonMaterial(PALETTE.mikuSkirtDark, {
      emissive: PALETTE.cyberStageDark,
      emissiveIntensity: 0.1,
      side: THREE.DoubleSide,
    });
    this.matBootDark = ToonAssets.createToonMaterial(PALETTE.mikuBootDark, {
      emissive: PALETTE.cyberStageDark,
      emissiveIntensity: 0.1,
    });
    this.matTieCyan = ToonAssets.createToonMaterial(PALETTE.mikuTieCyan, {
      emissive: PALETTE.mikuCyan,
      emissiveIntensity: 0.48,
      side: THREE.DoubleSide,
    });
    this.matMagentaAccent = ToonAssets.createToonMaterial(
      PALETTE.mikuTieCubeMagenta,
      {
        emissive: PALETTE.harmonicMagenta,
        emissiveIntensity: 0.52,
      },
    );
    this.matCubeBlack = ToonAssets.createToonMaterial(PALETTE.mikuTieCubeBlack, {
      emissive: PALETTE.cyberStageMid,
      emissiveIntensity: 0.08,
    });
    this.matChrome = ToonAssets.createToonMaterial(PALETTE.trussChrome, {
      emissive: PALETTE.mikuCyan,
      emissiveIntensity: 0.2,
    });

    // Register emerald-cyan twin-tails, hair, necktie, trim, and magenta accents for 0%->100% ash-silver bleach
    this.registerDrainable(this.matHairEmerald);
    this.registerDrainable(this.matHairCyan);
    this.registerDrainable(this.matHairHighlight);
    this.registerDrainable(this.matTieCyan);
    this.registerDrainable(this.matMagentaAccent);
    this.registerDrainable(this.matChrome);

    // 512x512 Procedural Anime Face Canvas (bright emerald eyes)
    const size = ARENA_CONFIG.faceTextureSize;
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = size;
    this.faceCanvas.height = size;
    const ctx = this.faceCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to initialize 2D context for Miku face canvas.');
    }
    this.faceCtx = ctx;
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.faceTexture.anisotropy = 4;

    this.matFaceOverlay = new THREE.MeshBasicMaterial({
      map: this.faceTexture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });

    this.buildSkeletonAndMeshes();
    this.setExpression(BOSS_EXPRESSIONS.COMBAT);
    this.resetForEncounter(0);
    this.root.visible = false;
    this.parent.add(this.root);
  }

  private registerDrainable(mat: THREE.MeshToonMaterial): void {
    this.drainableMaterials.push(mat);
    this.originalColors.push(mat.color.clone());
    this.bleachMetadata.push({
      originalEmissive: mat.emissive.clone(),
      originalEmissiveIntensity: mat.emissiveIntensity,
    });
  }

  private buildSkeletonAndMeshes(): void {
    this.bodyPivot.position.set(
      0,
      MIKU_CONFIG.combatBaseBodyY + MIKU_CONFIG.floatHeight,
      0,
    );
    this.root.add(this.bodyPivot);

    this.buildLegsAndThighHighBoots();
    this.buildSleevelessVestAndPleatedSkirt();
    this.buildBareShouldersAndFlaredArmWarmers();
    this.buildHeadBangsAndHeadsetMic();
    this.buildTwinTailsAndCubicHairTies();
    this.buildHarmonicHalo();
    this.buildPhaseAuraRings();
  }

  private buildLegsAndThighHighBoots(): void {
    const buildLeg = (
      side: -1 | 1,
      hipPivot: THREE.Group,
      kneePivot: THREE.Group,
    ): void => {
      hipPivot.position.set(side * 0.095, -0.02, 0);
      this.bodyPivot.add(hipPivot);

      // Bare upper thigh (distinct idol silhouette between short skirt & thigh-high boot)
      const { group: upperThigh } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.064, 0.055, 0.2, 12),
        this.matSkin,
        1.06,
      );
      upperThigh.position.y = -0.1;
      hipPivot.add(upperThigh);

      // Thigh-high dark cyber boot upper cuff with glowing cyan rim
      const { group: bootThigh } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.058, 0.048, 0.22, 12),
        this.matBootDark,
        1.065,
      );
      bootThigh.position.y = -0.31;
      hipPivot.add(bootThigh);

      const bootTopRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.058, 0.009, 6, 16),
        this.matTieCyan,
      );
      bootTopRim.rotation.x = Math.PI / 2;
      bootTopRim.position.y = -0.205;
      hipPivot.add(bootTopRim);

      // Knee & Lower Thigh-High Cyber Boot
      kneePivot.position.set(0, -0.42, 0);
      hipPivot.add(kneePivot);

      const { group: calf } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.05, 0.039, 0.4, 12),
        this.matBootDark,
        1.065,
      );
      calf.position.y = -0.2;
      kneePivot.add(calf);

      // Vertical cyan LED seam running down outer boot
      const bootSeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.34, 0.016),
        this.matTieCyan,
      );
      bootSeam.position.set(side * 0.046, -0.2, 0.01);
      kneePivot.add(bootSeam);

      // Sleek cyber stage boot foot with magenta sole highlight
      const { group: foot } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.082, 0.072, 0.2),
        this.matBootDark,
        1.07,
      );
      foot.position.set(0, -0.425, 0.042);
      kneePivot.add(foot);

      const soleTrim = new THREE.Mesh(
        new THREE.BoxGeometry(0.088, 0.018, 0.208),
        this.matMagentaAccent,
      );
      soleTrim.position.set(0, -0.456, 0.042);
      kneePivot.add(soleTrim);
    };

    buildLeg(-1, this.leftLegPivot, this.leftKneePivot);
    buildLeg(1, this.rightLegPivot, this.rightKneePivot);
  }

  private buildSleevelessVestAndPleatedSkirt(): void {
    this.torsoGroup.position.set(0, 0.05, 0);
    this.bodyPivot.add(this.torsoGroup);

    // Slim waist & dark cyber stage belt with magenta clasp
    const { group: waist } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.106, 0.128, 0.14, 14),
      this.matVestDark,
      1.055,
    );
    waist.scale.set(1.04, 1.0, 0.82);
    waist.position.y = 0.03;
    this.torsoGroup.add(waist);

    const beltCyan = new THREE.Mesh(
      new THREE.TorusGeometry(0.124, 0.011, 6, 22),
      this.matTieCyan,
    );
    beltCyan.rotation.x = Math.PI / 2;
    beltCyan.scale.set(1.05, 0.84, 1.0);
    beltCyan.position.y = 0.015;
    this.torsoGroup.add(beltCyan);

    const beltChain = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.007, 6, 14, Math.PI),
      this.matMagentaAccent,
    );
    beltChain.rotation.z = Math.PI;
    beltChain.position.set(0.11, -0.02, 0.06);
    this.torsoGroup.add(beltChain);

    // Sleeveless Dark Stage Vest (leaving shoulders cleanly bare!)
    const { group: vest } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.138, 0.108, 0.34, 14),
      this.matVestDark,
      1.055,
    );
    vest.scale.set(1.04, 1.0, 0.82);
    vest.position.y = 0.27;
    this.torsoGroup.add(vest);

    // Crisp vest cyan shoulder-strap trims & collar V-cut
    for (const side of [-1, 1] as const) {
      const vestTrim = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.28, 0.022),
        this.matTieCyan,
      );
      vestTrim.position.set(side * 0.092, 0.28, 0.102);
      vestTrim.rotation.z = side * 0.12;
      this.torsoGroup.add(vestTrim);

      const chestForm = new THREE.Mesh(
        new THREE.SphereGeometry(0.062, 12, 10),
        this.matVestDark,
      );
      chestForm.scale.set(1.02, 0.92, 0.72);
      chestForm.position.set(side * 0.052, 0.34, 0.078);
      this.torsoGroup.add(chestForm);
    }

    // Bare upper collarbone + crisp cyber collar
    const collarbone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.12, 0.085, 12),
      this.matSkin,
    );
    collarbone.scale.set(1.1, 1.0, 0.78);
    collarbone.position.y = 0.47;
    this.torsoGroup.add(collarbone);

    const { group: collar } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.072, 0.105, 0.075, 12),
      this.matVestDark,
      1.06,
    );
    collar.position.y = 0.46;
    this.torsoGroup.add(collar);

    const collarRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.076, 0.008, 6, 18),
      this.matTieCyan,
    );
    collarRim.rotation.x = Math.PI / 2;
    collarRim.position.y = 0.495;
    this.torsoGroup.add(collarRim);

    // Iconic Glowing Cyan Necktie hanging down the vest front
    this.necktiePivot.position.set(0, 0.445, 0.112);
    this.torsoGroup.add(this.necktiePivot);

    const tieKnot = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.024, 0),
      this.matTieCyan,
    );
    tieKnot.scale.set(1.0, 1.0, 0.65);
    this.necktiePivot.add(tieKnot);

    const { group: tieBlade } = ToonAssets.createOutlinedMesh(
      new THREE.BoxGeometry(0.046, 0.34, 0.014),
      this.matTieCyan,
      1.06,
    );
    tieBlade.position.set(0, -0.18, 0.016);
    this.necktiePivot.add(tieBlade);

    const tieTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.085, 4),
      this.matTieCyan,
    );
    tieTip.scale.set(1.0, 1.0, 0.32);
    tieTip.rotation.x = Math.PI;
    tieTip.rotation.y = Math.PI / 4;
    tieTip.position.set(0, -0.38, 0.016);
    this.necktiePivot.add(tieTip);

    const tieClip = new THREE.Mesh(
      new THREE.BoxGeometry(0.056, 0.014, 0.022),
      this.matMagentaAccent,
    );
    tieClip.position.set(0, -0.15, 0.024);
    this.necktiePivot.add(tieClip);

    // Short Pleated Dark Stage Skirt (8 articulated pleats with bright cyan hem trim)
    const pleatCount = 8;
    const pleatHeight = 0.29;
    for (let i = 0; i < pleatCount; i++) {
      const angle = (i / pleatCount) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(
        Math.sin(angle) * 0.128,
        0.005,
        Math.cos(angle) * 0.108,
      );
      pivot.rotation.y = angle;
      this.torsoGroup.add(pivot);

      const { group: pleat } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.118, pleatHeight, 0.02),
        this.matSkirtDark,
        1.05,
      );
      pleat.position.set(0, -pleatHeight * 0.5, 0.048);
      pleat.rotation.x = -0.32;
      pivot.add(pleat);

      // Glowing Cyan Skirt Hem Stripe
      const hemStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.122, 0.024, 0.024),
        this.matTieCyan,
      );
      hemStripe.position.set(0, -pleatHeight + 0.024, 0.09);
      hemStripe.rotation.x = -0.32;
      pivot.add(hemStripe);

      this.skirtPanels.push({ pivot, angle });
    }
  }

  private buildBareShouldersAndFlaredArmWarmers(): void {
    const buildArm = (
      side: -1 | 1,
      shoulderPivot: THREE.Group,
      elbowPivot: THREE.Group,
      handAnchor: THREE.Object3D,
    ): void => {
      shoulderPivot.position.set(side * 0.178, 0.445, 0);
      this.torsoGroup.add(shoulderPivot);

      // Bare shoulder & upper bicep (distinct sleeveless look)
      const { group: bareUpperArm } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.043, 0.036, 0.24, 10),
        this.matSkin,
        1.08,
      );
      bareUpperArm.position.y = -0.12;
      shoulderPivot.add(bareUpperArm);

      // Detached cyber arm-warmer upper cuff band below bare shoulder
      const upperCuff = new THREE.Mesh(
        new THREE.TorusGeometry(0.04, 0.009, 6, 14),
        this.matTieCyan,
      );
      upperCuff.rotation.x = Math.PI / 2;
      upperCuff.position.y = -0.19;
      shoulderPivot.add(upperCuff);

      elbowPivot.position.set(0, -0.24, 0);
      shoulderPivot.add(elbowPivot);

      // Flared detached dark cyber arm-warmer widening smoothly toward wrist
      const { group: armWarmer } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.039, 0.068, 0.245, 12),
        this.matVestDark,
        1.065,
      );
      armWarmer.position.y = -0.115;
      elbowPivot.add(armWarmer);

      // Cyan & magenta glowing equalizer rings around flared arm-warmer cuff
      const cuffCyan = new THREE.Mesh(
        new THREE.TorusGeometry(0.068, 0.009, 6, 16),
        this.matTieCyan,
      );
      cuffCyan.rotation.x = Math.PI / 2;
      cuffCyan.position.y = -0.228;
      elbowPivot.add(cuffCyan);

      const cuffMagenta = new THREE.Mesh(
        new THREE.TorusGeometry(0.056, 0.007, 6, 16),
        this.matMagentaAccent,
      );
      cuffMagenta.rotation.x = Math.PI / 2;
      cuffMagenta.position.y = -0.16;
      elbowPivot.add(cuffMagenta);

      const { group: hand } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.045, 0.072, 0.048),
        this.matSkin,
        1.08,
      );
      hand.position.set(0, -0.26, 0.008);
      elbowPivot.add(hand);

      handAnchor.position.set(0, -0.295, 0.02);
      elbowPivot.add(handAnchor);
    };

    buildArm(-1, this.leftShoulderPivot, this.leftElbowPivot, this.leftHandAnchor);
    buildArm(1, this.rightShoulderPivot, this.rightElbowPivot, this.rightHandAnchor);

    this.leftWristAnchor.position.set(0, -0.22, 0.004);
    this.leftElbowPivot.add(this.leftWristAnchor);
    this.rightWristAnchor.position.set(0, -0.22, 0.004);
    this.rightElbowPivot.add(this.rightWristAnchor);
  }

  private buildHeadBangsAndHeadsetMic(): void {
    // Exact Marina/Serena headGroup & headAnchor coordinates for zero-gap lip contact
    this.headGroup.position.set(0, 0.515, 0.008);
    this.torsoGroup.add(this.headGroup);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.044, 0.052, 0.11, 10),
      this.matSkin,
    );
    neck.position.y = 0.045;
    this.headGroup.add(neck);

    const headCenterY = 0.185;
    const { group: headBase } = ToonAssets.createOutlinedMesh(
      new THREE.SphereGeometry(0.122, 24, 20),
      this.matSkin,
      1.045,
    );
    headBase.scale.set(0.94, 1.02, 0.96);
    headBase.position.y = headCenterY;
    this.headGroup.add(headBase);

    // Exact lip-contact & camera focus target anchor
    this.headAnchor.position.set(0, headCenterY - 0.045, 0.116);
    this.headGroup.add(this.headAnchor);

    // 512x512 Procedural Emerald Anime Face Shell
    const faceShellGeo = new THREE.SphereGeometry(
      0.124,
      28,
      20,
      Math.PI * 0.15,
      Math.PI * 0.7,
      Math.PI * 0.2,
      Math.PI * 0.62,
    );
    const faceShell = new THREE.Mesh(faceShellGeo, this.matFaceOverlay);
    faceShell.scale.set(0.94, 1.02, 0.96);
    faceShell.position.y = headCenterY;
    this.headGroup.add(faceShell);

    // Emerald-Cyan Hair Crown Cap (snug idol dome so high twin-tails stand out!)
    const { group: hairCrown } = ToonAssets.createOutlinedMesh(
      new THREE.SphereGeometry(
        0.132,
        22,
        18,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.64,
      ),
      this.matHairCyan,
      1.045,
    );
    hairCrown.scale.set(0.98, 1.04, 1.04);
    hairCrown.rotation.x = -0.16;
    hairCrown.position.set(0, headCenterY + 0.012, -0.008);
    this.headGroup.add(hairCrown);

    // Short neat back-of-skull hair cap (distinctly NO loose back hair curtains — all volume is in twin-tails!)
    const { group: backCap } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.118, 0.088, 0.14, 12),
      this.matHairEmerald,
      1.05,
    );
    backCap.position.set(0, headCenterY - 0.055, -0.036);
    this.headGroup.add(backCap);

    // Straight-Cut Flat-Trimmed Emerald-Cyan Bangs across forehead
    const bangPositions = [-0.082, -0.042, 0, 0.042, 0.082];
    for (let i = 0; i < bangPositions.length; i++) {
      const bx = bangPositions[i] ?? 0;
      const isOuter = Math.abs(bx) > 0.06;
      const { group: bang } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(isOuter ? 0.04 : 0.046, isOuter ? 0.112 : 0.098, 0.022),
        i % 2 === 0 ? this.matHairCyan : this.matHairEmerald,
        1.06,
      );
      bang.position.set(
        bx,
        headCenterY + 0.058,
        0.112 - Math.abs(bx) * 0.32,
      );
      bang.rotation.x = -0.16;
      bang.rotation.y = bx * 2.8;
      this.headGroup.add(bang);
    }

    // Sleek Cheek-Framing Side-Locks
    for (const side of [-1, 1] as const) {
      const { group: sideLock } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.036, 0.24, 0.032),
        this.matHairCyan,
        1.06,
      );
      sideLock.position.set(side * 0.114, headCenterY - 0.04, 0.042);
      sideLock.rotation.z = side * 0.07;
      this.headGroup.add(sideLock);

      const { group: sideTip } = ToonAssets.createOutlinedMesh(
        new THREE.ConeGeometry(0.024, 0.11, 5),
        this.matHairHighlight,
        1.07,
      );
      sideTip.rotation.x = Math.PI;
      sideTip.position.set(side * 0.122, headCenterY - 0.205, 0.042);
      this.headGroup.add(sideTip);
    }

    // Floating Cyber Headset Mic wrapping left ear with glowing cyan mic-boom
    const headsetGroup = new THREE.Group();
    headsetGroup.position.set(0, headCenterY, 0);
    this.headGroup.add(headsetGroup);

    const earCup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.044, 0.044, 0.024, 12),
      this.matCubeBlack,
    );
    earCup.rotation.z = Math.PI / 2;
    earCup.position.set(-0.128, -0.008, 0.006);
    headsetGroup.add(earCup);

    const earRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.036, 0.007, 6, 14),
      this.matMagentaAccent,
    );
    earRing.rotation.y = Math.PI / 2;
    earRing.position.set(-0.141, -0.008, 0.006);
    headsetGroup.add(earRing);

    const micBoom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.125, 6),
      this.matChrome,
    );
    micBoom.rotation.x = Math.PI * 0.44;
    micBoom.rotation.z = -0.42;
    micBoom.position.set(-0.095, -0.036, 0.068);
    headsetGroup.add(micBoom);

    const micTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 8, 8),
      this.matTieCyan,
    );
    micTip.position.set(-0.058, -0.046, 0.118);
    headsetGroup.add(micTip);
  }

  /**
   * Builds Miku's iconic high-mounted black-and-magenta square/cubic hair-ties (headAccessory)
   * and two articulated 4-segment tapered emerald-cyan flared twin-tails with ink-black outlines.
   */
  private buildTwinTailsAndCubicHairTies(): void {
    const L = ARENA_CONFIG.lighting;
    const headCenterY = 0.185;

    // headAccessory holds both cubic hair-ties so [F] taunt flicks & wobbles them crisply
    this.headAccessory.position.set(0, headCenterY + 0.092, -0.025);
    this.headGroup.add(this.headAccessory);

    this.stageLight = new THREE.PointLight(
      PALETTE.mikuCyan,
      L.tiaraLightCombatBase,
      L.tiaraLightDistance,
      L.tiaraLightDecay,
    );
    this.stageLight.position.set(0, 0.14, 0.06);
    this.headAccessory.add(this.stageLight);

    for (const side of [-1, 1] as const) {
      // Iconic Black-and-Magenta Cubic Square Hair-Tie Ring at Twin-Tail Root
      const tieGroup = new THREE.Group();
      tieGroup.position.set(side * 0.126, 0, 0);
      tieGroup.rotation.z = -side * 0.48;
      this.headAccessory.add(tieGroup);

      // Hollow square black-and-magenta frame built from 4 sleek bar edges
      const frameSize = 0.088;
      const barThick = 0.017;
      const barDepth = 0.056;
      const edgeOffsets: readonly [number, number, number, number][] = [
        [0, frameSize * 0.5, frameSize + barThick, barThick],
        [0, -frameSize * 0.5, frameSize + barThick, barThick],
        [-frameSize * 0.5, 0, barThick, frameSize],
        [frameSize * 0.5, 0, barThick, frameSize],
      ];
      edgeOffsets.forEach(([ex, ey, ew, eh]) => {
        const { group: blackBar } = ToonAssets.createOutlinedMesh(
          new THREE.BoxGeometry(ew, eh, barDepth),
          this.matCubeBlack,
          1.08,
        );
        blackBar.position.set(ex, ey, 0);
        tieGroup.add(blackBar);

        const neonTrim = new THREE.Mesh(
          new THREE.BoxGeometry(ew * 1.04, eh * 1.04, barDepth * 0.36),
          this.matMagentaAccent,
        );
        neonTrim.position.set(ex, ey, barDepth * 0.38);
        tieGroup.add(neonTrim);
      });

      // Articulated 4-Segment Flared Emerald-Cyan Twin-Tail Chain
      const rootMount = new THREE.Group();
      rootMount.position.set(
        side * 0.132,
        headCenterY + 0.088,
        -0.028,
      );
      this.headGroup.add(rootMount);

      // Segment 1: High-Mounted Flared Upper Arch (sweeps dramatically outward in A-frame!)
      const seg1 = new THREE.Group();
      seg1.rotation.z = side * 0.56;
      rootMount.add(seg1);

      const len1 = 0.34;
      const { group: seg1Mesh } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.054, 0.072, len1, 10),
        this.matHairCyan,
        1.065,
      );
      seg1Mesh.scale.set(1.05, 1.0, 0.78);
      seg1Mesh.position.y = -len1 * 0.5;
      seg1.add(seg1Mesh);

      // Segment 2: Thick Flowing Mid-Tail
      const seg2 = new THREE.Group();
      seg2.position.y = -len1;
      seg1.add(seg2);

      const len2 = 0.38;
      const { group: seg2Mesh } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.072, 0.068, len2, 10),
        this.matHairEmerald,
        1.065,
      );
      seg2Mesh.scale.set(1.08, 1.0, 0.76);
      seg2Mesh.position.y = -len2 * 0.5;
      seg2.add(seg2Mesh);

      // Segment 3: Lower Sweeping Cascade
      const seg3 = new THREE.Group();
      seg3.position.y = -len2;
      seg2.add(seg3);

      const len3 = 0.36;
      const { group: seg3Mesh } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.066, 0.048, len3, 9),
        this.matHairCyan,
        1.07,
      );
      seg3Mesh.scale.set(1.06, 1.0, 0.74);
      seg3Mesh.position.y = -len3 * 0.5;
      seg3.add(seg3Mesh);

      // Segment 4: Tapered Luminous Emerald-Cyan Tip
      const seg4 = new THREE.Group();
      seg4.position.y = -len3;
      seg3.add(seg4);

      const len4 = 0.34;
      const { group: seg4Mesh } = ToonAssets.createOutlinedMesh(
        new THREE.ConeGeometry(0.052, len4, 7),
        this.matHairHighlight,
        1.075,
      );
      seg4Mesh.scale.set(1.08, 1.0, 0.72);
      seg4Mesh.rotation.x = Math.PI;
      seg4Mesh.position.y = -len4 * 0.5;
      seg4.add(seg4Mesh);

      this.twinTails.push({ side, rootMount, seg1, seg2, seg3, seg4 });
    }
  }

  private buildHarmonicHalo(): void {
    this.harmonicHalo.position.set(0, 0.56, -0.22);
    this.torsoGroup.add(this.harmonicHalo);

    const outerEqMat = new THREE.MeshBasicMaterial({
      color: PALETTE.harmonicEmerald,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerEqMat = new THREE.MeshBasicMaterial({
      color: PALETTE.harmonicMagenta,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.014, 6, 32),
      outerEqMat,
    );
    this.harmonicHalo.add(outerRing);

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.011, 6, 24),
      innerEqMat,
    );
    this.harmonicHalo.add(innerRing);

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.095, 0.012),
        i % 2 === 0 ? outerEqMat : innerEqMat,
      );
      tick.position.set(Math.cos(ang) * 0.52, Math.sin(ang) * 0.52, 0);
      tick.rotation.z = ang - Math.PI / 2;
      this.harmonicHalo.add(tick);
    }
  }

  private buildPhaseAuraRings(): void {
    this.phaseAuraRings.position.set(0, 0.36, 0);
    this.phaseAuraRings.visible = false;
    this.torsoGroup.add(this.phaseAuraRings);

    const outerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.harmonicEmerald,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.024, 6, 36),
      outerMat,
    );
    outerRing.rotation.x = Math.PI / 2;
    this.phaseAuraRings.add(outerRing);

    const innerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.harmonicMagenta,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.74, 0.02, 6, 32),
      innerMat,
    );
    innerRing.rotation.x = Math.PI / 3;
    this.phaseAuraRings.add(innerRing);

    this.phaseAuraHandles = { outerRing, innerRing, outerMat, innerMat };
  }

  public setPhaseVisuals(phase: BossPhase): void {
    this.phaseLevel = phase;
    if (phase === BOSS_PHASES.PHASE_3) {
      this.phaseAuraHandles.outerMat.color.setHex(PALETTE.harmonicMagenta);
      this.phaseAuraHandles.innerMat.color.setHex(PALETTE.harmonicEmerald);
    } else {
      this.phaseAuraHandles.outerMat.color.setHex(PALETTE.harmonicEmerald);
      this.phaseAuraHandles.innerMat.color.setHex(PALETTE.harmonicMagenta);
    }
  }

  public setAscendHeight(extraY: number): void {
    this.targetAscendY = extraY;
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.16;
  }

  public triggerCastFlourish(): void {
    this.castAnimTimer = 0.55;
  }

  public triggerAccessoryFlick(): void {
    this.accessoryFlickTimer = 0.55;
  }

  public getLeftHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.leftHandAnchor.getWorldPosition(outVec);
  }

  public getRightHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.rightHandAnchor.getWorldPosition(outVec);
  }

  public getLeftWristWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.leftWristAnchor.getWorldPosition(outVec);
  }

  public getRightWristWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.rightWristAnchor.getWorldPosition(outVec);
  }

  /**
   * Renders Miku's high-resolution 512x512 emerald-eyed anime facial expressions.
   */
  public setExpression(expression: BossExpression, spiralPhase = 0): void {
    this.currentExpression = expression;
    const ctx = this.faceCtx;
    const w = this.faceCanvas.width;
    const h = this.faceCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const drawCheekBlush = (intensity: number, withHatchLines: boolean): void => {
      const cheeks = [118, 394];
      cheeks.forEach((cx) => {
        const grad = ctx.createRadialGradient(cx, 314, 6, cx, 314, 52);
        grad.addColorStop(
          0,
          `rgba(${PALETTE.rgba.blushCoreRgb}, ${intensity})`,
        );
        grad.addColorStop(
          0.55,
          `rgba(${PALETTE.rgba.blushSoftRgb}, ${intensity * 0.58})`,
        );
        grad.addColorStop(1, `rgba(${PALETTE.rgba.blushSoftRgb}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, 314, 52, 30, 0, 0, Math.PI * 2);
        ctx.fill();

        if (withHatchLines) {
          ctx.strokeStyle = `rgba(${PALETTE.rgba.blushHatchRgb}, ${intensity * 0.65})`;
          ctx.lineWidth = 3.2;
          ctx.lineCap = 'round';
          for (let k = -1; k <= 1; k++) {
            ctx.beginPath();
            ctx.moveTo(cx + k * 14 - 5, 322);
            ctx.lineTo(cx + k * 14 + 5, 306);
            ctx.stroke();
          }
        }
      });
    };

    const drawStarGlint = (cx: number, cy: number, r: number): void => {
      ctx.fillStyle = PALETTE.hex.pureWhite;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rad = i % 2 === 0 ? r : r * 0.34;
        const ang = (i * Math.PI) / 4;
        const px = cx + Math.cos(ang) * rad;
        const py = cy + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    };

    const drawEmeraldAnimeEye = (
      cx: number,
      cy: number,
      isRight: boolean,
      wideMode: boolean,
    ): void => {
      const dir = isRight ? 1 : -1;
      const eyeW = wideMode ? 50 : 48;
      const eyeH = wideMode ? 46 : 40;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, eyeW, eyeH, 0, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = PALETTE.hex.pureWhite;
      ctx.fillRect(cx - eyeW - 6, cy - eyeH - 6, eyeW * 2 + 12, eyeH * 2 + 12);

      const irisR = wideMode ? 33 : 35;
      const irisY = cy + (wideMode ? 2 : 4);
      const irisGrad = ctx.createLinearGradient(
        cx,
        irisY - irisR,
        cx,
        irisY + irisR,
      );
      irisGrad.addColorStop(0.0, PALETTE.hex.mikuEyeRim);
      irisGrad.addColorStop(0.32, PALETTE.hex.mikuEyeTop);
      irisGrad.addColorStop(0.68, PALETTE.hex.mikuEyeMid);
      irisGrad.addColorStop(1.0, PALETTE.hex.mikuEyeBottom);

      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.ellipse(cx, irisY, irisR * 0.92, irisR, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = PALETTE.hex.mikuEyeRim;
      ctx.lineWidth = 3.2;
      ctx.stroke();

      ctx.fillStyle = PALETTE.hex.mikuEyeRim;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        irisY - 1,
        wideMode ? 12 : 13.5,
        wideMode ? 14 : 15.5,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.fillStyle = PALETTE.rgba.irisCrescent;
      ctx.beginPath();
      ctx.ellipse(cx, irisY + 18, 17, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = PALETTE.hex.pureWhite;
      ctx.beginPath();
      ctx.ellipse(
        cx - 12 * dir,
        irisY - 15,
        11.5,
        8.5,
        -0.3 * dir,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      drawStarGlint(cx + 12 * dir, irisY + 11, wideMode ? 9.5 : 8.2);
      ctx.restore();

      ctx.strokeStyle = PALETTE.hex.lashSlate;
      ctx.lineCap = 'round';
      ctx.lineWidth = 9.5;
      ctx.beginPath();
      ctx.moveTo(cx - eyeW * 1.05 * dir, cy - 6);
      ctx.quadraticCurveTo(cx, cy - eyeH * 1.24, cx + eyeW * 1.12 * dir, cy - 10);
      ctx.stroke();

      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(cx + eyeW * 0.92 * dir, cy - 12);
      ctx.lineTo(cx + (eyeW + 16) * dir, cy - 22);
      ctx.stroke();

      ctx.strokeStyle = PALETTE.rgba.eyelidCrease;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx - eyeW * 0.75 * dir, cy - eyeH - 7);
      ctx.quadraticCurveTo(
        cx,
        cy - eyeH - 16,
        cx + eyeW * 0.8 * dir,
        cy - eyeH - 5,
      );
      ctx.stroke();
    };

    const drawNose = (): void => {
      ctx.fillStyle = PALETTE.rgba.noseTint;
      ctx.beginPath();
      ctx.ellipse(256, 326, 3.0, 5.0, 0.15, 0, Math.PI * 2);
      ctx.fill();
    };

    if (expression === BOSS_EXPRESSIONS.COMBAT) {
      drawCheekBlush(0.28, false);
      drawEmeraldAnimeEye(162, 248, false, false);
      drawEmeraldAnimeEye(350, 248, true, false);
      drawNose();

      ctx.strokeStyle = PALETTE.hex.mikuBrow;
      ctx.lineWidth = 4.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(114, 178);
      ctx.quadraticCurveTo(162, 164, 206, 180);
      ctx.moveTo(398, 178);
      ctx.quadraticCurveTo(350, 164, 306, 180);
      ctx.stroke();

      // Confident idol stage smile
      ctx.strokeStyle = PALETTE.hex.lipRose;
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(226, 376);
      ctx.quadraticCurveTo(256, 398, 286, 376);
      ctx.stroke();
    } else if (expression === BOSS_EXPRESSIONS.STAGGER) {
      drawCheekBlush(0.58, true);
      drawEmeraldAnimeEye(162, 246, false, true);
      drawEmeraldAnimeEye(350, 246, true, true);
      drawNose();

      ctx.strokeStyle = PALETTE.hex.mikuBrow;
      ctx.lineWidth = 4.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(114, 186);
      ctx.quadraticCurveTo(164, 172, 210, 158);
      ctx.moveTo(398, 186);
      ctx.quadraticCurveTo(348, 172, 302, 158);
      ctx.stroke();

      ctx.fillStyle = PALETTE.hex.roseMuted;
      ctx.beginPath();
      ctx.ellipse(256, 384, 19, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.hex.deepLipBerry;
      ctx.lineWidth = 3.2;
      ctx.stroke();
    } else if (expression === BOSS_EXPRESSIONS.SIPHON_KISS) {
      drawCheekBlush(0.75, true);
      drawNose();

      ctx.strokeStyle = PALETTE.hex.lashSlate;
      ctx.lineWidth = 8.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(118, 224);
      ctx.quadraticCurveTo(170, 242, 204, 254);
      ctx.quadraticCurveTo(164, 266, 120, 282);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(394, 224);
      ctx.quadraticCurveTo(342, 242, 308, 254);
      ctx.quadraticCurveTo(348, 266, 392, 282);
      ctx.stroke();

      ctx.fillStyle = PALETTE.rgba.kissHeart;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('♥', 102, 218);
      ctx.fillText('♥', 410, 218);

      ctx.strokeStyle = PALETTE.hex.mikuBrow;
      ctx.lineWidth = 4.8;
      ctx.beginPath();
      ctx.moveTo(116, 194);
      ctx.quadraticCurveTo(164, 180, 208, 168);
      ctx.moveTo(396, 194);
      ctx.quadraticCurveTo(348, 180, 304, 168);
      ctx.stroke();

      ctx.fillStyle = PALETTE.hex.blushCrimson;
      ctx.beginPath();
      ctx.ellipse(256, 382, 15, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.hex.deepLipBerry;
      ctx.lineWidth = 3.0;
      ctx.stroke();
    } else if (expression === BOSS_EXPRESSIONS.DRAINED_FAINT) {
      drawCheekBlush(0.54, true);
      drawNose();

      const drawSpiralEye = (cx: number, cy: number, dir: -1 | 1): void => {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy + 4, 48, 34, 0, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = PALETTE.hex.snowWhite;
        ctx.fillRect(cx - 52, cy - 38, 104, 84);

        ctx.fillStyle = PALETTE.hex.mikuEyeBottom;
        ctx.beginPath();
        ctx.arc(cx, cy + 6, 31, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PALETTE.hex.mikuEyeMid;
        ctx.lineWidth = 4.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 5.2; a += 0.2) {
          const rad = a * 1.65;
          const angle = a * dir + spiralPhase * dir;
          const px = cx + Math.cos(angle) * rad;
          const py = cy + 6 + Math.sin(angle) * rad;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.fillStyle = PALETTE.hex.mikuSkin;
        ctx.fillRect(cx - 54, cy - 42, 108, 34);
        ctx.restore();

        ctx.strokeStyle = PALETTE.hex.lashSlate;
        ctx.lineWidth = 8.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 50, cy - 6);
        ctx.quadraticCurveTo(cx, cy - 12, cx + 50, cy - 6);
        ctx.stroke();
      };

      drawSpiralEye(162, 250, 1);
      drawSpiralEye(350, 250, -1);

      ctx.strokeStyle = PALETTE.hex.coolGray;
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      ctx.moveTo(116, 188);
      ctx.quadraticCurveTo(164, 178, 206, 186);
      ctx.moveTo(396, 188);
      ctx.quadraticCurveTo(348, 178, 306, 186);
      ctx.stroke();

      ctx.strokeStyle = PALETTE.hex.lipRose;
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.moveTo(230, 380);
      ctx.quadraticCurveTo(256, 400, 282, 380);
      ctx.stroke();
    }

    this.faceTexture.needsUpdate = true;
  }

  /**
   * Smoothly animates Miku between floating cyber-idol combat poise (with velocity-reactive
   * A-frame twin-tail sway) and kneeling breathless STAGGER exhaustion.
   */
  public updateCombatPose(
    dt: number,
    state: GameState,
    elapsed: number,
    staggerProgressOverride: number | null = null,
  ): void {
    const L = ARENA_CONFIG.lighting;
    const safeDt = Math.max(0.001, Math.min(dt, 0.05));

    // Sample world displacement for velocity-reactive twin-tail sway
    if (this.hasPrevPos) {
      const vx = (this.root.position.x - this.prevWorldPos.x) / safeDt;
      const vz = (this.root.position.z - this.prevWorldPos.z) / safeDt;
      const planarSpeed = Math.min(24, Math.hypot(vx, vz));
      const rightX = Math.cos(this.root.rotation.y);
      const rightZ = -Math.sin(this.root.rotation.y);
      const lateral = THREE.MathUtils.clamp(vx * rightX + vz * rightZ, -16, 16);
      const alpha = 1 - Math.exp(-safeDt * 8.0);
      this.smoothedSpeed = THREE.MathUtils.lerp(
        this.smoothedSpeed,
        planarSpeed,
        alpha,
      );
      this.smoothedLateralVel = THREE.MathUtils.lerp(
        this.smoothedLateralVel,
        lateral,
        alpha,
      );
    }
    this.prevWorldPos.copy(this.root.position);
    this.hasPrevPos = true;

    const targetBlend =
      staggerProgressOverride !== null
        ? THREE.MathUtils.clamp(staggerProgressOverride, 0, 1)
        : state === GAME_STATES.STAGGER || state === GAME_STATES.SIPHON_FINISHER
          ? 1.0
          : 0.0;

    this.staggerBlend +=
      (targetBlend - this.staggerBlend) * Math.min(1, safeDt * 5.2);
    const s = this.staggerBlend;

    this.castAnimTimer = Math.max(0, this.castAnimTimer - safeDt);
    const castFactor =
      Math.sin(Math.min(1, this.castAnimTimer / 0.55) * Math.PI) * (1 - s);

    const desiredAscend = (1 - s) * this.targetAscendY;
    this.currentAscendY +=
      (desiredAscend - this.currentAscendY) * Math.min(1, safeDt * 4.8);

    const speedRatio = THREE.MathUtils.clamp(
      this.smoothedSpeed / MIKU_CONFIG.dashSpeed,
      0,
      1,
    );

    const combatY =
      MIKU_CONFIG.combatBaseBodyY +
      MIKU_CONFIG.floatHeight +
      this.currentAscendY +
      Math.sin(elapsed * 2.6) * 0.09;
    const staggerY = 0.465 + Math.sin(elapsed * 3.8) * 0.008;
    this.bodyPivot.position.y = THREE.MathUtils.lerp(combatY, staggerY, s);
    this.bodyPivot.rotation.set(
      (1 - s) * speedRatio * 0.22,
      0,
      (1 - s) * -this.smoothedLateralVel * 0.016,
    );

    const combatTorsoX = -0.04 + Math.sin(elapsed * 2.0) * 0.03;
    const staggerTorsoX = 0.25 + Math.sin(elapsed * 3.8) * 0.025;
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(
      combatTorsoX,
      staggerTorsoX,
      s,
    );

    const combatHeadX = 0.03;
    const staggerHeadX = -0.34 + Math.sin(elapsed * 2.6) * 0.02;
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(
      THREE.MathUtils.lerp(combatHeadX, staggerHeadX, s),
      0,
      0,
    );

    // Legs (agile floating stage stance vs kneeling stagger)
    this.leftLegPivot.rotation.set(
      THREE.MathUtils.lerp(0.16 + Math.sin(elapsed * 2.1) * 0.08, -0.18, s),
      0,
      THREE.MathUtils.lerp(-0.06, -0.08, s),
    );
    this.rightLegPivot.rotation.set(
      THREE.MathUtils.lerp(-0.1 + Math.cos(elapsed * 2.1) * 0.08, -0.18, s),
      0,
      THREE.MathUtils.lerp(0.06, 0.08, s),
    );
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(0.26, 1.72, s);
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(0.38, 1.72, s);

    // Expressive Idol Stage Arms
    const combatArmX =
      -0.36 - castFactor * 0.92 + Math.sin(elapsed * 2.4) * 0.07;
    const combatArmZ = 0.36 + castFactor * 0.45;
    const combatElbowX = -0.54 + castFactor * 0.28;

    this.leftShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(combatArmX, -0.14, s),
      0,
      THREE.MathUtils.lerp(combatArmZ, 0.14, s),
    );
    this.rightShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(combatArmX, -0.14, s),
      0,
      THREE.MathUtils.lerp(-combatArmZ, -0.14, s),
    );
    this.leftElbowPivot.rotation.x = THREE.MathUtils.lerp(combatElbowX, -0.26, s);
    this.rightElbowPivot.rotation.x = THREE.MathUtils.lerp(combatElbowX, -0.26, s);

    // Necktie flutter
    this.necktiePivot.rotation.x =
      -0.06 - speedRatio * 0.28 + Math.sin(elapsed * 4.2) * 0.05 * (1 - s);

    // Short Pleated Skirt Panels
    for (let i = 0; i < this.skirtPanels.length; i++) {
      const sp = this.skirtPanels[i];
      if (!sp) continue;
      const wave = Math.sin(elapsed * 3.1 + sp.angle * 2) * 0.055 * (1 - s);
      sp.pivot.rotation.x = wave - s * 0.34 - speedRatio * 0.14;
    }

    // Articulated 4-Segment Flared Twin-Tails with Velocity-Reactive Drag & Sway
    const dragBack = speedRatio * 0.62 * (1 - s);
    const latSway = THREE.MathUtils.clamp(
      this.smoothedLateralVel * 0.028 * (1 - s),
      -0.38,
      0.38,
    );

    for (let i = 0; i < this.twinTails.length; i++) {
      const tt = this.twinTails[i];
      if (!tt) continue;
      const phase = tt.side * 0.8;
      const wave1 = Math.sin(elapsed * 3.0 + phase) * 0.1 * (1 - s * 0.65);
      const wave2 = Math.sin(elapsed * 3.0 + phase - 0.75) * 0.14 * (1 - s * 0.65);
      const wave3 = Math.sin(elapsed * 3.0 + phase - 1.5) * 0.17 * (1 - s * 0.65);
      const wave4 = Math.sin(elapsed * 3.0 + phase - 2.2) * 0.2 * (1 - s * 0.65);

      const baseFlareZ = tt.side * THREE.MathUtils.lerp(0.56, 0.38, s);
      tt.seg1.rotation.z = baseFlareZ - latSway + wave1 * 0.55;
      tt.seg1.rotation.x =
        THREE.MathUtils.lerp(0.18 + dragBack, 0.28, s) + wave1 * 0.6;
      tt.seg2.rotation.z = tt.side * 0.14 - latSway * 0.5 + wave2 * 0.45;
      tt.seg2.rotation.x =
        THREE.MathUtils.lerp(0.12 + dragBack * 0.55, 0.38, s) + wave2;
      tt.seg3.rotation.z = tt.side * 0.08 + wave3 * 0.5;
      tt.seg3.rotation.x =
        THREE.MathUtils.lerp(0.08 + dragBack * 0.35, 0.44, s) + wave3;
      tt.seg4.rotation.z = wave4 * 0.55;
      tt.seg4.rotation.x =
        THREE.MathUtils.lerp(0.06, 0.32, s) + wave4;
    }

    // Floating Harmonic Halo
    this.harmonicHalo.rotation.z =
      elapsed * (0.85 + (this.phaseLevel - 1) * 0.65);
    const haloScale = Math.max(
      0.001,
      (1.0 + (this.phaseLevel - 1) * 0.15) * (1.0 - s * 0.98),
    );
    this.harmonicHalo.scale.setScalar(haloScale);
    this.harmonicHalo.visible = haloScale > 0.02;

    // Phase 2 / 3 Rotating Equalizer Rings
    const showAura =
      (this.phaseLevel >= BOSS_PHASES.PHASE_2 || this.currentAscendY > 0.05) &&
      s < 0.35;
    this.phaseAuraRings.visible = showAura;
    if (showAura) {
      const { outerRing, innerRing, outerMat, innerMat } =
        this.phaseAuraHandles;
      const boost = this.phaseLevel === BOSS_PHASES.PHASE_3 ? 1.45 : 1.0;
      outerRing.rotation.z = elapsed * 1.65 * boost;
      innerRing.rotation.z = -elapsed * 2.35 * boost;
      innerRing.rotation.y = elapsed * 1.25;
      this.phaseAuraRings.scale.setScalar(
        (1 - s) * (1 + this.currentAscendY * 0.5),
      );
      outerMat.opacity = (0.52 + 0.18 * Math.sin(elapsed * 4.8)) * (1 - s);
      innerMat.opacity = (0.48 + 0.2 * Math.cos(elapsed * 3.9)) * (1 - s);
    }

    // Stage Light & Hit Flash
    const phaseBoost = (this.phaseLevel - 1) * L.tiaraLightPhaseStep;
    this.stageLight.intensity =
      (THREE.MathUtils.lerp(
        L.tiaraLightCombatBase + phaseBoost,
        L.tiaraLightStaggerBase,
        s,
      ) +
        castFactor * L.tiaraLightCastBoost) *
      (1 - this.currentDrainProgress * 0.85);

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - safeDt);
      const flash = this.hitFlashTimer / 0.16;
      this.matHairCyan.emissive.setHex(PALETTE.iceHighlights);
      this.matHairCyan.emissiveIntensity = 0.35 + flash * 0.9;
    } else if (this.currentDrainProgress <= 0) {
      this.matHairCyan.emissive.setHex(PALETTE.mikuCyan);
      this.matHairCyan.emissiveIntensity = 0.28;
    }
  }

  /**
   * Bleaches Miku's vibrant emerald-cyan twin-tails, necktie, and neon trims smoothly
   * toward PALETTE.drainedAshSilver (#94A3B8) as drain progresses 0 -> 1.
   */
  public applyDrainBleach(drainProgress: number): void {
    this.currentDrainProgress = THREE.MathUtils.clamp(drainProgress, 0, 1);
    applyMaterialBleach(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
      this.currentDrainProgress,
    );
  }

  /**
   * Interactive Arcane Siphon Kiss poses [1-4] and ENDLESS_SAVOR:
   * - Exact zero-gap headAnchor lip alignment & coupled -> <- press-and-ease head choreography
   * - Progressive resistance (0%->50%) to exhausted limpness & twin-tail droop (50%->100%)
   * - [F] Cubic hair-tie spring wobble decay
   */
  public applyFinisherPose(
    poseId: FinisherPoseId,
    drainProgress: number,
    time: number,
    dt = 1 / 60,
    throttleMode: DrainThrottleMode = DRAIN_THROTTLE_MODES.FLOW,
    headChoreography?: FinisherHeadChoreography,
  ): void {
    this.applyDrainBleach(drainProgress);
    const headAnim =
      headChoreography ??
      computeFinisherHeadChoreography(time, drainProgress, throttleMode);

    const safeDt = Math.max(0.001, Math.min(dt, 0.05));
    const lerpAlpha =
      1 -
      Math.exp(
        -safeDt / (FINISHER_CONFIG.poseTransitionDurationSec * 0.35),
      );

    const half = FINISHER_CONFIG.limpThreshold;
    const earlyResistance = 1 - THREE.MathUtils.clamp(drainProgress / half, 0, 1);
    const limpness = THREE.MathUtils.clamp(
      (drainProgress - half) / (1 - half),
      0,
      1,
    );

    const isSurge = throttleMode === DRAIN_THROTTLE_MODES.SURGE;
    const isSavor = throttleMode === DRAIN_THROTTLE_MODES.SAVOR;

    // 1. Target Base Stances for Poses [1-4]
    let targetBodyY = 0.48;
    let targetTorsoX = THREE.MathUtils.lerp(0.14, 0.28, limpness);
    let targetTorsoZ = 0;
    let targetHeadX = -0.38;
    let targetHeadZ = 0;
    let targetLeftHipX = -0.18;
    let targetRightHipX = -0.18;
    let targetLeftKneeX = 1.72;
    let targetRightKneeX = 1.72;
    let targetSkirtPitch = -0.34;

    if (poseId === FINISHER_POSE_IDS.BALLROOM_DIP) {
      // Pose [2]: Stage Ballroom Dip (~45° backward dip)
      targetBodyY = THREE.MathUtils.lerp(0.68, 0.64, limpness);
      targetTorsoX = -FINISHER_CONFIG.dipBossSpineAngleRad - limpness * 0.06;
      targetHeadX = -0.18 - limpness * 0.04;
      targetLeftHipX = 0.28;
      targetRightHipX = -0.16;
      targetLeftKneeX = 0.52;
      targetRightKneeX = 0.34;
      targetSkirtPitch = -0.18;
    } else if (poseId === FINISHER_POSE_IDS.HAIR_REINS) {
      // Pose [3]: Twin-Tail Reins
      targetBodyY = THREE.MathUtils.lerp(0.49, 0.46, limpness);
      targetTorsoX = THREE.MathUtils.lerp(0.16, 0.3, limpness);
      targetHeadX = -0.44;
      targetHeadZ = 0.06;
    } else if (poseId === FINISHER_POSE_IDS.STAFF_LEAN) {
      // Pose [4]: Staff-Prop Lean
      targetBodyY = THREE.MathUtils.lerp(0.48, 0.45, limpness);
      targetTorsoX = THREE.MathUtils.lerp(0.15, 0.29, limpness);
      targetTorsoZ = 0.04;
      targetHeadX = -0.39;
    } else {
      // Pose [1]: Chin-Lift Tilt
      targetBodyY = THREE.MathUtils.lerp(0.48, 0.45, limpness);
    }

    const targetShoulderX = THREE.MathUtils.lerp(-0.34, 0.12, limpness);
    const targetShoulderZ = THREE.MathUtils.lerp(0.24, 0.06, limpness);
    const targetElbowX = THREE.MathUtils.lerp(-0.68, -0.05, limpness);

    const st = this.finisherPoseState;
    if (!st.initialized) {
      st.initialized = true;
      st.bodyY = this.bodyPivot.position.y;
      st.torsoX = this.torsoGroup.rotation.x;
      st.torsoZ = this.torsoGroup.rotation.z;
      st.headX = this.headGroup.rotation.x;
      st.headZ = this.headGroup.rotation.z;
      st.leftHipX = this.leftLegPivot.rotation.x;
      st.rightHipX = this.rightLegPivot.rotation.x;
      st.leftKneeX = this.leftKneePivot.rotation.x;
      st.rightKneeX = this.rightKneePivot.rotation.x;
      st.leftShoulderX = this.leftShoulderPivot.rotation.x;
      st.leftShoulderZ = this.leftShoulderPivot.rotation.z;
      st.rightShoulderX = this.rightShoulderPivot.rotation.x;
      st.rightShoulderZ = this.rightShoulderPivot.rotation.z;
      st.leftElbowX = this.leftElbowPivot.rotation.x;
      st.rightElbowX = this.rightElbowPivot.rotation.x;
      st.skirtBasePitch = targetSkirtPitch;
    }

    st.bodyY = THREE.MathUtils.lerp(st.bodyY, targetBodyY, lerpAlpha);
    st.torsoX = THREE.MathUtils.lerp(st.torsoX, targetTorsoX, lerpAlpha);
    st.torsoZ = THREE.MathUtils.lerp(st.torsoZ, targetTorsoZ, lerpAlpha);
    st.headX = THREE.MathUtils.lerp(st.headX, targetHeadX, lerpAlpha);
    st.headZ = THREE.MathUtils.lerp(st.headZ, targetHeadZ, lerpAlpha);
    st.leftHipX = THREE.MathUtils.lerp(st.leftHipX, targetLeftHipX, lerpAlpha);
    st.rightHipX = THREE.MathUtils.lerp(st.rightHipX, targetRightHipX, lerpAlpha);
    st.leftKneeX = THREE.MathUtils.lerp(st.leftKneeX, targetLeftKneeX, lerpAlpha);
    st.rightKneeX = THREE.MathUtils.lerp(
      st.rightKneeX,
      targetRightKneeX,
      lerpAlpha,
    );
    st.leftShoulderX = THREE.MathUtils.lerp(
      st.leftShoulderX,
      targetShoulderX,
      lerpAlpha,
    );
    st.leftShoulderZ = THREE.MathUtils.lerp(
      st.leftShoulderZ,
      targetShoulderZ,
      lerpAlpha,
    );
    st.rightShoulderX = THREE.MathUtils.lerp(
      st.rightShoulderX,
      targetShoulderX,
      lerpAlpha,
    );
    st.rightShoulderZ = THREE.MathUtils.lerp(
      st.rightShoulderZ,
      -targetShoulderZ,
      lerpAlpha,
    );
    st.leftElbowX = THREE.MathUtils.lerp(st.leftElbowX, targetElbowX, lerpAlpha);
    st.rightElbowX = THREE.MathUtils.lerp(
      st.rightElbowX,
      targetElbowX,
      lerpAlpha,
    );
    st.skirtBasePitch = THREE.MathUtils.lerp(
      st.skirtBasePitch,
      targetSkirtPitch,
      lerpAlpha,
    );

    // 2. Reactive Breathing & Tremble-to-Limpness Layers
    const earlyWeight = 1 - limpness;
    const earlyBreath = Math.sin(time * FINISHER_CONFIG.earlyBreathFreq);
    const lateBreath = Math.sin(time * FINISHER_CONFIG.lateBreathFreq);

    const chestBreathPitch =
      earlyBreath * 0.032 * earlyWeight + lateBreath * 0.052 * limpness;
    const chestBreathLift =
      earlyBreath * 0.008 * earlyWeight + lateBreath * 0.014 * limpness;
    const shoulderBreathHeave =
      earlyBreath * 0.065 * earlyWeight + lateBreath * 0.04 * limpness;

    const throttleTrembleScale = isSurge
      ? FINISHER_CONFIG.surgeShudderMultiplier
      : isSavor
        ? FINISHER_CONFIG.savorSwayMultiplier
        : 1.0;

    const trembleEnvelope =
      (0.35 + earlyResistance * 0.65) * earlyWeight * throttleTrembleScale;
    const surgeShudder = isSurge
      ? Math.sin(time * 34.0) * 0.018 * (1 - limpness * 0.55)
      : 0;
    const savorDreamySway = isSavor
      ? Math.sin(time * FINISHER_CONFIG.savorSwayFreq) * 0.032
      : Math.sin(time * 1.4) * 0.012;

    const leftForearmTremble =
      Math.sin(time * FINISHER_CONFIG.trembleFreq) * 0.048 * trembleEnvelope;
    const rightForearmTremble =
      Math.sin(time * FINISHER_CONFIG.trembleSecondaryFreq + 1.3) *
      0.048 *
      trembleEnvelope;
    const wristRollTremble =
      Math.cos(time * (FINISHER_CONFIG.trembleFreq + 4.5)) *
      0.036 *
      trembleEnvelope;

    const pendulumPrimary =
      Math.sin(time * FINISHER_CONFIG.pendulumFreq) *
      FINISHER_CONFIG.pendulumAmp *
      limpness;
    const pendulumSecondary =
      Math.sin(time * FINISHER_CONFIG.pendulumFreq - 0.85) *
      FINISHER_CONFIG.pendulumAmp *
      0.95 *
      limpness;
    const pendulumCross =
      Math.cos(time * FINISHER_CONFIG.pendulumFreq * 0.72) * 0.045 * limpness;

    // 3. Apply Coupled -> <- Press-and-Ease Pose to Skeleton
    this.harmonicHalo.visible = false;
    this.phaseAuraRings.visible = false;

    this.bodyPivot.position.y = st.bodyY + chestBreathLift;
    this.bodyPivot.rotation.set(0, 0, savorDreamySway * 0.35);

    this.torsoGroup.rotation.set(
      st.torsoX + chestBreathPitch + surgeShudder * 0.5,
      0,
      st.torsoZ + savorDreamySway + surgeShudder,
    );

    const bossHeadPitch =
      st.headX -
      chestBreathPitch * 0.85 +
      headAnim.bossPitchResponse -
      limpness * FINISHER_CONFIG.passiveNeckDroopPitch;
    const bossHeadYaw =
      headAnim.yawSway * headAnim.bossYieldScale + headAnim.bossTremor * 0.65;
    const bossHeadRoll =
      st.headZ -
      savorDreamySway * 0.65 +
      headAnim.roll * headAnim.bossYieldScale +
      headAnim.bossTremor;
    this.headGroup.rotation.set(bossHeadPitch, bossHeadYaw, bossHeadRoll);

    this.headGroup.position.set(
      0,
      0.515 - Math.sin(bossHeadPitch) * headAnim.bossFaceNormalOffset,
      0.008 + Math.cos(bossHeadPitch) * headAnim.bossFaceNormalOffset,
    );

    this.leftLegPivot.rotation.set(st.leftHipX, 0, -0.08);
    this.rightLegPivot.rotation.set(st.rightHipX, 0, 0.08);
    this.leftKneePivot.rotation.x = st.leftKneeX;
    this.rightKneePivot.rotation.x = st.rightKneeX;

    this.leftShoulderPivot.rotation.set(
      st.leftShoulderX - shoulderBreathHeave + pendulumPrimary + surgeShudder,
      0,
      st.leftShoulderZ + pendulumCross + leftForearmTremble * 0.45,
    );
    this.rightShoulderPivot.rotation.set(
      st.rightShoulderX - shoulderBreathHeave - pendulumPrimary - surgeShudder,
      0,
      st.rightShoulderZ - pendulumCross - rightForearmTremble * 0.45,
    );
    this.leftElbowPivot.rotation.set(
      st.leftElbowX + leftForearmTremble + pendulumSecondary,
      0,
      wristRollTremble + pendulumCross * 0.7,
    );
    this.rightElbowPivot.rotation.set(
      st.rightElbowX + rightForearmTremble - pendulumSecondary,
      0,
      -wristRollTremble - pendulumCross * 0.7,
    );

    this.necktiePivot.rotation.x = -st.torsoX * 0.45 + chestBreathPitch * 0.5;

    // 4. Short Pleated Skirt Billow
    const skirtSpeed = isSurge ? 4.4 : isSavor ? 1.45 : 2.5;
    const skirtAmp = isSurge ? 0.055 : isSavor ? 0.025 : 0.036;
    for (let i = 0; i < this.skirtPanels.length; i++) {
      const sp = this.skirtPanels[i];
      if (!sp) continue;
      sp.pivot.rotation.x =
        st.skirtBasePitch + Math.sin(time * skirtSpeed + sp.angle * 2.0) * skirtAmp;
    }

    // 5. Progressive Twin-Tail Droop (Buoyant flared resistance 0->50% -> Heavy limp droop 50->100%)
    const hairSpeed = isSurge ? 4.8 : isSavor ? 1.55 : 2.6;
    const hairAmp = isSurge ? 0.11 : isSavor ? 0.05 : 0.07;
    const isDip = poseId === FINISHER_POSE_IDS.BALLROOM_DIP;
    const isReins = poseId === FINISHER_POSE_IDS.HAIR_REINS;

    for (let i = 0; i < this.twinTails.length; i++) {
      const tt = this.twinTails[i];
      if (!tt) continue;
      const phase = tt.side * 0.9;
      const w1 = Math.sin(time * hairSpeed + phase) * hairAmp;
      const w2 = Math.sin(time * hairSpeed + phase - 0.85) * hairAmp * 1.2;
      const w3 = Math.sin(time * hairSpeed + phase - 1.65) * hairAmp * 1.35;

      // Twin-tails lose buoyant A-frame lift and droop heavily downward as drain passes 50%
      const flareZ =
        tt.side *
        THREE.MathUtils.lerp(
          isDip ? 0.62 : 0.54,
          isDip ? 0.34 : 0.24,
          limpness,
        );
      // In Pose [3] Twin-Tail Reins, the left twin-tail angles slightly forward toward Mage's hand
      const reinsPullX = isReins && tt.side === -1 ? -0.42 : 0;
      const baseSeg1X = (isDip ? 0.55 : 0.24) + limpness * 0.18 + reinsPullX;
      const baseSeg2X = (isDip ? 0.35 : 0.34) + limpness * 0.22;
      const baseSeg3X = (isDip ? 0.22 : 0.42) + limpness * 0.24;

      tt.seg1.rotation.z = THREE.MathUtils.lerp(
        tt.seg1.rotation.z,
        flareZ + w1 * 0.5,
        lerpAlpha,
      );
      tt.seg1.rotation.x = THREE.MathUtils.lerp(
        tt.seg1.rotation.x,
        baseSeg1X + w1,
        lerpAlpha,
      );
      tt.seg2.rotation.z = THREE.MathUtils.lerp(
        tt.seg2.rotation.z,
        tt.side * THREE.MathUtils.lerp(0.14, 0.04, limpness) + w2 * 0.4,
        lerpAlpha,
      );
      tt.seg2.rotation.x = THREE.MathUtils.lerp(
        tt.seg2.rotation.x,
        baseSeg2X + w2,
        lerpAlpha,
      );
      tt.seg3.rotation.x = THREE.MathUtils.lerp(
        tt.seg3.rotation.x,
        baseSeg3X + w3,
        lerpAlpha,
      );
      tt.seg4.rotation.x = THREE.MathUtils.lerp(
        tt.seg4.rotation.x,
        0.24 + limpness * 0.2 + w3,
        lerpAlpha,
      );
    }

    // 6. Cubic Hair-Tie Spring-Wobble Decay on [F] Taunt
    if (this.accessoryFlickTimer > 0) {
      this.accessoryFlickTimer = Math.max(0, this.accessoryFlickTimer - safeDt);
      const decay = this.accessoryFlickTimer / 0.55;
      this.headAccessory.rotation.z = Math.sin(time * 44) * 0.3 * decay;
      this.headAccessory.rotation.x = Math.cos(time * 38) * 0.16 * decay;
    } else {
      this.headAccessory.rotation.set(0, 0, 0);
    }

    this.stageLight.intensity =
      ARENA_CONFIG.lighting.tiaraLightStaggerBase *
      (1 - this.currentDrainProgress * 0.9);
  }

  /**
   * Victory Diorama floor collapse pose: Miku collapsed gracefully onto the concert stage
   * floor bleached ash-silver with her twin-tails fanned wide beside her.
   */
  public applyVictoryCollapsePose(time: number): void {
    this.finisherPoseState.initialized = false;
    this.applyDrainBleach(1.0);
    this.harmonicHalo.visible = false;
    this.phaseAuraRings.visible = false;
    this.stageLight.intensity = 0.22;
    this.headAccessory.rotation.set(0, 0, 0.08);

    const sigh = Math.sin(time * 2.1) * 0.012;
    this.bodyPivot.position.y = DIORAMA_CONFIG.collapseBodyY + sigh;
    this.bodyPivot.rotation.set(-Math.PI * 0.46, 0, 0.14);
    this.torsoGroup.rotation.set(0.08 + sigh * 0.8, 0, 0);
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(0.14, 0.24, 0.2);

    this.leftLegPivot.rotation.set(0.16, 0, -0.18);
    this.rightLegPivot.rotation.set(-0.08, 0, 0.24);
    this.leftKneePivot.rotation.x = 0.42;
    this.rightKneePivot.rotation.x = 0.68;

    this.leftShoulderPivot.rotation.set(0.18, 0, 0.5);
    this.rightShoulderPivot.rotation.set(-0.1, 0, -0.58);
    this.leftElbowPivot.rotation.x = -0.18;
    this.rightElbowPivot.rotation.x = -0.26;
    this.necktiePivot.rotation.x = -0.12;

    // Fan bleached ash-silver twin-tails wide out beside her on the concert stage floor
    for (let i = 0; i < this.twinTails.length; i++) {
      const tt = this.twinTails[i];
      if (!tt) continue;
      const sway = Math.sin(time * 1.3 + tt.side) * 0.03;
      tt.seg1.rotation.set(0.14, 0, tt.side * 0.92 + sway);
      tt.seg2.rotation.set(0.08, 0, tt.side * 0.24 + sway);
      tt.seg3.rotation.set(0.06, 0, tt.side * 0.12);
      tt.seg4.rotation.set(0.04, 0, 0);
    }

    for (let i = 0; i < this.skirtPanels.length; i++) {
      const sp = this.skirtPanels[i];
      if (!sp) continue;
      sp.pivot.rotation.x = -0.34;
    }
  }

  /**
   * Defeat Diorama "Captive Encore Thrall" triumphant idol-conductor stance standing over
   * the kneeling Dark Mage bound in glowing magenta frequency rings.
   */
  public applyPuppetMasterPose(time: number): void {
    this.applyDrainBleach(0);
    this.harmonicHalo.visible = true;
    this.harmonicHalo.scale.setScalar(1.08);
    this.harmonicHalo.rotation.z = time * 0.72;
    this.phaseAuraRings.visible = false;
    this.stageLight.intensity = ARENA_CONFIG.lighting.tiaraLightCombatBase;
    this.headAccessory.rotation.set(0, 0, 0);

    const beat = Math.sin(time * DIORAMA_CONFIG.puppetWaveCadence);
    const beatCos = Math.cos(time * DIORAMA_CONFIG.puppetWaveCadence);

    this.bodyPivot.position.y = 0.95 + beat * 0.025;
    this.bodyPivot.rotation.set(0, 0, beat * 0.03);
    this.torsoGroup.rotation.set(-0.05, 0, 0);
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(0.18, beatCos * 0.08, beat * 0.05);

    this.leftLegPivot.rotation.set(0.08, 0, -0.07);
    this.rightLegPivot.rotation.set(-0.08, 0, 0.07);
    this.leftKneePivot.rotation.x = 0.08;
    this.rightKneePivot.rotation.x = 0.14;

    // Charismatic idol conductor pose commanding the frequency-ring encore
    this.leftShoulderPivot.rotation.set(-1.12 + beat * 0.18, 0, 0.34);
    this.rightShoulderPivot.rotation.set(-0.92 - beat * 0.16, 0, -0.28);
    this.leftElbowPivot.rotation.x = -0.45 + beat * 0.14;
    this.rightElbowPivot.rotation.x = -0.52 - beat * 0.14;
    this.necktiePivot.rotation.x = -0.04 + beat * 0.04;

    for (let i = 0; i < this.twinTails.length; i++) {
      const tt = this.twinTails[i];
      if (!tt) continue;
      const sway = Math.sin(time * 2.5 + tt.side * 0.9) * 0.09;
      tt.seg1.rotation.set(0.16, 0, tt.side * 0.58 + sway * 0.5);
      tt.seg2.rotation.set(0.12, 0, tt.side * 0.14 + sway);
      tt.seg3.rotation.set(0.08, 0, sway);
      tt.seg4.rotation.set(0.06, 0, sway * 0.8);
    }

    for (let i = 0; i < this.skirtPanels.length; i++) {
      const sp = this.skirtPanels[i];
      if (!sp) continue;
      sp.pivot.rotation.x = Math.sin(time * 2.4 + sp.angle * 2) * 0.04;
    }
  }

  /**
   * Captive Siphon Gallery posture ready for Alcove III integration.
   */
  public applyCaptiveDaisPose(charge: number, time: number, dt: number): void {
    const cfg = SIPHON_GALLERY_CONFIG;
    const clampedCharge = THREE.MathUtils.clamp(charge, 0, 1);
    const depletion = 1 - clampedCharge;

    this.finisherPoseState.initialized = false;
    this.applyDrainBleach(depletion);

    if (clampedCharge <= cfg.captiveLowChargeThreshold) {
      this.captiveFaceRedrawTimer -= dt;
      if (
        this.currentExpression !== BOSS_EXPRESSIONS.DRAINED_FAINT ||
        this.captiveFaceRedrawTimer <= 0
      ) {
        this.captiveFaceRedrawTimer = cfg.captiveFaceRedrawIntervalSec;
        this.setExpression(BOSS_EXPRESSIONS.DRAINED_FAINT, time * 2.2);
      }
    } else if (clampedCharge < cfg.captiveHighChargeThreshold) {
      if (this.currentExpression !== BOSS_EXPRESSIONS.STAGGER) {
        this.setExpression(BOSS_EXPRESSIONS.STAGGER);
      }
    } else if (this.currentExpression !== BOSS_EXPRESSIONS.COMBAT) {
      this.setExpression(BOSS_EXPRESSIONS.COMBAT);
    }

    const breathFreq = THREE.MathUtils.lerp(
      cfg.captiveBreathFreqMin,
      cfg.captiveBreathFreqMax,
      clampedCharge,
    );
    const breathWave = Math.sin(time * breathFreq);
    const swayWave = Math.sin(time * 0.95);

    this.bodyPivot.position.set(
      0,
      cfg.captiveKneelBodyY + breathWave * 0.01,
      0,
    );
    this.bodyPivot.rotation.set(0, 0, swayWave * 0.018);

    const torsoPitch =
      THREE.MathUtils.lerp(
        cfg.captiveTorsoSlumpMax,
        cfg.captiveTorsoUprightMin,
        clampedCharge,
      ) +
      breathWave * (0.022 + depletion * 0.016);
    const headPitch =
      THREE.MathUtils.lerp(
        cfg.captiveHeadDroopMax,
        cfg.captiveHeadLiftMin,
        clampedCharge,
      ) -
      breathWave * 0.028;

    this.torsoGroup.rotation.set(torsoPitch, 0, swayWave * 0.022);
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(
      headPitch,
      Math.sin(time * 0.65) * (0.04 + clampedCharge * 0.05),
      Math.cos(time * 0.72) * (0.03 + depletion * 0.04),
    );
    this.headAccessory.rotation.set(0, 0, 0);

    this.leftLegPivot.rotation.set(-0.18, 0, -0.08);
    this.rightLegPivot.rotation.set(-0.18, 0, 0.08);
    this.leftKneePivot.rotation.x = 1.72;
    this.rightKneePivot.rotation.x = 1.72;

    const armTension = THREE.MathUtils.lerp(0.08, 0.0, clampedCharge);
    this.leftShoulderPivot.rotation.set(
      -0.36 + armTension + breathWave * 0.03,
      0,
      -0.44 - clampedCharge * 0.06,
    );
    this.rightShoulderPivot.rotation.set(
      -0.36 + armTension + breathWave * 0.03,
      0,
      0.44 + clampedCharge * 0.06,
    );
    this.leftElbowPivot.rotation.set(-0.54 + armTension * 0.5, 0, -0.14);
    this.rightElbowPivot.rotation.set(-0.54 + armTension * 0.5, 0, 0.14);

    for (let i = 0; i < this.twinTails.length; i++) {
      const tt = this.twinTails[i];
      if (!tt) continue;
      const wave = Math.sin(time * 1.55 + tt.side) * 0.04;
      tt.seg1.rotation.set(
        0.24 + depletion * 0.14 + wave,
        0,
        tt.side * THREE.MathUtils.lerp(0.28, 0.52, clampedCharge),
      );
      tt.seg2.rotation.set(0.32 + depletion * 0.18 + wave, 0, tt.side * 0.1);
      tt.seg3.rotation.set(0.38 + wave, 0, 0);
      tt.seg4.rotation.set(0.26 + wave, 0, 0);
    }

    const haloFactor = THREE.MathUtils.clamp((clampedCharge - 0.35) / 0.65, 0, 1);
    this.harmonicHalo.visible = haloFactor > 0.03;
    if (this.harmonicHalo.visible) {
      this.harmonicHalo.rotation.z = time * (0.4 + haloFactor * 0.5);
      this.harmonicHalo.scale.setScalar(0.35 + haloFactor * 0.58);
    }
    this.phaseAuraRings.visible = false;

    this.stageLight.intensity =
      ARENA_CONFIG.lighting.tiaraLightStaggerBase * (0.2 + clampedCharge * 1.15);
  }

  public resetForEncounter(_encoreTier: number): void {
    this.currentDrainProgress = 0;
    restoreDrainableMaterials(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
    );

    this.staggerBlend = 0;
    this.finisherPoseState.initialized = false;
    this.hitFlashTimer = 0;
    this.castAnimTimer = 0;
    this.accessoryFlickTimer = 0;
    this.targetAscendY = 0;
    this.currentAscendY = 0;
    this.hasPrevPos = false;
    this.smoothedSpeed = 0;
    this.smoothedLateralVel = 0;
    this.headAccessory.rotation.set(0, 0, 0);
    this.stageLight.intensity = ARENA_CONFIG.lighting.tiaraLightCombatBase;
    this.setPhaseVisuals(BOSS_PHASES.PHASE_1);
    this.setExpression(BOSS_EXPRESSIONS.COMBAT);

    this.bodyPivot.position.set(
      0,
      MIKU_CONFIG.combatBaseBodyY + MIKU_CONFIG.floatHeight,
      0,
    );
    this.bodyPivot.rotation.set(0, 0, 0);
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(0, 0, 0);
    this.root.position.set(
      BOSS_CONFIG.spawnX,
      BOSS_CONFIG.spawnY,
      BOSS_CONFIG.spawnZ,
    );
    this.root.rotation.set(0, BOSS_CONFIG.spawnYaw, 0);
  }

  public dispose(): void {
    this.faceTexture.dispose();
    this.parent.remove(this.root);
  }
}
