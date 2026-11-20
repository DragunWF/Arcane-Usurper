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
 * **Razorfin Manta** — Sleek, gliding Atlantean manta-ray construct with undulating
 * wingtips, glowing cyan eyes, and an articulated barbed whip-tail.
 *
 * - `MOVE`: Banks sharply during flanking circles while rippling its wingtips.
 * - `TELEGRAPH` / `ATTACK`: Sweeps wings back then snaps forward in diagonal pounce slashes.
 */
export class RazorfinMantaRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.RAZORFIN_MANTA;

  private readonly bodyPivot = new THREE.Group();
  private readonly leftWingInner = new THREE.Group();
  private readonly leftWingOuter = new THREE.Group();
  private readonly rightWingInner = new THREE.Group();
  private readonly rightWingOuter = new THREE.Group();
  private readonly tailBasePivot = new THREE.Group();
  private readonly tailMidPivot = new THREE.Group();
  private readonly tailTipPivot = new THREE.Group();

  private matBodyTeal!: THREE.MeshToonMaterial;
  private matBellyPearl!: THREE.MeshToonMaterial;
  private matGoldRidge!: THREE.MeshToonMaterial;
  private matCoralBarb!: THREE.MeshToonMaterial;
  private matEyeGlow!: THREE.MeshBasicMaterial;

  private readonly baseHoverY = 1.05;

  constructor() {
    super(SUNKEN_SERVANT_CONFIG.RAZORFIN_MANTA.scale);
    this.root.name = 'RazorfinMantaRig';
    this.bodyPivot.position.y = this.baseHoverY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildBodyAndHead();
    this.buildUndulatingWings();
    this.buildBarbedWhipTail();
  }

  protected override getBaseScale(): number {
    return SUNKEN_SERVANT_CONFIG.RAZORFIN_MANTA.scale;
  }

  private buildMaterials(): void {
    this.matBodyTeal = this.createToonMat(PALETTE.seaStoneMid, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.24,
    });
    this.matBellyPearl = this.createToonMat(PALETTE.pearlWhite, {
      emissive: PALETTE.biolumCyan,
      emissiveIntensity: 0.14,
    });
    this.matGoldRidge = this.createToonMat(PALETTE.atlanteanGold, {
      emissive: PALETTE.atlanteanGold,
      emissiveIntensity: 0.34,
    });
    this.matCoralBarb = this.createToonMat(PALETTE.coralRose, {
      emissive: PALETTE.coralRose,
      emissiveIntensity: 0.45,
    });
    this.matEyeGlow = this.createGlowMat(PALETTE.biolumCyan);
  }

  private buildBodyAndHead(): void {
    // Sleek diamond dorsal carapace
    const { group: hull } = this.createOutlined(
      new THREE.OctahedronGeometry(0.46, 0),
      this.matBodyTeal,
      1.05,
    );
    hull.scale.set(1.18, 0.36, 1.55);
    this.bodyPivot.add(hull);

    // Pale pearl underbelly
    const belly = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.36, 10, 8)),
      this.matBellyPearl,
    );
    belly.scale.set(1.05, 0.28, 1.32);
    belly.position.y = -0.07;
    this.bodyPivot.add(belly);

    // Atlantean Gold Dorsal Ridge Fin
    const { group: dorsalRidge } = this.createOutlined(
      new THREE.BoxGeometry(0.08, 0.18, 0.78),
      this.matGoldRidge,
      1.06,
    );
    dorsalRidge.position.set(0, 0.14, -0.04);
    this.bodyPivot.add(dorsalRidge);

    // Cephalic Horns & Glowing Cyan Eyes
    for (const side of [-1, 1] as const) {
      const { group: horn } = this.createOutlined(
        new THREE.ConeGeometry(0.068, 0.36, 5),
        this.matBodyTeal,
        1.07,
      );
      horn.rotation.x = Math.PI * 0.48;
      horn.rotation.z = side * 0.18;
      horn.position.set(side * 0.22, 0.02, 0.62);
      this.bodyPivot.add(horn);

      const eye = new THREE.Mesh(
        this.trackGeo(new THREE.SphereGeometry(0.048, 8, 8)),
        this.matEyeGlow,
      );
      eye.position.set(side * 0.24, 0.06, 0.42);
      this.bodyPivot.add(eye);
    }
  }

  private buildUndulatingWings(): void {
    const buildWing = (
      side: -1 | 1,
      innerPivot: THREE.Group,
      outerPivot: THREE.Group,
    ): void => {
      innerPivot.position.set(side * 0.38, 0.02, 0.06);
      this.bodyPivot.add(innerPivot);

      const { group: innerBlade } = this.createOutlined(
        new THREE.BoxGeometry(0.62, 0.08, 0.72),
        this.matBodyTeal,
        1.05,
      );
      innerBlade.position.set(side * 0.31, 0, -0.04);
      innerBlade.rotation.y = side * 0.18;
      innerPivot.add(innerBlade);

      const trim = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.6, 0.03, 0.09)),
        this.matEyeGlow,
      );
      trim.position.set(side * 0.31, 0.045, 0.26);
      trim.rotation.y = side * 0.18;
      innerPivot.add(trim);

      outerPivot.position.set(side * 0.6, 0, -0.08);
      innerPivot.add(outerPivot);

      const { group: wingtip } = this.createOutlined(
        new THREE.ConeGeometry(0.28, 0.74, 4),
        this.matGoldRidge,
        1.06,
      );
      wingtip.scale.set(0.32, 1.0, 1.05);
      wingtip.rotation.z = -side * (Math.PI * 0.5);
      wingtip.position.set(side * 0.36, 0, -0.08);
      outerPivot.add(wingtip);
    };

    buildWing(-1, this.leftWingInner, this.leftWingOuter);
    buildWing(1, this.rightWingInner, this.rightWingOuter);
  }

  private buildBarbedWhipTail(): void {
    this.tailBasePivot.position.set(0, 0, -0.64);
    this.bodyPivot.add(this.tailBasePivot);

    const { group: seg1 } = this.createOutlined(
      new THREE.CylinderGeometry(0.055, 0.042, 0.44, 6),
      this.matBodyTeal,
      1.07,
    );
    seg1.rotation.x = Math.PI / 2;
    seg1.position.z = -0.22;
    this.tailBasePivot.add(seg1);

    this.tailMidPivot.position.set(0, 0, -0.44);
    this.tailBasePivot.add(this.tailMidPivot);

    const { group: seg2 } = this.createOutlined(
      new THREE.CylinderGeometry(0.04, 0.026, 0.42, 6),
      this.matBodyTeal,
      1.08,
    );
    seg2.rotation.x = Math.PI / 2;
    seg2.position.z = -0.21;
    this.tailMidPivot.add(seg2);

    this.tailTipPivot.position.set(0, 0, -0.42);
    this.tailMidPivot.add(this.tailTipPivot);

    const { group: stinger } = this.createOutlined(
      new THREE.ConeGeometry(0.06, 0.34, 5),
      this.matCoralBarb,
      1.08,
    );
    stinger.rotation.x = -Math.PI / 2;
    stinger.position.z = -0.17;
    this.tailTipPivot.add(stinger);
  }

  protected override updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    const a = this.lerpFactor(dt);
    if (state === SERVANT_ANIM_STATES.DEAD) {
      const d = this.lerpFactor(dt, SERVANT_CONFIG.deadCollapseSpeed);
      this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, 0.18, d);
      this.bodyPivot.rotation.z = THREE.MathUtils.lerp(this.bodyPivot.rotation.z, Math.PI, d);
      this.visualRoot.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.65));
      return;
    }

    let wingSpeed = 4.2;
    let wingAmp = 0.24;
    let targetHoverY = this.baseHoverY + Math.sin(phaseTime * 2.8) * 0.12;
    let targetPosZ = 0;
    let targetPitch = 0;
    let targetRoll = 0;

    if (state === SERVANT_ANIM_STATES.MOVE) {
      wingSpeed = 6.2;
      wingAmp = 0.34;
      // Sharp banking lean while circling the Dark Mage
      targetRoll = Math.sin(phaseTime * 1.9) * 0.42;
      targetPitch = 0.08;
    } else if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      wingSpeed = 10.5;
      wingAmp = 0.18;
      targetHoverY = this.baseHoverY - 0.22;
      targetPosZ = -0.24;
      targetPitch = -0.28;
      targetRoll = 0.36;
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // Snaps forward in a diagonal pounce slash
      wingSpeed = 13.0;
      wingAmp = 0.12;
      targetHoverY = this.baseHoverY + 0.16;
      targetPosZ = SERVANT_CONFIG.houndPounceForwardZ;
      targetPitch = 0.32;
      targetRoll = -0.48;
    }

    const flapInner = Math.sin(phaseTime * wingSpeed) * wingAmp;
    const flapOuter = Math.sin(phaseTime * wingSpeed - 0.75) * wingAmp * 1.35;

    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, targetHoverY, a);
    this.bodyPivot.position.z = THREE.MathUtils.lerp(this.bodyPivot.position.z, targetPosZ, a);
    this.bodyPivot.rotation.x = THREE.MathUtils.lerp(this.bodyPivot.rotation.x, targetPitch, a);
    this.bodyPivot.rotation.z = THREE.MathUtils.lerp(this.bodyPivot.rotation.z, targetRoll, a);

    this.leftWingInner.rotation.z = flapInner;
    this.leftWingOuter.rotation.z = flapOuter;
    this.rightWingInner.rotation.z = -flapInner;
    this.rightWingOuter.rotation.z = -flapOuter;

    // Barbed whip-tail undulation
    const tailAmp = state === SERVANT_ANIM_STATES.ATTACK ? 0.45 : 0.22;
    this.tailBasePivot.rotation.y = Math.sin(phaseTime * 5.2) * tailAmp;
    this.tailMidPivot.rotation.y = Math.sin(phaseTime * 5.2 - 0.8) * tailAmp * 1.25;
    this.tailTipPivot.rotation.y = Math.sin(phaseTime * 5.2 - 1.6) * tailAmp * 1.4;
  }
}
