import * as THREE from 'three';
import {
  HARMONIC_SERVANT_CONFIG,
  PALETTE,
  SERVANT_ANIM_STATES,
  SERVANT_ARCHETYPES,
  SERVANT_CONFIG,
  type ServantAnimState,
  type ServantArchetype,
} from '../../config/gameConfig';
import { BaseServantRig } from './ServantBase';

/**
 * **Pulse Striker** — Sleek dark-chrome security construct with emerald visor accents
 * wielding a glowing magenta laser-edge baton.
 *
 * - `TELEGRAPH`: Poised sprint crouch drawing the magenta laser-baton back across its hip.
 * - `ATTACK`: High-speed horizontal dash slash sweeping the plasma blade wide across.
 */
export class PulseStrikerRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.PULSE_STRIKER;

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
  private readonly batonGroup = new THREE.Group();
  private readonly batonAuraMeshGroup = new THREE.Group();

  private matObsidian!: THREE.MeshToonMaterial;
  private matDarkChrome!: THREE.MeshToonMaterial;
  private matStageSlate!: THREE.MeshToonMaterial;
  private matVisorEmerald!: THREE.MeshBasicMaterial;
  private matBatonCore!: THREE.MeshBasicMaterial;
  private matBatonAura!: THREE.MeshBasicMaterial;

  private readonly baseHipY = 0.98;

  constructor() {
    super(HARMONIC_SERVANT_CONFIG.PULSE_STRIKER.scale);
    this.root.name = 'PulseStrikerRig';
    this.bodyPivot.position.y = this.baseHipY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildLegs();
    this.buildTorso();
    this.buildVisorHelm();
    this.buildArmsAndLaserBaton();
  }

  protected override getBaseScale(): number {
    return HARMONIC_SERVANT_CONFIG.PULSE_STRIKER.scale;
  }

  private buildMaterials(): void {
    this.matObsidian = this.createToonMat(PALETTE.cyberObsidian, {
      emissive: PALETTE.cyberStageMid,
      emissiveIntensity: 0.16,
    });
    this.matDarkChrome = this.createToonMat(PALETTE.trussChrome, {
      emissive: PALETTE.harmonicEmerald,
      emissiveIntensity: 0.18,
    });
    this.matStageSlate = this.createToonMat(PALETTE.cyberStageMid, {
      emissive: PALETTE.cyberStageDark,
      emissiveIntensity: 0.12,
    });
    this.matVisorEmerald = this.createGlowMat(PALETTE.harmonicEmerald, {
      side: THREE.DoubleSide,
    });
    this.matBatonCore = this.createGlowMat(PALETTE.harmonicMagenta);
    this.matBatonAura = this.createGlowMat(PALETTE.harmonicMagenta, {
      transparent: true,
      opacity: 0.62,
      additive: true,
      side: THREE.DoubleSide,
    });
  }

  private buildLegs(): void {
    const buildLeg = (
      side: -1 | 1,
      hip: THREE.Group,
      knee: THREE.Group,
    ): void => {
      hip.position.set(side * 0.14, -0.02, 0);
      this.bodyPivot.add(hip);

      const { group: thigh } = this.createOutlined(
        new THREE.CylinderGeometry(0.084, 0.068, 0.44, 8),
        this.matObsidian,
        { x: 1.07, y: 1.01, z: 1.07 },
      );
      thigh.position.y = -0.22;
      hip.add(thigh);

      const thighStripe = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.024, 0.3, 0.03)),
        this.matVisorEmerald,
      );
      thighStripe.position.set(side * 0.072, -0.22, 0.03);
      hip.add(thighStripe);

      knee.position.set(0, -0.44, 0);
      hip.add(knee);

      const { group: kneeGuard } = this.createOutlined(
        new THREE.BoxGeometry(0.11, 0.11, 0.12),
        this.matDarkChrome,
        1.06,
      );
      kneeGuard.position.z = 0.04;
      knee.add(kneeGuard);

      const { group: shin } = this.createOutlined(
        new THREE.CylinderGeometry(0.074, 0.056, 0.44, 8),
        this.matStageSlate,
        { x: 1.08, y: 1.01, z: 1.08 },
      );
      shin.position.y = -0.22;
      knee.add(shin);

      const { group: boot } = this.createOutlined(
        new THREE.BoxGeometry(0.115, 0.1, 0.28),
        this.matObsidian,
        1.06,
      );
      boot.position.set(0, -0.46, 0.06);
      knee.add(boot);
    };

    buildLeg(-1, this.leftLegPivot, this.leftKneePivot);
    buildLeg(1, this.rightLegPivot, this.rightKneePivot);
  }

  private buildTorso(): void {
    this.bodyPivot.add(this.torsoGroup);

    const { group: pelvis } = this.createOutlined(
      new THREE.CylinderGeometry(0.155, 0.165, 0.18, 8),
      this.matStageSlate,
      1.05,
    );
    pelvis.scale.set(1.12, 1.0, 0.84);
    pelvis.position.y = 0.04;
    this.torsoGroup.add(pelvis);

    const { group: chest } = this.createOutlined(
      new THREE.CylinderGeometry(0.245, 0.16, 0.46, 8),
      this.matObsidian,
      { x: 1.06, y: 1.02, z: 1.07 },
    );
    chest.scale.set(1.14, 1.0, 0.82);
    chest.position.y = 0.34;
    this.torsoGroup.add(chest);

    // Chrome Tactical Collar & Chest Telemetry Core
    const { group: collar } = this.createOutlined(
      new THREE.TorusGeometry(0.165, 0.032, 6, 12),
      this.matDarkChrome,
      1.06,
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.56;
    this.torsoGroup.add(collar);

    const chestLine = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.26, 0.036, 0.04)),
      this.matVisorEmerald,
    );
    chestLine.position.set(0, 0.41, 0.195);
    this.torsoGroup.add(chestLine);

    const backCore = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.08, 0.24, 0.04)),
      this.matVisorEmerald,
    );
    backCore.position.set(0, 0.36, -0.195);
    this.torsoGroup.add(backCore);

    // Sleek Chrome Belt with Magenta Power Cell
    const { group: belt } = this.createOutlined(
      new THREE.CylinderGeometry(0.175, 0.18, 0.075, 8),
      this.matDarkChrome,
      1.05,
    );
    belt.scale.set(1.14, 1.0, 0.85);
    belt.position.y = 0.11;
    this.torsoGroup.add(belt);
  }

  private buildVisorHelm(): void {
    this.headGroup.position.set(0, 0.59, 0);
    this.torsoGroup.add(this.headGroup);

    const { group: helmet } = this.createOutlined(
      new THREE.SphereGeometry(0.145, 12, 10),
      this.matObsidian,
      1.06,
    );
    helmet.scale.set(0.95, 1.08, 1.12);
    helmet.position.y = 0.18;
    this.headGroup.add(helmet);

    // Wrap-around Glowing Emerald Tactical Visor
    const visorBand = new THREE.Mesh(
      this.trackGeo(
        new THREE.CylinderGeometry(
          0.142,
          0.142,
          0.056,
          12,
          1,
          true,
          -Math.PI * 0.44,
          Math.PI * 0.88,
        ),
      ),
      this.matVisorEmerald,
    );
    visorBand.position.set(0, 0.19, 0.025);
    this.headGroup.add(visorBand);

    // Swept Dark-Chrome Security Antenna Fins
    for (const side of [-1, 1] as const) {
      const { group: fin } = this.createOutlined(
        new THREE.BoxGeometry(0.028, 0.22, 0.09),
        this.matDarkChrome,
        1.07,
      );
      fin.position.set(side * 0.145, 0.24, -0.04);
      fin.rotation.x = -0.45;
      fin.rotation.z = -side * 0.18;
      this.headGroup.add(fin);
    }
  }

  private buildArmsAndLaserBaton(): void {
    const buildArm = (
      side: -1 | 1,
      shoulder: THREE.Group,
      elbow: THREE.Group,
    ): void => {
      shoulder.position.set(side * 0.3, 0.51, 0);
      this.torsoGroup.add(shoulder);

      const { group: pauldron } = this.createOutlined(
        new THREE.BoxGeometry(0.18, 0.13, 0.2),
        this.matDarkChrome,
        1.06,
      );
      pauldron.position.set(side * 0.04, 0.02, 0);
      pauldron.rotation.z = -side * 0.22;
      shoulder.add(pauldron);

      const pauldronTrim = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.17, 0.024, 0.21)),
        this.matVisorEmerald,
      );
      pauldronTrim.position.set(side * 0.04, 0.075, 0);
      pauldronTrim.rotation.z = -side * 0.22;
      shoulder.add(pauldronTrim);

      const { group: upperArm } = this.createOutlined(
        new THREE.CylinderGeometry(0.06, 0.052, 0.31, 8),
        this.matObsidian,
        1.08,
      );
      upperArm.position.y = -0.16;
      shoulder.add(upperArm);

      elbow.position.set(0, -0.31, 0);
      shoulder.add(elbow);

      const { group: forearm } = this.createOutlined(
        new THREE.CylinderGeometry(0.058, 0.05, 0.31, 8),
        this.matStageSlate,
        1.08,
      );
      forearm.position.y = -0.16;
      elbow.add(forearm);
    };

    buildArm(-1, this.leftShoulderPivot, this.leftElbowPivot);
    buildArm(1, this.rightShoulderPivot, this.rightElbowPivot);

    // Compact Wrist Stabilizer Fin on Left Forearm
    const { group: wristGuard } = this.createOutlined(
      new THREE.BoxGeometry(0.04, 0.26, 0.14),
      this.matDarkChrome,
      1.07,
    );
    wristGuard.position.set(-0.07, -0.17, 0.02);
    this.leftElbowPivot.add(wristGuard);

    // Glowing Magenta Laser-Edge Baton in Right Hand
    this.batonGroup.position.set(0.02, -0.33, 0.05);
    this.batonGroup.rotation.x = Math.PI * 0.45;
    this.rightElbowPivot.add(this.batonGroup);

    const { group: hilt } = this.createOutlined(
      new THREE.CylinderGeometry(0.032, 0.03, 0.34, 8),
      this.matObsidian,
      1.1,
    );
    hilt.position.y = -0.02;
    this.batonGroup.add(hilt);

    const { group: emitterGuard } = this.createOutlined(
      new THREE.BoxGeometry(0.11, 0.07, 0.14),
      this.matDarkChrome,
      1.08,
    );
    emitterGuard.position.y = 0.16;
    this.batonGroup.add(emitterGuard);

    // Rigid Spine + Glowing Magenta Laser-Edge Core
    const { group: batonSpine } = this.createOutlined(
      new THREE.BoxGeometry(0.028, 1.38, 0.042),
      this.matObsidian,
      1.06,
    );
    batonSpine.position.set(0, 0.86, -0.02);
    this.batonGroup.add(batonSpine);

    const laserEdge = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.022, 1.44, 0.078)),
      this.matBatonCore,
    );
    laserEdge.position.set(0, 0.88, 0.032);
    this.batonGroup.add(laserEdge);

    // Additive Plasma Slash Aura Sleeve
    this.batonAuraMeshGroup.position.set(0, 0.88, 0.04);
    this.batonGroup.add(this.batonAuraMeshGroup);

    const auraBlade = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.06, 1.54, 0.16)),
      this.matBatonAura,
    );
    this.batonAuraMeshGroup.add(auraBlade);
  }

  protected override updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    const a = this.lerpFactor(dt);
    if (state === SERVANT_ANIM_STATES.DEAD) {
      const d = this.lerpFactor(dt, SERVANT_CONFIG.deadCollapseSpeed);
      this.bodyPivot.position.y = THREE.MathUtils.lerp(
        this.bodyPivot.position.y,
        0.22,
        d,
      );
      this.bodyPivot.rotation.x = THREE.MathUtils.lerp(
        this.bodyPivot.rotation.x,
        -Math.PI * 0.48,
        d,
      );
      this.visualRoot.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.5));
      return;
    }

    let targetBodyY = this.baseHipY;
    let targetBodyZ = 0;
    let targetTorsoX = 0.08;
    let targetTorsoY = 0;
    let targetLShoulderX = -0.32;
    let targetLShoulderZ = 0.2;
    let targetRShoulderX = -0.38;
    let targetRShoulderY = 0;
    let targetRShoulderZ = -0.22;
    let targetLElbowX = -0.54;
    let targetRElbowX = -0.52;
    let targetBatonX = Math.PI * 0.44;
    let targetBatonZ = 0;
    let targetLHip = 0;
    let targetRHip = 0;
    let targetLKnee = 0.1;
    let targetRKnee = 0.1;
    let targetAuraScaleZ = 1.0;

    if (state === SERVANT_ANIM_STATES.MOVE) {
      const stride = Math.sin(phaseTime * SERVANT_CONFIG.vanguardStrideSpeed * 1.15);
      targetBodyY = this.baseHipY - 0.04 + Math.abs(stride) * 0.055;
      targetTorsoX = 0.22;
      targetLHip = stride * 0.62;
      targetRHip = -stride * 0.62;
      targetLKnee = Math.max(0.12, -stride * 0.68);
      targetRKnee = Math.max(0.12, stride * 0.68);
      targetLShoulderX = -0.35 + stride * 0.35;
      targetRShoulderX = 0.26 - stride * 0.14;
      targetRElbowX = -0.36;
      this.matBatonAura.opacity = 0.54;
    } else if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      // Poised low sprint crouch coiling the magenta laser-edge baton back
      targetBodyY = this.baseHipY - HARMONIC_SERVANT_CONFIG.strikerCrouchDropY;
      targetBodyZ = -0.22;
      targetTorsoX = 0.42;
      targetTorsoY = -0.68;
      targetLHip = -0.58;
      targetRHip = 0.46;
      targetLKnee = 0.78;
      targetRKnee = 0.66;
      targetRShoulderX = 0.32;
      targetRShoulderY = -0.45;
      targetRShoulderZ = -0.62;
      targetRElbowX = -0.78;
      targetBatonX = Math.PI * 0.5;
      targetBatonZ = -0.35;
      targetLShoulderX = -0.82;
      targetLElbowX = -0.95;
      targetAuraScaleZ = 1.38;
      this.matBatonAura.opacity = 0.72 + 0.28 * Math.sin(phaseTime * 26);
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // High-speed horizontal dash slash whipping the laser baton wide across
      targetBodyY = this.baseHipY - 0.12;
      targetBodyZ = SERVANT_CONFIG.vanguardLungeForwardZ;
      targetTorsoX = 0.36;
      targetTorsoY = HARMONIC_SERVANT_CONFIG.strikerSlashTorsoTwistY;
      targetLHip = 0.52;
      targetRHip = -0.58;
      targetLKnee = 0.48;
      targetRKnee = 0.18;
      targetRShoulderX = -1.28;
      targetRShoulderY = 0.85;
      targetRShoulderZ = -0.92;
      targetRElbowX = -0.1;
      targetBatonX = Math.PI * 0.52;
      targetBatonZ = 0.65;
      targetLShoulderX = 0.46;
      targetLElbowX = -0.42;
      targetAuraScaleZ = 2.05;
      this.matBatonAura.opacity = 0.98;
    } else {
      const breath = Math.sin(phaseTime * SERVANT_CONFIG.vanguardBreathSpeed);
      targetBodyY = this.baseHipY + breath * 0.02;
      targetTorsoX = 0.08 + breath * 0.025;
      this.matBatonAura.opacity = 0.48 + 0.1 * Math.sin(phaseTime * 5.0);
    }

    this.bodyPivot.position.y = THREE.MathUtils.lerp(
      this.bodyPivot.position.y,
      targetBodyY,
      a,
    );
    this.bodyPivot.position.z = THREE.MathUtils.lerp(
      this.bodyPivot.position.z,
      targetBodyZ,
      a,
    );
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(
      this.torsoGroup.rotation.x,
      targetTorsoX,
      a,
    );
    this.torsoGroup.rotation.y = THREE.MathUtils.lerp(
      this.torsoGroup.rotation.y,
      targetTorsoY,
      a,
    );

    this.leftLegPivot.rotation.x = THREE.MathUtils.lerp(
      this.leftLegPivot.rotation.x,
      targetLHip,
      a,
    );
    this.rightLegPivot.rotation.x = THREE.MathUtils.lerp(
      this.rightLegPivot.rotation.x,
      targetRHip,
      a,
    );
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(
      this.leftKneePivot.rotation.x,
      targetLKnee,
      a,
    );
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(
      this.rightKneePivot.rotation.x,
      targetRKnee,
      a,
    );

    this.leftShoulderPivot.rotation.x = THREE.MathUtils.lerp(
      this.leftShoulderPivot.rotation.x,
      targetLShoulderX,
      a,
    );
    this.leftShoulderPivot.rotation.z = THREE.MathUtils.lerp(
      this.leftShoulderPivot.rotation.z,
      targetLShoulderZ,
      a,
    );
    this.rightShoulderPivot.rotation.x = THREE.MathUtils.lerp(
      this.rightShoulderPivot.rotation.x,
      targetRShoulderX,
      a,
    );
    this.rightShoulderPivot.rotation.y = THREE.MathUtils.lerp(
      this.rightShoulderPivot.rotation.y,
      targetRShoulderY,
      a,
    );
    this.rightShoulderPivot.rotation.z = THREE.MathUtils.lerp(
      this.rightShoulderPivot.rotation.z,
      targetRShoulderZ,
      a,
    );
    this.leftElbowPivot.rotation.x = THREE.MathUtils.lerp(
      this.leftElbowPivot.rotation.x,
      targetLElbowX,
      a,
    );
    this.rightElbowPivot.rotation.x = THREE.MathUtils.lerp(
      this.rightElbowPivot.rotation.x,
      targetRElbowX,
      a,
    );
    this.batonGroup.rotation.x = THREE.MathUtils.lerp(
      this.batonGroup.rotation.x,
      targetBatonX,
      a,
    );
    this.batonGroup.rotation.z = THREE.MathUtils.lerp(
      this.batonGroup.rotation.z,
      targetBatonZ,
      a,
    );
    this.batonAuraMeshGroup.scale.z = THREE.MathUtils.lerp(
      this.batonAuraMeshGroup.scale.z,
      targetAuraScaleZ,
      a,
    );
  }
}
