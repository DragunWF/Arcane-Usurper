import * as THREE from 'three';
import {
  ARENA_CONFIG,
  CAMERA_CONFIG,
  DIORAMA_CONFIG,
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_POSE_IDS,
  NG_PLUS_CONFIG,
  PALETTE,
  PLAYER_CONFIG,
  SIPHON_BEAM_CONFIG,
  type DrainThrottleMode,
  type FinisherPoseId,
} from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';
import {
  computeFinisherHeadChoreography,
  type FinisherHeadChoreography,
} from './bosses/BossBase';

/**
 * Proportioned Cel-Shaded Humanoid Dark Mage Rig (Obsidian Siphon Mage).
 * Ported verbatim from the legacy Glacial Spire monolith — encapsulates mesh
 * construction, materials, articulated skeletal pivots, and pose interpolation
 * with zero AI or collision math (SRP).
 */
export class DarkMageRig {
  public readonly root: THREE.Group;
  public readonly bodyPivot: THREE.Group;

  // Exposed skeletal pivots for FinisherSystem & DioramaSystem posing
  public torsoGroup!: THREE.Group;
  public headGroup!: THREE.Group;
  public hoodTailPivot!: THREE.Group;
  public leftLegPivot!: THREE.Group;
  public rightLegPivot!: THREE.Group;
  public leftKneePivot!: THREE.Group;
  public rightKneePivot!: THREE.Group;
  public leftShoulderPivot!: THREE.Group;
  public rightShoulderPivot!: THREE.Group;
  public leftElbowPivot!: THREE.Group;
  public rightElbowPivot!: THREE.Group;
  public frontLeftRobe!: THREE.Group;
  public frontRightRobe!: THREE.Group;
  public backRobePivot!: THREE.Group;
  public staffGroup!: THREE.Group;
  public staffCrystal!: THREE.Group;
  public staffRuneRing!: THREE.Mesh;
  public staffLight!: THREE.PointLight;

  // Optional Encore NG+ Stolen Frost-Wing Aura & Dual Staff Cyan Infusions
  private frostWingGroup: THREE.Group | null = null;
  private staffFrostRing: THREE.Mesh | null = null;
  private staffFrostLight: THREE.PointLight | null = null;
  private encoreTier = 0;

  // Defeat "Forced Frost Puppet" Diorama Accessories & Planted Staff State
  private defeatBlushGroup: THREE.Group | null = null;
  private puppetCrystalLeft: THREE.Group | null = null;
  private puppetCrystalRight: THREE.Group | null = null;
  private isStaffPlanted = false;
  private readonly leftHandAnchor = new THREE.Object3D();
  private readonly rightHandAnchor = new THREE.Object3D();
  private readonly headTopAnchor = new THREE.Object3D();
  private readonly mouthAnchor = new THREE.Object3D();
  private readonly scratchMouthWorld = new THREE.Vector3();
  private readonly scratchTargetLipWorld = new THREE.Vector3();
  private readonly scratchLipDelta = new THREE.Vector3();
  private readonly scratchInvQuat = new THREE.Quaternion();
  private readonly finisherPoseState = {
    initialized: false,
    bodyY: 0.7,
    bodyOffsetX: 0,
    bodyOffsetZ: 0,
    torsoX: 0.54,
    torsoZ: 0,
    headX: 0.32,
    headZ: 0,
    leftHipX: 0.08,
    leftHipZ: -0.06,
    rightHipX: -0.14,
    rightHipZ: 0.06,
    leftKneeX: 0.22,
    rightKneeX: 0.14,
    leftShoulderX: -1.18,
    leftShoulderY: 0.18,
    leftShoulderZ: 0.34,
    leftElbowX: -0.82,
    leftElbowZ: 0.26,
    rightShoulderX: -0.42,
    rightShoulderY: 0,
    rightShoulderZ: -0.26,
    rightElbowX: -0.58,
    rightElbowZ: 0,
    staffRotX: Math.PI * 0.34,
    staffRotZ: -0.14,
  };

  // Animation & Combat Feedback State
  public invulnTimer = 0;
  private stridePhase = 0;
  private speedBlend = 0;
  private castRecoil = 0;
  private pulseAnim = 0;

  private readonly scene: THREE.Scene;
  private readonly flashMaterials: THREE.MeshToonMaterial[] = [];
  private readonly proximityFadeMaterials: THREE.Material[] = [];
  private readonly outlineMeshes: THREE.Object3D[] = [];
  private lastProximityOpacity = 1.0;

  // Shared Cel-Shaded Materials
  private matAbyssal!: THREE.MeshToonMaterial;
  private matShadowSlate!: THREE.MeshToonMaterial;
  private matCowlShadow!: THREE.MeshToonMaterial;
  private matAmethystTrim!: THREE.MeshToonMaterial;
  private matSilverRune!: THREE.MeshToonMaterial;
  private matDarkMetal!: THREE.MeshToonMaterial;
  private matHoodInner!: THREE.MeshBasicMaterial;
  private matEyeGlow!: THREE.MeshBasicMaterial;
  private matEyeCore!: THREE.MeshBasicMaterial;
  private matCrystal!: THREE.MeshBasicMaterial;
  private matCrystalAura!: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.bodyPivot = new THREE.Group();
    this.bodyPivot.position.y = 0.96; // Pelvis/Hip origin (~1.88m total height)
    this.root.add(this.bodyPivot);

    this.buildMaterials();
    this.buildLegs();
    this.buildTorsoAndBelt();
    this.buildSplitLowerRobes();
    this.buildShoulderMantle();
    this.buildRecessedHeadAndDrapedHood();
    this.buildArticulatedArmsAndStaff();
    this.buildEncoreFrostWings();
    this.collectOutlineMeshes();

    this.root.position.set(
      PLAYER_CONFIG.spawnX,
      PLAYER_CONFIG.spawnY,
      PLAYER_CONFIG.spawnZ,
    );
    this.root.rotation.y = PLAYER_CONFIG.spawnYaw;

