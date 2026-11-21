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
  FINISHER_RESISTANCE_CONFIG,
  GAME_STATES,
  PALETTE,
  SERENA_CONFIG,
  SIPHON_GALLERY_CONFIG,
  VICTORY_DIORAMA_CONFIG,
  type BossExpression,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';
import { ToonAssets } from '../../engine/ToonAssets';
import {
  BossBase,
  applyMaterialBleach,
  computeFinisherHeadChoreography,
  restoreDrainableMaterials,
  type FinisherHeadChoreography,
  type MaterialBleachMetadata,
} from './BossBase';

interface HairRibbonChain {
  rootSeg: THREE.Group;
  midSeg: THREE.Group;
  tipSeg: THREE.Group;
  phase: number;
  spread: number;
}

interface PhaseRingHandles {
  outerRing: THREE.Mesh;
  innerRing: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  innerMat: THREE.MeshBasicMaterial;
}

interface SerenaFinisherPoseCache {
  initialized: boolean;
  bodyY: number;
  torsoX: number;
  torsoZ: number;
  headX: number;
  headZ: number;
  leftShoulderX: number;
  leftShoulderZ: number;
  rightShoulderX: number;
  rightShoulderZ: number;
  leftElbowX: number;
  leftElbowZ: number;
  rightElbowX: number;
  rightElbowZ: number;
  tail1X: number;
  tail1Y: number;
  tail1Z: number;
  tail2X: number;
  tail2Y: number;
  tail3X: number;
  tail3Y: number;
  tail4X: number;
  tail4Y: number;
}

/**
 * Sovereign Mermaid Boss Rig: Serena, Voice of the Deep (Realm II — Pearl Amphitheater).
 * Implements BossRigAdapter (LSP) with an articulated 4-segment bioluminescent fish tail,
 * wide translucent caudal fin, flowing aquamarine hair with pearl ornaments, translucent
 * fin-sleeves, ornate coral-and-pearl tiara, 512x512 CanvasTexture anime face,
 * zero-gap lip alignment across finisher poses [1-4], and Abyssal Thrall / Collapse dioramas.
 */
export class SerenaRig extends BossBase {
  public readonly id = SERENA_CONFIG.id;
  public readonly displayName = SERENA_CONFIG.displayName;
  public readonly title = SERENA_CONFIG.title;

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
  private readonly matHairBase: THREE.MeshToonMaterial;
  private readonly matHairMid: THREE.MeshToonMaterial;
  private readonly matHairTips: THREE.MeshToonMaterial;
  private readonly matBodice: THREE.MeshToonMaterial;
  private readonly matTailTeal: THREE.MeshToonMaterial;
  private readonly matTailViolet: THREE.MeshToonMaterial;
  private readonly matFinSheer: THREE.MeshToonMaterial;
  private readonly matCoral: THREE.MeshToonMaterial;
  private readonly matPearl: THREE.MeshToonMaterial;
  private readonly matGold: THREE.MeshToonMaterial;
  private readonly matFaceOverlay: THREE.MeshBasicMaterial;

  private readonly faceCanvas: HTMLCanvasElement;
  private readonly faceCtx: CanvasRenderingContext2D;
  private readonly faceTexture: THREE.CanvasTexture;
  private readonly coralOriginalColor = new THREE.Color(PALETTE.serenaCoralTiara);
  private readonly drainedAshColor = new THREE.Color(PALETTE.drainedAshSilver);

  // Skeleton Hierarchy
  private readonly bodyPivot = new THREE.Group();
  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly backHairRoot = new THREE.Group();
  private readonly leftShoulderPivot = new THREE.Group();
  private readonly leftElbowPivot = new THREE.Group();
  private readonly rightShoulderPivot = new THREE.Group();
  private readonly rightElbowPivot = new THREE.Group();
  private readonly leftHandAnchor = new THREE.Object3D();
  private readonly rightHandAnchor = new THREE.Object3D();

  // Articulated 4-Segment Fish Tail + Wide Translucent Caudal Fin
  private readonly tailSeg1 = new THREE.Group();
  private readonly tailSeg2 = new THREE.Group();
  private readonly tailSeg3 = new THREE.Group();
  private readonly tailSeg4 = new THREE.Group();
  private readonly caudalFinPivot = new THREE.Group();

  // Ambient & Phase Accents
  private readonly sirenHalo = new THREE.Group();
  private readonly phaseAuraRings = new THREE.Group();
  private phaseAuraHandles!: PhaseRingHandles;
  private tiaraLight!: THREE.PointLight;
  private readonly hairRibbons: HairRibbonChain[] = [];

  // Runtime Visual State
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

  private readonly finisherPoseState: SerenaFinisherPoseCache = {
    initialized: false,
    bodyY: 0.48,
    torsoX: 0.14,
    torsoZ: 0,
    headX: -0.38,
    headZ: 0,
    leftShoulderX: -0.34,
    leftShoulderZ: -0.24,
    rightShoulderX: -0.34,
    rightShoulderZ: 0.24,
    leftElbowX: -0.68,
    leftElbowZ: 0,
    rightElbowX: -0.68,
    rightElbowZ: 0,
    tail1X: 0.45,
    tail1Y: 0.2,
    tail1Z: 0.25,
    tail2X: 0.55,
    tail2Y: 0.35,
    tail3X: 0.35,
    tail3Y: 0.45,
    tail4X: 0.2,
    tail4Y: 0.42,
  };

