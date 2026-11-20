import * as THREE from 'three';
import {
  PALETTE,
  SERVANT_ANIM_STATES,
  SERVANT_ARCHETYPES,
  SERVANT_CONFIG,
  SUNKEN_SERVANT_CONFIG,
  type ServantAnimState,
  type ServantArchetype,
} from '../../config/gameConfig';
import { BaseServantRig } from './ServantBase';

/**
 * **Coral Bastion** — Towering shell-and-coral Atlantean sentinel (`~1.36x` player height)
 * carrying a scalloped pearl tower-shield on its left arm and a heavy bronze anchor-mace
 * in its right hand.
 *
 * - `TELEGRAPH`: Hoists the heavy bronze anchor-mace high overhead.
 * - `ATTACK`: Slams the anchor-mace into the flooded floor to erupt boiling geysers.
 * - `GUARD_BROKEN`: Drops its shattered pearl tower-shield (`setShieldVisual(false)`) and reels back.
 */
export class CoralBastionRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.CORAL_BASTION;

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
  private readonly pearlShieldGroup = new THREE.Group();
  private readonly anchorMaceGroup = new THREE.Group();

  private matShellStone!: THREE.MeshToonMaterial;
  private matCoralArmor!: THREE.MeshToonMaterial;
  private matBronze!: THREE.MeshToonMaterial;
  private matGoldTrim!: THREE.MeshToonMaterial;
  private matPearlShield!: THREE.MeshToonMaterial;
  private matShieldRim!: THREE.MeshBasicMaterial;
  private matVisorGlow!: THREE.MeshBasicMaterial;

  private readonly baseHipY = 0.96;

  constructor() {
    super(SUNKEN_SERVANT_CONFIG.CORAL_BASTION.scale);
    this.root.name = 'CoralBastionRig';
    this.bodyPivot.position.y = this.baseHipY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildHeavyLegs();
    this.buildShellCoralTorso();
    this.buildSentinelHelm();
    this.buildArmsShieldAndAnchorMace();
  }

  protected override getBaseScale(): number {
    return SUNKEN_SERVANT_CONFIG.CORAL_BASTION.scale;
  }

  private buildMaterials(): void {
    this.matShellStone = this.createToonMat(PALETTE.seaStoneMid, {
      emissive: PALETTE.abyssalTeal,
      emissiveIntensity: 0.14,
    });
    this.matCoralArmor = this.createToonMat(PALETTE.coralRose, {
      emissive: PALETTE.coralRose,
      emissiveIntensity: 0.28,
    });
    this.matBronze = this.createToonMat(PALETTE.bronzeTrident, {
      emissive: PALETTE.atlanteanGold,
      emissiveIntensity: 0.16,
    });
    this.matGoldTrim = this.createToonMat(PALETTE.atlanteanGold, {
      emissive: PALETTE.atlanteanGold,
      emissiveIntensity: 0.3,
    });
    this.matPearlShield = this.createToonMat(PALETTE.pearlWhite, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.42,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    this.matShieldRim = this.createGlowMat(PALETTE.atlanteanGold);
    this.matVisorGlow = this.createGlowMat(PALETTE.biolumCyan);
  }

  private buildHeavyLegs(): void {
    const buildPillarLeg = (
      side: -1 | 1,
      hip: THREE.Group,
      knee: THREE.Group,
    ): void => {
      hip.position.set(side * 0.21, -0.02, 0);
      this.bodyPivot.add(hip);

      const { group: thigh } = this.createOutlined(
        new THREE.CylinderGeometry(0.14, 0.12, 0.42, 8),
        this.matShellStone,
        1.07,
      );
      thigh.position.y = -0.21;
      hip.add(thigh);

      knee.position.set(0, -0.42, 0);
      hip.add(knee);

      const { group: kneeShell } = this.createOutlined(
        new THREE.SphereGeometry(0.12, 8, 6),
        this.matCoralArmor,
        1.06,
      );
      kneeShell.position.z = 0.05;
      knee.add(kneeShell);

      const { group: greave } = this.createOutlined(
        new THREE.CylinderGeometry(0.13, 0.15, 0.42, 8),
        this.matBronze,
        1.06,
      );
      greave.position.y = -0.22;
      knee.add(greave);

      const { group: boot } = this.createOutlined(
        new THREE.BoxGeometry(0.21, 0.14, 0.34),
        this.matShellStone,
        1.06,
      );
      boot.position.set(0, -0.45, 0.06);
      knee.add(boot);
    };

    buildPillarLeg(-1, this.leftLegPivot, this.leftKneePivot);
    buildPillarLeg(1, this.rightLegPivot, this.rightKneePivot);
  }

  private buildShellCoralTorso(): void {
    this.bodyPivot.add(this.torsoGroup);

    const { group: abdomen } = this.createOutlined(
      new THREE.CylinderGeometry(0.25, 0.28, 0.24, 8),
      this.matShellStone,
      1.05,
    );
    abdomen.scale.set(1.2, 1.0, 0.88);
    abdomen.position.y = 0.08;
    this.torsoGroup.add(abdomen);

    const { group: chest } = this.createOutlined(
      new THREE.CylinderGeometry(0.39, 0.27, 0.54, 8),
      this.matBronze,
      1.05,
    );
    chest.scale.set(1.18, 1.0, 0.88);
    chest.position.y = 0.42;
    this.torsoGroup.add(chest);

    // Glowing Pearl Core inset in the Chestplate
    const corePearl = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.115, 10, 10)),
      this.matVisorGlow,
    );
    corePearl.position.set(0, 0.46, 0.33);
    this.torsoGroup.add(corePearl);

    // Sculpted Scalloped Shell Mantle on Back
    const { group: shellBack } = this.createOutlined(
      new THREE.SphereGeometry(0.46, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
      this.matCoralArmor,
      1.05,
    );
    shellBack.rotation.x = -Math.PI * 0.42;
    shellBack.position.set(0, 0.42, -0.22);
    this.torsoGroup.add(shellBack);
  }

  private buildSentinelHelm(): void {
    this.headGroup.position.set(0, 0.72, 0);
    this.torsoGroup.add(this.headGroup);

    const { group: helm } = this.createOutlined(
      new THREE.CylinderGeometry(0.16, 0.185, 0.3, 8),
      this.matShellStone,
      1.06,
    );
    helm.position.y = 0.15;
    this.headGroup.add(helm);

    const visor = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.24, 0.055, 0.06)),
      this.matVisorGlow,
    );
    visor.position.set(0, 0.17, 0.165);
    this.headGroup.add(visor);

    // Coral Antler Spires crowning the Sentinel Helm
    for (const side of [-1, 1] as const) {
      const { group: coralHorn } = this.createOutlined(
        new THREE.ConeGeometry(0.062, 0.34, 5),
        this.matCoralArmor,
        1.08,
      );
      coralHorn.position.set(side * 0.17, 0.32, 0);
      coralHorn.rotation.z = -side * 0.48;
      this.headGroup.add(coralHorn);
    }
  }

  private buildArmsShieldAndAnchorMace(): void {
    const buildArm = (
      side: -1 | 1,
      shoulder: THREE.Group,
      elbow: THREE.Group,
    ): void => {
      shoulder.position.set(side * 0.46, 0.62, 0);
      this.torsoGroup.add(shoulder);

      const { group: pauldron } = this.createOutlined(
        new THREE.SphereGeometry(0.22, 8, 6),
        this.matCoralArmor,
        1.06,
      );
      pauldron.scale.set(1.25, 0.9, 1.1);
      pauldron.position.set(side * 0.06, 0.06, 0);
      shoulder.add(pauldron);

      const { group: upperArm } = this.createOutlined(
        new THREE.CylinderGeometry(0.11, 0.095, 0.36, 8),
        this.matShellStone,
        1.07,
      );
      upperArm.position.y = -0.18;
      shoulder.add(upperArm);

      elbow.position.set(0, -0.36, 0);
      shoulder.add(elbow);

      const { group: forearm } = this.createOutlined(
        new THREE.CylinderGeometry(0.105, 0.095, 0.36, 8),
        this.matBronze,
        1.07,
      );
      forearm.position.y = -0.18;
      elbow.add(forearm);
    };

    buildArm(-1, this.leftShoulderPivot, this.leftElbowPivot);
    buildArm(1, this.rightShoulderPivot, this.rightElbowPivot);

    // Scalloped Pearl Tower-Shield on Left Arm (hidden via setShieldVisual(false) during GUARD_BROKEN)
    this.pearlShieldGroup.position.set(-0.14, -0.18, 0.22);
    this.leftElbowPivot.add(this.pearlShieldGroup);

    const shieldDisc = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.7, 0.7, 0.09, 12)),
      this.matPearlShield,
    );
    shieldDisc.rotation.x = Math.PI / 2;
    shieldDisc.scale.set(0.88, 1.0, 1.32);
    shieldDisc.castShadow = true;
    this.pearlShieldGroup.add(shieldDisc);

    const shieldRim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.69, 0.052, 6, 12)),
      this.matShieldRim,
    );
    shieldRim.scale.set(0.88, 1.32, 1.0);
    this.pearlShieldGroup.add(shieldRim);

    // Scalloped Gold Flutes radiating across the Pearl Tower-Shield
    const fluteGeo = this.trackGeo(new THREE.BoxGeometry(0.06, 0.65, 0.06));
    for (let f = -2; f <= 2; f++) {
      const flute = new THREE.Mesh(fluteGeo, this.matGoldTrim);
      flute.position.set(f * 0.16, 0.12, 0.06);
      flute.rotation.z = -f * 0.16;
      this.pearlShieldGroup.add(flute);
    }

    const shieldPearlCore = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.16, 10, 10)),
      this.matVisorGlow,
    );
    shieldPearlCore.position.set(0, -0.04, 0.08);
    this.pearlShieldGroup.add(shieldPearlCore);

    // Heavy Bronze Anchor-Mace in Right Hand
    this.anchorMaceGroup.position.set(0, -0.38, 0.06);
    this.anchorMaceGroup.rotation.x = Math.PI * 0.45;
    this.rightElbowPivot.add(this.anchorMaceGroup);

    const { group: shaft } = this.createOutlined(
      new THREE.CylinderGeometry(0.052, 0.045, 1.85, 8),
      this.matBronze,
      1.08,
    );
    shaft.position.y = 0.54;
    this.anchorMaceGroup.add(shaft);

    // Anchor Stock Crossbar & Twin Heavy Fluke Blades
    const { group: stock } = this.createOutlined(
      new THREE.BoxGeometry(0.62, 0.12, 0.12),
      this.matGoldTrim,
      1.06,
    );
    stock.position.y = 1.08;
    this.anchorMaceGroup.add(stock);

    const { group: anchorCrown } = this.createOutlined(
      new THREE.TorusGeometry(0.36, 0.095, 6, 12, Math.PI),
      this.matBronze,
      1.06,
    );
    anchorCrown.rotation.z = Math.PI;
    anchorCrown.position.y = 1.48;
    this.anchorMaceGroup.add(anchorCrown);

    for (const side of [-1, 1] as const) {
      const { group: fluke } = this.createOutlined(
        new THREE.ConeGeometry(0.14, 0.36, 4),
        this.matGoldTrim,
        1.07,
      );
      fluke.position.set(side * 0.38, 1.38, 0);
      fluke.rotation.z = side * 0.42;
      this.anchorMaceGroup.add(fluke);
    }
  }

  protected override onShieldVisualChanged(active: boolean): void {
    this.pearlShieldGroup.visible = active;
  }

  protected override updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    const a = this.lerpFactor(dt);
    if (state === SERVANT_ANIM_STATES.DEAD) {
      const d = this.lerpFactor(dt, SERVANT_CONFIG.deadCollapseSpeed);
      this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, 0.28, d);
      this.bodyPivot.rotation.x = THREE.MathUtils.lerp(this.bodyPivot.rotation.x, -Math.PI * 0.48, d);
      this.visualRoot.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.4));
      return;
    }

    let targetBodyY = this.baseHipY;
    let targetTorsoX = 0.04;
    let targetLShoulderX = -0.58;
    let targetLShoulderZ = 0.12;
    let targetRShoulderX = -0.45;
    let targetRShoulderZ = -0.18;
    let targetLElbowX = -0.42;
    let targetRElbowX = -0.45;
    let targetLHip = 0;
    let targetRHip = 0;
    let targetLKnee = 0.1;
    let targetRKnee = 0.1;

    if (state === SERVANT_ANIM_STATES.MOVE) {
      const stride = Math.sin(phaseTime * SERVANT_CONFIG.wardenStrideSpeed);
      targetBodyY = this.baseHipY + Math.abs(stride) * 0.045;
      targetTorsoX = 0.12;
      targetLHip = stride * 0.42;
      targetRHip = -stride * 0.42;
      targetLKnee = Math.max(0.1, -stride * 0.46);
      targetRKnee = Math.max(0.1, stride * 0.46);
    } else if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      // Hoist heavy bronze anchor-mace high overhead
      targetTorsoX = -0.18;
      targetRShoulderX = SERVANT_CONFIG.wardenTelegraphArmX;
      targetRElbowX = -0.22;
      targetLShoulderX = -0.82;
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // Slam anchor-mace violently down to trigger boiling floor geysers
      targetTorsoX = 0.44;
      targetRShoulderX = SERVANT_CONFIG.wardenSlamArmX;
      targetRElbowX = -0.08;
      targetLShoulderX = -0.32;
    } else if (state === SERVANT_ANIM_STATES.GUARD_BROKEN) {
      // Reel backward staggered with pearl tower-shield shattered
      targetTorsoX = SERVANT_CONFIG.wardenGuardBreakLeanX;
      targetLShoulderX = -0.18;
      targetLShoulderZ = 0.85;
      targetRShoulderX = -0.12;
      targetRShoulderZ = -0.55;
      targetBodyY = this.baseHipY - 0.06;
    } else {
      const breath = Math.sin(phaseTime * SERVANT_CONFIG.wardenBreathSpeed);
      targetBodyY = this.baseHipY + breath * 0.018;
      targetTorsoX = 0.04 + breath * 0.02;
    }

    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, targetBodyY, a);
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(this.torsoGroup.rotation.x, targetTorsoX, a);
    this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, targetLHip, a);
    this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, targetRHip, a);
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(this.leftKneePivot.rotation.x, targetLKnee, a);
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(this.rightKneePivot.rotation.x, targetRKnee, a);
    this.leftShoulderPivot.rotation.x = THREE.MathUtils.lerp(this.leftShoulderPivot.rotation.x, targetLShoulderX, a);
    this.leftShoulderPivot.rotation.z = THREE.MathUtils.lerp(this.leftShoulderPivot.rotation.z, targetLShoulderZ, a);
    this.rightShoulderPivot.rotation.x = THREE.MathUtils.lerp(this.rightShoulderPivot.rotation.x, targetRShoulderX, a);
    this.rightShoulderPivot.rotation.z = THREE.MathUtils.lerp(this.rightShoulderPivot.rotation.z, targetRShoulderZ, a);
    this.leftElbowPivot.rotation.x = THREE.MathUtils.lerp(this.leftElbowPivot.rotation.x, targetLElbowX, a);
    this.rightElbowPivot.rotation.x = THREE.MathUtils.lerp(this.rightElbowPivot.rotation.x, targetRElbowX, a);
  }
}