    this.scene.add(this.root);
  }

  private buildMaterials(): void {
    this.matAbyssal = ToonAssets.createToonMaterial(PALETTE.abyssalCloak);
    this.matShadowSlate = ToonAssets.createToonMaterial(PALETTE.shadowSlate);
    this.matCowlShadow = ToonAssets.createToonMaterial(PALETTE.cowlShadow);
    this.matAmethystTrim = ToonAssets.createToonMaterial(PALETTE.amethystTrim, {
      emissive: PALETTE.amethystTrim,
      emissiveIntensity: 0.35,
    });
    this.matSilverRune = ToonAssets.createToonMaterial(PALETTE.silverRune);
    this.matDarkMetal = ToonAssets.createToonMaterial(PALETTE.obsidianTrim);
    this.matHoodInner = new THREE.MeshBasicMaterial({
      color: PALETTE.cowlShadow,
      side: THREE.BackSide,
    });
    this.matEyeGlow = new THREE.MeshBasicMaterial({
      color: PALETTE.glowViolet,
      side: THREE.DoubleSide,
    });
    this.matEyeCore = new THREE.MeshBasicMaterial({
      color: PALETTE.voidCoreFuchsia,
      side: THREE.DoubleSide,
    });
    this.matCrystal = new THREE.MeshBasicMaterial({
      color: PALETTE.glowViolet,
    });
    this.matCrystalAura = new THREE.MeshBasicMaterial({
      color: PALETTE.pulseLavender,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    });

    this.flashMaterials.push(
      this.matAbyssal,
      this.matShadowSlate,
      this.matAmethystTrim,
      this.matDarkMetal,
    );

    this.proximityFadeMaterials.push(
      this.matAbyssal,
      this.matShadowSlate,
      this.matCowlShadow,
      this.matAmethystTrim,
      this.matSilverRune,
      this.matDarkMetal,
      this.matHoodInner,
    );
  }

  private collectOutlineMeshes(): void {
    this.outlineMeshes.length = 0;
    this.root.traverse((obj) => {
      if (obj.userData.isOutline) {
        this.outlineMeshes.push(obj);
      }
    });
  }

  /**
   * Smoothly fades the Dark Mage's robes/hood/mantle when the spring-arm camera pulls
   * close against an enclosed chamber wall or pillar, restoring opaque rendering once clear.
   */
  public setCameraProximityDistance(distance: number): void {
    const startDist = CAMERA_CONFIG.playerFadeStartDist;
    const minDist = CAMERA_CONFIG.combatMinSpringDist;
    const minOpacity = CAMERA_CONFIG.playerMinFadeOpacity;

    const targetOpacity =
      distance >= startDist
        ? 1.0
        : THREE.MathUtils.lerp(
            minOpacity,
            1.0,
            THREE.MathUtils.clamp(
              (distance - minDist) / Math.max(0.01, startDist - minDist),
              0,
              1,
            ),
          );

    if (Math.abs(targetOpacity - this.lastProximityOpacity) < 0.005) {
      return;
    }
    this.lastProximityOpacity = targetOpacity;
    const isOpaque = targetOpacity >= 0.995;

    for (let i = 0; i < this.proximityFadeMaterials.length; i++) {
      const mat = this.proximityFadeMaterials[i];
      if (!mat) continue;
      const shouldBeTransparent = !isOpaque;
      if (mat.transparent !== shouldBeTransparent) {
        mat.transparent = shouldBeTransparent;
        mat.needsUpdate = true;
      }
      mat.opacity = targetOpacity;
      mat.depthWrite = isOpaque || targetOpacity > 0.72;
    }

    // Hide ink-black BackSide outline shells while faded so they don't silhouette through translucent robes
    const showOutlines = targetOpacity >= 0.85;
    for (let i = 0; i < this.outlineMeshes.length; i++) {
      const outline = this.outlineMeshes[i];
      if (outline) outline.visible = showOutlines;
    }
  }

  private buildLegs(): void {
    const buildSingleLeg = (side: -1 | 1) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(side * 0.135, -0.02, 0);
      this.bodyPivot.add(hipPivot);

      const { group: thigh } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.088, 0.072, 0.44, 10),
        this.matShadowSlate,
        { x: 1.09, y: 1.01, z: 1.09 },
      );
      thigh.position.y = -0.22;
      hipPivot.add(thigh);

      const kneePivot = new THREE.Group();
      kneePivot.position.set(0, -0.44, 0);
      hipPivot.add(kneePivot);

      const kneeCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.072, 10, 8),
        this.matDarkMetal,
      );
      kneePivot.add(kneeCap);

      const { group: shin } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.07, 0.058, 0.36, 10),
        this.matAbyssal,
        { x: 1.09, y: 1.01, z: 1.09 },
      );
      shin.position.y = -0.18;
      kneePivot.add(shin);

      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.076, 0.07, 0.06, 10),
        this.matAmethystTrim,
      );
      cuff.position.y = -0.16;
      kneePivot.add(cuff);

      const bootGroup = new THREE.Group();
      bootGroup.position.set(0, -0.42, 0.02);
      kneePivot.add(bootGroup);

      const { group: bootMain } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.115, 0.12, 0.24),
        this.matAbyssal,
        1.06,
      );
      bootMain.position.set(0, -0.02, 0.04);
      bootGroup.add(bootMain);

      const { group: bootToe } = ToonAssets.createOutlinedMesh(
        new THREE.ConeGeometry(0.066, 0.12, 4),
        this.matDarkMetal,
        1.07,
      );
      bootToe.rotation.x = Math.PI / 2;
      bootToe.rotation.y = Math.PI / 4;
      bootToe.position.set(0, -0.04, 0.18);
      bootGroup.add(bootToe);

      return { hipPivot, kneePivot };
    };

    const left = buildSingleLeg(-1);
    const right = buildSingleLeg(1);
    this.leftLegPivot = left.hipPivot;
    this.leftKneePivot = left.kneePivot;
    this.rightLegPivot = right.hipPivot;
    this.rightKneePivot = right.kneePivot;
  }

  private buildTorsoAndBelt(): void {
    this.torsoGroup = new THREE.Group();
    this.bodyPivot.add(this.torsoGroup);

    const { group: pelvis } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.16, 0.17, 0.18, 12),
      this.matAbyssal,
      1.05,
    );
    pelvis.scale.set(1.15, 1.0, 0.84);
    pelvis.position.y = 0.02;
    this.torsoGroup.add(pelvis);

    const { group: chest } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.225, 0.148, 0.44, 12),
      this.matShadowSlate,
      { x: 1.05, y: 1.02, z: 1.06 },
    );
    chest.scale.set(1.14, 1.0, 0.78);
    chest.position.y = 0.3;
    this.torsoGroup.add(chest);

    const plastron = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.36, 0.05),
      this.matAbyssal,
    );
    plastron.position.set(0, 0.3, 0.145);
    this.torsoGroup.add(plastron);

    const trimGeo = new THREE.BoxGeometry(0.028, 0.38, 0.02);
    const trimL = new THREE.Mesh(trimGeo, this.matAmethystTrim);
    trimL.position.set(-0.085, 0.3, 0.172);
    trimL.rotation.z = 0.12;
    this.torsoGroup.add(trimL);

    const trimR = new THREE.Mesh(trimGeo, this.matAmethystTrim);
    trimR.position.set(0.085, 0.3, 0.172);
    trimR.rotation.z = -0.12;
    this.torsoGroup.add(trimR);

    const beltGroup = new THREE.Group();
    beltGroup.position.y = 0.095;
    this.torsoGroup.add(beltGroup);

    const { group: beltBand } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.166, 0.172, 0.085, 14),
      this.matSilverRune,
      1.04,
    );
    beltBand.scale.set(1.16, 1.0, 0.85);
    beltGroup.add(beltBand);

    const buckleFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.105, 0.098, 0.04),
      this.matSilverRune,
    );
    buckleFrame.position.set(0, 0, 0.148);
    beltGroup.add(buckleFrame);

    const buckleGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.036, 0),
      this.matCrystal,
    );
    buckleGem.scale.set(0.95, 1.25, 0.55);
    buckleGem.position.set(0, 0, 0.168);
    beltGroup.add(buckleGem);

    for (const s of [-1, 1] as const) {
      const clasp = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.065, 0.05),
        this.matAmethystTrim,
      );
      clasp.position.set(s * 0.185, 0, 0.03);
      beltGroup.add(clasp);
    }
  }

  private buildSplitLowerRobes(): void {
    const buildFrontPanel = (side: -1 | 1): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.115, 0.05, 0.11);
      this.torsoGroup.add(pivot);

      const panelGeo = new THREE.BoxGeometry(0.155, 0.58, 0.028);
      const { group: panel } = ToonAssets.createOutlinedMesh(
        panelGeo,
        this.matAbyssal,
        { x: 1.06, y: 1.02, z: 1.35 },
      );
      panel.position.set(side * 0.025, -0.29, 0.03);
      panel.rotation.x = -0.14;
      panel.rotation.z = side * 0.09;
      pivot.add(panel);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(0.024, 0.56, 0.036),
        this.matAmethystTrim,
      );
      trim.position.set(side * -0.04, -0.29, 0.035);
      trim.rotation.x = -0.14;
      trim.rotation.z = side * 0.09;
      pivot.add(trim);

      return pivot;
    };

    this.frontLeftRobe = buildFrontPanel(-1);
    this.frontRightRobe = buildFrontPanel(1);

    this.backRobePivot = new THREE.Group();
    this.backRobePivot.position.set(0, 0.06, -0.12);
    this.torsoGroup.add(this.backRobePivot);

    const backCoatGeo = new THREE.CylinderGeometry(
      0.18,
      0.36,
      0.78,
      10,
      1,
      true,
      Math.PI * 0.58,
      Math.PI * 0.84,
    );
    const backCoatMat = ToonAssets.createToonMaterial(PALETTE.abyssalCloak, {
      side: THREE.DoubleSide,
    });
    const backCoat = new THREE.Mesh(backCoatGeo, backCoatMat);
    backCoat.position.set(0, -0.37, 0.05);
    backCoat.rotation.x = 0.14;
    backCoat.castShadow = true;
    this.backRobePivot.add(backCoat);

    const hemGeo = new THREE.CylinderGeometry(
      0.34,
      0.365,
      0.055,
      10,
      1,
      true,
      Math.PI * 0.58,
      Math.PI * 0.84,
    );
    const hemMat = ToonAssets.createToonMaterial(PALETTE.amethystTrim, {
      emissive: PALETTE.amethystTrim,
      emissiveIntensity: 0.32,
      side: THREE.DoubleSide,
    });
    const hem = new THREE.Mesh(hemGeo, hemMat);
    hem.position.set(0, -0.73, 0.105);
    hem.rotation.x = 0.14;
    this.backRobePivot.add(hem);
  }

  private buildShoulderMantle(): void {
    const mantleGroup = new THREE.Group();
    mantleGroup.position.set(0, 0.5, 0);
    this.torsoGroup.add(mantleGroup);

    const { group: mantleBase } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.16, 0.34, 0.17, 14),
      this.matAbyssal,
      1.04,
    );
    mantleBase.scale.set(1.18, 1.0, 0.84);
    mantleBase.position.y = -0.02;
    mantleGroup.add(mantleBase);

    const mantleTrim = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.018, 8, 20),
      this.matAmethystTrim,
    );
    mantleTrim.rotation.x = Math.PI / 2;
    mantleTrim.scale.set(1.18, 0.84, 1.0);
    mantleTrim.position.y = -0.095;
    mantleGroup.add(mantleTrim);

    for (const side of [-1, 1] as const) {
      const pauldronGroup = new THREE.Group();
      pauldronGroup.position.set(side * 0.29, 0.01, 0);
      pauldronGroup.rotation.z = -side * 0.28;
      mantleGroup.add(pauldronGroup);

      const { group: plate } = ToonAssets.createOutlinedMesh(
        new THREE.SphereGeometry(
          0.135,
          12,
          10,
          0,
          Math.PI * 2,
          0,
          Math.PI * 0.56,
        ),
        this.matShadowSlate,
        1.06,
      );
      plate.scale.set(1.15, 0.85, 1.12);
      pauldronGroup.add(plate);

      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.025, 0.045),
        this.matAmethystTrim,
      );
      ridge.position.set(side * 0.03, 0.085, 0);
      pauldronGroup.add(ridge);
    }

    const upperCapeGeo = new THREE.CylinderGeometry(
      0.2,
      0.38,
      0.44,
      10,
      1,
      true,
      Math.PI * 0.68,
      Math.PI * 0.64,
    );
    const upperCapeMat = ToonAssets.createToonMaterial(PALETTE.shadowSlate, {
      side: THREE.DoubleSide,
    });
    const upperCape = new THREE.Mesh(upperCapeGeo, upperCapeMat);
    upperCape.position.set(0, -0.22, -0.06);
    upperCape.rotation.x = 0.22;
    upperCape.castShadow = true;
    mantleGroup.add(upperCape);
  }

  private buildRecessedHeadAndDrapedHood(): void {
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.56, 0.01);
    this.torsoGroup.add(this.headGroup);

    // 1. Distinct Anatomical Neck
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.064, 0.078, 0.12, 10),
      this.matCowlShadow,
    );
    neck.position.y = 0.04;
    this.headGroup.add(neck);

    // 2. Tapered Humanoid Head recessed inside deep cowl shadow (#020617)
    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.112, 16, 14),
      this.matCowlShadow,
    );
    skull.scale.set(0.86, 1.02, 0.94);
    skull.position.set(0, 0.175, 0.015);
    this.headGroup.add(skull);

    const jaw = new THREE.Mesh(
      new THREE.ConeGeometry(0.072, 0.1, 10),
      this.matCowlShadow,
    );
    jaw.rotation.x = Math.PI;
    jaw.scale.set(0.95, 1.0, 0.85);
    jaw.position.set(0, 0.105, 0.032);
    this.headGroup.add(jaw);

    // 3. Sharp Glowing Violet-Amethyst Anime Eyes peering beneath the brow
    const buildAnimeEye = (side: -1 | 1): void => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.028 * side, -0.004);
      shape.quadraticCurveTo(0, 0.014, 0.03 * side, 0.008);
      shape.quadraticCurveTo(0.014 * side, -0.009, -0.028 * side, -0.004);

      const eyeGeo = new THREE.ShapeGeometry(shape);
      const eyeMesh = new THREE.Mesh(eyeGeo, this.matEyeGlow);
      eyeMesh.position.set(side * 0.037, 0.172, 0.114);
      eyeMesh.rotation.y = side * 0.24;
      eyeMesh.rotation.z = side * 0.18;
      this.headGroup.add(eyeMesh);

      const coreMesh = new THREE.Mesh(eyeGeo, this.matEyeCore);
      coreMesh.scale.set(0.55, 0.55, 1);
      coreMesh.position.set(side * 0.037, 0.172, 0.117);
      coreMesh.rotation.y = side * 0.24;
      coreMesh.rotation.z = side * 0.18;
      this.headGroup.add(coreMesh);
    };

    buildAnimeEye(-1);
    buildAnimeEye(1);

    // Subtle crimson cheek blush glow shown only in DEFEAT_DIORAMA ("Forced Frost Puppet")
    this.defeatBlushGroup = new THREE.Group();
    this.defeatBlushGroup.visible = false;
    const blushMat = new THREE.MeshBasicMaterial({
      color: PALETTE.blushCrimson,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const side of [-1, 1] as const) {
      const cheek = new THREE.Mesh(
        new THREE.CircleGeometry(0.022, 12),
        blushMat,
      );
      cheek.scale.set(1.35, 0.72, 1);
      cheek.position.set(side * 0.044, 0.145, 0.116);
      cheek.rotation.y = side * 0.28;
      this.defeatBlushGroup.add(cheek);
    }
    this.headGroup.add(this.defeatBlushGroup);

    // Crown anchor for marionette control line & lip anchor for Siphon Kiss alignment
    this.headTopAnchor.position.set(0, 0.34, 0.01);
    this.headGroup.add(this.headTopAnchor);
    this.mouthAnchor.position.set(0, 0.132, 0.118);
    this.headGroup.add(this.mouthAnchor);

    // 4. Rounded Draped Cloth Cowl wrapping naturally around the head
    const cowlGroup = new THREE.Group();
    cowlGroup.position.set(0, 0.175, 0.0);
    this.headGroup.add(cowlGroup);

    const hoodDomeGeo = new THREE.SphereGeometry(
      0.158,
      20,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.68,
    );
    const { group: hoodDome } = ToonAssets.createOutlinedMesh(
      hoodDomeGeo,
      this.matAbyssal,
      1.05,
    );
    hoodDome.scale.set(1.04, 1.06, 1.16);
    hoodDome.rotation.x = 0.22;
    hoodDome.position.set(0, 0.015, -0.015);
    cowlGroup.add(hoodDome);

    const innerCowl = new THREE.Mesh(hoodDomeGeo, this.matHoodInner);
    innerCowl.scale.set(1.01, 1.03, 1.13);
    innerCowl.rotation.x = 0.22;
    innerCowl.position.set(0, 0.015, -0.015);
    cowlGroup.add(innerCowl);

    for (const side of [-1, 1] as const) {
      const cheekGeo = new THREE.CylinderGeometry(0.055, 0.095, 0.24, 10);
      const { group: cheekDrape } = ToonAssets.createOutlinedMesh(
        cheekGeo,
        this.matAbyssal,
        1.055,
      );
      cheekDrape.scale.set(0.65, 1.0, 1.25);
      cheekDrape.position.set(side * 0.122, -0.06, 0.005);
      cheekDrape.rotation.z = side * 0.14;
      cowlGroup.add(cheekDrape);
    }

    const cowlRimGeo = new THREE.TorusGeometry(
      0.148,
      0.022,
      10,
      24,
      Math.PI * 1.22,
    );
    const { group: cowlRim } = ToonAssets.createOutlinedMesh(
      cowlRimGeo,
      this.matAbyssal,
      1.06,
    );
    cowlRim.position.set(0, 0.015, 0.098);
    cowlRim.rotation.z = -Math.PI * 0.11;
    cowlRim.rotation.x = 0.26;
    cowlGroup.add(cowlRim);

    const cowlTrim = new THREE.Mesh(
      new THREE.TorusGeometry(0.149, 0.009, 8, 24, Math.PI * 1.22),
      this.matAmethystTrim,
    );
    cowlTrim.position.set(0, 0.015, 0.114);
    cowlTrim.rotation.z = -Math.PI * 0.11;
    cowlTrim.rotation.x = 0.26;
    cowlGroup.add(cowlTrim);

    // 5. Softly Tapered Hood Tail angling BACKWARD at ~40° behind his neck
    this.hoodTailPivot = new THREE.Group();
    this.hoodTailPivot.position.set(0, 0.075, -0.115);
    this.hoodTailPivot.rotation.x = -Math.PI * 0.72;
    cowlGroup.add(this.hoodTailPivot);

    const { group: tailSeg1 } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.088, 0.122, 0.18, 12),
      this.matAbyssal,
      1.055,
    );
    tailSeg1.scale.set(0.95, 1.0, 0.78);
    tailSeg1.position.y = 0.08;
    this.hoodTailPivot.add(tailSeg1);

    const { group: tailSeg2 } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.044, 0.088, 0.17, 10),
      this.matAbyssal,
      1.06,
    );
    tailSeg2.scale.set(0.9, 1.0, 0.75);
    tailSeg2.position.set(0, 0.23, -0.018);
    tailSeg2.rotation.x = -0.18;
    this.hoodTailPivot.add(tailSeg2);

    const { group: tailTip } = ToonAssets.createOutlinedMesh(
      new THREE.ConeGeometry(0.044, 0.11, 10),
      this.matAbyssal,
      1.065,
    );
    tailTip.scale.set(0.88, 1.0, 0.75);
    tailTip.position.set(0, 0.35, -0.048);
    tailTip.rotation.x = -0.32;
    this.hoodTailPivot.add(tailTip);
  }

  private buildArticulatedArmsAndStaff(): void {
    const buildArm = (side: -1 | 1) => {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(side * 0.285, 0.455, 0);
      this.torsoGroup.add(shoulderPivot);

      const { group: upperArm } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.068, 0.056, 0.28, 10),
        this.matShadowSlate,
        1.07,
      );
      upperArm.position.y = -0.14;
      shoulderPivot.add(upperArm);

      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.28, 0);
      shoulderPivot.add(elbowPivot);

      const { group: sleeve } = ToonAssets.createOutlinedMesh(
        new THREE.CylinderGeometry(0.056, 0.088, 0.25, 10),
        this.matAbyssal,
        1.065,
      );
      sleeve.position.y = -0.125;
      elbowPivot.add(sleeve);

      const cuffBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.084, 0.092, 0.035, 10),
        this.matAmethystTrim,
      );
      cuffBand.position.y = -0.235;
      elbowPivot.add(cuffBand);

      const { group: glove } = ToonAssets.createOutlinedMesh(
        new THREE.BoxGeometry(0.068, 0.095, 0.075),
        this.matDarkMetal,
        1.08,
      );
      glove.position.set(0, -0.29, 0.01);
      elbowPivot.add(glove);

      return { shoulderPivot, elbowPivot };
    };

    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);

    this.leftShoulderPivot = leftArm.shoulderPivot;
    this.leftElbowPivot = leftArm.elbowPivot;
    this.rightShoulderPivot = rightArm.shoulderPivot;
    this.rightElbowPivot = rightArm.elbowPivot;

    this.rightShoulderPivot.rotation.x = -0.32;
    this.rightShoulderPivot.rotation.z = -0.12;
    this.rightElbowPivot.rotation.x = -0.58;

    this.leftShoulderPivot.rotation.z = 0.14;
    this.leftElbowPivot.rotation.x = -0.22;

    this.leftHandAnchor.position.set(0, -0.295, 0.02);
    this.leftElbowPivot.add(this.leftHandAnchor);
    this.rightHandAnchor.position.set(0, -0.295, 0.02);
    this.rightElbowPivot.add(this.rightHandAnchor);

    // Miniature glowing frost-crystals waved in Forced Frost Puppet Defeat Diorama
    const buildPuppetCrystal = (): THREE.Group => {
      const grp = new THREE.Group();
      grp.position.set(0, -0.32, 0.06);
      grp.visible = false;

      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.075, 0),
        new THREE.MeshBasicMaterial({ color: PALETTE.iceHighlights }),
      );
      core.scale.set(0.7, 1.45, 0.7);
      grp.add(core);

      const glow = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        new THREE.MeshBasicMaterial({
          color: PALETTE.frostRunes,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.scale.set(0.7, 1.45, 0.7);
      grp.add(glow);
      return grp;
    };

    this.puppetCrystalLeft = buildPuppetCrystal();
    this.leftElbowPivot.add(this.puppetCrystalLeft);
    this.puppetCrystalRight = buildPuppetCrystal();
    this.rightElbowPivot.add(this.puppetCrystalRight);

    this.buildObsidianSiphonStaff(this.rightElbowPivot);
  }

  private buildObsidianSiphonStaff(handParent: THREE.Group): void {
    const L = ARENA_CONFIG.lighting;
    this.staffGroup = new THREE.Group();
    this.staffGroup.position.set(0, -0.3, 0.04);
    this.staffGroup.rotation.x = Math.PI * 0.44;
    handParent.add(this.staffGroup);

    const { group: shaft } = ToonAssets.createOutlinedMesh(
      new THREE.CylinderGeometry(0.025, 0.019, 2.05, 8),
      this.matDarkMetal,
      { x: 1.24, y: 1.005, z: 1.24 },
    );
    shaft.position.y = 0.25;
    this.staffGroup.add(shaft);

    for (let g = -1; g <= 1; g++) {
      const gripRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.035, 8),
        this.matAmethystTrim,
      );
      gripRing.position.y = g * 0.09;
      this.staffGroup.add(gripRing);
    }

    const { group: ferrule } = ToonAssets.createOutlinedMesh(
      new THREE.ConeGeometry(0.032, 0.22, 6),
      this.matSilverRune,
      1.12,
    );
    ferrule.rotation.x = Math.PI;
    ferrule.position.y = -0.88;
    this.staffGroup.add(ferrule);

    const headBaseY = 1.28;
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.034, 0.14, 8),
      this.matSilverRune,
    );
    collar.position.y = headBaseY;
    this.staffGroup.add(collar);

    for (let p = 0; p < 4; p++) {
      const ang = (p / 4) * Math.PI * 2 + Math.PI / 4;
      const prongPivot = new THREE.Group();
      prongPivot.position.y = headBaseY + 0.05;
      prongPivot.rotation.y = ang;
      this.staffGroup.add(prongPivot);

      const lowerProng = new THREE.Mesh(
        new THREE.BoxGeometry(0.026, 0.19, 0.026),
        this.matDarkMetal,
      );
      lowerProng.position.set(0.082, 0.08, 0);
      lowerProng.rotation.z = -0.36;
      prongPivot.add(lowerProng);

      const upperProng = new THREE.Mesh(
        new THREE.ConeGeometry(0.022, 0.22, 4),
        this.matSilverRune,
      );
      upperProng.position.set(0.105, 0.24, 0);
      upperProng.rotation.z = 0.28;
      prongPivot.add(upperProng);
    }

    this.staffRuneRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.008, 6, 24),
      new THREE.MeshBasicMaterial({
        color: PALETTE.amethystTrim,
        transparent: true,
        opacity: 0.78,
      }),
    );
    this.staffRuneRing.position.y = headBaseY + 0.26;
    this.staffGroup.add(this.staffRuneRing);

    this.staffCrystal = new THREE.Group();
    this.staffCrystal.position.y = headBaseY + 0.26;
    this.staffGroup.add(this.staffCrystal);

    const crystalCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.105, 0),
      this.matCrystal,
    );
    crystalCore.scale.set(0.85, 1.38, 0.85);
    this.staffCrystal.add(crystalCore);

    const crystalAura = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.142, 0),
      this.matCrystalAura,
    );
    crystalAura.scale.set(0.85, 1.38, 0.85);
    this.staffCrystal.add(crystalAura);

    this.staffLight = new THREE.PointLight(
      PALETTE.glowViolet,
      L.staffLightBaseIntensity,
      L.staffLightDistance,
      L.staffLightDecay,
    );
    this.staffLight.position.set(0, 0, 0);
    this.staffCrystal.add(this.staffLight);

    // Encore NG+ Cyan Frost Ring & Secondary Frost PointLight (hidden until encoreTier >= 1)
    this.staffFrostRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.01, 6, 28),
      new THREE.MeshBasicMaterial({
        color: PALETTE.frostRunes,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.staffFrostRing.position.y = headBaseY + 0.26;
    this.staffFrostRing.visible = false;
    this.staffGroup.add(this.staffFrostRing);

    this.staffFrostLight = new THREE.PointLight(
      PALETTE.frostRunes,
      0,
      L.staffLightDistance,
      L.staffLightDecay,
    );
    this.staffCrystal.add(this.staffFrostLight);
  }

  /**
   * Pre-builds the stolen crystalline frost-wing aura & ribbons activated in Encore NG+.
   */
  private buildEncoreFrostWings(): void {
    this.frostWingGroup = new THREE.Group();
    this.frostWingGroup.position.set(0, 0.36, -0.18);
    this.frostWingGroup.visible = false;

    const wingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.frostRunes,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const ribbonMat = new THREE.MeshBasicMaterial({
      color: PALETTE.iceHighlights,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    for (const side of [-1, 1] as const) {
      for (let f = 0; f < 4; f++) {
        const feather = new THREE.Mesh(
          new THREE.ConeGeometry(0.072 - f * 0.01, 0.78 - f * 0.11, 4),
          wingMat,
        );
        feather.scale.set(0.45, 1.0, 0.25);
        feather.position.set(side * (0.28 + f * 0.15), 0.22 - f * 0.12, -0.08);
        feather.rotation.z = -side * (0.58 + f * 0.26);
        feather.rotation.y = side * 0.28;
        this.frostWingGroup.add(feather);
      }

      const frostRibbon = new THREE.Mesh(
        new THREE.PlaneGeometry(0.11, 0.92),
        ribbonMat,
      );
      frostRibbon.position.set(side * 0.34, -0.22, -0.14);
      frostRibbon.rotation.z = side * 0.18;
      frostRibbon.rotation.y = side * 0.22;
      this.frostWingGroup.add(frostRibbon);
    }

    this.torsoGroup.add(this.frostWingGroup);
  }

  public setEncoreFrostWings(enabled: boolean): void {
    this.setEncoreTier(enabled ? Math.max(1, this.encoreTier) : 0);
  }

  /**
   * Equips or upgrades stolen crystalline frost-wings and dual amethyst-and-cyan staff luminance.
   */
  public setEncoreTier(tier: number): void {
    this.encoreTier = Math.max(0, Math.floor(tier));
    const active = this.encoreTier >= 1;

    if (this.frostWingGroup) {
      this.frostWingGroup.visible = active;
      if (active) {
        const wingScale = Math.min(
          NG_PLUS_CONFIG.frostWingMaxScale,
          NG_PLUS_CONFIG.frostWingScaleBase +
            (this.encoreTier - 1) * NG_PLUS_CONFIG.frostWingScalePerTier,
        );
        this.frostWingGroup.scale.setScalar(wingScale);
      }
    }

    if (this.staffFrostRing) {
      this.staffFrostRing.visible = active;
    }

    if (this.staffFrostLight) {
      this.staffFrostLight.intensity = active
        ? ARENA_CONFIG.lighting.staffLightBaseIntensity * 0.75
        : 0;
    }

    this.matCrystalAura.color.setHex(
      active ? PALETTE.frostRunes : PALETTE.pulseLavender,
    );
  }

  public getLeftHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.leftHandAnchor.getWorldPosition(outVec);
  }

  public getRightHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.rightHandAnchor.getWorldPosition(outVec);
  }

  public getHeadTopWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.headTopAnchor.getWorldPosition(outVec);
  }

  public getMouthWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.mouthAnchor.getWorldPosition(outVec);
  }

  /**
   * Preserves true Abyssal Obsidian (#09090B) and Shadow Slate (#18181B) robe colors
   * by clearing any lingering Shadow Blink invulnerability emissive tint.
   */
  public restoreObsidianMaterials(): void {
    this.invulnTimer = 0;
    this.matAbyssal.color.setHex(PALETTE.abyssalCloak);
    this.matAbyssal.emissive.setHex(PALETTE.pureBlack);
    this.matAbyssal.emissiveIntensity = 0.0;

    this.matShadowSlate.color.setHex(PALETTE.shadowSlate);
    this.matShadowSlate.emissive.setHex(PALETTE.pureBlack);
    this.matShadowSlate.emissiveIntensity = 0.0;

    this.matDarkMetal.color.setHex(PALETTE.obsidianTrim);
    this.matDarkMetal.emissive.setHex(PALETTE.pureBlack);
    this.matDarkMetal.emissiveIntensity = 0.0;

    // Keep only royal violet trim glowing subtly
    this.matAmethystTrim.color.setHex(PALETTE.amethystTrim);
    this.matAmethystTrim.emissive.setHex(PALETTE.amethystTrim);
    this.matAmethystTrim.emissiveIntensity = 0.35;
    this.setCameraProximityDistance(CAMERA_CONFIG.playerFadeStartDist + 1);
  }

  /**
   * Plants the Obsidian Siphon Staff upright on the floor beside the Dark Mage during
   * finishers (freeing both hands to wrap around the sovereign), or re-attaches it cleanly
   * back into his right hand at its exact default combat/lobby local transform.
   */
  public setStaffPlanted(
    planted: boolean,
    anchorWorldPos?: THREE.Vector3,
    facingYawRad?: number,
  ): void {
    const cfg = FINISHER_CONFIG;
    if (planted) {
      if (!this.isStaffPlanted || this.staffGroup.parent !== this.scene) {
        this.rightElbowPivot.remove(this.staffGroup);
        this.scene.add(this.staffGroup);
        this.isStaffPlanted = true;
      }
      const anchor = anchorWorldPos ?? this.root.position;
      const yaw = facingYawRad ?? this.root.rotation.y;
      const fwdX = Math.sin(yaw);
      const fwdZ = Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);

      const plantedX =
        anchor.x +
        rightX * cfg.staffPlantedLateralOffset +
        fwdX * cfg.staffPlantedForwardOffset;
      const plantedY =
        anchor.y + cfg.staffPlantedBaseY + cfg.staffFerruleBottomOffsetY;
      const plantedZ =
        anchor.z +
        rightZ * cfg.staffPlantedLateralOffset +
        fwdZ * cfg.staffPlantedForwardOffset;

      this.staffGroup.visible = true;
      this.staffGroup.position.set(plantedX, plantedY, plantedZ);
      this.staffGroup.rotation.order = 'YXZ';
      this.staffGroup.rotation.set(
        cfg.staffPlantedTiltXRad,
        yaw,
        cfg.staffPlantedTiltZRad,
      );
      return;
    }

    if (this.isStaffPlanted || this.staffGroup.parent !== this.rightElbowPivot) {
      this.scene.remove(this.staffGroup);
      this.rightElbowPivot.add(this.staffGroup);
      this.isStaffPlanted = false;
    }
    this.staffGroup.rotation.order = 'XYZ';
    this.staffGroup.position.set(0, -0.3, 0.04);
    this.staffGroup.rotation.set(Math.PI * 0.44, 0, 0);
  }

  /**
   * Restores standard combat staff attachment & hides diorama-only props.
   */
  public resetCombatPose(): void {
    this.finisherPoseState.initialized = false;
    this.restoreObsidianMaterials();
    if (this.defeatBlushGroup) this.defeatBlushGroup.visible = false;
    if (this.puppetCrystalLeft) this.puppetCrystalLeft.visible = false;
    if (this.puppetCrystalRight) this.puppetCrystalRight.visible = false;
    this.setStaffPlanted(false);
    this.staffGroup.visible = true;
    this.bodyPivot.position.set(0, 0.96, 0);
    this.torsoGroup.rotation.set(0, 0, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.leftShoulderPivot.rotation.set(0, 0, 0.14);
    this.leftElbowPivot.rotation.set(-0.22, 0, 0);
    this.rightShoulderPivot.rotation.set(-0.32, 0, -0.12);
    this.rightElbowPivot.rotation.set(-0.58, 0, 0);
  }

  /**
   * Poses the Dark Mage for streamlined 2-pose Arcane Siphon Kiss:
   * - Pose [1] Upright Embrace: left hand tilts sovereign's chin while free right arm wraps waist
   * - Pose [2] Ballroom Dip: deep forward lunge with both free arms cradling dipped waist & back
   * - Exact world-space fixed-pivot lip alignment against bossLipWorldPos (zero air gap)
   */
  public applyFinisherPose(
    poseId: FinisherPoseId,
    drainProgress: number,
    time: number,
    dt = 1 / 60,
    throttleMode: DrainThrottleMode = DRAIN_THROTTLE_MODES.FLOW,
    bossLipWorldPos: THREE.Vector3 | null = null,
    headChoreography?: FinisherHeadChoreography,
    bossFaceNormalWorld: THREE.Vector3 | null = null,
    bossWaistWrapRadius?: number,
  ): void {
    // Guarantee cloak, hood, mantle & robes stay true dark obsidian (never washed purple)
    this.restoreObsidianMaterials();
    const headAnim =
      headChoreography ??
      computeFinisherHeadChoreography(time, drainProgress, throttleMode);

    if (this.defeatBlushGroup) this.defeatBlushGroup.visible = false;
    if (this.puppetCrystalLeft) this.puppetCrystalLeft.visible = false;
    if (this.puppetCrystalRight) this.puppetCrystalRight.visible = false;
    this.staffGroup.visible = true;

    const safeDt = Math.max(0.001, Math.min(dt, 0.05));
    const lerpAlpha =
      1 -
      Math.exp(
        -safeDt / (FINISHER_CONFIG.poseTransitionDurationSec * 0.35),
      );

    const isSurge = throttleMode === DRAIN_THROTTLE_MODES.SURGE;
    const isSavor = throttleMode === DRAIN_THROTTLE_MODES.SAVOR;

    // Waist wrap clearance scaled cleanly to bossWaistWrapRadius so both free hands hug without clipping
    const wrapOffset =
      bossWaistWrapRadius !== undefined
        ? (bossWaistWrapRadius - FINISHER_CONFIG.mikuWaistWrapRadius) * 0.45
        : 0;

    // 1. Target Base Stance for Streamlined 2-Pose Finisher ([1] Upright Embrace / [2] Ballroom Dip)
    // Pose [1] Upright Embrace: staff planted beside him; left gloved hand tilts sovereign's chin,
    // free right arm wraps securely around her waist.
    let targetBodyY = 0.72;
    let targetTorsoX = 0.54;
    let targetTorsoZ = 0;
    let targetHeadX = 0.3;
    let targetHeadZ = 0;
    let targetLeftHipX = 0.08;
    let targetLeftHipZ = -0.06;
    let targetRightHipX = -0.14;
    let targetRightHipZ = 0.06;
    let targetLeftKneeX = 0.24;
    let targetRightKneeX = 0.16;
    let targetLeftShoulderX = -1.16;
    let targetLeftShoulderY = 0.18;
    let targetLeftShoulderZ = 0.34 + wrapOffset * 0.35;
    let targetLeftElbowX = -0.82;
    let targetLeftElbowZ = 0.26;
    let targetRightShoulderX = -0.96;
    let targetRightShoulderY = -0.22;
    let targetRightShoulderZ = -0.36 - wrapOffset;
    let targetRightElbowX = -0.84;
    let targetRightElbowZ = -0.44 + wrapOffset * 0.55;
    const targetStaffRotX = Math.PI * 0.34;
    const targetStaffRotZ = -0.14;

    if (poseId === FINISHER_POSE_IDS.BALLROOM_DIP) {
      // Pose [2] Ballroom Dip: lowered lunging knee bend + deep forward torso/head pitch
      // so mouth locks flush onto ~45° dipped sovereign; both free arms wrap securely around
      // her dipped waist and upper back while the planted staff pulses beside him.
      targetBodyY = 0.78;
      targetLeftHipX = -0.34;
      targetLeftHipZ = -0.08;
      targetRightHipX = 0.24;
      targetRightHipZ = 0.08;
      targetLeftKneeX = 0.68;
      targetRightKneeX = 0.48;
      targetTorsoX = 0.48 + FINISHER_CONFIG.dipMageExtraPitch;
      targetHeadX = 0.24;
      targetLeftShoulderX = -1.42;
      targetLeftShoulderY = 0.26;
      targetLeftShoulderZ = 0.46 + wrapOffset;
      targetLeftElbowX = -0.92;
      targetLeftElbowZ = 0.56 - wrapOffset * 0.6;
      targetRightShoulderX = -1.34;
      targetRightShoulderY = -0.24;
      targetRightShoulderZ = -0.42 - wrapOffset;
      targetRightElbowX = -0.88;
      targetRightElbowZ = -0.48 + wrapOffset * 0.55;
    }

    // Initialize lerp cache from live bone state on first frame (smooth entry from stagger blink)
    const st = this.finisherPoseState;
    if (!st.initialized) {
      st.initialized = true;
      st.bodyY = this.bodyPivot.position.y;
      st.bodyOffsetX = 0;
      st.bodyOffsetZ = 0;
      st.torsoX = this.torsoGroup.rotation.x;
      st.torsoZ = this.torsoGroup.rotation.z;
      st.headX = this.headGroup.rotation.x;
      st.headZ = this.headGroup.rotation.z;
      st.leftHipX = this.leftLegPivot.rotation.x;
      st.leftHipZ = this.leftLegPivot.rotation.z;
      st.rightHipX = this.rightLegPivot.rotation.x;
      st.rightHipZ = this.rightLegPivot.rotation.z;
      st.leftKneeX = this.leftKneePivot.rotation.x;
      st.rightKneeX = this.rightKneePivot.rotation.x;
      st.leftShoulderX = this.leftShoulderPivot.rotation.x;
      st.leftShoulderY = this.leftShoulderPivot.rotation.y;
      st.leftShoulderZ = this.leftShoulderPivot.rotation.z;
      st.leftElbowX = this.leftElbowPivot.rotation.x;
      st.leftElbowZ = this.leftElbowPivot.rotation.z;
      st.rightShoulderX = this.rightShoulderPivot.rotation.x;
      st.rightShoulderY = this.rightShoulderPivot.rotation.y;
      st.rightShoulderZ = this.rightShoulderPivot.rotation.z;
      st.rightElbowX = this.rightElbowPivot.rotation.x;
      st.rightElbowZ = this.rightElbowPivot.rotation.z;
      st.staffRotX = this.staffGroup.rotation.x;
      st.staffRotZ = this.staffGroup.rotation.z;
    }

    st.bodyY = THREE.MathUtils.lerp(st.bodyY, targetBodyY, lerpAlpha);
    st.torsoX = THREE.MathUtils.lerp(st.torsoX, targetTorsoX, lerpAlpha);
    st.torsoZ = THREE.MathUtils.lerp(st.torsoZ, targetTorsoZ, lerpAlpha);
    st.headX = THREE.MathUtils.lerp(st.headX, targetHeadX, lerpAlpha);
    st.headZ = THREE.MathUtils.lerp(st.headZ, targetHeadZ, lerpAlpha);
    st.leftHipX = THREE.MathUtils.lerp(st.leftHipX, targetLeftHipX, lerpAlpha);
    st.leftHipZ = THREE.MathUtils.lerp(st.leftHipZ, targetLeftHipZ, lerpAlpha);
    st.rightHipX = THREE.MathUtils.lerp(st.rightHipX, targetRightHipX, lerpAlpha);
    st.rightHipZ = THREE.MathUtils.lerp(st.rightHipZ, targetRightHipZ, lerpAlpha);
    st.leftKneeX = THREE.MathUtils.lerp(st.leftKneeX, targetLeftKneeX, lerpAlpha);
    st.rightKneeX = THREE.MathUtils.lerp(
      st.rightKneeX,
      targetRightKneeX,
      lerpAlpha,
    );
    st.leftShoulderX = THREE.MathUtils.lerp(
      st.leftShoulderX,
      targetLeftShoulderX,
      lerpAlpha,
    );
    st.leftShoulderY = THREE.MathUtils.lerp(
      st.leftShoulderY,
      targetLeftShoulderY,
      lerpAlpha,
    );
    st.leftShoulderZ = THREE.MathUtils.lerp(
      st.leftShoulderZ,
      targetLeftShoulderZ,
      lerpAlpha,
    );
    st.leftElbowX = THREE.MathUtils.lerp(
      st.leftElbowX,
      targetLeftElbowX,
      lerpAlpha,
    );
    st.leftElbowZ = THREE.MathUtils.lerp(
      st.leftElbowZ,
      targetLeftElbowZ,
      lerpAlpha,
    );
    st.rightShoulderX = THREE.MathUtils.lerp(
      st.rightShoulderX,
      targetRightShoulderX,
      lerpAlpha,
    );
    st.rightShoulderY = THREE.MathUtils.lerp(
      st.rightShoulderY,
      targetRightShoulderY,
      lerpAlpha,
    );
    st.rightShoulderZ = THREE.MathUtils.lerp(
      st.rightShoulderZ,
      targetRightShoulderZ,
      lerpAlpha,
    );
    st.rightElbowX = THREE.MathUtils.lerp(
      st.rightElbowX,
      targetRightElbowX,
      lerpAlpha,
    );
    st.rightElbowZ = THREE.MathUtils.lerp(
      st.rightElbowZ,
      targetRightElbowZ,
      lerpAlpha,
    );
    st.staffRotX = THREE.MathUtils.lerp(st.staffRotX, targetStaffRotX, lerpAlpha);
    st.staffRotZ = THREE.MathUtils.lerp(st.staffRotZ, targetStaffRotZ, lerpAlpha);

    // 2. Siphon-Absorption Breathing, Torso Recoil & Staff-Hand Pulse Synced to Drain Rate
    const siphonFreq = isSurge ? 5.2 : isSavor ? 1.4 : 2.5;
    const siphonPulse = Math.sin(time * siphonFreq);
    const siphonAmp = isSurge ? 1.65 : isSavor ? 0.55 : 1.0;

    const breatheLift = siphonPulse * 0.011 * siphonAmp;
    const torsoDrawPitch = siphonPulse * 0.024 * siphonAmp;
    const staffHandRecoil = Math.cos(time * siphonFreq) * 0.044 * siphonAmp;
    const holdHandCaress = Math.sin(time * (siphonFreq * 0.75)) * 0.026 * siphonAmp;

    this.bodyPivot.position.set(
      st.bodyOffsetX,
      st.bodyY + breatheLift,
      st.bodyOffsetZ,
    );
    this.bodyPivot.rotation.set(0, 0, 0);

    this.leftLegPivot.rotation.set(st.leftHipX, 0, st.leftHipZ);
    this.rightLegPivot.rotation.set(st.rightHipX, 0, st.rightHipZ);
    this.leftKneePivot.rotation.x = st.leftKneeX;
    this.rightKneePivot.rotation.x = st.rightKneeX;

    // Continuous robe & hood-tail billowing synced to siphon turbulence
    const robeSpeed = isSurge ? 4.8 : isSavor ? 1.6 : 2.6;
    const robeAmp = isSurge ? 0.065 : isSavor ? 0.028 : 0.04;
    this.frontLeftRobe.rotation.x = -0.06 + Math.sin(time * robeSpeed) * robeAmp;
    this.frontRightRobe.rotation.x =
      -0.06 + Math.cos(time * robeSpeed) * robeAmp;
    this.backRobePivot.rotation.x =
      0.12 +
      (isSurge ? 0.08 : 0) +
      Math.sin(time * (robeSpeed * 0.9)) * (robeAmp * 1.4);
    this.hoodTailPivot.rotation.x =
      -Math.PI * 0.72 + Math.sin(time * robeSpeed + 0.6) * (robeAmp * 1.6);
    this.hoodTailPivot.rotation.z =
      Math.cos(time * (robeSpeed * 0.72)) * (robeAmp * 1.2);

    // Torso draws gently while head executes asymmetric -> <- press-and-ease choreography:
    // - Same-sign local roll tilts facing heads to opposite world sides (gentle alternating angle)
    // - Positive magePitchNod presses smoothly into each kiss peak and eases on pullback
    // - Inverted local yaw tracks Marina's horizontal nuzzle sway in lockstep
    this.torsoGroup.rotation.set(
      st.torsoX + torsoDrawPitch + (headAnim.pulse - 0.5) * 0.025,
      0,
      st.torsoZ +
        headAnim.roll * 0.2 +
        Math.sin(time * (siphonFreq * 0.5)) * 0.01 * siphonAmp,
    );
    this.headGroup.rotation.set(
      st.headX - torsoDrawPitch * 0.85 + headAnim.magePitchNod,
      -headAnim.yawSway,
      st.headZ + headAnim.roll,
    );

    this.leftShoulderPivot.rotation.set(
      st.leftShoulderX + holdHandCaress,
      st.leftShoulderY,
      st.leftShoulderZ,
    );
    this.leftElbowPivot.rotation.set(
      st.leftElbowX - holdHandCaress * 0.55,
      0,
      st.leftElbowZ,
    );

    this.rightShoulderPivot.rotation.set(
      st.rightShoulderX - (this.isStaffPlanted ? holdHandCaress * 0.85 : staffHandRecoil),
      st.rightShoulderY,
      st.rightShoulderZ,
    );
    this.rightElbowPivot.rotation.set(
      st.rightElbowX + (this.isStaffPlanted ? holdHandCaress * 0.45 : staffHandRecoil * 0.75),
      0,
      st.rightElbowZ,
    );
    if (!this.isStaffPlanted) {
      this.staffGroup.rotation.set(st.staffRotX, 0, st.staffRotZ);
    }

    // 3. Asymmetric -> <- Press-and-Ease Lip Alignment along Marina's World Face Normal
    //    - At pulse = 1 (press peak): target gap = 0.0m (firm lip contact, zero clipping)
    //    - At pulse = 0 (ease phase): target gap = +kissEaseGap (~1.8cm along Marina's dipped face normal)
    if (bossLipWorldPos) {
      this.scratchTargetLipWorld.copy(bossLipWorldPos);
      if (bossFaceNormalWorld) {
        this.scratchTargetLipWorld.addScaledVector(
          bossFaceNormalWorld,
          headAnim.lipSeparationGap,
        );
      }

      this.root.updateMatrixWorld(true);
      this.mouthAnchor.getWorldPosition(this.scratchMouthWorld);
      this.scratchLipDelta.subVectors(
        this.scratchTargetLipWorld,
        this.scratchMouthWorld,
      );

      this.scratchInvQuat.copy(this.root.quaternion).invert();
      this.scratchLipDelta.applyQuaternion(this.scratchInvQuat);

      const maxCorr = FINISHER_CONFIG.lipLockMaxCorrection;
      const corrX = THREE.MathUtils.clamp(
        st.bodyOffsetX + this.scratchLipDelta.x,
        -maxCorr,
        maxCorr,
      );
      const corrY = THREE.MathUtils.clamp(
        this.bodyPivot.position.y + this.scratchLipDelta.y,
        0.54,
        1.08,
      );
      const corrZ = THREE.MathUtils.clamp(
        st.bodyOffsetZ + this.scratchLipDelta.z,
        -maxCorr,
        maxCorr,
      );

      // High responsiveness (0.9) preserves crisp 1.8cm -> <- travel even at 2.5 Hz SURGE
      st.bodyOffsetX = THREE.MathUtils.lerp(st.bodyOffsetX, corrX, 0.9);
      st.bodyOffsetZ = THREE.MathUtils.lerp(st.bodyOffsetZ, corrZ, 0.9);
      this.bodyPivot.position.set(st.bodyOffsetX, corrY, st.bodyOffsetZ);
    }

    // 4. Keep Staff Crystal vibrant while keeping PointLight subtle so obsidian robes stay dark & crisp
    const crystalSpeedMult = isSurge ? 2.4 : isSavor ? 0.65 : 1.0;
    this.staffCrystal.rotation.y =
      time * (2.6 + drainProgress * 4.5) * crystalSpeedMult;
    this.staffCrystal.position.y = 1.54 + Math.sin(time * 3.2) * 0.026;
    this.staffRuneRing.rotation.y =
      -time * (2.2 + drainProgress * 3.5) * crystalSpeedMult;
    this.staffLight.intensity =
      FINISHER_CONFIG.finisherStaffLightIntensity +
      (isSurge ? FINISHER_CONFIG.finisherStaffLightSurgeBoost : 0) +
      siphonPulse * 0.16;
    if (this.staffFrostLight && this.encoreTier >= 1) {
      this.staffFrostLight.intensity = 1.1;
    }
  }

  /**
   * Ranged Umbral Siphon Beam ([R]) stance: keeps the Obsidian Siphon Staff held
   * firmly in his right hand, plants boots wide facing the boss, aims the staff tip
   * forward toward her chest, and applies subtle high-voltage channeling recoil.
   */
  public applyBeamFinisherPose(time: number): void {
    const cfg = SIPHON_BEAM_CONFIG;
    this.finisherPoseState.initialized = false;
    this.restoreObsidianMaterials();
    this.setStaffPlanted(false);
    if (this.defeatBlushGroup) this.defeatBlushGroup.visible = false;
    if (this.puppetCrystalLeft) this.puppetCrystalLeft.visible = false;
    if (this.puppetCrystalRight) this.puppetCrystalRight.visible = false;
    this.staffGroup.visible = true;

    const recoil =
      Math.sin(time * cfg.mageRecoilFreqHz) * cfg.mageRecoilAmpRad;
    const secondary =
      Math.cos(time * (cfg.mageRecoilFreqHz * 0.5)) * cfg.mageRecoilAmpRad * 0.5;

    // Wide braced power stance
    this.bodyPivot.position.set(0, cfg.mageBodyY + secondary * 0.25, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(cfg.mageTorsoPitch + recoil * 0.4, 0, 0);
    this.headGroup.rotation.set(-0.08 - recoil * 0.25, 0, 0);

    this.leftLegPivot.rotation.set(-0.18, 0, -cfg.mageStanceHipSpread);
    this.rightLegPivot.rotation.set(0.16, 0, cfg.mageStanceHipSpread);
    this.leftKneePivot.rotation.x = 0.26;
    this.rightKneePivot.rotation.x = 0.22;

    // Right arm aims the Obsidian Siphon Staff forward toward the boss's chest
    this.rightShoulderPivot.rotation.set(-1.18 + recoil, 0.08, -0.14);
    this.rightElbowPivot.rotation.set(-0.34 - recoil * 0.65, 0, 0.08);
    this.staffGroup.rotation.set(Math.PI * 0.44 + recoil * 0.35, 0, 0);

    // Left arm channels forward-outward to stabilize the arcane current
    this.leftShoulderPivot.rotation.set(-0.88 - recoil * 0.5, 0.16, 0.38);
    this.leftElbowPivot.rotation.set(-0.62 + secondary, 0, 0.24);

    // Robes & hood-tail billow strongly under the siphoning draft
    const billow = Math.sin(time * 8.5) * 0.065;
    this.frontLeftRobe.rotation.x = -0.12 + billow;
    this.frontRightRobe.rotation.x = -0.12 - billow;
    this.backRobePivot.rotation.x = 0.24 + Math.abs(billow);
    this.hoodTailPivot.rotation.x = -Math.PI * 0.72 + 0.14 + billow * 1.4;
    this.hoodTailPivot.rotation.z = secondary * 1.8;

    // Overcharged staff crystal spin & glow
    this.staffCrystal.rotation.y = time * 11.0;
    this.staffCrystal.position.y = 1.54 + Math.sin(time * 9.0) * 0.025;
    this.staffRuneRing.rotation.y = -time * 8.5;
    this.staffLight.intensity =
      FINISHER_CONFIG.finisherStaffLightIntensity +
      FINISHER_CONFIG.finisherStaffLightSurgeBoost * 1.8 +
      Math.sin(time * cfg.beamPulseFreqHz) * 0.35;
    if (this.staffFrostLight && this.encoreTier >= 1) {
      this.staffFrostLight.intensity = 1.4;
    }
  }

  /**
   * Victory Diorama triumphant standing pose gazing down at collapsed Marina.
   */
  public applyVictoryStandPose(time: number): void {
    this.resetCombatPose();
    const breathe = Math.sin(time * 2.0) * 0.016;
    this.bodyPivot.position.y = 0.96 + breathe;
    this.torsoGroup.rotation.x = 0.04;
    this.headGroup.rotation.set(0.28, -0.14, 0);
    this.leftLegPivot.rotation.set(0.04, 0, -0.05);
    this.rightLegPivot.rotation.set(-0.04, 0, 0.05);
    this.leftKneePivot.rotation.x = 0.05;
    this.rightKneePivot.rotation.x = 0.05;
    this.leftShoulderPivot.rotation.set(-0.12, 0, 0.16);
    this.leftElbowPivot.rotation.x = -0.26;
    this.rightShoulderPivot.rotation.set(-0.26, 0, -0.18);
    this.rightElbowPivot.rotation.x = -0.45;
    this.staffGroup.rotation.set(Math.PI * 0.16, 0, 0);
    this.staffCrystal.rotation.y = time * 2.5;
    this.staffRuneRing.rotation.y = -time * 1.9;
    this.staffLight.intensity =
      ARENA_CONFIG.lighting.staffLightBaseIntensity * 1.35;
  }

  /**
   * Defeat Diorama "Forced Frost Puppet" pose: slumped seated on the ice beside his
   * dimmed staff, blushing beneath his cowl, waving glowing frost-crystals in rhythm.
   */
  public applyDefeatedPuppetPose(time: number): void {
    this.restoreObsidianMaterials();
    if (this.defeatBlushGroup) this.defeatBlushGroup.visible = true;
    if (this.puppetCrystalLeft) this.puppetCrystalLeft.visible = true;
    if (this.puppetCrystalRight) this.puppetCrystalRight.visible = true;

    const wave = Math.sin(time * DIORAMA_CONFIG.puppetWaveCadence);
    const waveOpp = Math.cos(time * DIORAMA_CONFIG.puppetWaveCadence);

    // Seated slumped cleanly on the reflective ice floor
    this.bodyPivot.position.y = DIORAMA_CONFIG.puppetMageBodyY;
    this.bodyPivot.rotation.set(-0.1, 0, wave * 0.03);
    this.torsoGroup.rotation.set(0.14, 0, 0);
    this.headGroup.rotation.set(0.18 + waveOpp * 0.06, wave * 0.14, wave * 0.12);

    // Legs splayed seated forward on the ice
    this.leftLegPivot.rotation.set(-1.38, 0, -0.26);
    this.rightLegPivot.rotation.set(-1.38, 0, 0.26);
    this.leftKneePivot.rotation.x = 0.28;
    this.rightKneePivot.rotation.x = 0.28;
    this.frontLeftRobe.rotation.x = -0.82;
    this.frontRightRobe.rotation.x = -0.82;
    this.backRobePivot.rotation.x = 0.42;

    // Marionette-jerked arms waving glowing miniature frost-crystals
    this.leftShoulderPivot.rotation.set(
      -1.28 + wave * DIORAMA_CONFIG.puppetWaveAmp,
      0,
      0.34 + waveOpp * 0.14,
    );
    this.rightShoulderPivot.rotation.set(
      -1.28 - wave * DIORAMA_CONFIG.puppetWaveAmp,
      0,
      -0.34 - waveOpp * 0.14,
    );
    this.leftElbowPivot.rotation.x = -0.58 + wave * 0.22;
    this.rightElbowPivot.rotation.x = -0.58 - wave * 0.22;

    if (this.puppetCrystalLeft) {
      this.puppetCrystalLeft.rotation.y = time * 2.8;
      this.puppetCrystalLeft.position.y =
        -0.32 + Math.sin(time * 3.5) * DIORAMA_CONFIG.puppetCrystalBobAmp * 0.3;
    }
    if (this.puppetCrystalRight) {
      this.puppetCrystalRight.rotation.y = -time * 2.8;
      this.puppetCrystalRight.position.y =
        -0.32 + Math.cos(time * 3.5) * DIORAMA_CONFIG.puppetCrystalBobAmp * 0.3;
    }

    // Dimmed Obsidian Staff resting aside (unplanted & hidden in hand)
    this.setStaffPlanted(false);
    this.staffGroup.visible = false;
    this.staffLight.intensity = 0.15;
    if (this.staffFrostLight) this.staffFrostLight.intensity = 0;
  }

  /**
   * Returns the exact world-space position of the levitating staff crystal for bolt spawning.
   */
  public getStaffCrystalWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    if (this.isStaffPlanted) {
      this.staffGroup.updateMatrixWorld(true);
    } else {
      this.root.updateMatrixWorld(true);
    }
    return this.staffCrystal.getWorldPosition(outVec);
  }

  public triggerCastRecoil(): void {
    this.castRecoil = 1.0;
  }

  public triggerPulseAnim(): void {
    this.pulseAnim = 1.0;
  }

  public triggerInvulnFlash(duration: number): void {
    this.invulnTimer = duration;
  }

  /**
   * Creates a translucent dark-violet posed silhouette clone for Shadow Blink afterimages.
   */
  public createAfterimageMesh(sharedMaterial: THREE.Material): THREE.Group {
    const clone = new THREE.Group();
    clone.position.copy(this.root.position);
    clone.rotation.copy(this.root.rotation);

    this.root.updateMatrixWorld(true);
    const invRoot = new THREE.Matrix4().copy(this.root.matrixWorld).invert();

    this.bodyPivot.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        !child.userData.isOutline &&
        child.parent !== this.frostWingGroup
      ) {
        const ghost = new THREE.Mesh(child.geometry, sharedMaterial);
        ghost.matrixAutoUpdate = false;
        ghost.matrix.multiplyMatrices(invRoot, child.matrixWorld);
        clone.add(ghost);
      }
    });

    return clone;
  }

  /**
   * Updates humanoid stride, breathing idle, cloth sway, crystal levitation, and combat poses.
   */
  public update(
    dt: number,
    elapsed: number,
    moveSpeedRatio: number,
    isDashing: boolean,
  ): void {
    const L = ARENA_CONFIG.lighting;

    const targetBlend = Math.min(1.0, moveSpeedRatio);
    this.speedBlend += (targetBlend - this.speedBlend) * Math.min(1, dt * 11);

    this.castRecoil = Math.max(0, this.castRecoil - dt * 6.5);
    this.pulseAnim = Math.max(0, this.pulseAnim - dt * 2.8);

    const strideRate = isDashing ? 16.0 : 9.8;
    this.stridePhase += dt * strideRate * (0.15 + this.speedBlend * 0.95);

    const sinS = Math.sin(this.stridePhase);
    const cosS = Math.cos(this.stridePhase);
    const strideAmp = this.speedBlend * (isDashing ? 0.85 : 0.62);

    // Pelvis Vertical Bob & Forward Lean
    const idleBreath = Math.sin(elapsed * 2.4) * 0.018;
    const walkBob = Math.abs(sinS) * 0.055 * this.speedBlend;
    this.bodyPivot.position.y = 0.96 + idleBreath + walkBob;
    this.bodyPivot.rotation.x =
      (isDashing ? 0.34 : 0.14 * this.speedBlend) + this.pulseAnim * -0.14;
    this.bodyPivot.rotation.z =
      Math.sin(this.stridePhase) * 0.03 * this.speedBlend;

    // Articulated Leg Swing + Knee Flexion
    const leftHipAngle = sinS * strideAmp;
    const rightHipAngle = -sinS * strideAmp;
    this.leftLegPivot.rotation.x = leftHipAngle;
    this.rightLegPivot.rotation.x = rightHipAngle;

    this.leftKneePivot.rotation.x = Math.max(
      0,
      -cosS * 0.72 * this.speedBlend,
    );
    this.rightKneePivot.rotation.x = Math.max(
      0,
      cosS * 0.72 * this.speedBlend,
    );

    // Split Lower Robes Dynamic Billow
    this.frontLeftRobe.rotation.x =
      Math.min(0, leftHipAngle * 0.65) - 0.06 * this.speedBlend;
    this.frontRightRobe.rotation.x =
      Math.min(0, rightHipAngle * 0.65) - 0.06 * this.speedBlend;
    this.backRobePivot.rotation.x =
      0.06 +
      0.28 * this.speedBlend +
      (isDashing ? 0.42 : 0) +
      Math.sin(elapsed * 3.1) * 0.04;

    // Hood Tail Gentle Wind Sway
    this.hoodTailPivot.rotation.x =
      -Math.PI * 0.72 + Math.sin(elapsed * 2.8) * 0.05 + this.speedBlend * 0.14;
    this.hoodTailPivot.rotation.z = Math.cos(elapsed * 2.1) * 0.04;

    // Head Counter-Stabilization
    this.headGroup.rotation.x = -this.bodyPivot.rotation.x * 0.55;

    // Left Arm Counter-Swing + Umbral Pulse Lift
    this.leftShoulderPivot.rotation.x =
      -sinS * strideAmp * 0.85 - this.pulseAnim * 1.1;
    this.leftShoulderPivot.rotation.z = 0.14 + this.pulseAnim * 0.65;
    this.leftElbowPivot.rotation.x =
      -0.22 - Math.max(0, sinS * 0.45 * this.speedBlend);

    // Right Arm Staff Stance + Stride Sway + Cast Recoil + Pulse Slam
    this.rightShoulderPivot.rotation.x =
      -0.34 +
      sinS * strideAmp * 0.35 -
      this.castRecoil * 0.46 -
      this.pulseAnim * 0.95;
    this.rightShoulderPivot.rotation.z = -0.14 - this.pulseAnim * 0.35;
    this.rightElbowPivot.rotation.x = -0.58 + this.castRecoil * 0.34;

    // Levitating, Rotating Amethyst Crystal & Halo Ring
    this.staffCrystal.rotation.y = elapsed * 2.3;
    this.staffCrystal.rotation.z = Math.sin(elapsed * 1.7) * 0.18;
    this.staffCrystal.position.y = 1.54 + Math.sin(elapsed * 3.4) * 0.032;

    this.staffRuneRing.rotation.x =
      Math.PI * 0.35 + Math.sin(elapsed * 1.5) * 0.25;
    this.staffRuneRing.rotation.y = -elapsed * 1.8;

    if (this.staffFrostRing && this.staffFrostRing.visible) {
      this.staffFrostRing.rotation.x =
        -Math.PI * 0.32 + Math.cos(elapsed * 1.9) * 0.22;
      this.staffFrostRing.rotation.y = elapsed * 2.4;
    }

    // Subtle Encore Frost-Wing Breath
    if (this.frostWingGroup && this.frostWingGroup.visible) {
      const baseScale = Math.min(
        NG_PLUS_CONFIG.frostWingMaxScale,
        NG_PLUS_CONFIG.frostWingScaleBase +
          Math.max(0, this.encoreTier - 1) * NG_PLUS_CONFIG.frostWingScalePerTier,
      );
      this.frostWingGroup.scale.setScalar(
        baseScale * (1.0 + Math.sin(elapsed * 3.2) * 0.045),
      );
    }

    // Calibrated Crystal PointLight Intensity Surge on Cast / Pulse
    const lightBoost =
      this.castRecoil * L.staffLightCastBoost +
      this.pulseAnim * L.staffLightPulseBoost;
    this.staffLight.intensity =
      L.staffLightBaseIntensity +
      Math.sin(elapsed * 4.0) * L.staffLightPulseAmp +
      lightBoost;

    // Shadow Blink Invulnerability Flash
    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
      const flashStrength = Math.sin(this.invulnTimer * 36.0) * 0.5 + 0.5;
      for (let i = 0; i < this.flashMaterials.length; i++) {
        const mat = this.flashMaterials[i];
        if (!mat) continue;
        mat.emissive.setHex(PALETTE.glowViolet);
        mat.emissiveIntensity = 0.25 + flashStrength * 0.75;
      }
    } else {
      for (let i = 0; i < this.flashMaterials.length; i++) {
        const mat = this.flashMaterials[i];
        if (!mat) continue;
        if (mat === this.matAmethystTrim) {
          mat.emissive.setHex(PALETTE.amethystTrim);
          mat.emissiveIntensity = 0.35;
        } else {
          mat.emissive.setHex(PALETTE.pureBlack);
          mat.emissiveIntensity = 0.0;
        }
      }
    }
  }

  public dispose(): void {
    this.setStaffPlanted(false);
    this.scene.remove(this.root);
  }
}
