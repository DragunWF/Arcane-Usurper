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
 * **Frostbite Warden** — Towering heavy armored sentinel (`1.35x` player height, ~2.55m)
 * carrying a wide translucent hexagonal ice tower-shield on his left arm and a massive
 * spiked frost mace in his right hand.
 *
 * - `TELEGRAPH`: Raises his massive spiked frost mace high overhead.
 * - `ATTACK`: Slams the frost mace violently into the chamber floor.
 * - `GUARD_BROKEN`: Drops his shattered shield (`setShieldVisual(false)`) and reels backward.
 */
export class FrostbiteWardenRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.FROSTBITE_WARDEN;

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
  private readonly towerShieldGroup = new THREE.Group();
  private readonly maceGroup = new THREE.Group();

  private matHeavyPlate!: THREE.MeshToonMaterial;
  private matDarkArmor!: THREE.MeshToonMaterial;
  private matIndigoMantle!: THREE.MeshToonMaterial;
  private matIceCrystal!: THREE.MeshToonMaterial;
  private matShieldGlass!: THREE.MeshToonMaterial;
  private matShieldRim!: THREE.MeshBasicMaterial;
  private matVisorGlow!: THREE.MeshBasicMaterial;
  private matMaceAura!: THREE.MeshBasicMaterial;

  private readonly baseHipY = 0.96;

  constructor() {
    super(SERVANT_CONFIG.FROSTBITE_WARDEN.scale);
    this.root.name = 'FrostbiteWardenRig';
    this.bodyPivot.position.y = this.baseHipY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildHeavyLegs();
    this.buildColossalTorso();
    this.buildGreathelm();
    this.buildArmsShieldAndMace();
  }

  protected override getBaseScale(): number {
    return SERVANT_CONFIG.FROSTBITE_WARDEN.scale;
  }

  private buildMaterials(): void {
    this.matHeavyPlate = this.createToonMat(PALETTE.marinaHair, {
      emissive: PALETTE.frostRunes,
      emissiveIntensity: 0.08,
    });
    this.matDarkArmor = this.createToonMat(PALETTE.frostMarble);
    this.matIndigoMantle = this.createToonMat(PALETTE.royalIndigo, {
      emissive: PALETTE.sovereignIndigo,
      emissiveIntensity: 0.14,
      side: THREE.DoubleSide,
    });
    this.matIceCrystal = this.createToonMat(PALETTE.iceHighlights, {
      emissive: PALETTE.frostRunes,
      emissiveIntensity: 0.38,
    });
    this.matShieldGlass = this.createToonMat(PALETTE.frostRunes, {
      emissive: PALETTE.coldFlame,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: SERVANT_CONFIG.wardenShieldOpacity,
      side: THREE.DoubleSide,
    });
    this.matShieldRim = this.createGlowMat(PALETTE.iceHighlights);
    this.matVisorGlow = this.createGlowMat(PALETTE.coldFlame);
    this.matMaceAura = this.createGlowMat(PALETTE.frostRunes, {
      transparent: true,
      opacity: 0.45,
      additive: true,
    });
  }

  private buildHeavyLegs(): void {
    const buildPillarLeg = (
      side: -1 | 1,
      hip: THREE.Group,
      knee: THREE.Group,
    ) => {
      hip.position.set(side * 0.21, -0.02, 0);
      this.bodyPivot.add(hip);

      const { group: thigh } = this.createOutlined(
        new THREE.CylinderGeometry(0.14, 0.12, 0.42, 8),
        this.matDarkArmor,
        1.07,
      );
      thigh.position.y = -0.21;
      hip.add(thigh);

      knee.position.set(0, -0.42, 0);
      hip.add(knee);

      const { group: kneePlate } = this.createOutlined(
        new THREE.BoxGeometry(0.18, 0.16, 0.18),
        this.matHeavyPlate,
        1.06,
      );
      kneePlate.position.z = 0.05;
      knee.add(kneePlate);

      const { group: greave } = this.createOutlined(
        new THREE.CylinderGeometry(0.13, 0.145, 0.42, 8),
        this.matHeavyPlate,
        1.06,
      );
      greave.position.y = -0.22;
      knee.add(greave);

      const { group: boot } = this.createOutlined(
        new THREE.BoxGeometry(0.2, 0.14, 0.34),
        this.matDarkArmor,
        1.06,
      );
      boot.position.set(0, -0.45, 0.06);
      knee.add(boot);
    };

    buildPillarLeg(-1, this.leftLegPivot, this.leftKneePivot);
    buildPillarLeg(1, this.rightLegPivot, this.rightKneePivot);
  }

  private buildColossalTorso(): void {
    this.bodyPivot.add(this.torsoGroup);

    const { group: abdomen } = this.createOutlined(
      new THREE.CylinderGeometry(0.25, 0.27, 0.24, 8),
      this.matDarkArmor,
      1.05,
    );
    abdomen.scale.set(1.2, 1.0, 0.88);
    abdomen.position.y = 0.08;
    this.torsoGroup.add(abdomen);

    const { group: chest } = this.createOutlined(
      new THREE.CylinderGeometry(0.38, 0.26, 0.52, 8),
      this.matHeavyPlate,
      1.05,
    );
    chest.scale.set(1.18, 1.0, 0.86);
    chest.position.y = 0.42;
    this.torsoGroup.add(chest);

    // Glowing Frost Core Emblem inset in the Chestplate
    const coreCrystal = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.11, 0)),
      this.matVisorGlow,
    );
    coreCrystal.position.set(0, 0.46, 0.32);
    this.torsoGroup.add(coreCrystal);

    // Armored Tasset Skirt Plates & Royal Indigo Back Cape
    const { group: cape } = this.createOutlined(
      new THREE.BoxGeometry(0.62, 0.92, 0.04),
      this.matIndigoMantle,
      1.04,
    );
    cape.position.set(0, 0.18, -0.32);
    cape.rotation.x = 0.12;
    this.torsoGroup.add(cape);
  }

  private buildGreathelm(): void {
    this.headGroup.position.set(0, 0.72, 0);
    this.torsoGroup.add(this.headGroup);

    const { group: helm } = this.createOutlined(
      new THREE.CylinderGeometry(0.16, 0.18, 0.3, 6),
      this.matDarkArmor,
      1.06,
    );
    helm.position.y = 0.15;
    this.headGroup.add(helm);

    const visor = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.24, 0.055, 0.06)),
      this.matVisorGlow,
    );
    visor.position.set(0, 0.17, 0.16);
    this.headGroup.add(visor);

    // Crowned Ice Horns flanking the Greathelm
    const hornSides: readonly (-1 | 1)[] = [-1, 1];
    hornSides.forEach((side) => {
      const { group: horn } = this.createOutlined(
        new THREE.ConeGeometry(0.055, 0.3, 5),
        this.matIceCrystal,
        1.08,
      );
      horn.position.set(side * 0.17, 0.3, 0);
      horn.rotation.z = -side * 0.45;
      this.headGroup.add(horn);
    });
  }

  private buildArmsShieldAndMace(): void {
    const buildArm = (
      side: -1 | 1,
      shoulder: THREE.Group,
      elbow: THREE.Group,
    ) => {
      shoulder.position.set(side * 0.46, 0.62, 0);
      this.torsoGroup.add(shoulder);

      // Colossal Horned Frost Pauldron
      const { group: pauldron } = this.createOutlined(
        new THREE.BoxGeometry(0.32, 0.28, 0.34),
        this.matHeavyPlate,
        1.06,
      );
      pauldron.position.set(side * 0.06, 0.06, 0);
      shoulder.add(pauldron);

      const { group: pauldronSpike } = this.createOutlined(
        new THREE.ConeGeometry(0.08, 0.32, 5),
        this.matIceCrystal,
        1.08,
      );
      pauldronSpike.position.set(side * 0.14, 0.26, 0);
      pauldronSpike.rotation.z = -side * 0.32;
      shoulder.add(pauldronSpike);

      const { group: upperArm } = this.createOutlined(
        new THREE.CylinderGeometry(0.11, 0.095, 0.36, 8),
        this.matDarkArmor,
        1.07,
      );
      upperArm.position.y = -0.18;
      shoulder.add(upperArm);

      elbow.position.set(0, -0.36, 0);
      shoulder.add(elbow);

      const { group: forearm } = this.createOutlined(
        new THREE.CylinderGeometry(0.105, 0.095, 0.36, 8),
        this.matHeavyPlate,
        1.07,
      );
      forearm.position.y = -0.18;
      elbow.add(forearm);
    };

    buildArm(-1, this.leftShoulderPivot, this.leftElbowPivot);
    buildArm(1, this.rightShoulderPivot, this.rightElbowPivot);

    // Wide Translucent Hexagonal Ice Tower-Shield on Left Arm (toggled by setShieldVisual)
    this.towerShieldGroup.position.set(-0.14, -0.18, 0.2);
    this.leftElbowPivot.add(this.towerShieldGroup);

    const shieldGeo = this.trackGeo(new THREE.CylinderGeometry(0.68, 0.68, 0.09, 6));
    const shieldBody = new THREE.Mesh(shieldGeo, this.matShieldGlass);
    shieldBody.rotation.x = Math.PI / 2;
    shieldBody.scale.set(0.86, 1.0, 1.32);
    shieldBody.castShadow = true;
    this.towerShieldGroup.add(shieldBody);

    const shieldRim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.67, 0.048, 6, 6)),
      this.matShieldRim,
    );
    shieldRim.scale.set(0.86, 1.32, 1.0);
    this.towerShieldGroup.add(shieldRim);

    const shieldBoss = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.16, 0)),
      this.matIceCrystal,
    );
    shieldBoss.position.z = 0.08;
    this.towerShieldGroup.add(shieldBoss);

    // Massive Spiked Frost Mace in Right Hand
    this.maceGroup.position.set(0, -0.38, 0.06);
    this.maceGroup.rotation.x = Math.PI * 0.45;
    this.rightElbowPivot.add(this.maceGroup);

    const { group: handle } = this.createOutlined(
      new THREE.CylinderGeometry(0.045, 0.04, 1.55, 6),
      this.matDarkArmor,
      1.08,
    );
    handle.position.y = 0.56;
    this.maceGroup.add(handle);

    const { group: maceHead } = this.createOutlined(
      new THREE.OctahedronGeometry(0.32, 0),
      this.matIceCrystal,
      1.07,
    );
    maceHead.position.y = 1.42;
    this.maceGroup.add(maceHead);

    // Six heavy crystalline spikes protruding from the mace head
    const spikeDirs: readonly [number, number, number][] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, 1, 0],
    ];
    spikeDirs.forEach(([dx, dy, dz]) => {
      const { group: spike } = this.createOutlined(
        new THREE.ConeGeometry(0.085, 0.34, 4),
        this.matIceCrystal,
        1.08,
      );
      spike.position.set(dx * 0.32, 1.42 + dy * 0.32, dz * 0.32);
      if (dx !== 0) spike.rotation.z = -dx * Math.PI * 0.5;
      if (dz !== 0) spike.rotation.x = dz * Math.PI * 0.5;
      this.maceGroup.add(spike);
    });

    const maceAura = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.46, 10, 10)),
      this.matMaceAura,
    );
    maceAura.position.y = 1.42;
    this.maceGroup.add(maceAura);
  }

  protected override onShieldVisualChanged(active: boolean): void {
    this.towerShieldGroup.visible = active;
  }

  protected override updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    const k = this.lerpFactor(dt, SERVANT_CONFIG.rigPoseLerpSpeed * 0.85);
    let targetBodyY = this.baseHipY;
    let targetBodyPitch = 0;
    let targetTorsoX = 0.04;
    let targetTorsoY = 0;
    let targetHeadX = 0;
    let targetLeftHipX = 0;
    let targetRightHipX = 0;
    let targetLeftKneeX = 0.06;
    let targetRightKneeX = 0.06;
    let targetLeftShoulderX = -0.62;
    let targetLeftShoulderZ = -0.2;
    let targetLeftElbowX = -0.58;
    let targetRightShoulderX = -0.35;
    let targetRightShoulderZ = -0.22;
    let targetRightElbowX = -0.45;
    let targetMaceX = Math.PI * 0.44;

    if (state === SERVANT_ANIM_STATES.IDLE || state === SERVANT_ANIM_STATES.SPAWNING) {
      const breath = Math.sin(phaseTime * SERVANT_CONFIG.wardenBreathSpeed);
      targetBodyY = this.baseHipY + breath * 0.025;
      targetTorsoX = 0.04 + breath * 0.02;
    } else if (state === SERVANT_ANIM_STATES.MOVE) {
      const stride = Math.sin(phaseTime * SERVANT_CONFIG.wardenStrideSpeed);
      const stepBob = Math.abs(Math.cos(phaseTime * SERVANT_CONFIG.wardenStrideSpeed));
      targetBodyY = this.baseHipY + stepBob * 0.07;
      targetTorsoX = 0.1;
      targetTorsoY = stride * 0.1;
      targetLeftHipX = stride * 0.44;
      targetRightHipX = -stride * 0.44;
      targetLeftKneeX = Math.max(0.06, -stride * 0.5);
      targetRightKneeX = Math.max(0.06, stride * 0.5);
      targetRightShoulderX = -0.3 + stride * 0.24;
    } else if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      // Raise massive spiked frost mace high overhead
      const tremble = Math.sin(phaseTime * 22) * 0.03;
      targetBodyY = this.baseHipY + 0.06;
      targetTorsoX = -0.22;
      targetTorsoY = -0.32;
      targetHeadX = 0.14;
      targetLeftShoulderX = -0.82;
      targetLeftShoulderZ = 0.18;
      targetRightShoulderX = SERVANT_CONFIG.wardenTelegraphArmX + tremble;
      targetRightShoulderZ = -0.18;
      targetRightElbowX = -0.32;
      targetMaceX = Math.PI * 0.32;
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // Heavy ground-slam driving the frost mace into the floor
      targetBodyY = this.baseHipY - 0.18;
      targetTorsoX = 0.48;
      targetTorsoY = 0.28;
      targetHeadX = -0.22;
      targetLeftHipX = -0.45;
      targetLeftKneeX = 0.58;
      targetRightHipX = 0.32;
      targetRightKneeX = 0.32;
      targetLeftShoulderX = -0.28;
      targetLeftShoulderZ = 0.42;
      targetRightShoulderX = SERVANT_CONFIG.wardenSlamArmX;
      targetRightShoulderZ = -0.08;
      targetRightElbowX = -0.15;
      targetMaceX = Math.PI * 0.58;
    } else if (state === SERVANT_ANIM_STATES.GUARD_BROKEN) {
      // Reeling backward with shattered shield arm flung wide
      const dizzy = Math.sin(phaseTime * 7.2) * 0.12;
      targetBodyY = this.baseHipY - 0.16;
      targetTorsoX = SERVANT_CONFIG.wardenGuardBreakLeanX + dizzy * 0.4;
      targetTorsoY = dizzy;
      targetHeadX = -0.34;
      targetLeftHipX = -0.26;
      targetLeftKneeX = 0.44;
      targetRightHipX = -0.22;
      targetRightKneeX = 0.4;
      targetLeftShoulderX = -0.15;
      targetLeftShoulderZ = 1.12;
      targetLeftElbowX = -0.2;
      targetRightShoulderX = 0.12;
      targetRightShoulderZ = -0.88;
      targetRightElbowX = -0.35;
    } else if (state === SERVANT_ANIM_STATES.DEAD) {
      targetBodyY = 0.22;
      targetBodyPitch = -Math.PI * 0.48;
      targetLeftShoulderZ = 0.95;
      targetRightShoulderZ = -0.95;
    }

    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, targetBodyY, k);
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
    this.maceGroup.rotation.x = THREE.MathUtils.lerp(this.maceGroup.rotation.x, targetMaceX, k);

    const isSlamCharge =
      state === SERVANT_ANIM_STATES.TELEGRAPH ||
      state === SERVANT_ANIM_STATES.ATTACK;
    this.matMaceAura.opacity =
      state === SERVANT_ANIM_STATES.DEAD ? 0 : isSlamCharge ? 0.85 : 0.25;
  }
}
