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
  PALETTE,
  type BossExpression,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';
import { ToonAssets } from '../../engine/ToonAssets';
import {
  applyMaterialBleach,
  restoreDrainableMaterials,
  type BossRigAdapter,
  type MaterialBleachMetadata,
} from './BossBase';

interface HairRibbonRecord {
  rootSeg: THREE.Group;
  midSeg: THREE.Group;
  tipSeg: THREE.Group;
  phase: number;
  spread: number;
}

interface SkirtPanelRecord {
  pivot: THREE.Group;
  angle: number;
  basePitch: number;
}

interface PhaseAuroraHandles {
  outerRing: THREE.Mesh;
  innerRing: THREE.Mesh;
  outerMat: THREE.MeshBasicMaterial;
  innerMat: THREE.MeshBasicMaterial;
}

interface MarinaFinisherBoneState {
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
 * Marina — The Glacial Empress procedural cel-shaded anime boss rig.
 * Ported verbatim from the legacy Glacial Spire monolith and implementing
 * the standardized BossRigAdapter contract (LSP & SRP).
 */
export class MarinaRig implements BossRigAdapter {
  public readonly id: string = BOSS_CONFIG.defaultId;
  public readonly displayName: string = BOSS_CONFIG.defaultDisplayName;
  public readonly title: string = BOSS_CONFIG.defaultTitle;
  public readonly root: THREE.Group;
  public readonly bodyPivot: THREE.Group;
  public readonly headAnchor: THREE.Object3D;
  public readonly headAccessory: THREE.Object3D;
  public readonly drainableMaterials: THREE.MeshToonMaterial[] = [];
  public readonly originalColors: THREE.Color[] = [];

  private readonly scene: THREE.Scene;
  private readonly bleachMetadata: MaterialBleachMetadata[] = [];
  private readonly rimFlashMaterials: THREE.MeshToonMaterial[] = [];
  private readonly hairRibbons: HairRibbonRecord[] = [];
  private readonly skirtPanels: SkirtPanelRecord[] = [];

  // Dynamic 512x512 Offscreen Face Canvas & Texture
  private readonly faceCanvas: HTMLCanvasElement;
  private readonly faceCtx: CanvasRenderingContext2D;
  private readonly faceTexture: THREE.CanvasTexture;

  // Exposed Rig Pivots & Pose State
  public staggerBlend = 0;
  public currentAscendY = 0;
  public currentExpression: BossExpression = BOSS_EXPRESSIONS.COMBAT;

  private hitFlashTimer = 0;
  private castAnimTimer = 0;
  private accessoryFlickTimer = 0;
  private phaseLevel: BossPhase = BOSS_PHASES.PHASE_1;
  private targetAscendY = 0;
  private currentDrainProgress = 0;

  private torsoGroup!: THREE.Group;
  private headGroup!: THREE.Group;
  private leftLegPivot!: THREE.Group;
  private rightLegPivot!: THREE.Group;
  private leftKneePivot!: THREE.Group;
  private rightKneePivot!: THREE.Group;
  private leftShoulderPivot!: THREE.Group;
  private rightShoulderPivot!: THREE.Group;
  private leftElbowPivot!: THREE.Group;
  private rightElbowPivot!: THREE.Group;
  private readonly leftHandAnchor = new THREE.Object3D();
  private readonly rightHandAnchor = new THREE.Object3D();
  private backHairRoot!: THREE.Group;
  private tiaraLight!: THREE.PointLight;
  private frostHalo!: THREE.Group;
  private phaseAuroraRings!: THREE.Group;
  private phaseAuroraHandles!: PhaseAuroraHandles;

  // Shared Materials
  private matSkin!: THREE.MeshToonMaterial;
  private matGown!: THREE.MeshToonMaterial;
  private matHair!: THREE.MeshToonMaterial;
  private matHairMid!: THREE.MeshToonMaterial;
  private matHairTips!: THREE.MeshToonMaterial;
  private matTrim!: THREE.MeshToonMaterial;
  private matSapphireRibbon!: THREE.MeshToonMaterial;
  private matSilverCollar!: THREE.MeshToonMaterial;
  private matTiaraCrystal!: THREE.MeshBasicMaterial;
  private matIceSilk!: THREE.MeshToonMaterial;
  private matFaceOverlay!: THREE.MeshToonMaterial;
  private readonly tiaraOriginalColor = new THREE.Color(PALETTE.frostRunes);
  private readonly drainedAshColor = new THREE.Color(PALETTE.drainedAshSilver);
  private readonly finisherPoseState: MarinaFinisherBoneState = {
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
    leftShoulderX: -0.28,
    leftShoulderZ: 0.2,
    rightShoulderX: -0.28,
    rightShoulderZ: -0.2,
    leftElbowX: -0.55,
    rightElbowX: -0.55,
    skirtBasePitch: -0.44,
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.bodyPivot = new THREE.Group();
    this.bodyPivot.position.y = 0.88 + BOSS_CONFIG.floatHeight;
    this.root.add(this.bodyPivot);

    this.headAnchor = new THREE.Object3D();
    this.headAccessory = new THREE.Group();

    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = ARENA_CONFIG.faceTextureSize;
    this.faceCanvas.height = ARENA_CONFIG.faceTextureSize;
    const ctx = this.faceCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to initialize 2D context for Marina face canvas.');
    }
    this.faceCtx = ctx;
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.faceTexture.anisotropy = 4;

    this.buildMaterials();
    this.buildLegsAndBoots();
    this.buildTorsoAndGown();
    this.buildArmsAndIceSilkSleeves();
    this.buildHeadFaceAndHair();
    this.buildCrystallineTiara();
    this.buildFrostHalo();
    this.buildPhaseAuroraRings();

    this.setExpression(BOSS_EXPRESSIONS.COMBAT);
    this.root.position.set(
      BOSS_CONFIG.spawnX,
      BOSS_CONFIG.spawnY,
      BOSS_CONFIG.spawnZ,
    );
    this.scene.add(this.root);
  }

  private registerDrainable(
    mat: THREE.MeshToonMaterial,
    role: string,
  ): THREE.MeshToonMaterial {
    mat.userData.drainRole = role;
    mat.userData.originalColor = mat.color.clone();
    mat.userData.originalEmissive = mat.emissive.clone();
    mat.userData.originalEmissiveIntensity = mat.emissiveIntensity;
    this.drainableMaterials.push(mat);
    this.originalColors.push(mat.color.clone());
    this.bleachMetadata.push({
      originalEmissive: mat.emissive.clone(),
      originalEmissiveIntensity: mat.emissiveIntensity,
    });
    return mat;
  }

