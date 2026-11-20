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
 * **Tideguard Hoplite** — Atlantean bronze-and-teal armored warrior wearing a crested
 * Corinthian sea-helm and wielding a long golden trident.
 *
 * - `TELEGRAPH`: Low trident-couched stance pulling the golden prongs back to strike.
 * - `ATTACK`: High-speed lunging forward trident thrust with glowing bioluminescent flare.
 */
export class TideguardHopliteRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.TIDEGUARD_HOPLITE;

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
  private readonly tridentGroup = new THREE.Group();
  private readonly tassetFront = new THREE.Group();
  private readonly tassetBack = new THREE.Group();

  private matBronze!: THREE.MeshToonMaterial;
  private matGold!: THREE.MeshToonMaterial;
  private matTealArmor!: THREE.MeshToonMaterial;
  private matCoralCrest!: THREE.MeshToonMaterial;
  private matVisorGlow!: THREE.MeshBasicMaterial;
  private matTridentGlow!: THREE.MeshBasicMaterial;

  private readonly baseHipY = 0.98;

  constructor() {
    super(SUNKEN_SERVANT_CONFIG.TIDEGUARD_HOPLITE.scale);
    this.root.name = 'TideguardHopliteRig';
    this.bodyPivot.position.y = this.baseHipY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildLegs();
    this.buildTorso();
    this.buildCrestedHelm();
    this.buildArmsAndTrident();
  }

  protected override getBaseScale(): number {
    return SUNKEN_SERVANT_CONFIG.TIDEGUARD_HOPLITE.scale;
  }

  private buildMaterials(): void {
    this.matBronze = this.createToonMat(PALETTE.bronzeTrident, {
      emissive: PALETTE.atlanteanGold,
      emissiveIntensity: 0.14,
    });
    this.matGold = this.createToonMat(PALETTE.atlanteanGold, {
      emissive: PALETTE.atlanteanGold,
      emissiveIntensity: 0.28,
    });
    this.matTealArmor = this.createToonMat(PALETTE.seaStoneMid, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.18,
      side: THREE.DoubleSide,
    });
    this.matCoralCrest = this.createToonMat(PALETTE.coralRose, {
      emissive: PALETTE.coralRose,
      emissiveIntensity: 0.28,
    });
    this.matVisorGlow = this.createGlowMat(PALETTE.biolumCyan, {
      side: THREE.DoubleSide,
    });
    this.matTridentGlow = this.createGlowMat(PALETTE.atlanteanGold, {
      transparent: true,
      opacity: 0.85,
      additive: true,
    });
  }

  private buildLegs(): void {
    const buildLeg = (
      side: -1 | 1,
      hip: THREE.Group,
      knee: THREE.Group,
    ): void => {
      hip.position.set(side * 0.145, -0.02, 0);
      this.bodyPivot.add(hip);

      const { group: thigh } = this.createOutlined(
        new THREE.CylinderGeometry(0.092, 0.078, 0.44, 8),
        this.matTealArmor,
        { x: 1.08, y: 1.01, z: 1.08 },
      );
      thigh.position.y = -0.22;
      hip.add(thigh);

      knee.position.set(0, -0.44, 0);
      hip.add(knee);

      const { group: kneeCap } = this.createOutlined(
        new THREE.OctahedronGeometry(0.082, 0),
        this.matGold,
        1.07,
      );
      kneeCap.position.z = 0.04;
      knee.add(kneeCap);

      const { group: greave } = this.createOutlined(
        new THREE.CylinderGeometry(0.084, 0.068, 0.42, 8),
        this.matBronze,
        { x: 1.08, y: 1.01, z: 1.08 },
      );
      greave.position.y = -0.21;
      knee.add(greave);

      const { group: boot } = this.createOutlined(
        new THREE.BoxGeometry(0.125, 0.11, 0.27),
        this.matTealArmor,
        1.06,
      );
      boot.position.set(0, -0.46, 0.05);
      knee.add(boot);
    };

    buildLeg(-1, this.leftLegPivot, this.leftKneePivot);
    buildLeg(1, this.rightLegPivot, this.rightKneePivot);
  }

  private buildTorso(): void {
    this.bodyPivot.add(this.torsoGroup);

    const { group: waist } = this.createOutlined(
      new THREE.CylinderGeometry(0.17, 0.18, 0.2, 8),
      this.matTealArmor,
      1.05,
    );
    waist.scale.set(1.15, 1.0, 0.85);
    waist.position.y = 0.04;
    this.torsoGroup.add(waist);

    const { group: cuirass } = this.createOutlined(
      new THREE.CylinderGeometry(0.25, 0.17, 0.46, 8),
      this.matBronze,
      { x: 1.06, y: 1.02, z: 1.07 },
    );
    cuirass.scale.set(1.15, 1.0, 0.84);
    cuirass.position.y = 0.34;
    this.torsoGroup.add(cuirass);

    // Atlantean Gold Chest Wave Emblem
    const chestGem = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.068, 0)),
      this.matVisorGlow,
    );
    chestGem.position.set(0, 0.38, 0.215);
    this.torsoGroup.add(chestGem);

    const { group: belt } = this.createOutlined(
      new THREE.CylinderGeometry(0.19, 0.195, 0.09, 8),
      this.matGold,
      1.05,
    );
    belt.scale.set(1.15, 1.0, 0.86);
    belt.position.y = 0.11;
    this.torsoGroup.add(belt);

    // Teal & Gold Hoplite Pteruges / Skirt Panels
    this.tassetFront.position.set(0, 0.09, 0.16);
    const { group: frontPanel } = this.createOutlined(
      new THREE.BoxGeometry(0.3, 0.56, 0.03),
      this.matTealArmor,
      1.04,
    );
    frontPanel.position.y = -0.28;
    this.tassetFront.add(frontPanel);
    this.torsoGroup.add(this.tassetFront);

    this.tassetBack.position.set(0, 0.09, -0.16);
    const { group: backPanel } = this.createOutlined(
      new THREE.BoxGeometry(0.38, 0.68, 0.03),
      this.matTealArmor,
      1.04,
    );
    backPanel.position.y = -0.34;
    this.tassetBack.add(backPanel);
    this.torsoGroup.add(this.tassetBack);
  }

  private buildCrestedHelm(): void {
    this.headGroup.position.set(0, 0.6, 0);
    this.torsoGroup.add(this.headGroup);

    const { group: helm } = this.createOutlined(
      new THREE.CylinderGeometry(0.138, 0.156, 0.28, 8),
      this.matBronze,
      1.06,
    );
    helm.position.y = 0.19;
    this.headGroup.add(helm);

    const { group: dome } = this.createOutlined(
      new THREE.SphereGeometry(0.142, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      this.matGold,
      1.05,
    );
    dome.position.y = 0.31;
    this.headGroup.add(dome);

    // Corinthian T-Visor Glow
    const visorH = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.2, 0.04, 0.06)),
      this.matVisorGlow,
    );
    visorH.position.set(0, 0.21, 0.135);
    this.headGroup.add(visorH);

    const visorV = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.045, 0.14, 0.06)),
      this.matVisorGlow,
    );
    visorV.position.set(0, 0.15, 0.138);
    this.headGroup.add(visorV);

    // Sweeping Coral-Rose Hoplite Helm Crest
    const { group: crest } = this.createOutlined(
      new THREE.TorusGeometry(0.16, 0.042, 6, 12, Math.PI * 1.15),
      this.matCoralCrest,
      1.07,
    );
    crest.rotation.y = Math.PI / 2;
    crest.rotation.z = -0.15;
    crest.position.set(0, 0.38, -0.02);
    this.headGroup.add(crest);
  }

  private buildArmsAndTrident(): void {
    const buildArm = (
      side: -1 | 1,
      shoulder: THREE.Group,
      elbow: THREE.Group,
    ): void => {
      shoulder.position.set(side * 0.31, 0.52, 0);
      this.torsoGroup.add(shoulder);

      const { group: pauldron } = this.createOutlined(
        new THREE.SphereGeometry(0.145, 8, 6),
        this.matGold,
        1.07,
      );
      pauldron.scale.set(1.2, 0.8, 1.05);
      pauldron.position.set(side * 0.04, 0.03, 0);
      shoulder.add(pauldron);

      const { group: upperArm } = this.createOutlined(
        new THREE.CylinderGeometry(0.066, 0.056, 0.32, 8),
        this.matTealArmor,
        1.08,
      );
      upperArm.position.y = -0.16;
      shoulder.add(upperArm);

      elbow.position.set(0, -0.32, 0);
      shoulder.add(elbow);

      const { group: vambrace } = this.createOutlined(
        new THREE.CylinderGeometry(0.064, 0.054, 0.32, 8),
        this.matBronze,
        1.08,
      );
      vambrace.position.y = -0.16;
      elbow.add(vambrace);
    };

    buildArm(-1, this.leftShoulderPivot, this.leftElbowPivot);
    buildArm(1, this.rightShoulderPivot, this.rightElbowPivot);

    // Small Round Bronze Hoplite Buckler on Left Forearm
    const { group: buckler } = this.createOutlined(
      new THREE.CylinderGeometry(0.28, 0.28, 0.055, 12),
      this.matBronze,
      1.06,
    );
    buckler.rotation.z = Math.PI / 2;
    buckler.position.set(-0.09, -0.18, 0.08);
    this.leftElbowPivot.add(buckler);

    const bucklerBoss = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.08, 8, 8)),
      this.matVisorGlow,
    );
    bucklerBoss.position.set(-0.125, -0.18, 0.08);
    this.leftElbowPivot.add(bucklerBoss);

    // Long Golden Atlantean Trident in Right Hand
    this.tridentGroup.position.set(0.02, -0.34, 0.06);
    this.tridentGroup.rotation.x = Math.PI * 0.44;
    this.rightElbowPivot.add(this.tridentGroup);

    const { group: shaft } = this.createOutlined(
      new THREE.CylinderGeometry(0.026, 0.026, 2.35, 8),
      this.matBronze,
      { x: 1.25, y: 1.005, z: 1.25 },
    );
    shaft.position.y = 0.48;
    this.tridentGroup.add(shaft);

    const { group: crossbar } = this.createOutlined(
      new THREE.BoxGeometry(0.42, 0.07, 0.06),
      this.matGold,
      1.06,
    );
    crossbar.position.y = 1.66;
    this.tridentGroup.add(crossbar);

    const centerProng = this.createOutlined(
      new THREE.ConeGeometry(0.048, 0.56, 5),
      this.matGold,
      1.08,
    );
    centerProng.group.position.set(0, 1.96, 0);
    this.tridentGroup.add(centerProng.group);

    for (const side of [-1, 1] as const) {
      const { group: sideProng } = this.createOutlined(
        new THREE.ConeGeometry(0.036, 0.44, 5),
        this.matGold,
        1.08,
      );
      sideProng.position.set(side * 0.18, 1.9, 0);
      sideProng.rotation.z = -side * 0.12;
      this.tridentGroup.add(sideProng);
    }

    const prongAura = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.11, 0)),
      this.matTridentGlow,
    );
    prongAura.position.y = 1.72;
    this.tridentGroup.add(prongAura);
  }

  protected override updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    const a = this.lerpFactor(dt);
    let targetBodyY = this.baseHipY;
    let targetBodyZ = 0;
    let targetBodyRotX = 0;
    let targetTorsoX = 0.05;
    let targetTorsoY = 0;
    let targetLShoulderX = -0.35;
    let targetLShoulderZ = 0.18;
    let targetRShoulderX = -0.45;
    let targetRShoulderZ = -0.18;
    let targetLElbowX = -0.58;
    let targetRElbowX = -0.62;
    let targetTridentX = Math.PI * 0.44;
    let targetLHit = 0;
    let targetRHit = 0;
    let targetLKnee = 0.08;
    let targetRKnee = 0.08;

    if (state === SERVANT_ANIM_STATES.DEAD) {
      const d = this.lerpFactor(dt, SERVANT_CONFIG.deadCollapseSpeed);
      this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, 0.24, d);
      this.bodyPivot.rotation.x = THREE.MathUtils.lerp(this.bodyPivot.rotation.x, -Math.PI * 0.48, d);
      this.visualRoot.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.45));
      return;
    }

    if (state === SERVANT_ANIM_STATES.MOVE) {
      const stride = Math.sin(phaseTime * SERVANT_CONFIG.vanguardStrideSpeed);
      targetBodyY = this.baseHipY + Math.abs(stride) * 0.05;
      targetTorsoX = 0.14;
      targetLHit = stride * 0.56;
      targetRHit = -stride * 0.56;
      targetLKnee = Math.max(0.08, -stride * 0.62);
      targetRKnee = Math.max(0.08, stride * 0.62);
      targetRShoulderX = -0.52 - stride * 0.12;
      targetLShoulderX = -0.42 + stride * 0.18;
    } else if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      // Low trident-couched wind-up pulling the golden trident back
      targetBodyY = this.baseHipY - SERVANT_CONFIG.vanguardTelegraphDropY;
      targetBodyZ = -0.22;
      targetTorsoX = 0.34;
      targetTorsoY = -0.42;
      targetLHit = -0.42;
      targetRHit = 0.38;
      targetLKnee = 0.55;
      targetRKnee = 0.48;
      targetRShoulderX = 0.34;
      targetRElbowX = -0.95;
      targetTridentX = Math.PI * 0.5;
      targetLShoulderX = -0.78;
      targetLElbowX = -0.92;
      this.matTridentGlow.opacity = 0.78 + 0.22 * Math.sin(phaseTime * 22);
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // High-speed lunging forward trident thrust
      targetBodyY = this.baseHipY - 0.1;
      targetBodyZ = SERVANT_CONFIG.vanguardLungeForwardZ;
      targetTorsoX = 0.44;
      targetTorsoY = 0.28;
      targetLHit = 0.48;
      targetRHit = -0.52;
      targetLKnee = 0.44;
      targetRKnee = 0.18;
      targetRShoulderX = -1.48;
      targetRElbowX = -0.06;
      targetTridentX = Math.PI * 0.52;
      targetLShoulderX = 0.36;
      targetLElbowX = -0.4;
      this.matTridentGlow.opacity = 1.0;
    } else {
      const breath = Math.sin(phaseTime * SERVANT_CONFIG.vanguardBreathSpeed);
      targetBodyY = this.baseHipY + breath * 0.02;
      targetTorsoX = 0.05 + breath * 0.025;
      this.matTridentGlow.opacity = 0.52;
    }

    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, targetBodyY, a);
    this.bodyPivot.position.z = THREE.MathUtils.lerp(this.bodyPivot.position.z, targetBodyZ, a);
    this.bodyPivot.rotation.x = THREE.MathUtils.lerp(this.bodyPivot.rotation.x, targetBodyRotX, a);
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(this.torsoGroup.rotation.x, targetTorsoX, a);
    this.torsoGroup.rotation.y = THREE.MathUtils.lerp(this.torsoGroup.rotation.y, targetTorsoY, a);

    this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(this.leftLegPivot.rotation.x, targetLHit, a);
    this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(this.rightLegPivot.rotation.x, targetRHit, a);
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(this.leftKneePivot.rotation.x, targetLKnee, a);
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(this.rightKneePivot.rotation.x, targetRKnee, a);

    this.leftShoulderPivot.rotation.x = THREE.MathUtils.lerp(this.leftShoulderPivot.rotation.x, targetLShoulderX, a);
    this.leftShoulderPivot.rotation.z = THREE.MathUtils.lerp(this.leftShoulderPivot.rotation.z, targetLShoulderZ, a);
    this.rightShoulderPivot.rotation.x = THREE.MathUtils.lerp(this.rightShoulderPivot.rotation.x, targetRShoulderX, a);
    this.rightShoulderPivot.rotation.z = THREE.MathUtils.lerp(this.rightShoulderPivot.rotation.z, targetRShoulderZ, a);
    this.leftElbowPivot.rotation.x = THREE.MathUtils.lerp(this.leftElbowPivot.rotation.x, targetLElbowX, a);
    this.rightElbowPivot.rotation.x = THREE.MathUtils.lerp(this.rightElbowPivot.rotation.x, targetRElbowX, a);
    this.tridentGroup.rotation.x = THREE.MathUtils.lerp(this.tridentGroup.rotation.x, targetTridentX, a);

    this.tassetFront.rotation.x = -Math.max(0, targetLHit, targetRHit) * 0.45 - 0.08;
    this.tassetBack.rotation.x = Math.max(0, -targetLHit, -targetRHit) * 0.45 + 0.08;
  }
}
