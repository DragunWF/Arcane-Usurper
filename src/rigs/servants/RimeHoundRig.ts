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

interface QuadrupedLeg {
  readonly upper: THREE.Group;
  readonly lower: THREE.Group;
}

/**
 * **Rime Hound** — Sleek, low-slung angular crystalline wolf construct with
 * articulated quadruped legs, jagged ice spine, spiky tail, and glowing cyan eyes.
 *
 * - `MOVE`: Bounding quadruped gallop.
 * - `TELEGRAPH`: Coiled haunches crouched low to the floor with jaws snapping open.
 * - `ATTACK`: Airborne lunging pounce.
 */
export class RimeHoundRig extends BaseServantRig {
  public readonly archetype: ServantArchetype = SERVANT_ARCHETYPES.RIME_HOUND;

  private readonly bodyPivot = new THREE.Group();
  private readonly torsoGroup = new THREE.Group();
  private readonly neckGroup = new THREE.Group();
  private readonly jawPivot = new THREE.Group();
  private readonly tailBasePivot = new THREE.Group();
  private readonly tailTipPivot = new THREE.Group();

  private frontLeftLeg!: QuadrupedLeg;
  private frontRightLeg!: QuadrupedLeg;
  private hindLeftLeg!: QuadrupedLeg;
  private hindRightLeg!: QuadrupedLeg;

  private matCrystalArmor!: THREE.MeshToonMaterial;
  private matIndigoCore!: THREE.MeshToonMaterial;
  private matIceSpike!: THREE.MeshToonMaterial;
  private matEyeGlow!: THREE.MeshBasicMaterial;

  constructor() {
    super(SERVANT_CONFIG.RIME_HOUND.scale);
    this.root.name = 'RimeHoundRig';
    this.bodyPivot.position.y = SERVANT_CONFIG.houndBaseHipY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildTorsoAndSpine();
    this.buildWolfHead();
    this.buildLegs();
    this.buildSpikyTail();
  }

  protected override getBaseScale(): number {
    return SERVANT_CONFIG.RIME_HOUND.scale;
  }

  private buildMaterials(): void {
    this.matCrystalArmor = this.createToonMat(PALETTE.knightFrost, {
      emissive: PALETTE.frostRunes,
      emissiveIntensity: 0.14,
    });
    this.matIndigoCore = this.createToonMat(PALETTE.royalIndigo, {
      emissive: PALETTE.sovereignIndigo,
      emissiveIntensity: 0.16,
    });
    this.matIceSpike = this.createToonMat(PALETTE.iceHighlights, {
      emissive: PALETTE.frostRunes,
      emissiveIntensity: 0.36,
    });
    this.matEyeGlow = this.createGlowMat(PALETTE.frostRunes, {
      side: THREE.DoubleSide,
    });
  }

  private buildTorsoAndSpine(): void {
    this.bodyPivot.add(this.torsoGroup);

    // Broad Angular Chest Segment
    const { group: chest } = this.createOutlined(
      new THREE.BoxGeometry(0.42, 0.36, 0.56),
      this.matCrystalArmor,
      1.06,
    );
    chest.position.set(0, 0.04, 0.22);
    this.torsoGroup.add(chest);

    // Lean Tapered Waist & Haunch Segment
    const { group: flanks } = this.createOutlined(
      new THREE.BoxGeometry(0.32, 0.28, 0.56),
      this.matIndigoCore,
      1.06,
    );
    flanks.position.set(0, 0.01, -0.26);
    this.torsoGroup.add(flanks);

    // Jagged Dorsal Ice Spine Shards along the back
    const spineSpecs = [
      { z: 0.34, h: 0.26, tilt: -0.35 },
      { z: 0.12, h: 0.32, tilt: -0.45 },
      { z: -0.1, h: 0.26, tilt: -0.52 },
      { z: -0.32, h: 0.2, tilt: -0.6 },
    ];
    spineSpecs.forEach((sp) => {
      const { group: shard } = this.createOutlined(
        new THREE.ConeGeometry(0.068, sp.h, 4),
        this.matIceSpike,
        1.08,
      );
      shard.position.set(0, 0.22 + sp.h * 0.3, sp.z);
      shard.rotation.x = sp.tilt;
      this.torsoGroup.add(shard);
    });
  }