  private buildMaterials(): void {
    this.matSkin = ToonAssets.createToonMaterial(PALETTE.marinaSkin);
    this.matGown = ToonAssets.createToonMaterial(PALETTE.marinaGown);

    this.matHair = this.registerDrainable(
      ToonAssets.createToonMaterial(PALETTE.marinaHair, {
        emissive: PALETTE.glacialPaleBlue,
        emissiveIntensity: 0.08,
      }),
      'hair',
    );

    this.matHairMid = this.registerDrainable(
      ToonAssets.createToonMaterial(PALETTE.iceHighlights, {
        emissive: PALETTE.marinaHairTips,
        emissiveIntensity: 0.16,
      }),
      'hair_mid',
    );

    this.matHairTips = this.registerDrainable(
      ToonAssets.createToonMaterial(PALETTE.marinaHairTips, {
        emissive: PALETTE.marinaHairTips,
        emissiveIntensity: 0.36,
      }),
      'hair_tips',
    );

    this.matTrim = this.registerDrainable(
      ToonAssets.createToonMaterial(PALETTE.marinaTrim, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.24,
      }),
      'dress_trim',
    );

    this.matSapphireRibbon = this.registerDrainable(
      ToonAssets.createToonMaterial(PALETTE.marinaIris, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.22,
      }),
      'ribbon',
    );

    this.matSilverCollar = ToonAssets.createToonMaterial(PALETTE.silverRune);

    this.matTiaraCrystal = new THREE.MeshBasicMaterial({
      color: PALETTE.frostRunes,
    });

    this.matIceSilk = this.registerDrainable(
      ToonAssets.createToonMaterial(PALETTE.iceHighlights, {
        emissive: PALETTE.frostRunes,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
      }),
      'ice_silk',
    );

    this.matFaceOverlay = this.registerDrainable(
      new THREE.MeshToonMaterial({
        map: this.faceTexture,
        gradientMap: ToonAssets.getToonGradientMap(),
        transparent: true,
        emissive: new THREE.Color(PALETTE.pureWhite),
        emissiveMap: this.faceTexture,
        emissiveIntensity: 0.42,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
      'eye_glow',
    );

    this.rimFlashMaterials.push(
      this.matGown,
      this.matHair,
      this.matTrim,
      this.matSapphireRibbon,
    );
  }

  private buildLegsAndBoots(): void {
    const buildLeg = (side: -1 | 1) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(side * 0.105, -0.02, 0);
      this.bodyPivot.add(hipPivot);

      const { group: thigh } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.072, 0.056, 0.4, 10),
        this.matSkin,
        { x: 1.08, y: 1.01, z: 1.08 },
      );
      thigh.position.y = -0.2;
      hipPivot.add(thigh);

      const kneePivot = new THREE.Group();
      kneePivot.position.set(0, -0.4, 0);
      hipPivot.add(kneePivot);

      const kneeJoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.056, 10, 8),
        this.matSkin,
      );
      kneePivot.add(kneeJoint);

      const { group: shin } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.058, 0.046, 0.36, 10),
        this.matGown,
        { x: 1.09, y: 1.01, z: 1.09 },
      );
      shin.position.y = -0.18;
      kneePivot.add(shin);

      const bootCuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.06, 0.055, 10),
        this.matTrim,
      );
      bootCuff.position.y = -0.05;
      kneePivot.add(bootCuff);

      const bootGem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.024, 0),
        this.matTiaraCrystal,
      );
      bootGem.position.set(0, -0.05, 0.068);
      kneePivot.add(bootGem);

      const { group: foot } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.088, 0.088, 0.2),
        this.matGown,
        1.07,
      );
      foot.position.set(0, -0.4, 0.04);
      kneePivot.add(foot);

      const soleTrim = new THREE.Mesh(
        new THREE.BoxGeometry(0.092, 0.025, 0.21),
        this.matSapphireRibbon,
      );
      soleTrim.position.set(0, -0.435, 0.04);
      kneePivot.add(soleTrim);

      return { hipPivot, kneePivot };
    };

    const left = buildLeg(-1);
    const right = buildLeg(1);
    this.leftLegPivot = left.hipPivot;
    this.leftKneePivot = left.kneePivot;
    this.rightLegPivot = right.hipPivot;
    this.rightKneePivot = right.kneePivot;
  }

  private buildTorsoAndGown(): void {
    this.torsoGroup = new THREE.Group();
    this.bodyPivot.add(this.torsoGroup);

    const { group: pelvis } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.115, 0.145, 0.16, 12),
      this.matGown,
      1.05,
    );
    pelvis.scale.set(1.12, 1.0, 0.84);
    pelvis.position.y = 0.04;
    this.torsoGroup.add(pelvis);

    const { group: bodice } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.156, 0.106, 0.36, 12),
      this.matGown,
      1.05,
    );
    bodice.scale.set(1.08, 1.0, 0.8);
    bodice.position.y = 0.28;
    this.torsoGroup.add(bodice);

    const { group: bust } = ToonAssets.createOutlinedMesh(
      new THREE.SphereGeometry(0.118, 14, 12),
      this.matGown,
      1.045,
    );
    bust.scale.set(1.25, 0.72, 0.78);
    bust.position.set(0, 0.33, 0.055);
    this.torsoGroup.add(bust);

    const bodiceTrimL = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.26, 0.022),
      this.matTrim,
    );
    bodiceTrimL.position.set(-0.062, 0.27, 0.125);
    bodiceTrimL.rotation.z = -0.18;
    this.torsoGroup.add(bodiceTrimL);

    const bodiceTrimR = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.26, 0.022),
      this.matTrim,
    );
    bodiceTrimR.position.set(0.062, 0.27, 0.125);
    bodiceTrimR.rotation.z = 0.18;
    this.torsoGroup.add(bodiceTrimR);

    const chestGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.036, 0),
      this.matTiaraCrystal,
    );
    chestGem.scale.set(0.88, 1.32, 0.55);
    chestGem.position.set(0, 0.38, 0.135);
    this.torsoGroup.add(chestGem);

    const upperCollarSkin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.138, 0.11, 12),
      this.matSkin,
    );
    upperCollarSkin.scale.set(1.18, 1.0, 0.78);
    upperCollarSkin.position.y = 0.48;
    this.torsoGroup.add(upperCollarSkin);

    const { group: highCollar } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(
        0.088,
        0.078,
        0.09,
        14,
        1,
        true,
        Math.PI * 0.22,
        Math.PI * 1.56,
      ),
      this.matSilverCollar,
      1.06,
    );
    highCollar.rotation.y = Math.PI;
    highCollar.position.set(0, 0.535, -0.005);
    this.torsoGroup.add(highCollar);

    const collarChoker = new THREE.Mesh(
      new THREE.TorusGeometry(0.068, 0.012, 8, 20),
      this.matTrim,
    );
    collarChoker.rotation.x = Math.PI / 2;
    collarChoker.position.y = 0.51;
    this.torsoGroup.add(collarChoker);

    const { group: waistRibbon } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.118, 0.124, 0.068, 14),
      this.matSapphireRibbon,
      1.05,
    );
    waistRibbon.scale.set(1.12, 1.0, 0.85);
    waistRibbon.position.y = 0.115;
    this.torsoGroup.add(waistRibbon);

    const bowGroup = new THREE.Group();
    bowGroup.position.set(0, 0.115, -0.115);
    this.torsoGroup.add(bowGroup);

    for (const s of [-1, 1] as const) {
      const loop = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.065, 0.028),
        this.matSapphireRibbon,
      );
      loop.position.set(s * 0.065, 0.015, -0.015);
      loop.rotation.z = s * 0.26;
      loop.rotation.y = -s * 0.25;
      bowGroup.add(loop);

      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.42, 0.016),
        this.matSapphireRibbon,
      );
      tail.position.set(s * 0.055, -0.21, -0.05);
      tail.rotation.z = s * 0.14;
      tail.rotation.x = 0.24;
      bowGroup.add(tail);
    }

    const panelCount = 10;
    for (let i = 0; i < panelCount; i++) {
      const ang = (i / panelCount) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(
        Math.sin(ang) * 0.12,
        0.085,
        Math.cos(ang) * 0.105,
      );
      pivot.rotation.y = ang;
      this.torsoGroup.add(pivot);

      const isFront = Math.cos(ang) > 0.3;
      const len = isFront ? 0.56 : 0.68;
      const panelGeo = new THREE.BoxGeometry(0.165, len, 0.022);
      const panelMat = i % 2 === 0 ? this.matGown : this.matIceSilk;

      const { group: panelMesh } = ToonAssets.createOutlinedMesh(
        panelGeo,
        panelMat,
        { x: 1.05, y: 1.015, z: 1.35 },
      );
      panelMesh.position.set(0, -len * 0.5, 0.09);
      panelMesh.rotation.x = -0.28;
      pivot.add(panelMesh);

      const hemTrim = new THREE.Mesh(
        new THREE.BoxGeometry(0.168, 0.042, 0.028),
        this.matTrim,
      );
      hemTrim.position.set(0, -len + 0.02, 0.175);
      hemTrim.rotation.x = -0.28;
      pivot.add(hemTrim);

      this.skirtPanels.push({ pivot, angle: ang, basePitch: -0.28 });
    }

    const innerSkirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.125, 0.34, 0.54, 16, 1, true),
      this.matIceSilk,
    );
    innerSkirt.position.y = -0.19;
    this.torsoGroup.add(innerSkirt);
  }

  private buildArmsAndIceSilkSleeves(): void {
    const buildArm = (side: -1 | 1) => {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(side * 0.215, 0.435, 0);
      this.torsoGroup.add(shoulderPivot);

      const { group: upperArm } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.046, 0.039, 0.25, 10),
        this.matSkin,
        1.08,
      );
      upperArm.position.y = -0.125;
      shoulderPivot.add(upperArm);

      const armlet = new THREE.Mesh(
        new THREE.TorusGeometry(0.044, 0.009, 6, 14),
        this.matTrim,
      );
      armlet.rotation.x = Math.PI / 2;
      armlet.position.y = -0.21;
      shoulderPivot.add(armlet);

      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.25, 0);
      shoulderPivot.add(elbowPivot);

      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.031, 0.22, 10),
        this.matSkin,
      );
      forearm.position.y = -0.11;
      elbowPivot.add(forearm);

      const silkSleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.112, 0.29, 12, 1, true),
        this.matIceSilk,
      );
      silkSleeve.position.y = -0.12;
      elbowPivot.add(silkSleeve);

      const sleeveTrim = new THREE.Mesh(
        new THREE.TorusGeometry(0.112, 0.009, 6, 16),
        this.matTrim,
      );
      sleeveTrim.rotation.x = Math.PI / 2;
      sleeveTrim.position.y = -0.26;
      elbowPivot.add(sleeveTrim);

      const { group: hand } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.048, 0.078, 0.052),
        this.matSkin,
        1.08,
      );
      hand.position.set(0, -0.255, 0.008);
      elbowPivot.add(hand);

      return { shoulderPivot, elbowPivot };
    };

    const left = buildArm(-1);
    const right = buildArm(1);
    this.leftShoulderPivot = left.shoulderPivot;
    this.leftElbowPivot = left.elbowPivot;
    this.rightShoulderPivot = right.shoulderPivot;
    this.rightElbowPivot = right.elbowPivot;

    this.leftHandAnchor.position.set(0, -0.295, 0.02);
    this.leftElbowPivot.add(this.leftHandAnchor);
    this.rightHandAnchor.position.set(0, -0.295, 0.02);
    this.rightElbowPivot.add(this.rightHandAnchor);
  }

  private buildHeadFaceAndHair(): void {
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.515, 0.008);
    this.torsoGroup.add(this.headGroup);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.056, 0.11, 10),
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

    // Lip-contact & finisher camera focus anchor on Marina's face
    this.headAnchor.position.set(0, headCenterY - 0.045, 0.116);
    this.headGroup.add(this.headAnchor);

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
      this.matHair,
      1.045,
    );
    hairCrown.scale.set(0.98, 1.04, 1.04);
    hairCrown.rotation.x = -0.18;
    hairCrown.position.set(0, headCenterY + 0.012, -0.008);
    this.headGroup.add(hairCrown);

    const bangSpecs = [
      { x: 0.0, y: 0.262, z: 0.106, w: 0.046, h: 0.105, rz: 0.0, rx: -0.18 },
      { x: -0.042, y: 0.258, z: 0.1, w: 0.048, h: 0.115, rz: 0.14, rx: -0.14 },
      { x: 0.042, y: 0.258, z: 0.1, w: 0.048, h: 0.115, rz: -0.14, rx: -0.14 },
      { x: -0.082, y: 0.246, z: 0.082, w: 0.044, h: 0.125, rz: 0.26, rx: -0.08 },
      { x: 0.082, y: 0.246, z: 0.082, w: 0.044, h: 0.125, rz: -0.26, rx: -0.08 },
    ];

    bangSpecs.forEach((b) => {
      const { group: bang } = ToonAssets.createOutlinedMesh(
        new THREE.ConeGeometry(b.w * 0.62, b.h, 6),
        this.matHair,
        1.06,
      );
      bang.scale.set(1.0, 1.0, 0.45);
      bang.rotation.x = Math.PI + b.rx;
      bang.rotation.z = b.rz;
      bang.position.set(b.x, b.y, b.z);
      this.headGroup.add(bang);
    });

    for (const side of [-1, 1] as const) {
      const sideLockPivot = new THREE.Group();
      sideLockPivot.position.set(side * 0.112, headCenterY + 0.02, 0.032);
      this.headGroup.add(sideLockPivot);

      const { group: upperLock } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.034, 0.028, 0.28, 8),
        this.matHair,
        1.06,
      );
      upperLock.scale.set(0.75, 1.0, 1.15);
      upperLock.position.set(side * 0.01, -0.14, 0.015);
      upperLock.rotation.z = side * 0.08;
      sideLockPivot.add(upperLock);

      const { group: tipLock } = ToonAssets.createOutlinedMesh(
        new THREE.ConeGeometry(0.028, 0.18, 7),
        this.matHairTips,
        1.07,
      );
      tipLock.scale.set(0.75, 1.0, 1.1);
      tipLock.rotation.x = Math.PI;
      tipLock.position.set(side * 0.024, -0.36, 0.026);
      sideLockPivot.add(tipLock);
    }

    this.backHairRoot = new THREE.Group();
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

      const len1 = 0.42 * lengthFactor;
      const { group: seg1Mesh } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.072, len1, 0.032),
        this.matHair,
        { x: 1.08, y: 1.02, z: 1.25 },
      );
      seg1Mesh.position.y = -len1 * 0.5;
      rootSeg.add(seg1Mesh);

      const midSeg = new THREE.Group();
      midSeg.position.y = -len1;
      rootSeg.add(midSeg);

      const len2 = 0.4 * lengthFactor;
      const { group: seg2Mesh } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.062, len2, 0.026),
        this.matHairMid,
        { x: 1.08, y: 1.02, z: 1.25 },
      );
      seg2Mesh.position.y = -len2 * 0.5;
      midSeg.add(seg2Mesh);

      const tipSeg = new THREE.Group();
      tipSeg.position.y = -len2;
      midSeg.add(tipSeg);

      const len3 = 0.32 * lengthFactor;
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

  private buildCrystallineTiara(): void {
    const L = ARENA_CONFIG.lighting;
    this.headAccessory.position.set(0, 0.305, 0.035);
    this.headAccessory.rotation.x = -0.16;
    this.headGroup.add(this.headAccessory);

    const circlet = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.0085, 8, 24, Math.PI * 1.15),
      this.matSilverCollar,
    );
    circlet.rotation.x = Math.PI * 0.48;
    circlet.rotation.z = -Math.PI * 0.075;
    this.headAccessory.add(circlet);

    const centerSpire = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.036, 0),
      this.matTiaraCrystal,
    );
    centerSpire.scale.set(0.62, 1.95, 0.45);
    centerSpire.position.set(0, 0.055, 0.095);
    this.headAccessory.add(centerSpire);

    for (const side of [-1, 1] as const) {
      const wing1 = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.025, 0),
        this.matTiaraCrystal,
      );
      wing1.scale.set(0.55, 1.55, 0.42);
      wing1.position.set(side * 0.048, 0.034, 0.082);
      wing1.rotation.z = -side * 0.32;
      this.headAccessory.add(wing1);

      const wing2 = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.019, 0),
        this.matTrim,
      );
      wing2.scale.set(0.5, 1.35, 0.4);
      wing2.position.set(side * 0.088, 0.015, 0.055);
      wing2.rotation.z = -side * 0.58;
      this.headAccessory.add(wing2);
    }

    this.tiaraLight = new THREE.PointLight(
      PALETTE.frostRunes,
      L.tiaraLightCombatBase,
      L.tiaraLightDistance,
      L.tiaraLightDecay,
    );
    this.tiaraLight.position.set(0, 0.14, 0.18);
    this.headAccessory.add(this.tiaraLight);
  }

  private buildFrostHalo(): void {
    this.frostHalo = new THREE.Group();
    this.frostHalo.position.set(0, 0.42, -0.26);
    this.torsoGroup.add(this.frostHalo);

    const ringMat = new THREE.MeshBasicMaterial({
      color: PALETTE.frostRunes,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.39, 32),
      ringMat,
    );
    this.frostHalo.add(outerRing);

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.036, 0),
        this.matTiaraCrystal,
      );
      shard.scale.set(0.55, 1.5, 0.4);
      shard.position.set(Math.cos(ang) * 0.42, Math.sin(ang) * 0.42, 0);
      shard.rotation.z = ang - Math.PI / 2;
      this.frostHalo.add(shard);
    }
  }

  private buildPhaseAuroraRings(): void {
    this.phaseAuroraRings = new THREE.Group();
    this.phaseAuroraRings.position.set(0, 0.2, 0);

    const outerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.warningRune,
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
    this.phaseAuroraRings.add(outerRing);

    const innerMat = new THREE.MeshBasicMaterial({
      color: PALETTE.sovereignIndigo,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.022, 8, 36),
      innerMat,
    );
    innerRing.rotation.x = Math.PI * 0.42;
    this.phaseAuroraRings.add(innerRing);

    this.phaseAuroraRings.visible = false;
    this.phaseAuroraHandles = { outerRing, innerRing, outerMat, innerMat };
    this.bodyPivot.add(this.phaseAuroraRings);
  }

  public setPhaseVisuals(phase: BossPhase): void {
    this.phaseLevel = phase;
    this.phaseAuroraRings.visible = phase >= BOSS_PHASES.PHASE_2;
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

  /**
   * Builds a translucent glowing #38BDF8 holographic ice-clone silhouette for Phase 2 illusions.
   */
  public createIceCloneGroup(): THREE.Group {
    const cloneRoot = new THREE.Group();
    const cloneMat = ToonAssets.createToonMaterial(PALETTE.warningRune, {
      emissive: PALETTE.warningRune,
      emissiveIntensity: 0.62,
      transparent: true,
      opacity: BOSS_CONFIG.phase2.cloneOpacity,
      side: THREE.DoubleSide,
    });

    this.root.updateMatrixWorld(true);
    const invRoot = new THREE.Matrix4().copy(this.root.matrixWorld).invert();

    this.bodyPivot.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        !child.userData.isOutline &&
        child.parent !== this.phaseAuroraRings
      ) {
        const mesh = new THREE.Mesh(child.geometry, cloneMat);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.multiplyMatrices(invRoot, child.matrixWorld);
        cloneRoot.add(mesh);
      }
    });

    const baseRingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.blindingFrost,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.72, 24),
      baseRingMat,
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.06;
    cloneRoot.add(baseRing);

    cloneRoot.userData.cloneMat = cloneMat;
    cloneRoot.userData.baseRingMat = baseRingMat;
    return cloneRoot;
  }

  /**
   * Renders crisp high-detail anime facial features onto the 512x512 CanvasTexture.
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

      if (intensity > 0.45) {
        const noseGrad = ctx.createRadialGradient(256, 312, 4, 256, 312, 74);
        noseGrad.addColorStop(
          0,
          `rgba(${PALETTE.rgba.blushCoreRgb}, ${intensity * 0.42})`,
        );
        noseGrad.addColorStop(1, `rgba(${PALETTE.rgba.blushCoreRgb}, 0)`);
        ctx.fillStyle = noseGrad;
        ctx.fillRect(170, 275, 172, 74);
      }
    };

    const drawStarGlint = (cx: number, cy: number, r: number): void => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = PALETTE.hex.pureWhite;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rad = i % 2 === 0 ? r : r * 0.28;
        const a = (i / 8) * Math.PI * 2;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawDetailedSapphireEye = (
      cx: number,
      cy: number,
      isRight: boolean,
      wideMode: boolean,
    ): void => {
      const dir = isRight ? 1 : -1;
      const eyeW = wideMode ? 52 : 50;
      const eyeH = wideMode ? 52 : 42;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, eyeW, eyeH, 0, 0, Math.PI * 2);
      ctx.clip();

      const scleraGrad = ctx.createLinearGradient(
        cx,
        cy - eyeH,
        cx,
        cy + eyeH,
      );
      scleraGrad.addColorStop(0.0, PALETTE.hex.silverRune);
      scleraGrad.addColorStop(0.32, PALETTE.hex.pureWhite);
      scleraGrad.addColorStop(1.0, PALETTE.hex.marinaHair);
      ctx.fillStyle = scleraGrad;
      ctx.fillRect(cx - eyeW, cy - eyeH, eyeW * 2, eyeH * 2);

      const irisR = wideMode ? 33 : 36;
      const irisY = cy + (wideMode ? 2 : 3);
      const irisGrad = ctx.createLinearGradient(
        cx,
        irisY - irisR,
        cx,
        irisY + irisR,
      );
      irisGrad.addColorStop(0.0, PALETTE.hex.eyeDeepCyan);
      irisGrad.addColorStop(0.35, PALETTE.hex.marinaIris);
      irisGrad.addColorStop(0.72, PALETTE.hex.frostRunes);
      irisGrad.addColorStop(1.0, PALETTE.hex.iceHighlights);

      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.ellipse(cx, irisY, irisR * 0.92, irisR * 1.06, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = PALETTE.hex.eyeDarkCyan;
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.fillStyle = PALETTE.rgba.irisCrescent;
      ctx.beginPath();
      ctx.arc(cx, irisY + 12, irisR * 0.56, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.fill();

      const pupilR = wideMode ? 11.5 : 14.5;
      ctx.fillStyle = PALETTE.hex.deepEyeNavy;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        irisY - 1,
        pupilR * 0.92,
        pupilR * 1.08,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.fillStyle = PALETTE.hex.pureWhite;
      ctx.beginPath();
      ctx.ellipse(
        cx - 13 * dir,
        irisY - 14,
        9.5,
        7.5,
        -0.3 * dir,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      drawStarGlint(cx + 12 * dir, irisY + 11, wideMode ? 9.5 : 8.0);
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

      ctx.strokeStyle = PALETTE.hex.browSlate;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(cx - eyeW * 0.58 * dir, cy + eyeH * 0.88);
      ctx.quadraticCurveTo(
        cx,
        cy + eyeH * 1.04,
        cx + eyeW * 0.68 * dir,
        cy + eyeH * 0.84,
      );
      ctx.stroke();
    };

    const drawNose = (): void => {
      ctx.fillStyle = PALETTE.rgba.noseTint;
      ctx.beginPath();
      ctx.ellipse(256, 326, 3.2, 5.2, 0.15, 0, Math.PI * 2);
      ctx.fill();
    };

    if (expression === BOSS_EXPRESSIONS.COMBAT) {
      drawCheekBlush(0.28, false);
      drawDetailedSapphireEye(162, 248, false, false);
      drawDetailedSapphireEye(350, 248, true, false);
      drawNose();

      ctx.strokeStyle = PALETTE.hex.mutedSlate;
      ctx.lineWidth = 5.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(112, 178);
      ctx.quadraticCurveTo(162, 165, 206, 182);
      ctx.moveTo(400, 178);
      ctx.quadraticCurveTo(350, 165, 306, 182);
      ctx.stroke();

      ctx.strokeStyle = PALETTE.hex.lipRose;
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(226, 378);
      ctx.quadraticCurveTo(256, 396, 286, 378);
      ctx.stroke();
    } else if (expression === BOSS_EXPRESSIONS.STAGGER) {
      drawCheekBlush(0.58, true);
      drawDetailedSapphireEye(162, 246, false, true);
      drawDetailedSapphireEye(350, 246, true, true);
      drawNose();

      ctx.strokeStyle = PALETTE.hex.mutedSlate;
      ctx.lineWidth = 5.0;
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

      ctx.fillStyle = PALETTE.rgba.lipGloss;
      ctx.beginPath();
      ctx.ellipse(250, 388, 6.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
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

      ctx.strokeStyle = PALETTE.hex.mutedSlate;
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
      ctx.fillStyle = PALETTE.rgba.puckerGloss;
      ctx.beginPath();
      ctx.ellipse(252, 380, 4.5, 2.5, -0.2, 0, Math.PI * 2);
      ctx.fill();
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

        ctx.fillStyle = PALETTE.hex.glacialPaleBlue;
        ctx.beginPath();
        ctx.arc(cx, cy + 6, 31, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PALETTE.hex.eyeMidSapphire;
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

        ctx.fillStyle = PALETTE.hex.marinaSkin;
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
   * Smoothly interpolates Marina between floating COMBAT poise and kneeling STAGGER exhaustion.
   */
  public updateCombatPose(
    dt: number,
    state: GameState,
    elapsed: number,
    staggerProgressOverride: number | null = null,
  ): void {
    const L = ARENA_CONFIG.lighting;
    const targetBlend =
      staggerProgressOverride !== null
        ? THREE.MathUtils.clamp(staggerProgressOverride, 0, 1)
        : state === GAME_STATES.STAGGER || state === GAME_STATES.SIPHON_FINISHER
          ? 1.0
          : 0.0;

    this.staggerBlend +=
      (targetBlend - this.staggerBlend) * Math.min(1, dt * 5.2);
    const s = this.staggerBlend;

    this.castAnimTimer = Math.max(0, this.castAnimTimer - dt);
    const castFactor =
      Math.sin(Math.min(1, this.castAnimTimer / 0.55) * Math.PI) * (1 - s);

    const desiredAscend = (1 - s) * this.targetAscendY;
    this.currentAscendY +=
      (desiredAscend - this.currentAscendY) * Math.min(1, dt * 4.8);

    // Floating Combat Height vs Kneeling Ice-Floor Height
    const combatY =
      0.88 +
      BOSS_CONFIG.floatHeight +
      this.currentAscendY +
      Math.sin(elapsed * 2.1) * 0.09;
    const staggerY = 0.465 + Math.sin(elapsed * 3.8) * 0.008;
    this.bodyPivot.position.y = THREE.MathUtils.lerp(combatY, staggerY, s);
    this.bodyPivot.rotation.set(0, 0, 0);

    // Torso Pitch
    const combatTorsoX = -0.05 + Math.sin(elapsed * 1.6) * 0.03;
    const staggerTorsoX = 0.25 + Math.sin(elapsed * 3.8) * 0.025;
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(
      combatTorsoX,
      staggerTorsoX,
      s,
    );

    // Head Tilt
    const combatHeadX = 0.04;
    const staggerHeadX = -0.34 + Math.sin(elapsed * 2.6) * 0.02;
    this.headGroup.rotation.x = THREE.MathUtils.lerp(
      combatHeadX,
      staggerHeadX,
      s,
    );

    // Legs
    const combatLeftHipX = 0.14 + Math.sin(elapsed * 1.7) * 0.06;
    const combatRightHipX = -0.08 + Math.cos(elapsed * 1.7) * 0.06;
    const combatLeftKneeX = 0.22;
    const combatRightKneeX = 0.34;

    const staggerHipX = -0.18;
    const staggerKneeX = 1.72;

    this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(
      combatLeftHipX,
      staggerHipX,
      s,
    );
    this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(
      combatRightHipX,
      staggerHipX,
      s,
    );
    this.leftLegPivot.rotation.z = THREE.MathUtils.lerp(-0.04, -0.08, s);
    this.rightLegPivot.rotation.z = THREE.MathUtils.lerp(0.04, 0.08, s);
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(
      combatLeftKneeX,
      staggerKneeX,
      s,
    );
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(
      combatRightKneeX,
      staggerKneeX,
      s,
    );

    // Arms
    const combatArmX =
      -0.38 - castFactor * 0.85 + Math.sin(elapsed * 2.0) * 0.06;
    const combatArmZ = 0.34 + castFactor * 0.42;
    const combatElbowX = -0.52 + castFactor * 0.24;

    const staggerArmX = -0.14;
    const staggerArmZ = 0.14;
    const staggerElbowX = -0.26;

    this.leftShoulderPivot.rotation.x = THREE.MathUtils.lerp(
      combatArmX,
      staggerArmX,
      s,
    );
    this.rightShoulderPivot.rotation.x = THREE.MathUtils.lerp(
      combatArmX,
      staggerArmX,
      s,
    );
    this.leftShoulderPivot.rotation.z = THREE.MathUtils.lerp(
      combatArmZ,
      staggerArmZ,
      s,
    );
    this.rightShoulderPivot.rotation.z = THREE.MathUtils.lerp(
      -combatArmZ,
      -staggerArmZ,
      s,
    );
    this.leftElbowPivot.rotation.x = THREE.MathUtils.lerp(
      combatElbowX,
      staggerElbowX,
      s,
    );
    this.rightElbowPivot.rotation.x = THREE.MathUtils.lerp(
      combatElbowX,
      staggerElbowX,
      s,
    );

    // Pleated Skirt Panels
    for (let i = 0; i < this.skirtPanels.length; i++) {
      const sp = this.skirtPanels[i];
      if (!sp) continue;
      const wave = Math.sin(elapsed * 2.5 + sp.angle * 2) * 0.04 * (1 - s);
      const kneelFlare = s * -0.44;
      sp.pivot.rotation.x = wave + kneelFlare;
    }

    // Volumetric Flowing Silver-White Hair Sway
    for (let i = 0; i < this.hairRibbons.length; i++) {
      const hr = this.hairRibbons[i];
      if (!hr) continue;
      const sway1 =
        Math.sin(elapsed * 2.4 + hr.phase) * 0.085 * (1 - s * 0.72);
      const sway2 =
        Math.sin(elapsed * 2.4 + hr.phase - 0.9) * 0.11 * (1 - s * 0.72);
      const sway3 =
        Math.sin(elapsed * 2.4 + hr.phase - 1.7) * 0.13 * (1 - s * 0.72);

      hr.rootSeg.rotation.x = THREE.MathUtils.lerp(
        0.18 + sway1,
        0.32 + sway1,
        s,
      );
      hr.midSeg.rotation.x = THREE.MathUtils.lerp(
        0.1 + sway2,
        0.45 + sway2,
        s,
      );
      hr.tipSeg.rotation.x = THREE.MathUtils.lerp(
        0.08 + sway3,
        0.62 + sway3,
        s,
      );
      hr.rootSeg.rotation.z =
        hr.spread * (0.14 + s * 0.22) +
        Math.cos(elapsed * 1.9 + hr.phase) * 0.04 * (1 - s * 0.6);
    }

    // Floating Frost Halo
    this.frostHalo.rotation.z =
      elapsed * (0.65 + (this.phaseLevel - 1) * 0.55);
    const haloScale = Math.max(
      0.001,
      (1.0 + (this.phaseLevel - 1) * 0.14) * (1.0 - s * 0.98),
    );
    this.frostHalo.scale.setScalar(haloScale);
    this.frostHalo.visible = haloScale > 0.02;

    // Rotating Phase 2 / 3 Aurora Rings
    const showAurora =
      (this.phaseLevel >= BOSS_PHASES.PHASE_2 || this.currentAscendY > 0.05) &&
      s < 0.35;
    this.phaseAuroraRings.visible = showAurora;
    if (showAurora) {
      const { outerRing, innerRing, outerMat, innerMat } =
        this.phaseAuroraHandles;
      const boost = this.phaseLevel === BOSS_PHASES.PHASE_3 ? 1.32 : 1.0;
      const curtainExpand = 1.0 + this.currentAscendY * 0.62;
      outerRing.rotation.z = elapsed * 1.45 * boost;
      innerRing.rotation.z = -elapsed * 2.1 * boost;
      innerRing.rotation.y = elapsed * 1.15;
      this.phaseAuroraRings.scale.setScalar((1 - s) * curtainExpand);
      outerMat.opacity = (0.48 + 0.16 * Math.sin(elapsed * 4.2)) * (1 - s);
      innerMat.opacity = (0.45 + 0.2 * Math.cos(elapsed * 3.4)) * (1 - s);
    }

    // Calibrated Tiara Light & Damage Rim Flash Decay
    const phaseBoost = (this.phaseLevel - 1) * L.tiaraLightPhaseStep;
    this.tiaraLight.intensity =
      (THREE.MathUtils.lerp(
        L.tiaraLightCombatBase + phaseBoost,
        L.tiaraLightStaggerBase,
        s,
      ) +
        castFactor * L.tiaraLightCastBoost) *
      (1 - this.currentDrainProgress * 0.85);

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const flash = this.hitFlashTimer / 0.18;
      for (let i = 0; i < this.rimFlashMaterials.length; i++) {
        const mat = this.rimFlashMaterials[i];
        if (!mat) continue;
        mat.emissive.setHex(PALETTE.iceHighlights);
        mat.emissiveIntensity = 0.25 + flash * 0.85;
      }
    } else if (this.currentDrainProgress <= 0) {
      for (let i = 0; i < this.rimFlashMaterials.length; i++) {
        const mat = this.rimFlashMaterials[i];
        if (!mat) continue;
        const origEm = mat.userData.originalEmissive as THREE.Color | undefined;
        const origInt =
          typeof mat.userData.originalEmissiveIntensity === 'number'
            ? mat.userData.originalEmissiveIntensity
            : 0;
        if (origEm) {
          mat.emissive.copy(origEm);
          mat.emissiveIntensity = origInt;
        } else {
          mat.emissive.setHex(PALETTE.pureBlack);
          mat.emissiveIntensity = 0;
        }
      }
    }
  }

  /**
   * Bleaches Marina's drainable materials smoothly toward PALETTE.drainedAshSilver (#94A3B8).
   */
  public applyDrainBleach(drainProgress: number): void {
    this.currentDrainProgress = THREE.MathUtils.clamp(drainProgress, 0, 1);
    applyMaterialBleach(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
      this.currentDrainProgress,
    );
    this.matTiaraCrystal.color
      .copy(this.tiaraOriginalColor)
      .lerp(this.drainedAshColor, this.currentDrainProgress);
  }

  /**
   * Applies interactive Arcane Siphon Kiss poses [1-4] with smooth ~0.25s bone
   * interpolation, progressive breathing & trembling-to-limpness curves (0% -> 100%),
   * throttle reactivity (SAVOR / FLOW / SURGE), and continuous hair & gown billowing
   * while keeping her mouth (headAnchor) steady as the fixed lip-contact pivot.
   */
  public applyFinisherPose(
    poseId: FinisherPoseId,
    drainProgress: number,
    time: number,
    dt = 1 / 60,
    throttleMode: DrainThrottleMode = DRAIN_THROTTLE_MODES.FLOW,
  ): void {
    this.applyDrainBleach(drainProgress);

    const safeDt = Math.max(0.001, Math.min(dt, 0.05));
    const lerpAlpha =
      1 -
      Math.exp(
        -safeDt / (FINISHER_CONFIG.poseTransitionDurationSec * 0.35),
      );

    // Progressive vitality (0% -> 50%) vs limpness (50% -> 100% & Endless Savor)
    const half = FINISHER_CONFIG.limpThreshold;
    const earlyResistance = 1 - THREE.MathUtils.clamp(drainProgress / half, 0, 1);
    const limpness = THREE.MathUtils.clamp(
      (drainProgress - half) / (1 - half),
      0,
      1,
    );

    const isSurge = throttleMode === DRAIN_THROTTLE_MODES.SURGE;
    const isSavor = throttleMode === DRAIN_THROTTLE_MODES.SAVOR;

    // 1. Resolve Target Base Bone Rotations for Poses [1-4]
    let targetBodyY = 0.48;
    let targetTorsoX = THREE.MathUtils.lerp(0.14, 0.28, limpness);
    let targetTorsoZ = 0;
    let targetHeadX = -0.38;
    let targetHeadZ = 0;
    let targetLeftHipX = -0.18;
    let targetRightHipX = -0.18;
    let targetLeftKneeX = 1.72;
    let targetRightKneeX = 1.72;
    let targetSkirtPitch = -0.44;

    if (poseId === FINISHER_POSE_IDS.BALLROOM_DIP) {
      // Pose [2]: Glacial Ballroom Dip (~45° backward dip)
      targetBodyY = THREE.MathUtils.lerp(0.78, 0.74, limpness);
      targetTorsoX =
        -FINISHER_CONFIG.dipBossSpineAngleRad - limpness * 0.08;
      targetHeadX = -0.22 - limpness * 0.04;
      targetLeftHipX = 0.28;
      targetRightHipX = -0.16;
      targetLeftKneeX = 0.52;
      targetRightKneeX = 0.34;
      targetSkirtPitch = -0.18;
    } else if (poseId === FINISHER_POSE_IDS.HAIR_REINS) {
      targetBodyY = THREE.MathUtils.lerp(0.49, 0.46, limpness);
      targetTorsoX = THREE.MathUtils.lerp(0.16, 0.3, limpness);
      targetHeadX = -0.44;
      targetHeadZ = 0.05;
    } else if (poseId === FINISHER_POSE_IDS.STAFF_LEAN) {
      targetBodyY = THREE.MathUtils.lerp(0.48, 0.45, limpness);
      targetTorsoX = THREE.MathUtils.lerp(0.15, 0.29, limpness);
      targetTorsoZ = 0.04;
      targetHeadX = -0.39;
    } else {
      // Pose [1]: Chin-Lift Tilt
      targetBodyY = THREE.MathUtils.lerp(0.48, 0.45, limpness);
    }

    // Arms transition from clutching/resisting (-0.34) to deeply slumped & hanging limp (+0.12)
    const targetShoulderX = THREE.MathUtils.lerp(-0.34, 0.12, limpness);
    const targetShoulderZ = THREE.MathUtils.lerp(0.24, 0.06, limpness);
    const targetElbowX = THREE.MathUtils.lerp(-0.68, -0.05, limpness);

    // Initialize lerp cache from live bone state on first finisher frame (zero initial snap)
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

    // Smooth ~0.25s interpolation toward target pose
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
    st.leftElbowX = THREE.MathUtils.lerp(
      st.leftElbowX,
      targetElbowX,
      lerpAlpha,
    );
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

    // 2. Reactive Breathing & Trembling-to-Limpness Layers
    // 0%->50%: rapid shallow chest breathing (5.5 rad/s) + forearm/wrist trembling
    // 50%->100% (& Endless Savor): deep exhausted slow breathing + passive pendulum arm sway
    const earlyWeight = 1 - limpness;
    const earlyBreath = Math.sin(time * FINISHER_CONFIG.earlyBreathFreq);
    const lateBreath = Math.sin(time * FINISHER_CONFIG.lateBreathFreq);

    const chestBreathPitch =
      earlyBreath * 0.032 * earlyWeight + lateBreath * 0.052 * limpness;
    const chestBreathLift =
      earlyBreath * 0.008 * earlyWeight + lateBreath * 0.014 * limpness;
    const shoulderBreathHeave =
      earlyBreath * 0.065 * earlyWeight + lateBreath * 0.04 * limpness;

    // Throttle modulation: SURGE amplifies micro-shudder; SAVOR adds dreamy slow sway
    const throttleTrembleScale = isSurge
      ? FINISHER_CONFIG.surgeShudderMultiplier
      : isSavor
        ? FINISHER_CONFIG.savorSwayMultiplier
        : 1.0;

    // Active trembling curve peaks in 0%->50% and fades cleanly to 0 past 50%
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

    // Passive pendulum arm & wrist sway in 50%->100% drain and Endless Savor
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
      Math.cos(time * FINISHER_CONFIG.pendulumFreq * 0.72) *
      0.045 *
      limpness;

    // 3. Apply Pose to Skeleton — Head counter-stabilizes chest heave so mouth stays locked as fixed pivot
    this.frostHalo.visible = false;
    this.phaseAuroraRings.visible = false;

    this.bodyPivot.position.y = st.bodyY + chestBreathLift;
    this.bodyPivot.rotation.set(0, 0, savorDreamySway * 0.35);

    this.torsoGroup.rotation.set(
      st.torsoX + chestBreathPitch + surgeShudder * 0.5,
      0,
      st.torsoZ + savorDreamySway + surgeShudder,
    );
    // Counter-pitch/roll head to pin headAnchor (her lips) firmly at the contact pivot
    this.headGroup.rotation.set(
      st.headX - chestBreathPitch * 0.85,
      0,
      st.headZ - savorDreamySway * 0.85 - surgeShudder * 0.5,
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

    // 4. Continuous Gown Hem Billowing
    const gownSpeed = isSurge ? 4.4 : isSavor ? 1.45 : 2.5;
    const gownAmp = isSurge ? 0.062 : isSavor ? 0.032 : 0.044;
    for (let i = 0; i < this.skirtPanels.length; i++) {
      const sp = this.skirtPanels[i];
      if (!sp) continue;
      const billow = Math.sin(time * gownSpeed + sp.angle * 2.0) * gownAmp;
      sp.pivot.rotation.x = st.skirtBasePitch + billow;
    }

    // 5. Continuous Volumetric Silver-White Hair Cascade Motion
    const hairSpeed = isSurge ? 4.6 : isSavor ? 1.55 : 2.5;
    const hairAmp = isSurge ? 0.11 : isSavor ? 0.055 : 0.075;
    const isDip = poseId === FINISHER_POSE_IDS.BALLROOM_DIP;
    const targetRootX = isDip ? 0.54 : 0.32;
    const targetMidX = isDip ? 0.36 : 0.46;
    const targetTipX = isDip ? 0.24 : 0.62;

    for (let i = 0; i < this.hairRibbons.length; i++) {
      const hr = this.hairRibbons[i];
      if (!hr) continue;
      const wave1 = Math.sin(time * hairSpeed + hr.phase) * hairAmp;
      const wave2 = Math.sin(time * hairSpeed + hr.phase - 0.85) * hairAmp * 1.2;
      const wave3 = Math.sin(time * hairSpeed + hr.phase - 1.65) * hairAmp * 1.35;

      hr.rootSeg.rotation.x = THREE.MathUtils.lerp(
        hr.rootSeg.rotation.x,
        targetRootX + wave1,
        lerpAlpha,
      );
      hr.midSeg.rotation.x = THREE.MathUtils.lerp(
        hr.midSeg.rotation.x,
        targetMidX + wave2,
        lerpAlpha,
      );
      hr.tipSeg.rotation.x = THREE.MathUtils.lerp(
        hr.tipSeg.rotation.x,
        targetTipX + wave3,
        lerpAlpha,
      );
      hr.rootSeg.rotation.z =
        hr.spread * (0.34 + limpness * 0.1) +
        Math.cos(time * (hairSpeed * 0.78) + hr.phase) * (hairAmp * 0.65);
    }

    // 6. Tiara spring-wobble decay on [F] flick taunt
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
   * Victory Diorama floor collapse pose (100% drained, sprawled exhausted on the ice floor
   * with cascading silver hair spread wide and tiara light dimmed).
   */
  public applyVictoryCollapsePose(time: number): void {
    this.finisherPoseState.initialized = false;
    this.applyDrainBleach(1.0);
    this.frostHalo.visible = false;
    this.phaseAuroraRings.visible = false;
    this.tiaraLight.intensity = 0.25;
    this.headAccessory.rotation.set(-0.16, 0, 0.08);

    const sigh = Math.sin(time * 2.1) * 0.012;
    this.bodyPivot.position.y = DIORAMA_CONFIG.collapseBodyY + sigh;
    this.bodyPivot.rotation.set(-Math.PI * 0.46, 0, 0.16);
    this.torsoGroup.rotation.x = 0.08 + sigh * 0.8;
    this.headGroup.rotation.set(0.14, 0.26, 0.22);
    this.leftLegPivot.rotation.set(0.14, 0, -0.18);
    this.rightLegPivot.rotation.set(-0.08, 0, 0.24);
    this.leftKneePivot.rotation.x = 0.42;
    this.rightKneePivot.rotation.x = 0.68;
    this.leftShoulderPivot.rotation.set(0.2, 0, 0.48);
    this.rightShoulderPivot.rotation.set(-0.12, 0, -0.58);
    this.leftElbowPivot.rotation.x = -0.18;
    this.rightElbowPivot.rotation.x = -0.26;

    // Fan silver-white hair ribbons wide across the reflective ice floor
    for (let i = 0; i < this.hairRibbons.length; i++) {
      const hr = this.hairRibbons[i];
      if (!hr) continue;
      hr.rootSeg.rotation.x = 0.14;
      hr.midSeg.rotation.x = 0.08;
      hr.tipSeg.rotation.x = 0.04;
      hr.rootSeg.rotation.z =
        hr.spread * 0.72 + Math.sin(time * 1.4 + hr.phase) * 0.025;
    }

    for (let i = 0; i < this.skirtPanels.length; i++) {
      const sp = this.skirtPanels[i];
      if (!sp) continue;
      sp.pivot.rotation.x = -0.35;
    }
  }

  /**
   * Defeat Diorama "Forced Frost Puppet" triumphant standing pose controlling marionette strings.
   */
  public applyPuppetMasterPose(time: number): void {
    this.applyDrainBleach(0);
    this.frostHalo.visible = true;
    this.frostHalo.scale.setScalar(1.0);
    this.frostHalo.rotation.z = time * 0.55;
    this.phaseAuroraRings.visible = false;
    this.tiaraLight.intensity = ARENA_CONFIG.lighting.tiaraLightCombatBase;
    this.headAccessory.rotation.set(-0.16, 0, 0);

    const wave = Math.sin(time * DIORAMA_CONFIG.puppetWaveCadence);
    const waveCos = Math.cos(time * DIORAMA_CONFIG.puppetWaveCadence);

    this.bodyPivot.position.y = 0.96 + wave * 0.025;
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.x = -0.04;
    this.headGroup.rotation.set(0.2, waveCos * 0.07, wave * 0.04);
    this.leftLegPivot.rotation.set(0.06, 0, -0.05);
    this.rightLegPivot.rotation.set(-0.06, 0, 0.05);
    this.leftKneePivot.rotation.x = 0.08;
    this.rightKneePivot.rotation.x = 0.12;

    // Hands raised gracefully conducting the marionette lines
    this.leftShoulderPivot.rotation.set(-0.95 + wave * 0.16, 0, 0.24);
    this.rightShoulderPivot.rotation.set(-0.95 - wave * 0.16, 0, -0.24);
    this.leftElbowPivot.rotation.x = -0.42 + wave * 0.14;
    this.rightElbowPivot.rotation.x = -0.42 - wave * 0.14;

    for (let i = 0; i < this.hairRibbons.length; i++) {
      const hr = this.hairRibbons[i];
      if (!hr) continue;
      const sway = Math.sin(time * 2.2 + hr.phase) * 0.065;
      hr.rootSeg.rotation.x = 0.18 + sway;
      hr.midSeg.rotation.x = 0.12 + sway;
      hr.tipSeg.rotation.x = 0.08 + sway;
      hr.rootSeg.rotation.z = hr.spread * 0.16;
    }

    for (let i = 0; i < this.skirtPanels.length; i++) {
      const sp = this.skirtPanels[i];
      if (!sp) continue;
      sp.pivot.rotation.x = Math.sin(time * 2.0 + sp.angle * 2) * 0.03;
    }
  }

  /**
   * Resets Marina cleanly for a fresh duel or Encore NG+ stage.
   */
  public resetForEncounter(_encoreTier: number): void {
    this.currentDrainProgress = 0;
    restoreDrainableMaterials(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
    );
    this.matTiaraCrystal.color.copy(this.tiaraOriginalColor);

    this.staggerBlend = 0;
    this.finisherPoseState.initialized = false;
    this.hitFlashTimer = 0;
    this.castAnimTimer = 0;
    this.accessoryFlickTimer = 0;
    this.targetAscendY = 0;
    this.currentAscendY = 0;
    this.headAccessory.rotation.set(-0.16, 0, 0);
    this.tiaraLight.intensity = ARENA_CONFIG.lighting.tiaraLightCombatBase;
    this.setPhaseVisuals(BOSS_PHASES.PHASE_1);
    this.setExpression(BOSS_EXPRESSIONS.COMBAT);

    this.bodyPivot.position.set(0, 0.88 + BOSS_CONFIG.floatHeight, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
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
    this.scene.remove(this.root);
  }
}
