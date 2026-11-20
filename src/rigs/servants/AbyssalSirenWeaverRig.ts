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
 * **Abyssal Siren Weaver** — Floating sea-elf/merfolk caster draped in flowing translucent
 * teal robes orbited by a spinning pearl-and-water halo.
 *
 * - `TELEGRAPH` / `ATTACK`: Flares the pearl-and-water halo outward and gestures both arms
 *   wide to launch expanding spiral bubble volleys.
 */
export class AbyssalSirenWeaverRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.ABYSSAL_SIREN_WEAVER;

  private readonly bodyPivot = new THREE.Group();
  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftArmPivot = new THREE.Group();
  private readonly rightArmPivot = new THREE.Group();
  private readonly pearlHaloGroup = new THREE.Group();
  private readonly skirtFlaps: THREE.Group[] = [];

  private matRobeTeal!: THREE.MeshToonMaterial;
  private matRobeSheer!: THREE.MeshToonMaterial;
  private matPearl!: THREE.MeshToonMaterial;
  private matGoldTrim!: THREE.MeshToonMaterial;
  private matCoralAccent!: THREE.MeshToonMaterial;
  private matEyeGlow!: THREE.MeshBasicMaterial;
  private matWaterHalo!: THREE.MeshBasicMaterial;

  private readonly baseFloatY = 0.88 + SERVANT_CONFIG.acolyteFloatHeight;

  constructor() {
    super(SUNKEN_SERVANT_CONFIG.ABYSSAL_SIREN_WEAVER.scale);
    this.root.name = 'AbyssalSirenWeaverRig';
    this.bodyPivot.position.y = this.baseFloatY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildRobesAndTorso();
    this.buildHeadAndShellCirclet();
    this.buildArmsAndSleeves();
    this.buildSpinningPearlHalo();
  }

  protected override getBaseScale(): number {
    return SUNKEN_SERVANT_CONFIG.ABYSSAL_SIREN_WEAVER.scale;
  }

  private buildMaterials(): void {
    this.matRobeTeal = this.createToonMat(PALETTE.seaStoneMid, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.22,
      side: THREE.DoubleSide,
    });
    this.matRobeSheer = this.createToonMat(PALETTE.biolumCyan, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
    });
    this.matPearl = this.createToonMat(PALETTE.pearlWhite, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.34,
    });
    this.matGoldTrim = this.createToonMat(PALETTE.atlanteanGold, {
      emissive: PALETTE.atlanteanGold,
      emissiveIntensity: 0.32,
    });
    this.matCoralAccent = this.createToonMat(PALETTE.coralRose, {
      emissive: PALETTE.coralRose,
      emissiveIntensity: 0.25,
    });
    this.matEyeGlow = this.createGlowMat(PALETTE.biolumCyan);
    this.matWaterHalo = this.createGlowMat(PALETTE.biolumCyan, {
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      additive: true,
    });
  }

  private buildRobesAndTorso(): void {
    this.bodyPivot.add(this.torsoGroup);

    const { group: bodice } = this.createOutlined(
      new THREE.CylinderGeometry(0.18, 0.13, 0.44, 10),
      this.matRobeTeal,
      1.05,
    );
    bodice.position.y = 0.22;
    this.torsoGroup.add(bodice);

    const { group: sash } = this.createOutlined(
      new THREE.CylinderGeometry(0.15, 0.16, 0.09, 10),
      this.matGoldTrim,
      1.05,
    );
    sash.position.y = 0.02;
    this.torsoGroup.add(sash);

    // Flowing translucent teal sea-robe cone + billowing ribbon flaps
    const { group: lowerRobe } = this.createOutlined(
      new THREE.CylinderGeometry(0.15, 0.36, 0.92, 12, 1, true),
      this.matRobeSheer,
      1.03,
      true,
    );
    lowerRobe.position.y = -0.44;
    this.torsoGroup.add(lowerRobe);

    const flapGeo = this.trackGeo(new THREE.BoxGeometry(0.16, 0.78, 0.022));
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.sin(ang) * 0.16, -0.02, Math.cos(ang) * 0.16);
      pivot.rotation.y = ang;

      const flap = new THREE.Mesh(
        flapGeo,
        i % 2 === 0 ? this.matRobeTeal : this.matRobeSheer,
      );
      flap.position.set(0, -0.39, 0.07);
      flap.rotation.x = -0.22;
      pivot.add(flap);

      this.torsoGroup.add(pivot);
      this.skirtFlaps.push(pivot);
    }
  }

  private buildHeadAndShellCirclet(): void {
    this.headGroup.position.set(0, 0.48, 0);
    this.torsoGroup.add(this.headGroup);

    const { group: head } = this.createOutlined(
      new THREE.SphereGeometry(0.132, 14, 12),
      this.matPearl,
      1.05,
    );
    head.position.y = 0.18;
    this.headGroup.add(head);

    // Glowing Cyan Siren Eyes
    for (const side of [-1, 1] as const) {
      const eye = new THREE.Mesh(
        this.trackGeo(new THREE.SphereGeometry(0.024, 6, 6)),
        this.matEyeGlow,
      );
      eye.position.set(side * 0.052, 0.185, 0.118);
      this.headGroup.add(eye);

      // Finned Sea-Elf Ear
      const ear = new THREE.Mesh(
        this.trackGeo(new THREE.ConeGeometry(0.032, 0.16, 4)),
        this.matRobeSheer,
      );
      ear.position.set(side * 0.15, 0.19, -0.02);
      ear.rotation.z = -side * 1.15;
      this.headGroup.add(ear);
    }

    // Flowing Sea-Teal Hair Crest + Gold Shell Circlet
    const { group: hairBack } = this.createOutlined(
      new THREE.ConeGeometry(0.16, 0.62, 7),
      this.matRobeTeal,
      1.05,
    );
    hairBack.rotation.x = Math.PI + 0.22;
    hairBack.position.set(0, 0.04, -0.11);
    this.headGroup.add(hairBack);

    const circlet = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.135, 0.014, 6, 16)),
      this.matGoldTrim,
    );
    circlet.rotation.x = Math.PI / 2;
    circlet.position.y = 0.26;
    this.headGroup.add(circlet);

    const shellGem = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.048, 0)),
      this.matCoralAccent,
    );
    shellGem.position.set(0, 0.3, 0.125);
    this.headGroup.add(shellGem);
  }

  private buildArmsAndSleeves(): void {
    const buildArm = (side: -1 | 1, pivot: THREE.Group): void => {
      pivot.position.set(side * 0.24, 0.38, 0);
      this.torsoGroup.add(pivot);

      const { group: upper } = this.createOutlined(
        new THREE.CylinderGeometry(0.048, 0.04, 0.32, 8),
        this.matPearl,
        1.07,
      );
      upper.position.y = -0.16;
      pivot.add(upper);

      const sleeve = new THREE.Mesh(
        this.trackGeo(new THREE.CylinderGeometry(0.055, 0.145, 0.44, 10, 1, true)),
        this.matRobeSheer,
      );
      sleeve.position.y = -0.26;
      pivot.add(sleeve);

      const orb = new THREE.Mesh(
        this.trackGeo(new THREE.SphereGeometry(0.052, 8, 8)),
        this.matEyeGlow,
      );
      orb.position.y = -0.48;
      pivot.add(orb);
    };

    buildArm(-1, this.leftArmPivot);
    buildArm(1, this.rightArmPivot);
  }

  private buildSpinningPearlHalo(): void {
    this.pearlHaloGroup.position.set(0, 0.32, -0.14);
    this.torsoGroup.add(this.pearlHaloGroup);

    const waterRing = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.72, 0.032, 8, 32)),
      this.matWaterHalo,
    );
    this.pearlHaloGroup.add(waterRing);

    const innerGoldRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.54, 0.58, 24)),
      this.matGoldTrim,
    );
    this.pearlHaloGroup.add(innerGoldRing);

    const pearlGeo = this.trackGeo(new THREE.SphereGeometry(0.072, 10, 10));
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const { group: pearlObj } = this.createOutlined(
        pearlGeo,
        this.matPearl,
        1.08,
        false,
      );
      pearlObj.position.set(Math.cos(ang) * 0.72, Math.sin(ang) * 0.72, 0);
      this.pearlHaloGroup.add(pearlObj);
    }
  }

  protected override updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    const a = this.lerpFactor(dt);
    if (state === SERVANT_ANIM_STATES.DEAD) {
      const d = this.lerpFactor(dt, SERVANT_CONFIG.deadCollapseSpeed);
      this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, 0.25, d);
      this.bodyPivot.rotation.z = THREE.MathUtils.lerp(this.bodyPivot.rotation.z, 0.65, d);
      this.visualRoot.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.6));
      return;
    }

    const hoverY =
      this.baseFloatY +
      Math.sin(phaseTime * SERVANT_CONFIG.acolyteHoverSpeed) *
        SERVANT_CONFIG.acolyteHoverAmp;
    let targetTorsoX = 0;
    let targetArmX = -0.25;
    let targetArmZ = 0.28;
    let targetHaloScale = 1.0;
    let haloSpinMult = 1.0;

    if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      targetTorsoX = -0.14;
      targetArmX = -1.25;
      targetArmZ = 0.72;
      targetHaloScale = SERVANT_CONFIG.acolyteSigilFlareScale;
      haloSpinMult = SERVANT_CONFIG.acolyteSigilFlareSpinMult;
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // Gestures both arms wide outward unleashing spiral bubble volleys
      targetTorsoX = 0.16;
      targetArmX = -1.45;
      targetArmZ = 1.05;
      targetHaloScale = SERVANT_CONFIG.acolyteSigilFlareScale * 1.1;
      haloSpinMult = SERVANT_CONFIG.acolyteSigilFlareSpinMult * 1.25;
    } else if (state === SERVANT_ANIM_STATES.MOVE) {
      targetTorsoX = 0.15;
      targetArmX = -0.12;
      targetArmZ = 0.36;
    }

    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, hoverY, a);
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(this.torsoGroup.rotation.x, targetTorsoX, a);
    this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, targetArmX, a);
    this.leftArmPivot.rotation.z = THREE.MathUtils.lerp(this.leftArmPivot.rotation.z, targetArmZ, a);
    this.rightArmPivot.rotation.x = THREE.MathUtils.lerp(this.rightArmPivot.rotation.x, targetArmX, a);
    this.rightArmPivot.rotation.z = THREE.MathUtils.lerp(this.rightArmPivot.rotation.z, -targetArmZ, a);

    this.pearlHaloGroup.rotation.z +=
      dt * SERVANT_CONFIG.acolyteSigilSpinSpeed * haloSpinMult;
    const nextScale = THREE.MathUtils.lerp(
      this.pearlHaloGroup.scale.x,
      targetHaloScale,
      a,
    );
    this.pearlHaloGroup.scale.setScalar(nextScale);

    for (let i = 0; i < this.skirtFlaps.length; i++) {
      const flap = this.skirtFlaps[i];
      if (!flap) continue;
      flap.rotation.x = Math.sin(phaseTime * 2.6 + i * 1.1) * 0.12;
    }
  }
}