  constructor(parent: THREE.Object3D) {
    super();
    this.parent = parent;
    this.root.name = 'SerenaVoiceOfTheDeep';

    this.matSkin = ToonAssets.createToonMaterial(PALETTE.serenaSkin, {
      emissive: PALETTE.serenaSkin,
      emissiveIntensity: 0.05,
    });
    this.matHairBase = ToonAssets.createToonMaterial(PALETTE.serenaHairBase, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.22,
    });
    this.matHairMid = ToonAssets.createToonMaterial(PALETTE.serenaHairMid, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.18,
    });
    this.matHairTips = ToonAssets.createToonMaterial(PALETTE.serenaHairTips, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.34,
    });
    this.matBodice = ToonAssets.createToonMaterial(PALETTE.serenaBodiceDeep, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.2,
    });
    this.matTailTeal = ToonAssets.createToonMaterial(PALETTE.serenaTailTeal, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.26,
    });
    this.matTailViolet = ToonAssets.createToonMaterial(PALETTE.serenaTailViolet, {
      emissive: PALETTE.glowViolet,
      emissiveIntensity: 0.34,
    });
    this.matFinSheer = ToonAssets.createToonMaterial(PALETTE.serenaFinSheer, {
      emissive: PALETTE.serenaHairTips,
      emissiveIntensity: 0.32,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    this.matCoral = ToonAssets.createToonMaterial(PALETTE.serenaCoralTiara, {
      emissive: PALETTE.coralRose,
      emissiveIntensity: 0.42,
    });
    this.matPearl = ToonAssets.createToonMaterial(PALETTE.serenaPearl, {
      emissive: PALETTE.serenaHairTips,
      emissiveIntensity: 0.22,
    });
    this.matGold = ToonAssets.createToonMaterial(PALETTE.atlanteanGold, {
      emissive: PALETTE.atlanteanGold,
      emissiveIntensity: 0.24,
    });

    this.registerDrainable(this.matHairBase);
    this.registerDrainable(this.matHairMid);
    this.registerDrainable(this.matHairTips);
    this.registerDrainable(this.matBodice);
    this.registerDrainable(this.matTailTeal);
    this.registerDrainable(this.matTailViolet);
    this.registerDrainable(this.matFinSheer);
    this.registerDrainable(this.matCoral);
    this.registerDrainable(this.matPearl);
    this.registerDrainable(this.matGold);

    // High-resolution 512x512 procedural anime face texture
    const size = ARENA_CONFIG.faceTextureSize;
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = size;
    this.faceCanvas.height = size;
    const ctx = this.faceCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to initialize 2D context for Serena face canvas.');
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
      SERENA_CONFIG.combatBaseBodyY + SERENA_CONFIG.floatHeight,
      0,
    );
    this.root.add(this.bodyPivot);

    this.buildTorsoAndBodice();
    this.buildFourSegmentFishTail();
    this.buildArmsAndFinSleeves();
    this.buildHeadFaceAndAquamarineHair();
    this.buildCoralPearlTiara();
    this.buildSirenHalo();
    this.buildPhaseAuraRings();
  }

  private buildTorsoAndBodice(): void {
    this.torsoGroup.position.set(0, 0.05, 0);
    this.bodyPivot.add(this.torsoGroup);

    // Sculpted waist-to-hip transition belt (gold & pearl filigree)
    const { group: waistBelt } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.118, 0.148, 0.14, 14),
      this.matTailTeal,
      1.05,
    );
    waistBelt.scale.set(1.06, 1.0, 0.84);
    waistBelt.position.y = 0.02;
    this.torsoGroup.add(waistBelt);

    const goldHipRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.132, 0.015, 8, 22),
      this.matGold,
    );
    goldHipRing.rotation.x = Math.PI / 2;
    goldHipRing.scale.set(1.06, 0.86, 1.0);
    goldHipRing.position.y = 0.085;
    this.torsoGroup.add(goldHipRing);

    // Bare midriff & upper ribcage
    const { group: midriff } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.118, 0.102, 0.18, 12),
      this.matSkin,
      1.05,
    );
    midriff.scale.set(1.02, 1.0, 0.82);
    midriff.position.y = 0.175;
    this.torsoGroup.add(midriff);

    // Sea-shell filigree bodice
    const { group: chest } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.142, 0.118, 0.22, 14),
      this.matBodice,
      1.055,
    );
    chest.scale.set(1.04, 1.0, 0.84);
    chest.position.y = 0.34;
    this.torsoGroup.add(chest);

    for (const side of [-1, 1] as const) {
      const shellCup = new THREE.Mesh(
        new THREE.SphereGeometry(0.068, 14, 12),
        this.matTailViolet,
      );
      shellCup.scale.set(1.02, 0.92, 0.72);
      shellCup.position.set(side * 0.056, 0.365, 0.082);
      this.torsoGroup.add(shellCup);

      const pearlStud = new THREE.Mesh(
        new THREE.SphereGeometry(0.016, 10, 10),
        this.matPearl,
      );
      pearlStud.position.set(side * 0.056, 0.37, 0.132);
      this.torsoGroup.add(pearlStud);
    }

    // Center pearl pendant + collarbone skin
    const centerPearl = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.026, 0),
      this.matPearl,
    );
    centerPearl.scale.set(0.75, 1.3, 0.6);
    centerPearl.position.set(0, 0.33, 0.125);
    this.torsoGroup.add(centerPearl);

    const collarbone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.128, 0.095, 12),
      this.matSkin,
    );
    collarbone.scale.set(1.12, 1.0, 0.78);
    collarbone.position.y = 0.48;
    this.torsoGroup.add(collarbone);

    // Pearl necklace choker
    const choker = new THREE.Mesh(
      new THREE.TorusGeometry(0.064, 0.009, 6, 18),
      this.matGold,
    );
    choker.rotation.x = Math.PI / 2;
    choker.position.y = 0.51;
    this.torsoGroup.add(choker);

    // Translucent sheer hip side-fins
    for (const side of [-1, 1] as const) {
      const hipFinGeo = new THREE.ConeGeometry(0.14, 0.42, 4);
      const hipFin = new THREE.Mesh(hipFinGeo, this.matFinSheer);
      hipFin.scale.set(0.28, 1.0, 1.15);
      hipFin.position.set(side * 0.18, -0.04, -0.02);
      hipFin.rotation.z = side * 0.48;
      hipFin.rotation.x = 0.22;
      this.torsoGroup.add(hipFin);
    }
  }

  /**
   * Articulated 4-segment bioluminescent teal-and-violet mermaid tail ending in a wide
   * translucent caudal tail-fin that undulates smoothly during glide and coils gracefully
   * beside the Dark Mage during Siphon Kiss poses.
   */
  private buildFourSegmentFishTail(): void {
    // Segment 1 (Hips -> Upper Tail)
    this.tailSeg1.position.set(0, -0.03, 0);
    this.bodyPivot.add(this.tailSeg1);

    const { group: seg1Mesh } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.146, 0.126, 0.34, 14),
      this.matTailTeal,
      1.055,
    );
    seg1Mesh.scale.set(1.06, 1.0, 0.85);
    seg1Mesh.position.y = -0.17;
    this.tailSeg1.add(seg1Mesh);

    const band1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.132, 0.014, 6, 18),
      this.matTailViolet,
    );
    band1.rotation.x = Math.PI / 2;
    band1.scale.set(1.04, 0.86, 1.0);
    band1.position.y = -0.28;
    this.tailSeg1.add(band1);

    // Segment 2 (Mid Tail)
    this.tailSeg2.position.set(0, -0.33, 0);
    this.tailSeg1.add(this.tailSeg2);

    const { group: seg2Mesh } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.124, 0.098, 0.31, 12),
      this.matTailTeal,
      1.06,
    );
    seg2Mesh.scale.set(1.02, 1.0, 0.88);
    seg2Mesh.position.y = -0.155;
    this.tailSeg2.add(seg2Mesh);

    const band2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.106, 0.015, 6, 16),
      this.matTailViolet,
    );
    band2.rotation.x = Math.PI / 2;
    band2.position.y = -0.24;
    this.tailSeg2.add(band2);

    // Dorsal ridge fin along back of Segment 2
    const dorsalFin = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.28, 4),
      this.matFinSheer,
    );
    dorsalFin.scale.set(0.18, 1.0, 1.0);
    dorsalFin.rotation.x = -Math.PI * 0.62;
    dorsalFin.position.set(0, -0.16, -0.13);
    this.tailSeg2.add(dorsalFin);

    // Segment 3 (Lower Tail)
    this.tailSeg3.position.set(0, -0.3, 0);
    this.tailSeg2.add(this.tailSeg3);

    const { group: seg3Mesh } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.096, 0.068, 0.28, 12),
      this.matTailViolet,
      1.06,
    );
    seg3Mesh.position.y = -0.14;
    this.tailSeg3.add(seg3Mesh);

    const goldAnklet = new THREE.Mesh(
      new THREE.TorusGeometry(0.076, 0.011, 6, 16),
      this.matGold,
    );
    goldAnklet.rotation.x = Math.PI / 2;
    goldAnklet.position.y = -0.22;
    this.tailSeg3.add(goldAnklet);

    // Segment 4 (Tail Peduncle -> Caudal Fin Base)
    this.tailSeg4.position.set(0, -0.27, 0);
    this.tailSeg3.add(this.tailSeg4);

    const { group: seg4Mesh } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.066, 0.04, 0.24, 10),
      this.matTailTeal,
      1.065,
    );
    seg4Mesh.position.y = -0.12;
    this.tailSeg4.add(seg4Mesh);

    // Wide Translucent Caudal Tail-Fin (Paired Fanned Flukes + Inner Veil)
    this.caudalFinPivot.position.set(0, -0.23, 0);
    this.tailSeg4.add(this.caudalFinPivot);

    for (const side of [-1, 1] as const) {
      const flukeGeo = new THREE.ConeGeometry(0.24, 0.56, 5);
      const fluke = new THREE.Mesh(flukeGeo, this.matFinSheer);
      fluke.scale.set(1.18, 1.0, 0.16);
      fluke.rotation.x = Math.PI;
      fluke.rotation.z = side * 0.52;
      fluke.position.set(side * 0.18, -0.22, -0.02);
      this.caudalFinPivot.add(fluke);

      const flukeRib = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.004, 0.48, 6),
        this.matTailViolet,
      );
      flukeRib.rotation.z = side * 0.52;
      flukeRib.position.set(side * 0.15, -0.19, -0.01);
      this.caudalFinPivot.add(flukeRib);
    }

    const centerVeil = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.36, 5),
      this.matFinSheer,
    );
    centerVeil.scale.set(1.0, 1.0, 0.12);
    centerVeil.rotation.x = Math.PI;
    centerVeil.position.set(0, -0.16, -0.02);
    this.caudalFinPivot.add(centerVeil);
  }

  private buildArmsAndFinSleeves(): void {
    const buildArm = (
      side: -1 | 1,
      shoulderPivot: THREE.Group,
      elbowPivot: THREE.Group,
      handAnchor: THREE.Object3D,
    ): void => {
      shoulderPivot.position.set(side * 0.182, 0.445, 0);
      this.torsoGroup.add(shoulderPivot);

      const { group: upperArm } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.044, 0.037, 0.25, 10),
        this.matSkin,
        1.08,
      );
      upperArm.position.y = -0.125;
      shoulderPivot.add(upperArm);

      const pearlArmlet = new THREE.Mesh(
        new THREE.TorusGeometry(0.044, 0.01, 6, 14),
        this.matGold,
      );
      pearlArmlet.rotation.x = Math.PI / 2;
      pearlArmlet.position.y = -0.2;
      shoulderPivot.add(pearlArmlet);

      elbowPivot.position.set(0, -0.25, 0);
      shoulderPivot.add(elbowPivot);

      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.029, 0.22, 10),
        this.matSkin,
      );
      forearm.position.y = -0.11;
      elbowPivot.add(forearm);

      // Translucent flowing fin-sleeve draped along outer forearm
      const finSleeve = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.34, 5),
        this.matFinSheer,
      );
      finSleeve.scale.set(0.24, 1.0, 1.15);
      finSleeve.rotation.x = Math.PI + 0.18;
      finSleeve.position.set(side * 0.045, -0.16, -0.045);
      elbowPivot.add(finSleeve);

      const wristCuff = new THREE.Mesh(
        new THREE.TorusGeometry(0.036, 0.008, 6, 12),
        this.matPearl,
      );
      wristCuff.rotation.x = Math.PI / 2;
      wristCuff.position.y = -0.21;
      elbowPivot.add(wristCuff);

      const { group: hand } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.046, 0.076, 0.05),
        this.matSkin,
        1.08,
      );
      hand.position.set(0, -0.255, 0.008);
      elbowPivot.add(hand);

      handAnchor.position.set(0, -0.295, 0.02);
      elbowPivot.add(handAnchor);
    };

    buildArm(-1, this.leftShoulderPivot, this.leftElbowPivot, this.leftHandAnchor);
    buildArm(1, this.rightShoulderPivot, this.rightElbowPivot, this.rightHandAnchor);

    this.leftWristAnchor.position.set(0, -0.215, 0.004);
    this.leftElbowPivot.add(this.leftWristAnchor);
    this.rightWristAnchor.position.set(0, -0.215, 0.004);
    this.rightElbowPivot.add(this.rightWristAnchor);
  }

  private buildHeadFaceAndAquamarineHair(): void {
    // Exact Marina headGroup & headAnchor coordinates for zero-gap lip alignment with DarkMageRig
    this.headGroup.position.set(0, 0.515, 0.008);
    this.torsoGroup.add(this.headGroup);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.054, 0.11, 10),
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

    // Lip-contact & finisher camera focus anchor
    this.headAnchor.position.set(0, headCenterY - 0.045, 0.116);
    this.headGroup.add(this.headAnchor);

    // Delicate ear-fins & pearl drop earrings
    for (const side of [-1, 1] as const) {
      const earFin = new THREE.Mesh(
        new THREE.ConeGeometry(0.036, 0.095, 4),
        this.matFinSheer,
      );
      earFin.scale.set(0.22, 1.0, 0.9);
      earFin.rotation.z = -side * 1.15;
      earFin.rotation.y = -side * 0.35;
      earFin.position.set(side * 0.132, headCenterY - 0.008, -0.01);
      this.headGroup.add(earFin);

      const earring = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 10, 10),
        this.matPearl,
      );
      earring.position.set(side * 0.116, headCenterY - 0.052, 0.006);
      this.headGroup.add(earring);
    }

    // 512x512 CanvasTexture Face Shell
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

    // Aquamarine Hair Crown
    const { group: hairCrown } = ToonAssets.createOutlinedMesh(
      new THREE.SphereGeometry(
        0.132,
        22,
        18,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.62,
      ),
      this.matHairBase,
      1.045,
    );
    hairCrown.scale.set(0.98, 1.04, 1.05);
    hairCrown.rotation.x = -0.18;
    hairCrown.position.set(0, headCenterY + 0.012, -0.008);
    this.headGroup.add(hairCrown);

    // Sweeping anime bangs framing her forehead
    const bangSpecs = [
      { x: 0.0, y: 0.262, z: 0.106, w: 0.044, h: 0.105, rz: 0.04, rx: -0.18 },
      { x: -0.044, y: 0.258, z: 0.1, w: 0.046, h: 0.118, rz: 0.16, rx: -0.14 },
      { x: 0.044, y: 0.258, z: 0.1, w: 0.046, h: 0.118, rz: -0.16, rx: -0.14 },
      { x: -0.084, y: 0.246, z: 0.082, w: 0.044, h: 0.128, rz: 0.28, rx: -0.08 },
      { x: 0.084, y: 0.246, z: 0.082, w: 0.044, h: 0.128, rz: -0.28, rx: -0.08 },
    ];
    bangSpecs.forEach((b) => {
      const { group: bang } = ToonAssets.createOutlinedMesh(
        new THREE.ConeGeometry(b.w * 0.62, b.h, 6),
        this.matHairBase,
        1.06,
      );
      bang.scale.set(1.0, 1.0, 0.45);
      bang.rotation.x = Math.PI + b.rx;
      bang.rotation.z = b.rz;
      bang.position.set(b.x, b.y, b.z);
      this.headGroup.add(bang);
    });

    // Side locks accented with luminous pearl hair ornaments
    for (const side of [-1, 1] as const) {
      const sideLock = new THREE.Group();
      sideLock.position.set(side * 0.112, headCenterY + 0.02, 0.032);
      this.headGroup.add(sideLock);

      const { group: upperLock } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.034, 0.028, 0.28, 8),
        this.matHairBase,
        1.06,
      );
      upperLock.scale.set(0.75, 1.0, 1.15);
      upperLock.position.set(side * 0.01, -0.14, 0.015);
      upperLock.rotation.z = side * 0.08;
      sideLock.add(upperLock);

      const pearlClip = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 10, 10),
        this.matPearl,
      );
      pearlClip.position.set(side * 0.018, -0.04, 0.032);
      sideLock.add(pearlClip);

      const { group: tipLock } = ToonAssets.createOutlinedMesh(
        new THREE.ConeGeometry(0.028, 0.18, 7),
        this.matHairTips,
        1.07,
      );
      tipLock.scale.set(0.75, 1.0, 1.1);
      tipLock.rotation.x = Math.PI;
      tipLock.position.set(side * 0.024, -0.36, 0.026);
      sideLock.add(tipLock);
    }

    // 7 Articulated Flowing Aquamarine Back Hair Ribbons
    this.backHairRoot.position.set(0, headCenterY + 0.015, -0.098);
    this.headGroup.add(this.backHairRoot);

    const ribbonCount = 7;
    for (let i = 0; i < ribbonCount; i++) {
      const t = i / (ribbonCount - 1) - 0.5;
      const angleY = t * 1.15;
      const lengthFactor = 1.0 - Math.abs(t) * 0.18;

      const rootSeg = new THREE.Group();
      rootSeg.position.set(t * 0.21, 0, -Math.cos(t * 1.6) * 0.025);
      rootSeg.rotation.y = angleY * 0.35;
      this.backHairRoot.add(rootSeg);

      const len1 = 0.44 * lengthFactor;
      const { group: seg1Mesh } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.072, len1, 0.032),
        this.matHairBase,
        { x: 1.08, y: 1.02, z: 1.25 },
      );
      seg1Mesh.position.y = -len1 * 0.5;
      rootSeg.add(seg1Mesh);

      const midSeg = new THREE.Group();
      midSeg.position.y = -len1;
      rootSeg.add(midSeg);

      const len2 = 0.42 * lengthFactor;
      const { group: seg2Mesh } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.062, len2, 0.026),
        this.matHairMid,
        { x: 1.08, y: 1.02, z: 1.25 },
      );
      seg2Mesh.position.y = -len2 * 0.5;
      midSeg.add(seg2Mesh);

      if (i === 1 || i === 3 || i === 5) {
        const hairPearl = new THREE.Mesh(
          new THREE.SphereGeometry(0.018, 10, 10),
          this.matPearl,
        );
        hairPearl.position.set(0, -len2 * 0.45, -0.018);
        midSeg.add(hairPearl);
      }

      const tipSeg = new THREE.Group();
      tipSeg.position.y = -len2;
      midSeg.add(tipSeg);

      const len3 = 0.34 * lengthFactor;
      const { group: seg3Mesh } = ToonAssets.createOutlinedMesh(
        new THREE.ConeGeometry(0.038, len3, 5),
        this.matHairTips,
        1.08,
      );
      seg3Mesh.scale.set(1.0, 1.0, 0.48);
      seg3Mesh.rotation.x = Math.PI;
      seg3Mesh.position.y = -len3 * 0.5;
      tipSeg.add(seg3Mesh);

      this.hairRibbons.push({
        rootSeg,
        midSeg,
        tipSeg,
        phase: i * 0.85,
        spread: t,
      });
    }
  }

  private buildCoralPearlTiara(): void {
    const L = ARENA_CONFIG.lighting;
    this.headAccessory.position.set(0, 0.305, 0.035);
    this.headAccessory.rotation.x = -0.16;
    this.headGroup.add(this.headAccessory);

    const circlet = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.009, 8, 24, Math.PI * 1.15),
      this.matGold,
    );
    circlet.rotation.x = Math.PI * 0.48;
    circlet.rotation.z = -Math.PI * 0.075;
    this.headAccessory.add(circlet);

    // Center radiant pearl jewel framed by branching rose-coral spires
    const centerPearl = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 12, 12),
      this.matPearl,
    );
    centerPearl.position.set(0, 0.044, 0.1);
    this.headAccessory.add(centerPearl);

    const centerCoral = new THREE.Mesh(
      new THREE.ConeGeometry(0.02, 0.115, 6),
      this.matCoral,
    );
    centerCoral.position.set(0, 0.072, 0.092);
    this.headAccessory.add(centerCoral);

    for (const side of [-1, 1] as const) {
      const branch1 = new THREE.Mesh(
        new THREE.ConeGeometry(0.015, 0.095, 6),
        this.matCoral,
      );
      branch1.position.set(side * 0.046, 0.044, 0.082);
      branch1.rotation.z = -side * 0.38;
      this.headAccessory.add(branch1);

      const branch2 = new THREE.Mesh(
        new THREE.ConeGeometry(0.012, 0.076, 6),
        this.matCoral,
      );
      branch2.position.set(side * 0.084, 0.024, 0.056);
      branch2.rotation.z = -side * 0.68;
      this.headAccessory.add(branch2);

      const pearlNode = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 10, 10),
        this.matPearl,
      );
      pearlNode.position.set(side * 0.062, 0.022, 0.075);
      this.headAccessory.add(pearlNode);
    }

    this.tiaraLight = new THREE.PointLight(
      PALETTE.biolumCyan,
      L.tiaraLightCombatBase,
      L.tiaraLightDistance,
      L.tiaraLightDecay,
    );
    this.tiaraLight.position.set(0, 0.14, 0.18);
    this.headAccessory.add(this.tiaraLight);
  }

  private buildSirenHalo(): void {
    this.sirenHalo.position.set(0, 0.42, -0.26);
    this.torsoGroup.add(this.sirenHalo);

    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.biolumCyan,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.39, 32),
      ringMat,
    );
    this.sirenHalo.add(outerRing);

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 10, 10),
        i % 2 === 0 ? this.matPearl : this.matCoral,
      );
      orb.position.set(Math.cos(ang) * 0.42, Math.sin(ang) * 0.42, 0);
      this.sirenHalo.add(orb);
    }
  }

  private buildPhaseAuraRings(): void {
    this.phaseAuraRings.position.set(0, 0.18, 0);

    const outerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.biolumCyan,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.08, 40),
      outerMat,
    );
    outerRing.rotation.x = Math.PI / 2;
    this.phaseAuraRings.add(outerRing);

    const innerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.serenaTailViolet,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.024, 8, 36),
      innerMat,
    );
    innerRing.rotation.x = Math.PI * 0.42;
    this.phaseAuraRings.add(innerRing);

    this.phaseAuraRings.visible = false;
    this.phaseAuraHandles = { outerRing, innerRing, outerMat, innerMat };
    this.bodyPivot.add(this.phaseAuraRings);
  }

  public setPhaseVisuals(phase: BossPhase): void {
    this.phaseLevel = phase;
    this.phaseAuraRings.visible = phase >= BOSS_PHASES.PHASE_2;
  }

  public setAscendHeight(extraY: number): void {
    this.targetAscendY = extraY;
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.18;
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
   * Renders Serena's high-detail 512x512 anime facial expressions onto her CanvasTexture.
   */
  public setExpression(expression: BossExpression, spiralPhase = 0): void {
    this.currentExpression = expression;
    const ctx = this.faceCtx;
    const size = ARENA_CONFIG.faceTextureSize;
    ctx.clearRect(0, 0, size, size);

    const drawCheekBlush = (intensity: number, withHatch: boolean): void => {
      const cheeks = [
        { x: 136, y: 318, rx: 56, ry: 30 },
        { x: 376, y: 318, rx: 56, ry: 30 },
      ];
      cheeks.forEach((c) => {
        const grad = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, c.rx);
        grad.addColorStop(0.0, `rgba(${PALETTE.rgba.blushCoreRgb}, ${intensity})`);
        grad.addColorStop(
          0.55,
          `rgba(${PALETTE.rgba.blushSoftRgb}, ${intensity * 0.55})`,
        );
        grad.addColorStop(1.0, `rgba(${PALETTE.rgba.blushSoftRgb}, 0)`);
        ctx.save();
        ctx.scale(1, c.ry / c.rx);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(c.x, c.y * (c.rx / c.ry), c.rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (withHatch) {
          ctx.strokeStyle = `rgba(${PALETTE.rgba.blushHatchRgb}, ${Math.min(0.85, intensity * 0.95)})`;
          ctx.lineWidth = 3.2;
          ctx.lineCap = 'round';
          for (let k = -1; k <= 1; k++) {
            ctx.beginPath();
            ctx.moveTo(c.x + k * 14 - 5, c.y + 10);
            ctx.lineTo(c.x + k * 14 + 6, c.y - 9);
            ctx.stroke();
          }
        }
      });
    };

    const drawAquamarineEye = (cx: number, cy: number, side: -1 | 1): void => {
      ctx.save();
      ctx.translate(cx, cy);

      ctx.fillStyle = PALETTE.hex.pureWhite;
      ctx.beginPath();
      ctx.ellipse(0, 4, 46, 36, 0, 0, Math.PI * 2);
      ctx.fill();

      const irisGrad = ctx.createLinearGradient(0, -30, 0, 36);
      irisGrad.addColorStop(0.0, PALETTE.hex.serenaEyeRim);
      irisGrad.addColorStop(0.32, PALETTE.hex.serenaEyeTop);
      irisGrad.addColorStop(0.68, PALETTE.hex.serenaEyeMid);
      irisGrad.addColorStop(1.0, PALETTE.hex.serenaEyeBottom);
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.ellipse(0, 6, 30, 32, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = PALETTE.hex.serenaEyeRim;
      ctx.beginPath();
      ctx.ellipse(0, 4, 13, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      // Starlight speculars
      ctx.fillStyle = PALETTE.hex.pureWhite;
      ctx.beginPath();
      ctx.ellipse(-10 * side, -8, 8.5, 10, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(10 * side, 16, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Thick winged siren eyelashes
      ctx.strokeStyle = PALETTE.hex.lashSlate;
      ctx.lineWidth = 8.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-48, 2);
      ctx.quadraticCurveTo(0, -40, 48, 4);
      ctx.stroke();

      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(side * 44, -4);
      ctx.lineTo(side * 58, -14);
      ctx.stroke();

      ctx.restore();
    };

    const drawClosedSiphonEye = (cx: number, cy: number, side: -1 | 1): void => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = PALETTE.hex.lashSlate;
      ctx.lineWidth = 7.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-42, -6);
      ctx.quadraticCurveTo(0, 26, 42, -4);
      ctx.stroke();

      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(side * 38, 2);
      ctx.lineTo(side * 50, 11);
      ctx.stroke();
      ctx.restore();
    };

    const drawSpiralDizzyEye = (cx: number, cy: number, phase: number): void => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = PALETTE.hex.serenaEyeRim;
      ctx.lineWidth = 6.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const turns = 2.6;
      const steps = 46;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const ang = t * Math.PI * 2 * turns + phase;
        const r = t * 34;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    const drawBrows = (tilt: number, yOffset: number): void => {
      ctx.strokeStyle = PALETTE.hex.serenaBrow;
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      for (const side of [-1, 1] as const) {
        const cx = side < 0 ? 166 : 346;
        ctx.beginPath();
        ctx.moveTo(cx - side * 38, 178 + yOffset - tilt);
        ctx.quadraticCurveTo(
          cx,
          166 + yOffset,
          cx + side * 38,
          180 + yOffset + tilt,
        );
        ctx.stroke();
      }
    };

    // Subtle anime nose bridge
    ctx.strokeStyle = PALETTE.rgba.noseTint;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(254, 286);
    ctx.lineTo(258, 304);
    ctx.stroke();

    if (expression === BOSS_EXPRESSIONS.COMBAT) {
      drawCheekBlush(0.24, false);
      drawAquamarineEye(166, 242, -1);
      drawAquamarineEye(346, 242, 1);
      drawBrows(-8, 0);

      // Confident siren smile
      ctx.strokeStyle = PALETTE.hex.lipRose;
      ctx.lineWidth = 5.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(222, 376);
      ctx.quadraticCurveTo(256, 392, 290, 374);
      ctx.stroke();
    } else if (expression === BOSS_EXPRESSIONS.STAGGER) {
      drawCheekBlush(0.56, true);
      drawAquamarineEye(166, 246, -1);
      drawAquamarineEye(346, 246, 1);
      drawBrows(12, 8);

      // Flustered parted gasp
      ctx.fillStyle = PALETTE.hex.deepLipBerry;
      ctx.beginPath();
      ctx.ellipse(256, 380, 17, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.rgba.lipGloss;
      ctx.beginPath();
      ctx.ellipse(252, 374, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (expression === BOSS_EXPRESSIONS.SIPHON_KISS) {
      drawCheekBlush(0.84, true);
      drawClosedSiphonEye(166, 250, -1);
      drawClosedSiphonEye(346, 250, 1);
      drawBrows(14, 14);

      // Soft parted lips pressed forward
      ctx.fillStyle = PALETTE.hex.lipRose;
      ctx.beginPath();
      ctx.ellipse(256, 380, 21, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.rgba.puckerGloss;
      ctx.beginPath();
      ctx.ellipse(252, 375, 7, 3.2, -0.15, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // DRAINED_FAINT (@_@ animated spiral eyes + dazed wavy mouth)
      drawCheekBlush(0.72, true);
      drawSpiralDizzyEye(166, 248, spiralPhase);
      drawSpiralDizzyEye(346, 248, -spiralPhase);
      drawBrows(16, 16);

      ctx.strokeStyle = PALETTE.hex.lipRose;
      ctx.lineWidth = 5.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(226, 382);
      ctx.quadraticCurveTo(241, 368, 256, 382);
      ctx.quadraticCurveTo(271, 396, 286, 380);
      ctx.stroke();
    }

    this.faceTexture.needsUpdate = true;
  }

  public applyDrainBleach(drainProgress: number): void {
    this.currentDrainProgress = THREE.MathUtils.clamp(drainProgress, 0, 1);
    applyMaterialBleach(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
      this.currentDrainProgress,
    );
    this.matCoral.color
      .copy(this.coralOriginalColor)
      .lerp(this.drainedAshColor, this.currentDrainProgress);
  }

  /**
   * Drives Serena's gliding mermaid tail undulation, flowing hair, phase aura rings,
   * cast flourishes, hit flashes, and staggered kneeling curl.
   */
  public updateCombatPose(
    dt: number,
    state: GameState,
    elapsed: number,
    staggerProgressOverride: number | null = null,
  ): void {
    this.finisherPoseState.initialized = false;
    const L = ARENA_CONFIG.lighting;

    // Smooth ascension interpolation for Phase III Undertow
    this.currentAscendY = THREE.MathUtils.lerp(
      this.currentAscendY,
      this.targetAscendY,
      Math.min(1, dt * 4.0),
    );

    const targetStagger =
      staggerProgressOverride !== null
        ? staggerProgressOverride
        : state === GAME_STATES.STAGGER
          ? 1.0
          : 0.0;
    this.staggerBlend = THREE.MathUtils.lerp(
      this.staggerBlend,
      targetStagger,
      Math.min(1, dt * 5.2),
    );
    const s = this.staggerBlend;

    // Hit flash feedback
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const flash = this.hitFlashTimer / 0.18;
      this.matBodice.emissiveIntensity = 0.2 + flash * 1.15;
      this.matTailTeal.emissiveIntensity = 0.26 + flash * 1.1;
    } else {
      const phaseBoost =
        this.phaseLevel === BOSS_PHASES.PHASE_3
          ? 0.3
          : this.phaseLevel === BOSS_PHASES.PHASE_2
            ? 0.16
            : 0.0;
      this.matBodice.emissiveIntensity = 0.2 + phaseBoost;
      this.matTailTeal.emissiveIntensity = 0.26 + phaseBoost;
    }

    // Cast flourish envelope
    let castLift = 0;
    if (this.castAnimTimer > 0) {
      this.castAnimTimer = Math.max(0, this.castAnimTimer - dt);
      castLift = Math.sin((this.castAnimTimer / 0.55) * Math.PI);
    }

    // Glide bobbing & staggered curl height
    const glideBob = Math.sin(elapsed * 2.4) * 0.095 * (1 - s);
    const baseY =
      SERENA_CONFIG.combatBaseBodyY +
      SERENA_CONFIG.floatHeight +
      this.currentAscendY +
      glideBob;
    const staggerY = 0.52 + Math.sin(elapsed * 3.8) * 0.015;
    this.bodyPivot.position.set(0, THREE.MathUtils.lerp(baseY, staggerY, s), 0);
    this.bodyPivot.rotation.set(
      THREE.MathUtils.lerp(0.06, 0.18, s),
      0,
      Math.sin(elapsed * 1.8) * 0.04 * (1 - s),
    );

    this.torsoGroup.rotation.set(
      THREE.MathUtils.lerp(-0.04 + castLift * -0.1, 0.24, s),
      0,
      Math.sin(elapsed * 1.7) * 0.03 * (1 - s),
    );
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(
      THREE.MathUtils.lerp(0.04, 0.22, s),
      Math.sin(elapsed * 1.1) * 0.06 * (1 - s),
      THREE.MathUtils.lerp(Math.cos(elapsed * 1.4) * 0.035, 0.09, s),
    );

    // 4-Segment Fish Tail Traveling-Wave Undulation (combat glide -> curled resting tail when staggered)
    const tailSpeed =
      SERENA_CONFIG.tailUndulateSpeed *
      (this.phaseLevel === BOSS_PHASES.PHASE_3
        ? 1.38
        : this.phaseLevel === BOSS_PHASES.PHASE_2
          ? 1.18
          : 1.0);
    const wave1 = Math.sin(elapsed * tailSpeed);
    const wave2 = Math.sin(elapsed * tailSpeed - 0.85);
    const wave3 = Math.sin(elapsed * tailSpeed - 1.7);
    const wave4 = Math.sin(elapsed * tailSpeed - 2.55);

    this.tailSeg1.rotation.set(
      THREE.MathUtils.lerp(0.28 + wave1 * 0.18, 0.86, s),
      THREE.MathUtils.lerp(wave1 * 0.12, 0.28, s),
      THREE.MathUtils.lerp(0, 0.24, s),
    );
    this.tailSeg2.rotation.set(
      THREE.MathUtils.lerp(0.24 + wave2 * 0.26, 0.62, s),
      THREE.MathUtils.lerp(wave2 * 0.16, 0.44, s),
      0,
    );
    this.tailSeg3.rotation.set(
      THREE.MathUtils.lerp(0.18 + wave3 * 0.34, 0.28, s),
      THREE.MathUtils.lerp(wave3 * 0.22, 0.56, s),
      0,
    );
    this.tailSeg4.rotation.set(
      THREE.MathUtils.lerp(0.14 + wave4 * 0.42, 0.12, s),
      THREE.MathUtils.lerp(wave4 * 0.26, 0.48, s),
      0,
    );
    this.caudalFinPivot.rotation.set(
      Math.sin(elapsed * tailSpeed - 3.2) * 0.35 * (1 - s * 0.7),
      0,
      0,
    );

    // Expressive Siren Arms & Fin-Sleeves
    const armFloat = Math.sin(elapsed * 2.4) * 0.08;
    const combatArmX = -0.32 - castLift * 0.78 + armFloat;
    const combatArmZ = 0.26 + castLift * 0.34;
    this.leftShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(combatArmX, 0.14, s),
      0,
      THREE.MathUtils.lerp(combatArmZ, 0.18, s),
    );
    this.rightShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(combatArmX, 0.14, s),
      0,
      THREE.MathUtils.lerp(-combatArmZ, -0.18, s),
    );
    this.leftElbowPivot.rotation.set(
      THREE.MathUtils.lerp(-0.46 - castLift * 0.3, -0.52, s),
      0,
      0,
    );
    this.rightElbowPivot.rotation.set(
      THREE.MathUtils.lerp(-0.46 - castLift * 0.3, -0.52, s),
      0,
      0,
    );

    // Flowing Aquamarine Hair
    const hairSpeed = 2.6 + (this.phaseLevel - 1) * 0.7;
    for (let i = 0; i < this.hairRibbons.length; i++) {
      const hr = this.hairRibbons[i];
      if (!hr) continue;
      const w1 = Math.sin(elapsed * hairSpeed + hr.phase) * 0.09;
      const w2 = Math.sin(elapsed * hairSpeed + hr.phase - 0.8) * 0.12;
      const w3 = Math.sin(elapsed * hairSpeed + hr.phase - 1.6) * 0.14;
      hr.rootSeg.rotation.x = 0.24 + w1;
      hr.midSeg.rotation.x = 0.22 + w2;
      hr.tipSeg.rotation.x = 0.18 + w3;
      hr.rootSeg.rotation.z = hr.spread * 0.26 + w1 * 0.4;
    }

    // Siren Halo & Phase Aura Rings
    this.sirenHalo.visible = s < 0.85;
    this.sirenHalo.rotation.z = elapsed * (0.48 + (this.phaseLevel - 1) * 0.28);
    this.sirenHalo.scale.setScalar(1 - s * 0.45);

    if (this.phaseAuraRings.visible) {
      this.phaseAuraHandles.outerRing.rotation.z = elapsed * 0.9;
      this.phaseAuraHandles.innerRing.rotation.z = -elapsed * 1.45;
      const pulse = 0.88 + 0.18 * Math.sin(elapsed * 4.5);
      this.phaseAuraHandles.outerMat.opacity = 0.55 * pulse;
      this.phaseAuraHandles.innerMat.opacity = 0.48 * pulse;
    }

    this.tiaraLight.intensity = THREE.MathUtils.lerp(
      L.tiaraLightCombatBase + (this.phaseLevel - 1) * 0.65,
      L.tiaraLightStaggerBase,
      s,
    );
    this.headAccessory.rotation.set(-0.16, 0, 0);
  }

  /**
   * Interactive Arcane Siphon Kiss poses [1-4] tailored to Serena's floating/coiling
   * 4-segment mermaid tail, preserving zero-gap lip-to-lip contact and coupled -> <-
   * head choreography across all 4 poses and ENDLESS_SAVOR.
   */
  public applyFinisherPose(
    poseId: FinisherPoseId,
    drainProgress: number,
    time: number,
    dt = 1 / 60,
    throttleMode: DrainThrottleMode = DRAIN_THROTTLE_MODES.FLOW,
    isTauntStunned = false,
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

    // Shared 3-stage resistance-to-limp curves (Stage 1: 0-35%, Stage 2: 35-75%, Stage 3: 75-100%)
    const resistance = this.computeResistanceState(
      drainProgress,
      time,
      throttleMode,
      isTauntStunned,
      safeDt,
    );
    const armTargets = this.computeResistanceArmTargets(poseId, resistance);
    const limpness = resistance.limpFactor;
    const earlyWeight = 1 - limpness;
    const fatigue = THREE.MathUtils.clamp(drainProgress, 0, 1);

    const isSurge = throttleMode === DRAIN_THROTTLE_MODES.SURGE;
    const isSavor = throttleMode === DRAIN_THROTTLE_MODES.SAVOR;
    const rCfg = FINISHER_RESISTANCE_CONFIG;

    // 1. Target Pose Geometry (matching Marina's lip elevation & Pose [2] ~45° dip exactly)
    let targetBodyY = THREE.MathUtils.lerp(0.48, 0.45, limpness);
    let targetTorsoX = THREE.MathUtils.lerp(0.14, 0.28, limpness);
    const targetTorsoZ = 0;
    let targetHeadX = -0.38;
    const targetHeadZ = 0;

    // Tail curls behind/beside her in Stage 1, then uncurls gradually and hangs lower as her Tidal Core drains
    const yawRelax = THREE.MathUtils.lerp(1.0, rCfg.serenaTailYawRelaxScale, fatigue);
    const rollRelax = THREE.MathUtils.lerp(1.0, rCfg.serenaTailRollRelaxScale, fatigue);
    let targetTail1X = 1.05 + rCfg.serenaTailUncurlSeg1X * fatigue;
    let targetTail1Y = 0.36 * yawRelax;
    let targetTail1Z = 0.22 * rollRelax;
    let targetTail2X = 0.42 + rCfg.serenaTailUncurlSeg2X * fatigue;
    let targetTail2Y = 0.48 * yawRelax;
    let targetTail3X = 0.12 + rCfg.serenaTailUncurlSeg3X * fatigue;
    let targetTail3Y = 0.56 * yawRelax;
    let targetTail4X = 0.05 + rCfg.serenaTailUncurlSeg4X * fatigue;
    let targetTail4Y = 0.52 * yawRelax;

    if (poseId === FINISHER_POSE_IDS.BALLROOM_DIP) {
      // Pose [2]: Ballroom Dip (~45° backward spine dip with floating S-curved tail uncurling lower)
      targetBodyY = THREE.MathUtils.lerp(0.68, 0.64, limpness);
      targetTorsoX = -FINISHER_CONFIG.dipBossSpineAngleRad - limpness * 0.06;
      targetHeadX = -0.18 - limpness * 0.04;
      targetTail1X = 0.42 + rCfg.serenaDipTailUncurlSeg1X * fatigue;
      targetTail1Y = -0.22 * yawRelax;
      targetTail1Z = -0.18 * rollRelax;
      targetTail2X = 0.52 + rCfg.serenaDipTailUncurlSeg2X * fatigue;
      targetTail2Y = -0.38 * yawRelax;
      targetTail3X = 0.36 + rCfg.serenaDipTailUncurlSeg3X * fatigue;
      targetTail3Y = -0.44 * yawRelax;
      targetTail4X = 0.22 + rCfg.serenaDipTailUncurlSeg4X * fatigue;
      targetTail4Y = -0.36 * yawRelax;
    }

    const st = this.finisherPoseState;
    if (!st.initialized) {
      st.initialized = true;
      st.bodyY = this.bodyPivot.position.y;
      st.torsoX = this.torsoGroup.rotation.x;
      st.torsoZ = this.torsoGroup.rotation.z;
      st.headX = this.headGroup.rotation.x;
      st.headZ = this.headGroup.rotation.z;
      st.leftShoulderX = this.leftShoulderPivot.rotation.x;
      st.leftShoulderZ = this.leftShoulderPivot.rotation.z;
      st.rightShoulderX = this.rightShoulderPivot.rotation.x;
      st.rightShoulderZ = this.rightShoulderPivot.rotation.z;
      st.leftElbowX = this.leftElbowPivot.rotation.x;
      st.leftElbowZ = this.leftElbowPivot.rotation.z;
      st.rightElbowX = this.rightElbowPivot.rotation.x;
      st.rightElbowZ = this.rightElbowPivot.rotation.z;
      st.tail1X = this.tailSeg1.rotation.x;
      st.tail1Y = this.tailSeg1.rotation.y;
      st.tail1Z = this.tailSeg1.rotation.z;
      st.tail2X = this.tailSeg2.rotation.x;
      st.tail2Y = this.tailSeg2.rotation.y;
      st.tail3X = this.tailSeg3.rotation.x;
      st.tail3Y = this.tailSeg3.rotation.y;
      st.tail4X = this.tailSeg4.rotation.x;
      st.tail4Y = this.tailSeg4.rotation.y;
    }

    st.bodyY = THREE.MathUtils.lerp(st.bodyY, targetBodyY, lerpAlpha);
    st.torsoX = THREE.MathUtils.lerp(st.torsoX, targetTorsoX, lerpAlpha);
    st.torsoZ = THREE.MathUtils.lerp(st.torsoZ, targetTorsoZ, lerpAlpha);
    st.headX = THREE.MathUtils.lerp(st.headX, targetHeadX, lerpAlpha);
    st.headZ = THREE.MathUtils.lerp(st.headZ, targetHeadZ, lerpAlpha);
    st.leftShoulderX = THREE.MathUtils.lerp(
      st.leftShoulderX,
      armTargets.leftShoulderX,
      lerpAlpha,
    );
    st.leftShoulderZ = THREE.MathUtils.lerp(
      st.leftShoulderZ,
      armTargets.leftShoulderZ,
      lerpAlpha,
    );
    st.rightShoulderX = THREE.MathUtils.lerp(
      st.rightShoulderX,
      armTargets.rightShoulderX,
      lerpAlpha,
    );
    st.rightShoulderZ = THREE.MathUtils.lerp(
      st.rightShoulderZ,
      armTargets.rightShoulderZ,
      lerpAlpha,
    );
    st.leftElbowX = THREE.MathUtils.lerp(
      st.leftElbowX,
      armTargets.leftElbowX,
      lerpAlpha,
    );
    st.leftElbowZ = THREE.MathUtils.lerp(
      st.leftElbowZ,
      armTargets.leftElbowZ,
      lerpAlpha,
    );
    st.rightElbowX = THREE.MathUtils.lerp(
      st.rightElbowX,
      armTargets.rightElbowX,
      lerpAlpha,
    );
    st.rightElbowZ = THREE.MathUtils.lerp(
      st.rightElbowZ,
      armTargets.rightElbowZ,
      lerpAlpha,
    );
    st.tail1X = THREE.MathUtils.lerp(st.tail1X, targetTail1X, lerpAlpha);
    st.tail1Y = THREE.MathUtils.lerp(st.tail1Y, targetTail1Y, lerpAlpha);
    st.tail1Z = THREE.MathUtils.lerp(st.tail1Z, targetTail1Z, lerpAlpha);
    st.tail2X = THREE.MathUtils.lerp(st.tail2X, targetTail2X, lerpAlpha);
    st.tail2Y = THREE.MathUtils.lerp(st.tail2Y, targetTail2Y, lerpAlpha);
    st.tail3X = THREE.MathUtils.lerp(st.tail3X, targetTail3X, lerpAlpha);
    st.tail3Y = THREE.MathUtils.lerp(st.tail3Y, targetTail3Y, lerpAlpha);
    st.tail4X = THREE.MathUtils.lerp(st.tail4X, targetTail4X, lerpAlpha);
    st.tail4Y = THREE.MathUtils.lerp(st.tail4Y, targetTail4Y, lerpAlpha);

    // 2. Reactive Breathing, Struggle Tremor & Cadence-Synced Limp Pendulum Sway
    const earlyBreath = Math.sin(time * FINISHER_CONFIG.earlyBreathFreq);
    const lateBreath = Math.sin(time * FINISHER_CONFIG.lateBreathFreq);

    const chestBreathPitch =
      earlyBreath * 0.032 * earlyWeight + lateBreath * 0.052 * limpness;
    const chestBreathLift =
      earlyBreath * 0.008 * earlyWeight + lateBreath * 0.014 * limpness;
    const shoulderBreathHeave =
      earlyBreath * 0.055 * earlyWeight + lateBreath * 0.035 * limpness;

    const surgeShudder =
      isSurge && !isTauntStunned
        ? Math.sin(time * 34.0) * 0.018 * (1 - limpness * 0.7)
        : 0;
    const savorDreamySway = isSavor
      ? Math.sin(time * FINISHER_CONFIG.savorSwayFreq) * 0.032
      : Math.sin(time * 1.4) * 0.012;

    const leftTremor = resistance.tremorOffset;
    const rightTremor = resistance.tremorSecondaryOffset;
    const pendulumPrimary = resistance.limpSwayOffset;
    const pendulumSecondary = resistance.limpElbowSwayOffset;
    const pendulumCross = resistance.limpCrossSwayOffset;

    // 3. Apply Pose + Coupled -> <- Lip-Pivot Head Choreography with Full-Body Early Pull-Back
    const hipPullBack =
      resistance.torsoPullBack * rCfg.maxHipPullBackOffset +
      resistance.shoveImpulse * rCfg.shoveChestRecoilOffset;
    const torsoArchDelta =
      -resistance.torsoPullBack * rCfg.maxTorsoPullBackRad -
      resistance.shoveImpulse * (rCfg.maxTorsoPullBackRad * 0.28);

    this.sirenHalo.visible = false;
    this.phaseAuraRings.visible = false;

    this.bodyPivot.position.set(0, st.bodyY + chestBreathLift, -hipPullBack);
    this.bodyPivot.rotation.set(0, 0, savorDreamySway * 0.35);

    const spineResistDelta = resistance.spineResistanceOffset;
    this.torsoGroup.rotation.set(
      st.torsoX +
        spineResistDelta +
        torsoArchDelta +
        chestBreathPitch +
        surgeShudder * 0.5,
      0,
      st.torsoZ + savorDreamySway + surgeShudder,
    );

    const bossHeadPitch =
      st.headX -
      torsoArchDelta * 0.72 -
      chestBreathPitch * 0.85 +
      headAnim.bossPitchResponse -
      limpness * FINISHER_CONFIG.passiveNeckDroopPitch;
    const bossHeadYaw =
      headAnim.yawSway * headAnim.bossYieldScale + headAnim.bossTremor * 0.65;
    const bossHeadRoll =
      st.headZ -
      savorDreamySway * 0.65 +
      headAnim.roll * headAnim.bossYieldScale +
      headAnim.bossTremor +
      resistance.headRollOffset;
    this.applyDecoupledHeadTransform(
      this.headGroup,
      bossHeadPitch,
      spineResistDelta,
      bossHeadYaw,
      bossHeadRoll,
      headAnim.bossFaceNormalOffset,
    );

    // Serena Tail Struggle: Stage 1 tight upward curl & 3.4Hz side-to-side lashing ->
    // Stage 2 heavy uncurled sway -> Stage 3 dead-weight hang
    const tailCurl = rCfg.serenaTailCurlRad * resistance.torsoPullBack;
    const thrashWeight =
      Math.min(1.35, resistance.torsoPullBack + resistance.shoveImpulse * 0.65) *
      (1 - resistance.tauntSlack);
    const thrashPhase = time * rCfg.serenaTailThrashFreqHz * Math.PI * 2;
    const thrashAmp = rCfg.serenaTailThrashAmpRad * thrashWeight;
    const stage2Sway =
      Math.sin(time * 1.75) *
      0.12 *
      (1 - limpness) *
      (1 - resistance.torsoPullBack);
    const tailLimpDrift = Math.sin(time * 1.35) * 0.04 * limpness;

    const whip1 = Math.sin(thrashPhase) * thrashAmp + stage2Sway + tailLimpDrift;
    const whip2 =
      Math.sin(thrashPhase - 0.72) * thrashAmp * 1.15 +
      stage2Sway * 1.2 +
      tailLimpDrift;
    const whip3 =
      Math.sin(thrashPhase - 1.44) * thrashAmp * 1.3 +
      stage2Sway * 1.35 +
      tailLimpDrift;
    const whip4 =
      Math.sin(thrashPhase - 2.16) * thrashAmp * 1.45 +
      stage2Sway * 1.45 +
      tailLimpDrift;

    this.tailSeg1.rotation.set(
      st.tail1X - tailCurl * 0.42,
      st.tail1Y + whip1 * 0.35,
      st.tail1Z + Math.cos(thrashPhase) * thrashAmp * 0.25,
    );
    this.tailSeg2.rotation.set(
      st.tail2X + tailCurl * 0.55,
      st.tail2Y + whip2 * 0.65,
      0,
    );
    this.tailSeg3.rotation.set(
      st.tail3X + tailCurl * 0.45,
      st.tail3Y + whip3 * 0.95,
      0,
    );
    this.tailSeg4.rotation.set(
      st.tail4X + tailCurl * 0.35,
      st.tail4Y + whip4 * 1.15,
      0,
    );
    this.caudalFinPivot.rotation.set(
      Math.sin(thrashPhase - 2.6) * (0.34 * thrashWeight + 0.05) +
        tailLimpDrift * 0.8,
      0,
      0,
    );

    // Arms (3-Stage Push -> Chest Slide -> Limp Surrender)
    this.leftShoulderPivot.rotation.set(
      st.leftShoulderX -
        shoulderBreathHeave * (0.4 + 0.6 * resistance.pushStrength) +
        leftTremor * 0.55 +
        pendulumPrimary +
        surgeShudder,
      0,
      st.leftShoulderZ + pendulumCross - leftTremor * 0.45,
    );
    this.rightShoulderPivot.rotation.set(
      st.rightShoulderX -
        shoulderBreathHeave * (0.4 + 0.6 * resistance.pushStrength) +
        rightTremor * 0.55 -
        pendulumPrimary -
        surgeShudder,
      0,
      st.rightShoulderZ - pendulumCross + rightTremor * 0.45,
    );
    this.leftElbowPivot.rotation.set(
      st.leftElbowX + leftTremor + pendulumSecondary,
      0,
      st.leftElbowZ + leftTremor * 0.35 + pendulumCross * 0.7,
    );
    this.rightElbowPivot.rotation.set(
      st.rightElbowX + rightTremor - pendulumSecondary,
      0,
      st.rightElbowZ - rightTremor * 0.35 - pendulumCross * 0.7,
    );

    // Flowing Aquamarine Hair Cascade
    const hairSpeed = isSurge ? 4.6 : isSavor ? 1.55 : 2.5;
    const hairAmp = isSurge ? 0.11 : isSavor ? 0.055 : 0.075;
    const isDip = poseId === FINISHER_POSE_IDS.BALLROOM_DIP;
    const targetRootX = isDip ? 0.54 : 0.32;
    const targetMidX = isDip ? 0.36 : 0.46;
    const targetTipX = isDip ? 0.24 : 0.62;

    for (let i = 0; i < this.hairRibbons.length; i++) {
      const hr = this.hairRibbons[i];
      if (!hr) continue;
      const w1 = Math.sin(time * hairSpeed + hr.phase) * hairAmp;
      const w2 = Math.sin(time * hairSpeed + hr.phase - 0.85) * hairAmp * 1.2;
      const w3 = Math.sin(time * hairSpeed + hr.phase - 1.65) * hairAmp * 1.35;

      hr.rootSeg.rotation.x = THREE.MathUtils.lerp(
        hr.rootSeg.rotation.x,
        targetRootX + w1,
        lerpAlpha,
      );
      hr.midSeg.rotation.x = THREE.MathUtils.lerp(
        hr.midSeg.rotation.x,
        targetMidX + w2,
        lerpAlpha,
      );
      hr.tipSeg.rotation.x = THREE.MathUtils.lerp(
        hr.tipSeg.rotation.x,
        targetTipX + w3,
        lerpAlpha,
      );
      hr.rootSeg.rotation.z =
        hr.spread * (0.34 + limpness * 0.1) +
        Math.cos(time * (hairSpeed * 0.78) + hr.phase) * (hairAmp * 0.65);
    }

    // Coral-and-pearl tiara spring-wobble decay on [F] flick taunt
    if (this.accessoryFlickTimer > 0) {
      this.accessoryFlickTimer = Math.max(0, this.accessoryFlickTimer - safeDt);
      const decay = this.accessoryFlickTimer / 0.55;
      this.headAccessory.rotation.z = Math.sin(time * 42) * 0.28 * decay;
      this.headAccessory.rotation.x = -0.16 + Math.cos(time * 36) * 0.14 * decay;
    } else {
      this.headAccessory.rotation.z = 0;
      this.headAccessory.rotation.x = -0.16;
    }

    this.tiaraLight.intensity =
      ARENA_CONFIG.lighting.tiaraLightStaggerBase *
      (1 - this.currentDrainProgress * 0.9);
  }

  /**
   * Ranged Umbral Siphon Beam ([R]) kneeling-coil shield-to-slump pose:
   * Serena curls her tail tightly on the floor while shielding her face against the beam,
   * shuddering as her iridescent scales bleach to ash-silver and slumping forward toward 1.0.
   */
  public applyBeamFinisherPose(drainProgress: number, time: number): void {
    this.finisherPoseState.initialized = false;
    this.resetResistanceState();
    this.applyDrainBleach(drainProgress);

    const pose = this.computeBeamShieldPose(drainProgress, time);

    this.bodyPivot.position.set(0, pose.bodyY, 0);
    this.bodyPivot.rotation.set(0.08 + pose.slump * 0.08, 0, pose.tremor * 0.25);

    this.torsoGroup.rotation.set(pose.torsoX, 0, pose.torsoZ);
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(pose.headX, pose.headY, pose.headZ);
    this.headAccessory.rotation.set(-0.16, 0, pose.tremor * 0.45);

    // 4-Segment mermaid tail thrashing defensively then relaxing limp onto the floor
    const tailThrash = Math.sin(time * 11.0) * 0.14 * (1 - pose.slump * 0.8);
    this.tailSeg1.rotation.set(
      THREE.MathUtils.lerp(0.96, 1.08, pose.slump),
      0.32 + tailThrash * 0.4,
      0.22,
    );
    this.tailSeg2.rotation.set(
      THREE.MathUtils.lerp(0.54, 0.36, pose.slump),
      0.46 + tailThrash * 0.7,
      0,
    );
    this.tailSeg3.rotation.set(
      THREE.MathUtils.lerp(0.24, 0.12, pose.slump),
      0.56 + tailThrash,
      0,
    );
    this.tailSeg4.rotation.set(
      THREE.MathUtils.lerp(0.14, 0.05, pose.slump),
      0.48 + tailThrash * 1.1,
      0,
    );
    this.caudalFinPivot.rotation.set(tailThrash * 1.4, 0, 0);

    // Left arm shielding face from blinding beam -> falls slack; right arm bracing -> slumps
    this.leftShoulderPivot.rotation.set(
      pose.leftShoulderX,
      0,
      pose.leftShoulderZ,
    );
    this.leftElbowPivot.rotation.set(pose.leftElbowX, 0, pose.leftElbowZ);
    this.rightShoulderPivot.rotation.set(
      pose.rightShoulderX,
      0,
      pose.rightShoulderZ,
    );
    this.rightElbowPivot.rotation.set(pose.rightElbowX, 0, 0);

    const blowBack = (1 - pose.slump) * 0.34;
    for (let i = 0; i < this.hairRibbons.length; i++) {
      const hr = this.hairRibbons[i];
      if (!hr) continue;
      const flutter = Math.sin(time * 14.0 + hr.phase) * 0.06 * (1 - pose.slump * 0.7);
      hr.rootSeg.rotation.x = 0.28 + blowBack + flutter;
      hr.midSeg.rotation.x = 0.24 + blowBack * 0.8 + flutter;
      hr.tipSeg.rotation.x = 0.18 + blowBack * 0.6 + flutter;
      hr.rootSeg.rotation.z = hr.spread * (0.36 + blowBack * 0.3);
    }

    const haloScale = Math.max(0.01, (1 - pose.drain) * 0.72);
    this.sirenHalo.visible = pose.drain < 0.88;
    this.sirenHalo.scale.setScalar(haloScale);
    this.sirenHalo.rotation.z = time * (0.9 - pose.drain * 0.7);
    this.phaseAuraRings.visible = false;

    this.tiaraLight.intensity =
      ARENA_CONFIG.lighting.tiaraLightStaggerBase * (1 - pose.drain * 0.92);
  }

  /**
   * Victory Diorama floor collapse: 100% ash-silver bleached Serena sprawled gracefully
   * onto the pearl mosaic with her 4-segment fish tail curled softly beside her.
   */
  public applyVictoryCollapsePose(time: number): void {
    this.finisherPoseState.initialized = false;
    this.resetResistanceState();
    this.applyDrainBleach(1.0);
    this.sirenHalo.visible = false;
    this.phaseAuraRings.visible = false;
    this.tiaraLight.intensity = 0.25;
    this.headAccessory.rotation.set(-0.16, 0, 0.08);

    const sigh = Math.sin(time * 2.1) * 0.012;
    this.bodyPivot.position.set(0, DIORAMA_CONFIG.collapseBodyY + sigh, 0);
    this.bodyPivot.rotation.set(-Math.PI * 0.46, 0, 0.18);
    this.torsoGroup.rotation.set(0.08 + sigh * 0.8, 0, 0.04);
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(0.14, 0.26, 0.22);

    // 4-segment tail curled smoothly in an exhausted crescent on the mosaic floor
    this.tailSeg1.rotation.set(0.12, 0.32, 0.18);
    this.tailSeg2.rotation.set(0.08, 0.44, 0.12);
    this.tailSeg3.rotation.set(0.06, 0.54, 0.08);
    this.tailSeg4.rotation.set(0.04, 0.48, 0.05);
    this.caudalFinPivot.rotation.set(Math.sin(time * 1.4) * 0.05, 0, 0);

    this.applySubjugatedDioramaArms(
      this.leftShoulderPivot,
      this.rightShoulderPivot,
      this.leftElbowPivot,
      this.rightElbowPivot,
      VICTORY_DIORAMA_CONFIG.serenaExtraAbductionRad,
      this.leftWristAnchor,
      this.rightWristAnchor,
    );

    for (let i = 0; i < this.hairRibbons.length; i++) {
      const hr = this.hairRibbons[i];
      if (!hr) continue;
      hr.rootSeg.rotation.x = 0.14;
      hr.midSeg.rotation.x = 0.08;
      hr.tipSeg.rotation.x = 0.04;
      hr.rootSeg.rotation.z =
        hr.spread * 0.72 + Math.sin(time * 1.4 + hr.phase) * 0.025;
    }
  }

  /**
   * Defeat Diorama "Siren's Abyssal Thrall": Serena levitating & coiling triumphantly
   * around and above the kneeling, bubble-bound Dark Mage.
   */
  public applyPuppetMasterPose(time: number): void {
    this.applyDrainBleach(0);
    this.sirenHalo.visible = true;
    this.sirenHalo.scale.setScalar(1.0);
    this.sirenHalo.rotation.z = time * 0.62;
    this.phaseAuraRings.visible = false;
    this.tiaraLight.intensity = ARENA_CONFIG.lighting.tiaraLightCombatBase;
    this.headAccessory.rotation.set(-0.16, 0, 0);

    const wave = Math.sin(time * DIORAMA_CONFIG.puppetWaveCadence);
    const waveCos = Math.cos(time * DIORAMA_CONFIG.puppetWaveCadence);

    this.bodyPivot.position.set(0, 1.18 + wave * 0.04, 0);
    this.bodyPivot.rotation.set(0.08, wave * 0.08, waveCos * 0.04);
    this.torsoGroup.rotation.set(-0.06, 0, 0);
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(0.24, waveCos * 0.09, wave * 0.05);

    // Majestic coiled mermaid tail sweeping forward to encircle the kneeling Dark Mage
    this.tailSeg1.rotation.set(0.46, 0.34 + wave * 0.08, 0.14);
    this.tailSeg2.rotation.set(0.42, 0.48 + waveCos * 0.1, 0);
    this.tailSeg3.rotation.set(0.28, 0.56 - wave * 0.12, 0);
    this.tailSeg4.rotation.set(0.18, 0.52 + waveCos * 0.12, 0);
    this.caudalFinPivot.rotation.set(wave * 0.22, 0, 0);

    // Fin-draped hands conducting hydro-tethers over the bubble-bound Dark Mage
    this.leftShoulderPivot.rotation.set(-0.98 + wave * 0.16, 0, 0.28);
    this.rightShoulderPivot.rotation.set(-0.98 - wave * 0.16, 0, -0.28);
    this.leftElbowPivot.rotation.set(-0.44 + wave * 0.14, 0, 0);
    this.rightElbowPivot.rotation.set(-0.44 - wave * 0.14, 0, 0);

    for (let i = 0; i < this.hairRibbons.length; i++) {
      const hr = this.hairRibbons[i];
      if (!hr) continue;
      const sway = Math.sin(time * 2.2 + hr.phase) * 0.075;
      hr.rootSeg.rotation.x = 0.2 + sway;
      hr.midSeg.rotation.x = 0.14 + sway;
      hr.tipSeg.rotation.x = 0.1 + sway;
      hr.rootSeg.rotation.z = hr.spread * 0.22;
    }
  }

  public resetForEncounter(_encoreTier: number): void {
    this.currentDrainProgress = 0;
    restoreDrainableMaterials(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
    );
    this.matCoral.color.copy(this.coralOriginalColor);

    this.staggerBlend = 0;
    this.finisherPoseState.initialized = false;
    this.resetResistanceState();
    this.hitFlashTimer = 0;
    this.castAnimTimer = 0;
    this.accessoryFlickTimer = 0;
    this.targetAscendY = 0;
    this.currentAscendY = 0;
    this.headAccessory.rotation.set(-0.16, 0, 0);
    this.tiaraLight.intensity = ARENA_CONFIG.lighting.tiaraLightCombatBase;
    this.setPhaseVisuals(BOSS_PHASES.PHASE_1);
    this.setExpression(BOSS_EXPRESSIONS.COMBAT);

    this.bodyPivot.position.set(
      0,
      SERENA_CONFIG.combatBaseBodyY + SERENA_CONFIG.floatHeight,
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

  /**
   * Graceful coiled captive posture on the Siphon Gallery Tide-Pool Velvet Dais.
   * Interpolates Serena's iridescent scales, fins, hair, and coral tiara smoothly from
   * PALETTE.drainedAshSilver (charge = 0) to radiant bioluminescent teal (charge = 1),
   * animates gentle captive tail-sway & breathing, and holds wrists outward for rune-cuff tethers.
   */
  public applyCaptiveDaisPose(charge: number, time: number, dt: number): void {
    const cfg = SIPHON_GALLERY_CONFIG;
    const clampedCharge = THREE.MathUtils.clamp(charge, 0, 1);
    const depletion = 1 - clampedCharge;

    this.finisherPoseState.initialized = false;
    this.resetResistanceState();
    this.applyDrainBleach(depletion);

    // Facial expression tracks her Tidal Core recharge level
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

    this.bodyPivot.position.set(
      0,
      cfg.captiveKneelBodyY + breathWave * 0.012,
      0,
    );
    this.bodyPivot.rotation.set(0, 0, swayWave * 0.02);

    this.torsoGroup.rotation.set(torsoPitch, 0, swayWave * 0.024);
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(
      headPitch,
      Math.sin(time * 0.65) * (0.04 + clampedCharge * 0.05),
      Math.cos(time * 0.72) * (0.03 + depletion * 0.04),
    );
    this.headAccessory.rotation.set(-0.16, 0, 0);

    // 4-Segment Fish Tail coiled gracefully on the shallow tide-pool dais with gentle sway
    const tailSway = Math.sin(time * (1.2 + clampedCharge * 0.9)) * (0.05 + clampedCharge * 0.06);
    this.tailSeg1.rotation.set(1.04, 0.34 + tailSway * 0.3, 0.22);
    this.tailSeg2.rotation.set(0.4, 0.48 + tailSway * 0.65, 0);
    this.tailSeg3.rotation.set(0.12, 0.56 + tailSway * 0.95, 0);
    this.tailSeg4.rotation.set(0.05, 0.5 + tailSway * 1.15, 0);
    this.caudalFinPivot.rotation.set(
      Math.sin(time * (1.8 + clampedCharge * 1.1)) * (0.08 + clampedCharge * 0.14),
      0,
      0,
    );

    // Wrists held gently outward & forward toward the twin flanking pearl conduits
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

    // Flowing aquamarine hair drapes smoothly down behind her coiled silhouette
    for (let i = 0; i < this.hairRibbons.length; i++) {
      const hr = this.hairRibbons[i];
      if (!hr) continue;
      const wave = Math.sin(time * 1.55 + hr.phase) * 0.038;
      hr.rootSeg.rotation.x = 0.28 + wave;
      hr.midSeg.rotation.x = 0.42 + wave * 1.1;
      hr.tipSeg.rotation.x = 0.58 + wave * 1.2;
      hr.rootSeg.rotation.z = hr.spread * 0.32;
    }

    // Siren halo re-emerges softly as her Tidal Core recharges past 35%
    const haloFactor = THREE.MathUtils.clamp((clampedCharge - 0.35) / 0.65, 0, 1);
    this.sirenHalo.visible = haloFactor > 0.03;
    if (this.sirenHalo.visible) {
      this.sirenHalo.rotation.z = time * (0.35 + haloFactor * 0.42);
      this.sirenHalo.scale.setScalar(0.35 + haloFactor * 0.55);
    }
    this.phaseAuraRings.visible = false;

    this.tiaraLight.intensity =
      ARENA_CONFIG.lighting.tiaraLightStaggerBase * (0.2 + clampedCharge * 1.15);
  }

  public dispose(): void {
    this.faceTexture.dispose();
    this.parent.remove(this.root);
  }
}