  private buildWolfHead(): void {
    this.neckGroup.position.set(0, 0.14, 0.48);
    this.torsoGroup.add(this.neckGroup);

    // Sleek Angular Wolf Cranium
    const { group: cranium } = this.createOutlined(
      new THREE.BoxGeometry(0.28, 0.24, 0.3),
      this.matCrystalArmor,
      1.06,
    );
    cranium.position.set(0, 0.08, 0.14);
    this.neckGroup.add(cranium);

    // Tapered Snout
    const { group: snout } = this.createOutlined(
      new THREE.ConeGeometry(0.12, 0.34, 4),
      this.matCrystalArmor,
      1.07,
    );
    snout.rotation.x = Math.PI / 2;
    snout.rotation.y = Math.PI / 4;
    snout.position.set(0, 0.06, 0.38);
    this.neckGroup.add(snout);

    // Hinged Lower Jaw
    this.jawPivot.position.set(0, -0.02, 0.2);
    const { group: lowerJaw } = this.createOutlined(
      new THREE.BoxGeometry(0.14, 0.07, 0.26),
      this.matIndigoCore,
      1.06,
    );
    lowerJaw.position.set(0, -0.02, 0.12);
    this.jawPivot.add(lowerJaw);
    this.neckGroup.add(this.jawPivot);

    // Glowing Cyan Predator Eyes
    const eyeGeo = this.trackGeo(new THREE.BoxGeometry(0.065, 0.032, 0.04));
    const eyeL = new THREE.Mesh(eyeGeo, this.matEyeGlow);
    eyeL.position.set(-0.1, 0.12, 0.285);
    eyeL.rotation.z = -0.22;
    const eyeR = new THREE.Mesh(eyeGeo, this.matEyeGlow);
    eyeR.position.set(0.1, 0.12, 0.285);
    eyeR.rotation.z = 0.22;
    this.neckGroup.add(eyeL, eyeR);

    // Pointed Crystalline Wolf Ears
    const earGeo = new THREE.ConeGeometry(0.055, 0.24, 4);
    const { group: earL } = this.createOutlined(earGeo, this.matIceSpike, 1.08);
    earL.position.set(-0.11, 0.26, 0.06);
    earL.rotation.set(-0.22, 0, 0.22);
    const { group: earR } = this.createOutlined(
      new THREE.ConeGeometry(0.055, 0.24, 4),
      this.matIceSpike,
      1.08,
    );
    earR.position.set(0.11, 0.26, 0.06);
    earR.rotation.set(-0.22, 0, -0.22);
    this.neckGroup.add(earL, earR);
  }

  private buildLegs(): void {
    const buildLimb = (x: number, z: number): QuadrupedLeg => {
      const upper = new THREE.Group();
      upper.position.set(x, -0.04, z);
      this.torsoGroup.add(upper);

      const { group: upperMesh } = this.createOutlined(
        new THREE.CylinderGeometry(0.068, 0.052, 0.34, 6),
        this.matCrystalArmor,
        1.08,
      );
      upperMesh.position.y = -0.17;
      upper.add(upperMesh);

      const lower = new THREE.Group();
      lower.position.set(0, -0.32, 0);
      upper.add(lower);

      const { group: lowerMesh } = this.createOutlined(
        new THREE.CylinderGeometry(0.05, 0.038, 0.32, 6),
        this.matIndigoCore,
        1.08,
      );
      lowerMesh.position.y = -0.16;
      lower.add(lowerMesh);

      const { group: paw } = this.createOutlined(
        new THREE.BoxGeometry(0.095, 0.06, 0.14),
        this.matIceSpike,
        1.08,
      );
      paw.position.set(0, -0.32, 0.04);
      lower.add(paw);

      return { upper, lower };
    };

    this.frontLeftLeg = buildLimb(-0.22, 0.34);
    this.frontRightLeg = buildLimb(0.22, 0.34);
    this.hindLeftLeg = buildLimb(-0.18, -0.36);
    this.hindRightLeg = buildLimb(0.18, -0.36);
  }

