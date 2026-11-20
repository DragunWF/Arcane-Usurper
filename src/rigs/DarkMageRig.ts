import * as THREE from 'three';
import { ARENA_CONFIG, PALETTE, PLAYER_CONFIG } from '../config/gameConfig';
import { ToonAssets } from '../engine/ToonAssets';

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

  // Optional Encore NG+ Stolen Frost-Wing Aura Group
  private frostWingGroup: THREE.Group | null = null;

  // Animation & Combat Feedback State
  public invulnTimer = 0;
  private stridePhase = 0;
  private speedBlend = 0;
  private castRecoil = 0;
  private pulseAnim = 0;

  private readonly scene: THREE.Scene;
  private readonly flashMaterials: THREE.MeshToonMaterial[] = [];

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
  }

  /**
   * Pre-builds the stolen crystalline frost-wing aura activated in Encore NG+ (hidden by default).
   */
  private buildEncoreFrostWings(): void {
    this.frostWingGroup = new THREE.Group();
    this.frostWingGroup.position.set(0, 0.36, -0.18);
    this.frostWingGroup.visible = false;

    const wingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.frostRunes,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    for (const side of [-1, 1] as const) {
      for (let f = 0; f < 3; f++) {
        const feather = new THREE.Mesh(
          new THREE.ConeGeometry(0.065 - f * 0.01, 0.68 - f * 0.12, 4),
          wingMat,
        );
        feather.scale.set(0.45, 1.0, 0.25);
        feather.position.set(side * (0.28 + f * 0.15), 0.16 - f * 0.11, -0.08);
        feather.rotation.z = -side * (0.65 + f * 0.28);
        feather.rotation.y = side * 0.28;
        this.frostWingGroup.add(feather);
      }
    }

    this.torsoGroup.add(this.frostWingGroup);
  }

  public setEncoreFrostWings(enabled: boolean): void {
    if (this.frostWingGroup) {
      this.frostWingGroup.visible = enabled;
    }
  }

  /**
   * Returns the exact world-space position of the levitating staff crystal for bolt spawning.
   */
  public getStaffCrystalWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
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

    // Subtle Encore Frost-Wing Breath
    if (this.frostWingGroup && this.frostWingGroup.visible) {
      this.frostWingGroup.scale.setScalar(1.0 + Math.sin(elapsed * 3.2) * 0.04);
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
    this.scene.remove(this.root);
  }
}
