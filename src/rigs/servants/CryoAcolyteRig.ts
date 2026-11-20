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
 * **Cryo Acolyte** — Floating hooded court mage in pale ice-blue robes orbited by
 * a continuously rotating geometric snowflake sigil.
 *
 * - `TELEGRAPH` / `ATTACK`: Lifts both wide draped sleeves and flares the snowflake sigil.
 */
export class CryoAcolyteRig extends BaseServantRig {
  public readonly archetype: ServantArchetype =
    SERVANT_ARCHETYPES.CRYO_ACOLYTE;

  private readonly bodyPivot = new THREE.Group();
  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftSleevePivot = new THREE.Group();
  private readonly rightSleevePivot = new THREE.Group();
  private readonly robeHemGroup = new THREE.Group();
  private readonly sigilGroup = new THREE.Group();
  private readonly sigilInnerRing = new THREE.Group();

  private matRobe!: THREE.MeshToonMaterial;
  private matIndigoStole!: THREE.MeshToonMaterial;
  private matIceTrim!: THREE.MeshToonMaterial;
  private matHoodShadow!: THREE.MeshToonMaterial;
  private matEyeGlow!: THREE.MeshBasicMaterial;
  private matSigilGlow!: THREE.MeshBasicMaterial;
  private matSigilCore!: THREE.MeshBasicMaterial;

  private readonly baseBodyY = 0.86 + SERVANT_CONFIG.acolyteFloatHeight;
  private sigilAngle = 0;

  constructor() {
    super(SERVANT_CONFIG.CRYO_ACOLYTE.scale);
    this.root.name = 'CryoAcolyteRig';
    this.bodyPivot.position.y = this.baseBodyY;
    this.visualRoot.add(this.bodyPivot);

    this.buildMaterials();
    this.buildFloatingRobes();
    this.buildHoodedHead();
    this.buildDrapedSleeves();
    this.buildSnowflakeSigil();
  }

  protected override getBaseScale(): number {
    return SERVANT_CONFIG.CRYO_ACOLYTE.scale;
  }

  private buildMaterials(): void {
    this.matRobe = this.createToonMat(PALETTE.marinaGown, {
      emissive: PALETTE.coldFlame,
      emissiveIntensity: 0.14,
      side: THREE.DoubleSide,
    });
    this.matIndigoStole = this.createToonMat(PALETTE.royalIndigo, {
      emissive: PALETTE.sovereignIndigo,
      emissiveIntensity: 0.18,
    });
    this.matIceTrim = this.createToonMat(PALETTE.marinaTrim, {
      emissive: PALETTE.frostRunes,
      emissiveIntensity: 0.3,
    });
    this.matHoodShadow = this.createToonMat(PALETTE.cowlShadow);
    this.matEyeGlow = this.createGlowMat(PALETTE.frostRunes, {
      side: THREE.DoubleSide,
    });
    this.matSigilGlow = this.createGlowMat(PALETTE.frostRunes, {
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      additive: true,
    });
    this.matSigilCore = this.createGlowMat(PALETTE.iceHighlights, {
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      additive: true,
    });
  }