  private buildSpikyTail(): void {
    this.tailBasePivot.position.set(0, 0.08, -0.54);
    this.torsoGroup.add(this.tailBasePivot);

    const { group: baseSeg } = this.createOutlined(
      new THREE.ConeGeometry(0.075, 0.42, 5),
      this.matIndigoCore,
      1.08,
    );
    baseSeg.rotation.x = -Math.PI * 0.44;
    baseSeg.position.set(0, 0.05, -0.18);
    this.tailBasePivot.add(baseSeg);

    this.tailTipPivot.position.set(0, 0.08, -0.34);
    const { group: tipBlade } = this.createOutlined(
      new THREE.ConeGeometry(0.085, 0.46, 4),
      this.matIceSpike,
      1.08,
    );
    tipBlade.rotation.x = -Math.PI * 0.46;
    tipBlade.position.set(0, 0.05, -0.2);
    this.tailTipPivot.add(tipBlade);
    this.tailBasePivot.add(this.tailTipPivot);
  }

  protected override updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    const k = this.lerpFactor(dt);
    let targetBodyY: number = SERVANT_CONFIG.houndBaseHipY;
    let targetBodyZ = 0;
    let targetBodyRoll = 0;
    let targetTorsoX = 0;
    let targetNeckX = 0;
    let targetJawX = 0.06;
    let flUpper = 0;
    let frUpper = 0;
    let hlUpper = 0;
    let hrUpper = 0;
    let flLower = 0.05;
    let frLower = 0.05;
    let hlLower = -0.12;
    let hrLower = -0.12;
    let tailPitch = 0.15;
    let tailYaw = Math.sin(phaseTime * 3.6) * 0.25;

