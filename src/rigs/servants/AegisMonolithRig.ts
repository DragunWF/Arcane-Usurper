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
 * **Aegis Monolith** — Towering obsidian-and-emerald bouncer sentinel (`~1.36x` player height)
 * carrying a geometric hard-light tower-shield on its left arm and a heavy tuning-hammer
 * in its right hand.
 *
 * - `TELEGRAPH`: Hoists the heavy tuning-hammer high overhead charging its bass-resonator core.
 * - `ATTACK`: Slams the stage deck to trigger circular bass-drop shockwaves.
 * - `GUARD_BROKEN`: Shatters/drops its hard-light tower-shield (`setShieldVisual(false)`) and reels back.
 */
export class AegisMonolithRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.AEGIS_MONOLITH;

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
  private readonly hardLightShieldGroup = new THREE.Group();
  private readonly tuningHammerGroup = new THREE.Group();

  private matObsidian!: THREE.MeshToonMaterial;
  private matStageSlate!: THREE.MeshToonMaterial;
  private matChrome!: THREE.MeshToonMaterial;
  private matHardLightPanel!: THREE.MeshToonMaterial;
  private matEmeraldGlow!: THREE.MeshBasicMaterial;
  private matMagentaCore!: THREE.MeshBasicMaterial;
  private matCyanGrid!: THREE.MeshBasicMaterial;

  private readonly baseHipY = 0.96;

  constructor() {
    super(HARMONIC_SERVANT_CONFIG.AEGIS_MONOLITH.scale);
    this.root.name = 'AegisMonolithRig';
    this.bodyPivot.position.y = this.baseHipY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildHeavyLegs();
    this.buildMonolithTorso();
    this.buildBouncerHelm();
    this.buildArmsShieldAndTuningHammer();
  }

  protected override getBaseScale(): number {
    return HARMONIC_SERVANT_CONFIG.AEGIS_MONOLITH.scale;
  }

  private buildMaterials(): void {
    this.matObsidian = this.createToonMat(PALETTE.cyberObsidian, {
      emissive: PALETTE.cyberStageMid,
      emissiveIntensity: 0.14,
    });
    this.matStageSlate = this.createToonMat(PALETTE.cyberStageMid, {
      emissive: PALETTE.harmonicEmerald,
      emissiveIntensity: 0.12,
    });
    this.matChrome = this.createToonMat(PALETTE.trussChrome, {
      emissive: PALETTE.harmonicEmerald,
      emissiveIntensity: 0.2,
    });
    this.matHardLightPanel = this.createToonMat(PALETTE.harmonicEmerald, {
      emissive: PALETTE.harmonicEmerald,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: HARMONIC_SERVANT_CONFIG.monolithShieldOpacity,
      side: THREE.DoubleSide,
    });
    this.matEmeraldGlow = this.createGlowMat(PALETTE.harmonicEmerald);
    this.matMagentaCore = this.createGlowMat(PALETTE.harmonicMagenta, {
      transparent: true,
      opacity: 0.9,
      additive: true,
    });
    this.matCyanGrid = this.createGlowMat(PALETTE.mikuCyan, {
      transparent: true,
      opacity: 0.82,
      additive: true,
    });
  }

  private buildHeavyLegs(): void {
    const buildPillarLeg = (
      side: -1 | 1,
      hip: THREE.Group,
      knee: THREE.Group,
    ): void => {
      hip.position.set(side * 0.22, -0.02, 0);
      this.bodyPivot.add(hip);

      const { group: thigh } = this.createOutlined(
        new THREE.BoxGeometry(0.24, 0.42, 0.24),
        this.matObsidian,
        1.06,
      );
      thigh.position.y = -0.21;
      hip.add(thigh);

      knee.position.set(0, -0.42, 0);
      hip.add(knee);

      const { group: kneePlate } = this.createOutlined(
        new THREE.BoxGeometry(0.2, 0.16, 0.16),
        this.matChrome,
        1.06,
      );
      kneePlate.position.z = 0.08;
      knee.add(kneePlate);

      const { group: greave } = this.createOutlined(
        new THREE.CylinderGeometry(0.14, 0.165, 0.42, 6),
        this.matStageSlate,
        1.06,
      );
      greave.position.y = -0.22;
      knee.add(greave);

      const { group: boot } = this.createOutlined(
        new THREE.BoxGeometry(0.24, 0.14, 0.36),
        this.matObsidian,
        1.06,
      );
      boot.position.set(0, -0.45, 0.06);
      knee.add(boot);
    };

    buildPillarLeg(-1, this.leftLegPivot, this.leftKneePivot);
    buildPillarLeg(1, this.rightLegPivot, this.rightKneePivot);
  }

  private buildMonolithTorso(): void {
    this.bodyPivot.add(this.torsoGroup);

    const { group: waist } = this.createOutlined(
      new THREE.BoxGeometry(0.54, 0.24, 0.42),
      this.matStageSlate,
      1.05,
    );
    waist.position.y = 0.08;
    this.torsoGroup.add(waist);

    const { group: chest } = this.createOutlined(
      new THREE.CylinderGeometry(0.42, 0.29, 0.58, 6),
      this.matObsidian,
      1.05,
    );
    chest.scale.set(1.22, 1.0, 0.88);
    chest.position.y = 0.44;
    this.torsoGroup.add(chest);

    // Recessed Glowing Emerald Subwoofer Ribs across Chest
    for (let r = 0; r < 3; r++) {
      const rib = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.42 - r * 0.06, 0.045, 0.04)),
        this.matEmeraldGlow,
      );
      rib.position.set(0, 0.56 - r * 0.11, 0.35);
      this.torsoGroup.add(rib);
    }

    // Dual Obsidian-and-Chrome Back Acoustic Exhaust Columns
    for (const side of [-1, 1] as const) {
      const { group: pylon } = this.createOutlined(
        new THREE.BoxGeometry(0.18, 0.64, 0.22),
        this.matChrome,
        1.06,
      );
      pylon.position.set(side * 0.24, 0.54, -0.32);
      this.torsoGroup.add(pylon);

      const pylonLed = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.06, 0.46, 0.03)),
        this.matEmeraldGlow,
      );
      pylonLed.position.set(side * 0.24, 0.54, -0.435);
      this.torsoGroup.add(pylonLed);
    }
  }

  private buildBouncerHelm(): void {
    this.headGroup.position.set(0, 0.74, 0);
    this.torsoGroup.add(this.headGroup);

    const { group: helm } = this.createOutlined(
      new THREE.BoxGeometry(0.32, 0.3, 0.32),
      this.matObsidian,
      1.06,
    );
    helm.position.y = 0.15;
    this.headGroup.add(helm);

    const visor = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.28, 0.056, 0.05)),
      this.matEmeraldGlow,
    );
    visor.position.set(0, 0.17, 0.16);
    this.headGroup.add(visor);

    const { group: crest } = this.createOutlined(
      new THREE.BoxGeometry(0.08, 0.14, 0.34),
      this.matChrome,
      1.06,
    );
    crest.position.set(0, 0.34, -0.01);
    this.headGroup.add(crest);
  }

  private buildArmsShieldAndTuningHammer(): void {
    const buildArm = (
      side: -1 | 1,
      shoulder: THREE.Group,
      elbow: THREE.Group,
    ): void => {
      shoulder.position.set(side * 0.48, 0.62, 0);
      this.torsoGroup.add(shoulder);

      const { group: pauldron } = this.createOutlined(
        new THREE.BoxGeometry(0.36, 0.28, 0.38),
        this.matObsidian,
        1.06,
      );
      pauldron.position.set(side * 0.08, 0.06, 0);
      shoulder.add(pauldron);

      const pauldronStrip = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.38, 0.04, 0.39)),
        this.matEmeraldGlow,
      );
      pauldronStrip.position.set(side * 0.08, 0.16, 0);
      shoulder.add(pauldronStrip);

      const { group: upperArm } = this.createOutlined(
        new THREE.CylinderGeometry(0.115, 0.1, 0.36, 6),
        this.matStageSlate,
        1.07,
      );
      upperArm.position.y = -0.18;
      shoulder.add(upperArm);

      elbow.position.set(0, -0.36, 0);
      shoulder.add(elbow);

      const { group: forearm } = this.createOutlined(
        new THREE.CylinderGeometry(0.11, 0.1, 0.36, 6),
        this.matChrome,
        1.07,
      );
      forearm.position.y = -0.18;
      elbow.add(forearm);
    };

    buildArm(-1, this.leftShoulderPivot, this.leftElbowPivot);
    buildArm(1, this.rightShoulderPivot, this.rightElbowPivot);

    // Geometric Hard-Light Tower-Shield on Left Arm (toggled via setShieldVisual(false) during GUARD_BROKEN)
    this.hardLightShieldGroup.position.set(-0.14, -0.18, 0.24);
    this.leftElbowPivot.add(this.hardLightShieldGroup);

    // Central Hexagonal/Octagonal Hard-Light Panel
    const shieldPanel = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.76, 0.76, 0.06, 6)),
      this.matHardLightPanel,
    );
    shieldPanel.rotation.x = Math.PI / 2;
    shieldPanel.scale.set(0.84, 1.0, 1.38);
    shieldPanel.castShadow = true;
    this.hardLightShieldGroup.add(shieldPanel);

    // Outer Obsidian Emitter Frame + Glowing Cyan Geometric Lattice
    const frameRim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.75, 0.055, 6, 6)),
      this.matObsidian,
    );
    frameRim.scale.set(0.84, 1.38, 1.0);
    this.hardLightShieldGroup.add(frameRim);

    const innerHex = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.46, 0.024, 6, 6)),
      this.matCyanGrid,
    );
    innerHex.scale.set(0.84, 1.34, 1.0);
    innerHex.position.z = 0.045;
    this.hardLightShieldGroup.add(innerHex);

    const shieldEmitter = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.15, 0)),
      this.matEmeraldGlow,
    );
    shieldEmitter.position.set(0, 0, 0.07);
    this.hardLightShieldGroup.add(shieldEmitter);

    // Heavy Tuning-Hammer in Right Hand
    this.tuningHammerGroup.position.set(0, -0.38, 0.06);
    this.tuningHammerGroup.rotation.x = Math.PI * 0.45;
    this.rightElbowPivot.add(this.tuningHammerGroup);

    const { group: haft } = this.createOutlined(
      new THREE.CylinderGeometry(0.054, 0.046, 1.88, 8),
      this.matChrome,
      1.08,
    );
    haft.position.y = 0.56;
    this.tuningHammerGroup.add(haft);

    // Heavy Resonant Hammerhead Bridge
    const { group: headBridge } = this.createOutlined(
      new THREE.BoxGeometry(0.76, 0.24, 0.34),
      this.matObsidian,
      1.06,
    );
    headBridge.position.y = 1.44;
    this.tuningHammerGroup.add(headBridge);

    // Twin Tuning-Fork Hammer Prongs & Striking Plates
    for (const side of [-1, 1] as const) {
      const { group: prong } = this.createOutlined(
        new THREE.BoxGeometry(0.16, 0.42, 0.36),
        this.matChrome,
        1.06,
      );
      prong.position.set(side * 0.34, 1.66, 0);
      this.tuningHammerGroup.add(prong);

      const strikeCap = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.06, 0.28, 0.32)),
        this.matEmeraldGlow,
      );
      strikeCap.position.set(side * 0.42, 1.44, 0);
      this.tuningHammerGroup.add(strikeCap);
    }

    // Glowing Magenta Bass-Resonator Core suspended between the tuning prongs
    const resonatorCore = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.17, 0)),
      this.matMagentaCore,
    );
    resonatorCore.position.set(0, 1.68, 0);
    this.tuningHammerGroup.add(resonatorCore);
  }

  protected override onShieldVisualChanged(active: boolean): void {
    this.hardLightShieldGroup.visible = active;
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
        0.28,
        d,
      );
      this.bodyPivot.rotation.x = THREE.MathUtils.lerp(
        this.bodyPivot.rotation.x,
        -Math.PI * 0.48,
        d,
      );
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
      this.matMagentaCore.opacity = 0.72;
    } else if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      // Hoist heavy tuning-hammer high overhead charging the bass drop
      targetTorsoX = -0.2;
      targetRShoulderX = SERVANT_CONFIG.wardenTelegraphArmX;
      targetRElbowX = -0.2;
      targetLShoulderX = -0.82;
      this.matMagentaCore.opacity =
        0.7 + 0.3 * Math.sin(phaseTime * HARMONIC_SERVANT_CONFIG.monolithCorePulseSpeed * 4);
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // Violent stage-deck slam triggering circular bass-drop shockwaves
      targetTorsoX = 0.46;
      targetRShoulderX = SERVANT_CONFIG.wardenSlamArmX;
      targetRElbowX = -0.06;
      targetLShoulderX = -0.32;
      this.matMagentaCore.opacity = 1.0;
    } else if (state === SERVANT_ANIM_STATES.GUARD_BROKEN) {
      // Staggered wide open with geometric hard-light shield shattered
      targetTorsoX = SERVANT_CONFIG.wardenGuardBreakLeanX;
      targetLShoulderX = -0.18;
      targetLShoulderZ = 0.88;
      targetRShoulderX = -0.12;
      targetRShoulderZ = -0.58;
      targetBodyY = this.baseHipY - 0.06;
      this.matMagentaCore.opacity = 0.35;
    } else {
      const breath = Math.sin(phaseTime * SERVANT_CONFIG.wardenBreathSpeed);
      targetBodyY = this.baseHipY + breath * 0.018;
      targetTorsoX = 0.04 + breath * 0.02;
      this.matMagentaCore.opacity =
        0.65 + 0.2 * Math.sin(phaseTime * HARMONIC_SERVANT_CONFIG.monolithCorePulseSpeed);
    }

    this.bodyPivot.position.y = THREE.MathUtils.lerp(
      this.bodyPivot.position.y,
      targetBodyY,
      a,
    );
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(
      this.torsoGroup.rotation.x,
      targetTorsoX,
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
  }
}