  private buildFloatingRobes(): void {
    this.bodyPivot.add(this.torsoGroup);

    // Tapered Court Mage Upper Bodice
    const { group: bodice } = this.createOutlined(
      new THREE.CylinderGeometry(0.19, 0.14, 0.48, 10),
      this.matRobe,
      1.06,
    );
    bodice.position.y = 0.24;
    this.torsoGroup.add(bodice);

    // Royal Indigo Court Stole draped across shoulders
    const { group: stole } = this.createOutlined(
      new THREE.CylinderGeometry(0.24, 0.19, 0.16, 10),
      this.matIndigoStole,
      1.06,
    );
    stole.position.y = 0.44;
    this.torsoGroup.add(stole);

    const stoleRibbon = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.12, 0.65, 0.03)),
      this.matIndigoStole,
    );
    stoleRibbon.position.set(0, 0.08, 0.165);
    this.torsoGroup.add(stoleRibbon);

    // Floating Flared Lower Robe Skirt
    this.robeHemGroup.position.y = 0.02;
    this.torsoGroup.add(this.robeHemGroup);

    const { group: skirt } = this.createOutlined(
      new THREE.CylinderGeometry(0.16, 0.42, 0.96, 10, 1, false),
      this.matRobe,
      1.05,
    );
    skirt.position.y = -0.48;
    this.robeHemGroup.add(skirt);

    const hemTrim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.41, 0.032, 6, 16)),
      this.matIceTrim,
    );
    hemTrim.rotation.x = Math.PI / 2;
    hemTrim.position.y = -0.94;
    this.robeHemGroup.add(hemTrim);
  }

  private buildHoodedHead(): void {
    this.headGroup.position.set(0, 0.56, 0);
    this.torsoGroup.add(this.headGroup);

    // Deep Recessed Shadowed Face Core
    const shadowCore = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.12, 10, 10)),
      this.matHoodShadow,
    );
    shadowCore.position.set(0, 0.15, 0.02);
    this.headGroup.add(shadowCore);

    // Glowing Cyan Arcane Eyes
    const eyeGeo = this.trackGeo(new THREE.PlaneGeometry(0.05, 0.022));
    const eyeL = new THREE.Mesh(eyeGeo, this.matEyeGlow);
    eyeL.position.set(-0.045, 0.16, 0.132);
    eyeL.rotation.z = -0.15;
    const eyeR = new THREE.Mesh(eyeGeo, this.matEyeGlow);
    eyeR.position.set(0.045, 0.16, 0.132);
    eyeR.rotation.z = 0.15;
    this.headGroup.add(eyeL, eyeR);

    // Pointed Court Mage Hood
    const { group: hoodShell } = this.createOutlined(
      new THREE.ConeGeometry(0.21, 0.42, 8),
      this.matRobe,
      1.06,
    );
    hoodShell.rotation.x = -0.26;
    hoodShell.position.set(0, 0.25, -0.05);
    this.headGroup.add(hoodShell);

    const hoodRim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.165, 0.024, 6, 12)),
      this.matIceTrim,
    );
    hoodRim.position.set(0, 0.15, 0.09);
    this.headGroup.add(hoodRim);
  }

  private buildDrapedSleeves(): void {
    const buildSleeve = (side: -1 | 1, pivot: THREE.Group) => {
      pivot.position.set(side * 0.24, 0.44, 0);
      this.torsoGroup.add(pivot);

      const { group: sleeveCone } = this.createOutlined(
        new THREE.ConeGeometry(0.16, 0.56, 8),
        this.matRobe,
        1.06,
      );
      sleeveCone.position.y = -0.26;
      pivot.add(sleeveCone);

      const cuff = new THREE.Mesh(
        this.trackGeo(new THREE.TorusGeometry(0.145, 0.022, 6, 12)),
        this.matIceTrim,
      );
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.52;
      pivot.add(cuff);

      const handOrb = new THREE.Mesh(
        this.trackGeo(new THREE.OctahedronGeometry(0.06, 0)),
        this.matSigilCore,
      );
      handOrb.position.y = -0.56;
      pivot.add(handOrb);
    };

    buildSleeve(-1, this.leftSleevePivot);
    buildSleeve(1, this.rightSleevePivot);
  }

  /**
   * Geometric 6-point rotating snowflake sigil halo orbiting behind the Cryo Acolyte.
   */
  private buildSnowflakeSigil(): void {
    this.sigilGroup.position.set(0, 0.36, -0.44);
    this.torsoGroup.add(this.sigilGroup);

    const outerRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.62, 0.68, 6)),
      this.matSigilGlow,
    );
    this.sigilGroup.add(outerRing);

    const innerHex = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.32, 0.36, 6)),
      this.matSigilCore,
    );
    this.sigilInnerRing.add(innerHex);

    const spokeGeo = this.trackGeo(new THREE.BoxGeometry(0.032, 1.38, 0.015));
    const diamondGeo = this.trackGeo(new THREE.OctahedronGeometry(0.075, 0));
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(spokeGeo, this.matSigilCore);
      spoke.rotation.z = (i / 3) * Math.PI;
      this.sigilInnerRing.add(spoke);
    }
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const node = new THREE.Mesh(diamondGeo, this.matSigilGlow);
      node.position.set(Math.cos(ang) * 0.65, Math.sin(ang) * 0.65, 0);
      this.sigilGroup.add(node);
    }

    this.sigilGroup.add(this.sigilInnerRing);
  }

  protected override updateArchetypeAnim(
    state: ServantAnimState,
    phaseTime: number,
    dt: number,
  ): void {
    const k = this.lerpFactor(dt);
    const hover =
      Math.sin(phaseTime * SERVANT_CONFIG.acolyteHoverSpeed) *
      SERVANT_CONFIG.acolyteHoverAmp;

    let targetBodyY = this.baseBodyY + hover;
    let targetBodyPitch = 0;
    let targetTorsoX = 0;
    let targetSleeveX = -0.25;
    let targetSleeveZ = 0.28;
    let targetSigilScale = 1.0;
    let targetSigilZ = -0.44;
    let sigilSpeedMult = 1.0;

    if (state === SERVANT_ANIM_STATES.MOVE) {
      targetTorsoX = 0.22;
      targetSleeveX = 0.24;
      targetSleeveZ = 0.36;
      sigilSpeedMult = 1.4;
    } else if (state === SERVANT_ANIM_STATES.TELEGRAPH) {
      // Lift both draped sleeves and flare the orbiting snowflake sigil
      targetBodyY = this.baseBodyY + hover + 0.16;
      targetTorsoX = -0.1;
      targetSleeveX = -2.25;
      targetSleeveZ = 0.62;
      targetSigilScale = SERVANT_CONFIG.acolyteSigilFlareScale;
      targetSigilZ = -0.32;
      sigilSpeedMult = SERVANT_CONFIG.acolyteSigilFlareSpinMult;
    } else if (state === SERVANT_ANIM_STATES.ATTACK) {
      // Thrust sleeves forward releasing the frost shard volley
      targetBodyY = this.baseBodyY + hover + 0.08;
      targetTorsoX = 0.18;
      targetSleeveX = -1.55;
      targetSleeveZ = 0.12;
      targetSigilScale = SERVANT_CONFIG.acolyteSigilFlareScale * 1.1;
      targetSigilZ = 0.28;
      sigilSpeedMult = SERVANT_CONFIG.acolyteSigilFlareSpinMult * 1.35;
    } else if (state === SERVANT_ANIM_STATES.GUARD_BROKEN) {
      targetTorsoX = -0.32;
      targetSleeveX = -0.4;
      targetSleeveZ = 0.9;
      sigilSpeedMult = 0.3;
    } else if (state === SERVANT_ANIM_STATES.DEAD) {
      targetBodyY = 0.22;
      targetBodyPitch = -Math.PI * 0.45;
      targetSigilScale = 0.05;
      sigilSpeedMult = 0.0;
    }

    this.sigilAngle += dt * SERVANT_CONFIG.acolyteSigilSpinSpeed * sigilSpeedMult;
    this.sigilGroup.rotation.z = this.sigilAngle;
    this.sigilInnerRing.rotation.z = -this.sigilAngle * 1.65;

    this.bodyPivot.position.y = THREE.MathUtils.lerp(this.bodyPivot.position.y, targetBodyY, k);
    this.bodyPivot.rotation.x = THREE.MathUtils.lerp(this.bodyPivot.rotation.x, targetBodyPitch, k);
    this.torsoGroup.rotation.x = THREE.MathUtils.lerp(this.torsoGroup.rotation.x, targetTorsoX, k);

    this.leftSleevePivot.rotation.x = THREE.MathUtils.lerp(this.leftSleevePivot.rotation.x, targetSleeveX, k);
    this.leftSleevePivot.rotation.z = THREE.MathUtils.lerp(this.leftSleevePivot.rotation.z, -targetSleeveZ, k);
    this.rightSleevePivot.rotation.x = THREE.MathUtils.lerp(this.rightSleevePivot.rotation.x, targetSleeveX, k);
    this.rightSleevePivot.rotation.z = THREE.MathUtils.lerp(this.rightSleevePivot.rotation.z, targetSleeveZ, k);

    const s = THREE.MathUtils.lerp(this.sigilGroup.scale.x, targetSigilScale, k);
    this.sigilGroup.scale.setScalar(s);
    this.sigilGroup.position.z = THREE.MathUtils.lerp(this.sigilGroup.position.z, targetSigilZ, k);

    this.robeHemGroup.rotation.x =
      Math.sin(phaseTime * 2.5) * 0.05 + (state === SERVANT_ANIM_STATES.MOVE ? 0.22 : 0);

    const isFlare =
      state === SERVANT_ANIM_STATES.TELEGRAPH ||
      state === SERVANT_ANIM_STATES.ATTACK;
    this.matSigilGlow.opacity =
      state === SERVANT_ANIM_STATES.DEAD ? 0 : isFlare ? 0.96 : 0.72;
    this.matSigilCore.opacity =
      state === SERVANT_ANIM_STATES.DEAD ? 0 : isFlare ? 1.0 : 0.85;
  }
}
