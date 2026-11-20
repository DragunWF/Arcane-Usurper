import * as THREE from 'three';
import {
  PALETTE,
  SERVANT_ANIM_STATES,
  SERVANT_ARCHETYPES,
  SERVANT_CONFIG,
  type ServantAnimState,
  type ServantArchetype,
} from '../../config/gameConfig';
import { BaseServantRig } from './ServantBase';

/**
 * **Glacial Vanguard** — Proportioned armored frost knight (~1.95m tall) clad in
 * silver-white plate and a royal indigo surcoat, wielding a long crystalline halberd.
 *
 * - `TELEGRAPH`: Poised couched-halberd crouch pulling the blade back to strike.
 * - `ATTACK`: Full forward lunging halberd thrust with glowing crystal blade flare.
 */
export class GlacialVanguardRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.GLACIAL_VANGUARD;

  private readonly bodyPivot = new THREE.Group();
  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftLegPivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();
  private readonly leftKneePivot = new THREE.Group();
  private readonly rightKneePivot = new THREE.Group();
  private readonly leftShoulderPivot = new THREE.Group();
  private readonly rightShoulderPivot = new THREE.Group();
  private readonly leftElbowPivot = new THREE.Group();
  private readonly rightElbowPivot = new THREE.Group();
  private readonly surcoatFront = new THREE.Group();
  private readonly surcoatBack = new THREE.Group();
  private readonly halberdGroup = new THREE.Group();
  private readonly bucklerGroup = new THREE.Group();

  private matPlate!: THREE.MeshToonMaterial;
  private matSilverTrim!: THREE.MeshToonMaterial;
  private matIndigoSurcoat!: THREE.MeshToonMaterial;
  private matSlateJoint!: THREE.MeshToonMaterial;
  private matBladeIce!: THREE.MeshToonMaterial;
  private matVisorGlow!: THREE.MeshBasicMaterial;
  private matHalberdEdge!: THREE.MeshBasicMaterial;

  private readonly baseHipY = 0.98;

  constructor() {
    super(SERVANT_CONFIG.GLACIAL_VANGUARD.scale);
    this.root.name = 'GlacialVanguardRig';
    this.bodyPivot.position.y = this.baseHipY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildLegs();
    this.buildTorsoAndSurcoat();
    this.buildHelm();
    this.buildArmsAndHalberd();
  }

  protected override getBaseScale(): number {
    return SERVANT_CONFIG.GLACIAL_VANGUARD.scale;
  }

  private buildMaterials(): void {
    this.matPlate = this.createToonMat(PALETTE.marinaHair, {
      emissive: PALETTE.frostRunes,
      emissiveIntensity: 0.08,
    });
    this.matSilverTrim = this.createToonMat(PALETTE.silverRune);
    this.matIndigoSurcoat = this.createToonMat(PALETTE.royalIndigo, {
      emissive: PALETTE.sovereignIndigo,
      emissiveIntensity: 0.12,
      side: THREE.DoubleSide,
    });
    this.matSlateJoint = this.createToonMat(PALETTE.shadowSlate);
    this.matBladeIce = this.createToonMat(PALETTE.iceHighlights, {
      emissive: PALETTE.frostRunes,
      emissiveIntensity: 0.42,
    });
    this.matVisorGlow = this.createGlowMat(PALETTE.coldFlame, {
      side: THREE.DoubleSide,
    });
    this.matHalberdEdge = this.createGlowMat(PALETTE.frostRunes, {
      transparent: true,
      opacity: 0.88,
      additive: true,
    });
  }

  private buildLegs(): void {
    const buildLeg = (
      side: -1 | 1,
      hipPivot: THREE.Group,
      kneePivot: THREE.Group,
    ) => {
      hipPivot.position.set(side * 0.145, -0.02, 0);
      this.bodyPivot.add(hipPivot);

      const { group: thigh } = this.createOutlined(
        new THREE.CylinderGeometry(0.095, 0.08, 0.44, 8),
        this.matPlate,
        { x: 1.08, y: 1.01, z: 1.08 },
      );
      thigh.position.y = -0.22;
      hipPivot.add(thigh);

      kneePivot.position.set(0, -0.44, 0);
      hipPivot.add(kneePivot);

      const { group: poleyn } = this.createOutlined(
        new THREE.OctahedronGeometry(0.085, 0),
        this.matSilverTrim,
        1.07,
      );
      poleyn.position.z = 0.04;
      kneePivot.add(poleyn);

      const { group: greave } = this.createOutlined(
        new THREE.CylinderGeometry(0.082, 0.068, 0.42, 8),
        this.matPlate,
        { x: 1.08, y: 1.01, z: 1.08 },
      );
      greave.position.y = -0.21;
      kneePivot.add(greave);

      const { group: sabaton } = this.createOutlined(
        new THREE.BoxGeometry(0.125, 0.11, 0.27),
        this.matSlateJoint,
        1.06,
      );
      sabaton.position.set(0, -0.46, 0.05);
      kneePivot.add(sabaton);
    };

    buildLeg(-1, this.leftLegPivot, this.leftKneePivot);
    buildLeg(1, this.rightLegPivot, this.rightKneePivot);
  }

  private buildTorsoAndSurcoat(): void {
    this.bodyPivot.add(this.torsoGroup);

    const { group: waist } = this.createOutlined(
      new THREE.CylinderGeometry(0.17, 0.18, 0.2, 8),
      this.matSlateJoint,
      1.05,
    );
    waist.scale.set(1.16, 1.0, 0.85);
    waist.position.y = 0.04;
    this.torsoGroup.add(waist);

    const { group: cuirass } = this.createOutlined(
      new THREE.CylinderGeometry(0.25, 0.17, 0.46, 8),
      this.matPlate,
      { x: 1.06, y: 1.02, z: 1.07 },
    );
    cuirass.scale.set(1.15, 1.0, 0.82);
    cuirass.position.y = 0.34;
    this.torsoGroup.add(cuirass);

    // Royal Indigo Tabard Chest Panel + Cyan Chevron Trim
    const tabardChest = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.24, 0.42, 0.04)),
      this.matIndigoSurcoat,
    );
    tabardChest.position.set(0, 0.34, 0.195);
    this.torsoGroup.add(tabardChest);

    const crestGem = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.055, 0)),
      this.matVisorGlow,
    );
    crestGem.position.set(0, 0.4, 0.225);
    this.torsoGroup.add(crestGem);

    // Armored Belt
    const { group: belt } = this.createOutlined(
      new THREE.CylinderGeometry(0.185, 0.19, 0.09, 8),
      this.matSilverTrim,
      1.05,
    );
    belt.scale.set(1.15, 1.0, 0.86);
    belt.position.y = 0.11;
    this.torsoGroup.add(belt);

    // Articulated Front & Back Royal Indigo Surcoat Panels
    this.surcoatFront.position.set(0, 0.09, 0.16);
    const { group: frontCloth } = this.createOutlined(
      new THREE.BoxGeometry(0.28, 0.62, 0.03),
      this.matIndigoSurcoat,
      1.04,
    );
    frontCloth.position.y = -0.31;
    this.surcoatFront.add(frontCloth);
    this.torsoGroup.add(this.surcoatFront);

    this.surcoatBack.position.set(0, 0.09, -0.16);
    const { group: backCloth } = this.createOutlined(
      new THREE.BoxGeometry(0.36, 0.72, 0.03),
      this.matIndigoSurcoat,
      1.04,
    );
    backCloth.position.y = -0.36;
    this.surcoatBack.add(backCloth);
    this.torsoGroup.add(this.surcoatBack);
  }

  private buildHelm(): void {
    this.headGroup.position.set(0, 0.6, 0);
    this.torsoGroup.add(this.headGroup);

    const { group: gorget } = this.createOutlined(
      new THREE.CylinderGeometry(0.11, 0.14, 0.12, 8),
      this.matSlateJoint,
      1.06,
    );
    gorget.position.y = 0.02;
    this.headGroup.add(gorget);

    // Faceted Knight Sallet Helm
    const { group: helmMain } = this.createOutlined(
      new THREE.CylinderGeometry(0.135, 0.155, 0.28, 6),
      this.matPlate,
      1.06,
    );
    helmMain.position.y = 0.19;
    this.headGroup.add(helmMain);

    const { group: helmCrown } = this.createOutlined(
      new THREE.ConeGeometry(0.138, 0.16, 6),
      this.matPlate,
      1.06,
    );
    helmCrown.position.y = 0.4;
    this.headGroup.add(helmCrown);

    // Glowing Cyan Visor Slit
    const visor = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.21, 0.042, 0.06)),
      this.matVisorGlow,
    );
    visor.position.set(0, 0.2, 0.132);
    this.headGroup.add(visor);

    // Swept Ice Plume Crest atop Helm
    const { group: plume } = this.createOutlined(
      new THREE.ConeGeometry(0.05, 0.34, 5),
      this.matIndigoSurcoat,
      1.07,
    );
    plume.rotation.x = -0.65;
    plume.position.set(0, 0.42, -0.14);
    this.headGroup.add(plume);
  }

  private buildArmsAndHalberd(): void {
    const buildArm = (
      side: -1 | 1,
      shoulderPivot: THREE.Group,
      elbowPivot: THREE.Group,
    ) => {
      shoulderPivot.position.set(side * 0.31, 0.52, 0);
      this.torsoGroup.add(shoulderPivot);

      // Angular Frost Pauldron
      const { group: pauldron } = this.createOutlined(
        new THREE.OctahedronGeometry(0.145, 0),
        this.matPlate,
        1.07,
      );
      pauldron.scale.set(1.15, 0.85, 1.05);
      pauldron.position.set(side * 0.04, 0.03, 0);
      shoulderPivot.add(pauldron);

      const { group: upperArm } = this.createOutlined(
        new THREE.CylinderGeometry(0.068, 0.058, 0.32, 8),
        this.matSlateJoint,
        1.08,
      );
      upperArm.position.y = -0.16;
      shoulderPivot.add(upperArm);

      elbowPivot.position.set(0, -0.32, 0);
      shoulderPivot.add(elbowPivot);

      const { group: vambrace } = this.createOutlined(
        new THREE.CylinderGeometry(0.065, 0.055, 0.32, 8),
        this.matPlate,
        1.08,
      );
      vambrace.position.y = -0.16;
      elbowPivot.add(vambrace);

      const { group: gauntlet } = this.createOutlined(
        new THREE.BoxGeometry(0.095, 0.11, 0.11),
        this.matSilverTrim,
        1.07,
      );
      gauntlet.position.y = -0.34;
      elbowPivot.add(gauntlet);
    };

    buildArm(-1, this.leftShoulderPivot, this.leftElbowPivot);
    buildArm(1, this.rightShoulderPivot, this.rightElbowPivot);

    // Compact Frost Arm-Buckler on Left Forearm (toggled by setShieldVisual)
    this.bucklerGroup.position.set(-0.08, -0.18, 0.08);
    const { group: bucklerBody } = this.createOutlined(
      new THREE.CylinderGeometry(0.28, 0.24, 0.06, 6),
      this.matBladeIce,
      1.06,
    );
    bucklerBody.rotation.z = Math.PI / 2;
    this.bucklerGroup.add(bucklerBody);
    this.leftElbowPivot.add(this.bucklerGroup);

    // Long Crystalline Halberd mounted in Right Gauntlet
    this.halberdGroup.position.set(0, -0.34, 0.04);
    this.halberdGroup.rotation.x = Math.PI * 0.44;
    this.rightElbowPivot.add(this.halberdGroup);

    const { group: shaft } = this.createOutlined(
      new THREE.CylinderGeometry(0.026, 0.024, 2.55, 6),
      this.matSlateJoint,
      { x: 1.18, y: 1.0, z: 1.18 },
    );
    shaft.position.y = 0.55;
    this.halberdGroup.add(shaft);

    // Crystalline Spear Point
    const { group: spearTip } = this.createOutlined(
      new THREE.ConeGeometry(0.075, 0.52, 4),
      this.matBladeIce,
      1.07,
    );
    spearTip.position.y = 2.02;
    this.halberdGroup.add(spearTip);

    // Swept Frost Halberd Crescent Axe Blade
    const { group: axeBlade } = this.createOutlined(
      new THREE.BoxGeometry(0.035, 0.48, 0.28),
      this.matBladeIce,
      1.07,
    );
    axeBlade.position.set(0, 1.66, 0.16);
    this.halberdGroup.add(axeBlade);

    // Glowing Energy Edge Aura on Halberd Head
    const edgeGlow = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.14, 0)),
      this.matHalberdEdge,
    );
    edgeGlow.scale.set(0.4, 2.2, 1.2);
    edgeGlow.position.set(0, 1.72, 0.14);
    this.halberdGroup.add(edgeGlow);
  }

  protected override onShieldVisualChanged(active: boolean): void {
    this.bucklerGroup.visible = active;
  }

  protected override updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    const k = this.lerpFactor(dt);
    let targetBodyY = this.baseHipY;
    let targetBodyZ = 0;
    let targetBodyPitch = 0;
    let targetTorsoX = 0;
    let targetTorsoY = 0;
    let targetHeadX = 0;
    let targetLeftHipX = 0;
    let targetRightHipX = 0;
    let targetLeftKneeX = 0.06;
    let targetRightKneeX = 0.06;
    let targetLeftShoulderX = -0.35;
    let targetLeftShoulderZ = 0.2;
    let targetLeftElbowX = -0.6;
    let targetRightShoulderX = -0.52;
    let targetRightShoulderZ = -0.18;
    let targetRightElbowX = -0.75;
    let targetHalberdX = Math.PI * 0.42;

    if (state === SERVANT_ANIM_STATES.IDLE || state === SERVANT_ANIM_STATES.SPAWNING) {
      const breath = Math.sin(phaseTime * SERVANT_CONFIG.vanguardBreathSpeed);
      targetBodyY = this.baseHipY + breath * 0.025;
      targetTorsoX = 0.04 + breath * 0.02;
      targetRightShoulderX = -0.45 + breath * 0.04;
    } else if (state === SERVANT_ANIM_STATES.MOVE) {
      const stride = Math.sin(phaseTime * SERVANT_CONFIG.vanguardStrideSpeed);
      const strideCos = Math.cos(phaseTime * SERVANT_CONFIG.vanguardStrideSpeed);
      targetBodyY = this.baseHipY + Math.abs(strideCos) * 0.055;
      targetTorsoX = 0.12;
      targetTorsoY = stride * 0.12;
      targetLeftHipX = stride * 0.56;
      targetRightHipX = -stride * 0.56;
      targetLeftKneeX = Math.max(0.05, -stride * 0.65);
      targetRightKneeX = Math.max(0.05, stride * 0.65);
      targetLeftShoulderX = -0.42 - stride * 0.28;
      targetRightShoulderX = -0.55 + stride * 0.18;
      targetHalberdX = Math.PI * 0.46;
    } else if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      // Poised couched-halberd crouch coiling for a lethal thrust
      const quiver = Math.sin(phaseTime * 24) * 0.025;
      targetBodyY = this.baseHipY - SERVANT_CONFIG.vanguardTelegraphDropY;
      targetBodyZ = -0.18;
      targetTorsoX = 0.28;
      targetTorsoY = -0.48;
      targetHeadX = -0.18;
      targetLeftHipX = -0.52;
      targetLeftKneeX = 0.72;
      targetRightHipX = 0.34;
      targetRightKneeX = 0.42;
      targetLeftShoulderX = -0.95;
      targetLeftShoulderZ = -0.22;
      targetLeftElbowX = -0.52;
      targetRightShoulderX = 0.42 + quiver;
      targetRightShoulderZ = -0.28;
      targetRightElbowX = -1.35;
      targetHalberdX = Math.PI * 0.54;
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // Full forward lunging thrust
      targetBodyY = this.baseHipY - 0.12;
      targetBodyZ = SERVANT_CONFIG.vanguardLungeForwardZ;
      targetTorsoX = 0.36;
      targetTorsoY = 0.38;
      targetHeadX = -0.22;
      targetLeftHipX = -0.68;
      targetLeftKneeX = 0.65;
      targetRightHipX = 0.55;
      targetRightKneeX = 0.22;
      targetLeftShoulderX = -0.35;
      targetLeftShoulderZ = 0.45;
      targetLeftElbowX = -0.35;
      targetRightShoulderX = -1.48;
      targetRightShoulderZ = -0.05;
      targetRightElbowX = -0.12;
      targetHalberdX = Math.PI * 0.5;
    } else if (state === SERVANT_ANIM_STATES.GUARD_BROKEN) {
      const wobble = Math.sin(phaseTime * 8.5) * 0.08;
      targetBodyY = this.baseHipY - 0.14;
      targetBodyZ = -0.22;
      targetTorsoX = -0.3 + wobble;
      targetHeadX = -0.26;
      targetLeftShoulderX = -0.2;
      targetLeftShoulderZ = 0.95;
      targetLeftElbowX = -0.25;
      targetRightShoulderX = -0.15;
      targetRightShoulderZ = -0.95;
      targetRightElbowX = -0.25;
    } else if (state === SERVANT_ANIM_STATES.DEAD) {
      targetBodyY = 0.18;
      targetBodyPitch = Math.PI * 0.46;
      targetLeftShoulderZ = 0.85;
      targetRightShoulderZ = -0.85;
    }

    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, targetBodyY, k);
    this.bodyPivot.position.z = THREE.MathUtils.lerp(this.bodyPivot.position.z, targetBodyZ, k);
    this.bodyPivot.rotation.x = THREE.MathUtils.lerp(this.bodyPivot.rotation.x, targetBodyPitch, k);
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(this.torsoGroup.rotation.x, targetTorsoX, k);
    this.torsoGroup.rotation.y = THREE.MathUtils.lerp(this.torsoGroup.rotation.y, targetTorsoY, k);
    this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, targetHeadX, k);
    this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, targetLeftHipX, k);
    this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, targetRightHipX, k);
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(this.leftKneePivot.rotation.x, targetLeftKneeX, k);
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(this.rightKneePivot.rotation.x, targetRightKneeX, k);
    this.leftShoulderPivot.rotation.x = THREE.MathUtils.lerp(this.leftShoulderPivot.rotation.x, targetLeftShoulderX, k);
    this.leftShoulderPivot.rotation.z = THREE.MathUtils.lerp(this.leftShoulderPivot.rotation.z, targetLeftShoulderZ, k);
    this.leftElbowPivot.rotation.x = THREE.MathUtils.lerp(this.leftElbowPivot.rotation.x, targetLeftElbowX, k);
    this.rightShoulderPivot.rotation.x = THREE.MathUtils.lerp(this.rightShoulderPivot.rotation.x, targetRightShoulderX, k);
    this.rightShoulderPivot.rotation.z = THREE.MathUtils.lerp(this.rightShoulderPivot.rotation.z, targetRightShoulderZ, k);
    this.rightElbowPivot.rotation.x = THREE.MathUtils.lerp(this.rightElbowPivot.rotation.x, targetRightElbowX, k);
    this.halberdGroup.rotation.x = THREE.MathUtils.lerp(this.halberdGroup.rotation.x, targetHalberdX, k);

    // Surcoat secondary sway
    const clothSway = Math.sin(phaseTime * 3.8) * 0.05;
    this.surcoatFront.rotation.x = THREE.MathUtils.lerp(
      this.surcoatFront.rotation.x,
      -Math.max(0, targetLeftHipX, targetRightHipX) * 0.45 + clothSway,
      k,
    );
    this.surcoatBack.rotation.x = THREE.MathUtils.lerp(
      this.surcoatBack.rotation.x,
      0.14 + Math.abs(targetTorsoX) * 0.35 - clothSway,
      k,
    );

    // Flare halberd edge glow during telegraph/attack
    const isStrike =
      state === SERVANT_ANIM_STATES.TELEGRAPH ||
      state === SERVANT_ANIM_STATES.ATTACK;
    this.matHalberdEdge.opacity = isStrike
      ? 0.95
      : state === SERVANT_ANIM_STATES.DEAD
        ? 0.0
        : 0.42;
  }
}