    if (state === SERVANT_ANIM_STATES.IDLE || state === SERVANT_ANIM_STATES.SPAWNING) {
      const breath = Math.sin(phaseTime * 3.0);
      targetBodyY = SERVANT_CONFIG.houndBaseHipY + breath * 0.025;
      targetNeckX = -0.05 + breath * 0.04;
      targetJawX = 0.08 + Math.max(0, breath) * 0.08;
    } else if (state === SERVANT_ANIM_STATES.MOVE) {
      // Bounding quadruped gallop
      const g = phaseTime * SERVANT_CONFIG.houndGallopSpeed;
      const frontWave = Math.sin(g);
      const hindWave = Math.sin(g + Math.PI * 0.85);
      targetBodyY = SERVANT_CONFIG.houndBaseHipY + Math.abs(Math.cos(g)) * 0.16;
      targetTorsoX = Math.cos(g) * 0.22;
      flUpper = frontWave * 0.78;
      frUpper = Math.sin(g + 0.35) * 0.78;
      hlUpper = hindWave * 0.84;
      hrUpper = Math.sin(g + Math.PI * 0.85 + 0.35) * 0.84;
      flLower = Math.max(0, -frontWave * 0.65);
      frLower = Math.max(0, -Math.sin(g + 0.35) * 0.65);
      hlLower = -Math.max(0.1, hindWave * 0.55);
      hrLower = -Math.max(0.1, Math.sin(g + Math.PI * 0.85 + 0.35) * 0.55);
      tailPitch = -0.12;
      tailYaw = Math.sin(g) * 0.18;
    } else if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      // Coiled haunches crouched low preparing to spring
      const snarl = Math.sin(phaseTime * 28) * 0.04;
      targetBodyY =
        SERVANT_CONFIG.houndBaseHipY - SERVANT_CONFIG.houndCrouchDropY;
      targetBodyZ = -0.2;
      targetTorsoX = -0.24 + snarl;
      targetNeckX = 0.24;
      targetJawX = 0.48 + Math.abs(snarl);
      flUpper = -0.68;
      frUpper = -0.68;
      flLower = 0.92;
      frLower = 0.92;
      hlUpper = 0.82;
      hrUpper = 0.82;
      hlLower = -1.05;
      hrLower = -1.05;
      tailPitch = 0.55;
      tailYaw = Math.sin(phaseTime * 18) * 0.15;
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // Airborne lunging pounce
      targetBodyY =
        SERVANT_CONFIG.houndBaseHipY + SERVANT_CONFIG.houndPounceLiftY;
      targetBodyZ = SERVANT_CONFIG.houndPounceForwardZ;
      targetTorsoX = 0.18;
      targetNeckX = -0.14;
      targetJawX = 0.62;
      flUpper = -1.12;
      frUpper = -1.12;
      flLower = 0.18;
      frLower = 0.18;
      hlUpper = 1.05;
      hrUpper = 1.05;
      hlLower = -0.15;
      hrLower = -0.15;
      tailPitch = -0.25;
      tailYaw = 0;
    } else if (state === SERVANT_ANIM_STATES.GUARD_BROKEN) {
      targetBodyY = SERVANT_CONFIG.houndBaseHipY - 0.12;
      targetTorsoX = -0.22;
      targetBodyRoll = Math.sin(phaseTime * 11) * 0.18;
    } else if (state === SERVANT_ANIM_STATES.DEAD) {
      targetBodyY = 0.18;
      targetBodyRoll = Math.PI * 0.48;
      targetJawX = 0.28;
      tailYaw = 0;
    }

    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, targetBodyY, k);
    this.bodyPivot.position.z = THREE.MathUtils.lerp(this.bodyPivot.position.z, targetBodyZ, k);
    this.bodyPivot.rotation.z = THREE.MathUtils.lerp(this.bodyPivot.rotation.z, targetBodyRoll, k);
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(this.torsoGroup.rotation.x, targetTorsoX, k);
    this.neckGroup.rotation.x = THREE.MathUtils.lerp(this.neckGroup.rotation.x, targetNeckX, k);
    this.jawPivot.rotation.x = THREE.MathUtils.lerp(this.jawPivot.rotation.x, targetJawX, k);

    this.frontLeftLeg.upper.rotation.x = THREE.MathUtils.lerp(this.frontLeftLeg.upper.rotation.x, flUpper, k);
    this.frontLeftLeg.lower.rotation.x = THREE.MathUtils.lerp(this.frontLeftLeg.lower.rotation.x, flLower, k);
    this.frontRightLeg.upper.rotation.x = THREE.MathUtils.lerp(this.frontRightLeg.upper.rotation.x, frUpper, k);
    this.frontRightLeg.lower.rotation.x = THREE.MathUtils.lerp(this.frontRightLeg.lower.rotation.x, frLower, k);
    this.hindLeftLeg.upper.rotation.x = THREE.MathUtils.lerp(this.hindLeftLeg.upper.rotation.x, hlUpper, k);
    this.hindLeftLeg.lower.rotation.x = THREE.MathUtils.lerp(this.hindLeftLeg.lower.rotation.x, hlLower, k);
    this.hindRightLeg.upper.rotation.x = THREE.MathUtils.lerp(this.hindRightLeg.upper.rotation.x, hrUpper, k);
    this.hindRightLeg.lower.rotation.x = THREE.MathUtils.lerp(this.hindRightLeg.lower.rotation.x, hrLower, k);

    this.tailBasePivot.rotation.x = THREE.MathUtils.lerp(this.tailBasePivot.rotation.x, tailPitch, k);
    this.tailBasePivot.rotation.y = THREE.MathUtils.lerp(this.tailBasePivot.rotation.y, tailYaw, k);
    this.tailTipPivot.rotation.y = THREE.MathUtils.lerp(this.tailTipPivot.rotation.y, tailYaw * 0.8, k);
  }
}
